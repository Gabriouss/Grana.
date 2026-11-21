import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppPressable from './AppPressable';
import MonthSelector from './MonthSelector';
import PrivacyValue from './PrivacyValue';
import { fetchDiasComRegistro } from '@/lib/data';
import { gastosDoDia } from '@/lib/categorias-cliente';
import { useCategorias } from '@/lib/use-categorias';
import { DEMO_TRANSACTIONS } from '@/lib/demo-data';
import { formatMoney, isoLocal } from '@/lib/format';
import { isCreditTx } from '@/lib/transaction-rules';
import { montarCalendario, podeIrParaMesAnterior, podeIrParaProximoMes } from '@/lib/desafios-calendario';
import { fonts, radius, spacing, theme, type, lh, touchTarget, card, menta } from '@/lib/theme';
import { semViuva } from '@/lib/sem-viuva';
import type { GamificationState } from '@/lib/gamification';

/** Linhas montadas por vez no painel do dia: um dia importado pode ter milhares de saídas. */
const LOTE_DO_DIA = 20;

export default function DesafiosCalendario({ dias, weekActivity, streak, demo, aoPainelMudar }: {
  dias: ReadonlySet<string>; weekActivity: GamificationState['weekActivity']; streak: number; demo: boolean;
  /** Avisa quando o painel do dia aparece ou muda de altura, para a tela rolar até ele. */
  aoPainelMudar?: (painel: View) => void;
}) {
  const painelRef = useRef<View>(null);
  const hoje = new Date();
  const [mes, setMes] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() });
  const [historico, setHistorico] = useState<ReadonlySet<string> | null>(null);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [diaEscolhido, setDiaEscolhido] = useState<string | null>(null);
  const [visiveis, setVisiveis] = useState(LOTE_DO_DIA);
  const inicioDoMes = isoLocal(new Date(mes.ano, mes.mes, 1));
  const fimDoMes = isoLocal(new Date(mes.ano, mes.mes + 1, 0));
  const consulta = useCategorias(inicioDoMes, fimDoMes, demo, DEMO_TRANSACTIONS, diaEscolhido !== null);
  // Resultado de outro mês não vale: o hook guarda o último até a nova consulta chegar.
  const gastos = useMemo(() => diaEscolhido && consulta.resultado?.inicio === inicioDoMes ? gastosDoDia(consulta.resultado, diaEscolhido) : null,
    [consulta.resultado, diaEscolhido, inicioDoMes]);
  const escolherDia = (dia: string | null) => { setVisiveis(LOTE_DO_DIA); setDiaEscolhido(dia); };
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
  const ativosNaSemana = weekActivity.filter(d => d.active).length;
  const carregado = atual || demo || historico !== null;
  const calendario = montarCalendario(atual || demo ? dias : historico ?? new Set(), mes.ano, mes.mes, hoje);
  const nome = new Date(mes.ano, mes.mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return <View style={s.card}>
    <Text style={s.titulo}>{semViuva('Constância')}</Text>
    {atual && <View style={s.grupo}>
      <Text style={s.texto}>{semViuva(`Ritmo da semana: ${ativosNaSemana} ${ativosNaSemana === 1 ? 'dia' : 'dias'} com registro`)}</Text>
      <View style={s.linha}>{weekActivity.map((d, i) => <View key={i} style={s.coluna}>
        <View style={[s.circulo, d.active && s.ativo, d.isToday && s.hoje]}>
          {d.active ? <Ionicons name="checkmark" size={12} color={theme.paper} /> : <View style={s.ponto} />}
        </View>
        <Text style={s.numero}>{d.dayName}</Text>
      </View>)}</View>
      <Text style={s.texto}>{semViuva(`${streak} ${streak === 1 ? 'dia seguido' : 'dias seguidos'} com registro`)}</Text>
    </View>}
    <MonthSelector year={mes.ano} month={mes.mes} onChange={(ano, mes) => { escolherDia(null); setMes({ ano, mes }); }}
      anteriorDesabilitado={!podeIrParaMesAnterior(mes.ano, mes.mes, hoje)} proximoDesabilitado={!podeIrParaProximoMes(mes.ano, mes.mes, hoje)} />
    {erro ? <AppPressable accessibilityRole="button" onPress={() => setTentativa(t => t + 1)} style={s.navegacao}><Text accessibilityRole="alert" style={s.texto}>{semViuva('Não foi possível carregar o mês. Toque para tentar novamente.')}</Text></AppPressable>
      : !carregado ? <ActivityIndicator color={theme.ink} /> : <View style={s.grupo}>
        {/* Grade de calendário: cabeçalho dos dias da semana e uma casa
            quadrada por dia. Com registro, a casa é cheia; vivido sem
            registro, casa vazia; hoje, contorno claro; futuro, só o número
            apagado, porque ainda não pode ter registro. */}
        <View style={s.grade}>
          <View style={s.linha}>{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => <Text key={d} style={[s.diaSemana, s.coluna]}>{d}</Text>)}</View>
          {calendario.semanas.map((semana, i) => <View key={i} style={[s.linha, s.semana]}>{semana.map((d, j) => d ? <AppPressable key={j} accessibilityRole="button"
            accessibilityLabel={`${d.dia} de ${nome}${d.registro ? ', com registro' : ''}${d.hoje ? ', hoje' : ''}. Ver gastos do dia`}
            accessibilityState={{ selected: diaEscolhido === d.iso }} onPress={() => escolherDia(diaEscolhido === d.iso ? null : d.iso)} style={s.celula}>
            <View style={[s.anel, diaEscolhido === d.iso && s.anelEscolhido]}><View style={[s.casa, d.registro && s.casaRegistro, d.futuro && s.casaFutura, d.hoje && s.casaHoje, d.hoje && d.registro && s.casaHojeRegistro]}>
              <Text style={[s.numero, d.registro && s.numeroAtivo, d.futuro && s.numeroFuturo]}>{d.dia}</Text>
            </View></View>
          </AppPressable> : <View key={j} style={s.celula} />)}</View>)}
        </View>
        {/* Resumo como legenda da grade (item 52, pedido do autor): a amostra é a
            mesma casa cheia dos dias com registro, alinhada à borda da grade. */}
        <View style={s.legenda}>
          <View style={s.amostra} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden />
          <Text style={s.texto}>{semViuva(calendario.resumo)}</Text>
        </View>
        {diaEscolhido && <View ref={painelRef} collapsable={false} onLayout={() => { if (painelRef.current) aoPainelMudar?.(painelRef.current); }} accessibilityLiveRegion="polite" style={s.grupo}>
          <View style={s.cabecalho}>
            <Text style={s.titulo}>{semViuva(`${Number(diaEscolhido.slice(8))} de ${new Date(mes.ano, mes.mes, 1).toLocaleDateString('pt-BR', { month: 'long' })}`)}</Text>
            {gastos && gastos.centavos > 0 && <PrivacyValue><Text style={s.total}>{`− R$ ${formatMoney(gastos.centavos / 100)}`}</Text></PrivacyValue>}
          </View>
          {gastos ? <>
            {consulta.erro && <AppPressable accessibilityRole="button" onPress={() => void consulta.carregar()} style={s.navegacao}><Text accessibilityRole="alert" style={s.texto}>{semViuva('Não foi possível carregar os gastos. Toque para tentar novamente.')}</Text></AppPressable>}
            {gastos.linhas.length === 0 ? <Text style={s.texto}>{semViuva('Nenhum gasto neste dia.')}</Text>
              : gastos.linhas.slice(0, visiveis).map((t, i, lote) => <View key={t.id} style={[s.gasto, i < lote.length - 1 && s.gastoDivisor]}>
                <View style={s.gastoInfo}>
                  <Text style={s.gastoDescricao}>{t.description}</Text>
                  <Text style={s.gastoDetalhe}>{`${t.category} · ${isCreditTx(t) ? 'Crédito' : 'Débito e Pix'}`}</Text>
                </View>
                <PrivacyValue><Text style={s.total}>{`− R$ ${formatMoney(Number(t.amount))}`}</Text></PrivacyValue>
              </View>)}
            {gastos.linhas.length > visiveis && <AppPressable accessibilityRole="button" onPress={() => setVisiveis(v => v + LOTE_DO_DIA)} style={s.navegacao}>
              <Text style={s.texto}>{semViuva(`Ver mais itens (${gastos.linhas.length - visiveis} restantes)`)}</Text>
            </AppPressable>}
          </> : consulta.erro ? <AppPressable accessibilityRole="button" onPress={() => void consulta.carregar()} style={s.navegacao}><Text accessibilityRole="alert" style={s.texto}>{semViuva('Não foi possível carregar os gastos. Toque para tentar novamente.')}</Text></AppPressable>
            : <ActivityIndicator color={theme.ink} />}
        </View>}
      </View>}
  </View>;
}
/* Recuo da casa dentro da célula: o vão e a borda do anel de seleção. A
   amostra da legenda usa o mesmo recuo para começar na borda da primeira
   casa, e não na da célula (nit do item 52, 21/11/2026). */
const BORDA_ANEL = 1.5;
const RECUO_CASA = spacing.fio + BORDA_ANEL;

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
  grade: { gap: spacing.xs },
  semana: { gap: spacing.xs },
  diaSemana: { textAlign: 'center', color: theme.inkFaint, fontFamily: fonts.regular, fontSize: type.legenda, lineHeight: lh(type.legenda, 'apoio') },
  celula: { flex: 1, minWidth: 0, minHeight: touchTarget },
  // Anel fora da casa, com um vão sobre o fundo do cartão; sempre reservado para a grade não pular.
  anel: { flex: 1, padding: spacing.fio, borderRadius: radius.sm, borderWidth: BORDA_ANEL, borderColor: 'transparent' },
  anelEscolhido: { borderColor: theme.accent2 },
  casa: { flex: 1, borderRadius: radius.sm, backgroundColor: menta(0.06), borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  casaRegistro: { backgroundColor: theme.accent2 },
  legenda: { flexDirection: 'row', alignItems: 'center', gap: spacing.icone, paddingLeft: RECUO_CASA },
  // Casa em miniatura: mesmo preenchimento e proporção de canto da casa da grade.
  amostra: { width: spacing.md, height: spacing.md, borderRadius: spacing.fio, backgroundColor: theme.accent2 },
  casaFutura: { backgroundColor: 'transparent' },
  casaHoje: { borderColor: theme.ink },
  // Sobre a casa clara, o contorno escuro distingue hoje dos outros dias com registro.
  casaHojeRegistro: { borderColor: theme.paper },
  numeroFuturo: { color: theme.inkFaint },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  total: { color: theme.down, fontFamily: fonts.regular, fontSize: type.apoio, lineHeight: lh(type.apoio, 'valor'), flexShrink: 0 },
  // Mesmo desenho da linha de CreditTransactionRow (credito.tsx), sem data nem opções.
  gasto: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 10 },
  gastoDivisor: { borderBottomWidth: 1, borderBottomColor: theme.rule },
  gastoInfo: { flex: 1, minWidth: 0, gap: spacing.fio },
  gastoDescricao: { color: theme.ink, fontFamily: fonts.regular, fontSize: type.apoio, lineHeight: lh(type.apoio, 'corpo') },
  gastoDetalhe: { color: theme.inkFaint, fontFamily: fonts.regular, fontSize: type.legenda, lineHeight: lh(type.legenda, 'apoio') },
  navegacao: { flexDirection: 'row', alignItems: 'center', minHeight: touchTarget },
});
