'use strict';
// F-03 do Forge, 14/10/2026: a Aprovação mostra o estado da capa DENTRO do Reel. Catálogo, aceite
// (aprovacoes.cjs.aprovar, gravando só na fixture) e aprovacao.js são os módulos reais; a tela roda
// num DOM falso. Casos: sem aceite, com aceite composto do Reel (sem aceite próprio da capa) e capa
// alterada depois do aceite. Zero rede, zero mutação pela tela.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const base = fs.mkdtempSync(path.join(process.env.GRANA_TEMP || os.tmpdir(), 'grana-capa-composto-'));
const raiz = path.join(base, 'repo');
process.env.GRANA_ADMIN_PASTA_CONTA = path.join(base, 'conta');
process.env.GRANA_ADMIN_RAIZ_DADOS = raiz;
fs.mkdirSync(raiz, { recursive: true });
// Configuração dublê antes de importar: config.cjs não roda e não lê .env.
const configPath = require.resolve('../tools/admin-local/config.cjs');
require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: {
  RAIZ: path.resolve(__dirname, '..'), RAIZ_DADOS: raiz, ler: () => null, tem: () => false,
  ocultar: (s) => String(s), registrarSegredo() {}, refSupabase: () => null } };
global.fetch = () => { throw Error('rede proibida'); };
const cat = require('../tools/admin-local/marketing/catalogo.cjs');
const ap = require('../tools/admin-local/marketing/aprovacoes.cjs');

const mods = new Map();
function load(nome) {
  if (mods.has(nome)) return mods.get(nome).exports;
  const m = { exports: {} }; mods.set(nome, m);
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../tools/admin-local/web/telas', nome), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
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

const S41 = 'docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11';
const reelPath = `${S41}/para-aprovacao/pecas/reels/R01-audit-reel.mp4`;
let capaPath;
const grava = (rel, c) => { const f = path.join(raiz, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); };

async function tela(alterar = () => {}, pedidos = []) {
  const dto = JSON.parse(JSON.stringify(cat.listarPecas(raiz)));
  const reel = dto.pecas.find((p) => p.caminho === reelPath);
  alterar(reel);
  const r = node('main');
  await load('aprovacao.js').montar(r, { h: node, params: { peca: reel.id }, obsoleta: () => false, recarregar() {}, cabecalho() {}, navegar() {},
    midia: () => node('img'), markdown: (t) => node('p', { texto: t }), urlArquivo: (u) => u,
    selo: (_n, t) => node('span', { texto: t }), alerta: (_n, t) => node('p', { texto: t }), formatar: { data: (d) => d, dataHora: (d) => d },
    estado: { carregando() {}, erro: (_r, e) => assert.fail(e.message), vazio() {}, bloco: { vazio: (t) => node('p', { texto: t }) } },
    api: async (url) => ({ dados: url.endsWith('/pecas') ? dto : { pedidos, remoto: { status: 'ativo' } } }),
    acao: () => assert.fail('nenhuma mutação pela tela'), formulario: () => assert.fail('nada abre sozinho'), contadorAprovacao() {} });
  const bloco = walk(r).find((n) => n.attrs.class === 'demanda-capa');
  const botao = walk(r).find((n) => n.tag === 'button' && ['Aprovada nesta versão', 'Aprovar'].includes(n.attrs.texto));
  const grupo = { principal: reel, pecas: [reel] };
  const ajustes = load('ajustes.js');
  return { reel, capa: text(bloco), botao: botao.attrs, revisar: walk(bloco).some((n) => n.attrs.texto === 'Revisar capa'),
    calendario: walk(r).find((n) => n.tag === 'a' && n.attrs.texto === 'Marcar data no calendário')?.attrs,
    situacao: ajustes.situacaoDaFamilia(grupo, pedidos), contador: ajustes.contarPrecisaDeVoce([grupo], pedidos), texto: text(r) };
}

(async () => {
  try {
    // A capa física em para-aprovacao e em aprovados (F-03b do Watchtower): nos dois, só o Reel tem aceite.
    for (const pasta of ['para-aprovacao', 'aprovados']) {
      fs.rmSync(path.join(raiz, 'docs'), { recursive: true, force: true });
      capaPath = `${S41}/${pasta}/pecas/reels/audit-capa.png`;
      grava(`${S41}/INDICE.md`, '# AUDIT\n');
      grava(`${S41}/${pasta}/pecas/COPYS-FINAIS.md`, '## R01 - Fixture\n\n**Legenda:** Legenda de teste R01.\n');
      grava(reelPath, 'AUDIT-video-v1'); grava(capaPath, 'AUDIT-capa-v1');
      grava('docs/marketing/painel/familias.json', JSON.stringify({ formato: 1,
        familias: [{ id: 'AUDIT-F03', nome: 'Reel AUDIT F03', revisoes: [{ caminho: reelPath }], vigente: reelPath }],
        capas: [{ capa: capaPath, reel: reelPath }] }));

      // 1. Sem aceite: a capa pede aceite, e o texto diz que aprovar o Reel cobre os três.
      let t = await tela();
      assert.ok(t.reel.composicao && t.reel.capa, `${pasta}: Reel com composição selada`);
      assert.ok(t.capa.includes('Capa ainda sem aceite. Aprovar este Reel aceita vídeo, capa e legenda juntos.'), `${pasta}: ${t.capa}`);
      assert.equal(t.botao.disabled, false); assert.ok(t.revisar);

      // 2. Aceite composto real do Reel, sem aceite próprio da capa.
      await ap.aprovar(raiz, t.reel.id, { versao: t.reel.versao, confirmacao: true });
      const aceites = cat.lerJson(cat.caminhoPainel(raiz, 'aprovacoes.json'), {}).aprovacoes;
      assert.equal(aceites.length, 1, `${pasta}: só o Reel recebeu aceite`);
      t = await tela();
      assert.equal(t.reel.capa.aprovada, true, `${pasta}: DTO, capa coberta pelo composto`);
      assert.ok(t.capa.includes('Capa aprovada junto com o Reel: o aceite desta versão cobre vídeo, capa e legenda.'), `${pasta}: ${t.capa}`);
      assert.ok(!t.capa.includes('aceite próprio') && !t.capa.includes('não vale para ela'), `${pasta}: nem exige nem inventa aceite próprio`);
      assert.equal(t.reel.estado, 'para-aprovacao', 'recibo real válido, sem promover arquivos');
      assert.equal(t.botao.texto, 'Aprovada nesta versão');
      assert.equal(t.botao.disabled, true, 'aceite datado desta versão não pede reaprovação');
      assert.equal(t.situacao.secao, 'resolvidas');
      assert.equal(t.contador, 0, 'recibo válido não conta como pendência');
      assert.ok(!t.texto.includes('Conclua pelo botão Aprovar'));
      assert.equal(t.calendario.href, `#/marketing/calendario?secao=sem-data&peca=${encodeURIComponent(t.reel.id)}`);

      // DTOs antigos/incoerentes não tornam um recibo stale ou sem data válido.
      for (const alterar of [
        (p) => { p.aceite.versao = '0'.repeat(40); },
        (p) => { p.aceite.aprovadoEm = null; },
        (p) => { p.aceite.aprovadoEm = 'invalido'; },
        (p) => { p.aceiteDeVersaoAnterior = true; },
        (p) => { p.aceite = null; },
      ]) {
        const invalida = await tela(alterar);
        assert.equal(invalida.botao.texto, 'Aprovar');
        assert.equal(invalida.botao.disabled, false);
        assert.equal(invalida.situacao.secao, 'voce');
        assert.equal(invalida.contador, 1);
        assert.equal(invalida.calendario, undefined);
      }
      const comPedido = await tela(() => {}, [{ pecaId: t.reel.id, estado: 'precisa-de-atencao', criadoEm: '2026-10-21T10:00:00Z' }]);
      assert.equal(comPedido.situacao.secao, 'voce', 'aceite não esconde ajuste aberto');
      assert.equal(comPedido.contador, 1);
      const ajustes = load('ajustes.js');
      const mista = { principal: t.reel, pecas: [t.reel, { ...t.reel, id: 'outra', aprovada: false, aceite: null }] };
      assert.equal(ajustes.situacaoDaFamilia(mista, []).secao, 'voce', 'outra revisão pendente continua atenção');
      assert.equal(ajustes.contarPrecisaDeVoce([mista], []), 1);

      // 3. Capa alterada: a versão do Reel muda e o aceite deixa de valer.
      grava(capaPath, 'AUDIT-capa-v2');
      t = await tela();
      assert.equal(t.reel.aprovada, false); assert.equal(t.reel.capa.aprovada, false);
      assert.ok(t.capa.includes('Capa ainda sem aceite.'), `${pasta}: ${t.capa}`);
      assert.equal(t.botao.disabled, false, `${pasta}: composição nova pede aceite de novo`);
      assert.equal(t.situacao.secao, 'voce'); assert.equal(t.contador, 1);
      assert.equal(t.calendario, undefined, 'composição nova não segue como aprovada ao calendário');
    }

    // 4. Os outros ramos, direto na função exportada: "aceite próprio" só com registro da capa (capa.aceite).
    const { textoCapa } = load('aprovacao.js');
    assert.equal(textoCapa({ capa: { aprovada: true } }, { aprovada: true, aceite: { aprovadoEm: 'x' } }), 'Capa aprovada nesta versão, com aceite próprio.');
    assert.equal(textoCapa({ capa: { aprovada: true } }, { aprovada: true, aceite: null }), 'Capa aprovada junto com o Reel: o aceite desta versão cobre vídeo, capa e legenda.');
    assert.equal(textoCapa({ capa: { aprovada: false } }, { aprovada: false }), 'A capa exige aceite próprio; o aceite do vídeo não vale para ela.');

    console.log('admin-capa-composto-tela: módulos reais, capa em para-aprovacao e em aprovados; sem aceite pede aceite do Reel, aceite composto cobre a capa sem pedir aceite próprio, capa alterada volta a pedir; zero rede e zero mutação pela tela: OK');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
