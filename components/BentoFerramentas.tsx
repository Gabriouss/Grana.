import { createElement, useCallback, useEffect, useState, type ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts as uiFonts, lh, radius, sombraCard, spacing, theme, type } from '@/lib/theme';
import { corDaCategoria } from '@/lib/chart-colors';
import { EXEMPLO_CONVERSA, EXEMPLO_LIVRE, emReais } from '@/lib/exemplo-landing';
import RevealOnScroll from '@/components/RevealOnScroll';
import { useEntradaNaTela } from '@/lib/motion';

const fonts = { regular: uiFonts.brandRegular, light: uiFonts.brandLight };

/* A curva de entrada que o sistema já usa no reveal da página (a mesma do
   `bento-grid-01`, [0.16, 1, 0.3, 1]). */
const CURVA = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * O Panorama de ferramentas da web (bloco 5), no formato do componente
 * `bento-grid-01` que o autor pediu em 13/09/2026: grade assimétrica de seis
 * colunas com blocos altos (2×2), padrão (2×1) e largos (3×1), um desenho
 * VIVO dentro de cada bloco e resposta ao ponteiro.
 *
 * ── O que foi portado, e o que não foi ──────────────────────────────────
 * O componente original é shadcn + Tailwind + framer-motion + lucide-react,
 * com `font-serif`, `font-medium`, cinzas `zinc` e imagens do Unsplash. Nada
 * disso existe ou cabe aqui: o projeto é Expo Router com react-native-web e
 * design system próprio, a marca usa só Neue Machina Light e Regular, e a
 * política de segurança do site bloqueia imagem de outro domínio. Então veio
 * a ESTRUTURA (as colunas, os vãos, a proporção dos blocos, o texto no pé de
 * cada um) e o MOVIMENTO (entrada escalonada, desenho que se completa ao
 * entrar na tela, escala no ponteiro), feitos com View, CSS e os tokens.
 *
 * ── Por que réplicas, e não recortes das capturas ────────────────────────
 * Até esta mudança os cards usavam recortes das capturas reais
 * (`RecorteTela`). Numa grade de linhas baixas isso não fecha: um bloco largo
 * tem uma área visual de uns 650×125px, e a captura teria que ser esticada e
 * borrada. Então cada bloco desenha a sua tela em código — e em vez de
 * inventar, como faziam os mini-mocks que o autor reprovou, cada desenho
 * copia rótulo, número, formato e cor de uma captura real, apontada no
 * comentário de cada um. Para conferir: abrir a captura citada e comparar.
 *
 * ── Largura ───────────────────────────────────────────────────────────────
 * Cada desenho recebe a largura REAL da sua área, medida com `onLayout`, e se
 * rearranja a partir dela (o fluxo empilha os filtros, os cofrinhos passam a
 * um por linha). Não dá para decidir pela largura da janela: o mesmo bloco
 * tem ~300px num celular, num tablet em duas colunas e ~330px no bento a
 * 1200px. A
 * primeira versão só foi medida a 1440px, onde tudo cabia; abaixo de 1280px o
 * Livre para Gastar vazava pelos lados e cobria o próprio texto (visto na
 * captura de celular e medido em 13 larguras, de 360 a 1920).
 *
 * ── Movimento ─────────────────────────────────────────────────────────────
 * Tudo roda UMA vez, quando o bloco entra na tela. Uma página que fala de
 * dinheiro não pisca em laço. Com "reduzir movimento", tudo nasce pronto.
 */
export default function BentoFerramentas({ largura }: { largura: number }) {
  /* O bento começa em 1200px, e não em 1100 como na primeira versão: entre as
     duas larguras (iPad na horizontal tem 1180 e 1194) os blocos altos ficavam
     com ~300px, o texto do Orçamento ocupava cinco linhas e, com os rótulos
     alinhados, sobrava um vão de ~90px embaixo do texto de Boletos. Em duas
     colunas, a mesma janela dá ~520px por bloco. */
  const layout: Layout = largura >= 1200 ? 'bento' : largura >= 700 ? 'duas' : 'uma';
  const blocos = layout === 'duas' ? ORDEM_DUAS_COLUNAS.map((chave) => BLOCOS.find((b) => b.chave === chave)!) : BLOCOS;

  /* Altura natural do texto de cada bloco, medida. Blocos que terminam na
     mesma linha da grade recebem todos a altura do texto mais alto do grupo,
     e o texto começa no topo dessa altura: assim o rótulo de um bloco fica
     na mesma linha do rótulo do vizinho. Sem isso, o texto ancorado no pé
     deixava os rótulos desencontrados sempre que um título ou descrição
     quebrava e o do lado não (50px de diferença em duas colunas a 768px). */
  const [alturasTexto, setAlturasTexto] = useState<Record<string, number>>({});
  const medirTexto = useCallback((chave: string, altura: number) => {
    setAlturasTexto((atual) => (atual[chave] === altura ? atual : { ...atual, [chave]: altura }));
  }, []);
  const alturaDoGrupo = (grupo: string | null) =>
    grupo === null
      ? 0
      : Math.max(0, ...blocos.filter((b, i) => grupoTexto(layout, b.chave, i) === grupo).map((b) => alturasTexto[b.chave] ?? 0));

  const estiloGrade =
    layout === 'bento'
      /* No mínimo 256px por linha, e a linha CRESCE se o conteúdo pedir. Com
         altura fixa, abaixo de 1280px o texto de um bloco quebrava em duas
         linhas e o desenho era cortado por baixo (o cartão perdia 9px). */
      ? { gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gridAutoRows: 'minmax(256px, auto)' }
      : layout === 'duas'
        ? { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridAutoRows: 'auto' }
        : { gridTemplateColumns: 'minmax(0, 1fr)', gridAutoRows: 'auto' };

  return (
    <View role="list" aria-label="Ferramentas do Grana." style={[styles.grade, estiloGrade as any]}>
      {blocos.map((bloco, i) => (
        <Bloco
          key={bloco.chave}
          bloco={bloco}
          indice={i}
          layout={layout}
          alturaTexto={alturaDoGrupo(grupoTexto(layout, bloco.chave, i))}
          aoMedirTexto={medirTexto}
        />
      ))}
    </View>
  );
}

type Layout = 'bento' | 'duas' | 'uma';
type PropsVisual = { ativo: boolean; instantaneo: boolean; largura: number };

type BlocoDef = {
  chave: string;
  tamanho: 'alto' | 'padrao' | 'largo';
  rotulo: string;
  titulo: string;
  texto: string;
  Visual: ComponentType<PropsVisual>;
};

const BLOCOS: BlocoDef[] = [
  { chave: 'livre', tamanho: 'alto', rotulo: 'Livre para Gastar', titulo: 'Veja quanto sobra no mês', texto: 'Contas e cofrinhos já descontados, dividido pelos dias que faltam.', Visual: VisualLivre },
  { chave: 'cartao', tamanho: 'padrao', rotulo: 'Cartões', titulo: 'A fatura pelo ciclo', texto: 'Limite usado e compras parceladas mês a mês.', Visual: VisualCartao },
  { chave: 'orcamento', tamanho: 'alto', rotulo: 'Orçamento', titulo: 'Um teto por categoria', texto: 'Veja como os gastos do mês se dividem e defina quanto quer gastar em cada uma.', Visual: VisualOrcamento },
  { chave: 'boletos', tamanho: 'padrao', rotulo: 'Boletos', titulo: 'Contas com vencimento', texto: 'Quantos dias faltam para cada conta.', Visual: VisualBoletos },
  { chave: 'fluxo', tamanho: 'largo', rotulo: 'Fluxo', titulo: 'Entradas e saídas', texto: 'Por mês, pelos últimos sete dias ou pelo ano.', Visual: VisualFluxo },
  { chave: 'comprometido', tamanho: 'largo', rotulo: 'Gráficos', titulo: 'O que já está comprometido', texto: 'Contas recorrentes e parcelas dos próximos seis meses.', Visual: VisualComprometido },
  { chave: 'categorias', tamanho: 'largo', rotulo: 'Categorias', titulo: 'Cada lançamento na sua categoria', texto: 'O Grana. sugere a categoria e você troca se precisar.', Visual: VisualCategorias },
  { chave: 'cofrinhos', tamanho: 'largo', rotulo: 'Cofrinhos', titulo: 'Metas com valor e prazo', texto: 'Separe dinheiro para um objetivo e acompanhe quanto já guardou.', Visual: VisualCofrinhos },
];

/* Em duas colunas cada fileira é um par, e a fileira tem a altura do bloco
   mais alto. Na ordem do bento, o Livre (desenho de ~300px) dividiria a
   fileira com Cartões (~125px), que ficaria com um vão enorme em volta do
   cartão. Os pares abaixo juntam desenhos de altura parecida. */
const ORDEM_DUAS_COLUNAS = ['livre', 'orcamento', 'cartao', 'boletos', 'fluxo', 'comprometido', 'categorias', 'cofrinhos'];

/* As proporções do `bento-grid-01`: alto = 2 colunas por 2 linhas, padrão =
   2 por 1, largo = 3 por 1. Na ordem de `BLOCOS`, o posicionamento automático
   da grade monta exatamente: alto | padrão | alto, depois padrão no vão do
   meio, depois duas fileiras de largos. */
const SPAN = {
  alto: { gridColumn: 'span 2', gridRow: 'span 2' },
  padrao: { gridColumn: 'span 2', gridRow: 'span 1' },
  largo: { gridColumn: 'span 3', gridRow: 'span 1' },
} as const;

/* Quais blocos terminam na mesma linha da grade. No bento, Livre, Boletos e
   Orçamento fecham juntos a segunda fileira (os altos ocupam duas), Cartões
   fecha a primeira sozinho, e os largos fecham de dois em dois. Em duas
   colunas, cada par. Numa coluna ninguém tem vizinho. */
const GRUPO_TEXTO_BENTO: Record<string, string> = {
  cartao: 'fileira-1',
  livre: 'fileira-2',
  boletos: 'fileira-2',
  orcamento: 'fileira-2',
  fluxo: 'fileira-3',
  comprometido: 'fileira-3',
  categorias: 'fileira-4',
  cofrinhos: 'fileira-4',
};
function grupoTexto(layout: Layout, chave: string, indice: number): string | null {
  if (layout === 'bento') return GRUPO_TEXTO_BENTO[chave] ?? null;
  if (layout === 'duas') return `par-${Math.floor(indice / 2)}`;
  return null;
}

function Bloco({
  bloco,
  indice,
  layout,
  alturaTexto,
  aoMedirTexto,
}: {
  bloco: BlocoDef;
  indice: number;
  layout: Layout;
  alturaTexto: number;
  aoMedirTexto: (chave: string, altura: number) => void;
}) {
  const [sobre, setSobre] = useState(false);
  const [larguraArea, setLarguraArea] = useState(0);
  /* Um observador por bloco, e não um só para a grade: empilhada, a grade
     passa de 2.500px no celular, e com um observador só os desenhos lá de
     baixo terminavam de se montar antes de a pessoa rolar até eles. */
  const { ref, ativo, instantaneo } = useEntradaNaTela('0px 0px -10% 0px');
  /* O `bento-grid-01` cresce os blocos altos (1.02) e encolhe os outros
     (0.98) sob o ponteiro. Aqui a mesma ideia, mais contida: 1.015 e 0.985.
     Com o conteúdo sendo dado de dinheiro, escala grande lê como instável. */
  const escala = bloco.tamanho === 'alto' ? 1.015 : 0.985;
  /* O escalonamento só faz sentido entre blocos que entram JUNTOS: no bento,
     a grade inteira; em duas colunas, os dois do par; numa coluna, cada bloco
     entra sozinho, e um atraso de até meio segundo seria só espera. */
  const atraso = layout === 'bento' ? indice * 70 : layout === 'duas' ? (indice % 2) * 70 : 0;
  const { Visual } = bloco;
  return (
    <RevealOnScroll
      atraso={atraso}
      variante="card"
      style={[styles.celula, layout === 'bento' && (SPAN[bloco.tamanho] as any)]}
    >
      <View
        ref={ref}
        role="listitem"
        style={[
          styles.bloco,
          layout === 'uma' && styles.blocoCelular,
          sobre && styles.blocoSobre,
          { transform: [{ scale: sobre ? escala : 1 }] },
        ]}
        {...({
          onMouseEnter: () => setSobre(true),
          onMouseLeave: () => setSobre(false),
        } as any)}
      >
        <View
          style={[styles.visual, layout === 'uma' && styles.visualCelular]}
          aria-hidden
          onLayout={(e) => {
            const w = Math.round(e.nativeEvent.layout.width);
            setLarguraArea((atual) => (atual === w ? atual : w));
          }}
        >
          {/* `instantaneo` também quando o bloco está escondido para encenar:
              esconder com transição faria o desenho animar o sumiço. */}
          <Visual ativo={ativo} instantaneo={instantaneo || !ativo} largura={larguraArea} />
        </View>
        {/* A altura mínima vai no invólucro e a medida sai do miolo: medir o
            próprio invólucro devolveria a altura imposta, e o grupo nunca
            mais encolheria quando a janela alargasse. */}
        <View style={alturaTexto > 0 ? { minHeight: alturaTexto } : undefined}>
          <View
            style={styles.textos}
            onLayout={(e) => aoMedirTexto(bloco.chave, Math.ceil(e.nativeEvent.layout.height))}
          >
            <Text style={styles.rotulo}>{bloco.rotulo}</Text>
            <Text style={styles.titulo}>{bloco.titulo}</Text>
            <Text style={styles.texto}>{bloco.texto}</Text>
          </View>
        </View>
      </View>
    </RevealOnScroll>
  );
}

/* ──────────────────────────── visuais ──────────────────────────── */

/* Transição de CSS com atraso, zerada quando o movimento é reduzido. */
function transicao(instantaneo: boolean, propriedade: string, duracao: number, atraso = 0) {
  return (instantaneo
    ? {}
    : { transitionProperty: propriedade, transitionDuration: `${duracao}ms`, transitionDelay: `${atraso}ms`, transitionTimingFunction: CURVA }) as any;
}

/* Captura: public/telas/inicio-web.png, card "Livre para gastar". As linhas
   entram uma a uma, na ordem da conta, e o valor por dia conta até o fim:
   o desenho MOSTRA a subtração que o card faz.
   Em área estreita as linhas quebram como no card real do celular
   (public/telas/inicio-mobile.png: "Livre no total · 26 dias / restantes",
   com o valor centrado ao lado). */
function VisualLivre({ ativo, instantaneo, largura }: PropsVisual) {
  const porDia = useContagem(EXEMPLO_LIVRE.porDia, ativo, instantaneo, 900, 520);
  /* Abaixo de 330px a coluna das descrições ficava com ~110px e quebrava em
     TRÊS linhas ("Contas a / vencer este / mês", medido a 360px, a largura
     da maioria dos Android). Compacto, as linhas descem um degrau para `nota`,
     o mesmo corpo do card real no celular, e o vão entre descrição e valor
     encolhe. */
  const compacto = largura < 330;
  const linhas: { chave: string; valor: string; forte?: boolean }[] = [
    { chave: 'Saldo atual', valor: emReais(EXEMPLO_LIVRE.saldo) },
    { chave: 'Contas a vencer este mês', valor: `− ${emReais(EXEMPLO_LIVRE.contas)}` },
    { chave: 'Reservado em cofrinhos', valor: `− ${emReais(EXEMPLO_LIVRE.cofrinhos)}` },
    { chave: `Livre no total · ${EXEMPLO_LIVRE.diasRestantes} dias restantes`, valor: emReais(EXEMPLO_LIVRE.livreNoTotal), forte: true },
  ];
  return (
    <View style={[styles.telaCard, styles.cheio]}>
      <Text style={styles.miniRotulo}>Livre para gastar</Text>
      {/* Valor e sufixo como dois itens de uma linha flexível: sem lugar ao
          lado do valor, o sufixo desce INTEIRO e logo abaixo dele. Como texto
          corrido, a quebra caía em "até o / fim do mês", e o sufixo descido
          herdava a entrelinha de 37px do valor, soltando-se dele. Não há
          limiar escrito à mão: quem decide se os dois cabem é a própria linha. */}
      <View style={styles.livreCabeca}>
        <Text style={styles.livreValor}>{emReais(porDia)}</Text>
        <Text style={styles.livreSufixo}>/dia até o fim do mês</Text>
      </View>
      <View style={{ gap: 6, marginTop: spacing.sm }}>
        {linhas.map((l, i) => (
          <View
            key={l.chave}
            style={[
              styles.linhaConta,
              compacto && styles.linhaContaCompacta,
              { opacity: ativo ? 1 : 0, transform: [{ translateY: ativo ? 0 : 6 }] },
              transicao(instantaneo, 'opacity, transform', 420, 120 + i * 130),
            ]}
          >
            <Text style={[styles.contaChave, compacto && styles.contaChaveCompacta, l.forte && styles.contaForte]}>{l.chave}</Text>
            <Text style={[styles.contaValor, compacto && styles.contaValorCompacta, l.forte && styles.contaForte]}>{l.valor}</Text>
          </View>
        ))}
      </View>
      {/* A dica de perfil que o card real mostra embaixo da conta, com o texto
          e os emojis da captura. Entra por último, depois da subtração. */}
      <Text
        style={[
          styles.livreDica,
          { opacity: ativo ? 1 : 0 },
          transicao(instantaneo, 'opacity', 500, 120 + linhas.length * 130 + 200),
        ]}
      >
        💡 Seu comportamento recente lembra o perfil 🧱 Construtor de Reserva. Vale refazer o diagnóstico no Perfil.
      </Text>
    </View>
  );
}

/* Captura: public/telas/credito-mobile.png, cartão "Nubank Ultravioleta".
   Fatura e limite vêm de `EXEMPLO_CONVERSA`, os mesmos que o Granabô cita no
   bloco 8; o percentual é a conta dos dois (1.342,50 ÷ 8.500 = 16%, o mesmo
   da tela real), e a barra enche até ele. */
const ROXO_CARTAO_DEMO = '#8a3ffc';
function VisualCartao({ ativo, instantaneo }: PropsVisual) {
  const { cartao, valor, limite } = EXEMPLO_CONVERSA.fatura;
  const usado = `${Math.round((valor / limite) * 100)}%`;
  return (
    <View style={[styles.telaCard, styles.cartao]}>
      {/* Linha que QUEBRA em vez de cortar: sem lugar, o final do cartão desce
          para baixo do nome. A 360px o nome saía "Nubank Ultravio…" (medido). */}
      <View style={styles.linhaQuebra}>
        <View style={styles.linhaNome}>
          <View style={[styles.pontoCor, { backgroundColor: ROXO_CARTAO_DEMO }]} />
          <Text style={styles.cartaoNome}>{cartao}</Text>
        </View>
        <Text style={styles.cartaoFinal}>•••• 4092</Text>
      </View>
      <View>
        <Text style={styles.miniRotulo}>Fatura atual</Text>
        <Text style={styles.cartaoFatura}>{emReais(valor)}</Text>
      </View>
      {/* "Limite" e o percentual na MESMA linha, acima da barra, como na tela
          real de Crédito. */}
      <View style={styles.linhaTopo}>
        <Text style={styles.miniApoio}>Limite: {emReais(limite)}</Text>
        <Text style={styles.cartaoPct}>{usado}</Text>
      </View>
      <View style={styles.trilho}>
        <View style={[styles.preenchido, { backgroundColor: ROXO_CARTAO_DEMO, width: ativo ? usado : '0%' }, transicao(instantaneo, 'width', 900, 300)]} />
      </View>
    </View>
  );
}

/* Captura: public/telas/inicio-web.png, card "Gastos por categoria". Cores de
   `corDaCategoria`, as mesmas do gráfico do app. As fatias se desenham em
   sequência. As quatro maiores e seus percentuais são os da captura; as duas
   menores dividem os 10% que a captura mostra sem rótulo. */
function VisualOrcamento({ ativo, instantaneo, largura }: PropsVisual) {
  const fatias = [
    { nome: 'Moradia', pct: 50 },
    { nome: 'Alimentação', pct: 20 },
    { nome: 'Transporte', pct: 14 },
    { nome: 'Lazer', pct: 6 },
    { nome: 'Assinaturas', pct: 5 },
    { nome: 'Saúde', pct: 5 },
  ];
  /* Legenda em 2×2, e não em linha que quebra sozinha: com quatro chips de
     larguras diferentes, a quebra automática deixava "Lazer 6%" sozinho na
     segunda linha. Abaixo de 300px dois chips não cabem lado a lado sem o
     texto de dentro quebrar, e a legenda vira uma coluna. */
  const umaColuna = largura < 300;
  const R = 46;
  const C = 2 * Math.PI * R;
  let acumulado = 0;
  return (
    <View style={styles.orcamento}>
      <View style={styles.linhaQuebra}>
        <Text style={styles.telaTitulo}>Gastos por categoria</Text>
        <Text style={styles.valorSaida}>− {emReais(1235)}</Text>
      </View>
      <View style={styles.donutArea}>
        {createElement(
          'svg',
          { width: 196, height: 196, viewBox: '0 0 120 120', role: 'presentation' },
          fatias.map((f, i) => {
            const comprimento = (f.pct / 100) * C;
            const inicio = acumulado;
            acumulado += comprimento;
            /* Um vão de 2 unidades entre as fatias, igual ao do gráfico real. */
            const traco = Math.max(0, comprimento - 2);
            return createElement('circle', {
              key: f.nome,
              cx: 60,
              cy: 60,
              r: R,
              fill: 'none',
              stroke: corDaCategoria(f.nome),
              strokeWidth: 16,
              strokeDasharray: `${traco} ${C}`,
              strokeDashoffset: ativo ? -inicio : -inicio + traco,
              transform: 'rotate(-90 60 60)',
              style: instantaneo
                ? undefined
                : { transition: `stroke-dashoffset 700ms ${CURVA} ${200 + i * 140}ms` },
            });
          })
        )}
      </View>
      <View style={styles.chipsLegenda}>
        {fatias.slice(0, 4).map((f) => (
          <View key={f.nome} style={[styles.chipLegenda, { flexBasis: umaColuna ? '100%' : '46%' }]}>
            <View style={[styles.pontoCor, { backgroundColor: corDaCategoria(f.nome) }]} />
            <Text style={styles.chipLegendaTexto}>
              {f.nome} <Text style={styles.chipLegendaPct}>{f.pct}%</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* Captura: public/telas/contas-mobile.png, contas de energia e internet (as
   duas recorrentes, com o ícone de repetição). A conta do cartão fica de fora
   de propósito: nas capturas ela vale R$ 1.340,55, e a fatura do mesmo cartão,
   no bloco ao lado, R$ 1.342,50 — a própria demonstração do app diverge nos
   centavos, e lado a lado isso leria como erro. */
function VisualBoletos({ ativo, instantaneo, largura }: PropsVisual) {
  /* Abaixo de 330px o nome e a coluna do prazo não cabem na mesma linha
     ("Internet · Vivo Fi…", medido a 390 e 768px). Estreita, a conta vira
     duas linhas: o nome inteiro em cima, prazo e valor embaixo; a categoria
     sai, que é o dado de menor peso da linha. */
  const estreito = largura < 330;
  const contas = [
    { nome: 'Energia · Enel', categoria: 'Moradia', valor: 214.9, prazo: 'vence em 13d' },
    { nome: 'Internet · Vivo Fibra', categoria: 'Moradia', valor: 99.9, prazo: 'vence em 15d' },
  ];
  return (
    <View style={[styles.cheio, { gap: 6 }]}>
      {contas.map((c, i) => (
        <View
          key={c.nome}
          style={[
            styles.telaCard,
            estreito ? styles.contaEstreita : styles.conta,
            { opacity: ativo ? 1 : 0, transform: [{ translateX: ativo ? 0 : 10 }] },
            transicao(instantaneo, 'opacity, transform', 480, 200 + i * 160),
          ]}
        >
          {estreito ? (
            <>
              <View style={styles.linhaNome}>
                <Text style={styles.contaNome}>{c.nome}</Text>
                <Ionicons name="repeat" size={11} color={theme.inkFaint} />
              </View>
              <View style={styles.linhaTopo}>
                <Text style={styles.chipPrazo}>{c.prazo}</Text>
                <Text style={styles.contaValorBoleto}>{emReais(c.valor)}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.linhaNome}>
                  <Text style={styles.contaNome} numberOfLines={1}>{c.nome}</Text>
                  <Ionicons name="repeat" size={11} color={theme.inkFaint} />
                </View>
                <Text style={styles.miniApoio}>{c.categoria}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Text style={styles.chipPrazo}>{c.prazo}</Text>
                <Text style={styles.contaValorBoleto}>{emReais(c.valor)}</Text>
              </View>
            </>
          )}
        </View>
      ))}
    </View>
  );
}

/* Captura: public/telas/inicio-web.png, card "Fluxo financeiro": filtros de
   período e de tipo, com Mês e Entradas selecionados como na captura, e o
   total de entradas do mês. A linha do período se desenha ao entrar. */
function VisualFluxo({ ativo, instantaneo, largura }: PropsVisual) {
  /* Lado a lado, os filtros levam ~210px e o gráfico precisa de uns 200 para
     ler como tendência. Abaixo de 440px o gráfico desce para baixo dos
     filtros, com a largura inteira do card (a 390px ele vazava 376px). */
  const estreito = largura < 440;
  const caminho = 'M0 46 L40 44 L80 40 L120 42 L160 30 L200 34 L240 18 L280 22 L320 10 L360 14';
  return (
    <View style={[styles.telaCard, styles.cheio, estreito ? styles.fluxoEstreito : styles.fluxo]}>
      <View style={{ gap: 6, flexShrink: 0 }}>
        <View style={styles.linhaQuebra}>
          <Text style={styles.telaTitulo}>Fluxo financeiro</Text>
          <Text style={styles.valorEntrada}>+ {emReais(7050)}</Text>
        </View>
        <Segmentado opcoes={['Mês', '7 Dias', 'Ano']} ativa={0} />
        <Segmentado opcoes={['Entradas', 'Saídas', 'Ambos']} ativa={0} />
      </View>
      <View style={estreito ? styles.fluxoGraficoEstreito : styles.fluxoGrafico}>
        {createElement(
          'svg',
          { width: '100%', height: 56, viewBox: '0 0 360 56', preserveAspectRatio: 'none', role: 'presentation' },
          createElement('path', {
            d: caminho,
            fill: 'none',
            stroke: theme.up,
            strokeWidth: 2,
            vectorEffect: 'non-scaling-stroke',
            pathLength: 100,
            strokeDasharray: 100,
            strokeDashoffset: ativo ? 0 : 100,
            style: instantaneo ? undefined : { transition: `stroke-dashoffset 1100ms ${CURVA} 250ms` },
          })
        )}
      </View>
    </View>
  );
}

function Segmentado({ opcoes, ativa }: { opcoes: string[]; ativa: number }) {
  return (
    <View style={styles.segmentado}>
      {opcoes.map((o, i) => (
        <View key={o} style={[styles.segmento, i === ativa && styles.segmentoAtivo]}>
          <Text style={[styles.segmentoTexto, i === ativa && styles.segmentoTextoAtivo]}>{o}</Text>
        </View>
      ))}
    </View>
  );
}

/* Captura: public/telas/inicio-web.png, card "Comprometimento futuro": seis
   barras de setembro a fevereiro, contas recorrentes embaixo e parcelas por
   cima, com as alturas relativas medidas na captura. As barras crescem em
   sequência. */
function VisualComprometido({ ativo, instantaneo }: PropsVisual) {
  const meses = [
    { m: 'Set', rec: 17, par: 55 },
    { m: 'Out', rec: 17, par: 55 },
    { m: 'Nov', rec: 17, par: 66 },
    { m: 'Dez', rec: 17, par: 44 },
    { m: 'Jan', rec: 17, par: 16 },
    { m: 'Fev', rec: 16, par: 0 },
  ];
  const MAX = 83;
  /* 50, e não 78: a coluna mais alta mais o mês, a legenda e o respiro do
     cartão precisam caber na área de um bloco largo, que tem ~125px. */
  const ALTURA = 50;
  return (
    <View style={[styles.telaCard, styles.cheio, { gap: 6 }]}>
      <View style={styles.barras}>
        {meses.map((b, i) => (
          <View key={b.m} style={styles.colunaBarra}>
            <View style={{ height: ALTURA, justifyContent: 'flex-end' }}>
              <View
                style={[
                  styles.barra,
                  { height: ativo ? `${((b.rec + b.par) / MAX) * 100}%` : '0%' },
                  transicao(instantaneo, 'height', 800, 150 + i * 90),
                ]}
              >
                {b.par > 0 && <View style={[styles.barraParcelas, { flex: b.par }]} />}
                <View style={[styles.barraRecorrentes, { flex: b.rec }]} />
              </View>
            </View>
            <Text style={styles.barraMes}>{b.m}</Text>
          </View>
        ))}
      </View>
      <View style={styles.legenda}>
        <View style={styles.itemLegenda}>
          <View style={[styles.pontoCor, { backgroundColor: theme.accent }]} />
          <Text style={styles.miniApoio}>Contas recorrentes</Text>
        </View>
        <View style={styles.itemLegenda}>
          <View style={[styles.pontoCor, { backgroundColor: theme.down }]} />
          <Text style={styles.miniApoio}>Parcelas futuras</Text>
        </View>
      </View>
    </View>
  );
}

/* Captura: public/telas/inicio-web.png, "Últimos lançamentos". Cada linha
   chega com a descrição, e a categoria aparece um instante depois: é o
   momento que o bloco vende, a sugestão acontecendo. */
function VisualCategorias({ ativo, instantaneo, largura }: PropsVisual) {
  /* Abaixo de 370px a descrição, espremida entre a sigla e o valor, saía
     "Supermercado Pão d…" (medido a 430 e 768px). Estreita, a descrição
     ganha a linha toda, o valor desce para a linha da categoria e a data sai. */
  const estreito = largura < 370;
  const itens = [
    { sigla: 'AL', nome: 'Supermercado Pão de Açúcar', categoria: 'Alimentação', data: '15 set 2026', valor: '− R$ 187,40' },
    { sigla: 'TR', nome: '99 Táxi', categoria: 'Transporte', data: '15 set 2026', valor: '− R$ 24,00' },
  ];
  return (
    <View style={[styles.cheio, { gap: 6 }]}>
      {itens.map((it, i) => {
        const categoria = (
          <Text
            style={[
              styles.categoriaSugerida,
              { color: corDaCategoria(it.categoria), opacity: ativo ? 1 : 0 },
              transicao(instantaneo, 'opacity', 320, 520 + i * 360),
            ]}
          >
            {it.categoria}
          </Text>
        );
        return (
          <View
            key={it.nome}
            style={[
              styles.telaCard,
              styles.lancamento,
              estreito && styles.lancamentoEstreito,
              { opacity: ativo ? 1 : 0 },
              transicao(instantaneo, 'opacity', 360, 150 + i * 360),
            ]}
          >
            <View style={styles.sigla}>
              <Text style={styles.siglaTexto}>{it.sigla}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.contaNome} numberOfLines={estreito ? undefined : 1}>{it.nome}</Text>
              {estreito ? (
                <View style={styles.linhaTopo}>
                  {categoria}
                  <Text style={styles.valorSaida}>{it.valor}</Text>
                </View>
              ) : (
                <View style={styles.linhaNome}>
                  {categoria}
                  <Text style={styles.miniApoio}> · {it.data}</Text>
                </View>
              )}
            </View>
            {!estreito && <Text style={styles.valorSaida}>{it.valor}</Text>}
          </View>
        );
      })}
    </View>
  );
}

/* Captura: public/telas/inicio-web.png, "Cofrinhos & metas": reserva de
   emergência (18%) e viagem (22%, até 20 jan 2027). As barras enchem até os
   percentuais da captura. */
function VisualCofrinhos({ ativo, instantaneo, largura }: PropsVisual) {
  /* Dois cartões lado a lado precisam de ~450px para "Reserva de emergência"
     caber inteiro. Abaixo disso, um por linha, e o valor guardado e o alvo
     dividem a mesma linha, que a largura agora comporta. */
  const estreito = largura < 450;
  const metas = [
    { icone: 'shield-checkmark' as const, cor: theme.up, nome: 'Reserva de emergência', guardado: 1800, alvo: 10000, pct: 18, prazo: '' },
    /* "Viagem para a praia" é o nome do cofrinho em lib/demo-data.ts, a mesma
       conta de demonstração das capturas (lá ele aparece cortado). */
    { icone: 'airplane' as const, cor: theme.down, nome: 'Viagem para a praia', guardado: 650, alvo: 3000, pct: 22, prazo: '20 jan 2027' },
  ];
  return (
    <View style={[styles.cheio, styles.cofrinhos, estreito && styles.cofrinhosEstreito]}>
      {metas.map((m, i) => (
        <View key={m.nome} style={[styles.telaCard, styles.cofrinho, !estreito && styles.cofrinhoLado]}>
          {/* Ícone na linha do nome, e não acima dele como na tela real: a
              linha própria do ícone deixava o desenho 1px mais alto que a área
              do bloco (medido). A troca é de posição, não de conteúdo. */}
          <View style={styles.linhaNome}>
            <Ionicons name={m.icone} size={12} color={m.cor} />
            <Text style={styles.contaNome} numberOfLines={estreito ? undefined : 1}>{m.nome}</Text>
          </View>
          {estreito ? (
            <Text style={styles.cofrinhoValor}>
              {emReais(m.guardado)} <Text style={styles.miniApoio}>de {emReais(m.alvo)}</Text>
            </Text>
          ) : (
            <>
              <Text style={styles.cofrinhoValor}>{emReais(m.guardado)}</Text>
              <Text style={styles.miniApoio}>de {emReais(m.alvo)}</Text>
            </>
          )}
          <View style={[styles.trilho, { marginTop: 4 }]}>
            <View style={[styles.preenchido, { backgroundColor: m.cor, width: ativo ? `${m.pct}%` : '0%' }, transicao(instantaneo, 'width', 900, 250 + i * 150)]} />
          </View>
          <View style={styles.linhaTopo}>
            <Text style={styles.miniApoio}>{m.pct}%</Text>
            {m.prazo ? <Text style={styles.miniApoio}>{m.prazo}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/* ──────────────────────────── ganchos ──────────────────────────── */

/** Conta de 0 até `alvo` em `duracao` ms depois de `atraso`, uma vez. */
function useContagem(alvo: number, ativo: boolean, instantaneo: boolean, duracao: number, atraso: number) {
  const [valor, setValor] = useState(instantaneo ? alvo : 0);
  useEffect(() => {
    // Escondido para a encenação (fora da tela): volta a zero para contar.
    if (!ativo) {
      setValor(0);
      return;
    }
    if (instantaneo) {
      setValor(alvo);
      return;
    }
    let quadro = 0;
    let inicio = 0;
    const espera = setTimeout(() => {
      const passo = (agora: number) => {
        if (!inicio) inicio = agora;
        const t = Math.min(1, (agora - inicio) / duracao);
        const suave = 1 - Math.pow(1 - t, 3);
        /* Fixado em centavos a cada quadro: sem isso o número atravessaria
           frações de centavo e tremeria no último dígito. */
        setValor(t < 1 ? Math.round(alvo * suave * 100) / 100 : alvo);
        if (t < 1) quadro = requestAnimationFrame(passo);
      };
      quadro = requestAnimationFrame(passo);
    }, atraso);
    return () => {
      clearTimeout(espera);
      cancelAnimationFrame(quadro);
    };
  }, [alvo, ativo, instantaneo, duracao, atraso]);
  return valor;
}

/* ──────────────────────────── estilos ──────────────────────────── */

const styles = StyleSheet.create({
  grade: { width: '100%', ...({ display: 'grid', gap: spacing.lg } as any) },
  celula: { minWidth: 0 },
  bloco: {
    height: '100%',
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    backgroundColor: theme.paperRaised,
    overflow: 'hidden',
    ...sombraCard,
    ...({ transitionProperty: 'transform, border-color', transitionDuration: '220ms', transitionTimingFunction: CURVA } as any),
  },
  /* No celular o bloco já está dentro da margem de 32px da página, e com 20
     de padding mais os 12 do cartão desenhado o conteúdo começava a 65px da
     borda da tela. 16, o mesmo respiro dos cartões da seção seguinte. */
  blocoCelular: { padding: spacing.lg },
  blocoSobre: { borderColor: theme.ruleStrong },
  /* A área do desenho fica com o que sobra do bloco depois do texto, com o
     desenho centrado nela. `flexShrink: 0` sobre a base automática é o que
     impede a área de ficar MENOR que o desenho: a versão anterior deixava
     encolher (`minHeight: 0`) e o conteúdo vazava por cima do texto. Se o
     desenho não cabe, a linha da grade cresce. A margem de baixo é igual ao
     padding do bloco, para o desenho ficar à mesma distância da borda de cima
     e do rótulo. */
  visual: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  visualCelular: { marginBottom: spacing.lg },
  textos: { gap: 2 },
  rotulo: { color: theme.accent2, fontSize: type.micro, lineHeight: lh(type.micro), fontFamily: fonts.regular, textTransform: 'uppercase', letterSpacing: 0.7 },
  titulo: { color: theme.ink, fontSize: type.destaque, lineHeight: lh(type.destaque, 'titulo'), fontFamily: fonts.regular },
  texto: { color: theme.inkSoft, fontSize: type.nota, lineHeight: lh(type.nota), fontFamily: fonts.light },

  // peças comuns das telas desenhadas
  cheio: { width: '100%' },
  telaCard: { borderRadius: radius.md, borderWidth: 1, borderColor: theme.rule, backgroundColor: theme.paper, padding: spacing.md },
  telaTitulo: { color: theme.ink, fontSize: type.nota, lineHeight: lh(type.nota, 'apoio'), fontFamily: fonts.regular },
  miniRotulo: { color: theme.inkFaint, fontSize: type.micro, fontFamily: fonts.light },
  miniApoio: { color: theme.inkFaint, fontSize: type.micro, fontFamily: fonts.light },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  /* Como `linhaTopo`, mas o item da direita desce para a linha de baixo quando
     os dois não cabem, em vez de espremer o da esquerda até as reticências. */
  linhaQuebra: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', ...({ columnGap: spacing.sm, rowGap: 2 } as any) },
  linhaNome: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0, flexShrink: 1 },
  pontoCor: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  trilho: { height: 5, borderRadius: 3, backgroundColor: theme.paperRaised, overflow: 'hidden' },
  preenchido: { height: 5, borderRadius: 3 },
  valorSaida: { flexShrink: 0, color: theme.down, fontSize: type.nota, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  valorEntrada: { flexShrink: 0, color: theme.up, fontSize: type.nota, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },

  // livre
  livreCabeca: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', marginTop: 2 },
  livreValor: { color: theme.ink, fontSize: type.valor, lineHeight: lh(type.valor, 'valor'), fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  livreSufixo: { color: theme.inkFaint, fontSize: type.nota, lineHeight: lh(type.nota, 'apoio'), fontFamily: fonts.light },
  /* Um degrau acima dos outros desenhos (`apoio` em vez de `nota`): o Livre
     vive num bloco alto, e no tamanho pequeno o cartão boiava num vão grande. */
  linhaConta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  contaChave: { flex: 1, minWidth: 0, color: theme.inkSoft, fontSize: type.apoio, lineHeight: lh(type.apoio, 'apoio'), fontFamily: fonts.light },
  contaValor: { flexShrink: 0, color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  linhaContaCompacta: { gap: spacing.sm },
  contaChaveCompacta: { fontSize: type.nota, lineHeight: lh(type.nota, 'apoio') },
  contaValorCompacta: { fontSize: type.nota },
  contaForte: { color: theme.ink },
  livreDica: { color: theme.accent2, fontSize: type.nota, lineHeight: lh(type.nota), fontFamily: fonts.regular, marginTop: spacing.md },

  // cartão
  cartao: { width: '100%', gap: 4, paddingVertical: 10, borderColor: ROXO_CARTAO_DEMO },
  cartaoNome: { flexShrink: 1, color: theme.ink, fontSize: type.nota, lineHeight: lh(type.nota, 'apoio'), fontFamily: fonts.regular },
  cartaoFinal: { color: theme.inkFaint, fontSize: type.micro, fontFamily: fonts.light },
  cartaoFatura: { color: theme.down, fontSize: type.destaque, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  cartaoPct: { color: theme.ink, fontSize: type.nota, fontFamily: fonts.regular },

  // orçamento
  orcamento: { width: '100%', alignItems: 'stretch', gap: spacing.sm },
  donutArea: { alignItems: 'center', justifyContent: 'center' },
  chipsLegenda: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, width: '100%' },
  chipLegenda: { flexGrow: 1, maxWidth: 170, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: theme.rule },
  chipLegendaTexto: { color: theme.ink, fontSize: type.micro, fontFamily: fonts.light },
  chipLegendaPct: { color: theme.inkFaint },

  // boletos e lançamentos
  conta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  contaEstreita: { gap: 6, paddingVertical: 8 },
  contaNome: { flexShrink: 1, color: theme.ink, fontSize: type.nota, lineHeight: lh(type.nota, 'apoio'), fontFamily: fonts.regular },
  contaValorBoleto: { flexShrink: 0, color: theme.ink, fontSize: type.nota, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  chipPrazo: { color: theme.inkSoft, fontSize: type.micro, fontFamily: fonts.light, paddingVertical: 1, paddingHorizontal: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: theme.ruleStrong },
  lancamento: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7 },
  /* Com a descrição podendo ocupar duas linhas, a sigla acompanha o topo do
     texto em vez de flutuar no meio do cartão. */
  lancamentoEstreito: { alignItems: 'flex-start', paddingVertical: 9 },
  sigla: { width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.paperRaised },
  siglaTexto: { color: theme.inkSoft, fontSize: type.micro, fontFamily: fonts.regular },
  categoriaSugerida: { fontSize: type.micro, fontFamily: fonts.regular },

  // fluxo
  fluxo: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  fluxoEstreito: { gap: spacing.md },
  fluxoGrafico: { flex: 1, minWidth: 0, height: 56, justifyContent: 'flex-end' },
  fluxoGraficoEstreito: { width: '100%', height: 56 },
  segmentado: { flexDirection: 'row', alignSelf: 'flex-start', padding: 2, borderRadius: radius.sm, backgroundColor: theme.paperRaised },
  segmento: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 5 },
  segmentoAtivo: { backgroundColor: theme.paper },
  segmentoTexto: { color: theme.inkFaint, fontSize: type.micro, fontFamily: fonts.light },
  segmentoTextoAtivo: { color: theme.ink },

  // comprometido
  barras: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  colunaBarra: { alignItems: 'center', gap: 3 },
  barra: { width: 18, borderRadius: 5, overflow: 'hidden' },
  barraParcelas: { backgroundColor: theme.down },
  barraRecorrentes: { backgroundColor: theme.accent },
  barraMes: { color: theme.inkFaint, fontSize: type.micro, fontFamily: fonts.light },
  legenda: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', ...({ columnGap: spacing.md, rowGap: 2 } as any) },
  itemLegenda: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  // cofrinhos
  cofrinhos: { flexDirection: 'row', gap: spacing.sm },
  cofrinhosEstreito: { flexDirection: 'column' },
  cofrinho: { minWidth: 0, gap: 1, paddingVertical: 8 },
  cofrinhoLado: { flex: 1 },
  cofrinhoValor: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
});
