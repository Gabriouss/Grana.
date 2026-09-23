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
 * O item 1 roda o módulo real num sandbox. Os itens 2 e 3 leem o fonte: a
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

    /* A4 da auditoria de segurança: a política dizia "Não usamos seus dados
       para publicidade" enquanto a landing repassava gclid/fbclid/utm ao
       checkout, com finalidade declarada de Meta CAPI e Google Ads. A frase
       absoluta não pode voltar enquanto o repasse existir. */
    const landing = fs.readFileSync('app/index.tsx', 'utf8');
    const repassaIdentificador = landing.includes("'gclid'") && landing.includes('comAtribuicao(');
    conferir('a landing ainda repassa identificador de anúncio (contexto do próximo item)', repassaIdentificador, repassaIdentificador);
    if (repassaIdentificador) {
      conferir(
        'e a política não volta a negar publicidade de forma absoluta',
        !/Não usamos seus dados para publicidade/.test(politica)
      );
      conferir('ela declara o identificador de clique pelo nome', /gclid/.test(politica) && /fbclid/.test(politica));
      conferir('e diz quem recebe', /Google Ads e Meta/.test(politica));
    }
  }

  console.log(`\n${total - falhas}/${total} checagens do consentimento de feedback passaram — ${falhas} falhas`);
  if (falhas > 0) process.exit(1);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
