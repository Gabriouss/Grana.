import { parseCsvTextDetalhado, splitCsvLine } from './heuristics';
import { parseOfx } from './ofx-parser';
import { LIMITS } from './limits';
import type { Transaction, TxType } from './types';

export type LinhaPix = {
  id: string; fitid: string; idBanco: string | null; idOriginal?: string | null;
  data: string; centavos: number; direcao: TxType; descricao: string; categoria: string; cor: string;
  natureza: 'movimento' | 'cofrinho' | 'estorno' | 'fatura' | 'transferencia';
};
export type ResultadoPix = {
  linha: LinhaPix; status: 'conciliado' | 'falta' | 'data' | 'revisar' | 'ignorar';
  candidatos: Transaction[]; alvo?: Transaction; motivo: string;
};
const normal = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const falhar = (): never => { throw new Error('Não foi possível ler todas as linhas. Use CSV em reais com Data (DD/MM/AAAA), Descrição e Valor com sinal, ou OFX da conta em BRL.'); };
function diaCivil(raw: string): string {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!iso && !br) return falhar();
  const [ano, mes, dia] = iso ? iso.slice(1).map(Number) : [Number(br![3]), Number(br![2]), Number(br![1])];
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
  if (/pagamento (da |de )?fatura|fatura (do |de )?cartao/.test(s)) return 'fatura';
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
  return campos.map((c, i) => {
    if (c.length !== cabecalho.length || !c[desc]?.trim() || (moeda >= 0 && c[moeda]?.toUpperCase() !== 'BRL')) return falhar();
    const dia = diaCivil(c[data]?.trim() ?? '');
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
      data: dia, centavos: centavos(row.amount), direcao, descricao: row.description, categoria: row.category, cor: row.color, natureza: natureza(row.description) };
  });
}

/** ±3 dias geram candidatos; nunca desempata pelo nome, pela ordem ou pela proximidade. */
export function conciliarPix(op: { userId: string; carteiraId: string; principalId: string; linhas: LinhaPix[]; lancamentos: Transaction[] }): ResultadoPix[] {
  const transacoes = op.lancamentos.filter(t => t.user_id === op.userId && (t.wallet_id ?? op.principalId) === op.carteiraId
    && !t.card_id && t.payment_method !== 'credit');
  const distancia = (a: string, b: string) => Math.abs(Date.parse(diaCivil(a) + 'T00:00:00Z') - Date.parse(diaCivil(b) + 'T00:00:00Z')) / 86_400_000;
  const igualValor = (t: Transaction, l: LinhaPix) => Number.isFinite(t.amount) && Math.round(t.amount * 100) === l.centavos && t.type === l.direcao;
  const planos = op.linhas.map(linha => {
    const porId = linha.fitid ? transacoes.filter(t => t.fitid === linha.fitid) : [];
    const candidatos = porId.length ? porId : transacoes.filter(t => igualValor(t, linha) && distancia(t.occurred_on, linha.data) <= 3);
    return { linha, candidatos, porId: porId.length > 0 };
  });
  const usados = new Map<string, number>();
  const fortes = new Map<string, number>();
  for (const p of planos) for (const t of p.candidatos) usados.set(t.id, (usados.get(t.id) ?? 0) + 1);
  for (const p of planos) if (p.porId) for (const t of p.candidatos) fortes.set(t.id, (fortes.get(t.id) ?? 0) + 1);
  const duplicadas = new Map<string, number>();
  for (const l of op.linhas) duplicadas.set(l.fitid, (duplicadas.get(l.fitid) ?? 0) + 1);
  return planos.map(({ linha, candidatos, porId }): ResultadoPix => {
    const resultado = (status: ResultadoPix['status'], motivo: string, alvo?: Transaction): ResultadoPix => ({ linha, candidatos, status, motivo, ...(alvo ? { alvo } : {}) });
    if (!linha.fitid || (duplicadas.get(linha.fitid) ?? 0) > 1) return resultado('revisar', 'Linhas sem identidade única. Confira cada operação.');
    const par = linha.natureza === 'estorno' && linha.idOriginal
      ? op.linhas.filter(l => l.idBanco === linha.idOriginal && l.natureza === 'movimento' && l.centavos === linha.centavos && l.direcao !== linha.direcao)
      : op.linhas.filter(l => !!linha.idBanco && !!l.idOriginal && l.natureza === 'estorno' && l.idOriginal === linha.idBanco && l.centavos === linha.centavos && l.direcao !== linha.direcao);
    if (par.length === 1) {
      const original = linha.natureza === 'estorno' ? par[0] : linha;
      const estorno = linha.natureza === 'estorno' ? linha : par[0];
      const referencias = op.linhas.filter(l => !!l.idOriginal && l.natureza === 'estorno' && l.idOriginal === original.idBanco);
      if (referencias.length !== 1 || op.linhas.filter(l => !!l.idBanco && l.idBanco === original.idBanco).length !== 1
        || estorno.data < original.data || (duplicadas.get(par[0].fitid) ?? 0) > 1) return resultado('revisar', 'Vínculo de estorno ambíguo.');
      const outros = planos.filter(p => p.linha === par[0]);
      if (candidatos.length || outros.some(p => p.candidatos.length)) return resultado('revisar', 'O original pode estar lançado. Confira o estorno antes de ajustar.');
      return resultado('ignorar', 'Estorno integral vinculado à operação, sem lançamento no app.');
    }
    if (par.length > 1) return resultado('revisar', 'Mais de um vínculo de estorno.');
    if (linha.natureza === 'cofrinho') return resultado(candidatos.length ? 'revisar' : 'ignorar', 'Movimentação do cofrinho do banco não é gasto.');
    if (linha.natureza === 'fatura') return resultado('revisar', 'Confira o pagamento na tela de Crédito. Não é despesa comum.');
    if (linha.natureza === 'estorno') return resultado('revisar', 'Estorno sem par integral comprovado exige revisão.');
    if (linha.natureza === 'transferencia') return resultado('revisar', 'Confirme a titularidade e use a transferência entre carteiras.');
    if (candidatos.length === 0) return resultado('falta', 'Nenhum lançamento de caixa encontrado.');
    if (candidatos.length !== 1 || (porId ? fortes.get(candidatos[0].id) !== 1
      : (usados.get(candidatos[0].id) ?? 0) !== 1 || fortes.has(candidatos[0].id))) return resultado('revisar', 'Mais de uma correspondência possível.');
    const alvo = candidatos[0];
    if (!igualValor(alvo, linha) || distancia(alvo.occurred_on, linha.data) > 3 || (!porId && alvo.fitid && alvo.fitid !== linha.fitid)) {
      return resultado('revisar', 'Identificador bancário ou lançamento em conflito.');
    }
    return resultado(alvo.occurred_on === linha.data ? 'conciliado' : 'data', alvo.occurred_on === linha.data ? 'Já confere.' : 'Corrigir somente a data do lançamento existente.', alvo);
  });
}
