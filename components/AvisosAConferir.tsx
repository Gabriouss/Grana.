import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppModal, { InsetsDoModal } from './AppModal';
import AppPressable from './AppPressable';
import TransactionSheet, { type ValoresLancamento } from './TransactionSheet';
import { Alert } from '@/lib/alerta';
import { listarCaixa, removerItemDaCaixa, sincronizarCaixa } from '@/lib/avisos-banco/caixa';
import { nomeDoApp, PACOTES_INICIAIS } from '@/lib/avisos-banco/catalogo';
import {
  cartaoDoItem,
  categoriaDoItem,
  confirmaEmUmToque,
  descricaoDoItem,
  formaDoItem,
  montarEntrada,
  pareceEntreContas,
  pareceJaLancado,
  type ItemAConferir,
} from '@/lib/avisos-banco/decidir';
import { gravarItem, pagarContaDoItem } from '@/lib/avisos-banco/gravar';
import type { FormaDoAviso } from '@/lib/avisos-banco/interpretar';
import { fetchApelidosCategoria, fetchBills, fetchCategories, fetchCreditCards, fetchTransactionsDoPeriodo } from '@/lib/data';
import { useDemo } from '@/lib/demo-context';
import { mensagemErro } from '@/lib/erros';
import { usePublicarFaixaTopo } from '@/lib/faixa-topo';
import { formatDateLabel, formatMoney, formatMoneyInput, parseAmount } from '@/lib/format';
import { categoriaEscolhida, PERGUNTA_CATEGORIA } from '@/lib/heuristics';
import { marcarLancamentosAlterados } from '@/lib/lancamentos-alterados';
import { fonts, lh, radius, spacing, theme, touchTarget, type } from '@/lib/theme';
import type { Bill, CreditCard, Transaction, Wallet } from '@/lib/types';
import { fetchWallets } from '@/lib/wallets';
import {
  avisosDisponivel,
  definirDonoAvisos,
  garantirListaInicialAvisos,
  lerDiarioAvisos,
} from '@/modules/grana-avisos';

/**
 * Faixa "2 gastos para conferir" e a lista que ela abre. Nada grava dinheiro sem
 * o toque em Confirmar. O toque só grava direto com todos os campos certos; o
 * resto abre a mesma janela do lançamento manual.
 */
type DadosDaLista = {
  carteiras: Wallet[];
  cartoes: CreditCard[];
  extras: { name: string; color: string }[];
  apelidos: { chave: string; valor: string }[] | null;
  contasAbertas: Bill[];
  lancamentos: Transaction[];
  /** Sem os lançamentos, não dá para dizer que não foi lançado antes: nada grava em um toque. */
  semConferenciaDeDuplicata: boolean;
};

const FORMA_ROTULO: Record<FormaDoAviso, string> = { credit: 'Crédito', debit: 'Débito', pix: 'Pix', boleto: 'Boleto' };

function textoDaFaixa(itens: ItemAConferir[]): string {
  const gastos = itens.every((i) => i.tipo === 'lancamento' && i.direcao === 'out');
  if (itens.length === 1) return gastos ? '1 gasto para conferir' : '1 aviso para conferir';
  return `${itens.length} ${gastos ? 'gastos' : 'avisos'} para conferir`;
}

function carteiraPadrao(item: ItemAConferir, dados: DadosDaLista, forma: FormaDoAviso | null): string {
  const cartao = forma === 'credit' ? cartaoDoItem(item, dados.cartoes) : null;
  return cartao?.wallet_id ?? dados.carteiras.find((w) => w.is_default)?.id ?? dados.carteiras[0]?.id ?? '';
}

export default function AvisosAConferir({ dono, nomeDoPerfil }: { dono: string; nomeDoPerfil?: string | null }) {
  const [itens, setItens] = useState<ItemAConferir[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState(false);
  const insets = useSafeAreaInsets();

  const carregar = useCallback(async () => {
    if (!avisosDisponivel) return;
    try {
      const { itens: lidos, ilegiveis } = await sincronizarCaixa(dono);
      setItens(lidos);
      setErro(ilegiveis > 0 ? `${ilegiveis} avisos não puderam ser lidos` : null);
    } catch (e) {
      console.error('[avisos] não leu o diário', e instanceof Error ? e.name : 'erro');
      setErro('Não consegui ler os avisos do banco');
    }
  }, [dono]);

  useEffect(() => {
    if (!avisosDisponivel) return;
    definirDonoAvisos(dono);
    garantirListaInicialAvisos(PACOTES_INICIAIS);
    void carregar();
    const evento = AppState.addEventListener('change', (estado) => { if (estado === 'active') void carregar(); });
    return () => evento.remove();
  }, [carregar, dono]);

  const faixaVisivel = avisosDisponivel && (itens.length > 0 || !!erro);
  const ocupaTopo = usePublicarFaixaTopo(faixaVisivel, 2);

  return <>
    {faixaVisivel && (
      <View style={[styles.faixa, { paddingTop: ocupaTopo ? Math.max(spacing.md, insets.top + spacing.sm) : spacing.md }]}>
        <View style={styles.faixaLinha}>
          <Text style={styles.faixaTexto} numberOfLines={1} adjustsFontSizeToFit accessibilityLiveRegion="polite">
            {itens.length > 0 ? textoDaFaixa(itens) : erro}
          </Text>
          <AppPressable
            style={styles.faixaBotao}
            accessibilityRole="button"
            onPress={() => { if (itens.length > 0) setAberta(true); else void carregar(); }}
          >
            <Text style={styles.acao}>{itens.length > 0 ? 'Conferir' : 'Tentar de novo'}</Text>
          </AppPressable>
        </View>
      </View>
    )}
    {aberta && (
      <ListaAConferir
        dono={dono}
        nomeDoPerfil={nomeDoPerfil}
        aoFechar={() => { setAberta(false); void carregar(); }}
        aoMudar={setItens}
      />
    )}
  </>;
}

function ListaAConferir({ dono, nomeDoPerfil, aoFechar, aoMudar }: {
  dono: string;
  nomeDoPerfil?: string | null;
  aoFechar: () => void;
  aoMudar: (itens: ItemAConferir[]) => void;
}) {
  const { isDemoMode } = useDemo();
  const [itens, setItens] = useState<ItemAConferir[]>([]);
  const [dados, setDados] = useState<DadosDaLista | null>(null);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [recibo, setRecibo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [revisao, setRevisao] = useState<{ item: ItemAConferir; forma: FormaDoAviso } | null>(null);
  /* Trava síncrona: o estado só muda no próximo render, e toque duplo cabe nesse intervalo. */
  const emAndamento = useRef(false);

  const recarregarItens = useCallback(async () => {
    const lista = await listarCaixa(dono);
    setItens(lista);
    aoMudar(lista);
    return lista;
  }, [aoMudar, dono]);

  const carregarTudo = useCallback(async () => {
    setFalha(null);
    try {
      const lista = await recarregarItens();
      const diario = await lerDiarioAvisos();
      setTextos(Object.fromEntries(diario.itens.map((a) => [a.id, [a.titulo, a.texto].filter(Boolean).join('\n')])));
      const datas = lista.map((i) => i.data).sort();
      const [carteiras, cartoes, categorias, apelidos, contasAbertas, lancamentos] = await Promise.all([
        fetchWallets(),
        fetchCreditCards(),
        fetchCategories(),
        fetchApelidosCategoria().catch(() => null),
        fetchBills({ status: 'due' }),
        (datas.length ? fetchTransactionsDoPeriodo(datas[0], datas[datas.length - 1]) : Promise.resolve([] as Transaction[]))
          .then((t) => ({ t, falhou: false }))
          .catch(() => ({ t: [] as Transaction[], falhou: true })),
      ]);
      setDados({
        carteiras,
        cartoes,
        extras: categorias.filter((c) => !c.is_default).map((c) => ({ name: c.name, color: c.color })),
        apelidos,
        contasAbertas,
        lancamentos: lancamentos.t,
        semConferenciaDeDuplicata: lancamentos.falhou,
      });
    } catch (e) {
      setFalha(mensagemErro(e));
    }
  }, [recarregarItens]);

  useEffect(() => { void carregarTudo(); }, [carregarTudo]);

  async function descartar(item: ItemAConferir) {
    if (emAndamento.current) return;
    emAndamento.current = true;
    setOcupado(item.id);
    try {
      await removerItemDaCaixa(dono, item.id);
      setRecibo('Aviso descartado');
      await recarregarItens();
    } catch (e) {
      setRecibo(`Não consegui descartar: ${mensagemErro(e)}`);
    } finally {
      emAndamento.current = false;
      setOcupado(null);
    }
  }

  async function executar(item: ItemAConferir, tarefa: () => Promise<string>): Promise<boolean> {
    if (emAndamento.current) return false;
    if (isDemoMode) {
      Alert.alert('Modo de exemplo ativo', 'Desative "Dados de exemplo" no Perfil para salvar este aviso na sua conta.');
      return false;
    }
    emAndamento.current = true;
    setOcupado(item.id);
    try {
      setRecibo(await tarefa());
      await recarregarItens();
      return true;
    } catch (e) {
      Alert.alert('Não consegui salvar', mensagemErro(e));
      return false;
    } finally {
      emAndamento.current = false;
      setOcupado(null);
    }
  }

  async function gravarComToque(item: ItemAConferir, d: DadosDaLista, forma: FormaDoAviso) {
    const categoria = categoriaDoItem(item, d.apelidos, d.extras);
    if (!categoria) return;
    const entrada = montarEntrada({
      type: item.direcao ?? 'out',
      description: descricaoDoItem(item, categoria.name),
      amount: item.valor ?? 0,
      category: categoria.name,
      color: categoria.color,
      occurred_on: item.data,
      forma,
      wallet_id: carteiraPadrao(item, d, forma),
      cartao: cartaoDoItem(item, d.cartoes),
    });
    await executar(item, async () => {
      const { guardado } = await gravarItem(dono, item, entrada);
      if (guardado) marcarLancamentosAlterados();
      return guardado ? 'Sem conexão. Lançamento salvo no aparelho' : 'Lançamento salvo';
    });
  }

  /** Boleto: paga a conta casada ou vira saída. Nunca os dois. */
  function abrirBoleto(item: ItemAConferir, d: DadosDaLista) {
    if (item.contaEmPagamento) {
      if (!d.contasAbertas.some((c) => c.id === item.contaEmPagamento)) {
        void descartar(item);
        return;
      }
    }
    const conta = d.contasAbertas.find((c) => Math.abs(Number(c.amount) - (item.valor ?? 0)) < 0.005);
    if (!conta) {
      setRevisao({ item, forma: 'boleto' });
      return;
    }
    Alert.alert('Conta com o mesmo valor', `"${conta.description}" está em aberto. É esta conta?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Não, lançar saída', onPress: () => setRevisao({ item, forma: 'boleto' }) },
      {
        text: 'Sim, marcar como paga',
        onPress: () => void executar(item, async () => {
          await pagarContaDoItem(dono, item, conta);
          return 'Conta marcada como paga';
        }),
      },
    ]);
  }

  function perguntarForma(item: ItemAConferir) {
    Alert.alert('Como foi pago?', 'O aviso não diz a forma de pagamento.', [
      { text: 'Crédito', onPress: () => setRevisao({ item, forma: 'credit' }) },
      { text: 'Débito', onPress: () => setRevisao({ item, forma: 'debit' }) },
      { text: 'Pix', onPress: () => setRevisao({ item, forma: 'pix' }) },
    ]);
  }

  function abrirRevisao(item: ItemAConferir, d: DadosDaLista) {
    const forma = formaDoItem(item, d.cartoes);
    if (forma === 'boleto') abrirBoleto(item, d);
    else if (!forma) perguntarForma(item);
    else setRevisao({ item, forma });
  }

  function confirmar(item: ItemAConferir, d: DadosDaLista) {
    const forma = formaDoItem(item, d.cartoes);
    const categoria = categoriaDoItem(item, d.apelidos, d.extras);
    const umToque = confirmaEmUmToque(item, {
      forma,
      categoria: categoria?.name ?? null,
      carteiraId: carteiraPadrao(item, d, forma) || null,
      cartaoId: cartaoDoItem(item, d.cartoes)?.id ?? null,
      jaLancado: d.semConferenciaDeDuplicata || pareceJaLancado(item, d.lancamentos),
      entreContas: pareceEntreContas(item, nomeDoPerfil),
    });
    if (umToque && forma) void gravarComToque(item, d, forma);
    else abrirRevisao(item, d);
  }

  async function salvarRevisao(v: ValoresLancamento) {
    if (!revisao) return;
    const { item, forma } = revisao;
    const valor = parseAmount(v.amount);
    if (!valor || valor <= 0) {
      Alert.alert('Informe um valor válido');
      return;
    }
    const categoria = categoriaEscolhida(v.category, [{ name: v.category, color: v.color }]);
    if (!categoria) {
      Alert.alert(PERGUNTA_CATEGORIA.titulo, PERGUNTA_CATEGORIA.texto);
      return;
    }
    const cartao = forma === 'credit' ? dados?.cartoes.find((c) => c.id === v.card_id) ?? null : null;
    const entrada = montarEntrada({
      type: forma === 'credit' ? 'out' : v.type,
      description: v.description.trim() || (v.type === 'in' ? 'Entrada' : 'Saída'),
      amount: valor,
      category: categoria.name,
      color: categoria.color,
      occurred_on: v.occurred_on,
      forma,
      wallet_id: v.wallet_id,
      cartao,
      parcelas: v.installments,
    });
    const salvou = await executar(item, async () => {
      const { guardado } = await gravarItem(dono, item, entrada);
      if (guardado) marcarLancamentosAlterados();
      return guardado ? 'Sem conexão. Lançamento salvo no aparelho' : 'Lançamento salvo';
    });
    if (salvou) setRevisao(null);
  }

  function valoresIniciais(item: ItemAConferir, forma: FormaDoAviso, d: DadosDaLista): ValoresLancamento {
    const categoria = categoriaDoItem(item, d.apelidos, d.extras);
    const cartao = forma === 'credit' ? cartaoDoItem(item, d.cartoes) : null;
    return {
      type: item.direcao ?? 'out',
      description: descricaoDoItem(item, categoria?.name),
      amount: item.valor ? formatMoneyInput(String(Math.round(item.valor * 100))) : '',
      category: categoria?.name ?? '',
      color: categoria?.color ?? '',
      occurred_on: item.data,
      recurring: false,
      installments: item.parcelas ?? 1,
      card_id: cartao?.id ?? null,
      wallet_id: carteiraPadrao(item, d, forma),
    };
  }

  const vazio = !falha && dados && itens.length === 0;

  return <>
    <AppModal visible={!revisao} onRequestClose={aoFechar}>
      <InsetsDoModal>{(insets) => (
        <View style={[styles.tela, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom }]}>
          <View style={styles.cabecalho}>
            <Text style={styles.titulo} accessibilityRole="header">A conferir</Text>
            <AppPressable style={styles.faixaBotao} accessibilityRole="button" onPress={aoFechar}>
              <Text style={styles.acao}>Fechar</Text>
            </AppPressable>
          </View>
          {recibo && <Text style={styles.recibo} accessibilityLiveRegion="polite">{recibo}</Text>}
          {falha && (
            <View style={styles.cartao}>
              <Text style={styles.corpo}>{falha}</Text>
              <AppPressable style={styles.faixaBotao} accessibilityRole="button" onPress={() => void carregarTudo()}>
                <Text style={styles.acao}>Tentar de novo</Text>
              </AppPressable>
            </View>
          )}
          {!dados && !falha && <ActivityIndicator color={theme.ink} style={styles.carregando} />}
          {vazio && <Text style={styles.corpo}>Nada para conferir agora.</Text>}
          <ScrollView contentContainerStyle={styles.lista}>
            {dados && itens.map((item) => (
              <CartaoDoAviso
                key={item.id}
                item={item}
                dados={dados}
                texto={textos[item.avisoIds[0]]}
                entreContas={pareceEntreContas(item, nomeDoPerfil)}
                ocupado={ocupado === item.id}
                aoConfirmar={() => confirmar(item, dados)}
                aoEditar={() => abrirRevisao(item, dados)}
                aoDescartar={() => void descartar(item)}
              />
            ))}
          </ScrollView>
        </View>
      )}</InsetsDoModal>
    </AppModal>
    {revisao && dados && (
      <TransactionSheet
        visible
        onClose={() => setRevisao(null)}
        modo={revisao.forma === 'credit' ? 'credito' : 'carteira'}
        editando={false}
        inicial={valoresIniciais(revisao.item, revisao.forma, dados)}
        cartoes={dados.cartoes}
        carteiras={dados.carteiras}
        salvando={ocupado === revisao.item.id}
        onSalvar={(v) => void salvarRevisao(v)}
        semDataFutura
        seloDaData="lida do aviso"
        descricaoPadrao={revisao.item.direcao === 'in' ? 'Entrada' : 'Saída'}
        focoNoValor
      />
    )}
  </>;
}

function CartaoDoAviso({ item, dados, texto, entreContas, ocupado, aoConfirmar, aoEditar, aoDescartar }: {
  item: ItemAConferir;
  dados: DadosDaLista;
  texto?: string;
  entreContas: boolean;
  ocupado: boolean;
  aoConfirmar: () => void;
  aoEditar: () => void;
  aoDescartar: () => void;
}) {
  const app = nomeDoApp(item.pacote);
  if (item.tipo === 'nao_entendi') {
    return (
      <View style={styles.cartao}>
        <Text style={styles.selo}>Não entendi este aviso</Text>
        <Text style={styles.legenda}>{app} · {formatDateLabel(item.data)}</Text>
        <Text style={styles.corpo}>{texto ?? 'O texto deste aviso já foi apagado.'}</Text>
        <View style={styles.botoes}>
          <Botao rotulo="Descartar" onPress={aoDescartar} desligado={ocupado} />
          <Botao rotulo="Preencher" onPress={aoEditar} desligado={ocupado} destaque />
        </View>
      </View>
    );
  }
  const forma = formaDoItem(item, dados.cartoes);
  const cartao = cartaoDoItem(item, dados.cartoes);
  const jaLancado = pareceJaLancado(item, dados.lancamentos);
  const categoria = categoriaDoItem(item, dados.apelidos, dados.extras);
  const entrada = item.direcao === 'in';
  const detalhes = [
    forma ? FORMA_ROTULO[forma] : 'Forma não informada',
    cartao?.name ?? (item.digitos ? `final ${item.digitos}` : null),
    item.parcelas ? `em ${item.parcelas}x` : null,
    categoria?.name ?? 'Sem categoria',
  ].filter(Boolean).join(' · ');
  return (
    <View style={styles.cartao}>
      {jaLancado && <Text style={styles.selo}>Parece já lançado</Text>}
      {entreContas && <Text style={styles.selo}>Entre suas contas?</Text>}
      <Text style={styles.valor}>{entrada ? '+ ' : ''}R$&nbsp;{formatMoney(item.valor ?? 0)}</Text>
      <Text style={styles.corpo}>{item.descricao || 'Sem descrição'}</Text>
      <Text style={styles.legenda}>{detalhes}</Text>
      <Text style={styles.legenda}>{app} · {formatDateLabel(item.data)}</Text>
      <View style={styles.botoes}>
        <Botao rotulo="Descartar" onPress={aoDescartar} desligado={ocupado} destaque={jaLancado} />
        <Botao rotulo="Editar" onPress={aoEditar} desligado={ocupado} />
        <Botao rotulo="Confirmar" onPress={aoConfirmar} desligado={ocupado} destaque={!jaLancado} />
      </View>
    </View>
  );
}

function Botao({ rotulo, onPress, desligado, destaque }: { rotulo: string; onPress: () => void; desligado?: boolean; destaque?: boolean }) {
  return (
    <AppPressable
      style={[styles.botao, destaque && styles.botaoDestaque]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!desligado, busy: !!desligado }}
      disabled={desligado}
      onPress={onPress}
    >
      <Text style={[styles.botaoTexto, destaque && styles.botaoTextoDestaque]}>{rotulo}</Text>
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  faixa: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: theme.paperRaised },
  faixaLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  faixaTexto: { flex: 1, minWidth: 0, color: theme.ink, fontFamily: fonts.regular, fontSize: type.apoio, lineHeight: lh(type.apoio, 'apoio') },
  faixaBotao: { minHeight: touchTarget, flexShrink: 0, justifyContent: 'center', paddingHorizontal: spacing.sm },
  acao: { color: theme.accent2, fontFamily: fonts.regular, fontSize: type.apoio },
  tela: { flex: 1, backgroundColor: theme.paper, paddingHorizontal: spacing.lg },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  titulo: { color: theme.ink, fontFamily: fonts.regular, fontSize: type.titulo },
  recibo: { color: theme.accent2, fontFamily: fonts.regular, fontSize: type.apoio, marginBottom: spacing.sm },
  carregando: { marginTop: spacing.lg },
  lista: { gap: spacing.md, paddingBottom: spacing.lg },
  cartao: { backgroundColor: theme.paperRaised, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.rule, padding: spacing.md, gap: spacing.xs },
  selo: { color: theme.accent2, fontFamily: fonts.regular, fontSize: type.legenda },
  valor: { color: theme.ink, fontFamily: fonts.regular, fontSize: type.titulo },
  corpo: { color: theme.ink, fontFamily: fonts.light, fontSize: type.apoio, lineHeight: lh(type.apoio, 'apoio') },
  legenda: { color: theme.inkFaint, fontFamily: fonts.light, fontSize: type.legenda, lineHeight: lh(type.legenda, 'apoio') },
  botoes: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  botao: { flex: 1, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: theme.rule, paddingHorizontal: spacing.xs },
  botaoDestaque: { backgroundColor: theme.accent2, borderColor: theme.accent2 },
  botaoTexto: { color: theme.ink, fontFamily: fonts.regular, fontSize: type.apoio },
  botaoTextoDestaque: { color: theme.paper },
});
