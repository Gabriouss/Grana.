import { useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';

type Props = {
  compacto?: boolean;
  intensidade?: 'sutil' | 'presente';
};

/**
 * Neblina de luz da landing, traduzida para os tons menta e ciano do Grana.
 * As formas sao elipses largas e sobrepostas, nunca circulos decorativos
 * soltos. O movimento usa apenas transform/opacity, pausa fora da tela e
 * respeita a preferencia de movimento reduzido do sistema.
 */
export default function FogBackground({ compacto = false, intensidade = 'sutil' }: Props) {
  const [reduzirMovimento, setReduzirMovimento] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
  const [naTela, setNaTela] = useState(true);
  const ref = useRef<View>(null);
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const prefixo = `granaFog_${id}`;

  useEffect(() => {
    let ativo = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((valor) => ativo && setReduzirMovimento(valor))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof IntersectionObserver === 'undefined') return;
    const elemento = ref.current as unknown as HTMLElement | null;
    if (!elemento) return;
    const observador = new IntersectionObserver(([entrada]) => setNaTela(entrada.isIntersecting), {
      rootMargin: '240px 0px',
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || reduzirMovimento) return;
    const tag = document.createElement('style');
    tag.textContent = `
      @keyframes ${prefixo}_ida {
        0%, 100% { transform: translate3d(-4%, -2%, 0) scale3d(1, 1, 1); opacity: .62; }
        45% { transform: translate3d(6%, 3%, 0) scale3d(1.08, .94, 1); opacity: .9; }
        72% { transform: translate3d(1%, -4%, 0) scale3d(.98, 1.06, 1); opacity: .72; }
      }
      @keyframes ${prefixo}_volta {
        0%, 100% { transform: translate3d(5%, 3%, 0) scale3d(1.04, .96, 1); opacity: .48; }
        50% { transform: translate3d(-7%, -4%, 0) scale3d(.95, 1.08, 1); opacity: .76; }
      }
    `;
    document.head.appendChild(tag);
    return () => {
      document.head.removeChild(tag);
    };
  }, [prefixo, reduzirMovimento]);

  const pausado = reduzirMovimento || !naTela;
  // Reduzido na auditoria de 02/09/2026: o detector automático flagou o
  // glow ciano/menta sobre fundo escuro como `ai-color-palette` — um dos
  // clichês mais associados a design gerado por IA. A paleta petróleo/menta
  // continua, mas em intensidade de atmosfera, não de letreiro.
  const opacidade = intensidade === 'presente' ? (compacto ? 0.5 : 0.58) : compacto ? 0.28 : 0.36;
  const animacao = (nome: string, duracao: string) =>
    pausado
      ? null
      : ({
          animationName: `${prefixo}_${nome}`,
          animationDuration: duracao,
          animationTimingFunction: 'ease-in-out',
          animationIterationCount: 'infinite',
          willChange: 'transform, opacity',
        } as any);

  return (
    <View ref={ref} aria-hidden style={[styles.raiz, { opacity: opacidade, pointerEvents: 'none' }]}>
      <View style={[styles.faixaPrimaria, animacao('ida', compacto ? '16s' : '20s')]} />
      {!compacto && <View style={[styles.faixaSecundaria, animacao('volta', '24s')]} />}
    </View>
  );
}

const styles = {
  raiz: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  faixaPrimaria: {
    position: 'absolute',
    top: '-28%',
    left: '-18%',
    width: '142%',
    height: '156%',
    backgroundImage:
      'radial-gradient(ellipse 42% 5% at 20% 39%, rgba(239,255,250,.62) 0%, rgba(174,255,227,.22) 40%, transparent 76%), radial-gradient(ellipse 38% 13% at 18% 34%, rgba(174,255,227,.46) 0%, rgba(174,255,227,.15) 43%, transparent 74%), radial-gradient(ellipse 48% 5% at 76% 64%, rgba(174,255,227,.48) 0%, rgba(31,169,141,.16) 42%, transparent 76%), radial-gradient(ellipse 44% 11% at 73% 67%, rgba(50,196,198,.38) 0%, rgba(31,169,141,.12) 46%, transparent 76%)',
    filter: 'blur(18px)',
    mixBlendMode: 'screen',
    transformOrigin: '50% 50%',
  },
  faixaSecundaria: {
    position: 'absolute',
    top: '-34%',
    left: '-28%',
    width: '156%',
    height: '172%',
    backgroundImage:
      'radial-gradient(ellipse 30% 9% at 72% 27%, rgba(174,255,227,.28) 0%, rgba(174,255,227,.08) 50%, transparent 78%), radial-gradient(ellipse 34% 10% at 31% 76%, rgba(4,113,134,.38) 0%, rgba(31,169,141,.1) 50%, transparent 80%)',
    filter: 'blur(32px)',
    mixBlendMode: 'screen',
    transformOrigin: '50% 50%',
  },
} as const;
