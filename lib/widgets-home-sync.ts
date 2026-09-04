import { fetchBills, fetchTransactions } from './data';
import { fetchGoals } from './goals';
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

  return Promise.all([fetchTransactions(), fetchBills(), fetchGoals()])
    .then(([transactions, bills, goals]) => {
      if (
        geracaoDestaBusca !== geracao ||
        usuarioAtual !== userId ||
        numeroDestaBusca !== numeroDaBusca
      ) return false;
      atualizarSnapshot(montarSnapshotWidgets({ userId, transactions, bills, goals, privacyHidden }));
      return true;
    })
    .catch(() => false);
}
