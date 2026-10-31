/*
 * Leitura de avisos do banco, com os módulos reais.
 *
 *   node __tests__/avisos-banco.cjs
 *
 * T2: caixa, parser e decisão não chamam rede.
 * T4: só `gravar.ts` grava, e o toque duplo usa a mesma chave.
 * T5 e regra 20: confirmar crédito, débito e Pix dá o mesmo Livre do manual, e
 * fatura paga não conta.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
let passou = 0;
const ok = (rotulo) => { passou++; console.log('  ok  ' + rotulo); };

/* Carrega o módulo real. Import de fora da lista lança: é assim que um `supabase`
   escondido em caixa ou parser reprova o teste. */
function carregador(dubles) {
  const cache = new Map();
  function carregar(arquivo) {
    if (cache.has(arquivo)) return cache.get(arquivo).exports;
    const m = new Module(arquivo, module);
    cache.set(arquivo, m);
    m.require = (id) => {
      if (id in dubles) return dubles[id];
      if (id.startsWith('.')) return carregar(path.resolve(path.dirname(arquivo), id.endsWith('.ts') ? id : `${id}.ts`));
      throw new Error(`import não simulado em ${path.relative(root, arquivo)}: ${id}`);
    };
    m._compile(ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, arquivo);
    return m.exports;
  }
  return (relativo) => carregar(path.join(root, relativo));
}

function discoFalso() {
  const dados = new Map();
  return {
    dados,
    getItem: async (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: async (k, v) => { dados.set(k, v); },
    removeItem: async (k) => { dados.delete(k); },
  };
}

const AGORA = new Date(2026, 9, 20, 12).getTime();
const NUBANK = 'com.nu.production';
const WALLET = 'com.google.android.apps.walletnfcrel';
const aviso = (id, titulo, texto, extra = {}) => ({ id: id.padEnd(64, '0'), pacote: NUBANK, chave: `k-${id}`, quando: AGORA, titulo, texto, ...extra });

async function main() {
  const disco = discoFalso();
  const diario = { itens: [], ilegiveis: 0, falhar: false };
  const carregar = carregador({
    '@react-native-async-storage/async-storage': { __esModule: true, default: disco },
    '@/modules/grana-avisos': {
      lerDiarioAvisos: async () => {
        if (diario.falhar) throw new Error('disco');
        return { itens: diario.itens, ilegiveis: diario.ilegiveis };
      },
    },
  });
  const caixa = carregar('lib/avisos-banco/caixa.ts');
  const decidir = carregar('lib/avisos-banco/decidir.ts');
  ok('caixa, decidir e interpretar carregam sem supabase nem rede (T2)');

  for (const arquivo of ['caixa', 'decidir', 'interpretar', 'catalogo']) {
    const fonte = fs.readFileSync(path.join(root, `lib/avisos-banco/${arquivo}.ts`), 'utf8');
    assert.ok(!/supabase|fetch\(|offline-cache|['"]\.\.\/data['"]/.test(fonte), `${arquivo} não pode tocar em rede`);
  }
  ok('nenhum dos quatro cita supabase, fetch, data ou offline-cache');

  /* Compra vira item; ler de novo não duplica */
  diario.itens = [aviso('a1', 'Compra aprovada', 'Compra no crédito de R$ 89,90 em Mercado Modelo final 1234')];
  let r = await caixa.sincronizarCaixa('dono-a', AGORA);
  assert.equal(r.itens.length, 1);
  r = await caixa.sincronizarCaixa('dono-a', AGORA);
  assert.equal(r.itens.length, 1);
  ok('compra vira um item, e sincronizar de novo não duplica');

  /* A caixa não guarda título nem texto */
  const guardado = disco.dados.get('grana_avisos_caixa:dono-a');
  assert.ok(!guardado.includes('Compra aprovada') && !guardado.includes('Compra no crédito'));
  ok('caixa sem título nem texto do aviso');

  /* Dono trocado não recebe o item */
  assert.equal((await caixa.listarCaixa('dono-b')).length, 0);
  ok('outro dono não vê o item');

  /* Banco e carteira em até 5 minutos viram um item só */
  diario.itens = [
    aviso('b1', 'Compra aprovada', 'Compra no crédito de R$ 40,00 em Padaria Modelo, final 1234', { quando: AGORA }),
    aviso('b2', 'Padaria', 'R$ 40,00 com Visa ••1234', { pacote: WALLET, quando: AGORA + 120000 }),
  ];
  r = await caixa.sincronizarCaixa('dono-c', AGORA + 130000);
  assert.equal(r.itens.length, 1);
  assert.equal(r.itens[0].forma, 'credit');
  assert.equal(r.itens[0].descricao, 'Padaria Modelo');
  assert.equal(r.itens[0].avisoIds.length, 2);
  ok('banco e carteira em até 5 minutos viram um item, com a melhor descrição');

  /* Par que chega depois de o item ser confirmado não reabre */
  await caixa.removerItemDaCaixa('dono-c', r.itens[0].id);
  diario.itens.push(aviso('b3', 'Padaria', 'R$ 40,00 com Visa ••1234', { pacote: WALLET, chave: 'k-b3', quando: AGORA + 200000 }));
  r = await caixa.sincronizarCaixa('dono-c', AGORA + 210000);
  assert.equal(r.itens.length, 0);
  ok('par que chega depois do item resolvido não reabre');

  /* Mesmo valor fora da janela são duas compras */
  diario.itens = [
    aviso('c1', 'Compra', 'Compra de R$ 10,00 em Banca Modelo', { quando: AGORA }),
    aviso('c2', 'Banca', 'R$ 10,00 com Visa ••1234', { pacote: WALLET, quando: AGORA + 6 * 60000 }),
  ];
  r = await caixa.sincronizarCaixa('dono-d', AGORA + 7 * 60000);
  assert.equal(r.itens.length, 2);
  ok('fora da janela de 5 minutos continuam dois itens');

  /* Fatura paga e recusada não viram item */
  diario.itens = [
    aviso('d1', 'Fatura paga', 'Pagamento da fatura de R$ 500,00 confirmado'),
    aviso('d2', 'Compra recusada', 'Compra de R$ 20,00 recusada'),
  ];
  r = await caixa.sincronizarCaixa('dono-e', AGORA);
  assert.equal(r.itens.length, 0);
  ok('fatura paga e compra recusada não viram item');

  /* Não entendi fica, sem texto na caixa */
  diario.itens = [aviso('e1', 'Atenção', 'Você tem R$ 50,00 esperando por você')];
  r = await caixa.sincronizarCaixa('dono-f', AGORA);
  assert.equal(r.itens[0].tipo, 'nao_entendi');
  assert.ok(!disco.dados.get('grana_avisos_caixa:dono-f').includes('esperando'));
  ok('"Não entendi" vira item e o texto segue só no diário');

  /* Falhas deixam recibo */
  diario.falhar = true;
  await assert.rejects(caixa.sincronizarCaixa('dono-f', AGORA));
  assert.equal((await caixa.listarCaixa('dono-f')).length, 1);
  diario.falhar = false;
  ok('erro no diário rejeita e não apaga a caixa');
  disco.dados.set('grana_avisos_caixa:dono-g', '{quebrado');
  await assert.rejects(caixa.sincronizarCaixa('dono-g', AGORA));
  assert.equal(disco.dados.get('grana_avisos_caixa:dono-g'), '{quebrado');
  ok('caixa ilegível rejeita e não é sobrescrita');

  /* Sair da conta */
  await caixa.limparCaixa('dono-a');
  assert.equal((await caixa.listarCaixa('dono-a')).length, 0);
  ok('limpar a caixa apaga os itens');

  /* Chave estável no formato de UUID */
  const chave = decidir.chaveDoItem('a'.repeat(64));
  assert.match(chave, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(chave, decidir.chaveDoItem('a'.repeat(64)));
  ok('chave derivada estável, em formato de UUID');

  /* Decisões */
  const item = {
    id: 'x', avisoIds: ['x'], pacote: NUBANK, classe: 'banco', quando: AGORA, expiraEm: AGORA + 1, tipo: 'lancamento', data: '2026-10-20',
    direcao: 'out', forma: 'credit', valor: 40, parcelas: null, contraparte: 'Mercado Modelo', descricao: 'Mercado Modelo', digitos: '1234',
  };
  assert.equal(decidir.pareceJaLancado(item, [{ type: 'out', amount: 40, occurred_on: '2026-10-20' }]), true);
  assert.equal(decidir.pareceJaLancado(item, [{ type: 'out', amount: 40, occurred_on: '2026-10-19' }]), false);
  assert.equal(decidir.pareceJaLancado(item, [{ type: 'in', amount: 40, occurred_on: '2026-10-20' }]), false);
  ok('"Parece já lançado" exige mesmo tipo, valor e data');

  assert.equal(decidir.pareceEntreContas({ ...item, forma: 'pix', contraparte: 'José Exemplo' }, 'Jose exemplo'), true);
  assert.equal(decidir.pareceEntreContas({ ...item, forma: 'pix', contraparte: 'Maria' }, 'Jose exemplo'), false);
  ok('Pix com o nome do perfil fica marcado');

  const cartoes = [{ id: 'c1', last_digits: '1234', bank: 'nubank', wallet_id: 'w1' }, { id: 'c2', last_digits: '9999' }];
  assert.equal(decidir.cartaoDoItem(item, cartoes).id, 'c1');
  assert.equal(decidir.cartaoDoItem({ ...item, digitos: null }, cartoes), null);
  assert.equal(decidir.cartaoDoItem(item, [...cartoes, { id: 'c3', last_digits: '1234' }]), null);
  assert.equal(decidir.formaDoItem({ ...item, forma: null }, cartoes), 'credit');
  assert.equal(decidir.formaDoItem({ ...item, forma: null, digitos: null }, cartoes), null);
  ok('cartão só com os 4 dígitos batendo em um único');

  const toque = { forma: 'credit', categoria: 'Alimentação', carteiraId: 'w1', cartaoId: 'c1', jaLancado: false, entreContas: false };
  assert.equal(decidir.confirmaEmUmToque(item, toque), true);
  for (const [rotulo, i, c] of [
    ['sem categoria', item, { categoria: null }],
    ['crédito sem cartão', item, { cartaoId: null }],
    ['sem forma', item, { forma: null }],
    ['boleto', item, { forma: 'boleto' }],
    ['já lançado', item, { jaLancado: true }],
    ['entre contas', item, { entreContas: true }],
    ['sem carteira', item, { carteiraId: null }],
    ['parcelada', { ...item, parcelas: 3 }, {}],
    ['sem descrição', { ...item, descricao: null }, {}],
    ['não entendi', { ...item, tipo: 'nao_entendi' }, {}],
  ]) {
    assert.equal(decidir.confirmaEmUmToque(i, { ...toque, ...c }), false, rotulo);
  }
  ok('sem categoria, parcelada, boleto e dúvidas sempre abrem a revisão');

  assert.equal(decidir.categoriaDoItem({ ...item, descricao: 'Lugar Inventado Xyz' }, [], []), null);
  assert.equal(decidir.categoriaDoItem({ ...item, direcao: 'in' }, [], []), null);
  assert.equal(decidir.categoriaDoItem(item, [], []).name, 'Alimentação');
  assert.equal(decidir.categoriaDoItem({ ...item, descricao: 'Bar da Esquina' }, [{ chave: 'categoria:esquina', valor: 'Lazer' }], []).name, 'Lazer');
  ok('categoria nunca assume padrão, e apelido vence');

  /* T4: gravar.ts passa a chave e só remove o item depois de gravar */
  const chamadas = [];
  let falharSalvar = false;
  const carregarGravar = carregador({
    '@react-native-async-storage/async-storage': { __esModule: true, default: disco },
    '@/modules/grana-avisos': { lerDiarioAvisos: async () => ({ itens: [], ilegiveis: 0 }) },
    '../data': { payBill: async (conta, data) => { chamadas.push(['payBill', conta.id, data]); return conta; } },
    '../offline-cache': {
      salvarOuGuardarNoAparelho: async (entrada, c) => {
        if (falharSalvar) throw new Error('recusado');
        chamadas.push(['salvar', entrada, c]);
        return { guardado: false };
      },
      salvarOuGuardarParceladaNoAparelho: async (entrada, c) => { chamadas.push(['parcelada', entrada, c]); return { guardado: true }; },
    },
  });
  const gravar = carregarGravar('lib/avisos-banco/gravar.ts');
  const caixaG = carregarGravar('lib/avisos-banco/caixa.ts');
  const decG = carregarGravar('lib/avisos-banco/decidir.ts');
  const preparar = async (itens) => disco.setItem('grana_avisos_caixa:dono-h', JSON.stringify({ itens, vistos: {} }));

  await preparar([item]);
  const entrada = decG.montarEntrada({
    type: 'out', description: 'Mercado Modelo', amount: 40, category: 'Alimentação', color: '#000', occurred_on: '2026-10-20',
    forma: 'credit', wallet_id: 'w1', cartao: cartoes[0],
  });
  falharSalvar = true;
  await assert.rejects(gravar.gravarItem('dono-h', item, entrada));
  assert.equal((await caixaG.listarCaixa('dono-h')).length, 1);
  ok('recusa ao gravar mantém o item na lista');
  falharSalvar = false;
  await gravar.gravarItem('dono-h', item, entrada);
  await gravar.gravarItem('dono-h', item, entrada);
  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[0][2], chamadas[1][2]);
  assert.equal(chamadas[0][2], decG.chaveDoItem(item.id));
  assert.equal((await caixaG.listarCaixa('dono-h')).length, 0);
  ok('toque duplo manda a mesma chave, e o item sai depois de gravar');

  chamadas.length = 0;
  await gravar.gravarItem('dono-h', item, { ...entrada, installments: 3, amount: 300 });
  assert.equal(chamadas[0][0], 'parcelada');
  assert.equal(chamadas[0][1].amount, 300);
  ok('parcelada vai pelo caminho de parcelas, com o total');

  /* Boleto casado paga a conta e não lança saída */
  chamadas.length = 0;
  await preparar([{ ...item, forma: 'boleto' }]);
  await gravar.pagarContaDoItem('dono-h', { ...item, forma: 'boleto' }, { id: 'conta-1' });
  assert.deepEqual(chamadas, [['payBill', 'conta-1', '2026-10-20']]);
  ok('boleto casado só paga a conta: sem saída nova');

  /* T5 e regra 20: mesmo Livre do lançamento manual */
  const seguro = carregador({})('lib/safe-to-spend.ts');
  const hoje = new Date(2026, 9, 20, 12);
  const base = [{ type: 'in', amount: 5000, occurred_on: '2026-10-05', payment_method: 'pix', card_id: null }];
  const montar = (forma, cartao) => decidir.montarEntrada({
    type: 'out', description: 'Mercado Modelo', amount: 750, category: 'Alimentação', color: '#000', occurred_on: '2026-10-20',
    forma, wallet_id: 'w1', cartao,
  });
  const livreCom = (t) => seguro.calcularSafeToSpend([...base, ...(t ? [t] : [])], [], hoje);
  const manuais = {
    credit: { type: 'out', amount: 750, occurred_on: '2026-10-20', payment_method: 'credit', card_id: 'c1' },
    debit: { type: 'out', amount: 750, occurred_on: '2026-10-20', payment_method: 'debit', card_id: null },
    pix: { type: 'out', amount: 750, occurred_on: '2026-10-20', payment_method: 'pix', card_id: null },
  };
  for (const forma of ['credit', 'debit', 'pix']) {
    const e = montar(forma, forma === 'credit' ? cartoes[0] : null);
    assert.equal(e.payment_method, forma);
    const doAviso = livreCom({ type: e.type, amount: e.amount, occurred_on: e.occurred_on, payment_method: e.payment_method, card_id: e.card_id ?? null });
    assert.deepEqual(doAviso, livreCom(manuais[forma]), forma);
    assert.ok(doAviso.livreTotal < livreCom(null).livreTotal || forma === 'credit', forma);
  }
  ok('crédito, débito e Pix confirmados dão o mesmo Livre do manual');

  /* Pix recebido entra no saldo igual a uma entrada manual */
  const entradaPix = decidir.montarEntrada({
    type: 'in', description: 'Ana', amount: 100, category: 'Outros', color: '#000', occurred_on: '2026-10-20', forma: 'pix', wallet_id: 'w1',
  });
  assert.equal(livreCom({ type: 'in', amount: 100, occurred_on: '2026-10-20', payment_method: entradaPix.payment_method, card_id: null }).saldoAtual, 5100);
  ok('Pix recebido soma no saldo do mês');

  /* Fatura paga não vira lançamento, então o Livre não muda */
  diario.itens = [aviso('f1', 'Fatura paga', 'Pagamento da fatura de R$ 750,00 confirmado')];
  r = await caixa.sincronizarCaixa('dono-i', AGORA);
  assert.equal(r.itens.length, 0);
  assert.deepEqual(livreCom(null), seguro.calcularSafeToSpend(base, [], hoje));
  ok('fatura paga não conta no Livre');

  /* Boleto sem conta casada é saída de caixa uma vez só */
  const boleto = decidir.montarEntrada({
    type: 'out', description: 'Energia', amount: 210, category: 'Casa', color: '#000', occurred_on: '2026-10-20', forma: 'boleto', wallet_id: 'w1',
  });
  assert.equal(boleto.payment_method, 'debit');
  ok('boleto sem conta casada entra como saída de caixa');

  /* Sair da conta chama a limpeza, sem depender de haver dono */
  const { sairDaConta } = carregador({})('lib/sair-da-conta.ts');
  const limpos = [];
  await sairDaConta({
    idDoUsuario: async () => null,
    limparVozesDaConta: async () => {},
    limparAvisosDoBanco: async (u) => { limpos.push(u); },
    limparWidgets: () => {},
    esquecerAcesso: async () => {}, esquecerTelas: async () => {}, esquecerLancamentosLocais: async () => {},
    removerPush: async () => {}, signOutNoServidor: async () => {}, esquecerSessaoDoDisco: async () => {}, aplicarSaida: () => {},
  }, 50);
  assert.deepEqual(limpos, [null]);
  ok('sair da conta limpa os avisos');

  /* Travas do módulo nativo, lidas nos fontes reais */
  const nativo = (a) => fs.readFileSync(path.join(root, 'modules/grana-avisos/android/src/main', a), 'utf8');
  const listener = nativo('java/com/gabriouss/grana/avisos/GranaAvisosListener.kt');
  const manifesto = nativo('AndroidManifest.xml');
  assert.match(manifesto, /BIND_NOTIFICATION_LISTENER_SERVICE/);
  assert.match(manifesto, /disabled_filter_types[\s\S]*conversations\|ongoing/);
  assert.ok(listener.indexOf('AvisosFiltro.decidir') < listener.indexOf('EXTRA_TITLE'), 'filtro antes de abrir o texto');
  assert.ok(listener.indexOf('Destino.CONTAR') < listener.indexOf('EXTRA_TITLE'), 'contagem antes de abrir o texto');
  assert.ok(!/Log\.[a-z]+\([^)]*(titulo|texto)/.test(listener), 'título e texto nunca no logcat');
  assert.match(listener, /requestRebind/);
  assert.ok(!/INTERNET/.test(manifesto));
  ok('manifesto e ordem do serviço conferidos nos fontes');

  /* Webhook ignora só o perfil development: é ele que não avisa ninguém */
  const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8')).build;
  assert.equal(eas.development.developmentClient, undefined);
  assert.equal(eas.development.distribution, 'internal');
  assert.equal(eas.development.autoIncrement, true);
  assert.equal(eas.development.android.buildType, 'apk');
  assert.deepEqual(eas.development.env, eas.preview.env);
  assert.match(fs.readFileSync(path.join(root, 'supabase/functions/eas-build-webhook/index.ts'), 'utf8'), /buildProfile !== 'development'/);
  ok('perfil development gera APK e o webhook o ignora');

  /* Textos sem pedir para contornar a proteção do Android (T6) */
  const secao = fs.readFileSync(path.join(root, 'components/AvisosBancoSecao.tsx'), 'utf8');
  assert.ok(!/Play Protect|\bADB\b|\badb\b/.test(secao));
  assert.match(secao, /Permitir configurações restritas/);
  ok('nenhum texto cita Play Protect ou ADB');

  /* A5: a caixa guarda nome e valor derivados do aviso, então nada de backup do Android */
  const expo = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  assert.equal(expo.android.allowBackup, false);
  assert.equal(expo.version, '1.10.12');
  assert.equal(expo.android.package, 'com.gabriouss.grana');
  ok('app.json sem backup do Android, com a mesma versão e o mesmo pacote');

  await retomadaSemDuplicar();

  console.log(`\navisos-banco: ${passou} ok`);
}

/* A4, com gravar, caixa, offline-cache, fila-pendente e data reais. Só rede, disco
   e sessão são dublês. `novoProcesso` recarrega os módulos: o que sobrevive é só
   o que está no disco, como depois de o Android matar o app. */
async function retomadaSemDuplicar() {
  const DONO = 'dono-r';
  const estado = { rede: true, falhas: new Set() };
  const disco = new Map();
  const banco = [];
  const parceladas = [];
  const AsyncStorage = {
    getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
    setItem: async (k, v) => {
      if (estado.falhas.has(k)) throw new Error('disco');
      disco.set(k, v);
    },
    removeItem: async (k) => { disco.delete(k); },
    multiRemove: async (ks) => { ks.forEach((k) => disco.delete(k)); },
    getAllKeys: async () => [...disco.keys()],
  };
  const semRede = () => ({ data: null, error: { message: 'TypeError: Network request failed', code: '' } });
  function consulta() {
    const q = { filtros: [], linha: null };
    for (const m of ['select', 'order', 'range', 'setHeader', 'single']) q[m] = () => q;
    q.eq = (c, v) => { q.filtros.push((t) => t[c] === v); return q; };
    q.upsert = (linha) => { q.linha = linha; return q; };
    q.then = (res, rej) => (async () => {
      if (!estado.rede) return semRede();
      if (!q.linha) return { data: banco.find((t) => q.filtros.every((f) => f(t))), error: null };
      if (banco.some((t) => t.client_request_id === q.linha.client_request_id)) return { data: [], error: null };
      const gravada = { id: `tx-${banco.length + 1}`, ...q.linha };
      banco.push(gravada);
      return { data: [gravada], error: null };
    })().then(res, rej);
    return q;
  }
  const supabase = {
    from: () => consulta(),
    rpc: async (_nome, args) => {
      if (!estado.rede) return semRede();
      if (!parceladas.includes(args.p_client_request_id)) parceladas.push(args.p_client_request_id);
      return { data: [], error: null };
    },
  };
  const dubles = {
    '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
    '@/modules/grana-avisos': { lerDiarioAvisos: async () => ({ itens: [], ilegiveis: 0 }) },
    './supabase': { supabase },
    './sessao-offline': { sessaoEstaTravada: () => false, idDoUsuarioLocal: async () => DONO, lerSessaoDoDisco: async () => ({ user: { id: DONO }, access_token: 'AUDIT-local' }) },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './goals': { createGoal: async (input) => input },
    './recorrencia': {},
    './notifications': { getNotifications: () => null },
  };
  function novoProcesso() {
    const cache = new Map();
    function carregar(arquivo) {
      if (cache.has(arquivo)) return cache.get(arquivo);
      const exports = {};
      cache.set(arquivo, exports);
      vm.runInNewContext(ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      }).outputText, {
        exports, console: { ...console, error() {}, warn() {} }, JSON, Date, String, Object, Array, Error, TypeError, Promise, RegExp, Number, Math, Set, Map, Intl,
        Uint8Array, crypto: globalThis.crypto, setTimeout: () => ({ unref() {} }), clearTimeout() {}, __DEV__: false,
        require: (id) => {
          if (id in dubles) return dubles[id];
          if (id.startsWith('.')) {
            const alvo = path.resolve(path.dirname(arquivo), `${id}.ts`);
            if (fs.existsSync(alvo)) return carregar(alvo);
          }
          throw new Error(`import não simulado em ${path.relative(root, arquivo)}: ${id}`);
        },
      }, { filename: arquivo });
      return exports;
    }
    const em = (f) => carregar(path.join(root, f));
    return { gravar: em('lib/avisos-banco/gravar.ts'), caixa: em('lib/avisos-banco/caixa.ts'), oferta: em('lib/offline-cache.ts') };
  }

  const CAIXA = `grana_avisos_caixa:${DONO}`;
  const MARCAS = `grana_avisos_gravados:${DONO}`;
  const FILA = 'grana:queue:transactions-pendentes';
  const item = { id: 'a'.repeat(64), avisoIds: ['a'.repeat(64)], pacote: NUBANK, classe: 'banco', quando: AGORA, expiraEm: AGORA + 1e12, tipo: 'lancamento', data: '2026-10-20', direcao: 'out', forma: 'debit', valor: 40 };
  const base = { type: 'out', description: 'Mercado Modelo', category: 'Alimentação', color: '#000', occurred_on: '2026-10-20', recurring: false, wallet_id: 'w1' };
  const simples = { ...base, amount: 40, payment_method: 'debit' };
  const parcelada = { ...base, amount: 300, payment_method: 'credit', card_id: 'c1', bank: 'nubank', installments: 3 };
  const preparar = () => {
    disco.clear(); banco.length = 0; parceladas.length = 0; estado.falhas.clear(); estado.rede = true;
    disco.set(CAIXA, JSON.stringify({ itens: [item], vistos: {} }));
  };
  const fila = () => JSON.parse(disco.get(FILA) ?? '[]');
  const soma = async (p) => ((await p.oferta.getCachedTransactions()) ?? []).reduce((t, l) => t + l.amount, 0);
  const naCaixa = () => JSON.parse(disco.get(CAIXA)).itens.length;

  for (const [nome, entrada, total] of [['simples', simples, 40], ['parcelada', parcelada, 300]]) {
    /* O caso do Watchtower: sem rede, vai à fila, e só a remoção da caixa falha */
    preparar();
    let p = novoProcesso();
    estado.rede = false;
    estado.falhas.add(CAIXA);
    await assert.rejects(p.gravar.gravarItem(DONO, item, entrada));
    assert.equal(fila().length, 1);
    assert.equal(naCaixa(), 1);
    estado.falhas.clear();
    assert.equal((await p.gravar.gravarItem(DONO, item, entrada)).guardado, true);
    assert.equal(fila().length, 1, `${nome}: um só na fila`);
    assert.ok(Math.abs(await soma(p) - total) < 0.001, `${nome}: soma otimista`);
    assert.equal(naCaixa(), 0);
    ok(`${nome} sem rede: retomada no mesmo processo deixa 1 na fila e o valor certo`);

    /* O mesmo, com o app morto entre as duas chamadas */
    preparar();
    p = novoProcesso();
    estado.rede = false;
    estado.falhas.add(CAIXA);
    await assert.rejects(p.gravar.gravarItem(DONO, item, entrada));
    estado.falhas.clear();
    p = novoProcesso();
    assert.equal((await p.gravar.gravarItem(DONO, item, entrada)).guardado, true);
    assert.equal(fila().length, 1);
    assert.ok(Math.abs(await soma(p) - total) < 0.001);
    assert.equal(naCaixa(), 0);
    ok(`${nome} sem rede: retomada depois de o app morrer também`);

    /* Nem a marca coube no disco: quem segura é a própria fila */
    preparar();
    p = novoProcesso();
    estado.rede = false;
    estado.falhas.add(CAIXA);
    estado.falhas.add(MARCAS);
    await assert.rejects(p.gravar.gravarItem(DONO, item, entrada));
    estado.falhas.clear();
    p = novoProcesso();
    await p.gravar.gravarItem(DONO, item, entrada);
    assert.equal(fila().length, 1);
    assert.ok(Math.abs(await soma(p) - total) < 0.001);
    ok(`${nome} sem rede e sem marca: a fila não aceita a mesma chave duas vezes`);

    /* Com rede a gravação funcionou e só a remoção falhou. A rede cai antes da retomada. */
    preparar();
    p = novoProcesso();
    estado.falhas.add(CAIXA);
    await assert.rejects(p.gravar.gravarItem(DONO, item, entrada));
    estado.falhas.clear();
    estado.rede = false;
    p = novoProcesso();
    assert.equal((await p.gravar.gravarItem(DONO, item, entrada)).guardado, false);
    assert.equal(fila().length, 0, `${nome}: nada na fila`);
    assert.equal(await soma(p), 0, `${nome}: nada otimista em cache`);
    assert.equal(naCaixa(), 0);
    assert.equal(disco.get(MARCAS), '{}');
    ok(`${nome} com rede: gravou, a remoção falhou e a retomada não põe cópia no cache`);

    /* A mesma coisa quando nem a marca coube no disco, no mesmo processo */
    preparar();
    p = novoProcesso();
    estado.falhas.add(CAIXA);
    estado.falhas.add(MARCAS);
    await assert.rejects(p.gravar.gravarItem(DONO, item, entrada));
    estado.falhas.clear();
    estado.rede = false;
    await p.gravar.gravarItem(DONO, item, entrada);
    assert.equal(fila().length, 0);
    assert.equal(await soma(p), 0);
    ok(`${nome} com rede e disco ruim: a memória do processo evita a cópia`);
  }

  /* Sem a chave da origem, tudo segue como sempre: duas chamadas, dois lançamentos */
  preparar();
  const p = novoProcesso();
  estado.rede = false;
  await p.oferta.salvarOuGuardarNoAparelho(simples);
  await p.oferta.salvarOuGuardarNoAparelho(simples);
  assert.equal(fila().length, 2);
  ok('sem a chave da origem, cada salvar continua sendo um lançamento');

  /* Sair da conta leva as marcas junto */
  disco.set(MARCAS, '{"x":true}');
  await p.caixa.limparCaixa(DONO);
  assert.equal(disco.has(MARCAS), false);
  ok('limpar a caixa apaga as marcas');
}

main().catch((e) => { console.error(e); process.exit(1); });
