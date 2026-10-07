'use strict';
// Recibos de conferência de Edge Function (dono: Lumen). Só leitura no servidor;
// a escrita é só pela linha de comando deste arquivo.
//
// O alerta da regra 11 ("no ar mais nova que o repositório") nasce de DATA: a
// publicação saiu mais de 24h depois do último commit que entra no pacote. Data
// não prova conteúdo. Quando alguém baixa o pacote publicado e prova que o
// código do projeto é igual ao do repositório, isso vira um recibo, e o alerta
// some SÓ enquanto as três coisas que o recibo amarra continuarem iguais:
//   1. updated_at da função publicada;
//   2. sha256 do pacote publicado (GET /functions/<slug>/body);
//   3. o conjunto de fontes locais do pacote e o sha256 de cada um.
// Qualquer diferença invalida o recibo e o alerta volta. Não há supressão por
// slug nem janela maior que 24h.
//
// Recibos ficam FORA do repositório, em %APPDATA%\grana-admin\recibos\ (ou
// GRANA_ADMIN_PASTA_CONTA\recibos), pasta com herança de ACL cortada e acesso
// só do usuário. Pacote publicado nunca é gravado por aqui: só o hash.
//
// Registrar a partir de uma evidência de conferência (pasta com metadata.json,
// comparison-summary.json e <slug>.body.bin, no formato do diagnóstico do Harbor):
//   node tools/admin-local/adaptadores/recibos-funcoes.cjs registrar <pasta> <slug> [<slug>...]

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { RAIZ, ler, tem, refSupabase } = require('../config.cjs');

const PASTA = path.join(process.env.GRANA_ADMIN_PASTA_CONTA || path.join(process.env.APPDATA || os.homedir(), 'grana-admin'), 'recibos');
const PRAZO_PACOTE_MS = 20_000;

// ---------- fontes do pacote ----------

// Mesma normalização do diagnóstico: CRLF vira LF e o fim do arquivo é aparado.
const normalizar = (s) => s.replace(/\r\n/g, '\n').trimEnd();
const sha256 = (dados) => crypto.createHash('sha256').update(dados).digest('hex');
const hashFonte = (abs) => sha256(normalizar(fs.readFileSync(abs, 'utf8')));
const rel = (abs) => path.relative(RAIZ, abs).split(path.sep).join('/');

const RE_IMPORT = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const EXTENSOES = ['', '.ts', '.tsx', '.js', '.mjs'];

function resolver(deArquivo, alvo) {
  const base = path.resolve(path.dirname(deArquivo), alvo);
  for (const ext of EXTENSOES) {
    const abs = base + ext;
    try { if (fs.statSync(abs).isFile()) return abs; } catch { /* tenta a próxima */ }
  }
  return null;
}

/**
 * Fontes locais que vão no pacote da função: os arquivos da pasta dela mais tudo
 * o que eles importam por caminho relativo, de forma transitiva, em qualquer
 * lugar do repositório (_shared, lib/...). Import remoto (npm:, jsr:, https:)
 * fica de fora: não é código do projeto. Caminhos relativos à raiz, ordenados.
 */
function fontesDoPacote(slug) {
  const pasta = path.join(RAIZ, 'supabase', 'functions', slug);
  let iniciais = [];
  try {
    iniciais = fs.readdirSync(pasta, { recursive: true }).map(String)
      .filter((n) => /\.(ts|tsx|js|mjs)$/.test(n)).map((n) => path.join(pasta, n));
  } catch { return []; }
  const vistos = new Set(iniciais.map((a) => path.resolve(a)));
  const fila = [...vistos];
  while (fila.length) {
    const atual = fila.shift();
    let texto = '';
    try { texto = fs.readFileSync(atual, 'utf8'); } catch { continue; }
    for (const m of texto.matchAll(RE_IMPORT)) {
      if (!m[1].startsWith('.')) continue;
      const abs = resolver(atual, m[1]);
      if (!abs) continue;
      const r = path.relative(RAIZ, abs);
      if (r.startsWith('..') || path.isAbsolute(r)) continue; // fora do repositório não entra
      const chave = path.resolve(abs);
      if (!vistos.has(chave)) { vistos.add(chave); fila.push(chave); }
    }
  }
  return [...vistos].map(rel).sort();
}

function hashesDasFontes(lista) {
  const out = {};
  for (const r of lista) out[r] = hashFonte(path.join(RAIZ, r));
  return out;
}

// ---------- pacote publicado ----------

const cachePacote = new Map(); // `${slug}@${updated_at}` -> { sha256, bytes }

async function hashDoPacotePublicado(slug, updatedAtMs) {
  const chave = `${slug}@${updatedAtMs}`;
  if (cachePacote.has(chave)) return cachePacote.get(chave);
  if (!tem('SUPABASE_ACCESS_TOKEN') || !refSupabase()) throw new Error('sem credencial do Supabase para baixar o pacote');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PRAZO_PACOTE_MS);
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${refSupabase()}/functions/${encodeURIComponent(slug)}/body`, {
      headers: { Authorization: `Bearer ${ler('SUPABASE_ACCESS_TOKEN')}` }, signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`o Supabase respondeu ${r.status} ao baixar o pacote`);
    const corpo = Buffer.from(await r.arrayBuffer()); // corpo lido dentro do prazo
    const valor = { sha256: sha256(corpo), bytes: corpo.length };
    cachePacote.set(chave, valor);
    return valor;
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'o pacote publicado demorou mais de 20 segundos' : err.message);
  } finally {
    clearTimeout(t);
  }
}

// ---------- recibos ----------

const arquivoDoRecibo = (slug) => path.join(PASTA, `${slug.replace(/[^a-z0-9-]/gi, '_')}.json`);

function lerRecibo(slug) {
  try { return JSON.parse(fs.readFileSync(arquivoDoRecibo(slug), 'utf8')); } catch { return null; }
}

/**
 * Confere o recibo de uma função publicada mais nova que o repositório.
 * Devolve { estado: 'sem-recibo' } | { estado: 'valido', recibo } |
 * { estado: 'invalido', motivo, recibo }. 'valido' é o único que apaga o alerta.
 */
async function conferirRecibo(slug, updatedAtMs) {
  const recibo = lerRecibo(slug);
  if (!recibo) return { estado: 'sem-recibo' };
  const resumo = { conferidoEm: recibo.conferidoEm, conferidoPor: recibo.conferidoPor, commitComparado: recibo.commitComparado };
  if (recibo.updated_at !== updatedAtMs) {
    return { estado: 'invalido', motivo: 'A função foi publicada de novo depois da conferência.', recibo: resumo };
  }
  const atuais = fontesDoPacote(slug);
  const doRecibo = Object.keys(recibo.fontes || {}).sort();
  if (atuais.join('\n') !== doRecibo.join('\n')) {
    return { estado: 'invalido', motivo: 'O conjunto de arquivos do pacote mudou no repositório.', recibo: resumo };
  }
  for (const r of atuais) {
    let h = null;
    try { h = hashFonte(path.join(RAIZ, r)); } catch { /* sumiu */ }
    if (h !== recibo.fontes[r]) return { estado: 'invalido', motivo: `O fonte local ${r} mudou depois da conferência.`, recibo: resumo };
  }
  let pacote;
  try {
    pacote = await hashDoPacotePublicado(slug, updatedAtMs);
  } catch (err) {
    return { estado: 'invalido', motivo: `Não consegui conferir o pacote publicado: ${err.message}.`, recibo: resumo };
  }
  if (pacote.sha256 !== recibo.bundleSha256) {
    return { estado: 'invalido', motivo: 'O pacote publicado não é o que foi conferido.', recibo: resumo };
  }
  return { estado: 'valido', recibo: resumo };
}

function protegerPasta() {
  fs.mkdirSync(PASTA, { recursive: true });
  if (process.platform !== 'win32') { try { fs.chmodSync(PASTA, 0o700); } catch { /* segue */ } return true; }
  try {
    const usuario = `${process.env.USERDOMAIN || os.hostname()}\\${process.env.USERNAME || os.userInfo().username}`;
    execFileSync('icacls', [PASTA, '/inheritance:r', '/grant:r', `${usuario}:(OI)(CI)F`], { stdio: 'ignore', windowsHide: true, timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Registra o recibo a partir de uma pasta de evidência. Recusa se o pacote
 * guardado não bater com o hash da coleta, se a comparação não tiver dado
 * igualdade em todos os arquivos, ou se o repositório de hoje não tiver
 * exatamente os mesmos arquivos e hashes que foram comparados.
 */
function registrar(pastaEvidencia, slug) {
  const meta = JSON.parse(fs.readFileSync(path.join(pastaEvidencia, 'metadata.json'), 'utf8'));
  const comp = JSON.parse(fs.readFileSync(path.join(pastaEvidencia, 'comparison-summary.json'), 'utf8'));
  const m = (meta.records || []).find((x) => x.slug === slug);
  const c = (comp.functions || []).find((x) => x.slug === slug);
  if (!m || !c) throw new Error(`${slug}: evidência não tem metadata e comparação dessa função.`);
  if (!m.metadataStable) throw new Error(`${slug}: os metadados mudaram durante a coleta; refaça a conferência.`);
  const corpo = fs.readFileSync(path.join(pastaEvidencia, m.filename));
  if (sha256(corpo) !== m.sha256 || corpo.length !== m.bytes) throw new Error(`${slug}: o pacote guardado não bate com o hash da coleta.`);
  const naoIguais = c.files.filter((f) => !(f.equalLocal && f.remoteHash === f.localHash));
  if (naoIguais.length) throw new Error(`${slug}: a comparação não deu igualdade em ${naoIguais.map((f) => f.path).join(', ')}.`);
  const atuais = fontesDoPacote(slug);
  const comparados = c.files.map((f) => f.path).sort();
  if (atuais.join('\n') !== comparados.join('\n')) {
    throw new Error(`${slug}: o pacote local de hoje (${atuais.join(', ')}) difere do que foi comparado (${comparados.join(', ')}).`);
  }
  const fontes = hashesDasFontes(atuais);
  for (const f of c.files) {
    if (fontes[f.path] !== f.localHash) throw new Error(`${slug}: ${f.path} mudou no repositório depois da conferência.`);
  }
  const recibo = {
    formato: 1,
    slug,
    updated_at: m.updated_at,
    updatedAtIso: new Date(m.updated_at).toISOString(),
    bundleSha256: m.sha256,
    bundleBytes: m.bytes,
    fontes,
    commitComparado: comp.originMain || comp.head || null,
    conferidoEm: comp.comparedAt || meta.collectedAt || null,
    conferidoPor: 'Harbor, diagnóstico somente leitura (relatorio-harbor-reconciliacao-funcoes.md)',
    metodo: 'ESZIP baixado por GET, fontes do projeto recuperados dos source maps e comparados por sha256 normalizado; JavaScript publicado comparado por árvore sintática',
    evidencia: path.resolve(pastaEvidencia),
    registradoEm: new Date().toISOString(),
  };
  const protegida = protegerPasta();
  const destino = arquivoDoRecibo(slug);
  const tmp = `${destino}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(recibo, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, destino);
  return { destino, protegida, recibo };
}

module.exports = { PASTA, fontesDoPacote, conferirRecibo, lerRecibo, registrar };

if (require.main === module) {
  const [acao, pasta, ...slugs] = process.argv.slice(2);
  if (acao !== 'registrar' || !pasta || !slugs.length) {
    console.error('Uso: node tools/admin-local/adaptadores/recibos-funcoes.cjs registrar <pasta-da-evidência> <slug> [<slug>...]');
    process.exit(2);
  }
  let falhou = false;
  for (const slug of slugs) {
    try {
      const r = registrar(pasta, slug);
      console.log(`${slug}: recibo gravado em ${r.destino} (updated_at ${r.recibo.updatedAtIso}, pacote ${r.recibo.bundleSha256.slice(0, 12)}…, ${Object.keys(r.recibo.fontes).length} fontes)${r.protegida ? '' : ' AVISO: não consegui restringir a ACL da pasta'}`);
    } catch (err) {
      falhou = true;
      console.error(`${slug}: RECUSADO. ${err.message}`);
    }
  }
  process.exit(falhou ? 1 : 0);
}
