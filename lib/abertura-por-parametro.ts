import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Abre um formulário quando a tela é aberta por um parâmetro de rota.
 *
 * As três telas de lançamento (Movimentações, Contas, Cartões) recebem o FAB
 * da Início por rota — `?novoLancamento=in`, `?novaConta=1`, `?novaCompra=1` —
 * e precisam abrir o próprio formulário ao chegar. Parece um `useEffect` de
 * três linhas e não é: tem duas armadilhas, e as duas já morderam.
 *
 * **1. Reabrir no cancelamento.** `router.setParams({ x: undefined })` limpa o
 * parâmetro na web, onde ele vive na query da URL, mas não é garantido no
 * nativo. Se ele sobrevive, o efeito roda de novo assim que o estado do modal
 * cai pra false — ou seja, no exato instante em que a pessoa CANCELA — e
 * reabre o formulário. Cancelar deixa de ter efeito visível e a tela parece
 * travada. Daí a trava por ref.
 *
 * **2. Abrir só na primeira vez.** Uma trava por ref sozinha resolve a
 * primeira armadilha e cria a segunda: estas telas são abas e NÃO desmontam
 * ao sair. O ref sobrevive, e a segunda chegada pela mesma rota não abre nada.
 * Foi o que aconteceu ao ir Início → Entrada e depois Início → Saída: a
 * segunda navegava e não abria o formulário.
 *
 * A saída é soltar a trava no blur. Cancelar não tira o foco da tela, então
 * não destrava; sair dela sim, e a próxima chegada volta a abrir.
 */
export function useAberturaPorParametro(deveAbrir: boolean, abrir: () => void) {
  const jaAbriu = useRef(false);

  useFocusEffect(
    useCallback(() => {
      return () => {
        jaAbriu.current = false;
      };
    }, [])
  );

  useEffect(() => {
    if (!deveAbrir || jaAbriu.current) return;
    jaAbriu.current = true;
    abrir();
    // `abrir` é recriada a cada render das telas; a trava é quem controla, não a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deveAbrir]);
}
