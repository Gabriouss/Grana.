import { useCallback, useState } from 'react';
import { Platform, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { radius, spacing } from './theme';
import { useKeyboardHeight } from './teclado';

/**
 * Classes de largura da janela em web, iOS e Android. O tamanho da janela —
 * inclusive Split View, multiwindow e aparelho dobrável — decide a estrutura;
 * nunca o modelo físico do dispositivo.
 *
 * Os cortes seguem os tamanhos de teste recomendados (320/375/414/768/1024/
 * 1440), escolhendo os dois que mudam de verdade a forma da tela:
 *
 *  - `compacto` (< 768): navegação inferior e uma coluna.
 *  - `medio` (768–1279): estrutura de duas colunas quando a superfície suporta.
 *  - `amplo` (>= 1280): até três colunas.
 *
 * A navegação nativa adapta sua própria forma (tab bar/sidebar no iOS e
 * Navigation Bar no Android). O trilho customizado existe somente na web.
 */

export type ClasseLargura = 'compacto' | 'medio' | 'amplo';

export const CORTES = { medio: 768, amplo: 1280 } as const;

/**
 * Teto de largura do conteúdo. Sem isso, num monitor ultrawide os cards
 * esticariam até 2500px e a linha de texto passaria muito do confortável
 * para leitura; o excedente vira margem dos dois lados.
 */
export const LARGURA_MAXIMA_CONTEUDO = 1440;

/**
 * Colunas de largura limitada, para usar em array de estilo:
 * `style={[styles.content, colunaFormulario]}`.
 *
 * Sem eles, num monitor de 1440px o campo de e-mail da tela de login estica
 * até 1244px: a linha fica longa demais para o olho seguir e o formulário
 * perde a aparência de formulário.
 *
 * ── Por que deixaram de ser só web ────────────────────────────────────────
 *
 * Valiam `null` no nativo, e o `app.json` declara `supportsTablet: true`.
 * O resultado é que num iPad em paisagem o campo de e-mail atravessava mais
 * de 1.300 pontos e a Política de Privacidade corria com linha longa demais,
 * que é a interface de iPhone esticada que a HIG pede para evitar.
 *
 * O teto não muda nada em celular, porque nenhum aparelho chega perto de 720
 * ou 1440, e o de 420 só encosta nos maiores: num iPhone Pro Max de 430pt o
 * formulário fica 10pt mais estreito e CENTRALIZADO, nunca recortado, porque
 * `alignSelf: 'center'` divide a sobra entre os dois lados.
 */
export const colunaFormulario = { width: '100%', maxWidth: 420, alignSelf: 'center' } as const;

/**
 * Coluna para PROSA longa — Termos, Privacidade, texto corrido em geral —
 * e não para formulário. 420px (colunaFormulario) é a largura de um campo de
 * e-mail; esticar um parágrafo de política de privacidade nessa largura
 * quebra a linha a cada 4-5 palavras e lê como coluna de jornal encolhida
 * demais, não como página. ~65-75 caracteres por linha é o alvo de
 * legibilidade de texto corrido; 720px cobre isso na escala tipográfica do
 * app mesmo com a escala de leitura maior da web (ver `type` em lib/theme.ts).
 */
export const colunaLeitura = { width: '100%', maxWidth: 720, alignSelf: 'center' } as const;

export const colunaConteudo = { width: '100%', maxWidth: LARGURA_MAXIMA_CONTEUDO, alignSelf: 'center' } as const;

/**
 * Coluna de LISTA cronológica: extrato de lançamentos e boletos do mês.
 *
 * `colunaConteudo` (1440px) é o teto certo para uma GRADE — a Início espalha
 * cards por ela, a Crédito enfileira cartões, a Desafios monta painéis. Numa
 * lista de linhas "descrição à esquerda, valor à direita" ele produz o
 * contrário: num monitor de 1440 a descrição e o valor da MESMA linha ficam a
 * um metro de olho um do outro, e associar os dois vira trabalho — o problema
 * clássico da tabela larga demais, que a diagramação de jornal resolve há um
 * século com coluna estreita.
 *
 * Não vira grade de duas colunas (`numColumns`) de propósito, apesar de a
 * auditoria de 08/09/2026 ter sugerido isso: extrato se lê na ordem das datas,
 * e duas colunas obrigam o olho a descer, voltar ao topo e descer de novo,
 * perdendo justamente a ordem que dá sentido à lista. Os aplicativos de banco
 * no desktop mantêm uma coluna só, estreita e centralizada, pelo mesmo motivo.
 *
 * 900px cabe folgado a linha mais larga do app (descrição longa + chip de
 * categoria + valor) sem que sobre vão morto no meio dela.
 */
export const colunaLista = { width: '100%', maxWidth: 900, alignSelf: 'center' } as const;

/**
 * Controles que no celular ocupam a linha inteira porque a linha é estreita —
 * abas segmentadas, filtros, seletores. Numa tela larga essa mesma regra
 * espalha três botões por 1400px, e o alvo de clique vira uma faixa
 * atravessando o monitor: o cursor precisa viajar, e o controle deixa de
 * parecer um controle. Aqui ele volta a ter o tamanho do seu conteúdo,
 * ancorado à esquerda junto com o resto da coluna.
 */
export const controleCompacto = { alignSelf: 'flex-start', width: '100%', maxWidth: 460 } as const;

export type Breakpoint = {
  largura: number;
  altura: number;
  classe: ClasseLargura;
  /** Atalhos legíveis — `ehCompacto` lê melhor que `classe === 'compacto'` no meio de um JSX. */
  ehCompacto: boolean;
  ehMedio: boolean;
  ehAmplo: boolean;
  /** `medio` para cima: usa o SideNav customizado. No nativo exige também
      altura >= 600, pra pegar tablet e não celular deitado — ver useBreakpoint. */
  temBarraLateral: boolean;
  /** Colunas sugeridas para grades de cards. */
  colunas: 1 | 2 | 3;
};

/** Classificação pura por largura, testável fora do React. */
export function classificarLargura(largura: number): ClasseLargura {
  if (largura >= CORTES.amplo) return 'amplo';
  if (largura >= CORTES.medio) return 'medio';
  return 'compacto';
}

/**
 * Toda janela de ação do app (comprovante, categoria, data, orçamento,
 * editar/excluir etc.) passa por aqui, e o que ela devolve decide se o painel
 * flutua no centro ou fica colado na borda de baixo.
 *
 * **Flutua em TODA largura, inclusive no celular.** Até 12/09/2026 ela só
 * flutuava de `medio` (768px) para cima; no celular devolvia estilo nulo e o
 * painel voltava a ser a folha ancorada embaixo, com os cantos de cima
 * arredondados e os de baixo retos. O autor pediu a mudança olhando duas
 * telas onde isso incomodava: a janela de Editar/Excluir de um lançamento,
 * em que a palavra "Excluir" ficava por baixo da barra de gestos do Android,
 * e a de Gerenciar categorias. Janela centralizada não tem esse problema,
 * porque nunca encosta na borda.
 *
 * O que muda com a largura é só o TAMANHO. No celular ela ocupa quase tudo,
 * com uma margem lateral fina que vem do recuo do próprio fundo escurecido:
 * o suficiente para ler como janela, e não como a tela inteira. Numa web
 * larga ela vira uma janela estreita, porque esticar de ponta a ponta num
 * monitor de 1440px+ lê como defeito.
 */
export function useSheetFlutuante() {
  const { ehCompacto, altura } = useBreakpoint();
  const alturaTeclado = useKeyboardHeight();

  /* Altura REAL que o fundo escurecido recebeu, medida em vez de calculada.
     É a peça que torna isto independente de aparelho e de sistema. */
  const [alturaMedida, setAlturaMedida] = useState(0);
  const aoMedirFundo = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    // Só reage a mudança real: setState em todo layout é laço de render.
    setAlturaMedida((atual) => (Math.abs(atual - h) > 1 ? h : atual));
  }, []);

  const { recuoInferior, tetoDeAltura } = medidasDeJanelaFlutuante(altura, alturaMedida, alturaTeclado);

  return {
    flutuante: true,
    /** Ligue no `onLayout` do fundo escurecido. Sem isto a conta cai no
        caminho conservador e reserva o teclado por conta própria. */
    aoMedirFundo,
    scrimStyle: { ...sheetFlutuanteScrim, paddingBottom: recuoInferior },
    sheetStyle: {
      ...(ehCompacto ? sheetFlutuantePainelCompacto : sheetFlutuantePainel),
      /* Numérico de propósito: precisa vencer qualquer `maxHeight` em
         porcentagem que o painel traga do próprio estilo, e porcentagem seria
         resolvida contra a tela inteira, que é o que se quer parar de usar
         como referência. */
      maxHeight: tetoDeAltura,
    },
  };
}

/**
 * Onde a janela pode ficar, dado o que o sistema JÁ fez por conta própria.
 *
 * O erro que esta função existe para não repetir: descontar o teclado duas
 * vezes. No Android o sistema costuma encolher a própria janela quando o
 * teclado sobe, então a altura que chega ao app já exclui o teclado; subtrair
 * de novo abria um vão do tamanho do teclado entre a janela e ele, que foi
 * exatamente o que o autor viu e descreveu como "espaço vazio". No iOS, e no
 * Android configurado para empurrar em vez de redimensionar, o sistema não
 * encolhe nada e o desconto precisa acontecer aqui.
 *
 * Em vez de decidir por plataforma, o que envelhece mal, a conta compara o que
 * o app pediu com o que ele recebeu: `alturaJanela - alturaMedida` é quanto o
 * sistema já tirou. Só o que faltar é reservado. Serve aos dois casos e ao
 * intermediário, sem constante de aparelho, sem limiar de tela e sem bandeira
 * de plataforma.
 */
export function medidasDeJanelaFlutuante(
  alturaJanela: number,
  alturaMedida: number,
  alturaTeclado: number
) {
  const margem = spacing.md;
  /* Enquanto a medição não chegou (primeiro render), vale a altura da janela:
     reservar o teclado por conta própria erra para o lado seguro, que é a
     janela menor, e nunca para o lado de ficar escondida atrás do teclado. */
  const disponivel = alturaMedida > 0 ? alturaMedida : alturaJanela;
  const teclado = Math.max(alturaTeclado, 0);
  const jaDescontado = Math.max(alturaJanela - disponivel, 0);
  const reservar = Math.max(teclado - jaDescontado, 0);

  return {
    /* Limitado ao próprio espaço: um recuo maior que o container empurraria o
       painel inteiro para fora da tela. */
    recuoInferior: Math.min(margem + reservar, disponivel),
    tetoDeAltura: Math.max(disponivel - reservar - margem * 2, 0),
  };
}

/* O recuo é o que cria a margem lateral da janela no celular, e por isso vive
   no fundo e não no painel: assim o painel pode continuar pedindo
   `width: '100%'` sem encostar na borda da tela. */
const sheetFlutuanteScrim = { justifyContent: 'center', alignItems: 'center', padding: spacing.md } as const;

/* Os quatro cantos precisam ser declarados juntos. O estilo base das folhas
   arredonda só os de cima (`borderTopLeftRadius`), e em React Native a
   propriedade específica vence a genérica: sem repetir as duas de cima aqui,
   a janela flutuante ficaria com o rodapé arredondado e o topo no raio
   antigo do Android. */
const cantosDeJanela = {
  borderRadius: radius.xl,
  borderTopLeftRadius: radius.xl,
  borderTopRightRadius: radius.xl,
} as const;

/** Celular: quase a largura toda, com a margem vindo do recuo do fundo. */
const sheetFlutuantePainelCompacto = {
  width: '100%',
  ...cantosDeJanela,
} as const;

/** Web larga: 30% da janela, com piso e teto para não virar uma fresta num
    notebook de 1024px nem uma faixa fina demais num ultrawide. */
const sheetFlutuantePainel = {
  width: '30%',
  minWidth: 420,
  maxWidth: 560,
  ...cantosDeJanela,
} as const;

export function useBreakpoint(): Breakpoint {
  const { width, height } = useWindowDimensions();
  const classe = classificarLargura(width);

  return {
    largura: width,
    altura: height,
    classe,
    ehCompacto: classe === 'compacto',
    ehMedio: classe === 'medio',
    ehAmplo: classe === 'amplo',
    /* Já foi `Platform.OS === 'web' && classe !== 'compacto'`, e a
       justificativa era real na época: no iPad quem entregava a sidebar era o
       `sidebarAdaptable` das Native Tabs, e ligar o trilho customizado junto
       daria DUAS navegações laterais na mesma tela.

       As Native Tabs foram removidas (tela branca pós-biometria, ver o
       histórico em `app/(app)/_layout.tsx`), então não existe mais sidebar do
       sistema pra competir — e a trava virou o problema: num iPad ou tablet
       Android a barra flutuante passou a ser a única navegação, esticada de
       ponta a ponta com cinco itens `flex: 1` numa tela de 1024pt+. É o
       "phone bottom-bar num tablet" que o Material cita como erro.

       O piso de altura existe pra mirar TABLET e não celular deitado: um
       iPhone em paisagem passa dos 768 de largura (~844) mas tem ~400 de
       altura, enquanto qualquer tablet tem 744+ nos dois eixos em qualquer
       orientação. Trocar a navegação do celular ao girar a tela seria uma
       mudança de comportamento que ninguém pediu e que não foi validada em
       aparelho — fica de fora até alguém ver rodando. Na web o critério
       segue só a largura, exatamente como era antes. */
    temBarraLateral: classe !== 'compacto' && (Platform.OS === 'web' || height >= 600),
    colunas: classe === 'amplo' ? 3 : classe === 'medio' ? 2 : 1,
  };
}
