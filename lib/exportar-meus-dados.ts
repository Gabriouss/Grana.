import { Platform } from 'react-native';
import { supabase } from './supabase';
import { buscarTodasAsPaginas } from './paginacao';

/** Download com acesso confirmado; com acesso vencido, a cópia é solicitada ao suporte. */
export const TABELAS_DO_USUARIO = [
  'transactions', 'bills', 'categories', 'budgets', 'goals', 'wallets',
  'credit_cards', 'credit_card_invoices', 'user_gamification', 'user_achievements',
  'assistant_messages', 'assistant_memory', 'voice_operations', 'feedbacks', 'subscriptions',
] as const;

export type TabelaDoUsuario = (typeof TABELAS_DO_USUARIO)[number];
type Indisponivel = { tabela: string; motivo: string; tipo: 'permanente' | 'temporaria' };
export type Exportacao = {
  nomeArquivo: string;
  conteudo: string;
  contagem: Record<string, number>;
  indisponiveis: Indisponivel[];
  parcial: boolean;
};
type Opcoes = { agora?: Date; conta?: { id: string | null; email: string | null } };

class ErroExportacao extends Error {
  constructor(readonly codigo: string, mensagem: string) {
    super(mensagem);
  }
}

function interromper(codigo: string, mensagem: string): never {
  console.warn('[dados] exportacao interrompida', { codigo });
  throw new ErroExportacao(codigo, mensagem);
}

function tipoDaFalha(erro: unknown): Indisponivel['tipo'] {
  const e = erro as { code?: string; status?: number; message?: string } | null;
  return e?.status === 408 || e?.status === 429 || (e?.status ?? 0) >= 500
    || /^(08|53|57)/.test(e?.code ?? '')
    || /network|fetch|timeout|timed out|connection|rede|conexão/i.test(e?.message ?? '')
    ? 'temporaria' : 'permanente';
}

function exigirErroNaoGlobal(erro: unknown) {
  if (erro instanceof ErroExportacao) throw erro;
  const e = erro as { code?: string; status?: number } | null;
  if (e?.status === 401 || /^PGRST30[0-3]$|^28/.test(e?.code ?? '')) {
    interromper('sessao-nao-confirmada', 'Confirme seu login antes de baixar seus dados.');
  }
  if (e?.status === 403 || e?.code === '42501') {
    interromper('acesso-negado', 'O download direto não está disponível. Solicite seus dados pelo suporte, sem precisar renovar.');
  }
}

/** Mantém a mesma identidade HTTP em todas as páginas; nenhum cache autoriza o download. */
async function executarExportacao<T>(opcoes: Opcoes, entregar: (e: Exportacao, validar: () => Promise<unknown>) => Promise<T>): Promise<T> {
  const { data: inicial, error: erroInicial } = await supabase.auth.getSession().catch(() =>
    interromper('sessao-nao-confirmada', 'Não foi possível confirmar seu login. Verifique a conexão ou solicite ajuda ao suporte.'));
  if (erroInicial || !inicial.session?.access_token) {
    interromper('sessao-ausente', 'Confirme seu login antes de baixar seus dados.');
  }
  const sessao = inicial.session;
  const token = sessao.access_token;
  const dono = sessao.user.id;
  let mudou = false;
  let prazo: number | null = null;
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_evento, atual) => {
    if (atual?.user.id !== dono || atual?.access_token !== token) mudou = true;
  });

  async function conferirSessao() {
    const { data, error } = await supabase.auth.getSession().catch(() =>
      interromper('sessao-nao-confirmada', 'Não foi possível confirmar sua sessão. Verifique a conexão ou solicite ajuda ao suporte.'));
    if (mudou || error || data.session?.user.id !== dono || data.session?.access_token !== token) {
      interromper('sessao-alterada', 'A sessão mudou durante a preparação. Confirme a conta e peça uma nova cópia.');
    }
    if (prazo !== null && Date.now() >= prazo) {
      interromper('acesso-negado', 'Seu acesso venceu durante a preparação. Solicite seus dados pelo suporte, sem precisar renovar.');
    }
  }

  async function confirmarAcesso() {
    await conferirSessao();
    const { data, error } = await Promise.resolve(supabase.rpc('obter_estado_acesso').setHeader('Authorization', `Bearer ${token}`))
      .catch((error: unknown) => ({ data: null, error }));
    if (error) {
      exigirErroNaoGlobal(error);
      interromper('acesso-nao-confirmado', tipoDaFalha(error) === 'temporaria'
        ? 'Não foi possível confirmar seu acesso. Verifique a conexão e tente novamente.'
        : 'Não foi possível confirmar seu acesso. Solicite ajuda ao suporte.');
    }
    if (!data || typeof data.allowed !== 'boolean' || typeof data.enforced !== 'boolean') {
      interromper('acesso-invalido', 'O servidor não confirmou seu acesso. Solicite ajuda ao suporte.');
    }
    if (!data.allowed) interromper('acesso-negado', 'O download direto não está disponível. Solicite seus dados pelo suporte, sem precisar renovar.');
    const datas = [data.access_until, data.status === 'past_due' ? data.grace_until : null]
      .map((d) => typeof d === 'string' ? Date.parse(d) : NaN).filter(Number.isFinite);
    prazo = data.enforced && datas.length ? Math.max(...datas) : null;
    await conferirSessao();
  }

  async function validar() {
    await conferirSessao();
    // getUser(token) confirma no servidor quem é o dono do token usado no HTTP.
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) interromper('sessao-nao-confirmada', 'Não foi possível confirmar seu login. Entre novamente ou solicite ajuda ao suporte.');
    if (data.user.id !== dono || (opcoes.conta && opcoes.conta.id !== dono)) {
      interromper('conta-divergente', 'A conta mudou. Confirme a conta antes de pedir uma nova cópia.');
    }
    await confirmarAcesso();
    return data.user;
  }

  try {
    const usuario = await validar();
    const dados: Record<string, unknown[]> = {};
    const contagem: Record<string, number> = {};
    const indisponiveis: Indisponivel[] = [];
    for (const tabela of TABELAS_DO_USUARIO) {
      // O schema só permite INSERT do dono em feedbacks; vazio por RLS não comprova ausência.
      if (tabela === 'feedbacks') {
        indisponiveis.push({ tabela, tipo: 'permanente', motivo: 'Feedbacks não estão disponíveis no download direto. Solicite essa parte pelo suporte: suporte@granaponto.com.br.' });
        continue;
      }
      try {
        const ordem = tabela === 'user_gamification' ? 'user_id' : tabela === 'user_achievements' ? 'badge_id' : 'id';
        const linhas = await buscarTodasAsPaginas<Record<string, unknown>>(async (de, ate) => {
          await conferirSessao();
          const { data, error } = await supabase.from(tabela).select('*').eq('user_id', dono)
            .order(ordem, { ascending: true }).range(de, ate).setHeader('Authorization', `Bearer ${token}`);
          // Uma recusa global não pode virar tabela indisponível e seguir exportando.
          if (error) { exigirErroNaoGlobal(error); throw error; }
          if (!Array.isArray(data)) interromper('resposta-invalida', 'A leitura dos dados não foi confirmada. Solicite ajuda ao suporte.');
          if (data.some((linha) => linha.user_id !== dono)) interromper('dono-divergente', 'A leitura não corresponde à sua conta. A cópia foi interrompida. Solicite ajuda ao suporte.');
          await confirmarAcesso();
          return { data, error: null };
        });
        dados[tabela] = linhas;
        contagem[tabela] = linhas.length;
      } catch (erro) {
        exigirErroNaoGlobal(erro);
        // Inclusive após erro de página, uma troca de conta ou recusa de acesso aborta tudo.
        await confirmarAcesso();
        const tipo = tipoDaFalha(erro);
        console.warn('[dados] tabela indisponivel', { tabela, tipo });
        indisponiveis.push({ tabela, tipo, motivo: tipo === 'temporaria'
          ? 'Falha temporária de leitura. Verifique a conexão e tente novamente.'
          : 'Esta parte não está disponível no download direto. Solicite ajuda ao suporte: suporte@granaponto.com.br.' });
      }
    }
    await validar();
    const agora = opcoes.agora ?? new Date();
    const parcial = indisponiveis.length > 0;
    const corpo = {
      exportado_em: agora.toISOString(), aplicativo: 'Grana.',
      conta: { id: usuario.id, email: usuario.email ?? null },
      observacoes: {
        copia: parcial ? 'parcial' : 'sem partes indisponíveis',
        formato: 'JSON, uma lista por tabela disponível, com todas as colunas legíveis.',
        consistencia: 'As tabelas são lidas em sequência e podem mudar durante a preparação. Esta cópia não é um snapshot atômico do banco.',
        tabelas_incluidas: Object.keys(dados), tabelas_indisponiveis: indisponiveis,
      }, dados,
    };
    const dia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    return await entregar({ nomeArquivo: `grana-meus-dados-${parcial ? 'parcial-' : ''}${dia}.json`,
      conteudo: JSON.stringify(corpo, null, 2), contagem, indisponiveis, parcial }, validar);
  } catch (erro) {
    if (erro instanceof ErroExportacao) throw erro;
    interromper('exportacao-falhou', tipoDaFalha(erro) === 'temporaria'
      ? 'Não foi possível preparar seus dados. Verifique a conexão e tente novamente.'
      : 'Não foi possível preparar seus dados. Solicite ajuda ao suporte.');
  } finally {
    subscription.unsubscribe();
  }
}

export async function montarExportacao(opcoes: Opcoes = {}): Promise<Exportacao> {
  return executarExportacao(opcoes, async (e) => e);
}

/** Efeitos de entrega só começam depois da confirmação final, ainda sob a guarda da sessão. */
export async function exportarMeusDados(opcoes: Opcoes = {}): Promise<Exportacao & { compartilhado: boolean }> {
  return executarExportacao(opcoes, async (exportacao, validar) => {
    if (Platform.OS === 'web') {
      await validar();
      const blob = new Blob([exportacao.conteudo], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = globalThis.document.createElement('a');
      link.href = url;
      link.download = exportacao.nomeArquivo;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return { ...exportacao, compartilhado: true };
    }
    const { File, Paths } = await import('expo-file-system');
    const Sharing = await import('expo-sharing');
    const { randomUUID } = await import('expo-crypto');
    const disponivel = await Sharing.isAvailableAsync();
    await validar();
    // Uma URI já compartilhada não pode passar a servir os dados de outra exportação/conta.
    const nomeArquivo = exportacao.nomeArquivo.replace(/\.json$/, `-${randomUUID()}.json`);
    const arquivo = new File(Paths.cache, nomeArquivo);
    arquivo.create();
    arquivo.write(exportacao.conteudo);
    if (!disponivel) return { ...exportacao, nomeArquivo, compartilhado: false };
    await Sharing.shareAsync(arquivo.uri, { mimeType: 'application/json', dialogTitle: 'Meus dados do Grana.', UTI: 'public.json' });
    return { ...exportacao, nomeArquivo, compartilhado: true };
  });
}
