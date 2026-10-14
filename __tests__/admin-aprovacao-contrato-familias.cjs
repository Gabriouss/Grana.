'use strict';
// Aprovação e Acervo consumindo o contrato de famílias do Keel (0a9af01), 14/10/2026.
// O DTO vem do catálogo REAL (catalogo.cjs.listarPecas) sobre uma fixture AUDIT com
// familias.json; as telas reais (_pecas.js, ajustes.js, aprovacao.js, acervo.js) rodam num
// DOM falso. Prova: a superada não vira card nem botão, a vigente guardada em historico/ é
// decidível, a família pendente bloqueia aprovar e mover e deixa pedir ajuste, e o filtro
// "Substituídas" do Acervo lê ?estado=superada uma vez. Zero POST, zero rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const base = fs.mkdtempSync(path.join(process.env.GRANA_TEMP || os.tmpdir(), 'grana-contrato-tela-'));
process.env.GRANA_ADMIN_PASTA_CONTA = path.join(base, 'conta');
const raiz = path.join(base, 'repo');
const cat = require('../tools/admin-local/marketing/catalogo.cjs');

const mods = new Map();
function load(nome) {
  if (mods.has(nome)) return mods.get(nome).exports;
  const m = { exports: {} }; mods.set(nome, m);
  const js = ts.transpileModule(fs.readFileSync(path.join('tools/admin-local/web/telas', nome), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { module: m, exports: m.exports, require: (id) => load(id.replace('./', '')), console, Date,
    localStorage: { getItem: () => null, setItem() {} }, setTimeout: () => 0, clearTimeout() {},
    fetch: () => { throw Error('rede proibida'); } });
  return m.exports;
}
const node = (tag, attrs = {}, ...children) => ({ tag, attrs: attrs || {}, children: children.flat(Infinity).filter(Boolean),
  appendChild(n) { this.children.push(n); }, replaceChildren(...n) { this.children = n.flat(Infinity).filter(Boolean); },
  get firstChild() { return this.children[0]; }, removeChild(n) { this.children = this.children.filter((x) => x !== n); },
  setAttribute(k, v) { this.attrs[k] = v; }, focus() {} });
const walk = (n) => [n, ...(n.children || []).filter((c) => typeof c === 'object').flatMap(walk)];
const text = (n) => walk(n).map((x) => x.attrs.texto || '').join(' ');
const botao = (r, t) => walk(r).find((n) => n.tag === 'button' && n.attrs.texto === t);

const S40 = 'docs/marketing/2026-10/semana-40-2026-09-28-a-2026-10-04';
const grava = (rel, c) => { const f = path.join(raiz, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); };

(async () => {
  try {
    grava(`${S40}/INDICE.md`, '| Peça | Cronograma | Parecer |\n| [C14](para-aprovacao/pecas/lumen-v7/) | `AUDIT-manifesto#AUDIT-item@2` | revisor AUDIT ok 0123456789abcdef0123 |\n');
    grava(`${S40}/para-aprovacao/pecas/lumen-v6/carrossel-1.png`, 'AUDIT-v6-1');
    grava(`${S40}/para-aprovacao/pecas/lumen-v6/carrossel-2.png`, 'AUDIT-v6-2');
    grava(`${S40}/para-aprovacao/pecas/lumen-v7/carrossel-1.png`, 'AUDIT-v7-1');
    grava(`${S40}/para-aprovacao/pecas/lumen-v7/carrossel-2.png`, 'AUDIT-v7-2');
    grava(`${S40}/para-aprovacao/pecas/r13-v3/audit-r13-v3.mp4`, 'AUDIT-r13-v3');
    grava(`${S40}/historico/pecas/r13/audit-r13-final.mp4`, 'AUDIT-r13-final');
    grava(`${S40}/para-aprovacao/pecas/pend-a/audit-pend-a.png`, 'AUDIT-pa');
    grava(`${S40}/para-aprovacao/pecas/pend-b/audit-pend-b.png`, 'AUDIT-pb');
    const C14 = `${S40}/para-aprovacao/pecas/lumen-v7/carrossel-*`;
    const R13 = `${S40}/historico/pecas/r13/audit-r13-final.mp4`;
    grava('docs/marketing/painel/familias.json', JSON.stringify({ formato: 1, capas: [], familias: [
      { id: 'C14', nome: 'C14, carrossel AUDIT', revisoes: [{ caminho: `${S40}/para-aprovacao/pecas/lumen-v6/carrossel-*` }, { caminho: C14 }], vigente: C14 },
      { id: 'R13', nome: 'R13 AUDIT', revisoes: [{ caminho: `${S40}/para-aprovacao/pecas/r13-v3/audit-r13-v3.mp4` }, { caminho: R13 }], vigente: R13 },
      { id: 'PEND', nome: 'Peça AUDIT pendente', revisoes: [{ caminho: `${S40}/para-aprovacao/pecas/pend-a/audit-pend-a.png` }, { caminho: `${S40}/para-aprovacao/pecas/pend-b/audit-pend-b.png` }], vigente: null, pendencia: 'AUDIT, o autor ainda escolhe' },
    ] }, null, 2));

    const dto = JSON.parse(JSON.stringify(cat.listarPecas(raiz)));
    const dtoSup = JSON.parse(JSON.stringify(cat.listarPecas(raiz, { estado: 'superada' })));
    const todas = [...dto.pecas, ...dtoSup.pecas];
    const por = (t) => todas.find((p) => p.caminho.includes(t));
    const v6 = por('lumen-v6'), v7 = por('lumen-v7'), r13v3 = por('audit-r13-v3'), r13 = por('audit-r13-final'), pa = por('pend-a'), pb = por('pend-b');
    assert.ok(v6 && v7 && r13v3 && r13 && pa && pb, 'fixture lida pelo catálogo real');
    assert.equal(r13.estado, 'historico'); assert.notEqual(r13.estadoEfetivo, 'historico', 'contrato: vigente em historico decide pelo estadoEfetivo');

    const chamadas = [];
    const ctx = (params, sup = async () => ({ dados: dtoSup })) => ({ h: node, params, obsoleta: () => false, recarregar() {}, cabecalho() {}, navegar() {},
      midia: () => node('img'), markdown: (t) => node('p', { texto: t }), urlArquivo: (u) => u,
      selo: (_n, t) => node('span', { texto: t }), alerta: (_n, t) => node('p', { class: 'alerta', texto: t }),
      formatar: { data: (d) => d, dataHora: (d) => `LOCAL(${d})` },
      estado: { carregando() {}, erro: (_r, e) => assert.fail(e.message), vazio() {}, bloco: { vazio: (t) => node('p', { texto: t }) } },
      api: async (url) => { chamadas.push(url); if (url.includes('estado=superada')) return sup(); return { dados: url.endsWith('/pecas') ? dto : { pedidos: [], remoto: { status: 'ativo' } } }; },
      acao: () => assert.fail('POST proibido'), formulario: () => assert.fail('nada abre sozinho'), contadorAprovacao() {} });
    const aprovacao = load('aprovacao.js');
    const abrir = async (peca) => { const r = node('main'); await aprovacao.montar(r, ctx({ peca: peca.id })); return r; };

    // 1. A superada não é card nem decisão; a vigente mostra a posição e as anteriores, só leitura.
    let r = await abrir(v7);
    const cards = walk(r).filter((n) => n.attrs.class?.includes('demanda-item'));
    for (const s of [v6, r13v3]) assert.ok(!cards.some((c) => c.attrs.dados?.peca === s.id), `${s.caminho} não vira card`);
    assert.ok(cards.some((c) => c.attrs.dados?.peca === v7.id) && cards.some((c) => c.attrs.dados?.peca === r13.id));
    assert.ok(text(r).includes('1 revisão anterior'), 'card conta as revisões anteriores');
    assert.ok(text(r).includes('Revisão 2 de 2, a vigente de C14, carrossel AUDIT.'), 'nome legível do registro, sem id');
    const bloco = walk(r).find((n) => n.attrs.class === 'aprovacao-mais demanda-superadas');
    assert.ok(bloco && !bloco.attrs.open && bloco.children[0].attrs.texto === 'Revisões anteriores (1)');
    assert.ok(text(bloco).includes('Revisão 1'));
    assert.equal(walk(bloco).filter((n) => n.tag === 'button' || n.tag === 'a').length, 0, 'revisão anterior sem botão nem link de ação');
    assert.ok(!text(r).includes('Outra versão na fila'), 'família registrada não dispara o aviso de duplicata');
    assert.equal(botao(r, 'Aprovar esta versão').attrs.disabled, false);
    // F-01 do Forge (F4-1): a linha do índice, mesmo recolhida, não mostra a chave do cronograma nem hash.
    assert.ok(v7.indice && v7.indice.includes('AUDIT-manifesto#AUDIT-item@2'), 'fixture: o DTO traz a linha íntegra do INDICE');
    const indice = walk(r).find((n) => n.attrs.class === 'aprovacao-mais peca-indice');
    assert.ok(indice, 'linha do índice presente no detalhe');
    assert.ok(text(indice).includes('vinculada ao cronograma') && text(indice).includes('revisor AUDIT ok'), 'vínculo e parecer em palavras');
    assert.ok(!/#|@\d|AUDIT-manifesto|AUDIT-item|0123456789abcdef/.test(text(r)), 'F4-1: sem manifesto#item@versão e sem hash no texto, nem recolhido');

    // 2. Vigente guardada em historico/ (R13 final): aprovar e pedir ajuste funcionam, e ela precisa de você.
    r = await abrir(r13);
    assert.equal(botao(r, 'Aprovar esta versão').attrs.disabled, false, 'R13 final aprovável');
    assert.equal(botao(r, 'Pedir ajuste').attrs.disabled, false);
    const cardR13 = walk(r).find((n) => n.attrs.dados?.peca === r13.id);
    assert.equal(cardR13.attrs['data-secao'], 'voce', 'vigente em historico/ fica em Precisa de você, não em Resolvidas');

    // 3. Família pendente: aviso no card e na janela, aprovar bloqueado, ajuste liberado.
    const pend = dto.pecas.find((p) => p.revisao?.familia === 'PEND');
    r = await abrir(pend);
    assert.ok(text(r).includes('Falta escolher a revisão'), 'aviso no card');
    assert.ok(text(r).includes('Falta você escolher a revisão vigente de Peça AUDIT pendente: AUDIT, o autor ainda escolhe.'));
    assert.equal(botao(r, 'Aprovar esta versão').attrs.disabled, true, 'pendente não se aprova');
    assert.equal(botao(r, 'Pedir ajuste').attrs.disabled, false, 'pedir ajuste ajuda a decidir (contrato)');
    assert.ok(!/\b[0-9a-f]{16}\b/.test(text(r)), 'F4-1: nenhum id de 16 hex no texto');

    // 4. Acervo: "Substituídas" pede ?estado=superada uma vez, mostra a vigente e não oferece Revisar.
    chamadas.length = 0;
    const ra = node('main');
    await load('acervo.js').montar(ra, ctx({}));
    assert.deepEqual(chamadas, ['/api/marketing/pecas'], 'lista padrão sem pedir as substituídas');
    const chip = () => walk(ra).find((n) => n.tag === 'button' && n.attrs.texto === 'Substituídas');
    await chip().attrs.onclick({ currentTarget: chip() });
    await chip().attrs.onclick({ currentTarget: chip() });
    assert.deepEqual(chamadas, ['/api/marketing/pecas', '/api/marketing/pecas?estado=superada'], 'lê uma vez só');
    assert.equal(walk(ra).find((n) => n.attrs.class === 'fila-contagem').textContent, '2 revisões substituídas', 'C14 v6 e R13 v3; a família pendente não tem superada');
    assert.ok(text(ra).includes('Substituída por carrossel-*, em C14, carrossel AUDIT.'));
    assert.ok(text(ra).includes('Substituída por audit-r13-final.mp4, em R13 AUDIT.'));
    assert.ok(!walk(ra).some((n) => n.tag === 'a' && n.attrs.texto === 'Revisar'), 'substituída não vai para a Aprovação');

    // 5. Falha ao ler as substituídas aparece; não vira lista vazia.
    const rb = node('main');
    await load('acervo.js').montar(rb, ctx({}, async () => { throw new Error('servidor fora'); }));
    const chipB = walk(rb).find((n) => n.tag === 'button' && n.attrs.texto === 'Substituídas');
    await chipB.attrs.onclick({ currentTarget: chipB });
    assert.ok(text(rb).includes('Não foi possível ler as revisões substituídas: servidor fora.'));
    assert.ok(!text(rb).includes('Nenhuma revisão substituída'));

    console.log('admin-aprovacao-contrato-familias: DTO real do catálogo; linha do índice sem chave do cronograma nem hash (F4-1); superada fora dos cards e sem ação, vigente em historico decidível, pendente bloqueia aprovar e libera ajuste, Acervo lê as substituídas uma vez e mostra a falha; zero POST: OK');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
