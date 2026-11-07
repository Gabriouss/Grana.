import { useEffect, useState } from 'react';

/**
 * Ponte entre a janela de conferência dos avisos e o atalho do cabeçalho da
 * Início (07/11/2026). A contagem vem da MESMA fonte da janela
 * (`sincronizarCaixa`, publicada por `AvisosAConferir`): o atalho não conta de
 * novo. `pedirConferencia` desfaz o "Revisar depois" e reabre a janela.
 */
let pendentes = 0;
let pedidos = 0;
let naFrente = false;
const ouvintes = new Set<() => void>();

function avisar() {
  for (const ouvinte of [...ouvintes]) ouvinte();
}

export function publicarPendentes(n: number) {
  if (n === pendentes) return;
  pendentes = n;
  avisar();
}

/** Há aviso a conferir que ainda vai abrir (ou já abriu) a janela: as outras perguntas esperam. */
export function publicarAvisosNaFrente(v: boolean) {
  if (v === naFrente) return;
  naFrente = v;
  avisar();
}

export function pedirConferencia() {
  pedidos += 1;
  avisar();
}

export const pendentesAgora = () => pendentes;
export const pedidosAgora = () => pedidos;
export const avisosNaFrenteAgora = () => naFrente;

function useDoStore<T>(ler: () => T): T {
  const [valor, setValor] = useState(ler);
  useEffect(() => {
    const ouvinte = () => setValor(ler());
    ouvintes.add(ouvinte);
    ouvinte();
    return () => { ouvintes.delete(ouvinte); };
  }, [ler]);
  return valor;
}

export const usePendentesDeAvisos = () => useDoStore(pendentesAgora);
export const usePedidoDeConferencia = () => useDoStore(pedidosAgora);
export const useAvisosNaFrente = () => useDoStore(avisosNaFrenteAgora);

/** Texto lido pelo leitor de tela no atalho do cabeçalho. */
export const rotuloDoAtalho = (n: number) => (n === 1 ? '1 lançamento para conferir' : `${n} lançamentos para conferir`);
