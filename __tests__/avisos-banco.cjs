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

/** Canal alfa de um PNG RGBA de 8 bits, sem dependência nova. */
function alfaDoPng(arquivo) {
  const png = fs.readFileSync(arquivo);
  const idat = [];
  let largura, altura;
  for (let i = 8; i < png.length;) {
    const tamanho = png.readUInt32BE(i);
    const tipo = png.toString('latin1', i + 4, i + 8);
    const dados = png.subarray(i + 8, i + 8 + tamanho);
    if (tipo === 'IHDR') {
      largura = dados.readUInt32BE(0);
      altura = dados.readUInt32BE(4);
      assert.deepEqual([dados[8], dados[9], dados[12]], [8, 6, 0], `${arquivo}: precisa ser RGBA de 8 bits, sem entrelaçar`);
    }
    if (tipo === 'IDAT') idat.push(dados);
    i += 12 + tamanho;
  }
  const cru = require('node:zlib').inflateSync(Buffer.concat(idat));
  const linha = largura * 4;
  const alfa = new Uint8Array(largura * altura);
  let anterior = Buffer.alloc(linha);
  for (let y = 0; y < altura; y++) {
    const filtro = cru[y * (linha + 1)];
    const atual = Buffer.from(cru.subarray(y * (linha + 1) + 1, (y + 1) * (linha + 1)));
    for (let x = 0; x < linha; x++) {
      const a = x >= 4 ? atual[x - 4] : 0;
      const b = anterior[x];
      const c = x >= 4 ? anterior[x - 4] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const previsto = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filtro];
      atual[x] = (atual[x] + previsto) & 255;
    }
    for (let x = 0; x < largura; x++) alfa[y * largura + x] = atual[x * 4 + 3];
    anterior = atual;
  }
  return { largura, altura, alfa };
}

/** Quantas peças separadas a imagem tem. O G e o ponto são duas. */
function pecasDoDesenho({ largura, altura, alfa }) {
  const visto = new Uint8Array(alfa.length);
  let pecas = 0;
  for (let inicio = 0; inicio < alfa.length; inicio++) {
    if (visto[inicio] || alfa[inicio] < 128) continue;
    const pilha = [inicio];
    visto[inicio] = 1;
    let area = 0;
    while (pilha.length) {
      const i = pilha.pop();
      area++;
      const x = i % largura;
      const vizinhos = [x > 0 ? i - 1 : -1, x < largura - 1 ? i + 1 : -1, i - largura, i + largura];
      for (const v of vizinhos) {
        if (v >= 0 && v < alfa.length && !visto[v] && alfa[v] >= 128) { visto[v] = 1; pilha.push(v); }
      }
    }
    if (area >= alfa.length * 0.001) pecas++;
  }
  return pecas;
}

function conferirSilhueta(arquivo, rotulo) {
  const imagem = alfaDoPng(arquivo);
  const { largura, altura, alfa } = imagem;
  const cantos = [0, largura - 1, (altura - 1) * largura, altura * largura - 1].map((i) => alfa[i]);
  assert.deepEqual(cantos, [0, 0, 0, 0], `${rotulo}: cantos têm de ser transparentes, senão o Android desenha um quadrado`);
  const cheios = alfa.reduce((soma, a) => soma + (a >= 128 ? 1 : 0), 0) / alfa.length;
  assert.ok(cheios > 0.1 && cheios < 0.5, `${rotulo}: forma com ${(cheios * 100).toFixed(1)}% da área`);
  assert.equal(pecasDoDesenho(imagem), 2, `${rotulo}: o G e o ponto, separados`);
}

function testarIconeDaNotificacao() {
  const fonte = fs.readFileSync(path.join(root, 'modules/grana-avisos/android/src/main/java/com/gabriouss/grana/avisos/GranaAvisosListener.kt'), 'utf8');
  assert.deepEqual(fonte.match(/\.setSmallIcon\([^)]*\)+/g), ['.setSmallIcon(iconeDaNotificacao())']);
  const recurso = fonte.indexOf('getIdentifier("notification_icon", "drawable", packageName)');
  const checagem = fonte.indexOf('if (icone != 0) return icone', recurso);
  const registro = fonte.indexOf('Log.w(TAG', checagem);
  const reserva = fonte.indexOf('return applicationInfo.icon', registro);
  assert.ok(recurso >= 0 && checagem > recurso && registro > checagem && reserva > registro, 'recurso monocromático primeiro; ícone do app só como reserva, com log');
  ok('listener usa o recurso monocromático primeiro e o ícone do app só como reserva');

  const plugin = fs.readFileSync(path.join(root, 'node_modules/expo-notifications/plugin/build/withNotificationsAndroid.js'), 'utf8');
  assert.match(plugin, /exports\.NOTIFICATION_ICON = 'notification_icon'/, 'o nome tem de ser o que o plugin gera');
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const declarado = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications')[1].icon;
  conferirSilhueta(path.join(root, declarado), declarado);
  ok('o asset que o plugin usa tem cantos transparentes, o G e o ponto');

  /* android/ é gerada e fica fora do git: sem a pasta, vale só a checagem do asset. */
  const res = path.join(root, 'android/app/src/main/res');
  const densidades = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].filter((d) => fs.existsSync(path.join(res, `drawable-${d}/notification_icon.png`)));
  for (const d of densidades) conferirSilhueta(path.join(res, `drawable-${d}/notification_icon.png`), `notification_icon ${d}`);
  ok(`PNG gerado com a mesma silhueta em ${densidades.length} densidades (0 quando não há android/)`);
}

async function main() {
  testarIconeDaNotificacao();
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

  diario.itens = [aviso('fora', 'Compra', 'Compra de R$ 25,00 em Loja Modelo', { pacote: 'com.whatsapp' })];
  assert.equal((await caixa.sincronizarCaixa('fora-do-catalogo', AGORA)).itens.length, 0);
  const compraLegada = decidir.aplicarAvisos(decidir.CAIXA_VAZIA, diario.itens, AGORA);
  disco.dados.set('grana_avisos_caixa:legado-fora', JSON.stringify(compraLegada));
  assert.equal((await caixa.listarCaixa('legado-fora')).length, 0);
  assert.ok(!disco.dados.get('grana_avisos_caixa:legado-fora').includes('com.whatsapp'));
  ok('caixa real recusa novos avisos de fora e remove pendências/metadados legados de fora');

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
    aviso('b2', 'Padaria Modelo', 'R$ 40,00 com Visa ••1234', { pacote: WALLET, quando: AGORA + 120000 }),
  ];
  r = await caixa.sincronizarCaixa('dono-c', AGORA + 130000);
  assert.equal(r.itens.length, 1);
  assert.equal(r.itens[0].forma, 'credit');
  assert.equal(r.itens[0].descricao, 'Padaria Modelo');
  assert.equal(r.itens[0].avisoIds.length, 1, 'captura nova exclui a carteira');
  const grupoLegado = decidir.aplicarAvisos(decidir.CAIXA_VAZIA, diario.itens, AGORA + 130000);
  assert.equal(grupoLegado.itens[0].avisoIds.length, 2, 'parser legado conserva a deduplicação');
  const idDoLegado = grupoLegado.itens[0].id;
  disco.dados.set('grana_avisos_caixa:legado-misto', JSON.stringify(grupoLegado));
  assert.equal((await caixa.listarCaixa('legado-misto'))[0].id, idDoLegado, 'limpeza não muda chave financeira');
  assert.ok(!disco.dados.get('grana_avisos_caixa:legado-misto').includes(WALLET));
  ok('captura só de banco; grupo legado conserva id financeiro e perde metadados da carteira');

  /* Par que chega depois de o item ser confirmado não reabre */
  await caixa.removerItemDaCaixa('dono-c', r.itens[0].id);
  diario.itens.push(aviso('b3', 'Padaria Modelo', 'R$ 40,00 com Visa ••1234', { pacote: WALLET, chave: 'k-b2', quando: AGORA + 200000 }));
  r = await caixa.sincronizarCaixa('dono-c', AGORA + 210000);
  assert.equal(r.itens.length, 0);
  ok('par que chega depois do item resolvido não reabre');

  /* Mesmo valor fora da janela são duas compras */
  diario.itens = [
    aviso('c1', 'Compra', 'Compra de R$ 10,00 em Banca Modelo', { quando: AGORA }),
    aviso('c2', 'Banca', 'R$ 10,00 com Visa ••1234', { pacote: WALLET, quando: AGORA + 6 * 60000 }),
  ];
  r = await caixa.sincronizarCaixa('dono-d', AGORA + 7 * 60000);
  assert.equal(r.itens.length, 1, 'só o banco entra no runtime novo');
  assert.equal(decidir.aplicarAvisos(decidir.CAIXA_VAZIA, diario.itens, AGORA + 7 * 60000).itens.length, 2);
  ok('parser legado conserva janela de 5 minutos; runtime novo só admite bancos');

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

  /* "Debitamos" responde a forma, e a forma do aviso vence o final do cartão. */
  {
    const interpretar = carregar('lib/avisos-banco/interpretar.ts');
    const doBanco = (id, loja, quando = AGORA) => aviso(id, `Você pagou ${loja}`, 'Debitamos R$ 10,00 da sua conta no cartão final 1234.', { quando });
    const daCarteira = (id, loja, quando = AGORA) => aviso(id, loja, 'R$ 10,00 com Visa ••1234', { pacote: WALLET, quando });
    const itensDe = (...avisos) => decidir.aplicarAvisos(decidir.CAIXA_VAZIA, avisos, AGORA + 5000).itens;

    const lido = interpretar.interpretarAviso(doBanco('deb1', 'Loja Exemplo'));
    assert.equal(lido.tipo, 'lancamento');
    assert.equal(lido.forma, 'debit');
    assert.equal(lido.valor, 10);
    ok('"Você pagou" no título e "Debitamos" no texto dão lançamento em débito');

    for (const ordem of [
      [doBanco('deb2', 'Loja Exemplo'), daCarteira('deb3', 'Loja Exemplo', AGORA + 1000)],
      [daCarteira('deb3', 'Loja Exemplo'), doBanco('deb2', 'Loja Exemplo', AGORA + 1000)],
    ]) {
      const itens = itensDe(...ordem);
      assert.equal(itens.length, 1, 'um item só');
      assert.equal(itens[0].avisoIds.length, 2);
      assert.equal(itens[0].digitos, '1234');
      assert.equal(decidir.cartaoDoItem(itens[0], cartoes).id, 'c1', 'o final bate com um cartão cadastrado');
      assert.equal(decidir.formaDoItem(itens[0], cartoes), 'debit');
    }
    ok('com o final de um cartão cadastrado, nas duas ordens: um item, em débito');

    assert.equal(interpretar.interpretarAviso(aviso('deb4', '', 'Debitamos R$ 10,00 da sua conta.')).tipo, 'nao_entendi');
    ok('"Debitamos" solto continua sem virar lançamento');

    const fatura = aviso('deb5', '', 'Debitamos R$ 10,00 da sua conta referente ao pagamento da fatura');
    assert.equal(interpretar.interpretarAviso(fatura).tipo, 'fatura_paga');
    assert.equal(itensDe(fatura).length, 0);
    ok('"Debitamos" do pagamento da fatura continua sem virar gasto (T5)');

    const apelidos = [{ chave: 'mercado modelo', valor: 'Alimentação' }];
    const contexto = (i) => {
      const forma = decidir.formaDoItem(i, cartoes);
      return { forma, categoria: decidir.categoriaDoItem(i, apelidos)?.name ?? null, carteiraId: 'w1', cartaoId: decidir.cartaoDoItem(i, cartoes)?.id ?? null, jaLancado: false, entreContas: false };
    };
    const [comCategoria] = itensDe(doBanco('deb6', 'Mercado Modelo'), daCarteira('deb7', 'Mercado Modelo', AGORA + 1000));
    assert.equal(contexto(comCategoria).categoria, 'Alimentação');
    assert.equal(decidir.confirmaEmUmToque(comCategoria, contexto(comCategoria)), true);
    const entrada = decidir.montarEntrada({ type: 'out', description: 'Mercado Modelo', amount: 10, category: 'Alimentação', color: '#123456',
      occurred_on: '2026-10-20', forma: decidir.formaDoItem(comCategoria, cartoes), wallet_id: 'w1', cartao: decidir.cartaoDoItem(comCategoria, cartoes) });
    assert.equal(entrada.payment_method, 'debit');
    assert.equal(entrada.card_id ?? null, null, 'débito não vai para a fatura do cartão');
    const [semCategoria] = itensDe(doBanco('deb8', 'Loja Exemplo'), daCarteira('deb9', 'Loja Exemplo', AGORA + 1000));
    assert.equal(contexto(semCategoria).categoria, null);
    assert.equal(decidir.confirmaEmUmToque(semCategoria, contexto(semCategoria)), false);
    ok('um toque com categoria e carteira conhecidas, grava débito sem cartão; sem categoria, revisão');

    /* "Você pagou" no título responde pela loja: sozinho, o aviso do banco já basta. */
    const [sozinho] = itensDe(doBanco('deb10', 'Loja Exemplo'));
    assert.equal(sozinho.forma, 'debit');
    assert.equal(sozinho.descricao, 'Loja Exemplo');
    assert.equal(decidir.confirmaEmUmToque(sozinho, { ...contexto(sozinho), categoria: 'Alimentação' }), true);
    assert.equal(decidir.confirmaEmUmToque(sozinho, { ...contexto(sozinho), categoria: null }), false);
    ok('o aviso do banco sozinho traz a loja do título, em débito, e grava em um toque com categoria');

    /* O mesmo nome nos dois avisos: fica o que não está todo em maiúsculas, nas duas ordens */
    for (const [noBanco, naCarteira, esperado] of [
      ['LOJA EXEMPLO', 'Loja Exemplo', 'Loja Exemplo'],
      ['Loja Exemplo', 'LOJA EXEMPLO', 'Loja Exemplo'],
      ['CAFE MODELO', 'Café Modelo', 'Café Modelo'],
      ['KFC', 'KFC', 'KFC'],
      /* Sufixo de localização conhecido: mantém o nome mais completo. */
      ['LOJA EXEMPLO', 'Loja Exemplo Sao Paulo BRA', 'Loja Exemplo Sao Paulo BRA'],
      ['LOJA EXEMPLO SAO PAULO BRA', 'Loja Exemplo', 'LOJA EXEMPLO SAO PAULO BRA'],
    ]) {
      for (const ordem of [
        [doBanco('nome1', noBanco), daCarteira('nome2', naCarteira, AGORA + 1000)],
        [daCarteira('nome2', naCarteira), doBanco('nome1', noBanco, AGORA + 1000)],
      ]) {
        const itens = itensDe(...ordem);
        assert.equal(itens.length, 1, 'um item só');
        assert.equal(itens[0].descricao, esperado);
        assert.equal(itens[0].contraparte, esperado);
      }
    }
    ok('par forte conserva nome sem maiúsculas e localização conhecida');

    /* Passo 3: o outro aviso completa, e discordar deixa para a pessoa */
    const semForma = (id, quando = AGORA) => aviso(id, 'Compra aprovada', 'Compra de R$ 10,00 em Loja Exemplo final 5678', { quando });
    const noCredito = (id, quando = AGORA) => aviso(id, 'Loja Exemplo', 'R$ 10,00 com cartão de crédito ••1234', { pacote: WALLET, quando });
    const comPix = (id, quando = AGORA) => aviso(id, 'Você pagou Loja Exemplo', 'R$ 10,00 com Pix final 1234', { quando });
    const noDebito = (id, quando = AGORA) => aviso(id, 'Loja Exemplo', 'R$ 10,00 no débito ••5678', { pacote: WALLET, quando });
    for (const [a, b] of [[semForma('par1'), noDebito('par2', AGORA + 1000)], [noDebito('par2'), semForma('par1', AGORA + 1000)]]) {
      const itens = itensDe(a, b);
      assert.equal(itens.length, 1);
      assert.equal(decidir.formaDoItem(itens[0], []), 'debit');
    }
    ok('par de avisos: o que traz a forma completa o outro, nas duas ordens');

    for (const [a, b] of [[comPix('par3'), noCredito('par4', AGORA + 1000)], [noCredito('par4'), comPix('par3', AGORA + 1000)]]) {
      const itens = itensDe(a, b);
      assert.equal(itens.length, 1, 'um item só');
      assert.equal(itens[0].forma, null);
      assert.equal(itens[0].digitos, '1234');
      assert.equal(decidir.formaDoItem(itens[0], cartoes), null, 'nem o final cadastrado desempata');
      assert.equal(decidir.formaDoItem(itens[0], cartoes, { 1234: 'debit' }), null, 'nem a memória desempata');
      assert.equal(decidir.confirmaEmUmToque(itens[0], { forma: decidir.formaDoItem(itens[0], cartoes), categoria: 'Alimentação', carteiraId: 'w1', cartaoId: 'c1', jaLancado: false, entreContas: false }), false);
    }
    ok('par de avisos que discordam fica sem forma, nas duas ordens');

    const [terceiro] = itensDe(comPix('par3'), noCredito('par4', AGORA + 1000), aviso('par5', 'Compra no débito', 'Compra de R$ 10,00 no débito', { pacote: 'com.google.android.apps.walletnfcrel', quando: AGORA + 2000 }));
    assert.equal(decidir.formaDoItem(terceiro, cartoes), null);
    ok('um terceiro aviso não desfaz a discordância');
  }

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
    limparAvisosDoBanco: async () => { limpos.push('leitor'); },
    limparCaixaDeAvisos: async () => { limpos.push('caixa'); },
    limparWidgets: () => {},
    esquecerAcesso: async () => {}, esquecerTelas: async () => {}, esquecerLancamentosLocais: async () => {},
    removerPush: async () => {}, signOutNoServidor: async () => {}, esquecerSessaoDoDisco: async () => {}, aplicarSaida: () => {},
  }, 50);
  assert.deepEqual(limpos, ['leitor'], 'sem dono conhecido, não apaga a caixa de ninguém');
  ok('sair da conta limpa os avisos');

  /* Travas do módulo nativo, lidas nos fontes reais */
  const nativo = (a) => fs.readFileSync(path.join(root, 'modules/grana-avisos/android/src/main', a), 'utf8');
  const listener = nativo('java/com/gabriouss/grana/avisos/GranaAvisosListener.kt');
  const manifesto = nativo('AndroidManifest.xml');
  assert.match(manifesto, /BIND_NOTIFICATION_LISTENER_SERVICE/);
  assert.doesNotMatch(manifesto, /<queries>|QUERY_ALL_PACKAGES/);
  assert.match(manifesto, /disabled_filter_types[\s\S]*conversations\|ongoing/);
  assert.ok(listener.indexOf('AvisosFiltro.decidir') < listener.indexOf('EXTRA_TITLE'), 'filtro antes de abrir o texto');
  assert.doesNotMatch(listener, /Destino\.CONTAR|contarForaDaLista/);
  assert.match(listener, /ativadoEm = AvisosConfig\.inicioDaLeitura/);
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
  /* 07/11/2026: lista de permitidos (preview/production) em vez de recusar só
     development; o comportamento é testado no módulo real em eas-webhook-perfis.cjs. */
  const webhook = fs.readFileSync(path.join(root, 'supabase/functions/eas-build-webhook/index.ts'), 'utf8');
  assert.match(webhook, /PERFIS_DO_APK_DO_SITE = new Set\(\['preview', 'production'\]\)/);
  ok('perfil development gera APK e o webhook o ignora (só preview/production publicam)');

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
  const estado = { rede: true, falhas: new Set(), pular: new Map(), rpcs: [], autorizacoes: [], consultasPorChave: 0 };
  const disco = new Map();
  const banco = [];
  const parceladas = [];
  const AsyncStorage = {
    getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
    setItem: async (k, v) => {
      if (estado.pular.get(k) > 0) estado.pular.set(k, estado.pular.get(k) - 1);
      else if (estado.falhas.has(k)) throw new Error('disco');
      disco.set(k, v);
    },
    removeItem: async (k) => { disco.delete(k); },
    multiRemove: async (ks) => { ks.forEach((k) => disco.delete(k)); },
    getAllKeys: async () => [...disco.keys()],
  };
  const semRede = () => ({ data: null, error: { message: 'TypeError: Network request failed', code: '' } });
  function observarHeader(pedido, tipo, nome, valor) {
    pedido.headers[nome] = valor;
    assert.equal(nome, 'Authorization');
    assert.equal(valor, 'Bearer AUDIT-local');
    estado.autorizacoes.push([tipo, DONO, nome, valor]);
    return pedido;
  }
  function consulta() {
    const q = { filtros: [], linha: null, headers: {} };
    for (const m of ['select', 'order', 'range', 'single']) q[m] = () => q;
    q.setHeader = (nome, valor) => observarHeader(q, 'consulta', nome, valor);
    q.eq = (c, v) => { q.filtros.push((t) => t[c] === v); return q; };
    q.gte = (c, v) => { q.filtros.push((t) => t[c] >= v); return q; };
    q.lte = (c, v) => { q.filtros.push((t) => t[c] <= v); return q; };
    q.lt = (c, v) => { q.filtros.push((t) => t[c] < v); return q; };
    q.in = (c, vs) => { estado.consultasPorChave++; q.filtros.push((t) => vs.includes(t[c])); q.lista = true; return q; };
    q.or = () => { q.lista = true; return q; };
    q.range = (de) => { q.lista = true; q.pagina = de; return q; };
    q.upsert = (linha) => { q.linha = linha; return q; };
    q.then = (res, rej) => (async () => {
      if (!estado.rede) return semRede();
      if (q.lista) return { data: q.pagina ? [] : banco.filter((t) => q.filtros.every((f) => f(t))), error: null };
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
    rpc: (_nome, args) => {
      estado.rpcs.push(_nome);
      const pedido = { headers: {},
        setHeader(nome, valor) { return observarHeader(pedido, 'rpc', nome, valor); },
        then(res, rej) { return Promise.resolve().then(() => {
          if (!estado.rede) return semRede();
          if (!parceladas.includes(args.p_client_request_id)) parceladas.push(args.p_client_request_id);
          return { data: [], error: null };
        }).then(res, rej); },
      };
      return pedido;
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
    return { gravar: em('lib/avisos-banco/gravar.ts'), caixa: em('lib/avisos-banco/caixa.ts'), oferta: em('lib/offline-cache.ts'), pendentes: em('lib/fila-pendente.ts'), dados: em('lib/data.ts') };
  }

  const CAIXA = `grana_avisos_caixa:${DONO}`;
  const MARCAS = `grana_avisos_gravados:${DONO}`;
  const FILA = 'grana:queue:transactions-pendentes';
  const item = { id: 'a'.repeat(64), avisoIds: ['a'.repeat(64)], pacote: NUBANK, classe: 'banco', quando: AGORA, expiraEm: AGORA + 1e12, tipo: 'lancamento', data: '2026-10-20', direcao: 'out', forma: 'debit', valor: 40 };
  const base = { type: 'out', description: 'Mercado Modelo', category: 'Alimentação', color: '#000', occurred_on: '2026-10-20', recurring: false, wallet_id: 'w1' };
  const simples = { ...base, amount: 40, payment_method: 'debit' };
  const parcelada = { ...base, amount: 300, payment_method: 'credit', card_id: 'c1', bank: 'nubank', installments: 3 };
  const preparar = () => {
    disco.clear(); banco.length = 0; parceladas.length = 0; estado.falhas.clear(); estado.pular.clear(); estado.rpcs.length = 0; estado.autorizacoes.length = 0; estado.rede = true;
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
    assert.ok(estado.autorizacoes.some(([tipo, dono]) => tipo === (nome === 'parcelada' ? 'rpc' : 'consulta') && dono === DONO), `${nome}: o módulo real autoriza o pedido do dono-r`);
    assert.deepEqual(estado.autorizacoes.filter(([tipo]) => tipo === 'rpc'), nome === 'parcelada' ? [['rpc', DONO, 'Authorization', 'Bearer AUDIT-local']] : [], `${nome}: RPC autorizada uma vez, sem mascarar erro de rede`);
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

    /* A4 residual: gravou, nem marca nem retirada couberam no disco, o app morreu, e a
       leitura normal já trouxe a linha real para o cache. Retomar sem rede não soma. */
    const chave = 'aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa';
    const linhasReais = (nome === 'simples' ? [40] : [100, 100, 100]).map((amount, i) => ({
      id: `real-${i}`, user_id: DONO, type: 'out', amount, occurred_on: '2026-10-20',
      client_request_id: i === 0 ? chave : null,
    }));
    preparar();
    p = novoProcesso();
    estado.falhas.add(CAIXA);
    estado.falhas.add(MARCAS);
    await assert.rejects(p.gravar.gravarItem(DONO, item, entrada));
    estado.falhas.clear();
    p = novoProcesso();
    await p.oferta.setCachedTransactions(linhasReais);
    estado.rede = false;
    assert.equal((await p.gravar.gravarItem(DONO, item, entrada)).guardado, false, `${nome}: já estava gravado`);
    assert.equal(fila().length, 0, `${nome}: nada na fila`);
    assert.ok(Math.abs(await soma(p) - total) < 0.001, `${nome}: o cache soma a compra uma vez`);
    assert.equal(naCaixa(), 0);
    ok(`${nome}: morreu sem marca e voltou sem rede, com a linha real no cache: nada de cópia`);

    /* O mesmo, com a linha real ainda fora do cache: entra na fila, e a soma segue certa.
       Quando a leitura trouxer a linha real, o pendente da mesma chave não aparece junto. */
    preparar();
    p = novoProcesso();
    estado.falhas.add(CAIXA);
    estado.falhas.add(MARCAS);
    await assert.rejects(p.gravar.gravarItem(DONO, item, entrada));
    estado.falhas.clear();
    p = novoProcesso();
    estado.rede = false;
    assert.equal((await p.gravar.gravarItem(DONO, item, entrada)).guardado, true);
    assert.equal(fila().length, 1);
    assert.ok(Math.abs(await soma(p) - total) < 0.001);
    const juntos = await p.pendentes.juntarPendentes(linhasReais);
    assert.ok(Math.abs(juntos.reduce((t, l) => t + l.amount, 0) - total) < 0.001, `${nome}: real e pendente não somam`);
    ok(`${nome}: morreu sem marca e sem a linha no cache: conta uma vez antes e depois da leitura`);
  }

  /* Sem a chave da origem, tudo segue como sempre: duas chamadas, dois lançamentos */
  preparar();
  const p = novoProcesso();
  estado.rede = false;
  await p.oferta.salvarOuGuardarNoAparelho(simples);
  await p.oferta.salvarOuGuardarNoAparelho(simples);
  assert.equal(fila().length, 2);
  ok('sem a chave da origem, cada salvar continua sendo um lançamento');
  const semChaveNaLista = [{ id: 'outra', user_id: DONO, type: 'out', amount: 40, occurred_on: '2026-10-20' }];
  assert.equal((await p.pendentes.juntarPendentes(semChaveNaLista)).length, 3);
  ok('linha com o mesmo valor e sem a chave não esconde pendente nenhum');

  /* A4 em parcela de mês futuro: só a primeira parcela leva a chave. A identidade
     continua sendo a chave: a fila aprende o id real da série por ela. */
  const CHAVE = 'aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa';
  const serieNoBanco = (prefixo, chave) => ['2026-10-20', '2026-11-20', '2026-12-20'].map((occurred_on, i) => ({
    id: `${prefixo}-${i + 1}`, user_id: DONO, type: 'out', amount: 100, occurred_on, payment_method: 'credit', card_id: 'c1',
    parent_id: i === 0 ? null : `${prefixo}-1`, installment_current: i + 1, installment_total: 3,
    client_request_id: i === 0 ? chave : null, created_at: '2026-10-20T12:00:00Z', description: `Compra (${i + 1}/3)`,
  }));
  const somaDe = (linhas) => linhas.reduce((t, l) => t + l.amount, 0);
  const pendenteDaParcela = async (proc) => {
    estado.rede = false;
    assert.equal((await proc.gravar.gravarItem(DONO, item, parcelada)).guardado, true);
    assert.equal(fila().length, 1);
    estado.rede = true;
  };

  preparar();
  banco.push(...serieNoBanco('real', CHAVE));
  let serie = novoProcesso();
  await pendenteDaParcela(serie);
  estado.consultasPorChave = 0;
  const novembro = await serie.dados.fetchTransactionsDoPeriodo('2026-11-01', '2026-11-30');
  assert.equal(novembro.map((l) => l.id).join(), 'real-2', 'só a parcela real');
  assert.equal(somaDe(novembro), 100);
  assert.equal(estado.consultasPorChave, 1);
  assert.equal(fila().length, 1, 'quem tira da fila continua sendo o envio');
  assert.equal(fila()[0].serieReal, 'real-1');
  const fatura = await serie.dados.fetchCreditTransactionsForMonth(2026, 10);
  assert.equal(somaDe(fatura), 100, 'a fatura de novembro também');
  assert.equal(estado.consultasPorChave, 1, 'com a série conhecida, não consulta de novo');
  ok('parcela de mês futuro: com rede conta R$100 em novembro, na lista e na fatura');

  /* Depois de aprender, o mês guardado no disco também conta uma vez, sem rede e noutro processo */
  serie = novoProcesso();
  estado.rede = false;
  assert.equal(somaDe(await serie.dados.fetchTransactionsDoPeriodo('2026-11-01', '2026-11-30')), 100);
  assert.equal(estado.consultasPorChave, 1);
  ok('parcela de mês futuro: sem rede, depois de o app morrer, o que aprendeu continua valendo');

  /* Sem rede desde o começo, com a primeira parcela no histórico guardado */
  preparar();
  banco.push(...serieNoBanco('real', CHAVE));
  serie = novoProcesso();
  await serie.dados.fetchTransactions();
  await serie.dados.fetchTransactionsDoPeriodo('2026-11-01', '2026-11-30');
  await pendenteDaParcela(serie);
  estado.rede = false;
  assert.equal(somaDe(await serie.dados.fetchTransactionsDoPeriodo('2026-11-01', '2026-11-30')), 100);
  assert.equal(fila()[0].serieReal, 'real-1');
  ok('parcela de mês futuro: sem rede, reconhece pela primeira parcela do histórico guardado');

  /* Outra série igual em valor, data e parent_id órfão: não esconde quem ainda não chegou ao banco */
  preparar();
  banco.push(...serieNoBanco('outra', 'bbbbbbbb-bbbb-5bbb-8bbb-bbbbbbbbbbbb'));
  serie = novoProcesso();
  await pendenteDaParcela(serie);
  const legitimo = await serie.dados.fetchTransactionsDoPeriodo('2026-11-01', '2026-11-30');
  assert.equal(somaDe(legitimo), 200, 'as duas compras existem');
  assert.equal(fila()[0].serieReal, undefined);
  ok('série parecida com outra chave não esconde o pendente legítimo');

  /* A consulta falhou: mostra o pendente, com o log, em vez de sumir com a lista ou com a compra */
  preparar();
  banco.push(...serieNoBanco('outra', 'bbbbbbbb-bbbb-5bbb-8bbb-bbbbbbbbbbbb'));
  serie = novoProcesso();
  await serie.dados.fetchTransactionsDoPeriodo('2026-11-01', '2026-11-30');
  await pendenteDaParcela(serie);
  estado.rede = false;
  const semConsulta = await serie.dados.fetchTransactionsDoPeriodo('2026-11-01', '2026-11-30');
  assert.equal(somaDe(semConsulta), 200);
  ok('sem rede e sem como reconhecer, a lista chega inteira e nada some');

  /* A6 com módulos e fila reais: uma chamada de pagamento, zero saída avulsa */
  const contaPaga = { id: 'conta-a6' };
  const boletoItem = { ...item, forma: 'boleto' };
  const pagamentos = () => estado.rpcs.filter((n) => n === 'pagar_conta').length;
  const nomeDoErro = (nome) => (e) => e.name === nome;

  preparar();
  let a6 = novoProcesso();
  estado.pular.set(CAIXA, 1);
  estado.falhas.add(CAIXA);
  await assert.rejects(a6.gravar.pagarContaDoItem(DONO, boletoItem, contaPaga), nomeDoErro('LimpezaPendente'));
  estado.falhas.clear();
  assert.equal(pagamentos(), 1);
  assert.deepEqual([...await a6.gravar.itensJaGravados(DONO)], [boletoItem.id]);
  const retomada = await a6.gravar.gravarItem(DONO, boletoItem, simples);
  assert.equal(retomada.jaEstava, true);
  assert.equal(banco.length, 0);
  assert.equal(fila().length, 0);
  assert.equal(naCaixa(), 0);
  ok('A6: pagou, a retirada falhou, e lançar saída depois não grava nada');

  /* Nem a marca coube, e o app morreu: quem segura é o "pagamento iniciado" na caixa */
  preparar();
  a6 = novoProcesso();
  estado.pular.set(CAIXA, 1);
  estado.falhas.add(CAIXA);
  estado.falhas.add(MARCAS);
  await assert.rejects(a6.gravar.pagarContaDoItem(DONO, boletoItem, contaPaga), nomeDoErro('LimpezaPendente'));
  estado.falhas.clear();
  a6 = novoProcesso();
  await assert.rejects(a6.gravar.gravarItem(DONO, boletoItem, simples), nomeDoErro('ContaJaEmPagamento'));
  await assert.rejects(a6.gravar.pagarContaDoItem(DONO, boletoItem, contaPaga), nomeDoErro('ContaJaEmPagamento'));
  assert.equal(pagamentos(), 1);
  assert.equal(banco.length, 0);
  assert.equal(fila().length, 0);
  assert.equal(naCaixa(), 1);
  ok('A6: depois de morrer sem marca, nem saída avulsa nem segundo pagamento');

  /* Pagar sem resposta: pode ter chegado. Não repete sozinho */
  preparar();
  a6 = novoProcesso();
  estado.rede = false;
  await assert.rejects(a6.gravar.pagarContaDoItem(DONO, boletoItem, contaPaga), nomeDoErro('PagamentoIncerto'));
  estado.rede = true;
  await assert.rejects(a6.gravar.pagarContaDoItem(DONO, boletoItem, contaPaga), nomeDoErro('ContaJaEmPagamento'));
  await assert.rejects(a6.gravar.gravarItem(DONO, boletoItem, simples), nomeDoErro('ContaJaEmPagamento'));
  assert.equal(pagamentos(), 1);
  assert.equal(banco.length, 0);
  ok('A6: pagamento sem resposta não repete nem vira saída');

  /* Sucesso normal do boleto não deixa rastro */
  preparar();
  a6 = novoProcesso();
  await a6.gravar.pagarContaDoItem(DONO, boletoItem, contaPaga);
  assert.equal(pagamentos(), 1);
  assert.equal(naCaixa(), 0);
  assert.equal(disco.get(MARCAS), '{}');
  ok('boleto sem falha: um pagamento, item fora da lista e sem marca sobrando');

  /* Sair da conta leva as marcas junto */
  disco.set(MARCAS, '{"x":true}');
  await p.caixa.limparCaixa(DONO);
  assert.equal(disco.has(MARCAS), false);
  ok('limpar a caixa apaga as marcas');
}

main().catch((e) => { console.error(e); process.exit(1); });
