import { createElement, useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { theme, radius } from '@/lib/theme';

type Props = {
  src: string;
  /** Legenda pra leitor de tela — a imagem em si é decorativa (moldura +
      captura de tela), o texto real já existe em volta na seção. */
  legenda: string;
  largura?: number;
};

/* Proporção real da captura (390×844, um iPhone padrão) — a moldura herda
   essa proporção pra nunca esticar/distorcer a tela por dentro. */
const PROPORCAO = 390 / 844;

/**
 * Moldura de celular desenhada em CSS (bezel + notch + home indicator), sem
 * nenhum asset de imagem — não existe ferramenta de conversão/composição de
 * imagem disponível neste projeto pra gerar um PNG de bezel de verdade, e um
 * bezel desenhado em código nunca fica desatualizado se o tom da marca mudar.
 * A tela por dentro é uma captura REAL do produto (conta de exemplo, nunca
 * dado de usuário de verdade — ver `public/telas/`), não um mock inventado.
 *
 * Sem "traffic lights" coloridos (vermelho/amarelo/verde) — o sistema não
 * tem vermelho no vocabulário (`The No-Red Rule`, DESIGN.md), então o
 * indicador de home embaixo da tela é um traço neutro, não uma cor
 * semântica emprestada de outro sistema operacional.
 *
 * Flutua em CSS puro, mesma receita de `NotebookAnimado` (`@keyframes`
 * injetado via `useId`, não `Animated.loop` — o loop do RN trava depois de
 * uma volta no react-native-web) — só `transform`, nunca layout, e
 * desligado se `prefers-reduced-motion`/Reduce Motion do sistema estiver
 * ativo. Também PAUSA quando a moldura sai da tela (`IntersectionObserver`,
 * mesmo padrão de `RevealOnScroll`) — com 4 molduras na página, cada uma
 * flutuando pra sempre mesmo a 3 dobras de distância de onde a pessoa está
 * olhando é custo de composição real e constante; pausar fora da tela é o
 * que faz o total de animações rodando ao mesmo tempo nunca passar de uma
 * ou duas.
 */
export default function MolduraCelular({ src, legenda, largura = 280 }: Props) {
  const [reduzirMovimento, setReduzirMovimento] = useState(false);
  const [naTela, setNaTela] = useState(true);
  const ref = useRef<View>(null);
  const idBruto = useId();
  const prefixo = `molduraCelular_${idBruto.replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    let ativo = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => ativo && setReduzirMovimento(v))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const no = ref.current as unknown as HTMLElement | null;
    if (!no) return;
    // `rootMargin` positivo: a animação retoma um pouco ANTES da moldura
    // entrar de verdade na tela, pra nunca "ligar" visivelmente no meio do
    // scroll — mesma folga que `RevealOnScroll` já usa pro efeito inverso.
    const observador = new IntersectionObserver(([entrada]) => setNaTela(entrada.isIntersecting), { rootMargin: '200px 0px' });
    observador.observe(no);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    if (reduzirMovimento) return;
    const tag = document.createElement('style');
    // `translate3d`, não `translateY` — força a GPU a promover o elemento
    // pra própria camada de composição em todo navegador (2D puro só
    // promove em alguns navegadores), o que ajuda a suavizar a animação
    // sem precisar separar a sombra num wrapper à parte (uma tentativa
    // anterior fez isso e criou um retângulo visível atrás da moldura,
    // porque o wrapper não tinha o mesmo `borderRadius`/tamanho do miolo).
    tag.textContent = `
      @keyframes ${prefixo} {
        0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
        50% { transform: translate3d(0, -3%, 0) rotate(0.6deg); }
      }
    `;
    document.head.appendChild(tag);
    return () => {
      document.head.removeChild(tag);
    };
  }, [prefixo, reduzirMovimento]);

  const altura = largura / PROPORCAO;
  const espessuraBezel = Math.max(10, largura * 0.045);
  const animacao =
    reduzirMovimento || !naTela
      ? null
      : ({
          animationName: prefixo,
          animationDuration: '4.8s',
          animationTimingFunction: 'ease-in-out',
          animationIterationCount: 'infinite',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
        } as any);

  return (
    <View
      ref={ref}
      style={[
        estiloSombra,
        animacao,
        {
          width: largura + espessuraBezel * 2,
          height: altura + espessuraBezel * 2,
          borderRadius: largura * 0.16,
          backgroundColor: '#02141a',
          borderWidth: 1,
          borderColor: theme.ruleStrong,
          padding: espessuraBezel,
        },
      ]}
    >
      <View style={{ width: largura, height: altura, borderRadius: largura * 0.11, overflow: 'hidden', backgroundColor: theme.paper }}>
        {/* `createElement('img', ...)`, não o `Image` do RN — só assim
            `loading="lazy"` chega de verdade no elemento `<img>` real; o
            componente `Image` do react-native-web não expõe essa prop. Sem
            efeito nenhum na experiência (a moldura já entra tarde na
            página), mas evita baixar telas de seções que a pessoa nunca
            rola até ver. Mesmo padrão de `createElement` já usado em
            `NotebookAnimado`/`NotebookVideo` pra sair do conjunto de
            primitivos do RN nesta página web-only. */}
        {createElement('img', {
          src,
          alt: legenda,
          loading: 'lazy',
          style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
        })}
      </View>
      {/* Notch centralizado no topo — só decoração, por cima da tela. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: espessuraBezel,
          left: '50%',
          marginLeft: -largura * 0.15,
          width: largura * 0.3,
          height: espessuraBezel * 0.9,
          borderBottomLeftRadius: radius.md,
          borderBottomRightRadius: radius.md,
          backgroundColor: '#02141a',
        }}
      />
      {/* Home indicator — traço neutro, nunca uma cor semântica. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: espessuraBezel * 0.45,
          left: '50%',
          marginLeft: -largura * 0.14,
          width: largura * 0.28,
          height: 4,
          borderRadius: 2,
          backgroundColor: theme.inkFaint,
          opacity: 0.5,
        }}
      />
    </View>
  );
}

// Mesma receita de "Card de herói" do DESIGN.md — maior destaque de página
// persuasiva, `web only` (`as any` porque `boxShadow` não existe no tipo
// ViewStyle do React Native, só no CSS que o react-native-web gera).
const estiloSombra = {
  boxShadow: '0 32px 80px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(174,255,227,0.07)',
} as any;
