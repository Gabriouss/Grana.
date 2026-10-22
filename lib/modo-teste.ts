import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';

/**
 * Modo teste da landing (autor, 21/10/2026): "um modelo de testagem gratuito
 * interativo para o usuário interagir do nosso aplicativo de verdade, onde o
 * usuário consegue simular lançamentos e entender como é o aplicativo por dentro".
 *
 * São as telas reais do app, com a conta fictícia de `demo-data.ts`, sem login e
 * sem servidor. Só existe na web, e só no documento que abriu `/experimentar`
 * (o `iframe` da landing ou a aba de tela cheia). A marca fica em `window.name`,
 * que é de cada janela: sobrevive a recarregar o próprio teste e não vaza para a
 * landing, que é do mesmo domínio e veria um `sessionStorage` compartilhado.
 *
 * Fora daqui nada muda: no Android e no iOS isto é sempre `false`.
 */
export const NOME_JANELA_TESTE = 'grana-modo-teste';
export const ROTA_TESTE = '/experimentar';

function detectar(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (window.location.pathname.startsWith(ROTA_TESTE)) {
    window.name = NOME_JANELA_TESTE;
    return true;
  }
  return window.name === NOME_JANELA_TESTE;
}

export const MODO_TESTE = detectar();

/** Sair do teste (botão "Assinar" ou "Voltar"): a janela deixa de ser de teste. */
export function sairDoModoTeste() {
  if (typeof window !== 'undefined' && window.name === NOME_JANELA_TESTE) window.name = '';
}

/* Sessão fictícia: as telas leem `session.user.id`, mas no modo teste nenhuma
   leitura vai ao servidor (o `isDemoMode` desvia para os dados de exemplo e o
   `fetch` do Supabase é recusado em lib/supabase.ts). Sem token nenhum. */
export const SESSAO_TESTE = {
  access_token: '',
  refresh_token: '',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4102444800,
  user: {
    id: 'modo-teste',
    aud: 'authenticated',
    email: 'teste@granaponto.com.br',
    app_metadata: {},
    user_metadata: { nome: 'Você' },
    created_at: '2026-10-21T00:00:00.000Z',
  },
} as unknown as Session;

/** Erro que o `fetch` do Supabase devolve no modo teste: nada sai do navegador. */
export class RedeDesligadaNoTeste extends TypeError {
  constructor() {
    super('Failed to fetch (modo teste: sem rede)');
    this.name = 'TypeError';
  }
}
