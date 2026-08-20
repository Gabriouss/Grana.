import type { AuthError } from '@supabase/supabase-js';

/**
 * Traduz erros de autenticação em mensagens que dizem o que fazer.
 *
 * Antes o app exibia `error.message` cru do Supabase — em inglês, no meio de
 * uma interface inteira em português, e genérico a ponto de não ajudar:
 * "Invalid login credentials" foi exatamente o que travou o autor por uma
 * hora sem indicar que o problema era a senha salva no gerenciador.
 *
 * ## Sobre não distinguir "conta inexistente" de "senha errada"
 *
 * O Supabase funde os dois em `invalid_credentials` de propósito, e a fusão é
 * mantida aqui de propósito também. Separar transformaria o formulário de
 * login num verificador de cadastro: digitando um e-mail qualquer, qualquer
 * pessoa descobriria se aquele endereço tem conta no Grana. Num app de
 * finanças isso é informação sensível sobre a pessoa, não só sobre a conta.
 *
 * A mensagem resolve o problema de usabilidade por outro caminho: em vez de
 * dizer qual das duas causas é, ela nomeia as duas e aponta a saída de cada
 * uma. Quem errou a senha entende; quem não tem conta entende. Ninguém de
 * fora aprende nada sobre quem está cadastrado.
 *
 * O que É distinguido são os casos que não vazam existência de conta, ou que
 * o próprio Supabase já expõe: e-mail não confirmado, limite de tentativas,
 * senha fraca no cadastro e falha de rede.
 */

export type ErroAuth = {
  /** Texto principal, sempre acionável. */
  mensagem: string;
  /** Quando existe uma saída óbvia, o rótulo do caminho a sugerir. */
  acao?: 'criar-conta' | 'reenviar-confirmacao' | 'recuperar-senha' | 'tentar-depois';
};

export function traduzirErroAuth(erro: AuthError | Error | null): ErroAuth | null {
  if (!erro) return null;

  const codigo = (erro as AuthError).code ?? '';
  const status = (erro as AuthError).status ?? 0;
  const bruto = (erro.message ?? '').toLowerCase();

  /* Rede antes de tudo: sem conexão o Supabase nem chega a devolver código, e
     dizer "credenciais inválidas" para quem está sem internet manda a pessoa
     procurar erro na senha. */
  if (bruto.includes('network') || bruto.includes('fetch') || bruto.includes('failed to fetch')) {
    return { mensagem: 'Sem conexão com a internet. Verifique sua rede e tente de novo.' };
  }

  if (codigo === 'email_not_confirmed' || bruto.includes('email not confirmed')) {
    return {
      mensagem: 'Sua conta ainda não foi confirmada. Procure o e-mail de confirmação — inclusive no spam.',
      acao: 'reenviar-confirmacao',
    };
  }

  if (codigo === 'invalid_credentials' || bruto.includes('invalid login credentials')) {
    return {
      mensagem: 'E-mail ou senha não conferem. Confira a senha, ou crie uma conta se ainda não tiver uma.',
      acao: 'recuperar-senha',
    };
  }

  if (codigo === 'user_already_exists' || codigo === 'email_exists' || bruto.includes('already registered')) {
    return { mensagem: 'Já existe uma conta com este e-mail. Tente entrar.', acao: 'recuperar-senha' };
  }

  if (codigo === 'weak_password' || bruto.includes('password should be')) {
    return { mensagem: 'Senha muito fraca. Use pelo menos 9 caracteres, misturando letras e números.' };
  }

  if (codigo === 'validation_failed' || bruto.includes('unable to validate email')) {
    return { mensagem: 'E-mail inválido. Confira se está escrito corretamente.' };
  }

  /* 429 cobre os vários limites (tentativas de login, envio de e-mail). O
     Supabase usa códigos diferentes para cada um, mas a orientação é a mesma
     e o motivo exato não muda o que a pessoa pode fazer. */
  if (status === 429 || codigo.includes('rate_limit')) {
    return {
      mensagem: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar de novo.',
      acao: 'tentar-depois',
    };
  }

  if (status >= 500) {
    return { mensagem: 'O servidor não respondeu agora. Tente de novo em instantes.' };
  }

  /* Último caso: mostra o texto original em vez de engolir num "erro
     inesperado". Feio, mas um erro novo do Supabase precisa ficar visível
     para virar um caso tratado aqui depois. */
  return { mensagem: erro.message };
}
