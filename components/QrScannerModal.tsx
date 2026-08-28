import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Alert } from '@/lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, type, fonts, touchTarget } from '@/lib/theme';
import { parseNfceQrCode, formatarCnpj, type NotaFiscal } from '@/lib/nfce-parser';
import { guessCategoryFromText } from '@/lib/heuristics';
import { formatMoney, parseAmount, formatMoneyInput } from '@/lib/format';
import { addTransaction } from '@/lib/data';
import { mensagemErro } from '@/lib/erros';
import { useDemo } from '@/lib/demo-context';
import { useWallet } from '@/lib/wallet-context';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { LIMITS } from '@/lib/limits';
import CategoryChips from './CategoryChips';
import AppPressable from './AppPressable';
import Sheet from './Sheet';
import { useModalAccessibility } from '@/lib/modal-accessibility';
import { useReducedMotion } from '@/lib/motion';

/** Moldura central com uma linha que varre de cima a baixo enquanto procura o código. */
function MolduraDeMira({ ativa }: { ativa: boolean }) {
  const varredura = useRef(new Animated.Value(0)).current;
  const reduzirMovimento = useReducedMotion();

  useEffect(() => {
    if (!ativa || reduzirMovimento) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(varredura, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(varredura, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [ativa, reduzirMovimento, varredura]);

  const y = varredura.interpolate({ inputRange: [0, 1], outputRange: [0, 228] });

  return (
    <View style={styles.mira}>
      <View style={[styles.cantoBase, styles.cantoTopoEsq]} />
      <View style={[styles.cantoBase, styles.cantoTopoDir]} />
      <View style={[styles.cantoBase, styles.cantoBaixoEsq]} />
      <View style={[styles.cantoBase, styles.cantoBaixoDir]} />
      {ativa && !reduzirMovimento && <Animated.View style={[styles.linhaVarredura, { transform: [{ translateY: y }] }]} />}
    </View>
  );
}

export default function QrScannerModal({
  visible,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const modalRef = useRef<View>(null);
  const reduzirMovimento = useReducedMotion();
  const { isDemoMode } = useDemo();
  const { activeWalletId } = useWallet();
  const [permissao, pedirPermissao] = useCameraPermissions();
  /* Overlay da câmera desenha até a borda física; sem o inset os botões de
     fechar/lanterna ficam sob a barra de status em aparelhos de barra alta. */
  const insets = useSafeAreaInsets();

  const [nota, setNota] = useState<NotaFiscal | null>(null);
  useModalAccessibility(modalRef, visible && !nota);
  const [lanterna, setLanterna] = useState(false);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Alimentação');
  const [saving, setSaving] = useState(false);
  /* Mesmo raciocínio de PasteReceiptModal.tsx: `saving` (estado) só
     desabilita o botão depois de um re-render, e um toque duplo rápido
     pode disparar `handleSave` duas vezes antes disso — o ref bloqueia de
     forma síncrona, sem esperar o React repintar nada. */
  const savingRef = useRef(false);

  function resetState() {
    setNota(null);
    setLanterna(false);
    setDesc('');
    setAmount('');
    setCategory('Alimentação');
    setSaving(false);
  }

  function fechar() {
    resetState();
    onClose();
  }

  function handleCodigoLido({ data }: { data: string }) {
    if (nota) return; // já capturou; ignora leituras repetidas da mesma nota

    const lida = parseNfceQrCode(data);
    if (!lida) return; // QR de outra natureza — segue procurando, sem interromper o usuário

    hapticTap();
    setLanterna(false);
    setNota(lida);
    setDesc('Compra');
    setAmount(lida.valorTotal ? formatMoney(lida.valorTotal) : '');
  }

  async function handleSave() {
    if (!nota || savingRef.current) return;
    const val = parseAmount(amount);
    if (!val || val <= 0) {
      Alert.alert('Valor inválido', 'Informe o valor total da nota em R$.');
      return;
    }
    if (isDemoMode) {
      Alert.alert(
        'Modo de exemplo ativo',
        'Desative "Dados de exemplo" no Perfil para salvar notas escaneadas na sua conta.'
      );
      return;
    }

    const catObj = guessCategoryFromText(category);
    savingRef.current = true;
    setSaving(true);
    try {
      await addTransaction({
        type: 'out',
        description: desc.trim() || 'Compra',
        amount: val,
        category: catObj.name,
        color: catObj.color,
        occurred_on: nota.dataEmissao,
        wallet_id: activeWalletId === 'total' ? null : activeWalletId,
      });
      hapticSuccess();
      resetState();
      onClose();
      onSuccess();
    } catch (e: any) {
      Alert.alert('Erro ao salvar', mensagemErro(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  /* ---- etapa 1: câmera ---- */

  if (visible && !nota) {
    const semPermissao = !permissao?.granted;

    return (
      <Modal visible={visible} animationType={reduzirMovimento ? 'none' : 'slide'} onRequestClose={fechar}>
        <View ref={modalRef} style={styles.camWrap} accessibilityViewIsModal role="dialog" focusable>
          {semPermissao ? (
            <View style={styles.permissaoWrap}>
              <Ionicons name="camera-outline" size={44} color={theme.inkFaint} />
              <Text style={styles.permissaoTitulo}>Acesso à câmera</Text>
              <Text style={styles.permissaoTexto}>
                O Grana. precisa da câmera para ler o QR Code da nota fiscal. A imagem é processada
                no aparelho e nada é enviado ou armazenado.
              </Text>
              <AppPressable style={styles.botaoPrimario} onPress={pedirPermissao}>
                <Text style={styles.botaoPrimarioTexto}>Permitir câmera</Text>
              </AppPressable>
              <AppPressable onPress={fechar}>
                <Text style={styles.linkSecundario}>Agora não</Text>
              </AppPressable>
            </View>
          ) : (
            <>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                enableTorch={lanterna}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={handleCodigoLido}
              />

              <View style={[styles.overlayTopo, { top: insets.top + spacing.md }]}>
                <AppPressable
                  onPress={fechar}
                  hitSlop={12}
                  style={styles.botaoRedondo}
                  accessibilityRole="button"
                  accessibilityLabel="Fechar leitor de QR Code"
                >
                  <Ionicons name="close" size={22} color={theme.ink} />
                </AppPressable>
                <AppPressable
                  onPress={() => setLanterna((v) => !v)}
                  hitSlop={12}
                  style={[styles.botaoRedondo, lanterna && styles.botaoRedondoAtivo]}
                  accessibilityRole="switch"
                  accessibilityLabel="Lanterna"
                  accessibilityState={{ checked: lanterna }}
                >
                  <Ionicons name={lanterna ? 'flashlight' : 'flashlight-outline'} size={20} color={lanterna ? theme.paper : theme.ink} />
                </AppPressable>
              </View>

              <View style={styles.overlayCentro} pointerEvents="none">
                <MolduraDeMira ativa />
                <Text style={styles.dicaMira}>Aponte para o QR Code da nota fiscal</Text>
              </View>
            </>
          )}
        </View>
      </Modal>
    );
  }

  /* ---- etapa 2: confirmação do lançamento ---- */

  return (
    <Modal visible={visible} animationType={reduzirMovimento ? 'none' : 'slide'} transparent onRequestClose={fechar}>
      <Sheet onClose={fechar}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Nota fiscal lida</Text>
          <AppPressable onPress={fechar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
            <Ionicons name="close" size={22} color={theme.inkFaint} />
          </AppPressable>
        </View>

        {nota && (
          <View style={styles.notaBox}>
            <View style={styles.notaLinha}>
              <Text style={styles.notaRotulo}>Estabelecimento</Text>
              <Text style={styles.notaValor}>{formatarCnpj(nota.cnpj)}</Text>
            </View>
            <View style={styles.notaLinha}>
              <Text style={styles.notaRotulo}>Emissão</Text>
              <Text style={styles.notaValor}>
                {nota.dataEmissao.split('-').reverse().join('/')}
                {!nota.dataExata && ' (aprox.)'}
                {nota.uf ? ` · ${nota.uf}` : ''}
              </Text>
            </View>
          </View>
        )}

        {nota?.homologacao && (
          <Text style={styles.aviso}>
            ⚠️ Esta é uma nota de homologação (teste da SEFAZ), não uma compra real.
          </Text>
        )}

        {nota && nota.valorTotal === null && (
          <Text style={styles.hint}>
            O QR Code desta nota traz só a chave de acesso — o valor total não vem no código quando a
            emissão é online. Digite o valor que está impresso no cupom.
          </Text>
        )}

        <TextInput
          maxLength={LIMITS.description}
          style={styles.descInput}
          placeholder="Descrição (ex: Supermercado)"
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
            autoFocus={nota?.valorTotal === null}
          />
        </View>

        <CategoryChips value={category} onChange={setCategory} />

        <AppPressable
          style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={theme.paper} />
          ) : (
            <Text style={styles.saveBtnText}>Salvar Lançamento</Text>
          )}
        </AppPressable>

        <AppPressable onPress={resetState}>
          <Text style={styles.backLink}>Escanear outra nota</Text>
        </AppPressable>
      </Sheet>
    </Modal>
  );
}

const LADO_MIRA = 240;

const styles = StyleSheet.create({
  camWrap: { flex: 1, backgroundColor: '#000' },

  permissaoWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl, backgroundColor: theme.paper },
  permissaoTitulo: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular },
  permissaoTexto: { color: theme.inkFaint, fontSize: type.apoio, lineHeight: 19, textAlign: 'center', fontFamily: fonts.light },
  botaoPrimario: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: spacing.xxl, marginTop: spacing.sm },
  botaoPrimarioTexto: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
  linkSecundario: { color: theme.inkFaint, fontSize: type.nota, paddingVertical: spacing.sm, fontFamily: fonts.light },

  overlayTopo: {
    position: 'absolute',
    /* `top` vem do inset no JSX. */
    left: spacing.xl,
    right: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  botaoRedondo: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,34,41,0.66)',
    borderWidth: 1,
    borderColor: theme.ruleStrong,
  },
  botaoRedondoAtivo: { backgroundColor: theme.accent2, borderColor: theme.accent2 },

  overlayCentro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  mira: { width: LADO_MIRA, height: LADO_MIRA, overflow: 'hidden' },
  cantoBase: { position: 'absolute', width: 34, height: 34, borderColor: theme.accent2 },
  cantoTopoEsq: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: radius.md },
  cantoTopoDir: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: radius.md },
  cantoBaixoEsq: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: radius.md },
  cantoBaixoDir: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: radius.md },
  linhaVarredura: { position: 'absolute', left: 6, right: 6, height: 2, backgroundColor: theme.accent2, opacity: 0.75 },
  dicaMira: { color: theme.ink, fontSize: type.apoio, textAlign: 'center', paddingHorizontal: spacing.xxl, fontFamily: fonts.regular },

  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular },
  hint: { color: theme.inkFaint, fontSize: type.nota, lineHeight: 17, fontFamily: fonts.light },
  aviso: { color: '#d3b869', fontSize: type.nota, lineHeight: 17, fontFamily: fonts.regular },

  notaBox: { backgroundColor: theme.paper, borderRadius: radius.md, borderWidth: 1, borderColor: theme.rule, padding: spacing.md, gap: spacing.xs },
  notaLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notaRotulo: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  notaValor: { color: theme.inkSoft, fontSize: type.nota, fontFamily: fonts.light },

  descInput: { borderBottomWidth: 1, borderBottomColor: theme.rule, color: theme.ink, fontSize: type.corpo, paddingVertical: 8, fontFamily: fonts.regular },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: theme.ruleStrong, paddingBottom: 10 },
  amountPrefix: { color: theme.inkFaint, fontSize: type.destaque, fontFamily: fonts.light },
  amountInput: { color: theme.ink, fontSize: type.marca, flex: 1, fontFamily: fonts.regular },
  saveBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
  saveBtnHover: { opacity: 0.88 },
  saveBtnText: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
  backLink: { color: theme.inkFaint, fontSize: type.nota, textAlign: 'center', paddingVertical: 4, fontFamily: fonts.light },
});
