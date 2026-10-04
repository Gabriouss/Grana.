/* V06: exercita o exportador real; APIs nativas sao dubles. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const fonte = fs.readFileSync(path.join(__dirname, '../lib/pdf-report.ts'), 'utf8');

function carregar({ plataforma = 'android', disponivel = true, falhaMover = false, falhaImprimir = false } = {}) {
  const arquivos = new Map();
  const chamadas = [];
  let sequencia = 0;
  const juntar = (partes) => partes.map((p, i) => {
    const uri = typeof p === 'string' ? p : p.uri;
    return i === 0 ? uri.replace(/\/+$/, '') : uri.replace(/^\/+/, '');
  }).join('/');
  class Directory {
    constructor(...partes) { this.uri = juntar(partes); }
    create(opcoes) { chamadas.push(['pasta', this.uri, opcoes]); }
  }
  class File {
    constructor(...partes) { this.uri = juntar(partes); }
    get name() { return this.uri.split('/').pop(); }
    async move(destino) {
      chamadas.push(['mover', this.uri, destino.uri]);
      await Promise.resolve(); // SDK 57 so atualiza uri ao concluir o movimento.
      if (falhaMover) throw new Error('falha ao mover');
      assert.ok(arquivos.has(this.uri), 'PDF de origem existe');
      assert.ok(!arquivos.has(destino.uri), 'nao sobrescreve outra exportacao');
      arquivos.set(destino.uri, arquivos.get(this.uri));
      arquivos.delete(this.uri);
      this.uri = destino.uri;
    }
  }
  const deps = {
    'react-native': { Platform: { OS: plataforma } },
    'expo-file-system': { File, Directory, Paths: { cache: 'file:///cache' } },
    'expo-print': { async printToFileAsync(opcoes) {
      chamadas.push(['imprimir', opcoes]);
      if (falhaImprimir) throw new Error('falha ao imprimir');
      const uri = `file:///cache/Print/uuid-${++sequencia}.pdf`;
      arquivos.set(uri, '%PDF-' + sequencia);
      return { uri };
    } },
    'expo-sharing': {
      async isAvailableAsync() { chamadas.push(['disponivel']); return disponivel; },
      async shareAsync(uri, opcoes) {
        assert.ok(arquivos.has(uri), 'compartilha PDF existente');
        chamadas.push(['compartilhar', uri, opcoes]);
      },
    },
    './format': { MONTH_NAMES: Array.from({ length: 12 }, (_, m) => String(m + 1)) },
    './pdf-report-html': { montarHtml: () => '<html>relatorio</html>' },
  };
  const exports = {};
  const janela = { document: { open() {}, write() {}, close() {} } };
  const codigo = ts.transpileModule(fonte, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(codigo, { exports, console, window: { open: () => janela }, require(id) {
    assert.ok(id in deps, 'import simulado: ' + id); return deps[id];
  } });
  return { gerar: exports.gerarRelatorioPdf, arquivos, chamadas };
}

(async () => {
  for (const plataforma of ['android', 'ios']) {
    const m = carregar({ plataforma });
    const [primeiro, segundo] = await Promise.all([
      m.gerar({ ano: 2026, mes: 9 }), m.gerar({ ano: 2026, mes: 9 }),
    ]);
    assert.equal(path.posix.basename(primeiro.uri), 'Grana-relatorio-2026-10.pdf');
    assert.equal(path.posix.basename(segundo.uri), 'Grana-relatorio-2026-10.pdf');
    assert.notEqual(primeiro.uri, segundo.uri, 'exportacoes simultaneas sao independentes');
    assert.equal(m.arquivos.get(primeiro.uri), '%PDF-1');
    assert.equal(m.arquivos.get(segundo.uri), '%PDF-2');
    assert.equal(primeiro.compartilhado, true);
    const compartilhados = m.chamadas.filter(([tipo]) => tipo === 'compartilhar');
    assert.equal(compartilhados.length, 2);
    assert.equal(compartilhados[0][1], primeiro.uri);
    assert.equal(compartilhados[0][2].mimeType, 'application/pdf');
    assert.equal(compartilhados[0][2].UTI, 'com.adobe.pdf');
    console.log('ok nome e conteudo preservados, concorrencia e compartilhamento em ' + plataforma);
  }
  const comPeriodo = await carregar().gerar({ ano: 2026, mes: 9, periodo: { inicio: '2026-06-01', fim: '2026-07-31' } });
  assert.equal(path.posix.basename(comPeriodo.uri), 'Grana-relatorio-2026-06-01-a-2026-07-31.pdf', 'periodo nomeia pelo intervalo');
  const semSharing = carregar({ disponivel: false });
  const local = await semSharing.gerar({ ano: 2027, mes: 0 });
  assert.equal(path.posix.basename(local.uri), 'Grana-relatorio-2027-01.pdf');
  assert.equal(local.compartilhado, false);
  assert.ok(semSharing.arquivos.has(local.uri));
  assert.equal(semSharing.chamadas.filter(([tipo]) => tipo === 'compartilhar').length, 0);
  const aviso = console.warn; let avisos = 0; console.warn = () => { avisos++; };
  const semMover = carregar({ falhaMover: true });
  const original = await semMover.gerar({ ano: 2026, mes: 9 });
  console.warn = aviso;
  assert.equal(avisos, 1, 'falha ao mover deixa log');
  assert.equal(path.posix.basename(original.uri), 'uuid-1.pdf', 'cai no PDF original');
  assert.ok(semMover.arquivos.has(original.uri));
  assert.equal(semMover.chamadas.filter(([tipo]) => tipo === 'compartilhar').length, 1, 'ainda compartilha');
  const semImprimir = carregar({ falhaImprimir: true });
  await assert.rejects(semImprimir.gerar({ ano: 2026, mes: 9 }), /falha ao imprimir/);
  assert.equal(semImprimir.chamadas.filter(([tipo]) => tipo === 'compartilhar').length, 0);
  const web = carregar({ plataforma: 'web' });
  const impresso = await web.gerar({ ano: 2026, mes: 9 });
  assert.equal(impresso.uri, '');
  assert.equal(impresso.compartilhado, true);
  assert.equal(web.chamadas.length, 0, 'web nao chama APIs nativas');
  console.log('ok indisponibilidade, falhas e caminho web');
})().catch((erro) => { console.error(erro); process.exitCode = 1; });
