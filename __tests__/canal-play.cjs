/*
 * Canal Play (EXPO_PUBLIC_CANAL=play): Cakto, renovação externa, aviso de
 * atualização por APK e download do APK têm de ficar inacessíveis; sem canal,
 * nada muda. Roda os módulos reais de lib/ e confere a fiação das telas no
 * código-fonte (telas de RN não montam sem Jest).
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

function carregar(arquivo, env, extras = {}) {
  const codigo = ts.transpileModule(ler(arquivo), {
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
  const layout = ler('app/_layout.tsx');
  conferir('_layout só monta UpdateBanner fora do canal play', /\{session && !ehCanalPlay\(\) && <UpdateBanner \/>\}/.test(layout));
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
