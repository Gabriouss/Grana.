import { useEffect, useState } from 'react';

/**
 * Quantas janelas (`AppModal` visíveis) estão abertas agora, em qualquer tela.
 *
 * Existe para a janela de conferência dos avisos do banco: ela é bloqueante e
 * nunca pode abrir por cima de um lançamento sendo digitado, de uma folha ou do
 * tutorial. Todo modal do app passa pelo `AppModal`, então contar ali é o único
 * ponto que enxerga todos sem cada tela avisar a mão.
 */
let abertas = 0;
const ouvintes = new Set<() => void>();

function avisar() {
  for (const ouvinte of [...ouvintes]) ouvinte();
}

/** Marca uma janela aberta. Devolve a função que a marca como fechada (idempotente). */
export function registrarJanelaAberta(): () => void {
  abertas += 1;
  avisar();
  let liberada = false;
  return () => {
    if (liberada) return;
    liberada = true;
    abertas = Math.max(0, abertas - 1);
    avisar();
  };
}

export function quantasJanelasAbertas(): number {
  return abertas;
}

/** Re-renderiza quando alguma janela abre ou fecha. */
export function useHaJanelaAberta(): boolean {
  const [ha, setHa] = useState(abertas > 0);
  useEffect(() => {
    const ouvinte = () => setHa(abertas > 0);
    ouvintes.add(ouvinte);
    ouvinte();
    return () => { ouvintes.delete(ouvinte); };
  }, []);
  return ha;
}
