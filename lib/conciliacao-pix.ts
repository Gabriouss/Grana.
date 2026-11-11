import { parseCsvTextDetalhado, splitCsvLine } from './heuristics';
import { parseOfx } from './ofx-parser';
import { LIMITS } from './limits';
import { ehPagamentoDeFatura } from './gastos-categoria';
import type { Transaction, TxType } from './types';

export type LinhaPix = {
  id: string; fitid: string; idBanco: string | null; idOriginal?: string | null;
  data: string; centavos: number; direcao: TxType; descricao: string; categoria: string; cor: string;
  natureza: 'movimento' | 'cofrinho' | 'estorno' | 'fatura' | 'transferencia';
  /** CSV com dd/mm e mm/dd possíveis: 'mes-dia' quando o arquivo prova MM/DD; 'dia-mes-presumido' quando nada prova. */
  formatoData?: 'mes-dia' | 'dia-mes-presumido';
};
export type ResultadoPix = {
  linha: LinhaPix; status: 'conciliado' | 'falta' | 'data' | 'revisar' | 'ignorar';
  candidatos: Transaction[]; alvo?: Transaction; motivo: string;
};
const normal = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const falhar = (): never => { throw new Error('Não foi possível ler todas as linhas. Use CSV em reais com Data (DD/MM/AAAA), Descrição e Valor com sinal, ou OFX da conta em BRL.'); };
function diaCivil(raw: string, ordem: 'dm' | 'md' = 'dm'): string {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!iso && !br) return falhar();
  const [ano, mes, dia] = iso ? iso.slice(1).map(Number)
    : ordem === 'md' ? [Number(br![3]), Number(br![1]), Number(br![2])] : [Number(br![3]), Number(br![2]), Number(br![1])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (ano < 1000 || d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return falhar();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
function centavos(valor: number): number {
  const n = Math.round(valor * 100);
  if (!Number.isSafeInteger(n) || n <= 0 || Math.abs(valor * 100 - n) > 0.00001) return falhar();
  return n;
}
function natureza(descricao: string): LinhaPix['natureza'] {
  const s = normal(descricao);
  if (/\bdinheiro (reservado|retirado)\b/.test(s)) return 'cofrinho';
  if (/\bestorno\b|\bdevolucao\b/.test(s)) return 'estorno';
  // Qualquer "fatura", e pagamento de cartão em qualquer grafia comum de extrato (pag, pagto, pgto, pagamento).
  if (/\bfatura\b/.test(s) || /\b(pag|pagto|pgto|pagamento)\b.*\bcartao\b/.test(s) || /\bcartao de credito\b/.test(s)) return 'fatura';
  if (/transferencia entre (minhas|suas|proprias) contas/.test(s)) return 'transferencia';
  return 'movimento';
}

/** Nenhum upload, data de hoje substituta, adivinhação de centavos ou corte silencioso. */
export function lerExtratoConciliacao(texto: string): LinhaPix[] {
  if (!texto.trim() || texto.length > LIMITS.pastedText || /\u0000|\uFFFD/.test(texto)) return falhar();
  if (/<OFX[>\s]/i.test(texto)) {
    const ofx = parseOfx(texto);
    if (ofx.origem !== 'conta' || ofx.moeda?.toUpperCase() !== 'BRL' || ofx.truncado || !ofx.lancamentos.length) return falhar();
    return ofx.lancamentos.map((r, i) => ({ id: String(i), fitid: '', idBanco: r.fitid, data: diaCivil(r.occurred_on),
      centavos: centavos(r.amount), direcao: r.type, descricao: r.description, categoria: r.category, cor: r.color, natureza: natureza(r.description) }));
  }
  const linhas = texto.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  if (linhas.length < 2 || linhas.length - 1 > LIMITS.csvRows) return falhar();
  const sep = linhas[0].includes(';') ? ';' : ',';
  const cabecalho = splitCsvLine(linhas[0], sep).map(normal);
  const data = cabecalho.findIndex(h => h === 'data' || h === 'date');
  const desc = cabecalho.findIndex(h => /^(descricao|historico|description|detalhe)$/.test(h));
  const valor = cabecalho.findIndex(h => /^(valor|amount|valor da operacao)$/.test(h));
  const tipo = cabecalho.indexOf('tipo'), moeda = cabecalho.indexOf('moeda');
  const id = cabecalho.findIndex(h => /^(id|fitid|identificador|id da operacao)$/.test(h));
  const original = cabecalho.findIndex(h => /^(id original|id da operacao original)$/.test(h));
  if (data < 0 || desc < 0 || valor < 0) return falhar();
  const campos = linhas.slice(1).map(l => splitCsvLine(l, sep));
  const temNegativo = campos.some(c => c[valor]?.trim().startsWith('-'));
  const quote = (s: string) => '"' + s.replace(/"/g, '""') + '"';
  // DD/MM ou MM/DD: o arquivo prova a ordem quando algum lado passa de 12. Misturado é recusado.
  const barras = campos.map(c => (c[data] ?? '').trim().match(/^(\d{2})\/(\d{2})\/\d{4}$/)).filter(Boolean) as RegExpMatchArray[];
  const provaDiaMes = barras.some(m => Number(m[1]) > 12), provaMesDia = barras.some(m => Number(m[2]) > 12);
  if (provaDiaMes && provaMesDia) return falhar();
  const ordem: 'dm' | 'md' = provaMesDia ? 'md' : 'dm';
  const formatoData: LinhaPix['formatoData'] = provaMesDia ? 'mes-dia' : !provaDiaMes && barras.length ? 'dia-mes-presumido' : undefined;
  return campos.map((c, i) => {
    if (c.length !== cabecalho.length || !c[desc]?.trim() || (moeda >= 0 && c[moeda]?.toUpperCase() !== 'BRL')) return falhar();
    const dia = diaCivil(c[data]?.trim() ?? '', ordem);
    const bruto = (c[valor] ?? '').trim().replace(/^R\$\s*/, '');
    if (!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{2})?$/.test(bruto) && !/^[+-]?\d+\.\d{2}$/.test(bruto)) return falhar();
    const textoTipo = normal(c[tipo] ?? '');
    let direcao: TxType;
    if (textoTipo) {
      if (/^(entrada|receita|credito)$/.test(textoTipo)) direcao = 'in';
      else if (/^(saida|despesa|debito)$/.test(textoTipo)) direcao = 'out';
      else return falhar();
      if (bruto.startsWith('-') && direcao !== 'out') return falhar();
    } else if (temNegativo || bruto.startsWith('+')) direcao = bruto.startsWith('-') ? 'out' : 'in';
    else if (/pix recebido|recebimento|dinheiro retirado/.test(normal(c[desc]))) direcao = 'in';
    else if (/pix enviado|pagamento|compra|dinheiro reservado/.test(normal(c[desc]))) direcao = 'out';
    else return falhar();
    const r = parseCsvTextDetalhado('Data;Descrição;Valor;Tipo\n' + [dia, c[desc], bruto, direcao === 'in' ? 'Entrada' : 'Saída'].map(quote).join(';'), ';');
    if (r.rows.length !== 1 || r.truncado) return falhar();
    const row = r.rows[0];
    return { id: String(i), fitid: '', idBanco: id >= 0 ? c[id] || null : null, idOriginal: original >= 0 ? c[original] || null : null,
      data: dia, centavos: centavos(row.amount), direcao, descricao: row.description, categoria: row.category, cor: row.color, natureza: natureza(row.description),
      ...(formatoData ? { formatoData } : {}) };
  });
}

/** ±3 dias geram candidatos; nunca desempata pelo nome, pela ordem ou pela proximidade. */
export function conciliarPix(op: { userId: string; carteiraId: string; principalId: string; linhas: LinhaPix[]; lancamentos: Transaction[] }): ResultadoPix[] {
  const transacoes = op.lancamentos.filter(t => t.user_id === op.userId && (t.wallet_id ?? op.principalId) === op.carteiraId
    && !t.card_id && t.payment_method !== 'credit');
  const dias = new Map<string, number>();
  const dia = (data: string): number => {
    let valor = dias.get(data);
    if (valor === undefined) {
      valor = Date.parse(diaCivil(data) + 'T00:00:00Z') / 86_400_000;
      dias.set(data, valor);
    }
    return valor;
  };
  const distancia = (a: string, b: string) => Math.abs(dia(a) - dia(b));
  const igualValor = (t: Transaction, l: LinhaPix) => Number.isFinite(t.amount) && Math.round(t.amount * 100) === l.centavos && t.type === l.direcao;
  const noCredito = op.lancamentos.filter(t => t.user_id === op.userId && (!!t.card_id || t.payment_method === 'credit'));
  const chaveValor = (direcao: TxType, centavos: number) => JSON.stringify([direcao, centavos]);
  type Entrada = { transacao: Transaction; ordem: number };
  type GrupoValor = { entradas: Entrada[]; porDia?: Map<number, Entrada[]> };
  function indexarValores(lista: Transaction[]): Map<string, GrupoValor> {
    const indice = new Map<string, GrupoValor>();
    lista.forEach((transacao, ordem) => {
      if (!Number.isFinite(transacao.amount)) return;
      const chave = chaveValor(transacao.type, Math.round(transacao.amount * 100));
      let grupo = indice.get(chave);
      if (!grupo) { grupo = { entradas: [] }; indice.set(chave, grupo); }
      grupo.entradas.push({ transacao, ordem });
    });
    return indice;
  }
  function calendario(grupo: GrupoValor): Map<number, Entrada[]> {
    if (!grupo.porDia) {
      grupo.porDia = new Map();
      for (const entrada of grupo.entradas) {
        const data = dia(entrada.transacao.occurred_on);
        const lista = grupo.porDia.get(data);
        if (lista) lista.push(entrada);
        else grupo.porDia.set(data, [entrada]);
      }
    }
    return grupo.porDia;
  }
  const valores = indexarValores(transacoes), valoresCredito = indexarValores(noCredito);
  const porFitid = new Map<string, Transaction[]>();
  for (const t of transacoes) if (t.fitid) {
    const lista = porFitid.get(t.fitid);
    if (lista) lista.push(t);
    else porFitid.set(t.fitid, [t]);
  }
  const vazios: Transaction[] = [];
  function pertoDaData(linha: LinhaPix): Transaction[] {
    const grupo = valores.get(chaveValor(linha.direcao, linha.centavos));
    if (!grupo) return vazios;
    const centro = dia(linha.data), indice = calendario(grupo);
    const listas: Entrada[][] = [];
    for (let d = centro - 3; d <= centro + 3; d++) {
      const lista = indice.get(d);
      if (lista) listas.push(lista);
    }
    // Intercalar os sete dias conserva a ordem original sem ordenar por proximidade.
    const posicoes = listas.map(() => 0), encontrados: Transaction[] = [];
    for (;;) {
      let proxima = -1;
      for (let i = 0; i < listas.length; i++) {
        if (posicoes[i] < listas[i].length && (proxima < 0 ||
          listas[i][posicoes[i]].ordem < listas[proxima][posicoes[proxima]].ordem)) proxima = i;
      }
      if (proxima < 0) return encontrados;
      encontrados.push(listas[proxima][posicoes[proxima]++].transacao);
    }
  }
  function haCreditoPerto(linha: LinhaPix): boolean {
    const grupo = valoresCredito.get(chaveValor(linha.direcao, linha.centavos));
    if (!grupo) return false;
    const centro = dia(linha.data), indice = calendario(grupo);
    for (let d = centro - 3; d <= centro + 3; d++) if (indice.has(d)) return true;
    return false;
  }
  // Série recorrente ocupa o mês pela data: mudar o mês faz a série recriar a ocorrência (duplicata). Parcela não é série.
  const serieRecorrente = (t: Transaction) => !((t.installment_total ?? 1) > 1) && (t.recurring === true || !!t.parent_id);
  type GrupoCandidatos = { candidatos: Transaction[]; porId: boolean; usos: number };
  const grupos = new Map<string, GrupoCandidatos>();
  const planos = op.linhas.map(linha => {
    const identificados = linha.fitid ? porFitid.get(linha.fitid) : undefined;
    const porId = !!identificados?.length;
    const chave = porId ? JSON.stringify(['id', linha.fitid]) : JSON.stringify(['valor', linha.direcao, linha.centavos, linha.data]);
    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = { candidatos: identificados ?? pertoDaData(linha), porId, usos: 0 };
      grupos.set(chave, grupo);
    }
    grupo.usos++;
    return { linha, candidatos: grupo.candidatos, porId };
  });
  const usados = new Map<string, number>();
  const fortes = new Map<string, number>();
  // O grupo é compartilhado: 3 mil linhas iguais não retêm/percorrem 9 milhões de referências.
  for (const grupo of grupos.values()) for (const t of grupo.candidatos) {
    usados.set(t.id, (usados.get(t.id) ?? 0) + grupo.usos);
    if (grupo.porId) fortes.set(t.id, (fortes.get(t.id) ?? 0) + grupo.usos);
  }
  const duplicadas = new Map<string, number>();
  const bancos = new Map<string, number>(), referencias = new Map<string, number>();
  const movimentos = new Map<string, LinhaPix[]>(), estornos = new Map<string, LinhaPix[]>();
  const chavePar = (id: string, l: LinhaPix, direcao = l.direcao) => JSON.stringify([id, l.centavos, direcao]);
  for (const l of op.linhas) {
    duplicadas.set(l.fitid, (duplicadas.get(l.fitid) ?? 0) + 1);
    if (l.idBanco) bancos.set(l.idBanco, (bancos.get(l.idBanco) ?? 0) + 1);
    let indice: Map<string, LinhaPix[]> | undefined, chave: string | undefined;
    if (l.natureza === 'movimento' && l.idBanco) { indice = movimentos; chave = chavePar(l.idBanco, l); }
    if (l.natureza === 'estorno' && l.idOriginal) {
      referencias.set(l.idOriginal, (referencias.get(l.idOriginal) ?? 0) + 1);
      indice = estornos; chave = chavePar(l.idOriginal, l);
    }
    if (indice && chave) {
      const lista = indice.get(chave);
      if (lista) lista.push(l);
      else indice.set(chave, [l]);
    }
  }
  const temCandidatos = new Set(planos.filter(p => p.candidatos.length).map(p => p.linha));
  return planos.map(({ linha, candidatos, porId }): ResultadoPix => {
    const resultado = (status: ResultadoPix['status'], motivo: string, alvo?: Transaction): ResultadoPix => ({ linha, candidatos, status, motivo, ...(alvo ? { alvo } : {}) });
    if (!linha.fitid || (duplicadas.get(linha.fitid) ?? 0) > 1) return resultado('revisar', 'Linhas sem identidade única. Confira cada operação.');
    const oposta: TxType = linha.direcao === 'in' ? 'out' : 'in';
    const par = (linha.natureza === 'estorno' && linha.idOriginal
      ? movimentos.get(chavePar(linha.idOriginal, linha, oposta))
      : linha.idBanco ? estornos.get(chavePar(linha.idBanco, linha, oposta)) : undefined) ?? [];
    if (par.length === 1) {
      const original = linha.natureza === 'estorno' ? par[0] : linha;
      const estorno = linha.natureza === 'estorno' ? linha : par[0];
      if (referencias.get(original.idBanco!) !== 1 || bancos.get(original.idBanco!) !== 1
        || estorno.data < original.data || (duplicadas.get(par[0].fitid) ?? 0) > 1) return resultado('revisar', 'Vínculo de estorno ambíguo.');
      if (candidatos.length || temCandidatos.has(par[0])) return resultado('revisar', 'O original pode estar lançado. Confira o estorno antes de ajustar.');
      return resultado('ignorar', 'Estorno integral vinculado à operação, sem lançamento no app.');
    }
    if (par.length > 1) return resultado('revisar', 'Mais de um vínculo de estorno.');
    if (linha.natureza === 'cofrinho') return resultado(candidatos.length ? 'revisar' : 'ignorar', 'Movimentação do cofrinho do banco não é gasto.');
    if (linha.natureza === 'fatura') return resultado('revisar', 'Pode ser pagamento da fatura do cartão: confira em Crédito. Se for outra conta, lance à mão em\u00a0Lançamentos.');
    if (linha.natureza === 'estorno') return resultado('revisar', 'Estorno sem par integral comprovado exige revisão.');
    if (linha.natureza === 'transferencia') return resultado('revisar', 'Confirme a titularidade e use a transferência entre carteiras.');
    if (candidatos.length === 0) {
      if (haCreditoPerto(linha)) {
        return resultado('revisar', 'Há uma compra no crédito com este valor. Confira antes de lançar no caixa.');
      }
      return resultado('falta', 'Nenhum lançamento de caixa encontrado.');
    }
    if (!porId && candidatos.length === 1 && fortes.has(candidatos[0].id)) {
      return resultado('revisar', 'Este valor já foi conferido em outra linha. Se for outro Pix, lance à mão em Lançamentos.');
    }
    if (candidatos.length !== 1 || (porId ? fortes.get(candidatos[0].id) !== 1
      : (usados.get(candidatos[0].id) ?? 0) !== 1)) return resultado('revisar', 'Mais de uma correspondência possível.');
    const alvo = candidatos[0];
    if (!igualValor(alvo, linha) || distancia(alvo.occurred_on, linha.data) > 3 || (!porId && alvo.fitid && alvo.fitid !== linha.fitid)) {
      return resultado('revisar', 'Identificador bancário ou lançamento em conflito.');
    }
    if (alvo.occurred_on !== linha.data && ehPagamentoDeFatura(alvo)) return resultado('revisar', 'Pagamento de fatura. Confira a data na tela de Crédito.');
    if (alvo.occurred_on !== linha.data && serieRecorrente(alvo) && alvo.occurred_on.slice(0, 7) !== linha.data.slice(0, 7)) {
      return resultado('revisar', 'Esta conta se repete todo mês e já está lançada. Deixe a data como está para ela não ser lançada duas\u00a0vezes.');
    }
    return resultado(alvo.occurred_on === linha.data ? 'conciliado' : 'data', alvo.occurred_on === linha.data ? 'Já confere.' : 'Corrigir somente a data do lançamento existente.', alvo);
  });
}
