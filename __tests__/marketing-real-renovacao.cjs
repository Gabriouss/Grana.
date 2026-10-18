// Renovacao automatica da capacidade (item 5, 18/10/2026): executor e modulo
// de renovacao REAIS sobre o SQL real em PGlite. Dublê so na fronteira: Graph
// (fetch) e o transporte do cliente Supabase. Nenhuma chamada a Meta ou rede.
// Regra 9: as assercoes olham QUAIS chamadas aconteceram (so GET, token fora
// da URL) e O QUE foi gravado, nao so o codigo devolvido.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };

const raiz = path.join(__dirname, '..');
const cache = new Map();
function carregar(arquivo) {
  const abs = path.resolve(raiz, arquivo);
  if (cache.has(abs)) return cache.get(abs).exports;
  const m = new Module(abs, module);
  cache.set(abs, m);
  m.require = (id) => {
    if (id.startsWith('npm:')) return {};
    return carregar(path.relative(raiz, path.resolve(path.dirname(abs), id)));
  };
  m._compile(ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, abs);
  return m.exports;
}
const executorMod = carregar('supabase/functions/_shared/marketing-real-executor.ts');

const USER = 'TOKEN-USUARIO-SENTINELA-NAO-VAZAR', PAGE = 'TOKEN-PAGINA-SENTINELA-NAO-VAZAR';
const IG = '17841400000000001', PAGINA = '1224000000000002';
const SECRET = 's'.repeat(40);
const ENV = {
  MARKETING_REAL_EXECUTOR_ATIVO: 'true', MARKETING_REAL_EXECUTOR_SECRET: SECRET, META_GRAPH_API_VERSION: 'v25.0',
  MARKETING_IG_TOKEN: USER, MARKETING_FB_PAGE_TOKEN: PAGE, SUPABASE_URL: 'https://proj.supabase.co',
};
const ARGS = { claim: ['p_worker', 'p_limite'], consultar: ['p_admin', 'p_filtro'],
  renovacao_iniciar: ['p_worker'], renovacao_registrar: ['p_worker', 'p_renovacao', 'p_lease', 'p_resultado'] };

async function novoBanco() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
    alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const f of ['20261015190000_admin_marketing_fundacao.sql', '20261016140000_admin_marketing_operacoes.sql',
    '20261018001000_admin_marketing_real.sql', '20261018230000_admin_marketing_renovacao.sql']) {
    await db.exec(fs.readFileSync(path.join(raiz, 'supabase/migrations', f), 'utf8'));
  }
  return db;
}
async function comoDono(db, sql, params = []) {
  await db.exec('reset role');
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('set role service_role'); }
}
function clienteDb(db, opcoes = {}) {
  return {
    rpc: (nome, args) => ({
      abortSignal: async (s) => {
        if (s?.aborted) return { data: null, error: { message: 'abortado' } };
        const n = nome.replace('admin_marketing_real_', ''), valores = ARGS[n].map((k) => args[k]);
        if (opcoes[n]) return opcoes[n]();
        try {
          const r = await db.query(`select public.${nome}(${valores.map((_, i) => '$' + (i + 1)).join(',')}) as r`, valores);
          return { data: r.rows[0].r, error: null };
        } catch (e) { return { data: null, error: { message: e.message, code: e.code } }; }
      },
    }),
  };
}

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
/** Graph dublada. `cenario` muda respostas por (token, caminho); registra cada chamada. */
function graphDublada(cenario = {}) {
  const chamadas = [];
  const rede = async (input, init) => {
    const url = new URL(String(input)), auth = init?.headers?.Authorization ?? '';
    chamadas.push({ metodo: init?.method, url: url.href, auth, caminho: url.pathname.replace('/v25.0/', '') });
    const token = auth.replace('Bearer ', ''), chave = (token === USER ? 'user:' : 'page:') + url.pathname.replace('/v25.0/', '');
    if (cenario.pendurar) return new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(new Error('abortado'))));
    if (cenario.rede) throw new TypeError('fetch failed');
    if (cenario[chave]) return cenario[chave]();
    switch (chave) {
      case 'user:me/permissions': return json({ data: [{ permission: 'instagram_content_publish', status: 'granted' }, { permission: 'pages_manage_posts', status: 'granted' }] });
      case 'page:me/permissions': return json({ error: { code: 100, message: 'Tried accessing nonexisting field (permissions) on node type (Page)' } }, 400);
      case `user:${IG}`: return json({ id: IG });
      case 'page:me': return json({ id: PAGINA });
      case 'user:me/accounts': return json({ data: [{ id: PAGINA, tasks: ['ADVERTISE', 'CREATE_CONTENT', 'MANAGE'] }] });
      default: return json({ error: { code: 803, message: 'inesperado' } }, 400);
    }
  };
  return { rede, chamadas };
}

const CAP = (estado, extra = {}) => ({ estado, revisao: 1, evidencia: 'permissao lida pelo Supremo', ...extra });
async function cenario(db, { conexaoFb = 'verificada' } = {}) {
  await db.exec('set role service_role');
  const ig = randomUUID(), fb = randomUUID();
  await db.query(`insert into public.admin_marketing_real_contas(id,rede,remoto_id,rotulo,credencial_ref,conexao,verificada_em,valida_ate,pausada,capacidades) values
    ($1,'instagram',$3,'IG','MARKETING_IG_TOKEN','verificada',now()-interval '1 day',now()+interval '1 day',true,$5),
    ($2,'facebook',$4,'FB','MARKETING_FB_PAGE_TOKEN',$6,now()-interval '1 day',now()+interval '1 day',true,$7)`,
  [ig, fb, IG, PAGINA, ['feed', 'carrossel', 'reels', 'stories'].map((f) => ({ formato: f, ...CAP('disponivel') })), conexaoFb,
    [...['feed', 'carrossel', 'reels'].map((f) => ({ formato: f, ...CAP('disponivel') })), { formato: 'stories', ...CAP('nao-verificada') }]]);
  await comoDono(db, `update public.admin_marketing_controles set habilitado=true,recuperacao_pendente=false,pausa_global=true,
    capacidade_validada_em=now()-interval '21 hours',margem_validada_ate=now()+interval '3 hours'`);
  return { ig, fb };
}
const devida = (db) => comoDono(db, `update public.admin_marketing_controles set capacidade_validada_em=now()-interval '21 hours',renovacao_tentada_em=null`);
async function rodar(db, graph, prazos, opcoes) {
  const logs = [];
  const executar = executorMod.criarExecutorReal({ env: (n) => ENV[n], cliente: () => clienteDb(db, opcoes), rede: graph.rede, log: (l) => logs.push(l), prazos });
  const r = await executar(new Request('https://x/functions/v1/marketing-real-executor', { method: 'POST',
    headers: { 'x-marketing-real-secret': SECRET, 'Content-Type': 'application/json' }, body: '{}' }));
  return { status: r.status, log: JSON.parse(logs.at(-1)), logs };
}
const contas = async (db) => Object.fromEntries((await db.query(`select rede,conexao,revisao,valida_ate,capacidades,renovacao from public.admin_marketing_real_contas`)).rows.map((x) => [x.rede, x]));
const controles = async (db) => (await db.query(`select capacidade_validada_em,margem_validada_ate,renovacao,renovacao_lease from public.admin_marketing_controles`)).rows[0];
const recibos = async (db) => (await db.query(`select resultado,detalhe from public.admin_marketing_real_renovacoes order by iniciado_em`)).rows;
const horas = (d) => (new Date(d).getTime() - Date.now()) / 3600000;
const cap = (c, f) => c.capacidades.find((k) => k.formato === f);

async function main() {
  const P = executorMod.PRAZOS_EXECUTOR;
  ok(P.renovacaoInicio + P.renovacaoLeitura + P.renovacaoRegistro < P.total, 'orcamento da renovacao cabe no total do executor');
  ok(P.renovacaoInicio + P.renovacaoLeitura + P.renovacaoRegistro < 60_000, 'e na lease de 1 min da renovacao');

  // 1. Ciclo feliz, sem nenhuma acao humana: o cron chama o executor e a capacidade renova.
  let db = await novoBanco();
  try {
    await cenario(db);const antes = await contas(db);
    let g = graphDublada();let r = await rodar(db, g);
    eq(r.log.renovacao, 'renovada', 'ciclo devido renova');
    ok(g.chamadas.length > 0 && g.chamadas.every((c) => c.metodo === 'GET'), 'renovacao so faz GET na Graph');
    ok(g.chamadas.every((c) => !c.url.includes(USER) && !c.url.includes(PAGE)), 'token nunca na URL');
    ok(g.chamadas.every((c) => c.auth === 'Bearer ' + USER || c.auth === 'Bearer ' + PAGE), 'token so no cabecalho');
    ok(!r.logs.join('').includes(USER) && !r.logs.join('').includes(PAGE), 'log sem token');
    eq(new Set(g.chamadas.map((c) => c.caminho)), new Set(['me/permissions', IG, 'me', 'me/accounts']), 'le permissoes, conta, pagina e tarefas');
    const k = await contas(db), c = await controles(db);
    ok(horas(c.capacidade_validada_em) > -0.1, 'capacidade_validada_em renovada');
    ok(horas(c.margem_validada_ate) > 29 && horas(c.margem_validada_ate) < 31, 'margem renovada por 30 h');
    ok(horas(k.instagram.valida_ate) > 167 && horas(k.facebook.valida_ate) > 167, 'valida_ate das contas renovada por 7 dias');
    ok(['feed', 'carrossel', 'reels', 'stories'].every((f) => cap(k.instagram, f).estado === 'disponivel' && cap(k.instagram, f).renovadaEm), 'IG: quatro formatos com evidencia da renovacao');
    eq(cap(k.facebook, 'stories'), cap(antes.facebook, 'stories'), 'FB Stories nao-verificada fica intocada');
    ok(k.instagram.revisao === antes.instagram.revisao && k.facebook.revisao === antes.facebook.revisao, 'revisao da conta nao muda (autorizacoes seguem validas)');
    ok(k.instagram.capacidades.every((x) => x.revisao === 1) && cap(k.instagram, 'feed').evidencia === 'permissao lida pelo Supremo', 'revisao e evidencia original da capacidade ficam');
    ok((await db.query(`select pausada from public.admin_marketing_real_contas`)).rows.every((x) => x.pausada === true), 'renovacao nunca despausa conta');
    eq((await recibos(db)).map((x) => x.resultado), ['renovada'], 'recibo do ciclo gravado');
    eq(c.renovacao.resultado, 'renovada', 'controles guardam o ultimo ciclo');
    ok(c.renovacao_lease === null, 'lease da renovacao liberada');
    const painel = (await db.query(`select public.admin_marketing_real_consultar($1,'{"acao":"contas"}') as r`, [randomUUID()])).rows[0].r;
    ok(painel.contas.every((x) => x.renovacao.resultado === 'ok') && painel.controles.renovacao.resultado === 'renovada' && painel.controles.capacidadeValidadaEm,
      'painel recebe o recibo por conta e do ciclo');
    ok(!JSON.stringify(painel).includes('MARKETING_'), 'painel sem credencial_ref');

    // 2. Uma vez por dia: logo depois, nada de Graph.
    g = graphDublada();r = await rodar(db, g);
    eq([r.log.renovacao, g.chamadas.length], ['nao-devida', 0], 'renovada ha pouco nao le a Graph');

    // 3. Falha de rede: nao renova nem revoga, deixa recibo, e espera 1 h para tentar de novo.
    await devida(db);const c0 = await controles(db), k0 = await contas(db);
    g = graphDublada({ rede: true });r = await rodar(db, g);
    eq(r.log.renovacao, 'inconclusiva', 'rede fora: ciclo inconclusivo');
    const c1 = await controles(db), k1 = await contas(db);
    eq([c1.capacidade_validada_em, c1.margem_validada_ate], [c0.capacidade_validada_em, c0.margem_validada_ate], 'rede fora nao renova o global');
    eq([k1.instagram.conexao, k1.facebook.conexao, k1.instagram.valida_ate, k1.facebook.capacidades], [k0.instagram.conexao, k0.facebook.conexao, k0.instagram.valida_ate, k0.facebook.capacidades], 'rede fora nao revoga nem renova conta');
    eq(k1.instagram.renovacao.resultado, 'inconclusivo', 'recibo da conta diz inconclusivo');
    eq((await recibos(db)).at(-1).resultado, 'inconclusiva', 'recibo inconclusivo gravado');
    g = graphDublada();r = await rodar(db, g);
    eq([r.log.renovacao, g.chamadas.length], ['nao-devida', 0], 'nova tentativa so depois de 1 h');
    await comoDono(db, `update public.admin_marketing_controles set renovacao_tentada_em=now()-interval '61 minutes'`);
    r = await rodar(db, graphDublada());eq(r.log.renovacao, 'renovada', 'depois de 1 h tenta e renova');

    // 4. 5xx e erro transitorio da Graph tambem sao inconclusivos.
    await devida(db);
    r = await rodar(db, graphDublada({ 'user:me/permissions': () => json({ error: { code: 1 } }, 500), 'page:me': () => json({ error: { code: 4 } }, 400) }));
    const k4 = await contas(db);
    eq([r.log.renovacao, k4.instagram.renovacao.resultado, k4.facebook.renovacao.resultado], ['inconclusiva', 'inconclusivo', 'inconclusivo'], '5xx e limite de chamadas nao provam nada');
    await devida(db);
    await rodar(db, graphDublada({ [`user:${IG}`]: () => json({ error: { code: 2 } }, 503), 'page:me': () => new Response('<html>proxy</html>', { status: 502 }) }));
    const k4b = await contas(db);
    eq([k4b.instagram.conexao, k4b.facebook.conexao, k4b.instagram.renovacao.resultado, k4b.facebook.renovacao.resultado],
      ['verificada', 'verificada', 'inconclusivo', 'inconclusivo'], '5xx ao abrir a conta nao a derruba');

    // 5. Permissao faltando: so os formatos daquela rede caem, com motivo; volta quando a permissao volta.
    await devida(db);
    r = await rodar(db, graphDublada({ 'user:me/permissions': () => json({ data: [{ permission: 'instagram_content_publish', status: 'granted' }, { permission: 'pages_manage_posts', status: 'declined' }] }) }));
    let k5 = await contas(db);
    eq(r.log.renovacao, 'parcial', 'permissao faltando: ciclo parcial');
    ok(['feed', 'carrossel', 'reels'].every((f) => cap(k5.facebook, f).estado === 'indisponivel' && cap(k5.facebook, f).motivo === 'ausente:pages_manage_posts'), 'FB: formatos indisponiveis com motivo');
    eq(cap(k5.facebook, 'stories').estado, 'nao-verificada', 'FB Stories continua como estava');
    ok(cap(k5.instagram, 'feed').estado === 'disponivel' && k5.facebook.conexao === 'verificada', 'IG segue disponivel; pagina acessivel segue conectada');
    ok(horas((await controles(db)).capacidade_validada_em) > -0.1, 'global renova: ha conta verificada');
    await devida(db);r = await rodar(db, graphDublada());k5 = await contas(db);
    ok(['feed', 'carrossel', 'reels'].every((f) => cap(k5.facebook, f).estado === 'disponivel' && !cap(k5.facebook, f).origem && !cap(k5.facebook, f).motivo), 'permissao de volta: formatos voltam a disponivel');
    ok(k5.facebook.capacidades.every((x) => x.revisao === 1), 'ida e volta sem mexer na revisao da capacidade');
    // Pagina listada sem a tarefa de publicar tambem e permissao ausente.
    await devida(db);
    await rodar(db, graphDublada({ 'user:me/accounts': () => json({ data: [{ id: PAGINA, tasks: ['ANALYZE'] }] }) }));
    eq(cap((await contas(db)).facebook, 'feed').estado, 'indisponivel', 'pagina sem CREATE_CONTENT perde os formatos');
    // Pagina que nenhum token de usuario lista: nao da para ler a permissao, nao decide.
    await devida(db);
    await rodar(db, graphDublada({ 'user:me/accounts': () => json({ data: [] }) }));
    const k5b = await contas(db);
    eq([k5b.facebook.renovacao.resultado, k5b.facebook.renovacao.motivo, cap(k5b.facebook, 'feed').estado], ['inconclusivo', 'permissao-nao-legivel', 'indisponivel'], 'sem leitura da permissao: fica como esta');

    // 6. Token ruim (190): expirado e revogado separados; sem conta verificada o global nao renova.
    await devida(db);const c6 = await controles(db);
    r = await rodar(db, graphDublada({
      [`user:${IG}`]: () => json({ error: { code: 190, error_subcode: 463 } }, 400),
      'page:me': () => json({ error: { code: 190, error_subcode: 460 } }, 400),
    }));
    const k6 = await contas(db), c6b = await controles(db);
    eq([k6.instagram.conexao, k6.facebook.conexao], ['expirada', 'revogada'], '190/463 expira, 190/460 revoga');
    eq([r.log.renovacao, c6b.capacidade_validada_em], ['parcial', c6.capacidade_validada_em], 'sem conta verificada o global nao renova');
    // Token de usuario no lugar do de pagina: publicar no FB nao funcionaria.
    await devida(db);
    await rodar(db, graphDublada({ 'page:me': () => json({ id: '999' }) }));
    eq([(await contas(db)).facebook.conexao, (await contas(db)).facebook.renovacao.motivo], ['indisponivel', 'token-nao-e-da-pagina'], 'token que nao e da pagina deixa a conta indisponivel');
    await devida(db);await rodar(db, graphDublada());
    eq([(await contas(db)).instagram.conexao, (await contas(db)).facebook.conexao], ['verificada', 'verificada'], 'conexao volta quando a leitura volta a provar');
  } finally { await db.close(); }

  // 7. Conta que gente nunca verificou nao e promovida; e o global nao renova so com ela.
  db = await novoBanco();
  try {
    await cenario(db, { conexaoFb: 'nao-verificada' });
    await db.query(`update public.admin_marketing_real_contas set conexao='nao-verificada'`);
    const c7 = await controles(db);
    const r = await rodar(db, graphDublada());const k7 = await contas(db);
    eq([k7.instagram.conexao, k7.facebook.conexao, k7.facebook.renovacao.ignorada], ['nao-verificada', 'nao-verificada', 'conta-nao-verificada'], 'nao-verificada nunca vira verificada sozinha');
    eq([r.log.renovacao, (await controles(db)).capacidade_validada_em], ['parcial', c7.capacidade_validada_em], 'global nao renova sem conta verificada');
  } finally { await db.close(); }

  // 8. Prazo: Graph pendurada aborta dentro do orcamento e ainda deixa recibo.
  db = await novoBanco();
  try {
    await cenario(db);const t0 = Date.now();
    const r = await rodar(db, graphDublada({ pendurar: true }), { renovacaoLeitura: 80 });
    ok(Date.now() - t0 < 5000, 'leitura pendurada nao segura o executor');
    eq([r.log.renovacao, (await recibos(db)).at(-1).resultado], ['inconclusiva', 'inconclusiva'], 'prazo estourado vira recibo inconclusivo');
    ok((await controles(db)).renovacao_lease === null, 'lease liberada depois do prazo');
  } finally { await db.close(); }

  // 8b. R1 do Harbor: resposta com JSON valido mas schema ilegivel vira inconclusivo e nada muda.
  const retrato = async (db) => ({ contas: (await db.query(`select rede,conexao,valida_ate,capacidades from public.admin_marketing_real_contas order by rede`)).rows,
    controles: (await db.query(`select capacidade_validada_em,margem_validada_ate from public.admin_marketing_controles`)).rows[0] });
  const ilegiveis = [
    ['identidade sem id', { [`user:${IG}`]: () => json({}), 'page:me': () => json({}) }, ['instagram', 'facebook']],
    ['id que nao e numero', { [`user:${IG}`]: () => json({ id: { id: IG } }), 'page:me': () => json({ id: Number(PAGINA) }) }, ['instagram', 'facebook']],
    ['permissoes data:[{}]', { 'user:me/permissions': () => json({ data: [{}] }) }, ['instagram', 'facebook']],
    ['permissoes sem data', { 'user:me/permissions': () => json({ permissions: 'tudo' }) }, ['instagram', 'facebook']],
    ['status desconhecido', { 'user:me/permissions': () => json({ data: [{ permission: 'instagram_content_publish', status: 'talvez' }, { permission: 'pages_manage_posts', status: 'granted' }] }) }, ['instagram', 'facebook']],
    ['tasks como texto', { 'user:me/accounts': () => json({ data: [{ id: PAGINA, tasks: 'CREATE_CONTENT' }] }) }, ['facebook']],
    ['pagina sem tasks', { 'user:me/accounts': () => json({ data: [{ id: PAGINA }] }) }, ['facebook']],
    // F2 do Lynx: 100 no no da conta nao prova conta inexistente, nem com subcodigo 33.
    ['codigo 100 no no da conta', { [`user:${IG}`]: () => json({ error: { code: 100 } }, 400), 'page:me': () => json({ error: { code: 100 } }, 400) }, ['instagram', 'facebook']],
    ['codigo 100/33 no no da conta', { [`user:${IG}`]: () => json({ error: { code: 100, error_subcode: 33 } }, 400), 'page:me': () => json({ error: { code: 100, error_subcode: 33 } }, 400) }, ['instagram', 'facebook']],
    ['pagina fora da primeira pagina de resultados', { 'user:me/accounts': () => json({ data: [], paging: { next: 'https://graph.facebook.com/x' } }) }, ['facebook']],
  ];
  for (const [nome, cen, inconclusivas] of ilegiveis) {
    db = await novoBanco();
    try {
      await cenario(db);const antes = await retrato(db);
      const r = await rodar(db, graphDublada(cen));const k = await contas(db);
      eq(r.log.renovacao, 'inconclusiva', `R1 ${nome}: ciclo inconclusivo`);
      ok(inconclusivas.every((rede) => k[rede].renovacao.resultado === 'inconclusivo'), `R1 ${nome}: recibo inconclusivo nas contas afetadas`);
      const depois = await retrato(db);
      eq(depois.controles, antes.controles, `R1 ${nome}: global nao renova`);
      eq(depois.contas.filter((x) => inconclusivas.includes(x.rede)), antes.contas.filter((x) => inconclusivas.includes(x.rede)),
        `R1 ${nome}: conexao, validade e capacidades intactas`);
    } finally { await db.close(); }
  }

  // Controle do F2: recusa explicita de permissao (code 10) no no continua derrubando a conta.
  db = await novoBanco();
  try {
    await cenario(db);
    await rodar(db, graphDublada({ [`user:${IG}`]: () => json({ error: { code: 10 } }, 403) }));
    const k = await contas(db);
    eq([k.instagram.conexao, k.instagram.renovacao.motivo], ['indisponivel', 'conta-inacessivel'], 'F2: code 10 no no segue indisponivel');
    const r100 = await (async () => { await devida(db); await comoDono(db, `update public.admin_marketing_real_contas set conexao='verificada'`);
      await rodar(db, graphDublada({ [`user:${IG}`]: () => json({ error: { code: 100 } }, 400) })); return (await contas(db)).instagram; })();
    eq([r100.conexao, r100.renovacao.resultado, r100.renovacao.motivo], ['verificada', 'inconclusivo', 'graph-codigo-100'], 'F2: code 100 deixa recibo com motivo proprio');
  } finally { await db.close(); }

  // 8c. R2 do Harbor: corpo que chega tarde ou nunca, sem cooperar com o abort, nao renova depois do prazo.
  const corpoTarde = (corpo, ms) => () => new Response(new ReadableStream({ start(c) {
    if (ms !== null) setTimeout(() => { try { c.enqueue(new TextEncoder().encode(JSON.stringify(corpo))); c.close(); } catch {} }, ms);
  } }), { status: 200 });
  const PR = { total: 100, renovacaoInicio: 20, renovacaoLeitura: 40, renovacaoRegistro: 40 };
  for (const [nome, ms] of [['corpo tardio', 250], ['corpo que nunca termina', null]]) {
    db = await novoBanco();
    try {
      await cenario(db);const antes = await retrato(db), t0 = Date.now();
      const r = await rodar(db, graphDublada({ [`user:${IG}`]: corpoTarde({ id: IG }, ms), 'page:me': corpoTarde({ id: PAGINA }, ms) }), PR);
      const dur = Date.now() - t0;
      ok(dur < 230, `R2 ${nome}: executor termina dentro do orcamento (${dur} ms)`);
      eq(r.log.renovacao, 'inconclusiva', `R2 ${nome}: ciclo inconclusivo`);
      await new Promise((ok_) => setTimeout(ok_, 300));
      eq(await retrato(db), antes, `R2 ${nome}: resposta tardia nao renova nada, nem depois de chegar`);
      eq((await recibos(db)).map((x) => x.resultado), ['inconclusiva'], `R2 ${nome}: recibo inconclusivo dentro da reserva de registro`);
    } finally { await db.close(); }
  }
  // O modulo sozinho tambem segura o prazo por leitura (a fase do executor e a segunda camada).
  {
    const renovMod = carregar('supabase/functions/_shared/marketing-real-renovacao.ts'), t0 = Date.now();
    const g = graphDublada({ [`user:${IG}`]: corpoTarde({ id: IG }, 250), 'page:me': corpoTarde({ id: PAGINA }, null) });
    const res = await renovMod.criarRenovacao({ rede: g.rede, versao: 'v25.0', env: (n) => ENV[n], signal: new AbortController().signal, prazoLeitura: 40 })([
      { contaId: 'a', rede: 'instagram', remotoId: IG, credencialRef: 'MARKETING_IG_TOKEN' }, { contaId: 'b', rede: 'facebook', remotoId: PAGINA, credencialRef: 'MARKETING_FB_PAGE_TOKEN' }]);
    ok(Date.now() - t0 < 200, 'R2 modulo: leitura com corpo tardio respeita o prazo por GET');
    eq(res.map((x) => x.resultado), ['inconclusivo', 'inconclusivo'], 'R2 modulo: corpo tardio ou infinito e inconclusivo');
  }
  // Registro que falha ou pendura: nada renova, o log diz, e a lease vencida vira recibo.
  for (const [nome, falha] of [['registro recusado', async () => ({ data: null, error: { message: 'fonte-indisponivel' } })],
    ['registro pendurado', () => new Promise(() => {})]]) {
    db = await novoBanco();
    try {
      await cenario(db);const antes = await retrato(db), t0 = Date.now();
      const r = await rodar(db, graphDublada(), PR, { renovacao_registrar: falha });
      ok(Date.now() - t0 < 230, `R2 ${nome}: termina dentro do orcamento`);
      eq([r.log.renovacao, await retrato(db)], ['registro-pendente', antes], `R2 ${nome}: nada renova sem registro`);
      await comoDono(db, `update public.admin_marketing_controles set renovacao_lease_expira_em=now()-interval '1 second',renovacao_tentada_em=now()-interval '2 hours'`);
      await comoDono(db, `update public.admin_marketing_real_renovacoes set iniciado_em=now()-interval '2 hours'`);
      await rodar(db, graphDublada({ rede: true }));
      eq((await recibos(db))[0].detalhe, { motivo: 'sem-registro' }, `R2 ${nome}: ciclo sem registro vira recibo inconclusivo`);
    } finally { await db.close(); }
  }

  // 9. Banco: lease, recibo sem registro, validacao e grants.
  db = await novoBanco();
  try {
    await cenario(db);
    const rpc = async (n, args) => (await db.query(`select public.admin_marketing_real_${n}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args)).rows[0].r;
    const a = await rpc('renovacao_iniciar', [randomUUID()]);
    ok(a && a.contas.length === 2 && a.contas.every((x) => x.credencialRef.startsWith('MARKETING_')), 'iniciar devolve as contas com a referencia da credencial');
    eq(await rpc('renovacao_iniciar', [randomUUID()]), null, 'lease ativa: segunda execucao nao inicia');
    await assert.rejects(rpc('renovacao_registrar', [randomUUID(), a.renovacaoId, randomUUID(), { contas: [] }]), /lease-invalida/);checks++;
    await assert.rejects(rpc('renovacao_registrar', [randomUUID(), a.renovacaoId, a.lease, { contas: [{ contaId: a.contas[0].contaId, resultado: 'ok', formatos: { feed: 'publicado' } }] }]), /resultado-invalido/);checks++;
    await assert.rejects(rpc('renovacao_registrar', [randomUUID(), a.renovacaoId, a.lease, { contas: [{ contaId: a.contas[0].contaId, resultado: 'ok', motivo: 'Tem Token Aqui' }] }]), /resultado-invalido/);checks++;
    // Executor morreu sem registrar: a lease vence e o recibo nao fica "iniciada" para sempre.
    await comoDono(db, `update public.admin_marketing_controles set renovacao_lease_expira_em=now()-interval '1 second',renovacao_tentada_em=now()-interval '2 hours'`);
    await comoDono(db, `update public.admin_marketing_real_renovacoes set iniciado_em=now()-interval '2 hours'`);
    const b = await rpc('renovacao_iniciar', [randomUUID()]);
    ok(b && b.renovacaoId !== a.renovacaoId, 'lease vencida libera nova renovacao');
    eq((await recibos(db))[0], { resultado: 'inconclusiva', detalhe: { motivo: 'sem-registro' } }, 'ciclo abandonado vira recibo inconclusivo');
    await assert.rejects(rpc('renovacao_registrar', [randomUUID(), a.renovacaoId, a.lease, { contas: [] }]), /lease-invalida/);checks++;
    await db.exec('reset role');
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role);
      await assert.rejects(rpc('renovacao_iniciar', [randomUUID()]), /permission denied/);checks++;
      await assert.rejects(db.query('select * from public.admin_marketing_real_renovacoes'), /permission denied/);checks++;
      await db.exec('reset role');
    }
    const g = (await db.query(`select has_column_privilege('service_role','public.admin_marketing_real_contas','renovacao','UPDATE') as r,
      has_table_privilege('service_role','public.admin_marketing_real_renovacoes','DELETE') as d`)).rows[0];
    ok(g.r && !g.d, 'service_role atualiza o recibo da conta e nao apaga recibo de ciclo');
  } finally { await db.close(); }

  console.log(`marketing-real-renovacao: ${checks} verificacoes; executor e renovacao reais + SQL real (PGlite); Graph dublada, zero rede`);
}
// Promise que nunca resolve esvazia o event loop e o Node sai com 0 sem terminar: isso e falha.
let concluiu = false;
process.on('exit', () => { if (!concluiu && !process.exitCode) { console.error('marketing-real-renovacao: terminou sem concluir (promessa pendurada)'); process.exitCode = 1; } });
main().then(() => { concluiu = true; }, (e) => { console.error(e); process.exitCode = 1; });
