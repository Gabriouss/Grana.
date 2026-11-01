import { Text, View, StyleSheet } from 'react-native';
import AppPressable from './AppPressable';
import PrivacyValue from './PrivacyValue';
import { acimaDoTeto, valorDaVisao, type ConsumoPorCategoria, type Visao } from '@/lib/gastos-categoria';
import { formatBRL } from '@/lib/format';
import { semViuva } from '@/lib/sem-viuva';
import { fonts, spacing, theme, radius, type, lh, touchTarget } from '@/lib/theme';

export default function CategoriaTeto({ categoria, teto, consumo, visao, abrir, definir }: {
  categoria: string; teto: number; consumo?: ConsumoPorCategoria; visao: Visao; abrir: () => void; definir: () => void;
}) {
  const c = consumo ?? { category: categoria, tudo: 0, avista: 0, credito: 0 };
  const excesso = acimaDoTeto(c.tudo, teto);
  const progresso = teto > 0 ? Math.min(c.tudo / (teto * 100), 1) : c.tudo > 0 ? 1 : 0;
  return <View style={s.grupo}>
    <View style={s.cabecalho}>
      <AppPressable accessibilityRole="button" onPress={abrir} style={s.botao}><Text style={s.nome}>{semViuva(categoria)}</Text></AppPressable>
      <AppPressable accessibilityRole="button" onPress={definir} style={s.botao}><Text style={s.texto}>{semViuva('Ajustar teto')}</Text></AppPressable>
    </View>
    <PrivacyValue><Text style={s.texto}>{semViuva(`Teto total: ${formatBRL(c.tudo / 100)} de ${formatBRL(teto)}`)}</Text></PrivacyValue>
    <View style={s.trilho}>
      <View style={[s.parte, { width: `${c.tudo ? progresso * c.avista / c.tudo * 100 : 0}%`, backgroundColor: theme.down }]} />
      <View style={[s.parte, { width: `${c.tudo ? progresso * c.credito / c.tudo * 100 : 0}%`, backgroundColor: theme.accent2 }]} />
    </View>
    <View style={s.legenda}>
      <Text style={[s.texto, { color: theme.down }]}>{semViuva('Débito e Pix')}{visao === 'avista' ? ' · selecionado' : ''}</Text>
      <Text style={[s.texto, { color: theme.accent2 }]}>{semViuva('Crédito')}{visao === 'credito' ? ' · selecionado' : ''}</Text>
    </View>
    {visao !== 'tudo' && <PrivacyValue><Text style={s.texto}>{semViuva(`Nesta visão: ${formatBRL(valorDaVisao(c, visao) / 100)}`)}</Text></PrivacyValue>}
    {excesso > 0 && <PrivacyValue><Text style={s.texto}>{semViuva(`${formatBRL(excesso / 100)} acima do teto`)}</Text></PrivacyValue>}
  </View>;
}
const s = StyleSheet.create({
  grupo: { gap: spacing.sm, paddingVertical: spacing.sm }, cabecalho: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  botao: { minHeight: touchTarget, justifyContent: 'center' }, nome: { color: theme.ink, fontFamily: fonts.regular, fontSize: type.nota, lineHeight: lh(type.nota, 'corpo') },
  texto: { color: theme.inkSoft, fontFamily: fonts.light, fontSize: type.apoio, lineHeight: lh(type.apoio, 'corpo'), fontVariant: ['tabular-nums'] },
  trilho: { height: spacing.icone, borderRadius: radius.pill, backgroundColor: theme.paper, overflow: 'hidden', flexDirection: 'row' }, parte: { height: '100%' },
  legenda: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xs },
});
