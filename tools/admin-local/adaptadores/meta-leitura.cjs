'use strict';
// Mesmo coletor/DTO E4; credenciais somente no processo Node.
const { backend } = require('./marketing-backend.cjs');
const { carregar } = require('./_contratos-marketing.cjs');
module.exports = {
  ler: (pedido = {}) => backend().meta(pedido),
  periodosMeta: carregar('supabase/functions/_shared/admin-meta.ts').periodosMeta,
  CONFIG: ['META_READ_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_GRAPH_API_VERSION'],
};
