const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compile = (f) => ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const jsx = (type, props) => ({ type, props });
const visual = {};
vm.runInNewContext(compile('components/admin/AdminVisual.web.tsx'), { exports: visual, Date, require: (id) => id === 'react/jsx-runtime' ? { jsx, jsxs: jsx, Fragment: 'fragment' } : id === 'expo-router/head' ? { default: () => null } : {} });
function texto(n) {
  if (n == null || typeof n === 'boolean') return '';
  if (Array.isArray(n)) return n.map(texto).join(' ');
  if (typeof n !== 'object') return String(n);
  return typeof n.type === 'function' ? texto(n.type(n.props)) : texto(n.props?.children);
}
const dadosValidos = () => ({
  contas: { total: 50, novas7d: 2, novas30d: 5 },
  assinaturas: { ativas: 20, porPlano: { mensal: 10, anual: 10 }, porOrigem: { venda: 15, cortesia: 5 } },
  receita: { disponivel: false, soma30d: null, moeda: 'BRL' },
  app: { versaoAnunciada: '1.10.6', anunciadaEm: '2026-10-08T12:00:00Z' },
  uso: { voz7d: 12, aparelhosComNotificacao: 3 },
});
(async () => {
  for (let mask = 0; mask < 32; mask++) {
    const dados = dadosValidos(), names = Object.keys(dados); let falhas = 0;
    names.forEach((n, i) => { if (mask & (1 << i)) { dados[n] = { ...dados[n], indisponivel: true }; falhas++; } });
    const client = {};
    vm.runInNewContext(compile('lib/admin-web.ts'), {
      exports: client, Date, AbortController, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto, process: { env: {} },
      require: () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'fixture' } } }) } } }),
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, contrato: 1, geradoEm: '2026-10-08T12:00:00Z', dados }) }),
    });
    const resumo = await client.consultarAdmin('visao-geral');
    const rendered = texto(visual.default({ etapa: 'pronto', resumo, erro: null, ocupado: false, email: '', senha: '', codigo: '', fator: null }));
    assert.equal((rendered.match(/Não foi possível ler este bloco/g) || []).length, falhas, 'combinação ' + mask);
    assert.ok(rendered.includes('Saúde'), 'bloco saudável permanece');
    assert.equal((rendered.match(/Lido às/g) || []).length, 6);
  }
  console.log('admin-web-integracao: cliente + visual reais, 32 combinações de blocos indisponíveis com recibos OK');
})().catch((e) => { console.error(e); process.exitCode = 1; });
