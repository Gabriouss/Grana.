/* Achado N1 (Sentinel, confirmado em 26/09/2026 na limpeza final da conta de
 * teste): 3 cartões "AUDIT C1..." existiam de verdade no banco, mas nunca
 * apareceram na tela do app em nenhuma sessão de QA.
 *
 *   node __tests__/credito-cartao-invisivel-n1.cjs
 *
 * Mecanismo confirmado por LEITURA e por este teste (parte 1, módulos reais):
 * `fetchCreditCards`/`fetchCategories` (`lib/data.ts`, via `referenciaLocal`)
 * e `fetchWallets` (`lib/wallets.ts`, cópia própria do mesmo padrão) capturam
 * erro de rede e devolvem o disco ANTIGO sem relançar. Como essas funções são
 * o `buscar` que `comCacheOffline` recebe, uma falha rápida de rede (comum:
 * elevador, túnel, handoff de torre) some ANTES do prazo de 4s de
 * `comCacheOffline` — ele nunca vê o erro, trata a resposta como sucesso
 * fresco, GRAVA o disco velho por cima do seu próprio cache e liga o modo
 * "online". Nenhum aviso, nenhuma "atualização pendente", nenhuma
 * recuperação (`avisarDadoNovo` nunca dispara porque, do ponto de vista do
 * `comCacheOffline`, nada falhou).
 *
 * CAUSA RAIZ CORRIGIDA em 26/09/2026 (aprovada pelo maestro): o fallback de
 * dentro saiu (`referenciaLocal` e a cópia em `wallets.ts`), e as escritas do
 * próprio aparelho atualizam o disco da tela (`atualizarTelaGuardada`). A
 * parte 1 deixou de reproduzir o defeito e passou a trancar o certo: o cartão
 * criado aparece mesmo com um soluço de rede logo depois, e a faixa acende.
 * `__tests__/voz-carteiras-offline.cjs` passou a rodar o `cache-de-tela.ts`
 * real, com as mesmas asserções de antes.
 *
 * O que ESTA rodada corrigiu (parte 2, checagem de fonte): os três lugares
 * onde `app/(app)/credito.tsx` mutava um cartão e confiava num
 * `fetchCreditCards()` novo pra refletir a mudança — exatamente o ponto em
 * que a corrida acima vira sintoma visível (cartão criado que nunca aparece,
 * levando a pessoa a tentar de novo — as 3 linhas "AUDIT C1..." do achado).
 * Agora as três usam a própria linha que o `insert`/`update`/`delete`
 * confirmou, sem depender de uma nova busca.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

let passou = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };

/* ── Parte 1: o mecanismo é real (módulos reais, banco/disco simulados) ── */
(function mecanismoReal() {
  const estado = { rede: true, usuario: 'u-1' };
  const banco = [];
  const disco = new Map();
  const AsyncStorage = {
    getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
    setItem: async (k, v) => { disco.set(k, v); },
    removeItem: async (k) => { disco.delete(k); },
    multiRemove: async (ks) => { ks.forEach((k) => disco.delete(k)); },
    getAllKeys: async () => [...disco.keys()],
  };
  const semRede = () => ({ data: null, error: { message: 'TypeError: Network request failed', code: '' } });
  function consulta() {
    const q = { filtros: [], insercao: null, unico: false };
    for (const m of ['select', 'order']) q[m] = () => q;
    q.eq = (c, v) => { q.filtros.push((t) => t[c] === v); return q; };
    q.insert = (linha) => { q.insercao = linha; return q; };
    q.single = () => { q.unico = true; return q; };
    q.update = (mudanca) => { q.mudanca = mudanca; return q; };
    q.delete = () => { q.apagar = true; return q; };
    q.then = (res, rej) => Promise.resolve().then(() => {
      if (!estado.rede) return semRede();
      if (q.mudanca || q.apagar) {
        const alvo = banco.filter((t) => q.filtros.every((f) => f(t)));
        if (q.apagar) { alvo.forEach((t) => banco.splice(banco.indexOf(t), 1)); return { data: null, error: null }; }
        alvo.forEach((t) => Object.assign(t, q.mudanca));
        return { data: alvo[0] ?? null, error: null };
      }
      if (q.insercao) {
        const linha = { id: `db-${banco.length + 1}`, created_at: new Date().toISOString(), ...q.insercao };
        banco.push(linha);
        return { data: linha, error: null };
      }
      const linhas = banco.filter((t) => q.filtros.every((f) => f(t)));
      return { data: linhas, error: null };
    }).then(res, rej);
    return q;
  }
  const supabase = { from: () => consulta(), rpc: async () => (estado.rede ? { data: [], error: null } : semRede()) };
  const dubles = {
    '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
    './supabase': { supabase },
    './sessao-offline': { idDoUsuarioLocal: async () => estado.usuario },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './goals': { createGoal: async () => {} },
    './recorrencia': {},
    './fila-pendente': { juntarPendentes: async (lista) => lista, entradasPendentesPorCarteira: async () => [] },
  };
  const cache = new Map();
  function carregar(arquivo) {
    const abs = path.join(root, arquivo);
    if (cache.has(abs)) return cache.get(abs);
    const exports = {};
    cache.set(abs, exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, {
      exports, console, JSON, Date, String, Object, Array, Error, TypeError, Promise, RegExp, Number, Math, Set, Map, Intl,
      setTimeout, clearTimeout, __DEV__: false,
      require: (id) => {
        if (id in dubles) return dubles[id];
        if (id.startsWith('./')) {
          const alvo = path.join(path.dirname(arquivo), id.slice(2) + '.ts');
          if (fs.existsSync(path.join(root, alvo))) return carregar(alvo);
        }
        throw new Error(`import não simulado em ${arquivo}: ${id}`);
      },
    }, { filename: arquivo });
    return exports;
  }
  const data = carregar('lib/data.ts');

  return (async () => {
    /* Carga inicial com rede: o disco (dos dois níveis, comCacheOffline e
       referenciaLocal) nasce sem nenhum cartão. */
    ok(Array.isArray(await data.fetchCreditCards()), 'primeira carga, com rede, funciona');

    /* Um cartão é criado com sucesso no banco (equivalente ao "AUDIT C1..."
       do achado). Logo em seguida, um soluço de rede rápido — o tipo que
       nunca chega a esperar o prazo de 4s do comCacheOffline. */
    await data.addCreditCard({ name: 'AUDIT C1', bank: 'nubank', color: '#fff', limit_amount: 100, closing_day: 1, due_day: 10 });
    estado.rede = false;
    const listaLogoDepois = await data.fetchCreditCards();
    ok(listaLogoDepois.some((c) => c.name === 'AUDIT C1'),
      'um soluço de rede logo depois do insert devolve a lista COM o cartão recém-criado (disco atualizado pela escrita)');
    const cacheDeTela = carregar('lib/cache-de-tela.ts');
    ok(cacheDeTela.estaServindoDoCache(), 'e a faixa offline acende: o dado do disco não se passa por dado de agora');

    estado.rede = true;
    const chaves = await AsyncStorage.getAllKeys();
    ok(!chaves.some((k) => k.includes('voz:referencia')), 'não existe mais o segundo cache (grana:voz:referencia)');
    const chaveDoCache = chaves.find((k) => k.includes('cartoes'));
    const registro = JSON.parse(await AsyncStorage.getItem(chaveDoCache));
    ok(registro.dados.some((c) => c.name === 'AUDIT C1'), 'o disco da tela tem o cartão criado');

    /* Editar e excluir também acompanham o disco. */
    const criado = registro.dados.find((c) => c.name === 'AUDIT C1');
    await data.updateCreditCard(criado.id, { name: 'AUDIT C1 editado' });
    estado.rede = false;
    ok((await data.fetchCreditCards()).some((c) => c.name === 'AUDIT C1 editado'), 'edição aparece sem rede logo depois');
    estado.rede = true;
    await data.deleteCreditCard(criado.id);
    estado.rede = false;
    ok(!(await data.fetchCreditCards()).some((c) => c.id === criado.id), 'exclusão some sem rede logo depois');
    estado.rede = true;
    await data.fetchCreditCards();
    ok(!cacheDeTela.estaServindoDoCache(), 'com a rede de volta, a faixa apaga');
    console.log('  causa raiz corrigida: o disco acompanha as escritas e a falha de rede aparece');
  })();
})().then(() => {

  /* ── Parte 2: credito.tsx não depende mais de um novo fetch pra refletir
     a própria mutação (criar/editar/excluir cartão) ──────────────────── */
  const tela = fs.readFileSync(path.join(root, 'app/(app)/credito.tsx'), 'utf8');

  const trechoCriar = tela.slice(tela.indexOf('const criado = await addCreditCard('), tela.indexOf('setCards((prev) => [...prev, criado]);') + 60);
  ok(trechoCriar.includes('const criado = await addCreditCard('), 'criação de cartão guarda o retorno do insert');
  ok(trechoCriar.includes('setCards((prev) => [...prev, criado])'), 'criação de cartão soma a linha criada na lista local');
  ok(!trechoCriar.includes('loadData()'), 'criação de cartão não depende de loadData() pra aparecer');

  const trechoEditar = tela.slice(tela.indexOf('const atualizado = await updateCreditCard'), tela.indexOf("triggerToast('Cartão atualizado');") + 40);
  ok(trechoEditar.includes('const atualizado = await updateCreditCard('), 'edição de cartão guarda o retorno do update');
  ok(trechoEditar.includes('setCards((prev) => prev.map((c) => (c.id === editingCardId ? atualizado : c)))'), 'edição de cartão substitui a linha editada na lista local, com o valor do banco');

  const trechoExcluir = tela.slice(tela.indexOf('await deleteCreditCard(card.id);'), tela.indexOf("triggerToast('Cartão removido');") + 40);
  ok(trechoExcluir.includes("setCards((prev) => prev.filter((c) => c.id !== card.id))"), 'exclusão de cartão tira a linha da lista local');
  ok(!trechoExcluir.includes('await loadData()'), 'exclusão de cartão não depende de loadData() pra sumir da lista');

  console.log(`\ncredito-cartao-invisivel-n1: ${passou} checagens OK`);
  process.exit(0);
}).catch((e) => { console.error(e); process.exit(1); });
