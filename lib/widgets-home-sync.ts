import { fetchBills, fetchTransactions, fetchCreditCards, fetchCardInvoicePayments } from './data';
import { fetchGoals } from './goals';
import { montarSnapshotWidgets } from './widgets-home-snapshot';
import { buscarSobraDoMes, sobraParaOLivre } from './sobra-do-mes';
import {
  atualizarSnapshot,
  definirPrivacidade,
  garantirUsuario,
  limparSnapshot,
  widgetDisponivel,
} from '@/modules/grana-voice-widget';

let usuarioAtual: string | null = null;
let geracao = 0;
let numeroDaBusca = 0;

export function definirPrivacidadeWidgets(hidden: boolean): void {
  definirPrivacidade(hidden);
}

export function limparSnapshotWidgets(): void {
  geracao += 1;
  usuarioAtual = null;
  limparSnapshot();
}

/**
 * Busca um conjunto coerente e só então troca o snapshot. Se qualquer fonte
 * falhar, o último dado válido e a hora real dele permanecem no launcher.
 */
export function sincronizarWidgetsHome(userId: string, privacyHidden: boolean): Promise<boolean> {
  if (!widgetDisponivel || !userId) return Promise.resolve(false);
  if (usuarioAtual !== userId) {
    usuarioAtual = userId;
    geracao += 1;
  }
  const geracaoDestaBusca = geracao;
  const numeroDestaBusca = ++numeroDaBusca;
  garantirUsuario(userId);
  definirPrivacidade(privacyHidden);

  const agora = new Date();
  const mes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  /* Sobra confirmada (07/11/2026): falha de rede segura o snapshot como as
     outras fontes; tabela ainda inexistente vira zero dentro de buscarSobraDoMes. */
  return Promise.all([fetchTransactions(), fetchBills(), fetchGoals(), fetchCreditCards(), fetchCardInvoicePayments(), buscarSobraDoMes(mes)])
    .then(([transactions, bills, goals, cards, payments, sobra]) => {
      if (
        geracaoDestaBusca !== geracao ||
        usuarioAtual !== userId ||
        numeroDestaBusca !== numeroDaBusca
      ) return false;
      atualizarSnapshot(montarSnapshotWidgets({ userId, transactions, bills, goals, cards, payments, sobraConfirmada: sobraParaOLivre(sobra), privacyHidden }));
      return true;
    })
    .catch((erro) => {
      console.error('[widgets-home] fontes do Livre indisponiveis', erro);
      return false;
    });
}
