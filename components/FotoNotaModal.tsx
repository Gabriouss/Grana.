import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Alert } from '@/lib/alert';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, radius, spacing, type, fonts, touchTarget, lh } from '@/lib/theme';
import { guessCategoryFromText } from '@/lib/heuristics';
import { formatMoney, parseAmount, formatMoneyInput, todayISO } from '@/lib/format';
import { lerTotalDaFoto } from '@/lib/foto-nota-ocr';
import { salvarOuGuardarNoAparelho } from '@/lib/offline-cache';
import { marcarLancamentosAlterados } from '@/lib/lancamentos-alterados';
import { mensagemErro } from '@/lib/erros';
import { useDemo } from '@/lib/demo-context';
import { useWallet } from '@/lib/wallet-context';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { LIMITS } from '@/lib/limits';
import CategoryChips from './CategoryChips';
import AppPressable from './AppPressable';
import AppModal, { InsetsDoModal } from './AppModal';
import Sheet from './Sheet';
import { useModalAccessibility } from '@/lib/modal-accessibility';
import { useReducedMotion } from '@/lib/motion';

type Etapa = 'camera' | 'lendo' | 'confirmar';

const AVISO_POR_MOTIVO = {
  ok: 'Valor lido da foto. Confira com o cupom antes de salvar.',
  sem_total: 'Não achei o valor total na foto. Digite o valor impresso no cupom.',
  ambiguo: 'Achei mais de um total na foto. Digite o valor certo, conforme o cupom.',
  indisponivel: 'A leitura por foto não está disponível nesta versão do app. Digite o valor impresso no cupom.',
  falhou: 'Não consegui ler a foto. Digite o valor impresso no cupom ou tente fotografar de novo.',
} as const;

/**
 * Foto da nota: a pessoa fotografa o cupom e o valor total é lido no próprio
 * aparelho (ML Kit). Nada sai do aparelho e a foto é apagada logo depois da
 * leitura. O valor lido sempre passa pela tela de confirmação: OCR erra, e
 * lançar dinheiro sem a pessoa ver o número seria fé.
 */
export default function FotoNotaModal({
  visible,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const modalRef = useRef<View>(null);
  const cameraRef = useRef<CameraView>(null);
  const reduzirMovimento = useReducedMotion();
  const { isDemoMode } = useDemo();
  const { activeWalletId, wallets } = useWallet();
  const [permissao, pedirPermissao] = useCameraPermissions();

  const [etapa, setEtapa] = useState<Etapa>('camera');
  const [cameraPronta, setCameraPronta] = useState(false);
  const [lanterna, setLanterna] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [desc, setDesc] = useState('Compra');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Alimentação');
  const [saving, setSaving] = useState(false);
  /* Toque duplo no obturador ou no salvar dispara duas vezes antes de o React
     repintar; o ref barra a segunda chamada de forma síncrona. */
  const capturandoRef = useRef(false);
  const savingRef = useRef(false);

  function resetState() {
    setEtapa('camera');
    setCameraPronta(false);
    setLanterna(false);
    setAviso(null);
    setDesc('Compra');
    setAmount('');
    setCategory('Alimentação');
    setSaving(false);
  }

  function fechar() {
    resetState();
    onClose();
  }

  useModalAccessibility(modalRef, visible && etapa === 'camera', fechar);

  async function apagarFoto(uri: string) {
    try {
      const FileSystem = await import('expo-file-system/legacy');
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // Já sumiu, ou o sistema limpou o cache: nada a fazer.
    }
  }

  async function fotografar() {
    if (capturandoRef.current || !cameraPronta || !cameraRef.current) return;
    capturandoRef.current = true;
    hapticTap();
    setLanterna(false);
    setEtapa('lendo');
    let uri: string | null = null;
    try {
      const foto = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      uri = foto.uri;
      const leitura = await lerTotalDaFoto(uri);
      if (leitura.ok) {
        const { valorTotal, motivo } = leitura.total;
        setAmount(valorTotal ? formatMoney(valorTotal) : '');
        setAviso(AVISO_POR_MOTIVO[motivo]);
      } else {
        setAmount('');
        setAviso(AVISO_POR_MOTIVO[leitura.motivo]);
      }
      setEtapa('confirmar');
    } catch (e) {
      console.error('[foto-nota] falha ao fotografar', e);
      Alert.alert('Não consegui fotografar', 'Tente de novo. Se continuar, feche e abra a câmera.');
      setEtapa('camera');
    } finally {
      if (uri) void apagarFoto(uri);
      capturandoRef.current = false;
    }
  }

  async function handleSave() {
    if (savingRef.current) return;
    const val = parseAmount(amount);
    if (!val || val <= 0) {
      Alert.alert('Valor inválido', 'Informe o valor total da nota em R$.');
      return;
    }
    if (isDemoMode) {
      Alert.alert(
        'Modo de exemplo ativo',
        'Desative "Dados de exemplo" no Perfil para salvar notas fotografadas na sua conta.'
      );
      return;
    }

    const catObj = guessCategoryFromText(category);
    savingRef.current = true;
    setSaving(true);
    try {
      const { guardado } = await salvarOuGuardarNoAparelho({
        type: 'out',
        description: desc.trim() || 'Compra',
        amount: val,
        category: catObj.name,
        color: catObj.color,
        occurred_on: todayISO(),
        wallet_id:
          activeWalletId === 'total'
            ? wallets.find((w) => w.is_default)?.id ?? wallets[0]?.id ?? null
            : activeWalletId,
      });
      if (guardado) {
        marcarLancamentosAlterados();
        Alert.alert('Salvo no aparelho', 'Sem conexão. A nota será sincronizada ao abrir o Grana. com conexão.');
      }
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

  /* ---- etapas 1 e 2: câmera e leitura ---- */

  if (visible && etapa !== 'confirmar') {
    const semPermissao = !permissao?.granted;

    return (
      <AppModal visible={visible} animationType={reduzirMovimento ? 'none' : 'slide'} onRequestClose={fechar}>
        <InsetsDoModal>{(insets) => (
        <View ref={modalRef} style={styles.camWrap} accessibilityViewIsModal role="dialog" focusable>
          {semPermissao ? (
            <View style={styles.permissaoWrap}>
              <Ionicons name="camera-outline" size={44} color={theme.inkFaint} />
              <Text style={styles.permissaoTitulo}>Acesso à câmera</Text>
              <Text style={styles.permissaoTexto}>
                O Grana. precisa da câmera para fotografar a nota e ler o valor total. A foto é lida no
                aparelho, nada é enviado, e ela é apagada logo depois da leitura.
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
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="back"
                enableTorch={lanterna}
                onCameraReady={() => setCameraPronta(true)}
              />

              <View style={[styles.overlayTopo, { top: insets.top + spacing.md }]}>
                <AppPressable
                  onPress={fechar}
                  hitSlop={12}
                  style={styles.botaoRedondo}
                  accessibilityRole="button"
                  accessibilityLabel="Fechar câmera da nota"
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

              <View style={[styles.overlayBase, { bottom: insets.bottom + spacing.xl, pointerEvents: 'box-none' }]}>
                {etapa === 'lendo' ? (
                  <View style={styles.lendo} accessibilityLiveRegion="polite">
                    <ActivityIndicator color={theme.ink} />
                    <Text style={styles.dica}>Lendo a nota...</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.dica}>Enquadre o cupom inteiro, com o valor total visível</Text>
                    <AppPressable
                      onPress={fotografar}
                      disabled={!cameraPronta}
                      style={[styles.obturador, !cameraPronta && styles.obturadorDesligado]}
                      accessibilityRole="button"
                      accessibilityLabel="Fotografar a nota"
                    >
                      <View style={styles.obturadorMiolo} />
                    </AppPressable>
                  </>
                )}
              </View>
            </>
          )}
        </View>
        )}</InsetsDoModal>
      </AppModal>
    );
  }

  /* ---- etapa 3: confirmação do lançamento ---- */

  return (
    <AppModal visible={visible} animationType={reduzirMovimento ? 'none' : 'slide'} transparent onRequestClose={fechar}>
      <Sheet centered onClose={fechar}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Nota fotografada</Text>
          <AppPressable onPress={fechar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
            <Ionicons name="close" size={22} color={theme.inkFaint} />
          </AppPressable>
        </View>

        {aviso && <Text style={styles.hint}>{aviso}</Text>}

        <TextInput
          accessibilityLabel="Descrição do lançamento"
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
            accessibilityLabel="Valor do lançamento em reais"
            maxLength={LIMITS.amount}
            style={styles.amountInput}
            placeholder="0,00"
            placeholderTextColor={theme.inkFaint}
            keyboardType="number-pad"
            value={amount}
            onChangeText={(t) => setAmount(formatMoneyInput(t))}
            autoFocus={!amount}
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
            <Text style={styles.saveBtnText}>Salvar lançamento</Text>
          )}
        </AppPressable>

        <AppPressable onPress={resetState}>
          <Text style={styles.backLink}>Fotografar outra nota</Text>
        </AppPressable>
      </Sheet>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  camWrap: { flex: 1, backgroundColor: '#000' },

  permissaoWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl, backgroundColor: theme.paper },
  permissaoTitulo: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular },
  permissaoTexto: { color: theme.inkFaint, fontSize: type.apoio, lineHeight: lh(type.apoio, 'corpo'), textAlign: 'center', fontFamily: fonts.light },
  botaoPrimario: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: spacing.xxl, marginTop: spacing.sm },
  botaoPrimarioTexto: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
  linkSecundario: { color: theme.inkFaint, fontSize: type.nota, paddingVertical: spacing.sm, fontFamily: fonts.light },

  overlayTopo: {
    position: 'absolute',
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

  overlayBase: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: spacing.lg },
  lendo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: 'rgba(5,34,41,0.66)', borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  dica: { color: theme.ink, fontSize: type.apoio, textAlign: 'center', paddingHorizontal: spacing.xxl, fontFamily: fonts.regular },
  obturador: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: theme.ink, alignItems: 'center', justifyContent: 'center' },
  obturadorDesligado: { opacity: 0.4 },
  obturadorMiolo: { width: 54, height: 54, borderRadius: 27, backgroundColor: theme.ink },

  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular },
  hint: { color: theme.inkFaint, fontSize: type.nota, lineHeight: lh(type.nota, 'corpo'), fontFamily: fonts.light },

  descInput: { borderBottomWidth: 1, borderBottomColor: theme.rule, color: theme.ink, fontSize: type.corpo, paddingVertical: 8, fontFamily: fonts.regular },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: theme.ruleStrong, paddingBottom: 10 },
  amountPrefix: { color: theme.inkFaint, fontSize: type.destaque, fontFamily: fonts.light },
  amountInput: { color: theme.ink, fontSize: type.marca, flex: 1, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },
  saveBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
  saveBtnHover: { opacity: 0.88 },
  saveBtnText: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
  backLink: { color: theme.inkFaint, fontSize: type.nota, textAlign: 'center', paddingVertical: 4, fontFamily: fonts.light },
});
