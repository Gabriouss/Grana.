import { createElement, useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';

// Canvas original dos 3 PNGs (bg.png define o tamanho de referência) — todo
// o posicionamento por porcentagem abaixo é relativo a ESTE espaço, nunca ao
// painel renderizado diretamente (ver comentário grande abaixo do porquê).
const CANVAS_W = 2752;
const CANVAS_H = 1536;
const CANVAS_ASPECT = CANVAS_W / CANVAS_H;

/**
 * Fundo animado do herói largo, montado a partir de 3 camadas soltas
 * (`public/notebook/bg.png`, `sombra.png`, `notebook.png` — exportadas pelo
 * autor a partir do mesmo render 3D usado no vídeo de referência) em vez de
 * um vídeo. PNG é sem perdas (o vídeo, mesmo em CRF baixo, sempre recomprime
 * pixel por pixel a cada frame); aqui a imagem do notebook nunca perde
 * nitidez, e o "flutuar" é simulado em CSS puro sobre uma imagem parada — só
 * `transform`/`opacity` animam (a regra de ouro de performance: essas duas
 * propriedades não disparam layout nem paint, rodam inteiras na GPU).
 *
 * **Por que medir o painel em JS, não só `objectFit:'cover'` no bg.png.**
 * Primeira versão deste componente cobria o painel com `bg.png` via
 * `objectFit:'cover'` puro e posicionava notebook/sombra por porcentagem
 * direta (`left:'40.8%'` etc.) — parecia correto, mas `cover` recorta bg.png
 * PRA COBRIR O PAINEL, e o painel raramente tem a mesma proporção do canvas
 * original (2752×1536, ~1.79:1); num painel bem mais largo (comum: o herói
 * ocupa a tela inteira, painel podendo passar de 2.4:1), `cover` corta uma
 * fatia de CIMA/BAIXO do bg.png que a porcentagem do notebook não sabia que
 * tinha sumido — o notebook renderizava pequeno e fora do lugar. A correção:
 * medir o painel (`onLayout`) e calcular EM JS o mesmo recorte que `cover`
 * faria, aplicando-o a um `View` interno (`estiloTela`) do tamanho exato
 * desse recorte — bg/sombra/notebook então usam largura/altura 100%/
 * porcentagem TODOS relativos a esse mesmo `View`, então cortam juntos,
 * como uma imagem só, não três recortadas cada uma do seu jeito.
 *
 * **Posicionamento das camadas.** `notebook.png` (1403×914) e `sombra.png`
 * (1875×476) foram exportados recortados ao próprio conteúdo, não no canvas
 * inteiro de `bg.png` — não alinham sozinhos ao empilhar. O offset do
 * notebook (top:21.94%, left:40.84% do canvas 2752×1536) veio de correlação
 * de pixel contra `Notebook-geral.png` (o composto de referência que o autor
 * também forneceu): comparado o notebook isolado contra cada posição
 * candidata no composto, erro médio final ~0 — é a posição exata, não uma
 * estimativa. A sombra NÃO aparece no composto de referência (diff de pixel
 * contra `bg.png` fora da área do notebook deu zero absoluto), então seu
 * posicionamento aqui é critério de design: centralizada horizontalmente sob
 * o notebook, com o centro vertical um pouco acima da base dele, pra
 * "abraçar" o contato — tolerância folgada de propósito, porque é uma forma
 * borrada, não uma tela nítida onde um desalinho apareceria.
 *
 * **A física do flutuar.** `notebook` e `sombra` compartilham a mesma
 * duração/easing/instante de início (mesmo `@keyframes`, criado junto, no
 * mesmo efeito) — por isso nunca dessincronizam, mesmo depois de horas de
 * loop. Quando o notebook sobe (`translateY` negativo), a sombra encolhe e
 * clareia; quando desce, a sombra volta ao tamanho/opacidade cheios —
 * imitando o objeto se afastando/aproximando do chão, não dois elementos
 * flutuando cada um por conta própria.
 */
type Props = {
  /** 'fundo' (padrão): preenche o painel-pai inteiro (`position:absolute,
      inset:0`), com o recorte tipo `cover` calculado em JS (ver comentário
      grande da função). Para o herói largo, onde este componente É o plano
      de fundo atrás do texto. 'caixa': fica NO FLUXO normal, largura 100%
      do pai e altura proporcional (`aspectRatio`) — para o herói compacto,
      onde é um bloco entre parágrafos, não um fundo de painel. Sem recorte
      `cover` nesse modo: a caixa É o canvas (2752:1536), então bg/sombra/
      notebook usam as MESMAS porcentagens de sempre sem precisar medir nada
      em JS — o problema que o modo 'fundo' resolve (painel com proporção
      diferente do canvas) não existe quando a caixa TEM a proporção do
      canvas por definição. */
  variante?: 'fundo' | 'caixa';
};

export default function NotebookAnimado({ variante = 'fundo' }: Props) {
  const [reduzirMovimento, setReduzirMovimento] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
  const [naTela, setNaTela] = useState(true);
  const [painel, setPainel] = useState({ width: 0, height: 0 });
  const { width: winW, height: winH } = useWindowDimensions();
  const containerRef = useRef<View>(null);
  const idBruto = useId();
  const prefixo = `notebookAnimado_${idBruto.replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    let ativo = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => ativo && setReduzirMovimento(v))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  // Pausa a animação quando o herói rola pra fora da tela — evita processamento
  // de GPU contínuo em seções posteriores da página.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const no = containerRef.current as unknown as HTMLElement | null;
    if (!no) return;
    const observador = new IntersectionObserver(([entrada]) => setNaTela(entrada.isIntersecting), { rootMargin: '200px 0px' });
    observador.observe(no);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    if (reduzirMovimento) return;
    const tag = document.createElement('style');
    tag.textContent = `
      @keyframes ${prefixo}_notebook {
        0%, 100% { transform: translate3d(0, 0, 0) rotate3d(0, 0, 1, 0deg); }
        50% { transform: translate3d(0, -18px, 0) rotate3d(0, 0, 1, -0.7deg); }
      }
      @keyframes ${prefixo}_sombra {
        0%, 100% { transform: scale3d(1, 1, 1); opacity: 1; }
        50% { transform: scale3d(0.9, 0.9, 1); opacity: 0.65; }
      }
    `;
    document.head.appendChild(tag);
    return () => {
      document.head.removeChild(tag);
    };
  }, [prefixo, reduzirMovimento]);

  function aoMedir(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setPainel({ width, height });
    }
  }

  const larguraPainel = painel.width > 0 ? painel.width : winW;
  const alturaPainel = painel.height > 0 ? painel.height : winH;

  const painelAspect = larguraPainel / (alturaPainel || 1);
  let telaW = larguraPainel;
  let telaH = alturaPainel;
  if (painelAspect > CANVAS_ASPECT) {
    telaW = larguraPainel;
    telaH = telaW / CANVAS_ASPECT;
  } else {
    telaH = alturaPainel;
    telaW = telaH * CANVAS_ASPECT;
  }
  const telaLeft = (larguraPainel - telaW) / 2;
  const telaTop = (alturaPainel - telaH) / 2;

  const animNotebook = reduzirMovimento || !naTela
    ? {}
    : {
        animationName: `${prefixo}_notebook`,
        animationDuration: '4.8s',
        animationTimingFunction: 'cubic-bezier(0.42, 0, 0.58, 1)',
        animationIterationCount: 'infinite',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
      };

  const animSombra = reduzirMovimento || !naTela
    ? {}
    : {
        animationName: `${prefixo}_sombra`,
        animationDuration: '4.8s',
        animationTimingFunction: 'cubic-bezier(0.42, 0, 0.58, 1)',
        animationIterationCount: 'infinite',
        willChange: 'transform, opacity',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
      };

  const camadas = (
    <>
      {createElement('img', {
        // TESTE: `bg-opacidade.png` no lugar de `bg.png` — quadrado
        // (2523×2523, não 2752×1536) e com alfa de verdade nas bordas
        // (transparente nos cantos, opaco só no centro/topo), ao contrário
        // do `bg.png` original, opaco em toda a extensão. `objectFit:
        // 'cover'` porque a proporção não bate mais com a do canvas — sem
        // isso a imagem esticaria/achataria pra caber exatamente na caixa
        // larga, deformando o brilho redondo numa oval.
        src: '/notebook/bg-opacidade.webp',
        alt: '',
        'aria-hidden': true,
        width: 2523,
        height: 2523,
        fetchPriority: 'high',
        style: {
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          transform: 'translate3d(0,0,0)',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
        },
      })}
      {createElement('img', {
        src: '/notebook/sombra.webp',
        alt: '',
        'aria-hidden': true,
        width: 1875,
        height: 476,
        style: {
          position: 'absolute',
          left: '32.267%',
          top: '62.044%',
          width: '68.125%',
          height: '30.99%',
          objectFit: 'contain',
          display: 'block',
          transformOrigin: '50% 50%',
          transform: 'translate3d(0,0,0)',
          ...animSombra,
        },
      })}
      {createElement('img', {
        src: '/notebook/notebook.webp',
        alt: 'Notebook exibindo o painel do Grana.',
        width: 1403,
        height: 914,
        fetchPriority: 'high',
        style: {
          position: 'absolute',
          left: '40.843%',
          top: '21.94%',
          width: '50.981%',
          height: '59.505%',
          objectFit: 'contain',
          display: 'block',
          transformOrigin: '50% 50%',
          transform: 'translate3d(0,0,0)',
          ...animNotebook,
        },
      })}
    </>
  );

  if (variante === 'caixa') {
    return (
      <View ref={containerRef} style={[styles.caixa, { pointerEvents: 'none' }]} >
        {camadas}
      </View>
    );
  }

  return (
    <View ref={containerRef} style={[styles.painel, { pointerEvents: 'none' }]}  onLayout={aoMedir}>
      {painel.width > 0 && (
        <View style={{ position: 'absolute', left: telaLeft, top: telaTop, width: telaW, height: telaH }}>
          {camadas}
        </View>
      )}
    </View>
  );
}

const styles = {
  painel: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  // `aspectRatio` é uma propriedade real do React Native (não CSS web-only,
  // sem precisar de `as any`) — a altura vira uma função da largura
  // renderizada sozinha, sem `onLayout`/medição nenhuma.
  caixa: { position: 'relative', width: '100%', aspectRatio: CANVAS_ASPECT, overflow: 'hidden' },
} as const;
