'use strict';
const assert = require('node:assert/strict');
const { runtime, pending, flush } = require('./helpers/auth-ui-runtime.cjs');
const email = ' ficticio@example.invalid ', senha = 'SenhaFicticia19';
const returned = { mensagem: 'Erro retornado de teste.', acao: 'recuperar-senha' };
const paths = { login: 'app/sign-in.tsx', cadastro: 'app/sign-up.tsx', recuperar: 'components/RecuperarSenhaModal.tsx' };
const methods = { login: 'signIn', cadastro: 'signUp', recuperar: 'recuperarSenha' };
function form(kind, options = {}, valid = true) {
  const r = runtime(paths[kind], options);
  if (valid) {
    r.field(kind === 'recuperar' ? 'E-mail da conta' : 'E-mail', email);
    if (kind !== 'recuperar') r.field('Senha', senha);
    if (kind === 'cadastro') { r.field('Confirmar senha', senha); r.acceptTerms(); }
  }
  return r;
}
function freed(r) { r.render(); assert.equal(r.busy, false, 'spinner deve sumir'); assert.equal(r.submit().props.disabled, false, 'botao deve habilitar'); }
const cases = [];
const test = (name, body) => cases.push([name, body]);
for (const kind of Object.keys(paths)) {
  test(`${kind}: rejeicao tratada, recibo e retentativa explicita`, async () => {
    let attempt = 0;
    const r = form(kind, { [methods[kind]]: async () => { if (++attempt === 1) throw Error('falha-sintetica'); return { error: null }; } });
    await assert.doesNotReject(async () => r.send(), 'handler nao pode propagar rejeicao'); freed(r);
    assert.match(r.text, /Não conseguimos/); assert.doesNotMatch(r.text, /falha-sintetica/);
    assert.equal(r.logs.length, 1); assert.equal(r.logs[0].length, 1, 'log fixo sem excecao ou dados');
    assert.doesNotMatch(JSON.stringify(r.logs), /example|SenhaFicticia|falha-sintetica/);
    assert.equal(r.count(methods[kind]), 1); assert.equal(r.routes.length, 0);
    assert.doesNotMatch(r.text, /Confirme seu e-mail|E-mail a caminho/);
    assert.equal(r.calls.find(c => c.name === methods[kind]).args[0], email.trim());
    await r.send(); r.render(); assert.equal(r.busy, false); assert.equal(r.count(methods[kind]), 2);
  });
  test(`${kind}: rejeicao sem objeto Error`, async () => {
    const r = form(kind, { [methods[kind]]: async () => { throw null; } });
    await assert.doesNotReject(async () => r.send()); freed(r); assert.match(r.text, /Não conseguimos/);
  });
  test(`${kind}: erro retornado preservado`, async () => {
    const r = form(kind, { [methods[kind]]: async () => ({ error: returned }) });
    await r.send(); freed(r); assert.match(r.text, /Erro retornado de teste/); assert.equal(r.logs.length, 0);
    if (kind === 'login') assert.match(r.text, /Esqueci minha senha/);
  });
  test(`${kind}: validacao local nao chama rede`, async () => {
    const r = form(kind, {}, false); await r.send(); freed(r);
    assert.equal(r.count(methods[kind]), 0); assert.equal(r.count('checarSenhaVazada'), 0);
    assert.match(r.text, kind === 'recuperar' ? /e-mail válido/ : /Preencha/);
    if (kind !== 'recuperar') assert.equal(r.focuses.length, 1);
  });
  test(`${kind}: sucesso sem navegacao adicionada`, async () => {
    const r = form(kind); await r.send(); r.render();
    assert.equal(r.busy, false); assert.equal(r.routes.length, 0); assert.equal(r.count(methods[kind]), 1);
    if (kind === 'recuperar') { assert.match(r.text, /E-mail a caminho/); assert.match(r.text, /Se houver uma conta/); }
    else freed(r);
  });
}
test('cadastro: rejeicao na checagem libera sem chamar signUp', async () => {
  const r = form('cadastro', { checarSenhaVazada: async () => { throw Error('checagem-sintetica'); } });
  await assert.doesNotReject(async () => r.send()); freed(r); assert.match(r.text, /Não conseguimos/);
  assert.equal(r.count('signUp'), 0); assert.equal(r.count('checarSenhaVazada'), 1); assert.equal(r.logs.length, 1);
});
for (const kind of ['login', 'cadastro']) test(`${kind}: Enter e botao compartilham trava real durante espera`, async () => {
  const d = pending(); const r = form(kind, { [methods[kind]]: () => d.promise });
  // Registrar settlement imediatamente evita unhandledRejection no baseline RED.
  const outcome = Promise.resolve(r.send()).then(() => null, e => e);
  await flush(); r.render(); assert.equal(r.busy, true); assert.equal(r.submit().props.disabled, true);
  await r.keyboard(); await r.send(); r.render(); await r.keyboard();
  assert.equal(r.count(methods[kind]), 1);
  d.reject(Error('pendente-sintetica')); const error = await outcome;
  assert.equal(error, null, 'rejeicao da chamada pendente deve ser tratada'); freed(r);
  assert.match(r.text, /Não conseguimos/);
});
test('cadastro: senha vazada bloqueia signUp e libera busy', async () => {
  const r = form('cadastro', { checarSenhaVazada: async () => ({ status: 'vazada', vezes: 19 }) });
  await r.send(); freed(r); assert.match(r.text, /Senha vazada \(19\)/); assert.equal(r.count('signUp'), 0);
});
test('cadastro: indisponivel retornado preserva permissao de seguir', async () => {
  const r = form('cadastro', { checarSenhaVazada: async () => ({ status: 'indisponivel' }) });
  await r.send(); freed(r); assert.equal(r.count('signUp'), 1);
});
test('cadastro: confirmacao de email permanece dependente do retorno', async () => {
  const r = form('cadastro', { signUp: async () => ({ error: null, needsEmailConfirmation: true }) });
  await r.send(); r.render(); assert.equal(r.busy, false); assert.match(r.text, /e-mail/i);
  assert.equal(r.submit(), undefined, 'formulario sai de cena apenas quando pede confirmacao'); assert.equal(r.routes.length, 0);
});
test('cadastro: termos recusados, senha invalida e divergente preservados', async () => {
  const r = form('cadastro', {}, false); r.field('E-mail', email); r.field('Senha', senha); r.field('Confirmar senha', senha);
  await r.send(); freed(r); assert.match(r.text, /precisa aceitar/);
  r.acceptTerms(); r.field('Senha', 'curta'); await r.send(); freed(r); assert.match(r.text, /pelo menos/);
  r.field('Senha', senha); r.field('Confirmar senha', 'OutraSenha19'); await r.send(); freed(r); assert.match(r.text, /não são iguais/);
  assert.equal(r.count('checarSenhaVazada'), 0); assert.equal(r.count('signUp'), 0);
});
(async () => {
  let failed = 0;
  for (const [name, body] of cases) { try { await body(); console.log('OK', name); } catch (e) { failed++; console.log('FAIL', name, e.message); } }
  console.log(JSON.stringify({ suite: 'auth-formularios-rejeicao-p2', total: cases.length, passed: cases.length - failed, failed, base: process.env.AUTH_UI_BASE ?? 'working-tree' }));
  process.exitCode = failed ? 1 : 0;
})();
