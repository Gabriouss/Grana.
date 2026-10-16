'use strict';
/*
 * Gestão de feedbacks no painel local (16/10/2026).
 *
 *   node __tests__/admin-feedbacks-local.cjs
 *
 * Executa o módulo real do painel (marketing/feedbacks.cjs), a tela real (web/telas/feedbacks.js) e,
 * para a paridade, o validador REAL da Edge Function (admin-feedbacks.ts, transpilado em memória).
 * Só a rede (fetch) e o DOM são dublês. Asserta QUAIS chamadas aconteceram: leitura só por GET em
 * feedbacks e feedback_gestao, escrita só pela RPC, nada com user_id, nada do texto no log.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
let passou = 0;
const ok = (c, nome) => { assert.ok(c, nome); passou++; };
// JSON antes de comparar: objetos nascidos no vm têm outro protótipo e o deepEqual estrito os separaria.
const igual = (a, b, nome) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), nome); passou++; };

const ID1 = '55555555-5555-4555-8555-000000000001';
const ID2 = '55555555-5555-4555-8555-000000000002';
const TEXTO = 'CANARIO_MENSAGEM_PRIVADA';
const EVID = 'CANARIO_EVIDENCIA_PRIVADA';
const URL = 'https://proj.supabase.co';
const CHAVE = 'chave-de-servico-ficticia';

// ---- validador real da Edge Function ----
function carregarTs() {
  const arquivo = path.join(ROOT, 'supabase/functions/_shared/admin-feedbacks.ts');
  const js = ts.transpileModule(fs.readFileSync(arquivo, 'utf8').replace(/^import .*;\r?\n/gm, ''), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  vm.runInNewContext(js, { module: m, exports: m.exports, console, consultaComPrazo: () => { throw new Error('não usado'); } });
  return m.exports;
}

const feedbacks = require(path.join(ROOT, 'tools/admin-local/marketing/feedbacks.cjs'));

function fakeConfig(tem = true) {
  return { tem: (k) => tem && ['SUPABASE_SERVICE_ROLE_KEY', 'EXPO_PUBLIC_SUPABASE_URL'].includes(k), ler: (k) => (k === 'SUPABASE_SERVICE_ROLE_KEY' ? CHAVE : URL) };
}
const linha = (id, extra = {}) => ({ id, type: 'bug', rating: 4, message: TEXTO, status: 'pending', app_version: '1.10.5', platform: 'android', public_use_consent: false, user_id: 'dono-secreto', created_at: '2026-10-15T12:00:00.000Z', device_info: 'Pixel', screenshot_url: 'x', ...extra });
const gest = (id, extra = {}) => ({ feedback_id: id, estado: 'em_analise', prioridade: 'alta', responsavel: 'Gabriel', etiquetas: ['voz'], evidencia: null, versao_resolucao: null, atualizado_em: '2026-10-16T10:00:00.000Z', ...extra });
const resp = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });

function modulo(rotas, config = fakeConfig()) {
  const chamadas = [];
  const fetch = async (url, init = {}) => {
    chamadas.push({ url, metodo: init.method || 'GET', corpo: init.body, cab: init.headers });
    const r = rotas.find((x) => url.includes(x.contem));
    if (!r) throw new Error('rota não prevista: ' + url);
    return typeof r.resp === 'function' ? r.resp(url, init) : r.resp;
  };
  return { m: feedbacks._criar({ fetch, config }), chamadas };
}

(async () => {
  // ---------- paridade dos validadores ----------
  const tsm = carregarTs();
  const pedidosGestao = [
    [{ id: ID1, estado: 'em_analise' }, true], [{ id: ID1, prioridade: 'alta' }, true], [{ id: ID1, prioridade: null }, true],
    [{ id: ID1, responsavel: 'Gabriel' }, true], [{ id: ID1, responsavel: '' }, false], [{ id: ID1, responsavel: 'x'.repeat(81) }, false],
    [{ id: ID1, etiquetas: ['voz', 'android'] }, true], [{ id: ID1, etiquetas: Array.from({ length: 9 }, (_, i) => 'e' + i) }, false],
    [{ id: ID1, etiquetas: ['ok', '-ruim'] }, false], [{ id: ID1, etiquetas: [1] }, false],
    [{ id: ID1, estado: 'resolvido', evidencia: 'Commit 02235ca', versaoResolucao: '1.11.0' }, true],
    [{ id: ID1, estado: 'resolvido', evidencia: null, versaoResolucao: '1.11.0' }, false],
    [{ id: ID1, estado: 'resolvido', evidencia: 'Commit', versaoResolucao: null }, false],
    [{ id: ID1, versaoResolucao: '1.11.0' }, true], [{ id: ID1, versaoResolucao: 'ab cd' }, false], [{ id: ID1, evidencia: 'a\u0000b' }, false],
    [{ id: ID1 }, false], [{ id: 'nao-uuid', estado: 'novo' }, false], [{ id: ID1, estado: 'inventado' }, false],
    [{ id: ID1, estado: 'novo', message: 'trocar' }, false], [{ id: ID1, prioridade: 'urgente' }, false],
  ];
  for (const [p, valido] of pedidosGestao) {
    let ts_ = true; try { tsm.validarPedidoFeedbacks({ recurso: 'feedbacks-gestao', ...p }); } catch { ts_ = false; }
    let loc = true; try { feedbacks._validarGestao(p); } catch { loc = false; }
    igual([ts_, loc], [valido, valido], 'paridade gestão: ' + JSON.stringify(p).slice(0, 90));
  }
  const filtros = [
    [{}, true], [{ status: 'pending' }, true], [{ status: 'x' }, false], [{ tipo: 'bug' }, true], [{ tipo: 'x' }, false],
    [{ nota: 3 }, true], [{ nota: 6 }, false], [{ nota: '3' }, false], [{ versao: '1.10.5' }, true], [{ versao: 'a b' }, false],
    [{ desde: '2026-10-01T00:00:00.000Z' }, true], [{ desde: '2026-10-01' }, false],
    [{ desde: '2026-10-05T00:00:00Z', ate: '2026-10-01T00:00:00Z' }, false], [{ antesDe: '2026-10-01T00:00:00Z' }, true], [{ outro: 1 }, false],
  ];
  for (const [f, valido] of filtros) {
    let ts_ = true; try { tsm.validarPedidoFeedbacks({ recurso: 'feedbacks-listar', ...f }); } catch { ts_ = false; }
    let loc = true; try { feedbacks._validarFiltros(f); } catch { loc = false; }
    igual([ts_, loc], [valido, valido], 'paridade filtros: ' + JSON.stringify(f));
  }
  // O painel acrescenta uma regra que a Edge Function não tem: arquivar exige confirmação explícita.
  let cod = null; try { feedbacks._validarGestao({ id: ID1, estado: 'arquivado' }); } catch (e) { cod = e.codigo; }
  igual(cod, 'confirmacao-obrigatoria', 'arquivar sem confirmação é recusado pelo servidor local');
  ok(feedbacks._validarGestao({ id: ID1, estado: 'arquivado', confirmacao: true }).estado === 'arquivado', 'arquivar com confirmação passa');

  // ---------- leitura ----------
  {
    const { m, chamadas } = modulo([
      { contem: '/rest/v1/feedbacks?', resp: resp(200, [linha(ID1), linha(ID2, { rating: null, user_id: null })]) },
      { contem: '/rest/v1/feedback_gestao?', resp: resp(200, [gest(ID1)]) },
    ]);
    const r = await m.listarFeedbacks(null, { tipo: 'bug', nota: 4 });
    igual(r.feedbacks.map((f) => f.gestao.estado), ['em_analise', 'novo'], 'sem linha de gestão aparece como Novo');
    ok(r.gestaoDisponivel === true && r.haMais === false, 'gestão disponível, sem mais páginas');
    const texto = JSON.stringify(r);
    ok(!texto.includes('dono-secreto') && !texto.includes('Pixel') && !texto.includes('user_id') && !texto.includes('screenshot'), 'DTO fechado: sem user_id, aparelho nem print');
    igual(r.feedbacks.map((f) => f.temConta), [true, false], 'só diz se há conta vinculada');
    igual(chamadas.map((c) => c.metodo), ['GET', 'GET'], 'leitura só por GET');
    ok(chamadas[0].url.includes('type=eq.bug') && chamadas[0].url.includes('rating=eq.4') && chamadas[0].url.includes('limit=51'), 'filtros vão ao servidor');
    ok(chamadas[1].url.includes(`feedback_id=in.(${ID1},${ID2})`), 'gestão lida só dos ids da página');
    ok(chamadas.every((c) => c.cab.apikey === CHAVE), 'chave de serviço só no cabeçalho da chamada de saída');
  }
  { // migration da gestão não aplicada: lista segue, gestão desligada e dito
    const { m } = modulo([{ contem: '/rest/v1/feedbacks?', resp: resp(200, [linha(ID1)]) }, { contem: '/rest/v1/feedback_gestao?', resp: resp(404, { code: 'PGRST205' }) }]);
    const r = await m.listarFeedbacks(null, {});
    ok(r.gestaoDisponivel === false && r.feedbacks.length === 1 && r.feedbacks[0].gestao.estado === 'novo', '404 da gestão: lista com gestão desligada');
  }
  { // outra falha na gestão não vira "tudo Novo"
    const { m } = modulo([{ contem: '/rest/v1/feedbacks?', resp: resp(200, [linha(ID1)]) }, { contem: '/rest/v1/feedback_gestao?', resp: resp(500, {}) }]);
    let e; try { await m.listarFeedbacks(null, {}); } catch (x) { e = x; }
    ok(e && e.codigo === 'feedbacks-gestao-falhou' && e.status === 503, 'falha de gestão derruba a leitura com recibo');
  }
  { // falha de leitura: recibo, nunca lista vazia
    const { m } = modulo([{ contem: '/rest/v1/feedbacks?', resp: resp(500, { message: TEXTO }) }]);
    let e; try { await m.listarFeedbacks(null, {}); } catch (x) { e = x; }
    ok(e && e.status === 503 && !String(e.message).includes(TEXTO), 'falha de leitura vira 503 sem eco do corpo');
  }
  { // sem chave: estado ausente explicado
    const { m } = modulo([], fakeConfig(false));
    const r = await m.listarFeedbacks(null, {});
    ok(r.status === 'ausente' && r.feedbacks.length === 0 && /SUPABASE_SERVICE_ROLE_KEY/.test(r.motivo) && !r.motivo.includes(CHAVE), 'sem chave: ausente, cita o NOME da variável');
  }
  { // paginação: 51 linhas viram 50 + haMais
    const muitas = Array.from({ length: 51 }, (_, i) => linha(`55555555-5555-4555-8555-${String(i + 10).padStart(12, '0')}`));
    const { m } = modulo([{ contem: '/rest/v1/feedbacks?', resp: resp(200, muitas) }, { contem: '/rest/v1/feedback_gestao?', resp: resp(200, []) }]);
    const r = await m.listarFeedbacks(null, {});
    ok(r.feedbacks.length === 50 && r.haMais === true, '51 linhas: 50 e haMais');
  }
  { // linha fora do formato não passa
    const { m } = modulo([{ contem: '/rest/v1/feedbacks?', resp: resp(200, [linha(ID1, { type: 'inventado' })]) }]);
    let e; try { await m.listarFeedbacks(null, {}); } catch (x) { e = x; }
    ok(e && e.codigo === 'feedbacks-formato', 'DTO recusa linha fora da lista fechada');
  }

  // ---------- escrita ----------
  {
    const { m, chamadas } = modulo([{ contem: '/rpc/feedback_gestao_atualizar', resp: resp(200, [gest(ID1, { estado: 'resolvido', evidencia: EVID, versao_resolucao: '1.11.0' })]) }]);
    const r = await m.atualizarGestao(null, { id: ID1, estado: 'resolvido', evidencia: EVID, versaoResolucao: '1.11.0' });
    igual(r.gestao.estado, 'resolvido', 'gravação devolve a gestão gravada');
    igual(chamadas.length, 1, 'uma única chamada');
    const corpo = JSON.parse(chamadas[0].corpo);
    igual(corpo, { p_id: ID1, p_por: null, p_patch: { estado: 'resolvido', evidencia: EVID, versao_resolucao: '1.11.0' } }, 'RPC recebe só o patch, sem confirmacao');
    ok(chamadas[0].metodo === 'POST' && chamadas[0].url.endsWith('/rpc/feedback_gestao_atualizar'), 'escrita só pela RPC');
  }
  { // patch parcial: só o campo enviado
    const { m, chamadas } = modulo([{ contem: '/rpc/', resp: resp(200, [gest(ID1, { prioridade: 'baixa' })]) }]);
    await m.atualizarGestao(null, { id: ID1, prioridade: 'baixa' });
    igual(JSON.parse(chamadas[0].corpo).p_patch, { prioridade: 'baixa' }, 'patch parcial leva só o campo enviado');
  }
  { // E3-R1: banco recusa Resolvido sem versão resultante
    const { m } = modulo([{ contem: '/rpc/', resp: resp(400, { code: '23514', message: TEXTO }) }]);
    const r = await m.atualizarGestao(null, { id: ID1, estado: 'resolvido', evidencia: EVID });
    igual(r, { id: ID1, recusa: 'resolvido-exige-evidencia-e-versao' }, '23514 volta como recusa explícita, não como 503');
  }
  { // outras falhas: códigos fixos, sem eco
    for (const [status, corpo, codigo, http] of [[404, { code: 'PGRST202' }, 'gestao-nao-aplicada', 503], [400, { code: 'P0002' }, 'feedback-inexistente', 404], [500, { code: 'XX000', message: EVID }, 'feedbacks-http', 503]]) {
      const { m } = modulo([{ contem: '/rpc/', resp: resp(status, corpo) }]);
      let e; try { await m.atualizarGestao(null, { id: ID1, prioridade: 'baixa' }); } catch (x) { e = x; }
      ok(e && e.codigo === codigo && e.status === http && !String(e.message).includes(EVID), `falha ${status}/${corpo.code}: ${codigo}`);
    }
  }
  { // pedido inválido não chega à rede
    const { m, chamadas } = modulo([{ contem: '/rpc/', resp: resp(200, [gest(ID1)]) }]);
    for (const p of [{ id: ID1 }, { id: ID1, estado: 'resolvido', evidencia: 'x' , versaoResolucao: null }, { id: ID1, estado: 'arquivado' }]) {
      let e; try { await m.atualizarGestao(null, p); } catch (x) { e = x; }
      ok(e && e.status === 400, 'pedido inválido: 400 ' + JSON.stringify(p).slice(0, 60));
    }
    igual(chamadas.length, 0, 'nenhum pedido inválido chegou à rede');
  }

  // ---------- tela ----------
  const node = (tag, attrs = {}, ...filhos) => ({ tag, attrs, children: filhos.flat(Infinity).filter((x) => x != null && x !== false), appendChild(n) { this.children.push(n); }, replaceChildren(...n) { this.children = n.flat(Infinity); }, get textContent() { return this.attrs.texto || ''; }, set textContent(v) { this.attrs.texto = v; } });
  const texto = (n) => (n == null ? '' : typeof n === 'object' ? [n.attrs?.texto || '', ...(n.children || []).map(texto)].join(' ') : String(n));
  const walk = (n) => [n, ...(n.children || []).flatMap(walk)];
  const fonte = fs.readFileSync(path.join(ROOT, 'tools/admin-local/web/telas/feedbacks.js'), 'utf8');
  const nomes = [...fonte.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((x) => x[1]);
  const corpoJs = fonte.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const sandbox = { console: { warn: () => {} }, URLSearchParams };
  vm.runInNewContext(`(function(){${corpoJs}\n;Object.assign(globalThis,{${nomes.join(',')}});})()`, sandbox);

  const gestaoPadrao = { estado: 'novo', prioridade: null, responsavel: null, etiquetas: [], evidencia: null, versaoResolucao: null, atualizadoEm: null };
  const item = (id, extra = {}) => ({ id, tipo: 'bug', nota: 4, mensagem: TEXTO, status: 'pending', versaoApp: '1.10.5', plataforma: 'android', usoPublicoAutorizado: false, temConta: true, criadoEm: '2026-10-15T12:00:00.000Z', gestao: { ...gestaoPadrao }, ...extra });
  async function tela({ dados, falha = false, formulario = null, confirmacao = true, acao = null }) {
    const chamadas = [], avisos = [];
    const ctx = {
      h: node, obsoleta: () => false, recarregar() {}, formatar: { dataHora: (v) => 'em ' + v },
      cabecalho: () => {}, alerta: (n, t) => node('p', { texto: t, nivel: n }), selo: (n, t) => node('span', { texto: t }),
      tabela: (colunas, linhas) => node('table', {}, linhas.map((l) => node('tr', {}, colunas.map((c) => node('td', {}, c.valor(l)))))),
      api: async (url) => { chamadas.push(['GET', url]); if (falha) throw Object.assign(new Error('x'), { codigo: 'rede' }); return { dados }; },
      acao: async (url, corpo) => { chamadas.push(['POST', url, corpo]); if (acao instanceof Error) throw acao; return { dados: acao }; },
      formulario: async (cfg) => { chamadas.push(['FORM', cfg.campos.map((c) => c.nome)]); return formulario; },
      confirmar: async () => { chamadas.push(['CONFIRMAR']); return confirmacao; },
      aviso: (t, tipo) => avisos.push([t, tipo]),
    };
    const raiz = node('main');
    Object.assign(sandbox, { raiz, ctx });
    await vm.runInNewContext('montar(raiz, ctx)', sandbox);
    return { raiz, chamadas, avisos, ctx };
  }
  const botao = (raiz, rotulo) => walk(raiz).find((n) => n.tag === 'button' && n.attrs.texto === rotulo);

  { // lista com itens: mensagem entra como texto, gestão aparece
    const t = await tela({ dados: { status: 'ok', feedbacks: [item(ID1, { gestao: { ...gestaoPadrao, estado: 'em_analise', prioridade: 'alta' } })], haMais: false, gestaoDisponivel: true } });
    const x = texto(t.raiz);
    ok(x.includes(TEXTO) && x.includes('Em análise') && x.includes('Alta') && x.includes('Não autorizado'), 'lista mostra mensagem, andamento, prioridade e consentimento');
    ok(!x.includes('dono-secreto') && walk(t.raiz).every((n) => n.tag !== 'innerHTML'), 'nada de identidade na tela');
  }
  { // vazio, ausente e erro são estados diferentes
    const vazio = await tela({ dados: { status: 'ok', feedbacks: [], haMais: false, gestaoDisponivel: true } });
    ok(texto(vazio.raiz).includes('Ainda não chegaram feedbacks'), 'vazio sem filtro orienta');
    const ausente = await tela({ dados: { status: 'ausente', motivo: 'SUPABASE_SERVICE_ROLE_KEY não está no .env', feedbacks: [] } });
    ok(texto(ausente.raiz).includes('SUPABASE_SERVICE_ROLE_KEY'), 'ausente explica o que falta');
    const erro = await tela({ dados: null, falha: true });
    ok(texto(erro.raiz).includes('Isto não significa que não haja nenhum') && !texto(erro.raiz).includes('Ainda não chegaram'), 'falha de leitura nunca vira lista vazia');
    ok(botao(erro.raiz, 'Tentar de novo'), 'erro oferece tentar de novo');
  }
  { // gestão desligada: aviso e botão Gerir desabilitado
    const t = await tela({ dados: { status: 'ok', feedbacks: [item(ID1)], haMais: false, gestaoDisponivel: false } });
    ok(texto(t.raiz).includes('ainda não foi aplicada no banco') && botao(t.raiz, 'Gerir').attrs.disabled === true, 'gestão não aplicada: dito e bloqueado');
  }
  const base = () => ({ status: 'ok', feedbacks: [item(ID1)], haMais: false, gestaoDisponivel: true });
  const valores = (extra) => ({ estado: 'novo', prioridade: '', responsavel: '', etiquetas: '', versaoResolucao: '', evidencia: '', ...extra });
  { // salvar: só o que mudou
    const t = await tela({ dados: base(), formulario: valores({ estado: 'em_analise', prioridade: 'alta', etiquetas: 'voz, android' }), acao: { id: ID1, gestao: { ...gestaoPadrao, estado: 'em_analise', prioridade: 'alta', etiquetas: ['voz', 'android'] } } });
    await botao(t.raiz, 'Gerir').attrs.onclick({ currentTarget: botao(t.raiz, 'Gerir') });
    const post = t.chamadas.find((c) => c[0] === 'POST');
    igual(post, ['POST', '/api/marketing/feedbacks/gestao', { id: ID1, estado: 'em_analise', prioridade: 'alta', etiquetas: ['voz', 'android'] }], 'patch parcial só com o que mudou');
    ok(texto(t.raiz).includes('Em análise') && t.avisos.some((a) => a[0] === 'Gestão salva.'), 'lista atualiza e há recibo');
  }
  { // nada mudou: não grava
    const t = await tela({ dados: base(), formulario: valores({}) });
    await botao(t.raiz, 'Gerir').attrs.onclick({ currentTarget: botao(t.raiz, 'Gerir') });
    ok(!t.chamadas.some((c) => c[0] === 'POST') && t.avisos.some((a) => a[0] === 'Nada mudou.'), 'sem mudança: nada gravado');
  }
  { // Resolvido sem evidência e versão: bloqueado antes de gravar
    const t = await tela({ dados: base(), formulario: valores({ estado: 'resolvido', evidencia: 'Commit 02235ca' }) });
    await botao(t.raiz, 'Gerir').attrs.onclick({ currentTarget: botao(t.raiz, 'Gerir') });
    ok(!t.chamadas.some((c) => c[0] === 'POST') && t.avisos.some((a) => /Resolvido/.test(a[0]) && a[1] === 'erro'), 'Resolvido sem versão não grava e explica');
  }
  { // recusa do banco vira aviso, não sucesso
    const t = await tela({ dados: base(), formulario: valores({ prioridade: 'baixa' }), acao: { id: ID1, recusa: 'resolvido-exige-evidencia-e-versao' } });
    await botao(t.raiz, 'Gerir').attrs.onclick({ currentTarget: botao(t.raiz, 'Gerir') });
    ok(t.avisos.some((a) => /Nada foi gravado/.test(a[0])) && !t.avisos.some((a) => a[0] === 'Gestão salva.'), 'recusa do banco: aviso, sem aparentar salvamento');
  }
  { // arquivar: confirmação antes, e confirmacao:true no corpo
    const t = await tela({ dados: base(), formulario: valores({ estado: 'arquivado' }), acao: { id: ID1, gestao: { ...gestaoPadrao, estado: 'arquivado' } } });
    await botao(t.raiz, 'Gerir').attrs.onclick({ currentTarget: botao(t.raiz, 'Gerir') });
    const ordem = t.chamadas.map((c) => c[0]);
    ok(ordem.indexOf('CONFIRMAR') > -1 && ordem.indexOf('CONFIRMAR') < ordem.indexOf('POST'), 'arquivar confirma antes de gravar');
    ok(t.chamadas.find((c) => c[0] === 'POST')[2].confirmacao === true, 'corpo leva confirmacao:true');
    const cancelado = await tela({ dados: base(), formulario: valores({ estado: 'arquivado' }), confirmacao: false });
    await botao(cancelado.raiz, 'Gerir').attrs.onclick({ currentTarget: botao(cancelado.raiz, 'Gerir') });
    ok(!cancelado.chamadas.some((c) => c[0] === 'POST'), 'cancelar o diálogo não grava');
  }
  { // falha ao gravar: aviso de erro, estado da lista intacto, mensagem fora do aviso
    const t = await tela({ dados: base(), formulario: valores({ prioridade: 'baixa' }), acao: Object.assign(new Error('x'), { codigo: 'gestao-nao-aplicada' }) });
    await botao(t.raiz, 'Gerir').attrs.onclick({ currentTarget: botao(t.raiz, 'Gerir') });
    ok(t.avisos.some((a) => /ainda não foi aplicada/.test(a[0]) && a[1] === 'erro') && texto(t.raiz).includes('Novo'), 'falha de gravação vira aviso e não muda a lista');
    ok(!JSON.stringify(t.avisos).includes(TEXTO), 'texto do usuário nunca vai a aviso');
  }
  { // corpoDaGestao: limpar e conservar
    const it = item(ID1, { gestao: { ...gestaoPadrao, estado: 'resolvido', evidencia: EVID, versaoResolucao: '1.11.0', prioridade: 'alta', etiquetas: ['voz'] } });
    igual(vm.runInNewContext('corpoDaGestao(it, v)', { ...sandbox, it, v: valores({ estado: 'resolvido', prioridade: '', evidencia: EVID, versaoResolucao: '1.11.0', etiquetas: 'voz' }) }),
      { id: ID1, prioridade: null }, 'limpar a prioridade manda null e conserva o resto');
  }

  // ---------- fiação ----------
  const rotas = fs.readFileSync(path.join(ROOT, 'tools/admin-local/rotas.cjs'), 'utf8');
  ok(rotas.includes("'/api/marketing/feedbacks/gestao'") && rotas.includes("'atualizarGestaoFeedback'") && rotas.includes("'listarFeedbacks'"), 'rotas GET e POST ligadas ao módulo');
  ok(/MARKETING_POST = new Set\([^)]*feedbacks\/gestao/.test(rotas), 'POST da gestão entra no conjunto com CSRF e sessão');
  ok(fs.readFileSync(path.join(ROOT, 'tools/admin-local/web/app.js'), 'utf8').includes("'marketing/feedbacks'"), 'tela registrada');
  ok(fs.readFileSync(path.join(ROOT, 'tools/admin-local/web/index.html'), 'utf8').includes('#/marketing/feedbacks'), 'item no menu');

  console.log(`admin-feedbacks-local: ${passou} checagens passaram — 0 falhas`);
})().catch((e) => { console.error(e); process.exit(1); });
