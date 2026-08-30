import { createElement, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { Redirect } from 'expo-router';
import Head from 'expo-router/head';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme, spacing, radius, fonts as uiFonts, type } from '@/lib/theme';
import { colunaConteudo, useBreakpoint } from '@/lib/breakpoints';
import AppPressable from '@/components/AppPressable';
import BrandLogotype from '@/components/BrandLogotype';
import NotebookAnimado from '@/components/NotebookAnimado';
import GradeInterativa from '@/components/GradeInterativa';
import { FaqItem } from '@/components/FaqItem';
import RevealOnScroll from '@/components/RevealOnScroll';
import GlowOrb from '@/components/GlowOrb';
import ConversaGranabo from '@/components/ConversaGranabo';
import CardLivreParaGastar from '@/components/CardLivreParaGastar';
import MiniMockBeneficio, { type VarianteMock } from '@/components/MiniMockBeneficio';
import TrustMarquee from '@/components/TrustMarquee';
import NavFlutuanteLanding from '@/components/NavFlutuanteLanding';
import MolduraNavegador from '@/components/MolduraNavegador';
import landingMeta from '@/landing-meta.json';

// A landing é uma superfície de marca. O produto logado usa a família do
// sistema; aqui a Neue Machina continua sendo a voz editorial do Grana.
const fonts = { regular: uiFonts.brandRegular, light: uiFonts.brandLight };

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
/* Microcopy padrão sob o CTA. O botão diz "Criar minha conta" e NÃO promete
   compra: o checkout da Kiwify ainda não existe e não há paywall no app
   (temAssinaturaAtiva em lib/assinatura.ts não é chamada em tela nenhuma).
   O preço aparece porque o lançamento é pago desde o primeiro dia, sem
   período de teste. */
const PARAMETROS_ATRIBUICAO = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];

/* Em compacto/médio, a navegação mora no botão flutuante; no amplo, os mesmos
   destinos ficam persistentes no cabeçalho. Cada ícone é mnemônico da seção,
   não decoração: permite reconhecer o item pela forma antes do rótulo. */
const NAVEGACAO_LANDING = [
  { rotulo: 'Como funciona', href: '#produto', icone: 'play-circle-outline' },
  { rotulo: 'Granabô', href: '#granabo', icone: 'logo-whatsapp' },
  { rotulo: 'Hábitos', href: '#habitos', icone: 'flame-outline' },
  { rotulo: 'Benefícios', href: '#beneficios', icone: 'grid-outline' },
  { rotulo: 'Segurança', href: '#seguranca', icone: 'shield-checkmark-outline' },
  { rotulo: 'Preços', href: '#precos', icone: 'pricetag-outline' },
  { rotulo: 'Dúvidas', href: '#faq', icone: 'help-circle-outline' },
] as const;

/* 560px do mockup + 320px da coluna textual + gap e margens da dobra. A
   composição só vira duas colunas quando essa soma cabe sem encolher nenhum
   dos lados abaixo do próprio conteúdo. */
const LARGURA_MINIMA_HABITOS_EM_LINHA = 1080;
const LARGURA_MINIMA_HERO_LARGO = 960;
const ALTURA_MINIMA_HERO_LARGO = 600;

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

/* `rotulo` permite variar o texto do botão por seção. O padrão é
   "Criar minha conta", que é a ação REAL: o checkout da Kiwify ainda não
   existe e `temAssinaturaAtiva()` não é chamada em tela nenhuma, então
   nenhum botão pode prometer uma compra. `microcopy` é opcional e fica
   reservada aos pontos em que realmente esclarece uma condição. */
function BotaoCTA({
  microcopy,
  centralizado,
  rotulo = 'Criar minha conta',
}: {
  microcopy?: string;
  centralizado?: boolean;
  rotulo?: string;
}) {
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
        <Text style={styles.ctaPrimarioTexto}>{rotulo}</Text>
        <View aria-hidden>
          <Ionicons name="arrow-forward" size={17} color={theme.paper} />
        </View>
      </AppPressable>
      {microcopy ? <Text style={[styles.ctaMicrocopy, centralizado && styles.ctaMicrocopyCentralizada]}>{microcopy}</Text> : null}
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
/* Cada cena ganha um ícone que nomeia a SITUAÇÃO, não a emoção: o calendário
   é a sexta-feira, o cartão é a fatura, a grade é a planilha. Ícone que
   repete o que o texto já diz seria decoração; estes três dão ao olho um
   ponto de entrada em cada card antes da leitura, que é o que faltava numa
   seção de três blocos de texto quase idênticos em forma. */
const CENAS_DOR = [
  {
    icone: 'calendar-outline' as const,
    texto: 'Chega sexta-feira e você ainda não sabe se o dinheiro dá para sair à noite.',
  },
  {
    icone: 'card-outline' as const,
    texto: 'A fatura chega com gastos que você mal se lembra de ter feito.',
  },
  {
    icone: 'grid-outline' as const,
    texto: 'A planilha começou organizada. Poucos dias depois, ficou para trás.',
  },
];

const PONTE_PERGUNTA = 'No Grana., registrar um gasto leva o mesmo tempo que mandar um áudio para um amigo.';

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
        {CENAS_DOR.map((cena, i) => (
          <RevealOnScroll
            key={cena.texto}
            atraso={i * 90}
            style={[
              styles.cenaCaixaPos,
              ehCompacto && styles.cenaCaixaPosCompacta,
              !ehCompacto && { transform: [{ translateY: DESALINHO_DOR[i % DESALINHO_DOR.length] }] },
            ]}
          >
            <View style={styles.cenaCaixa}>
              <View style={styles.cenaIcone} aria-hidden>
                <Ionicons name={cena.icone} size={19} color={theme.accent2} />
              </View>
              <Text style={[styles.textoCena, styles.precoTextoCentralizado]}>{cena.texto}</Text>
            </View>
          </RevealOnScroll>
        ))}
      </View>
      {/* A ponte fecha a seção e o botão vem logo abaixo dela. Antes a pessoa
          lia a virada ("é rápido assim") e precisava rolar cinco dobras até
          encontrar um botão — o momento de maior interesse da página não
          tinha para onde ir. */}
      <RevealOnScroll atraso={CENAS_DOR.length * 90} style={styles.precoIntroCentralizada}>
        <Text style={[styles.pontePergunta, styles.precoTextoCentralizado]}>{PONTE_PERGUNTA}</Text>
        <View style={styles.cenaCta}>
          <BotaoCTA centralizado />
        </View>
      </RevealOnScroll>
    </View>
  );
}

/* Elementos do produto que ajudam o registro a se tornar um hábito. */
const PILARES_HABITO = [
  {
    icone: 'flame-outline' as const,
    titulo: 'Veja sua constância',
    texto: 'O Ritmo da Semana acompanha os dias em que você registrou e deixa a sequência visível.',
  },
  {
    icone: 'trophy-outline' as const,
    titulo: 'Acompanhe conquistas',
    texto: 'Do Primeiro Registro ao Mapeador 360°, você enxerga quais comportamentos já fazem parte da sua rotina.',
  },
  {
    icone: 'notifications-outline' as const,
    titulo: 'Escolha um lembrete',
    texto: 'No aplicativo móvel, você define um horário para lembrar dos lançamentos que ainda não fez.',
  },
  {
    icone: 'speedometer-outline' as const,
    titulo: 'Entenda sua evolução',
    texto: 'O Score Grana reúne quatro fatores numa escala de 0 a 1000 e ajuda a acompanhar seu progresso.',
  },
];

type BeneficioLanding = {
  variante: VarianteMock;
  titulo: string;
  texto: string;
};

const BENEFICIOS_LANDING: BeneficioLanding[] = [
  {
    variante: 'lancar',
    titulo: 'Lance do jeito que for mais fácil',
    texto: 'Use voz no app, Granabô, QR Code, comprovante Pix, CSV com até 500 linhas ou formulário manual. Se a conexão cair, a fila offline guarda o lançamento para sincronizar depois.',
  },
  {
    variante: 'cartao',
    titulo: 'Acompanhe cartão, fatura e limite',
    texto: 'Veja cada cartão, transforme compras parceladas em lançamentos reais e pague a fatura pela carteira escolhida. Alertas mostram quando o uso cruza 50%, 70%, 90% e 100% do limite.',
  },
  {
    variante: 'boletos',
    titulo: 'Organize contas e boletos recorrentes',
    texto: 'Marque uma conta como paga para criar a saída e preparar a próxima ocorrência. Os lembretes acompanham a aproximação do vencimento no aplicativo móvel.',
  },
  {
    variante: 'mes',
    titulo: 'Veja o mês por vários ângulos',
    texto: 'Acompanhe fluxo financeiro, gastos por categoria, períodos personalizados e os compromissos dos próximos seis meses. Quando precisar, exporte um relatório em PDF.',
  },
  {
    variante: 'organizar',
    titulo: 'Separe o dinheiro com intenção',
    texto: 'Crie carteiras, cofrinhos com prazo, orçamentos por categoria e categorias próprias. O Grana. ajuda a distinguir o que está disponível do que já tem destino.',
  },
  {
    variante: 'personalizar',
    titulo: 'Monte o Grana. do seu jeito',
    texto: 'Escolha e reorganize até dez blocos na tela inicial, use atalhos diretos e explore o modo de exemplo com dados fictícios antes de registrar os seus.',
  },
];

/* Ordenado por risco percebido, não por curiosidade: a conexão bancária vem
   primeiro porque é a objeção que trava mais gente, e as três últimas tratam
   de dinheiro (cobrança, controle dos dados). Três perguntas são novas e
   cobrem objeções decisivas que a página não respondia: o que acontece quando
   o reconhecimento erra, como o Livre para Gastar é calculado, e quem é o
   Granabô. A resposta comercial aponta para a seção de Preços, que concentra
   valor e forma de pagamento. */
const PERGUNTAS_FAQ = [
  {
    pergunta: 'O Grana. acessa minha conta bancária?',
    resposta:
      'Não. O Grana. não se conecta ao seu banco e não usa Open Finance. Você registra por voz, por texto ou áudio no WhatsApp, ou apontando a câmera pro QR Code da nota, e ele organiza. Você nunca compartilha senha de banco com ninguém.',
  },
  {
    pergunta: 'Quem é o Granabô?',
    resposta:
      'É o assistente do Grana. no WhatsApp. Você vincula seu número uma vez, pelo próprio app, e depois é só mandar um texto ou um áudio para ele. Ele identifica o valor e a descrição, sugere uma categoria e cria o lançamento no Grana. Você só ajusta se precisar.',
  },
  {
    pergunta: 'E se o Grana. entender um lançamento errado?',
    resposta:
      'Acontece. O reconhecimento de valor, descrição e categoria é automático e acerta na maioria das vezes, mas pode errar. Todo lançamento pode ser editado ou excluído no app, e a categoria sugerida pode ser trocada a qualquer momento.',
  },
  {
    pergunta: 'Como o Livre para Gastar é calculado?',
    resposta:
      'A partir do saldo dos seus lançamentos do mês, o Grana. desconta as contas que ainda vencem no mês e o valor que você já separou em metas, e divide o que sobra pelos dias que faltam. É uma estimativa baseada no que você registrou, para servir de referência no dia a dia.',
  },
  {
    pergunta: 'Como funciona a assinatura?',
    resposta:
      'O Grana. funciona por assinatura mensal e não oferece período de teste. Você encontra o valor e a forma de pagamento na seção de Preços desta página.',
  },
  {
    pergunta: 'Posso enviar áudio para o Granabô?',
    resposta:
      'Pode. Ele entende texto e áudio. Imagem ainda não: se você mandar uma foto, ele avisa que por enquanto só entende mensagem de texto ou áudio.',
  },
  {
    pergunta: 'Posso editar ou excluir meus dados?',
    resposta:
      'Pode. Todo lançamento é editável, e você pode excluir sua conta e seus dados quando quiser, pelo próprio aplicativo.',
  },
  {
    pergunta: 'Como meus dados são protegidos?',
    resposta:
      'Só você acessa os dados da sua conta, e isso é reforçado no banco de dados, não só na tela. No aplicativo móvel, a sessão fica criptografada no aparelho e você pode ativar bloqueio por biometria; no Android, também dá pra bloquear prints das telas com valores. Detalhes completos na Política de Privacidade.',
  },
  {
    pergunta: 'O Grana. movimenta meu dinheiro?',
    resposta:
      'Não. O Grana. é um registro. Não é uma instituição financeira e não processa pagamento nenhum. Ele mostra pra onde seu dinheiro foi, com base no que você mesmo conta pra ele.',
  },
  {
    pergunta: 'Preciso instalar alguma coisa?',
    resposta: 'Não pra começar. O Grana. roda no navegador, neste mesmo endereço. Uma versão para Android e iOS está a caminho.',
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
    <Text role="heading" aria-level={2} style={[styles.secaoTitulo, !ehCompacto && styles.secaoTituloGrande, ehCompacto && styles.secaoTituloCompacto, ehCompacto && styles.precoTituloCentralizado, estiloExtra]}>
      {children}
    </Text>
  );
}

/**
 * O herói da página. Uma cena só, não mais uma sequência de capítulos.
 *
 * Até aqui eram quatro "hero slides" avançados por `IntersectionObserver`, e
 * dois deles explicavam WhatsApp e QR Code — os mesmos canais que agora têm
 * dobra própria mais abaixo. Era a repetição que o autor apontou na revisão
 * ao vivo: a pessoa lia a mesma informação três vezes antes de chegar a
 * qualquer argumento novo. Com uma cena só, o herói faz o trabalho que só ele
 * pode fazer (prometer o resultado) e entrega o resto para as dobras
 * seguintes.
 *
 * A revelação letra a letra do título fica, porque é a assinatura da página
 * registrada no DESIGN.md e não dependia da troca de capítulos.
 */
const TITULO_HERO = 'Grana. um aplicativo que ajuda você a visualizar seu mês.';
const GANCHO_HERO = 'Cadê meu dinheiro?';
const APOIO_HERO =
  'Registre seus gastos em segundos. O Grana. organiza seus lançamentos sem a necessidade de conectar sua conta bancária.';

function criarLetras(texto: string, valorInicial: number): Animated.Value[] {
  return [...texto].map(() => new Animated.Value(valorInicial));
}

function HeroStorytelling({ ehCompacto, alturaCabecalho }: { ehCompacto: boolean; alturaCabecalho: number }) {
  const alturaDobra = useAlturaDobra();
  const [reduzirMovimento, setReduzirMovimento] = useState(false);
  const [letras] = useState<Animated.Value[]>(() => criarLetras(TITULO_HERO, 0));

  useEffect(() => {
    let ativo = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => ativo && setReduzirMovimento(v))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  /* A revelação roda uma vez, na entrada. Com `prefers-reduced-motion` as
     letras já nascem visíveis, sem animação nenhuma. */
  useEffect(() => {
    if (reduzirMovimento) {
      letras.forEach((v) => v.setValue(1));
      return;
    }
    Animated.stagger(
      18,
      letras.map((valor) =>
        Animated.timing(valor, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false })
      )
    ).start();
  }, [letras, reduzirMovimento]);

  const titulo = (
    <Text
      role="heading"
      aria-level={1}
      style={ehCompacto ? [styles.headlineCompacto, styles.heroTextoSemMargem] : styles.headline}
    >
      {[...TITULO_HERO].map((letra, i) => {
        const valor = letras[i];
        const cor = valor ? valor.interpolate({ inputRange: [0, 1], outputRange: [theme.inkFaint, theme.ink] }) : theme.ink;
        return (
          <Animated.Text key={i} style={{ color: cor }}>
            {letra}
          </Animated.Text>
        );
      })}
    </Text>
  );

  if (ehCompacto) {
    return (
      <View style={[colunaConteudo, styles.faixa, styles.faixaCompacta, styles.heroBlocoCompacto]}>
        {createElement('img', {
          src: '/notebook/tela-mobile-2-800.webp',
          alt: 'Painel do Grana. mostrando saldo, orçamento e gastos por categoria.',
          width: 800,
          height: 482,
          fetchPriority: 'high',
          style: { width: '100%', height: 'auto', maxWidth: 400, aspectRatio: 800 / 482, objectFit: 'contain', display: 'block' },
        })}
        <View style={styles.heroTextoCompacto}>
          <Text style={[styles.eyebrow, styles.precoTextoCentralizado, styles.heroTextoSemMargem]}>{GANCHO_HERO}</Text>
          {titulo}
          <Text style={[styles.subheadline, styles.precoTextoCentralizado, styles.heroTextoSemMargem]}>{APOIO_HERO}</Text>
        </View>
        <BotaoCTA centralizado />
      </View>
    );
  }

  const alturaCena = alturaDobra ?? 640;
  const alturaSticky = Math.max(360, alturaCena - alturaCabecalho);

  return (
    <View style={[styles.heroLinhaSticky, { height: alturaSticky, minHeight: alturaSticky }]}>
      <NotebookAnimado />
      <View style={[styles.heroGradienteFundo, { pointerEvents: 'none' }]}  aria-hidden />
      <View style={[styles.heroGradienteInferior, { pointerEvents: 'none' }]}  aria-hidden />

      <View style={[colunaConteudo, styles.heroConteudoCentralizado]}>
        <View style={styles.heroColunaTexto}>
          <Text style={styles.eyebrow}>{GANCHO_HERO}</Text>
          {titulo}
          <Text style={styles.subheadline}>{APOIO_HERO}</Text>
          <BotaoCTA />
          {!reduzirMovimento && (
            <Animated.View style={[[styles.heroScrollHint, heroScrollHintAnimado], { pointerEvents: 'none' }]} >
              <Ionicons name="chevron-down" size={22} color={theme.accent2} />
            </Animated.View>
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * Um elemento só "rola" se tiver overflow rolável E conteúdo sobrando. Os dois
 * juntos, nunca um só: o ScrollView do react-native-web empilha várias Views
 * uma dentro da outra, e as de fora têm `scrollHeight` grande com
 * `overflow: visible` — parecem o contêiner de rolagem e não são.
 */
function rolaDeVerdade(elemento: HTMLElement | null | undefined): boolean {
  if (!elemento || typeof getComputedStyle !== 'function') return false;
  const estilo = getComputedStyle(elemento);
  return /(auto|scroll)/.test(estilo.overflowY) && elemento.scrollHeight > elemento.clientHeight + 1;
}

/** O contêiner que realmente rola acima de um elemento, subindo a árvore. */
function containerRolavel(elemento: HTMLElement): HTMLElement | null {
  let atual: HTMLElement | null = elemento.parentElement;
  while (atual) {
    if (rolaDeVerdade(atual)) return atual;
    atual = atual.parentElement;
  }
  return null;
}

/**
 * Rola até o alvo descontando o cabeçalho fixo. Devolve `false` quando não
 * conseguiu rolar por nenhum dos três caminhos — e é esse `false` que autoriza
 * quem chamou a deixar a âncora nativa agir em vez de cancelá-la.
 */
function rolarAte(alvo: HTMLElement, alturaCabecalho: number, rolagem: ScrollView | null): boolean {
  /* `getScrollableNode()` é usado só se ele REALMENTE rolar.
   *
   * O nó devolvido por ele nesta tela é uma View intermediária com
   * `overflow: visible`, não o contêiner de rolagem. Chamar `scrollTo` nela
   * não move nada e também não lança erro: a página fica parada enquanto a URL
   * troca para `#habitos`, que é uma forma silenciosa de botão morto. Medido:
   * o scroller de verdade é três níveis acima, com 13727px de conteúdo para
   * 915px de janela. */
  const candidato = (rolagem as any)?.getScrollableNode?.() as HTMLElement | undefined;
  const container = rolaDeVerdade(candidato) ? candidato : containerRolavel(alvo);

  if (container) {
    const topo =
      container.scrollTop + alvo.getBoundingClientRect().top - container.getBoundingClientRect().top - alturaCabecalho;
    /* Inteiro: `scrollTop` fracionário é arredondado pelo navegador ao ser
       guardado, e a diferença resultante já disparou uma vez a rede de
       segurança logo abaixo. */
    const destino = Math.max(0, Math.round(topo));

    /* O `scroll-snap` sai do caminho durante o salto, por precaução e não por
       diagnóstico: o defeito relatado vinha do `scrollTo` trocado, logo
       abaixo, e não daqui. Medido em 412px de largura, com o encaixe ligado o
       salto pousa e permanece no destino.

       A precaução vale mesmo assim porque as dobras só ganham
       `scroll-snap-align` em telas altas o bastante (`alturaDobra`), então
       existem larguras em que há pontos de encaixe de verdade e o navegador
       pode reancorar um salto programático. Desligar, saltar e religar cobre
       essas telas sem tirar o encaixe da rolagem normal, que é para o que ele
       existe.

       A rolagem em si é INSTANTÂNEA por medição: com `behavior: 'smooth'`
       este contêiner ignora o pedido em silêncio e não sai do lugar. */
    const snapOriginal = container.style.scrollSnapType;
    container.style.scrollSnapType = 'none';
    container.scrollTop = destino;

    /* A rede de segurança usa `Element.prototype.scrollTo` pelo nome completo,
       e é obrigatório que seja assim.

       O react-native-web pendura o `scrollTo` DELE no nó do DOM do ScrollView,
       por cima do método do navegador. Os dois têm o mesmo nome e assinaturas
       incompatíveis: o do navegador recebe `{ top, behavior }`, o do RNW recebe
       `{ x, y, animated }`. Chamar `container.scrollTo({ top, behavior })` cai
       no do RNW, que lê `y` como indefinido e vira 0, e `animated` como
       indefinido e vira suave.

       Era esse o bug relatado, e o rastro de pilha o mostra inteiro:
       `Element.scroll({top: 0, left: 0, behavior: "smooth"})` saindo de
       `ScrollView.scrollResponderScrollTo` chamado daqui. O salto acertava o
       destino e logo depois a página voltava sozinha ao topo numa animação de
       cerca de um segundo. Medido: 3614 no quadro do toque, decaindo por 3251,
       2007, 593 até 0. Da tela, a leitura é "apertei e continuei no herói".

       A comparação também precisa de tolerância. `destino` sai de
       `getBoundingClientRect()` e é fracionário; o navegador arredonda ao
       guardar. Um `!==` cru dava diferente TODA vez e disparava a rede de
       segurança em todo toque, que é por que a falha nunca parecia
       intermitente. */
    if (Math.abs(container.scrollTop - destino) > 1) {
      const rolarNativo = Element.prototype.scrollTo as (this: Element, opcoes: ScrollToOptions) => void;
      rolarNativo.call(container, { top: destino, behavior: 'auto' });
    }
    /* Religa o encaixe depois de o navegador assentar na posição nova. O
       atraso curto deixa a posição virar a "atual" antes de o encaixe voltar a
       valer, e é imperceptível porque o salto em si é instantâneo. */
    setTimeout(() => {
      container.style.scrollSnapType = snapOriginal;
    }, 250);
    return true;
  }

  /* Último recurso: o próprio alvo se aproxima. O `scrollMarginTop` que cada
     seção já declara é o que mantém o título fora de baixo do cabeçalho aqui. */
  if (typeof alvo.scrollIntoView === 'function') {
    alvo.scrollIntoView({ behavior: 'auto', block: 'start' });
    return true;
  }

  return false;
}

function ConteudoWeb() {
  const insets = useSafeAreaInsets();
  const { ehCompacto, largura, altura } = useBreakpoint();
  const habitosEmpilhados = largura < LARGURA_MINIMA_HABITOS_EM_LINHA;
  const heroCompacto = largura < LARGURA_MINIMA_HERO_LARGO || altura < ALTURA_MINIMA_HERO_LARGO;
  const alturaDobra = useAlturaDobra();
  const rolagemRef = useRef<ScrollView>(null);
  /* Medido em vez de constante: o cabeçalho muda de altura com o `insets.top`
     e com a escala tipográfica da web, e o herói precisa descontar o valor
     REAL pra primeira dobra fechar em 16:9 exatos. */
  const [alturaCabecalho, setAlturaCabecalho] = useState(0);

  /**
   * Leva até a seção por rolagem calculada.
   *
   * Existe porque o `href="#secao"` sozinho não basta nesta página: se a URL já
   * está naquele hash (a pessoa foi para Hábitos, voltou ao topo e tocou em
   * Hábitos de novo), o navegador entende que já chegou e não rola. Somando o
   * `scroll-snap` das dobras e o cabeçalho fixo, o salto nativo vira o pedaço
   * menos previsível da navegação.
   *
   * **A regra de ouro daqui: nunca cancelar a âncora sem rolar no lugar dela.**
   * Uma versão anterior chamava `preventDefault()` LOGO NO INÍCIO e depois
   * desistia com `return` se o nó de rolagem não fosse encontrado. Quando isso
   * acontecia, o toque virava um no-op perfeito: o comportamento nativo tinha
   * sido cancelado e nada assumia o lugar. Da tela, é exatamente o sintoma de
   * "aperto e a página não sai do herói", sem erro nenhum no console.
   *
   * Agora o `preventDefault` só é chamado DEPOIS de a rolagem ter acontecido, e
   * há três caminhos em cascata: o nó do ScrollView, o contêiner rolável
   * encontrado subindo a árvore, e por fim o `scrollIntoView` do próprio alvo.
   * Se os três falharem, a função não cancela nada e o navegador faz o salto
   * nativo — pior alinhado, mas funcionando.
   */
  function navegarParaSecao(href: string, evento?: { preventDefault?: () => void }) {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof window === 'undefined') return;

    const alvo = document.getElementById(href.replace(/^#/, ''));
    if (!alvo) return;

    const rolou = rolarAte(alvo, alturaCabecalho, rolagemRef.current);
    if (!rolou) return; // sem cancelar: o salto nativo da âncora ainda resolve

    evento?.preventDefault?.();

    const destino = `${window.location.pathname}${window.location.search}${href}`;
    if (window.location.hash === href) window.history.replaceState(null, '', destino);
    else window.history.pushState(null, '', destino);
  }

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

  // `tipo` escolhe a cor do ícone: 'faz' usa a mesma cor de lançamento
  // positivo (`theme.up`, verde) já usada pros valores de entrada no mock da
  // página; 'nao' usa a de lançamento negativo (`theme.down`, ciano) — as
  // mesmas duas cores que o resto do app já usa pra "dinheiro entrando" vs.
  // "dinheiro saindo", aqui emprestadas pra "o que o Grana. faz" vs. "o que
  // ele nunca faz", em vez de inventar um terceiro par de cores novo.
  const SEGURANCA = [
    /* Termos técnicos traduzidos para o que a pessoa faz ou vê: "dados
       isolados por conta, reforçado no banco" virou "só você acessa"; o modo
       privacidade ganhou a SITUAÇÃO em que ele serve, que é o que faz a
       função ser entendida. O item de editar/excluir dados é novo: devolve
       controle explícito, que é a objeção real de quem hesita em informar
       gasto para um aplicativo. */
    /* Sem `\n`: estas quebras vinham do layout antigo em cards, e a lista de
       segurança de hoje as apagava em tempo de render. Eram string morta que
       enganava quem lesse daqui achando que controlava a quebra na tela. */
    { icone: 'lock-closed-outline' as const, texto: 'Só você acessa os dados da sua conta.', tipo: 'faz' as const },
    { icone: 'finger-print-outline' as const, texto: 'No aplicativo móvel, bloqueio por biometria ou senha do aparelho, se você ativar.', tipo: 'faz' as const },
    { icone: 'eye-off-outline' as const, texto: 'Oculte seus valores com um toque quando tiver alguém por perto.', tipo: 'faz' as const },
    { icone: 'create-outline' as const, texto: 'Edite seus lançamentos e exclua sua conta e seus dados quando quiser.', tipo: 'faz' as const },
    { icone: 'shield-checkmark-outline' as const, texto: 'Sua senha é conferida contra vazamentos conhecidos no cadastro.', tipo: 'faz' as const },
    { icone: 'ban-outline' as const, texto: 'O Grana. é só registro. Ele nunca movimenta dinheiro de verdade.', tipo: 'nao' as const },
  ];

  // Só o que já é dito em algum outro ponto desta mesma página — nenhum
  // benefício novo inventado pro checklist de Preços.
  //
  // SEM `\n` aqui, de propósito. A quebra fixa funcionava na coluna larga do
  // desktop e destruía o bloco no celular: em 390px cada item cai numa coluna
  // de 234px, então a primeira metade já quebrava sozinha, a quebra forçada
  // entrava no meio e a segunda metade quebrava de novo — quatro linhas
  // irregulares por item, 104px de altura cada. Texto que precisa caber em
  // duas larguras muito diferentes deixa o wrap natural decidir; quebra
  // escolhida à mão só vale onde a largura é previsível (título de dobra).
  const BENEFICIOS_PRECO = [
    'Voz, WhatsApp (texto ou áudio) ou QR Code da nota para lançar',
    /* Não repete mais "calculado sozinho, considerando o que ainda vem" —
       mesma correção da seção de inteligência financeira: a conta usa o mês
       corrente, não parcelas futuras. */
    'Estimativa do Livre para Gastar com base no que você registra',
    'No app móvel, biometria e senha; em toda plataforma, modo privacidade',
    'Edite seus lançamentos e exclua seus dados pelo próprio aplicativo',
    'Acesso completo a todos os recursos, sem plano limitado',
  ];

  return (
    <>
    <ScrollView
      ref={rolagemRef}
      style={[styles.pagina, styles.paginaSnap, { scrollPaddingTop: alturaCabecalho } as any]}
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
        {/* O cabeçalho carrega a marca e "Entrar", e só. A navegação pelas
            seções mora no botão flutuante em TODAS as larguras: a fileira de
            atalhos aqui em cima é o que o autor pediu para tirar, e devolvê-la
            no amplo devolve junto o amontoado que motivou o pedido. */}
        <View style={[colunaConteudo, styles.faixa, ehCompacto && styles.faixaCompacta]}>
          <View style={[styles.cabecalho, { paddingTop: insets.top + spacing.sm }]}>
            <BrandLogotype width={104} />
            <View style={styles.cabecalhoAcoes}>
              <AppPressable
                href="/sign-in"
                scaleOnPress={false}
                style={({ hovered }) => [styles.navLinkAlvo, styles.navEntrarAlvo, hovered && styles.navEntrarAlvoHover]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.navEntrarTexto}>Entrar</Text>
                <Ionicons name="arrow-forward" size={14} color={theme.paper} aria-hidden />
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
      {/* Fatos verificáveis, não autoavaliação. "Sem burocracia", "Sem letra
          miúda" e "Preço simples e fixo" eram opinião da própria empresa sobre
          si mesma, que não funciona como prova. Cada item aqui é checável:
          o WhatsApp é canal oficial (empresa verificada pela Meta), não existe
          conexão bancária e o app roda no navegador. "Verificado pela Meta"
          fala do CANAL — nunca aparece perto
          do bloco de segurança, onde insinuaria endosso do produto. */}
      <TrustMarquee
        itens={[
          'Sem conectar conta bancária',
          'WhatsApp oficial, verificado pela Meta',
          'Funciona direto no navegador',
          'Controle no celular e no computador',
        ]}
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
        <HeroStorytelling ehCompacto={heroCompacto} alturaCabecalho={alturaCabecalho} />
      </View>

      {/* ───────── Reconhece isso? (dor, antes da solução) ─────────
          Cada cena de dor em caixa própria, desalinhadas entre si
          (referência: cards do workshop) — trocou o scrub de brilho
          contínuo que a seção tinha antes. */}
      {/* O offset das âncoras vive no ScrollView (`scrollPaddingTop`) e em
          `navegarParaSecao`, porque `scrollMarginTop` por seção era ignorado
          de forma intermitente pelo navegador junto com scroll-snap. */}
      <View nativeID="produto" style={styles.palcoComCamada}>
        <GradeInterativa />
        <Dobra>
          <View style={styles.secao}>
            <RevealOnScroll style={styles.precoIntroCentralizada}>
              <Text style={[styles.secaoEyebrow, styles.precoTextoCentralizado]}>Quando controlar os gastos fica pelo caminho</Text>
              <TituloSecao estiloExtra={styles.precoTituloCentralizado}>
                {/* Antes: "Anotar gastos dá trabalho. Por isso você não dá
                    continuidade." — atribuía a falha à pessoa, o oposto de uma
                    marca que escuta sem julgar. Agora a fricção do processo é
                    a vilã. Não usa a construção "não é X, é Y", que a marca
                    não aceita. */}
                {/* Sem quebra fixa: a que existia aqui cortava depois de
                    "caber", e no celular a primeira metade já quebrava
                    sozinha antes disso — sobrava a palavra "caber" isolada
                    numa linha só. Quem equilibra as linhas agora é o
                    `textWrap: balance` de `secaoTitulo`, que faz isso na
                    largura real, seja ela qual for. */}
                Controle financeiro precisa caber na rotina para continuar funcionando.
              </TituloSecao>
            </RevealOnScroll>

            <SecaoReconheceIsso />
          </View>
        </Dobra>
      </View>

      {/* ───────── Lançar é esforço quase zero (dobra 3) ─────────
          A facilidade é o diferencial central e antes só aparecia diluída
          entre os canais. Vira argumento próprio, respondendo a frustração
          que a dobra anterior acabou de nomear. Título em três tempos, com o
          terceiro destacado em COR (a Neue Machina não tem itálico, e
          sintetizar quebraria a regra de fonte da marca). */}
      <View style={styles.palcoComCamada}>
        <GradeInterativa />
        <Dobra levantada>
          <View style={styles.secao}>
            <RevealOnScroll style={styles.precoIntroCentralizada}>
              <Text style={[styles.secaoEyebrow, styles.precoTextoCentralizado]}>A parte que você não vai adiar</Text>
              <TituloSecao estiloExtra={styles.precoTituloCentralizado}>
                {'Você fala e o Grana. organiza.\n'}
                <Text style={styles.destaqueInline}>Esforço quase zero.</Text>
              </TituloSecao>
              <Text style={[styles.secaoTexto, styles.precoTextoCentralizado]}>
                Sem formulário e sem planilha. Você diz o que gastou do jeito que falaria para um amigo, e o lançamento já nasce organizado.
              </Text>
            </RevealOnScroll>
          </View>
        </Dobra>
      </View>

      {/* ───────── Granabô no WhatsApp (dobra 4) ─────────
          A dobra mais importante da página: é o diferencial demonstrado, não
          descrito. A conversa mostra o Granabô devolvendo MAIS do que
          recebeu (registra e depois responde quanto já foi gasto na
          categoria) — as duas coisas que a Edge Function realmente faz. */}
      <View nativeID="granabo" style={styles.palcoComCamada}>
        <Dobra>
          <View style={[styles.secao, styles.secaoComCartao, ehCompacto && styles.secaoComCartaoCompacta]}>
            <View style={[styles.colunaTextoSecao, ehCompacto && styles.colunaTextoSecaoCompacta]}>
              <RevealOnScroll>
                <Text style={[styles.secaoEyebrow, ehCompacto && styles.precoTextoCentralizado]}>Conheça o Granabô</Text>
                <TituloSecao>Seu controle também cabe numa conversa no WhatsApp.</TituloSecao>
                <Text style={[styles.secaoTexto, ehCompacto && styles.precoTextoCentralizado]}>
                  Depois de vincular seu número uma vez, envie um texto ou áudio para o Granabô, o assistente do Grana. no WhatsApp. Ele identifica o valor e a descrição, sugere uma categoria e cria o lançamento no Grana. Você só ajusta se precisar.
                </Text>
              </RevealOnScroll>

              <View style={styles.segurancaLista}>
                {['Funciona com texto ou áudio', 'O número fica vinculado só à sua conta', 'Todo lançamento pode ser editado ou excluído no app'].map((f, i) => (
                  <RevealOnScroll key={f} atraso={i * 60}>
                    <View style={styles.segurancaLinha}>
                      <Ionicons name="checkmark-circle" size={16} color={theme.up} aria-hidden />
                      <Text style={styles.segurancaLinhaTexto}>{f}</Text>
                    </View>
                  </RevealOnScroll>
                ))}
              </View>

              <RevealOnScroll>
                <BotaoCTA centralizado={ehCompacto} />
              </RevealOnScroll>
            </View>

            <RevealOnScroll style={[styles.composicaoTelas, ehCompacto && styles.composicaoTelasCompacta]}>
              <ConversaGranabo compacto={ehCompacto} />
            </RevealOnScroll>
          </View>
        </Dobra>
      </View>


      {/* ───────── Construção do hábito (dobra 5) ───────── */}
      <View nativeID="habitos" style={styles.palcoComCamada}>
        <GradeInterativa />
        <Dobra levantada>
          <RevealOnScroll>
            <View style={[styles.secao, styles.secaoComCartao, habitosEmpilhados && styles.secaoComCartaoCompacta]}>
              <View style={[styles.molduraCentralizada, habitosEmpilhados && styles.molduraCentralizadaCompacta]}>
                <MolduraNavegador
                  src="/telas/conquistas-web.webp"
                  legenda="Tela de Desafios do Grana., com sequência, Score e mural de conquistas"
                  largura={ehCompacto ? 300 : 560}
                />
              </View>
              <View style={[styles.colunaTextoSecao, ehCompacto && styles.colunaTextoSecaoCompacta]}>
                <Text style={[styles.secaoEyebrow, ehCompacto && styles.precoTextoCentralizado]}>Do primeiro lançamento ao hábito</Text>
                <TituloSecao>O Grana. ajuda o controle a virar hábito.</TituloSecao>
                <Text style={[styles.secaoTexto, ehCompacto && styles.precoTextoCentralizado]}>
                  A experiência é apoiada em princípios de formação de hábito: um registro fácil de começar, sinais para lembrar e progresso que você consegue enxergar.
                </Text>
                <View style={styles.habitoGrade}>
                  {PILARES_HABITO.map((pilar) => (
                    <View key={pilar.titulo} style={styles.habitoItem}>
                      <View style={styles.habitoIcone} aria-hidden>
                        <Ionicons name={pilar.icone} size={17} color={theme.accent2} />
                      </View>
                      <View style={styles.habitoTexto}>
                        <Text style={styles.habitoTitulo}>{pilar.titulo}</Text>
                        <Text style={styles.habitoDescricao}>{pilar.texto}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </RevealOnScroll>
        </Dobra>
      </View>

      {/* ───────── Inteligência financeira ───────── */}
      <View nativeID="livre" style={styles.palcoComCamada}>
        <GradeInterativa />
        <Dobra>
        <RevealOnScroll>
          <View style={[styles.secao, styles.secaoComCartao, ehCompacto && styles.secaoComCartaoCompacta]}>
            <View style={[styles.colunaTextoSecao, ehCompacto && styles.colunaTextoSecaoCompacta]}>
              {/* Copy e visual agora descrevem a mesma fórmula real. */}
              <Text style={[styles.secaoEyebrow, ehCompacto && styles.precoTextoCentralizado]}>Depois que o lançamento existe</Text>
              <TituloSecao>Saiba quanto dá pra gastar hoje, sem fazer conta.</TituloSecao>
              <Text style={[styles.secaoTexto, ehCompacto && styles.precoTextoCentralizado]}>
                Com base nos seus lançamentos do mês, nas contas que ainda vencem e no que você separou para as metas, o Grana. estima o{' '}
                <Text style={styles.destaqueInline}>Livre para Gastar</Text>
                {' '}por dia. É uma referência baseada no que você registra. Você continua no controle.
              </Text>
            </View>

            <View style={[styles.composicaoTelas, ehCompacto && styles.composicaoTelasCompacta]}>
              <CardLivreParaGastar compacto={ehCompacto} />
            </View>
          </View>
        </RevealOnScroll>
        </Dobra>
      </View>

      {/* ───────── Tudo que o Grana. faz (dobra 8) ─────────
          Cada card mostra o benefício acontecendo. Os mini-mocks substituem
          ícones genéricos e usam somente dados fictícios. */}
      <View nativeID="beneficios" style={styles.palcoComCamada}>
        <GradeInterativa invertida />
        <Dobra levantada>
          <View style={styles.secao}>
            <RevealOnScroll style={styles.precoIntroCentralizada}>
              <Text style={[styles.secaoEyebrow, styles.precoTextoCentralizado]}>Do lançamento ao planejamento</Text>
              <TituloSecao estiloExtra={styles.precoTituloCentralizado}>Tudo que o Grana. faz pela sua saúde financeira.</TituloSecao>
              <Text style={[styles.secaoTexto, styles.precoTextoCentralizado]}>
                Lançamentos, cartões, contas, gráficos e metas ficam conectados numa visão que você consegue acompanhar no dia a dia.
              </Text>
            </RevealOnScroll>

            <View style={styles.beneficiosGrade}>
              {BENEFICIOS_LANDING.map((beneficio, indice) => (
                <RevealOnScroll key={beneficio.variante} atraso={indice * 70} style={styles.beneficioPosicao}>
                  <View style={styles.beneficioCard}>
                    <MiniMockBeneficio variante={beneficio.variante} />
                    <Text style={styles.beneficioTitulo}>{beneficio.titulo}</Text>
                    <Text style={styles.beneficioTexto}>{beneficio.texto}</Text>
                  </View>
                </RevealOnScroll>
              ))}
            </View>
          </View>
        </Dobra>
      </View>

      {/* ───────── Segurança e confiança (dobra 9) ─────────
          As duas metades são deliberadamente separadas: a Meta confirma a
          identidade do canal; as proteções do produto cuidam dos dados. */}
      <View nativeID="seguranca" style={styles.palcoComCamada}>
        <Dobra>
          <View style={styles.secao}>
            <RevealOnScroll style={styles.precoIntroCentralizada}>
              <Text style={[styles.secaoEyebrow, styles.precoTextoCentralizado]}>Identidade do canal e controle dos dados</Text>
              <TituloSecao estiloExtra={styles.precoTituloCentralizado}>É seguro informar meus gastos para um aplicativo?</TituloSecao>
              <Text style={[styles.secaoTexto, styles.precoTextoCentralizado]}>
                Faz sentido perguntar. Aqui estão os fatos que ajudam você a decidir com clareza.
              </Text>
            </RevealOnScroll>

            <View style={styles.segurancaDupla}>
              <RevealOnScroll style={[styles.segurancaPainel, ehCompacto && styles.segurancaPainelCompacto]}>
                <View style={styles.segurancaPainelTopo}>
                  <View style={styles.whatsappIconeFundo} aria-hidden>
                    <Ionicons name="logo-whatsapp" size={20} color={theme.accent2} />
                  </View>
                  <Text style={styles.segurancaPainelRotulo}>Com quem você está falando</Text>
                </View>
                <Text style={styles.segurancaPainelTitulo}>Um canal oficial do Grana. no WhatsApp.</Text>
                <Text style={styles.segurancaPainelTexto}>
                  A verificação da Meta confirma a identidade da empresa e do canal do WhatsApp Business.
                </Text>
                <View style={styles.segurancaListaCompacta}>
                  {[
                    'Seu número é vinculado por um código de 6 dígitos válido por 15 minutos.',
                    'As chamadas recebidas da Meta passam por validação de assinatura.',
                    'O texto transcrito dos áudios não é gravado nos logs do Granabô.',
                  ].map((texto) => (
                    <View key={texto} style={styles.segurancaLinhaLimpa}>
                      <Ionicons name="checkmark-circle" size={16} color={theme.up} aria-hidden />
                      <Text style={styles.segurancaLinhaTextoCompacto}>{texto}</Text>
                    </View>
                  ))}
                </View>
              </RevealOnScroll>

              <RevealOnScroll atraso={90} style={[styles.segurancaPainel, ehCompacto && styles.segurancaPainelCompacto]}>
                <View style={styles.segurancaPainelTopo}>
                  <View style={styles.segurancaIconeFundo} aria-hidden>
                    <Ionicons name="shield-checkmark-outline" size={20} color={theme.accent2} />
                  </View>
                  <Text style={styles.segurancaPainelRotulo}>O que acontece com seus dados</Text>
                </View>
                <Text style={styles.segurancaPainelTitulo}>Você escolhe o que registrar e mantém o controle.</Text>
                <View style={styles.segurancaListaCompacta}>
                  {SEGURANCA.map((s) => (
                    <View key={s.texto} style={styles.segurancaLinhaLimpa}>
                      <Ionicons name={s.icone} size={16} color={s.tipo === 'faz' ? theme.up : theme.down} aria-hidden />
                      <Text style={styles.segurancaLinhaTextoCompacto}>{s.texto}</Text>
                    </View>
                  ))}
                </View>
              </RevealOnScroll>
            </View>

            <RevealOnScroll style={styles.segurancaCta}>
              <BotaoCTA microcopy="Você pode excluir sua conta e seus dados quando quiser." centralizado />
            </RevealOnScroll>
          </View>
        </Dobra>
      </View>

      {/* ───────── Preços ───────── */}
      <View nativeID="precos" style={styles.palcoComCamada}>
        <GradeInterativa />
        <Dobra>
          <View style={styles.secao}>
            <RevealOnScroll style={styles.precoIntroCentralizada}>
              {/* Sem período de teste: o produto é pago desde o primeiro dia. */}
              <Text style={[styles.secaoEyebrow, styles.precoTextoCentralizado]}>Assinatura mensal</Text>
              {/* O preço por dia em destaque de cor é o gatilho desta dobra: o
                  número mensal está logo abaixo, no card, e aqui em cima ele
                  aparece na escala que a pessoa consegue comparar com um café.

                  Com R$ 9,90 a conta fecha redonda: 9,90 ÷ 30 = 0,33 exatos, e
                  "menos de R$ 0,34" vale em todo mês de 30 e 31 dias. Fevereiro
                  é a única exceção (9,90 ÷ 28 = 0,354). */}
              <TituloSecao estiloExtra={styles.precoTituloCentralizado}>
                Seu assistente financeiro por{' '}
                <Text style={styles.destaqueInline}>menos de R$ 0,34 por dia!</Text>
              </TituloSecao>
              <Text style={[styles.secaoTexto, styles.precoTextoCentralizado]}>
                {'Todos os recursos financeiros do Grana. em uma assinatura mensal simples.'}
              </Text>
            </RevealOnScroll>

            {/* Um card só, dividido ao meio — não dois cards soltos lado a
                lado. O checklist (linhas simples, sem caixa individual) fica
                no lado neutro; o painel de preço é o lado com destaque
                visual (`paperSelected`), separado por uma borda em vez de um
                vão entre dois elementos. */}
            <RevealOnScroll style={styles.precoCardUnico}>
              <View style={styles.precoColunas}>
                <View style={[styles.precoChecklistCol, ehCompacto && styles.precoChecklistColCompacta]}>
                  <Text style={[styles.precoChecklistTitulo, ehCompacto && styles.precoTituloCentralizado]}>Tudo que você recebe</Text>
                  <View style={styles.precoChecklist}>
                    {BENEFICIOS_PRECO.map((b) => (
                      <View key={b} style={[styles.precoChecklistLinha, ehCompacto && styles.precoChecklistLinhaCompacta]}>
                        <Ionicons name="checkmark-circle" size={22} color={theme.up} aria-hidden />
                        <Text style={styles.precoChecklistTexto}>{b}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={[styles.cardPreco, ehCompacto && styles.cardPrecoCompacto]}>
                  {/* "Assinatura única" saiu: lido rápido, sugere pagamento
                      único em vez de mensalidade. "Grana. mensal" diz o que é. */}
                  <Text style={[styles.precoRotulo, ehCompacto && styles.precoTituloCentralizado]}>Grana. mensal</Text>
                  {/* Qualificador em linha própria, nunca colado no "/mês":
                      dentro de `precoLinha` (flex row) ele espremia o valor e
                      o preço quebrava em duas linhas. */}
                  <View style={[styles.precoLinha, ehCompacto && styles.precoLinhaCompacta]}>
                    <Text style={styles.precoValor}>R$ 9,90</Text>
                    <Text style={styles.precoPeriodo}>/mês</Text>
                  </View>
                  <Text style={[styles.featureTexto, ehCompacto && styles.precoTextoCentralizado]}>
                    Registre com facilidade, acompanhe seu mês e planeje o que vem pela frente.
                  </Text>
                  <BotaoCTA microcopy="Pagamento processado pela Kiwify." centralizado={ehCompacto} />
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
      <View nativeID="faq" style={styles.palcoComCamada}>
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
                    style={[styles.faqCardPos, ehCompacto && styles.faqCardPosCompacto]}
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
            <View style={[styles.ctaFinalLayout, ehCompacto && styles.ctaFinalLayoutCompacto]}>
              <View style={[styles.ctaFinalConteudo, ehCompacto && styles.ctaFinalConteudoCompacto]}>
                <Text style={[styles.secaoEyebrow, styles.precoTextoCentralizado]}>A clareza do fim do mês começa hoje</Text>
                <Text role="heading" aria-level={2} style={[styles.ctaFinalTitulo, styles.precoTextoCentralizado]}>
                  Nunca é tarde para começar a organizar suas finanças. Comece hoje.
                </Text>
                <Text style={[styles.ctaFinalTexto, styles.precoTextoCentralizado]}>
                  Comece pelos gastos de hoje. O Grana. organiza seus lançamentos e ajuda você a construir um controle que cabe na sua rotina.
                </Text>
                <View style={[styles.ctaFinalFatos, styles.ctaFinalFatosCompacto]}>
                  {['Sem conectar banco', 'Lançamentos organizados', 'Celular e computador'].map((fato) => (
                    <View key={fato} style={styles.ctaFinalFato}>
                      <Ionicons name="checkmark-circle" size={15} color={theme.up} aria-hidden />
                      <Text style={styles.ctaFinalFatoTexto}>{fato}</Text>
                    </View>
                  ))}
                </View>
                <BotaoCTA centralizado />
              </View>
            </View>
          </View>
        </RevealOnScroll>
      </View>

      </View>

      {/* ───────── Rodapé ───────── */}
      <View style={styles.rodapeFundo}>
        <View style={[colunaConteudo, styles.faixa, ehCompacto && styles.faixaCompacta]}>
          <View role="contentinfo" style={[styles.rodape, ehCompacto && styles.rodapeCompacto]}>
            <View style={[styles.rodapeMarca, ehCompacto && styles.rodapeMarcaCompacta]}>
              <BrandLogotype width={96} />
              <Text style={[styles.rodapeDescricao, ehCompacto && styles.precoTextoCentralizado]}>
                Controle financeiro que cabe na sua rotina.
              </Text>
              <AppPressable
                href="https://www.instagram.com/granaponto/"
                target="_blank"
                rel="noopener noreferrer"
                accessibilityLabel="Abrir Instagram do Grana. em nova aba"
                style={({ hovered }) => [styles.instagramRodape, hovered && styles.instagramCabecalhoHover]}
              >
                <Ionicons name="logo-instagram" size={19} color={theme.inkSoft} aria-hidden />
              </AppPressable>
            </View>

            <View role="navigation" accessibilityLabel="Navegação do rodapé" style={[styles.rodapeColunas, ehCompacto && styles.rodapeColunasCompactas]}>
              <View style={styles.rodapeColuna}>
                <Text style={styles.rodapeTitulo}>Produto</Text>
                <AppPressable href="#produto" onPress={(evento) => navegarParaSecao('#produto', evento)} style={styles.rodapeLinkAlvo}><Text style={styles.rodapeLink}>Como funciona</Text></AppPressable>
                <AppPressable href="#granabo" onPress={(evento) => navegarParaSecao('#granabo', evento)} style={styles.rodapeLinkAlvo}><Text style={styles.rodapeLink}>Granabô</Text></AppPressable>
                <AppPressable href="#precos" onPress={(evento) => navegarParaSecao('#precos', evento)} style={styles.rodapeLinkAlvo}><Text style={styles.rodapeLink}>Preços</Text></AppPressable>
                <AppPressable href="#faq" onPress={(evento) => navegarParaSecao('#faq', evento)} style={styles.rodapeLinkAlvo}><Text style={styles.rodapeLink}>Perguntas frequentes</Text></AppPressable>
              </View>
              <View style={styles.rodapeColuna}>
                <Text style={styles.rodapeTitulo}>Conta</Text>
                <AppPressable href="/sign-up" style={styles.rodapeLinkAlvo}><Text style={styles.rodapeLink}>Criar conta</Text></AppPressable>
                <AppPressable href="/sign-in" style={styles.rodapeLinkAlvo}><Text style={styles.rodapeLink}>Entrar</Text></AppPressable>
              </View>
              <View style={styles.rodapeColuna}>
                <Text style={styles.rodapeTitulo}>Transparência</Text>
                <AppPressable href="/termos" style={styles.rodapeLinkAlvo}><Text style={styles.rodapeLink}>Termos de Uso</Text></AppPressable>
                <AppPressable href="/privacidade" style={styles.rodapeLinkAlvo}><Text style={styles.rodapeLink}>Privacidade</Text></AppPressable>
                <AppPressable href="/exclusao-de-dados" style={styles.rodapeLinkAlvo}><Text style={styles.rodapeLink}>Excluir dados</Text></AppPressable>
              </View>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>

    {/* Fora do ScrollView de propósito:  precisa se ancorar
        na janela, e um elemento fixo dentro do contêiner que rola fica
        sujeito ao recorte dele. */}
    <NavFlutuanteLanding itens={NAVEGACAO_LANDING} onNavigate={navegarParaSecao} />
    </>
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
  // margem sobe — 32, não mais 24: com 24 o conteúdo ainda lia como colado
  // na borda em teste real de celular (relato direto do autor).
  faixaCompacta: { paddingHorizontal: spacing.xl + spacing.md },
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
  cabecalhoAcoes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.md, flex: 1 },
  navLinkAlvo: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paperRaised,
    ...({ transitionProperty: 'border-color, background-color, box-shadow', transitionDuration: '180ms' } as any),
  },
  navEntrarAlvo: {
    borderColor: theme.accent,
    backgroundColor: theme.accent,
    ...({ boxShadow: '0 8px 22px -10px rgba(31,169,141,0.8)' } as any),
  },
  navEntrarAlvoHover: {
    borderColor: theme.accent2,
    backgroundColor: theme.accent2,
    ...({ boxShadow: '0 10px 28px -9px rgba(174,255,227,0.55)' } as any),
  },
  navEntrarTexto: { color: theme.paper, fontSize: type.nota, fontFamily: fonts.regular },
  instagramCabecalhoHover: { borderColor: theme.ruleStrong, backgroundColor: theme.hover },

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
    // `lineHeight` era quase igual ao `fontSize` (2px de folga no piso, 0 no
    // teto) — títulos de 2+ linhas (a maioria dos 4 capítulos do herói)
    // liam como texto colado, sem respiro entre as linhas. Agora ~1.14x o
    // tamanho da letra em vez de ~1.0x.
    ...({ fontSize: 'clamp(34px, 2.6vw + 16px, 56px)', lineHeight: 'clamp(40px, 2.8vw + 20px, 64px)', textWrap: 'balance' } as any),
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
    // Mesmo ajuste de respiro entre linhas de `headline`, na escala do
    // compacto — títulos de 2 linhas como "Sabe quanto sobra, sem
    // calcular." liam apertados no celular.
    /*  também aqui: sem ele o H1 do celular terminava com uma palavra sozinha na última linha ("dia!"). */
    ...({ fontSize: 'clamp(26px, 6vw, 32px)', lineHeight: 'clamp(33px, 7.4vw, 41px)', textWrap: 'balance' } as any),
    letterSpacing: -1,
    fontFamily: fonts.regular,
    textAlign: 'center',
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
  cenaCaixa: { backgroundColor: theme.paperRaised, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.rule, padding: spacing.lg, alignItems: 'center', gap: spacing.md, ...sombraCard },
  cenaIcone: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.accentDeep,
  },
  cenaCta: { marginTop: spacing.xxl, alignItems: 'center' },
  textoCena: { color: theme.inkSoft, fontSize: type.corpo, lineHeight: type.corpo * 1.5, fontFamily: fonts.light },
  // A ponte de volta pra solução usa o accent2 da marca — a paleta muda de
  // tom no exato lugar onde a copy muda de tom, saindo das caixas de dor.
  // `type.corpo` (não `type.destaque`, usado antes) — no tamanho de título
  // essa frase de transição competia com o H2 da própria seção logo acima
  // em vez de ler como uma frase de apoio; `type.corpo` é o degrau de texto
  // corrido da escala do design system, não um valor ad hoc.
  pontePergunta: { color: theme.accent2, fontSize: type.corpo, lineHeight: type.corpo * 1.5, fontFamily: fonts.regular, marginTop: spacing.xl, maxWidth: 640 },

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
  secaoComCartaoCompacta: { flexDirection: 'column', alignItems: 'stretch' },
  // `marginBottom` era `spacing.xs` (4) — grudava o eyebrow direto no título
  // seguinte em toda dobra da página, sem respiro nenhum entre os dois
  // (relato direto do autor, com print do site no celular).
  secaoEyebrow: { color: theme.accent2, fontSize: type.legenda, letterSpacing: 1, fontFamily: fonts.regular, textTransform: 'uppercase', marginBottom: spacing.lg },
  /* `textWrap: balance` distribui as linhas de um título sozinho, na largura
     real de cada tela. É o que substitui as quebras fixas (`\n`) que a página
     usava: quebra escolhida à mão acerta numa largura e erra em todas as
     outras, deixando palavra órfã no celular. Web-only, mesmo padrão `as any`
     do resto do arquivo; onde não houver suporte, o texto só quebra do jeito
     normal. */
  secaoTitulo: { color: theme.ink, fontSize: type.cabecalho + 4, fontFamily: fonts.regular, marginBottom: spacing.lg, maxWidth: 640, ...({ textWrap: 'balance' } as any) },
  secaoTituloGrande: { fontSize: 50, lineHeight: 54, letterSpacing: -1.2, maxWidth: 900, marginBottom: spacing.xl },
  /* No celular o título de seção cai de 28 para 23px. Não é preciosismo de
     escala: numa coluna de ~348px, 28px fazia um título como "Controle
     financeiro precisa caber na rotina para continuar funcionando" ocupar
     quatro linhas curtas e irregulares, e nenhuma quebra (fixa ou
     balanceada) conserta um texto que simplesmente não cabe na largura. Com
     23px o mesmo título fecha em três linhas cheias. */
  secaoTituloCompacto: { fontSize: type.cabecalho - 1, lineHeight: (type.cabecalho - 1) * 1.28, letterSpacing: -0.4 },
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
  // No desktop a coluna de texto divide espaço com uma moldura; no compacto
  // ela passa a ficar empilhada. Manter `flex:1` nesse eixo fazia o pai
  // resolver uma altura menor que o conteúdo e o recorte da seção escondia o
  // fim da lista do Guia (especialmente o passo 04).
  colunaTextoSecaoCompacta: { flexGrow: 0, flexBasis: 'auto', width: '100%', minWidth: 0, maxWidth: '100%' },

  // `paddingVertical` dá o respiro vertical pra moldura de trás espiar por
  // cima sem cortar no `overflow:hidden` da seção (mesma razão do
  // `paddingVertical` em `composicaoTelas`, a composição navegador+celular
  // mais abaixo na página).
  molduraCentralizada: { flex: 1, minWidth: 380, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  // No compacto o `minWidth: 380` acima passa da coluna disponível
  // (~342px, viewport de 390px menos o padding de `faixaCompacta`) e
  // estourava largura, cortado pelo `overflow:hidden` da seção.
  molduraCentralizadaCompacta: { flexGrow: 0, flexBasis: 'auto', minWidth: 0, width: '100%' },
  habitoGrade: { gap: spacing.sm, marginTop: spacing.xl },
  habitoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  habitoIcone: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.accentDeep,
  },
  habitoTexto: { flex: 1 },
  habitoTitulo: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular, marginBottom: 2 },
  habitoDescricao: { color: theme.inkSoft, fontSize: type.nota, lineHeight: type.nota * 1.4, fontFamily: fonts.light },
  beneficiosGrade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: spacing.lg,
    marginTop: spacing.xxl,
  },
  beneficioPosicao: { flexGrow: 1, flexBasis: '31%', minWidth: 280 },
  beneficioCard: {
    height: '100%',
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.rule,
    ...sombraCard,
  },
  beneficioTitulo: { color: theme.ink, fontSize: type.corpo, lineHeight: type.corpo * 1.3, fontFamily: fonts.regular, marginBottom: spacing.sm },
  beneficioTexto: { color: theme.inkSoft, fontSize: type.nota, lineHeight: type.nota * 1.5, fontFamily: fonts.light },

  destaqueInline: { color: theme.accent2, fontFamily: fonts.regular },

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
  // Pedido do autor: a dobra de Preços inteira alinhada ao centro no
  // compacto — antes só o eyebrow/título (via `precoIntroCentralizada`, fora
  // deste card) centralizavam; o card do checklist e o de preço abaixo dele
  // ficavam colados na borda esquerda.
  precoChecklistColCompacta: { flexGrow: 0, flexBasis: 'auto', minWidth: 0, width: '100%', maxWidth: '100%', alignItems: 'center' },
  precoChecklistTitulo: { color: theme.ink, fontSize: type.destaque, fontFamily: fonts.regular, marginBottom: spacing.lg },
  // Linhas simples, sem caixa própria por item — o card único inteiro já é
  // o contêiner; uma caixa por linha aqui dentro de outra caixa lia como
  // aninhamento redundante.
  precoChecklist: { gap: spacing.md },
  precoChecklistLinha: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.xs },
  // Cada linha vira um bloco de largura limitada, centralizado pelo pai
  // (`precoChecklistColCompacta`) — o ÍCONE e o TEXTO continuam alinhados à
  // esquerda um do outro dentro do bloco (lê melhor que centralizar cada
  // linha de texto individualmente), só o bloco inteiro passa a ficar no
  // centro da coluna em vez de esticado até a borda.
  precoChecklistLinhaCompacta: { width: '100%', maxWidth: 340, alignSelf: 'center' },
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
  // topo de um painel que agora está embaixo, não ao lado. `alignItems:
  // 'center'` sobrescreve o `flex-start` de `cardPreco` — pedido do autor
  // pra Preços inteiro centralizado no compacto (rótulo, valor e descrição).
  cardPrecoCompacto: { flexGrow: 0, flexBasis: 'auto', minWidth: 0, width: '100%', maxWidth: '100%', alignItems: 'center', borderLeftWidth: 0, borderTopWidth: 1, borderTopColor: theme.ruleStrong },
  precoRotulo: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  precoLinha: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  precoLinhaCompacta: { justifyContent: 'center' },
  // Usa `theme.ink` (não `inkFaint`) porque é um preço real e cobrado, não
  // um valor "a definir" — o apagado era o sinal de que ainda não valia.
  precoValor: { color: theme.ink, fontSize: type.valor + 6, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  precoPeriodo: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.light },
  featureTexto: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: 20, fontFamily: fonts.light },

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

  segurancaDupla: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: spacing.xl, marginTop: spacing.xxl },
  segurancaPainel: {
    flex: 1,
    minWidth: 300,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    ...sombraCard,
  },
  segurancaPainelCompacto: { flexGrow: 0, flexBasis: 'auto', minWidth: 0, width: '100%', maxWidth: '100%' },
  segurancaPainelTopo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  /* `accentDeep`, não o verde `#25D366` do WhatsApp. O DESIGN.md libera a cor
     de marca de terceiro só com necessidade FUNCIONAL — o caso documentado é
     um elemento que representa literalmente o WhatsApp (a bolha da conversa
     em `ConversaGranabo`, que traz a exceção comentada no próprio arquivo).
     Aqui era fundo decorativo de ícone num painel de segurança, e o glifo
     `logo-whatsapp` já identifica o canal sozinho. De quebra os dois painéis
     desta dobra viram um par visual, que é o que eles são. */
  whatsappIconeFundo: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentDeep },
  segurancaIconeFundo: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentDeep },
  segurancaPainelRotulo: { flex: 1, color: theme.accent2, fontSize: type.legenda, lineHeight: type.legenda * 1.35, fontFamily: fonts.regular, textTransform: 'uppercase', letterSpacing: 0.7 },
  segurancaPainelTitulo: { color: theme.ink, fontSize: type.destaque, lineHeight: type.destaque * 1.3, fontFamily: fonts.regular, marginBottom: spacing.md },
  segurancaPainelTexto: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: type.apoio * 1.5, fontFamily: fonts.light },
  segurancaListaCompacta: { gap: spacing.sm, marginTop: spacing.lg },
  segurancaLinhaLimpa: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  segurancaLinhaTextoCompacto: { flex: 1, color: theme.inkSoft, fontSize: type.nota, lineHeight: type.nota * 1.45, fontFamily: fonts.light },
  segurancaCta: { alignItems: 'center', marginTop: spacing.xxl },

  // Coluna que hospeda a prova visual ao lado do texto da seção (a conversa
  // do Granabô, o card de Livre para Gastar). Herdou o nome de quando era
  // uma composição de navegador + celular sobrepostos; hoje centraliza um
  // elemento só.
  composicaoTelas: { flex: 1, minWidth: 380, alignItems: 'center', justifyContent: 'center', position: 'relative', paddingVertical: spacing.xxl },
  composicaoTelasCompacta: { flexGrow: 0, flexBasis: 'auto', minWidth: 0, width: '100%' },

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
  faqCompactoSemFlex: { flexGrow: 0, flexBasis: 'auto', minWidth: 0, width: '100%', maxWidth: '100%' },
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
  faqCardPosCompacto: { minWidth: 0, maxWidth: '100%' },
  faqCard: { backgroundColor: theme.paperRaised, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.rule, padding: spacing.lg, ...sombraCard },
  // Suprime a borda/padding próprios de FaqItem — o card por fora já
  // fornece os dois, dobrar deixaria espaçamento duplicado e uma linha
  // divisória órfã cortando o card ao meio.
  faqItemSemBorda: { borderBottomWidth: 0, paddingVertical: 0 },

  ctaFinalLayout: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl * 2 },
  ctaFinalLayoutCompacto: { flexDirection: 'column', gap: spacing.xxl },
  ctaFinalConteudo: { width: '100%', maxWidth: 760, alignItems: 'center' },
  ctaFinalConteudoCompacto: { minWidth: 0, width: '100%', alignItems: 'center' },
  ctaFinalTitulo: { color: theme.ink, ...({ fontSize: 'clamp(32px, 3.2vw, 52px)', lineHeight: '1.08' } as any), letterSpacing: -1.2, fontFamily: fonts.regular, marginBottom: spacing.lg },
  ctaFinalTexto: { color: theme.inkSoft, fontSize: type.destaque, lineHeight: type.destaque * 1.5, fontFamily: fonts.light, maxWidth: 540 },
  ctaFinalFatos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.xl },
  ctaFinalFatosCompacto: { justifyContent: 'center' },
  ctaFinalFato: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: theme.rule, backgroundColor: theme.paperRaised },
  ctaFinalFatoTexto: { color: theme.inkSoft, fontSize: type.micro, fontFamily: fonts.light },

  rodapeFundo: { backgroundColor: theme.paperRaised, borderTopWidth: 1, borderTopColor: theme.rule },
  rodape: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.xxl * 2,
    paddingVertical: spacing.xxl * 2,
  },
  rodapeMarca: { width: 240, alignItems: 'flex-start', gap: spacing.lg },
  rodapeMarcaCompacta: { width: '100%', alignItems: 'center' },
  rodapeDescricao: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: type.apoio * 1.5, fontFamily: fonts.light },
  instagramRodape: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.ruleStrong, backgroundColor: theme.paper },
  rodapeColunas: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.xxl * 2 },
  rodapeColunasCompactas: { width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.xl },
  rodapeColuna: { minWidth: 150 },
  rodapeTitulo: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular, marginBottom: spacing.md },
  rodapeLinkAlvo: { minHeight: 44, justifyContent: 'center' },
  rodapeCompacto: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.xxl },
  rodapeLink: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, ...({ textDecorationLine: 'none' } as any) },

  /* ───────── Herói ─────────
     As chaves de trilha de gatilhos, marcadores de capítulo e ícone circular
     dos capítulos saíram junto com o herói de 4 capítulos que a reescrita
     aposentou. O herói atual é uma cena só e usa as chaves abaixo. */
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
  heroScrollHint: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
  },
  // `center`, não mais `flex-start` — pedido do autor pra todo H1/H2 (e o
  // texto ao redor) fora de caixa ficar centralizado no compacto; o herói é
  // a PRIMEIRA seção da página nesse padrão, não uma exceção.
  // O ritmo compacto vive no contêiner, não em margens independentes de
  // imagem, eyebrow, H1 e parágrafo. Assim nenhuma margem negativa sobrepõe
  // o texto ao mockup e a distância entre os três grupos fica previsível.
  heroBlocoCompacto: {
    alignItems: 'center',
    gap: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  heroTextoCompacto: { width: '100%', alignItems: 'center', gap: spacing.md },
  heroTextoSemMargem: { marginBottom: 0 },
});
