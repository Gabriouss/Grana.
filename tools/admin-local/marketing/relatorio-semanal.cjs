'use strict';
// Relatório semanal e aprendizado (Entrega 7) no painel local. Dono: Anvil.
// Contrato: relatorio-Beacon-E7-contrato-analitico.md (WeeklyReport, e7.v1). Tela, PDF e CSV mostram o MESMO
// objeto; nada aqui recalcula métrica. O CSV vem de lib/admin-relatorio-csv.ts (Argon), transpilado em memória,
// para não haver uma segunda implementação do exportador.
//
// Fonte: agregador compartilhado E7 (Harbor). Sem métrica observada, estado indisponível;
// com cobertura parcial, o mesmo objeto conserva todas as limitações por fonte.

const fs = require('fs');
const path = require('path');
const { ErroMarketing } = require('./catalogo.cjs');

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const LIMITE_RECOMENDACOES = 3;
const LIMITE_LINHAS = 2000;
const MOTIVO_SEM_FONTE = 'As fontes não forneceram métricas observadas para esta semana. Confira a configuração e a cobertura por fonte. Nenhum número foi calculado; nada aqui é zero.';

let csv = null;
function carregarCsv() {
  if (csv) return csv;
  let ts;
  try { ts = require('typescript'); } catch { throw new ErroMarketing('csv-indisponivel', 'O exportador CSV não pôde ser carregado neste computador.', 503); }
  const fonte = fs.readFileSync(path.join(RAIZ, 'lib', 'admin-relatorio-csv.ts'), 'utf8');
  const js = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', js)(m, m.exports);
  csv = m.exports;
  return csv;
}

// A fonte real entra aqui. Devolve um WeeklyReport ou null.
let fonte = async () => {
  const dados = await require('../adaptadores/marketing-backend.cjs').backend().analytics('semana-anterior');
  return dados.weeklyReport?.metrics.some(m => m.state === 'observed') ? dados.weeklyReport : null;
};

function validarRelatorio(r) {
  const ruim = (msg) => new ErroMarketing('relatorio-invalido', msg || 'O relatório não está no formato e7.v1.', 400);
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw ruim();
  if (r.contractVersion !== 'e7.v1') throw ruim('Só o contrato e7.v1 é aceito.');
  if (!r.period || typeof r.period.startInclusive !== 'string' || typeof r.period.endExclusive !== 'string' || typeof r.period.timezone !== 'string') throw ruim();
  for (const campo of ['metrics', 'sources', 'recommendations', 'experiments', 'qualityNotes', 'nextActions']) {
    if (r[campo] !== undefined && !Array.isArray(r[campo])) throw ruim();
    if (Array.isArray(r[campo]) && r[campo].length > LIMITE_LINHAS) throw ruim('Relatório grande demais.');
  }
  if (Array.isArray(r.recommendations) && r.recommendations.length > LIMITE_RECOMENDACOES) throw ruim('A lista principal tem no máximo três recomendações.');
  return r;
}

async function lerRelatorio() {
  const r = await fonte();
  if (!r) return { status: 'indisponivel', motivo: MOTIVO_SEM_FONTE, relatorio: null };
  return { status: 'ok', relatorio: validarRelatorio(r) };
}

// Gera o CSV do relatório recebido. O exportador só lê os campos do contrato e redige URL, e-mail e token.
async function exportarCsv(_raiz, corpo) {
  const relatorio = validarRelatorio(corpo && corpo.relatorio);
  let conteudo;
  try { conteudo = carregarCsv().relatorioSemanalParaCsv(relatorio); }
  catch (e) {
    if (e instanceof ErroMarketing) throw e;
    throw new ErroMarketing('csv-falhou', 'Não foi possível gerar o CSV. Nada foi baixado.', 500);
  }
  const dia = String(relatorio.period.startInclusive).slice(0, 10).replace(/[^0-9-]/g, '');
  return { nome: `relatorio-semanal-${dia || 'sem-data'}-rev${Number.isInteger(relatorio.revision) ? relatorio.revision : 0}.csv`, tipo: 'text/csv;charset=utf-8', conteudo };
}

module.exports = { lerRelatorio, exportarCsv, _validar: validarRelatorio, _definirFonte: (f) => { fonte = f; }, MOTIVO_SEM_FONTE };
