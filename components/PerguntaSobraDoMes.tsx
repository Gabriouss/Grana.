import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme, radius, spacing, fonts, type, lh } from '@/lib/theme';
import { useHaJanelaAberta } from '@/lib/janelas-abertas';
import { formatMoney, formatMoneyInput, parseAmount } from '@/lib/format';
import { LIMITS } from '@/lib/limits';
import AppModal from './AppModal';
import AppPressable from './AppPressable';
import Sheet from './Sheet';

/**
 * Pergunta da virada do mês (Adendo 2 do autor, 07/11/2026, regra 20): "Quanto
 * sobrou na sua conta do mês passado?". O app não sabe o saldo do banco, então
 * só o valor que a pessoa confirmar entra no Livre deste mês; até lá, zero.
 *
 * Janela flutuante (autor, 07/11/2026: "a gente não vai adicionar blocos na
 * tela do Grana"): `AppModal` + `Sheet` centralizada, como as demais janelas,
 * com o campo de valor e o botão principal de Crédito (`amountRow`, `saveBtn`).
 * Nada novo no design system. Abre só quando a Início está em foco e nenhuma
 * outra janela está aberta (registro de `AppModal`), e nunca por cima de outra.
 * Tocar fora e o Voltar NÃO fecham: as saídas são "Agora não" e "Confirmar".
 *
 * "Agora não" mantém zero e a Início pergunta de novo no dia seguinte.
 * Falha ao salvar deixa recibo na tela (regra 9), nunca volta em silêncio.
 */
export default function PerguntaSobraDoMes({
  pode,
  sugestao,
  onConfirmar,
  onAgoraNao,
}: {
  /** Início em foco e sobra pendente. Fora disso a janela não abre. */
  pode: boolean;
  sugestao: number;
  onConfirmar: (valor: number) => Promise<void>;
  onAgoraNao: () => void;
}) {
  const [valor, setValor] = useState(() => formatMoney(sugestao));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /* Trava: depois de abrir, a janela fica aberta mesmo com ela mesma contando
     no registro. Só nasce com nenhuma outra aberta, e some se a Início sair de foco. */
  const outraAberta = useHaJanelaAberta();
  const [aberta, setAberta] = useState(false);
  useEffect(() => {
    if (!pode) { if (aberta) setAberta(false); return; }
    if (!aberta && !outraAberta) setAberta(true);
  }, [pode, outraAberta, aberta]);

  async function confirmar() {
    const numero = valor.trim() ? parseAmount(valor) : 0;
    if (!Number.isFinite(numero) || numero < 0) {
      setErro('Confira o valor digitado.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await onConfirmar(numero);
    } catch (e) {
      console.error('[inicio] confirmar sobra falhou', e);
      setErro('Não consegui salvar. Confira a conexão e tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <AppModal visible={aberta && pode} transparent onRequestClose={() => {}}>
      <Sheet centered onClose={() => {}}>
      <Text style={styles.titulo}>Quanto sobrou na sua conta do mês passado?</Text>
      <Text style={styles.apoio}>
        Confira no app do seu banco. Só o valor que você confirmar entra no Livre para gastar deste mês.
      </Text>
      <View style={styles.amountRow}>
        <Text style={styles.amountPrefix}>R$</Text>
        <TextInput
          accessibilityLabel="Valor que sobrou na conta no mês passado, em reais"
          maxLength={LIMITS.amount}
          style={styles.amountInput}
          placeholder="0,00"
          placeholderTextColor={theme.inkFaint}
          keyboardType="number-pad"
          value={valor}
          onChangeText={(t) => { setValor(formatMoneyInput(t)); setErro(null); }}
          editable={!salvando}
        />
      </View>
      {erro && <Text style={styles.erro} accessibilityRole="alert">{erro}</Text>}
      <View style={styles.acoes}>
        <AppPressable
          onPress={onAgoraNao}
          disabled={salvando}
          accessibilityRole="button"
          style={styles.secundario}
        >
          <Text style={styles.secundarioTexto}>Agora não</Text>
        </AppPressable>
        <AppPressable
          onPress={confirmar}
          disabled={salvando}
          accessibilityRole="button"
          style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
        >
          {salvando ? <ActivityIndicator color={theme.paper} /> : <Text style={styles.saveBtnText}>Confirmar</Text>}
        </AppPressable>
      </View>
      </Sheet>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  titulo: { color: theme.ink, fontSize: type.apoio, lineHeight: lh(type.apoio, 'corpo'), fontFamily: fonts.regular },
  apoio: { color: theme.inkFaint, fontSize: type.nota, lineHeight: lh(type.nota, 'corpo'), fontFamily: fonts.light },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.icone,
    borderBottomWidth: 1,
    borderBottomColor: theme.ruleStrong,
    paddingBottom: spacing.icone,
  },
  amountPrefix: { color: theme.inkFaint, fontSize: type.destaque, fontFamily: fonts.regular },
  amountInput: { color: theme.ink, fontSize: type.marca, flex: 1, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  erro: { color: theme.danger, fontSize: type.nota, lineHeight: lh(type.nota, 'corpo'), fontFamily: fonts.regular },
  acoes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  secundario: { paddingVertical: 13, paddingHorizontal: spacing.sm },
  secundarioTexto: { color: theme.inkFaint, fontSize: type.apoio, fontFamily: fonts.regular },
  saveBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: spacing.lg, alignItems: 'center' },
  saveBtnHover: { opacity: 0.88 },
  saveBtnText: { color: theme.paper, fontFamily: fonts.regular, fontSize: type.apoio },
});
