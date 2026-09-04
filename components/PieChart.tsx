import { memo } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import Svg, { Path, G, Text as SvgText } from 'react-native-svg';
import { theme, fonts } from '@/lib/theme';

export type PieSlice = { name: string; color: string; value: number };

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

const CORNER_R = 1.6; // ~3px de arredondamento no tamanho renderizado padrão (184px)

function donutSlicePath(cx: number, cy: number, innerR: number, outerR: number, start: number, end: number) {
  const spanDeg = end - start;
  const large = spanDeg > 180 ? 1 : 0;

  // Raio de canto seguro: nunca maior que metade da espessura do anel nem
  // metade do comprimento de arco da fatia (fatias muito finas/estreitas
  // ficam com cantos proporcionalmente menores em vez de se deformar).
  const ringHalf = (outerR - innerR) / 2 - 0.15;
  const outerArcLen = ((spanDeg * Math.PI) / 180) * outerR;
  const innerArcLen = ((spanDeg * Math.PI) / 180) * innerR;
  const arcHalf = Math.min(outerArcLen, innerArcLen) / 2 - 0.15;
  const r = Math.max(0, Math.min(CORNER_R, ringHalf, arcHalf));

  if (r < 0.1) {
    // Fatia estreita demais pro arredondamento valer a pena — cantos retos.
    const p1 = polarToXY(cx, cy, outerR, end);
    const p2 = polarToXY(cx, cy, outerR, start);
    const p3 = polarToXY(cx, cy, innerR, start);
    const p4 = polarToXY(cx, cy, innerR, end);
    return [
      `M${p1.x.toFixed(2)},${p1.y.toFixed(2)}`,
      `A${outerR},${outerR} 0 ${large} 0 ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`,
      `L${p3.x.toFixed(2)},${p3.y.toFixed(2)}`,
      `A${innerR},${innerR} 0 ${large} 1 ${p4.x.toFixed(2)},${p4.y.toFixed(2)}`,
      'Z',
    ].join(' ');
  }

  // Ângulo (graus) que corresponde a um comprimento de arco = r, em cada raio.
  const dOuter = (r / outerR) * (180 / Math.PI);
  const dInner = (r / innerR) * (180 / Math.PI);

  const p1 = polarToXY(cx, cy, outerR, end - dOuter); // início do arco externo (canto "end" já arredondado)
  const p2 = polarToXY(cx, cy, outerR, start + dOuter); // fim do arco externo
  const p2r = polarToXY(cx, cy, outerR - r, start); // após o filete, entrando na linha radial
  const p3La = polarToXY(cx, cy, innerR + r, start); // fim da linha radial, antes do filete
  const p3 = polarToXY(cx, cy, innerR, start + dInner); // início do arco interno
  const p4 = polarToXY(cx, cy, innerR, end - dInner); // fim do arco interno
  const p4La = polarToXY(cx, cy, innerR + r, end); // após o filete, entrando na linha radial de fechamento
  const p1r = polarToXY(cx, cy, outerR - r, end); // fim da linha de fechamento, antes do filete final

  const f = (p: { x: number; y: number }) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

  return [
    `M${f(p1)}`,
    `A${outerR},${outerR} 0 ${large} 0 ${f(p2)}`,
    `A${r},${r} 0 0 0 ${f(p2r)}`,
    `L${f(p3La)}`,
    `A${r},${r} 0 0 0 ${f(p3)}`,
    `A${innerR},${innerR} 0 ${large} 1 ${f(p4)}`,
    `A${r},${r} 0 0 0 ${f(p4La)}`,
    `L${f(p1r)}`,
    `A${r},${r} 0 0 0 ${f(p1)}`,
    'Z',
  ].join(' ');
}

/* Os rótulos ficam por fora do anel, então parte deles cai além do quadrado
   0..100 do desenho. `overflow: visible` resolveria isso na web, mas no
   Android o react-native-svg sempre recorta no limite da view — era por isso
   que as porcentagens de cima e da esquerda apareciam cortadas no aparelho.
   A correção que funciona nas duas plataformas é ampliar o próprio viewBox,
   de forma que os rótulos passem a estar *dentro* da área de desenho.

   Alcance máximo de um rótulo a partir do centro (50,50):
     labelR (48) + EXPLODE (3) + recuo do texto (1.5) + largura de "50%"
   ou seja ~118 com a Neue Machina — daí a margem de 24 unidades em volta.

   A margem era 16, calculada quando o rótulo ainda caía na fonte do sistema.
   Ao passar a declarar `fontFamily` explicitamente (o padrão global via
   Text.defaultProps não funcionava no React 19), o texto passou a sair na
   Neue Machina, que é mais larga — e o "%" do rótulo da direita começou a ser
   recortado na borda do viewBox. */
const VIEW_MARGIN = 24;
const VIEW_BOX = `${-VIEW_MARGIN} ${-VIEW_MARGIN} ${100 + VIEW_MARGIN * 2} ${100 + VIEW_MARGIN * 2}`;

/** Donut "explodido" com rótulos de porcentagem sempre por fora do anel — mesma lógica do protótipo web. */
function PieChart({ data, size = 216 }: { data: PieSlice[]; size?: number }) {
  if (data.length === 0) return null;

  const cx = 50, cy = 50, innerR = 22, outerR = 40, labelR = outerR + 8;
  const GAP_DEG = 2.4, EXPLODE = 3;
  let angle = 0;

  /* Normaliza pela soma em vez de assumir que `value` já é porcentagem.
     A versão anterior fazia `(value / 100) * 360`, o que só funcionava se
     quem chamasse tivesse convertido antes. A Início convertia; a tela de
     Gráficos passa o valor em reais — e uma fatia de R$ 620 virava 2232°,
     seis voltas no círculo, com o rótulo escrito "620%". As fatias se
     empilhavam e as porcentagens saíam colididas.
     Somando e dividindo aqui, os dois jeitos de chamar funcionam: quem já
     manda porcentagens que somam 100 cai no mesmo resultado de antes. */
  const total = data.reduce((s, seg) => s + Math.max(0, seg.value), 0);
  if (total <= 0) return null;

  const slices = data.map((seg) => {
    const fracao = Math.max(0, seg.value) / total;
    const span = fracao * 360;
    const start = angle + GAP_DEG / 2;
    const end = Math.max(angle + span - GAP_DEG / 2, start);
    const mid = (start + end) / 2;
    const dir = polarToXY(0, 0, 1, mid);
    const dx = EXPLODE * dir.x, dy = EXPLODE * dir.y;
    const labelPt = polarToXY(cx + dx, cy + dy, labelR, mid);
    const anchor: 'start' | 'end' | 'middle' = dir.x > 0.15 ? 'start' : dir.x < -0.15 ? 'end' : 'middle';
    const labelX = labelPt.x + (anchor === 'start' ? 1.5 : anchor === 'end' ? -1.5 : 0);
    angle += span;
    return {
      seg,
      d: donutSlicePath(cx + dx, cy + dy, innerR, outerR, start, end),
      labelX,
      labelY: labelPt.y,
      mid,
      anchor,
      /* Calculada aqui, não lida de `seg.value`: o valor de entrada pode ser
         reais. É esta a porcentagem que o rótulo deve mostrar. */
      pct: fracao * 100,
    };
  });

  /* ── Quais fatias ganham rótulo ──────────────────────────────────────────
   *
   * Duas regras, e as duas existem porque escrever um número em TODA fatia é
   * o jeito clássico de tornar um donut ilegível: os rótulos das fatias
   * pequenas se empilham na borda de cima e deixam de dizer a qual fatia
   * pertencem. Rótulo direto é seletivo; quem carrega o resto é a legenda.
   *
   * 1. Piso de tamanho. Abaixo de 8% a fatia é fina demais para o número
   *    ancorar nela visualmente, e o leitor acaba tendo que adivinhar a
   *    associação. Antes o piso era 1%, o que na prática rotulava tudo.
   *
   * 2. Distância angular mínima. O rótulo mede ~13 unidades do viewBox; no
   *    raio 48 são necessários ~20° para dois rótulos não se tocarem
   *    (16 unidades de arco ÷ 48 × 180/π). Os 14° anteriores davam ~11,7
   *    unidades de arco, menos que a largura do próprio texto — por isso
   *    fatias de 5% e 3% seguidas apareciam rotuladas e sobrepostas.
   *
   * A fatia continua no anel e na legenda; o que some é só o número por cima
   * dela. */
  const MIN_PCT_ROTULO = 8;
  const MIN_LABEL_GAP_DEG = 20;
  let ultimoMidComRotulo: number | null = null;

  /* O miolo do donut fica VAZIO, por decisão de marca do autor. Uma rodada
     anterior escreveu ali a categoria líder e a porcentagem dela; foi
     revertido. O anel já carrega a composição, e o buraco é respiro, não
     espaço a ser preenchido. */

  /* Leitor de tela: um SVG de fatias não diz nada sozinho — sem isto, o
     donut simplesmente não existe pra quem usa VoiceOver/TalkBack, e ele
     carrega justamente a informação central do app ("pra onde foi o
     dinheiro"). O gráfico inteiro vira UM elemento com a composição lida por
     extenso, e as fatias somem da árvore de acessibilidade pra não anunciar
     nós soltos e sem sentido no meio. */
  const resumoAcessivel = slices
    .map(({ seg, pct }) => `${seg.name} ${Math.round(pct)}%`)
    .join(', ');

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Gastos por categoria: ${resumoAcessivel}.`}
    >
      <Svg
        width={size}
        height={size}
        viewBox={VIEW_BOX}
        accessibilityElementsHidden
        // Só nativo: na web a `react-native-svg` não traduz essa prop pro
        // DOM, e ela vaza como atributo cru — React acusa em dev
        // ("does not recognize the `importantForAccessibility` prop").
        // Redundante ali de qualquer forma: o `View` pai já tem
        // `accessible`+`accessibilityRole`+`accessibilityLabel`, que já
        // colapsa a subárvore sozinho.
        {...(Platform.OS !== 'web' ? { importantForAccessibility: 'no-hide-descendants' as const } : {})}
      >
        {slices.map(({ seg, d, labelX, labelY, mid, anchor, pct }) => {
          const cabe =
            pct >= MIN_PCT_ROTULO &&
            (ultimoMidComRotulo === null || Math.abs(mid - ultimoMidComRotulo) >= MIN_LABEL_GAP_DEG);
          if (cabe) ultimoMidComRotulo = mid;
          return (
            <G key={seg.name}>
              <Path d={d} fill={seg.color} />
              {cabe && (
                <SvgText
                  x={labelX}
                  y={labelY}
                  /* Unidades do viewBox, não pixels: este texto escala junto com
                     o desenho, então NÃO segue a escala tipográfica em pt. */
                  fontSize={7.5}
                  fontFamily={fonts.regular}
                  fill={theme.ink}
                  textAnchor={anchor}
                  alignmentBaseline="central"
                  letterSpacing={0}
                >
                  {`${Math.round(pct)}%`}
                </SvgText>
              )}
            </G>
          );
        })}

      </Svg>
    </View>
  );
}


const styles = StyleSheet.create({});

/* `memo` porque o donut refaz trigonometria de todas as fatias a cada render,
   e as telas que o usam (Início, Gráficos) re-renderizam por motivos que não
   têm nada a ver com ele — uma tecla digitada num modal, por exemplo. Só vale
   porque quem chama já passa `data` memoizado dos dois lados. */
export default memo(PieChart);
