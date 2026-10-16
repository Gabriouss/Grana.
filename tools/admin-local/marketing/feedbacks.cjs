'use strict';
// Feedbacks do app no painel local: leitura e gestão (estado, prioridade, responsável, etiquetas,
// evidência de resolução). Dono: Anvil. Decisão do autor em 16/10/2026: a gestão de marketing vive
// SÓ no painel local, então isto substitui, para o uso diário, a tela do /admin web (que fica parada).
//
// Como fala com o banco: o servidor do painel é Node, local, e já guarda SUPABASE_SERVICE_ROLE_KEY no
// processo (a ponte da fila de ajustes usa a mesma). Lê `feedbacks` e `feedback_gestao` por REST e
// grava pela RPC `feedback_gestao_atualizar`, que grava estado e histórico na MESMA transação e só a
// service_role executa. A chave nunca vai ao navegador, a resposta ou o log.
//
// As regras são as de supabase/functions/_shared/admin-feedbacks.ts (a Edge Function do /admin web),
// espelhadas aqui porque o painel é CommonJS e não importa TypeScript de Deno. Um teste de paridade
// (__tests__/admin-feedbacks-local.cjs) executa os DOIS validadores sobre o mesmo conjunto de pedidos.
//
// LGPD: o DTO não leva user_id, device_info nem screenshot_url (só diz se há conta vinculada); o
// texto do feedback e a evidência nunca vão a log; erro do banco vira só um código fixo.

const cfg = require('../config.cjs');
const { ErroMarketing } = require('./catalogo.cjs');

const PRAZO_MS = 10_000;
const POR_PAGINA = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const VERSAO = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/;
const ETIQUETA = /^[0-9A-Za-zÀ-ÿ][0-9A-Za-zÀ-ÿ -]{0,29}$/;
const TIPOS = new Set(['suggestion', 'bug', 'praise', 'other']);
const STATUS = new Set(['pending', 'reviewed', 'resolved']);
const ESTADOS = new Set(['novo', 'em_analise', 'planejado', 'em_execucao', 'resolvido', 'arquivado']);
const PRIORIDADES = new Set(['baixa', 'media', 'alta']);
const RECUSA_RESOLVIDO = 'resolvido-exige-evidencia-e-versao';

const invalido = () => new ErroMarketing('pedido-invalido', 'O pedido de feedback não está no formato esperado.', 400);
const data = (v) => {
  if (typeof v !== 'string' || !ISO.test(v) || !Number.isFinite(Date.parse(v))) throw invalido();
  return new Date(v).toISOString();
};

// ---------- validação dos pedidos (espelho do validador do /admin web) ----------

function validarFiltros(q) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) throw invalido();
  const permitidos = ['status', 'tipo', 'nota', 'versao', 'desde', 'ate', 'antesDe'];
  if (Object.keys(q).some((k) => !permitidos.includes(k))) throw invalido();
  const s = {};
  if (q.status !== undefined) { if (typeof q.status !== 'string' || !STATUS.has(q.status)) throw invalido(); s.status = q.status; }
  if (q.tipo !== undefined) { if (typeof q.tipo !== 'string' || !TIPOS.has(q.tipo)) throw invalido(); s.tipo = q.tipo; }
  if (q.nota !== undefined) { if (typeof q.nota !== 'number' || !Number.isInteger(q.nota) || q.nota < 1 || q.nota > 5) throw invalido(); s.nota = q.nota; }
  if (q.versao !== undefined) { if (typeof q.versao !== 'string' || !VERSAO.test(q.versao)) throw invalido(); s.versao = q.versao; }
  if (q.desde !== undefined) s.desde = data(q.desde);
  if (q.ate !== undefined) s.ate = data(q.ate);
  if (s.desde && s.ate && s.desde > s.ate) throw invalido();
  if (q.antesDe !== undefined) s.antesDe = data(q.antesDe);
  return s;
}

function textoLivre(v, max) {
  if (v === null) return null;
  if (typeof v !== 'string') throw invalido();
  const t = v.trim();
  if (t.length < 1 || t.length > max || /[\u0000-\u001f\u007f]/.test(t)) throw invalido();
  return t;
}

function validarGestao(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw invalido();
  const permitidos = ['id', 'estado', 'prioridade', 'responsavel', 'etiquetas', 'evidencia', 'versaoResolucao', 'confirmacao'];
  if (Object.keys(p).some((k) => !permitidos.includes(k))) throw invalido();
  if (typeof p.id !== 'string' || !UUID.test(p.id)) throw invalido();
  const s = { id: p.id };
  if (p.estado !== undefined) { if (typeof p.estado !== 'string' || !ESTADOS.has(p.estado)) throw invalido(); s.estado = p.estado; }
  if (p.prioridade !== undefined) {
    if (p.prioridade !== null && (typeof p.prioridade !== 'string' || !PRIORIDADES.has(p.prioridade))) throw invalido();
    s.prioridade = p.prioridade;
  }
  if (p.responsavel !== undefined) s.responsavel = textoLivre(p.responsavel, 80);
  if (p.evidencia !== undefined) s.evidencia = textoLivre(p.evidencia, 500);
  if (p.versaoResolucao !== undefined) {
    const v = textoLivre(p.versaoResolucao, 40);
    if (v !== null && !VERSAO.test(v)) throw invalido();
    s.versaoResolucao = v;
  }
  if (p.etiquetas !== undefined) {
    if (!Array.isArray(p.etiquetas) || p.etiquetas.length > 8) throw invalido();
    const vistas = new Set();
    for (const e of p.etiquetas) {
      if (typeof e !== 'string') throw invalido();
      const t = e.trim().replace(/\s+/g, ' ');
      if (!ETIQUETA.test(t)) throw invalido();
      vistas.add(t.toLowerCase());
    }
    s.etiquetas = [...vistas];
  }
  if (Object.keys(s).length === 1) throw invalido(); // nada a mudar
  // Resolvido exige evidência E versão. Aqui só o que se vê no pedido; o banco confere o estado resultante.
  if (s.estado === 'resolvido' && (s.evidencia === null || s.versaoResolucao === null)) throw invalido();
  // Arquivar tira o item da triagem: só com a confirmação explícita do diálogo.
  if (s.estado === 'arquivado' && p.confirmacao !== true) {
    throw new ErroMarketing('confirmacao-obrigatoria', 'Arquivar pede a confirmação explícita.', 400);
  }
  return s;
}

// ---------- DTOs fechados ----------

const textoOuNulo = (v, max) => {
  if (v == null) return null;
  if (typeof v !== 'string' || v.length > max) throw new Error('formato');
  return v;
};
const gestaoPadrao = () => ({ estado: 'novo', prioridade: null, responsavel: null, etiquetas: [], evidencia: null, versaoResolucao: null, atualizadoEm: null });

function gestaoDto(g) {
  if (!g) return gestaoPadrao();
  if (typeof g.estado !== 'string' || !ESTADOS.has(g.estado)
    || (g.prioridade != null && (typeof g.prioridade !== 'string' || !PRIORIDADES.has(g.prioridade)))
    || !Array.isArray(g.etiquetas) || g.etiquetas.length > 8 || g.etiquetas.some((e) => typeof e !== 'string' || e.length > 30)) {
    throw new Error('formato');
  }
  return {
    estado: g.estado, prioridade: g.prioridade ?? null, responsavel: textoOuNulo(g.responsavel, 80), etiquetas: g.etiquetas,
    evidencia: textoOuNulo(g.evidencia, 500), versaoResolucao: textoOuNulo(g.versao_resolucao, 40),
    atualizadoEm: typeof g.atualizado_em === 'string' && Number.isFinite(Date.parse(g.atualizado_em)) ? new Date(g.atualizado_em).toISOString() : null,
  };
}

function feedbackDto(r) {
  if (typeof r.id !== 'string' || !UUID.test(r.id) || typeof r.type !== 'string' || !TIPOS.has(r.type)
    || typeof r.status !== 'string' || !STATUS.has(r.status) || typeof r.message !== 'string'
    || r.message.length < 1 || r.message.length > 2000 || typeof r.public_use_consent !== 'boolean'
    || typeof r.created_at !== 'string' || !Number.isFinite(Date.parse(r.created_at))
    || (r.rating != null && (typeof r.rating !== 'number' || !Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5))) {
    throw new Error('formato');
  }
  return {
    id: r.id, tipo: r.type, nota: r.rating ?? null, mensagem: r.message, status: r.status,
    versaoApp: textoOuNulo(r.app_version, 40), plataforma: textoOuNulo(r.platform, 40),
    usoPublicoAutorizado: r.public_use_consent, temConta: r.user_id != null,
    criadoEm: new Date(r.created_at).toISOString(), gestao: gestaoPadrao(),
  };
}

// ---------- acesso ao banco ----------

function criar({ fetch: fazer = fetch, config = cfg } = {}) {
  function conexao() {
    if (!config.tem('SUPABASE_SERVICE_ROLE_KEY')) return { ausente: 'SUPABASE_SERVICE_ROLE_KEY não está no .env; o painel não consegue ler os feedbacks.' };
    const url = config.ler('EXPO_PUBLIC_SUPABASE_URL');
    if (!url || !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) return { ausente: 'EXPO_PUBLIC_SUPABASE_URL ausente ou fora do formato.' };
    const chave = config.ler('SUPABASE_SERVICE_ROLE_KEY');
    return { base: `${url.replace(/\/+$/, '')}/rest/v1`, cab: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' } };
  }

  async function pedir(c, caminho, init = {}) {
    let r;
    try { r = await fazer(c.base + caminho, { ...init, headers: { ...c.cab, ...(init.headers || {}) }, signal: AbortSignal.timeout(PRAZO_MS) }); }
    catch { throw Object.assign(new Error('sem-resposta'), { codigo: 'feedbacks-sem-resposta' }); }
    if (!r.ok) {
      // Nunca o corpo do erro: pode repetir o valor digitado. Só o código SQL, quando o banco o dá.
      let sql = null;
      try { const j = await r.json(); if (j && typeof j.code === 'string' && /^[0-9A-Z]{5}$/.test(j.code)) sql = j.code; } catch { /* corpo ilegível */ }
      throw Object.assign(new Error('http'), { codigo: 'feedbacks-http', status: r.status, sql });
    }
    return r.status === 204 ? null : r.json().catch(() => null);
  }

  async function listarFeedbacks(_raiz, filtros = {}) {
    const c = conexao();
    if (c.ausente) return { status: 'ausente', motivo: c.ausente, feedbacks: [], haMais: false, gestaoDisponivel: false };
    const f = validarFiltros(filtros);
    const q = ['select=id,type,rating,message,status,app_version,platform,public_use_consent,user_id,created_at'];
    if (f.status) q.push(`status=eq.${f.status}`);
    if (f.tipo) q.push(`type=eq.${f.tipo}`);
    if (f.nota) q.push(`rating=eq.${f.nota}`);
    if (f.versao) q.push(`app_version=eq.${encodeURIComponent(f.versao)}`);
    if (f.desde) q.push(`created_at=gte.${encodeURIComponent(f.desde)}`);
    if (f.ate) q.push(`created_at=lte.${encodeURIComponent(f.ate)}`);
    if (f.antesDe) q.push(`created_at=lt.${encodeURIComponent(f.antesDe)}`);
    q.push('order=created_at.desc', `limit=${POR_PAGINA + 1}`);
    let linhas;
    try { linhas = await pedir(c, `/feedbacks?${q.join('&')}`); }
    catch (e) { throw new ErroMarketing(e.codigo || 'feedbacks-falhou', 'Não foi possível ler os feedbacks. Tente de novo.', 503); }
    if (!Array.isArray(linhas)) throw new ErroMarketing('feedbacks-formato', 'O banco devolveu uma resposta que o painel não entende.', 502);
    let pagina;
    try { pagina = linhas.slice(0, POR_PAGINA).map(feedbackDto); }
    catch { throw new ErroMarketing('feedbacks-formato', 'O banco devolveu uma resposta que o painel não entende.', 502); }
    let gestaoDisponivel = true;
    if (pagina.length) {
      try {
        const g = await pedir(c, `/feedback_gestao?select=feedback_id,estado,prioridade,responsavel,etiquetas,evidencia,versao_resolucao,atualizado_em&feedback_id=in.(${pagina.map((p) => p.id).join(',')})`);
        if (!Array.isArray(g)) throw new Error('formato');
        const porId = new Map(g.map((x) => [x.feedback_id, x]));
        for (const p of pagina) p.gestao = gestaoDto(porId.get(p.id));
      } catch (e) {
        // 404: a migration da gestão ainda não foi aplicada. A lista continua, a gestão fica desligada
        // e a tela diz por quê. Qualquer outra falha derruba a leitura, em vez de mostrar tudo como "novo".
        if (e.status === 404) gestaoDisponivel = false;
        else throw new ErroMarketing('feedbacks-gestao-falhou', 'Não foi possível ler a gestão dos feedbacks. Tente de novo.', 503);
      }
    }
    return { status: 'ok', feedbacks: pagina, haMais: linhas.length > POR_PAGINA, gestaoDisponivel };
  }

  async function atualizarGestao(_raiz, corpo) {
    const c = conexao();
    if (c.ausente) throw new ErroMarketing('feedbacks-ausente', c.ausente, 503);
    const p = validarGestao(corpo);
    const patch = {};
    if (p.estado !== undefined) patch.estado = p.estado;
    if (p.prioridade !== undefined) patch.prioridade = p.prioridade;
    if (p.responsavel !== undefined) patch.responsavel = p.responsavel;
    if (p.etiquetas !== undefined) patch.etiquetas = p.etiquetas;
    if (p.evidencia !== undefined) patch.evidencia = p.evidencia;
    if (p.versaoResolucao !== undefined) patch.versao_resolucao = p.versaoResolucao;
    let linha;
    try {
      const r = await pedir(c, '/rpc/feedback_gestao_atualizar', { method: 'POST', body: JSON.stringify({ p_id: p.id, p_por: null, p_patch: patch }) });
      linha = Array.isArray(r) ? r[0] : r;
    } catch (e) {
      if (e.sql === '23514') return { id: p.id, recusa: RECUSA_RESOLVIDO };
      if (e.status === 404) throw new ErroMarketing('gestao-nao-aplicada', 'A gestão de feedbacks ainda não foi aplicada no banco.', 503);
      if (e.sql === 'P0002') throw new ErroMarketing('feedback-inexistente', 'Esse feedback não existe mais.', 404);
      throw new ErroMarketing(e.codigo || 'feedbacks-falhou', 'Não foi possível salvar a gestão. Nada foi gravado.', 503);
    }
    if (!linha) throw new ErroMarketing('feedbacks-formato', 'O banco devolveu uma resposta que o painel não entende.', 502);
    try { return { id: p.id, gestao: gestaoDto(linha) }; }
    catch { throw new ErroMarketing('feedbacks-formato', 'O banco devolveu uma resposta que o painel não entende.', 502); }
  }

  return { listarFeedbacks, atualizarGestao };
}

const padrao = criar();
module.exports = {
  listarFeedbacks: padrao.listarFeedbacks,
  atualizarGestaoFeedback: padrao.atualizarGestao,
  _criar: criar, _validarFiltros: validarFiltros, _validarGestao: validarGestao, RECUSA_RESOLVIDO,
};
