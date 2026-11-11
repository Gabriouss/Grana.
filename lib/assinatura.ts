import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/* Guardado quando a pessoa abre o link de ativação (/ativar?token=...) SEM
   estar logada — precisa cadastrar ou entrar primeiro, e o token não pode se
   perder nessa volta. Consumido pelo EntitlementProvider após a sessão. */
const CHAVE_TOKEN_PENDENTE = '@grana_token_ativacao_pendente';

export type ResultadoVinculoAssinatura = {
  houveFalha: boolean;
  tokenPendente: boolean;
  motivo: 'sincronizacao_email' | 'token_recusado' | 'token_indisponivel' | null;
};

export async function guardarTokenAtivacaoPendente(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE_TOKEN_PENDENTE, token);
  } catch {
    // Sem storage, o pior caso é reabrir o link de ativação depois de logar
    // — não é motivo pra travar a navegação por causa disso.
  }
}

/**
 * Roda depois de qualquer login. Duas tentativas de vínculo, nesta ordem:
 *
 * 1. E-mail igual ao da compra — cobre a maioria sem a pessoa fazer nada.
 * 2. Token guardado antes de logar — cobre compra com e-mail diferente do
 *    cadastro (presente, apelido de Gmail, erro de digitação).
 *
 * A falha não trava o login, mas também não é silenciosa: o chamador recebe um
 * recibo para mostrar que o acesso ainda precisa ser confirmado. Isso evita
 * que uma compra aprovada pareça simplesmente uma conta sem assinatura.
 */
export type ContextoDoVinculo = {
  /** Capturados da mesma sessão antes de qualquer await. Nunca registrar. */
  readonly dono: string;
  readonly tokenDeAcesso: string;
  /** Identidade opaca de um ciclo da conta, estável entre recargas. */
  geracao: object;
  podeContinuar: () => boolean;
  sinal: AbortSignal;
  fim: number;
};
const vinculosEmVoo = new WeakMap<object, { promessa: Promise<ResultadoVinculoAssinatura>; sinal: AbortSignal; dono: string }>();

/** Uma tentativa por ciclo; o prazo inclui auth, rede e armazenamento. */
export function vincularAssinaturasPendentes(contexto: ContextoDoVinculo): Promise<ResultadoVinculoAssinatura> {
  const { dono, tokenDeAcesso } = contexto;
  const emVoo = vinculosEmVoo.get(contexto.geracao);
  if (emVoo && emVoo.dono === dono && emVoo.sinal === contexto.sinal && !emVoo.sinal.aborted) return emVoo.promessa;
  const controle = new AbortController();
  let encerrado = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const atual = () => !!dono && !!tokenDeAcesso && !encerrado && !controle.signal.aborted && contexto.podeContinuar();
  const verificar = () => { if (!atual()) throw new Error('vínculo interrompido'); };
  const rpc = (nome: string, args?: { p_token: string }) => {
    verificar();
    // fetchWithAuth aguarda a sessão global antes de completar os headers.
    // Fixar este header no builder preserva a conta de origem nessa espera.
    const pedido = supabase.rpc(nome, args).setHeader('Authorization', `Bearer ${tokenDeAcesso}`);
    return pedido.abortSignal(controle.signal);
  };
  let interromper: () => void = () => {};
  const falha: ResultadoVinculoAssinatura = { houveFalha: true, tokenPendente: true, motivo: 'token_indisponivel' };
  const trabalho = Promise.resolve().then(() => executarVinculo(rpc, verificar));
  const interrupcao = new Promise<never>((_, reject) => {
    interromper = () => { controle.abort(); reject(new Error('vínculo interrompido')); };
    const ms = contexto.fim - Date.now();
    timer = setTimeout(interromper, Math.max(0, ms));
    contexto.sinal.addEventListener('abort', interromper, { once: true });
    if (contexto.sinal.aborted) interromper();
  });
  const promessa = Promise.race([trabalho, interrupcao]).catch(() => {
    console.warn('[assinatura] vínculo não concluído; nova verificação disponível');
    return falha;
  }).finally(() => {
    encerrado = true;
    controle.abort();
    clearTimeout(timer);
    contexto.sinal.removeEventListener('abort', interromper);
    if (vinculosEmVoo.get(contexto.geracao)?.promessa === promessa) vinculosEmVoo.delete(contexto.geracao);
  });
  vinculosEmVoo.set(contexto.geracao, { promessa, sinal: contexto.sinal, dono });
  return promessa;
}

async function executarVinculo(
  rpc: (nome: string, args?: { p_token: string }) => ReturnType<typeof supabase.rpc>,
  verificar: () => void,
): Promise<ResultadoVinculoAssinatura> {
  let houveFalha = false;
  let motivo: ResultadoVinculoAssinatura['motivo'] = null;

  try {
    const { error } = await rpc('vincular_assinatura_automatica');
    verificar();
    if (error) {
      houveFalha = true;
      motivo = 'sincronizacao_email';
      console.warn('[assinatura] não foi possível sincronizar compra por e-mail', {
        code: error.code ?? null,
        message: error.message ?? null,
      });
    }
  } catch (error) {
    houveFalha = true;
    motivo = 'sincronizacao_email';
    console.warn('[assinatura] falha de transporte ao sincronizar compra por e-mail', {
      message: error instanceof Error ? error.message : 'erro desconhecido',
    });
  }

  verificar();

  let token: string | null = null;
  try {
    token = await AsyncStorage.getItem(CHAVE_TOKEN_PENDENTE);
    verificar();
  } catch (error) {
    token = null;
    houveFalha = true;
    motivo = motivo ?? 'token_indisponivel';
    console.warn('[assinatura] não foi possível ler o token de ativação pendente', {
      message: error instanceof Error ? error.message : 'erro desconhecido',
    });
  }
  verificar();
  if (!token) return { houveFalha, tokenPendente: false, motivo };

  try {
    // `supabase.rpc` só REJEITA a Promise por falha de transporte (rede
    // fora do ar, RPC inexistente) — uma falha LÓGICA (token
    // inválido/expirado/já vinculado a outra conta) resolve normalmente,
    // sem lançar: `error` continua nulo, e é o próprio RETORNO da função
    // (`data`, um boolean) que diz se vinculou de verdade — ver
    // `vincular_assinatura_por_token` em supabase/schema.sql, que devolve
    // `false` nesse caso em vez de lançar. Checar só `error` (como antes)
    // não bastava: uma chamada que chegou ao servidor mas voltou `data:
    // false` já era tratada como sucesso e apagava o token, deixando a
    // pessoa sem assinatura vinculada e sem chance de tentar de novo.
    const { data, error } = await rpc('vincular_assinatura_por_token', { p_token: token });
    verificar();
    if (error || data !== true) {
      houveFalha = true;
      motivo = 'token_recusado';
      console.warn('[assinatura] token de ativação não foi vinculado', {
        code: error?.code ?? null,
        message: error?.message ?? null,
        retornouVerdadeiro: data === true,
      });
      return { houveFalha, tokenPendente: true, motivo };
    }
    // Uma nova ativação pode ter chegado enquanto o servidor respondia.
    const aindaPendente = await AsyncStorage.getItem(CHAVE_TOKEN_PENDENTE);
    verificar();
    if (aindaPendente === token) await AsyncStorage.removeItem(CHAVE_TOKEN_PENDENTE);
    verificar();
    return { houveFalha, tokenPendente: false, motivo };
  } catch (error) {
    // Falha de transporte — mantém o token guardado para tentar de novo, mas
    // deixa o paywall mostrar que a confirmação ainda está pendente.
    houveFalha = true;
    motivo = 'token_indisponivel';
    console.warn('[assinatura] falha de transporte ao vincular token de ativação', {
      message: error instanceof Error ? error.message : 'erro desconhecido',
    });
    return { houveFalha, tokenPendente: true, motivo };
  }
}

