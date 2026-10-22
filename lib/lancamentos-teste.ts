import { DEMO_TRANSACTIONS } from './demo-data';
import { MODO_TESTE } from './modo-teste';
import type { Transaction } from './types';

/**
 * Lançamentos do modo teste da landing (lib/modo-teste.ts), em memória.
 *
 * Cada tela carrega os dados de exemplo no próprio estado, então um lançamento
 * feito na Início sumia ao abrir Lançamentos e voltar. Aqui fica a lista em uso
 * durante o teste, compartilhada pelas telas; recarregar a página volta ao começo.
 *
 * Fora do modo teste (inclusive com "Dados de exemplo" ligado no Perfil) tudo
 * continua como antes: `lancamentosDeExemplo()` devolve a lista fixa e
 * `guardarLancamentosDeExemplo` não guarda nada.
 */
let atuais: Transaction[] | null = null;

export function lancamentosDeExemplo(): Transaction[] {
  return MODO_TESTE && atuais ? atuais : DEMO_TRANSACTIONS;
}

export function guardarLancamentosDeExemplo(lista: Transaction[]): void {
  if (MODO_TESTE) atuais = lista;
}

type NovoLancamento = Pick<Transaction, 'type' | 'description' | 'amount' | 'category' | 'color' | 'occurred_on'> & {
  recurring?: boolean;
  wallet_id?: string | null;
};

/** Grava um lançamento novo do teste (ex.: Pix colado) e devolve o que entrou. */
export function adicionarLancamentoDeTeste(novo: NovoLancamento): Transaction {
  const lancamento = {
    id: `teste-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    user_id: 'modo-teste',
    parent_id: null,
    created_at: new Date().toISOString(),
    ...novo,
    recurring: !!novo.recurring,
    wallet_id: novo.wallet_id ?? 'demo-wallet-1',
  } as Transaction;
  atuais = [lancamento, ...lancamentosDeExemplo()];
  // Avisa a landing que contém o teste (components/TesteInterativo.tsx) para o guia marcar o passo.
  if (typeof window !== 'undefined' && window.parent !== window) {
    window.parent.postMessage('grana-teste:lancamento', window.location.origin);
  }
  return lancamento;
}
