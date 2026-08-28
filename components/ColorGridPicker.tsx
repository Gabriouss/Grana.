import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, spacing, PALETTE_30, fonts, type } from '@/lib/theme';
import AppPressable from './AppPressable';

export type ColorUsage = { color: string; label: string };

const COLUNAS = 6;
const ROWS = Array.from({ length: 5 }, (_, i) => PALETTE_30.slice(i * COLUNAS, i * COLUNAS + COLUNAS));
const norm = (c: string) => c.toLowerCase();

/* Nome falado de cada cor da grade. Um leitor de tela anunciando "#4f9bab"
   não diz nada a ninguém, e "cor 7 de 30" não deixa escolher: numa grade em
   que a cor é a ÚNICA informação, o nome da cor É o rótulo acessível. Deriva
   do matiz em vez de uma tabela de 30 nomes escritos à mão, que sairia de
   sincronia na primeira vez que PALETTE_30 mudasse. */
function nomeDaCor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.06) return max > 0.6 ? 'cinza claro' : 'cinza escuro';
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  const claro = max > 0.72 ? 'claro ' : min < 0.28 ? 'escuro ' : '';
  const matiz =
    h < 15 || h >= 345 ? 'vermelho' :
    h < 45 ? 'laranja' :
    h < 70 ? 'amarelo' :
    h < 160 ? 'verde' :
    h < 200 ? 'ciano' :
    h < 250 ? 'azul' :
    h < 290 ? 'roxo' :
    'rosa';
  return `${matiz} ${claro}`.trim();
}

/**
 * Grade fixa de 30 cores (5 linhas x 6 colunas) para escolher a cor de uma categoria.
 *
 * `usedBy` é a lista de categorias que já usam cada cor — quem chama já deve
 * excluir a própria categoria em edição dessa lista, senão ela "colide"
 * consigo mesma. Uma cor em uso ainda pode ser escolhida (o alerta é só um
 * aviso, não um bloqueio): forçar unicidade de cor seria uma regra que o
 * usuário não pediu e que atrapalharia mais do que ajuda.
 */
export default function ColorGridPicker({
  value,
  onChange,
  usedBy = [],
}: {
  value: string;
  onChange: (color: string) => void;
  usedBy?: ColorUsage[];
}) {
  const [previewColor, setPreviewColor] = useState<string | null>(null);

  function usageFor(color: string): ColorUsage | undefined {
    return usedBy.find((u) => norm(u.color) === norm(color));
  }

  const activeUsage = previewColor ? usageFor(previewColor) : null;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: GAP, alignItems: 'center' }}>
        {ROWS.map((row, i) => (
          <View key={i} style={styles.row}>
            {row.map((color) => {
              const selected = norm(color) === norm(value);
              const uso = usageFor(color);
              const inUse = !!uso && !selected;
              return (
                <AppPressable
                  key={color}
                  onPress={() => {
                    onChange(color);
                    setPreviewColor(color);
                  }}
                  onHoverIn={() => setPreviewColor(color)}
                  onHoverOut={() => setPreviewColor((c) => (c === color ? null : c))}
                  onLongPress={() => setPreviewColor(color)}
                  hitSlop={4}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  // O ponto de "cor já usada" é a única informação que a bolinha
                  // carrega além da cor — sem repeti-la no rótulo, quem usa
                  // leitor de tela não tem como saber que ela existe.
                  accessibilityLabel={uso ? `${nomeDaCor(color)}, em uso por ${uso.label}` : nomeDaCor(color)}
                  style={({ hovered }) => [
                    styles.swatch,
                    { backgroundColor: color },
                    selected && styles.swatchSelected,
                    hovered && !selected && styles.swatchHover,
                  ]}
                >
                  {inUse && <View style={styles.usedMark} />}
                  {selected && <Ionicons name="checkmark" size={14} color="rgba(0,0,0,0.55)" />}
                </AppPressable>
              );
            })}
          </View>
        ))}
      </View>
      <Text style={styles.hint} numberOfLines={1}>
        {activeUsage ? `Em uso por: ${activeUsage.label}` : 'Um ponto na bolinha indica cor já usada por outra categoria.'}
      </Text>
    </View>
  );
}

const SWATCH = 34;
/* Levemente maior que o raio do swatch, pra dar respiro sem ficar espaçado
   demais — mesma medida nas duas direções, pra manter a grade simétrica. */
const GAP = 10;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GAP },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: { borderColor: theme.ink },
  swatchHover: { borderColor: theme.ruleStrong },
  usedMark: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(5,34,41,0.55)' },
  hint: { color: theme.inkFaint, fontSize: type.legenda, lineHeight: 15, fontFamily: fonts.light },
});
