import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Alert } from '@/lib/alerta';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, radius, spacing, type, fonts, touchTarget, lh } from '@/lib/theme';
import { categoriaEscolhida, categoriaReconhecida, PERGUNTA_CATEGORIA } from '@/lib/heuristics';
import { formatMoney, parseAmount, todayISO } from '@/lib/format';
import { fotografarELer, limparFotosEsquecidas, prepararLeitura } from '@/lib/foto-nota-ocr';
import { extrairDetalhesDaNota } from '@/lib/nota-foto-parser';
import { cartaoPadrao, montarLancamentoDaFoto } from '@/lib/foto-nota-lancamento';
import { fetchCreditCards } from '@/lib/data';
import type { CreditCard, PaymentMethod } from '@/lib/types';
import { salvarOuGuardarNoAparelho } from '@/lib/offline-cache';
import { marcarLancamentosAlterados } from '@/lib/lancamentos-alterados';
import { mensagemErro } from '@/lib/erros';
import { useDemo } from '@/lib/demo-context';
import { useWallet } from '@/lib/wallet-context';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import TransactionSheet, { type ValoresLancamento } from './TransactionSheet';
import AppPressable from './AppPressable';
import AppModal, { InsetsDoModal } from './AppModal';
import PermissaoCamera from './PermissaoCamera';
import { useModalAccessibility } from '@/lib/modal-accessibility';
import { useReducedMotion } from '@/lib/motion';

type Etapa = 'camera' | 'lendo' | 'confirmar';

const AVISO_POR_MOTIVO = {
  ok: 'Valor lido da foto. Confira com o cupom antes de salvar.',
  sem_total: 'Não achei o valor total na foto. Digite o valor impresso no cupom.',
  ambiguo: 'Achei mais de um total na foto. Digite o valor certo, conforme o cupom.',
  indisponivel: 'A leitura por foto não está disponível nesta versão do app. Digite o valor impresso no cupom.',
  falhou: 'Não consegui ler a foto. Digite o valor impresso no cupom ou tente fotografar de novo.',
  sem_texto: 'Não encontrei texto na foto. Ela pode ter saído escura ou tremida. Digite o valor ou fotografe de novo.',
} as const;

const FORMAS: { valor: PaymentMethod; rotulo: string }[] = [
  { valor: 'debit', rotulo: 'Débito' },
  { valor: 'credit', rotulo: 'Crédito' },
  { valor: 'pix', rotulo: 'Pix' },
  { valor: 'cash', rotulo: 'Dinheiro' },
];

/**
 * Foto da nota: a pessoa fotografa o cupom e o valor total é lido no próprio
 * aparelho (ML Kit). A foto não sai do aparelho e é apagada logo depois da
 * leitura. (O ML Kit manda ao Google métricas de uso da biblioteca, sem a
 * imagem nem o texto lido; por isso a tela não promete "nada é enviado".)
 * O valor lido sempre passa pela tela de confirmação: OCR erra, e
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
  // Reconhecida pelo estabelecimento ou escolhida: nunca uma categoria padrão.
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  /* O que veio da foto fica marcado "lido da foto" até a pessoa mudar o campo.
     Tudo continua editável: OCR erra. */
  const [data, setData] = useState(todayISO());
  const [pagamento, setPagamento] = useState<PaymentMethod | null>(null);
  const [lido, setLido] = useState({ valor: false, descricao: false, data: false, pagamento: false });
  const [dataRecusada, setDataRecusada] = useState(false);
  const [cartoes, setCartoes] = useState<CreditCard[]>([]);
  const [cartaoId, setCartaoId] = useState<string | null>(null);
  /* Toque duplo no obturador ou no salvar dispara duas vezes antes de o React
     repintar; o ref barra a segunda chamada de forma síncrona. */
  const capturandoRef = useRef(false);
  const savingRef = useRef(false);
  /* Cada abertura é uma sessão. Fechar durante a leitura troca o número, e a
     leitura que termina depois descobre que chegou tarde: sem isto ela punha
     'confirmar' e o valor lido no estado, e a próxima abertura já nascia na
     tela de confirmação com a nota anterior (achado F3, 26/09/2026). */
  const sessaoRef = useRef(0);

  function resetState() {
    setEtapa('camera');
    setCameraPronta(false);
    setLanterna(false);
    setAviso(null);
    setDesc('Compra');
    setAmount('');
    setCategory('');
    setSaving(false);
    setData(todayISO());
    setPagamento(null);
    setLido({ valor: false, descricao: false, data: false, pagamento: false });
    setDataRecusada(false);
    setCartaoId(null);
  }

  function fechar() {
    if (savingRef.current) return;
    sessaoRef.current++;
    resetState();
    onClose();
  }

  useModalAccessibility(modalRef, visible && etapa !== 'confirmar', fechar);

  /* Carrega o leitor ao abrir a câmera, fora do prazo da foto: em
     desenvolvimento, o primeiro `import()` do módulo busca um pacote no Metro. */
  useEffect(() => {
    if (!visible) return;
    void prepararLeitura();
    /* Foto que sobrou de uma leitura interrompida (app fechado à força no meio)
       é apagada antes da próxima. É o que a Política de Privacidade promete. */
    void limparFotosEsquecidas();
  }, [visible]);

  /* Cartões para a compra no crédito, pela mesma leitura (com cache offline)
     que a tela Crédito usa. Um cartão só já vem escolhido. */
  useEffect(() => {
    if (!visible || etapa !== 'confirmar') return;
    let vivo = true;
    fetchCreditCards()
      .then((lista) => {
        if (!vivo) return;
        setCartoes(lista);
        setCartaoId((atual) => atual ?? cartaoPadrao(lista)?.id ?? null);
      })
      .catch((e) => console.error('[foto-nota] cartões não carregaram', e));
    return () => {
      vivo = false;
    };
  }, [visible, etapa]);

  async function fotografar() {
    if (capturandoRef.current || !cameraPronta || !cameraRef.current) return;
    capturandoRef.current = true;
    hapticTap();
    setLanterna(false);
    setEtapa('lendo');
    const sessao = sessaoRef.current;
    const camera = cameraRef.current;
    try {
      /* Foto, leitura e exclusão da foto num prazo só, do toque até aqui
         (`fotografarELer`). Até 26/09/2026 o prazo cobria só o reconhecimento,
         e a tela passou quase um minuto em "Lendo a nota..." (N2). */
      const leitura = await fotografarELer(() => camera.takePictureAsync({ quality: 0.8 }));
      if (sessao !== sessaoRef.current) return; // fechada durante a leitura
      if (leitura.ok) {
        const { valorTotal, motivo } = leitura.total;
        const detalhes = extrairDetalhesDaNota(leitura.texto, todayISO());
        setAmount(valorTotal ? formatMoney(valorTotal) : '');
        setAviso(AVISO_POR_MOTIVO[leitura.texto.trim() ? motivo : 'sem_texto']);
        if (detalhes.estabelecimento) {
          setDesc(detalhes.estabelecimento);
          setCategory(categoriaReconhecida(detalhes.estabelecimento)?.name ?? '');
        }
        setData(detalhes.data ?? todayISO());
        setDataRecusada(detalhes.dataRecusada);
        setPagamento(detalhes.pagamento);
        setLido({
          valor: !!valorTotal,
          descricao: !!detalhes.estabelecimento,
          data: !!detalhes.data,
          pagamento: !!detalhes.pagamento,
        });
      } else if (leitura.motivo === 'sem_foto') {
        Alert.alert('Não consegui fotografar', 'Tente de novo. Se continuar, feche e abra a câmera.');
        setEtapa('camera');
        return;
      } else {
        setAmount('');
        setAviso(AVISO_POR_MOTIVO[leitura.motivo]);
      }
      setEtapa('confirmar');
    } finally {
      capturandoRef.current = false;
    }
  }

  async function handleSave(v: ValoresLancamento) {
    if (savingRef.current) return;
    const val = parseAmount(v.amount);
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

    const categoria = categoriaEscolhida(v.category, [{ name: v.category, color: v.color }]);
    if (!categoria) {
      Alert.alert(PERGUNTA_CATEGORIA.titulo, PERGUNTA_CATEGORIA.texto);
      return;
    }
    const lancamento = montarLancamentoDaFoto({
      valor: val,
      descricao: v.description,
      categoria,
      data: v.occurred_on,
      pagamento,
      cartao: cartoes.find((c) => c.id === cartaoId) ?? null,
      carteiraAtiva: v.wallet_id,
      carteiras: wallets,
    });
    if (!lancamento.ok) {
      if (lancamento.motivo === 'sem_pagamento') {
        Alert.alert('Forma de pagamento', 'Escolha como a compra foi paga: débito, crédito, Pix ou dinheiro.');
      } else if (cartoes.length === 0) {
        Alert.alert('Nenhum cartão cadastrado', 'Cadastre o cartão na aba Crédito ou escolha outra forma de pagamento.');
      } else {
        Alert.alert('Qual cartão?', 'Escolha o cartão em que a compra foi feita.');
      }
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const { guardado } = await salvarOuGuardarNoAparelho({ ...lancamento.input, ...(v.recurring ? { recurring: true } : null) });
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
            <PermissaoCamera
              permissao={permissao}
              pedirPermissao={pedirPermissao}
              motivo="O Grana. precisa da câmera para fotografar a nota e ler o valor total. A foto não sai do seu aparelho e é apagada logo depois da leitura."
              onFechar={fechar}
            />
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
                {/* A dica e o "lendo" dividem a mesma pílula, e o obturador fica
                    no lugar durante a leitura: nada salta quando a foto é tirada.
                    A pílula escura existe porque o assunto da foto é papel
                    branco, e texto claro solto sobre ele some. */}
                <View style={styles.pilula} accessibilityLiveRegion="polite">
                  {etapa === 'lendo' && <ActivityIndicator color={theme.ink} size="small" />}
                  <Text style={styles.dica}>
                    {etapa === 'lendo' ? 'Lendo a nota...' : 'Enquadre o cupom inteiro, com o valor total visível'}
                  </Text>
                </View>
                <AppPressable
                  onPress={fotografar}
                  disabled={!cameraPronta || etapa === 'lendo'}
                  style={[styles.obturador, (!cameraPronta || etapa === 'lendo') && styles.obturadorDesligado]}
                  accessibilityRole="button"
                  accessibilityLabel="Fotografar a nota"
                  accessibilityState={{ disabled: !cameraPronta || etapa === 'lendo', busy: etapa === 'lendo' }}
                >
                  <View style={styles.obturadorMiolo} />
                </AppPressable>
              </View>
            </>
          )}
        </View>
        )}</InsetsDoModal>
      </AppModal>
    );
  }

  /* Confirmação na mesma janela do lançamento manual. */
  return <TransactionSheet
    visible={visible && etapa === 'confirmar'}
    onClose={fechar}
    modo="carteira"
    editando={false}
    somenteSaida
    descricaoPadrao="Compra"
    focoNoValor
    semDataFutura
    ocultarCarteira={pagamento === 'credit'}
    carteiras={wallets}
    salvando={saving}
    onSalvar={handleSave}
    inicial={{ type: 'out', description: desc, amount, category,
      color: categoriaEscolhida(category)?.color ?? '', occurred_on: data,
      recurring: false, installments: 1, card_id: null,
      wallet_id: activeWalletId === 'total' ? wallets.find((w) => w.is_default)?.id ?? wallets[0]?.id ?? '' : activeWalletId ?? '' }}
    seloDaData={lido.data ? 'lida da foto' : null}
    dicaDaData={dataRecusada ? 'A data do cupom não parecia certa, então usei a de hoje. Confira antes de salvar.' : null}
    avisoDeOrigem={aviso ? <Text style={styles.hint}>{aviso}</Text> : null}
    camposExtras={<>
        <View style={styles.grupo} accessibilityRole="radiogroup" accessibilityLabel="Forma de pagamento">
          <Text style={styles.rotuloGrupo}>
            {lido.pagamento ? 'Forma de pagamento, lida da foto' : 'Forma de pagamento'}
          </Text>
          <View style={styles.chips}>
            {FORMAS.map((f) => (
              <AppPressable
                key={f.valor}
                onPress={() => {
                  setPagamento(f.valor);
                  setLido((l) => ({ ...l, pagamento: false }));
                }}
                style={[styles.chip, pagamento === f.valor && styles.chipAtivo]}
                accessibilityRole="radio"
                accessibilityState={{ checked: pagamento === f.valor }}
              >
                <Text style={[styles.chipTexto, pagamento === f.valor && styles.chipTextoAtivo]}>{f.rotulo}</Text>
              </AppPressable>
            ))}
          </View>
        </View>

        {pagamento === 'credit' && (
          cartoes.length === 0 ? (
            <Text style={styles.hint}>
              Nenhum cartão cadastrado. Cadastre o cartão na aba Crédito ou escolha outra forma de pagamento.
            </Text>
          ) : (
            <View style={styles.grupo} accessibilityRole="radiogroup" accessibilityLabel="Cartão da compra">
              <Text style={styles.rotuloGrupo}>Cartão</Text>
              <View style={styles.chips}>
                {cartoes.map((c) => (
                  <AppPressable
                    key={c.id}
                    onPress={() => setCartaoId(c.id)}
                    style={[styles.chip, cartaoId === c.id && styles.chipAtivo]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: cartaoId === c.id }}
                  >
                    <Text style={[styles.chipTexto, cartaoId === c.id && styles.chipTextoAtivo]}>{c.name}</Text>
                  </AppPressable>
                ))}
              </View>
            </View>
          )
        )}


    </>}
    acaoSecundaria={{ rotulo: 'Fotografar outra nota', onPress: () => { if (!savingRef.current) resetState(); } }}
  />;
}

const styles = StyleSheet.create({
  camWrap: { flex: 1, backgroundColor: '#000' },

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

  overlayBase: { position: 'absolute', left: spacing.xl, right: spacing.xl, alignItems: 'center', gap: spacing.lg },
  /* Mesmo véu dos botões redondos do topo. `radius.lg`, e não pílula, porque
     com fonte grande do sistema a dica quebra em duas linhas. */
  pilula: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '100%',
    backgroundColor: 'rgba(5,34,41,0.66)',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  dica: { flexShrink: 1, color: theme.ink, fontSize: type.apoio, lineHeight: lh(type.apoio, 'apoio'), textAlign: 'center', fontFamily: fonts.regular },
  obturador: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: theme.ink, alignItems: 'center', justifyContent: 'center' },
  obturadorDesligado: { opacity: 0.4 },
  obturadorMiolo: { width: 54, height: 54, borderRadius: 27, backgroundColor: theme.ink },
  hint: { color: theme.inkFaint, fontSize: type.nota, lineHeight: lh(type.nota, 'corpo'), fontFamily: fonts.light },
  grupo: { gap: spacing.sm },
  rotuloGrupo: { color: theme.inkFaint, fontSize: type.nota, fontFamily: fonts.light },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: touchTarget, justifyContent: 'center', borderWidth: 1, borderColor: theme.rule, borderRadius: radius.pill, paddingHorizontal: spacing.md },
  chipAtivo: { borderColor: theme.ink, backgroundColor: theme.paperRaised },
  chipTexto: { color: theme.inkSoft, fontSize: type.nota, fontFamily: fonts.regular },
  chipTextoAtivo: { color: theme.ink },
});
