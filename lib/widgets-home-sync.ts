import { fetchBills, fetchTransactions } from './data';
import { fetchGoals } from './goals';
import { fetchWallets } from './wallets';
import { montarSnapshotWidgets } from './widgets-home-snapshot';
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

  return Promise.all([fetchTransactions(), fetchBills(), fetchGoals(), fetchWallets()])
    .then(([transactions, bills, goals, wallets]) => {
      if (
        geracaoDestaBusca !== geracao ||
        usuarioAtual !== userId ||
        numeroDestaBusca !== numeroDaBusca
      ) return false;
      // O widget é sempre "Total": soma o saldo inicial de todas as carteiras.
      const saldoInicial = wallets.reduce((soma, w) => soma + Number(w.initial_balance || 0), 0);
      atualizarSnapshot(montarSnapshotWidgets({ userId, transactions, bills, goals, privacyHidden, saldoInicial }));
      return true;
    })
    .catch(() => false);
}
