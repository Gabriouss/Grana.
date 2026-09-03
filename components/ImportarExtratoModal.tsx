import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AppModal from './AppModal';
import { Alert } from '@/lib/alert';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, fonts, type, lh } from '@/lib/theme';
import { parseCsvTextDetalhado } from '@/lib/heuristics';
import { parseOfx, type LancamentoOfx, type OrigemOfx } from '@/lib/ofx-parser';
import { escolherArquivoDeExtrato } from '@/lib/escolher-arquivo';
import { LIMITS } from '@/lib/limits';
import { formatDateLabel, formatMoney } from '@/lib/format';
import { addTransactionsBatch, fetchCreditCards } from '@/lib/data';
import { useSheetFlutuante } from '@/lib/breakpoints';
import { useDemo } from '@/lib/demo-context';
import { useWallet } from '@/lib/wallet-context';
import AppPressable from './AppPressable';
import ToggleSwitch from './ToggleSwitch';
import { useKeyboardHeight } from './Sheet';
import AccessibleModalPanel from './AccessibleModalPanel';
import type { CreditCard } from '@/lib/types';

/**
 * Importação de extrato — OFX e CSV na mesma folha.
 *
 * ── Por que os dois juntos ──────────────────────────────────────────────────
 *
 * Do ponto de vista de quem usa, "importar meu extrato" é UMA intenção. O
 * formato do arquivo é detalhe do banco, não uma escolha que a pessoa queira
 * fazer. Então não há seletor de formato: o arquivo é lido, o conteúdo diz se
 * é OFX ou CSV, e o resto do fluxo é idêntico.
 *
 * ── O que o OFX traz que o CSV não tem ──────────────────────────────────────
 *
 * 1. **FITID.** Identificador único de cada transação, dado pela instituição.
 *    É o que permite reimportar sem duplicar. Como os períodos de extrato que
 *    os bancos oferecem se sobrepõem, a segunda importação quase sempre repete
 *    parte da primeira, e sem FITID isso viraria lançamento em dobro.
 * 2. **Sinal confiável.** `TRNAMT` vem assinado, então entrada e saída são um
 *    fato do arquivo. No CSV o tipo é adivinhado pelo texto.
 * 3. **Origem.** O arquivo declara se é conta corrente ou fatura de cartão, e
 *    as duas coisas entram no app por caminhos diferentes.
 *
 * ── Cartão ──────────────────────────────────────────────────────────────────
 *
 * Fatura de cartão não é saída de caixa: o dinheiro só sai quando a fatura é
 * paga. Por isso um extrato de cartão entra com `payment_method: 'credit'` e
 * `card_id`, do mesmo jeito que uma compra lançada à mão na tela de Cartões.
 *
 * No OFX a origem (conta ou fatura) é um FATO do arquivo — o próprio banco
 * declara (`<CREDITCARDMSGSRSV1>`/`<CCSTMTRS>`), então a pessoa só escolhe A
 * QUAL cartão cadastrado o arquivo pertence, nunca se é fatura ou não. O CSV
 * não carrega essa informação (é só data/descrição/valor, sem metadado de
 * origem), então para CSV a pergunta "isto é fatura de cartão?" precisa ser
 * feita à pessoa — é um toggle manual (`veioDeCsv`), não uma dedução.
 */

type LinhaImportavel = LancamentoOfx;

export default function ImportarExtratoModal({
  visible,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { isDemoMode } = useDemo();
  const { activeWallet } = useWallet();
  const keyboardHeight = useKeyboardHeight();
  const { scrimStyle, sheetStyle: flutuanteStyle } = useSheetFlutuante();

  const [textoColado, setTextoColado] = useState('');
  const [linhas, setLinhas] = useState<LinhaImportavel[]>([]);
  const [origem, setOrigem] = useState<OrigemOfx>('conta');
  /* true só quando o arquivo interpretado foi CSV — controla se o toggle
     manual de "isto é fatura de cartão?" aparece. No OFX a origem já vem do
     próprio arquivo (ver comentário no topo do arquivo) e não é editável. */
  const [veioDeCsv, setVeioDeCsv] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  /** Progresso do insert em lote (lib/data.ts) — null enquanto não começou.
      Só chega a aparecer de verdade num arquivo grande: cada lote é de 500
      linhas, então uma importação pequena termina antes do primeiro
      callback de progresso ser útil de mostrar. */
  const [progresso, setProgresso] = useState<{ processados: number; total: number } | null>(null);
  const [cartoes, setCartoes] = useState<CreditCard[]>([]);
  const [cartaoId, setCartaoId] = useState<string | null>(null);

  /* Os cartões só importam quando o arquivo é de fatura, mas carregar aqui na
     abertura evita um segundo tempo de espera bem no meio do fluxo. */
  useEffect(() => {
    if (!visible || isDemoMode) return;
    fetchCreditCards()
      .then((lista) => {
        setCartoes(lista);
        setCartaoId((atual) => atual ?? lista[0]?.id ?? null);
      })
      .catch(() => {});
  }, [visible, isDemoMode]);

  function limpar() {
    setTextoColado('');
    setLinhas([]);
    setOrigem('conta');
    setVeioDeCsv(false);
    setNomeArquivo(null);
    setLendo(false);
    setImportando(false);
    setProgresso(null);
  }

  function fechar() {
    limpar();
    onClose();
  }

  /** Decide o formato pelo conteúdo, nunca pela extensão. */
  function interpretar(conteudo: string, nome: string | null) {
    if (/<OFX>/i.test(conteudo)) {
      const r = parseOfx(conteudo);
      if (r.lancamentos.length === 0) {
        Alert.alert('Nenhum lançamento no arquivo', 'O arquivo é um OFX válido, mas não tem transações no período.');
        return;
      }
      if (r.moeda && r.moeda.toUpperCase() !== 'BRL') {
        Alert.alert(
          'Extrato em outra moeda',
          `Este arquivo está em ${r.moeda}. Os valores entram como estão, sem conversão.`
        );
      }
      if (r.truncado) {
        Alert.alert(
          'Extrato grande demais',
          `O arquivo tem ${r.totalNoArquivo} transações e importamos as primeiras ${r.lancamentos.length}. ` +
            'Exporte o restante em outro período e importe em seguida.'
        );
      }
      setOrigem(r.origem);
      setVeioDeCsv(false);
      setLinhas(r.lancamentos);
      setNomeArquivo(nome);
      return;
    }

    const { rows, totalLinhas, truncado } = parseCsvTextDetalhado(conteudo);
    if (rows.length === 0) {
      Alert.alert(
        'Nenhum lançamento identificado',
        'Se for CSV, confira as colunas (Data, Descrição, Valor). Se for OFX, o arquivo pode estar incompleto.'
      );
      return;
    }
    if (truncado) {
      Alert.alert(
        'Extrato grande demais',
        `O arquivo tem ${totalLinhas} linhas e importamos as primeiras ${rows.length}. ` +
          'Separe o restante em outro arquivo e importe em seguida.'
      );
    }
    setOrigem('conta');
    setVeioDeCsv(true);
    /* CSV não traz um identificador de transação dado por uma instituição,
       diferente do OFX — mas cada linha já vem com uma chave sintética de
       gerarFitidSintetico() (lib/heuristics.ts), derivada do próprio
       conteúdo. Reimportar o mesmo arquivo é reconhecido como duplicado do
       mesmo jeito que um FITID de banco. */
    setLinhas(rows);
    setNomeArquivo(nome);
  }

  async function abrirSeletor() {
    setLendo(true);
    try {
      const arquivo = await escolherArquivoDeExtrato();
      if (!arquivo) return;
      interpretar(arquivo.texto, arquivo.nome);
    } catch (e: any) {
      Alert.alert('Não foi possível ler o arquivo', e?.message ?? 'Tente novamente.');
    } finally {
      setLendo(false);
    }
  }

  function processarColado() {
    const texto = textoColado.trim();
    if (!texto) {
      Alert.alert('Nada para importar', 'Escolha um arquivo ou cole o conteúdo do extrato.');
      return;
    }
    interpretar(texto, null);
  }

  const ehCartao = origem === 'cartao';
  const cartaoEscolhido = cartoes.find((c) => c.id === cartaoId) ?? null;
  const comFitid = linhas.filter((l) => l.fitid).length;

  async function confirmar() {
    if (linhas.length === 0) return;
    if (isDemoMode) {
      Alert.alert('Modo de exemplo ativo', 'Desative "Dados de exemplo" no Perfil para importar na sua conta.');
      return;
    }
    setImportando(true);
    try {
      const prontos = linhas.map((l) => ({
        type: l.type,
        description: l.description,
        amount: l.amount,
        category: l.category,
        color: l.color,
        occurred_on: l.occurred_on,
        fitid: l.fitid,
        wallet_id: activeWallet?.id ?? null,
        ...(ehCartao && cartaoEscolhido
          ? { payment_method: 'credit' as const, card_id: cartaoEscolhido.id }
          : {}),
      }));

      /* Só pede para ignorar duplicados quando há FITID para comparar. Num
         arquivo sem identificador o upsert não teria em que se apoiar. */
      const { inseridos, ignorados } = await addTransactionsBatch(
        prontos,
        comFitid > 0,
        (processados, total) => setProgresso({ processados, total })
      );

      Alert.alert(
        'Importação concluída',
        ignorados > 0
          ? `${inseridos} lançamento(s) importado(s). ${ignorados} já existia(m) e foram ignorados.`
          : `${inseridos} lançamento(s) importado(s).`
      );
      limpar();
      onClose();
      onSuccess();
    } catch (e: any) {
      Alert.alert('Erro na importação', e.message);
    } finally {
      setImportando(false);
    }
  }

  return (
    <AppModal visible={visible} animationType="slide" transparent onRequestClose={fechar}>
      <Pressable style={[styles.modalScrim, scrimStyle]} onPress={fechar}>
        {/* A prévia usa FlatList, então esta folha não entra no <Sheet> (que
            rolaria por fora); aqui basta afastar o conteúdo do teclado. */}
        <AccessibleModalPanel
          ativo={visible}
          style={[styles.sheet, flutuanteStyle, { paddingBottom: spacing.xl + keyboardHeight }]}
        >
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {linhas.length > 0 ? `Prévia: ${linhas.length} lançamento(s)` : 'Importar extrato'}
            </Text>
            <AppPressable onPress={fechar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fechar">
              <Ionicons name="close" size={22} color={theme.inkFaint} />
            </AppPressable>
          </View>

          {linhas.length === 0 ? (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.hint}>
                Baixe o extrato no site ou app do seu banco e escolha o arquivo aqui. Aceita OFX (o formato que quase
                todo banco oferece) e CSV.
              </Text>

              <AppPressable
                style={({ hovered }) => [styles.botaoArquivo, hovered && styles.botaoArquivoHover]}
                onPress={abrirSeletor}
                disabled={lendo}
              >
                {lendo ? (
                  <ActivityIndicator color={theme.accent2} />
                ) : (
                  <>
                    <Ionicons name="folder-open-outline" size={20} color={theme.accent2} />
                    <Text style={styles.botaoArquivoTexto}>Escolher arquivo do extrato</Text>
                  </>
                )}
              </AppPressable>

              <View style={styles.avisoPrivacidade}>
                <Ionicons name="lock-closed-outline" size={15} color={theme.accent2} aria-hidden />
                <Text style={styles.avisoTexto}>
                  O arquivo é lido no seu aparelho. O Grana. continua sem se conectar ao seu banco e sem pedir senha
                  bancária.
                </Text>
              </View>

              <Text style={styles.separador}>ou cole o conteúdo</Text>

              <TextInput
                maxLength={LIMITS.pastedText}
                style={styles.textArea}
                placeholder="Data,Descrição,Valor&#10;15/08/2026,Supermercado,-187.40&#10;14/08/2026,Salário,6200.00"
                placeholderTextColor={theme.inkFaint}
                multiline
                numberOfLines={6}
                value={textoColado}
                onChangeText={setTextoColado}
                textAlignVertical="top"
              />
              <AppPressable
                style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
                onPress={processarColado}
              >
                <Text style={styles.saveBtnText}>Processar texto colado</Text>
              </AppPressable>
            </ScrollView>
          ) : (
            <>
              {nomeArquivo ? (
                <Text style={styles.arquivoNome} numberOfLines={1}>
                  {nomeArquivo}
                </Text>
              ) : null}

              {veioDeCsv ? (
                <View style={styles.toggleFaturaLinha}>
                  <ToggleSwitch
                    value={ehCartao}
                    onToggle={() => setOrigem((o) => (o === 'cartao' ? 'conta' : 'cartao'))}
                    label="Este CSV é fatura de cartão de crédito"
                  />
                  <Text style={styles.toggleFaturaTexto}>Este CSV é fatura de cartão de crédito</Text>
                </View>
              ) : null}

              {ehCartao ? (
                <View style={styles.blocoCartao}>
                  <Text style={styles.blocoCartaoTitulo}>
                    {veioDeCsv ? 'A quem estas compras pertencem' : 'Este arquivo é uma fatura de cartão'}
                  </Text>
                  {cartoes.length === 0 ? (
                    <Text style={styles.blocoCartaoTexto}>
                      Você ainda não tem cartão cadastrado, então os lançamentos entram como saídas comuns. Cadastre o
                      cartão na aba Crédito e importe de novo se quiser que eles contem na fatura.
                    </Text>
                  ) : (
                    <>
                      <Text style={styles.blocoCartaoTexto}>Escolha a qual cartão estas compras pertencem:</Text>
                      <View style={styles.listaCartoes}>
                        {cartoes.map((c) => {
                          const ativo = c.id === cartaoId;
                          return (
                            <AppPressable
                              key={c.id}
                              onPress={() => setCartaoId(c.id)}
                              style={({ hovered }) => [
                                styles.chipCartao,
                                ativo && styles.chipCartaoAtivo,
                                hovered && !ativo && styles.chipCartaoHover,
                              ]}
                              accessibilityRole="button"
                              accessibilityState={{ selected: ativo }}
                            >
                              <View style={[styles.pontoCartao, { backgroundColor: c.color }]} />
                              <Text style={[styles.chipCartaoTexto, ativo && styles.chipCartaoTextoAtivo]}>
                                {c.name}
                              </Text>
                            </AppPressable>
                          );
                        })}
                      </View>
                    </>
                  )}
                </View>
              ) : null}

              <Text style={styles.hint}>
                {comFitid > 0
                  ? 'Confira antes de salvar. Lançamentos que você já importou antes são reconhecidos e não entram de novo.'
                  : 'Confira antes de salvar. Este formato não traz identificador de transação, então importar o mesmo arquivo duas vezes duplica os lançamentos.'}
              </Text>

              <FlatList
                data={linhas}
                keyExtractor={(item, i) => item.fitid ?? String(i)}
                style={styles.previewList}
                contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
                renderItem={({ item }) => (
                  <View style={styles.previewRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.previewDesc} numberOfLines={1}>
                        {item.description}
                      </Text>
                      <Text style={styles.previewSub}>
                        {formatDateLabel(item.occurred_on)} · {item.category}
                      </Text>
                    </View>
                    <Text style={[styles.previewAmount, { color: item.type === 'in' ? theme.up : theme.down }]}>
                      {item.type === 'in' ? '+' : '−'} R$ {formatMoney(Number(item.amount))}
                    </Text>
                  </View>
                )}
              />

              <AppPressable
                style={({ hovered }) => [styles.saveBtn, hovered && styles.saveBtnHover]}
                onPress={confirmar}
                disabled={importando}
              >
                {importando ? (
                  <View style={styles.progressoRow}>
                    <ActivityIndicator color={theme.paper} />
                    {progresso ? (
                      <Text style={styles.saveBtnText}>
                        Importando {progresso.processados} de {progresso.total}...
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.saveBtnText}>Importar {linhas.length} lançamento(s)</Text>
                )}
              </AppPressable>

              <AppPressable onPress={() => setLinhas([])}>
                <Text style={styles.backLink}>Escolher outro arquivo</Text>
              </AppPressable>
            </>
          )}
        </AccessibleModalPanel>
      </Pressable>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.paperRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    maxHeight: '88%',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular, flex: 1 },
  hint: { color: theme.inkFaint, fontSize: type.nota, lineHeight: lh(type.nota, 'apoio'), fontFamily: fonts.light },

  botaoArquivo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.accent2,
    backgroundColor: theme.accentDeep,
    marginTop: spacing.sm,
  },
  botaoArquivoHover: { backgroundColor: theme.hover },
  botaoArquivoTexto: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },

  avisoPrivacidade: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  avisoTexto: { flex: 1, color: theme.inkSoft, fontSize: type.legenda, lineHeight: lh(type.legenda, 'apoio'), fontFamily: fonts.light },

  separador: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, textAlign: 'center', marginTop: spacing.md },

  textArea: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: theme.rule,
    borderRadius: radius.md,
    padding: spacing.md,
    color: theme.ink,
    fontSize: type.nota,
    lineHeight: lh(type.nota, 'apoio'),
    fontFamily: fonts.light,
    backgroundColor: theme.paper,
    marginTop: spacing.xs,
  },

  arquivoNome: { color: theme.accent2, fontSize: type.legenda, fontFamily: fonts.light },

  toggleFaturaLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  toggleFaturaTexto: { color: theme.ink, fontSize: type.legenda, fontFamily: fonts.light, flexShrink: 1 },

  blocoCartao: {
    borderWidth: 1,
    borderColor: theme.rule,
    borderRadius: radius.md,
    backgroundColor: theme.paper,
    padding: spacing.md,
    gap: spacing.sm,
  },
  blocoCartaoTitulo: { color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
  blocoCartaoTexto: { color: theme.inkSoft, fontSize: type.legenda, lineHeight: lh(type.legenda, 'apoio'), fontFamily: fonts.light },
  listaCartoes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chipCartao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  chipCartaoHover: { borderColor: theme.ruleStrong },
  chipCartaoAtivo: { borderColor: theme.accent2, backgroundColor: theme.accentDeep },
  chipCartaoTexto: { color: theme.inkSoft, fontSize: type.legenda, fontFamily: fonts.light },
  chipCartaoTextoAtivo: { color: theme.ink, fontFamily: fonts.regular },
  pontoCartao: { width: 8, height: 8, borderRadius: 4 },

  previewList: { maxHeight: 300 },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  previewDesc: { color: theme.ink, fontSize: type.nota, lineHeight: lh(type.nota, 'apoio'), fontFamily: fonts.regular },
  previewSub: { color: theme.inkFaint, fontSize: type.legenda, lineHeight: lh(type.legenda, 'apoio'), fontFamily: fonts.light },
  previewAmount: { fontSize: type.nota, fontFamily: fonts.regular, fontVariant: ['tabular-nums'] },

  saveBtn: {
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  saveBtnHover: { opacity: 0.9 },
  saveBtnText: { color: theme.paper, fontSize: type.apoio, fontFamily: fonts.regular },
  progressoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backLink: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, textAlign: 'center', marginTop: spacing.sm },
});
