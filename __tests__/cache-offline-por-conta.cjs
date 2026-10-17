/*
 * O cache e a fila offline não atravessam contas no mesmo aparelho.
 *
 * Achado A1 da auditoria de segurança de 23/09/2026, o mais grave da rodada, e
 * confirmado no código antes de corrigir: `grana:cache:transactions` e
 * `grana:queue:transactions-pendentes` eram chaves GLOBAIS, sem dono; a
 * leitura não conferia nada; e a saída da conta só limpava
 * `grana:cache:tela:*`. Aparelho compartilhado: A sai, B entra sem rede, abre
 * Lançamentos e vê o dinheiro de A — e, quando a rede volta, um lançamento
 * que A fez offline é gravado NA CONTA DE B, porque `flushPendingQueue` envia
 * com as credenciais de quem estiver logado.
 *
 * O teste roda o MÓDULO REAL (`lib/offline-cache.ts`) num sandbox com
 * AsyncStorage em memória e um `idDoUsuarioLocal` que troca de conta quando o
 * teste manda, que é como se simula o "sair e entrar" sem aparelho.
 *
 * O que fica preso:
 *
 * 1. B não lê o cache de A;
 * 2. `flushPendingQueue` de B NÃO envia o item de A — asserção em QUAIS
 *    chamadas aconteceram, porque aqui o efeito é escrita de dinheiro na conta
 *    errada, não um valor de retorno;
 * 3. o item de A continua na fila, intacto, e sobe quando A volta;
 * 4. a contagem de pendentes é por conta;
 * 5. sair da conta apaga o cache de leitura e PRESERVA a fila;
 * 6. fila gravada pela versão antiga (sem dono) não é descartada.
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
  console.error(`x ${nome}${visto === undefined ? '' : ` — visto: ${JSON.stringify(visto)}`}`);
}

const codigo = ts.transpileModule(fs.readFileSync('lib/offline-cache.ts', 'utf8'), {
  fileName: 'lib/offline-cache.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

const codigoFila = ts.transpileModule(fs.readFileSync('lib/fila-pendente.ts', 'utf8'), {
  fileName: 'lib/fila-pendente.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function montar() {
  const disco = new Map();
  const estado = { usuario: 'conta-A' };
  const enviados = [];

  const AsyncStorage = {
    getItem: async (k) => { const valor = disco.has(k) ? disco.get(k) : null; estado.aoLer?.(k); return valor; },
    setItem: async (k, v) => { disco.set(k, v); estado.aoGravar?.(k); },
    removeItem: async (k) => { disco.delete(k); },
    getAllKeys: async () => [...disco.keys()],
    multiRemove: async (ks) => { ks.forEach((k) => disco.delete(k)); },
  };

  /* A fila mora em lib/fila-pendente.ts desde 24/09/2026: carregada de
     verdade, sobre o mesmo disco e o mesmo dono. */
  const fila = { exports: {} };
  vm.runInNewContext(codigoFila, {
    module: fila, exports: fila.exports, console, Date, JSON, Math, Object, Array, Promise, Error, String, Number, Set,
    require: (nome) => {
      if (nome.includes('async-storage')) return { __esModule: true, default: AsyncStorage };
      if (nome === './sessao-offline') return { sessaoEstaTravada: () => false, idDoUsuarioLocal: async () => estado.usuario };
      throw new Error(`import inesperado na fila: ${nome}`);
    },
  });

  const module = { exports: {} };
  vm.runInNewContext(codigo, {
    module,
    exports: module.exports,
    console,
    Date, JSON, Math, Object, Array, Promise, Error, String, Number,
    setTimeout,
    require: (nome) => {
      if (nome.includes('async-storage')) return { __esModule: true, default: AsyncStorage };
      if (nome === './sessao-offline') return { sessaoEstaTravada: () => false, idDoUsuarioLocal: async () => estado.usuario };
      if (nome === './data') {
        return {
          addTransaction: async (input) => { enviados.push({ como: estado.usuario, input }); estado.aposEnvio?.(); },
          addBill: async (input) => { enviados.push({ como: estado.usuario, input }); estado.aposEnvio?.(); },
        };
      }
      if (nome === './notifications') return { getNotifications: () => ({scheduleNotificationAsync: async () => {}}) };
      if (nome === './goals') return { createGoal: async (input) => { enviados.push({ como: estado.usuario, input }); estado.aposEnvio?.(); } };
      if (nome === './lancamentos-alterados') return { marcarLancamentosAlterados() {} };
      if (nome === './fila-pendente') return fila.exports;
      if (nome === './cache-de-tela') {
        return {
          guardarTela: async () => {},
          lerTela: async () => null,
          isLikelyNetworkError: () => true,
          avisarDadoNovo() {},
        };
      }
      throw new Error(`import inesperado: ${nome}`);
    },
  });

  return { api: module.exports, estado, enviados, disco };
}

const LANCAMENTO = (descricao) => ({
  type: 'expense',
  description: descricao,
  amount: 10,
  category: 'Alimentação',
  color: '#fff',
  occurred_on: '2026-09-23',
});

(async () => {
  /* -- 1 a 4. Duas contas no mesmo aparelho ---------------------------- */
  {
    const { api, estado, enviados } = montar();

    await api.setCachedTransactions([{ id: 'da-conta-A', amount: 999 }]);
    await api.queuePendingTransaction(LANCAMENTO('AUDIT cafe da conta A'));

    conferir('A lê o próprio cache', (await api.getCachedTransactions())?.some((t) => t.id === 'da-conta-A'));
    conferir('A vê o próprio pendente', (await api.getPendingCount()) === 1, await api.getPendingCount());

    estado.usuario = 'conta-B';

    const cacheVistoPorB = await api.getCachedTransactions();
    conferir('B NAO le o cache de A', cacheVistoPorB === null, cacheVistoPorB);
    conferir('B nao conta o pendente de A', (await api.getPendingCount()) === 0, await api.getPendingCount());

    const resultado = await api.flushPendingQueue();
    conferir('o flush de B nao envia nada', enviados.length === 0, enviados);
    conferir('e nao mente dizendo que sincronizou', resultado.synced === 0, resultado);

    estado.usuario = 'conta-A';
    conferir('o pendente de A continua la, intacto', (await api.getPendingCount()) === 1, await api.getPendingCount());
    const voltou = await api.flushPendingQueue();
    conferir('e sobe quando A volta', voltou.synced === 1 && enviados.length === 1, { voltou, enviados: enviados.length });
    conferir('gravado COMO A, nunca como B', enviados.every((e) => e.como === 'conta-A'), enviados.map((e) => e.como));
  }

  /* -- 5. Sair da conta ------------------------------------------------- */
  {
    const { api, disco } = montar();
    await api.setCachedTransactions([{ id: 'da-conta-A' }]);
    await api.queuePendingTransaction(LANCAMENTO('AUDIT ainda nao subiu'));

    await api.esquecerLancamentosLocais();
    conferir('sair apaga o cache de leitura', (await api.getCachedTransactions()) === null);
    conferir(
      'e PRESERVA a fila, que e dinheiro que a pessoa registrou',
      (await api.getPendingCount()) === 1,
      await api.getPendingCount()
    );
    conferir('a chave do cache some do disco', ![...disco.keys()].some(k => k.startsWith('grana:cache:transactions')), [...disco.keys()]);
  }

  /* -- 6. Compatibilidade com o que ja esta gravado --------------------- */
  {
    const { api, disco, enviados } = montar();

    /* Fila gravada pela versão anterior: item sem dono. Descartar seria perder
       um lançamento que a pessoa fez no metrô e nunca subiu. */
    disco.set('grana:queue:transactions-pendentes', JSON.stringify([
      { localId: 'local-antigo', tipo: 'transacao', input: LANCAMENTO('AUDIT da versao antiga') },
    ]));
    conferir('item sem dono nao e adotado pela sessao atual', (await api.getPendingCount()) === 0, await api.getPendingCount());
    const r = await api.flushPendingQueue();
    conferir('item sem dono nao e enviado', r.synced === 0 && enviados.length === 0, { r, enviados: enviados.length });

    conferir('item sem dono preservado para recuperacao', JSON.parse(disco.get('grana:queue:transactions-pendentes')).length === 1);

    /* Cache gravado pela versão anterior: lista crua, sem dono. Aqui o
       descarte é de graça — é cache de leitura, volta na primeira carga. */
    disco.set('grana:cache:transactions', JSON.stringify([{ id: 'formato-antigo' }]));
    conferir('cache no formato antigo e descartado', (await api.getCachedTransactions()) === null);
  }

  // A1, 17/10: troca de conta durante a leitura e durante a rodada.
  {
    const {api,estado,disco,enviados}=montar();
    await api.setCachedTransactions([{id:'cache-A',user_id:'conta-A'}]);
    estado.aoLer=k=>{if(k.startsWith('grana:cache:transactions'))estado.usuario='conta-B'};
    conferir('troca durante getItem nao devolve cache de A a B',await api.getCachedTransactions()===null);
    estado.aoLer=null;
    await api.setCachedTransactions([{id:'resposta-atrasada-A',user_id:'conta-A'}]);
    conferir('resposta tardia de A nao vira cache de B',await api.getCachedTransactions()===null);
    estado.usuario='conta-A';
    await api.queuePendingTransaction(LANCAMENTO('AUDIT primeiro A'));
    await api.queuePendingTransaction(LANCAMENTO('AUDIT segundo A'));
    estado.aposEnvio=()=>{estado.usuario='conta-B'};
    await api.flushPendingQueue();
    conferir('troca durante a rodada impede segundo envio',enviados.length===1&&enviados[0].como==='conta-A');
    conferir('segundo item continua guardado com dono A',JSON.parse(disco.get('grana:queue:transactions-pendentes')).length===1);
    estado.aposEnvio=null;
    await api.flushPendingQueue();
    conferir('rodada de B nao envia o restante de A',enviados.length===1);
    estado.usuario=null;
    let recusou=false;try{await api.queuePendingTransaction(LANCAMENTO('AUDIT sem conta'))}catch{recusou=true}
    conferir('sem conta nao cria item sem dono',recusou&&JSON.parse(disco.get('grana:queue:transactions-pendentes')).length===1);
    estado.usuario='conta-A';await api.flushPendingQueue();
    conferir('A recupera o proprio restante',enviados.length===2&&enviados.every(x=>x.como==='conta-A'));
  }

  {
    const {api,estado,disco}=montar();
    estado.aoGravar=k=>{if(k==='grana:queue:transactions-pendentes'){estado.usuario='conta-B';estado.aoGravar=null}};
    let aviso=false;try{await api.queuePendingTransaction(LANCAMENTO('AUDIT troca enquanto guarda'))}catch{aviso=true}
    conferir('troca depois da gravacao deixa recibo em vez de devolver dado a B',aviso);
    conferir('otimista de A nao vira cache de B',await api.getCachedTransactions()===null);
    conferir('registro continua na fila de A',JSON.parse(disco.get('grana:queue:transactions-pendentes'))[0].userId==='conta-A');
    disco.set('grana:queue:precisa-de-revisao',JSON.stringify([
      {localId:'A',userId:'conta-A'},{localId:'B',userId:'conta-B'},{localId:'sem-dono'}]));
    conferir('revisao mostra apenas dono B',(await api.listarEmRevisao()).map(x=>x.localId).join(',')==='B');
    conferir('B nao pode retirar revisao de A',await api.tirarDaRevisao('A')===null);
    conferir('B nao adota revisao sem dono',await api.tirarDaRevisao('sem-dono')===null);
  }

  console.log(`\n${total - falhas}/${total} checagens do cache offline por conta passaram — ${falhas} falhas`);
  if (falhas > 0) process.exit(1);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
