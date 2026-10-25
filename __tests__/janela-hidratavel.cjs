/*
 * Medidas da janela na hidratação da landing (A3 da auditoria Leis de UI,
 * 24/10/2026).
 *
 * O HTML de `/` sai do servidor com a landing desenhada. Para a hidratação
 * não divergir, `useJanela` e `useMidia` precisam devolver no servidor (e na
 * hidratação) uma medida FIXA, e a real em qualquer outro desenho. Isso é o
 * contrato do `getServerSnapshot` do `useSyncExternalStore`.
 *
 * Testa o MÓDULO REAL (`lib/janela-hidratavel.ts`), transpilado em memória,
 * com `react` e `react-native` dublês que registram o que o hook pediu.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

function carregar({ os, janela, midia }) {
  const chamadas = [];
  const ouvintesJanela = [];
  const api = {};
  const contexto = {
    exports: api,
    require: (nome) => {
      if (nome === 'react') {
        return {
          useSyncExternalStore: (assinar, atual, servidor) => {
            chamadas.push({ assinar, atual, servidor });
            return atual();
          },
        };
      }
      if (nome === 'react-native') {
        return {
          Platform: { OS: os },
          useWindowDimensions: () => ({ ...janela, origem: 'useWindowDimensions' }),
          Dimensions: {
            get: () => janela,
            addEventListener: (_evento, aviso) => {
              ouvintesJanela.push(aviso);
              return { remove: () => ouvintesJanela.splice(ouvintesJanela.indexOf(aviso), 1) };
            },
          },
        };
      }
      throw new Error('import inesperado: ' + nome);
    },
  };
  if (midia !== undefined) {
    contexto.window = {
      matchMedia: () => ({ matches: midia, addEventListener() {}, removeEventListener() {} }),
    };
  }
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync('lib/janela-hidratavel.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    contexto
  );
  return { api, chamadas, ouvintesJanela };
}

// Web: o desenho normal usa a janela real; servidor e hidratação, a fixa.
{
  const janela = { width: 1440, height: 900, scale: 2, fontScale: 1 };
  const { api, chamadas, ouvintesJanela } = carregar({ os: 'web', janela });
  assert.equal(api.useJanela(), janela, 'fora da hidratação a medida é a real');
  const { servidor, assinar } = chamadas[0];
  // JSON: o objeto nasce dentro do `vm`, noutro realm, e o deepEqual estrito
  // compara o protótipo.
  assert.equal(JSON.stringify(servidor()), JSON.stringify({ width: 390, height: 844, scale: 1, fontScale: 1 }), 'servidor desenha um celular de 390x844');
  assert.equal(servidor(), servidor(), 'o retrato do servidor é estável (mesma referência), senão o React entra em laço');
  assert.equal(chamadas[0].atual(), chamadas[0].atual(), 'o retrato real também é estável entre leituras');
  const parar = assinar(() => {});
  assert.equal(ouvintesJanela.length, 1, 'acompanha a troca de tamanho da janela');
  parar();
  assert.equal(ouvintesJanela.length, 0, 'e solta o ouvinte ao desmontar');
}

// Nativo: sem hidratação, é o useWindowDimensions de sempre.
{
  const { api, chamadas } = carregar({ os: 'android', janela: { width: 411, height: 891, scale: 3, fontScale: 1 } });
  assert.equal(api.useJanela().origem, 'useWindowDimensions', 'nativo continua no useWindowDimensions');
  assert.equal(chamadas.length, 0, 'nativo não passa pelo useSyncExternalStore');
}

// Preferência de mídia: false no servidor e na hidratação, real depois.
{
  const { api, chamadas } = carregar({ os: 'web', janela: { width: 390, height: 844 }, midia: true });
  assert.equal(api.useMidia('(prefers-reduced-motion: reduce)'), true, 'fora da hidratação vale a preferência real');
  assert.equal(chamadas[0].servidor(), false, 'no servidor e na hidratação nasce sem a preferência, como o HTML');
}
{
  // Servidor de verdade: sem `window`.
  const { api } = carregar({ os: 'web', janela: { width: 0, height: 0 } });
  assert.equal(api.useMidia('(prefers-reduced-motion: reduce)'), false, 'sem window não quebra');
}

console.log('OK janela hidratável: medida fixa no servidor e na hidratação, real depois; nativo intacto; preferência de mídia sem divergir do HTML.');
