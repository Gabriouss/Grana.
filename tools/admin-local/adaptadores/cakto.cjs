'use strict';
// Cakto (dono: Keel). Só leitura de pedidos, agregados.
//
// OAuth2 client credentials (docs.cakto.com.br/authentication) e
// GET /public_api/orders/ (docs.cakto.com.br/api-reference/orders/list).
// Ao navegador só contagens e somas por período; nenhuma linha de comprador/pedido.

const { ler, tem, registrarSegredo } = require('../config.cjs');
const { pedirJson, ErroIntegracao } = require('./_http.cjs');

const API = 'https://api.cakto.com.br/public_api';
let token = null; // { valor, expiraEm }

async function obterToken() {
  if (token && Date.now() < token.expiraEm - 60_000) return token.valor;
  const r = await pedirJson('Cakto', `${API}/token/`, {
    metodo: 'POST',
    form: { client_id: ler('CAKTO_CLIENT_ID'), client_secret: ler('CAKTO_CLIENT_SECRET') },
  });
  if (r.status >= 400 || !r.dados || !r.dados.access_token) {
    throw new ErroIntegracao('cakto-token', `Cakto: não consegui autenticar (HTTP ${r.status}). A credencial do .env pode ter sido trocada.`);
  }
  registrarSegredo(r.dados.access_token);
  token = { valor: r.dados.access_token, expiraEm: Date.now() + (Number(r.dados.expires_in) || 3600) * 1000 };
  return token.valor;
}

function dataLocal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function resumo() {
  if (!tem('CAKTO_CLIENT_ID') || !tem('CAKTO_CLIENT_SECRET')) {
    return { status: 'ausente', motivo: 'CAKTO_CLIENT_ID e CAKTO_CLIENT_SECRET não estão no .env.' };
  }
  const t = await obterToken();
  const desde = new Date(Date.now() - 30 * 86_400_000);
  const url = `${API}/orders/?limit=100&ordering=-createdAt&createdAt__gte=${dataLocal(desde)}`;
  const r = await pedirJson('Cakto', url, { cabecalhos: { Authorization: `Bearer ${t}` } });
  if (r.status === 404) return { status: 'ausente', motivo: 'A API pública da Cakto não expôs pedidos para esta conta.' };
  if (r.status >= 400) throw new ErroIntegracao('cakto-http', `Cakto: HTTP ${r.status} ao listar pedidos.`);
  const pedidos = (r.dados && r.dados.results) || [];

  const agora = Date.now();
  const porStatus = {};
  let pagos30 = 0, valor30 = 0, pagos7 = 0, valor7 = 0, pagosHoje = 0, valorHoje = 0;
  const hoje = dataLocal(new Date());
  const STATUS = new Set(['paid', 'refunded', 'chargedback', 'waiting_payment', 'canceled', 'refused']);
  for (const p of pedidos) {
    const status = STATUS.has(p.status) ? p.status : 'outros';
    porStatus[status] = (porStatus[status] || 0) + 1;
    if (p.status !== 'paid' || !p.paidAt) continue;
    const quando = Date.parse(p.paidAt);
    const valor = Number(p.amount);
    if (!Number.isFinite(quando) || quando > agora || agora - quando > 30 * 86_400_000 || !Number.isFinite(valor) || valor < 0) continue;
    pagos30 += 1; valor30 += valor;
    if (agora - quando <= 7 * 86_400_000) { pagos7 += 1; valor7 += valor; }
    if (dataLocal(new Date(quando)) === hoje) { pagosHoje += 1; valorHoje += valor; }
  }
  const centavos = (v) => Math.round(v * 100) / 100;
  return {
    status: 'ok',
    periodo: 'últimos 30 dias, até 100 pedidos',
    totalNoPeriodo: r.dados && typeof r.dados.count === 'number' ? r.dados.count : pedidos.length,
    porStatus,
    pagos: {
      hoje: { pedidos: pagosHoje, valor: centavos(valorHoje) },
      ultimos7: { pedidos: pagos7, valor: centavos(valor7) },
      ultimos30: { pedidos: pagos30, valor: centavos(valor30) },
      moeda: 'BRL',
    },
    amostra: { pedidosLidos: pedidos.length, limite: 100, completa: !(r.dados && typeof r.dados.count === 'number' && r.dados.count > pedidos.length) },
  };
}

async function status() {
  const r = await resumo();
  if (r.status !== 'ok') return r;
  return { status: 'ok', pagos30: r.pagos.ultimos30 };
}

// ---- Resultados de marketing (as três medidas da Cakto) ----

const MAX_PAGINAS = 20;

// "39.90" -> 3990, sem soma de ponto flutuante. Formato estranho invalida a leitura inteira.
function centavos(v) {
  const s = typeof v === 'number' ? v.toFixed(2) : v;
  if (typeof s !== 'string' || !/^\d{1,12}(?:\.\d{1,2})?$/.test(s)) return null;
  const [reais, cents = ''] = s.split('.');
  return Number(reais) * 100 + Number(cents.padEnd(2, '0'));
}

// Data do período (AAAA-MM-DD, dia em São Paulo) -> instante da meia-noite local.
// São Paulo está em UTC-3 fixo desde o fim do horário de verão (2019).
const meiaNoiteSP = (dia) => Date.parse(`${dia}T00:00:00-03:00`);
const dentro = (iso, intervalo) => {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isFinite(t) && t >= meiaNoiteSP(intervalo.desde) && t < meiaNoiteSP(intervalo.ateExclusivo);
};

/**
 * Função pura sobre a lista COMPLETA de pedidos da conta.
 * - Novas assinaturas pagas: a primeira cobrança paga de cada assinatura, pelo paidAt
 *   no período. Assinatura estornada (pedido refunded/chargedback) não conta: decisão
 *   do autor de 17/10/2026, ela aparece só nos reembolsos.
 * - Receita bruta confirmada: soma de `amount` dos pedidos com paidAt no período,
 *   inclusive renovações, antes de reversões.
 * - Reembolsos e chargebacks: soma de `amount` pela data da reversão, no período em que ela ocorreu.
 * Lista incompleta ou valor ilegível devolve null, nunca um número presumido.
 */
function medidasCakto(pedidos, periodos, completo) {
  if (!completo) return { estado: 'parcial', motivo: 'lista-de-pedidos-incompleta', novasAssinaturas: null, receitaConfirmadaCentavos: null, reembolsosCentavos: null };
  const primeira = new Map(); // assinatura -> pedido pago mais antigo
  for (const p of pedidos) {
    if (!p || !p.paidAt || !p.subscription) continue;
    const atual = primeira.get(p.subscription);
    if (!atual || Date.parse(p.paidAt) < Date.parse(atual.paidAt)) primeira.set(p.subscription, p);
  }
  const ESTORNADO = new Set(['refunded', 'chargedback']);
  const medir = (intervalo) => {
    let novas = 0, receita = 0, reversoes = 0;
    for (const p of pedidos) {
      if (p.paidAt && dentro(p.paidAt, intervalo)) {
        const v = centavos(p.amount); if (v === null) return null;
        receita += v;
        const ehPrimeira = !p.subscription || primeira.get(p.subscription) === p;
        if (ehPrimeira && !ESTORNADO.has(p.status)) novas += 1;
      }
      const reversao = p.chargedbackAt || p.refundedAt;
      if (reversao && dentro(reversao, intervalo)) {
        const v = centavos(p.amount); if (v === null) return null;
        reversoes += v;
      }
    }
    return { novasAssinaturas: novas, receitaConfirmadaCentavos: receita, reembolsosCentavos: reversoes };
  };
  const atual = medir(periodos.atual), anterior = medir(periodos.anterior);
  if (!atual || !anterior) return { estado: 'indisponivel', motivo: 'valor-ilegivel', novasAssinaturas: null, receitaConfirmadaCentavos: null, reembolsosCentavos: null };
  return { estado: 'completo', ...atual, anterior };
}

// Todas as páginas de pedidos da conta. `completo` só quando a última página não aponta outra.
async function todosOsPedidos() {
  const t = await obterToken();
  const pedidos = [];
  let url = `${API}/orders/?limit=100&ordering=createdAt`;
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const r = await pedirJson('Cakto', url, { cabecalhos: { Authorization: `Bearer ${t}` } });
    if (r.status >= 400 || !r.dados || !Array.isArray(r.dados.results)) throw new ErroIntegracao('cakto-http', `Cakto: HTTP ${r.status} ao listar pedidos.`);
    pedidos.push(...r.dados.results);
    if (!r.dados.next) return { pedidos, completo: typeof r.dados.count !== 'number' || r.dados.count === pedidos.length };
    // Só segue a próxima página se ela continuar na API da Cakto (o token vai junto).
    if (typeof r.dados.next !== 'string' || !r.dados.next.startsWith(`${API}/orders/`)) return { pedidos, completo: false };
    url = r.dados.next;
  }
  return { pedidos, completo: false };
}

async function resultados(periodos, agora = new Date()) {
  const vazio = { novasAssinaturas: null, receitaConfirmadaCentavos: null, reembolsosCentavos: null };
  if (!tem('CAKTO_CLIENT_ID') || !tem('CAKTO_CLIENT_SECRET')) return { estado: 'nao-configurado', ...vazio };
  try {
    const { pedidos, completo } = await todosOsPedidos();
    return { ...medidasCakto(pedidos, periodos, completo), atualizadoEm: agora.toISOString() };
  } catch (e) {
    console.error('[painel] cakto-resultados-indisponivel', e.codigo || 'erro');
    return { estado: 'indisponivel', motivo: e.codigo || 'consulta-indisponivel', ...vazio };
  }
}

module.exports = { resumo, status, resultados, medidasCakto };
