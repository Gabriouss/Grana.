import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppPressable from './AppPressable';
import MonthSelector from './MonthSelector';
import { fetchDiasComRegistro } from '@/lib/data';
import { montarCalendario, podeIrParaMesAnterior, podeIrParaProximoMes } from '@/lib/desafios-calendario';
import { fonts, radius, spacing, theme, type, lh, touchTarget, card, menta } from '@/lib/theme';
import { semViuva } from '@/lib/sem-viuva';
import type { GamificationState } from '@/lib/gamification';

export default function DesafiosCalendario({ dias, weekActivity, streak, demo }: {
  dias: ReadonlySet<string>; weekActivity: GamificationState['weekActivity']; streak: number; demo: boolean;
}) {
  const hoje = new Date();
  const [mes, setMes] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() });
  const [historico, setHistorico] = useState<ReadonlySet<string> | null>(null);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const atual = mes.ano === hoje.getFullYear() && mes.mes === hoje.getMonth();
  useEffect(() => {
    let ativo = true;
    setHistorico(null);
    setErro(false);
    if (!atual && !demo) fetchDiasComRegistro(mes.ano, mes.mes).then(d => {
      if (ativo) setHistorico(d);
    }).catch(e => { console.error('[desafios] calendário falhou', e); if (ativo) setErro(true); });
    return () => { ativo = false; };
  }, [mes.ano, mes.mes, atual, demo, dias, tentativa]);
  const carregado = atual || demo || historico !== null;
  const calendario = montarCalendario(atual || demo ? dias : historico ?? new Set(), mes.ano, mes.mes, hoje);
  const nome = new Date(mes.ano, mes.mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return <View style={s.card}>
    <Text style={s.titulo}>{semViuva('Constância')}</Text>
    {atual && <View style={s.grupo}>
      <Text style={s.texto}>{semViuva(`Ritmo da semana: ${weekActivity.filter(d => d.active).length} dias com registro`)}</Text>
      <View style={s.linha}>{weekActivity.map((d, i) => <View key={i} style={s.coluna}>
        <View style={[s.circulo, d.active && s.ativo, d.isToday && s.hoje]}>
          {d.active ? <Ionicons name="checkmark" size={12} color={theme.paper} /> : <View style={s.ponto} />}
        </View>
        <Text style={s.numero}>{d.dayName}</Text>
      </View>)}</View>
      <Text style={s.texto}>{semViuva(`${streak} ${streak === 1 ? 'dia seguido' : 'dias seguidos'} com registro`)}</Text>
    </View>}
    <MonthSelector year={mes.ano} month={mes.mes} onChange={(ano, mes) => setMes({ ano, mes })}
      anteriorDesabilitado={!podeIrParaMesAnterior(mes.ano, mes.mes, hoje)} proximoDesabilitado={!podeIrParaProximoMes(mes.ano, mes.mes, hoje)} />
    {erro ? <AppPressable accessibilityRole="button" onPress={() => setTentativa(t => t + 1)} style={s.navegacao}><Text accessibilityRole="alert" style={s.texto}>{semViuva('Não foi possível carregar o mês. Toque para tentar novamente.')}</Text></AppPressable>
      : !carregado ? <ActivityIndicator color={theme.ink} /> : <View style={s.grupo}>
        <Text style={s.texto}>{semViuva(calendario.resumo)}</Text>
        <View style={s.linha}>{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => <Text key={d} style={[s.texto, s.coluna, { textAlign: 'center' }]}>{d}</Text>)}</View>
        {calendario.semanas.map((semana, i) => <View key={i} style={s.linha}>{semana.map((d, j) => <View key={j} style={s.coluna}>
          {d && <View accessible accessibilityLabel={`${d.dia} de ${nome}${d.registro ? ', com registro' : ''}${d.hoje ? ', hoje' : ''}`} style={[s.circulo, d.registro && s.ativo, d.hoje && s.hoje]}><Text style={[s.numero, d.registro && s.numeroAtivo]}>{d.dia}</Text></View>}
        </View>)}</View>)}
      </View>}
  </View>;
}
const s = StyleSheet.create({
  card: { padding: card.padding, borderRadius: card.radius, borderWidth: card.borderWidth, borderColor: theme.rule, backgroundColor: theme.paperRaised, gap: spacing.md },
  titulo: { color: theme.ink, fontFamily: fonts.regular, fontSize: type.corpo, lineHeight: lh(type.corpo, 'corpo') },
  texto: { color: theme.inkSoft, fontFamily: fonts.light, fontSize: type.apoio, lineHeight: lh(type.apoio, 'corpo') },
  grupo: { gap: spacing.sm }, linha: { flexDirection: 'row' }, coluna: { flex: 1, alignItems: 'center', minWidth: 0, gap: spacing.icone },
  // Mesmo círculo de 26px do Ritmo da semana; o mínimo permite crescer com a fonte.
  circulo: { minWidth: 26, minHeight: 26, padding: spacing.xs, borderRadius: radius.pill, backgroundColor: menta(0.06), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  ativo: { backgroundColor: theme.accent2, borderColor: theme.accent2 }, hoje: { borderColor: theme.accent2 },
  ponto: { width: spacing.xs, height: spacing.xs, borderRadius: radius.pill, backgroundColor: theme.inkFaint },
  numero: { color: theme.inkSoft, fontFamily: fonts.regular, fontSize: type.micro, lineHeight: lh(type.micro, 'apoio') }, numeroAtivo: { color: theme.paper },
  navegacao: { flexDirection: 'row', alignItems: 'center', minHeight: touchTarget },
});
