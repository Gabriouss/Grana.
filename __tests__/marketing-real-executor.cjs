// Agendamento REAL, lado remoto: modulos reais (operacao, importador, Graph e
// executor) sobre o SQL real em PGlite, com o default ACL do Supabase
// modelado. Dublês SO na fronteira: Graph (fetch), Storage e o transporte do
// cliente Supabase. Nenhuma chamada a Meta, Supabase ou rede real.
// Regra 9: as asserções olham QUAIS chamadas aconteceram (POST, admissão,
// recibo), não só o valor devolvido.
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
const reais = carregar('supabase/functions/_shared/admin-publicacoes-reais.ts');
const graphMod = carregar('supabase/functions/_shared/marketing-real-graph.ts');
const executorMod = carregar('supabase/functions/_shared/marketing-real-executor.ts');

const TOKEN = 'TOKEN-SENTINELA-NAO-VAZAR-123';
const SECRET = 's'.repeat(40);
const ENV = {
  MARKETING_REAL_EXECUTOR_ATIVO: 'true', MARKETING_REAL_EXECUTOR_SECRET: SECRET, META_GRAPH_API_VERSION: 'v25.0',
  MARKETING_IG_TOKEN: TOKEN, MARKETING_FB_TOKEN: TOKEN, SUPABASE_URL: 'https://proj.supabase.co',
};
const ARGS = {
  claim: ['p_worker', 'p_limite'], admitir: ['p_worker', 'p_job', 'p_lease', 'p_revisao'],
  recibo: ['p_worker', 'p_job', 'p_lease', 'p_revisao', 'p_resultado'], previa: ['p_admin', 'p_pedido'],
  confirmar: ['p_admin', 'p_previa', 'p_hash', 'p_revisao', 'p_idempotencia'], consultar: ['p_admin', 'p_filtro'],
  comando: ['p_admin', 'p_pedido'], snapshot_iniciar: ['p_admin', 'p_pedido'],
  snapshot_finalizar: ['p_admin', 'p_snapshot', 'p_revisao', 'p_verificacao'],
  renovacao_iniciar: ['p_worker'], renovacao_registrar: ['p_worker', 'p_renovacao', 'p_lease', 'p_resultado'],
};

async function novoBanco() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
    alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const f of ['20261015190000_admin_marketing_fundacao.sql', '20261016140000_admin_marketing_operacoes.sql', '20261018001000_admin_marketing_real.sql', '20261018230000_admin_marketing_renovacao.sql']) {
    await db.exec(fs.readFileSync(path.join(raiz, 'supabase/migrations', f), 'utf8'));
  }
  return db;
}
// Superusuário só para preparar o cenário (o "relógio" chegar ao horário); o resto roda como service_role.
async function comoDono(db, sql, params = []) {
  await db.exec('reset role');
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('set role service_role'); }
}

/** Cliente Supabase dublado: rpc e select vão ao SQL real; Storage é dublê que registra o que recebeu. */
function clienteDb(db, opcoes = {}) {
  const storage = { chamadas: [], objetos: new Map() };
  const cliente = {
    storage,
    rpc: (nome, args) => ({
      abortSignal: async (s) => {
        if (s?.aborted) return { data: null, error: { message: 'abortado' } };
        const n = nome.replace('admin_marketing_real_', '');
        if (opcoes.antesRpc) await opcoes.antesRpc(n, args);
        const valores = ARGS[n].map((k) => args[k]);
        try {
          const r = await db.query(`select public.${nome}(${valores.map((_, i) => '$' + (i + 1)).join(',')}) as r`, valores);
          return { data: r.rows[0].r, error: null };
        } catch (e) { return { data: null, error: { message: e.message, code: e.code } }; }
      },
    }),
    from: (tabela) => {
      let id;
      const b = {
        select: () => b, eq: (_c, v) => { id = v; return b; }, abortSignal: () => b,
        single: async () => b.maybeSingle(),
        maybeSingle: async () => {
          const r = await db.query(`select id,admin_id,identidade,estado,revisao,dados from public.${tabela} where id=$1`, [id]);
          return { data: r.rows[0] ?? null, error: null };
        },
      };
      return b;
    },
  };
  cliente.storage.from = (bucket) => ({
    createSignedUrl: async (p) => { storage.chamadas.push(['assinar', bucket, p]); return { data: { signedUrl: `https://proj.supabase.co/storage/v1/object/sign/${bucket}/${p}?token=t` }, error: null }; },
    createSignedUploadUrl: async (p, o) => { storage.chamadas.push(['url-upload', bucket, p, o]); return { data: { signedUrl: `https://proj.supabase.co/storage/v1/object/upload/sign/${bucket}/${p}?token=t` }, error: null }; },
    download: async (p, _o, params) => {
      storage.chamadas.push(['baixar', bucket, p, params?.signal instanceof AbortSignal]);
      const bytes = storage.objetos.get(p);
      return bytes ? { data: new Blob([bytes]), error: null } : { data: null, error: { message: 'nao existe' } };
    },
  });
  return cliente;
}

const futuro = () => new Date(Date.now() + 3600000).toISOString();
const sha = (b) => require('node:crypto').createHash('sha256').update(b).digest('hex');
const JPEG = Buffer.from([255, 216, 255, 224, 1, 2, 3, 4, 5, 6]);
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 9, 9]);

/** Conta, snapshot pronto, prévia e confirmação reais; o horário é trazido para agora pelo dono. */
async function agendar(db, { rede = 'instagram', formato = 'feed', midias = [{ bytes: JPEG, mime: 'image/jpeg', tipo: 'imagem' }] } = {}) {
  const admin = randomUUID(), conta = randomUUID();
  await db.exec('set role service_role');
  await db.query(`insert into public.admin_marketing_real_contas(id,rede,remoto_id,rotulo,credencial_ref,conexao,valida_ate,pausada,capacidades)
    values($1,$2,'123','Conta fixture',$3,'verificada',now()+interval '1 day',false,$4)`,
  [conta, rede, rede === 'instagram' ? 'MARKETING_IG_TOKEN' : 'MARKETING_FB_TOKEN', ['feed', 'carrossel', 'reels', 'stories'].map((f) => ({ formato: f, estado: 'disponivel', revisao: 1 }))]);
  const pedido = {
    pecaId: 'a'.repeat(16), versao: 'b'.repeat(40), aceiteId: 'aceite-' + randomUUID(), aceiteRevisao: 1, legenda: 'Legenda aprovada.',
    legendaSha256: sha('Legenda aprovada.'), midias: midias.map((m, ordem) => ({ ordem, sha256: sha(m.bytes), mime: m.mime, bytes: m.bytes.length, tipo: m.tipo })), capa: null,
  };
  const rpc = async (n, args) => (await db.query(`select public.admin_marketing_real_${n}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args)).rows[0].r;
  let snap = await rpc('snapshot_iniciar', [admin, pedido]);
  snap = await rpc('snapshot_finalizar', [admin, snap.id, 1, { identidade: snap.identidade, midias: snap.dados.midias, capa: null }]);
  await comoDono(db, `update public.admin_marketing_controles set habilitado=true,pausa_global=false,pausa_instagram=false,pausa_facebook=false,
    recuperacao_pendente=false,capacidade_validada_em=now(),margem_validada_ate=now()+interval '1 hour'`);
  const previa = await rpc('previa', [admin, { snapshotId: snap.id, snapshotRevisao: 2, destinos: [{ contaId: conta, formato, publicarEm: futuro(), fuso: 'America/Sao_Paulo' }] }]);
  const lote = await rpc('confirmar', [admin, previa.id, previa.hash, 1, randomUUID()]);
  await comoDono(db, `update public.admin_marketing_autorizacoes set confirmado_em=now()-interval '2 minutes',publicar_em=now()-interval '1 minute'`);
  await comoDono(db, `update public.admin_marketing_agendamentos set proxima_verificacao_em=now()`);
  return { admin, conta, snap, lote, rpc, pedido };
}

/** Graph dublado: registra cada chamada (método, caminho, parâmetros, Authorization, sinal). */
function graphFake(rotas) {
  const chamadas = [];
  const rede = async (input, init = {}) => {
    const u = new URL(String(input));
    const params = init.method === 'POST' ? Object.fromEntries(new URLSearchParams(String(init.body ?? ''))) : Object.fromEntries(u.searchParams);
    const c = { metodo: init.method, caminho: u.pathname.replace('/v25.0/', ''), params, auth: init.headers?.Authorization, url: u.href, signal: init.signal };
    chamadas.push(c);
    const resp = await rotas(c);
    return resp instanceof Response ? resp : Response.json(resp);
  };
  return { rede, chamadas };
}

async function rodarExecutor(db, rede, cliente = clienteDb(db), prazos) {
  const logs = [];
  const handler = executorMod.criarExecutorReal({ env: (n) => ENV[n], cliente: () => cliente, rede, log: (l) => logs.push(l), prazos });
  const r = await handler(new Request('https://x.invalid', { method: 'POST', headers: { 'x-marketing-real-secret': SECRET, 'content-type': 'application/json' }, body: '{}' }));
  return { status: r.status, corpo: await r.json(), logs };
}
const proximoTique = (db) => comoDono(db, `update public.admin_marketing_agendamentos set proxima_verificacao_em=now()`);
const job = async (db) => (await comoDono(db, `select estado,etapa,remoto_id,codigo_erro from public.admin_marketing_agendamentos`))[0];
const envios = (db) => comoDono(db, `select operacao,estado,codigo_erro,efeito_admitido_em is not null as admitido,tentativa from public.admin_marketing_envios order by iniciado_em,id`);

async function main() {
  /* ── 1. Ciclo completo IG Feed: preparar, consultar, publicar, readback ── */
  {
    const db = await novoBanco();
    try {
      await agendar(db);
      const g = graphFake((c) => {
        if (c.metodo === 'POST' && c.caminho === '123/media') return { id: '9001' };
        if (c.metodo === 'GET' && c.caminho === '9001') return { status_code: 'FINISHED' };
        if (c.metodo === 'POST' && c.caminho === '123/media_publish') return { id: '9100' };
        if (c.metodo === 'GET' && c.caminho === '9100') return { id: '9100', media_product_type: 'FEED' };
        throw new Error('rota inesperada ' + c.metodo + ' ' + c.caminho);
      });
      for (let i = 0; i < 4; i++) {
        const r = await rodarExecutor(db, g.rede);
        eq(r.status, 200, `rodada ${i + 1} do executor responde 200`);
        ok(!JSON.stringify(r).includes(TOKEN), `rodada ${i + 1}: token fora da resposta e do log`);
        await proximoTique(db);
      }
      const j = await job(db);
      eq([j.estado, j.remoto_id], ['publicado', '9100'], 'publicado só com o ID do post e o readback');
      eq(g.chamadas.map((c) => c.metodo + ' ' + c.caminho), ['POST 123/media', 'GET 9001', 'POST 123/media_publish', 'GET 9100'], 'uma chamada por etapa, na ordem do protocolo');
      eq(g.chamadas.filter((c) => c.caminho.endsWith('media_publish')).length, 1, 'media_publish exatamente uma vez');
      ok(g.chamadas.every((c) => c.auth === 'Bearer ' + TOKEN && !c.url.includes(TOKEN)), 'token só no cabeçalho, nunca na URL');
      ok(g.chamadas[0].params.image_url.startsWith('https://proj.supabase.co/storage/v1/object/sign/marketing-remoto/'), 'mídia vai por URL assinada do objeto registrado');
      const e = await envios(db);
      ok(e.filter((x) => x.operacao === 'preparar' || x.operacao === 'publicar').every((x) => x.admitido), 'todo POST teve a admissão gravada no banco antes de sair');
      eq((await rodarExecutor(db, g.rede)).corpo.processados, 0, 'job publicado não volta à fila');
    } finally { await db.close(); }
  }

  /* ── 2. POST de publicar pendurado: aborta o transporte, fica incerto, nunca repete ── */
  {
    const db = await novoBanco();
    try {
      const { admin, rpc } = await agendar(db);
      let sinalDoPublish = null;
      const g = graphFake((c) => {
        if (c.metodo === 'POST' && c.caminho === '123/media') return { id: '9001' };
        if (c.metodo === 'GET' && c.caminho === '9001') return { status_code: 'FINISHED' };
        if (c.metodo === 'POST' && c.caminho === '123/media_publish') {
          sinalDoPublish = c.signal;
          return new Promise((_, rejeitar) => c.signal.addEventListener('abort', () => rejeitar(new Error('abortado'))));
        }
        throw new Error('rota inesperada ' + c.caminho);
      });
      for (let i = 0; i < 3; i++) { await rodarExecutor(db, g.rede, undefined, { trabalho: 300 }); await proximoTique(db); }
      ok(sinalDoPublish?.aborted === true, 'o prazo da etapa abortou o POST de verdade, não só a espera');
      const j = await job(db);
      eq(j.estado, 'precisa-conferir', 'POST sem resposta vira "precisa conferir"');
      eq((await envios(db)).filter((x) => x.operacao === 'publicar').map((x) => x.estado), ['incerto'], 'o intento de publicar fica incerto');
      for (let i = 0; i < 2; i++) { await rodarExecutor(db, g.rede); await proximoTique(db); }
      const jobId = (await comoDono(db, `select id,revisao from public.admin_marketing_agendamentos`))[0];
      await rpc('comando', [admin, { acao: 'reconciliar', jobId: jobId.id, revisaoEsperada: jobId.revisao, idempotencia: randomUUID(), confirmado: true }]);
      await rodarExecutor(db, g.rede);
      eq(g.chamadas.filter((c) => c.caminho.endsWith('media_publish')).length, 1, 'nem as rodadas seguintes nem a reconciliação repetem o POST');
      eq((await job(db)).estado, 'precisa-conferir', 'sem ID recuperável, a reconciliação continua pedindo conferência humana');
    } finally { await db.close(); }
  }

  /* ── 3. Pausa entre o claim e o POST: o fence barra, nada sai, a etapa é repetida depois ── */
  {
    const db = await novoBanco();
    try {
      await agendar(db);
      let pausar = true;
      const cliente = clienteDb(db, {
        antesRpc: async (n) => { if (n === 'admitir' && pausar) { pausar = false; await comoDono(db, `update public.admin_marketing_controles set pausa_instagram=true`); } },
      });
      const g = graphFake((c) => (c.metodo === 'POST' ? { id: '9001' } : { status_code: 'IN_PROGRESS' }));
      await rodarExecutor(db, g.rede, cliente);
      eq(g.chamadas.filter((c) => c.metodo === 'POST').length, 0, 'pausa chegou antes do POST: nenhuma chamada de efeito à Meta');
      const e = await envios(db);
      eq([e[0].operacao, e[0].estado, e[0].codigo_erro, e[0].admitido], ['preparar', 'falhou', 'efeito-nao-admitido', false], 'o intento fica registrado como sem efeito');
      const j = await job(db);
      eq([j.estado, j.etapa], ['programado-no-painel', 'preparar'], 'o job volta à fila na mesma etapa, sem "precisa conferir"');
      await comoDono(db, `update public.admin_marketing_controles set pausa_instagram=false`);
      await proximoTique(db);
      await rodarExecutor(db, g.rede, cliente);
      eq(g.chamadas.filter((c) => c.metodo === 'POST').length, 1, 'retomada a operação, a etapa sai uma vez');
    } finally { await db.close(); }
  }

  /* ── 4. Readback depois de publicar: falha de rede espera; recusa da Meta pede conferência, nunca "falhou" ── */
  {
    const db = await novoBanco();
    try {
      await agendar(db);
      let readback = 'rede';
      const g = graphFake((c) => {
        if (c.metodo === 'POST' && c.caminho === '123/media') return { id: '9001' };
        if (c.metodo === 'GET' && c.caminho === '9001') return { status_code: 'FINISHED' };
        if (c.metodo === 'POST' && c.caminho === '123/media_publish') return { id: '9100' };
        if (readback === 'rede') throw new TypeError('fetch failed');
        return new Response(JSON.stringify({ error: { code: 10, message: 'permissao' } }), { status: 400 });
      });
      for (let i = 0; i < 4; i++) { await rodarExecutor(db, g.rede); await proximoTique(db); }
      let j = await job(db);
      eq([j.estado, j.etapa], ['programado-no-painel', 'verificar-publicacao'], 'GET sem resposta adia o readback, não marca falha');
      readback = 'meta-recusou';
      await rodarExecutor(db, g.rede);
      j = await job(db);
      eq(j.estado, 'precisa-conferir', 'recusa da Meta no readback vira conferência, nunca "falhou" (o post pode ter saído)');
      eq(g.chamadas.filter((c) => c.caminho.endsWith('media_publish')).length, 1, 'e nada é republicado');
    } finally { await db.close(); }
  }

  /* ── 5. Adaptador: formatos sem contrato oficial e mídia incompatível nunca chegam à Meta ── */
  {
    const casos = [
      ['facebook', 'stories', [{ tipo: 'imagem', mime: 'image/jpeg' }], 'formato-sem-contrato-oficial'],
      ['facebook', 'carrossel', [1, 2, 3].map(() => ({ tipo: 'imagem', mime: 'image/jpeg' })), 'carrossel-limite-nao-verificado'],
      ['instagram', 'feed', [{ tipo: 'imagem', mime: 'image/png' }], 'midia-incompativel'],
      ['instagram', 'feed', [{ tipo: 'video', mime: 'video/mp4' }], 'feed-video-nao-validado'],
    ];
    for (const [rede, formato, midias, codigo] of casos) {
      const g = graphFake(() => { throw new Error('não deveria chamar'); });
      const a = graphMod.criarAdaptadorGraphReal({ rede: g.rede, versao: 'v25.0', token: TOKEN, signal: new AbortController().signal, assinar: async () => 'https://x.invalid/a' });
      const r = await a.executar({ jobId: 'j', rede, formato, etapa: 'preparar', remotoContaId: '123', processamento: {} },
        { legenda: 'x', midias: midias.map((m, i) => ({ ...m, objeto: 'o' + i, sha256: 'a'.repeat(64), bytes: 10 })) });
      eq([r.estado, r.codigo, g.chamadas.length], ['falhou', codigo, 0], `${rede} ${formato}: ${codigo}, sem nenhuma chamada`);
    }
    const reel = async (status) => {
      const g = graphFake(() => ({ status }));
      const a = graphMod.criarAdaptadorGraphReal({ rede: g.rede, versao: 'v25.0', token: TOKEN, signal: new AbortController().signal, assinar: async () => '' });
      return a.executar({ jobId: 'j', rede: 'facebook', formato: 'reels', etapa: 'verificar-publicacao', remotoContaId: '123', processamento: { publicacaoId: '777' } },
        { legenda: 'x', midias: [{ tipo: 'video', mime: 'video/mp4', objeto: 'o', sha256: 'a'.repeat(64), bytes: 10 }] });
    };
    eq((await reel({ video_status: 'ready', publishing_phase: { status: 'complete', publish_status: 'published' } })).estado, 'publicado', 'Reel do Facebook: publicado só com a fase de publicação concluída');
    eq((await reel({ video_status: 'ready', publishing_phase: { status: 'complete', publish_status: 'draft' } })).estado, 'incerto', 'Reel em rascunho não conta como publicado');
    const g = graphFake(() => ({ id: '9100', media_product_type: 'STORY' }));
    const a = graphMod.criarAdaptadorGraphReal({ rede: g.rede, versao: 'v25.0', token: TOKEN, signal: new AbortController().signal, assinar: async () => '' });
    const r = await a.executar({ jobId: 'j', rede: 'instagram', formato: 'feed', etapa: 'verificar-publicacao', remotoContaId: '123', processamento: { publicacaoId: '9100' } },
      { legenda: 'x', midias: [{ tipo: 'imagem', mime: 'image/jpeg', objeto: 'o', sha256: 'a'.repeat(64), bytes: 10 }] });
    eq(r.estado, 'incerto', 'readback do Instagram confere o formato (Story não prova um Feed)');
  }

  /* ── 6. SQL: prévia recusa PNG no Instagram; ACL das tabelas novas com o default ACL do Supabase ── */
  {
    const db = await novoBanco();
    try {
      let erro = null;
      try { await agendar(db, { midias: [{ bytes: PNG, mime: 'image/png', tipo: 'imagem' }] }); } catch (e) { erro = e.message; }
      eq(erro, 'midia-incompativel', 'imagem PNG para Instagram é recusada já na prévia');
      const tem = async (papel, tabela, priv) => (await comoDono(db, `select has_table_privilege($1,$2,$3) as p`, [papel, 'public.' + tabela, priv]))[0].p;
      for (const t of ['admin_marketing_real_contas', 'admin_marketing_real_snapshots', 'admin_marketing_real_previas', 'admin_marketing_real_lotes', 'admin_marketing_real_comandos']) {
        for (const priv of ['UPDATE', 'DELETE', 'TRUNCATE']) ok(!(await tem('service_role', t, priv)), `service_role não herda ${priv} em ${t}`);
        for (const papel of ['anon', 'authenticated']) ok(!(await tem(papel, t, 'SELECT')), `${papel} não lê ${t}`);
      }
      const col = async (c, priv) => (await comoDono(db, `select has_column_privilege('service_role','public.admin_marketing_real_snapshots',$1,$2) as p`, [c, priv]))[0].p;
      ok(!(await col('dados', 'UPDATE')) && (await col('estado', 'UPDATE')), 'o conteúdo do snapshot é imutável; só estado e revisão mudam');
    } finally { await db.close(); }
  }

  /* ── 7. Importador: aborto real do envio, sinal no download, ator da mídia ── */
  {
    const db = await novoBanco();
    try {
      await db.exec('set role service_role');
      const admin = randomUUID(), outro = randomUUID();
      const cliente = clienteDb(db);
      let sinalDoPut = null;
      const rede = async (_u, init) => {
        sinalDoPut = init.signal;
        return new Promise((_, rejeitar) => init.signal.addEventListener('abort', () => rejeitar(new Error('abortado'))));
      };
      const imp = reais.criarImportadorSnapshotReal({ rede });
      const pedido = { pecaId: 'a'.repeat(16), versao: 'b'.repeat(40), aceiteId: 'aceite-imp', aceiteRevisao: 1, legenda: 'Legenda.',
        legendaSha256: sha('Legenda.'), midias: [{ ordem: 0, sha256: sha(JPEG), tipo: 'imagem', mime: 'image/jpeg', bytes: JPEG.length }], capa: null };
      const ctx = (userId, ms = 5000) => ({ userId, agora: new Date(), signal: AbortSignal.timeout(ms) });
      const ini = await imp.iniciar(cliente, pedido, ctx(admin));
      await assert.rejects(imp.enviar(cliente, { snapshotId: ini.snapshotId, indice: '0', bytes: new Uint8Array(JPEG) }, ctx(admin, 150)));
      ok(sinalDoPut?.aborted === true, 'envio pendurado: o PUT recebeu o sinal e foi abortado de verdade');
      ok(cliente.storage.chamadas.some((c) => c[0] === 'url-upload' && c[3]?.upsert === false), 'URL de envio pedida com upsert falso (sem sobrescrever)');
      const antes = cliente.storage.chamadas.length;
      await assert.rejects(imp.enviar(cliente, { snapshotId: ini.snapshotId, indice: '0', bytes: new Uint8Array(JPEG) }, { userId: admin, agora: new Date(), signal: AbortSignal.abort() }));
      eq(cliente.storage.chamadas.length, antes, 'cancelamento pedido antes da etapa não toca o Storage');
      // O objeto chega (o envio anterior pode ter sido aceito): finalizar relê com o sinal da etapa.
      cliente.storage.objetos.set(ini.snapshotId ? (await db.query(`select dados from public.admin_marketing_real_snapshots where id=$1`, [ini.snapshotId])).rows[0].dados.midias[0].objeto : '', new Uint8Array(JPEG));
      const pronto = await imp.finalizar(cliente, { snapshotId: ini.snapshotId, revisaoEsperada: 1 }, ctx(admin));
      eq(pronto.estado, 'pronto', 'finalizar relê o objeto e conclui');
      ok(cliente.storage.chamadas.filter((c) => c[0] === 'baixar').every((c) => c[3] === true), 'todo download recebe o AbortSignal da etapa');
      const baixadosAntes = cliente.storage.chamadas.filter((c) => c[0] === 'baixar').length;
      await assert.rejects(imp.midia(cliente, { snapshotId: ini.snapshotId, indice: '0' }, ctx(outro)), (e) => e.codigo === 'nao-autorizado' && e.status === 403);
      eq(cliente.storage.chamadas.filter((c) => c[0] === 'baixar').length, baixadosAntes, 'outro admin é recusado antes de qualquer leitura do Storage');
      const m = await imp.midia(cliente, { snapshotId: ini.snapshotId, indice: '0' }, ctx(admin));
      eq([m.mime, Buffer.from(m.bytes).equals(JPEG)], ['image/jpeg', true], 'o dono continua lendo a mídia');
    } finally { await db.close(); }
  }

  /* ── 8. Operação: código de negócio preservado ── */
  {
    const op = reais.criarOperacaoPublicacoesReais();
    const t = op.tratarErro(new reais.ErroPublicacaoReal('midia-incompativel', 409));
    eq([t.status, t.codigo], [409, 'midia-incompativel'], 'tratarErro preserva o código e o status de negócio');
    eq(op.tratarErro(new Error('qualquer')), null, 'erro desconhecido não vira código de negócio');
    // Todo código 4xx que o módulo lança precisa sair com o código real, não como 503 genérico (achado do Anvil).
    const fonte = fs.readFileSync(path.join(raiz, 'supabase/functions/_shared/admin-publicacoes-reais.ts'), 'utf8');
    const lancados = [...fonte.matchAll(/(?:falhar|ErroPublicacaoReal)\('([a-z-]+)'(?:,(\d+))?\)/g)].filter((m) => Number(m[2] ?? 400) < 500);
    ok(lancados.length >= 10, 'achou os códigos lançados no fonte');
    for (const [, codigo, st] of lancados) eq(op.tratarErro(new reais.ErroPublicacaoReal(codigo, Number(st ?? 400)))?.codigo, codigo, `tratarErro preserva ${codigo}`);
  }

  console.log(`marketing-real-executor: ${checks} verificacoes; modulos reais + SQL real (PGlite, default ACL Supabase); Graph/Storage dublados, zero rede`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
