import { Platform } from 'react-native';
import { supabase } from './supabase';
import { idDoUsuarioLocal } from './sessao-offline';

/**
 * Baixar uma cópia de tudo o que o Grana. guarda sobre a pessoa.
 *
 * Existe por exigência legal, e por decisão do autor em 23/09/2026: sair da
 * conta, baixar os dados e excluir a conta precisam funcionar **mesmo para
 * quem está no paywall ou com a assinatura vencida** ("precisamos estar
 * totalmente em conformidade com a LGPD para evitar multas"). Até aqui a
 * Política de Privacidade prometia, na letra, acesso e exclusão "a qualquer
 * momento, pelo próprio app" — e quem perdia o acesso ficava preso na tela de
 * assinatura, sem nenhuma das duas saídas.
 *
 * **Por que ler as tabelas direto, e não os buscadores de tela.** Os
 * buscadores de `lib/data.ts` existem para DESENHAR telas: alguns limitam
 * período, outros passam por cache e quase todos entregam só as colunas que a
 * tela usa. Uma cópia dos dados pessoais não pode ser um recorte do que a
 * interface precisava: aqui a leitura é `select('*')` por tabela, com o RLS
 * fazendo o recorte por dono, que é o mesmo limite que o app inteiro respeita.
 *
 * **Tabela que não vem não é tabela vazia.** Cada falha entra em
 * `indisponiveis`, com o motivo, e vai escrita dentro do próprio arquivo — um
 * export que engole erro entregaria menos do que promete sem ninguém notar
 * (regra 9 do AGENTS.md: todo caminho de falha deixa recibo visível).
 */

/** O que é da pessoa e ela pode ler pelo próprio login. */
export const TABELAS_DO_USUARIO = [
  'transactions',
  'bills',
  'categories',
  'budgets',
  'goals',
  'wallets',
  'credit_cards',
  'credit_card_invoices',
  'user_gamification',
  'user_achievements',
  'assistant_messages',
  'assistant_memory',
  'voice_operations',
  'feedbacks',
  'subscriptions',
] as const;

export type TabelaDoUsuario = (typeof TABELAS_DO_USUARIO)[number];

export type Exportacao = {
  /** Nome sugerido do arquivo, com a data. */
  nomeArquivo: string;
  /** O JSON pronto para gravar. */
  conteudo: string;
  /** Quantas linhas vieram de cada tabela. */
  contagem: Record<string, number>;
  /** Tabelas que não puderam ser lidas, com o motivo. */
  indisponiveis: { tabela: string; motivo: string }[];
};

type Leitor = (tabela: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;

const leitorPadrao: Leitor = async (tabela) => {
  const { data, error } = await supabase.from(tabela).select('*');
  return { data: data as unknown[] | null, error: error ? { message: error.message } : null };
};

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/**
 * Monta o arquivo. Separado de quem grava e compartilha para poder ser testado
 * com o módulo real, sem tocar em disco nem em rede.
 */
export async function montarExportacao(
  opcoes: { ler?: Leitor; agora?: Date; conta?: { id: string | null; email: string | null } } = {}
): Promise<Exportacao> {
  const ler = opcoes.ler ?? leitorPadrao;
  const agora = opcoes.agora ?? new Date();
  const conta = opcoes.conta ?? { id: await idDoUsuarioLocal(), email: null };

  const dados: Record<string, unknown[]> = {};
  const contagem: Record<string, number> = {};
  const indisponiveis: { tabela: string; motivo: string }[] = [];

  for (const tabela of TABELAS_DO_USUARIO) {
    try {
      const { data, error } = await ler(tabela);
      if (error) {
        indisponiveis.push({ tabela, motivo: error.message });
        continue;
      }
      dados[tabela] = data ?? [];
      contagem[tabela] = dados[tabela].length;
    } catch (erro) {
      indisponiveis.push({ tabela, motivo: (erro as { message?: string })?.message ?? String(erro) });
    }
  }

  const corpo = {
    exportado_em: agora.toISOString(),
    aplicativo: 'Grana.',
    conta: { id: conta.id, email: conta.email },
    /* Escrito dentro do arquivo, não só na tela: quem abrir isto daqui a um
       ano precisa saber o que veio e o que faltou. */
    observacoes: {
      formato: 'JSON, uma lista por tabela do banco, com todas as colunas.',
      tabelas_incluidas: Object.keys(dados),
      tabelas_indisponiveis: indisponiveis,
    },
    dados,
  };

  const data = `${agora.getFullYear()}-${doisDigitos(agora.getMonth() + 1)}-${doisDigitos(agora.getDate())}`;
  return {
    nomeArquivo: `grana-meus-dados-${data}.json`,
    conteudo: JSON.stringify(corpo, null, 2),
    contagem,
    indisponiveis,
  };
}

/**
 * Monta e entrega o arquivo: no navegador, baixa; no aparelho, grava e abre o
 * compartilhamento (mesmo caminho do relatório em PDF, `lib/pdf-report.ts`).
 */
export async function exportarMeusDados(
  opcoes: { conta?: { id: string | null; email: string | null } } = {}
): Promise<Exportacao & { compartilhado: boolean }> {
  const exportacao = await montarExportacao({ conta: opcoes.conta });

  if (Platform.OS === 'web') {
    const blob = new Blob([exportacao.conteudo], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = exportacao.nomeArquivo;
    link.click();
    /* Sem revogar, o blob fica preso na memória da aba até recarregar. */
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { ...exportacao, compartilhado: true };
  }

  const { File, Paths } = await import('expo-file-system');
  const Sharing = await import('expo-sharing');

  const arquivo = new File(Paths.cache, exportacao.nomeArquivo);
  if (arquivo.exists) arquivo.delete();
  arquivo.create();
  arquivo.write(exportacao.conteudo);

  if (!(await Sharing.isAvailableAsync())) {
    return { ...exportacao, compartilhado: false };
  }
  await Sharing.shareAsync(arquivo.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Meus dados do Grana.',
    UTI: 'public.json',
  });
  return { ...exportacao, compartilhado: true };
}
