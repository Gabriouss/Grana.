'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const repo = path.resolve(__dirname, '..');
const base = path.join(repo, 'tools/admin-local/marketing');
const mods = new Map(), efeitos = [];
const proibido = (tipo) => { efeitos.push(tipo); throw Error(`${tipo} proibido`); };
function load(nome) {
  if (mods.has(nome)) return mods.get(nome).exports;
  const m = { exports: {} }; mods.set(nome, m);
  vm.runInNewContext(fs.readFileSync(path.join(base, nome), 'utf8'), {
    module: m, exports: m.exports, Buffer, Date, Intl, console, structuredClone,
    process: { pid: process.pid, env: new Proxy({}, { get: () => proibido('env') }) },
    fetch: () => proibido('rede'),
    require: (id) => id === './ajustes-fila.cjs' ? { fila: { listar: () => [] } }
      : id.startsWith('./') ? load(id.slice(2))
        : ['fs', 'path', 'crypto', 'node:fs', 'node:path', 'node:crypto','node:os'].includes(id) ? require(id) : proibido(`import ${id}`),
  }, { filename: path.join(base, nome) });
  return m.exports;
}
const h = (tag, attrs = {}, ...children) => ({ tag, attrs, children: children.flat(Infinity).filter(Boolean) });
const textos = (n) => n == null ? [] : typeof n === 'object'
  ? [n.attrs?.texto || '', ...(n.children || []).flatMap(textos)] : [String(n)];
const codigoPecas = fs.readFileSync(path.join(repo, 'tools/admin-local/web/telas/_pecas.js'), 'utf8');
const pecas = {};
vm.runInNewContext(codigoPecas.replace(/export (const|function) /g, '$1 ') + '\nthis.rotuloCanal = rotuloCanal;', pecas);
const codigo = fs.readFileSync(path.join(repo, 'tools/admin-local/web/telas/calendario.js'), 'utf8');
function carregarTela(source) {
  const tela = { rotuloCanal: pecas.rotuloCanal };
  vm.runInNewContext(source.replace(/^import .*\r?\n/gm, '').replace(/export (async )?function /g, '$1function '), tela);
  return tela.detalhesCronograma;
}
const telas = [carregarTela(codigo.replace(/\r?\n/g, '\n')), carregarTela(codigo.replace(/\r?\n/g, '\r\n'))];
function render(helper, dto) {
  const formatados = [], antes = JSON.stringify(dto);
  const ctx = { h, alerta: (tipo, texto) => h('p', { tipo, texto }),
    formatar: { data: (v) => v.split('-').reverse().join('/'), dataHora: (v) => { formatados.push(v); return `LOCAL(${v})`; } },
    api: () => proibido('GET'), acao: () => proibido('POST'), navegar: () => proibido('navegar') };
  const root = helper(ctx, dto);
  assert.equal(JSON.stringify(dto), antes, 'helper nao altera o DTO ou seus recibos');
  return { linhas: textos(root).filter(Boolean), formatados };
}
(async () => {
  const tempBase = path.resolve(os.tmpdir()), dir = fs.mkdtempSync(path.join(tempBase, 'grana-helper-ajustes-'));
  try {
    // Mesmo preparo da integracao existente; o DTO vem de obterCalendario real.
    const semana = 'docs/marketing/2099-01/semana-01-2099-01-01-a-2099-01-07';
    const pasta = path.join(dir, semana, 'para-aprovacao/pecas');
    fs.mkdirSync(pasta, { recursive: true }); fs.writeFileSync(path.join(pasta, 'E01.jpg'), 'fixture');
    fs.writeFileSync(path.join(pasta,'COPYS-FINAIS.md'),'## E01 - Fixture\n\n**Legenda:** Legenda de teste E01.\n');
    fs.writeFileSync(path.join(dir, semana, 'INDICE.md'), '# Semana\n\n| Peça | Cronograma ID |\n| --- | --- |\n| [Peça](para-aprovacao/pecas/E01.jpg) | |\n');
    fs.mkdirSync(path.join(dir, 'docs/marketing/painel'), { recursive: true });
    const c = load('catalogo.cjs'), cr = load('cronograma.cjs'), ap = load('aprovacoes.cjs'), cal = load('calendario.cjs');
    const p = c.montarCatalogo(dir).find((p) => p.tipo !== 'texto'); assert(p);
    const manifesto = { formato: 1, manifestoId: 'campanha-teste', versao: 1, fuso: 'America/Sao_Paulo', diaD: null,
      itens: [{ id: 'peca-teste', dataPrevista: { modo: 'diaD', diasUteis: 1, hora: '19:00', canal: 'instagram-feed' } }], removidos: [] };
    await cr.salvarManifesto(dir, { manifesto, versaoEsperada: 0 });
    await cr.registrarVinculo(dir, p.id, { versao: p.versao, versaoEsperada: 1, manifestoId: manifesto.manifestoId, itemId: 'peca-teste' });
    await ap.aprovar(dir, p.id, { versao: p.versao, confirmacao: true });
    const dto = cal.obterCalendario(dir, '2099-01').aguardandoDiaD[0]; assert(dto);
    assert.equal(dto.estado, 'aguardando dia D');
    assert.equal(dto.dataPrevista.modo, 'diaD'); assert.equal(dto.dataPrevista.dataResolvida, null);
    assert.equal(dto.origem.manifestoId, 'campanha-teste'); assert.equal(dto.origem.itemId, 'peca-teste');
    assert.equal(dto.origem.manifestoVersao, 1); assert.equal(dto.substituicaoManual, null);
    assert(dto.recibo.id); assert(dto.recibo.em); assert.equal(dto.recibo.estado, dto.estado);
    for (const helper of telas) {
      const real = render(helper, dto), t = real.linhas.join(' ');
      assert(t.includes('D+1 dia útil')); assert(!t.includes('D+1 dias úteis'));
      assert(t.includes('Aguardando dia D. A data sai quando o dia D for marcado.'));
      assert.equal((t.match(/Aguardando dia D\./g) || []).length, 1);
      assert(t.includes('Planejamento registrado.')); assert(!t.includes('Nenhuma data foi inventada'));
      const recibo = real.linhas.find((v) => v.startsWith('Recibo do calendário:'));
      assert(recibo.includes(`LOCAL(${dto.recibo.em})`)); assert(!recibo.includes('aguardando dia D'));
      assert(real.formatados.includes(dto.recibo.em)); assert(real.formatados.includes(dto.reciboAceite.aprovadoEm));
      assert(t.includes('Não comprova publicação na Meta.')); assert(!t.includes('undefined'));
      // Falhas/variantes injetadas sobre a resposta real, nao um DTO paralelo.
      for (const estado of ['aguardando dia D', 'aguardando-dia-d']) {
        const v = structuredClone(dto); v.estado = estado; v.estadoCronograma = estado; v.recibos = []; v.recibo.estado = estado;
        const r = render(helper, v).linhas;
        assert(r.some((s) => s.startsWith('Recibo do calendário:') && s.includes('Planejamento registrado.')));
        assert.equal((r.join(' ').match(/Aguardando dia D\./g) || []).length, 1);
      }
      for (const campo of ['manifestoId', 'itemId', 'manifestoVersao']) {
        const v = structuredClone(dto); delete v.origem[campo];
        const origem = render(helper, v).linhas.find((s) => s.startsWith('Origem:'));
        assert(origem.includes(campo === 'manifestoVersao' ? 'revisão não informada' : campo === 'manifestoId' ? 'manifesto não informado' : 'item não informado'));
        assert(!origem.includes('undefined'));
      }
      for (const campo of ['estadoCronograma', 'estado']) {
        const desconhecido = structuredClone(dto);
        if (campo === 'estadoCronograma') desconhecido.estado = 'aprovados'; // resumo da peça, não estado da entrada
        desconhecido[campo] = '<script>estado-novo</script>';
        assert(render(helper, desconhecido).linhas.includes('Estado do cronograma: <script>estado-novo</script>. Confira antes de seguir.'), `fallback desconhecido por ${campo}`);
      }
      const plural = structuredClone(dto); plural.dataPrevista.diasUteis = 2;
      assert(render(helper, plural).linhas.join(' ').includes('D+2 dias úteis'));
      const estadoRecibo = structuredClone(dto); estadoRecibo.recibos[0].estado = 'outro-estado';
      assert(render(helper, estadoRecibo).linhas.some((s) => s.startsWith('Recibo do calendário:') && s.includes('outro-estado')));
    }
    const m = cr.ler(dir);
    await cr.salvarManifesto(dir, { manifesto: { ...m, versao: m.versao + 1, diaD: '2099-01-01' }, versaoEsperada: m.versao, confirmacao: true });
    await cal.planejar(dir, { id: p.id, versao: p.versao, data: '2099-01-22', hora: '20:00', canal: 'instagram-feed' });
    const resolvido = cal.obterCalendario(dir, '2099-01').itens[0]; assert(resolvido);
    assert(resolvido.dataPrevista.dataResolvida); assert.notEqual(resolvido.data, resolvido.dataPrevista.dataResolvida);
    for (const helper of telas) {
      const t = render(helper, resolvido).linhas.join(' ');
      assert(t.includes(`Previsão resolvida: ${resolvido.dataPrevista.dataResolvida.split('-').reverse().join('/')}`));
      assert(t.includes('Data alterada pelo autor: 22/01/2099 às 20:00'));
      assert(t.includes('A previsão de origem foi preservada.'));
    }
    assert.deepEqual(efeitos, [], 'zero GET/POST/rede/env/navegacao no helper e zero efeito externo no preparo');
    console.log('admin-calendario-helper-ajustes: DTO real, recibos locais, singular/plural, origem parcial, estado desconhecido, espera sem repeticao, manual/resolvido e fontes LF/CRLF OK');
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), tempBase); assert(path.basename(dir).startsWith('grana-helper-ajustes-'));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
