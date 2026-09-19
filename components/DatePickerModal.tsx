import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AppModal from './AppModal';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, radius, spacing, fonts, type, touchTarget } from '@/lib/theme';
import { useSheetFlutuante } from '@/lib/breakpoints';
import AppPressable from './AppPressable';
import AccessibleModalPanel from './AccessibleModalPanel';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function DatePickerModal({
  visible,
  currentISO,
  title = 'Data do lançamento',
  onClose,
  onSelectDate,
}: {
  visible: boolean;
  currentISO: string; // 'YYYY-MM-DD'
  title?: string;
  onClose: () => void;
  onSelectDate: (iso: string) => void;
}) {
  const initialDate = currentISO ? new Date(currentISO + 'T00:00:00') : new Date();
  const [calYear, setCalYear] = useState<number>(initialDate.getFullYear() || 2026);
  const [calMonth, setCalMonth] = useState<number>(initialDate.getMonth() ?? 7);
  const [selectedDay, setSelectedDay] = useState<number>(initialDate.getDate() || 15);

  useEffect(() => {
    if (visible && currentISO) {
      const parts = currentISO.split('-').map(Number);
      if (parts.length === 3) {
        setCalYear(parts[0]);
        setCalMonth(parts[1] - 1);
        setSelectedDay(parts[2]);
      }
    }
  }, [visible, currentISO]);

  function handlePrevMonth() {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else {
      setCalMonth((m) => m - 1);
    }
  }

  function handleNextMonth() {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth((m) => m + 1);
    }
  }

  function handleQuickDate(daysOffset: number) {
    const iso = isoDaDataOffset(daysOffset);
    onSelectDate(iso);
    onClose();
  }

  function isoDaDataOffset(daysOffset: number) {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function handleFirstDayOfMonth() {
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = `${calYear}-${pad(calMonth + 1)}-01`;
    onSelectDate(iso);
    onClose();
  }


  function handleSelect(year: number, month: number, day: number) {
    setSelectedDay(day);
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
    onSelectDate(iso);
    onClose();
  }

  // Grid calculation (42 cells = 6 weeks)
  const firstWeekday = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate();
  const today = new Date();

  type Cell = { key: string; year: number; month: number; day: number; muted: boolean; isToday: boolean; isSelected: boolean };
  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - firstWeekday + 1;
    let cellDay = dayNum;
    let cellMonth = calMonth;
    let cellYear = calYear;
    let muted = false;

    if (dayNum < 1) {
      cellDay = daysInPrevMonth + dayNum;
      muted = true;
      cellMonth = calMonth - 1;
      if (cellMonth < 0) {
        cellMonth = 11;
        cellYear--;
      }
    } else if (dayNum > daysInMonth) {
      cellDay = dayNum - daysInMonth;
      muted = true;
      cellMonth = calMonth + 1;
      if (cellMonth > 11) {
        cellMonth = 0;
        cellYear++;
      }
    }

    const isToday =
      cellYear === today.getFullYear() &&
      cellMonth === today.getMonth() &&
      cellDay === today.getDate();

    const isSelected =
      !muted &&
      cellYear === calYear &&
      cellMonth === calMonth &&
      cellDay === selectedDay;

    cells.push({
      key: `${cellYear}-${cellMonth}-${cellDay}-${i}`,
      year: cellYear,
      month: cellMonth,
      day: cellDay,
      muted,
      isToday,
      isSelected,
    });
  }

  const { aoMedirFundo, scrimStyle, sheetStyle } = useSheetFlutuante();
  return (
    <AppModal visible={visible} transparent onRequestClose={onClose}>
      <Pressable style={[styles.modalScrim, scrimStyle]} onLayout={aoMedirFundo} onPress={onClose}>
        <AccessibleModalPanel ativo={visible} onClose={onClose} style={[styles.sheet, sheetStyle]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <AppPressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
              <Ionicons name="close" size={22} color={theme.inkFaint} />
            </AppPressable>
          </View>

          {/* Month/Year Header */}
          <View style={styles.calHead}>
            <AppPressable style={styles.calNav} onPress={handlePrevMonth} hitSlop={6} accessibilityLabel="Mês anterior">
              <Ionicons name="chevron-back" size={18} color={theme.ink} />
            </AppPressable>
            <Text style={styles.calMonthYear}>
              {MONTH_NAMES[calMonth]} {calYear}
            </Text>
            <AppPressable style={styles.calNav} onPress={handleNextMonth} hitSlop={6} accessibilityLabel="Próximo mês">
              <Ionicons name="chevron-forward" size={18} color={theme.ink} />
            </AppPressable>
          </View>

          {/* Weekday headers */}
          <View style={styles.weekdaysRow}>
            {WEEKDAYS.map((w, idx) => (
              <View key={idx} style={styles.weekdayCell}>
                <Text style={styles.weekdayText}>{w}</Text>
              </View>
            ))}
          </View>

          {/* Grade do calendário: 6 linhas fixas de 7 dias (uma por semana,
              domingo a sábado), igual a um calendário real — em vez de
              flexWrap dinâmico, que deixava o número de dias por linha
              variar conforme a largura disponível. */}
          <View style={styles.daysGrid}>
            {Array.from({ length: 6 }, (_, week) => cells.slice(week * 7, week * 7 + 7)).map((week, wIdx) => (
              <View key={wIdx} style={styles.weekRow}>
                {week.map((c) => (
                  <View key={c.key} style={styles.dayCell}>
                    <AppPressable
                      style={[
                        styles.dayBtn,
                        c.muted && styles.dayBtnMuted,
                        c.isToday && styles.dayBtnToday,
                        c.isSelected && styles.dayBtnSelected,
                      ]}
                      onPress={() => handleSelect(c.year, c.month, c.day)}
                      hitSlop={4}
                      accessibilityRole="button"
                      accessibilityState={{ selected: c.isSelected }}
                      accessibilityLabel={`${c.day} de ${MONTH_NAMES[c.month]} de ${c.year}${c.isToday ? ', hoje' : ''}`}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          c.muted && styles.dayTextMuted,
                          c.isSelected && styles.dayTextSelected,
                        ]}
                      >
                        {c.day}
                      </Text>
                    </AppPressable>
                  </View>
                ))}
              </View>
            ))}
          </View>

          {/* Atalhos de data. A seleção vinha só no `accessibilityState`: o
              leitor de tela sabia qual estava marcado e a tela não mostrava.
              Agora usam o mesmo destaque dos atalhos do formulário
              (TransactionSheet, `dateQuickChipActive`). */}
          <View style={styles.quickDatesRow}>
            {[
              { rotulo: 'Hoje', a11y: 'Escolher hoje', iso: isoDaDataOffset(0), escolher: () => handleQuickDate(0) },
              { rotulo: 'Ontem', a11y: 'Escolher ontem', iso: isoDaDataOffset(-1), escolher: () => handleQuickDate(-1) },
              {
                rotulo: 'Dia 1º deste mês',
                a11y: 'Escolher o primeiro dia deste mês',
                iso: `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`,
                escolher: handleFirstDayOfMonth,
              },
            ].map(({ rotulo, a11y, iso, escolher }) => {
              const marcado = currentISO === iso;
              return (
                <AppPressable
                  key={rotulo}
                  style={[styles.quickDateChip, marcado && styles.quickDateChipActive]}
                  onPress={escolher}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: marcado }}
                  accessibilityLabel={a11y}
                >
                  <Text style={[styles.quickDateText, marcado && styles.quickDateTextActive]}>{rotulo}</Text>
                </AppPressable>
              );
            })}
          </View>
        </AccessibleModalPanel>
      </Pressable>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.paperRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular },
  quickDatesRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  /* A fileira estica os três chips até a altura do mais alto (o `stretch`
     padrão do flex). Quando "Dia 1º deste mês" quebra em duas linhas, "Hoje"
     e "Ontem" ficavam grudados no topo de chips mais altos, e as duas linhas
     do terceiro saíam alinhadas à esquerda. Centrar nos dois eixos mantém os
     três rótulos na mesma linha visual, em qualquer largura e em qualquer
     escala de fonte do sistema (achado G8, apontado pelo autor em 18/09). */
  quickDateChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickDateChipActive: { backgroundColor: theme.ink + '15', borderColor: theme.ink },
  quickDateText: { color: theme.inkSoft, fontSize: type.nota, fontFamily: fonts.light, textAlign: 'center' },
  quickDateTextActive: { color: theme.ink },
  calHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 4 },
  calNav: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: 17,
    backgroundColor: theme.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calMonthYear: { color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular },
  weekdaysRow: { flexDirection: 'row', paddingVertical: 4 },
  weekdayCell: { flex: 1, alignItems: 'center' },
  weekdayText: { color: theme.inkFaint, fontSize: type.legenda, textAlign: 'center', fontFamily: fonts.light },
  daysGrid: { gap: 4 },
  weekRow: { flexDirection: 'row' },
  dayCell: { flex: 1, alignItems: 'center' },
  dayBtn: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBtnMuted: { opacity: 0.35 },
  dayBtnToday: { borderWidth: 1, borderColor: theme.ruleStrong },
  dayBtnSelected: { backgroundColor: theme.ink },
  dayText: { color: theme.ink, fontSize: type.apoio, fontVariant: ['tabular-nums'], fontFamily: fonts.regular },
  dayTextMuted: { color: theme.inkFaint },
  dayTextSelected: { color: theme.paper},
});

