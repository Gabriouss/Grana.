import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AppModal from './AppModal';
import ToggleSwitch from './ToggleSwitch';
import { Ionicons } from '@expo/vector-icons';
import AppPressable from '@/components/AppPressable';
import Sheet from '@/components/Sheet';
import DatePickerModal from '@/components/DatePickerModal';
import CategoryPickerModal from '@/components/CategoryPickerModal';
import { formatDateLabel, formatMoney, formatMoneyInput, parseAmount, todayISO } from '@/lib/format';
import { LIMITS } from '@/lib/limits';
import { theme, radius, spacing, fonts, type, touchTarget } from '@/lib/theme';
import type { CreditCard, TxType } from '@/lib/types';

/* Sheet de lançamento — um só, usado pela tela de Lançamentos e pela de
   Crédito. Antes eram dois blocos de JSX quase iguais em arquivos separados,
   e a diferença não era intencional: a de Crédito tinha ficado sem os atalhos
   de data, sem o stepper de parcelas e sem edição nenhuma, simplesmente
   porque as melhorias foram aplicadas só de um lado.

   Modo 'carteira'  — saída/entrada, repetir mensalmente.
   Modo 'credito'   — sempre saída, com seletor de qual cartão recebe a compra.

   O estado dos campos vive aqui dentro e é semeado por `inicial` toda vez que
   o sheet abre; quem usa só recebe o resultado em onSalvar. */

export type ValoresLancamento = {
  type: TxType;
  description: string;
  /** Texto já formatado do campo ("1.250,50") — quem salva converte com parseAmount. */
  amount: string;
  category: string;
  color: string;
  occurred_on: string;
  recurring: boolean;
  /** 1 = à vista. */
  installments: number;
  /** Só no modo crédito. */
  card_id: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  modo: 'carteira' | 'credito' | 'boleto';
  editando: boolean;
  inicial: ValoresLancamento;
  /** Obrigatório no modo crédito: cartões entre os quais escolher. */
  cartoes?: CreditCard[];
  salvando: boolean;
  onSalvar: (valores: ValoresLancamento) => void;
};

function ontemISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function TransactionSheet({
  visible,
  onClose,
  modo,
  editando,
  inicial,
  cartoes = [],
  salvando,
  onSalvar,
}: Props) {
  const [type, setType] = useState<TxType>(inicial.type);
  const [desc, setDesc] = useState(inicial.description);
  const [amount, setAmount] = useState(inicial.amount);
  const [category, setCategory] = useState(inicial.category);
  const [catColor, setCatColor] = useState(inicial.color);
  const [occurredOn, setOccurredOn] = useState(inicial.occurred_on);
  const [recurring, setRecurring] = useState(inicial.recurring);
  const [installment, setInstallment] = useState(inicial.installments > 1);
  const [installmentCount, setInstallmentCount] = useState(String(Math.max(2, inicial.installments)));
  const [cardId, setCardId] = useState<string | null>(inicial.card_id);

  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  /* Semeia os campos a cada abertura. Sem isto o sheet reabriria com o que
     sobrou da vez anterior — problema real quando ele serve pra criar E pra
     editar: abrir "novo" logo depois de editar traria os dados do editado. */
  useEffect(() => {
    if (!visible) return;
    setType(inicial.type);
    setDesc(inicial.description);
    setAmount(inicial.amount);
    setCategory(inicial.category);
    setCatColor(inicial.color);
    setOccurredOn(inicial.occurred_on);
    setRecurring(inicial.recurring);
    setInstallment(inicial.installments > 1);
    setInstallmentCount(String(Math.max(2, inicial.installments)));
    setCardId(inicial.card_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const parcelas = Math.max(2, Math.round(Number(installmentCount) || 2));
  const ehCredito = modo === 'credito';
  const ehBoleto = modo === 'boleto';

  /* Parcelar só faz sentido criando uma saída: cada parcela é uma transação
     própria, então editar uma delas edita aquela linha, não o parcelamento.
     Boleto não parcela: quem paga em parcelas cadastra uma conta por mês. */
  const podeParcelar = !editando && !ehBoleto && type === 'out' && !recurring;

  const titulo = editando
    ? ehBoleto
      ? 'Editar conta a pagar'
      : 'Editar lançamento'
    : ehBoleto
      ? 'Nova conta a pagar'
      : ehCredito
        ? 'Lançar compra no crédito'
        : type === 'in'
          ? 'Nova entrada'
          : 'Nova saída';

  function salvar() {
    onSalvar({
      type: ehCredito || ehBoleto ? 'out' : type,
      description: desc,
      amount,
      category,
      color: catColor,
      occurred_on: occurredOn,
      recurring,
      installments: podeParcelar && installment ? parcelas : 1,
      card_id: ehCredito ? cardId : null,
    });
  }

  const yISO = ontemISO();
  const dataCustomizada = occurredOn !== todayISO() && occurredOn !== yISO;

  return (
    <>
      <AppModal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <Sheet onClose={onClose}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{titulo}</Text>
            <AppPressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
              <Ionicons name="close" size={22} color={theme.inkFaint} />
            </AppPressable>
          </View>

          {/* No crédito não existe "entrada": uma fatura só acumula gastos. */}
          {!ehCredito && !ehBoleto && (
            <View style={styles.typeRow}>
              <AppPressable onPress={() => setType('out')} style={[styles.typeBtn, type === 'out' && styles.typeBtnOut]}>
                <Text style={[styles.typeText, type === 'out' && styles.typeTextOn]}>Saída</Text>
              </AppPressable>
              <AppPressable onPress={() => setType('in')} style={[styles.typeBtn, type === 'in' && styles.typeBtnIn]}>
                <Text style={[styles.typeText, type === 'in' && styles.typeTextOn]}>Entrada</Text>
              </AppPressable>
            </View>
          )}

          <TextInput
            maxLength={LIMITS.description}
            style={styles.descInput}
            placeholder={ehBoleto ? 'Descrição — ex: Energia' : ehCredito ? 'Descrição — ex: Supermercado' : 'Descrição'}
            placeholderTextColor={theme.inkFaint}
            value={desc}
            onChangeText={setDesc}
          />

          <View style={styles.amountRow}>
            <Text style={styles.amountPrefix}>R$</Text>
            <TextInput
              maxLength={LIMITS.amount}
              style={styles.amountInput}
              placeholder="0,00"
              placeholderTextColor={theme.inkFaint}
              keyboardType="number-pad"
              value={amount}
              onChangeText={(t) => setAmount(formatMoneyInput(t))}
            />
          </View>

          {ehCredito && cartoes.length > 0 && (
            <View style={{ gap: 4, marginTop: 4 }}>
              <Text style={styles.inputLabel}>Cartão / Banco</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.banksRow}>
                {cartoes.map((c) => (
                  <AppPressable
                    key={c.id}
                    style={[styles.bankChip, cardId === c.id && { borderColor: c.color, backgroundColor: 'rgba(255,255,255,0.08)' }]}
                    onPress={() => setCardId(c.id)}
                  >
                    <View style={[styles.bankDot, { backgroundColor: c.color }]} />
                    <Text style={[styles.bankChipText, cardId === c.id && { color: theme.ink }]}>{c.name}</Text>
                  </AppPressable>
                ))}
              </ScrollView>
            </View>
          )}

          <AppPressable style={styles.fieldRow} onPress={() => setCatPickerOpen(true)}>
            <Text style={styles.fieldKey}>Categoria</Text>
            <View style={styles.fieldVal}>
              <View style={[styles.dot, { backgroundColor: catColor }]} />
              <Text style={styles.fieldValText}>{category}</Text>
              <Ionicons name="chevron-forward" size={14} color={theme.inkFaint} />
            </View>
          </AppPressable>

          <View style={{ gap: 6 }}>
            <AppPressable style={styles.fieldRow} onPress={() => setDatePickerOpen(true)}>
              <Text style={styles.fieldKey}>{ehBoleto ? 'Vencimento' : 'Data do lançamento'}</Text>
              <View style={styles.fieldVal}>
                <Text style={styles.fieldValText}>{formatDateLabel(occurredOn)}</Text>
                <Ionicons name="calendar-outline" size={16} color={theme.inkSoft} />
              </View>
            </AppPressable>

            <View style={styles.dateQuickRow}>
              <AppPressable
                style={[styles.dateQuickChip, occurredOn === todayISO() && styles.dateQuickChipActive]}
                onPress={() => setOccurredOn(todayISO())}
              >
                <Text style={[styles.dateQuickText, occurredOn === todayISO() && styles.dateQuickTextActive]}>Hoje</Text>
              </AppPressable>
              <AppPressable
                style={[styles.dateQuickChip, occurredOn === yISO && styles.dateQuickChipActive]}
                onPress={() => setOccurredOn(yISO)}
              >
                <Text style={[styles.dateQuickText, occurredOn === yISO && styles.dateQuickTextActive]}>Ontem</Text>
              </AppPressable>
              <AppPressable
                style={[styles.dateQuickChip, dataCustomizada && styles.dateQuickChipActive]}
                onPress={() => setDatePickerOpen(true)}
              >
                <Text style={[styles.dateQuickText, dataCustomizada && styles.dateQuickTextActive]}>Calendário</Text>
              </AppPressable>
            </View>
          </View>

          {!installment && (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldKey}>{ehCredito ? 'Cobrança recorrente' : 'Repetir mensalmente'}</Text>
              <ToggleSwitch
                value={recurring}
                onToggle={() => setRecurring((p) => !p)}
                label={ehCredito ? 'Cobrança recorrente' : 'Repetir mensalmente'}
              />
            </View>
          )}

          {recurring && (
            <Text style={styles.installmentHint}>
              {ehCredito
                ? 'A cobrança reaparece sozinha na fatura de cada mês, até você desligar isto.'
                : ehBoleto
                  ? 'Ao marcar esta conta como paga, a do mês seguinte é criada sozinha.'
                  : 'O lançamento se repete todo mês, até você desligar isto.'}
            </Text>
          )}

          {podeParcelar && (
            <View style={{ gap: 6 }}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldKey}>Compra parcelada</Text>
                <ToggleSwitch
                  value={installment}
                  onToggle={() => setInstallment((p) => !p)}
                  label="Compra parcelada"
                />
              </View>

              {installment && (
                <View style={styles.installmentRow}>
                  <Text style={styles.fieldKey}>Em quantas vezes</Text>
                  <View style={styles.stepper}>
                    <AppPressable
                      style={styles.stepperBtn}
                      onPress={() => setInstallmentCount((c) => String(Math.max(2, (Number(c) || 2) - 1)))}
                      hitSlop={8}
                      accessibilityLabel="Menos uma parcela"
                    >
                      <Ionicons name="remove" size={16} color={theme.ink} />
                    </AppPressable>
                    <Text style={styles.stepperVal}>{parcelas}x</Text>
                    <AppPressable
                      style={styles.stepperBtn}
                      onPress={() => setInstallmentCount((c) => String(Math.min(60, (Number(c) || 2) + 1)))}
                      hitSlop={8}
                      accessibilityLabel="Mais uma parcela"
                    >
                      <Ionicons name="add" size={16} color={theme.ink} />
                    </AppPressable>
                  </View>
                </View>
              )}

              {installment && !!parseAmount(amount) && (
                <Text style={styles.installmentHint}>
                  {parcelas}x de R$ {formatMoney(parseAmount(amount) / parcelas)}
                </Text>
              )}
            </View>
          )}

          <AppPressable
            style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
            onPress={salvar}
            disabled={salvando}
          >
            {salvando ? (
              <ActivityIndicator color={theme.paper} />
            ) : (
              <Text style={styles.saveBtnText}>{editando ? 'Salvar alterações' : ehBoleto ? 'Salvar conta' : 'Salvar lançamento'}</Text>
            )}
          </AppPressable>
        </Sheet>
      </AppModal>

      <DatePickerModal
        visible={datePickerOpen}
        currentISO={occurredOn}
        title={ehBoleto ? 'Vencimento' : 'Data do lançamento'}
        onSelectDate={(iso) => setOccurredOn(iso)}
        onClose={() => setDatePickerOpen(false)}
      />

      <CategoryPickerModal
        visible={catPickerOpen}
        currentCategory={category}
        onSelectCategory={({ name, color }) => {
          setCategory(name);
          setCatColor(color);
        }}
        onClose={() => setCatPickerOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular },
  typeRow: { flexDirection: 'row', gap: spacing.xs },
  typeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm, backgroundColor: theme.paper },
  typeBtnOut: { backgroundColor: theme.saidaFundo, borderWidth: 1, borderColor: theme.saidaBorda },
  typeBtnIn: { backgroundColor: theme.entradaFundo, borderWidth: 1, borderColor: theme.entradaBorda },
  typeText: { color: theme.inkFaint, fontSize: type.nota, fontFamily: fonts.light },
  typeTextOn: { color: theme.ink },
  descInput: {
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
    color: theme.ink,
    fontSize: type.corpo,
    paddingVertical: 8,
    fontFamily: fonts.regular,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.ruleStrong,
    paddingBottom: 10,
  },
  amountPrefix: { color: theme.inkFaint, fontSize: type.destaque, fontFamily: fonts.light },
  amountInput: { color: theme.ink, fontSize: type.valor, flex: 1, fontFamily: fonts.regular },
  inputLabel: { fontFamily: fonts.regular, fontSize: type.legenda, color: theme.inkFaint, marginTop: spacing.xs },
  banksRow: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  bankChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  bankChipText: { fontFamily: fonts.regular, fontSize: type.legenda, color: theme.inkSoft },
  bankDot: { width: 8, height: 8, borderRadius: 4 },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  fieldKey: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.light },
  fieldVal: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldValText: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dateQuickRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  dateQuickChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: theme.paper,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  dateQuickChipActive: { backgroundColor: theme.ink + '15', borderColor: theme.ink },
  dateQuickText: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  dateQuickTextActive: { color: theme.ink },
  installmentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperBtn: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.paperRaised,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  stepperVal: { color: theme.ink, fontSize: type.apoio, minWidth: 26, textAlign: 'center', fontFamily: fonts.regular },
  installmentHint: { color: theme.inkFaint, fontSize: type.legenda, marginTop: 2, fontFamily: fonts.light },
  saveBtn: {
    backgroundColor: theme.ink,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  saveBtnHover: { opacity: 0.88 },
  saveBtnText: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
});
