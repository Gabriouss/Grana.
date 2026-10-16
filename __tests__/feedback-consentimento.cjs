/*
 * A autorização de uso público do feedback nasce desmarcada, e a exclusão da
 * conta anonimiza de verdade.
 *
 * O autor pediu em 23/09/2026 a caixa de permissão ("adicione a caixa de
 * permissão do uso do feedback do usuário") depois de perguntar se dava para
 * manter o feedback legalmente mesmo excluindo a conta. Dá — pela
 * anonimização (LGPD, art. 12) —, e é essa a dobradiça que este teste prende:
 *
 * 1. `enviarFeedback` grava `public_use_consent` como booleano EXPLÍCITO, e
 *    falso quando ninguém marcou nada. Consentimento que vaza como `true` por
 *    omissão é pior que não ter caixa nenhuma;
 * 2. a exclusão da conta limpa `user_id`, `screenshot_url` e `device_info` na
 *    mesma escrita — deixar qualquer um deles transforma "anonimizado" em
 *    promessa falsa na política;
 * 3. a Política de Privacidade não volta a afirmar que nada fica retido.
 *
 * O item 1 roda o módulo real num sandbox. O item 3 também exercita o núcleo
 * real de consentimento e as funções reais da landing. O item 2 lê o fonte: a
 * Edge Function é Deno e a política é texto, então aqui a checagem é
 * estrutural de propósito — ela pega a regressão de alguém apagar um campo da
 * limpeza ou a frase voltar, que é o que já aconteceu.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

let total = 0;
let falhas = 0;
function conferir(nome, ok, visto) {
  total++;
  if (ok) return;
  falhas++;
  console.error(`✗ ${nome}${visto === undefined ? '' : ` — visto: ${JSON.stringify(visto)}`}`);
}

/* ── 1. O módulo real de envio ──────────────────────────────────────────── */
const codigo = ts.transpileModule(fs.readFileSync('lib/feedback.ts', 'utf8'), {
  fileName: 'lib/feedback.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function carregar() {
  const inseridos = [];
  const module = { exports: {} };
  vm.runInNewContext(codigo, {
    module,
    exports: module.exports,
    Promise,
    setTimeout,
    require: (nome) => {
      if (nome === 'react-native') return { Platform: { OS: 'android', Version: 34 } };
      if (nome === 'expo-constants') return { default: { expoConfig: { version: '1.10.2' }, deviceName: 'Pixel da Maria' } };
      if (nome === './supabase') {
        return {
          supabase: {
            auth: { getUser: async () => ({ data: { user: { id: 'usuario-1' } } }) },
            from: () => ({ insert: async (linha) => { inseridos.push(linha); return { error: null }; } }),
          },
        };
      }
      throw new Error(`import inesperado: ${nome}`);
    },
  });
  return { enviarFeedback: module.exports.enviarFeedback, inseridos };
}

(async () => {
  {
    const { enviarFeedback, inseridos } = carregar();
    await enviarFeedback({ type: 'praise', message: 'gostei', rating: 5 }, false);
    const linha = inseridos[0];
    conferir('sem a caixa marcada, a autorização vai FALSA e não ausente', linha.public_use_consent === false, linha.public_use_consent);
    conferir('o resto do feedback continua sendo gravado', linha.message === 'gostei' && linha.rating === 5 && linha.type === 'praise', linha);
  }
  {
    const { enviarFeedback, inseridos } = carregar();
    await enviarFeedback({ type: 'praise', message: 'pode usar', rating: null, autorizaUsoPublico: true }, false);
    conferir('marcada, a autorização vai verdadeira', inseridos[0].public_use_consent === true, inseridos[0].public_use_consent);
  }
  {
    /* Valor esquisito não pode virar autorização: só `true` autoriza. */
    const { enviarFeedback, inseridos } = carregar();
    await enviarFeedback({ type: 'bug', message: 'x', autorizaUsoPublico: undefined }, false);
    conferir('undefined não autoriza', inseridos[0].public_use_consent === false, inseridos[0].public_use_consent);
  }
  {
    const { enviarFeedback, inseridos } = carregar();
    await enviarFeedback({ type: 'bug', message: 'x', autorizaUsoPublico: true }, true);
    conferir('no modo demonstração nada é gravado', inseridos.length === 0, inseridos.length);
  }

  /* ── 2. A limpeza na exclusão da conta ────────────────────────────────── */
  {
    const fonte = fs.readFileSync('supabase/functions/delete-account/index.ts', 'utf8');
    const update = fonte.match(/\.from\('feedbacks'\)\s*\n\s*\.update\(\{([^}]*)\}\)/);
    conferir('a exclusão ainda anonimiza os feedbacks', update !== null);
    if (update) {
      for (const campo of ['user_id: null', 'screenshot_url: null', 'device_info: null']) {
        conferir(`a limpeza zera ${campo.split(':')[0]}`, update[1].includes(campo), update[1]);
      }
      for (const guardado of ['message', 'rating', 'type']) {
        conferir(`${guardado} continua guardado, que é o motivo de tudo isso`, !update[1].includes(`${guardado}:`), update[1]);
      }
    }
  }

  /* ── 3. A política não pode voltar a prometer o que não cumpre ────────── */
  {
    const politica = fs.readFileSync('lib/legal-content.ts', 'utf8');
    conferir('a frase "nada fica retido" não voltou', !/[Nn]ada fica retido/.test(politica));
    conferir('a retenção anonimizada do feedback está declarada', /anonimizad/i.test(politica) && /feedback/i.test(politica));

    /* A4: a exceção de publicidade continua declarada mesmo que o repasse
       esteja condicionado ao consentimento. Não tornar a guarda da política
       dependente de encontrar uma string num arquivo ou de um teste positivo.
       A E6 moveu a allowlist para o núcleo e limpou os hrefs copiáveis. */
    conferir('a política não volta a negar publicidade de forma absoluta', !/Não usamos seus dados para publicidade/.test(politica));
    conferir('ela declara os identificadores de clique pelo nome', /gclid/.test(politica) && /fbclid/.test(politica));
    conferir('e diz quem recebe', /Google Ads e Meta/.test(politica));

    const valores = new Map();
    const destinos = [];
    const janela = {
      localStorage: { getItem: k => valores.get(k) ?? null, setItem: (k,v) => valores.set(k,v) },
      location: { search: '?gclid=cliqueGoogle&fbclid=cliqueMeta', assign: url => destinos.push(new URL(url)) },
    };
    const consent = { exports: {} };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/consentimento-marketing.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { module: consent, exports: consent.exports, window: janela, URL, URLSearchParams, Date });

    // Recorte por AST das funções reais, sem importar UI nem reescrever a regra.
    const fonteLanding = ts.createSourceFile('app/index.tsx', fs.readFileSync('app/index.tsx','utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const funcoes = fonteLanding.statements.filter(n => ts.isFunctionDeclaration(n) && ['comAtribuicao','abrirCompraMarketing'].includes(n.name?.text));
    conferir('as duas funções reais da landing estão cobertas', funcoes.length === 2, funcoes.length);
    const ligacao = { exports: {} };
    const codigoLanding = funcoes.map(n => n.getText(fonteLanding)).join('\n') + '\nexports.href = comAtribuicao; exports.abrir = abrirCompraMarketing;';
    vm.runInNewContext(ts.transpileModule(codigoLanding, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module: ligacao, exports: ligacao.exports, window: janela,
      atribuirCampanha: consent.exports.atribuirCampanha,
      consentimentoMarketingAtual: consent.exports.consentimentoMarketingAtual,
      hrefCompra: () => 'https://pay.cakto.com.br/oferta', hrefCompraAnual: () => 'https://pay.cakto.com.br/anual',
      registrarCheckoutMarketing: () => {}, // Adaptador local, sem Pixel/rede.
    });
    ligacao.exports.abrir(false);
    conferir('sem escolha, o clique real não repassa identificadores', destinos.at(-1).search === '');
    consent.exports.salvarConsentimento(janela.localStorage, true);
    conferir('o href copiável continua limpo mesmo após aceitar', ligacao.exports.href('https://pay.cakto.com.br/oferta?gclid=antigo') === 'https://pay.cakto.com.br/oferta');
    ligacao.exports.abrir(true);
    conferir('com aceite, o clique real preserva os identificadores permitidos', destinos.at(-1).searchParams.get('gclid') === 'cliqueGoogle' && destinos.at(-1).searchParams.get('fbclid') === 'cliqueMeta');
    consent.exports.salvarConsentimento(janela.localStorage, false);
    ligacao.exports.abrir(false);
    conferir('após recusar, a navegação continua sem repasse', destinos.at(-1).pathname === '/oferta' && destinos.at(-1).search === '');
  }

  console.log(`\n${total - falhas}/${total} checagens do consentimento de feedback passaram — ${falhas} falhas`);
  if (falhas > 0) process.exit(1);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
