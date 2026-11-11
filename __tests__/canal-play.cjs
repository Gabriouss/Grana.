/*
 * Canal Play (EXPO_PUBLIC_CANAL=play): Cakto, renovação externa, aviso de
 * atualização por APK e download do APK têm de ficar inacessíveis; sem canal,
 * nada muda. Executa lib/ e AssinarScreen reais em vm, com JSX/contexto/I/O
 * nativos dublados; nao representa montagem no aparelho.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

let total = 0, falhas = 0;
function conferir(nome, ok, visto) {
  total++;
  if (ok) return;
  falhas++;
  console.error(`x ${nome}${visto === undefined ? '' : ` — visto: ${JSON.stringify(visto)}`}`);
}
const ler = (p) => fs.readFileSync(p, 'utf8');

function carregar(arquivo, env, extras = {}, fonte = ler(arquivo)) {
  const codigo = ts.transpileModule(fonte, {
    fileName: arquivo,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modulo = { exports: {} };
  const requires = { ...extras };
  if (arquivo !== 'lib/canal.ts') requires['./canal'] = carregar('lib/canal.ts', env);
  vm.runInNewContext(codigo, {
    module: modulo, exports: modulo.exports, process: { env }, Date, Promise, Error,
    require: (n) => { if (!(n in requires)) throw new Error('require inesperado: ' + n); return requires[n]; },
  });
  return modulo.exports;
}

// AssinarScreen real: canal/aviso reais; JSX, contexto e I/O nas fronteiras.
function montarAssinar(env, estado, gerenciamento) {
  const abertos = [];
  const jsx = (type, props) => ({ type, props: props || {} });
  const dubles = {
    react: { useState: v => [v, () => {}], useEffect() {} },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView',
      Text: 'Text', View: 'View', StyleSheet: { create: v => v } },
    'expo-linking': { openURL: url => abertos.push(url) },
    '@/lib/canal': carregar('lib/canal.ts', env),
    '@/lib/aviso-assinatura': carregar('lib/aviso-assinatura.ts', env),
    '@/lib/feature-flags': { useFlags: () => ({ ligado: () => true }) },
    '@/lib/entitlement-context': { useEntitlement: () => ({ estado, sincronizacao: {}, recarregar() {} }) },
    '@/lib/auth-context': { useSession: () => ({ session: { user: { id: 'sintetico', email: 'pessoa@example.test' } }, signOut() {} }) },
    '@/lib/alerta': { Alert: { alert() {} } },
    '@/lib/checkout': { checkoutComEmail: url => url },
    '@/lib/checkout-assinatura': { destinoCompra: 'https://example.test/mensal', destinoGerenciamento: gerenciamento,
      destinoSuporte: 'https://example.test/suporte' },
    '@/lib/resumo-dados-guardados': { obterResumoDadosGuardados: () => { throw new Error('I/O inesperado'); } },
    '@/lib/theme': { fonts: {}, radius: {}, spacing: {}, theme: {} },
  };
  for (const nome of ['SafeAreaViewComFaixa', 'BaixarMeusDadosBotao', 'ExcluirContaSheet']) {
    dubles['@/components/' + nome] = { __esModule: true, default: nome };
  }
  const api = {};
  vm.runInNewContext(ts.transpileModule(ler('app/assinar.tsx'), { fileName: 'app/assinar.tsx',
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
  { exports: api, process: { env: { ...env, EXPO_PUBLIC_CHECKOUT_URL_ANUAL: 'https://example.test/anual' } },
    require: id => { if (!(id in dubles)) throw new Error('Import inesperado da tela: ' + id); return dubles[id]; } });
  return { arvore: api.default(), abertos };
}
function elementos(no) {
  if (Array.isArray(no)) return no.flatMap(elementos);
  return no && typeof no === 'object' ? [no, ...elementos(no.props?.children)] : [];
}
function texto(no) {
  if (Array.isArray(no)) return no.map(texto).join(' ');
  return no && typeof no === 'object' ? texto(no.props?.children) : no == null || typeof no === 'boolean' ? '' : String(no);
}
function conferirAssinar() {
  for (const [nome, estado, gerenciamento] of [
    ['planos', null, 'https://example.test/cobranca'],
    ['cobranca', { enforced: true, allowed: false, status: 'past_due' }, 'https://example.test/cobranca'],
    ['suporte', { enforced: true, allowed: false, status: 'past_due' }, null],
    ['renovacao', { enforced: true, allowed: false, status: 'canceled' }, null],
    ['ativa', { enforced: true, allowed: true, status: 'active' }, null],
    ['cortesia', { enforced: false, allowed: true, status: null }, null],
  ]) {
    for (const canalPlay of [true, false]) {
      const { arvore, abertos } = montarAssinar(canalPlay ? { EXPO_PUBLIC_CANAL: 'play' } : {}, estado, gerenciamento);
      const conteudo = texto(arvore);
      const nos = elementos(arvore);
      const botoes = nos.filter(n => n.type === 'Pressable' && !n.props.disabled);
      if (canalPlay) {
        conferir('tela Play ' + nome + ': ramo neutro montado', conteudo.includes('Google Play'));
        conferir('tela Play ' + nome + ': sem preco ou verificar pagamento', !/R\$|verificar acesso/.test(conteudo + JSON.stringify(nos.map(n => n.props.accessibilityLabel))));
        conferir('tela Play ' + nome + ': sair e excluir disponiveis', botoes.some(n => /Sair da conta/.test(texto(n))) && botoes.some(n => /Excluir conta e dados/.test(texto(n))));
        conferir('tela Play ' + nome + ': exportar dados disponivel', nos.some(n => n.type === 'BaixarMeusDadosBotao'));
      } else conferir('tela APK ' + nome + ': verificar pagamento permanece', conteudo.includes('verificar acesso'));
      for (const botao of botoes) botao.props.onPress();
      conferir('tela ' + (canalPlay ? 'Play' : 'APK') + ' ' + nome + ': handlers externos', canalPlay ? abertos.length === 0 : abertos.length > 0, abertos);
    }
  }
}

// Rotas legais e ativação reais, inclusive TextoComLinks e seus handlers.
function conferirRotas() {
  const path = require('node:path');
  for (const canalPlay of [true, false]) {
    const env = canalPlay ? { EXPO_PUBLIC_CANAL: 'play' } : {};
    const abertos = [], navegados = [], cache = new Map();
    const jsx = (type, props) => ({ type, props: props || {} });
    const router = { push: r => navegados.push(r), replace: r => navegados.push(r), back() {}, canGoBack: () => false };
    const fronteiras = {
      react: { useState: v => [v === 'carregando' ? 'vinculado' : v, () => {}], useEffect() {}, useMemo: f => f(), useRef: v => ({ current: v }) },
      'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
      'react-native': { Platform: { OS: 'android' }, Text: 'Text', View: 'View', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator',
        StyleSheet: { create: v => v }, useWindowDimensions: () => ({ width: 390, height: 800 }), Linking: { openURL: u => abertos.push(u) } },
      'expo-linking': { openURL: u => abertos.push(u) },
      'expo-router': { useRouter: () => router, usePathname: () => '/termos', useLocalSearchParams: () => ({}) },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
      '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Ionicons' },
      '@/lib/theme': { theme: {}, spacing: {}, radius: {}, fonts: {}, type: {}, hitSlopPara: () => 12, lh: n => n },
      '@/lib/breakpoints': { colunaLeitura: {}, colunaFormulario: {}, useBreakpoint: () => ({ ehCompacto: true, ehAmplo: false }) },
      '@/lib/auth-context': { useSession: () => ({ session: { user: { id: 'teste' } }, isLoading: false }) },
      '@/lib/assinatura': { guardarTokenAtivacaoPendente: () => { throw Error('efeito inesperado'); } },
      '@/lib/supabase': { supabase: { rpc: () => { throw Error('rede inesperada'); } } },
      '@/lib/entitlement-context': { useEntitlement: () => ({ estado: { enforced: true, allowed: true, status: 'canceled', access_until: new Date(Date.now() + 2 * 86400000).toISOString() } }) },
      '@/lib/feature-flags': { useFlags: () => ({ ligado: () => true }) },
      '@/lib/alerta': { Alert: { alert() {} } },
      '@/components/AppPressable': { __esModule: true, default: 'Pressable' },
      '@/components/BrandLogotype': { __esModule: true, default: 'Marca' },
    };
    function real(arquivo) {
      if (cache.has(arquivo)) return cache.get(arquivo);
      const api = {}; cache.set(arquivo, api);
      vm.runInNewContext(ts.transpileModule(ler(arquivo), { fileName: arquivo,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText,
      { exports: api, process: { env }, require: id => {
        if (id in fronteiras) return fronteiras[id];
        let f = id.startsWith('@/') ? id.slice(2) : path.posix.join(path.posix.dirname(arquivo), id);
        if (!path.extname(f)) f += fs.existsSync(f + '.ts') ? '.ts' : '.tsx';
        return real(f);
      } });
      return api;
    }
    function expandir(no) {
      if (Array.isArray(no)) return no.map(expandir);
      if (!no || typeof no !== 'object') return no;
      if (typeof no.type === 'function') return expandir(no.type(no.props));
      return { ...no, props: { ...no.props, children: expandir(no.props.children) } };
    }
    for (const rota of ['termos', 'privacidade', 'exclusao-de-dados']) {
      const arvore = expandir(real('app/' + rota + '.tsx').default());
      const nos = elementos(arvore), visivel = texto(arvore) + JSON.stringify(nos.map(n => [n.props.href, n.props.accessibilityLabel]));
      if (canalPlay) conferir('documento Play ' + rota + ': sem compra externa', !/cakto|checkout|pay\./i.test(visivel));
      else if (rota !== 'exclusao-de-dados') conferir('documento APK ' + rota + ': parceiro preservado', /Cakto/.test(visivel));
      for (const n of nos) if (n.props.onPress) n.props.onPress({ stopPropagation() {}, preventDefault() {} });
    }
    const ativar = expandir(real('app/ativar.tsx').default());
    const botoesDownload = elementos(ativar).filter(n => n.props.onPress && /Baixar o aplicativo/.test(texto(n)));
    conferir('ativar ' + (canalPlay ? 'Play' : 'APK') + ': download só no APK', canalPlay ? botoesDownload.length === 0 : botoesDownload.length === 1);
    for (const n of elementos(ativar)) if (n.props.onPress) n.props.onPress();
    const faixa = expandir(real('components/FaixaAssinatura.tsx').default());
    conferir('faixa ' + (canalPlay ? 'Play' : 'APK') + ': renovação externa só no APK', canalPlay ? faixa === null : faixa !== null);
    for (const n of elementos(faixa)) if (n.props.onPress) n.props.onPress();
    if (canalPlay) conferir('rotas Play: nenhum handler abre compra, download ou site', abertos.every(u => u.startsWith('mailto:')) && !navegados.includes('/baixar'), { abertos, navegados });
  }
  const original = require('node:child_process').execFileSync('git', ['show', 'fad46dac:lib/legal-content.ts'], { encoding: 'utf8' });
  const antes = carregar('lib/legal-content.ts', {}, {}, original), depois = carregar('lib/legal-content.ts', {});
  for (const documento of ['TERMOS_DE_SERVICO', 'POLITICA_PRIVACIDADE', 'EXCLUSAO_DE_DADOS']) {
    conferir('APK: documento e data preservados integralmente ' + documento, JSON.stringify(antes[documento]) === JSON.stringify(depois[documento]));
  }
}

// 1. canal
for (const [env, esperado] of [[{}, false], [{ EXPO_PUBLIC_CANAL: '' }, false], [{ EXPO_PUBLIC_CANAL: 'apk' }, false],
  [{ EXPO_PUBLIC_CANAL: 'play' }, true], [{ EXPO_PUBLIC_CANAL: ' Play ' }, true]]) {
  conferir(`ehCanalPlay ${JSON.stringify(env)}`, carregar('lib/canal.ts', env).ehCanalPlay() === esperado);
}

// 2. download do APK
const URL_APK = 'https://exemplo.com/grana.apk';
conferir('sem canal, a URL de download continua',
  carregar('lib/download-app.ts', { EXPO_PUBLIC_ANDROID_DOWNLOAD_URL: URL_APK }).obterUrlDownloadAndroid() === URL_APK);
conferir('no canal play, o download some',
  carregar('lib/download-app.ts', { EXPO_PUBLIC_ANDROID_DOWNLOAD_URL: URL_APK, EXPO_PUBLIC_CANAL: 'play' }).obterUrlDownloadAndroid() === null);

// 3. aviso de atualização: nenhuma ida à rede no canal play, comportamento antigo sem canal
async function atualizacao(env) {
  let leituras = 0;
  const supabase = { from() { leituras++; const q = { select: () => q, eq: () => q,
    maybeSingle: async () => ({ data: { version: '9.9.9', apk_url: 'https://x/a.apk', notes: 'n', apk_expires_at: null }, error: null }) }; return q; } };
  const mod = carregar('lib/atualizacao.ts', env, {
    'expo-constants': { __esModule: true, default: { expoConfig: { version: '1.0.0' } } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => {} } },
    './supabase': { supabase },
    './versao': { compararVersoes: (a, b) => (a === b ? 0 : a > b ? 1 : -1) },
    './download-app': carregar('lib/download-app.ts', env),
  });
  return { r: await mod.verificarAtualizacao(), leituras };
}
(async () => {
  const sem = await atualizacao({});
  conferir('sem canal, o aviso de atualização continua', sem.r && sem.r.versao === '9.9.9' && sem.leituras === 1, sem);
  const play = await atualizacao({ EXPO_PUBLIC_CANAL: 'play' });
  conferir('no canal play, não há aviso nem consulta', play.r === null && play.leituras === 0, play);

  // 4. fiação das telas (código-fonte)
  conferirAssinar();
  conferirRotas();
  const layout = ler('app/_layout.tsx');
  conferir('_layout só monta UpdateBanner fora do canal play e da recuperação', /\{session && !emRecuperacao && !ehCanalPlay\(\) && <UpdateBanner \/>\}/.test(layout));
  const faixa = ler('components/FaixaAssinatura.tsx');
  conferir('FaixaAssinatura sai no canal play antes de qualquer link', /if \(ehCanalPlay\(\) \|\| !session/.test(faixa));
  const baixar = ler('app/baixar.tsx');
  conferir('rota baixar redireciona no canal play', /if \(ehCanalPlay\(\)\) return <Redirect href="\/" \/>/.test(baixar));
  const assinar = ler('app/assinar.tsx');
  conferir('assinar: estado neutro no canal play vem antes de cobrança e planos', assinar.indexOf('canalPlay ? (') > 0
    && assinar.indexOf('canalPlay ? (') < assinar.indexOf('cobrancaPendente ? ('));
  conferir('assinar: botão "Já paguei" some no canal play', /canalPlay \? null : <Pressable/.test(assinar));
  conferir('assinar: o texto do canal play não traz preço', !/Google Play[^`]*R\$/.test(assinar));

  // 5. eas.json
  const eas = JSON.parse(ler('eas.json')).build;
  const base = JSON.parse(require('node:child_process').execSync('git show 09b22ae2:eas.json', { encoding: 'utf8' })).build;
  for (const p of ['development', 'preview', 'production']) {
    conferir(`eas.json ${p} inalterado`, JSON.stringify(eas[p]) === JSON.stringify(base[p]));
  }
  for (const p of ['preview', 'production']) {
    conferir(`${p} segue APK interno (regra 8)`, eas[p].distribution === 'internal' && eas[p].android.buildType === 'apk' && !eas[p].env.EXPO_PUBLIC_CANAL);
  }
  conferir('perfil play: store, app-bundle, canal play',
    eas.play && eas.play.distribution === 'store' && eas.play.android.buildType === 'app-bundle' && eas.play.env.EXPO_PUBLIC_CANAL === 'play');

  console.log(`${total - falhas}/${total} verificações ok`);
  if (falhas) process.exit(1);
})();
