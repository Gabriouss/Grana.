'use strict';
// Segurança da galeria local (scripts/galeria-midia.mjs), achados S1 e S2 de 13/10:
// - S1: o texto do autor chega ao maestri como UM argumento de execFile, sem shell;
// - rotas que escrevem recusam Origin/Host estranhos com 403 e não chamam nada;
// - S2: caminho com '..', absoluto ou pasta irmã (docs/marketing-x) é recusado.
// Módulo real em sandbox: http, child_process e as escritas de fs são dublês que REGISTRAM.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { Writable } = require('node:stream');
const ts = require('typescript');

const raiz = fs.mkdtempSync(path.join(process.env.GRANA_TEMP || os.tmpdir(), 'galeria-seg-'));
const mk = path.join(raiz, 'docs/marketing');
for (const d of ['.lixeira', 'solicitacoes-correcao', 'semana/pecas']) fs.mkdirSync(path.join(mk, d), { recursive: true });
fs.mkdirSync(path.join(raiz, 'docs/marketing-x'), { recursive: true });
fs.writeFileSync(path.join(mk, 'semana/pecas/card.png'), 'png');
fs.writeFileSync(path.join(raiz, 'docs/marketing-x/segredo.png'), 'fora');
fs.writeFileSync(path.join(raiz, 'docs/fora.txt'), 'fora');

let handler = null;
const chamadas = { execFile: [], exec: [], renameSync: [], writeFileSync: [], mkdirSync: [] };
const fsSandbox = { ...fs,
  mkdirSync: (...a) => { chamadas.mkdirSync.push(a); },
  renameSync: (...a) => { chamadas.renameSync.push(a); },
  writeFileSync: (...a) => { chamadas.writeFileSync.push(a); } };
const dependencias = {
  'node:http': { createServer: (fn) => { handler = fn; return { listen() {} }; } },
  'node:fs': fsSandbox,
  'node:path': { ...path, resolve: (...a) => path.resolve(raiz, ...a) },
  'node:child_process': {
    execFile: (...a) => { chamadas.execFile.push(a); },
    exec: (...a) => { chamadas.exec.push(a); },
  },
};
const fonte = fs.readFileSync(path.join(__dirname, '../scripts/galeria-midia.mjs'), 'utf8');
const js = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  + '\n;globalThis.__galeria = { dentroDaBase, pedidoDaPropriaPagina, BASE_DIR };';
const sandbox = { exports: {}, console: { log() {} }, URL, Buffer, process: { env: {} },
  require: (id) => { if (id in dependencias) return dependencias[id]; throw new Error(`Import não simulado: ${id}`); } };
vm.runInNewContext(js, sandbox, { filename: 'galeria-midia.mjs' });
const g = sandbox.__galeria;

class Resposta extends Writable {
  constructor() { super(); this.status = null; this.partes = []; }
  writeHead(status) { this.status = status; return this; }
  _write(c, _e, cb) { this.partes.push(Buffer.from(c)); cb(); }
  get corpo() { return Buffer.concat(this.partes).toString(); }
}
const HOST = 'localhost:3847';
function pedir(url, { metodo = 'POST', headers = { host: HOST, origin: `http://${HOST}` }, corpo } = {}) {
  return new Promise((resolve) => {
    const req = Object.assign(new EventEmitter(), { url, method: metodo, headers });
    const res = new Resposta();
    res.on('finish', () => resolve(res));
    handler(req, res);
    if (corpo !== undefined) { req.emit('data', Buffer.from(JSON.stringify(corpo))); req.emit('end'); }
  });
}
const zerar = () => { for (const k of Object.keys(chamadas)) chamadas[k].length = 0; };

(async () => {
  try {
    assert.equal(chamadas.mkdirSync.length, 0, 'fixture já tem as pastas; subir não criou nada');

    // S1: texto hostil vira um argumento só, sem shell, e exec nunca é usado.
    for (const hostil of ['Trocar $(calc) e $(rm -rf ~)', 'Trocar `calc` agora', 'aspas " e \\" e ; & | >']) {
      zerar();
      const r = await pedir('/api/notificar-correcao', { corpo: { arquivo: 'semana/pecas/card.png', instrucoes: hostil } });
      assert.equal(r.status, 200);
      assert.equal(chamadas.exec.length, 0, 'exec (com shell) não é chamado');
      assert.equal(chamadas.execFile.length, 1);
      const [cmd, args, opcoesOuCb] = chamadas.execFile[0];
      assert.equal(cmd, 'maestri');
      assert.equal(args.length, 3, 'ask, destino e prompt: três argumentos');
      assert.equal(args[0], 'ask');
      assert.equal(args[1], 'Orquestrador Supremo');
      assert.ok(args[2].includes(hostil.replace(/"/g, "'")), 'o texto do autor vai inteiro dentro do prompt');
      assert.equal(typeof opcoesOuCb, 'function', 'sem opções: nada de shell: true');
      assert.equal(chamadas.writeFileSync.length, 1, 'o chamado é registrado uma vez');
    }

    // Origin/Host: POST de outra origem recebe 403 e não chama nada.
    const casos = [
      { headers: { host: HOST, origin: 'https://site-malicioso.example' }, motivo: 'Origin de outro site' },
      { headers: { host: HOST, origin: 'http://localhost:9999' }, motivo: 'outra porta' },
      { headers: { host: 'evil.example:3847', origin: 'http://evil.example:3847' }, motivo: 'Host estranho (rebinding)' },
      { headers: { origin: `http://${HOST}` }, motivo: 'sem Host' },
      { headers: { host: HOST, origin: 'null' }, motivo: 'Origin null' },
    ];
    for (const rota of ['/api/notificar-correcao', '/api/lixeira', '/api/qualquer']) {
      for (const c of casos) {
        zerar();
        const r = await pedir(rota, { headers: c.headers });
        assert.equal(r.status, 403, `${rota}: ${c.motivo}`);
        assert.equal(chamadas.execFile.length + chamadas.exec.length + chamadas.renameSync.length + chamadas.writeFileSync.length, 0, `${rota}: ${c.motivo} não chama nada`);
      }
    }
    assert.equal(g.pedidoDaPropriaPagina({ headers: { host: '127.0.0.1:3847' } }), true, 'sem Origin (navegação direta) e Host certo passa');
    assert.equal(g.pedidoDaPropriaPagina({ headers: { host: '127.0.0.1:3847', origin: 'http://127.0.0.1:3847' } }), true);
    // GET continua liberado (a página e as mídias), mesmo sem Origin.
    assert.equal((await pedir('/api/imagens', { metodo: 'GET', headers: { host: HOST } })).status, 200);

    // S2: dentroDaBase e a lixeira recusam '..', absoluto e a pasta irmã.
    assert.equal(g.dentroDaBase('semana/pecas/card.png'), path.join(mk, 'semana/pecas/card.png'));
    for (const ruim of ['../marketing-x/segredo.png', '../fora.txt', '..', '', path.join(raiz, 'docs/marketing-x/segredo.png'), 'semana/../../fora.txt']) {
      assert.equal(g.dentroDaBase(ruim), null, `recusa ${ruim}`);
    }
    assert.equal(g.dentroDaBase('..arquivo-com-pontos.png'), path.join(mk, '..arquivo-com-pontos.png'), 'nome que só começa com dois pontos não é travessia');
    zerar();
    const lixeira = await pedir('/api/lixeira', { corpo: { itens: ['../marketing-x/segredo.png', '../fora.txt', path.join(raiz, 'docs/fora.txt'), 'semana/pecas/card.png'] } });
    assert.equal(lixeira.status, 200);
    assert.equal(JSON.parse(lixeira.corpo).movidos, 1, 'só o arquivo de dentro da base');
    assert.equal(chamadas.renameSync.length, 1);
    assert.equal(chamadas.renameSync[0][0], path.join(mk, 'semana/pecas/card.png'));
    assert.ok(chamadas.renameSync[0][1].startsWith(path.join(mk, '.lixeira') + path.sep));
    // /midia: a pasta irmã também não é servida.
    assert.equal((await pedir('/midia/' + encodeURIComponent('../marketing-x/segredo.png'), { metodo: 'GET', headers: { host: HOST } })).status, 404);
    assert.equal((await pedir('/midia/' + encodeURIComponent('semana/pecas/card.png'), { metodo: 'GET', headers: { host: HOST } })).status, 200);

    console.log('galeria-midia-seguranca: execFile sem shell com o texto como um argumento, 403 por Origin/Host em toda rota que escreve, path.relative recusa .. / absoluto / pasta irmã: OK');
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
