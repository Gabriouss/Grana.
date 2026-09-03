import { useEffect, useRef, type PropsWithChildren } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

type Modo = 'parallax' | 'zoom';

type Props = PropsWithChildren<{
  modo?: Modo;
  intensidade?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  desativado?: boolean;
}>;

function limitar(valor: number, minimo: number, maximo: number) {
  return Math.min(maximo, Math.max(minimo, valor));
}

function containerRolavel(no: HTMLElement): HTMLElement | null {
  let atual = no.parentElement;
  while (atual) {
    const estilo = window.getComputedStyle(atual);
    const permiteRolagem = /(auto|scroll|overlay)/.test(estilo.overflowY);
    if (permiteRolagem && atual.scrollHeight > atual.clientHeight + 1) return atual;
    atual = atual.parentElement;
  }
  return null;
}

/**
 * Movimento vinculado à posição real da seção dentro do ScrollView da landing.
 * Atua diretamente no nó web para não provocar re-render a cada pixel rolado.
 */
export default function ScrollLinkedView({
  children,
  modo = 'parallax',
  intensidade = 24,
  style,
  contentStyle,
  desativado = false,
}: Props) {
  const raizRef = useRef<View>(null);
  const conteudoRef = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || desativado) return;

    const raiz = raizRef.current as unknown as HTMLElement | null;
    const conteudo = conteudoRef.current as unknown as HTMLElement | null;
    if (!raiz || !conteudo) return;

    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const scroller = containerRolavel(raiz);
    let quadro = 0;

    const limpar = () => {
      conteudo.style.transform = '';
      conteudo.style.opacity = '';
      conteudo.style.willChange = '';
    };

    const atualizar = () => {
      quadro = 0;
      if (media?.matches) {
        limpar();
        return;
      }

      const retangulo = raiz.getBoundingClientRect();
      const topoViewport = scroller?.getBoundingClientRect().top ?? 0;
      const alturaViewport = scroller?.clientHeight ?? window.innerHeight;
      const topoRelativo = retangulo.top - topoViewport;
      conteudo.style.willChange = 'transform, opacity';

      if (modo === 'zoom') {
        const bruto = limitar((alturaViewport - topoRelativo) / (alturaViewport * 0.72), 0, 1);
        const progresso = 1 - Math.pow(1 - bruto, 3);
        const escala = 0.86 + progresso * 0.14;
        conteudo.style.transform = `translate3d(0, 0, 0) scale(${escala.toFixed(4)})`;
        conteudo.style.opacity = String(0.58 + progresso * 0.42);
        return;
      }

      const centroElemento = topoRelativo + retangulo.height / 2;
      const distanciaNormalizada = limitar(
        (alturaViewport / 2 - centroElemento) / ((alturaViewport + retangulo.height) / 2),
        -1,
        1
      );
      const deslocamento = -distanciaNormalizada * intensidade;
      conteudo.style.transform = `translate3d(0, ${deslocamento.toFixed(2)}px, 0)`;
      conteudo.style.opacity = '1';
    };

    const agendar = () => {
      if (quadro) return;
      quadro = window.requestAnimationFrame(atualizar);
    };

    const alvoRolagem: HTMLElement | Window = scroller ?? window;
    alvoRolagem.addEventListener('scroll', agendar, { passive: true });
    window.addEventListener('resize', agendar, { passive: true });
    media?.addEventListener?.('change', agendar);

    const observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(agendar) : null;
    observador?.observe(raiz);
    atualizar();

    return () => {
      if (quadro) window.cancelAnimationFrame(quadro);
      alvoRolagem.removeEventListener('scroll', agendar);
      window.removeEventListener('resize', agendar);
      media?.removeEventListener?.('change', agendar);
      observador?.disconnect();
      limpar();
    };
  }, [desativado, intensidade, modo]);

  return (
    <View ref={raizRef} style={style}>
      <View ref={conteudoRef} style={[{ width: '100%' }, contentStyle]}>
        {children}
      </View>
    </View>
  );
}
