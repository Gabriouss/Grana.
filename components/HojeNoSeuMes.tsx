import { Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppPressable from './AppPressable';
import { isoLocal } from '@/lib/format';
import { semViuva } from '@/lib/sem-viuva';
import { fonts, spacing, theme, radius } from '@/lib/theme';
import type { Bill, CreditCard, Goal, Transaction } from '@/lib/types';

export default function HojeNoSeuMes({ bills, cards, goals, tx }: {
  bills: Bill[]; cards: CreditCard[]; goals: Goal[]; tx: Transaction[];
}) {
  const router = useRouter();
  const hoje = new Date();
  const iso = isoLocal(hoje);
  const limite = isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 7));
  const contas = bills.filter(b => b.status !== 'paid' && b.due_date >= iso && b.due_date <= limite);
  const fechamento = cards.find(c => {
    const dia = Math.min(c.closing_day, new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate());
    const data = isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), dia));
    return data >= iso && data <= limite;
  });
  const meta = goals.find(g => g.deadline && g.deadline >= iso && g.deadline <= limite && Number(g.current_amount) < Number(g.target_amount));
  const semCategoria = tx.filter(t => !t.category?.trim() || t.category === 'Sem categoria').length;
  const acoes: { texto: string; abrir: () => void }[] = [];
  if (contas.length) acoes.push({ texto: `${contas.length} ${contas.length === 1 ? 'conta vence' : 'contas vencem'} nos próximos 7 dias`, abrir: () => router.push('/(app)/contas') });
  if (fechamento) acoes.push({ texto: `A fatura de ${fechamento.name} fecha nos próximos 7 dias`, abrir: () => router.push('/(app)/credito') });
  if (meta) acoes.push({ texto: `A meta ${meta.title} tem prazo nos próximos 7 dias`, abrir: () => router.push({ pathname: '/(app)', params: { acao: 'deposit-goal', goalId: meta.id } }) });
  if (semCategoria) acoes.push({ texto: `${semCategoria} ${semCategoria === 1 ? 'lançamento recente sem categoria' : 'lançamentos recentes sem categoria'}`, abrir: () => router.push('/(app)/lancamentos') });
  if (!acoes.length) return null;
  return <View style={s.bloco}>
    <Text style={s.titulo}>{semViuva('Hoje no seu mês')}</Text>
    {acoes.slice(0, 3).map(a => <AppPressable key={a.texto} accessibilityRole="button" onPress={a.abrir} style={s.acao}>
      <Text style={s.texto}>{semViuva(a.texto)}</Text>
      <Ionicons name="chevron-forward" color={theme.inkSoft} size={18} />
    </AppPressable>)}
  </View>;
}
const s = StyleSheet.create({
  bloco: { gap: spacing.sm },
  titulo: { fontFamily: fonts.regular, color: theme.ink, fontSize: 18 },
  acao: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, padding: spacing.md, borderRadius: radius.md, backgroundColor: theme.paperRaised },
  texto: { flex: 1, color: theme.ink, fontFamily: fonts.light, fontSize: 15 },
});
