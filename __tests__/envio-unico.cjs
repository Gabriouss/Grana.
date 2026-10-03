/*
 * V22/Watchtower (03/10/2026): Enter na senha chamava o handler de envio mesmo
 * com um envio em andamento, driblando o `disabled` do botao e disparando dois
 * pedidos. Comportamento do modulo REAL `lib/envio-unico.ts` e conferencia de
 * que as duas telas o usam nos DOIS caminhos (botao e Enter).
 *
 *   node __tests__/envio-unico.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const mod = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'lib/envio-unico.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: mod, Promise });
const { envioUnico } = mod;

(async () => {
  let chamadas = 0;
  let liberar;
  const trava = { current: false };
  const corpo = () => { chamadas++; return new Promise((r) => { liberar = r; }); };
  const envio = envioUnico(trava, corpo);
  const a = envio();
  const b = envio(); // segundo Enter com o primeiro ainda no ar
  /* Re-render: o React cria um handler NOVO sobre a mesma trava da tela. */
  const c = envioUnico(trava, corpo)();
  assert.equal(chamadas, 1, 'tres disparos seguidos viram um so envio');
  liberar();
  await Promise.all([a, b, c]);
  envio();
  assert.equal(chamadas, 2, 'depois de terminar, um novo envio e aceito');
  liberar();

  const falha = envioUnico({ current: false }, async () => { chamadas++; throw new Error('rede'); });
  const antes = chamadas;
  await assert.rejects(falha(), /rede/);
  await assert.rejects(falha(), /rede/);
  assert.equal(chamadas - antes, 2, 'envio que falha solta o ferrolho');
  console.log('  ok  envioUnico: um por vez, solta ao terminar e ao falhar');

  for (const [tela, handler] of [['app/sign-in.tsx', 'handleSignIn'], ['app/sign-up.tsx', 'handleSignUp']]) {
    const s = fs.readFileSync(path.join(root, tela), 'utf8');
    assert.ok(/from '@\/lib\/envio-unico'|from '\.\.\/lib\/envio-unico'/.test(s), tela + ' importa envioUnico');
    assert.ok(s.includes(`const ${handler} = envioUnico(travaDeEnvio, `), tela + ': o handler e envolvido por envioUnico com a trava da tela');
    assert.ok(new RegExp(`onSubmitEditing=\{${handler}\}`).test(s) && new RegExp(`onPress=\{${handler}\}`).test(s), tela + ': Enter e botao chamam o mesmo handler guardado');
  }
  console.log('  ok  telas: botao e Enter passam pelo mesmo ferrolho');
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
