import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CORTES, colunaConteudo } from '@/lib/breakpoints';
import { fonts as uiFonts, radius, sombraCard, spacing, theme, type } from '@/lib/theme';
import MiniMockBeneficio, { type VarianteMock } from '@/components/MiniMockBeneficio';
import RevealOnScroll from '@/components/RevealOnScroll';
import AppPressable from '@/components/AppPressable';

const fonts = { regular: uiFonts.brandRegular, light: uiFonts.brandLight };

export type BeneficioHorizontal = {
  variante: VarianteMock;
  rotulo: string;
  titulo: string;
  texto: string;
  /** Só o bento lê este campo — os outros dois modos ignoram. `undefined`
      equivale a `'normal'`, então itens já existentes não precisam mudar. */
  tamanho?: 'normal' | 'grande';
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

/**
 * Compacto e amplo são dois cards diferentes, não o mesmo card com escala.
 *
 * No celular o card precisa caber num terço da tela: altura travada, texto
 * cortado na 3ª linha e um degrau a menos na tipografia. Levar essas mesmas
 * restrições pro desktop (foi o que aconteceu em 03/09/2026) deixa o card de
 * 420px com reticências no meio de uma frase e um vão morto embaixo, porque
 * a altura fixa foi calculada pro texto truncado do celular.
 *
 * No amplo, então: texto inteiro, tipografia cheia e nenhuma altura fixa —
 * o `alignItems: 'stretch'` do trilho já iguala todos os cards pela altura
 * do mais alto, que é exatamente o que a altura fixa tentava imitar.
 */
function CardBeneficio({
  item,
  larguraCard,
  alturaCard,
  compacto,
}: {
  item: BeneficioHorizontal;
  larguraCard: number;
  alturaCard: number;
  compacto: boolean;
}) {
  return (
    <View role="listitem" style={[styles.cardPosicao, { width: larguraCard }]}>
      <View style={[styles.card, compacto ? { height: alturaCard } : styles.cardAmplo]}>
        <MiniMockBeneficio variante={item.variante} />
        <Text style={styles.rotulo}>{item.rotulo}</Text>
        <Text style={[styles.tituloCard, !compacto && styles.tituloCardAmplo]}>{item.titulo}</Text>
        <Text style={[styles.textoCard, !compacto && styles.textoCardAmplo]} numberOfLines={compacto ? 3 : undefined}>
          {item.texto}
        </Text>
      </View>
    </View>
  );
}

/**
 * Card do bento — não é `CardBeneficio` com props diferentes porque os dois
 * têm regra de largura oposta: `CardBeneficio` recebe `larguraCard` explícita
 * (mesmo valor pro trilho inteiro), o bento deixa a grade decidir a largura
 * de cada célula e só diz quantas colunas ocupar via `tamanho`.
 */
function CardBento({ item }: { item: BeneficioHorizontal }) {
  const grande = item.tamanho === 'grande';
  return (
    <View role="listitem" style={[styles.celulaBento, grande && ({ gridColumn: 'span 2' } as any)]}>
      <View style={[styles.card, styles.cardAmplo, styles.cardBento, grande && styles.cardBentoGrande]}>
        <MiniMockBeneficio variante={item.variante} destaque={grande} />
        <Text style={[styles.rotulo, grande && styles.rotuloGrande]}>{item.rotulo}</Text>
        <Text style={[styles.tituloCard, styles.tituloCardAmplo, grande && styles.tituloCardGrande]}>{item.titulo}</Text>
        <Text style={[styles.textoCard, styles.textoCardAmplo, grande && styles.textoCardGrande]}>{item.texto}</Text>
      </View>
    </View>
  );
}

export default function BeneficiosHorizontais({ itens, largura, altura, alturaCabecalho, titulo, descricao }: Props) {
  const [reduzirMovimento, setReduzirMovimento] = useState(
    () => Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
  const compacto = largura < CORTES.medio;
  // O bento é um quarto ESTADO de decisão, não uma variação do sticky-scroll
  // — os dois critérios de largura não são o mesmo corte, e nunca podem
  // ficar ativos ao mesmo tempo (duas lógicas de posicionamento brigando
  // pelo mesmo trilho). `fixar` passa a excluir explicitamente o bento.
  const bento = largura >= 1100 && !reduzirMovimento;
  const fixar = !bento && largura >= 1100 && altura >= 720 && !reduzirMovimento;
  const larguraCard = fixar ? 420 : Math.min(440, Math.max(260, largura - (compacto ? 96 : 120)));
  // Só o compacto trava altura; no amplo o card cresce com o conteúdo.
  // 300 e não 290 porque o palco do mini-mock subiu de 108 pra 124 (ele
  // cortava três das seis variantes) — sem acompanhar, o card voltava a
  // clipar a última linha do parágrafo.
  const alturaCard = 300;
  const alturaSticky = Math.max(620, altura - alturaCabecalho);
  const [alturaPalco, setAlturaPalco] = useState(alturaSticky * 2.4);
  const palcoRef = useRef<View>(null);
  const stickyRef = useRef<View>(null);
  const viewportRef = useRef<View>(null);
  const trilhoRef = useRef<View>(null);
  const rolagemToqueRef = useRef<ScrollView>(null);
  const [indiceToque, setIndiceToque] = useState(0);
  const [bordasToque, setBordasToque] = useState({ anterior: false, proxima: itens.length > 1 });
  const [bordasFixas, setBordasFixas] = useState({ anterior: false, proxima: itens.length > 1 });
  const intervaloCard = larguraCard + spacing.lg;
  const podeVoltar = indiceToque > 0;
  const podeAvancar = indiceToque < itens.length - 1;

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
      const novasBordas = { anterior: progresso > 0.01, proxima: progresso < 0.99 && percursoHorizontal > 0 };
      setBordasFixas((atuais) => atuais.anterior === novasBordas.anterior && atuais.proxima === novasBordas.proxima ? atuais : novasBordas);
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

  function irParaIndice(indice: number) {
    const proximo = limitar(indice, 0, itens.length - 1);
    rolagemToqueRef.current?.scrollTo({ x: proximo * intervaloCard, animated: !reduzirMovimento });
    setIndiceToque(proximo);
  }

  function aoRolarToque(evento: any) {
    const { contentOffset, contentSize, layoutMeasurement } = evento.nativeEvent;
    const x = contentOffset?.x ?? 0;
    const larguraConteudo = contentSize?.width ?? 0;
    const larguraVisivel = layoutMeasurement?.width ?? 0;
    const indice = limitar(Math.round(x / intervaloCard), 0, itens.length - 1);
    setIndiceToque((atual) => atual === indice ? atual : indice);
    const novasBordas = {
      anterior: x > 4,
      proxima: x + larguraVisivel < larguraConteudo - 4,
    };
    setBordasToque((atuais) => atuais.anterior === novasBordas.anterior && atuais.proxima === novasBordas.proxima ? atuais : novasBordas);
  }

  const cabecalho = (
    <RevealOnScroll variante="titulo" style={styles.intro}>
      <Text role="heading" aria-level={2} style={[styles.tituloSecao, largura < CORTES.medio && styles.tituloSecaoCompacto]}>
        {titulo}
      </Text>
      <Text style={[styles.descricao, largura < CORTES.medio && styles.descricaoCompacta]}>{descricao}</Text>
    </RevealOnScroll>
  );

  if (bento) {
    return (
      <View style={[colunaConteudo, styles.faixa, styles.conteudoLivre]}>
        {cabecalho}
        <View role="list" aria-label="Recursos do Grana." style={styles.gradeBento as any}>
          {itens.map((item) => (
            <CardBento key={item.variante} item={item} />
          ))}
        </View>
      </View>
    );
  }

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
            ref={rolagemToqueRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={intervaloCard}
            onScroll={aoRolarToque}
            scrollEventThrottle={32}
            style={styles.rolagemHorizontal}
            contentContainerStyle={styles.trilhoToque}
            role="list"
            aria-label="Recursos do Grana."
            {...({
              tabIndex: 0,
              onKeyDown: (evento: KeyboardEvent) => {
                if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return;
                evento.preventDefault();
                irParaIndice(indiceToque + (evento.key === 'ArrowRight' ? 1 : -1));
              },
            } as any)}
          >
            {itens.map((item) => (
              <CardBeneficio key={item.variante} item={item} larguraCard={larguraCard} alturaCard={alturaCard} compacto={compacto} />
            ))}
          </ScrollView>
          <FadeBorda lado="esquerda" largura={largura} visivel={bordasToque.anterior && podeVoltar} />
          <FadeBorda lado="direita" largura={largura} visivel={bordasToque.proxima && podeAvancar} />
        </View>
        <View style={styles.controles}>
          <AppPressable
            onPress={() => irParaIndice(indiceToque - 1)}
            disabled={!podeVoltar}
            accessibilityLabel="Ver recurso anterior"
            accessibilityState={{ disabled: !podeVoltar }}
            style={({ hovered }) => [styles.controle, hovered && podeVoltar && styles.controleHover, !podeVoltar && styles.controleDesativado]}
          >
            <Ionicons name="arrow-back" size={18} color={theme.ink} aria-hidden />
          </AppPressable>
          <Text accessibilityLiveRegion="polite" style={styles.progresso}>{indiceToque + 1} de {itens.length}</Text>
          <AppPressable
            onPress={() => irParaIndice(indiceToque + 1)}
            disabled={!podeAvancar}
            accessibilityLabel="Ver próximo recurso"
            accessibilityState={{ disabled: !podeAvancar }}
            style={({ hovered }) => [styles.controle, hovered && podeAvancar && styles.controleHover, !podeAvancar && styles.controleDesativado]}
          >
            <Ionicons name="arrow-forward" size={18} color={theme.ink} aria-hidden />
          </AppPressable>
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
                <CardBeneficio key={item.variante} item={item} larguraCard={larguraCard} alturaCard={alturaCard} compacto={compacto} />
              ))}
            </View>
            <FadeBorda lado="esquerda" largura={largura} visivel={bordasFixas.anterior} />
            <FadeBorda lado="direita" largura={largura} visivel={bordasFixas.proxima} />
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
function FadeBorda({ lado, largura, visivel }: { lado: 'esquerda' | 'direita'; largura: number; visivel: boolean }) {
  /* Fixo em 64px o fade engolia quase toda a "espiadinha" do próximo card
     num celular de 390px de largura (a fresta que sobra depois do card
     principal costuma ter uns 70-90px) — o próximo card sumia dentro do
     degradê em vez de só suavizar a borda dele. Mais estreito no compacto. */
  const largo = largura < CORTES.medio ? 32 : 64;
  return (
    <View
      aria-hidden
      pointerEvents="none"
      style={[styles.fadeBorda, { width: largo, opacity: visivel ? 1 : 0 }, lado === 'esquerda' ? styles.fadeBordaEsquerda : styles.fadeBordaDireita]}
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
  fadeBorda: { position: 'absolute', top: 0, bottom: 0, zIndex: 1 },
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
  controles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginTop: spacing.xl },
  controle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    backgroundColor: theme.paper,
  },
  controleHover: { borderColor: theme.accent2, backgroundColor: theme.hover },
  controleDesativado: { opacity: 0.35 },
  progresso: { minWidth: 64, textAlign: 'center', color: theme.inkSoft, fontSize: type.nota, lineHeight: type.nota * 1.4, fontFamily: fonts.light, fontVariant: ['tabular-nums'] },
  cardPosicao: { flexShrink: 0, minWidth: 0 },
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    ...sombraCard,
  },
  // `flex: 1` faz o card ocupar a altura que o `alignItems: 'stretch'` do
  // trilho já reservou (a do card mais alto) — é o que iguala os cards no
  // amplo sem número mágico de altura.
  cardAmplo: { flex: 1, padding: spacing.xl },
  rotulo: { color: theme.accent2, fontSize: type.micro, lineHeight: type.micro * 1.4, fontFamily: fonts.regular, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: spacing.xs },
  tituloCard: { color: theme.ink, fontSize: type.apoio, lineHeight: type.apoio * 1.3, fontFamily: fonts.regular, marginBottom: spacing.xs },
  tituloCardAmplo: { fontSize: type.corpo, lineHeight: type.corpo * 1.3, marginBottom: spacing.sm },
  textoCard: { color: theme.inkSoft, fontSize: type.legenda, lineHeight: type.legenda * 1.5, fontFamily: fonts.light },
  textoCardAmplo: { fontSize: type.nota, lineHeight: type.nota * 1.5 },
  // `display:'grid'` via `as any` — mesma regra do projeto pra CSS puro sem
  // libs novas. 3 colunas iguais; os cards `'grande'` tomam 2 delas
  // (`gridColumn: 'span 2'` em `celulaBento`). `dense` evita buraco no grid
  // quando um item grande não fecha a linha sozinho.
  gradeBento: {
    width: '100%',
    ...({
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gridAutoFlow: 'dense',
      gap: spacing.lg,
    } as any),
  },
  // Sem largura fixa — ao contrário de `cardPosicao` (carrossel), quem
  // decide a largura da célula é a grade, não o componente.
  celulaBento: { minWidth: 0 },
  // `cardAmplo` já dá `flex:1`; aqui só troca a altura fixa do carrossel por
  // altura livre (mesmo raciocínio do modo touch/sticky amplo) — o bento
  // NUNCA herda `alturaCard = 300`, que existe só pro modo compacto.
  cardBento: { minHeight: 220 },
  cardBentoGrande: {
    backgroundColor: theme.accentDeep,
    borderColor: theme.accent,
    borderRadius: 20,
  },
  rotuloGrande: { color: theme.accent2 },
  tituloCardGrande: { color: theme.ink },
  textoCardGrande: { color: theme.ink, opacity: 0.85 },
});
