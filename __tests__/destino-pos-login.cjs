/*
 * Destino pós-login: voltar à tela pedida sem virar laço infinito.
 *
 * Regressão do defeito de 13/09/2026 na web, em TODA tela logada: recarregar
 * /perfil piscava sem fim e disparava, em 9 segundos contra a produção, 557
 * chamadas a vincular_assinatura_automatica, 273 a obter_estado_acesso e 278 a
 * feature_flags. O layout navegava para o destino guardado enquanto o grupo
 * daquela rota ainda estava fechado; o roteador caía, a raiz remontava, a
 * montagem regravava o destino, e recomeçava.
 *
 * Testa o MÓDULO REAL (lib/destino-pos-login.ts), transpilado em memória, com
 * `sessionStorage` e `Platform` dublês. As asserções olham QUAIS efeitos
 * aconteceram (consumiu? navegou?), não só o valor devolvido: o defeito era
 * exatamente um efeito disparado cedo demais.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

function carregar() {
  const loja = new Map();
  const sessionStorage = {
    getItem: (k) => (loja.has(k) ? loja.get(k) : null),
    setItem: (k, v) => void loja.set(k, String(v)),
    removeItem: (k) => void loja.delete(k),
  };
  const janela = { location: { pathname: '/', search: '' } };
  const api = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync('lib/destino-pos-login.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    {
      exports: api,
      sessionStorage,
      window: janela,
      require: (nome) => {
        if (nome !== 'react-native') throw new Error(`import inesperado: ${nome}`);
        return { Platform: { OS: 'web' } };
      },
    }
  );
  return { api, loja, janela };
}

let verificacoes = 0;
const conferir = (...args) => {
  verificacoes += 1;
  assert.equal(...args);
};

// ---- restaurarDestino: as três regras, com o efeito observado ----
{
  const { api } = carregar();
  const espiao = (valor) => {
    const s = { chamadas: 0, fn: () => { s.chamadas += 1; return valor; } };
    return s;
  };

  // Regra 1, a que quebra o laço: área fechada NÃO consome e NÃO navega.
  const fechado = espiao('/perfil');
  conferir(api.restaurarDestino({ areaLogadaAberta: false, caminhoAtual: '/perfil', consumir: fechado.fn }), null, 'área fechada não devolve destino');
  conferir(fechado.chamadas, 0, 'área fechada NÃO consome o destino guardado');

  // Regra 2: destino igual ao caminho atual não navega.
  const mesmo = espiao('/perfil');
  conferir(api.restaurarDestino({ areaLogadaAberta: true, caminhoAtual: '/perfil', consumir: mesmo.fn }), null, 'mesmo caminho não navega');
  conferir(mesmo.chamadas, 1, 'com a área aberta o destino é consumido uma vez');

  const barra = espiao('/credito/');
  conferir(api.restaurarDestino({ areaLogadaAberta: true, caminhoAtual: '/credito', consumir: barra.fn }), null, 'barra final não conta como caminho diferente');

  // Regra 3: destino protegido e diferente é devolvido.
  const outro = espiao('/credito');
  conferir(api.restaurarDestino({ areaLogadaAberta: true, caminhoAtual: '/', consumir: outro.fn }), '/credito', 'destino diferente é restaurado');

  const comBusca = espiao('/lancamentos?mes=2026-09');
  conferir(api.restaurarDestino({ areaLogadaAberta: true, caminhoAtual: '/lancamentos', consumir: comBusca.fn }), '/lancamentos?mes=2026-09', 'parâmetros diferentes ainda restauram');

  // Nada guardado, ou algo que não é rota protegida: não navega.
  conferir(api.restaurarDestino({ areaLogadaAberta: true, caminhoAtual: '/', consumir: espiao(null).fn }), null, 'sem destino guardado não navega');
  conferir(api.restaurarDestino({ areaLogadaAberta: true, caminhoAtual: '/', consumir: espiao('/sign-in').fn }), null, 'rota não protegida nunca é destino');
}

// ---- O laço, reencenado com o módulo real ----
//
// Cada volta do defeito era: a raiz monta e captura a URL; a sessão aparece
// com o acesso ainda fechado; o layout decide navegar; navegar para rota de
// grupo fechado remontava a raiz. Aqui cada navegação disparada conta como
// uma remontagem, e o laço é justamente remontagens se multiplicando.
{
  const { api, janela } = carregar();
  janela.location.pathname = '/perfil';

  let remontagens = 0;
  let navegacoes = 0;
  let voltas = 0;
  const montarRaiz = () => {
    voltas += 1;
    api.capturarDestinoProtegido();
    // Primeiro quadro com sessão: o acesso ainda não chegou.
    for (const areaLogadaAberta of [false, true]) {
      const destino = api.restaurarDestino({
        areaLogadaAberta,
        caminhoAtual: janela.location.pathname + janela.location.search,
        consumir: api.consumirDestinoPosLogin,
      });
      if (destino) {
        navegacoes += 1;
        remontagens += 1;
      }
    }
  };

  montarRaiz();
  while (remontagens > 0 && voltas < 50) {
    remontagens -= 1;
    montarRaiz();
  }
  conferir(voltas, 1, 'recarregar /perfil logado monta a raiz UMA vez, sem remontar em laço');
  conferir(navegacoes, 0, 'e não dispara navegação nenhuma: já está onde queria');
}

// ---- O caminho que o destino existe para servir continua funcionando ----
//
// Deslogado abre /credito, vai ao login, entra, e o app abre em "/" antes do
// acesso chegar. Quando a área abre, precisa voltar para /credito.
{
  const { api, janela } = carregar();
  janela.location.pathname = '/credito';
  conferir(api.capturarDestinoProtegido(), '/credito', 'deslogado em rota protegida guarda o destino');

  janela.location.pathname = '/';
  conferir(
    api.restaurarDestino({ areaLogadaAberta: false, caminhoAtual: '/', consumir: api.consumirDestinoPosLogin }),
    null,
    'logou mas o acesso não chegou: ainda não navega'
  );
  conferir(
    api.restaurarDestino({ areaLogadaAberta: true, caminhoAtual: '/', consumir: api.consumirDestinoPosLogin }),
    '/credito',
    'o destino SOBREVIVEU à espera e é restaurado quando a área abre'
  );
  conferir(
    api.restaurarDestino({ areaLogadaAberta: true, caminhoAtual: '/credito', consumir: api.consumirDestinoPosLogin }),
    null,
    'consumido uma vez só: não repete o desvio depois'
  );
}

console.log(`OK destino pós-login: ${verificacoes} verificações — área fechada não consome, mesmo caminho não navega, recarregar não remonta em laço, e o destino de quem estava deslogado sobrevive até a área abrir.`);
