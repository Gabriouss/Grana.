'use strict';
// Botão real -> exportador real -> leitor padrão com Supabase dublado.
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
const { carregar } = require('./exportar-meus-dados.cjs');

function criarBotao(opcoes = {}) {
  const core = carregar(opcoes);
  const ctx = { core, alertas: [], abertos: [], logs: [], slots: [], cursor: 0, user: { id: 'conta-A', email: 'rotulo@invalid.test' } };
  const m = { exports: {} };
  const nativo = { ActivityIndicator: 'ActivityIndicator', Text: 'Text', StyleSheet: { create: v => v } };
  const imports = {
    react: { useState(inicial) { const i = ctx.cursor++; if (!(i in ctx.slots)) ctx.slots[i] = inicial; return [ctx.slots[i], v => { ctx.slots[i] = v; }]; } },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': nativo,
    'expo-linking': { openURL: async u => { if (ctx.falhaLink) throw Error('PRIVADO'); ctx.abertos.push(u); } },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Ionicons' },
    '@/lib/checkout-assinatura': { destinoSuporte: 'mailto:suporte@granaponto.com.br' },
    '@/lib/alerta': { Alert: { alert: (...args) => ctx.alertas.push(args) } },
    '@/lib/auth-context': { useSession: () => ({ session: ctx.user ? { user: ctx.user } : null }) },
    '@/lib/exportar-meus-dados': core.modulo,
    '@/lib/erros': { mensagemErro: (e, apoio) => e?.message ?? apoio },
    '@/lib/theme': { theme: {}, radius: {}, spacing: {}, fonts: {}, type: {} },
    './AppPressable': { __esModule: true, default: 'AppPressable' },
  };
  const codigo = ts.transpileModule(fs.readFileSync('components/BaixarMeusDadosBotao.tsx', 'utf8'), { fileName: 'components/BaixarMeusDadosBotao.tsx',
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(codigo, { module: m, exports: m.exports, console: { warn: (...a) => ctx.logs.push(a) },
    require: n => { if (!(n in imports)) throw Error(`import não dublado: ${n}`); return imports[n]; } });
  ctx.render = (props = {}) => { ctx.cursor = 0; return m.exports.default(props); };
  return ctx;
}

let checks = 0;
const ok = (v, n) => { assert.ok(v, n); checks++; };
const eq = (a, b, n) => { assert.deepEqual(a, b, n); checks++; };
const semEfeitos = c => ok(Object.values(c.core.efeitos).every(n => n === 0), 'aborto não pode entregar arquivo');

async function main() {
  const perfil = fs.readFileSync('app/(app)/perfil.tsx', 'utf8');
  ok(/<BaixarMeusDadosBotao\s*\/>/.test(perfil), 'Perfil usa botão sem prop de acesso: núcleo deve proteger');
  for (const modo of ['bloqueado-prop', 'bloqueado-nucleo', 'expirou-na-leitura']) {
    const c = criarBotao(modo === 'expirou-na-leitura' ? { onPagina(ctx) { ctx.acesso.allowed = false; } } : {});
    if (modo === 'bloqueado-nucleo') c.core.acesso.allowed = false;
    await c.render(modo === 'bloqueado-prop' ? { acessoBloqueado: true } : {}).props.onPress();
    eq(c.alertas.at(-1)[0], 'Solicitar seus dados'); ok(c.alertas.at(-1)[1].includes('sem precisar renovar')); semEfeitos(c);
    if (modo === 'bloqueado-prop') eq(c.core.rpcs.length, 0);
    c.alertas.at(-1)[2].find(x => x.text === 'Solicitar pelo suporte').onPress();
    await Promise.resolve(); eq(c.abertos[0], 'mailto:suporte@granaponto.com.br');
    eq(c.render().props.accessibilityState.busy, false);
  }
  {
    const c = criarBotao(); c.core.acesso.allowed = false; c.falhaLink = true;
    await c.render().props.onPress(); c.alertas.at(-1)[2][1].onPress();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    eq(c.alertas.at(-1)[0], 'Fale com o suporte'); ok(c.alertas.at(-1)[1].includes('suporte@')); ok(!JSON.stringify(c.logs).includes('PRIVADO'));
  }
  {
    const c = criarBotao(); const botao = c.render();
    ok(botao.props.children[1].props.children.includes('cópia parcial'), 'limitação aparece no próprio botão antes do download');
    ok(botao.props.accessibilityLabel.includes('feedbacks disponíveis pelo suporte'));
    await botao.props.onPress();
    eq(c.alertas.at(-1)[0], 'Cópia parcial gerada'); const mensagem = c.alertas.at(-1)[1];
    ok(mensagem.includes('feedbacks')); ok(mensagem.includes('permanente')); ok(mensagem.includes('suporte@'));
    ok(!/mais tarde|cópia completa|tente novamente/i.test(mensagem), 'limitação permanente não promete repetição');
    eq(c.core.efeitos.click, 1); eq(c.render().props.accessibilityState.busy, false);
  }
  {
    const c = criarBotao({ onPagina(_ctx, p, r) { if (p.tabela === 'transactions') r.error = { code: '08006' }; } });
    await c.render().props.onPress();
    const mensagem = c.alertas.at(-1)[1]; ok(mensagem.includes('permanente')); ok(mensagem.includes('falha temporária')); eq(c.core.efeitos.click, 1);
  }
  {
    const c = criarBotao({ plataforma: 'android' }); c.core.disponivel = false;
    await c.render().props.onPress(); eq(c.alertas.at(-1)[0], 'Cópia parcial gerada'); ok(c.alertas.at(-1)[1].includes('ficou salvo')); eq(c.core.efeitos.share, 0);
  }
  for (const modo of ['sem-sessao', 'conta-divergente', 'sessao-trocou', 'falha-acesso']) {
    const c = criarBotao(modo === 'sessao-trocou' ? { onPagina(ctx) { ctx.mudarSessao(null); } } : {});
    if (modo === 'sem-sessao') { c.user = null; c.core.sessao = null; }
    if (modo === 'conta-divergente') c.user.id = 'conta-B';
    if (modo === 'falha-acesso') c.core.erroRpc = { code: 'PGRST202', message: 'PRIVADO' };
    await c.render().props.onPress();
    eq(c.alertas.at(-1)[0], 'Não foi possível gerar a cópia'); semEfeitos(c);
    ok(!JSON.stringify(c.alertas).includes('PRIVADO')); ok(c.logs.length > 0); eq(c.render().props.accessibilityState.busy, false);
  }
  console.log(JSON.stringify({ suite: 'exportacao-botao-perfil-modulos-reais', checks }));
}
module.exports = { main };
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
