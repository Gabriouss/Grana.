import { fetchBills, fetchTransactions, fetchCreditCards, fetchCardInvoicePayments } from './data';
import { fetchGoals } from './goals';
import { montarSnapshotWidgets } from './widgets-home-snapshot';
import { buscarSobraDoMes, mesLocalDaSobra, sobraParaOLivre } from './sobra-do-mes';
import {
  atualizarSnapshot,
  definirPrivacidade,
  garantirUsuario,
  limparSnapshot,
  quantidadeInstalada,
  widgetDisponivel,
  type TipoWidget,
} from '@/modules/grana-voice-widget';

let usuarioAtual: string | null = null;
let geracao = 0;
let numeroDaBusca = 0;

/* Só estes leem o snapshot financeiro; Voz e Central não (contrato da ponte do 26). */
const TIPOS_COM_SNAPSHOT: TipoWidget[] = ['livre', 'compromisso', 'cofrinho'];

/* Item 34 (20/11/2026): cada evento abria outra busca do histórico inteiro com a
   anterior em voo. Agora um evento durante o voo vira UMA repetição depois dele. */
type Voo = { userId: string; geracao: number; promessa: Promise<boolean>; hidden: boolean; seguinte?: Promise<boolean> };
let voo: Voo | null = null;

export function definirPrivacidadeWidgets(hidden: boolean): void {
  definirPrivacidade(hidden);
}

export function limparSnapshotWidgets(): void {
  geracao += 1;
  usuarioAtual = null;
  voo = null;
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
  /* Dono e privacidade vêm antes de qualquer atalho: valem com zero widgets e com busca em voo. */
  garantirUsuario(userId);
  definirPrivacidade(privacyHidden);
  // Sem widget que leia o snapshot, o histórico não tem quem consuma.
  if (!TIPOS_COM_SNAPSHOT.some((tipo) => quantidadeInstalada(tipo) > 0)) return Promise.resolve(false);
  if (voo && voo.userId === userId && voo.geracao === geracao) {
    const atual = voo;
    atual.hidden = privacyHidden;
    return (atual.seguinte ??= atual.promessa.then(() => sincronizarWidgetsHome(userId, atual.hidden)));
  }
  const geracaoDestaBusca = geracao;
  const numeroDestaBusca = ++numeroDaBusca;

  const agora = new Date();
  const mes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  /* Sobra confirmada (07/11/2026): falha de rede segura o snapshot como as
     outras fontes; tabela ainda inexistente vira zero dentro de buscarSobraDoMes. */
  const registro: Voo = { userId, geracao: geracaoDestaBusca, hidden: privacyHidden, promessa: Promise.resolve(false) };
  voo = registro;
  registro.promessa = Promise.all([fetchTransactions(), fetchBills(), fetchGoals(), fetchCreditCards(), fetchCardInvoicePayments(), buscarSobraDoMes(mes, userId)])
    .then(([transactions, bills, goals, cards, payments, sobra]) => {
      if (
        geracaoDestaBusca !== geracao ||
        usuarioAtual !== userId ||
        numeroDestaBusca !== numeroDaBusca || mes !== mesLocalDaSobra()
      ) return false;
      const hoje = new Date();
      atualizarSnapshot(montarSnapshotWidgets({ userId, transactions, bills, goals, cards, payments, sobraConfirmada: sobraParaOLivre(sobra, userId, mesLocalDaSobra(hoje)), privacyHidden, hoje }));
      return true;
    })
    .catch((erro) => {
      console.error('[widgets-home] fontes do Livre indisponiveis', erro);
      return false;
    })
    .finally(() => { if (voo === registro) voo = null; });
  return registro.promessa;
}
