const assert = require('node:assert/strict');
const fs = require('node:fs');
const postcss = require('postcss');

const css = fs.readFileSync('tools/admin-local/web/estilo.css', 'utf8');
const ast = postcss.parse(css);
const firstRule = (selector) => {
  let found;
  ast.walkRules(selector, (rule) => { if (!found) found = rule; });
  assert.ok(found, `Regra CSS ausente: ${selector}`);
  return found;
};
const declarations = (rule) => Object.fromEntries(rule.nodes.filter((node) => node.type === 'decl').map((node) => [node.prop, node.value]));
const hasDecl = (rule, prop, value) => assert.equal(declarations(rule)[prop], value, `${rule.selector}: ${prop} esperado ${value}`);

const historico = firstRule('.demanda-historico');
hasDecl(historico, 'min-width', '0');
hasDecl(historico, 'max-width', '100%');

const eventos = firstRule('.demanda-eventos');
hasDecl(eventos, 'min-width', '0');
hasDecl(eventos, 'max-width', '100%');
hasDecl(eventos, 'list-style', 'none');

const evento = firstRule('.demanda-evento');
hasDecl(evento, 'display', 'grid');
hasDecl(evento, 'grid-template-columns', 'minmax(0, 1fr)');
hasDecl(evento, 'min-width', '0');
hasDecl(evento, 'overflow-wrap', 'anywhere');
assert.ok(firstRule('.demanda-evento::before'), 'marcador visual da timeline ausente');

const texto = firstRule('.demanda-evento-texto');
hasDecl(texto, 'min-width', '0');
hasDecl(texto, 'overflow-wrap', 'anywhere');

const data = firstRule('.demanda-evento-data');
hasDecl(data, 'display', 'block');
hasDecl(data, 'min-width', '0');
hasDecl(data, 'font-variant-numeric', 'tabular-nums');
hasDecl(data, 'overflow-wrap', 'anywhere');

assert.ok(firstRule('.demanda-historico > .campo-ajuda'), 'estado vazio do histórico sem estilo');
assert.ok(firstRule('.demanda-historico ~ .demanda-atencao.campo-ajuda'), 'alerta pós-histórico sem estilo');

let breakpointResponsivo = false;
ast.walkAtRules('media', (media) => {
  if (!/min-width:\s*768px/.test(media.params)) return;
  media.walkRules('.demanda-evento', (rule) => {
    if (declarations(rule)['grid-template-columns'] === 'minmax(0, max-content) minmax(0, 1fr)') breakpointResponsivo = true;
  });
});
assert.ok(breakpointResponsivo, 'timestamp não ganha coluna própria em telas largas');

console.log('CSS F4: histórico, vazio, alerta e reflow responsivo válidos.');
