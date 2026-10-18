'use strict';
// Mesmo coletor/DTO E4; credenciais somente no processo Node.
// O bloco `cakto` do DTO vem da API da Cakto (lista completa de pedidos), lido aqui no Node.
const { backend } = require('./marketing-backend.cjs');
const { carregar } = require('./_contratos-marketing.cjs');
const cakto = require('./cakto.cjs');
module.exports = {
  ler: async (pedido = {}) => {
    const dados = await backend().meta(pedido);
    return { ...dados, cakto: await cakto.resultados(dados.periodos) };
  },
  periodosMeta: carregar('supabase/functions/_shared/admin-meta.ts').periodosMeta,
  CONFIG: ['META_READ_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_GRAPH_API_VERSION'],
};
