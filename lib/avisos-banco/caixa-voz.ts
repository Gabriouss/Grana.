import AsyncStorage from '@react-native-async-storage/async-storage';
import { avisarMudancaDaVoz, chaveRevisoesVoz, geracaoDaCaixa, naVez } from './caixa-fila';
import { ehDataISO, type ReferenciaDaFala } from '../data-da-fala';
import { LIMITS } from '../limits';
import { idDoUsuarioLocal } from '../sessao-offline';
import type { DesfechoOperacaoVoz, PayloadOperacaoVoz, ResultadoOperacaoVoz } from '../voice-operations';
import type { ControleRetomadaVoz } from '../voz-retomada';

export { assinarRevisoesVoz, geracaoDaCaixa } from './caixa-fila';

export type DestinoRevisaoVoz = { dono: string; requestId: string };
export type RascunhoRevisaoVoz = {
  modo?: 'carteira' | 'credito' | 'boleto';
  tipo?: 'in' | 'out';
  descricao?: string;
  valor?: number;
  categoria?: { nome: string; cor: string };
  carteiraId?: string;
  cartaoId?: string;
  data?: string;
  vencimento?: string;
  parcelas?: number;
  forma?: string;
};
export type ItemRevisaoVoz = DestinoRevisaoVoz & {
  origem: 'voz';
  fonte: 'app' | 'widget';
  quando: number;
  titulo: string;
  transcricao: string;
  referencia?: ReferenciaDaFala;
  rascunho: RascunhoRevisaoVoz;
};
export type ValoresConfirmadosVoz = {
  modo: NonNullable<RascunhoRevisaoVoz['modo']>;
  type: 'in' | 'out';
  description: string;
  amount: number;
  category: string;
  color: string;
  occurred_on: string;
  vencimento?: string;
  recurring: boolean;
  installments: number;
  card_id: string | null;
  wallet_id: string;
  forma?: string;
};
export type ResultadoConfirmacaoVoz = ResultadoOperacaoVoz & DestinoRevisaoVoz & {
  desfecho: DesfechoOperacaoVoz;
};
export type ReciboDescarteVoz = DestinoRevisaoVoz & { idDescarte: string };

type Registro =
  | { estado: 'pendente'; item: ItemRevisaoVoz }
  | { estado: 'confirmando'; item: ItemRevisaoVoz; payload: PayloadOperacaoVoz }
  | { estado: 'resolvido'; resultado: ResultadoConfirmacaoVoz }
  | { estado: 'descartado'; idDescarte: string };
type Registros = Record<string, Registro>;

export function escopoDaRevisaoVoz(dono: string, geracao: number, controle?: ControleRetomadaVoz) {
  function conferir() {
    controle?.conferir();
    if (geracaoDaCaixa(dono) !== geracao) throw new Error('A sessão da revisão por voz terminou.');
  }
  async function vigente() {
    conferir();
    const atual = (await idDoUsuarioLocal(3_000)) === dono;
    conferir();
    return atual;
  }
  async function conferirDono() {
    if (!(await vigente())) throw new Error('A revisão por voz pertence à conta anterior.');
  }
  return { conferir, conferirDono, vigente };
}
type Escopo = ReturnType<typeof escopoDaRevisaoVoz>;

async function ler(dono: string): Promise<Registros> {
  const bruto = await AsyncStorage.getItem(chaveRevisoesVoz(dono));
  const registros: unknown = bruto ? JSON.parse(bruto) : {};
  if (!registros || typeof registros !== 'object' || Array.isArray(registros)) {
    throw new Error('A caixa de voz está ilegível.');
  }
  return registros as Registros;
}

function lerRegistro(registros: Registros, requestId: string): Registro | undefined {
  return Object.hasOwn(registros, requestId) ? registros[requestId] : undefined;
}

async function escrever(alvo: DestinoRevisaoVoz, registros: Registros, registro: Registro, escopo: Escopo) {
  await escopo.conferirDono();
  await AsyncStorage.setItem(chaveRevisoesVoz(alvo.dono), JSON.stringify({ ...registros, [alvo.requestId]: registro }));
  await escopo.conferirDono();
  avisarMudancaDaVoz(alvo.dono);
}

export function listarRevisoesVoz(dono: string): Promise<ItemRevisaoVoz[]> {
  const escopo = escopoDaRevisaoVoz(dono, geracaoDaCaixa(dono));
  return naVez(async () => {
    if (!(await escopo.vigente())) return [];
    const registros = await ler(dono);
    if (!(await escopo.vigente())) return [];
    return Object.values(registros).flatMap((r) =>
      'item' in r && r.item.dono === dono ? [r.item] : []).sort((a, b) => b.quando - a.quando);
  });
}

export function estadoDaRevisaoVoz(alvo: DestinoRevisaoVoz, escopo: Escopo): Promise<Registro['estado'] | undefined> {
  return naVez(async () => {
    await escopo.conferirDono();
    const registro = lerRegistro(await ler(alvo.dono), alvo.requestId);
    await escopo.conferirDono();
    return registro?.estado;
  });
}

export function aceitaReenvioDeOperacao(alvo: DestinoRevisaoVoz, escopo: Escopo): Promise<boolean> {
  return naVez(async () => {
    await escopo.conferirDono();
    const registro = lerRegistro(await ler(alvo.dono), alvo.requestId);
    await escopo.conferirDono();
    return !registro || registro.estado === 'confirmando' ||
      (registro.estado === 'resolvido' && registro.resultado.desfecho === 'pendente');
  });
}

/** Uma captura já entregue é estável, mesmo se a fila reaparecer após reinício. */
export function publicarRevisaoVoz(item: ItemRevisaoVoz, escopo: Escopo): Promise<boolean> {
  return naVez(async () => {
    await escopo.conferirDono();
    const registros = await ler(item.dono);
    await escopo.conferirDono();
    if (lerRegistro(registros, item.requestId)) return false;
    await escrever(item, registros, { estado: 'pendente', item }, escopo);
    return true;
  });
}

export function publicarRevisaoDeOperacao(
  item: ItemRevisaoVoz, escopo: Escopo,
): Promise<boolean> {
  return naVez(async () => {
    await escopo.conferirDono();
    const registros = await ler(item.dono);
    const anterior = lerRegistro(registros, item.requestId);
    if (anterior?.estado === 'pendente' || anterior?.estado === 'descartado' ||
        (anterior?.estado === 'resolvido' && anterior.resultado.desfecho !== 'pendente')) return false;
    const revisao = anterior?.estado === 'confirmando'
      ? { ...anterior.item, titulo: item.titulo, rascunho: item.rascunho }
      : item;
    await escrever(item, registros, { estado: 'pendente', item: revisao }, escopo);
    return true;
  });
}

/** Fecha o registro caso a fila financeira tenha consumido uma confirmação da caixa. */
export async function concluirRevisaoDeOperacao(alvo: DestinoRevisaoVoz, gravada: ResultadoOperacaoVoz, escopo: Escopo): Promise<void> {
  const { desfechoDaOperacaoVoz } = await import('../voice-operations');
  const resultado = { ...alvo, ...gravada, desfecho: desfechoDaOperacaoVoz(gravada) };
  await naVez(async () => {
    await escopo.conferirDono();
    const registros = await ler(alvo.dono);
    const anterior = lerRegistro(registros, alvo.requestId);
    if (anterior?.estado === 'confirmando' ||
        (anterior?.estado === 'resolvido' && anterior.resultado.desfecho === 'pendente')) {
      await escrever(alvo, registros, { estado: 'resolvido', resultado }, escopo);
    }
  });
}

const PRAZO_DESFAZER_MS = 5 * 60_000;
const descartes = new Map<string, { item: ItemRevisaoVoz; geracao: number; ate: number }>();
let sequenciaDescarte = 0;
export function descartarRevisaoVoz(alvo: DestinoRevisaoVoz): Promise<ReciboDescarteVoz | null> {
  const geracao = geracaoDaCaixa(alvo.dono);
  const escopo = escopoDaRevisaoVoz(alvo.dono, geracao);
  return naVez(async () => {
    await escopo.conferirDono();
    const registros = await ler(alvo.dono);
    const registro = lerRegistro(registros, alvo.requestId);
    if (registro?.estado !== 'pendente') return null;
    const agora = Date.now();
    const idDescarte = `${agora}:${++sequenciaDescarte}`;
    await escrever(alvo, registros, { estado: 'descartado', idDescarte }, escopo);
    descartes.set(idDescarte, { item: registro.item, geracao, ate: agora + PRAZO_DESFAZER_MS });
    const timer = setTimeout(() => { descartes.delete(idDescarte); }, PRAZO_DESFAZER_MS);
    // O temporizador não precisa manter ferramentas Node abertas durante QA.
    (timer as { unref?: () => void }).unref?.();
    return { ...alvo, idDescarte };
  });
}

export function desfazerDescarteVoz(alvo: DestinoRevisaoVoz, idDescarte: string): Promise<boolean> {
  const geracao = geracaoDaCaixa(alvo.dono);
  const escopo = escopoDaRevisaoVoz(alvo.dono, geracao);
  return naVez(async () => {
    await escopo.conferirDono();
    const salvo = descartes.get(idDescarte);
    if (!salvo || salvo.ate <= Date.now() || salvo.geracao !== geracao ||
        salvo.item.dono !== alvo.dono || salvo.item.requestId !== alvo.requestId) return false;
    const registros = await ler(alvo.dono);
    const registro = lerRegistro(registros, alvo.requestId);
    if (registro?.estado !== 'descartado' || registro.idDescarte !== idDescarte) return false;
    await escrever(alvo, registros, { estado: 'pendente', item: salvo.item }, escopo);
    descartes.delete(idDescarte);
    return true;
  });
}

function operacaoConfirmada(valores: ValoresConfirmadosVoz): PayloadOperacaoVoz {
  const { modo, type, amount, color, wallet_id, card_id, installments, forma } = valores;
  const description = valores.description.trim();
  const category = valores.category.trim();
  if (!description || description.length > LIMITS.description || !category || category.length > LIMITS.category ||
      !color || !wallet_id || !Number.isFinite(amount) || amount <= 0 || amount > 999_999_999.99) {
    throw new Error('Preencha descrição, valor, categoria e carteira para salvar.');
  }
  const base = { description, amount, category, color, wallet_id, recurring: valores.recurring };
  if (modo === 'boleto') {
    const due_date = valores.vencimento ?? valores.occurred_on;
    if (!ehDataISO(due_date)) throw new Error('Informe o vencimento da conta.');
    return { ...base, kind: 'bill', due_date };
  }
  const occurred_on = valores.occurred_on;
  if (!ehDataISO(occurred_on)) throw new Error('Informe a data do lançamento.');
  if (modo === 'credito') {
    if (!card_id || type !== 'out' || !Number.isInteger(installments) || installments < 1 || installments > 120) {
      throw new Error('Informe um cartão e um parcelamento válido.');
    }
    if (installments > 1) {
      return { ...base, kind: 'installment', type, occurred_on, card_id, installments, payment_method: 'credit' };
    }
    return { ...base, kind: 'transaction', type, occurred_on, card_id, payment_method: 'credit' };
  }
  if (modo !== 'carteira' || (type !== 'in' && type !== 'out') || installments > 1 ||
      (forma && !['debit', 'pix', 'cash'].includes(forma))) {
    throw new Error('Confira o tipo e a forma do lançamento.');
  }
  return { ...base, kind: 'transaction', type, occurred_on, ...(forma ? { payment_method: forma } : null) };
}

const emConfirmacao = new Map<string, Promise<ResultadoConfirmacaoVoz>>();

export function confirmarRevisaoVoz(alvo: DestinoRevisaoVoz, valores: ValoresConfirmadosVoz): Promise<ResultadoConfirmacaoVoz> {
  const geracao = geracaoDaCaixa(alvo.dono);
  const chave = JSON.stringify([alvo.dono, alvo.requestId, geracao]);
  const emCurso = emConfirmacao.get(chave);
  if (emCurso) return emCurso;
  const trabalho = confirmar(alvo, valores, escopoDaRevisaoVoz(alvo.dono, geracao))
    .finally(() => { emConfirmacao.delete(chave); });
  emConfirmacao.set(chave, trabalho);
  return trabalho;
}

async function confirmar(alvo: DestinoRevisaoVoz, valores: ValoresConfirmadosVoz, escopo: Escopo): Promise<ResultadoConfirmacaoVoz> {
  const operacoes = await import('../voice-operations');
  const registro = await naVez(async () => {
    await escopo.conferirDono();
    const registros = await ler(alvo.dono);
    await escopo.conferirDono();
    const anterior = lerRegistro(registros, alvo.requestId);
    if (!anterior || anterior.estado === 'descartado') throw new Error('Esta fala já saiu do sino.');
    if (anterior.estado !== 'pendente') return anterior;
    const proximo = { estado: 'confirmando' as const, item: anterior.item, payload: operacaoConfirmada(valores) };
    // Um registro que aguarda a pessoa invalida qualquer intenção anterior.
    await AsyncStorage.removeItem(operacoes.chaveDaIntencaoVoz(alvo.dono, alvo.requestId));
    await escrever(alvo, registros, proximo, escopo);
    return proximo;
  });
  if (registro.estado === 'resolvido') return registro.resultado;

  const controle: ControleRetomadaVoz = {
    conferir: escopo.conferir, signal: new AbortController().signal, fim: Infinity, userId: alvo.dono,
  };
  let gravada: ResultadoOperacaoVoz;
  try {
    await escopo.conferirDono();
    gravada = await operacoes.registrarOperacaoVoz(
      alvo.requestId, registro.item.fonte, registro.payload, registro.item.transcricao, undefined, alvo.dono, controle,
    );
  } catch (erro) {
    const desfecho = operacoes.desfechoDoErroVoz(erro);
    if (!desfecho) {
      // Sem intenção durável, é seguro aceitar outra edição do formulário.
      const recusaConfirmada = /^(22|23|42501)/.test(String((erro as { code?: unknown })?.code ?? ''));
      if (erro instanceof operacoes.IntencaoVozNaoGuardada || recusaConfirmada) {
        await naVez(async () => {
          const registros = await ler(alvo.dono);
          if (lerRegistro(registros, alvo.requestId)?.estado === 'confirmando') {
            await escrever(alvo, registros, { estado: 'pendente', item: registro.item }, escopo);
          }
        });
      }
      throw erro;
    }
    gravada = { status: 'committed', operationId: alvo.requestId, kind: registro.payload.kind, ids: [], replayed: true, conflito: true };
  }
  const resultado = { ...alvo, ...gravada, desfecho: operacoes.desfechoDaOperacaoVoz(gravada) };
  return naVez(async () => {
    await escopo.conferirDono();
    const registros = await ler(alvo.dono);
    const atual = lerRegistro(registros, alvo.requestId);
    if (atual?.estado === 'resolvido') return atual.resultado;
    if (atual?.estado !== 'confirmando') throw new Error('A operação voltou à lista para conferência.');
    await escrever(alvo, registros, { estado: 'resolvido', resultado }, escopo);
    return resultado;
  });
}
