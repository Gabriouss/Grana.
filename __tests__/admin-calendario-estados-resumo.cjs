'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const fonte = fs.readFileSync('tools/admin-local/web/telas/calendario.js', 'utf8')
  .replace(/^import .*\r?\n/gm, '').replace(/export (async )?function /g, '$1function ')
  .replace("await import('./_publicacoes-reais-ui.js')", '({ montarReal: async () => () => {} })');
const reais = fs.readFileSync('tools/admin-local/web/telas/_publicacoes-reais.js', 'utf8').replace(/^export /gm, '');
const s = { console, Date, Intl, URL, URLSearchParams, Map, Set, CANAIS: [], tituloPeca: p => p.titulo, setTimeout };
vm.runInNewContext(`${reais}\n${fonte}`, s);
s.montarCronograma = () => {}; s.montarEnsaioCalendario = () => {};
function h(tag, attrs = {}, ...children) {
  return { tag, attrs, children: children.flat(Infinity).filter(Boolean),
    appendChild(v) { this.children.push(v); return v; }, replaceChildren(...v) { this.children = v.flat(Infinity).filter(Boolean); },
    get firstChild() { return this.children[0]; }, removeChild(v) { this.children = this.children.filter(x => x !== v); },
    addEventListener() {}, classList: { add() {}, remove() {} }, close() {}, focus() {} };
}
const todos = n => n && typeof n === 'object' ? [n, ...n.children.flatMap(todos)] : [];
const texto = n => todos(n).map(e => e.attrs.texto || '').join(' ');
const peca = { id: 'a'.repeat(16), versao: 'b'.repeat(40), titulo: 'Peça fixture', tipo: 'imagem' };
const job = (estado, rede = 'instagram') => ({ jobId: rede, peca: { pecaId: peca.id, versao: peca.versao },
  estado, confirmadoEm: '2026-10-21T13:00:00Z', revisao: 1, recibos: [],
  destino: { rede, formato: 'feed', publicarEm: '2026-10-22T15:00:00Z' } });
(async () => {
  for (const camada of ['ambos', 'real']) {
    for (const estados of [['cancelado'], ['falhou'], ['precisa-conferir'], ['programado-no-painel', 'falhou']]) {
      const jobs = estados.map((e,i) => job(e, i ? 'facebook' : 'instagram'));
      const dados = { mes: '2026-10', itens: [{ peca, data: '2026-10-22', hora: '12:00' }], aprovadosSemData: [],
        reais: { status: 'disponivel', completo: true, itens: jobs } };
      const raiz = h('main');
      const ctx = { h, params: { mes: '2026-10', camada }, obsoleta: () => false, cabecalho() {}, navegar() {}, aviso() {},
        alerta: (tipo,t) => h('p', { texto: t }), estado: { carregando() {}, erro(r,e) { throw e; } },
        formatar: { data: d => d, isoLocal: d => d.toISOString().slice(0,10) },
        api: async url => {
          if (url.includes('meta-publicados')) return { dados: { posts: [], completo: true } };
          if (url.startsWith('/api/marketing/calendario?')) return { dados };
          if (url === '/api/marketing/pecas') return { dados: [peca] };
          throw Error('GET inesperado: '+url);
        } };
      const limpar = await s.montar(raiz, ctx);
      const agenda = todos(raiz).find(n => n.tag === 'ol' && n.attrs.class === 'agenda');
      const rotulos = todos(agenda).filter(n => n.attrs.class === 'cal-item-canal').map(texto).join(' ');
      assert.doesNotMatch(rotulos, /Agendamento confirmado/, `${camada}/${estados}: falha/cancelamento não é promessa`);
      const icones = todos(raiz).filter(n => n.tag === 'button' && (n.attrs.class || '').includes('cal-icone'));
      const rotuloIcone = icones.map(n => n.attrs['aria-label']).join(' ');
      assert.match(texto(agenda), /Cancelado|Não saiu|Falhou|Conferir|conferir/);
      assert.match(rotuloIcone, /Cancelado|Não saiu|Falhou|Conferir|conferir/, `${camada}/${estados}: ícone preserva estado terminal/incerto`);
      if (estados.length > 1) {
        assert.match(rotulos, /2 destinos/);
        assert.match(rotulos, /Instagram/); assert.match(rotulos, /Facebook/);
      }
      limpar();
    }
  }
  console.log('AUD-12: projeção+montagem reais em8casos ambos/real, cancelado/falhou/incerto/misto coerentes em cartão e ícone OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
