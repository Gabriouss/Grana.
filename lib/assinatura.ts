import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/* Guardado quando a pessoa abre o link de ativação (/ativar?token=...) SEM
   estar logada — precisa cadastrar ou entrar primeiro, e o token não pode se
   perder nessa volta. Consumido por vincularAssinaturasPendentes() assim que
   a sessão existir (ver lib/auth-context.tsx). */
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
export async function vincularAssinaturasPendentes(): Promise<ResultadoVinculoAssinatura> {
  let houveFalha = false;
  let motivo: ResultadoVinculoAssinatura['motivo'] = null;

  try {
    const { error } = await supabase.rpc('vincular_assinatura_automatica');
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

  let token: string | null = null;
  try {
    token = await AsyncStorage.getItem(CHAVE_TOKEN_PENDENTE);
  } catch (error) {
    token = null;
    houveFalha = true;
    motivo = motivo ?? 'token_indisponivel';
    console.warn('[assinatura] não foi possível ler o token de ativação pendente', {
      message: error instanceof Error ? error.message : 'erro desconhecido',
    });
  }
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
    const { data, error } = await supabase.rpc('vincular_assinatura_por_token', { p_token: token });
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
    await AsyncStorage.removeItem(CHAVE_TOKEN_PENDENTE);
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

/** Consulta direta: usar quando a UI precisa saber AGORA (tela de ativação, paywall). */
export async function temAssinaturaAtiva(): Promise<boolean> {
  const { data, error } = await supabase.rpc('tem_assinatura_ativa');
  if (error) return false;
  return !!data;
}
