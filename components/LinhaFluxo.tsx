import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { theme, type, fonts, graficoLinha } from '@/lib/theme';
import { usePrivacy } from '@/lib/privacy-context';
import { UI_OUT, useReducedMotion } from '@/lib/motion';
import AppPressable from './AppPressable';

/* Desenho do gráfico de linha da Início, compartilhado com a tela Gráficos
   (item 53, pedido do autor de 20/11/2026: "Eu quero o estilo da linha do
   gráfico DA ABA DE GRÁFICOS com o mesmo estilo de linha do GRÁFICO DA HOME").
   Cada tela continua dona dos próprios dados, baldes e cabeçalho; daqui sai só
   o desenho: grade, eixos, séries, marcadores, faixas de toque e a entrada.

   Hook, não componente: quem chama monta o desenho dentro do próprio render,
   o que mantém a árvore do FlowChart igual à de antes (os testes de Gráficos
   leem os `Path` e as faixas de toque direto da árvore dele).

   A largura do desenho é a largura REAL do card, medida por `onLayout`, ou a
   que a tela já calculou (`largura`). Com coordenadas 1:1 os marcadores não
   viram oval, como aconteceu quando o viewBox era fixo e esticado.

   AXIS_LEFT é espaço reservado dentro do desenho; os NÚMEROS do eixo Y vivem
   em <Text> do RN por cima do Svg. 78px porque "R$ 1,4 mil" precisa caber
   numa linha só. */
const AXIS_LEFT = 78;
const PAD_RIGHT = 6;
const TOP = 18;
/* Distância da linha de base até o pé do desenho, onde ficam as datas. */
const RODAPE = 32;
const ALTURA_PADRAO = 160;

const CURVA_ENTRADA = Easing.bezier(...UI_OUT);

/** Formato compacto do eixo Y ("R$ 3 mil"). */
export function formatEixo(n: number): string {
  if (n <= 0) return 'R$ 0';
  if (n >= 1000) {
    const mil = n / 1000;
    return `R$ ${(mil % 1 === 0 ? mil.toFixed(0) : mil.toFixed(1)).replace('.', ',')} mil`;
  }
  return `R$ ${Math.round(n)}`;
}

/* Linha reta entre os baldes, de propósito: uma curva suave interpola um
   crescimento que nenhum lançamento sustenta entre um balde zerado e um balde
   com valor. Reta mostra o degrau como ele é. */
function caminhoReto(pts: number[][]): string {
  if (pts.length === 0) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
}

export type SerieLinha = {
  valores: number[];
  cor: string;
  /** Traço tracejado, o das saídas na Início. */
  tracejado?: boolean;
  /** Degradê sob a linha, o das entradas na Início. */
  area?: boolean;
};

/** Estilo das duas séries da Início: quem quiser desenhar entradas ou saídas
    pega daqui, para as duas telas não divergirem na cor nem no traço. */
export const serieEntradas = (valores: number[]): SerieLinha => ({ valores, cor: theme.up, area: true });
export const serieSaidas = (valores: number[]): SerieLinha => ({ valores, cor: theme.down, tracejado: true });

export function useLinhaFluxo({
  series,
  selecionado,
  onSelecionar,
  rotuloInicio,
  rotuloFim,
  rotuloToque,
  assinatura,
  idDegrade,
  largura,
  altura = ALTURA_PADRAO,
}: {
  series: SerieLinha[];
  selecionado: number;
  onSelecionar: (i: number) => void;
  rotuloInicio: string;
  rotuloFim: string;
  /** Rótulo de acessibilidade de cada faixa de toque (já respeitando o modo privacidade). */
  rotuloToque: (i: number) => string;
  /** Muda quando o desenho muda: dispara a entrada por opacidade. */
  assinatura: string;
  /** Prefixo do id do degradê. Na web os ids do Svg são globais ao documento,
      e a Início e Gráficos podem estar montadas ao mesmo tempo. */
  idDegrade: string;
  largura?: number;
  altura?: number;
}) {
  const [medida, setMedida] = useState(280);
  const viewW = largura ?? medida;
  function handleLayout(e: LayoutChangeEvent) {
    if (largura !== undefined) return;
    const w = e.nativeEvent.layout.width;
    if (w > 0) setMedida(w);
  }

  const base = altura - RODAPE;
  const pontos = series[0]?.valores.length ?? 0;
  /* O número de pontos varia por período (12 no ano, 7 no mês, N meses em
     Gráficos); a posição no eixo X acompanha essa contagem. */
  const chartX = Array.from({ length: pontos }, (_, i) =>
    AXIS_LEFT + (i / (pontos - 1 || 1)) * (viewW - AXIS_LEFT - PAD_RIGHT)
  );

  const maxVal = Math.max(...series.flatMap((s) => s.valores), 1);
  /* Sem lançamento nenhum, o piso 1 gerava o eixo "R$ 0, R$ 0, R$ 1, R$ 1,
     R$ 1", que sugere movimentação onde não houve. A grade continua desenhada,
     sem números inventados. */
  const semMovimentacao = maxVal <= 1;

  const desenho = series.map((s) => {
    const pts = s.valores.map((v, i) => [chartX[i], base - (v / maxVal) * (base - TOP)]);
    const linha = caminhoReto(pts);
    const area = s.area && pts.length > 0
      ? `${linha} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z`
      : null;
    return { serie: s, pts, linha, area };
  });

  const gridLines = [0, 1, 2, 3, 4].map((i) => ({
    y: base - (i / 4) * (base - TOP),
    valor: (maxVal / 4) * i,
  }));

  const progress = useRef(new Animated.Value(0)).current;
  const reduzirMovimento = useReducedMotion();
  const { hidden } = usePrivacy();

  /* O desenho está completo desde o primeiro frame; entra a opacidade do
     conjunto, em 240ms, no driver nativo. O dado nunca aparece pela metade. */
  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: reduzirMovimento ? 0 : 240,
      easing: CURVA_ENTRADA,
      useNativeDriver: true,
    }).start();
  }, [progress, reduzirMovimento, assinatura]);

  return (
    <Animated.View style={{ position: 'relative', opacity: progress }} onLayout={handleLayout}>
      <Svg width={viewW} height={altura} viewBox={`0 0 ${viewW} ${altura}`} style={{ overflow: 'visible' }}>
        <Defs>
          {desenho.map(({ serie }, i) => serie.area ? (
            <LinearGradient key={`degrade-${i}`} id={`${idDegrade}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={serie.cor} stopOpacity={graficoLinha.opacidadeTopoDegrade} />
              <Stop offset="1" stopColor={serie.cor} stopOpacity={0} />
            </LinearGradient>
          ) : null)}
        </Defs>

        {gridLines.map(({ y }, i) => (
          <Line key={`grid-${i}`} x1={AXIS_LEFT} y1={y} x2={viewW - PAD_RIGHT} y2={y} stroke={theme.rule} strokeWidth={1} opacity={graficoLinha.opacidadeGrade} />
        ))}

        {desenho.map(({ area }, i) => area ? (
          <Path key={`area-${i}`} d={area} fill={`url(#${idDegrade}-${i})`} />
        ) : null)}

        {desenho.map(({ serie, linha }, i) => (
          <Path
            key={`linha-${i}`}
            d={linha}
            fill="none"
            stroke={serie.cor}
            strokeWidth={graficoLinha.espessura}
            strokeDasharray={serie.tracejado ? '4 3' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Marcador em cada balde real; o tocado cresce, os outros ficam um
            pouco apagados. */}
        {desenho.map(({ serie, pts }, s) => pts.map((p, i) => (
          <Circle
            key={`ponto-${s}-${i}`}
            cx={p[0]}
            cy={p[1]}
            r={i === selecionado ? graficoLinha.raioPontoSelecionado : graficoLinha.raioPonto}
            fill={serie.cor}
            opacity={i === selecionado ? 1 : graficoLinha.opacidadePonto}
          />
        )))}
      </Svg>

      {/* O modo privacidade esconde também a escala: um eixo que vai até
          R$ 8 mil entrega quase tanto quanto o número escondido.
          O rótulo encolhe em vez de cortar (achado 53-B, 21/11/2026). A coluna
          do eixo tem AXIS_LEFT - 8 = 70 dp; medido com a Neue Machina Light,
          "R$ 11,9 mil" pede 89 dp em fonte do sistema 1,3 e "R$ 999,9 mil"
          107 dp (razão 0,66). */}
      {gridLines.map(({ y, valor }, i) => (
        <Text key={`ylabel-${i}`} style={[styles.axisLabel, { top: y - 8 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
          {hidden || semMovimentacao ? '' : formatEixo(valor)}
        </Text>
      ))}
      {/* Alinhados com AXIS_LEFT/PAD_RIGHT, onde a linha começa e termina de
          fato, não na borda do card. */}
      <Text style={[styles.dateLabel, { left: AXIS_LEFT }]}>{rotuloInicio}</Text>
      {rotuloFim !== rotuloInicio ? (
        <Text style={[styles.dateLabel, { right: PAD_RIGHT, textAlign: 'right' }]}>{rotuloFim}</Text>
      ) : null}

      {/* Faixas de toque: o limite entre duas cai no meio dos dois pontos
          vizinhos, e não numa divisão igual da largura, porque AXIS_LEFT
          desloca os pontos. O rótulo carrega o mesmo dado do cabeçalho. */}
      <View style={StyleSheet.absoluteFill}>
        {chartX.map((x, i) => {
          const anterior = chartX[i - 1];
          const proximo = chartX[i + 1];
          const inicio = anterior !== undefined ? (anterior + x) / 2 : 0;
          const fim = proximo !== undefined ? (x + proximo) / 2 : viewW;
          return (
            <AppPressable
              key={`touch-${i}`}
              style={{ position: 'absolute', left: inicio, width: fim - inicio, top: 0, bottom: 0 }}
              onPress={() => onSelecionar(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: selecionado === i }}
              accessibilityLabel={rotuloToque(i)}
            />
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  axisLabel: {
    position: 'absolute',
    left: 0,
    // Largura travada, alinhado à esquerda: todo rótulo começa no mesmo x.
    width: AXIS_LEFT - 8,
    textAlign: 'left',
    color: theme.inkFaint,
    fontSize: type.legenda,
    fontFamily: fonts.light,
  },
  dateLabel: {
    position: 'absolute',
    bottom: 0,
    color: theme.inkFaint,
    fontSize: type.legenda,
    fontFamily: fonts.light,
  },
});
