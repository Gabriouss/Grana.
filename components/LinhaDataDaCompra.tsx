import { StyleSheet, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, spacing, type, fonts, touchTarget, lh } from '@/lib/theme';
import { formatDateLabel } from '@/lib/format';
import AppPressable from './AppPressable';

/**
 * A linha "Data da compra" da foto da nota e do Colar (30/09/2026): a mesma
 * linha, o mesmo selo e a mesma dica nas duas telas, para a data lida de um
 * cupom ou de um texto ser conferida e corrigida do mesmo jeito. Quem abre o
 * seletor (`DatePickerModal`) é a tela, que o monta fora da folha.
 *
 * `data` nula mostra "Escolha a data": a tela não tem uma data segura para
 * propor e não inventa a de hoje.
 */
export default function LinhaDataDaCompra({
  data,
  selo,
  dica,
  onPress,
}: {
  data: string | null;
  /** De onde veio a data ("lida da foto", "lida do texto"); some quando a pessoa escolhe. */
  selo?: string | null;
  /** Por que a data não é a lida, ou o que falta escolher. */
  dica?: string | null;
  onPress: () => void;
}) {
  const rotulo = data ? formatDateLabel(data) : 'Escolha a data';
  return (
    <>
      <AppPressable
        onPress={onPress}
        style={styles.linhaData}
        accessibilityRole="button"
        accessibilityLabel={`Data da compra: ${rotulo}${selo ? `, ${selo}` : ''}. Toque para ${data ? 'mudar' : 'escolher'}`}
      >
        <Ionicons name="calendar-outline" size={16} color={theme.inkSoft} />
        <Text style={data ? styles.textoData : styles.textoSemData}>{rotulo}</Text>
        {!!selo && <Text style={styles.lido}>{selo}</Text>}
      </AppPressable>
      {!!dica && <Text style={styles.hint}>{dica}</Text>}
    </>
  );
}

/** A data que o seletor devolve: futura vira hoje, como a foto sempre fez.
    Nunca uma data que ainda não chegou. */
export function dataEscolhidaNoSeletor(iso: string, hojeISO: string): string {
  return iso > hojeISO ? hojeISO : iso;
}

const styles = StyleSheet.create({
  /* Com fonte grande (1.3), ícone, data e selo não cabem numa fileira: o
     selo desce de linha, no fluxo (achado do P2, 30/09/2026). Sem encolher
     o texto: grow/shrink em Text travaram a quebra no 424dd7a. */
  linhaData: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, rowGap: spacing.xs, minHeight: touchTarget },
  textoData: { color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular },
  textoSemData: { color: theme.inkFaint, fontSize: type.corpo, fontFamily: fonts.regular },
  lido: { color: theme.accent2, fontSize: type.legenda, fontFamily: fonts.regular, marginBottom: 2 },
  hint: { color: theme.inkFaint, fontSize: type.nota, lineHeight: lh(type.nota, 'corpo'), fontFamily: fonts.light },
});
