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

module.exports = { resumo, status };
