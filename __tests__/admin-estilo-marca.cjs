'use strict';
// Guarda da marca no painel (auditoria /impeccable, 21/10): Neue Machina é a única fonte, sem fonte do sistema
// em papel nenhum, inclusive em hash, código e saída de comando (PRODUCT.md, Brand Commitments).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const postcss = require('postcss');
const { abrirAmbiente } = require('./helpers/admin-feed-dom.cjs');

const ast = postcss.parse(fs.readFileSync('tools/admin-local/web/estilo.css', 'utf8'));
const SISTEMA = /monospace|consolas|cascadia|menlo|courier|system-ui|-apple-system|segoe|roboto|arial|helvetica/i;
const fontes = [];
ast.walkDecls(/^font(-family)?$/, (d) => { if (SISTEMA.test(d.value)) fontes.push(`${d.parent.selector}: ${d.value}`); });
assert.deepEqual(fontes, [], 'nenhuma regra declara fonte do sistema');

// A lateral fica na tela o dia todo: rótulo de 14px da escala, nunca o micro de 12px (auditoria /impeccable, B.2).
const tamanhoDe = (classe) => {
  let valor;
  ast.walkRules((r) => { if (r.selectors.includes(classe)) r.walkDecls('font-size', (d) => { valor = d.value; }); });
  return valor;
};
for (const classe of ['.lateral-marca-sub', '.nav-grupo-titulo', '.lateral-rodape']) {
  assert.equal(tamanhoDe(classe), 'var(--t-legenda)', `${classe} usa o rótulo de 14px`);
}
const miudos = [];
ast.walkDecls('font-size', (d) => { const px = /^(\d+)px$/.exec(d.value.trim()); if (px && Number(px[1]) <= 12) miudos.push(`${d.parent.selector}: ${d.value}`); });
assert.deepEqual(miudos, [], 'tamanho pequeno vem do token --t-micro, nunca escrito à mão');

(async () => {
  const { browser, page } = await abrirAmbiente(1280);
  try {
    const familias = await page.evaluate(() => {
      const caixa = document.createElement('div');
      caixa.innerHTML = '<pre class="saida"><code>a1b2c3d</code></pre><code>e4f5</code><kbd>F5</kbd><samp>ok</samp>'
        + '<div class="documento"><code>caminho/arquivo.js</code></div><p class="comando-pronto">npm run x</p>';
      document.body.append(caixa);
      return [...caixa.querySelectorAll('pre, code, kbd, samp, .comando-pronto')]
        .map((e) => `${e.tagName.toLowerCase()}${e.className ? '.' + e.className : ''}=${getComputedStyle(e).fontFamily}`);
    });
    const fora = familias.filter((f) => !/=\s*"?Neue Machina/.test(f));
    assert.deepEqual(fora, [], 'hash, código e saída usam a Neue Machina');
    console.log(`admin-estilo-marca: ${familias.length} elementos de código na Neue Machina, nenhuma fonte do sistema OK`);
  } finally { await browser.close(); }
})().catch((err) => { console.error(err); process.exitCode = 1; });
