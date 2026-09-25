/* App Links (regra 18 do context.md, handoff do maestro ao Harbor, 25/09/2026):
 * https://granaponto.com.br/auth/callback agora chega ao app nativo direto
 * (assetlinks.json + android.intentFilters no app.json), sem passar pelo
 * navegador. O cuidado é o PKCE: quando o cadastro foi feito na WEB, o
 * code_verifier fica gravado no navegador que chamou signUp, e o app nativo
 * nunca tem acesso a ele — `exchangeCodeForSession` chamado por aqui falharia
 * sempre. `extrairCallbackSeguro`, em lib/auth-context.tsx, precisa então
 * marcar essa origem (`viaAppLink`) para quem chama pular a troca e mostrar
 * "E-mail confirmado. Entre com seu e-mail e senha" em vez de tentar entrar.
 *
 * Este teste executa o MÓDULO REAL (via ts.transpileModule + vm, como pede a
 * regra 9), não uma reimplementação da lógica de classificação. A única peça
 * substituída é `expo-linking`, cujo `parse()` real depende de expo-constants
 * (config nativa) e não roda num vm puro; o substituto abaixo é uma
 * reprodução fiel, linha a linha, do `parse()` real para o caso de um app com
 * scheme próprio e fora do Expo Go — conferido em
 * node_modules/expo-linking/build/createURL.js (25/09/2026). Os outros
 * imports (react, react-native, ./alert, supabase, etc.) só são usados dentro
 * do corpo de `SessionProvider`, que este teste nunca invoca — por isso podem
 * ser dublês vazios.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

function parseComoExpoLinking(url) {
  let path = null;
  let hostname = null;
  let scheme = null;
  const queryParams = {};
  try {
    const parsed = new URL(url);
    parsed.searchParams.forEach((value, key) => {
      queryParams[key] = decodeURIComponent(value);
    });
    path = parsed.pathname || null;
    hostname = parsed.hostname || null;
    scheme = parsed.protocol || null;
  } catch {
    path = url;
  }
  if (scheme) scheme = scheme.substring(0, scheme.length - 1);
  if (path) path = path.replace(/^\//, '');
  return { hostname, path, queryParams, scheme };
}

function carregarModulo(dev) {
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'lib', 'auth-context.tsx'), 'utf8');
  const js = ts.transpileModule(fonte, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const api = {};
  const sandbox = {
    exports: api,
    module: { exports: api },
    console,
    __DEV__: dev,
    require: (id) => {
      if (id === 'react') {
        return {
          createContext: () => ({}),
          use: () => null,
          useCallback: (f) => f,
          useEffect: () => {},
          useRef: () => ({ current: null }),
          useState: (v) => [v, () => {}],
        };
      }
      if (id === 'expo-linking') {
        return { parse: parseComoExpoLinking, createURL: (p) => `com.gabriouss.grana:///${String(p).replace(/^\//, '')}` };
      }
      return {};
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox);
  return api;
}

let passou = 0;
let falhou = 0;
function checar(nome, condicao) {
  if (condicao) {
    passou++;
  } else {
    falhou++;
    console.error(`  FALHOU  ${nome}`);
  }
}

const { extrairCallbackSeguro } = carregarModulo(false);
assert.ok(typeof extrairCallbackSeguro === 'function', 'extrairCallbackSeguro precisa estar exportada de lib/auth-context.tsx');

const CODE = 'a'.repeat(20);

/* ── cadastro/confirmação pelo scheme nativo (comportamento de sempre) ──── */
{
  const r = extrairCallbackSeguro(`com.gabriouss.grana:///auth/callback?code=${CODE}`);
  checar('scheme nativo: reconhece o callback', r && 'code' in r);
  checar('scheme nativo: não é App Link', r.viaAppLink === false);
  checar('scheme nativo: não é recuperação', r.recuperacao === false);
  checar('scheme nativo: extrai o code', r.code === CODE);
}

/* ── recuperação de senha pelo scheme nativo ─────────────────────────────── */
{
  const r = extrairCallbackSeguro(`com.gabriouss.grana:///auth/callback?code=${CODE}&type=recovery`);
  checar('recuperação nativa: recuperacao=true', r.recuperacao === true);
  checar('recuperação nativa: não é App Link', r.viaAppLink === false);
}

/* ── cadastro confirmado por App Link (o caso novo desta rodada) ─────────── */
{
  const r = extrairCallbackSeguro(`https://granaponto.com.br/auth/callback?code=${CODE}`);
  checar('App Link: reconhece o domínio granaponto.com.br', r && 'code' in r);
  checar('App Link: viaAppLink=true', r.viaAppLink === true);
  checar('App Link: não é recuperação', r.recuperacao === false);
  checar('App Link: extrai o code', r.code === CODE);
}

/* ── recuperação por App Link: continua marcada, para NÃO cair na resposta
 *    "E-mail confirmado" (que seria enganosa — quem está recuperando senha
 *    não tem senha pra usar no login que a mensagem sugere) ─────────────── */
{
  const r = extrairCallbackSeguro(`https://granaponto.com.br/auth/callback?code=${CODE}&type=recovery`);
  checar('recuperação por App Link: viaAppLink=true', r.viaAppLink === true);
  checar('recuperação por App Link: recuperacao=true', r.recuperacao === true);
}

/* ── recusas: domínio errado, caminho errado, code inválido ──────────────── */
checar('domínio diferente de granaponto.com.br é ignorado',
  extrairCallbackSeguro(`https://outrodominio.com/auth/callback?code=${CODE}`) === null);
checar('path diferente de auth/callback é ignorado',
  extrairCallbackSeguro(`https://granaponto.com.br/outra-rota?code=${CODE}`) === null);
checar('code curto demais é ignorado',
  extrairCallbackSeguro('https://granaponto.com.br/auth/callback?code=abc') === null);
checar('sem code nem erro é ignorado',
  extrairCallbackSeguro('https://granaponto.com.br/auth/callback') === null);

/* ── erro do Supabase no callback (ex.: link de confirmação vencido) ─────── */
{
  const r = extrairCallbackSeguro('https://granaponto.com.br/auth/callback?error_description=Link+expirado');
  checar('error_description vira { erro }', r && r.erro === 'Link expirado');
}

/* ── scheme "exp" (Expo Go) só é aceito com __DEV__ ligado ─────────────────
 * URL sem o prefixo de roteamento `/--/` do Expo Go: essa reescrita depende
 * de expo-constants (isExpoHosted), fora do escopo do dublê de parse() acima
 * — o que se testa aqui é só o portão `__DEV__ && scheme === 'exp'`. */
{
  const url = `exp://127.0.0.1:8081/auth/callback?code=${CODE}`;
  checar('scheme exp fora do __DEV__ é ignorado', carregarModulo(false).extrairCallbackSeguro(url) === null);
  checar('scheme exp dentro do __DEV__ é aceito', carregarModulo(true).extrairCallbackSeguro(url) !== null);
}

console.log(passou > 0 && falhou === 0
  ? `OK app-links-callback: ${passou} verificações.`
  : `FALHOU app-links-callback: ${passou} ok, ${falhou} falharam.`);
if (falhou > 0) process.exitCode = 1;
