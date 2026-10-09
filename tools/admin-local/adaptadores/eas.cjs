'use strict';
// EAS (dono: Keel).
//
// Leitura: `eas build:list` pela CLI já baixada no cache do npx (o painel não
// baixa nada; sem CLI ou sem login, status "ausente"). A CLI leva ~30s, então
// o resultado fica em cache e chamadas simultâneas dividem a mesma execução.
//
// Saldo da semana: o MESMO módulo do build:preparar (scripts/teto-de-builds.ts,
// carregado direto pelo Node 24, que remove os tipos), sobre o mesmo critério
// do git log. Regra 22: 3 por semana, segunda a domingo; cota de 15 por mês.
//
// Acoes locais: preparo por script, commit/publicacao do app.json e disparo
// separado, com diálogo de confirmação (plano13h). Nunca acionar sem clique do autor.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { RAIZ, SIMULAR } = require('../config.cjs');
const gitLocal = require('./git-local.cjs');

const COTA_MENSAL = 15;
const PRAZO_CLI_MS = 90_000;
const PRAZO_PREPARAR_MS = 120_000; // o script faz git fetch (até 30s) e valida a nota

function teto() {
  return require(path.join(RAIZ, 'scripts', 'teto-de-builds.ts'));
}

function versaoDe(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version || '0'; } catch { return '0'; }
}

function comparar(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}

/** Pacote mais novo com esse nome no cache do npx, ou null. */
function noCacheDoNpx(pacote) {
  const base = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  let melhor = null;
  try {
    for (const d of fs.readdirSync(base)) {
      const dir = path.join(base, d, 'node_modules', pacote);
      if (!fs.existsSync(path.join(dir, 'package.json'))) continue;
      const v = versaoDe(dir);
      if (!melhor || comparar(v, melhor.versao) > 0) melhor = { dir, versao: v };
    }
  } catch { /* sem cache */ }
  return melhor;
}

function rodar(args, prazo) {
  return new Promise((resolve) => {
    execFile(process.execPath, args, { cwd: RAIZ, timeout: prazo, windowsHide: true, shell: false, maxBuffer: 8 * 1024 * 1024 },
      (erro, stdout, stderr) => resolve({ codigo: erro ? (typeof erro.code === 'number' ? erro.code : -1) : 0, morto: !!(erro && erro.killed), stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
}

// ---------- saldo ----------

function saldo() {
  const datas = gitLocal.datasDosPreparos(40);
  if (!datas) return { status: 'erro', erro: { codigo: 'git-indisponivel', mensagem: 'Não consegui ler o histórico do git para contar as builds.' } };
  const agora = new Date();
  const t = teto().situacaoDoTeto(datas, agora);
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).getTime();
  const doMes = datas.filter((iso) => Date.parse(iso) >= inicioMes).length;
  return {
    status: 'ok',
    semana: { feitos: t.feitos, teto: t.teto, restam: Math.max(0, t.teto - t.feitos), podePreparar: t.podePreparar, zeraEm: t.zeraEm.toISOString(), preparos: t.daSemana },
    mes: { preparos: doMes, cota: COTA_MENSAL, restam: Math.max(0, COTA_MENSAL - doMes) },
    fonte: 'Commits que subiram "version" no app.json, na cópia local (HEAD e origin/main, sem fetch). Mesmo critério do npm run build:preparar.',
  };
}

// ---------- builds ----------

let emCurso = null;

async function listarPelaCli() {
  const cli = noCacheDoNpx('eas-cli');
  if (!cli) return { status: 'ausente', motivo: 'A CLI do EAS não está no cache do npx desta máquina. Rode uma vez "npx eas-cli whoami" no terminal.' };
  const r = await rodar([path.join(cli.dir, 'bin', 'run'), 'build:list', '--json', '--non-interactive', '--limit', '20', '--platform', 'android'], PRAZO_CLI_MS);
  if (r.morto) return { status: 'erro', erro: { codigo: 'eas-prazo', mensagem: `A CLI do EAS não respondeu em ${PRAZO_CLI_MS / 1000}s.` } };
  if (r.codigo !== 0) {
    if (/not logged in|log in|login/i.test(r.stderr + r.stdout)) return { status: 'ausente', motivo: 'A CLI do EAS não está logada nesta máquina ("npx eas-cli login").' };
    return { status: 'erro', erro: { codigo: 'eas-cli-falhou', mensagem: 'A CLI do EAS falhou ao listar as builds.' } };
  }
  let lista;
  try { lista = JSON.parse(r.stdout.slice(r.stdout.indexOf('['))); } catch {
    return { status: 'erro', erro: { codigo: 'eas-saida-invalida', mensagem: 'A CLI do EAS devolveu uma saída que não é JSON.' } };
  }
  const itens = lista.map((b) => ({
    id: b.id,
    status: b.status,
    perfil: b.buildProfile || null,
    versao: b.appVersion || null,
    versaoBuild: b.appBuildVersion || null,
    mensagem: b.message || null,
    commit: b.gitCommitHash ? { hash: b.gitCommitHash.slice(0, 7), mensagem: (b.gitCommitMessage || '').split('\n')[0] } : null,
    criadoEm: b.createdAt || null,
    concluidoEm: b.completedAt || null,
    apk: (b.artifacts && (b.artifacts.buildUrl || b.artifacts.applicationArchiveUrl)) || null,
    pagina: `https://expo.dev/accounts/gabriouss/projects/grana-app/builds/${b.id}`,
    quem: (b.initiatingActor && b.initiatingActor.displayName) || null,
    erro: b.error && b.error.message ? String(b.error.message).slice(0, 300) : null,
  }));
  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).getTime();
  const doMesNoEas = itens.filter((i) => Date.parse(i.criadoEm) >= inicioMes).length;
  return { status: 'ok', cli: cli.versao, itens, doMesNoEas, observacaoMes: 'Contagem das builds criadas no EAS neste mês, entre as 20 últimas.' };
}

async function builds() {
  if (!emCurso) emCurso = listarPelaCli().finally(() => { emCurso = null; });
  const lista = await emCurso;
  return { ...lista, saldo: saldo(), preparoPendente: versaoPendente(), preparoPersistido: acoes.estado(), comoDisparar: 'O disparo exige DISPARAR BUILD no painel local.' };
}

async function status() {
  const s = saldo();
  return { status: s.status, saldo: s };
}

// ---------- preparar build ----------

function versaoDoTexto(texto) {
  const m = String(texto || '').match(/"version"\s*:\s*"(\d+\.\d+\.\d+)"/);
  return m ? m[1] : null;
}

/** { pasta, head } quando a versão do app.json na pasta difere da do HEAD; senão null. */
function versaoPendente() {
  let pasta = null, head = null;
  try { pasta = versaoDoTexto(fs.readFileSync(path.join(RAIZ, 'app.json'), 'utf8')); } catch { /* sem app.json */ }
  try { head = versaoDoTexto(require('child_process').execFileSync('git', ['show', 'HEAD:app.json'], { cwd: RAIZ, encoding: 'utf8', timeout: 10_000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })); } catch { /* sem git */ }
  if (pasta && head && pasta !== head) return { pasta, head };
  return null;
}

// Um preparo por vez (achado A2 do Lynx): dois preparo-lancamento.ts
// simultâneos leriam e gravariam o mesmo app.json, com bump duplo.
let emPreparo = false;

async function prepararBuild(pedido) {
  if (emPreparo) return { ok: false, status: 409, codigo: 'preparar-em-andamento', mensagem: 'Já há um preparo de build rodando. Espere ele terminar e confira o app.json antes de tentar de novo.' };
  emPreparo = true;
  try {
    return await prepararBuildUmaVez(pedido);
  } finally {
    emPreparo = false;
  }
}

async function prepararBuildUmaVez({ tipo, mensagem }) {
  if (tipo !== 'patch' && tipo !== 'minor') return { ok: false, status: 400, codigo: 'tipo-invalido', mensagem: 'Tipo deve ser patch ou minor.' };
  if (typeof mensagem !== 'string' || !mensagem.trim()) return { ok: false, status: 400, codigo: 'mensagem-vazia', mensagem: 'Escreva a nota da build (vai para o pop-up "O que mudou no Grana.").' };
  const nota = mensagem.replace(/\r\n/g, '\n').trim();
  if (nota.length > 1024) return { ok: false, status: 400, codigo: 'mensagem-longa', mensagem: 'A nota passa de 1024 caracteres.' };
  if (/[\u0000-\u001f]/.test(nota.replace(/\n/g, ''))) return { ok: false, status: 400, codigo: 'mensagem-invalida', mensagem: 'A nota não pode ter caracteres de controle.' };

  // F8 do Vigil: um preparo anterior subiu a versão e ainda não foi commitado.
  // Preparar de novo pularia uma versão (1.10.6 -> 1.10.7) e o teto não contaria
  // nenhuma das duas, porque o teto lê commits.
  const pendente = versaoPendente();
  if (pendente) {
    return { ok: false, status: 409, codigo: 'preparo-pendente', mensagem: `Há um preparo de build não commitado: o app.json da pasta está em ${pendente.pasta} e o último commit em ${pendente.head}. Commite esse preparo (ou desfaça, se foi engano) antes de preparar outra build.` };
  }
  const antes = saldo();
  if (antes.status !== 'ok') return { ok: false, status: 503, codigo: 'saldo-indisponivel', mensagem: antes.erro.mensagem };
  if (!antes.semana.podePreparar) {
    return { ok: false, status: 409, codigo: 'teto-semanal', mensagem: `BLOQUEADO: esta semana já teve ${antes.semana.feitos} de ${antes.semana.teto} builds. O teto zera na segunda. Build de emergência só pelo terminal, com pedido do autor (regra 22).` };
  }
  const args = (tipo === 'minor' ? ['--minor'] : []).concat([nota]);
  const comando = 'npm run build:preparar -- ' + (tipo === 'minor' ? '--minor ' : '') + JSON.stringify(nota);

  if (SIMULAR) {
    return { ok: true, dados: { simulado: true, saldoAntes: antes, comando, saida: 'Simulação: nada foi executado e o app.json não mudou.', easBuild: 'eas build --profile preview --platform android --message ' + JSON.stringify(nota) } };
  }

  const tsx = noCacheDoNpx('tsx');
  if (!tsx) return { ok: false, status: 503, codigo: 'tsx-ausente', mensagem: 'O tsx não está no cache do npx. Rode o comando no terminal: ' + comando };
  const r = await rodar([path.join(tsx.dir, 'dist', 'cli.mjs'), path.join('scripts', 'preparar-lancamento.ts'), ...args], PRAZO_PREPARAR_MS);
  const saida = (r.stdout + (r.stderr ? '\n' + r.stderr : '')).trim().slice(0, 8000);
  if (r.morto) return { ok: false, status: 504, codigo: 'preparar-prazo', mensagem: 'O preparo não terminou em 2 minutos. Confira o app.json e o git status antes de tentar de novo.' };
  if (r.codigo !== 0) {
    const bloqueado = /BLOQUEADO/.test(saida);
    return { ok: false, status: 409, codigo: bloqueado ? 'preparar-bloqueado' : 'preparar-recusado', mensagem: saida || 'O preparo foi recusado.' };
  }
  const linhaEas = saida.split('\n').map((l) => l.trim()).find((l) => l.startsWith('eas build ')) || null;
  return { ok: true, dados: { simulado: false, saldoAntes: antes, comando, saida, easBuild: linhaEas, aviso: 'O app.json mudou e precisa ser commitado. O disparo do eas build é do autor.' } };
}

const { criarAcoesBuild, persistencia, gitReal, hashApp } = require('./build-acoes.cjs');
const acoes = criarAcoesBuild({
  log: (evento, codigo) => console.error(JSON.stringify({ evento, codigo })),
  ...persistencia(), simular: SIMULAR, git: gitReal,
  preparar: prepararBuild,
  appSha: () => hashApp(fs.readFileSync(path.join(RAIZ, 'app.json'), 'utf8')),
  versao: () => JSON.parse(fs.readFileSync(path.join(RAIZ, 'app.json'), 'utf8')).expo.version,
  id: () => require('crypto').randomUUID(), agora: () => new Date().toISOString(),
  cli: () => { const c = noCacheDoNpx('eas-cli'); return c && path.join(c.dir, 'bin', 'run'); },
  eas: (cli, args) => rodar([cli, ...args], PRAZO_CLI_MS),
  pacoteSeguro: () => { const p = require(path.join(RAIZ, 'scripts', 'env-fora-da-build.ts')).variaveisNoPacoteDaBuild(RAIZ); return !p.vaoNoPacote.length && !p.pastasNoPacote.length; },
  release: () => require('./supabase.cjs').appRelease(),
  regravar: (...args) => require('./supabase.cjs').regravarNotaRelease(...args),
});
module.exports = { builds, saldo, status, prepararBuild: acoes.preparar,
  dispararBuild: acoes.disparar, retomarPreparo: acoes.retomar, verificarNota: acoes.verificar, resolverDisparo: acoes.resolver, regravarNota: acoes.regravar };
