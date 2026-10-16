'use strict';
/*
 * Sino com dado real (16/10/2026): CentralNotificacoesReal + lib/admin-web.ts + lib/admin-notificacoes.ts reais.
 *
 *   node __tests__/admin-notificacoes-real.cjs
 *
 * Dublês: fetch, sessão do Supabase, React mínimo e a central (um sonda que guarda as props).
 * Asserta QUAIS pedidos saem à função admin-marketing, o que a central recebe em cada fase
 * (real, dublê marcado, erro), que gravar a leitura vai ao servidor em lotes de 50 e que
 * "desfazer" e preferências não fingem gravar.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const compilar = (rel) => ts.transpileModule(fs.readFileSync(path.join(ROOT, rel), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const uuid = (i) => `77777777-7777-4777-8777-${String(i).padStart(12, '0')}`;
const nt = (i, extra = {}) => ({ id: uuid(i), codigo: 'novo-feedback', importancia: 'informacao', agendamentoId: null,
  criadoEm: new Date(Date.UTC(2026, 9, 16, 12, 0, 0) - i * 60_000).toISOString(), lidaEm: null, resolvidaEm: null, ...extra });
const pagina = (notificacoes, proxima = null) => ({ status: 200, body: { ok: true, contrato: 1, geradoEm: '2026-10-16T13:00:00.000Z',
  dados: { notificacoes, naoLidas: notificacoes.filter((n) => !n.lidaEm).length, proximaPagina: proxima } } });
const tick = () => new Promise((r) => setImmediate(r));

function ambiente() {
  const pedidos = [], logs = [], respostas = [];
  const cliente = {};
  vm.runInNewContext(compilar('lib/admin-web.ts'), {
    exports: cliente, Date, AbortController, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto,
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://p.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon' } },
    require: () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'token-ficticio' } }, error: null }) } } }),
    fetch: async (url, init) => {
      pedidos.push({ url, corpo: JSON.parse(init.body) });
      const r = respostas.shift() ?? pagina([]);
      return { ok: r.status === 200, status: r.status, json: async () => r.body };
    },
  });
  const notificacoes = {};
  vm.runInNewContext(compilar('lib/admin-notificacoes.ts'), { exports: notificacoes, URL, Date });

  let celulas = [], cursor = 0, efeitos = [];
  const React = {
    useState: (v) => { const i = cursor++; if (!(i in celulas)) celulas[i] = v; return [celulas[i], (x) => { celulas[i] = typeof x === 'function' ? x(celulas[i]) : x; }]; },
    useRef: (v) => { const i = cursor++; return celulas[i] ??= { current: v }; },
    useEffect: (f, deps) => { const i = cursor++; if (deps && celulas[i]) return; celulas[i] = true; efeitos.push(f); },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const sonda = (props) => ({ type: 'central', props });
  const tela = {};
  vm.runInNewContext(compilar('components/admin/CentralNotificacoesReal.web.tsx'), {
    exports: tela, Date, Number, Object, Array, Error, console: { warn: (...a) => logs.push(a.join(' ')) },
    require: (id) => {
      if (id === 'react') return React;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (id === '@/lib/admin-web') return cliente;
      if (id === '@/lib/admin-notificacoes') return notificacoes;
      if (id === './CentralNotificacoes.web') return { default: sonda };
      throw new Error('import inesperado ' + id);
    },
  });
  const expandir = (n) => (n && typeof n.type === 'function' ? expandir(n.type(n.props)) : n);
  const render = () => { cursor = 0; efeitos = []; const a = expandir(tela.default()); const p = efeitos; efeitos = []; p.forEach((f) => f()); return a; };
  return { pedidos, logs, respostas, render, notificacoes, async assentar() { for (let i = 0; i < 8; i++) await tick(); return render(); } };
}

let ok = 0;
const igual = (a, b, nome) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), nome); ok++; };
const URL_F = 'https://p.supabase.co/functions/v1/admin-marketing';

(async () => {
  /* Antes de ler: central em "carregando", sem aviso de teste. */
  {
    const a = ambiente(); a.respostas.push(pagina([]));
    const t0 = a.render();
    igual([t0.props.real, t0.props.leituraInicial], [true, { situacao: 'carregando' }], 'carregando é real, não dublê');
  }

  /* Leitura real: um pedido, adaptador, lista na central, sem dublê. */
  {
    const a = ambiente();
    a.respostas.push(pagina([nt(1, { codigo: 'horario-vencido', importancia: 'critica' }), nt(2, { lidaEm: '2026-10-16T12:30:00.000Z', resolvidaEm: '2026-10-16T12:40:00.000Z' }), nt(3, { codigo: 'codigo-que-ninguem-conhece' })]));
    a.render();
    const c = await a.assentar();
    igual(a.pedidos, [{ url: URL_F, corpo: { recurso: 'marketing-notificacoes', filtro: 'todas' } }], 'um pedido, à função admin-marketing');
    igual(c.props.real, true, 'a central sabe que é real (sem aviso de dados de teste)');
    const l = c.props.leituraInicial.lista;
    igual([c.props.leituraInicial.situacao, l.length], ['ok', 3], 'três notificações na central');
    igual([l[0].fonte, l[0].importancia, l[0].titulo, l[0].acao, l[0].lida], ['publicacoes', 'agir', 'Horário de publicação vencido', 'Conferir resultado', false], 'crítica vira "precisa agir" com o texto do catálogo');
    igual([l[1].lida, l[1].resolvida, l[1].importancia], [true, true, 'informacao'], 'lida e resolvida vêm das datas do servidor');
    igual([l[2].fonte, l[2].titulo, 'acao' in l[2]], ['sistema', 'Aviso do sistema', false], 'código desconhecido aparece como aviso do sistema, sem ação inventada');
    igual(typeof c.props.persistir === 'function' && typeof c.props.recarregar === 'function', true, 'central recebe gravar e recarregar');
    igual(a.logs, [], 'leitura boa não loga');
  }

  /* Paginação: segue o cursor, para quando acaba. */
  {
    const a = ambiente();
    const p1 = Array.from({ length: 50 }, (_, i) => nt(i + 1));
    const p2 = Array.from({ length: 5 }, (_, i) => nt(i + 51));
    a.respostas.push(pagina(p1, { criadoEm: p1[49].criadoEm, id: p1[49].id }), pagina(p2));
    a.render(); const c = await a.assentar();
    igual(a.pedidos[1].corpo, { recurso: 'marketing-notificacoes', filtro: 'todas', antesDe: { criadoEm: p1[49].criadoEm, id: p1[49].id } }, 'segunda página usa o cursor da primeira');
    igual([a.pedidos.length, c.props.leituraInicial.lista.length], [2, 55], 'duas páginas, 55 notificações');
  }

  /* Função ainda não publicada (404): dublê, marcado (a central sem `real`). */
  {
    const a = ambiente(); a.respostas.push({ status: 404, body: { message: 'not found' } });
    a.render(); const c = await a.assentar();
    igual([c.props.real, c.props.leituraInicial, c.props.persistir], [undefined, undefined, undefined], '404: central no padrão dublê, que se marca como dados de teste');
    igual(a.logs, ['[admin-notificacoes] http-404 web-' + a.logs[0].split('web-')[1]], '404 deixa log só com código e referência');
  }

  /* Qualquer outra falha é falha: erro com recibo, nunca dublê nem lista vazia. */
  for (const [nome, resp, codigo] of [['503 do servidor', { status: 503, body: { ok: false, erro: { codigo: 'indisponivel' }, ocorrencia: 'ref-sino-1' } }, 'indisponivel'],
    ['sem sessão de admin', { status: 403, body: { ok: false, erro: { codigo: 'mfa-necessario' }, ocorrencia: 'ref-sino-2' } }, 'mfa-necessario']]) {
    const a = ambiente(); a.respostas.push(resp);
    a.render(); const c = await a.assentar();
    igual([c.props.real, c.props.leituraInicial], [true, { situacao: 'erro' }], `${nome}: erro, não dublê`);
    igual(a.logs.some((l) => l.startsWith('[admin-notificacoes] ' + codigo)), true, `${nome}: log com código`);
  }

  /* Contrato fechado: campo a mais, código fora do formato ou importância inventada derrubam a leitura. */
  for (const [nome, item] of [['campo a mais', { ...nt(1), texto: 'conteúdo' }], ['código fora do formato', nt(1, { codigo: 'Texto Livre!' })], ['importância inventada', nt(1, { importancia: 'urgente' })]]) {
    const a = ambiente(); a.respostas.push(pagina([item]));
    a.render(); const c = await a.assentar();
    igual(c.props.leituraInicial, { situacao: 'erro' }, `${nome}: resposta recusada`);
  }

  /* Gravar a leitura: ids em lotes de 50, só "lida"; desfazer e preferências não fingem. */
  {
    const a = ambiente(); a.respostas.push(pagina([nt(1)]));
    a.render(); const c = await a.assentar();
    a.pedidos.length = 0;
    const ids = Array.from({ length: 120 }, (_, i) => uuid(i + 1));
    for (let i = 0; i < 3; i++) a.respostas.push({ status: 200, body: { ok: true, contrato: 1, geradoEm: '2026-10-16T13:10:00.000Z', dados: { atualizados: [50, 50, 20][i] } } });
    await c.props.persistir(ids, true);
    igual(a.pedidos.map((p) => [p.url, p.corpo.recurso, p.corpo.ids.length]), [[URL_F, 'marketing-ler', 50], [URL_F, 'marketing-ler', 50], [URL_F, 'marketing-ler', 20]], '120 ids viram 3 pedidos de marketing-ler');
    igual(a.pedidos.flatMap((p) => p.corpo.ids), ids, 'todos os ids, na ordem, uma vez cada');
    const antes = a.pedidos.length;
    for (const [nome, args] of [['desfazer (lida=false)', [[uuid(1)], false]], ['preferência', [['pref:publicacoes'], true]]]) {
      let erro = null; try { await c.props.persistir(...args); } catch (e) { erro = e; }
      igual(erro !== null, true, `${nome}: recusa em vez de fingir que gravou`);
    }
    igual(a.pedidos.length, antes, 'recusar não gasta pedido ao servidor');
    // Falha do servidor propaga: a central mantém lista e contador.
    a.respostas.push({ status: 503, body: { ok: false, erro: { codigo: 'indisponivel' }, ocorrencia: 'ref-sino-3' } });
    let falhou = false; try { await c.props.persistir([uuid(1)], true); } catch { falhou = true; }
    igual(falhou, true, 'falha do servidor ao gravar propaga para a central não marcar');
  }

  /* Recarregar: a central pede a lista de novo pela mesma leitura. */
  {
    const a = ambiente(); a.respostas.push(pagina([nt(1)]));
    a.render(); const c = await a.assentar();
    a.respostas.push(pagina([nt(1), nt(2)]));
    const nova = await c.props.recarregar();
    igual(nova.map((n) => n.id), [uuid(1), uuid(2)], 'recarregar devolve a lista atual já adaptada');
  }

  /* Adaptador: todo código do catálogo vira fonte e texto próprios. */
  {
    const a = ambiente();
    for (const codigo of Object.keys(a.notificacoes.CATALOGO_CODIGOS)) {
      const n = a.notificacoes.notificacaoDoServidor({ id: uuid(1), codigo, importancia: 'atencao', criadoEm: '2026-10-16T12:00:00.000Z', lidaEm: null, resolvidaEm: null });
      igual([typeof n.titulo, n.titulo.length > 0, /[—–]/.test(n.titulo + n.resumo)], ['string', true, false], `catálogo ${codigo}: texto presente e sem travessão`);
    }
    igual(a.notificacoes.fundacaoNaoPublicada('http-404'), true, '404 é "não publicada"');
    igual(['indisponivel', 'rede', 'http-500', 'nao-autorizado'].some(a.notificacoes.fundacaoNaoPublicada), false, 'nenhuma outra falha cai no dublê');
  }

  /* A central: `real` desliga o que o servidor não grava e o texto de teste. */
  {
    const fonte = fs.readFileSync(path.join(ROOT, 'components/admin/CentralNotificacoes.web.tsx'), 'utf8');
    for (const [trecho, nome] of [
      ["{real ? '' : ' · dados de teste'}", 'cabeçalho sem "dados de teste" quando real'],
      ['if (!real) setDesfazer(ids);', 'sem desfazer quando real'],
      ['disabled={real} onChange={(e) => void salvarPref', 'preferências desligadas quando real'],
      ['O servidor ainda não grava estas preferências', 'a central explica por que as preferências não mudam'],
    ]) igual(fonte.includes(trecho), true, nome);
    igual(fonte.includes("real = false"), true, 'o padrão continua sendo o dublê (comportamento do Lumen preservado)');
  }

  console.log(`admin-notificacoes-real: ${ok} checagens passaram — 0 falhas`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
