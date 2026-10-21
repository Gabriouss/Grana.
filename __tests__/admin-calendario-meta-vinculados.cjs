// Regressão: recibos vinculados entram no dia real, nas duas redes, sem gravar editorial.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fonte = fs.readFileSync('tools/admin-local/web/telas/calendario.js', 'utf8')
  .replace(/^import .*\r?\n/gm, '').replace(/export (async )?function /g, '$1function ')
  .replace("await import('./_publicacoes-reais-ui.js')", '({ montarReal: async () => () => {} })');
const sandbox = { console, Date, Intl, URL, URLSearchParams, Map, Set, CANAIS: [], tituloPeca: (p) => p.nomeExibicao || p.nome || 'Peça', setTimeout };
// O módulo real de estado por rede entra no mesmo escopo (sem import no vm).
const reais = fs.readFileSync('tools/admin-local/web/telas/_publicacoes-reais.js', 'utf8').replace(/^export /gm, '');
vm.runInNewContext(`${reais}
${fonte}`, sandbox);
// Subtelas fora do escopo; projeção, carregamento e renderização do calendário são reais.
sandbox.montarCronograma = () => {};
sandbox.montarEnsaioCalendario = () => {};
const feed = { id: 'f'.repeat(16), versao: 'a'.repeat(40), nomeExibicao: 'O café, o delivery, a corrida', tipo: 'imagem' };
const reel = { id: 'e'.repeat(16), versao: 'b'.repeat(40), nomeExibicao: 'Fala o gasto, pronto', tipo: 'video' };
const post = (peca, rede, data = '2026-10-12') => ({ chave: peca.id + rede + data, rede, data, formato: peca.tipo === 'video' ? 'reel' : 'imagem', link: `https://example.org/${rede}/${peca.id}/${data}`, vinculo: { pecaId: peca.id, versao: peca.versao } });
const posts = [post(feed, 'instagram'), post(feed, 'facebook'), post(reel, 'instagram'), post(reel, 'facebook')];
const dados = { mes: '2026-10', itens: [], aprovadosSemData: [feed], reais: { status: 'disponivel', completo: true, itens: [] } };
const origem = JSON.stringify({ dados, posts });
assert.equal(sandbox.estadoDoIcone({ jobs: [{ estado: 'publicado', destino: { rede: 'facebook' } }, { estado: 'precisa-conferir', destino: { rede: 'instagram' } }] }, posts[0]).chave, 'atencao', 'publicado em uma rede não esconde o resultado incerto na outra');
const projetar = (camada = 'ambos', jobs = [], recibos = posts, catalogo = [reel]) => sandbox.projetarCalendario(dados, jobs, camada, recibos, catalogo);
for (const camada of ['ambos', 'real']) {
  const r = projetar(camada);
  assert.equal(r.itens.length, 2, 'uma peça por dia, mesmo com duas redes');
  assert.equal(r.aprovadosSemData.length, 0, 'publicado sai da bandeja');
  assert(r.itens.every((i) => i.data === '2026-10-12' && i.publicacoes.length === 2));
  assert.equal(new Set(r.itens.flatMap((i) => i.publicacoes.map((p) => p.link))).size, 4);
}
assert.equal(projetar('planejado').itens.length, 0);
assert.equal(projetar('planejado').aprovadosSemData.length, 1, 'camada editorial preservada');
// 21/10: o aviso conta a mesma lista da bandeja (o servidor contava 11, a bandeja mostrava 5).
{
  const outra = { ...feed, id: 'f'.repeat(16), versao: 'e'.repeat(40) };
  const avisoServidor = '2 peças aprovadas estão sem data válida no cronograma. Nenhuma data foi inferida.';
  const r2 = sandbox.projetarCalendario({ ...dados, aprovadosSemData: [feed, outra], avisos: [avisoServidor, 'Outro aviso.'] }, [], 'ambos', posts, [reel]);
  assert.equal(r2.aprovadosSemData.length, 1, 'publicado sai da bandeja, a outra fica');
  assert.deepEqual(JSON.parse(JSON.stringify(r2.avisos)), ['Outro aviso.',
    '1 peça aprovada está sem data no calendário; outra já tem agendamento real ou já foi publicada. Nenhuma data foi inferida.']);
  const r3 = sandbox.projetarCalendario({ ...dados, aprovadosSemData: [feed], avisos: [avisoServidor.replace('2 peças aprovadas estão', '1 peça aprovada está')] }, [], 'ambos', posts, [reel]);
  assert.deepEqual(JSON.parse(JSON.stringify(r3.avisos)), [], 'bandeja vazia: sem aviso de sem data');
}
const job = { jobId: 'job1', confirmadoEm: '2026-10-10T12:00:00Z', estado: 'publicado', peca: posts[0].vinculo, destino: { rede: 'instagram', formato: 'feed', publicarEm: '2026-10-11T12:00:00Z' }, permalink: posts[0].link };
let r = projetar('ambos', [job], [...posts, posts[0]]);
assert.equal(r.itens.length, 2, 'job+recibo não duplicam cartão no dia planejado');
assert.equal(r.itens[0].data, '2026-10-12');
assert.equal(r.itens[0].jobs.length, 1);
assert.equal(r.itens[0].publicacoes.length, 2, 'recibo repetido não duplica destino');
assert.equal(job.dataPublicacaoMeta, undefined, 'não altera job');
r = projetar('ambos', [], [...posts, post(feed, 'instagram', '2026-10-13')]);
assert.equal(r.itens.length, 3, 'dias distintos preservados');
assert.equal(r.itens.filter((i) => i.peca.id === feed.id && i.principal).length, 1);
assert.equal(projetar('ambos', [], [{ ...posts[0], vinculo: { ...posts[0].vinculo, versao: 'c'.repeat(40) } }]).itens.length, 0, 'não associa outra versão');
assert.equal(projetar('ambos', [], [post(feed, 'instagram', '2026-09-12')]).itens.length, 0, 'outro mês não muda a bandeja');
assert.equal(JSON.stringify({ dados, posts }), origem, 'nenhuma escrita nos dados');

function elemento(tag, attrs = {}, ...children) {
  return { tag, attrs, children: children.flat(Infinity).filter(Boolean),
    appendChild(v) { this.children.push(v); return v; }, replaceChildren(...v) { this.children = v.flat(Infinity).filter(Boolean); },
    get firstChild() { return this.children[0]; }, removeChild(v) { this.children = this.children.filter((n) => n !== v); },
    addEventListener() {}, classList: { add() {}, remove() {} }, close() {}, focus() {},
  };
}
const todos = (n) => n && typeof n === 'object' ? [n, ...n.children.flatMap(todos)] : [];
const texto = (n) => todos(n).map((e) => e.attrs.texto || '').join(' ');
(async () => {
  for (const camada of ['ambos', 'real', 'planejado']) {
    const raiz = elemento('main'), chamadas = [];
    const ctx = { h: elemento, params: { mes: dados.mes, camada }, obsoleta: () => false, cabecalho() {}, navegar() {},
      alerta: (tipo, t) => elemento('p', { texto: t }), aviso() {},
      estado: { carregando() {}, erro(_r, err) { throw err; } },
      formatar: { data: (d) => d, isoLocal: (d) => d.toISOString().slice(0, 10) },
      api: async (url, opcoes) => {
        assert.equal(opcoes, undefined, 'apenas leitura'); chamadas.push(url);
        if (url === '/api/marketing/pecas') return { dados: [feed, reel] };
        if (url.includes('meta-publicados')) return { dados: { posts, completo: true } };
        if (url.startsWith('/api/marketing/calendario?')) return { dados: { ...dados, reais: { ...dados.reais, itens: camada === 'planejado' ? [] : [job] } } };
        throw Error('Chamada inesperada: ' + url);
      },
    };
    const limpar = await sandbox.montar(raiz, ctx);
    const agenda = todos(raiz).find((n) => n.tag === 'ol' && n.attrs.class === 'agenda');
    assert(agenda, 'montagem completou sem cair no catch');
    if (camada === 'planejado') {
      assert.equal(chamadas.filter((u) => u === '/api/marketing/pecas').length, 0);
      assert.equal(todos(agenda).filter((n) => n.tag === 'article').length, 0);
    } else {
      assert.equal(chamadas.filter((u) => u === '/api/marketing/pecas').length, 1, 'catálogo recupera Reel ausente do editorial');
      const artigos = todos(agenda).filter((n) => n.tag === 'article');
      assert.equal(artigos.length, 2, 'grade/agenda não voltam a inserir posts soltos');
      assert(artigos.every((n) => n.attrs.draggable === 'false'));
      assert(texto(agenda).includes(feed.nomeExibicao) && texto(agenda).includes(reel.nomeExibicao));
      const links = todos(agenda).filter((n) => n.tag === 'a').map((n) => n.attrs.href);
      assert.equal(links.length, 4, 'job+recibo usa só um link por publicação');
      assert(posts.every((p) => links.includes(p.link)));
      assert(texto(raiz).includes('Aprovados sem data (0)'));
      const compactos = todos(raiz).filter((n) => n.tag === 'button' && (n.attrs.class || '').includes('cal-icone'));
      assert.equal(compactos.length, 2);
      assert(compactos.every((n) => n.attrs.type === 'button'), 'ícones acionáveis usam botões nativos');
      assert(compactos.every((n) => String(n.attrs['aria-label']).includes('Publicado')), 'o ícone diz o estado no aria-label');
      assert(compactos.some((n) => String(n.attrs['aria-label']).includes(feed.nomeExibicao)) && compactos.some((n) => String(n.attrs['aria-label']).includes(reel.nomeExibicao)), 'e o nome da peça');
    }
    limpar();
  }
  console.log('admin-calendario-meta-vinculados: projeção e montagem reais, duas redes, catálogo, camadas, data real, deduplicação, links e imutabilidade OK');
})().catch((err) => { console.error(err); process.exitCode = 1; });
