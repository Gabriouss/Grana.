import { StyleSheet, Text, View } from 'react-native';
import PrivacyValue from './PrivacyValue';
import { semViuva } from '@/lib/sem-viuva';
import { fonts, radius, spacing, theme, type, lh, touchTarget, card } from '@/lib/theme';
import type { PadraoDeGastos } from '@/lib/desafios-padrao-gastos';
import { formatBRL } from '@/lib/format';

export default function DesafiosPadraoGastos({ padrao }: { padrao: PadraoDeGastos | null }) {
  if (!padrao) return null;
  const frases: string[] = [];
  const data = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  if (padrao.quinzena?.tipo === 'maior') {
    const { periodo, outro } = padrao.quinzena;
    frases.push(`A ${periodo.rotulo} quinzena teve mais gasto: ${formatBRL(periodo.total)}, contra ${formatBRL(outro.total)} na ${outro.rotulo}.`);
  } else if (padrao.quinzena) frases.push('As duas quinzenas tiveram gastos parecidos por dia.');
  if (padrao.semana?.tipo === 'maior') {
    const { periodo } = padrao.semana;
    frases.push(`A semana de ${data(periodo.inicio)} a ${data(periodo.fim)} foi a de maior gasto: ${formatBRL(periodo.total)}.`);
  } else if (padrao.semana) frases.push('As semanas tiveram gastos parecidos por dia.');
  if (padrao.dia) frases.push(`O dia de maior gasto foi ${data(padrao.dia.iso)}, com ${formatBRL(padrao.dia.total)}.`);
  return <View style={s.card}>
    <Text style={s.titulo}>{semViuva('Padrão de gastos')}</Text>
    <Text style={s.texto}>{semViuva(new Date(padrao.ano, padrao.mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}</Text>
    {frases.map(frase => <PrivacyValue key={frase}><Text style={s.texto}>{semViuva(frase)}</Text></PrivacyValue>)}
    <Text style={s.texto}>{semViuva('As comparações entre semanas e quinzenas usam a média por dia. Compras no crédito contam no dia da compra. O pagamento da fatura fica fora.')}</Text>
  </View>;
}
const s = StyleSheet.create({
  card: { padding: card.padding, borderRadius: card.radius, borderWidth: card.borderWidth, borderColor: theme.rule, backgroundColor: theme.paperRaised, gap: spacing.sm },
  titulo: { fontFamily: fonts.regular, color: theme.ink, fontSize: type.corpo, lineHeight: lh(type.corpo, 'corpo') },
  texto: { fontFamily: fonts.light, color: theme.inkSoft, fontSize: type.apoio, lineHeight: lh(type.apoio, 'corpo'), fontVariant: ['tabular-nums'] },
});
