// Reimportar o mesmo extrato depois de editar a data do lançamento (P2 do Harbor, 09/11/2026).
//
// Fluxo real de ponta a ponta: leitura do extrato, chave local, matcher e montagem do pedido vêm de
// `lib/conciliacao-pix-servico.ts`; a confirmação é a migration real `20261109110000` num Postgres
// local (PGlite). Só as fronteiras são dublês: o cliente do Supabase (ligado ao banco local),
// `expo-crypto` (SHA-256 do Node) e os avisos de tela. Fixtures inventadas.
//
// Antes da correção, a chave já usada caía no conflito da linha 52-60 e, adiante, na recusa de
// qualquer fitid da linha 88: o app oferecia "corrigir a data" e a confirmação sempre falhava.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), crypto = require('node:crypto');
const { novoBanco, novoUsuario, inserir, migration } = require('./helpers/postgres-t5.cjs');
const watchdog = setTimeout(() => { console.error('Pix reimportação: teste não concluiu'); process.exit(1); }, 60000);

const dia = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const EXTRATO = 'Data;Descrição;Valor;ID\n05/10/2026;Pix enviado;-37,42;id-fixture-1';
const ESCOLHA = { id: '0', categoria: 'Alimentação', cor: '#1fa98d' };

function servicoReal(db, usuario, carteira) {
  const c = { escritas: [], ultimoUid: null };
  // Leitura igual à do PostgREST: JSON da própria linha (numeric vira número, date vira AAAA-MM-DD).
  const tabela = async (nome) => (await db.query(
    `select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) j from public.${nome} t where t.user_id = $1`, [usuario])).rows[0].j;
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: usuario }, access_token: 'fixture' } }, error: null }),
      getUser: async () => ({ data: { user: { id: usuario } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from(nome) {
      const q = { select: () => q, eq: () => q, order: () => q, range: () => q,
        setHeader: async () => ({ data: await tabela(nome), error: null }) };
      return q;
    },
    rpc(nome, params) {
      return { async setHeader() {
        if (nome === 'obter_estado_acesso') return { data: { allowed: true }, error: null };
        c.escritas.push(params.p_item);
        await db.query("select set_config('app.uid',$1,false)", [usuario]);
        try {
          return { data: (await db.query('select public.confirmar_conciliacao_pix($1::jsonb) r', [JSON.stringify(params.p_item)])).rows[0].r, error: null };
        } catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
      } };
    },
  };
  const cache = new Map();
  function real(f) {
    f = path.resolve(f); if (cache.has(f)) return cache.get(f);
    const api = {}; cache.set(f, api);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports: api, Date, console: { warn() {} },
      require(id) {
        if (id === 'expo-crypto') return { CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (alg, s) => crypto.createHash(alg).update(s).digest('hex') };
        if (id === './supabase') return { supabase };
        if (['./lancamentos-alterados', './cache-de-tela', './widgets-home-events'].includes(id)) return { marcarLancamentosAlterados() {}, invalidarRespostasAtrasadas() {}, notificarDadosDosWidgetsAlterados() {} };
        if (id.startsWith('.')) return real(path.resolve(path.dirname(f), id + '.ts'));
        throw Error('fronteira inesperada ' + id);
      },
    }, { filename: f });
    return api;
  }
  const api = real('lib/conciliacao-pix-servico.ts');
  c.analisar = (texto = EXTRATO) => api.analisarExtratoPix({ userId: usuario, carteiraId: carteira, origemConta: 'Banco Modelo conta fixture', texto });
  c.confirmar = (analise, escolhas = [ESCOLHA]) => api.confirmarItensPix(analise, escolhas);
  return c;
}

(async () => {
  const db = await novoBanco();
  try {
    const schema = fs.readFileSync('supabase/schema.sql', 'utf8');
    await db.exec(schema.match(/alter table transactions add column if not exists fitid[^;]*;/)[0]);
    await db.exec(schema.match(/create unique index if not exists transactions_user_fitid_uniq\s+[^;]*;/)[0]);
    await db.exec("create function public.tem_direito_acesso() returns boolean language sql as $$ select true $$;");
    await db.exec(migration('20261109110000'));
    const u = await novoUsuario(db), outro = await novoUsuario(db);
    const carteira = async (dono) => (await db.query("insert into wallets(user_id,name,is_default) values($1,'Principal',true) returning id", [dono])).rows[0].id;
    const w = await carteira(u), wOutro = await carteira(outro);
    const linhaDb = async (id) => (await db.query('select * from transactions where id=$1', [id])).rows[0];
    const s = servicoReal(db, u, w);

    // 1. Primeira importação: o item novo é confirmado e recebe a chave do banco.
    const a1 = await s.analisar();
    assert.equal(a1.resultados[0].status, 'falta');
    const r1 = await s.confirmar(a1);
    assert.equal(r1[0].status, 'salvo');
    const chave = s.escritas[0].chave;
    const x = (await db.query('select id from transactions where fitid=$1', [chave])).rows[0].id;
    a1.cancelar();

    // 2. A pessoa edita só a data no app (05/10 para 06/10). O mesmo vale para retificação do banco.
    await db.query("update transactions set occurred_on='2026-10-06' where id=$1", [x]);
    const antes = await linhaDb(x);

    // 3. Reimportar o mesmo extrato: o matcher identifica pela chave e propõe corrigir a data.
    const a2 = await s.analisar();
    assert.equal(a2.resultados[0].status, 'data', 'matcher propõe corrigir a data do mesmo lançamento');
    assert.equal(a2.resultados[0].alvo.id, x);
    assert.equal(a2.resultados[0].linha.fitid, chave, 'a reimportação gera a mesma chave');

    // 4. Confirmar corrige a data e preserva identidade e todos os outros campos.
    const r2 = await s.confirmar(a2);
    assert.equal(r2[0].status, 'salvo', 'a proposta oferecida pelo app é aceita pelo servidor');
    assert.match(r2[0].mensagem, /Data corrigida/);
    const depois = await linhaDb(x);
    assert.equal(dia(depois.occurred_on), '2026-10-05');
    for (const campo of ['fitid', 'amount', 'type', 'description', 'category', 'color', 'wallet_id', 'card_id', 'payment_method', 'recurring', 'parent_id', 'user_id']) {
      assert.deepEqual(depois[campo], antes[campo], 'campo preservado: ' + campo);
    }
    assert.equal(Number((await db.query('select count(*) n from transactions')).rows[0].n), 1, 'nenhuma cópia criada');

    // 5. Repetir a mesma confirmação é idempotente; reanalisar não oferece mais nada.
    const r3 = await s.confirmar(a2);
    assert.equal(r3[0].status, 'salvo');
    assert.equal(dia((await linhaDb(x)).occurred_on), '2026-10-05');
    a2.cancelar();
    const a3 = await s.analisar();
    assert.equal(a3.resultados[0].status, 'conciliado');
    a3.cancelar();

    // 6. Guardas do caminho da mesma chave, chamando a RPC como o serviço chama.
    const pedido = async (atualizacao) => {
      const atual = await linhaDb(x);
      const json = (await db.query('select to_jsonb(t) j from transactions t where id=$1', [x])).rows[0].j;
      const esperado = Object.fromEntries(['occurred_on', 'amount', 'type', 'description', 'category', 'color', 'wallet_id', 'card_id', 'payment_method', 'fitid', 'recurring', 'parent_id', 'installment_current', 'installment_total'].map((k) => [k, json[k] ?? null]));
      return { wallet_id: w, chave, operacao: 'data', data: '2026-10-05', centavos: 3742, direcao: 'out', descricao: 'Pix enviado', categoria: 'Alimentação', cor: '#1fa98d', alvo_id: atual.id, esperado, ...atualizacao };
    };
    const rpc = async (dono, item) => {
      await db.query("select set_config('app.uid',$1,false)", [dono]);
      return (await db.query('select public.confirmar_conciliacao_pix($1::jsonb) r', [JSON.stringify(item)])).rows[0].r.situacao;
    };
    const dataDe = async (id) => dia((await linhaDb(id)).occurred_on);

    // 6a. Outro alvo com a mesma chave: conflito, nada muda.
    await db.query("update transactions set occurred_on='2026-10-06' where id=$1", [x]);
    const y = await inserir(db, u, { amount: 37.42, wallet_id: w, occurred_on: '2026-10-07', description: 'Outro', category: 'Outros' });
    assert.equal(await rpc(u, await pedido({ alvo_id: y })), 'conflito', 'chave existente não migra para outro lançamento');
    assert.equal(await dataDe(x), '2026-10-06'); assert.equal(await dataDe(y), '2026-10-07');
    await db.query('delete from transactions where id=$1', [y]);

    // 6b. Snapshot desatualizado (edição depois da análise): conflito.
    const velho = await pedido({});
    await db.query("update transactions set description='Editado depois' where id=$1", [x]);
    assert.equal(await rpc(u, velho), 'conflito');
    assert.equal(await dataDe(x), '2026-10-06');

    // 6c. Valor diferente do extrato: conflito.
    assert.equal(await rpc(u, await pedido({ centavos: 3743 })), 'conflito');
    // 6d. Fora da janela de ±3 dias: conflito.
    await db.query("update transactions set occurred_on='2026-10-09' where id=$1", [x]);
    assert.equal(await rpc(u, await pedido({})), 'conflito');
    assert.equal(await dataDe(x), '2026-10-09');
    await db.query("update transactions set occurred_on='2026-10-06' where id=$1", [x]);
    // 6e. Direção diferente: conflito.
    assert.equal(await rpc(u, await pedido({ direcao: 'in' })), 'conflito');
    // 6f. Outra carteira da pessoa no pedido: conflito.
    const w2 = (await db.query("insert into wallets(user_id,name,is_default) values($1,'Reserva',false) returning id", [u])).rows[0].id;
    assert.equal(await rpc(u, await pedido({ wallet_id: w2 })), 'conflito');
    // 6g. Outro dono com a mesma chave e o mesmo alvo: carteira alheia é recusada antes de tudo.
    await assert.rejects(rpc(outro, await pedido({})), /Carteira não confirmada/);
    assert.equal(await rpc(outro, await pedido({ wallet_id: wOutro })), 'conflito', 'outro dono não alcança o lançamento');
    assert.equal(await dataDe(x), '2026-10-06');

    // 6h. Fitid diferente no alvo continua recusado: outra chave bancária não sobrescreve a existente.
    const outraChave = chave.replace(/[0-9a-f]{64}$/, 'c'.repeat(64));
    assert.equal(await rpc(u, await pedido({ chave: outraChave })), 'conflito');
    assert.equal((await linhaDb(x)).fitid, chave);

    // 6i. Mesmo valor em outro lançamento sem chave na janela (dois almoços de 37,42): a chave
    // identifica o alvo, então a correção vale e o outro lançamento fica intacto. É o que o matcher propõe.
    const z = await inserir(db, u, { amount: 37.42, wallet_id: w, occurred_on: '2026-10-04', description: 'Almoço', category: 'Alimentação' });
    const a4 = await s.analisar();
    assert.equal(a4.resultados[0].status, 'data', 'matcher identifica pela chave mesmo com outro lançamento de mesmo valor');
    const r4 = await s.confirmar(a4);
    assert.equal(r4[0].status, 'salvo', 'a correção oferecida é aceita');
    assert.equal(await dataDe(x), '2026-10-05');
    assert.equal(await dataDe(z), '2026-10-04', 'o outro lançamento não é tocado');
    a4.cancelar();

    console.log('Pix reimportação real: mesma chave corrige só a data do mesmo lançamento, idempotente; outro alvo, snapshot, valor, janela, direção, carteira, dono e outra chave continuam em conflito');
  } finally { await db.close(); }
})().then(() => clearTimeout(watchdog), (e) => { clearTimeout(watchdog); console.error(e); process.exitCode = 1; });
