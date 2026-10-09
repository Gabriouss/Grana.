#!/usr/bin/env node
'use strict';
// Trava contra segredo no que sai do repositório (travas 2 e 3 do painel na
// nuvem, parecer do Lynx de 08/10/2026).
//
//   node scripts/varrer-segredos.cjs dist             varre um diretório (export web)
//   node scripts/varrer-segredos.cjs --staged         varre as linhas adicionadas do git diff --cached
//   node scripts/varrer-segredos.cjs --arquivo <f>    varre um arquivo só (a mensagem, no hook commit-msg)
//   --valores [--env-file <arquivo>]                  também compara com os VALORES do .env (só local:
//                                                     o CI e a Vercel não têm .env, e não devem ter)
//
// Por padrão (sempre, inclusive no CI e no buildCommand da Vercel) procura
// formatos de token conhecidos. JWT é decodificado: a chave anon é pública e
// passa; qualquer outro papel (service_role, authenticated) reprova.
//
// A saída tem só regra/variável, arquivo e contagem. Nunca o trecho nem o valor.
// Sai com código 1 se achar algo.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PADROES = [
  { nome: 'token-supabase-pessoal', re: /\bsbp_[A-Za-z0-9]{30,}/g },
  { nome: 'chave-secreta-supabase', re: /\bsb_secret_[A-Za-z0-9_-]{20,}/g },
  { nome: 'token-github', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/g },
  { nome: 'token-github-fino', re: /\bgithub_pat_[A-Za-z0-9_]{40,}/g },
  { nome: 'chave-secreta-sk', re: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { nome: 'token-vercel', re: /\bvercel_[A-Za-z0-9]{20,}/g },
  { nome: 'token-expo', re: /\bexpo_[A-Za-z0-9]{30,}/g },
  { nome: 'chave-privada-pem', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g },
  { nome: 'deploy-hook-vercel', re: /api\.vercel\.com\/v1\/integrations\/deploy\/[A-Za-z0-9_]+\/[A-Za-z0-9_]+/g },
  { nome: 'chave-aws', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { nome: 'token-slack', re: /\bxox[abpr]-[A-Za-z0-9-]{10,}/g },
  { nome: 'chave-groq', re: /\bgsk_[A-Za-z0-9]{30,}/g },
  // A chave Android do Firebase mora de propósito no google-services.json
  // versionado; em qualquer outro lugar (e no export web) é vazamento.
  { nome: 'chave-google', re: /\bAIza[0-9A-Za-z_-]{35}/g, excetoEm: /(^|\/)google-services\.json$/ },
];
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
// Arquivo binário grande (imagem, fonte) não carrega token legível; texto sim.
const EXTENSOES_BINARIAS = /\.(png|jpe?g|gif|webp|ico|ttf|otf|woff2?|mp4|mp3|wav|pdf|zip|apk|aab|hbc)$/i;

function papelDoJwt(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.role === 'string' ? payload.role : 'sem-papel';
  } catch {
    return 'ilegivel';
  }
}

function lerEnv(arquivo) {
  const vars = [];
  if (!fs.existsSync(arquivo)) return vars;
  const re = /^\s*(?:export\s+)?([A-Za-z_0-9]+)\s*=\s*("(?:\\.|[^"\\])*"|'[^']*'|[^\r\n]*)/gm;
  const texto = fs.readFileSync(arquivo, 'utf8');
  let m;
  while ((m = re.exec(texto))) {
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    else if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    else v = v.split(/\s+#/)[0].trim();
    // EXPO_PUBLIC_ é embutido no app de propósito; valor curto gera falso positivo.
    if (!v || m[1].startsWith('EXPO_PUBLIC_') || v.length < 8) continue;
    vars.push({ nome: m[1], formas: [...new Set([v, JSON.stringify(v).slice(1, -1), encodeURIComponent(v), Buffer.from(v).toString('base64')])] });
  }
  return vars;
}

// Devolve [{ regra, arquivo }] para um texto.
function varrerTexto(texto, arquivo, valores) {
  const achados = [];
  for (const { nome, re, excetoEm } of PADROES) {
    if (excetoEm && excetoEm.test(arquivo)) continue;
    const n = (texto.match(re) || []).length;
    for (let i = 0; i < n; i++) achados.push({ regra: nome, arquivo });
  }
  for (const token of texto.match(JWT) || []) {
    const papel = papelDoJwt(token);
    if (papel !== 'anon') achados.push({ regra: `jwt-papel-${papel}`, arquivo });
  }
  for (const v of valores) {
    if (v.formas.some((f) => texto.includes(f))) {
      // E-mail não é credencial e coincide com o contato público do site
      // (rastreado pelo Watchtower em 08/10); vira aviso, não reprovação.
      achados.push({ regra: `valor-do-env:${v.nome}`, arquivo, aviso: /_EMAIL$/.test(v.nome) });
    }
  }
  return achados;
}

function listar(dir) {
  const saida = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) saida.push(...listar(p));
    else if (e.isFile() && !EXTENSOES_BINARIAS.test(e.name)) saida.push(p);
  }
  return saida;
}

function varrerDiretorio(dir, valores) {
  const achados = [];
  for (const arquivo of listar(dir)) {
    achados.push(...varrerTexto(fs.readFileSync(arquivo, 'utf8'), path.relative(dir, arquivo).split(path.sep).join('/'), valores));
  }
  return achados;
}

// Só as linhas ADICIONADAS do que está no índice, arquivo por arquivo.
function varrerStaged(valores, cwd = process.cwd()) {
  const diff = execFileSync('git', ['diff', '--cached', '--no-color', '--unified=0', '--no-ext-diff', '--text'], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const porArquivo = new Map();
  let atual = null;
  for (const linha of diff.split('\n')) {
    if (linha.startsWith('+++ ')) { atual = linha.slice(4).replace(/^b\//, ''); continue; }
    if (atual && atual !== '/dev/null' && linha.startsWith('+') && !EXTENSOES_BINARIAS.test(atual)) {
      porArquivo.set(atual, (porArquivo.get(atual) || '') + linha.slice(1) + '\n');
    }
  }
  const achados = [];
  for (const [arquivo, texto] of porArquivo) achados.push(...varrerTexto(texto, arquivo, valores));
  return achados;
}

function resumir(achados) {
  const grupos = new Map();
  for (const a of achados) {
    const k = `${a.aviso ? 'AVISO' : 'BLOQUEIO'}\t${a.regra}\t${a.arquivo}`;
    grupos.set(k, (grupos.get(k) || 0) + 1);
  }
  return [...grupos].map(([k, n]) => `${k.replace(/\t/g, ' · ')} · ${n}x`);
}

function principal(argv) {
  const staged = argv.includes('--staged');
  const comValores = argv.includes('--valores');
  const iEnv = argv.indexOf('--env-file');
  const envFile = iEnv >= 0 ? argv[iEnv + 1] : path.join(__dirname, '..', '.env');
  const iArq = argv.indexOf('--arquivo');
  const arquivo = iArq >= 0 ? argv[iArq + 1] : null;
  const alvo = arquivo ? 'mensagem do commit' : argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--env-file');
  const valores = comValores ? lerEnv(envFile) : [];
  if (comValores && !valores.length) console.log('[varrer-segredos] --valores sem .env legível: só os padrões foram conferidos.');
  let achados;
  if (staged) achados = varrerStaged(valores);
  else if (arquivo) {
    if (!fs.existsSync(arquivo)) { console.error('[varrer-segredos] arquivo da mensagem ausente.'); return 2; }
    achados = varrerTexto(fs.readFileSync(arquivo, 'utf8'), alvo, valores);
  } else {
    if (!alvo || !fs.existsSync(alvo)) { console.error(`[varrer-segredos] diretório ausente: ${alvo || '(nenhum)'}`); return 2; }
    // Diretório vazio é export que falhou: "ok" aqui seria trava que não trava.
    if (!listar(alvo).length) { console.error(`[varrer-segredos] nada para varrer em ${alvo}: o export falhou ou está vazio.`); return 2; }
    achados = varrerDiretorio(alvo, valores);
  }
  const linhas = resumir(achados);
  linhas.forEach((l) => console.log(`[varrer-segredos] ${l}`));
  if (achados.some((a) => !a.aviso)) {
    console.error(`[varrer-segredos] BLOQUEADO: possível segredo ${staged ? 'no commit' : arquivo ? 'na mensagem do commit' : `em ${alvo}`}. Nada foi impresso além de regra, arquivo e contagem. Remova o valor; nunca use --no-verify.`);
    return 1;
  }
  console.log(`[varrer-segredos] ok: ${staged ? 'commit' : alvo} sem token conhecido${comValores ? ` e sem valor do .env (${valores.length} comparados)` : ''}.`);
  return 0;
}

module.exports = { varrerTexto, varrerDiretorio, varrerStaged, lerEnv, papelDoJwt, principal };
if (require.main === module) process.exitCode = principal(process.argv.slice(2));
