import { categoriaReconhecida, decidirCategoria, semNomeDaCategoria } from '../heuristics';
import type { CreditCard, TxType } from '../types';
import { APPS_INICIAIS, classeDoApp, type ClasseDoApp } from './catalogo';
import { interpretarAviso, type AvisoParaInterpretar, type FormaDoAviso } from './interpretar';

/**
 * A parte que evita dinheiro duplicado. Tudo aqui é puro: recebe o estado e
 * devolve o próximo, sem rede e sem disco.
 */
export const JANELA_DE_DUPLICATA_MS = 5 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
const VALIDADE_DO_ITEM_MS = 30 * DIA_MS;
/** O texto do "Não entendi" mora no diário, que guarda 7 dias. */
const VALIDADE_DO_NAO_ENTENDI_MS = 7 * DIA_MS;
const VALIDADE_DO_VISTO_MS = 8 * DIA_MS;
/** Estorno só descarta compra avisada até 7 dias antes dele (pedido do autor, 07/11/2026). */
export const JANELA_DO_ESTORNO_MS = 7 * DIA_MS;
/** O recibo do descarte automático fica disponível por 7 dias. */
const VALIDADE_DO_RECIBO_MS = 7 * DIA_MS;

export type ItemAConferir = {
  id: string;
  avisoIds: string[];
  pacote: string;
  classe: ClasseDoApp;
  quando: number;
  expiraEm: number;
  /**
   * `estorno`: dinheiro que voltou e não achou compra pendente para descartar
   * sozinho. Nunca grava saída (`gravarItem` recusa); a tela pergunta se a pessoa
   * quer remover o lançamento correspondente, e só remove com o toque dela.
   */
  tipo: 'lancamento' | 'nao_entendi' | 'estorno';
  data: string;
  direcao?: TxType;
  forma?: FormaDoAviso | null;
  /** Os avisos da mesma compra discordaram: só a pessoa responde. */
  formaEmDisputa?: boolean;
  valor?: number;
  parcelas?: number | null;
  contraparte?: string | null;
  descricao?: string | null;
  digitos?: string | null;
  /** Conta aberta cujo pagamento já foi pedido: impede pagar e lançar. */
  contaEmPagamento?: string;
  /**
   * A janela já mostrou este item com a marca "Vence hoje". Só depois disso a
   * validade pode tirá-lo da lista: nada some sem a pessoa ver (07/11/2026).
   */
  vencimentoVisto?: boolean;
};

/** Último dia da validade (ou já passou dela): a janela mostra "Vence hoje". */
export function venceHoje(item: Pick<ItemAConferir, 'expiraEm' | 'tipo'>, agora: number): boolean {
  return item.tipo !== 'estorno' && agora >= item.expiraEm - DIA_MS;
}

/** Item vencido só sai se a pessoa já o viu marcado; senão fica até ser visto. */
const aindaValeOuNaoFoiVisto = (i: ItemAConferir, agora: number) => i.expiraEm > agora || (i.tipo !== 'estorno' && !i.vencimentoVisto);

/** Marca como visto o vencimento dos itens que a janela mostrou no último dia. */
export function marcarVencimentoVisto(estado: EstadoDaCaixa, agora: number): EstadoDaCaixa {
  if (!estado.itens.some((i) => venceHoje(i, agora) && !i.vencimentoVisto)) return estado;
  return { ...estado, itens: estado.itens.map((i) => (venceHoje(i, agora) && !i.vencimentoVisto ? { ...i, vencimentoVisto: true } : i)) };
}

/** O que sobra de um aviso já processado. Sem título nem texto. */
export type AvisoVisto = {
  quando: number;
  pacote: string;
  chave: string;
  classe: ClasseDoApp;
  valor?: number;
  itemId?: string;
  /** Aviso de estorno: o mesmo estorno avisado de novo não abre outro item. */
  estorno?: boolean;
  /** Identidade resumida; registros antigos sem ela não provam duplicidade. */
  direcao?: TxType;
  contraparte?: string | null;
  digitos?: string | null;
};

/**
 * Recibo do descarte automático: compra pendente e estorno que se anularam.
 * Sem título nem texto do aviso, só o que a tela precisa para dizer o que saiu.
 */
export type ReciboDeEstorno = {
  id: string;
  quando: number;
  expiraEm: number;
  valor: number;
  contraparte: string | null;
  dataDaCompra: string;
  dataDoEstorno: string;
};

/** `recibos` é opcional: caixa gravada antes de 07/11/2026 não tem o campo. */
export type EstadoDaCaixa = { itens: ItemAConferir[]; vistos: Record<string, AvisoVisto>; recibos?: ReciboDeEstorno[] };

export const CAIXA_VAZIA: EstadoDaCaixa = { itens: [], vistos: {} };

export type AvisoDoDiarioParaCaixa = AvisoParaInterpretar & { id: string; chave: string };

const semCaixa = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mesmoNome = (a: string, b: string) => semCaixa(a) === semCaixa(b);
const emMaiusculas = (s: string) => s === s.toUpperCase();

function melhorDescricao(a?: string | null, b?: string | null): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  if (mesmoNome(a, b)) {
    if (emMaiusculas(a) && !emMaiusculas(b)) return b;
    if (emMaiusculas(b) && !emMaiusculas(a)) return a;
  }
  return b.length > a.length ? b : a;
}

/** Palavras da loja depois de normalizar: sem `DL *`, sem asterisco, sem acento e sem caixa. */
function palavrasDoComerciante(nome: string): string[] {
  return semCaixa(nome).replace(/^\s*dl\b\s*\*?/, '').split(/[^a-z0-9]+/).filter(Boolean);
}

export function chaveDoComerciante(nome: string): string {
  return palavrasDoComerciante(nome).join('');
}

/* O que o banco cola depois do nome da loja: país, estado e cidade. Só estes contam. */
const PAISES = new Set(['bra', 'br', 'brasil', 'brazil']);
const UFS = new Set(['ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'sp', 'se', 'to']);
const CIDADES = new Set([
  'sao paulo', 'rio de janeiro', 'belo horizonte', 'brasilia', 'salvador', 'fortaleza', 'curitiba', 'manaus', 'recife',
  'porto alegre', 'belem', 'goiania', 'guarulhos', 'campinas', 'sao luis', 'maceio', 'natal', 'teresina', 'joao pessoa',
  'florianopolis', 'vitoria', 'cuiaba', 'campo grande', 'aracaju', 'osasco', 'santo andre', 'sao bernardo do campo',
  'niteroi', 'santos', 'ribeirao preto', 'sorocaba', 'uberlandia', 'contagem', 'londrina', 'joinville', 'barueri',
]);

/** O resto do nome mais longo é só localização: cidade conhecida, estado ou país. */
function pareceLocalizacao(resto: string[]): boolean {
  const semSufixo = [...resto];
  while (semSufixo.length && (PAISES.has(semSufixo[semSufixo.length - 1]) || UFS.has(semSufixo[semSufixo.length - 1]))) semSufixo.pop();
  return semSufixo.length === 0 || CIDADES.has(semSufixo.join(' '));
}

/**
 * Loja equivalente, no sentido forte (achado do Watchtower, 07/11/2026): nome
 * igual depois de normalizar, ou o mais curto (6+ letras) seguido só de
 * localização ("DL *UberRides" e "DL *UberRides Sao Paulo BRA"). "Uber" e
 * "UberEats" não casam. Na dúvida, não casa, e a pessoa decide.
 */
export function mesmoComerciante(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const x = palavrasDoComerciante(a);
  const y = palavrasDoComerciante(b);
  if (!x.length || !y.length) return false;
  if (x.join('') === y.join('')) return x.join('').length >= 3;
  const [curto, longo] = x.length <= y.length ? [x, y] : [y, x];
  if (curto.join('').length < 6 || curto.length >= longo.length) return false;
  if (!curto.every((p, i) => longo[i] === p)) return false;
  return pareceLocalizacao(longo.slice(curto.length));
}

const centavos = (valor: number) => Math.round(valor * 100);

type EstornoLido = { valor: number | null; contraparte: string | null; digitos: string | null; data: string };

type IdentidadeDoMovimento = Pick<AvisoVisto, 'valor' | 'direcao' | 'contraparte' | 'digitos' | 'estorno'>;

function mesmaIdentidade(a: IdentidadeDoMovimento, b: IdentidadeDoMovimento): boolean {
  return a.valor !== undefined && b.valor !== undefined && centavos(a.valor) === centavos(b.valor)
    && !!a.estorno === !!b.estorno && !!a.direcao && a.direcao === b.direcao
    && !(a.digitos && b.digitos && a.digitos !== b.digitos)
    && mesmoComerciante(a.contraparte, b.contraparte);
}

function atualizacaoForte(v: AvisoVisto, aviso: AvisoDoDiarioParaCaixa, identidade: IdentidadeDoMovimento): boolean {
  return v.pacote === aviso.pacote && v.chave === aviso.chave
    && Math.abs(v.quando - aviso.quando) <= JANELA_DE_DUPLICATA_MS && mesmaIdentidade(v, identidade);
}

function pacotesDoGrupo(itemId: string, vistos: Record<string, AvisoVisto>): Set<string> {
  return new Set(Object.values(vistos).filter((v) => v.itemId === itemId).map((v) => v.pacote));
}

/** Banco/carteira só se unem por loja e final fortes, sem ponte entre bancos. */
function parForte(vistos: Record<string, AvisoVisto>, aviso: AvisoDoDiarioParaCaixa, identidade: IdentidadeDoMovimento): AvisoVisto | undefined {
  const candidatos = Object.values(vistos).filter((v) => {
    if (!v.itemId || v.classe === classeDoApp(aviso.pacote) || !mesmaIdentidade(v, identidade)) return false;
    if (!v.digitos || !identidade.digitos || v.digitos !== identidade.digitos) return false;
    if (Math.abs(v.quando - aviso.quando) > JANELA_DE_DUPLICATA_MS) return false;
    const grupo = Object.values(vistos).filter((outro) => outro.itemId === v.itemId);
    // Uma nova chave do mesmo app pode ser outra operação real.
    if (grupo.some((outro) => outro.pacote === aviso.pacote && outro.chave !== aviso.chave)) return false;
    const bancos = new Set([...pacotesDoGrupo(v.itemId, vistos), aviso.pacote].filter((p) => classeDoApp(p) === 'banco'));
    return bancos.size === 1;
  });
  return new Set(candidatos.map((v) => v.itemId)).size === 1 ? candidatos[0] : undefined;
}

/**
 * Compra pendente que este estorno anula: mesmo app de banco, mesmo valor em
 * centavos, mesmo final quando os dois trazem, mesma loja (forte), até 7 dias antes.
 */
function compraPendenteDoEstorno(
  item: ItemAConferir, estorno: EstornoLido, aviso: { pacote: string; quando: number }, vistos: Record<string, AvisoVisto>, jaGravados: ReadonlySet<string>,
): boolean {
  if (item.tipo !== 'lancamento' || item.direcao !== 'out' || item.valor === undefined || estorno.valor === null) return false;
  if (jaGravados.has(item.id) || item.contaEmPagamento || item.formaEmDisputa) return false;
  const pacotes = new Set([item.pacote, ...pacotesDoGrupo(item.id, vistos), ...item.avisoIds.map((id) => vistos[id]?.pacote).filter((p): p is string => !!p)]);
  const bancos = [...pacotes].filter((p) => classeDoApp(p) === 'banco');
  if (bancos.length !== 1 || bancos[0] !== aviso.pacote) return false;
  const quando = aviso.quando;
  if (centavos(item.valor) !== centavos(estorno.valor)) return false;
  if (item.quando > quando || quando - item.quando > JANELA_DO_ESTORNO_MS) return false;
  if (item.digitos && estorno.digitos && item.digitos !== estorno.digitos) return false;
  return mesmoComerciante(item.contraparte ?? item.descricao, estorno.contraparte);
}

function formaDoPar(item: ItemAConferir, outra: FormaDoAviso | null): Pick<ItemAConferir, 'forma' | 'formaEmDisputa'> {
  if (item.formaEmDisputa || (item.forma && outra && item.forma !== outra)) return { forma: null, formaEmDisputa: true };
  return { forma: item.forma ?? outra };
}

type ComVisto = (extra?: Partial<AvisoVisto>, itens?: ItemAConferir[], recibos?: ReciboDeEstorno[]) => EstadoDaCaixa;

/**
 * Estorno nunca vira saída. Uma única compra pendente correspondente: as duas
 * saem da lista e fica um recibo. Já confirmada, mais de uma candidata, valor
 * diferente (estorno parcial) ou nenhuma: vira item de estorno, e nada é
 * descartado sozinho.
 */
function acrescentarEstorno(
  estado: EstadoDaCaixa,
  aviso: AvisoDoDiarioParaCaixa,
  estorno: EstornoLido,
  comVisto: ComVisto,
  jaGravados: ReadonlySet<string>,
): EstadoDaCaixa {
  const valor = estorno.valor ?? undefined;
  const identidade: IdentidadeDoMovimento = { valor, direcao: 'out', contraparte: estorno.contraparte, digitos: estorno.digitos, estorno: true };
  const repetido = Object.values(estado.vistos).find((v) => atualizacaoForte(v, aviso, identidade))
    ?? parForte(estado.vistos, aviso, identidade);
  if (repetido) return comVisto({ estorno: true, valor, itemId: repetido.itemId });

  const candidatas = estado.itens.filter((i) => compraPendenteDoEstorno(i, estorno, aviso, estado.vistos, jaGravados));
  if (candidatas.length === 1 && valor !== undefined) {
    const compra = candidatas[0];
    const recibo: ReciboDeEstorno = {
      id: aviso.id,
      quando: aviso.quando,
      expiraEm: aviso.quando + VALIDADE_DO_RECIBO_MS,
      valor,
      contraparte: compra.descricao ?? compra.contraparte ?? estorno.contraparte,
      dataDaCompra: compra.data,
      dataDoEstorno: estorno.data,
    };
    return comVisto({ estorno: true, valor, itemId: aviso.id }, estado.itens.filter((i) => i.id !== compra.id), [...(estado.recibos ?? []), recibo]);
  }

  const item: ItemAConferir = {
    id: aviso.id,
    avisoIds: [aviso.id],
    pacote: aviso.pacote,
    classe: classeDoApp(aviso.pacote),
    quando: aviso.quando,
    expiraEm: aviso.quando + VALIDADE_DO_ITEM_MS,
    tipo: 'estorno',
    data: estorno.data,
    valor,
    contraparte: estorno.contraparte,
    descricao: estorno.contraparte,
    digitos: estorno.digitos,
  };
  return comVisto({ estorno: true, valor, itemId: item.id }, [...estado.itens, item]);
}

function acrescentarAviso(estado: EstadoDaCaixa, aviso: AvisoDoDiarioParaCaixa, jaGravados: ReadonlySet<string>): EstadoDaCaixa {
  const classe = classeDoApp(aviso.pacote);
  const visto: AvisoVisto = { quando: aviso.quando, pacote: aviso.pacote, chave: aviso.chave, classe };
  const entendido = interpretarAviso(aviso);
  if (entendido.tipo === 'lancamento' || entendido.tipo === 'estorno') {
    visto.direcao = entendido.tipo === 'estorno' ? 'out' : entendido.direcao;
    visto.contraparte = entendido.contraparte;
    visto.digitos = entendido.digitos;
  }
  const comVisto: ComVisto = (extra = {}, itens = estado.itens, recibos = estado.recibos) => ({
    itens,
    vistos: { ...estado.vistos, [aviso.id]: { ...visto, ...extra } },
    ...(recibos ? { recibos } : {}),
  });

  if (entendido.tipo === 'ignorar' || entendido.tipo === 'fatura_paga') return comVisto();
  if (entendido.tipo === 'estorno') return acrescentarEstorno(estado, aviso, entendido, comVisto, jaGravados);

  const base = { id: aviso.id, avisoIds: [aviso.id], pacote: aviso.pacote, classe, quando: aviso.quando };
  if (entendido.tipo === 'nao_entendi') {
    const item: ItemAConferir = { ...base, tipo: 'nao_entendi', data: entendido.data, expiraEm: aviso.quando + VALIDADE_DO_NAO_ENTENDI_MS };
    return comVisto({ itemId: item.id }, [...estado.itens, item]);
  }

  const vistos = Object.values(estado.vistos);
  /* O banco atualizou o mesmo aviso com outro texto e o mesmo valor. */
  const identidade: IdentidadeDoMovimento = { valor: entendido.valor, direcao: entendido.direcao, contraparte: entendido.contraparte, digitos: entendido.digitos };
  const atualizacao = vistos.find((v) => atualizacaoForte(v, aviso, identidade));
  if (atualizacao) return comVisto({ valor: entendido.valor, itemId: atualizacao.itemId });

  /* Mesma compra avisada pelo banco e pela carteira. Se o par já foi confirmado
     ou descartado, este aviso não abre um item novo. */
  const par = parForte(estado.vistos, aviso, identidade);
  if (par) {
    const itens = estado.itens.map((i) => (i.id !== par.itemId ? i : {
      ...i,
      avisoIds: [...i.avisoIds, aviso.id],
      ...formaDoPar(i, entendido.forma),
      digitos: i.digitos ?? entendido.digitos,
      descricao: melhorDescricao(i.descricao, entendido.descricao),
      contraparte: melhorDescricao(i.contraparte, entendido.contraparte),
    }));
    return comVisto({ valor: entendido.valor, itemId: par.itemId }, itens);
  }

  const item: ItemAConferir = {
    ...base,
    tipo: 'lancamento',
    expiraEm: aviso.quando + VALIDADE_DO_ITEM_MS,
    data: entendido.data,
    direcao: entendido.direcao,
    forma: entendido.forma,
    valor: entendido.valor,
    parcelas: entendido.parcelas,
    contraparte: entendido.contraparte,
    descricao: entendido.descricao,
    digitos: entendido.digitos,
  };
  return comVisto({ valor: entendido.valor, itemId: item.id }, [...estado.itens, item]);
}

/**
 * Item pendente cujos avisos, relidos com o dicionário atual, são todos compra
 * recusada: sai da lista. Só alcança o que ainda está no diário (7 dias); o que
 * já foi gravado não é tocado.
 */
function semRecusasAntigas(itens: ItemAConferir[], avisos: AvisoDoDiarioParaCaixa[], jaGravados: ReadonlySet<string>): ItemAConferir[] {
  const porId = new Map(avisos.map((a) => [a.id, a]));
  return itens.filter((item) => {
    if (item.tipo === 'estorno' || jaGravados.has(item.id) || item.contaEmPagamento) return true;
    const textos = item.avisoIds.map((id) => porId.get(id)).filter((a): a is AvisoDoDiarioParaCaixa => !!a);
    if (!textos.length) return true;
    return !textos.every((a) => {
      const relido = interpretarAviso(a);
      return relido.tipo === 'ignorar' && relido.motivo === 'recusada';
    });
  });
}

/**
 * Processa o que ainda não foi visto, do aviso mais antigo para o mais novo.
 * `jaGravados` são os itens já registrados que só faltam sair da lista: contam
 * como lançamento confirmado, e o estorno deles nunca é descartado sozinho.
 */
export function aplicarAvisos(
  estado: EstadoDaCaixa,
  avisos: AvisoDoDiarioParaCaixa[],
  agora: number,
  jaGravados: ReadonlySet<string> = new Set(),
): EstadoDaCaixa {
  const novos = avisos.filter((a) => !estado.vistos[a.id]).sort((a, b) => a.quando - b.quando);
  const proximo = novos.reduce((e, a) => acrescentarAviso(e, a, jaGravados), estado);
  const recibos = (proximo.recibos ?? []).filter((r) => r.expiraEm > agora);
  return {
    itens: semRecusasAntigas(proximo.itens, avisos, jaGravados).filter((i) => aindaValeOuNaoFoiVisto(i, agora)),
    vistos: Object.fromEntries(Object.entries(proximo.vistos).filter(([, v]) => v.quando + VALIDADE_DO_VISTO_MS > agora)),
    ...(recibos.length ? { recibos } : {}),
  };
}

type LancamentoParaEstorno = {
  id: string; type: TxType; amount: number; occurred_on: string; description?: string | null; card_id?: string | null;
  installment_total?: number | null; recurring?: boolean | null; bank?: string | null;
};

/**
 * Lançamentos já confirmados que este estorno pode anular, para a tela perguntar.
 * Mesmo valor em centavos, saída, até 7 dias antes, loja equivalente e, quando o
 * lançamento é de um cartão conhecido, o mesmo final. Banco confiável da origem
 * e do lançamento/cartão precisa coincidir. A tela só oferece remover
 * com exatamente um; quem remove é o toque da pessoa.
 */
/**
 * O que o cartão do estorno oferece. Só `remover` tem botão que apaga; o resto
 * explica e deixa só tirar da lista. Sem histórico no aparelho, não dá para
 * afirmar nada: `sem_historico`.
 */
export type OfertaDoEstorno<T> =
  | { tipo: 'remover'; lancamento: T }
  | { tipo: 'varios' }
  | { tipo: 'nenhum' }
  | { tipo: 'sem_valor' }
  | { tipo: 'sem_historico' };

export function ofertaDoEstorno<T extends LancamentoParaEstorno>(
  item: ItemAConferir, lancamentos: T[] | null, cartoes: CreditCard[] = [],
): OfertaDoEstorno<T> {
  if (item.valor === undefined) return { tipo: 'sem_valor' };
  if (lancamentos === null) return { tipo: 'sem_historico' };
  const achados = lancamentosDoEstorno(item, lancamentos, cartoes);
  if (achados.length === 1) return { tipo: 'remover', lancamento: achados[0] };
  return achados.length ? { tipo: 'varios' } : { tipo: 'nenhum' };
}

export function lancamentosDoEstorno<T extends LancamentoParaEstorno>(item: ItemAConferir, lancamentos: T[], cartoes: CreditCard[] = []): T[] {
  if (item.tipo !== 'estorno' || item.valor === undefined) return [];
  const valor = item.valor;
  const banco = APPS_INICIAIS.find((a) => a.pacote === item.pacote && a.classe === 'banco')?.banco;
  if (!banco || banco === 'outro') return [];
  const doEstorno = Date.parse(`${item.data}T12:00:00Z`);
  return lancamentos.filter((t) => {
    if (t.type !== 'out' || centavos(Number(t.amount)) !== centavos(valor)) return false;
    /* Parcela e série que se repete têm outra pergunta para apagar: nunca por aqui. */
    if ((t.installment_total ?? 1) > 1 || t.recurring) return false;
    const dias = (doEstorno - Date.parse(`${t.occurred_on}T12:00:00Z`)) / DIA_MS;
    if (!(dias >= 0 && dias <= 7)) return false;
    const cartao = t.card_id ? cartoes.find((c) => c.id === t.card_id) : undefined;
    const confiavel = (b?: string | null) => APPS_INICIAIS.some((a) => a.classe === 'banco' && a.banco === b) ? b : undefined;
    const bancoDoLancamento = confiavel(t.bank);
    const bancoDoCartao = confiavel(cartao?.bank);
    if ((bancoDoLancamento && bancoDoLancamento !== banco) || (bancoDoCartao && bancoDoCartao !== banco)) return false;
    if ((bancoDoLancamento ?? bancoDoCartao) !== banco) return false;
    const final = cartao?.last_digits;
    if (final && item.digitos && final !== item.digitos) return false;
    return mesmoComerciante(t.description, item.contraparte ?? item.descricao);
  });
}

/** Chave de idempotência estável, derivada do id do aviso, no formato de UUID. */
export function chaveDoItem(id: string): string {
  const h = id.padEnd(32, '0').slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

type LancamentoExistente = { type: TxType; amount: number; occurred_on: string };

/** Lançado antes por voz ou à mão, com mesmo valor e data. */
export function pareceJaLancado(item: ItemAConferir, lancamentos: LancamentoExistente[]): boolean {
  if (item.tipo !== 'lancamento' || item.valor === undefined) return false;
  return lancamentos.some((t) => t.type === item.direcao && t.occurred_on === item.data
    && Math.abs(Number(t.amount) - (item.valor as number)) < 0.005);
}

/** Pix com o nome da própria pessoa: pode ser só dinheiro mudando de conta. */
export function pareceEntreContas(item: ItemAConferir, nomeDoPerfil?: string | null): boolean {
  if (item.forma !== 'pix' || !item.contraparte || !nomeDoPerfil?.trim()) return false;
  const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return chave(item.contraparte) === chave(nomeDoPerfil);
}

/** Só com os 4 dígitos batendo em um único cartão. Sem isso, a pessoa escolhe. */
export function cartaoDoItem(item: ItemAConferir, cartoes: CreditCard[]): CreditCard | null {
  if (!item.digitos) return null;
  const achados = cartoes.filter((c) => c.last_digits === item.digitos);
  return achados.length === 1 ? achados[0] : null;
}

/** O final já foi gravado com duas formas: só o aviso ou a pessoa respondem. */
export const FINAL_VARIAVEL = 'variavel';

/** A forma que a pessoa já gravou para cada final de cartão. */
export type FormasAprendidas = Record<string, FormaDoAviso | typeof FINAL_VARIAVEL>;

/**
 * Forma efetiva. Depois do que o aviso diz, vale o que a pessoa já gravou para
 * aquele final e, por último, o final de um cartão conhecido responde "crédito".
 */
export function formaDoItem(item: ItemAConferir, cartoes: CreditCard[], aprendidas: FormasAprendidas = {}): FormaDoAviso | null {
  if (item.formaEmDisputa) return null;
  if (item.forma) return item.forma;
  const lembrada = item.digitos ? aprendidas[item.digitos] : undefined;
  if (lembrada === FINAL_VARIAVEL) return null;
  return lembrada ?? (cartaoDoItem(item, cartoes) ? 'credit' : null);
}

/**
 * A categoria sugerida, sem categoria padrão. `apelidos === null` é leitura que
 * falhou (ver `decidirCategoria`). Entrada sempre pergunta: o nome de quem mandou
 * o Pix não diz o que é aquele dinheiro.
 */
export function categoriaDoItem(
  item: ItemAConferir,
  apelidos: { chave: string; valor: string }[] | null,
  extras: { name: string; color: string }[] = [],
): { name: string; color: string } | null {
  if (item.tipo !== 'lancamento' || item.direcao === 'in' || !item.descricao) return null;
  if (apelidos === null) return decidirCategoria(item.descricao, null, extras).categoria;
  const { categoria, doApelido } = decidirCategoria(item.descricao, apelidos, extras);
  if (doApelido) return categoria;
  return categoriaReconhecida(item.descricao, extras);
}

export function descricaoDoItem(item: ItemAConferir, categoria?: string | null): string {
  const descricao = item.descricao ?? '';
  return categoria && descricao ? semNomeDaCategoria(descricao, categoria) : descricao;
}

export type ContextoDoToque = {
  forma: FormaDoAviso | null;
  categoria: string | null;
  carteiraId: string | null;
  cartaoId: string | null;
  jaLancado: boolean;
  entreContas: boolean;
};

/** Confirmar grava em um toque só com todos os campos certos. O resto abre a revisão. */
export function confirmaEmUmToque(item: ItemAConferir, c: ContextoDoToque): boolean {
  if (item.tipo !== 'lancamento' || item.parcelas || !item.descricao) return false;
  if (!c.forma || c.forma === 'boleto' || !c.categoria || !c.carteiraId) return false;
  if (c.forma === 'credit' && !c.cartaoId) return false;
  return !c.jaLancado && !c.entreContas;
}

export type EntradaDoAviso = {
  type: TxType;
  description: string;
  amount: number;
  category: string;
  color: string;
  occurred_on: string;
  recurring: false;
  payment_method: 'credit' | 'debit' | 'pix';
  wallet_id: string;
  card_id?: string;
  bank?: string;
  installments?: number;
};

/**
 * O que vai para a gravação, igual a um lançamento manual. Boleto pago sem conta
 * casada é saída de caixa comum, por isso vira débito.
 */
export function montarEntrada(campos: {
  type: TxType; description: string; amount: number; category: string; color: string; occurred_on: string;
  forma: FormaDoAviso; wallet_id: string; cartao?: CreditCard | null; parcelas?: number | null;
}): EntradaDoAviso {
  const entrada: EntradaDoAviso = {
    type: campos.type,
    description: campos.description,
    amount: campos.amount,
    category: campos.category,
    color: campos.color,
    occurred_on: campos.occurred_on,
    recurring: false,
    payment_method: campos.forma === 'boleto' ? 'debit' : campos.forma,
    wallet_id: campos.wallet_id,
  };
  if (campos.forma === 'credit' && campos.cartao) {
    entrada.card_id = campos.cartao.id;
    entrada.bank = campos.cartao.bank || 'outro';
    if (campos.parcelas && campos.parcelas > 1) entrada.installments = campos.parcelas;
  }
  return entrada;
}
