import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import AppModal from './AppModal';
import AppPressable from './AppPressable';
import Sheet from './Sheet';
import PrivacyValue from './PrivacyValue';
import TransactionSheet, { type ValoresLancamento } from './TransactionSheet';
import { Alert } from '@/lib/alerta';
import { dispensarRecibo, formasAprendidas, listarCaixa, registrarVencimentoVisto, removerItemDaCaixa, sincronizarCaixa } from '@/lib/avisos-banco/caixa';
import { pedidosAgora, publicarPendentes, usePedidoDeConferencia } from '@/lib/avisos-banco/conferencia-aberta';
import { nomeDoApp, PACOTES_INICIAIS } from '@/lib/avisos-banco/catalogo';
import {
  cartaoDoItem,
  categoriaDoItem,
  confirmaEmUmToque,
  descricaoDoItem,
  formaDoItem,
  montarEntrada,
  ofertaDoEstorno,
  pareceEntreContas,
  pareceJaLancado,
  venceHoje,
  type FormasAprendidas,
  type ItemAConferir,
  type ReciboDeEstorno,
} from '@/lib/avisos-banco/decidir';
import {
  concluirLimpeza,
  ContaJaEmPagamento,
  gravarItem,
  itensJaGravados,
  LimpezaPendente,
  pagarContaDoItem,
  PagamentoIncerto,
  removerLancamentoDoEstorno,
} from '@/lib/avisos-banco/gravar';
import type { FormaDoAviso } from '@/lib/avisos-banco/interpretar';
import { lerTela } from '@/lib/cache-de-tela';
import { getCachedTransactions } from '@/lib/offline-cache';
import { useDemo } from '@/lib/demo-context';
import { mensagemErro } from '@/lib/erros';
import { formatDateLabel, formatMoney, formatMoneyInput, parseAmount } from '@/lib/format';
import { categoriaEscolhida, PERGUNTA_CATEGORIA } from '@/lib/heuristics';
import { confirmarExclusaoDeLancamento } from '@/lib/excluir-lancamento';
import { marcarLancamentosAlterados } from '@/lib/lancamentos-alterados';
import { useHaJanelaAberta } from '@/lib/janelas-abertas';
import { semViuva } from '@/lib/sem-viuva';
import { fonts, lh, radius, spacing, theme, touchTarget, type } from '@/lib/theme';
import type { Bill, CreditCard, Transaction, Wallet } from '@/lib/types';
import { CATEGORIES } from '@/lib/types';
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
  semConferenciaDeContas: boolean;
};

const AVISO_PAGAMENTO_INICIADO = 'Confira a conta nos lançamentos antes de descartar este aviso.';

const reciboDaGravacao = ({ guardado, jaEstava }: { guardado: boolean; jaEstava: boolean }) => {
  if (jaEstava) return 'Este aviso já estava salvo. Para corrigir, edite nos lançamentos.';
  return guardado ? 'Sem conexão. Lançamento salvo no aparelho' : 'Lançamento salvo';
};

const FORMA_ROTULO: Record<FormaDoAviso, string> = { credit: 'Crédito', debit: 'Débito', pix: 'Pix', boleto: 'Boleto' };

/** Texto lido pelo leitor de tela quando a janela abre e a cada item resolvido. */
export function textoDaContagem(itens: ItemAConferir[]): string {
  const gastos = itens.every((i) => i.tipo === 'lancamento' && i.direcao === 'out');
  if (itens.length === 1) return gastos ? '1 gasto para conferir' : '1 aviso para conferir';
  return `${itens.length} ${gastos ? 'gastos' : 'avisos'} para conferir`;
}

/** Recibo do descarte automático por estorno (07/11/2026). */
export function textoDoRecibo(r: ReciboDeEstorno): string {
  const loja = r.contraparte ? ` em ${r.contraparte}` : '';
  return `Compra de R$${formatMoney(r.valor)}${loja} foi estornada. Tirei as duas da lista.`;
}

/** Recibos do estorno, sem roubar o foco: o leitor de tela anuncia, e "Ok" tira da lista. */
function RecibosDeEstorno({ recibos, aoDispensar, naInicio = false }: { recibos: ReciboDeEstorno[]; aoDispensar: (id: string) => void; naInicio?: boolean }) {
  if (!recibos.length) return null;
  return (
    <View style={[styles.recibos, naInicio && styles.recibosNaInicio]}>
      {recibos.map((r) => (
        <View key={r.id} style={styles.reciboLinha}>
          <PrivacyValue style={styles.reciboConteudo}>
            <Text style={styles.reciboTexto} accessibilityLiveRegion="polite">{semViuva(textoDoRecibo(r))}</Text>
          </PrivacyValue>
          <AppPressable style={styles.reciboBotao} accessibilityRole="button" accessibilityLabel="Ok, tirar este recibo" onPress={() => aoDispensar(r.id)}>
            <Text style={styles.acao}>Ok</Text>
          </AppPressable>
        </View>
      ))}
    </View>
  );
}

function carteiraPadrao(item: ItemAConferir, dados: DadosDaLista, forma: FormaDoAviso | null): string {
  const cartao = forma === 'credit' ? cartaoDoItem(item, dados.cartoes) : null;
  return cartao?.wallet_id ?? dados.carteiras.find((w) => w.is_default)?.id ?? dados.carteiras[0]?.id ?? '';
}

/**
 * Janela de conferência dos avisos do banco. Abre sozinha no centro da tela
 * sempre que há aviso pendente e nenhuma outra janela, folha ou tutorial está
 * aberta, e só fecha quando todos forem confirmados ou descartados (07/11/2026,
 * pedido do autor: a barra "N gastos para conferir" saiu da Início).
 *
 * Uma vez aberta, fica até o último item: abrir outra janela por cima não a
 * derruba, e a revisão de um item é a folha de lançamento por cima dela.
 */
export default function AvisosAConferir({ dono, nomeDoPerfil, bloqueado = false }: {
  dono: string;
  nomeDoPerfil?: string | null;
  /** Algo que o contador de janelas não vê (ex.: o tutorial) está em primeiro plano. */
  bloqueado?: boolean;
}) {
  const [itens, setItens] = useState<ItemAConferir[]>([]);
  const [recibos, setRecibos] = useState<ReciboDeEstorno[]>([]);
  const [aberta, setAberta] = useState(false);
  /** Leitura das referências falhou e a pessoa escolheu "Agora não": volta quando o app voltar ao primeiro plano. */
  const [adiada, setAdiada] = useState(false);
  const outraJanela = useHaJanelaAberta();
  const pedido = usePedidoDeConferencia();
  const pedidoVisto = useRef(pedidosAgora());

  const carregar = useCallback(async () => {
    if (!avisosDisponivel) return;
    try {
      const { itens: lidos, ilegiveis, recibos: lidosRecibos } = await sincronizarCaixa(dono);
      setItens(lidos);
      publicarPendentes(lidos.length);
      setRecibos(lidosRecibos);
      if (ilegiveis > 0) avisarFalhaDeLeitura(`${ilegiveis} avisos não puderam ser lidos`);
    } catch (e) {
      console.error('[avisos] não leu o diário', e instanceof Error ? e.name : 'erro');
      avisarFalhaDeLeitura('Não consegui ler os avisos do banco', () => void carregar());
    }
  }, [dono]);

  useEffect(() => {
    if (!avisosDisponivel) return;
    try {
      definirDonoAvisos(dono);
      garantirListaInicialAvisos(PACOTES_INICIAIS);
    } catch (e) {
      console.error('[avisos] início do leitor falhou', e instanceof Error ? e.name : 'erro');
      avisarFalhaDeLeitura('Não consegui iniciar o leitor de avisos');
      return;
    }
    void carregar();
    const evento = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') { setAdiada(false); void carregar(); }
    });
    const intervalo = setInterval(() => { if (AppState.currentState === 'active') void carregar(); }, 15000);
    return () => { evento.remove(); clearInterval(intervalo); };
  }, [carregar, dono]);

  /* O atalho do cabeçalho desfaz o "Revisar depois"; a janela abre pela regra de sempre (nunca por cima de outra). */
  useEffect(() => {
    if (pedido === pedidoVisto.current) return;
    pedidoVisto.current = pedido;
    setAdiada(false);
  }, [pedido]);

  useEffect(() => () => publicarPendentes(0), []);

  /* Abre quando há pendência e o caminho está livre; fecha quando acabou. */
  useEffect(() => {
    if (!avisosDisponivel) return;
    if (itens.length === 0) { if (aberta) setAberta(false); return; }
    if (!aberta && !adiada && !outraJanela && !bloqueado) setAberta(true);
  }, [itens.length, aberta, adiada, outraJanela, bloqueado]);

  const dispensar = (id: string) => {
    setRecibos((antes) => antes.filter((r) => r.id !== id));
    dispensarRecibo(dono, id).catch((e) => console.warn('[avisos] recibo não saiu da lista', e instanceof Error ? e.name : 'erro'));
  };
  if (!avisosDisponivel) return null;
  /* Sem pendência, o recibo fica discreto na Início: não abre a janela bloqueante só por ele. */
  if (!aberta || itens.length === 0) return <RecibosDeEstorno recibos={recibos} aoDispensar={dispensar} naInicio />;
  return (
    <ListaAConferir
      dono={dono}
      nomeDoPerfil={nomeDoPerfil}
      recibos={recibos}
      aoDispensarRecibo={dispensar}
      aoAdiar={() => { setAberta(false); setAdiada(true); }}
      aoMudar={(lista) => { setItens(lista); publicarPendentes(lista.length); }}
    />
  );
}

/** Falha de leitura sem barra: um aviso único por mensagem, para não repetir a cada 15 s. */
const falhasJaAvisadas = new Set<string>();
function avisarFalhaDeLeitura(mensagem: string, tentarDeNovo?: () => void) {
  if (falhasJaAvisadas.has(mensagem)) return;
  falhasJaAvisadas.add(mensagem);
  Alert.alert('Avisos do banco', mensagem, [
    { text: 'Fechar', style: 'cancel', onPress: () => { falhasJaAvisadas.delete(mensagem); } },
    ...(tentarDeNovo ? [{ text: 'Tentar de novo', onPress: () => { falhasJaAvisadas.delete(mensagem); tentarDeNovo(); } }] : []),
  ]);
}

function ListaAConferir({ dono, nomeDoPerfil, recibos = [], aoDispensarRecibo = () => {}, aoAdiar, aoMudar }: {
  dono: string;
  nomeDoPerfil?: string | null;
  recibos?: ReciboDeEstorno[];
  aoDispensarRecibo?: (id: string) => void;
  /**
   * Adia a conferência: a janela fecha sem descartar nem confirmar nada e volta
   * quando o app voltar a abrir. Serve ao "Revisar depois" (decisão do autor,
   * 07/11/2026) e à falha de leitura das referências locais.
   */
  aoAdiar: () => void;
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
  /* Já registrados: falta só sair da lista. Não oferecem Confirmar nem Editar. */
  const [jaSalvos, setJaSalvos] = useState<Set<string>>(new Set());
  const [formas, setFormas] = useState<FormasAprendidas>({});
  /* Trava síncrona: o estado só muda no próximo render, e toque duplo cabe nesse intervalo. */
  const emAndamento = useRef(false);
  const concluidos = useRef(new Set<string>());

  const recarregarItens = useCallback(async () => {
    const lista = await listarCaixa(dono);
    const salvos = await itensJaGravados(dono);
    const lembradas = await formasAprendidas(dono);
    setItens(lista);
    if (lista.some((i) => venceHoje(i, Date.now()) && !i.vencimentoVisto)) {
      /* A janela vai mostrar "Vence hoje": só depois disso a validade pode tirar o item. */
      void registrarVencimentoVisto(dono).catch((e) => console.warn('[avisos] vencimento visto não gravou', e instanceof Error ? e.name : 'erro'));
    }
    setJaSalvos(salvos);
    setFormas(lembradas);
    aoMudar(lista);
    return lista;
  }, [aoMudar, dono]);

  const carregarTudo = useCallback(async () => {
    setFalha(null);
    try {
      await recarregarItens();
      const diario = await lerDiarioAvisos();
      setTextos(Object.fromEntries(diario.itens.map((a) => [a.id, [a.titulo, a.texto].filter(Boolean).join('\n')])));
      // T2: abrir e editar só leem o aparelho. A rede fica na confirmação.
      const [carteiras, cartoes, categorias, apelidos, contasAbertas, lancamentos] = await Promise.all([
        lerTela<Wallet[]>('carteiras'),
        lerTela<CreditCard[]>('cartoes'),
        lerTela<{ name: string; color: string; is_default: boolean }[]>('categorias'),
        lerTela<{ chave: string; valor: string }[]>('apelidos-categoria'),
        lerTela<Bill[]>('boletos:todos').then(async (r) => r ?? await lerTela<Bill[]>('boletos:due')),
        getCachedTransactions(),
      ]);
      setDados({
        carteiras: (carteiras?.dados ?? []).filter((c) => c.id !== 'total'),
        cartoes: cartoes?.dados ?? [],
        extras: (categorias?.dados ?? []).filter((c) => !c.is_default).map((c) => ({ name: c.name, color: c.color })),
        apelidos: apelidos?.dados ?? null,
        contasAbertas: (contasAbertas?.dados ?? []).filter((c) => c.status === 'due'),
        lancamentos: lancamentos ?? [],
        semConferenciaDeDuplicata: lancamentos === null,
        semConferenciaDeContas: contasAbertas === null,
      });
    } catch (e) {
      console.error('[avisos] referências locais não foram lidas', e instanceof Error ? e.name : 'erro');
      setFalha(mensagemErro(e));
    }
  }, [recarregarItens]);

  useEffect(() => { void carregarTudo(); }, [carregarTudo]);

  async function descartar(item: ItemAConferir) {
    if (emAndamento.current || concluidos.current.has(item.id)) return;
    emAndamento.current = true;
    setOcupado(item.id);
    const salvo = jaSalvos.has(item.id);
    try {
      await (salvo ? concluirLimpeza(dono, item.id) : removerItemDaCaixa(dono, item.id));
      concluidos.current.add(item.id);
      setRecibo(salvo ? 'Aviso tirado da lista' : 'Aviso descartado');
      await recarregarItens();
    } catch (e) {
      console.error('[avisos] descarte falhou', e instanceof Error ? e.name : 'erro');
      setRecibo(salvo ? 'Não consegui tirar da lista. Tente de novo.' : `Não consegui descartar: ${mensagemErro(e)}`);
    } finally {
      emAndamento.current = false;
      setOcupado(null);
    }
  }

  async function executar(item: ItemAConferir, tarefa: () => Promise<string>): Promise<boolean> {
    if (emAndamento.current || concluidos.current.has(item.id)) return false;
    if (isDemoMode) {
      Alert.alert('Modo de exemplo ativo', 'Desative "Dados de exemplo" no Perfil para salvar este aviso na sua conta.');
      return false;
    }
    emAndamento.current = true;
    setOcupado(item.id);
    try {
      setRecibo(await tarefa());
      concluidos.current.add(item.id);
      await recarregarItens();
      return true;
    } catch (e) {
      console.error('[avisos] confirmação falhou', e instanceof Error ? e.name : 'erro');
      if (e instanceof LimpezaPendente) {
        marcarLancamentosAlterados();
        setJaSalvos((antes) => new Set(antes).add(item.id));
        setRevisao(null);
        Alert.alert(
          e.oQue === 'conta' ? 'Conta marcada como paga' : 'Lançamento salvo',
          'Só não consegui tirar o aviso da lista. Ele não será lançado de novo.'
        );
      } else if (e instanceof ContaJaEmPagamento) {
        setRevisao(null);
        Alert.alert('Pagamento já iniciado', AVISO_PAGAMENTO_INICIADO);
      } else if (e instanceof PagamentoIncerto) {
        Alert.alert('Não consegui confirmar o pagamento', 'Ele pode ter chegado. Confira a conta antes de descartar este aviso.');
      } else {
        Alert.alert('Não consegui salvar', mensagemErro(e));
      }
      /* A lista em tela ficou para trás: quem decide a próxima oferta é o disco. */
      await recarregarItens().catch((erroDaLista) => {
        console.error('[avisos] lista não recarregou', erroDaLista instanceof Error ? erroDaLista.name : 'erro');
      });
      return false;
    } finally {
      emAndamento.current = false;
      setOcupado(null);
    }
  }

  /** Só com o toque: a mesma pergunta de exclusão das outras telas, depois apaga e tira o estorno da lista. */
  function removerDoEstorno(item: ItemAConferir, lancamento: Transaction) {
    confirmarExclusaoDeLancamento(lancamento, {
      apagarEste: () => void executar(item, async () => {
        await removerLancamentoDoEstorno(dono, item, lancamento.id);
        marcarLancamentosAlterados();
        return 'Lançamento removido';
      }),
    });
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
      const resultado = await gravarItem(dono, item, entrada);
      marcarLancamentosAlterados();
      return reciboDaGravacao(resultado);
    });
  }

  /** Boleto: paga a conta casada ou vira saída. Nunca os dois. */
  function abrirBoleto(item: ItemAConferir, d: DadosDaLista) {
    if (item.contaEmPagamento) {
      Alert.alert('Pagamento já iniciado', AVISO_PAGAMENTO_INICIADO);
      return;
    }
    if (d.semConferenciaDeContas) {
      Alert.alert('Preciso conferir as contas', 'Abra as contas a pagar na Início e volte aqui para conferir este boleto.');
      return;
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
          marcarLancamentosAlterados();
          return 'Conta marcada como paga';
        }),
      },
    ]);
  }

  function perguntarForma(item: ItemAConferir) {
    Alert.alert('Como foi pago?', 'O aviso não diz a forma de pagamento.', [
      { text: 'Crédito', onPress: () => setRevisao({ item, forma: 'credit' }) },
      ...(!item.parcelas ? [
        { text: 'Débito', onPress: () => setRevisao({ item, forma: 'debit' as const }) },
        { text: 'Pix', onPress: () => setRevisao({ item, forma: 'pix' as const }) },
      ] : []),
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  function abrirRevisao(item: ItemAConferir, d: DadosDaLista) {
    if (item.contaEmPagamento) { abrirBoleto(item, d); return; }
    const forma = formaDoItem(item, d.cartoes, formas);
    if (forma === 'boleto') abrirBoleto(item, d);
    else if (!forma) perguntarForma(item);
    else setRevisao({ item, forma });
  }

  function confirmar(item: ItemAConferir, d: DadosDaLista) {
    const forma = formaDoItem(item, d.cartoes, formas);
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
      const resultado = await gravarItem(dono, item, entrada);
      marcarLancamentosAlterados();
      return reciboDaGravacao(resultado);
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

  return <>
    {/* Bloqueante: tocar fora e o Voltar do Android não fazem nada. Só fecha quando o último item é resolvido. */}
    <AppModal visible={!revisao} transparent semRegistro onRequestClose={() => {}}>
      <Sheet centered onClose={() => {}}>
        <View style={styles.cabecalho}>
          <Text style={styles.titulo} accessibilityRole="header">A conferir</Text>
        </View>
        <Text style={styles.legenda} accessibilityLiveRegion="polite">{textoDaContagem(itens)}</Text>
        {recibo && <Text style={styles.recibo} accessibilityLiveRegion="polite">{recibo}</Text>}
        <RecibosDeEstorno recibos={recibos} aoDispensar={aoDispensarRecibo} />
        {falha && (
          <View style={styles.cartao}>
            <Text style={styles.corpo}>{falha}</Text>
            <View style={styles.botoes}>
              <Botao rotulo="Agora não" onPress={aoAdiar} desligado={false} />
              <Botao rotulo="Tentar de novo" onPress={() => void carregarTudo()} desligado={false} destaque />
            </View>
          </View>
        )}
        {!dados && !falha && <ActivityIndicator color={theme.ink} style={styles.carregando} />}
        {dados && !dados.carteiras.length && <Text style={styles.corpo}>{semViuva('Abra a Início para carregar suas carteiras antes de confirmar.')}</Text>}
        <View style={styles.lista}>
          {dados && itens.map((item) => (
            <CartaoDoAviso
              key={item.id}
              item={item}
              jaSalvo={jaSalvos.has(item.id)}
              dados={dados}
              formas={formas}
              texto={textos[item.avisoIds[0]]}
              entreContas={pareceEntreContas(item, nomeDoPerfil)}
              ocupado={ocupado !== null}
              aoConfirmar={() => confirmar(item, dados)}
              aoEditar={() => abrirRevisao(item, dados)}
              aoDescartar={() => void descartar(item)}
              aoRemoverLancamento={(t) => removerDoEstorno(item, t)}
            />
          ))}
        </View>
        {/* Discreto, abaixo da lista: adia sem resolver nada. Tocar fora e o Voltar continuam sem fechar. */}
        {!falha && (
          <AppPressable
            style={styles.revisarDepois}
            accessibilityRole="button"
            accessibilityHint="Fecha sem descartar nem salvar. A janela volta quando você abrir o app de novo."
            disabled={ocupado !== null}
            onPress={aoAdiar}
          >
            <Text style={styles.acao}>Revisar depois</Text>
          </AppPressable>
        )}
      </Sheet>
    </AppModal>
    {revisao && dados && (
      <TransactionSheet
        visible
        onClose={() => { if (!ocupado) setRevisao(null); }}
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
        categoriasLocais={[
          ...CATEGORIES.map((c) => ({ ...c, is_default: true })),
          ...dados.extras.filter((c) => !CATEGORIES.some((padrao) => padrao.name === c.name)),
        ]}
        avisoDeOrigem={<View style={styles.cartao}>
          <Text style={styles.corpo}>{textos[revisao.item.avisoIds[0]] ?? 'Texto do aviso indisponível.'}</Text>
          {pareceJaLancado(revisao.item, dados.lancamentos) && <Text style={styles.selo}>{semViuva('Parece já lançado. Confira antes de salvar.')}</Text>}
          {dados.semConferenciaDeDuplicata && <Text style={styles.corpo}>{semViuva('Histórico indisponível neste aparelho. Confira se já lançou este gasto.')}</Text>}
          {pareceEntreContas(revisao.item, nomeDoPerfil) && <Text style={styles.corpo}>{semViuva('Pode ser dinheiro entre suas contas. Descarte se só mudou de lugar.')}</Text>}
        </View>}
      />
    )}
  </>;
}

/** Frase do estorno quando não há um lançamento certo para desfazer. Só "Entendi", que tira da lista. */
const EXPLICACAO_DO_ESTORNO = {
  varios: 'Achei mais de um lançamento igual. Se precisar, apague o certo em Lançamentos.',
  nenhum: 'Não achei um lançamento igual para desfazer. Nada foi gravado.',
  sem_valor: 'Não consegui ler o valor deste estorno. Nada foi gravado.',
  sem_historico: 'Histórico indisponível neste aparelho. Confira em Lançamentos se precisa apagar algo.',
} as const;

function CartaoDoEstorno({ item, dados, ocupado, aoDescartar, aoRemoverLancamento }: {
  item: ItemAConferir;
  dados: DadosDaLista;
  ocupado: boolean;
  aoDescartar: () => void;
  aoRemoverLancamento: (t: Transaction) => void;
}) {
  const oferta = ofertaDoEstorno(item, dados.semConferenciaDeDuplicata ? null : dados.lancamentos, dados.cartoes);
  const loja = item.contraparte ? ` em ${item.contraparte}` : '';
  const titulo = item.valor !== undefined ? `Estorno de R$${formatMoney(item.valor)}${loja}` : `Estorno${loja}`;
  return (
    <View style={styles.cartao}>
      <Text style={styles.selo}>Dinheiro que voltou</Text>
      <PrivacyValue><Text style={styles.corpo}>{titulo}</Text></PrivacyValue>
      <Text style={styles.legenda}>{nomeDoApp(item.pacote)} · {formatDateLabel(item.data)}</Text>
      {oferta.tipo === 'remover' ? (
        <>
          <PrivacyValue><Text style={styles.corpo}>{semViuva(`Este estorno parece desfazer o lançamento de ${formatDateLabel(oferta.lancamento.occurred_on)}, R$${formatMoney(Number(oferta.lancamento.amount))}, ${oferta.lancamento.description || 'sem descrição'}.`)}</Text></PrivacyValue>
          <View style={styles.botoes}>
            <Botao rotulo="Manter lançamento" onPress={aoDescartar} desligado={ocupado} />
            <Botao rotulo="Remover lançamento" onPress={() => aoRemoverLancamento(oferta.lancamento)} desligado={ocupado} destaque />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.corpo}>{semViuva(EXPLICACAO_DO_ESTORNO[oferta.tipo])}</Text>
          <View style={styles.botoes}>
            <Botao rotulo="Entendi" onPress={aoDescartar} desligado={ocupado} destaque />
          </View>
        </>
      )}
    </View>
  );
}

function CartaoDoAviso({ item, jaSalvo, dados, formas, texto, entreContas, ocupado, aoConfirmar, aoEditar, aoDescartar, aoRemoverLancamento }: {
  item: ItemAConferir;
  jaSalvo: boolean;
  dados: DadosDaLista;
  formas: FormasAprendidas;
  texto?: string;
  entreContas: boolean;
  ocupado: boolean;
  aoConfirmar: () => void;
  aoEditar: () => void;
  aoDescartar: () => void;
  aoRemoverLancamento: (t: Transaction) => void;
}) {
  const app = nomeDoApp(item.pacote);
  const vence = venceHoje(item, Date.now()) ? <Text style={styles.selo}>Vence hoje</Text> : null;
  /* Estorno nunca oferece Confirmar nem Editar: nada disso funciona para ele. */
  if (item.tipo === 'estorno') {
    return <CartaoDoEstorno item={item} dados={dados} ocupado={ocupado} aoDescartar={aoDescartar} aoRemoverLancamento={aoRemoverLancamento} />;
  }
  if (jaSalvo) {
    return (
      <View style={styles.cartao}>
        {vence}
        <Text style={styles.selo}>Já salvo</Text>
        <Text style={styles.corpo}>{item.descricao || 'Sem descrição'}</Text>
        <Text style={styles.legenda}>{semViuva('Para corrigir o valor, edite nos lançamentos.')}</Text>
        <View style={styles.botoes}>
          <Botao rotulo="Tirar da lista" onPress={aoDescartar} desligado={ocupado} destaque />
        </View>
      </View>
    );
  }
  if (item.tipo === 'nao_entendi') {
    return (
      <View style={styles.cartao}>
        {vence}
        <Text style={styles.selo}>Não entendi este aviso</Text>
        <Text style={styles.legenda}>{app} · {formatDateLabel(item.data)}</Text>
        <Text style={styles.corpo}>{texto ?? semViuva('O texto deste aviso já foi apagado.')}</Text>
        <View style={styles.botoes}>
          <Botao rotulo="Descartar" onPress={aoDescartar} desligado={ocupado} />
          <Botao rotulo="Preencher" onPress={aoEditar} desligado={ocupado} destaque />
        </View>
      </View>
    );
  }
  const forma = formaDoItem(item, dados.cartoes, formas);
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
      {vence}
      {jaLancado && <Text style={styles.selo}>Parece já lançado</Text>}
      {entreContas && <Text style={styles.selo}>Entre suas contas?</Text>}
      <PrivacyValue><Text style={styles.valor}>{entrada ? '+ ' : ''}R${formatMoney(item.valor ?? 0)}</Text></PrivacyValue>
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
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  titulo: { color: theme.ink, fontFamily: fonts.regular, fontSize: type.titulo },
  recibo: { color: theme.accent2, fontFamily: fonts.regular, fontSize: type.apoio, marginBottom: spacing.sm },
  recibos: { gap: spacing.xs, marginBottom: spacing.sm },
  recibosNaInicio: { paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: 0 },
  reciboLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reciboConteudo: { flex: 1, minWidth: 0 },
  reciboTexto: { color: theme.inkFaint, fontFamily: fonts.light, fontSize: type.legenda, lineHeight: lh(type.legenda, 'apoio') },
  reciboBotao: { minHeight: touchTarget, minWidth: touchTarget, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  acao: { color: theme.accent2, fontFamily: fonts.regular, fontSize: type.apoio },
  revisarDepois: { minHeight: touchTarget, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, marginTop: spacing.sm },
  carregando: { marginTop: spacing.lg },
  lista: { gap: spacing.md },
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
