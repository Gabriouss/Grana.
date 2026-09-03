import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CORTES, colunaConteudo } from '@/lib/breakpoints';
import { fonts as uiFonts, radius, spacing, theme, type } from '@/lib/theme';
import MiniMockBeneficio, { type VarianteMock } from '@/components/MiniMockBeneficio';
import RevealOnScroll from '@/components/RevealOnScroll';

const fonts = { regular: uiFonts.brandRegular, light: uiFonts.brandLight };

export type BeneficioHorizontal = {
  variante: VarianteMock;
  rotulo: string;
  titulo: string;
  texto: string;
};

type Props = {
  itens: BeneficioHorizontal[];
  largura: number;
  altura: number;
  alturaCabecalho: number;
  titulo: string;
  descricao: string;
};

function limitar(valor: number, minimo: number, maximo: number) {
  return Math.min(maximo, Math.max(minimo, valor));
}

function containerRolavel(no: HTMLElement): HTMLElement | null {
  let atual = no.parentElement;
  while (atual) {
    const estilo = window.getComputedStyle(atual);
    if (/(auto|scroll|overlay)/.test(estilo.overflowY) && atual.scrollHeight > atual.clientHeight + 1) return atual;
    atual = atual.parentElement;
  }
  return null;
}

function CardBeneficio({ item, larguraCard, alturaCard }: { item: BeneficioHorizontal; larguraCard: number; alturaCard: number }) {
  return (
    <View role="listitem" style={[styles.cardPosicao, { width: larguraCard }]}> 
      <View style={[styles.card, { height: alturaCard }]}>
        <MiniMockBeneficio variante={item.variante} />
        <Text style={styles.rotulo}>{item.rotulo}</Text>
        <Text style={styles.tituloCard}>{item.titulo}</Text>
        <Text style={styles.textoCard}>{item.texto}</Text>
      </View>
    </View>
  );
}

export default function BeneficiosHorizontais({ itens, largura, altura, alturaCabecalho, titulo, descricao }: Props) {
  const [reduzirMovimento, setReduzirMovimento] = useState(
    () => Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
  const fixar = largura >= 1100 && altura >= 720 && !reduzirMovimento;
  const larguraCard = fixar ? 420 : Math.min(440, Math.max(260, largura - (largura < CORTES.medio ? 96 : 120)));
  const alturaCard = largura < CORTES.medio ? 350 : 400;
  const alturaSticky = Math.max(620, altura - alturaCabecalho);
  const [alturaPalco, setAlturaPalco] = useState(alturaSticky * 2.4);
  const palcoRef = useRef<View>(null);
  const stickyRef = useRef<View>(null);
  const viewportRef = useRef<View>(null);
  const trilhoRef = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const atualizar = () => setReduzirMovimento(media?.matches === true);
    media?.addEventListener?.('change', atualizar);
    return () => media?.removeEventListener?.('change', atualizar);
  }, []);

  useEffect(() => {
    if (!fixar || Platform.OS !== 'web' || typeof window === 'undefined') return;

    const palco = palcoRef.current as unknown as HTMLElement | null;
    const sticky = stickyRef.current as unknown as HTMLElement | null;
    const viewport = viewportRef.current as unknown as HTMLElement | null;
    const trilho = trilhoRef.current as unknown as HTMLElement | null;
    if (!palco || !sticky || !viewport || !trilho) return;

    const scroller = containerRolavel(palco);
    if (!scroller) return;
    let quadro = 0;
    let percursoHorizontal = 0;

    const atualizar = () => {
      quadro = 0;
      const retanguloPalco = palco.getBoundingClientRect();
      const retanguloScroller = scroller.getBoundingClientRect();
      const inicio = scroller.scrollTop + retanguloPalco.top - retanguloScroller.top - alturaCabecalho;
      const percursoVertical = Math.max(1, palco.offsetHeight - sticky.offsetHeight);
      const progresso = limitar((scroller.scrollTop - inicio) / percursoVertical, 0, 1);
      trilho.style.transform = `translate3d(${(-percursoHorizontal * progresso).toFixed(2)}px, 0, 0)`;
    };

    const agendar = () => {
      if (quadro) return;
      quadro = window.requestAnimationFrame(atualizar);
    };

    const medir = () => {
      percursoHorizontal = Math.max(0, trilho.scrollWidth - viewport.clientWidth);
      const novaAltura = Math.ceil(alturaSticky + percursoHorizontal + spacing.xxl * 2);
      setAlturaPalco((atual) => (Math.abs(atual - novaAltura) > 1 ? novaAltura : atual));
      agendar();
    };

    trilho.style.willChange = 'transform';
    scroller.addEventListener('scroll', agendar, { passive: true });
    window.addEventListener('resize', medir, { passive: true });
    const observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    observador?.observe(viewport);
    observador?.observe(trilho);
    medir();

    return () => {
      if (quadro) window.cancelAnimationFrame(quadro);
      scroller.removeEventListener('scroll', agendar);
      window.removeEventListener('resize', medir);
      observador?.disconnect();
      trilho.style.transform = '';
      trilho.style.willChange = '';
    };
  }, [alturaCabecalho, alturaSticky, fixar, itens.length, larguraCard]);

  const cabecalho = (
    <RevealOnScroll variante="titulo" style={styles.intro}>
      <Text role="heading" aria-level={2} style={[styles.tituloSecao, largura < CORTES.medio && styles.tituloSecaoCompacto]}>
        {titulo}
      </Text>
      <Text style={[styles.descricao, largura < CORTES.medio && styles.descricaoCompacta]}>{descricao}</Text>
    </RevealOnScroll>
  );

  if (!fixar) {
    return (
      <View
        style={[
          colunaConteudo,
          styles.faixa,
          largura < CORTES.medio && styles.faixaCompacta,
          styles.conteudoLivre,
          largura >= CORTES.medio && { minHeight: altura },
        ]}
      >
        {cabecalho}
        <View style={styles.viewportToque}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={larguraCard + spacing.lg}
            style={styles.rolagemHorizontal}
            contentContainerStyle={styles.trilhoToque}
            role="list"
            aria-label="Recursos do Grana."
          >
            {itens.map((item) => (
              <CardBeneficio key={item.variante} item={item} larguraCard={larguraCard} alturaCard={alturaCard} />
            ))}
          </ScrollView>
          <FadeBorda lado="esquerda" />
          <FadeBorda lado="direita" />
        </View>
      </View>
    );
  }

  return (
    <View ref={palcoRef} style={[styles.palco, { height: alturaPalco }]}>
      <View ref={stickyRef} style={[styles.sticky, { top: alturaCabecalho, height: alturaSticky }]}>
        <View style={[colunaConteudo, styles.faixa, styles.conteudoSticky]}>
          {cabecalho}
          <View ref={viewportRef} style={styles.viewport}>
            <View ref={trilhoRef} role="list" aria-label="Recursos do Grana." style={styles.trilhoDesktop}>
              {itens.map((item) => (
                <CardBeneficio key={item.variante} item={item} larguraCard={larguraCard} alturaCard={alturaCard} />
              ))}
            </View>
            <FadeBorda lado="esquerda" />
            <FadeBorda lado="direita" />
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * Sombra de saída nas laterais do carrossel — sem ela, o card do fim
 * simplesmente é cortado pela borda do `overflow:hidden`, e parece que ele
 * "aparece do nada" em vez de estar entrando/saindo de um espaço contínuo
 * (pedido do autor, 02/09/2026). É um gradiente da cor real do fundo da
 * seção (`theme.paperRaised`, nunca preto/transparente puro — um fade pra
 * transparente sobre um fundo colorido deixaria a própria cor vazando na
 * borda) até transparente, por cima do trilho, sem capturar toque.
 */
function FadeBorda({ lado }: { lado: 'esquerda' | 'direita' }) {
  return (
    <View
      aria-hidden
      pointerEvents="none"
      style={[styles.fadeBorda, lado === 'esquerda' ? styles.fadeBordaEsquerda : styles.fadeBordaDireita]}
    />
  );
}

const styles = StyleSheet.create({
  palco: { position: 'relative', width: '100%', ...({ scrollSnapAlign: 'start' } as any) },
  sticky: { width: '100%', overflow: 'hidden', ...({ position: 'sticky' } as any) },
  faixa: { paddingHorizontal: spacing.xl, width: '100%' },
  faixaCompacta: { paddingHorizontal: spacing.xl + spacing.md },
  conteudoSticky: { height: '100%', justifyContent: 'center', paddingVertical: spacing.xxl },
  conteudoLivre: { paddingVertical: spacing.xxl * 2.5, justifyContent: 'center', ...({ scrollSnapAlign: 'start' } as any) },
  intro: { width: '100%', alignItems: 'center', marginBottom: spacing.xxl + spacing.sm },
  tituloSecao: {
    color: theme.ink,
    fontSize: 50,
    lineHeight: 54,
    letterSpacing: -1.2,
    fontFamily: fonts.regular,
    textAlign: 'center',
    maxWidth: 900,
    marginBottom: spacing.xl,
    ...({ textWrap: 'balance' } as any),
  },
  tituloSecaoCompacto: { fontSize: type.cabecalho - 1, lineHeight: (type.cabecalho - 1) * 1.28, letterSpacing: -0.4 },
  descricao: { color: theme.inkSoft, fontSize: type.destaque, lineHeight: type.destaque * 1.5, fontFamily: fonts.light, textAlign: 'center', maxWidth: 820 },
  descricaoCompacta: { fontSize: type.corpo, lineHeight: type.corpo * 1.5 },
  viewport: { width: '100%', overflow: 'hidden', position: 'relative' },
  // Mesma moldura do `viewport`, mas SEM `overflow:'hidden'`: no toque
  // (`rolagemHorizontal` abaixo já é `overflow:'visible'` de propósito, pra
  // não cortar a sombra vertical dos cards). O fade lateral não depende de
  // clipping pra funcionar — é o próprio degradê que cobre o card, não a
  // borda do container.
  viewportToque: { width: '100%', position: 'relative' },
  fadeBorda: { position: 'absolute', top: 0, bottom: 0, width: 64, zIndex: 1 },
  fadeBordaEsquerda: {
    left: 0,
    ...({ backgroundImage: `linear-gradient(90deg, ${theme.paperRaised} 0%, transparent 100%)` } as any),
  },
  fadeBordaDireita: {
    right: 0,
    ...({ backgroundImage: `linear-gradient(270deg, ${theme.paperRaised} 0%, transparent 100%)` } as any),
  },
  trilhoDesktop: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.lg, width: 'max-content' as any },
  rolagemHorizontal: { width: '100%', overflow: 'visible' },
  trilhoToque: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.lg, paddingRight: spacing.xxl },
  cardPosicao: { flexShrink: 0, minWidth: 0 },
  card: {
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    ...({ boxShadow: '0 18px 45px -24px rgba(0,0,0,0.7)' } as any),
  },
  rotulo: { color: theme.accent2, fontSize: type.micro, lineHeight: type.micro * 1.4, fontFamily: fonts.regular, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: spacing.xs },
  tituloCard: { color: theme.ink, fontSize: type.corpo, lineHeight: type.corpo * 1.3, fontFamily: fonts.regular, marginBottom: spacing.sm },
  textoCard: { color: theme.inkSoft, fontSize: type.nota, lineHeight: type.nota * 1.5, fontFamily: fonts.light },
});
