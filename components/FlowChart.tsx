import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme, spacing, type, fonts } from '@/lib/theme';
import { formatMoney, todayISO } from '@/lib/format';
import type { Transaction } from '@/lib/types';
import { usePrivacy } from '@/lib/privacy-context';
import { serieEntradas, serieSaidas, useLinhaFluxo } from './LinhaFluxo';

export type ChartPeriod = 'month' | '7days' | 'year';

/* O desenho (grade, eixos, séries, marcadores, toque e entrada) mora em
   `LinhaFluxo.tsx` e é o mesmo da tela Gráficos (item 53, 20/11/2026). Aqui
   ficam os baldes do período, as somas e o cabeçalho do ponto tocado. */

type Bucket = {
  labelStart: string;
  labelEnd: string;
  /** Identifica ESTE balde (não a série inteira) — mostrado ao tocar no
      ponto, pra conferir onde está o valor que não aparece óbvio na curva
      (um balde pequeno perto de um pico gigante fica visualmente achatado
      perto de zero, mas o valor continua ali). */
  label: string;
  matches: (txDate: string) => boolean;
};

function generateBuckets(period: ChartPeriod, year: number, month: number): Bucket[] {
  const pad = (n: number) => String(n).padStart(2, '0');

  if (period === 'year') {
    // 12 pontos, um por mês do ano — cada ponto é o lançamento de 1 mês só,
    // não uma soma de dois meses (isso inventava um valor que nenhum mês
    // isolado teve de verdade quando exibido ao tocar no ponto).
    const nomesMes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return nomesMes.map((nome, mIndex) => ({
      labelStart: 'Jan',
      labelEnd: 'Dez',
      label: nome,
      matches: (txDate: string) => {
        const [y, m] = txDate.split('-').map(Number);
        return y === year && m - 1 === mIndex;
      },
    }));
  }

  if (period === '7days') {
    // 7 dias consecutivos (usando a semana atual ou início do mês selecionado)
    const now = new Date();
    const isCurrent = now.getFullYear() === year && now.getMonth() === month;
    const refDay = isCurrent ? now.getDate() : Math.min(28, new Date(year, month + 1, 0).getDate());
    const buckets: Bucket[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(year, month, refDay - i);
      const targetStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      buckets.push({
        labelStart: `${pad(new Date(year, month, refDay - 6).getDate())}/${pad(month + 1)}`,
        labelEnd: `${pad(new Date(year, month, refDay).getDate())}/${pad(month + 1)}`,
        label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
        matches: (txDate: string) => txDate === targetStr,
      });
    }
    return buckets;
  }

  // Padrão: 'month' (7 períodos bem distribuídos ao longo de todo o mês selecionado)
  const lastDay = new Date(year, month + 1, 0).getDate();
  const step = lastDay / 6;
  const dayRanges = [
    { start: 1, end: Math.round(step) },
    { start: Math.round(step) + 1, end: Math.round(step * 2) },
    { start: Math.round(step * 2) + 1, end: Math.round(step * 3) },
    { start: Math.round(step * 3) + 1, end: Math.round(step * 4) },
    { start: Math.round(step * 4) + 1, end: Math.round(step * 5) },
    { start: Math.round(step * 5) + 1, end: Math.round(step * 5.5) },
    { start: Math.round(step * 5.5) + 1, end: lastDay },
  ];

  return dayRanges.map((r) => ({
    labelStart: `01/${pad(month + 1)}`,
    labelEnd: `${pad(lastDay)}/${pad(month + 1)}`,
    label: r.start === r.end ? `${pad(r.start)}/${pad(month + 1)}` : `${pad(r.start)} a ${pad(r.end)}/${pad(month + 1)}`,
    matches: (txDate: string) => {
      const [y, m, d] = txDate.split('-').map(Number);
      return y === year && m - 1 === month && d >= r.start && d <= r.end;
    },
  }));
}

export default function FlowChart({
  transactions,
  period = 'month',
  year,
  month,
}: {
  transactions: Transaction[];
  period?: ChartPeriod;
  year?: number;
  month?: number;
}) {
  const currentYear = year ?? new Date().getFullYear();
  const currentMonth = month ?? new Date().getMonth();

  const hojeISO = todayISO();
  const buckets = useMemo(() => generateBuckets(period, currentYear, currentMonth), [period, currentYear, currentMonth, hojeISO]);
  /* A3: abria no ÚLTIMO ponto, que no mês corrente é "29–30/09 · Sem
     movimentação", onze dias à frente de hoje. Abre no período que contém
     hoje; em mês passado ou outro período, nenhum ponto contém hoje e o
     último segue como padrão. */
  const indiceInicial = () => {
    const i = buckets.findIndex((b) => b.matches(hojeISO));
    return i >= 0 ? i : buckets.length - 1;
  };
  const [selecionado, setSelecionado] = useState(indiceInicial);

  const { inTotals, outTotals } = useMemo(() => ({
    inTotals: buckets.map((b) =>
      transactions
        .filter((t) => t.type === 'in' && b.matches(t.occurred_on))
        .reduce((sum, t) => sum + Number(t.amount), 0)
    ),

    outTotals: buckets.map((b) =>
      transactions
        .filter((t) => t.type === 'out' && b.matches(t.occurred_on))
        .reduce((sum, t) => sum + Number(t.amount), 0)
    ),
  }), [transactions, buckets]);

  const { hidden } = usePrivacy();

  useEffect(() => {
    setSelecionado(indiceInicial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, currentYear, currentMonth]);

  const desenho = useLinhaFluxo({
    series: [serieEntradas(inTotals), serieSaidas(outTotals)],
    selecionado,
    onSelecionar: setSelecionado,
    rotuloInicio: buckets[0]?.labelStart || '',
    rotuloFim: buckets[buckets.length - 1]?.labelEnd || '',
    rotuloToque: (i) =>
      hidden
        ? `${buckets[i]?.label ?? ''}: valores ocultos`
        : `${buckets[i]?.label ?? ''}: entradas R$ ${formatMoney(inTotals[i] ?? 0)}, saídas R$ ${formatMoney(outTotals[i] ?? 0)}`,
    assinatura: JSON.stringify([inTotals, outTotals, period, currentYear, currentMonth]),
    idDegrade: 'fluxoAreaFill',
  });

  const inSelecionado = inTotals[selecionado] ?? 0;
  const outSelecionado = outTotals[selecionado] ?? 0;
  const labelSelecionado = buckets[selecionado]?.label ?? '';

  return (
    <View>
      {/* Cabeçalho de detalhe do balde tocado. Existe porque um balde pequeno
          perto de um pico gigante fica achatado perto de zero na curva, mas o
          valor continua ali: tocando dá pra conferir. */}
      {labelSelecionado ? (
        <View style={styles.selectionHeader}>
          <Text style={styles.selectionLabel}>{labelSelecionado}</Text>
          <View style={styles.selectionValues}>
            {inSelecionado > 0 && (
              <Text style={[styles.selectionValor, { color: theme.up }]}>+ R$ {formatMoney(inSelecionado)}</Text>
            )}
            {outSelecionado > 0 && (
              <Text style={[styles.selectionValor, { color: theme.down }]}>− R$ {formatMoney(outSelecionado)}</Text>
            )}
            {inSelecionado === 0 && outSelecionado === 0 && (
              <Text style={[styles.selectionValor, { color: theme.inkFaint }]}>Sem movimentação</Text>
            )}
          </View>
        </View>
      ) : null}

      {desenho}
    </View>
  );
}

const styles = StyleSheet.create({
  selectionHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  selectionValues: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm, flexShrink: 1 },
  selectionLabel: {
    color: theme.ink,
    fontSize: type.nota,
    fontFamily: fonts.regular,
  },
  selectionValor: {
    fontSize: type.nota,
    fontFamily: fonts.regular,
    /* Este valor muda enquanto o dedo arrasta pelo gráfico — é o caso exato
       que a Tabular Rule existe para evitar: sem largura fixa de dígito, o
       número dança sob o dedo em vez de só mudar. */
    fontVariant: ['tabular-nums'],
  },
});
