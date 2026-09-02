import { Platform, useWindowDimensions } from 'react-native';
import { radius } from './theme';

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
 * Toda folha modal do app (comprovante, categoria, data, orçamento etc.) usa
 * o mesmo par `modalScrim`/`sheet`: fundo escurecido + painel ancorado
 * embaixo, esticado `width: '100%'`. Faz sentido no celular — é a única
 * largura que existe —, mas na web larga essa mesma folha esticava de
 * ponta a ponta de um monitor de 1440px+, lendo como bug e não como janela.
 * `medio` (768px) para cima ela passa a ser uma janela centralizada e
 * estreita, do jeito que qualquer modal de desktop se comporta.
 */
export function useSheetFlutuante() {
  const { ehCompacto } = useBreakpoint();
  const flutuante = !ehCompacto;
  return {
    flutuante,
    scrimStyle: flutuante ? sheetFlutuanteScrim : null,
    sheetStyle: flutuante ? sheetFlutuantePainel : null,
  };
}

const sheetFlutuanteScrim = { justifyContent: 'center', alignItems: 'center' } as const;

/** 30% da largura da janela, com piso e teto para não virar uma fresta num
    notebook de 1024px nem uma faixa fina demais num ultrawide. */
const sheetFlutuantePainel = {
  width: '30%',
  minWidth: 420,
  maxWidth: 560,
  maxHeight: '85%',
  borderRadius: radius.xl,
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
