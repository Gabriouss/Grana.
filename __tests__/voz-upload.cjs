// Executa o cliente real contra o serializador do Expo instalado. Nenhuma rede
// ou conta real: o que importa é atravessar a fronteira que o mock de fetch ocultava.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { corsHeaders } = require('@supabase/supabase-js/cors');
const root = path.join(__dirname, '..');

function carregar(arquivo, dependencias, globais = {}) {
  const exports = {};
  const fonte = fs.readFileSync(path.join(root, arquivo), 'utf8');
  const js = ts.transpileModule(fonte, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports, Blob, File, Request, Response, Uint8Array, TextEncoder,
    AbortController, setTimeout, clearTimeout, console, __DEV__: false,
    require(id) {
      if (id in dependencias) return dependencias[id];
      throw new Error(`Import não simulado: ${id}`);
    },
    ...globais,
  }, { filename: arquivo });
  return exports;
}

const { convertFormDataAsync } = carregar('node_modules/expo/src/winter/fetch/convertFormData.ts', {
  '../../utils/blobUtils': { blobToArrayBufferAsync: (blob) => blob.arrayBuffer() },
});

class FormNativo {
  partes = [];
  append(nome, valor) { this.partes.push([nome, valor]); }
  entries() { return this.partes.values(); }
}

async function main() {
  const antigo = new FormNativo();
  antigo.append('audio', { uri: 'file:///voz.m4a', name: 'voz.m4a', type: 'audio/m4a' });
  await assert.rejects(convertFormDataAsync(antigo), /Unsupported FormDataPart/);

  let existe = true, tamanho = 4, erroEnvio = null, envios = 0, token = 'sessao-ficticia';
  let plataforma = 'android', corpoEnviado = '', prazo;
  let relogio = 0, timeoutRapido = false;
  let resposta = () => Response.json({ status: 'ready', transcript: 'mercado 32 no Pix' });
  const cliente = carregar('lib/voz.ts', {
    './voz-local': { transcreverNoAparelho: async () => { relogio += tempoLocal; return null; } },
    'react-native': { Platform: { get OS() { return plataforma; } } },
    'expo-file-system': { File: class {
      constructor(uri) { assert.ok(uri.startsWith('file://')); }
      get exists() { return existe; }
      get size() { return tamanho; }
      name = 'voz.m4a'; type = 'audio/mp4';
      async bytes() { return new Uint8Array([1, 2, 3, 4]); }
    } },
    './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } } },
    'expo/fetch': { fetch: async (_url, init) => {
      const serializado = await convertFormDataAsync(init.body);
      corpoEnviado = new TextDecoder().decode(serializado.body);
      envios++;
      if (erroEnvio) throw erroEnvio;
      return resposta();
    } },
  }, {
    FormData: FormNativo,
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://example.invalid' } },
    fetch: async () => ({ blob: async () => new Blob(['audio-web'], { type: 'audio/webm' }) }),
    Date: { now: () => relogio },
    setTimeout(fn, ms) { prazo = ms; return setTimeout(fn, timeoutRapido ? 5 : ms); },
  });
  let tempoLocal = 0;
  const transcrever = () => cliente.transcreverAudio('file:///voz.m4a');
  assert.equal((await transcrever()).transcript, 'mercado 32 no Pix');
  assert.match(corpoEnviado, /name="audio"; filename="lancamento.m4a"/);
  assert.match(corpoEnviado, /audio\/mp4/);
  assert.ok(corpoEnviado.includes('\u0001\u0002\u0003\u0004'));
  assert.equal(prazo, 60_000);
  tempoLocal = 30000;
  await transcrever();
  assert.equal(prazo, 30000, 'reconhecimento local e remoto compartilham prazo total');
  tempoLocal = 0;
  // Widget e app usam o mesmo cliente, inclusive nome/opções do widget.
  assert.equal((await cliente.transcreverAudio('file:///widget.m4a', { mimeType: 'audio/m4a', nomeArquivo: 'widget.m4a' })).ok, true);
  assert.match(corpoEnviado, /name="audio"; filename="widget.m4a"/);
  assert.match(corpoEnviado, /content-type: audio\/m4a/);
  let rodadas = 0;
  resposta = () => {
    if (rodadas++ === 0) { relogio += 59000; return Response.json({}); }
    return Response.json({ status: 'ready', transcript: 'mercado 32' });
  };
  assert.equal((await transcrever()).ok, true);
  assert.equal(rodadas, 2);
  assert.equal(prazo, 1000, 'retry só pode usar o restante do orçamento total');
  timeoutRapido = true;
  resposta = () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
  assert.equal((await transcrever()).codigo, 'demorou', 'corpo pendurado também tem timeout');
  timeoutRapido = false;
  resposta = () => Response.json({ status: 'ready', transcript: 'mercado 32' });
  const antes = envios;
  existe = false;
  assert.equal((await transcrever()).codigo, 'audio_ausente');
  existe = true; tamanho = 0;
  assert.equal((await transcrever()).codigo, 'audio_ausente');
  tamanho = 2 * 1024 * 1024 + 1;
  assert.equal((await transcrever()).codigo, 'audio_grande');
  tamanho = 4; token = null;
  assert.equal((await transcrever()).codigo, 'sem_sessao');
  assert.equal(envios, antes);
  token = 'sessao-ficticia';
  for (const [erro, codigo] of [
    [new Error('Unsupported FormDataPart implementation'), 'erro_interno'],
    [new Error('Network request failed'), 'sem_rede'],
    [Object.assign(new Error('aborted'), { name: 'AbortError' }), 'demorou'],
  ]) {
    erroEnvio = erro;
    assert.equal((await transcrever()).codigo, codigo);
  }
  erroEnvio = null;
  resposta = () => Response.json({ message: 'Invalid JWT' }, { status: 401 });
  assert.equal((await transcrever()).codigo, 'nao_autenticado');
  resposta = () => Response.json({ code: 'sem_provedor' }, { status: 503 });
  assert.equal((await transcrever()).codigo, 'sem_provedor');
  plataforma = 'web';
  resposta = () => Response.json({ status: 'ready', transcript: 'voz web' });
  assert.equal((await transcrever()).transcript, 'voz web');
  assert.match(corpoEnviado, /audio-web/);

  let handler, autenticacoes = 0;
  carregar('supabase/functions/processar-lancamento-voz/index.ts', {
    'npm:@supabase/supabase-js@2.112.3': { createClient: () => ({
      auth: { getUser: async () => {
        autenticacoes++;
        return { data: { user: { id: 'usuario-ficticio' } }, error: null };
      } },
      rpc: async () => ({ data: [{ permitido: true, motivo: null, minuto_restante: 11, dia_restante: 59 }], error: null }),
    }) },
    'npm:@supabase/supabase-js@2.112.3/cors': { corsHeaders },
    '../_shared/ai-quota.ts': {
      consumirCotaIA: async () => ({ permitido: true, motivo: null, minutoRestante: 11, diaRestante: 59 }),
      mensagemCotaEsgotada: () => 'quota simulada',
    },
    '../_shared/voice-transcription.ts': {
      provedoresPadrao: () => [], transcrever: async () => ({ texto: 'mercado 32', provedor: 'simulado' }),
    },
    '../_shared/seguranca.ts': { fetchComTimeout: () => { throw new Error('Rede inesperada'); }, criarRateLimiter: () => () => false },
  }, { Deno: { env: { get: () => 'config-ficticia' }, serve(fn) { handler = fn; } } });
  const url = 'https://example.invalid/voz';
  const preflight = await handler(new Request(url, { method: 'OPTIONS' }));
  assert.equal(preflight.status, 204);
  assert.equal(autenticacoes, 0);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /authorization/);
  for (const metodo of ['GET', 'POST']) {
    const negada = await handler(new Request(url, { method: metodo }));
    assert.equal(negada.status, metodo === 'GET' ? 405 : 401);
    assert.equal(negada.headers.get('Access-Control-Allow-Origin'), '*');
  }
  const form = new FormData();
  form.append('audio', new Blob(['audio-ficticio'], { type: 'audio/m4a' }), 'voz.m4a');
  const sucesso = await handler(new Request(url, { method: 'POST', headers: { Authorization: 'Bearer ficticio' }, body: form }));
  assert.equal(sucesso.status, 200);
  assert.equal(sucesso.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal((await sucesso.json()).transcript, 'mercado 32');
  console.log('OK — upload nativo/web, regressão Expo 57, falhas locais/rede/sessão e CORS executados.');
}
main().catch((erro) => { console.error(erro); process.exitCode = 1; });
