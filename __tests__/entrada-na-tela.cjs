/*
 * `useEntradaNaTela` (lib/motion.ts): o conteúdo das encenações da landing
 * nunca fica escondido à espera de um aviso que não chega.
 *
 * Em 17/09/2026 o autor mostrou seções da landing em branco. As encenações
 * nasciam escondidas e só apareciam quando o `IntersectionObserver` avisava;
 * sem aviso, ficavam vazias. O gancho agora nasce no estado final e só
 * esconde quando a PRIMEIRA leitura diz que o bloco está fora da tela.
 *
 * Carrega o módulo real, com React, React Native, janela e observador
 * falsos. O gancho roda uma vez (efeito com dependências vazias), então o
 * dublê de React executa o efeito na hora e guarda o estado num registro.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const codigo = ts.transpileModule(fs.readFileSync('lib/motion.ts', 'utf8'), {
  fileName: 'lib/motion.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

async function montar({ plataforma = 'web', comObservador = true, reduzirNoCss = false, reduzirNoSistema = false } = {}) {
  const estado = [];
  const observadores = [];
  const react = {
    useState: (inicial) => {
      const i = estado.length;
      estado.push(inicial);
      return [inicial, (v) => { estado[i] = v; }];
    },
    useRef: () => ({ current: { nó: true } }),
    useEffect: (fn) => { fn(); },
  };
  class ObservadorFalso {
    constructor(aviso, opcoes) {
      this.aviso = aviso;
      this.opcoes = opcoes;
      this.desligado = false;
      this.observados = [];
      observadores.push(this);
    }
    observe(no) { this.observados.push(no); }
    disconnect() { this.desligado = true; }
    avisar(visivel) { this.aviso([{ isIntersecting: visivel }]); }
  }
  const janela = { matchMedia: () => ({ matches: reduzirNoCss }) };
  const module = { exports: {} };
  const contexto = {
    module,
    exports: module.exports,
    window: janela,
    require: (nome) => {
      if (nome === 'react') return react;
      if (nome === 'react-native') {
        return {
          Platform: { OS: plataforma },
          AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(reduzirNoSistema) },
        };
      }
      throw new Error(`import inesperado: ${nome}`);
    },
  };
  if (comObservador) contexto.IntersectionObserver = ObservadorFalso;
  vm.runInNewContext(codigo, contexto);
  module.exports.useEntradaNaTela('0px 0px 15% 0px');
  await new Promise((r) => setImmediate(r));
  return {
    // Ordem dos `useState` no gancho: `ativo`, depois `instantaneo`.
    ler: () => ({ ativo: estado[0], instantaneo: estado[1] }),
    observador: observadores[0],
    observadores,
  };
}

const casos = [];
const caso = (nome, fn) => casos.push([nome, fn]);

caso('nasce no estado final, antes de qualquer aviso', async () => {
  const t = await montar();
  assert.deepEqual(t.ler(), { ativo: true, instantaneo: true });
  assert.equal(t.observador.observados.length, 1);
  assert.equal(t.observador.opcoes.rootMargin, '0px 0px 15% 0px');
});

caso('aviso que nunca chega deixa o conteúdo visível', async () => {
  const t = await montar();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(t.ler(), { ativo: true, instantaneo: true });
});

caso('fora da tela na primeira leitura: esconde e encena ao entrar', async () => {
  const t = await montar();
  t.observador.avisar(false);
  assert.deepEqual(t.ler(), { ativo: false, instantaneo: false });
  t.observador.avisar(true);
  assert.deepEqual(t.ler(), { ativo: true, instantaneo: false });
  assert.equal(t.observador.desligado, true);
});

caso('já na tela na primeira leitura: nunca esconde', async () => {
  const t = await montar();
  t.observador.avisar(true);
  assert.deepEqual(t.ler(), { ativo: true, instantaneo: true });
  assert.equal(t.observador.desligado, true);
});

caso('só a PRIMEIRA leitura esconde: sair depois de ter aparecido não esconde', async () => {
  const t = await montar();
  t.observador.avisar(false);
  t.observador.avisar(true);
  t.observador.avisar(false);
  assert.deepEqual(t.ler(), { ativo: true, instantaneo: false });
});

caso('movimento reduzido no CSS não cria observador', async () => {
  const t = await montar({ reduzirNoCss: true });
  assert.equal(t.observadores.length, 0);
  assert.deepEqual(t.ler(), { ativo: true, instantaneo: true });
});

caso('movimento reduzido no sistema não cria observador', async () => {
  const t = await montar({ reduzirNoSistema: true });
  assert.equal(t.observadores.length, 0);
  assert.deepEqual(t.ler(), { ativo: true, instantaneo: true });
});

caso('sem IntersectionObserver e no nativo, estado final', async () => {
  const semObs = await montar({ comObservador: false });
  assert.deepEqual(semObs.ler(), { ativo: true, instantaneo: true });
  const nativo = await montar({ plataforma: 'android' });
  assert.equal(nativo.observadores.length, 0);
  assert.deepEqual(nativo.ler(), { ativo: true, instantaneo: true });
});

(async () => {
  for (const [nome, fn] of casos) {
    await fn();
    console.log(`ok - ${nome}`);
  }
  console.log(`entrada-na-tela: ${casos.length} casos passaram`);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
