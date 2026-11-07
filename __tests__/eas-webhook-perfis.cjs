/* eas-build-webhook só publica `app_release` para os perfis do APK do site.
 *
 * Roda o MÓDULO REAL (`supabase/functions/eas-build-webhook/index.ts`),
 * transpilado em memória e executado em `vm`, com dublê do cliente Supabase
 * que registra cada RPC. A pergunta é QUAIS chamadas acontecem: uma build
 * `play` (AAB da Play Store) que chegasse a `publicar_app_release` faria todo
 * usuário do APK receber um aviso de atualização que não instala.
 *
 * Perfis permitidos: `preview` e `production` (eas.json, regra 8: os dois
 * geram `.apk` com `distribution: internal`). Qualquer outro, inclusive
 * `play`, `development` e perfil ausente, é ignorado sem tocar no banco.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

const SEGREDO = 'segredo-ficticio-de-teste';
const ESTAVEL = 'https://granaponto.com.br/downloads/grana-latest.apk';
const APK = 'https://expo.dev/artifacts/eas/9TRXShnbCgf0DtyXXD6c2ev__Mh2f4sQ0qFzoNUaAKo.apk';
const AAB = 'https://expo.dev/artifacts/eas/9TRXShnbCgf0DtyXXD6c2ev__Mh2f4sQ0qFzoNUaAKo.aab';
const NOTA = 'Correções no lançamento por voz.';
let checks = 0;
// JSON normaliza objetos criados dentro do vm (outro realm, outro Object.prototype).
const ok = (a, e, nome) => { assert.deepEqual(JSON.parse(JSON.stringify(a ?? null)), JSON.parse(JSON.stringify(e ?? null)), nome); checks++; };

function carregar() {
  const cache = new Map();
  const calls = [];
  const rede = [];
  let handler;
  const client = {
    rpc: async (nome, args) => {
      calls.push({ nome, args });
      if (nome === 'reivindicar_webhook_evento') return { data: 'claimed', error: null };
      if (nome === 'publicar_app_release') return { data: 'published', error: null };
      return { data: null, error: null };
    },
    from: () => { throw new Error('acesso direto a tabela inesperado'); },
  };
  const env = {
    EAS_WEBHOOK_SECRET: SEGREDO, SUPABASE_URL: 'https://fake.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'fake', ANDROID_DOWNLOAD_URL: ESTAVEL,
  };
  function real(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const api = {}; cache.set(file, api);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      exports: api, Request, Response, Headers, URL, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
      AbortController, crypto: globalThis.crypto, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 25)), clearTimeout,
      console: { log() {}, warn() {}, error() {} },
      Deno: { env: { get: k => env[k] }, serve: fn => { handler = fn; } },
      fetch: async (url) => { rede.push(String(url)); throw new Error('rede inesperada'); },
      require: id => {
        if (id.startsWith('npm:@supabase/supabase-js')) return { createClient: () => client };
        assert.ok(id.startsWith('.'), 'dependência inesperada: ' + id);
        return real(path.resolve(path.dirname(file), id));
      },
    }, { filename: file });
    return api;
  }
  real('supabase/functions/eas-build-webhook/index.ts');
  return { handler, calls, rede };
}

function requisicao(payload) {
  const corpo = Buffer.from(JSON.stringify(payload));
  return new Request('https://fake.invalid', {
    method: 'POST', body: corpo,
    headers: { 'content-type': 'application/json',
      'expo-signature': 'sha1=' + crypto.createHmac('sha1', SEGREDO).update(corpo).digest('hex') },
  });
}

function build({ perfil, url = APK, id = 'build-' + perfil }) {
  const metadata = { appVersion: '1.20.0', message: NOTA };
  if (perfil !== undefined) metadata.buildProfile = perfil;
  return { id, status: 'finished', platform: 'android', expirationDate: '2026-12-01T00:00:00.000Z',
    artifacts: { buildUrl: url }, metadata };
}

async function main() {
  /* Perfis do APK do site: publicam exatamente como antes. */
  for (const perfil of ['preview', 'production']) {
    const f = carregar();
    const r = await f.handler(requisicao(build({ perfil })));
    ok(r.status, 200, perfil + ': status');
    ok(await r.text(), 'ok', perfil + ': corpo');
    ok(f.calls.map(c => c.nome), ['reivindicar_webhook_evento', 'publicar_app_release', 'finalizar_webhook_evento'], perfil + ': RPCs');
    ok(f.calls[1].args, { p_version: '1.20.0', p_apk_url: ESTAVEL, p_expires_at: null, p_notes: NOTA }, perfil + ': argumentos da publicação');
    ok(f.calls[0].args.p_event_id, 'build-' + perfil, perfil + ': id do evento');
    ok(f.rede, [], perfil + ': sem GITHUB_* configurado não há dispatch');
  }

  /* Qualquer outro perfil, ou artefato que não seja .apk: nenhuma escrita. */
  const ignorados = [
    ['play com AAB', { perfil: 'play', url: AAB }],
    ['play mesmo com .apk', { perfil: 'play' }],
    ['development', { perfil: 'development' }],
    ['perfil ausente', { perfil: undefined }],
    ['perfil desconhecido', { perfil: 'staging' }],
    ['caixa diferente', { perfil: 'Production' }],
    ['production com AAB', { perfil: 'production', url: AAB }],
    ['preview com AAB', { perfil: 'preview', url: AAB }],
    ['preview com .apk só na query', { perfil: 'preview', url: AAB + '?x=.apk' }],
  ];
  for (const [rotulo, opcoes] of ignorados) {
    const f = carregar();
    const r = await f.handler(requisicao(build(opcoes)));
    ok(r.status, 200, rotulo + ': status');
    ok(await r.text(), 'ignored', rotulo + ': corpo');
    ok(f.calls, [], rotulo + ': nenhuma RPC (nem inbox, nem app_release)');
    ok(f.rede, [], rotulo + ': nenhum dispatch');
  }
  console.log(`eas-webhook-perfis: ${checks} checagens no módulo real, sem rede nem banco`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
