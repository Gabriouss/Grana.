import { StyleSheet, Text, View } from 'react-native';
import SegmentedTabs from './SegmentedTabs';
import AppPressable from './AppPressable';
import { fonts, spacing, theme, type, lh, touchTarget } from '@/lib/theme';
import { semViuva } from '@/lib/sem-viuva';
import { formatDateLabel } from '@/lib/format';
import type { Visao } from '@/lib/gastos-categoria';
import type { CategoriasConsultadas } from '@/lib/categorias-cliente';

export default function CategoriasContexto({ visao, onChange, resultado, erro, carregar, mostrarPeriodo = false }: {
  visao: Visao; onChange: (v: Visao) => void; resultado: CategoriasConsultadas | null; erro: string | null; carregar: () => void;
  mostrarPeriodo?: boolean;
}) {
  return <View style={s.grupo}>
    <SegmentedTabs options={[{ key: 'tudo', label: 'Tudo' }, { key: 'avista', label: 'Débito e Pix' }, { key: 'credito', label: 'Crédito' }]} value={visao} onChange={onChange} />
    <Text style={s.legenda}>{semViuva(`Todas as carteiras e cartões${resultado?.doCache || erro ? '. Último resultado disponível' : ''}`)}</Text>
    {mostrarPeriodo && resultado && <Text style={s.legenda}>{semViuva(`${formatDateLabel(resultado.inicio)} a ${formatDateLabel(resultado.fim)}`)}</Text>}
    {erro && <AppPressable accessibilityRole="button" onPress={carregar} style={s.acao}><Text accessibilityRole="alert" style={s.texto}>{semViuva(`${erro} Toque para tentar novamente.`)}</Text></AppPressable>}
    {!resultado && !erro && <Text style={s.texto}>{semViuva('Carregando categorias…')}</Text>}
  </View>;
}
const s = StyleSheet.create({
  grupo: { gap: spacing.md },
  legenda: { color: theme.inkFaint, fontFamily: fonts.light, fontSize: type.legenda, lineHeight: lh(type.legenda, 'apoio') },
  texto: { color: theme.inkSoft, fontFamily: fonts.light, fontSize: type.apoio, lineHeight: lh(type.apoio, 'corpo') },
  acao: { minHeight: touchTarget, justifyContent: 'center' },
});
