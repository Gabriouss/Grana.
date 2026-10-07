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
// Ação: preparar build = rodar scripts/preparar-lancamento.ts (o que o
// `npm run build:preparar` roda), sem shell. NUNCA roda `eas build` (regra 4):
// devolve o comando pronto para o autor colar.

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
    execFile(process.execPath, args, { cwd: RAIZ, timeout: prazo, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
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
  return { ...lista, saldo: saldo(), comoDisparar: 'O painel só prepara a build. O disparo (eas build) é colado pelo autor no terminal (regra 4).' };
}

async function status() {
  const s = saldo();
  return { status: s.status, saldo: s };
}

// ---------- preparar build ----------

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
  const nota = mensagem.trim();
  if (nota.length > 600) return { ok: false, status: 400, codigo: 'mensagem-longa', mensagem: 'A nota passa de 600 caracteres.' };
  if (/[\u0000-\u001f"]/.test(nota.replace(/\n/g, ''))) return { ok: false, status: 400, codigo: 'mensagem-invalida', mensagem: 'A nota não pode ter aspas duplas nem caracteres de controle.' };

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

module.exports = { builds, saldo, status, prepararBuild };
