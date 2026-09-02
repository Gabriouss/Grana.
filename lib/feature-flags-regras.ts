import { compararVersoes } from './versao';

/**
 * Regras dos interruptores remotos — SEM React e SEM React Native.
 *
 * A separação existe para o corpus poder testar a decisão de ligado/desligado
 * em node puro (`__tests__/corpus-flags.ts`). O provider, que precisa de
 * contexto, AppState e do cliente Supabase, mora em `feature-flags.tsx` e
 * importa daqui.
 *
 * ── Por que existe ────────────────────────────────────────────────────────
 *
 * Em 02/09/2026 o WhatsApp do Grana. caiu e não havia como esconder o botão:
 * quem abria o app via "Lançar pelo WhatsApp", tentava, e não funcionava. A
 * única saída teria sido publicar uma versão nova só pra esconder um botão.
 *
 * Daqui em diante, qualquer ferramenta que entre em instabilidade se desliga
 * por `UPDATE` na tabela `feature_flags`, em segundos, no aplicativo de todo
 * mundo — e religa do mesmo jeito quando resolver.
 *
 * ── Falha ABERTA, de propósito ────────────────────────────────────────────
 *
 * Se a leitura falhar (rede ruim, Supabase fora, tabela ainda não criada),
 * TUDO continua ligado. O contrário transformaria uma instabilidade do
 * Supabase em app inteiro morto.
 *
 * Isto é o oposto do `EntitlementProvider`, que falha FECHADO — e os dois
 * estão certos, por motivos opostos: lá a mesma regra é aplicada no RLS do
 * servidor, então liberar no cliente só produziria telas vazias; aqui não
 * existe segunda barreira, e o custo de errar para cada lado é invertido.
 *
 * Quem "corrigir" o `catch` vazio abaixo para desligar tudo em caso de erro
 * está trocando um incômodo por um apagão.
 */

/**
 * As 13 ferramentas do app. Esta união e o `insert` de `feature_flags`
 * (supabase/schema.sql) precisam andar juntos: chave no banco e não aqui não
 * compila na chamada; chave aqui sem linha no banco cai no caminho
 * "desconhecida = ligada" e nunca desliga.
 * `__tests__/corpus-flags.ts` compara as duas listas.
 */
export type ChaveFlag =
  | 'whatsapp'
  | 'importar_extrato'
  | 'colar_comprovante'
  | 'qr_nota'
  | 'lancamento_voz'
  | 'relatorio_pdf'
  | 'foto_perfil'
  | 'lembretes'
  | 'assinatura_checkout'
  | 'orcamento_sugerido'
  | 'diagnostico'
  | 'cofrinhos'
  | 'desafios';

export type Severidade = 'info' | 'aviso' | 'critico';

export type Flag = {
  key: string;
  enabled: boolean;
  titulo: string | null;
  mensagem: string | null;
  severidade: Severidade;
  reativa_em: string | null;
  aviso_versao: number;
  plataformas: string[] | null;
  versao_min: string | null;
  versao_max: string | null;
};

export const COLUNAS_FLAG =
  'key, enabled, titulo, mensagem, severidade, reativa_em, aviso_versao, plataformas, versao_min, versao_max';

/**
 * Um flag só desliga de verdade quando o desligamento se aplica A ESTE
 * aparelho: prazo não vencido, plataforma na lista, versão dentro da faixa.
 * Qualquer dúvida resolve para LIGADO — a mesma falha aberta do provider.
 *
 * Exportada para o corpus poder testar a regra sem subir React nem rede.
 */
export function efetivamenteLigado(f: Flag, versaoInstalada: string, plataforma: string): boolean {
  if (f.enabled) return true;

  /* Religa sozinho na data marcada, sem depender de alguém lembrar de rodar o
     UPDATE de volta. Desligamento sem prazo é o que vira permanente por
     esquecimento. */
  if (f.reativa_em && new Date(f.reativa_em).getTime() <= Date.now()) return true;

  /* Instabilidade quase nunca atinge as duas plataformas igual: o
     reconhecimento de voz quebra no Android e segue bom no iOS. Desligar para
     todo mundo quando só metade está afetada é punir quem está bem.
     NULL ou vazio significa "todas as plataformas". */
  if (f.plataformas?.length && !f.plataformas.includes(plataforma)) return true;

  /* Faixa de versão: um defeito já corrigido não deve desligar nada para quem
     atualizou. `compararVersoes` compara por segmento numérico — "1.10.0" é
     maior que "1.9.0", o que como texto seria falso. */
  if (f.versao_min && compararVersoes(versaoInstalada, f.versao_min) < 0) return true;
  if (f.versao_max && compararVersoes(versaoInstalada, f.versao_max) > 0) return true;

  return false;
}

