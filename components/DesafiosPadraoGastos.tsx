import { StyleSheet, Text, View } from 'react-native';
import PrivacyValue from './PrivacyValue';
import { semViuva } from '@/lib/sem-viuva';
import { fonts, radius, spacing, theme } from '@/lib/theme';
import type { PadraoDeGastos } from '@/lib/desafios-padrao-gastos';

export default function DesafiosPadraoGastos({ padrao }: { padrao: PadraoDeGastos | null }) {
  if (!padrao) return null;
  return <View style={s.card}>
    <Text style={s.titulo}>{semViuva('Padrão de gastos')}</Text>
    <Text style={s.texto}>{semViuva(new Date(padrao.ano, padrao.mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}</Text>
    {Object.entries(padrao.frases).map(([chave, frase]) => <PrivacyValue key={chave}><Text style={s.texto}>{semViuva(frase)}</Text></PrivacyValue>)}
    <Text style={s.texto}>{semViuva('As comparações entre semanas e quinzenas usam a média por dia. Compras no crédito contam no dia da compra. O pagamento da fatura fica fora.')}</Text>
  </View>;
}
const s = StyleSheet.create({
  card: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: theme.paperRaised, gap: spacing.sm },
  titulo: { fontFamily: fonts.regular, color: theme.ink, fontSize: 18 },
  texto: { fontFamily: fonts.light, color: theme.inkSoft, fontSize: 14, lineHeight: 21 },
});
