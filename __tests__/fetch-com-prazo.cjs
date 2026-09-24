/* Prazo em todo pedido do cliente Supabase (achados T10 e T11 do Sentinel,
 * 23/09/2026).
 *
 *   node __tests__/fetch-com-prazo.cjs
 *
 * Sintoma: com a sessão aberta havia uns 40 minutos, a pessoa desligou a rede
 * e tocou em salvar; o botão girou mais de quatro minutos e não saiu nunca. Com
 * a rede de volta continuou girando, e a faixa "Atualização pendente" não
 * apagava. O pedido saía por uma conexão já aberta, morta com a queda da rede,
 * e o `fetch` não tinha prazo: esperava para sempre. Se esse pedido era a
 * renovação do token, o auth do supabase-js segurava a trava da sessão e todo
 * pedido seguinte esperava atrás dele.
 *
 * Testa os MÓDULOS REAIS: `lib/supabase.ts` e `lib/fetch-com-prazo.ts`
 * compilados em memória, com o `@supabase/supabase-js` de verdade, contra um
 * servidor HTTP local que aceita a conexão e nunca responde. O prazo de
 * produção não muda: o `setTimeout` do módulo e o relógio do auth andam
 * ESCALA vezes mais rápido, então 20 s viram 200 ms.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const ESCALA = 100;
let passou = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };
const igual = (a, b, nome) => { assert.deepEqual(a, b, nome); passou++; };

/* ── Relógio acelerado ───────────────────────────────────────────────────
   O auth repete a renovação com espera exponencial até completar 30 s pelo
   `Date.now` dele. Acelerar o relógio mantém a mesma conta em milissegundos
   de teste; as esperas de 200, 400 ms continuam reais (ficam mais longas que
   na produção, proporcionalmente, o que só torna o teste mais exigente). */
const agoraReal = Date.now.bind(Date);
const inicio = agoraReal();
Date.now = () => inicio + (agoraReal() - inicio) * ESCALA;
const setTimeoutEncurtado = (fn, ms, ...args) => setTimeout(fn, Math.ceil((ms ?? 0) / ESCALA), ...args);

function compilar(arquivo) {
  return ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
}

function carregar(arquivo, dependencias, globais = {}) {
  const exports = {};
  vm.runInNewContext(compilar(arquivo), {
    exports, module: { exports }, console, Promise, JSON, Math, Number, String, Object, Array, Error, TypeError,
    RegExp, Set, Map, Uint8Array, ArrayBuffer, AbortController, Response, Request, Headers, URL,
    setTimeout: setTimeoutEncurtado, clearTimeout, Date,
    require(id) {
      if (id in dependencias) return dependencias[id];
      throw new Error(`Import não simulado em ${arquivo}: ${id}`);
    },
    ...globais,
  }, { filename: arquivo });
  return exports;
}

/* ── Servidor: mudo (rede caída numa conexão aberta) ou saudável ─────────── */
let modo = 'mudo';
const pedidos = [];
const penduradas = new Set();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (expSeg) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', exp: expSeg, role: 'authenticated' })}.assinatura`;
const agoraSeg = () => Math.floor(Date.now() / 1000);

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    pedidos.push({ metodo: req.method, caminho: req.url.split('?')[0], modo });
    if (modo === 'mudo') { penduradas.add(res); return; }
    if (modo === 'corpo-pendurado') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('[{"id":');
      penduradas.add(res);
      return;
    }
    if (modo === 'sem-conteudo') { res.writeHead(204); res.end(); return; }
    const json = (status, dado) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(dado)); };
    if (req.url.startsWith('/auth/v1/token')) {
      const exp = agoraSeg() + 3600;
      return json(200, {
        access_token: jwt(exp), refresh_token: 'r2', token_type: 'bearer', expires_in: 3600, expires_at: exp,
        user: { id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
      });
    }
    if (req.method === 'POST' && req.url.startsWith('/rest/v1/transactions')) return json(201, { id: 't1', ...JSON.parse(corpo || '{}') });
    if (req.url.startsWith('/rest/v1/transactions')) return json(200, []);
    return json(404, { message: 'rota não simulada' });
  });
});

/* Espera o desfecho, com um teto bem acima do prazo: se estourar, o pedido
   ficou pendurado, que é exatamente o defeito. */
async function desfecho(promessa, tetoMs) {
  let t;
  const teto = new Promise((r) => { t = setTimeout(() => r({ pendurado: true }), tetoMs); });
  const r = await Promise.race([
    Promise.resolve(promessa).then((valor) => ({ valor }), (erro) => ({ erro })),
    teto,
  ]);
  clearTimeout(t);
  return r;
}

async function principal() {
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${servidor.address().port}`;

  const prazoMod = carregar('lib/fetch-com-prazo.ts', {});
  igual(prazoMod.prazoDoPedido(`${url}/rest/v1/transactions`), 20_000, 'banco: prazo de 20 s');
  igual(prazoMod.prazoDoPedido(`${url}/auth/v1/token?grant_type=refresh_token`), 20_000, 'auth: prazo de 20 s');
  igual(prazoMod.prazoDoPedido(`${url}/functions/v1/delete-account`), 60_000, 'Edge Function: prazo de 60 s');
  igual(prazoMod.prazoDoPedido(`${url}/storage/v1/object/avatars/a.png`), 60_000, 'arquivo: prazo de 60 s');
  const PRAZO_TESTE = 20_000 / ESCALA;

  /* Controle: sem o prazo, o mesmo pedido fica pendurado. Prova que o
     servidor reproduz a condição, e não que o teste passa por acaso. */
  {
    modo = 'mudo';
    const controle = new AbortController();
    const r = await desfecho(fetch(`${url}/rest/v1/transactions`, { signal: controle.signal }), PRAZO_TESTE * 5);
    ok(r.pendurado, 'controle: fetch sem prazo contra o servidor mudo continua pendurado');
    controle.abort();
  }

  /* ── lib/supabase.ts real, com o supabase-js real ─────────────────────── */
  const chamadasFetch = [];
  const fetchRegistrado = (input, init) => {
    chamadasFetch.push(typeof input === 'string' ? input : input.url);
    return fetch(input, init);
  };
  const disco = new Map();
  const cofre = new Map();
  const sb = carregar('lib/supabase.ts', {
    'react-native-get-random-values': {},
    'aes-js': require('aes-js'),
    '@react-native-async-storage/async-storage': {
      __esModule: true,
      default: {
        getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
        setItem: async (k, v) => void disco.set(k, v),
        removeItem: async (k) => void disco.delete(k),
      },
    },
    'expo-secure-store': {
      getItemAsync: async (k) => (cofre.has(k) ? cofre.get(k) : null),
      setItemAsync: async (k, v) => void cofre.set(k, v),
      deleteItemAsync: async (k) => void cofre.delete(k),
    },
    '@supabase/supabase-js': require('@supabase/supabase-js'),
    'react-native': { Platform: { OS: 'android' }, AppState: { addEventListener() {} } },
    './fetch-com-prazo': prazoMod,
  }, {
    fetch: fetchRegistrado,
    crypto: globalThis.crypto,
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-teste' } },
  });
  const supabase = sb.supabase;

  /* T10: token de acesso vencido e rede caída numa conexão aberta. A
     renovação fica presa; antes, o insert nunca voltava. */
  const sessaoVencida = (exp) => JSON.stringify({
    access_token: jwt(exp), refresh_token: 'r1', token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  });
  await sb.armazenamentoSessao.setItem(sb.CHAVE_SESSAO, sessaoVencida(agoraSeg() - 60));
  modo = 'mudo';
  pedidos.length = 0;
  const antes = agoraReal();
  const t10 = await desfecho(supabase.from('transactions').insert({ description: 'AUDIT' }).select().single(), 15_000);
  ok(!t10.pendurado, 'T10: o insert com a renovação presa termina, em vez de girar para sempre');
  const erroT10 = t10.erro ?? t10.valor?.error;
  ok(erroT10, 'T10: o desfecho é um erro, não um sucesso falso');
  ok(/network request failed/i.test(String(erroT10?.message ?? erroT10)),
    `T10: o erro fala em falha de rede, que a fila offline e isLikelyNetworkError reconhecem (veio: ${erroT10?.message ?? erroT10})`);
  const renovacoes = pedidos.filter((p) => p.caminho === '/auth/v1/token').length;
  ok(renovacoes >= 1, 'T10: a renovação do token foi tentada (é ela que segurava a trava)');
  /* O auth repete a renovação dentro da janela de 30 s dele; o total fica
     preso a essa janela mais um prazo, e não cresce sem limite. */
  const decorridoFalso = (agoraReal() - antes) * ESCALA;
  ok(decorridoFalso < 30_000 + 3 * 20_000,
    `T10: pior caso limitado pela janela do auth mais os prazos (${Math.round(decorridoFalso / 1000)} s simulados)`);

  /* T11: a rede volta. Com a trava solta, o pedido seguinte do MESMO
     cliente sai e resolve, sem reabrir o app. */
  modo = 'ok';
  pedidos.length = 0;
  const t11 = await desfecho(supabase.from('transactions').select('id'), 5_000);
  ok(!t11.pendurado, 'T11: com a rede de volta, o pedido seguinte do mesmo cliente termina');
  igual(t11.valor?.error ?? null, null, 'T11: e termina sem erro');
  igual(t11.valor?.data, [], 'T11: com os dados do servidor');
  ok(pedidos.some((p) => p.caminho === '/rest/v1/transactions'), 'T11: o pedido chegou ao banco');

  /* Token válido e o próprio insert preso: um único envio, sem repetição
     automática que pudesse duplicar o lançamento. */
  modo = 'mudo';
  pedidos.length = 0;
  const t10b = await desfecho(supabase.from('transactions').insert({ description: 'AUDIT' }).select().single(), 5_000);
  ok(!t10b.pendurado, 'insert preso com token válido também termina');
  ok(/network request failed/i.test(String((t10b.erro ?? t10b.valor?.error)?.message)), 'e como falha de rede');
  igual(pedidos.filter((p) => p.metodo === 'POST' && p.caminho === '/rest/v1/transactions').length, 1,
    'o insert foi enviado uma vez só: o prazo não repete escrita');
  igual(pedidos.filter((p) => p.caminho === '/auth/v1/token').length, 0, 'token válido não pede renovação');
  ok(chamadasFetch.length > 0 && chamadasFetch.every((u) => u.startsWith(url)), 'todo pedido passou pelo fetch do módulo');

  /* ── comPrazo direto: corpo, aborto de quem chama e 204 ──────────────── */
  const comPrazo = prazoMod.comPrazo(fetch);

  modo = 'corpo-pendurado';
  const corpo = await desfecho(comPrazo(`${url}/rest/v1/transactions`).then((r) => r.text()), 5_000);
  ok(!corpo.pendurado, 'cabeçalhos 200 com o corpo pendurado: o prazo cobre a leitura do corpo');
  ok(/network request failed/i.test(String(corpo.erro?.message)), 'corpo pendurado vira falha de rede');

  modo = 'mudo';
  const externo = new AbortController();
  setTimeout(() => externo.abort(), 10);
  const abortado = await desfecho(comPrazo(`${url}/rest/v1/transactions`, { signal: externo.signal }), 5_000);
  ok(abortado.erro && !/network request failed/i.test(String(abortado.erro.message)),
    'aborto de quem chama continua aborto, não vira falta de rede');
  igual(abortado.erro?.name, 'AbortError', 'e mantém o nome AbortError');

  const jaAbortado = new AbortController();
  jaAbortado.abort();
  const antesDeSair = pedidos.length;
  const cedo = await desfecho(comPrazo(`${url}/rest/v1/transactions`, { signal: jaAbortado.signal }), 5_000);
  igual(cedo.erro?.name, 'AbortError', 'sinal já abortado rejeita na hora');
  await new Promise((r) => setTimeout(r, 30));
  igual(pedidos.length, antesDeSair, 'e nenhum pedido chega a sair');

  modo = 'sem-conteudo';
  const vazio = await desfecho(comPrazo(`${url}/rest/v1/transactions`, { method: 'DELETE' }), 5_000);
  igual(vazio.valor?.status, 204, '204 atravessa o prazo sem erro');
  igual(await vazio.valor.text(), '', 'e sem corpo');

  modo = 'ok';
  const cheio = await desfecho(comPrazo(`${url}/rest/v1/transactions`), 5_000);
  igual(await cheio.valor.json(), [], 'resposta saudável chega inteira');
  igual(cheio.valor.headers.get('content-type'), 'application/json', 'com os cabeçalhos originais');

  /* ── T20: texto com acento no React Native ───────────────────────────────
     No app, `Response` é o polyfill whatwg-fetch. A versão de e5642dd lia o
     corpo como ArrayBuffer e recriava a resposta; o polyfill decodifica
     ArrayBuffer como Latin-1, e "Alimentação" virava "AlimentaÃ§Ã£o" em toda
     leitura do banco. O Node decodifica UTF-8, por isso o teste acima não
     pegou. Aqui o módulo real roda com o Response do whatwg-fetch instalado. */
  /* No RN o polyfill detecta Blob e FileReader e o XHR entrega o corpo como
     Blob. O Node tem Blob mas não FileReader; este mínimo (texto em UTF-8,
     como o nativo do RN) liga o mesmo caminho do app. */
  globalThis.FileReader ??= class {
    readAsText(blob) { blob.text().then((t) => { this.result = t; this.onload?.(); }, (e) => this.onerror?.(e)); }
    readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onload?.(); }, (e) => this.onerror?.(e)); }
  };
  delete require.cache[require.resolve('whatwg-fetch/dist/fetch.umd.js')];
  const whatwg = require('whatwg-fetch/dist/fetch.umd.js');
  const bytesUtf8 = new TextEncoder().encode('Alimentação');
  const armadilha = await new whatwg.Response(bytesUtf8.buffer).text();
  igual(armadilha, 'AlimentaÃ§Ã£o', 'o polyfill decodifica ArrayBuffer como Latin-1 (a armadilha existe)');

  const prazoRN = carregar('lib/fetch-com-prazo.ts', {}, { Response: whatwg.Response, Headers: whatwg.Headers });
  /* O fetch do RN entrega o corpo já como texto decodificado (blob lido em
     UTF-8); o dublê entrega o mesmo, e um corpo binário como ArrayBuffer. */
  const JSON_ACENTUADO = '[{"category":"Alimentação","name":"Saúde","description":"Café gelado"}]';
  const BINARIO = new Uint8Array([0xff, 0x00, 0xc3, 0x28, 0x89, 0x50, 0x4e, 0x47]);
  const fetchRN = async (u) => (u.includes('/storage/')
    ? new whatwg.Response(new Blob([BINARIO]), { status: 200, headers: { 'content-type': 'audio/mpeg' } })
    : new whatwg.Response(new Blob([JSON_ACENTUADO]), { status: 200, headers: { 'content-type': 'application/json' } }));
  const noApp = prazoRN.comPrazo(fetchRN);

  igual(await (await noApp(`${url}/rest/v1/categories`)).text(), JSON_ACENTUADO, 'T20: texto com acento chega intacto no polyfill do RN');
  const json = await (await noApp(`${url}/rest/v1/categories`)).json();
  igual([json[0].category, json[0].name, json[0].description], ['Alimentação', 'Saúde', 'Café gelado'], 'T20: JSON com acento chega intacto');
  const bin = new Uint8Array(await (await noApp(`${url}/storage/v1/object/audio.mp3`)).arrayBuffer());
  igual([...bin], [...BINARIO], 'T20: corpo binário (storage, áudio) continua binário, byte a byte');

  console.log(`fetch-com-prazo: ${passou} checagens OK`);
}

principal()
  .then(() => { for (const r of penduradas) r.destroy(); servidor.close(); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
