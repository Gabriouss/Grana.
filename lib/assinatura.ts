import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/* Guardado quando a pessoa abre o link de ativação (/ativar?token=...) SEM
   estar logada — precisa cadastrar ou entrar primeiro, e o token não pode se
   perder nessa volta. Consumido por vincularAssinaturasPendentes() assim que
   a sessão existir (ver lib/auth-context.tsx). */
const CHAVE_TOKEN_PENDENTE = '@grana_token_ativacao_pendente';

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
 * As duas chamadas são silenciosas de propósito: um erro aqui (rede, RPC
 * indisponível) não pode travar o login de ninguém. Se falhar, a pessoa só
 * continua sem a assinatura vinculada até a próxima vez.
 */
export async function vincularAssinaturasPendentes(): Promise<void> {
  try {
    await supabase.rpc('vincular_assinatura_automatica');
  } catch {
    // silencioso — ver comentário acima
  }

  let token: string | null = null;
  try {
    token = await AsyncStorage.getItem(CHAVE_TOKEN_PENDENTE);
  } catch {
    token = null;
  }
  if (!token) return;

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
    if (error || data !== true) return; // mantém o token guardado pra tentar de novo no próximo login.
    await AsyncStorage.removeItem(CHAVE_TOKEN_PENDENTE);
  } catch {
    // Falha de transporte — mantém o token guardado pra tentar de novo no próximo login.
  }
}

/** Consulta direta: usar quando a UI precisa saber AGORA (tela de ativação, paywall). */
export async function temAssinaturaAtiva(): Promise<boolean> {
  const { data, error } = await supabase.rpc('tem_assinatura_ativa');
  if (error) return false;
  return !!data;
}
