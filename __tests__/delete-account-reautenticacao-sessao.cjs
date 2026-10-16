/*
 * V4-5 (16/10/2026): a janela de reautenticação do delete-account é da SESSÃO do token.
 *
 *   node __tests__/delete-account-reautenticacao-sessao.cjs
 *
 * Executa o módulo real `_shared/reautenticacao.ts` (TypeScript compilado em memória) e
 * confere no fonte da função que ela o usa e não lê mais `last_sign_in_at`.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
let passou = 0;
const ok = (c, nome) => { assert.ok(c, nome); passou++; };

const raiz = path.join(__dirname, '..', 'supabase', 'functions');
const js = ts.transpileModule(fs.readFileSync(path.join(raiz, '_shared', 'reautenticacao.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, { module: mod, exports: mod.exports, atob, TextDecoder, Uint8Array, Date, Number, Array, JSON });
const { sessaoReautenticouRecentemente, instanteDaProvaDaSessao, JANELA_REAUTENTICACAO_MS } = mod.exports;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims) => `${b64({ alg: 'HS256' })}.${b64(claims)}.assinatura`;
const AGORA = Date.parse('2026-10-16T12:00:00Z');
const seg = (ms) => Math.floor(ms / 1000);

ok(JANELA_REAUTENTICACAO_MS === 600000, 'janela segue em 10 minutos');

// Duas sessões da mesma conta: A velha (roubada), B recém-reautenticada.
const tokenA = jwt({ session_id: 'A', amr: [{ method: 'password', timestamp: seg(AGORA - 3 * 3600_000) }] });
const tokenB = jwt({ session_id: 'B', amr: [{ method: 'password', timestamp: seg(AGORA - 60_000) }] });
// `user.last_sign_in_at` seria o do login novo (B) para os DOIS tokens; só o JWT diferencia.
ok(sessaoReautenticouRecentemente(tokenB, AGORA) === true, 'sessão que acabou de confirmar a senha é aceita');
ok(sessaoReautenticouRecentemente(tokenA, AGORA) === false, 'token antigo da mesma conta NÃO é autorizado por login novo em outra sessão');

// Limites da janela
const em = (deltaMs) => jwt({ amr: [{ method: 'password', timestamp: seg(AGORA - deltaMs) }] });
ok(sessaoReautenticouRecentemente(em(JANELA_REAUTENTICACAO_MS - 1000), AGORA), 'dentro da janela');
ok(!sessaoReautenticouRecentemente(em(JANELA_REAUTENTICACAO_MS + 2000), AGORA), 'fora da janela');
ok(!sessaoReautenticouRecentemente(em(-5 * 60_000), AGORA), 'instante no futuro (relógio adulterado) é recusado');
ok(sessaoReautenticouRecentemente(em(-10_000), AGORA), 'pequena deriva de relógio é tolerada');

// Vários métodos: vale o mais recente (ex.: senha antiga + MFA novo)
const dois = jwt({ amr: [{ method: 'password', timestamp: seg(AGORA - 3600_000) }, { method: 'totp', timestamp: seg(AGORA - 30_000) }] });
ok(instanteDaProvaDaSessao(dois) === seg(AGORA - 30_000) * 1000, 'usa o instante mais recente entre os métodos');

// Falha fechada
for (const [nome, t] of [
  ['sem amr', jwt({ session_id: 'x' })],
  ['amr vazio', jwt({ amr: [] })],
  ['amr sem timestamp', jwt({ amr: [{ method: 'password' }] })],
  ['timestamp em texto', jwt({ amr: [{ method: 'password', timestamp: String(seg(AGORA)) }] })],
  ['amr não é lista', jwt({ amr: 'password' })],
  ['token sem 3 partes', 'lixo'],
  ['payload inválido', 'a.%%%.c'],
  ['string vazia', ''],
]) ok(sessaoReautenticouRecentemente(t, AGORA) === false, `falha fechada: ${nome}`);

// A função usa o helper e não confia mais no carimbo global
const fonte = fs.readFileSync(path.join(raiz, 'delete-account', 'index.ts'), 'utf8');
ok(/sessaoReautenticouRecentemente\(token\)/.test(fonte), 'delete-account mede a janela pelo token da sessão');
ok(!/last_sign_in_at/.test(fonte.replace(/\/\*[\s\S]*?\*\//g, '')), 'delete-account não lê mais last_sign_in_at no código');
ok(/reauthentication_required/.test(fonte) && /428/.test(fonte), 'mantém a resposta 428 que o app já trata');

console.log(`delete-account-reautenticacao-sessao: ${passou} checagens passaram — 0 falhas`);
