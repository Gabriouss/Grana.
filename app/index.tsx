import { createElement, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { Redirect } from 'expo-router';
import Head from 'expo-router/head';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme, spacing, radius, fonts, type } from '@/lib/theme';
import { colunaConteudo, colunaLeitura, useBreakpoint } from '@/lib/breakpoints';
import AppPressable from '@/components/AppPressable';
import BrandLogotype from '@/components/BrandLogotype';
import NotebookAnimado from '@/components/NotebookAnimado';
import GradeInterativa from '@/components/GradeInterativa';
import { FaqItem } from '@/components/FaqItem';
import RevealOnScroll from '@/components/RevealOnScroll';
import GlowOrb from '@/components/GlowOrb';
import TrustMarquee from '@/components/TrustMarquee';
import MolduraCelular from '@/components/MolduraCelular';
import MolduraNavegador from '@/components/MolduraNavegador';
import landingMeta from '@/landing-meta.json';

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
const PARAMETROS_ATRIBUICAO = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];

function hrefCadastroComAtribuicao(): string {
  if (typeof window === 'undefined') return '/sign-up';
  const origem = new URLSearchParams(window.location.search);
  const destino = new URLSearchParams();
  for (const chave of PARAMETROS_ATRIBUICAO) {
    const valor = origem.get(chave);
    if (valor) destino.set(chave, valor);
  }
  const query = destino.toString();
  return query ? `/sign-up?${query}` : '/sign-up';
}

function BotaoCTA({ microcopy, centralizado }: { microcopy: string; centralizado?: boolean }) {
  return (
    // Sem `centralizado`, o botão (`ctaPrimario` tem `alignSelf:'flex-start'`
    // fixo) e a microcopy (texto normal, sem textAlign) ficam os dois
    // encostados na borda esquerda desta View — correto nos contextos
    // já alinhados à esquerda (herói, card de preço). Num contexto que
    // CENTRALIZA este bloco inteiro (`alignItems:'center'` no pai, como
    // ctaMeio/ctaFinal), isso deixava o botão visivelmente deslocado da
    // microcopy mais larga abaixo dele — os dois precisam centralizar
    // JUNTOS, não só a caixa que os envolve.
    <View>
      {/* `href` direto no AppPressable (não `Link asChild`) — o
          `Link asChild` do expo-router quebrava o botão: seu `Slot` interno
          mescla `style` fazendo spread num objeto, e o `style` do
          AppPressable aqui é uma FUNÇÃO (`({hovered}) => [...]`) — o spread
          zera a função e o botão renderiza sem nenhum estilo. Passar `href`
          direto aproveita o suporte nativo do react-native-web: qualquer
          View (o que o Pressable renderiza por baixo) com uma prop `href`
          vira uma tag `<a>` de verdade — clique do meio, "abrir em nova
          aba" e rastreamento por crawler de busca funcionam — sem tocar no
          `style` função que já funcionava. */}
      <AppPressable
        href={hrefCadastroComAtribuicao()}
        style={({ hovered }) => [styles.ctaPrimario, centralizado && styles.ctaPrimarioCentralizado, hovered && styles.ctaPrimarioHover]}
      >
        <Text style={styles.ctaPrimarioTexto}>Criar conta</Text>
        <View aria-hidden>
          <Ionicons name="arrow-forward" size={17} color={theme.paper} />
        </View>
      </AppPressable>
      <Text style={[styles.ctaMicrocopy, centralizado && styles.ctaMicrocopyCentralizada]}>{microcopy}</Text>
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
  const { altura, ehCompacto } = useBreakpoint();
  if (ehCompacto) return null;
  return altura;
}

/**
 * Uma seção da página, do tamanho de uma tela (16:9) — decisão final do
 * autor depois de comparar: tirar a altura cheia deixava as seções mais
 * curtas (Preços, FAQ, compromissos) coladas umas nas outras, sem sensação
 * de capítulo. `scroll-snap-align` (aplicado aqui, com `scroll-snap-type`
 * no `ScrollView` — ver `styles.pagina`) é o que resolve a sensação de
 * "scroll travado" que a tela cheia sozinha causava: a rolagem passa a
 * ENCAIXAR na seção inteira em vez de poder parar em qualquer ponto no meio
 * de um vazio, então cada gesto de rolagem sempre termina num lugar
 * previsível.
 *
 * `levantada` alterna o fundo entre o `paper` base e o `paperRaised` que
 * todo card já usa, igual zebra de tabela — dá ritmo à página sem inventar
 * cor nova. `colunaConteudo` continua limitando o CONTEÚDO; é só o FUNDO
 * que vai de ponta a ponta da janela.
 */
function Dobra({ levantada, children }: { levantada?: boolean; children: React.ReactNode }) {
  const alturaDobra = useAlturaDobra();
  const { ehCompacto } = useBreakpoint();
  const cheia = alturaDobra !== null;
  return (
    <View
      style={[
        levantada && styles.bandaLevantada,
        cheia && { minHeight: alturaDobra!, justifyContent: 'center' },
        cheia && styles.dobraSnap,
      ]}
    >
      <View style={[colunaConteudo, styles.faixa, ehCompacto && styles.faixaCompacta]}>{children}</View>
    </View>
  );
}

// As 3 cenas de dor, cada uma em 3 linhas fixas (`\n` explícito) — mesma
// disciplina do resto da página: quebra escolhida, não deixada pro acaso do
// wrap automático em cada largura de tela.
const CENAS_DOR = [
  'Sexta ao meio-dia,\ne você não sabe se sobra\ndinheiro pra sair à noite.',
  'A fatura chega com\num valor que você jura\nnão lembrar de ter gasto.',
  'Baixou uma planilha\npra controlar tudo.\nDurou quatro dias.',
];

const PONTE_PERGUNTA = 'Aqui, contar um gasto leva o mesmo tempo que mandar um áudio pra um amigo.';

/* Mesmo escalonamento vertical do FAQ (ver DESALINHO_FAQ) — valores fixos,
   não aleatórios de verdade, pra não "pular" a cada re-render. Só 3 cenas
   aqui, então um array próprio, mais curto. */
const DESALINHO_DOR = [0, 26, -14];

/**
 * "Reconhece isso?" — cada cena de dor numa caixa própria, desalinhadas
 * entre si (referência: os cards do workshop que o autor mandou), no lugar
 * do scrub de brilho contínuo ligado ao scroll que a página tinha antes. A
 * pergunta de virada (`PONTE_PERGUNTA`) fica fora das caixas, como o
 * parágrafo de saída da seção — ela é a resposta, não mais uma dor.
 */
function SecaoReconheceIsso() {
  const { ehCompacto } = useBreakpoint();
  return (
    <View>
      <View style={styles.gradeCenas}>
        {CENAS_DOR.map((texto, i) => (
          <RevealOnScroll
            key={texto}
            atraso={i * 90}
            style={[
              styles.cenaCaixaPos,
              ehCompacto && styles.cenaCaixaPosCompacta,
              !ehCompacto && { transform: [{ translateY: DESALINHO_DOR[i % DESALINHO_DOR.length] }] },
            ]}
          >
            <AppPressable focusable={false} scaleOnPress={false} style={({ hovered }) => [styles.cenaCaixa, hovered && styles.cardComHover]}>
              <Text style={[styles.textoCena, styles.precoTextoCentralizado]}>{texto}</Text>
            </AppPressable>
          </RevealOnScroll>
        ))}
      </View>
      <RevealOnScroll atraso={CENAS_DOR.length * 90} style={styles.precoIntroCentralizada}>
        <Text style={[styles.pontePergunta, styles.precoTextoCentralizado]}>{PONTE_PERGUNTA}</Text>
      </RevealOnScroll>
    </View>
  );
}

/* Os compromissos futuros que a própria copy desta seção promete ("junta
   parcelas do cartão e contas fixas"). Antes ela mostrava o card de Livre
   para Gastar, que agora é o capítulo 4 do herói logo acima — a mesma peça
   duas vezes na mesma página, e a promessa da linha do tempo sem nenhuma
   prova visual. */
const COMPROMISSOS = [
  { dia: '05', mes: 'SET', nome: 'Aluguel', tipo: 'Conta fixa', valor: 'R$ 1.450,00' },
  { dia: '12', mes: 'SET', nome: 'Fatura do cartão', tipo: 'Cartão', valor: 'R$ 830,20' },
  { dia: '18', mes: 'SET', nome: 'Celular 3/12', tipo: 'Parcela', valor: 'R$ 249,90' },
  { dia: '25', mes: 'SET', nome: 'Internet', tipo: 'Conta fixa', valor: 'R$ 99,90' },
];

const PERGUNTAS_FAQ = [
  {
    pergunta: 'O Grana. puxa meu extrato do banco sozinho?',
    resposta:
      'Não. O Grana. não se conecta ao seu banco. Você registra por voz, por texto, pelo WhatsApp ou apontando a câmera pra nota, e ele organiza. É mais rápido de registrar do que de conectar uma conta bancária, e você nunca compartilha senha de banco com ninguém.',
  },
  {
    pergunta: 'O Grana. movimenta meu dinheiro?',
    resposta:
      'Não. O Grana. é um registro. Não é uma instituição financeira e não processa pagamento nenhum. Ele mostra pra onde seu dinheiro foi, com base no que você mesmo conta pra ele.',
  },
  {
    pergunta: 'É seguro?',
    resposta:
      'Cada conta só acessa os próprios dados, reforçado no banco de dados (não só na tela). No aplicativo móvel, a sessão fica criptografada no aparelho; no Android, você também pode bloquear prints das telas financeiras. Detalhes completos na Política de Privacidade.',
  },
  {
    pergunta: 'Preciso instalar alguma coisa?',
    resposta: 'Não pra começar. O Grana. roda no navegador, neste mesmo endereço. Uma versão para Android e iOS está a caminho.',
  },
  {
    pergunta: 'É pago?',
    resposta: 'Durante o acesso antecipado, criar a conta é gratuito. Quando a cobrança começar, será uma assinatura única de R$ 19,99 por mês, cancelável quando você quiser.',
  },
];

/**
 * O título de uma seção. Numa dobra de tela cheia (16:9) o corpo de 28pt que
 * servia numa seção de altura livre vira um bloquinho perdido no meio de
 * 1080px — a escala precisa acompanhar o tamanho do palco. No compacto, onde
 * a dobra não existe, continua sendo o mesmo de antes.
 */
function TituloSecao({ children, estiloExtra }: { children: React.ReactNode; estiloExtra?: StyleProp<TextStyle> }) {
  const { ehCompacto } = useBreakpoint();
  // Todo H2 fora de caixa de texto centralizado no compacto — pedido do
  // autor pra toda a página, aplicado aqui, num lugar só, porque TODA
  // seção de texto solto (não em card) usa este componente pro próprio
  // título. `ehCompacto && precoTituloCentralizado` é seguro mesmo nas
  // seções que já centralizavam antes (Preços, Reconhece isso): a mesma
  // regra `textAlign:'center'` aplicada duas vezes não muda nada.
  return (
    <Text role="heading" aria-level={2} style={[styles.secaoTitulo, !ehCompacto && styles.secaoTituloGrande, ehCompacto && styles.precoTituloCentralizado, estiloExtra]}>
      {children}
    </Text>
  );
}

type Capitulo = { titulo: string; subtitulo: string; icone: keyof typeof Ionicons.glyphMap };

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
/* Título de abertura do capítulo 1 — usado tanto no array de capítulos
   quanto pra semear o estado inicial das letras animadas, sem depender da
   ordem de declaração dentro do componente. */
const TITULO_CAPITULO_1 = 'Cadê meu dinheiro?';

function criarLetras(texto: string, valorInicial: number): Animated.Value[] {
  return [...texto].map(() => new Animated.Value(valorInicial));
}

function HeroStorytelling({ ehCompacto, alturaCabecalho }: { ehCompacto: boolean; alturaCabecalho: number }) {
  const alturaDobra = useAlturaDobra();
  const [reduzirMovimento, setReduzirMovimento] = useState(false);
  const [capituloExibido, setCapituloExibido] = useState(0);
  const capituloAtivoRef = useRef(0);
  const fade = useRef(new Animated.Value(1)).current;
  /* Cada letra do título resolve de apagada pra branca, com um atraso
     pequeno entre elas, no lugar do crossfade de bloco inteiro — técnica de
     revelação por caractere que o usuário pediu, numa versão sutil (sem
     scramble de caractere aleatório). Reconstruído a cada troca de capítulo
     porque o título muda de comprimento; `[...texto]` em vez de
     `.split('')` porque letra acentuada composta ("Cadê", "áudio") quebraria
     em unidades erradas com split cru. */
  const [letras, setLetras] = useState<Animated.Value[]>(() => criarLetras(TITULO_CAPITULO_1, 1));
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
      titulo: TITULO_CAPITULO_1,
      subtitulo: 'Fala com o Grana. como fala com um amigo. Ele entende o valor, o nome e a categoria sozinho.',
      icone: 'mic-outline',
    },
    {
      titulo: 'Manda um áudio. Pronto.',
      subtitulo: 'Sem abrir o app. Escreve ou fala pro número do Grana. no WhatsApp e o lançamento aparece organizado.',
      icone: 'logo-whatsapp',
    },
    {
      titulo: 'Aponta a câmera. Acabou.',
      subtitulo: 'O QR Code da nota vira um lançamento com o valor total da compra, sem digitar o valor.',
      icone: 'qr-code-outline',
    },
    {
      titulo: 'Sabe quanto sobra, sem calcular.',
      subtitulo:
        'Depois que o lançamento existe, o Grana. soma tudo e avisa quanto você tem livre pra gastar hoje.',
      icone: 'wallet-outline',
    },
  ];

  function irParaCapitulo(indice: number) {
    if (indice === capituloAtivoRef.current) return;
    capituloAtivoRef.current = indice;
    if (reduzirMovimento) {
      setCapituloExibido(indice);
      setLetras(criarLetras(CAPITULOS[indice].titulo, 1));
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
      const atual = capituloAtivoRef.current;
      setCapituloExibido(atual);
      const novasLetras = criarLetras(CAPITULOS[atual].titulo, 0);
      setLetras(novasLetras);
      Animated.stagger(
        18,
        novasLetras.map((valor) =>
          Animated.timing(valor, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false })
        )
      ).start();
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
      // O chamador (`ConteudoWeb`) não envolve mais o herói em
      // `[colunaConteudo, faixa]` — o painel largo precisa sangrar até a
      // borda do viewport, então esse wrapper move pra dentro daqui,
      // condicional por variante. É o mesmo par que `faixaCompacta` sempre
      // aplicou nesta faixa, só que declarado aqui em vez de no chamador.
      <View style={[colunaConteudo, styles.faixa, styles.faixaCompacta, styles.heroTrilhaCompacta]}>
        {CAPITULOS.map((c, i) => (
          <View key={c.titulo} style={styles.heroBlocoCompacto}>
            {/* Print real da tela "Início" (modo Dados de exemplo), não mais
                o composto animado (bg/sombra/notebook) — só no mobile, só no
                capítulo 1, ACIMA do texto: é a primeira coisa vista antes do
                título, não um encerramento depois dele. O PNG já vem com
                alfa de verdade esmaecendo pro transparente a partir de ~30%
                de altura (ver `Notebook-assets/interface-app` + `Tela de
                Notebook 2.png` de origem) — por isso nenhum degradê extra em
                CSS aqui: some
                sozinho sobre `theme.paper`, o mesmo fundo da página inteira,
                e o título embaixo já nasce dentro da parte apagada. */}
            {i === 0 &&
              createElement('img', {
                src: '/notebook/tela-mobile-2-800.png',
                alt: 'Painel do Grana. mostrando saldo, orçamento e gastos por categoria.',
                width: 800,
                height: 482,
                fetchPriority: 'high',
                // `height:'auto'` explícito — sem isso o atributo HTML `height`
                // (a dica de apresentação nativa do `<img>`) vence o `aspectRatio` abaixo,
                // porque só entra em jogo quando width OU height do CSS está em 'auto'.
                // Sem essa linha a imagem nasce na altura nativa do arquivo,
                // empurrando o resto do herói pra muito abaixo da dobra.
                style: { width: '100%', height: 'auto', maxWidth: 400, aspectRatio: 800 / 482, objectFit: 'contain', display: 'block', marginBottom: -spacing.xl },
              })}
            {/* "Acesso antecipado" só no capítulo 1 — repetido idêntico nos
                4 blocos lia como ruído (mesma legenda 4 vezes numa rolagem
                curta), não como reforço. Os capítulos 2-4 ganham um ícone
                próprio no lugar — mesma missão do eyebrow (dar ao bloco uma
                âncora visual antes do título), mas cada um com a cara do
                próprio recurso, não um rótulo repetido. */}
            {i === 0 ? (
              <Text style={[styles.eyebrow, styles.precoTextoCentralizado]}>Acesso antecipado</Text>
            ) : (
              <View style={styles.heroIconeCirculoCompacto} aria-hidden>
                <Ionicons name={c.icone} size={20} color={theme.accent2} />
              </View>
            )}
            <Text
              role="heading"
              aria-level={i === 0 ? 1 : 2}
              style={[styles.headlineCompacto, styles.precoTituloCentralizado]}
            >
              {c.titulo}
            </Text>
            <Text style={[styles.subheadline, styles.precoTextoCentralizado]}>{c.subtitulo}</Text>
            {/* CTA só na entrada e no fechamento (capítulo 1 e último) — no
                desktop o botão é fixo na coluna esquerda (herói sticky), mas
                no mobile cada capítulo é um bloco separado. Repetir o botão
                nos 4 lia como spam de venda numa rolagem curta; os capítulos
                do meio ainda estão construindo o argumento, então só
                precisam de um no início (primeira decisão) e um no fim
                (quem chegou até ali já viu o argumento inteiro). */}
            {(i === 0 || i === CAPITULOS.length - 1) && (
              <BotaoCTA microcopy={i === 0 ? 'Leva 30 segundos. Sem cartão de crédito.' : 'Acesso antecipado gratuito por enquanto.'} centralizado />
            )}
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
      <View style={[styles.heroLinhaSticky, { height: alturaSticky, minHeight: alturaSticky }]}>
        {/* Fundo do painel inteiro — montado a partir de 3 camadas soltas
            (bg/sombra/notebook, ver comentário em NotebookAnimado.tsx), não
            mais um vídeo: nenhuma recompressão por frame, o notebook fica
            pixel a pixel igual ao PNG original em qualquer tamanho de tela.
            O componente já é `position:absolute, inset:0` por conta própria
            — sem wrapper extra aqui. Sem `fade`, ao contrário do texto: é o
            visual único e constante do herói (mesmo notebook flutuando nos
            4 capítulos), então não há por que apagar/reacender a cada troca. */}
        <NotebookAnimado />
        {/* Escurece a metade esquerda (onde o texto fica por cima) e some
            gradualmente até o notebook, do mesmo jeito que a referência da
            Apple/AirPods usava um degradê branco->transparente sobre o
            vídeo — aqui em tom `paper` (o fundo escuro do próprio app), não
            branco, pra continuar lendo como "página escura", não "vinheta
            clara por cima de vídeo". */}
        <View style={styles.heroGradienteFundo} pointerEvents="none" aria-hidden />
        {/* Funde a base do painel na cor da página (`theme.paper`, a mesma
            que a seção seguinte usa por herdar o fundo de `pagina`) — sem
            isso o corte entre o composto (bg/sombra/notebook) e o resto da
            página aparecia como uma linha reta nítida bem onde `bg.png`
            termina, lendo como bug de camada, não como transição. */}
        <View style={styles.heroGradienteInferior} pointerEvents="none" aria-hidden />

        {/* `colunaConteudo` recentraliza o texto no mesmo teto de 1440px (e
            `heroConteudoCentralizado` repete o `paddingHorizontal` que
            `faixa` usa) que o resto da página — sem isso o texto ficaria
            colado na borda VERDADEIRA do viewport, já que o painel em volta
            (`heroLinhaSticky`) agora estica até lá. O vídeo sangra até a
            borda; o texto continua alinhado com o cabeçalho e as seções
            abaixo. */}
        <View style={[colunaConteudo, styles.heroConteudoCentralizado]}>
          <View style={styles.heroColunaTexto}>
            <Text style={styles.eyebrow}>Acesso antecipado</Text>
            <Animated.View style={{ opacity: fade }}>
              <Text role="heading" aria-level={1} style={styles.headline}>
                {[...capitulo.titulo].map((letra, i) => {
                  const valor = letras[i];
                  const cor = valor
                    ? valor.interpolate({ inputRange: [0, 1], outputRange: [theme.inkFaint, theme.ink] })
                    : theme.ink;
                  return (
                    <Animated.Text key={i} style={{ color: cor }}>
                      {letra}
                    </Animated.Text>
                  );
                })}
              </Text>
              <Text style={styles.subheadline}>{capitulo.subtitulo}</Text>
            </Animated.View>
            <BotaoCTA microcopy="Leva 30 segundos. Sem cartão de crédito." />
            <View style={styles.heroMarcadores} aria-hidden>
              {CAPITULOS.map((_, i) => (
                <View key={i} style={[styles.heroMarcador, i === capituloExibido && styles.heroMarcadorAtivo]} />
              ))}
            </View>
            {/* Indicador de scroll — só no capítulo 1 (a entrada da página),
                some ao rolar pro capítulo 2+ pra não competir com o conteúdo. */}
            {capituloExibido === 0 && (
              <Animated.View
                style={[
                  styles.heroScrollHint,
                  !reduzirMovimento && heroScrollHintAnimado,
                  { opacity: fade },
                ]}
                pointerEvents="none"
              >
                <Ionicons name="chevron-down" size={22} color={theme.accent2} />
              </Animated.View>
            )}
          </View>
        </View>
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
  const insets = useSafeAreaInsets();
  const { ehCompacto } = useBreakpoint();
  const alturaDobra = useAlturaDobra();
  /* Medido em vez de constante: o cabeçalho muda de altura com o `insets.top`
     e com a escala tipográfica da web, e o herói precisa descontar o valor
     REAL pra primeira dobra fechar em 16:9 exatos. */
  const [alturaCabecalho, setAlturaCabecalho] = useState(0);

  // Garante idioma pt-BR no HTML e injeta keyframe do scroll hint
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.lang = 'pt-BR';
    const tag = document.createElement('style');
    tag.textContent = `
      @keyframes hero-scroll-bounce {
        0% { transform: translateY(0); opacity: 0.6; }
        40% { transform: translateY(10px); opacity: 1; }
        100% { transform: translateY(0); opacity: 0.6; }
      }
      #pular-conteudo:focus-visible { top: 16px !important; }
    `;
    document.head.appendChild(tag);
    return () => {
      document.head.removeChild(tag);
    };
  }, []);

  // Âncoras das abas do cabeçalho — cada uma envolve a seção-alvo inteira
  // (ver mais abaixo), não fica dentro do RevealOnScroll: o próprio
  // RevealOnScroll documenta que style/posicionamento precisa estar no
  // filho direto do flex, e a mesma restrição vale pra uma ref de scroll.
  // 6 recursos, não mais 3 — metade fica de cada lado da tela do app no
  // centro (ver `styles.gradeRecursos`), estilo "recursos flanqueando um
  // celular" (referência: Organizze). Os 3 primeiros já existiam (entrada);
  // os 3 últimos são recursos reais do produto que a landing nunca tinha
  // mostrado (metas, comprometimento futuro, gráficos).
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
      texto: 'Manda uma mensagem, escrita ou falada, pro número do Grana. e o lançamento aparece no app. Sem abrir nada.',
    },
    {
      icone: 'qr-code-outline' as const,
      titulo: 'Foto da nota fiscal',
      texto: 'Aponta a câmera pro QR Code da nota (NFC-e) e o valor total da compra vira um lançamento, sem precisar digitar.',
    },
    {
      icone: 'flag-outline' as const,
      titulo: 'Cofrinhos e metas',
      texto: 'Separe dinheiro pra um objetivo — viagem, reserva de emergência — e acompanhe o progresso sem sair do app.',
    },
    {
      icone: 'calendar-outline' as const,
      titulo: 'Comprometimento futuro',
      texto: 'Veja parcelas e contas dos próximos meses antes de se apertar, não só o que já venceu.',
    },
    {
      icone: 'stats-chart-outline' as const,
      titulo: 'Gráficos automáticos',
      texto: 'Composição por categoria, mês a mês, gerada sozinha a partir do que você já lançou.',
    },
  ];

  // Os 4 passos da seção "Guia" — a sequência importa de verdade (é uma
  // ordem de uso, não uma lista solta), por isso os números fazem parte da
  // informação e não são só decoração.
  // Passos 03/04 eram réplicas do capítulo 4 do Herói e da seção
  // "Inteligência financeira" logo abaixo (mesma promessa de Livre para
  // Gastar/compromissos futuros, três vezes em duas dobras) — reescritos
  // pra fechar o arco do guia (resultado imediato, hábito) sem repetir o
  // mecanismo específico que as outras duas seções já explicam.
  const GUIA = [
    { numero: '01', titulo: 'Fale, mande áudio ou foto da nota', texto: 'Sem formulário: um jeito só de contar o que aconteceu com o dinheiro.' },
    { numero: '02', titulo: 'O Grana. categoriza sozinho', texto: 'Valor, nome e categoria reconhecidos automaticamente, sem revisar linha por linha.' },
    { numero: '03', titulo: 'O resultado aparece na hora', texto: 'Sem esperar o fim do mês pra saber pra onde o dinheiro foi.' },
    { numero: '04', titulo: 'Vira hábito, não tarefa', texto: 'Cada lançamento leva segundos — por isso dá pra manter todo mês.' },
  ];

  // `tipo` escolhe a cor do ícone: 'faz' usa a mesma cor de lançamento
  // positivo (`theme.up`, verde) já usada pros valores de entrada no mock da
  // página; 'nao' usa a de lançamento negativo (`theme.down`, ciano) — as
  // mesmas duas cores que o resto do app já usa pra "dinheiro entrando" vs.
  // "dinheiro saindo", aqui emprestadas pra "o que o Grana. faz" vs. "o que
  // ele nunca faz", em vez de inventar um terceiro par de cores novo.
  const SEGURANCA = [
    { icone: 'lock-closed-outline' as const, texto: 'Cada conta só enxerga\nos próprios dados, reforçado\nno banco, não só na tela.', tipo: 'faz' as const },
    { icone: 'finger-print-outline' as const, texto: 'No aplicativo móvel, bloqueio\npor biometria ou senha\ndo aparelho, se você ativar.', tipo: 'faz' as const },
    { icone: 'eye-off-outline' as const, texto: 'Modo privacidade oculta\nos valores da tela\ncom um toque.', tipo: 'faz' as const },
    { icone: 'shield-checkmark-outline' as const, texto: 'Sua senha é conferida\ncontra vazamentos conhecidos\nno cadastro.', tipo: 'faz' as const },
    { icone: 'ban-outline' as const, texto: 'O Grana. é só registro.\nEle nunca movimenta\ndinheiro de verdade.', tipo: 'nao' as const },
    { icone: 'megaphone-outline' as const, texto: 'Sem anúncio, sem venda\nde dado. O que você\nregistra é seu.', tipo: 'nao' as const },
  ];

  // Só o que já é dito em algum outro ponto desta mesma página — nenhum
  // benefício novo inventado pro checklist de Preços.
  const BENEFICIOS_PRECO = [
    'Voz, WhatsApp (texto ou áudio)\nou foto da nota pra lançar',
    'Livre para Gastar calculado sozinho,\nconsiderando o que ainda vem',
    'No app móvel, biometria e senha;\nem toda plataforma, modo privacidade',
    'Dados isolados por conta, nunca\nvendidos ou usados em anúncio',
    'Acesso completo a todos\nos recursos, sem plano limitado',
  ];

  return (
    <ScrollView
      style={[styles.pagina, styles.paginaSnap]}
      contentContainerStyle={{ paddingBottom: insets.bottom }}
    >
      {/* ───────── SEO meta tags ───────── */}
      <Head>
        <title>{landingMeta.title}</title>
        <meta name="description" content={landingMeta.description} />
        <meta name="theme-color" content={landingMeta.themeColor} />
        <meta name="color-scheme" content="dark" />
        <link rel="canonical" href={`${landingMeta.siteUrl}/`} />
        <meta property="og:site_name" content="Grana." />
        <meta property="og:title" content={landingMeta.ogTitle} />
        <meta property="og:description" content={landingMeta.ogDescription} />
        <meta property="og:url" content={`${landingMeta.siteUrl}/`} />
        <meta property="og:image" content={`${landingMeta.siteUrl}${landingMeta.ogImage}`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={landingMeta.ogTitle} />
        <meta name="twitter:description" content={landingMeta.ogDescription} />
        <meta name="twitter:image" content={`${landingMeta.siteUrl}${landingMeta.ogImage}`} />
      </Head>

      <AppPressable
        nativeID="pular-conteudo"
        href="#conteudo-principal"
        style={styles.pularConteudo}
      >
        <Text style={styles.pularConteudoTexto}>Pular para o conteúdo</Text>
      </AppPressable>

      {/* ───────── Cabeçalho (sticky com blur) ───────── */}
      <View
        role="banner"
        style={styles.cabecalhoSticky}
        onLayout={(e) => setAlturaCabecalho(e.nativeEvent.layout.height)}
      >
        <View style={[colunaConteudo, styles.faixa, ehCompacto && styles.faixaCompacta]}>
        <View style={[styles.cabecalho, { paddingTop: insets.top + spacing.sm }]}>
          <BrandLogotype width={104} />
          <View role="navigation" accessibilityLabel="Navegação principal" style={styles.navAbas}>
            <AppPressable href="#produto" style={styles.navLinkAlvo} hitSlop={{ top: 16, bottom: 16, left: 10, right: 10 }}>
              <Text style={styles.entrarTexto}>Produto</Text>
            </AppPressable>
            <AppPressable href="#precos" style={styles.navLinkAlvo} hitSlop={{ top: 16, bottom: 16, left: 10, right: 10 }}>
              <Text style={styles.entrarTexto}>Preços</Text>
            </AppPressable>
            {/* "Entrar" de volta no cabeçalho, discreto — quem já é cliente
                e chega na landing por engano não precisa rolar até o rodapé
                pra achar o login. Cor `inkFaint` pra não competir com os
                CTAs verdes da página. */}
            <AppPressable href="/sign-in" style={styles.navLinkAlvo} hitSlop={{ top: 16, bottom: 16, left: 10, right: 10 }}>
              <Text style={styles.entrarTextoDiscreto}>Entrar</Text>
            </AppPressable>
          </View>
        </View>
        </View>
      </View>

      <View role="main" nativeID="conteudo-principal">

      {/* ───────── Faixa de confiança ─────────
          Fica sob o cabeçalho, antes do hero — o único ponto da página que já
          está "fora" do ritmo de dobras de tela cheia (useAlturaDobra). Uma
          faixa fina no meio de duas Dobra quebraria essa métrica. */}
      <TrustMarquee
        itens={['Sem banco conectado', 'Sem burocracia pra começar', 'Sem letra miúda', 'Preço simples e fixo']}
      />

      {/* ───────── Hero-storytelling — o momento de assinatura da página ───────── */}
      <View style={styles.palcoHero}>
        <View style={styles.camadaBrilho}>
          <GlowOrb cor="rgba(31,169,141,0.35)" tamanho={720} top={-260} left={-160} />
          <GlowOrb cor="rgba(174,255,227,0.16)" tamanho={520} top={-80} right={-120} />
        </View>
        {/* Sem o wrapper `[colunaConteudo, faixa]` que as outras seções usam:
            o painel largo do herói precisa sangrar até a borda VERDADEIRA do
            viewport (vídeo de fundo), então é a própria `HeroStorytelling`
            que decide seu próprio limite de largura por variante — o
            compacto aplica `colunaConteudo/faixa` nele mesmo (mesmo efeito
            de antes), o largo não aplica nenhum, e só o texto por cima do
            vídeo fica preso a 1440px (`heroConteudoCentralizado`). */}
        <HeroStorytelling ehCompacto={ehCompacto} alturaCabecalho={alturaCabecalho} />
      </View>

      {/* ───────── Reconhece isso? (dor, antes da solução) ─────────
          Cada cena de dor em caixa própria, desalinhadas entre si
          (referência: cards do workshop) — trocou o scrub de brilho
          contínuo que a seção tinha antes. */}
      {/* `scrollMarginTop` compensa o cabeçalho sticky: sem isso, rolar até
          aqui pelo clique da aba alinharia o topo desta seção exatamente
          embaixo do cabeçalho fixo, escondendo o começo do conteúdo atrás
          dele. */}
      <View nativeID="produto" style={[styles.palcoComCamada, { scrollMarginTop: alturaCabecalho } as any]}>
        <GradeInterativa />
        <Dobra>
          <View style={styles.secao}>
            <RevealOnScroll style={styles.precoIntroCentralizada}>
              <Text style={[styles.secaoEyebrow, styles.precoTextoCentralizado]}>Reconhece isso?</Text>
              <TituloSecao estiloExtra={styles.precoTituloCentralizado}>
                {'Anotar gastos dá trabalho.\nPor isso você não dá continuidade.'}
              </TituloSecao>
            </RevealOnScroll>

            <SecaoReconheceIsso />
          </View>
        </Dobra>
      </View>

      {/* ───────── Guia — 4 passos numerados ─────────
          Tela real (conta de exemplo, dado fictício — nunca uma conta de
          verdade, ver `public/telas/`) numa moldura de navegador de um lado,
          a sequência de uso do outro. Os números (01-04) carregam
          informação de verdade aqui — é uma ORDEM de uso, não decoração —
          por isso não contam como o "número de seção" que craft-floor.md
          normalmente evita. */}
      <View style={styles.palcoComCamada}>
        <GradeInterativa />
        <Dobra levantada>
          <RevealOnScroll>
            <View style={[styles.secao, styles.secaoComCartao, ehCompacto && styles.secaoComCartaoCompacta]}>
              <View style={[styles.molduraCentralizada, ehCompacto && styles.molduraCentralizadaCompacta]}>
                {/* Largura menor no compacto — diferente de Recursos/Segurança
                    (que escondem a moldura inteira no celular), esta é a
                    única moldura que também aparece no compacto, então
                    precisa de uma largura que caiba nos ~340px de coluna que
                    sobram ali (a moldura não é fluida, é largura fixa por
                    design, igual `largura2` já fazia por breakpoint discreto
                    no resto da página). */}
                {/* Grupo com largura/altura FIXA (não `left/top` soltos
                    direto dentro de `molduraCentralizada`) — só assim o
                    `alignItems:'center'` do pai centraliza o PAR inteiro como
                    uma unidade. Com posicionamento solto, centralizava só a
                    moldura de Gráficos (a única no fluxo normal) e a de
                    Conquistas, saindo por fora à esquerda, puxava o centro
                    visual do conjunto pra fora do centro real da seção. */}
                <View style={[styles.guiaComposicao, ehCompacto && styles.guiaComposicaoCompacta]}>
                  {/* Mural de Conquistas atrás, espiando pelo canto superior
                      esquerdo, levemente torta — quebra de padrão de
                      propósito (todo o resto da página é ortogonal) — e
                      ANTES da moldura de Gráficos no JSX, sem `zIndex`, só
                      ordem de pintura, pra ficar por baixo dela. */}
                  <View style={[styles.guiaMolduraConquistas, ehCompacto && styles.guiaMolduraConquistasCompacta]}>
                    <MolduraNavegador src="/telas/conquistas-web.png" legenda="Mural de Conquistas do Grana., com selos obtidos e pendentes" largura={ehCompacto ? 160 : 300} />
                  </View>
                  <View style={styles.guiaMolduraGraficos}>
                    <MolduraNavegador src="/telas/graficos-web.png" legenda="Tela de Gráficos do Grana., com composição de gastos por categoria" largura={ehCompacto ? 260 : 520} />
                  </View>
                </View>
              </View>
              <View style={styles.colunaTextoSecao}>
                <Text style={[styles.secaoEyebrow, ehCompacto && styles.precoTextoCentralizado]}>Do primeiro lançamento ao hábito</Text>
                <TituloSecao>O guia pro seu controle financeiro</TituloSecao>
                <View style={styles.guiaLista}>
                  {GUIA.map((passo) => (
                    <View key={passo.numero} style={styles.guiaPasso}>
                      <Text style={styles.guiaNumero}>{passo.numero}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.guiaPassoTitulo}>{passo.titulo}</Text>
                        <Text style={styles.guiaPassoTexto}>{passo.texto}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </RevealOnScroll>
        </Dobra>
      </View>

      {/* ───────── Como entra o lançamento ───────── */}
      <View style={styles.palcoComCamada}>
        <GradeInterativa invertida />
        <Dobra levantada>
        <View style={styles.secao}>
          <RevealOnScroll>
            <Text style={[styles.secaoEyebrow, ehCompacto && styles.precoTextoCentralizado]}>A parte que você não vai adiar</Text>
            <TituloSecao>O único esforço é lembrar que o gasto existe</TituloSecao>
          </RevealOnScroll>

          <View style={styles.gradeRecursos}>
            <View style={styles.colunaRecursos}>
              {FEATURES.slice(0, 3).map((f, i) => (
                <RevealOnScroll key={f.titulo} atraso={i * 90}>
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

            {!ehCompacto && (
              <View style={styles.celularCentral}>
                <MolduraCelular src="/telas/inicio-mobile.png" legenda="Tela de Início do Grana. no celular, com Livre para Gastar e metas" largura={240} />
              </View>
            )}

            <View style={styles.colunaRecursos}>
              {FEATURES.slice(3).map((f, i) => (
                <RevealOnScroll key={f.titulo} atraso={(i + 3) * 90}>
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
          </View>

          <RevealOnScroll>
            <View style={styles.ctaMeio}>
              <Text style={styles.ctaMeioTitulo}>Pronto pra parar de perder a conta?</Text>
              <BotaoCTA microcopy="Leva 30 segundos pra criar sua conta." centralizado />
            </View>
          </RevealOnScroll>
        </View>
        </Dobra>
      </View>

      {/* ───────── Inteligência financeira ───────── */}
      <View style={styles.palcoComCamada}>
        <GradeInterativa />
        <Dobra>
        <RevealOnScroll>
          <View style={[styles.secao, styles.secaoComCartao, ehCompacto && styles.secaoComCartaoCompacta]}>
            <View style={styles.colunaTextoSecao}>
              <Text style={[styles.secaoEyebrow, ehCompacto && styles.precoTextoCentralizado]}>Depois que o lançamento existe</Text>
              <TituloSecao>{ehCompacto ? 'Ele soma o que ainda vai vir, antes de você se apertar.' : 'Ele soma o que\nainda vai vir, antes\nde você se apertar.'}</TituloSecao>
              <Text style={[styles.secaoTexto, ehCompacto && styles.precoTextoCentralizado]}>
                {ehCompacto
                  ? 'A linha do tempo de compromissos futuros junta parcelas do cartão e contas fixas num lugar só. É dela que sai o '
                  : 'A linha do tempo de compromissos futuros junta\nparcelas do cartão e contas fixas num lugar só.\nÉ dela que sai o '}
                <Text style={styles.destaqueInline}>Livre para Gastar</Text>
                {ehCompacto
                  ? ' do dia, que já considera o que ainda vem. Nada pega de surpresa lá na frente.'
                  : ' do dia, que já\nconsidera o que ainda vem. Nada pega de surpresa lá na frente.'}
              </Text>
            </View>

            <View style={styles.cardLinhaTempo}>
              <Text style={styles.mockRotulo}>Próximos compromissos</Text>
              {COMPROMISSOS.map((c, i) => (
                <View key={c.nome} style={styles.compromissoLinha}>
                  <View style={styles.compromissoTrilho}>
                    {/* Selo de calendário (mês pequeno + dia grande), não só
                        um número solto — é o que faz o "05" ler como DATA de
                        vencimento, não como índice de lista. */}
                    <View style={styles.compromissoDiaChip}>
                      <Text style={styles.compromissoDiaChipMes}>{c.mes}</Text>
                      <Text style={styles.compromissoDiaChipNumero}>{c.dia}</Text>
                    </View>
                    {i < COMPROMISSOS.length - 1 && <View style={styles.compromissoFio} />}
                  </View>
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
      </View>

      {/* ───────── Segurança e confiança ─────────
          Antes era uma grade de 6 cards de ícone. Trocado por bullets +
          uma composição de telas reais (desktop atrás, celular sobreposto
          na frente) — reforça "acesse do celular ou do computador"
          (Multiplataforma, já citado em PRODUCT.md), que os cards de ícone
          não mostravam visualmente. */}
      <View style={styles.palcoComCamada}>
        <GradeInterativa invertida />
        <Dobra levantada>
        <View style={[styles.secao, styles.secaoComCartao, ehCompacto && styles.secaoComCartaoCompacta]}>
          <View style={styles.colunaTextoSecao}>
            <RevealOnScroll>
              <Text style={[styles.secaoEyebrow, ehCompacto && styles.precoTextoCentralizado]}>A pergunta que todo mundo faz</Text>
              <TituloSecao>{ehCompacto ? '"É seguro informar meus gastos para um aplicativo?"' : '"É seguro informar meus\ngastos para um aplicativo?"'}</TituloSecao>
              <Text style={[styles.secaoTexto, ehCompacto && styles.precoTextoCentralizado]}>
                {ehCompacto
                  ? 'Faz sentido perguntar. Aqui está exatamente o que a gente faz, e o que a gente nunca faz.'
                  : 'Faz sentido perguntar. Aqui está exatamente\no que a gente faz, e o que a gente nunca faz.'}
              </Text>
            </RevealOnScroll>

            <View style={styles.segurancaLista}>
              {SEGURANCA.map((s, i) => (
                <RevealOnScroll key={s.texto} atraso={i * 60}>
                  <View style={styles.segurancaLinha}>
                    <Ionicons name={s.icone} size={16} color={s.tipo === 'faz' ? theme.up : theme.down} aria-hidden />
                    <Text style={styles.segurancaLinhaTexto}>{s.texto.replace(/\n/g, ' ')}</Text>
                  </View>
                </RevealOnScroll>
              ))}
            </View>

            <RevealOnScroll>
              <BotaoCTA microcopy="Leva 30 segundos pra criar sua conta." />
            </RevealOnScroll>
          </View>

          {!ehCompacto ? (
            <RevealOnScroll style={styles.composicaoTelas}>
              <MolduraNavegador src="/telas/inicio-web.png" legenda="Tela de Início do Grana. no computador" largura={420} />
              <View style={styles.composicaoCelular}>
                <MolduraCelular src="/telas/inicio-mobile.png" legenda="A mesma tela de Início do Grana. no celular" largura={160} />
              </View>
            </RevealOnScroll>
          ) : (
            /* No mobile a composição navegador+celular não cabe, mas a moldura
               de celular sozinha sim — mantém a prova visual de
               "multiplataforma" que a seção promete. */
            <RevealOnScroll style={styles.celularSoloCompacto}>
              <MolduraCelular src="/telas/inicio-mobile.png" legenda="Tela de Início do Grana. no celular" largura={200} />
            </RevealOnScroll>
          )}
        </View>
        </Dobra>
      </View>

      {/* ───────── Preços ───────── */}
      <View nativeID="precos" style={[styles.palcoComCamada, { scrollMarginTop: alturaCabecalho } as any]}>
        <GradeInterativa />
        <Dobra>
          <View style={styles.secao}>
            <RevealOnScroll style={styles.precoIntroCentralizada}>
              <Text style={[styles.secaoEyebrow, styles.precoTextoCentralizado]}>Quanto custa</Text>
              <TituloSecao estiloExtra={styles.precoTituloCentralizado}>
                {'Um plano só.\nSem letra miúda escondida.'}
              </TituloSecao>
              <Text style={[styles.secaoTexto, styles.precoTextoCentralizado]}>
                {'O acesso antecipado é gratuito por enquanto.\nDepois, a assinatura custará R$ 19,99 por mês.'}
              </Text>
            </RevealOnScroll>

            {/* Um card só, dividido ao meio — não dois cards soltos lado a
                lado. O checklist (linhas simples, sem caixa individual) fica
                no lado neutro; o painel de preço é o lado com destaque
                visual (`paperSelected`), separado por uma borda em vez de um
                vão entre dois elementos. */}
            <RevealOnScroll style={styles.precoCardUnico}>
              <View style={styles.precoColunas}>
                <View style={styles.precoChecklistCol}>
                  <Text style={styles.precoChecklistTitulo}>Tudo que você recebe</Text>
                  <View style={styles.precoChecklist}>
                    {BENEFICIOS_PRECO.map((b) => (
                      <View key={b} style={styles.precoChecklistLinha}>
                        <Ionicons name="checkmark-circle" size={22} color={theme.up} aria-hidden />
                        <Text style={styles.precoChecklistTexto}>{b}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={[styles.cardPreco, ehCompacto && styles.cardPrecoCompacto]}>
                  <Text style={styles.precoRotulo}>Assinatura única</Text>
                  <View style={styles.precoLinha}>
                    <Text style={styles.precoValor}>R$ 19,99</Text>
                    <Text style={styles.precoPeriodo}>/mês</Text>
                  </View>
                  <Text style={styles.featureTexto}>
                    Quando a cobrança começar, será mensal e transparente. Cancele quando quiser, sem burocracia.
                  </Text>
                  <BotaoCTA microcopy="Acesso antecipado gratuito por enquanto." centralizado={ehCompacto} />
                </View>
              </View>
            </RevealOnScroll>
          </View>
        </Dobra>
      </View>

      {/* ───────── FAQ ─────────
          Texto-âncora + cards sobre uma grade sutil. A rodada anterior tinha
          escalonamento em zigue-zague + rotação leve nos cards — revertido:
          o autor pediu alinhamento rigoroso entre texto e elementos em toda
          a página, e o escalonamento lia como "desalinhado", não como
          "intencional". Cards em grade limpa, todos com o topo alinhado. */}
      <View style={styles.palcoComCamada}>
        <GradeInterativa />
        <Dobra>
          <View style={styles.secao}>
            <View style={[styles.faqLayout, ehCompacto && styles.faqLayoutCompacta]}>
              <RevealOnScroll style={[styles.colunaTextoSecao, ehCompacto && styles.faqCompactoSemFlex]}>
                <Text style={[styles.secaoEyebrow, ehCompacto && styles.precoTextoCentralizado]}>Perguntas diretas</Text>
                <TituloSecao>Sem letra miúda</TituloSecao>
                <Text style={[styles.secaoTexto, ehCompacto && styles.precoTextoCentralizado]}>
                  Respostas rápidas para as dúvidas que travam muita gente antes de entrar.
                </Text>
              </RevealOnScroll>

              <View style={[styles.faqGrade, ehCompacto && styles.faqCompactoSemFlex]}>
                {PERGUNTAS_FAQ.map((f, i) => (
                  <RevealOnScroll
                    key={f.pergunta}
                    atraso={i * 70}
                    style={styles.faqCardPos}
                  >
                    <View style={styles.faqCard}>
                      <FaqItem pergunta={f.pergunta} resposta={f.resposta} estiloExtra={styles.faqItemSemBorda} abertoInicial={i === 0} />
                    </View>
                  </RevealOnScroll>
                ))}
              </View>
            </View>
          </View>
        </Dobra>
      </View>

      {/* ───────── CTA final ───────── */}
      <View
        style={[
          styles.palcoCtaFinal,
          alturaDobra !== null && { minHeight: alturaDobra, justifyContent: 'center' },
          alturaDobra !== null && styles.dobraSnap,
        ]}
      >
        <GlowOrb cor="rgba(31,169,141,0.22)" tamanho={620} top={-200} left="50%" />
        <RevealOnScroll>
          <View style={[colunaConteudo, styles.faixa, ehCompacto && styles.faixaCompacta]}>
            <View style={[styles.ctaFinal, colunaLeitura]}>
              {/* Um heading só (não dois) — duas frases de contraste
                  aninhadas em <Text> de cor diferente dentro dele, mesmo
                  padrão de destaqueInline já usado na seção de Inteligência
                  financeira. Fecha o ciclo com o "Cadê meu dinheiro?" do
                  herói, agora como pergunta que já tem resposta. */}
              <Text role="heading" aria-level={2} style={styles.ctaFinalTitulo}>
                <Text style={styles.ctaFinalTituloForte}>
                  Use o Grana. por 30 dias e descubra pra onde foi cada real.
                </Text>
                {'\n'}
                <Text style={styles.ctaFinalTituloFraca}>Ou continuar perguntando "cadê meu dinheiro".</Text>
              </Text>
              <BotaoCTA microcopy="Leva 30 segundos pra criar sua conta." centralizado />
            </View>
          </View>
        </RevealOnScroll>
      </View>

      </View>

      {/* ───────── Rodapé ───────── */}
      <View style={[colunaConteudo, styles.faixa, ehCompacto && styles.faixaCompacta]}>
        <View role="contentinfo" style={[styles.rodape, ehCompacto && styles.rodapeCompacto]}>
          <BrandLogotype width={72} />
          <View style={[styles.rodapeLinks, ehCompacto && styles.rodapeLinksCompacto]}>
            {/* `href` direto no AppPressable (ver comentário maior em
                BotaoCTA sobre por que não `Link asChild`) — o
                react-native-web usa a `href` recebida pra renderizar uma
                tag `<a>` de verdade — clique do meio, "abrir em nova aba" e
                rastreamento por crawler de busca voltam a funcionar, coisa
                que um `onPress` em JS puro nunca ofereceu. `hitSlop` maior
                (era 8) porque o texto de rodapé sozinho fica bem abaixo do
                alvo de toque mínimo de 44px. */}
            <AppPressable href="/termos" style={styles.rodapeLinkAlvo} hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}>
              <Text style={styles.rodapeLink}>Termos de Uso</Text>
            </AppPressable>
            <AppPressable href="/privacidade" style={styles.rodapeLinkAlvo} hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}>
              <Text style={styles.rodapeLink}>Privacidade</Text>
            </AppPressable>
            <AppPressable href="/exclusao-de-dados" style={styles.rodapeLinkAlvo} hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}>
              <Text style={styles.rodapeLink}>Excluir dados</Text>
            </AppPressable>
            {/* Único link de AÇÃO no meio de três links legais — por isso
                por último, sem se misturar com Termos/Privacidade/Excluir. */}
            <AppPressable href="/sign-in" style={styles.rodapeLinkAlvo} hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}>
              <Text style={styles.rodapeLink}>Entrar</Text>
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

/* Fica FORA do `StyleSheet.create` de propósito — dentro dele, o validador
   de estilo do react-native-web (dev only) rejeita `animationName` com
   "Invalid style property... Did you mean animationKeyframes?" (RNW espera
   o objeto de keyframes ali, não o nome de um @keyframes CSS já injetado à
   parte). Todo outro `animationName`/`animationDuration` desta base
   (NotebookAnimado, MolduraCelular, MolduraNavegador, TrustMarquee) já
   segue esse mesmo padrão — objeto solto, mesclado no array de `style`,
   nunca uma chave dentro de `StyleSheet.create`. */
const heroScrollHintAnimado = {
  animationName: 'hero-scroll-bounce',
  animationDuration: '1.3s',
  animationTimingFunction: 'cubic-bezier(0.45, 0, 0.2, 1)',
  animationIterationCount: 'infinite',
} as any;

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: theme.paper },
  pularConteudo: {
    position: 'absolute',
    top: -80,
    left: spacing.lg,
    zIndex: 100,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: theme.ink,
  },
  pularConteudoTexto: { color: theme.paper, fontSize: type.apoio, fontFamily: fonts.regular },
  // CSS web-only, mesmo padrão `as any` de GlowOrb — faz a rolagem encaixar
  // em cada `Dobra` (`dobraSnap` abaixo) em vez de poder parar em qualquer
  // ponto no meio de uma seção de tela cheia.
  // `proximity`, não `mandatory` — testado e `mandatory` sequestrava até
  // rolagem PROGRAMÁTICA (o `scrollIntoView` das abas "Produto"/"Preços" do
  // cabeçalho parava de funcionar, sempre reencaixando na seção errada).
  // `proximity` só puxa pra alinhar quando a rolagem do usuário já vai
  // terminar perto de uma borda — não briga com navegação por código.
  paginaSnap: ({ scrollSnapType: 'y proximity' } as any),
  dobraSnap: ({ scrollSnapAlign: 'start' } as any),
  // `colunaConteudo` (lib/breakpoints.ts) já centraliza com teto de 1440px —
  // mesmo padrão usado no resto do app. Uma tentativa anterior de travar o
  // conteúdo à esquerda (`alignSelf: 'flex-start'`) grudava a página inteira
  // no canto esquerdo em qualquer tela larga, com um vão vazio enorme à
  // direita — pior que a margem simétrica crescente que tentava evitar.
  faixa: { paddingHorizontal: spacing.xl, width: '100%' },
  // No celular a coluna já ocupa a tela inteira (sem sobra de `colunaConteudo`
  // pra "respirar" como acontece numa janela larga), então a mesma margem de
  // 20 usada em todo o resto lia como grudada na borda. Só no compacto a
  // margem sobe pra 24.
  faixaCompacta: { paddingHorizontal: spacing.xl + spacing.xs },
  bandaLevantada: { backgroundColor: theme.paperRaised },

  // Cabeçalho sticky com blur — fica fixo no topo durante toda a rolagem,
  // com um backdrop-filter que deixa o conteúdo por baixo visível de forma
  // sutil. `zIndex: 10` garante que fique acima de todas as seções (que
  // têm `zIndex` implícito, nunca explícito).
  cabecalhoSticky: {
    ...({ position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)' } as any),
    backgroundColor: 'rgba(5,34,41,0.82)',
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
  entrarTexto: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.light },
  // Discreto pra não competir com os CTAs da página — quem já é cliente
  // reconhece, quem é novo não se distrai.
  entrarTextoDiscreto: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.light },
  navAbas: { flexDirection: 'row', gap: spacing.xl },
  navLinkAlvo: { minHeight: 44, justifyContent: 'center' },

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
  palcoComCamada: { position: 'relative', overflow: 'hidden' },

  eyebrow: { color: theme.accent2, fontSize: type.legenda, letterSpacing: 1, fontFamily: fonts.regular, marginBottom: spacing.xs, textTransform: 'uppercase' },
  // Escala bem acima do resto da tipografia do app de propósito — esta é a
  // única frase que precisa ser lida antes de qualquer outra coisa na
  // página, e o tamanho tem que dizer isso antes mesmo do conteúdo.
  //
  // `clamp()` em vez de dois tamanhos fixos alternados por breakpoint — antes
  // o título pulava de 44px pra 80px de uma vez só na borda de `medio`; agora
  // escala fluido com a largura da janela, sem o salto.
  headline: {
    color: theme.ink,
    ...({ fontSize: 'clamp(44px, 4vw + 24px, 80px)', lineHeight: 'clamp(46px, 4vw + 26px, 80px)' } as any),
    letterSpacing: -2,
    fontFamily: fonts.regular,
    marginBottom: spacing.lg,
  },
  // `headline` (acima) tem piso de 44px — pensado pra UM título só, na
  // primeira dobra do herói largo. No compacto o mesmo título se repete 4
  // vezes empilhado (um por capítulo); 44px+ repetido 4 vezes numa rolagem
  // curta lia como "gigante" (relato direto do autor, com print do site no
  // ar), não como impacto — daqui vem um piso bem menor, dedicado.
  headlineCompacto: {
    color: theme.ink,
    ...({ fontSize: 'clamp(28px, 7vw, 36px)', lineHeight: 'clamp(31px, 7.5vw, 39px)' } as any),
    letterSpacing: -1,
    fontFamily: fonts.regular,
    marginBottom: spacing.lg,
  },
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
  ctaPrimarioCentralizado: { alignSelf: 'center' },
  // Fica sob TODO botão de CTA — reduz a maior fricção não dita ("quanto
  // tempo vou perder", "vão me cobrar") no exato instante em que a pessoa
  // está decidindo clicar, em vez de deixar a resposta só no FAQ lá embaixo.
  ctaMicrocopy: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, marginTop: spacing.sm },
  ctaMicrocopyCentralizada: { textAlign: 'center' },

  // Mesmo padrão de grade desalinhada do FAQ (`faqGrade`/`faqCardPos`) — só
  // 3 caixas aqui, então largura própria em vez de reaproveitar a do FAQ.
  gradeCenas: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center', gap: spacing.xl, marginTop: spacing.lg, width: '100%' },
  cenaCaixaPos: { flexBasis: '30%', minWidth: 260 },
  cenaCaixaPosCompacta: { flexBasis: '100%' },
  cenaCaixa: { backgroundColor: theme.paperRaised, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.rule, padding: spacing.lg, ...sombraCard },
  textoCena: { color: theme.inkSoft, fontSize: type.corpo, lineHeight: type.corpo * 1.5, fontFamily: fonts.light },
  // A ponte de volta pra solução usa o accent2 da marca — a paleta muda de
  // tom no exato lugar onde a copy muda de tom, saindo das caixas de dor.
  pontePergunta: { color: theme.accent2, fontSize: type.destaque, fontFamily: fonts.regular, marginTop: spacing.xl, maxWidth: 640 },

  ctaMeio: {
    marginTop: spacing.xxl,
    alignItems: 'center',
    paddingTop: spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: theme.ruleStrong,
  },
  ctaMeioTitulo: { color: theme.ink, fontSize: type.destaque, fontFamily: fonts.regular, marginBottom: spacing.lg, textAlign: 'center' },

  // `spacing.xxl` (28px) sozinho ficava apertado demais dentro da dobra de
  // tela cheia — pouco respiro ao redor do conteúdo centralizado. `xxl * 2.5`
  // dá ar de verdade sem competir com o `justifyContent:'center'` da Dobra.
  secao: { paddingVertical: spacing.xxl * 2.5 },
  secaoComCartao: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxl, flexWrap: 'wrap' },
  // `flex:1` + `minWidth` nos dois filhos (`molduraCentralizada`/
  // `colunaTextoSecao` etc.) não força a quebra de linha de forma confiável
  // numa largura intermediária — `flex-basis:0%` (o que `flex:1` define)
  // faz o navegador ignorar o `minWidth` na hora de decidir se quebra ou
  // encolhe, então entre ~700-767px os dois itens encolhiam ABAIXO do
  // próprio mínimo em vez de quebrar linha — a imagem chegava a renderizar
  // com `left` negativo, parcialmente fora da tela (bug real, visto no site
  // publicado). `ehCompacto` já é a MESMA largura de corte (768px) usada em
  // todo o resto da página — usar o boolean explícito aqui, em vez de
  // confiar no `flexWrap` automático, garante que o empilhamento aconteça
  // exatamente na mesma borda que o resto do layout já respeita.
  secaoComCartaoCompacta: { flexDirection: 'column' },
  secaoEyebrow: { color: theme.accent2, fontSize: type.legenda, letterSpacing: 1, fontFamily: fonts.regular, textTransform: 'uppercase', marginBottom: spacing.xs },
  secaoTitulo: { color: theme.ink, fontSize: type.cabecalho + 4, fontFamily: fonts.regular, marginBottom: spacing.lg, maxWidth: 640 },
  secaoTituloGrande: { fontSize: 50, lineHeight: 54, letterSpacing: -1.2, maxWidth: 900, marginBottom: spacing.xl },
  secaoTexto: { color: theme.inkSoft, fontSize: type.destaque, lineHeight: type.destaque * 1.5, fontFamily: fonts.light, maxWidth: 560 },
  // Só o parágrafo de Preços — as duas frases quebram uma por linha (`\n`
  // explícito) e o bloco centraliza na coluna, diferente do resto das
  // seções, onde o texto de apoio fica alinhado à esquerda junto do título.
  // O bloco inteiro (eyebrow + título + parágrafo) centraliza na coluna —
  // diferente do resto das seções, onde esse bloco fica alinhado à esquerda
  // junto do card ao lado. `alignItems: 'center'` no wrapper é o que faz
  // cada filho (de largura própria) se posicionar centralizado; o
  // `textAlign: 'center'` de cada um cuida de dentro do próprio texto.
  precoIntroCentralizada: { alignItems: 'center', width: '100%' },
  precoTituloCentralizado: { textAlign: 'center' },
  // `maxWidth` generoso o bastante pra "Criar conta não custa nada agora."
  // caber inteira numa linha só — um teto mais apertado quebrava só essa
  // frase sozinha no meio, separando "agora" do resto por conta própria.
  precoTextoCentralizado: { textAlign: 'center', maxWidth: 820 },
  colunaTextoSecao: { flex: 1, minWidth: 320, maxWidth: 620 },

  // `paddingVertical` dá o respiro vertical pra moldura de trás espiar por
  // cima sem cortar no `overflow:hidden` da seção (mesma razão do
  // `paddingVertical` em `composicaoTelas`, a composição navegador+celular
  // mais abaixo na página).
  molduraCentralizada: { flex: 1, minWidth: 380, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  // No compacto o `minWidth: 380` acima passa da coluna disponível
  // (~342px, viewport de 390px menos o padding de `faixaCompacta`) e
  // estourava largura, cortado pelo `overflow:hidden` da seção.
  molduraCentralizadaCompacta: { minWidth: 0, width: '100%' },
  // Largura/altura FIXA (não flexível) — é o que permite o
  // `alignItems:'center'` do pai centralizar o PAR de molduras como uma
  // ÚNICA unidade visual, com a moldura de Gráficos (à frente, à direita)
  // e a de Conquistas (atrás, à esquerda) somadas. `width` = largura da
  // moldura de Gráficos + o quanto a de Conquistas escapa pra fora à
  // esquerda (`guiaMolduraConquistas.left`, negativo). `height` = altura da
  // moldura de Gráficos (a mais alta das duas nas contas de proporção
  // 1440:900 usadas aqui — a de trás sempre cabe dentro por baixo dela).
  guiaComposicao: { position: 'relative', width: 655, height: 325 },
  // Moldura de Gráficos MENOR aqui (260, não 320 como antes de haver uma
  // segunda tela) — o par precisa de espaço pra uma fatia de verdade da
  // moldura de trás sobrar visível na coluna de ~342px do compacto; com a
  // moldura da frente ainda em 320 não sobrava quase nada (só uma tira de
  // ~16px), o que lia como "moldura cortada", não como composição.
  guiaComposicaoCompacta: { width: 324, height: 163 },
  // Moldura de trás: fora do fluxo normal (`position:'absolute'`, ANTES da
  // de Gráficos no JSX — sem `zIndex`, só ordem de pintura, pra ficar por
  // baixo), deslocada pra fora à esquerda/cima, e levemente torta
  // (`rotate`) — quebra de padrão de propósito: o resto da página inteira é
  // ortogonal, então uma moldura não-alinhada aqui chama o olho sem
  // precisar de nenhum texto novo.
  guiaMolduraConquistas: { position: 'absolute', left: 0, top: 24, transform: [{ rotate: '-5deg' }] },
  guiaMolduraConquistasCompacta: { top: 16 },
  // Moldura de Gráficos: normal-flow removido pro canto direito do grupo
  // (`right:0`), não mais centralizada sozinha — dentro de `guiaComposicao`
  // ela É a âncora que define a largura/altura do grupo inteiro.
  guiaMolduraGraficos: { position: 'absolute', right: 0, top: 0 },
  guiaLista: { gap: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.lg },
  guiaPasso: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  // O número É a marcação de passo — não tem círculo/fundo por trás porque
  // já é grande e destacado o bastante sozinho; um círculo ao redor
  // competiria com o próprio dígito em vez de reforçá-lo.
  guiaNumero: { color: theme.accent2, fontSize: 22, fontFamily: fonts.light, fontVariant: ['tabular-nums'], minWidth: 36 },
  guiaPassoTitulo: { color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular, marginBottom: 2 },
  guiaPassoTexto: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: 20, fontFamily: fonts.light },

  // Recursos flanqueando a tela do app no centro — 3 de cada lado no
  // amplo/médio; no compacto vira uma coluna só (sem o celular central, que
  // já aparece grande no herói logo acima).
  gradeRecursos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxl, marginTop: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  colunaRecursos: { flex: 1, minWidth: 260, maxWidth: 340, gap: spacing.lg },
  celularCentral: { alignItems: 'center', paddingHorizontal: spacing.lg },

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
     assim o fio nasce e morre junto com o selo de cada linha e nunca sobra
     abaixo do último item, que é onde uma barra de altura fixa sempre erra.
     Largura fixa em 40 (não mais 9) pra caber o selo de calendário abaixo —
     ela também é o que garante todo selo alinhado na mesma coluna,
     independente de "05" ou "18" terem a mesma largura de dígito. */
  compromissoTrilho: { width: 40, alignItems: 'center', alignSelf: 'stretch' },
  // Selo de calendário — mês pequeno em cima, dia grande embaixo, o mesmo
  // padrão visual de "folhinha" que qualquer agenda usa pra um dia em
  // destaque. É isto (não um número solto) que comunica "data de
  // vencimento" à primeira vista.
  compromissoDiaChip: {
    width: 40,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: theme.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  compromissoDiaChipMes: { color: theme.accent2, fontSize: 9, fontFamily: fonts.regular, letterSpacing: 0.5, textTransform: 'uppercase' },
  compromissoDiaChipNumero: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  compromissoFio: { flex: 1, width: 1, backgroundColor: theme.rule, marginTop: spacing.xs },
  compromissoTextos: { flex: 1 },
  compromissoNome: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
  compromissoTipo: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, marginTop: 1 },
  compromissoValor: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  destaqueInline: { color: theme.accent2, fontFamily: fonts.regular },

  cardFeature: {
    backgroundColor: theme.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: spacing.lg,
    ...sombraCard,
  },

  // O card único — a borda/raio/sombra que antes viviam em cada metade
  // separada (`cardFeature`) agora vivem só aqui; `overflow: hidden` é o que
  // faz o fundo `paperSelected` do painel de preço respeitar o raio do card
  // inteiro em vez de fazer um canto quadrado saindo de um canto arredondado.
  precoCardUnico: {
    marginTop: spacing.xl,
    // Depois de limitar a largura do checklist (`precoChecklistCol`) pra
    // aproximar as duas metades, o card inteiro (que antes esticava até
    // `colunaConteudo`) sobrava com um vão vazio à direita do painel de
    // preço. Um teto aqui, centralizado, mantém as duas metades juntas sem
    // deixar a composição inteira desbalanceada pra esquerda.
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paper,
    overflow: 'hidden',
    ...sombraCard,
  },
  precoColunas: { flexDirection: 'row', alignItems: 'stretch', flexWrap: 'wrap' },
  // `maxWidth` — sem teto, o `flex: 1` deste lado crescia bem além do
  // próprio texto (o painel de preço tem largura fixa do outro lado), e
  // sobrava um vão vazio enorme entre o fim das linhas e a borda do painel.
  precoChecklistCol: { flex: 1, minWidth: 320, maxWidth: 520, padding: spacing.xxl },
  precoChecklistTitulo: { color: theme.ink, fontSize: type.destaque, fontFamily: fonts.regular, marginBottom: spacing.lg },
  // Linhas simples, sem caixa própria por item — o card único inteiro já é
  // o contêiner; uma caixa por linha aqui dentro de outra caixa lia como
  // aninhamento redundante.
  precoChecklist: { gap: spacing.md },
  precoChecklistLinha: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.xs },
  precoChecklistTexto: { flex: 1, color: theme.inkSoft, fontSize: type.corpo, lineHeight: type.corpo * 1.45, fontFamily: fonts.light },
  // Painel de preço — metade com destaque visual (`paperSelected`) do card
  // único, separada da metade do checklist por uma borda, não por um vão.
  // `justifyContent: 'center'` — o painel de preço é sempre mais curto que
  // o checklist ao lado (menos linhas de conteúdo), mas `alignItems:
  // 'stretch'` do pai (`precoColunas`) estica os dois pra mesma altura;
  // sem centralizar, o conteúdo ficava todo colado no topo com um vão vazio
  // grande embaixo, em vez de ocupar a caixa inteira.
  cardPreco: {
    flex: 1,
    minWidth: 320,
    maxWidth: 440,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xxl,
    backgroundColor: theme.paperSelected,
    borderLeftWidth: 1,
    borderLeftColor: theme.ruleStrong,
  },
  // No compacto as duas metades empilham — a borda precisa migrar de
  // esquerda pra cima, senão fica uma linha vertical solta encostada no
  // topo de um painel que agora está embaixo, não ao lado.
  cardPrecoCompacto: { maxWidth: '100%', borderLeftWidth: 0, borderTopWidth: 1, borderTopColor: theme.ruleStrong },
  precoRotulo: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  precoLinha: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  // Usa `theme.ink` (não `inkFaint`) porque é um valor definido, não um "a
  // definir": o apagado era o sinal visual de "isto não é um preço real",
  // e não se aplica mais com o valor de lançamento (R$ 19,99) no lugar.
  precoValor: { color: theme.ink, fontSize: type.valor + 6, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  precoPeriodo: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.light },
  // Aplica-se tanto ao card de recurso quanto ao de segurança — nenhum dos
  // dois leva a lugar nenhum (não são clicáveis), então o "levantar" no
  // hover é só presença ambiente: sem cursor de mão, sem virar alvo de tab.
  // Ver AppPressable com focusable={false}/scaleOnPress={false} onde é usado.
  // Reaproveita a receita "Card de persuasão" (`sombraCard`) já cadastrada
  // em vez de inventar números novos — DESIGN.md proíbe uma 6ª sombra ad hoc.
  // O "levantar" no hover vem do `translateY`, não de uma sombra maior.
  cardComHover: {
    ...sombraCard,
    ...({ transform: [{ translateY: -4 }], cursor: 'default' } as any),
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

  // Reaproveitado só por "Próximos compromissos" — os outros mockRotulo*
  // (mockValor, mockLegenda) que existiam junto pertenciam às antigas telas
  // mockadas do herói (voz/WhatsApp/nota/saldo livre), aposentadas quando o
  // vídeo do notebook passou a ser o visual único do herói.
  mockRotulo: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, marginBottom: spacing.xs },

  segurancaLista: { gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.xl },
  // Cada linha na própria caixa (voltou a pedido do autor) — não mais um
  // bullet solto: fundo, borda e raio pequeno, a mesma receita de
  // `cardFeature`/`cardSeguranca` antigo, só com padding mais enxuto porque
  // agora é uma coluna vertical de 6, não uma grade 2×3.
  segurancaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  segurancaLinhaTexto: { flex: 1, color: theme.inkSoft, fontSize: type.corpo, fontFamily: fonts.light },

  // Navegador atrás, maior; celular na frente, menor, sobreposto no canto
  // inferior — a mesma composição "duas telas, um produto só" que o
  // Organizze usa pra provar multiplataforma sem precisar de duas seções.
  composicaoTelas: { flex: 1, minWidth: 380, alignItems: 'center', justifyContent: 'center', position: 'relative', paddingVertical: spacing.xxl },
  composicaoCelular: { position: 'absolute', right: '6%', bottom: 0 },
  // Moldura de celular sozinha no mobile — a composição
  // navegador+celular não cabe, mas mostrar pelo menos a moldura de
  // celular mantém a prova visual de multiplataforma.
  celularSoloCompacto: { alignItems: 'center', marginTop: spacing.xl },

  faqLayout: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing.xxl, marginTop: spacing.sm },
  // Mesmo bug/correção de `secaoComCartaoCompacta` — `flex:1` + `minWidth`
  // nos dois filhos (`colunaTextoSecao`/`faqGrade`) não quebra linha de
  // forma confiável numa largura intermediária. `alignItems:'center'` só
  // no compacto: centraliza o bloco de texto (eyebrow/título/parágrafo)
  // empilhado, sem afetar `faqGrade` (os cards já ocupam a largura toda).
  faqLayoutCompacta: { flexDirection: 'column', alignItems: 'center' },
  // No compacto, `colunaTextoSecao` E `faqGrade` chegam aqui com `flex:1`
  // cada um (herdado do layout em linha do desktop, onde os dois dividem a
  // largura). Numa coluna (`flexDirection:'column'`), dois `flex:1`
  // concorrentes esticam ambos pra uma altura IGUAL um ao outro em vez de
  // cada um respeitar a altura do próprio conteúdo — o texto (curto) ganhava
  // uma caixa tão alta quanto a grade de cards inteira (comprovado medindo
  // ao vivo: os dois fechavam em exatamente a mesma altura), sobrando um
  // vão vazio enorme entre o parágrafo e o primeiro card. `flexGrow:0` +
  // `flexBasis:'auto'` tiram os dois da disputa por espaço sobrando; cada
  // um volta a ocupar só a altura do que tem dentro.
  faqCompactoSemFlex: { flexGrow: 0, flexBasis: 'auto' },
  faqGrade: { flex: 1, minWidth: 320, gap: spacing.lg },
  // Sem `flexBasis` — `faqGrade` (abaixo) é `flexDirection:'column'` por
  // padrão agora (a grade em zigue-zague antiga, que era `row`+`wrap`, foi
  // simplificada pra uma lista empilhada). Um `faqCardPosCompacto` com
  // `flexBasis:'100%'` sobrava de quando `flexBasis` ainda mirava o eixo
  // HORIZONTAL (linha) — numa coluna, `flexBasis` mira o eixo VERTICAL, e
  // "100% de altura" em CADA card ao mesmo tempo é o que causava aquele vão
  // gigante entre eles (cada RevealOnScroll reservava a altura inteira do
  // container pra si). `width:'100%'` já basta pro card ocupar a largura
  // toda em qualquer largura de tela.
  faqCardPos: { width: '100%', minWidth: 280 },
  faqCard: { backgroundColor: theme.paperRaised, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.rule, padding: spacing.lg, ...sombraCard },
  // Suprime a borda/padding próprios de FaqItem — o card por fora já
  // fornece os dois, dobrar deixaria espaçamento duplicado e uma linha
  // divisória órfã cortando o card ao meio.
  faqItemSemBorda: { borderBottomWidth: 0, paddingVertical: 0 },

  ctaFinal: { alignSelf: 'center', alignItems: 'center', paddingVertical: spacing.xxl * 1.5, gap: spacing.xl },
  ctaFinalTitulo: { fontSize: type.destaque + 4, lineHeight: (type.destaque + 4) * 1.3, textAlign: 'center' },
  ctaFinalTituloForte: { color: theme.ink, fontFamily: fonts.regular },
  // Mesmo sinal de "secundário" já usado no valor apagado do card de preço.
  ctaFinalTituloFraca: { color: theme.inkFaint, fontFamily: fonts.light },

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
  rodapeLinkAlvo: { minHeight: 44, justifyContent: 'center' },
  // No mobile o rodapé empilha verticalmente — os 4 links quebram de forma
  // desigual em `flexWrap:'wrap'` com `flexDirection:'row'` numa tela de
  // ~390px. Centralizar tudo resolve sem inventar media-query.
  rodapeCompacto: { flexDirection: 'column', alignItems: 'center', gap: spacing.lg },
  rodapeLinksCompacto: { flexWrap: 'wrap', justifyContent: 'center' },
  rodapeLink: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },

  /* ───────── Herói-storytelling ───────── */
  heroTrilhaGatilhos: { position: 'relative' },
  // Painel de sangria total: chegar até a borda VERDADEIRA do viewport não é
  // mais um truque de CSS (`width:100vw` + `marginLeft:calc(50% - 50vw)`) —
  // essa versão anterior desalinhava o texto (a centralização de
  // `colunaConteudo`, mais abaixo, dependia do navegador calcular a
  // largura de um `position:sticky` com `width:100vw` corretamente, o que
  // não aconteceu de forma confiável) e deixava uma borda visível ao iniciar
  // o scroll (`100vw` inclui a largura da barra de rolagem, `%` não —
  // 1-2 dígitos de diferença que bastam pra um vão aparecer). A correção
  // real foi no chamador (`ConteudoWeb`): o herói largo simplesmente não é
  // mais envolvido por `colunaConteudo/faixa` lá em cima, então este painel
  // já NASCE com a largura total do pai (`palcoHero`, sem teto nem padding
  // próprios) — sem hack nenhum. Sem `borderRadius`: um canto arredondado
  // bem na borda do navegador lê como recorte quebrado, não como painel.
  heroLinhaSticky: {
    position: 'relative',
    overflow: 'hidden',
    ...({ position: 'sticky', top: 0 } as any),
  },
  // Recentraliza o conteúdo no mesmo teto de 1440px do resto da página — o
  // vídeo sangra até a borda do viewport (estilo acima), mas o TEXTO não
  // pode: precisa continuar alinhado com o cabeçalho e as seções abaixo, que
  // seguem `colunaConteudo` normalmente. `paddingHorizontal` repete o mesmo
  // valor de `faixa` (linha ~942) de propósito, pela mesma razão. `zIndex`
  // fica aqui, não em `heroColunaTexto`, porque é este nível que precisa
  // ficar por cima do vídeo/degradê (ambos `position:absolute`, que pintam
  // por cima de qualquer irmão sem posicionamento próprio, independente da
  // ordem no JSX).
  heroConteudoCentralizado: {
    // `flex:1` é o que faltava: sem ele, esta View só tinha a altura do
    // próprio conteúdo (texto) e ficava presa no topo do painel — o
    // `alignItems:'center'` abaixo só centraliza o filho DENTRO da altura
    // desta View, que precisa primeiro esticar até preencher `heroLinhaSticky`
    // inteiro (o `minHeight: alturaSticky` aplicado hoje). Com `flex:1`, esta
    // View passa a ocupar o painel inteiro, e o texto centraliza de verdade.
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    zIndex: 2,
    ...({ position: 'relative' } as any),
  },
  heroColunaTexto: { flex: 1, maxWidth: 540 },
  // Escurece a área onde o texto fica (a metade esquerda) e some antes de
  // chegar no notebook, à direita — mesma ideia do degradê branco->
  // transparente da referência (Apple/AirPods) por cima do vídeo, mas em
  // `#052229` (o hex de `theme.paper`; `backgroundImage` não aceita o token
  // direto porque o degradê precisa da variação de alfa, que o token sozinho
  // não carrega) pra continuar lendo como página escura, não vinheta clara.
  heroGradienteFundo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    ...({ backgroundImage: 'linear-gradient(90deg, #052229 0%, rgba(5,34,41,0.86) 34%, rgba(5,34,41,0) 76%)' } as any),
  },
  // Só a faixa de baixo do painel — o resto do composto (bg/sombra/notebook)
  // fica intocado. `theme.paper` sólido no fim, não um `rgba` que dependeria
  // do que está atrás: a View seguinte (a página) já é opaca nessa mesma
  // cor, então o degradê só precisa terminar exatamente nela.
  heroGradienteInferior: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '22%',
    ...({ backgroundImage: `linear-gradient(180deg, rgba(5,34,41,0) 0%, ${theme.paper} 100%)` } as any),
  },
  // Chegou a levar `scrollSnapAlign` (pra dar ao herói pontos de encaixe e
  // reduzir o risco de um scroll rápido pular ele inteiro) — revertido:
  // quebrou de novo a navegação por clique das abas do cabeçalho (mesmo
  // sintoma do `mandatory`, mesmo em `proximity`). Entre "herói pode ser
  // pulado num flick forte" (característica normal de página em cenas de
  // tela cheia, presente nas próprias referências que inspiraram este
  // layout) e "clique no menu não funciona direito", a segunda é o bug
  // real — fica sem ponto de encaixe aqui.
  heroGatilho: { position: 'absolute', left: 0, right: 0 },
  heroMarcadores: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  heroMarcador: {
    width: 20,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.rule,
    ...({ transitionProperty: 'width, background-color', transitionDuration: '250ms' } as any),
  },
  heroMarcadorAtivo: { backgroundColor: theme.accent2, width: 32 },
  heroScrollHint: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
  },
  heroTrilhaCompacta: { paddingTop: spacing.lg, gap: spacing.xl },
  // `center`, não mais `flex-start` — pedido do autor pra todo H1/H2 (e o
  // texto ao redor) fora de caixa ficar centralizado no compacto; o herói é
  // a PRIMEIRA seção da página nesse padrão, não uma exceção.
  heroBlocoCompacto: { alignItems: 'center', paddingBottom: spacing.xl, borderBottomWidth: 1, borderBottomColor: theme.rule },
  // Mesma missão do `eyebrow` (âncora visual antes do título, capítulos 2-4
  // do herói compacto) — `marginBottom` igual ao dele, pra não mudar o
  // ritmo vertical entre os blocos.
  heroIconeCirculoCompacto: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },

});
