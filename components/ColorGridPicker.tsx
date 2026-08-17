import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, spacing, PALETTE_30 } from '@/lib/theme';
import AppPressable from './AppPressable';

export type ColorUsage = { color: string; label: string };

const COLUNAS = 6;
const ROWS = Array.from({ length: 5 }, (_, i) => PALETTE_30.slice(i * COLUNAS, i * COLUNAS + COLUNAS));
const norm = (c: string) => c.toLowerCase();

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
              const inUse = !!usageFor(color) && !selected;
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
  hint: { color: theme.inkFaint, fontSize: 11, lineHeight: 15 },
});
