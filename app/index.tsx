import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme, spacing, radius, fonts, type } from '@/lib/theme';
import { colunaConteudo, colunaLeitura, useBreakpoint } from '@/lib/breakpoints';
import AppPressable from '@/components/AppPressable';
import BrandLogotype from '@/components/BrandLogotype';
import LandingHeroDemo from '@/components/LandingHeroDemo';
import LaptopMockup from '@/components/LaptopMockup';
import PieChart, { type PieSlice } from '@/components/PieChart';
import { FaqItem } from '@/components/FaqItem';
import RevealOnScroll from '@/components/RevealOnScroll';
import GlowOrb from '@/components/GlowOrb';

/**
 * Página pública em `/` — recebe quem nunca ouviu falar do Grana.: clique de
 * anúncio, link compartilhado, busca no Google. É por isso que ela existe
 * separada da tela de login: `sign-in.tsx` pressupõe que a pessoa já sabe o
 * que é o Grana. e só quer entrar; quem chega aqui de fora não sabe nada
 * disso, e uma tela de e-mail/senha sem contexto não converte ninguém.
 *
 * Só existe na web — no nativo o app sempre abre direto pra dentro (login ou
 * a própria conta já logada), porque quem tem o app instalado já passou
 * dessa etapa. Antes desta tela existir, `/` no nativo já caía em sign-in
 * por não haver rota nenhuma cadastrada pra raiz — o redirect abaixo só
 * torna esse comportamento explícito, sem mudar nada do que já acontecia.
 */
export default function LandingPage() {
  if (Platform.OS !== 'web') {
    return <Redirect href="/sign-in" />;
  }
  return <ConteudoWeb />;
}

/**
 * Botão + microcópia de fricção logo abaixo — repetido três vezes na página
 * de propósito (herói, meio, fechamento). Cada CTA de resposta direta reduz
 * uma objeção diferente que ainda não foi vencida: "quanto tempo leva" no
 * herói, "e agora, depois de ver como funciona" no meio, "por que ainda não
 * cliquei" no fechamento — mas o texto do BOTÃO em si fica igual nos três,
 * de propósito: repetição do mesmo verbo de ação reforça a ação, variar a
 * cada seção só confunde o que a pessoa está prestes a fazer.
 *
 * O brilho por trás do botão (boxShadow colorido, não borda) é deliberado: o
 * CTA precisa ser a coisa mais "clicável" da tela em qualquer seção onde
 * aparece — se um card de recurso e o botão de ação têm a mesma presença
 * visual, a hierarquia não está fazendo o trabalho dela.
 */
function BotaoCTA({ microcopy, estiloExtra }: { microcopy: string; estiloExtra?: object }) {
  const router = useRouter();
  return (
    <View>
      <AppPressable
        style={({ hovered }) => [styles.ctaPrimario, estiloExtra, hovered && styles.ctaPrimarioHover]}
        onPress={() => router.push('/sign-up')}
      >
        <Text style={styles.ctaPrimarioTexto}>Criar conta grátis</Text>
        <Ionicons name="arrow-forward" size={17} color={theme.paper} aria-hidden />
      </AppPressable>
      <Text style={styles.ctaMicrocopy}>{microcopy}</Text>
    </View>
  );
}

/**
 * Altura de uma "dobra" — cada seção da página ocupa uma tela cheia na
 * proporção 16:9 (a mesma de 1920×1080), então rolar avança de uma cena pra
 * próxima em vez de deslizar por um texto contínuo.
 *
 * Nunca passa da altura da janela. Numa tela que já é 16:9 (1920×1080,
 * 2560×1440) os dois valores coincidem e a dobra é a tela inteira, que é o
 * caso alvo. Numa janela 16:10 (1440×900) a proporção manda e sobra uma
 * faixa — inerente a pedir 16:9 numa janela que não é. Já num ultrawide
 * 2560×1080 a conta crua daria 1440px, mais alto que o monitor, e a dobra
 * deixaria de caber numa tela — que é exatamente o que ela existe pra
 * garantir; aí quem manda é o que cabe.
 *
 * `null` no compacto: num celular de 390px a proporção 16:9 daria 219px de
 * altura por seção, menos que o próprio título ocupa. Ali a altura continua
 * sendo a do conteúdo, como sempre foi.
 */
function useAlturaDobra(): number | null {
  const { largura, altura, ehCompacto } = useBreakpoint();
  if (ehCompacto) return null;
  return Math.min(Math.round((largura * 9) / 16), altura);
}

/**
 * Uma seção do tamanho de uma tela, com o conteúdo centralizado nela.
 * `levantada` alterna o fundo entre o `paper` base e o `paperRaised` que todo
 * card já usa, igual zebra de tabela — é o que dá ritmo a uma página inteira
 * na mesma cor sem inventar cor nova. `colunaConteudo` continua limitando o
 * CONTEÚDO; é só o FUNDO que vai de ponta a ponta da janela.
 *
 * `minHeight`, não `height`: uma seção que precise de mais espaço que a dobra
 * (o FAQ com todas as respostas abertas, por exemplo) cresce em vez de cortar
 * o próprio conteúdo.
 */
function Dobra({ levantada, children }: { levantada?: boolean; children: React.ReactNode }) {
  const alturaDobra = useAlturaDobra();
  return (
    <View
      style={[
        levantada && styles.bandaLevantada,
        alturaDobra !== null && { minHeight: alturaDobra, justifyContent: 'center' },
      ]}
    >
      <View style={[colunaConteudo, styles.faixa]}>{children}</View>
    </View>
  );
}

const CENAS_DOR = [
  { icone: 'calendar-outline' as const, texto: 'Sexta ao meio-dia, e você não sabe se sobra dinheiro pra sair à noite.' },
  { icone: 'card-outline' as const, texto: 'A fatura chega com um valor que você jura não lembrar de ter gasto.' },
  { icone: 'grid-outline' as const, texto: 'Baixou uma planilha pra controlar tudo. Durou quatro dias.' },
];

/* Os compromissos futuros que a própria copy desta seção promete ("junta
   parcelas do cartão e contas fixas"). Antes ela mostrava o card de Livre
   para Gastar, que agora é o capítulo 4 do herói logo acima — a mesma peça
   duas vezes na mesma página, e a promessa da linha do tempo sem nenhuma
   prova visual. */
const COMPROMISSOS = [
  { dia: '05', nome: 'Aluguel', tipo: 'Conta fixa', valor: 'R$ 1.450,00' },
  { dia: '12', nome: 'Fatura do cartão', tipo: 'Cartão', valor: 'R$ 830,20' },
  { dia: '18', nome: 'Celular 3/12', tipo: 'Parcela', valor: 'R$ 249,90' },
  { dia: '25', nome: 'Internet', tipo: 'Conta fixa', valor: 'R$ 99,90' },
];

/**
 * O título de uma seção. Numa dobra de tela cheia (16:9) o corpo de 28pt que
 * servia numa seção de altura livre vira um bloquinho perdido no meio de
 * 1080px — a escala precisa acompanhar o tamanho do palco. No compacto, onde
 * a dobra não existe, continua sendo o mesmo de antes.
 */
function TituloSecao({ children }: { children: React.ReactNode }) {
  const { ehCompacto } = useBreakpoint();
  return (
    <Text role="heading" aria-level={2} style={[styles.secaoTitulo, !ehCompacto && styles.secaoTituloGrande]}>
      {children}
    </Text>
  );
}

/* ───────── Telas do notebook do herói-storytelling ─────────
   Capítulo 1 reaproveita LandingHeroDemo (já existia); capítulo 4 reaproveita
   o texto do card "Livre para Gastar" que também aparece em "Inteligência
   financeira" mais abaixo — mesmo valor de exemplo, dois lugares diferentes
   da página. Capítulos 2 e 3 são novos, nos mesmos tokens de cor/tipografia
   do resto do app. */

/* Lançamentos que JÁ estavam na conta antes da fala — existem pra que a tela
   do notebook pareça um app em uso, não um card único flutuando no vazio. As
   cores são as reais das categorias em lib/heuristics.ts. */
const LANCAMENTOS_ANTERIORES = [
  { nome: 'Uber', categoria: 'Transporte', valor: 'R$ 18,40', cor: '#4f9bab' },
  { nome: 'Farmácia', categoria: 'Saúde', valor: 'R$ 62,00', cor: '#5aa79b' },
  { nome: 'Netflix', categoria: 'Lazer', valor: 'R$ 44,90', cor: '#ab8bc2' },
];

function TelaVoz() {
  return (
    <View style={styles.mockTelaApp}>
      <Text style={styles.mockTelaTitulo}>Hoje</Text>
      <LandingHeroDemo />
      <View style={styles.mockListaAnteriores}>
        {LANCAMENTOS_ANTERIORES.map((l) => (
          <View key={l.nome} style={styles.mockLinhaAnterior}>
            <View style={[styles.mockPontoCategoria, { backgroundColor: l.cor }]} />
            <View style={styles.mockLinhaTextos}>
              <Text style={styles.mockLinhaNome}>{l.nome}</Text>
              <Text style={styles.mockLinhaCategoria}>{l.categoria}</Text>
            </View>
            <Text style={styles.mockLinhaValor}>{l.valor}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TelaWhatsapp() {
  return (
    <View style={styles.mockChat}>
      <View style={styles.mockBolhaEnviada}>
        <Text style={styles.mockTextoEnviado}>mercado 34,65</Text>
      </View>
      <View style={styles.mockBolhaRecebida}>
        <Ionicons name="checkmark-circle" size={14} color={theme.accent2} aria-hidden />
        <Text style={styles.mockTextoRecebido}>Lançamento registrado: Mercado — R$ 34,65</Text>
      </View>
    </View>
  );
}

const ITENS_NOTA = [
  { nome: 'Arroz 5kg', valor: 'R$ 24,90' },
  { nome: 'Detergente', valor: 'R$ 3,20' },
  { nome: 'Frango kg', valor: 'R$ 18,50' },
];

function TelaNota() {
  return (
    <View>
      <View style={styles.mockNotaCabecalho}>
        <Ionicons name="qr-code" size={20} color={theme.accent2} aria-hidden />
        <Text style={styles.mockNotaRotulo}>Nota reconhecida</Text>
      </View>
      <View style={styles.mockNotaLista}>
        {ITENS_NOTA.map((item) => (
          <View key={item.nome} style={styles.mockNotaLinha}>
            <Text style={styles.mockNotaNome}>{item.nome}</Text>
            <Text style={styles.mockNotaValor}>{item.valor}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* Cores reais das categorias em CATEGORY_KEYWORDS (lib/heuristics.ts) — a
   rosca mostra a paleta que a pessoa vai ver na conta dela, não uma
   decorativa. */
const FATIAS_CATEGORIA: PieSlice[] = [
  { name: 'Alimentação', color: '#bb6b60', value: 642 },
  { name: 'Transporte', color: '#4f9bab', value: 318 },
  { name: 'Casa', color: '#93aa7e', value: 274 },
  { name: 'Lazer', color: '#ab8bc2', value: 186 },
];

function TelaSafeToSpend() {
  return (
    <View style={styles.mockPainel}>
      <View style={styles.mockPainelTexto}>
        <Text style={styles.mockRotulo}>Livre para gastar hoje</Text>
        <Text style={styles.mockValor}>R$ 48,00</Text>
        <Text style={styles.mockLegenda}>até o fim do mês, considerando contas e parcelas já agendadas</Text>
        <View style={styles.mockLegendaCategorias}>
          {FATIAS_CATEGORIA.map((f) => (
            <View key={f.name} style={styles.mockLegendaLinha}>
              <View style={[styles.mockLegendaPonto, { backgroundColor: f.color }]} />
              <Text style={styles.mockLegendaNome}>{f.name}</Text>
            </View>
          ))}
        </View>
      </View>
      {/* O gráfico de rosca REAL da tela de Gráficos, com as cores reais das
          categorias — não um desenho de gráfico feito pra landing page. */}
      <PieChart data={FATIAS_CATEGORIA} size={188} />
    </View>
  );
}

type Capitulo = { titulo: string; subtitulo: string; tela: React.ReactNode };

/**
 * O herói da página — e a própria demonstração do produto, ao mesmo tempo.
 * Em tela larga, duas colunas ficam grudadas (`position: sticky`) enquanto
 * quatro zonas de gatilho, empilhadas atrás, avançam o capítulo ativo
 * conforme a pessoa rola — mesma técnica de `IntersectionObserver` que o
 * sumário de `LegalDocScreen.tsx` usa pra saber qual seção está visível,
 * aplicada aqui a marcadores invisíveis em vez de seções de texto de verdade.
 *
 * O capítulo 1 (voz) já é, sozinho, a primeira dobra — visível sem rolar
 * nada. Rolar revela os outros três como uma sequência de "hero slides": o
 * título principal muda a cada capítulo, não só uma legenda pequena ao lado.
 */
function HeroStorytelling({ ehCompacto, alturaCabecalho }: { ehCompacto: boolean; alturaCabecalho: number }) {
  const alturaDobra = useAlturaDobra();
  const [reduzirMovimento, setReduzirMovimento] = useState(false);
  const [capituloExibido, setCapituloExibido] = useState(0);
  const capituloAtivoRef = useRef(0);
  const fade = useRef(new Animated.Value(1)).current;
  const gatilhoRefs = useRef<Record<number, View | null>>({});

  useEffect(() => {
    let ativo = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => ativo && setReduzirMovimento(v))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  const CAPITULOS: Capitulo[] = [
    {
      titulo: 'Cadê meu dinheiro?',
      subtitulo:
        'Fala com o Grana. como fala com um amigo — ele entende o valor, o nome e a categoria sozinho.',
      tela: <TelaVoz />,
    },
    {
      titulo: 'Manda um áudio. Pronto.',
      subtitulo:
        'Sem abrir o app: escreve ou fala pro número do Grana. no WhatsApp, e o lançamento aparece organizado.',
      tela: <TelaWhatsapp />,
    },
    {
      titulo: 'Aponta a câmera. Acabou.',
      subtitulo: 'O QR Code da nota vira lançamento — cada item, já categorizado, sem digitar nada.',
      tela: <TelaNota />,
    },
    {
      titulo: 'Sabe quanto sobra, sem calcular.',
      subtitulo:
        'Depois que o lançamento existe, o Grana. soma tudo e avisa quanto você tem livre pra gastar hoje.',
      tela: <TelaSafeToSpend />,
    },
  ];

  function irParaCapitulo(indice: number) {
    if (indice === capituloAtivoRef.current) return;
    capituloAtivoRef.current = indice;
    if (reduzirMovimento) {
      setCapituloExibido(indice);
      return;
    }
    Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
      /* Interrompida por uma troca mais nova: quem interrompeu já começou o
         próprio fade e vai concluir a troca — seguir aqui exibiria o capítulo
         VELHO por cima do novo. E o que se exibe é sempre o ref, nunca o
         `indice` capturado no closure: com dois gatilhos disparando juntos
         (rolagem rápida, ou salto direto no scrollTop), o callback de uma
         chamada antiga chegava depois e voltava a tela pro capítulo anterior. */
      if (!finished) return;
      setCapituloExibido(capituloAtivoRef.current);
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  }

  useEffect(() => {
    if (ehCompacto || Platform.OS !== 'web' || typeof IntersectionObserver === 'undefined') return;

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;
          const indice = Number((entrada.target as HTMLElement).getAttribute('data-capitulo'));
          if (!Number.isNaN(indice)) irParaCapitulo(indice);
        }
      },
      // Faixa fina no centro vertical da tela — o gatilho que estiver
      // cruzando essa faixa é o capítulo "atual", como um leitor de slide.
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
    );

    for (let i = 0; i < CAPITULOS.length; i++) {
      const no = gatilhoRefs.current[i] as unknown as HTMLElement | null;
      if (no) observador.observe(no);
    }
    return () => observador.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehCompacto, reduzirMovimento]);

  if (ehCompacto) {
    return (
      <View style={styles.heroTrilhaCompacta}>
        {CAPITULOS.map((c, i) => (
          <View key={c.titulo} style={styles.heroBlocoCompacto}>
            <Text style={styles.eyebrow}>Acesso antecipado</Text>
            <Text
              role="heading"
              aria-level={i === 0 ? 1 : 2}
              style={[styles.headline, styles.headlineCompacto]}
            >
              {c.titulo}
            </Text>
            <Text style={styles.subheadline}>{c.subtitulo}</Text>
            <View style={styles.heroTelaCompacta}>
              <LaptopMockup moldura={false}>{c.tela}</LaptopMockup>
            </View>
            {i === 0 && <BotaoCTA microcopy="Leva 30 segundos. Sem cartão de crédito." />}
          </View>
        ))}
      </View>
    );
  }

  /* Cada capítulo é uma dobra inteira. O bloco grudado desconta a altura do
     cabeçalho pra que a PRIMEIRA dobra — cabeçalho + capítulo 1, o que a
     pessoa vê sem rolar nada — feche exatamente em 16:9, e não transborde
     pro começo do capítulo 2. */
  const alturaCapitulo = alturaDobra ?? 640;
  const alturaSticky = Math.max(360, alturaCapitulo - alturaCabecalho);
  const capitulo = CAPITULOS[capituloExibido];

  return (
    <View style={[styles.heroTrilhaGatilhos, { height: alturaCapitulo * CAPITULOS.length }]}>
      <View style={[styles.heroLinhaSticky, { height: alturaSticky }]}>
        <View style={styles.heroColunaTexto}>
          <Text style={styles.eyebrow}>Acesso antecipado</Text>
          <Animated.View style={{ opacity: fade }}>
            <Text role="heading" aria-level={1} style={styles.headline}>
              {capitulo.titulo}
            </Text>
            <Text style={styles.subheadline}>{capitulo.subtitulo}</Text>
          </Animated.View>
          <BotaoCTA microcopy="Leva 30 segundos. Sem cartão de crédito." />
          <View style={styles.heroMarcadores} aria-hidden>
            {CAPITULOS.map((_, i) => (
              <View key={i} style={[styles.heroMarcador, i === capituloExibido && styles.heroMarcadorAtivo]} />
            ))}
          </View>
        </View>

        <Animated.View style={[styles.heroColunaNotebook, { opacity: fade }]}>
          {/* Metade da altura grudada: o notebook cresce junto com a dobra em
              vez de virar um selinho no meio de uma tela de 1080px. */}
          <LaptopMockup alturaTela={Math.round(alturaSticky * 0.5)}>{capitulo.tela}</LaptopMockup>
        </Animated.View>
      </View>

      {CAPITULOS.map((_, i) => (
        <View
          key={i}
          ref={(no) => {
            gatilhoRefs.current[i] = no;
          }}
          // @ts-expect-error — atributo web puro, só pra o IntersectionObserver identificar o capítulo.
          dataSet={{ capitulo: i }}
          style={[styles.heroGatilho, { top: i * alturaCapitulo, height: alturaCapitulo }]}
        />
      ))}
    </View>
  );
}

function ConteudoWeb() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { classe, ehCompacto } = useBreakpoint();
  const largura2 = ehCompacto ? '100%' : classe === 'medio' ? '48%' : '31%';
  const scrollY = useRef(new Animated.Value(0)).current;
  const alturaDobra = useAlturaDobra();
  /* Medido em vez de constante: o cabeçalho muda de altura com o `insets.top`
     e com a escala tipográfica da web, e o herói precisa descontar o valor
     REAL pra primeira dobra fechar em 16:9 exatos. */
  const [alturaCabecalho, setAlturaCabecalho] = useState(0);

  const FEATURES = [
    {
      icone: 'mic-outline' as const,
      titulo: 'Voz, dentro do app',
      texto:
        'Toque no microfone e fale como fala com alguém: "gastei 30 no mercado". O Grana. entende valor, nome e categoria sozinho.',
    },
    {
      icone: 'logo-whatsapp' as const,
      titulo: 'Texto ou áudio no WhatsApp',
      texto: 'Manda uma mensagem — escrita ou falada — pro número do Grana. e o lançamento aparece no app. Sem abrir nada.',
    },
    {
      icone: 'qr-code-outline' as const,
      titulo: 'Foto da nota fiscal',
      texto: 'Aponta a câmera pro QR Code da nota (NFC-e) e cada item da compra vira lançamento, já categorizado.',
    },
  ];

  const SEGURANCA = [
    { icone: 'lock-closed-outline' as const, texto: 'Cada conta só enxerga os próprios dados — reforçado no banco, não só na tela.' },
    { icone: 'finger-print-outline' as const, texto: 'Bloqueio por biometria ou senha do aparelho, se você ativar.' },
    { icone: 'eye-off-outline' as const, texto: 'Modo privacidade oculta os valores da tela com um toque.' },
    { icone: 'shield-checkmark-outline' as const, texto: 'Sua senha é conferida contra vazamentos conhecidos no cadastro.' },
    { icone: 'ban-outline' as const, texto: 'O Grana. não movimenta dinheiro de verdade — é registro, não pagamento.' },
    { icone: 'megaphone-outline' as const, texto: 'Sem anúncio, sem venda de dado. O que você registra é seu.' },
  ];

  return (
    <ScrollView
      style={styles.pagina}
      contentContainerStyle={{ paddingBottom: insets.bottom }}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      })}
      scrollEventThrottle={16}
    >
      {/* ───────── Cabeçalho ───────── */}
      <View
        style={[colunaConteudo, styles.faixa]}
        onLayout={(e) => setAlturaCabecalho(e.nativeEvent.layout.height)}
      >
        <View style={[styles.cabecalho, { paddingTop: insets.top + spacing.lg }]}>
          <BrandLogotype width={104} />
          <AppPressable onPress={() => router.push('/sign-in')} hitSlop={12}>
            <Text style={styles.entrarTexto}>Entrar</Text>
          </AppPressable>
        </View>
      </View>

      {/* ───────── Hero-storytelling — o momento de assinatura da página ───────── */}
      <View style={styles.palcoHero}>
        <View style={styles.camadaBrilho}>
          <GlowOrb cor="rgba(31,169,141,0.35)" tamanho={720} top={-260} left={-160} scrollY={scrollY} fatorParallax={0.12} />
          <GlowOrb cor="rgba(174,255,227,0.16)" tamanho={520} top={-80} right={-120} scrollY={scrollY} fatorParallax={0.2} />
        </View>
        <View style={[colunaConteudo, styles.faixa]}>
          <HeroStorytelling ehCompacto={ehCompacto} alturaCabecalho={alturaCabecalho} />
        </View>
      </View>

      {/* ───────── Reconhece isso? (dor, antes da solução) ───────── */}
      <Dobra>
        <View style={styles.secao}>
          <RevealOnScroll>
            <Text style={styles.secaoEyebrow}>Reconhece isso?</Text>
            <TituloSecao>Não é falta de disciplina. É que anotar dá trabalho.</TituloSecao>
          </RevealOnScroll>

          <View style={styles.grid}>
            {CENAS_DOR.map((c, i) => (
              <RevealOnScroll key={c.texto} atraso={i * 90} style={{ flexBasis: largura2 }}>
                <View style={styles.cardCena}>
                  <Ionicons name={c.icone} size={22} color={theme.down} aria-hidden />
                  <Text style={styles.textoCena}>{c.texto}</Text>
                </View>
              </RevealOnScroll>
            ))}
          </View>

          <RevealOnScroll atraso={280}>
            <Text style={styles.pontePergunta}>O Grana. não pede mais disciplina. Pede só que você fale.</Text>
          </RevealOnScroll>
        </View>
      </Dobra>

      {/* ───────── Como entra o lançamento ───────── */}
      <Dobra levantada>
        <View style={styles.secao}>
          <RevealOnScroll>
            <Text style={styles.secaoEyebrow}>A parte que você não vai adiar</Text>
            <TituloSecao>O único esforço é lembrar que o gasto existe</TituloSecao>
          </RevealOnScroll>

          <View style={styles.grid}>
            {FEATURES.map((f, i) => (
              <RevealOnScroll key={f.titulo} atraso={i * 90} style={{ flexBasis: largura2 }}>
                <AppPressable focusable={false} scaleOnPress={false} style={({ hovered }) => [styles.cardFeature, hovered && styles.cardComHover]}>
                  <View style={styles.featureIconeCirculo} aria-hidden>
                    <Ionicons name={f.icone} size={18} color={theme.accent2} />
                  </View>
                  <Text style={styles.featureTitulo}>{f.titulo}</Text>
                  <Text style={styles.featureTexto}>{f.texto}</Text>
                </AppPressable>
              </RevealOnScroll>
            ))}
          </View>

          <RevealOnScroll>
            <View style={styles.ctaMeio}>
              <Text style={styles.ctaMeioTitulo}>Pronto pra parar de perder a conta?</Text>
              <BotaoCTA microcopy="Grátis enquanto o Grana. está em acesso antecipado." />
            </View>
          </RevealOnScroll>
        </View>
      </Dobra>

      {/* ───────── Inteligência financeira ───────── */}
      <Dobra>
        <RevealOnScroll>
          <View style={[styles.secao, styles.secaoComCartao]}>
            <View style={styles.colunaTextoSecao}>
              <Text style={styles.secaoEyebrow}>Depois que o lançamento existe</Text>
              <TituloSecao>Ele não só guarda. Avisa antes de você se apertar.</TituloSecao>
              <Text style={styles.secaoTexto}>
                Não é só uma lista de gastos. A linha do tempo de compromissos futuros junta parcelas do cartão e
                contas fixas num lugar só — e é dela que sai o{' '}
                <Text style={styles.destaqueInline}>Livre para Gastar</Text> do dia. Nada pega de surpresa lá na
                frente.
              </Text>
            </View>

            <View style={styles.cardLinhaTempo}>
              <Text style={styles.mockRotulo}>Próximos compromissos</Text>
              {COMPROMISSOS.map((c, i) => (
                <View key={c.nome} style={styles.compromissoLinha}>
                  <View style={styles.compromissoTrilho}>
                    <View style={styles.compromissoPonto} />
                    {i < COMPROMISSOS.length - 1 && <View style={styles.compromissoFio} />}
                  </View>
                  <Text style={styles.compromissoDia}>{c.dia}</Text>
                  <View style={styles.compromissoTextos}>
                    <Text style={styles.compromissoNome}>{c.nome}</Text>
                    <Text style={styles.compromissoTipo}>{c.tipo}</Text>
                  </View>
                  <Text style={styles.compromissoValor}>{c.valor}</Text>
                </View>
              ))}
            </View>
          </View>
        </RevealOnScroll>
      </Dobra>

      {/* ───────── Segurança e confiança ───────── */}
      <Dobra levantada>
        <View style={styles.secao}>
          <RevealOnScroll>
            <Text style={styles.secaoEyebrow}>A pergunta que todo mundo faz</Text>
            <TituloSecao>"Tá, mas é seguro dar meus gastos pra um app?"</TituloSecao>
            <Text style={styles.secaoTexto}>
              Faz sentido perguntar. Aqui está exatamente o que a gente faz — e o que a gente nunca faz.
            </Text>
          </RevealOnScroll>

          <View style={styles.grid}>
            {SEGURANCA.map((s, i) => (
              <RevealOnScroll key={s.texto} atraso={i * 70} style={{ flexBasis: largura2 }}>
                <AppPressable focusable={false} scaleOnPress={false} style={({ hovered }) => [styles.cardSeguranca, hovered && styles.cardComHover]}>
                  <Ionicons name={s.icone} size={18} color={theme.inkSoft} aria-hidden />
                  <Text style={styles.segurancaTexto}>{s.texto}</Text>
                </AppPressable>
              </RevealOnScroll>
            ))}
          </View>
        </View>
      </Dobra>

      {/* ───────── FAQ ───────── */}
      <Dobra>
        <RevealOnScroll>
        <View style={[styles.secao, colunaLeitura]}>
          <Text style={styles.secaoEyebrow}>Perguntas diretas</Text>
          <TituloSecao>Sem letra miúda</TituloSecao>

          <View style={styles.faqLista}>
            <FaqItem
              pergunta="O Grana. puxa meu extrato do banco sozinho?"
              resposta="Não. O Grana. não se conecta ao seu banco — você registra por voz, por texto, pelo WhatsApp ou apontando a câmera pra nota, e ele organiza. É mais rápido de registrar do que de conectar uma conta bancária, e você nunca compartilha senha de banco com ninguém."
            />
            <FaqItem
              pergunta="O Grana. movimenta meu dinheiro?"
              resposta="Não. O Grana. é um registro — não é uma instituição financeira, não processa pagamento nenhum. Ele mostra pra onde seu dinheiro foi, com base no que você mesmo conta pra ele."
            />
            <FaqItem
              pergunta="É seguro?"
              resposta="Cada conta só acessa os próprios dados, reforçado no banco de dados (não só na tela). A sessão fica criptografada no aparelho, e telas com valor bloqueiam print. Detalhes completos na Política de Privacidade."
            />
            <FaqItem
              pergunta="Preciso instalar alguma coisa?"
              resposta="Não pra começar — o Grana. roda no navegador, neste mesmo endereço. Uma versão para Android e iOS está a caminho."
            />
            <FaqItem
              pergunta="É pago?"
              resposta="O Grana. está em fase de acesso antecipado — criar conta é livre agora. Um plano pago está a caminho; quem já usa é avisado antes de qualquer cobrança começar."
            />
          </View>
        </View>
        </RevealOnScroll>
      </Dobra>

      {/* ───────── CTA final ───────── */}
      <View style={[styles.palcoCtaFinal, alturaDobra !== null && { minHeight: alturaDobra, justifyContent: 'center' }]}>
        <GlowOrb cor="rgba(31,169,141,0.22)" tamanho={620} top={-200} left="50%" scrollY={scrollY} fatorParallax={0.08} />
        <RevealOnScroll>
          <View style={[colunaConteudo, styles.faixa]}>
            <View style={[styles.ctaFinal, colunaLeitura]}>
              <Text role="heading" aria-level={2} style={styles.ctaFinalTitulo}>Você vai continuar se perguntando "cadê meu dinheiro" até quando?</Text>
              <BotaoCTA microcopy="Grátis enquanto o Grana. está em acesso antecipado." estiloExtra={styles.ctaFinalBotao} />
            </View>
          </View>
        </RevealOnScroll>
      </View>

      {/* ───────── Rodapé ───────── */}
      <View style={[colunaConteudo, styles.faixa]}>
        <View style={styles.rodape}>
          <BrandLogotype width={72} />
          <View style={styles.rodapeLinks}>
            <AppPressable onPress={() => router.push('/termos')} hitSlop={8}>
              <Text style={styles.rodapeLink}>Termos de Uso</Text>
            </AppPressable>
            <AppPressable onPress={() => router.push('/privacidade')} hitSlop={8}>
              <Text style={styles.rodapeLink}>Privacidade</Text>
            </AppPressable>
            <AppPressable onPress={() => router.push('/exclusao-de-dados')} hitSlop={8}>
              <Text style={styles.rodapeLink}>Excluir dados</Text>
            </AppPressable>
          </View>
          {/* Sem e-mail solto aqui de propósito — esta é a página que mais
              recebe clique frio de anúncio/busca, o pior lugar pra deixar um
              endereço pessoal exposto a bot de spam. O contato exigido pela
              LGPD já está um clique de distância, na Política de
              Privacidade (ver lib/legal-content.ts). */}
        </View>
      </View>
    </ScrollView>
  );
}

/* Sombra de verdade (boxShadow), não só borda — `as any` porque `boxShadow`
   não existe no tipo ViewStyle do React Native, só no CSS que o
   react-native-web gera. Esta página só renderiza na web (ver o redirect no
   topo do arquivo), então não há caminho nativo perdendo o efeito. */
const sombraCard = { boxShadow: '0 16px 40px -12px rgba(0,0,0,0.5)' } as any;

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: theme.paper },
  faixa: { paddingHorizontal: spacing.xl },
  bandaLevantada: { backgroundColor: theme.paperRaised },

  cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: spacing.lg },
  entrarTexto: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.light },

  palcoHero: { position: 'relative' },
  /* O recorte dos GlowOrb vive nesta camada, não no `palcoHero` — sem isso o
     brilho borrado vazaria por baixo das seções seguintes. E precisa ser uma
     camada separada porque `overflow: hidden` em QUALQUER ancestral mata o
     `position: sticky` dos descendentes: o navegador passa a considerar esse
     ancestral o "scrollport" da grudagem, e como ele não rola, nada gruda.
     Foi exatamente o que aconteceu com o herói-storytelling — o bloco de
     texto e o notebook rolavam pra fora da tela enquanto os capítulos
     avançavam, sem erro nenhum no console. */
  camadaBrilho: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  palcoCtaFinal: { position: 'relative', overflow: 'hidden' },

  eyebrow: { color: theme.accent2, fontSize: type.legenda, letterSpacing: 1, fontFamily: fonts.regular, marginBottom: spacing.md, textTransform: 'uppercase' },
  // Escala bem acima do resto da tipografia do app de propósito — esta é a
  // única frase que precisa ser lida antes de qualquer outra coisa na
  // página, e o tamanho tem que dizer isso antes mesmo do conteúdo.
  headline: { color: theme.ink, fontSize: 80, lineHeight: 80, letterSpacing: -2, fontFamily: fonts.regular, marginBottom: spacing.lg },
  headlineCompacto: { fontSize: 44, lineHeight: 46, letterSpacing: -1 },
  subheadline: { color: theme.inkSoft, fontSize: type.destaque, lineHeight: type.destaque * 1.5, fontFamily: fonts.light, marginBottom: spacing.xl, maxWidth: 520 },

  ctaPrimario: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: theme.accent,
    borderRadius: radius.pill,
    paddingVertical: 16,
    paddingHorizontal: spacing.xl + spacing.xs,
    ...({ boxShadow: '0 10px 32px -8px rgba(31,169,141,0.6)', transitionProperty: 'box-shadow, transform', transitionDuration: '180ms' } as any),
  },
  ctaPrimarioHover: {
    ...({ boxShadow: '0 14px 40px -6px rgba(31,169,141,0.8)', transform: [{ translateY: -2 }] } as any),
  },
  ctaPrimarioTexto: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
  // Fica sob TODO botão de CTA — reduz a maior fricção não dita ("quanto
  // tempo vou perder", "vão me cobrar") no exato instante em que a pessoa
  // está decidindo clicar, em vez de deixar a resposta só no FAQ lá embaixo.
  ctaMicrocopy: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, marginTop: spacing.sm },

  cardCena: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paperRaised,
  },
  textoCena: { color: theme.inkSoft, fontSize: type.corpo, lineHeight: 23, fontFamily: fonts.light },
  // "down" (a mesma cor de saída/gasto usada no resto do app) marca a dor;
  // a ponte de volta pra solução já usa o accent2 da marca — a paleta muda
  // de tom no exato lugar onde a copy muda de tom.
  pontePergunta: { color: theme.accent2, fontSize: type.destaque, fontFamily: fonts.regular },

  ctaMeio: {
    marginTop: spacing.xxl,
    alignItems: 'center',
    paddingTop: spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: theme.ruleStrong,
  },
  ctaMeioTitulo: { color: theme.ink, fontSize: type.destaque, fontFamily: fonts.regular, marginBottom: spacing.lg, textAlign: 'center' },

  secao: { paddingVertical: spacing.xxl },
  secaoComCartao: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxl, flexWrap: 'wrap' },
  secaoEyebrow: { color: theme.accent2, fontSize: type.legenda, letterSpacing: 1, fontFamily: fonts.regular, textTransform: 'uppercase', marginBottom: spacing.xs },
  secaoTitulo: { color: theme.ink, fontSize: type.cabecalho + 4, fontFamily: fonts.regular, marginBottom: spacing.lg, maxWidth: 640 },
  secaoTituloGrande: { fontSize: 50, lineHeight: 54, letterSpacing: -1.2, maxWidth: 900, marginBottom: spacing.xl },
  secaoTexto: { color: theme.inkSoft, fontSize: type.destaque, lineHeight: type.destaque * 1.5, fontFamily: fonts.light, maxWidth: 560 },
  colunaTextoSecao: { flex: 1, minWidth: 320, maxWidth: 620 },

  cardLinhaTempo: {
    flex: 1,
    minWidth: 320,
    maxWidth: 620,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    padding: spacing.xl,
    ...sombraCard,
  },
  compromissoLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  /* O trilho é desenhado por linha, não como uma barra única atrás da lista:
     assim o fio nasce e morre junto com os pontos e nunca sobra abaixo do
     último item, que é onde uma barra de altura fixa sempre erra. */
  compromissoTrilho: { width: 9, alignItems: 'center', alignSelf: 'stretch' },
  compromissoPonto: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: theme.accent2, backgroundColor: theme.paperRaised },
  compromissoFio: { flex: 1, width: 1, backgroundColor: theme.rule, marginTop: 2 },
  compromissoDia: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.regular, fontVariant: ['tabular-nums'], width: 22 },
  compromissoTextos: { flex: 1 },
  compromissoNome: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
  compromissoTipo: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, marginTop: 1 },
  compromissoValor: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  destaqueInline: { color: theme.accent2, fontFamily: fonts.regular },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.sm },

  cardFeature: {
    backgroundColor: theme.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: spacing.lg,
    ...sombraCard,
  },
  // Aplica-se tanto ao card de recurso quanto ao de segurança — nenhum dos
  // dois leva a lugar nenhum (não são clicáveis), então o "levantar" no
  // hover é só presença ambiente: sem cursor de mão, sem virar alvo de tab.
  // Ver AppPressable com focusable={false}/scaleOnPress={false} onde é usado.
  cardComHover: {
    ...({ boxShadow: '0 24px 48px -16px rgba(0,0,0,0.6)', transform: [{ translateY: -4 }], cursor: 'default' } as any),
  },
  featureIconeCirculo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  featureTitulo: { color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular, marginBottom: spacing.xs },
  featureTexto: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: 20, fontFamily: fonts.light },

  mockRotulo: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, marginBottom: spacing.xs },
  mockValor: { color: theme.up, fontSize: type.valor + 6, fontFamily: fonts.regular, marginBottom: spacing.xs, fontVariant: ['tabular-nums'] },
  mockLegenda: { color: theme.inkSoft, fontSize: type.legenda, lineHeight: 17, fontFamily: fonts.light },

  cardSeguranca: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  segurancaTexto: { flex: 1, color: theme.inkSoft, fontSize: type.apoio, lineHeight: 20, fontFamily: fonts.light },

  faqLista: { marginTop: spacing.sm },

  ctaFinal: { alignSelf: 'center', alignItems: 'center', paddingVertical: spacing.xxl * 1.5, gap: spacing.xl },
  ctaFinalTitulo: { color: theme.ink, fontSize: type.destaque + 4, lineHeight: (type.destaque + 4) * 1.3, fontFamily: fonts.regular, textAlign: 'center' },
  ctaFinalBotao: { alignSelf: 'center' },

  rodape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingVertical: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: theme.rule,
  },
  rodapeLinks: { flexDirection: 'row', gap: spacing.lg },
  rodapeLink: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },

  /* ───────── Herói-storytelling ───────── */
  heroTrilhaGatilhos: { position: 'relative' },
  heroLinhaSticky: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xxl,
    ...({ position: 'sticky', top: 0 } as any),
  },
  /* Somados (mais o gap) ocupam quase toda a coluna de conteúdo — 1400px
     úteis tanto num monitor de 1440 quanto num de 1920, porque
     `colunaConteudo` limita os dois no mesmo teto. Deixar sobra aqui abria
     um vão morto no meio da dobra, e o notebook, que é a prova visual do
     produto, ficava pequeno demais pra ancorar uma tela inteira. */
  heroColunaTexto: { flex: 1, maxWidth: 540 },
  heroColunaNotebook: { flex: 1, minWidth: 360, maxWidth: 780 },
  heroGatilho: { position: 'absolute', left: 0, right: 0 },
  heroMarcadores: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  heroMarcador: {
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.rule,
    ...({ transitionProperty: 'width, background-color', transitionDuration: '250ms' } as any),
  },
  heroMarcadorAtivo: { backgroundColor: theme.accent2, width: 32 },

  heroTrilhaCompacta: { paddingTop: spacing.xl, gap: spacing.xxl * 1.5 },
  heroBlocoCompacto: { alignItems: 'flex-start', paddingBottom: spacing.xxl, borderBottomWidth: 1, borderBottomColor: theme.rule },
  heroTelaCompacta: { width: '100%', marginBottom: spacing.xl },

  /* ───────── Telas do notebook (capítulos 2 e 3) ───────── */
  mockChat: { gap: spacing.sm },
  mockBolhaEnviada: {
    alignSelf: 'flex-end',
    backgroundColor: theme.accentDeep,
    borderRadius: radius.lg,
    borderBottomRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  mockTextoEnviado: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
  mockBolhaRecebida: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    borderRadius: radius.lg,
    borderBottomLeftRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    maxWidth: '92%',
  },
  mockTextoRecebido: { flex: 1, color: theme.inkSoft, fontSize: type.apoio, lineHeight: 18, fontFamily: fonts.light },

  mockNotaCabecalho: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  mockNotaRotulo: { color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular },
  mockNotaLista: { gap: spacing.sm },
  mockNotaLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  mockNotaNome: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.light },
  mockNotaValor: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },

  mockTelaApp: { gap: spacing.md },
  mockTelaTitulo: { color: theme.inkFaint, fontSize: type.legenda, letterSpacing: 1, textTransform: 'uppercase', fontFamily: fonts.regular },
  mockListaAnteriores: { gap: 2, opacity: 0.55 },
  mockLinhaAnterior: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 9 },
  mockPontoCategoria: { width: 8, height: 8, borderRadius: 4 },
  mockLinhaTextos: { flex: 1 },
  mockLinhaNome: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
  mockLinhaCategoria: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, marginTop: 1 },
  mockLinhaValor: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },

  mockPainel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  mockPainelTexto: { flex: 1 },
  mockLegendaCategorias: { gap: 6, marginTop: spacing.lg },
  mockLegendaLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mockLegendaPonto: { width: 8, height: 8, borderRadius: 4 },
  mockLegendaNome: { color: theme.inkSoft, fontSize: type.legenda, fontFamily: fonts.light },
});
