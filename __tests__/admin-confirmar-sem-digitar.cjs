// Diálogo de confirmação do painel local: sem campo de digitar, Confirmar já habilitado,
// e só o clique em Confirmar resolve com verdadeiro. Módulo real, DOM mínimo, nada de rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('tools/admin-local/web/app.js', 'utf8').replace(/\r\n/g, '\n');
const pega = (nome) => {
  const m = new RegExp('^(?:export )?function ' + nome + '\\(.*?^}\\n', 'ms').exec(app);
  assert.ok(m, 'função ' + nome + ' não localizada no app.js');
  return m[0].replace(/^export /, '');
};
const trecho = ['h', 'anexar', 'abrirDialogo', 'confirmar'].map(pega).join('\n');
class No {}
function el(tag) {
  const n = Object.assign(new No(), { tag, children: [], attrs: {}, dataset: {}, listeners: {}, disabled: false, className: '', textContent: '',
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    setAttribute(k, v) { this.attrs[k] = v; if (k === 'disabled') this.disabled = true; },
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); },
    focus() { el.focado = this; }, click() { (this.listeners.click || []).forEach((f) => f({})); },
    showModal() {}, close() { (this.listeners.close || []).forEach((f) => f({})); } });
  return n;
}
const todos = (n) => [n, ...n.children.flatMap(todos)];
function rodar(clicar) {
  const corpo = el('body'); const document = { createElement: el, body: corpo, createTextNode: (t) => Object.assign(el('#texto'), { textContent: String(t) }) };
  const ctx = vm.createContext({ document, Node: No, Math, Promise, String, Object, Array, console });
  vm.runInContext(trecho + '\nthis.confirmar = confirmar;', ctx);
  const p = ctx.confirmar({ titulo: 'Refazer o deploy', texto: 'Resumo', detalhes: ['a'], rotuloBotao: 'Refazer deploy', perigo: true });
  const dlg = corpo.children[0]; const nos = todos(dlg);
  assert.equal(nos.filter((n) => n.tag === 'input').length, 0, 'nenhum campo de digitar');
  assert.ok(!JSON.stringify(nos.map((n) => n.textContent)).includes('digite'), 'sem pedido de frase');
  const botoes = nos.filter((n) => n.tag === 'button');
  const ok = botoes.find((b) => b.textContent === 'Refazer deploy'), cancelar = botoes.find((b) => b.textContent === 'Cancelar');
  assert.ok(ok && cancelar); assert.equal(ok.disabled, false, 'Confirmar nasce habilitado'); assert.equal(el.focado, ok);
  (clicar === 'ok' ? ok : clicar === 'cancelar' ? cancelar : { click() { dlg.close(); } }).click();
  return p.then((r) => ({ r, restantes: corpo.children.length }));
}
(async () => {
  assert.deepEqual(await rodar('ok'), { r: true, restantes: 0 });
  assert.deepEqual(await rodar('cancelar'), { r: false, restantes: 0 });
  assert.deepEqual(await rodar('esc'), { r: false, restantes: 0 });
  console.log('admin-confirmar-sem-digitar: sem campo, Confirmar habilitado, só o clique confirma; Cancelar e Esc recusam OK');
})().catch((e) => { console.error(e); process.exitCode = 1; });
