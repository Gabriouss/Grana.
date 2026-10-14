const fs = require('fs');
const os = require('os');
const path = require('path');

const PASTA = process.env.LIMITE_PASTA || 'E:/Grana-temporarios/limite-claude';
const TETO = 75;
const VOLTA_ANTES_MS = 15 * 60 * 1000;

// A conta vem do .claude.json da configuração em uso; cada conta tem o próprio estado,
// para um terminal de outra conta não liberar nem travar esta.
function lerConta() {
  try {
    const base = process.env.CLAUDE_CONFIG_DIR || os.homedir();
    const j = JSON.parse(fs.readFileSync(path.join(base, '.claude.json'), 'utf8'));
    const email = (j.oauthAccount && j.oauthAccount.emailAddress) || '';
    // Apelidos ficam fora do repositório, que é público (regra 15): { "<e-mail>": "PH" }.
    const apelidos = ler(path.join(PASTA, 'contas.json')) || {};
    if (apelidos[email]) return apelidos[email];
    return email ? 'conta-' + require('crypto').createHash('sha1').update(email).digest('hex').slice(0, 8) : 'desconhecida';
  } catch { return 'desconhecida'; }
}

const caminhoEstado = (conta) => path.join(PASTA, `${conta}.json`);
const caminhoBloqueio = (conta) => path.join(PASTA, `${conta}.bloqueio.json`);

function ler(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function salvar(p, v) {
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2)); } catch {}
}

// resets_at pode vir em segundos epoch ou ISO.
function paraMs(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const n = Number(v);
  if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
  return Date.parse(v);
}

// Devolve { travado, janela, usado, retomarEm } olhando 5 h e semanal.
// Travado = alguma janela em 75% ou mais E ainda faltam mais de 15 min para ela virar.
function avaliar(estado, agora = Date.now()) {
  const travas = [];
  for (const [nome, w] of [['5 horas', estado && estado.cinco_horas], ['semanal', estado && estado.semanal]]) {
    if (!w || !Number.isFinite(w.usado) || w.usado < TETO) continue;
    const volta = paraMs(w.volta);
    const retomarEm = Number.isFinite(volta) ? volta - VOLTA_ANTES_MS : agora + 60 * 60 * 1000;
    if (agora < retomarEm) travas.push({ janela: nome, usado: w.usado, retomarEm });
  }
  if (!travas.length) return { travado: false };
  travas.sort((a, b) => b.retomarEm - a.retomarEm); // a mais distante manda
  return { travado: true, ...travas[0] };
}

const hora = (ms) => new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

module.exports = { PASTA, TETO, lerConta, caminhoEstado, caminhoBloqueio, ler, salvar, avaliar, paraMs, hora };
