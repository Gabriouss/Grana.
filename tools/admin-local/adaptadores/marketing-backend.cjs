'use strict';
// Servidor Node: senha+TOTP/CSRF do painel em loopback. Nenhum JWT humano
// ou configuração de transporte/destinatário vem do navegador.
const config = require('../config.cjs');
const { carregar } = require('./_contratos-marketing.cjs');
const { ErroMarketing } = require('../marketing/catalogo.cjs');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONFIG_REMOTA = ['EXPO_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_MARKETING_USER_ID'];

function criarBackend({ configuracao = config, rede = fetch, cliente: criarCliente, relogio = () => new Date(), log = linha => console.error(linha) } = {}) {
  const env = nome => configuracao.ler(nome) || undefined;
  const meta = carregar('supabase/functions/_shared/admin-meta.ts').criarOperacaoMeta(env, rede);
  const analytics = carregar('supabase/functions/_shared/admin-analytics.ts').criarOperacaoAnalytics(env, rede);
  const simulacao = carregar('supabase/functions/_shared/admin-publicacoes-simulacao.ts').operacaoPublicacoesSimulacao;
  const notificacoes = carregar('supabase/functions/_shared/admin-marketing.ts').operacaoMarketing;
  let cliente;
  function remoto() {
    const faltantes = CONFIG_REMOTA.filter(k => !env(k));
    if (faltantes.length) return { status: 'indisponivel', motivo: 'configuracao-remota-ausente', faltantes };
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(env(CONFIG_REMOTA[0])) || !UUID.test(env(CONFIG_REMOTA[2]))) {
      return { status: 'indisponivel', motivo: 'configuracao-remota-invalida' };
    }
    if (!cliente) {
      const factory = criarCliente || require('@supabase/supabase-js').createClient;
      cliente = factory(env(CONFIG_REMOTA[0]), env(CONFIG_REMOTA[1]), {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (url, init) => rede(url, { ...init, redirect: 'error' }) },
      });
    }
    return null;
  }
  async function executar(op, corpo, exigeRemoto = false) {
    let pedido;
    try { pedido = op.validar(corpo); } catch { throw new ErroMarketing('pedido-invalido', 'Pedido de marketing inválido.', 400); }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      if (exigeRemoto) { const falta = remoto(); if (falta) return falta; }
      const r = await op.executar(cliente, pedido, { userId: env('ADMIN_MARKETING_USER_ID'), agora: relogio(), signal: controller.signal });
      return r.dados;
    } catch {
      // Mensagens do SDK/rede podem conter segredo ou dados de terceiros.
      log('[painel] marketing-fonte-indisponivel');
      throw new ErroMarketing('fonte-indisponivel', 'Fonte indisponível. Confira configuração, permissões e aplicação da fundação. Nenhum resultado foi presumido.', 503);
    } finally { clearTimeout(timer); }
  }
  return {
    meta: (p = {}) => executar(meta, { recurso: 'meta-leitura', ...p }),
    analytics: (janela = 'semana-anterior') => executar(analytics, { recurso: 'analytics-leitura', janela }),
    simulacao: async p => ({ ...await executar(simulacao, p, true), modo: 'simulacao' }),
    notificacoes: p => executar(notificacoes, p, true),
  };
}
let instancia;
const backend = () => instancia || (instancia = criarBackend());
module.exports = { criarBackend, backend, CONFIG_REMOTA };
