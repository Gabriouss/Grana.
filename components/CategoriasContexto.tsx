import { StyleSheet, Text, View } from 'react-native';
import SegmentedTabs from './SegmentedTabs';
import AppPressable from './AppPressable';
import { fonts, spacing, theme, type, lh, touchTarget } from '@/lib/theme';
import { semViuva } from '@/lib/sem-viuva';
import { formatDateLabel } from '@/lib/format';
import type { Visao } from '@/lib/gastos-categoria';
import type { CategoriasConsultadas } from '@/lib/categorias-cliente';

export default function CategoriasContexto({ visao, onChange, resultado, erro, carregar }: {
  visao: Visao; onChange: (v: Visao) => void; resultado: CategoriasConsultadas | null; erro: string | null; carregar: () => void;
}) {
  return <View style={s.grupo}>
    <Text style={s.texto}>{semViuva('Categorias e tetos de todas as carteiras e cartões')}</Text>
    <SegmentedTabs options={[{ key: 'tudo', label: 'Tudo' }, { key: 'avista', label: 'Débito e Pix' }, { key: 'credito', label: 'Crédito' }]} value={visao} onChange={onChange} />
    <Text style={s.texto}>{semViuva('Débito e Pix inclui dinheiro, boletos pagos e registros sem forma de pagamento. Os tetos sempre contam Tudo.')}</Text>
    {resultado && <Text style={s.texto}>{semViuva(`${formatDateLabel(resultado.inicio)} a ${formatDateLabel(resultado.fim)}${resultado.doCache || erro ? '. Último resultado disponível' : ''}`)}</Text>}
    {erro && <AppPressable accessibilityRole="button" onPress={carregar} style={s.acao}><Text accessibilityRole="alert" style={s.texto}>{semViuva(`${erro} Toque para tentar novamente.`)}</Text></AppPressable>}
    {!resultado && !erro && <Text style={s.texto}>{semViuva('Carregando categorias…')}</Text>}
  </View>;
}
const s = StyleSheet.create({
  grupo: { gap: spacing.sm, marginBottom: spacing.md },
  texto: { color: theme.inkSoft, fontFamily: fonts.light, fontSize: type.apoio, lineHeight: lh(type.apoio, 'corpo') },
  acao: { minHeight: touchTarget, justifyContent: 'center' },
});
