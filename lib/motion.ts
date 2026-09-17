import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, type View } from 'react-native';

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

/** Quando este módulo carregou: separa "a página está abrindo" de "a pessoa
    já está usando a página". Ver `useEntradaNaTela`. */
const INICIO = typeof performance !== 'undefined' ? performance.now() : 0;
const JANELA_DE_CARREGAMENTO_MS = 1500;

/**
 * Gatilho das entradas da landing que rodam uma vez, quando o bloco entra na
 * tela (`RevealOnScroll`, `TrilhaPassos`, `BentoFerramentas`).
 *
 * O conteúdo nasce no estado FINAL (`ativo` e `instantaneo` verdadeiros) e só
 * é ESCONDIDO ("armado") quando a primeira leitura do observador confirma
 * onde ele está. Sem aviso nenhum, fica visível — foi assim que as seções em
 * branco de 17/09/2026 deixaram de ser possíveis: antes o conteúdo nascia
 * invisível esperando o aviso, e sem ele ficava vazio para sempre.
 *
 * Duas situações na primeira leitura:
 * - **fora da tela:** esconde na hora (ninguém vê) e encena quando entrar;
 * - **já na tela** e a página acabou de abrir (`JANELA_DE_CARREGAMENTO_MS`):
 *   esconde e solta no quadro seguinte, para a primeira dobra também entrar
 *   animada, como sempre entrou. Passada essa janela (bloco que só aparece
 *   depois, salto pelo menu), fica no estado final sem animação, porque aí o
 *   esconde-e-mostra apareceria como um piscar.
 *
 * Quem for esconder deve fazê-lo SEM transição (é o que `instantaneo` avisa
 * ao ser falso só no momento de mostrar): animar o sumiço de algo que está
 * na tela é o piscar que esta janela existe para evitar.
 *
 * Movimento reduzido, nativo e navegador sem `IntersectionObserver` nunca
 * escondem nada.
 *
 * ponytail: se a primeira leitura chegar e as seguintes não, o bloco continua
 * escondido; não aconteceu em navegador de verdade, só em rolagem por código
 * no navegador automatizado.
 */
export function useEntradaNaTela(rootMargin: string) {
  const ref = useRef<View>(null);
  const [ativo, setAtivo] = useState(true);
  const [instantaneo, setInstantaneo] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let cancelado = false;
    let observador: IntersectionObserver | undefined;
    let quadro: number | undefined;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((reduzir) => {
        const no = ref.current as unknown as HTMLElement | null;
        if (cancelado || reduzir || !no) return;
        let primeira = true;
        observador = new IntersectionObserver(
          ([entrada]) => {
            const naTela = entrada.isIntersecting;
            if (primeira) {
              primeira = false;
              /* Já na tela e fora da janela de carregamento: sem encenação. */
              if (naTela && performance.now() - INICIO >= JANELA_DE_CARREGAMENTO_MS) {
                observador?.disconnect();
                return;
              }
              setInstantaneo(false);
              setAtivo(false);
              if (naTela) {
                /* Dois quadros: o primeiro pinta o estado escondido, o
                   segundo dispara a transição a partir dele. */
                quadro = requestAnimationFrame(() => {
                  quadro = requestAnimationFrame(() => {
                    setAtivo(true);
                    observador?.disconnect();
                  });
                });
              }
              return;
            }
            if (naTela) {
              setAtivo(true);
              observador?.disconnect();
            }
          },
          { rootMargin, threshold: 0 }
        );
        observador.observe(no);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
      observador?.disconnect();
      if (quadro !== undefined) cancelAnimationFrame(quadro);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, ativo, instantaneo };
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
