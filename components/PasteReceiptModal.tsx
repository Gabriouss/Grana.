import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
} from 'react-native';
import AppModal from './AppModal';
import { Alert } from '@/lib/alerta';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, radius, spacing, fonts, type, lh, hitSlopPara } from '@/lib/theme';
import {
  guessAmountFromText,
  categoriaEscolhida,
  categoriaReconhecida,
  PERGUNTA_CATEGORIA,
  guessDescFromText,
  guessTypeFromText,
  parseFormaPagamento,
  parseRecorrencia,
  matchWalletByText,
  limparReferenciaCarteira,
  citaCarteira,
} from '@/lib/heuristics';
import { formatMoney, parseAmount, todayISO, formatMoneyInput } from '@/lib/format';
import { dataDoTexto, semDatasDoTexto } from '@/lib/nota-foto-parser';
import { fetchCategories } from '@/lib/data';
import { salvarOuGuardarNoAparelho } from '@/lib/offline-cache';
import { marcarLancamentosAlterados } from '@/lib/lancamentos-alterados';
import { mensagemErro } from '@/lib/erros';
import { useDemo } from '@/lib/demo-context';
import TransactionSheet, { type ValoresLancamento } from './TransactionSheet';
import AppPressable from './AppPressable';
import Sheet from './Sheet';
import { dataInicialDaRevisao, type ReferenciaDaFala } from '@/lib/data-da-fala';
import type { TxType } from '@/lib/types';
import { LIMITS } from '@/lib/limits';
import { randomUUID } from 'expo-crypto';
import { desfechoDaOperacaoVoz, registrarOperacaoVoz } from '@/lib/voice-operations';
import { mensagemDeErroVoz } from '@/lib/voz';
import { useWallet } from '@/lib/wallet-context';
import { valorSeguroParaRevisaoVoz } from '@/lib/voz-confiabilidade';

export default function PasteReceiptModal({
  visible,
  onClose,
  onSuccess,
  initialText,
  falaGuardada,
  referenciaDaVoz,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Texto já pronto pra reconhecer, pulando a etapa de colar — usado pelo
      lançamento por voz, que chega aqui como transcrição. */
  initialText?: string;
  /** `requestId` da fala guardada que esta revisão salva; ver
      `registrarOperacaoVoz`. */
  falaGuardada?: string;
  /** A data da captura da fala (data na voz, 30/09/2026). Sem ela, hoje,
      como referência aproximada: data relativa fica para a pessoa escolher. */
  referenciaDaVoz?: ReferenciaDaFala;
}) {
  const { isDemoMode } = useDemo();
  const { wallets, activeWallet } = useWallet();
  const [rawText, setRawText] = useState('');
  const [recognized, setRecognized] = useState(false);
  const [type, setType] = useState<TxType>('out');
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  // Vazia até ser reconhecida no texto ou escolhida: nunca uma categoria padrão.
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  /* `saving` (estado) já desabilita o botão visualmente, mas o próprio
     `AppPressable` só reflete o novo valor de `disabled` depois de um
     re-render — um toque duplo rápido o bastante pode disparar `handleSave`
     duas vezes antes desse re-render acontecer, criando dois lançamentos
     idênticos. O ref é síncrono: barra a segunda chamada no mesmo instante
     em que a primeira entra, sem esperar o React repintar nada. */
  const savingRef = useRef(false);
  const operacaoVoz = useRef<string | null>(null);
  /* Só true quando o texto veio do reconhecimento de voz — quem colou o
     próprio comprovante já viu o que digitou/colou na textarea, então
     repetir o texto na tela de confirmação seria eco redundante. Voz é o
     caso oposto: a pessoa nunca viu o texto, só ouviu a própria fala, e o
     app tinha ZERO jeito de checar se o reconhecimento entendeu certo antes
     de confiar cegamente no valor preenchido — o mesmo problema que o
     "🎙️ Ouvi: ..." do bot de WhatsApp existe pra resolver. */
  const [origemVoz, setOrigemVoz] = useState(false);
  /* Categorias criadas pelo usuário (fora das 9 padrão) — sem isso,
     guessCategoryFromText nunca reconhecia uma categoria custom no texto
     colado, só as fixas. Buscada quando o modal abre, não a cada tecla. */
  const [categoriasExtras, setCategoriasExtras] = useState<{ name: string; color: string }[]>([]);
  /* Reconhecidos do texto e salvos junto — sem campo na tela de propósito: a
     confirmação aqui é uma revisão rápida de valor/descrição/categoria, e o
     que a pessoa disse ("no pix", "todo mês") ela já sabe que disse. Aparecem
     como resumo em `detalhesReconhecidos` abaixo, pra revisão não virar fé. */
  const [formaPagamento, setFormaPagamento] = useState<string | null>(null);
  const [recorrente, setRecorrente] = useState(false);
  const [walletId, setWalletId] = useState('');
  /* Data do texto colado (decisão do autor, 27/09/2026), agora num campo
     editável, a mesma linha "Data da compra" da foto (30/09/2026). Sem data no
     texto, hoje. `dataRecusada` quando havia uma data impossível, futura ou
     de mais de um ano: o campo fica sem data e a pessoa escolhe, em vez de ir
     com hoje em silêncio. `dataLida` liga o selo "lida do texto". */
  const [dataDoComprovante, setDataDoComprovante] = useState<string | null>(null);
  const [dataRecusada, setDataRecusada] = useState(false);
  const [dataLida, setDataLida] = useState(false);
  /* Na revisão de voz, a dica do campo quando a data da fala precisa de
     escolha ("Você disse 01/10, que ainda não chegou."). */
  const [dicaDaVoz, setDicaDaVoz] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    fetchCategories()
      .then((cats) => setCategoriasExtras(cats.filter((c) => !c.is_default)))
      .catch(() => {});
  }, [visible]);

  function resetState() {
    operacaoVoz.current = null;
    setRawText('');
    setRecognized(false);
    setDesc('');
    setAmount('');
    setType('out');
    setSaving(false);
    setOrigemVoz(false);
    setCategory('');
    setDataDoComprovante(null);
    setDataRecusada(false);
    setDataLida(false);
    setDicaDaVoz(null);
    setFormaPagamento(null);
    setRecorrente(false);
    setWalletId('');
  }

  /* O que foi reconhecido mas não tem campo próprio nesta tela. Sem isto a
     pessoa salvava sem saber que "todo mês" tinha virado uma série que se
     repete sozinha — e recorrência criada sem querer é dinheiro que aparece
     nos meses seguintes. */
  function processText(text: string, voz = false) {
    const wallet = matchWalletByText(text, wallets);
    const textoFinanceiro = wallet ? limparReferenciaCarteira(text, wallet.name) : text;
    /* Mesma regra da voz e do Granabô: "conta de luz" é conta a pagar, não
       carteira (achado B2, 26/09/2026). */
    const mencionada = citaCarteira(text);
    setWalletId(wallet?.id ?? (mencionada ? '' : activeWallet?.id ?? wallets.find((w) => w.is_default)?.id ?? wallets[0]?.id ?? ''));
    const guessedAmount = voz ? valorSeguroParaRevisaoVoz(textoFinanceiro) : guessAmountFromText(textoFinanceiro);
    const guessedType = guessTypeFromText(textoFinanceiro);
    const guessedCat = categoriaReconhecida(textoFinanceiro, categoriasExtras);
    const guessedDesc = guessDescFromText(textoFinanceiro, guessedType);

    setType(guessedType);
    setDesc(guessedDesc);
    setAmount(guessedAmount != null && guessedAmount > 0 ? formatMoney(guessedAmount) : '');
    setCategory(guessedCat?.name ?? '');
    /* Forma de pagamento e recorrência ditas na frase eram simplesmente
       jogadas fora aqui: "mercado 120 no pix" salvava sem payment_method
       nenhum, e "aluguel 1500 todo mês" salvava avulso. O bot do WhatsApp já
       lia as duas coisas do mesmo texto — o app é que não lia. */
    setFormaPagamento(parseFormaPagamento(textoFinanceiro));
    setRecorrente(parseRecorrencia(textoFinanceiro));
    setRecognized(true);
  }

  function handleProcessText() {
    const text = rawText.trim();
    if (!text) {
      Alert.alert('Texto vazio', 'Cole o texto do comprovante ou Pix para reconhecer.');
      return;
    }
    /* Valor e descrição leem o texto SEM a data (achado do P2, 30/09/2026:
       "Pix recebido em 29/09/2026" virava "Pix recebido em / /"); a data
       continua lida do texto original, logo abaixo. A voz não passa aqui. */
    processText(origemVoz ? text : semDatasDoTexto(text), origemVoz);
    /* Só no texto colado. A fala revisada aqui lê a data pelo núcleo da voz,
       no efeito de `initialText` abaixo, como a tarefa do widget (regra 13). */
    const lida = origemVoz ? { data: null, recusada: false } : dataDoTexto(text, todayISO());
    setDataDoComprovante(lida.data ?? (lida.recusada ? null : todayISO()));
    setDataRecusada(lida.recusada);
    setDataLida(!!lida.data);
  }

  useEffect(() => {
    if (!visible || !initialText) return;
    setRawText(initialText);
    setOrigemVoz(true);
    /* A data dita na fala, pela MESMA função da tarefa do app e do widget
       (regra 13), contada da captura. Valor, descrição e categoria leem o
       texto sem ela. Data duvidosa deixa o campo vazio, com a dica. */
    const inicial = dataInicialDaRevisao(initialText, referenciaDaVoz ?? { referencia: todayISO(), aproximada: true });
    processText(inicial.textoSemData, true);
    setDataDoComprovante(inicial.data);
    setDicaDaVoz(inicial.dica);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialText]);

  async function handleSave(v: ValoresLancamento) {
    if (savingRef.current) return;

    const val = parseAmount(v.amount);
    if (!val || val <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor maior que zero.');
      return;
    }
    if (!v.wallet_id) {
      Alert.alert('Escolha uma carteira', 'Informe em qual carteira o lançamento deve entrar.');
      return;
    }
    /* Data recusada (do texto ou da fala) deixa o campo sem data: nada é
       salvo com uma data que ninguém escolheu. */
    if (!v.occurred_on) {
      Alert.alert('Escolha a data');
      return;
    }
    if (isDemoMode) {
      Alert.alert(
        'Modo de exemplo ativo',
        'Desative "Dados de exemplo" no Perfil para salvar lançamentos reconhecidos na sua conta.'
      );
      return;
    }

    /* `categoriasExtras` também aqui, e não só no reconhecimento: sem passar,
       uma categoria custom reconhecida no texto voltava a cair em "Outros" na
       hora de salvar — o nome certo aparecia na tela e o lançamento gravava
       outro. */
    const catObj = categoriaEscolhida(v.category, categoriasExtras);
    if (!catObj) {
      Alert.alert(PERGUNTA_CATEGORIA.titulo, PERGUNTA_CATEGORIA.texto);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const input = {
        type: v.type,
        description: v.description.trim() || 'Sem descrição',
        amount: val,
        category: catObj.name,
        color: catObj.color,
        occurred_on: v.occurred_on,
        ...(formaPagamento ? { payment_method: formaPagamento } : null),
        ...(v.recurring ? { recurring: true } : null),
        wallet_id: v.wallet_id,
      };
      if (origemVoz) {
        operacaoVoz.current ??= randomUUID();
        const resultado = await registrarOperacaoVoz(operacaoVoz.current, 'app', { kind: 'transaction', ...input }, undefined, falaGuardada);
        const desfecho = desfechoDaOperacaoVoz(resultado);
        if (desfecho === 'pendente') Alert.alert('Salvo no aparelho', 'O lançamento será sincronizado ao abrir o Grana. com conexão.');
        else if (desfecho !== 'nova') { const m = mensagemDeErroVoz(desfecho); Alert.alert(m.titulo, m.texto); }
      } else {
        /* Comprovante colado SEM voz não tinha fila offline (item 3 da
           retomada de 25/09/2026): sem rede, `addTransaction` rejeitava e o
           texto reconhecido se perdia atrás de um Alert de erro — a mesma
           classe de defeito que T13/T20 já corrigiram para o lançamento
           manual, e que a voz já tinha pelo ramo `origemVoz` acima. */
        const { guardado } = await salvarOuGuardarNoAparelho(input);
        if (guardado) {
          marcarLancamentosAlterados();
          Alert.alert('Salvo no aparelho', 'Sem conexão. O lançamento será sincronizado ao abrir o Grana. com conexão.');
        }
      }
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

  function fechar() {
    if (savingRef.current) return;
    resetState();
    onClose();
  }

  if (recognized) {
    const cat = categoriaEscolhida(category, categoriasExtras);
    return <TransactionSheet
      visible={visible}
      onClose={fechar}
      modo="carteira"
      editando={false}
      inicial={{ type, description: desc, amount, category, color: cat?.color ?? '',
        occurred_on: dataDoComprovante ?? '', recurring: recorrente, installments: 1,
        card_id: null, wallet_id: walletId }}
      carteiras={wallets}
      salvando={saving}
      onSalvar={handleSave}
      semDataFutura
      semCarteiraPadrao
      descricaoPadrao="Sem descrição"
      focoNoValor={origemVoz}
      falaOuvida={origemVoz ? rawText : undefined}
      seloDaData={!origemVoz && dataLida ? 'lida do texto' : null}
      dicaDaData={origemVoz ? dicaDaVoz : dataRecusada ? 'A data do texto não foi usada. Escolha a data.' : null}
      acaoSecundaria={{ rotulo: origemVoz ? 'Gravar de novo' : 'Colar outro texto', onPress: () => {
        if (savingRef.current) return;
        if (origemVoz) fechar();
        else { setOrigemVoz(false); setRecognized(false); }
      } }}
    />;
  }

  return <AppModal visible={visible} transparent onRequestClose={fechar}>
    <Sheet centered onClose={fechar}>
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle} accessibilityRole="header">Colar comprovante ou Pix</Text>
        <AppPressable onPress={fechar} hitSlop={hitSlopPara(22)} accessibilityRole="button" accessibilityLabel="Fechar">
          <Ionicons name="close" size={22} color={theme.inkFaint} />
        </AppPressable>
      </View>
      <Text style={styles.hint}>Cole o texto copiado de um comprovante Pix, fatura ou recibo. Identificamos o valor, categoria e tipo automaticamente.</Text>
      <TextInput accessibilityLabel="Texto do comprovante" maxLength={LIMITS.pastedText}
        style={styles.textArea} placeholder="Ex.: Você transferiu R$ 45,90 para Restaurante Sabor da Terra..."
        placeholderTextColor={theme.inkFaint} multiline numberOfLines={5} value={rawText}
        onChangeText={setRawText} textAlignVertical="top" autoFocus />
      <AppPressable style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]} onPress={handleProcessText}>
        <Text style={styles.saveBtnText}>Reconhecer dados</Text>
      </AppPressable>
    </Sheet>
  </AppModal>;
}

const styles = StyleSheet.create({
sheet: {
    backgroundColor: theme.paperRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    maxHeight: '90%',
  },
sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
sheetTitle: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular },
hint: { color: theme.inkFaint, fontSize: type.nota, lineHeight: lh(type.nota, 'corpo'), fontFamily: fonts.light },
textArea: {
    backgroundColor: theme.paper,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
    color: theme.ink,
    fontSize: type.apoio,
    padding: spacing.md,
    minHeight: 110, fontFamily: fonts.regular,
    /* Sem isso o navegador desenha o próprio anel de foco azul padrão em
       cima do card — mantém o foco visível (acessibilidade), só troca a cor
       pela identidade do app em vez do azul genérico do sistema. */
    outlineColor: theme.accent2,
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineOffset: -1,
  },
saveBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
saveBtnHover: { opacity: 0.88 },
saveBtnText: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular }
});
