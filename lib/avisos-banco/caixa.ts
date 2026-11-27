import AsyncStorage from '@react-native-async-storage/async-storage';
import { lerDiarioAvisos } from '@/modules/grana-avisos';
import { aplicarAvisos, CAIXA_VAZIA, marcarVencimentoVisto, FINAL_VARIAVEL, type EstadoDaCaixa, type FormasAprendidas, type ItemAConferir, type ReciboDeEstorno } from './decidir';
import type { FormaDoAviso } from './interpretar';
import { ehBancoDoCatalogo } from './catalogo';
import { apagarCaixaVoz, naVez, revogarCaixaVoz } from './caixa-fila';

/**
 * A lista "A conferir", por dono, só neste aparelho. Não chama rede e não guarda
 * título nem texto: o "Não entendi" lê o texto do diário pelo id do aviso.
 * Nada aqui grava dinheiro (trava T4). Quem grava é `gravar.ts`, depois do toque.
 */
const chaveDoDono = (dono: string) => `grana_avisos_caixa:${dono}`;
const chaveDasMarcas = (dono: string) => `grana_avisos_gravados:${dono}`;
const chaveDasFormas = (dono: string) => `grana_avisos_formas:${dono}`;

/* Caixa ilegível lança: tratar como vazia gravaria por cima e faria todo aviso
   do diário voltar como item novo. */
async function ler(dono: string): Promise<EstadoDaCaixa> {
  const bruto = await AsyncStorage.getItem(chaveDoDono(dono));
  if (!bruto) return CAIXA_VAZIA;
  const estado = JSON.parse(bruto) as EstadoDaCaixa;
  if (!Array.isArray(estado.itens) || typeof estado.vistos !== 'object') throw new Error('caixa de avisos ilegível');
  const vistos = Object.fromEntries(Object.entries(estado.vistos).filter(([, v]) => ehBancoDoCatalogo(v.pacote)));
  const itens = estado.itens.flatMap((item): ItemAConferir[] => {
    // Um grupo antigo banco+carteira conserva seu id (e a chave de gravação).
    const banco = ehBancoDoCatalogo(item.pacote) ? item.pacote
      : Object.values(vistos).find((v) => v.itemId === item.id)?.pacote;
    if (!banco) return [];
    return [{ ...item, pacote: banco, classe: 'banco',
      avisoIds: item.avisoIds.filter((id) => !estado.vistos[id] || !!vistos[id]) }];
  });
  const limpo = { ...estado, itens, vistos };
  if (JSON.stringify(limpo) !== bruto) await gravar(dono, limpo);
  return limpo;
}

const gravar = (dono: string, estado: EstadoDaCaixa) => AsyncStorage.setItem(chaveDoDono(dono), JSON.stringify(estado));

export type ResultadoDaCaixa = { itens: ItemAConferir[]; ilegiveis: number; recibos: ReciboDeEstorno[] };

/**
 * Traz do diário o que ainda não foi visto. Rejeita se o diário ou a caixa falharem.
 * Os itens já gravados (marca de gravado) contam como confirmados: estorno deles
 * nunca é descartado sozinho.
 */
export function sincronizarCaixa(dono: string, agora: number = Date.now()): Promise<ResultadoDaCaixa> {
  return naVez(async () => {
    const [diario, estado, marcas] = await Promise.all([lerDiarioAvisos(), ler(dono), lerMarcas(dono)]);
    const proximo = aplicarAvisos(estado, diario.itens.filter((a) => ehBancoDoCatalogo(a.pacote)), agora, new Set(Object.keys(marcas)));
    await gravar(dono, proximo);
    return { itens: proximo.itens, ilegiveis: diario.ilegiveis, recibos: proximo.recibos ?? [] };
  });
}

/** Recibos do descarte automático por estorno, para a tela mostrar o que saiu. */
export function recibosDaCaixa(dono: string): Promise<ReciboDeEstorno[]> {
  return naVez(async () => (await ler(dono)).recibos ?? []);
}

/** A pessoa já viu o recibo: sai da lista. */
export function dispensarRecibo(dono: string, id: string): Promise<void> {
  return naVez(async () => {
    const estado = await ler(dono);
    const recibos = (estado.recibos ?? []).filter((r) => r.id !== id);
    const { recibos: _antigos, ...resto } = estado;
    await gravar(dono, recibos.length ? { ...resto, recibos } : resto);
  });
}

/** A janela mostrou os itens do último dia: só agora a validade pode tirá-los. */
export function registrarVencimentoVisto(dono: string, agora: number = Date.now(), ids?: readonly string[]): Promise<void> {
  return naVez(async () => {
    const estado = await ler(dono);
    const marcado = marcarVencimentoVisto(estado, agora, ids);
    if (marcado !== estado) await gravar(dono, marcado);
  });
}

export function listarCaixa(dono: string): Promise<ItemAConferir[]> {
  return naVez(async () => (await ler(dono)).itens);
}

/** O id continua nos vistos: o aviso par que chegar depois não reabre o item. */
export function removerItemDaCaixa(dono: string, id: string): Promise<void> {
  return naVez(async () => {
    const estado = await ler(dono);
    await gravar(dono, { ...estado, itens: estado.itens.filter((i) => i.id !== id) });
  });
}

/** Lê do disco, não da lista em tela. Caixa ilegível rejeita, antes de qualquer dinheiro. */
export function contaEmPagamentoDoItem(dono: string, id: string): Promise<string | undefined> {
  return naVez(async () => (await ler(dono)).itens.find((i) => i.id === id)?.contaEmPagamento);
}

export function marcarContaEmPagamento(dono: string, id: string, contaId: string): Promise<void> {
  return naVez(async () => {
    const estado = await ler(dono);
    await gravar(dono, {
      ...estado,
      itens: estado.itens.map((i) => (i.id === id ? { ...i, contaEmPagamento: contaId } : i)),
    });
  });
}

/* Marcas de "já gravado, falta só sair da lista", fora da chave da caixa: é
   justamente a escrita da caixa que pode ter falhado. Guardam o id e se foi para
   a fila, nada do aviso. Marca ilegível vale como nenhuma: a fila e o banco ainda
   reconhecem a chave. */
async function lerMarcas(dono: string): Promise<Record<string, boolean>> {
  try {
    return JSON.parse(await AsyncStorage.getItem(chaveDasMarcas(dono)) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Foi para a fila (`true`), foi gravado (`false`) ou ainda não saiu (`undefined`). */
export function marcaDeGravado(dono: string, id: string): Promise<boolean | undefined> {
  return naVez(async () => (await lerMarcas(dono))[id]);
}

export function todasAsMarcasDeGravado(dono: string): Promise<Record<string, boolean>> {
  return naVez(() => lerMarcas(dono));
}

export function marcarComoGravado(dono: string, id: string, guardado: boolean): Promise<void> {
  return naVez(async () => {
    await AsyncStorage.setItem(chaveDasMarcas(dono), JSON.stringify({ ...(await lerMarcas(dono)), [id]: guardado }));
  });
}

export function esquecerMarcaDeGravado(dono: string, id: string): Promise<void> {
  return naVez(async () => {
    const { [id]: _saiu, ...resto } = await lerMarcas(dono);
    await AsyncStorage.setItem(chaveDasMarcas(dono), JSON.stringify(resto));
  });
}

/* O que a pessoa já gravou para cada final de cartão: só os 4 dígitos e a forma, nada
   do aviso. Sem essa memória o app só volta a perguntar, então falha nunca derruba. */
const FORMAS_VALIDAS: readonly string[] = ['credit', 'debit', 'pix', FINAL_VARIAVEL];

async function lerFormas(dono: string): Promise<FormasAprendidas> {
  try {
    const lidas: unknown = JSON.parse(await AsyncStorage.getItem(chaveDasFormas(dono)) ?? '{}');
    return Object.fromEntries(Object.entries(lidas as Record<string, string>)
      .filter(([digitos, forma]) => /^\d{4}$/.test(digitos) && FORMAS_VALIDAS.includes(forma))) as FormasAprendidas;
  } catch (erro) {
    console.warn('[avisos] não leu as formas aprendidas', erro instanceof Error ? erro.name : 'erro');
    return {};
  }
}

export function formasAprendidas(dono: string): Promise<FormasAprendidas> {
  return naVez(() => lerFormas(dono));
}

/** Gravado com duas formas, o final é de cartão múltiplo e nunca mais responde sozinho. */
export function aprenderFormaDoCartao(dono: string, digitos: string, forma: FormaDoAviso): Promise<void> {
  return naVez(async () => {
    const formas = await lerFormas(dono);
    const antes = formas[digitos];
    const agora = antes && antes !== forma ? FINAL_VARIAVEL : forma;
    await AsyncStorage.setItem(chaveDasFormas(dono), JSON.stringify({ ...formas, [digitos]: agora }));
  });
}

export function limparCaixa(dono: string): Promise<void> {
  revogarCaixaVoz(dono);
  return naVez(async () => {
    const resultados = await Promise.allSettled([
      apagarCaixaVoz(dono),
      AsyncStorage.removeItem(chaveDoDono(dono)),
      AsyncStorage.removeItem(chaveDasMarcas(dono)),
      AsyncStorage.removeItem(chaveDasFormas(dono)),
    ]);
    const falha = resultados.find((resultado) => resultado.status === 'rejected');
    if (falha) throw falha.reason;
  });
}
