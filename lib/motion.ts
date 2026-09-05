import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Curvas de easing usadas em CSS puro (via `as any` — `transitionTimingFunction`/
 * `animationTimingFunction` não existem no tipo `ViewStyle` do React Native)
 * espalhadas pela landing e por componentes visuais do app. Achado da
 * auditoria de motion de 03/09/2026: 6 valores digitados à mão, nenhum
 * errado, mas sem lugar comum que os nomeasse — a próxima edição estava
 * livre pra inventar um 7º em vez de reconhecer um já existente. Nomear
 * aqui não muda nenhum valor, só dá a eles um nome que a próxima pessoa
 * (ou sessão) consegue procurar antes de digitar um novo.
 *
 * Cada um continua sendo UM efeito específico — não force reutilizar o
 * token errado só porque "é parecido"; se o próximo caso não for
 * literalmente o mesmo movimento, o certo é medir e nomear um novo.
 */
export const EASE_REVEAL = 'cubic-bezier(0.16, 1, 0.3, 1)'; // fade + subida ao entrar na tela (RevealOnScroll, FaqItem)
export const EASE_LOOP = 'cubic-bezier(0.42, 0, 0.58, 1)'; // ida-e-volta constante, sem parada abrupta (MolduraCelular, NotebookAnimado)
export const EASE_BOUNCE_HINT = 'cubic-bezier(0.45, 0, 0.2, 1)'; // 3 pulsos do indicador de scroll do herói
export const EASE_ROLL = 'cubic-bezier(0.65, 0, 0.35, 1)'; // texto rolando pra cima (RotuloRolante do CTA)
export const EASE_SNAP = 'cubic-bezier(0.2, 0.9, 0.2, 1.15)'; // preenchimento com leve overshoot no hover do CTA

/* ── Motion do aplicativo interno (plano `plans/003-base-motion-feedback.md`)
 *
 * Os tokens acima nasceram na landing e cada um É um efeito específico dela.
 * Estes três são o vocabulário do app autenticado, e existem como PARES: a
 * forma CSS pro caminho web e os pontos de controle pro `Easing.bezier` do
 * Animated, derivados dos mesmos números. Guardar os dois juntos é o que
 * impede a web e o nativo de divergirem quando alguém ajustar a curva num
 * lado só.
 */

/** Entrada e saída de superfície (janela, toast, conteúdo). Desacelera forte
    no fim, que é o que faz a coisa "pousar" em vez de parar. */
export const UI_OUT = [0.23, 1, 0.32, 1] as const;
/** Folhas e assentamento: sai mais devagar e chega mais firme que a UI_OUT. */
export const UI_DRAWER = [0.32, 0.72, 0, 1] as const;
/** Movimento entre dois estados já visíveis, quando ambos importam. */
export const UI_MOVE = [0.77, 0, 0.175, 1] as const;

/** Forma CSS de um dos tokens acima, pro caminho web. */
export function cssBezier(pontos: readonly [number, number, number, number]): string {
  return `cubic-bezier(${pontos.join(', ')})`;
}

/** Mantém as animações não essenciais alinhadas à preferência do sistema. */
export function useReducedMotion() {
  const [reduzir, setReduzir] = useState(false);

  useEffect(() => {
    let ativo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((valor) => {
        if (ativo) setReduzir(valor);
      })
      .catch(() => {});

    const assinatura = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduzir);
    return () => {
      ativo = false;
      assinatura.remove();
    };
  }, []);

  return reduzir;
}

/**
 * Sinaliza `prefers-reduced-transparency: reduce` — preferência de sistema
 * separada de reduced-motion (é sobre transparência/blur, não sobre
 * movimento). Achado da auditoria de 03/09/2026: a landing tem 3 superfícies
 * com `backdropFilter` (cabeçalho sticky, `ctaPrimario`, `granaboRecurso`) e
 * nenhuma reagia a essa preferência — quem ativa reduced-transparency no
 * sistema via essa configuração continuava vendo os três blurs cheios. Só
 * web: nativo não tem esse media query, o valor fica sempre `false`.
 */
export function usePrefersReducedTransparency() {
  const [reduzir, setReduzir] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-transparency: reduce)');
    setReduzir(media.matches);
    const ouvir = (evento: MediaQueryListEvent) => setReduzir(evento.matches);
    media.addEventListener?.('change', ouvir);
    return () => media.removeEventListener?.('change', ouvir);
  }, []);

  return reduzir;
}
