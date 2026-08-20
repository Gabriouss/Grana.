import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, fonts, type } from '@/lib/theme';
import { formatMoney, parseAmount, formatMoneyInput } from '@/lib/format';
import { upsertBudgetsBatch } from '@/lib/data';
import { useDemo } from '@/lib/demo-context';
import { LIMITS } from '@/lib/limits';
import {
  calcularArquetipo,
  calcularOrcamento,
  metaPoupanca,
  salvarDiagnostico,
  type Ambicao,
  type Foco,
  type NivelOrganizacao,
  type Respostas,
  type UsoCartao,
} from '@/lib/diagnostico';
import { layoutDoPreset, salvarLayoutHome, type HomePreset } from '@/lib/home-layout';
import AppPressable from './AppPressable';
import { useKeyboardHeight } from './Sheet';

/**
 * Diagnóstico financeiro em 5 etapas: consciência, foco, cartão, renda +
 * ambição, e o laudo com o arquétipo calculado. A classificação e o cálculo
 * do orçamento vivem em lib/diagnostico.ts — este arquivo só coleta as
 * respostas e apresenta o resultado.
 */

const OPCOES_ORGANIZACAO: { key: NivelOrganizacao; label: string; desc: string }[] = [
  { key: 'feeling', label: 'No feeling', desc: 'Não anoto quase nada e costumo levar susto no fim do mês.' },
  { key: 'tentativas', label: 'Tentativas frustradas', desc: 'Já tentei planilhas ou bloquinhos, mas acabo abandonando.' },
  { key: 'buscando-metodo', label: 'Em busca de método', desc: 'Anoto o básico, mas sinto que falta clareza e previsibilidade.' },
  { key: 'estruturado', label: 'Consciente & Estruturado', desc: 'Já tenho controle das contas e quero praticidade e análises melhores.' },
  { key: 'renda-variavel', label: 'Autônomo / Renda Variável', desc: 'Minha renda oscila todo mês e preciso de segurança e previsibilidade.' },
];

const OPCOES_FOCO: { key: Foco; label: string; desc: string }[] = [
  { key: 'fatura', label: 'Dominar a fatura do cartão', desc: 'Controlar compras parceladas e parar de pagar juros.' },
  { key: 'sobrar', label: 'Fazer o dinheiro sobrar todo mês', desc: 'Descobrir para onde o dinheiro está indo e estancar vazamentos.' },
  { key: 'reserva', label: 'Construir uma reserva ou meta', desc: 'Guardar com consistência para um objetivo claro ou emergência.' },
  { key: 'agilidade', label: 'Registro ágil sem esforço', desc: 'Lançar rápido (via comprovante Pix/CSV) e ter visão mensal limpa.' },
];

const OPCOES_CARTAO: { key: UsoCartao; label: string; desc: string }[] = [
  { key: 'no-limite', label: 'Alerta de limite', desc: 'Uso como extensão de renda e o limite vive no limite.' },
  { key: 'parcelado', label: 'Muitas parcelas acumuladas', desc: 'Compro parcelado com frequência e a fatura vem pesada.' },
  { key: 'controlado', label: 'Controlado / Por conveniência', desc: 'Concentro gastos no cartão pelos pontos, mas pago o total em dia.' },
  { key: 'quase-nao-uso', label: 'Quase não uso cartão', desc: 'Prefiro pagar no Pix ou débito na hora.' },
];

const OPCOES_AMBICAO: { key: Ambicao; label: string; desc: string }[] = [
  { key: 'gradual', label: '5% a 10%', desc: 'Passos graduais e realistas.' },
  { key: 'equilibrio', label: '15% a 25%', desc: 'Equilíbrio clássico 50/30/20.' },
  { key: 'acelerada', label: '30% ou mais', desc: 'Poupança acelerada.' },
  { key: 'equilibrar-primeiro', label: 'Só equilibrar as contas', desc: 'Zero a zero saudável, por enquanto.' },
];

export const OPCOES_PRESET_HOME: {
  key: 'completo' | 'essencial' | 'metas';
  label: string;
  desc: string;
  badge: string;
}[] = [
  {
    key: 'completo',
    label: '🌟 Completo & Analítico',
    desc: 'Visão 360° da sua vida financeira com Safe-to-Spend diário, cofrinhos, projeções e faturas.',
    badge: 'Recomendado',
  },
  {
    key: 'essencial',
    label: '⚡ Essencial & Clean',
    desc: 'Painel enxuto e focado no essencial: Donut de gastos por categoria e registro rápido.',
    badge: 'Mais Ágil',
  },
  {
    key: 'metas',
    label: '🎯 Foco em Metas & Limites',
    desc: 'Destaque total para seus cofrinhos de economia, limites por categoria e boletos.',
    badge: 'Construtor',
  },
];

const TOTAL_ETAPAS = 5;

function SeletorCard({
  label,
  desc,
  selecionado,
  onPress,
}: {
  label: string;
  desc: string;
  selecionado: boolean;
  onPress: () => void;
}) {
  return (
    <AppPressable
      onPress={onPress}
      style={({ hovered }) => [
        styles.optionCard,
        selecionado && styles.optionCardSelected,
        hovered && !selecionado && styles.optionCardHover,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionDesc}>{desc}</Text>
      </View>
      {selecionado && <Ionicons name="checkmark-circle" size={20} color={theme.accent2} />}
    </AppPressable>
  );
}

export default function OnboardingModal({
  visible,
  onClose,
  onFinished,
  initial,
}: {
  visible: boolean;
  onClose: () => void;
  onFinished: () => void;
  /** Respostas de um diagnóstico já salvo, para pré-preencher ao refazer — sem isso, reabrir o
      questionário sempre voltava em branco e não dava pra simplesmente corrigir a renda. */
  initial?: Respostas;
}) {
  const { isDemoMode } = useDemo();
  const keyboardHeight = useKeyboardHeight();
  /* O <Modal> desenha por baixo da barra de status no modo edge-to-edge — sem
     este recuo a barra de progresso fica em cima do relógio e da bateria.
     Mesmo tratamento do UpdateBanner. */
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(1);
  const [organizacao, setOrganizacao] = useState<NivelOrganizacao | null>(null);
  const [foco, setFoco] = useState<Foco | null>(null);
  const [cartao, setCartao] = useState<UsoCartao | null>(null);
  const [renda, setRenda] = useState('');
  const [ambicao, setAmbicao] = useState<Ambicao | null>(null);
  const [presetHome, setPresetHome] = useState<HomePreset>('completo');

  const [salvandoDiagnostico, setSalvandoDiagnostico] = useState(false);
  const [diagnosticoSalvo, setDiagnosticoSalvo] = useState(false);
  const [aplicandoOrcamento, setAplicandoOrcamento] = useState(false);
  const [orcamentoAplicado, setOrcamentoAplicado] = useState(false);

  /* O <Modal> continua montado quando visible=false, então o valor inicial do
     useState só é lido uma vez — sem isto, um diagnóstico salvo depois da
     primeira montagem nunca aparecia ao reabrir "Refazer diagnóstico". */
  useEffect(() => {
    if (!visible) return;
    setStep(1);
    setOrganizacao(initial?.organizacao ?? null);
    setFoco(initial?.foco ?? null);
    setCartao(initial?.cartao ?? null);
    setRenda(initial && initial.rendaMensal > 0 ? String(initial.rendaMensal).replace('.', ',') : '');
    setAmbicao(initial?.ambicao ?? null);
    setPresetHome('completo');
    setSalvandoDiagnostico(false);
    setDiagnosticoSalvo(false);
    setAplicandoOrcamento(false);
    setOrcamentoAplicado(false);
  }, [visible, initial]);

  function resetState() {
    setStep(1);
    setOrganizacao(null);
    setFoco(null);
    setCartao(null);
    setRenda('');
    setAmbicao(null);
    setPresetHome('completo');
    setSalvandoDiagnostico(false);
    setDiagnosticoSalvo(false);
    setAplicandoOrcamento(false);
    setOrcamentoAplicado(false);
  }

  const respostas: Respostas | null = useMemo(() => {
    if (!organizacao || !foco || !cartao || !ambicao) return null;
    return { organizacao, foco, cartao, rendaMensal: parseAmount(renda), ambicao };
  }, [organizacao, foco, cartao, renda, ambicao]);

  const arquetipo = respostas ? calcularArquetipo(respostas) : null;
  const orcamento = respostas && arquetipo ? calcularOrcamento(respostas, arquetipo) : null;
  const { rotulo: rotuloMeta } = respostas ? metaPoupanca(respostas.ambicao) : { rotulo: '' };

  useEffect(() => {
    if (step !== 6 || !respostas || !arquetipo || diagnosticoSalvo || salvandoDiagnostico) return;
    setSalvandoDiagnostico(true);
    salvarDiagnostico(respostas, arquetipo).finally(() => {
      setSalvandoDiagnostico(false);
      setDiagnosticoSalvo(true);
    });
  }, [step, respostas, arquetipo, diagnosticoSalvo, salvandoDiagnostico]);

  function avisar(msg: string) {
    Alert.alert('Quase lá', msg);
  }

  function finalizar(r: Respostas) {
    setOrganizacao(r.organizacao);
    setFoco(r.foco);
    setCartao(r.cartao);
    setAmbicao(r.ambicao);
    setDiagnosticoSalvo(false);
    salvarLayoutHome(layoutDoPreset(presetHome));
    setStep(6);
  }

  function handleNext() {
    if (step === 1) {
      if (!organizacao) return avisar('Escolha a opção que mais parece com você hoje.');
      setStep(2);
    } else if (step === 2) {
      if (!foco) return avisar('Escolha seu foco principal agora.');
      setStep(3);
    } else if (step === 3) {
      if (!cartao) return avisar('Escolha a opção sobre seu uso de cartão.');
      setStep(4);
    } else if (step === 4) {
      if (!ambicao) return avisar('Escolha sua meta de economia mensal.');
      setStep(5);
    } else if (step === 5) {
      finalizar({
        organizacao: organizacao!,
        foco: foco!,
        cartao: cartao!,
        rendaMensal: parseAmount(renda),
        ambicao: ambicao!,
      });
    } else {
      salvarLayoutHome(layoutDoPreset(presetHome));
      onFinished();
      resetState();
      onClose();
    }
  }

  function handleBack() {
    if (step > 1) setStep(step - 1);
  }

  function handleSkip() {
    // "Pular por agora" precisa sair de verdade, não só pular pro passo 6
    // com respostas padrão — isso ainda deixava o diagnóstico em aberto, e
    // se a pessoa fechasse o app dali (achando que já tinha pulado) o
    // onboarding nunca era marcado como visto e voltava a abrir no próximo
    // login. resetState() + onClose() fecham igual ao X do cabeçalho, que
    // já marca como visto em app/(app)/index.tsx.
    resetState();
    onClose();
  }

  async function handleAplicarOrcamento() {
    if (!orcamento || isDemoMode) return;
    setAplicandoOrcamento(true);
    try {
      await upsertBudgetsBatch(orcamento.linhas.map((l) => ({ category: l.category, amount: l.amount, color: l.color })));
      setOrcamentoAplicado(true);
    } catch (e: any) {
      Alert.alert('Erro ao aplicar orçamento', e.message);
    } finally {
      setAplicandoOrcamento(false);
    }
  }

  const rendaValida = parseAmount(renda) > 0;
  const progresso = Math.min(step, TOTAL_ETAPAS);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      {/* Tela cheia: o campo de renda ficaria atrás do teclado, já que no
          modo edge-to-edge a janela não encolhe sozinha. */}
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + spacing.md, paddingBottom: spacing.lg + keyboardHeight },
        ]}
      >
        <View style={styles.header}>
          {step > 1 ? (
            <AppPressable onPress={handleBack} hitSlop={10} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={20} color={theme.inkFaint} />
            </AppPressable>
          ) : (
            <View style={styles.backBtn} />
          )}
          <View style={styles.progressBar}>
            {Array.from({ length: TOTAL_ETAPAS }).map((_, i) => (
              <View key={i} style={[styles.progressSegment, i < progresso && styles.progressSegmentDone]} />
            ))}
          </View>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 1 && (
            <View style={styles.stepContent}>
              <Text style={styles.eyebrow}>1 de {TOTAL_ETAPAS} · bem-vindo ao Grana.</Text>
              <Text style={styles.question}>Como você cuida do seu dinheiro hoje?</Text>
              <View style={styles.optionsList}>
                {OPCOES_ORGANIZACAO.map((o) => (
                  <SeletorCard
                    key={o.key}
                    label={o.label}
                    desc={o.desc}
                    selecionado={organizacao === o.key}
                    onPress={() => setOrganizacao(o.key)}
                  />
                ))}
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.eyebrow}>2 de {TOTAL_ETAPAS}</Text>
              <Text style={styles.question}>Qual o seu foco principal no Grana agora?</Text>
              <View style={styles.optionsList}>
                {OPCOES_FOCO.map((o) => (
                  <SeletorCard
                    key={o.key}
                    label={o.label}
                    desc={o.desc}
                    selecionado={foco === o.key}
                    onPress={() => setFoco(o.key)}
                  />
                ))}
              </View>
            </View>
          )}

          {step === 3 && (
            <View style={styles.stepContent}>
              <Text style={styles.eyebrow}>3 de {TOTAL_ETAPAS}</Text>
              <Text style={styles.question}>Como é o seu uso de cartão de crédito?</Text>
              <View style={styles.optionsList}>
                {OPCOES_CARTAO.map((o) => (
                  <SeletorCard
                    key={o.key}
                    label={o.label}
                    desc={o.desc}
                    selecionado={cartao === o.key}
                    onPress={() => setCartao(o.key)}
                  />
                ))}
              </View>
            </View>
          )}

          {step === 4 && (
            <View style={styles.stepContent}>
              <Text style={styles.eyebrow}>4 de {TOTAL_ETAPAS}</Text>
              <Text style={styles.question}>Qual sua renda mensal aproximada?</Text>
              <View style={styles.incomeRow}>
                <Text style={styles.incomePrefix}>R$</Text>
                <TextInput
                  maxLength={LIMITS.amount}
                  style={styles.incomeInput}
                  placeholder="0,00"
                  placeholderTextColor={theme.inkFaint}
                  keyboardType="number-pad"
                  value={renda}
                  onChangeText={(t) => setRenda(formatMoneyInput(t))}
                />
              </View>
              <Text style={styles.hint}>
                Usamos isso só para calcular o orçamento sugerido por categoria — dá para deixar em
                branco e ajustar tudo depois.
              </Text>

              <Text style={[styles.question, { fontSize: type.titulo, marginTop: spacing.lg }]}>
                Quanto você quer conseguir guardar por mês?
              </Text>
              <View style={styles.optionsList}>
                {OPCOES_AMBICAO.map((o) => (
                  <SeletorCard
                    key={o.key}
                    label={o.label}
                    desc={o.desc}
                    selecionado={ambicao === o.key}
                    onPress={() => setAmbicao(o.key)}
                  />
                ))}
              </View>
            </View>
          )}

          {step === 5 && (
            <View style={styles.stepContent}>
              <Text style={styles.eyebrow}>5 de {TOTAL_ETAPAS} · personalização</Text>
              <Text style={styles.question}>Como você prefere ver seu painel inicial?</Text>
              <Text style={styles.hint}>
                Escolha o modelo que mais combina com seu momento. Você poderá adicionar, remover ou
                reorganizar qualquer bloco depois.
              </Text>
              <View style={styles.optionsList}>
                {OPCOES_PRESET_HOME.map((p) => (
                  <SeletorCard
                    key={p.key}
                    label={p.label}
                    desc={p.desc}
                    selecionado={presetHome === p.key}
                    onPress={() => setPresetHome(p.key)}
                  />
                ))}
              </View>
            </View>
          )}

          {step === 6 && arquetipo && orcamento && respostas && (
            <View style={styles.stepContent}>
              <Text style={styles.eyebrow}>Seu diagnóstico</Text>

              <View style={styles.laudoCard}>
                <Text style={styles.laudoEmoji}>{arquetipo.emoji}</Text>
                <Text style={styles.laudoNome}>{arquetipo.nome}</Text>
                <Text style={styles.laudoRetrato}>{arquetipo.retrato}</Text>
              </View>

              <Text style={styles.secaoTitulo}>Missão</Text>
              <Text style={styles.laudoMissao}>{arquetipo.missao}</Text>

              <Text style={styles.secaoTitulo}>Plano de ação</Text>
              <View style={{ gap: 10 }}>
                {arquetipo.plano.map((passo, i) => (
                  <View key={i} style={styles.planoItem}>
                    <View style={styles.planoNumero}>
                      <Text style={styles.planoNumeroTexto}>{i + 1}</Text>
                    </View>
                    <Text style={styles.planoTexto}>{passo}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.secaoTitulo}>Orçamento sugerido</Text>
              {respostas.rendaMensal > 0 ? (
                <View style={styles.orcamentoBox}>
                  <View style={styles.orcamentoRow}>
                    <View style={styles.orcamentoRotulo}>
                      <View style={[styles.dot, { backgroundColor: theme.accent2 }]} />
                      <Text style={styles.orcamentoNome}>Poupança ({rotuloMeta})</Text>
                    </View>
                    <Text style={[styles.orcamentoValor, styles.tabular]}>
                      R$ {formatMoney(orcamento.poupancaMensal)}
                    </Text>
                  </View>
                  {orcamento.linhas.map((l) => (
                    <View key={l.category} style={styles.orcamentoRow}>
                      <View style={styles.orcamentoRotulo}>
                        <View style={[styles.dot, { backgroundColor: l.color }]} />
                        <Text style={styles.orcamentoNome}>{l.category}</Text>
                      </View>
                      <Text style={[styles.orcamentoValor, styles.tabular]}>R$ {formatMoney(l.amount)}</Text>
                    </View>
                  ))}
                  <View style={[styles.orcamentoRow, styles.orcamentoTotal]}>
                    <Text style={styles.orcamentoNomeTotal}>Total do mês</Text>
                    <Text style={[styles.orcamentoValorTotal, styles.tabular]}>
                      R$ {formatMoney(orcamento.despesaTotal + orcamento.poupancaMensal)}
                    </Text>
                  </View>
                </View>
              ) : (
                <AppPressable onPress={() => setStep(4)} hitSlop={4}>
                  <Text style={[styles.hint, styles.hintLink]}>
                    Informe sua renda para ver os valores calculados por categoria. Toque aqui para adicionar.
                  </Text>
                </AppPressable>
              )}

              <AppPressable
                style={({ hovered }) => [
                  styles.applyBtn,
                  (orcamentoAplicado || isDemoMode || !rendaValida) && styles.applyBtnDisabled,
                  hovered && rendaValida && !orcamentoAplicado && !isDemoMode && styles.applyBtnHover,
                ]}
                onPress={handleAplicarOrcamento}
                disabled={orcamentoAplicado || isDemoMode || !rendaValida || aplicandoOrcamento}
              >
                {aplicandoOrcamento ? (
                  <ActivityIndicator color={theme.ink} />
                ) : (
                  <>
                    <Ionicons
                      name={orcamentoAplicado ? 'checkmark-circle' : 'download-outline'}
                      size={16}
                      color={orcamentoAplicado ? theme.accent2 : theme.ink}
                    />
                    <Text style={styles.applyBtnText}>
                      {isDemoMode
                        ? 'Indisponível no modo de exemplo'
                        : orcamentoAplicado
                        ? 'Orçamento aplicado'
                        : rendaValida
                        ? 'Aplicar orçamento sugerido'
                        : 'Informe a renda para aplicar'}
                    </Text>
                  </>
                )}
              </AppPressable>
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <AppPressable
            style={({ hovered }) => [styles.primaryBtn, hovered && styles.primaryBtnHover]}
            onPress={handleNext}
          >
            <Text style={styles.primaryBtnText}>
              {step === 5 ? 'Ver meu diagnóstico' : step === 6 ? 'Começar a usar o Grana' : 'Continuar'}
            </Text>
          </AppPressable>
          {step <= 5 && (
            <AppPressable onPress={handleSkip}>
              <Text style={styles.skipBtnText}>Pular por agora</Text>
            </AppPressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.paper, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  backBtn: { width: 28, alignItems: 'flex-start' },
  progressBar: { flex: 1, flexDirection: 'row', gap: 6 },
  progressSegment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: theme.rule },
  progressSegmentDone: { backgroundColor: theme.ink },
  scrollContent: { flexGrow: 1, paddingBottom: spacing.md },
  stepContent: { gap: 12 },
  eyebrow: { color: theme.inkFaint, fontSize: type.legenda, letterSpacing: 1, fontFamily: fonts.light },
  question: { color: theme.ink, fontSize: type.cabecalho, fontFamily: fonts.light, lineHeight: 29, marginBottom: spacing.sm },
  optionsList: { gap: 10 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: theme.paperRaised,
    borderWidth: 1.5,
    borderColor: theme.rule,
  },
  optionCardSelected: { borderColor: theme.accent2, backgroundColor: theme.paperRaised },
  optionCardHover: { borderColor: theme.ruleStrong },
  optionLabel: { color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular },
  optionDesc: { color: theme.inkFaint, fontSize: type.nota, lineHeight: 16, marginTop: 2, fontFamily: fonts.light },
  /* Antes era só um traço embaixo (sem borda nem fundo), e ficava fácil de
     confundir com um rótulo estático em vez de campo editável — foi
     reportado como "não tem caixa de texto pra digitar". Agora tem a mesma
     linguagem visual dos outros inputs do app: caixa com fundo, borda e
     cantos arredondados, para não deixar dúvida de que é tocável. */
  incomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: theme.rule,
    borderRadius: radius.md,
    backgroundColor: theme.paperRaised,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  incomePrefix: { color: theme.inkFaint, fontSize: type.destaque, fontFamily: fonts.light },
  incomeInput: { color: theme.ink, fontSize: type.marca, flex: 1, fontVariant: ['tabular-nums'], fontFamily: fonts.regular },
  hint: { color: theme.inkFaint, fontSize: type.nota, lineHeight: 18, marginTop: 8, fontFamily: fonts.light },
  hintLink: { color: theme.accent2, textDecorationLine: 'underline' },

  laudoCard: {
    backgroundColor: theme.paperRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: spacing.lg,
    alignItems: 'center',
    gap: 6,
  },
  laudoEmoji: { fontSize: type.valor, fontFamily: fonts.regular },
  laudoNome: { color: theme.ink, fontSize: type.destaque, fontFamily: fonts.light, textAlign: 'center' },
  laudoRetrato: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: 19, textAlign: 'center', marginTop: 4, fontFamily: fonts.light },

  secaoTitulo: { color: theme.inkFaint, fontSize: type.legenda, letterSpacing: 0.5, marginTop: spacing.md, fontFamily: fonts.light },
  laudoMissao: { color: theme.ink, fontSize: type.corpo, lineHeight: 20, fontFamily: fonts.regular },

  planoItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  planoNumero: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: theme.accentDeep,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  planoNumeroTexto: { color: theme.accent2, fontSize: type.legenda, fontFamily: fonts.regular },
  planoTexto: { flex: 1, color: theme.inkSoft, fontSize: type.apoio, lineHeight: 19, fontFamily: fonts.light },

  orcamentoBox: { backgroundColor: theme.paperRaised, borderRadius: radius.md, borderWidth: 1, borderColor: theme.rule, padding: spacing.md, gap: 2 },
  orcamentoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.rule },
  orcamentoRotulo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  orcamentoNome: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
  orcamentoValor: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.light },
  orcamentoTotal: { borderBottomWidth: 0, paddingTop: 10 },
  orcamentoNomeTotal: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
  orcamentoValorTotal: { color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular },
  tabular: { fontVariant: ['tabular-nums'] },

  applyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: theme.paperRaised,
    borderWidth: 1.5, borderColor: theme.accent2,
    borderRadius: radius.md,
    paddingVertical: 14,
    marginTop: spacing.sm,
  },
  applyBtnHover: { backgroundColor: theme.accentDeep },
  applyBtnDisabled: { borderColor: theme.rule, opacity: 0.7 },
  applyBtnText: { color: theme.ink, fontSize: type.corpo, fontFamily: fonts.regular },

  footer: { gap: 10, paddingTop: spacing.md },
  primaryBtn: { backgroundColor: theme.ink, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
  primaryBtnHover: { opacity: 0.88 },
  primaryBtnText: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
  skipBtnText: { color: theme.inkFaint, fontSize: type.apoio, textAlign: 'center', paddingVertical: 6, fontFamily: fonts.light },
});
