'use strict';
// Galeria da Aprovação (Lumen, 13/10): formatos Reels | Estáticos, capa dentro do Reel,
// carrossel como uma peça só e o contador do menu igual à galeria.
// Módulos reais (_pecas.js, ajustes.js, aprovacao.js) num DOM falso; zero rede e zero POST.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

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
  appendChild(n) { this.children.push(n); }, replaceChildren(...n) { this.children = n; },
  get firstChild() { return this.children[0]; }, removeChild(n) { this.children = this.children.filter((x) => x !== n); },
  setAttribute(k, v) { this.attrs[k] = v; }, focus() {} });
const walk = (n) => [n, ...(n.children || []).filter((c) => typeof c === 'object').flatMap(walk)];
const text = (n) => walk(n).map((x) => x.attrs.texto || '').join(' ');

const _pecas = load('_pecas.js');
const ajustes = load('ajustes.js');
const SEM = { numero: 41, inicio: '2026-10-05', fim: '2026-10-11' };
const D = 'docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11/para-aprovacao/pecas/';
const peca = (id, extra) => ({ id, versao: id[0].repeat(40), semana: SEM, estado: 'para-aprovacao', arquivos: [], ...extra });
const reel = peca('a'.repeat(16), { tipo: 'video', caminho: D + 'reels/reel-audit.mp4', nome: 'reels/reel-audit.mp4', capa: { pecaId: 'b'.repeat(16), url: '/x/capa.png' } });
const capa = peca('b'.repeat(16), { tipo: 'imagem', caminho: D + 'reels/reel-audit-capa.png', nome: 'reels/reel-audit-capa.png', capaDe: reel.id });
const orfa = peca('c'.repeat(16), { tipo: 'imagem', caminho: D + 'solta-1080x1920-capa.png', nome: 'solta-1080x1920-capa.png', capaOrfa: true });
const carrossel = peca('d'.repeat(16), { tipo: 'carrossel', caminho: D + 'carrossel-audit-*', nome: 'carrossel-audit-*',
  arquivos: [1, 2, 3].map((i) => ({ nome: `carrossel-audit-${i}.png`, tipo: 'imagem', url: `/x/${i}.png` })) });
const story = peca('e'.repeat(16), { tipo: 'imagem', caminho: D + 'stories/story-audit.png', nome: 'stories/story-audit.png' });
const vertical = peca('f'.repeat(16), { tipo: 'imagem', caminho: D + 'arte-1080x1920.png', nome: 'arte-1080x1920.png' });
const planejadaFeed = peca('1'.repeat(16), { tipo: 'imagem', caminho: D + 'cafe.png', nome: 'cafe.png', planejamento: { data: '2026-10-20', canal: 'instagram-feed' } });

// 1. Formato: capa pertence ao Reel; 9:16 sozinho não prova Stories.
assert.equal(_pecas.formatoDaPeca(reel), 'reels');
assert.equal(_pecas.formatoDaPeca(capa), 'reels');
assert.equal(_pecas.formatoDaPeca(orfa), 'reels');
assert.equal(_pecas.formatoDaPeca(carrossel), 'carrossel');
assert.equal(_pecas.formatoDaPeca(story), 'stories', 'destino escrito na pasta');
assert.equal(_pecas.formatoDaPeca(vertical), 'conferir', 'imagem vertical sem destino fica a conferir');
assert.equal(_pecas.formatoDaPeca(planejadaFeed), 'feed', 'canal do planejamento prova o destino');
assert.equal(_pecas.ROTULOS_FORMATO.conferir, 'Formato a conferir');

// 2. Capa separada pelo agrupamento volta para dentro do Reel; órfã continua sozinha.
const soltas = [{ chave: 'r', principal: reel, pecas: [reel] }, { chave: 'c', principal: capa, pecas: [capa] }, { chave: 'o', principal: orfa, pecas: [orfa] }];
const juntas = _pecas.juntarCapasAoReel(soltas);
assert.equal(juntas.length, 2);
assert.deepEqual(juntas[0].pecas.map((p) => p.id), [reel.id, capa.id]);
assert.equal(juntas[1].principal.id, orfa.id, 'capa órfã continua visível');
assert.equal(_pecas.juntarCapasAoReel([{ chave: 'c', principal: capa, pecas: [capa] }]).length, 1, 'capa sem o vídeo na lista não some');

// 3. Tela real: famílias do servidor deixam a capa fora; a galeria junta e o menu conta igual.
(async () => {
  const acervo = [reel, capa, orfa, carrossel, story, vertical];
  const familias = [{ id: 'f1', chave: 'r', principal: reel, alternativas: [], capas: [] }];
  const chamadas = [];
  const contagens = [];
  const ctx = { h: node, params: {}, obsoleta: () => false, recarregar() {}, cabecalho() {}, midia: () => node('img'), markdown: (t) => node('p', { texto: t }),
    selo: (_n, t) => node('span', { texto: t }), alerta: (_n, t) => node('p', { texto: t }),
    formatar: { data: (d) => d, dataHora: (d) => d }, estado: { carregando() {}, erro: () => assert.fail('falha UI'), vazio() {} },
    api: async (url) => { chamadas.push(url); return { dados: url.endsWith('/pecas') ? { pecas: acervo, familias } : { pedidos: [], remoto: { status: 'ativo' } } }; },
    acao: () => assert.fail('POST proibido'), contadorAprovacao: (n) => contagens.push(n) };
  const raiz = node('main');
  await load('aprovacao.js').montar(raiz, ctx);
  const cards = () => walk(raiz).filter((n) => n.attrs.class === 'demanda-familia');
  assert.equal(cards().length, 5, 'seis arquivos, cinco cards: a capa pareada entra no Reel');
  assert.ok(!walk(raiz).some((n) => n.attrs.class === 'galeria-card-titulo' && n.attrs.texto === 'reels/reel-audit-capa.png'), 'capa pareada nunca é card');
  assert.equal(contagens.at(-1), 5, 'menu conta as mesmas cinco famílias da galeria');
  const formatos = walk(raiz).filter((n) => n.attrs.class === 'galeria-card-formato').map((n) => n.attrs.texto);
  assert.ok(formatos.includes('Carrossel · 3 páginas'), 'carrossel é uma peça com as páginas juntas');
  assert.ok(formatos.includes('Formato a conferir'));
  assert.ok(formatos.includes('Stories'));
  assert.ok(text(raiz).includes('Capa sem Reel'), 'órfã tem aviso no card');
  // A janela do Reel (selecionado ao montar) mostra a capa dele, com aceite próprio.
  assert.ok(text(raiz).includes('Capa deste Reel'));
  const ficha = (t) => walk(raiz).find((n) => n.tag === 'button' && n.attrs.class === 'chip' && n.attrs.texto === t);
  ficha('Reels').attrs.onclick();
  assert.equal(cards().length, 2, 'Reels: o Reel (com a capa) e a capa órfã');
  ficha('Estáticos').attrs.onclick();
  assert.equal(cards().length, 3, 'Estáticos: carrossel, story e a imagem a conferir');
  ficha('Stories').attrs.onclick();
  assert.equal(cards().length, 1);
  ficha('Formato a conferir').attrs.onclick();
  assert.equal(cards().length, 1);
  ficha('Todos').attrs.onclick();
  assert.equal(cards().length, 5);
  assert.deepEqual(chamadas, ['/api/marketing/ajustes', '/api/marketing/pecas'], 'só leitura');
  // 4. Pedido de ajuste dentro da janela: categorias como prefixo, mesma rota e corpo de hoje.
  const ap = load('aprovacao.js');
  assert.equal(ap.motivoDoAjuste(new Set(['copy', 'legenda']), '  Trocar a frase final  '), 'Legenda, Copy da arte: Trocar a frase final');
  assert.equal(ap.motivoDoAjuste(new Set(), 'texto'), '', 'sem categoria não há motivo');
  assert.equal(ap.motivoDoAjuste(new Set(['visual']), '   '), '', 'sem texto não há motivo');
  async function janelaComAjuste(acao) {
    const posts = [], avisos = [], navegacoes = [];
    const c = { ...ctx, contadorAprovacao() {}, acao: async (url, body) => { posts.push({ url, body }); return acao(url, body); },
      aviso: (t, tipo) => avisos.push([tipo, t]), navegar: (u) => navegacoes.push(u),
      formulario: () => assert.fail('nada de formulário por cima da janela') };
    const r = node('main');
    await load('aprovacao.js').montar(r, c);
    const botao = (t) => walk(r).find((n) => n.tag === 'button' && n.attrs.texto === t);
    assert.equal(walk(r).some((n) => n.attrs.class === 'aprovacao-ajuste'), false, 'fechado até pedir');
    botao('Pedir ajuste').attrs.onclick();
    const secao = walk(r).find((n) => n.attrs.class === 'aprovacao-ajuste');
    assert.ok(secao, 'abre dentro da janela');
    assert.deepEqual(walk(secao).filter((n) => n.tag === 'input').map((n) => n.attrs.value), ['legenda', 'visual', 'design', 'copy']);
    return { r, secao, botao, posts, avisos, navegacoes };
  }
  {
    const t = await janelaComAjuste(async () => ({ dados: {} }));
    const registrar = walk(t.secao).find((n) => n.attrs.texto === 'Registrar pedido');
    await registrar.attrs.onclick();
    assert.equal(t.posts.length, 0, 'sem categoria e sem texto não envia');
    assert.ok(text(t.secao).includes('Escolha ao menos uma categoria') || walk(t.secao).some((n) => String(n.textContent || '').includes('Escolha ao menos uma categoria')));
    const input = (v) => walk(t.secao).find((n) => n.tag === 'input' && n.attrs.value === v);
    input('legenda').attrs.onchange({ target: { checked: true } });
    input('design').attrs.onchange({ target: { checked: true } });
    walk(t.secao).find((n) => n.tag === 'textarea').attrs.oninput({ target: { value: 'Legenda AUDIT mais curta' } });
    const primeiro = registrar.attrs.onclick(); await registrar.attrs.onclick(); await primeiro;
    assert.equal(t.posts.length, 1, 'clique duplo grava uma vez');
    assert.equal(t.posts[0].url, `/api/marketing/pecas/${reel.id}/ajuste`);
    assert.deepEqual(JSON.parse(JSON.stringify(t.posts[0].body)), { versao: reel.versao, motivo: 'Legenda, Design: Legenda AUDIT mais curta' });
    assert.deepEqual(t.navegacoes, [`#/marketing/aprovacao?peca=${encodeURIComponent(reel.id)}`], 'recarrega a mesma peça, sem card novo');
  }
  {
    const t = await janelaComAjuste(async () => { throw Object.assign(new Error('mudou'), { codigo: 'versao-mudou' }); });
    walk(t.secao).find((n) => n.tag === 'input' && n.attrs.value === 'visual').attrs.onchange({ target: { checked: true } });
    walk(t.secao).find((n) => n.tag === 'textarea').attrs.oninput({ target: { value: 'Visual AUDIT' } });
    await walk(t.secao).find((n) => n.attrs.texto === 'Registrar pedido').attrs.onclick();
    assert.equal(t.posts.length, 1);
    assert.equal(t.navegacoes.length, 0, 'versão que mudou não navega como sucesso');
    assert.ok(walk(t.secao).some((n) => String(n.textContent || '').includes('Recarregue a Aprovação')), 'avisa e pede para recarregar');
    assert.equal(t.avisos.some(([tipo]) => tipo === 'ok'), false);
  }
  // 5. COPYS-FINAIS.md fora da fila e do contador, pelo mesmo predicado; continua no Acervo.
  const copys = peca('9'.repeat(16), { tipo: 'texto', caminho: D + 'COPYS-FINAIS.md', nome: 'COPYS-FINAIS.md', arquivos: [{ nome: 'COPYS-FINAIS.md', tipo: 'texto', url: '/x/COPYS-FINAIS.md' }] });
  const roteiro = peca('8'.repeat(16), { tipo: 'texto', caminho: D + 'roteiro-audit.md', nome: 'roteiro-audit.md' });
  assert.equal(_pecas.ehReferenciaEditorial(copys), true);
  assert.equal(_pecas.pecaDaFila(copys), false);
  assert.equal(_pecas.pecaDaFila(roteiro), true, 'só o documento de referência sai; outro texto segue revisável');
  assert.equal(_pecas.pecaDaFila({ ...reel, estado: 'apoio' }), false);
  {
    const lista = [reel, capa, copys, roteiro];
    const conta = [];
    const c = { ...ctx, contadorAprovacao: (n) => conta.push(n), api: async (url) => ({ dados: url.endsWith('/pecas') ? { pecas: lista, familias } : { pedidos: [], remoto: { status: 'ativo' } } }) };
    const r = node('main');
    await load('aprovacao.js').montar(r, c);
    assert.equal(walk(r).filter((n) => n.attrs.class === 'demanda-familia').length, 2, 'Reel e roteiro; COPYS-FINAIS fora');
    assert.ok(!walk(r).some((n) => n.attrs.class === 'demanda-familia' && text(n).includes('COPYS-FINAIS.md')), 'o documento de copy nao vira card');
    assert.equal(conta.at(-1), 2);
    const appSrc = fs.readFileSync('tools/admin-local/web/app.js', 'utf8');
    const trecho = appSrc.slice(appSrc.indexOf('async function atualizarContadorAprovacao'), appSrc.indexOf('let timerContadorAprovacao'));
    assert.ok(trecho.includes('.filter(pecaDaFila)') && trecho.includes('juntarCapasAoReel('), 'contador do menu usa o mesmo predicado e a mesma junção da galeria');
    const acervoSrc = fs.readFileSync('tools/admin-local/web/telas/acervo.js', 'utf8');
    assert.ok(acervoSrc.includes("p.estado === 'para-aprovacao' && !ehReferenciaEditorial(p)"), 'Acervo não manda o documento para a Aprovação');
  }
  // 6. Duas famílias com o mesmo código na semana (revisão que o catálogo não juntou): aviso nos dois cards.
  {
    const v6 = peca('6'.repeat(16), { tipo: 'carrossel', codigo: 'C14', caminho: D + 'lumen-v6/c14-*', nome: 'lumen-v6/c14-*', arquivos: [{ nome: 'c14-1.png', tipo: 'imagem', url: '/x/a.png' }, { nome: 'c14-2.png', tipo: 'imagem', url: '/x/b.png' }] });
    const v7 = peca('7'.repeat(16), { tipo: 'carrossel', codigo: 'C14', caminho: D + 'lumen-v7/c14-*', nome: 'lumen-v7/c14-*', arquivos: [{ nome: 'c14-1.png', tipo: 'imagem', url: '/x/c.png' }, { nome: 'c14-2.png', tipo: 'imagem', url: '/x/d.png' }] });
    const c = { ...ctx, contadorAprovacao() {}, api: async (url) => ({ dados: url.endsWith('/pecas') ? { pecas: [v6, v7] } : { pedidos: [], remoto: { status: 'ativo' } } }) };
    const r = node('main');
    await load('aprovacao.js').montar(r, c);
    assert.equal(walk(r).filter((n) => n.attrs.class === 'galeria-card-aviso' && n.attrs.texto === 'Outra versão na fila (2)').length, 2);
    assert.ok(text(r).includes('Há outra versão desta peça na fila desta semana'));
    assert.ok(walk(r).some((n) => n.tag === 'button' && n.attrs.texto === `Ver ${_pecas.tituloPeca(v7)}`), 'atalho para a outra versão com nome de apresentação');
  }
  console.log('admin-galeria-aprovacao: formatos, capa no Reel, órfã visível, carrossel uma peça, filtros e contador igual à galeria, ajuste na janela com categoria, clique duplo e versão obsoleta, COPYS-FINAIS fora da fila e do contador, aviso de versão duplicada: OK');
})().catch((e) => { console.error(e); process.exitCode = 1; });
