#!/usr/bin/env node
// Verifica o vault do Obsidian contra o repositório (regra 12 do AGENTS.md).
//
// Responde três perguntas que ninguém tem como responder de cabeça:
//   1. algum link interno aponta para nota que não existe?
//   2. alguma nota perene ficou para trás do arquivo que ela descreve?
//   3. alguma nota descreve arquivo que não existe mais no repositório?
//
// A segunda é a razão de o script existir. O vault é alimentado à mão e o
// repositório anda sozinho, então uma nota pode estar descrevendo um
// comportamento que mudou há vários commits sem que nada apareça.
//
// Uso:  node scripts/verificar-vault.mjs "<pasta do vault>"
//       node scripts/verificar-vault.mjs "<pasta>" --estrito   (sai 1 se achar algo)
//
// O caminho do vault muda de máquina, por isso vem como argumento e não
// embutido aqui.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const vault = process.argv[2];
const estrito = process.argv.includes('--estrito');
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

if (!vault || !fs.existsSync(vault)) {
  console.log('vault não encontrado, nada a verificar:', vault ?? '(sem argumento)');
  process.exit(0);
}

function percorrer(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) percorrer(f, acc);
    else if (e.name.endsWith('.md')) acc.push(f);
  }
  return acc;
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

// --- leitura das notas -------------------------------------------------
const notas = [];
const porNome = new Map();
for (const f of percorrer(vault)) {
  const txt = fs.readFileSync(f, 'utf8');
  const rel = path.relative(vault, f).split(path.sep).join('/');
  const nome = path.basename(f, '.md');
  const mfm = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = mfm ? mfm[1] : '';

  const prop = (k) => {
    const m = fm.match(new RegExp('^' + k + ':\\s*(.*)$', 'm'));
    return m ? m[1].trim() : null;
  };
  const lista = (k) => {
    const v = prop(k);
    if (!v || !v.startsWith('[')) return [];
    return [...v.matchAll(/"([^"]+)"|'([^']+)'|([^,[\]\s][^,[\]]*)/g)]
      .map((m) => (m[1] ?? m[2] ?? m[3]).trim())
      .filter(Boolean);
  };

  // Link dentro de bloco de código ou entre crases não vira link no Obsidian,
  // e dentro de tabela o apelido usa \| em vez de |. As duas regras já
  // produziram falso positivo em auditoria anterior.
  const semCodigo = txt.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const links = [...semCodigo.matchAll(/\[\[([^\]]+?)\]\]/g)].map((m) =>
    m[1].split('#')[0].split('|')[0].replace(/\\+$/, '').trim(),
  );

  notas.push({
    rel, nome,
    tipo: prop('tipo'),
    revisado: prop('revisado'),
    fonteDeclarada: prop('fonte') !== null,
    fontes: lista('fonte'),
    links,
  });
  porNome.set(nome, rel);
}

// --- 1. links quebrados ------------------------------------------------
const quebrados = [];
const comEntrada = new Set();
for (const n of notas) {
  for (const l of n.links) {
    if (porNome.has(l)) comEntrada.add(l);
    else quebrados.push({ de: n.rel, alvo: l });
  }
}

// --- 2. notas sem nenhum link de entrada -------------------------------
const orfas = notas.filter((n) => !comEntrada.has(n.nome)).map((n) => n.rel);

// --- 3. defasagem contra o repositório ---------------------------------
const rastreados = new Set(git(['ls-files']).split('\n').filter(Boolean));
const sumiram = [];
const atrasadas = [];
const semRevisao = [];
const semFonte = [];

for (const n of notas) {
  if (n.tipo !== 'perene') continue;
  // `fonte: []` é declaração deliberada: a nota não descreve arquivo do
  // repositório (o preço da Cakto, por exemplo, vem de uma API externa).
  if (n.fonteDeclarada && !n.fontes.length) continue;
  if (!n.fontes.length) { semFonte.push(n.rel); continue; }

  const existentes = n.fontes.filter(
    (f) => rastreados.has(f) || f.endsWith('/') || f.includes('*') || [...rastreados].some((r) => r.startsWith(f.replace(/\/$/, '') + '/')),
  );
  const perdidos = n.fontes.filter((f) => !existentes.includes(f));
  if (perdidos.length) sumiram.push({ nota: n.rel, fontes: perdidos });
  if (!existentes.length) continue;

  const ultimo = git(['log', '-1', '--format=%cI', '--', ...existentes]);
  if (!ultimo) continue;
  const dataFonte = ultimo.slice(0, 10);

  if (!n.revisado) semRevisao.push({ nota: n.rel, fonte: dataFonte });
  else if (n.revisado < dataFonte) atrasadas.push({ nota: n.rel, revisado: n.revisado, fonte: dataFonte });
}

// --- relatório ---------------------------------------------------------
const secao = (titulo, itens, formatar) => {
  console.log('\n== ' + titulo + ' (' + itens.length + ') ==');
  if (!itens.length) console.log('  nada');
  else for (const i of itens) console.log('  ' + formatar(i));
};

console.log('vault: ' + vault);
console.log('notas: ' + notas.length);

secao('links apontando para nota inexistente', quebrados, (q) => `[[${q.alvo}]]  <-  ${q.de}`);
secao('notas sem nenhum link de entrada', orfas, (o) => o);
secao('perenes atrasadas: a fonte mudou depois da última revisão', atrasadas,
  (a) => `${a.nota}\n      revisado ${a.revisado}, fonte mudou em ${a.fonte}`);
secao('perenes que nunca foram conferidas (sem `revisado`)', semRevisao,
  (s) => `${s.nota}  (fonte mexida pela última vez em ${s.fonte})`);
secao('perenes sem `fonte` declarada', semFonte, (s) => s);
secao('fontes que não existem mais no repositório', sumiram,
  (s) => `${s.nota}\n      ${s.fontes.join(', ')}`);

const achados = quebrados.length + orfas.length + atrasadas.length + sumiram.length;
console.log('\nresumo: ' + achados + ' item(ns) exigindo atenção, ' + semRevisao.length + ' perene(s) nunca conferida(s).');

process.exit(estrito && achados ? 1 : 0);
