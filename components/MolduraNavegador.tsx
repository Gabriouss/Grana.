import { createElement, useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import { theme, spacing, fonts } from '@/lib/theme';
import { EASE_LOOP } from '@/lib/motion';

type Props = {
  src: string;
  legenda: string;
  largura?: number;
  /** Proporção real da captura (1440×900 por padrão — a tela desktop do Grana.). */
  proporcao?: number;
  /** Inclinação 3D em perspectiva (pedido do autor: "a exibição da tela
      igual a do Dinzo") — a mesma ideia de cartão flutuando levemente
      girado que o teardown documentou na seção "Painel web" do
      concorrente. Só a apresentação da moldura muda; cores, pontinhos
      neutros e o miolo continuam 100% Grana. */
  inclinada?: boolean;
};

const INCLINACAO = 'perspective(1600px) rotateX(4deg) rotateY(-9deg)';

/**
 * Moldura de navegador desenhada em CSS — mesmo raciocínio do
 * `MolduraCelular`: sem asset de imagem, barra de topo com "pontinhos"
 * neutros (nunca vermelho/amarelo/verde — a marca não tem vermelho no
 * vocabulário) e uma pílula de URL fake, só decorativa.
 *
 * Flutua em CSS puro (mesma receita de `NotebookAnimado`/`MolduraCelular`,
 * `@keyframes` via `useId`, desligado em Reduce Motion, e PAUSADA fora da
 * tela via `IntersectionObserver` — ver comentário completo em
 * `MolduraCelular`) — só translateY, sem rotação: uma janela de navegador
 * não "inclina" como um celular segurado na mão, então a mesma física do
 * celular ficaria estranha aqui.
 *
 * Recriado em 04/09/2026 — existia antes, foi removido no commit
 * `f391829` (31/08) por ficar órfão (a seção que o usava foi substituída
 * por cards de prova). Conteúdo idêntico ao original, só a curva de
 * animação passou a vir do token `EASE_LOOP` (lib/motion.ts), que não
 * existia na primeira versão.
 */
export default function MolduraNavegador({ src, legenda, largura = 520, proporcao = 1440 / 900, inclinada = false }: Props) {
  const [reduzirMovimento, setReduzirMovimento] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
  const [naTela, setNaTela] = useState(true);
  const ref = useRef<View>(null);
  const idBruto = useId();
  const prefixo = `molduraNavegador_${idBruto.replace(/[^a-zA-Z0-9]/g, '')}`;

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
    const observador = new IntersectionObserver(([entrada]) => setNaTela(entrada.isIntersecting), { rootMargin: '200px 0px' });
    observador.observe(no);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    if (reduzirMovimento) return;
    const tag = document.createElement('style');
    // `translate3d`, não `translateY` (ver comentário equivalente em
    // `MolduraCelular`) — força promoção de camada na GPU sem precisar
    // separar a sombra num wrapper à parte.
    // A inclinação faz parte do MESMO transform da animação — se ficasse só
    // no estilo estático, a troca pra `animation-name` no play substituiria
    // o transform inteiro e a moldura "achataria" toda vez que voltasse à
    // tela ou saísse do Reduce Motion.
    const base = inclinada ? `${INCLINACAO} ` : '';
    tag.textContent = `
      @keyframes ${prefixo} {
        0%, 100% { transform: ${base}translate3d(0, 0, 0); }
        50% { transform: ${base}translate3d(0, -12px, 0); }
      }
    `;
    document.head.appendChild(tag);
    return () => {
      document.head.removeChild(tag);
    };
  }, [prefixo, reduzirMovimento, inclinada]);

  const alturaTela = largura / proporcao;
  const alturaBarra = Math.max(28, largura * 0.055);
  const animacao =
    reduzirMovimento || !naTela
      ? null
      : ({
          animationName: prefixo,
          animationDuration: '4.8s',
          animationTimingFunction: EASE_LOOP,
          animationIterationCount: 'infinite',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        } as any);
  // Estático (Reduce Motion, ou parado fora da tela) precisa da MESMA
  // inclinação de base — sem isto a moldura "achataria" toda vez que a
  // animação não estivesse tocando, em vez de só perder o balanço.
  const estiloInclinado = inclinada && !animacao ? ({ transform: INCLINACAO } as any) : null;

  return (
    <View
      ref={ref}
      style={[
        estiloSombra,
        animacao,
        estiloInclinado,
        {
          width: largura,
          borderRadius: 14,
          backgroundColor: theme.paperRaised,
          borderWidth: 1,
          borderColor: theme.ruleStrong,
          overflow: 'hidden',
        },
      ]}
    >
      <View
        style={{
          height: alturaBarra,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.md,
          gap: spacing.sm,
          backgroundColor: '#02141a',
          borderBottomWidth: 1,
          borderBottomColor: theme.rule,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.rule }} />
          ))}
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ paddingVertical: 3, paddingHorizontal: spacing.md, borderRadius: 999, backgroundColor: theme.paper }}>
            {/* `fontFamily` explícito: sem ele o react-native-web entrega a
                pilha do sistema (`-apple-system, Segoe UI, Roboto…`) e este
                vira o único texto visível da página fora da marca — a
                Only-Font Rule do DESIGN.md não abre exceção nem pra
                decoração de 10px. */}
            <Text style={{ color: theme.inkFaint, fontSize: 10, fontFamily: fonts.light }}>granaponto.com.br</Text>
          </View>
        </View>
      </View>
      <View style={{ width: largura, height: alturaTela, backgroundColor: theme.paper }}>
        {/* `createElement('img', ...)` — ver comentário completo em
            `MolduraCelular` sobre por que não o `Image` do RN. */}
        {createElement('img', {
          src,
          alt: legenda,
          width: 1440,
          height: Math.round(1440 / proporcao),
          loading: 'lazy',
          style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
        })}
      </View>
    </View>
  );
}

const estiloSombra = {
  boxShadow: '0 32px 80px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(174,255,227,0.07)',
} as any;
