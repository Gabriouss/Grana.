/*
 * Compra recusada e estorno nos avisos do banco, com os módulos reais
 * (interpretar, decidir, caixa e gravar). Pedido do autor em 07/11/2026:
 * recusa nunca vira compra, e estorno descarta a compra pendente sozinho, mas
 * nunca apaga lançamento já confirmado sem o toque da pessoa.
 *
 *   node __tests__/avisos-recusa-estorno.cjs
 *
 * Cartões, valores e lojas são inventados: o repositório é público (regra 15).
 * Cada cenário afirma QUAIS gravações aconteceram, não só o que voltou (regra 9).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
let passou = 0;
const ok = (rotulo) => { passou++; console.log('  ok  ' + rotulo); };

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
  const escritas = [];
  return {
    dados,
    escritas,
    getItem: async (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: async (k, v) => { escritas.push(k); dados.set(k, v); },
    removeItem: async (k) => { dados.delete(k); },
  };
}

const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;
const AGORA = new Date(2026, 10, 7, 12).getTime();
const C6 = 'com.c6bank.app';
const NUBANK = 'com.nu.production';
const WALLET = 'com.google.android.apps.walletnfcrel';
let seq = 0;
const aviso = (titulo, texto, extra = {}) => {
  seq++;
  return { id: `av${seq}`.padEnd(64, '0'), pacote: C6, chave: `k-${seq}`, quando: AGORA, titulo, texto, ...extra };
};

const COMPRA_UBER = (extra) => aviso('Compra aprovada', 'Compra de R$ 12.34 aprovada em DL *UberRides Sao Paulo BRA no cartão final 1234********0000', extra);
const ESTORNO_UBER = (extra) => aviso('Estorno', 'Estorno de R$ 12.34 em DL *UberRides no cartão final 1234********0000', extra);

(async () => {
  const disco = discoFalso();
  const diario = { itens: [], ilegiveis: 0 };
  const chamadas = [];
  const carregar = carregador({
    '@react-native-async-storage/async-storage': { __esModule: true, default: disco },
    '@/modules/grana-avisos': { lerDiarioAvisos: async () => ({ itens: diario.itens, ilegiveis: diario.ilegiveis }) },
    '../data': {
      payBill: async () => { chamadas.push(['payBill']); },
      deleteTransaction: async (id) => { chamadas.push(['apagar', id]); },
    },
    '../offline-cache': {
      salvarOuGuardarNoAparelho: async (entrada, c) => { chamadas.push(['salvar', entrada, c]); return { guardado: false }; },
      salvarOuGuardarParceladaNoAparelho: async (entrada, c) => { chamadas.push(['parcelada', entrada, c]); return { guardado: false }; },
    },
  });
  const interpretar = carregar('lib/avisos-banco/interpretar.ts');
  const decidir = carregar('lib/avisos-banco/decidir.ts');
  const caixa = carregar('lib/avisos-banco/caixa.ts');
  const gravar = carregar('lib/avisos-banco/gravar.ts');
  const sync = async (dono, ...avisos) => { diario.itens = avisos; return caixa.sincronizarCaixa(dono, AGORA + DIA); };

  /* 1. O aviso real do C6 (com dados inventados) não vira nada. */
  {
    const recusa = aviso('Compra recusada: limite insuficiente', 'A compra no cartão final 1234********0000 em 07/11/2026, de R$ 12.34, em DL *UberRides Sao Paulo BRA, foi recusada por limite de crédito insuficiente. Toque para conferir seu limite');
    const lido = interpretar.interpretarAviso(recusa);
    assert.deepEqual(lido, { tipo: 'ignorar', motivo: 'recusada' });
    const r = await sync('dono-recusa', recusa);
    assert.equal(r.itens.length, 0);
    assert.equal(chamadas.length, 0);
    ok('recusa do C6 não vira item nem gravação');
  }

  /* 2. Valor com ponto e final mascarado: a compra de verdade sai certa. */
  {
    const lido = interpretar.interpretarAviso(COMPRA_UBER());
    assert.equal(lido.tipo, 'lancamento');
    assert.equal(lido.valor, 12.34);
    assert.equal(lido.digitos, '0000');
    ok('R$ 12.34 é doze e trinta e quatro, e o final é o grupo depois da máscara');
  }

  /* 3. Compra pendente + estorno igual: os dois saem, com recibo, sem gravar nada. */
  {
    const compra = COMPRA_UBER({ quando: AGORA });
    const estorno = ESTORNO_UBER({ quando: AGORA + 30 * MIN });
    let r = await sync('dono-par', compra);
    assert.equal(r.itens.length, 1);
    r = await sync('dono-par', compra, estorno);
    assert.equal(r.itens.length, 0);
    assert.equal(r.recibos.length, 1);
    assert.equal(r.recibos[0].valor, 12.34);
    assert.equal(r.recibos[0].dataDaCompra, '2026-11-07');
    assert.equal(chamadas.length, 0, 'nenhuma gravação nem exclusão');
    /* A caixa não guarda o texto do aviso, nem no recibo. */
    assert.ok(!disco.dados.get('grana_avisos_caixa:dono-par').includes('Estorno de'));
    /* Sincronizar de novo não ressuscita a compra. */
    r = await sync('dono-par', compra, estorno);
    assert.equal(r.itens.length, 0);
    assert.deepEqual(await caixa.recibosDaCaixa('dono-par'), r.recibos);
    await caixa.dispensarRecibo('dono-par', r.recibos[0].id);
    assert.equal((await caixa.recibosDaCaixa('dono-par')).length, 0);
    ok('compra pendente e estorno igual saem juntos, com recibo visível e sem gravação');
  }

  /* 3b. Os dois no mesmo lote (app fechado): mesma decisão. */
  {
    const r = await sync('dono-lote', ESTORNO_UBER({ quando: AGORA + 10 * MIN }), COMPRA_UBER({ quando: AGORA }));
    assert.equal(r.itens.length, 0);
    assert.equal(r.recibos.length, 1);
    ok('compra e estorno lidos juntos também se anulam');
  }

  /* 4. Compra já confirmada (gravada) + estorno: não apaga nada, pergunta. */
  {
    const compra = COMPRA_UBER({ quando: AGORA });
    let r = await sync('dono-confirmado', compra);
    const item = r.itens[0];
    const entrada = decidir.montarEntrada({
      type: 'out', description: 'Uber', amount: 12.34, category: 'Transporte', color: '#000', occurred_on: item.data, forma: 'debit', wallet_id: 'w1',
    });
    await gravar.gravarItem('dono-confirmado', item, entrada);
    assert.equal(chamadas.filter((c) => c[0] === 'salvar').length, 1);
    r = await sync('dono-confirmado', compra, ESTORNO_UBER({ quando: AGORA + 2 * 60 * MIN }));
    assert.equal(r.itens.length, 1);
    assert.equal(r.itens[0].tipo, 'estorno');
    assert.equal(r.itens[0].valor, 12.34);
    assert.equal(chamadas.filter((c) => c[0] === 'apagar').length, 0, 'nada apagado sozinho');

    /* A tela acha o lançamento confirmado para perguntar. */
    const lancamentos = [
      { id: 't1', bank: 'c6', type: 'out', amount: 12.34, occurred_on: '2026-11-07', description: 'DL UberRides Sao Paulo BRA', card_id: null },
      { id: 't2', type: 'out', amount: 12.34, occurred_on: '2026-10-20', description: 'DL UberRides', card_id: null },
      { id: 't3', type: 'out', amount: 12.35, occurred_on: '2026-11-07', description: 'DL UberRides', card_id: null },
      { id: 't4', type: 'in', amount: 12.34, occurred_on: '2026-11-07', description: 'DL UberRides', card_id: null },
      { id: 't5', type: 'out', amount: 12.34, occurred_on: '2026-11-07', description: 'Padaria Modelo', card_id: null },
      { id: 't6', type: 'out', amount: 12.34, occurred_on: '2026-11-07', description: 'Uber', card_id: 'cx' },
    ];
    const achados = decidir.lancamentosDoEstorno(r.itens[0], lancamentos, [{ id: 'cx', last_digits: '9999' }]);
    assert.deepEqual(achados.map((t) => t.id), ['t1']);
    assert.deepEqual(decidir.lancamentosDoEstorno(r.itens[0], [{ ...lancamentos[0], installment_total: 3 }]), []);

    /* Confirmar no estorno nunca grava saída. */
    const antes = chamadas.length;
    await assert.rejects(gravar.gravarItem('dono-confirmado', r.itens[0], entrada), { name: 'ItemNaoGravavel' });
    assert.equal(chamadas.length, antes, 'nenhuma gravação');
    assert.equal(decidir.confirmaEmUmToque(r.itens[0], { forma: 'debit', categoria: 'x', carteiraId: 'w', cartaoId: null, jaLancado: false, entreContas: false }), false);

    /* Só o toque remove: apaga o lançamento escolhido e tira o estorno da lista. */
    await gravar.removerLancamentoDoEstorno('dono-confirmado', r.itens[0], 't1');
    assert.deepEqual(chamadas.slice(antes), [['apagar', 't1']]);
    assert.equal((await caixa.listarCaixa('dono-confirmado')).length, 0);
    await assert.rejects(gravar.removerLancamentoDoEstorno('dono-confirmado', item, 't1'));
    assert.equal(chamadas.filter((c) => c[0] === 'apagar').length, 1, 'item que não é estorno não apaga nada');
    ok('compra confirmada + estorno: vira pergunta, acha só o lançamento certo e só apaga com o toque');
  }

  /* 5. Duas compras pendentes candidatas: não descarta nenhuma. */
  {
    const r = await sync('dono-dois',
      COMPRA_UBER({ quando: AGORA }),
      COMPRA_UBER({ quando: AGORA + 20 * MIN }),
      ESTORNO_UBER({ quando: AGORA + 40 * MIN }));
    assert.deepEqual(r.itens.map((i) => i.tipo).sort(), ['estorno', 'lancamento', 'lancamento']);
    assert.equal(r.recibos.length, 0);
    ok('dois candidatos: as duas compras ficam e o estorno vira item');
  }

  /* 6. Estorno parcial (outro valor): nada sai sozinho. */
  {
    const r = await sync('dono-parcial',
      aviso('Compra aprovada', 'Compra de R$ 45,90 aprovada em Loja Modelo no cartão final 4321'),
      aviso('Estorno', 'Estorno de R$ 10,00 em Loja Modelo no cartão final 4321', { quando: AGORA + 60 * MIN }));
    assert.deepEqual(r.itens.map((i) => [i.tipo, i.valor]), [['lancamento', 45.9], ['estorno', 10]]);
    ok('estorno parcial não descarta a compra');
  }

  /* 7. Estorno sem compra nenhuma: vira item, nunca saída. */
  {
    const r = await sync('dono-sem', aviso('Reembolso', 'Você recebeu um reembolso de R$ 30,00 de Loja Modelo'));
    assert.equal(r.itens.length, 1);
    assert.equal(r.itens[0].tipo, 'estorno');
    assert.equal(r.itens[0].direcao, undefined);
    ok('estorno sem compra vira item de estorno, sem direção de saída');
  }

  /* 8. Estorno mais de 7 dias depois da compra: não casa. */
  {
    diario.itens = [COMPRA_UBER({ quando: AGORA - 8 * DIA }), ESTORNO_UBER({ quando: AGORA })];
    const r = await caixa.sincronizarCaixa('dono-velho', AGORA + MIN);
    assert.deepEqual(r.itens.map((i) => i.tipo).sort(), ['estorno', 'lancamento']);
    ok('estorno depois de 7 dias não descarta a compra');
  }

  /* 9. Final de cartão diferente: não casa. */
  {
    const r = await sync('dono-final',
      aviso('Compra aprovada', 'Compra de R$ 45,90 aprovada em Loja Modelo no cartão final 4321'),
      aviso('Estorno', 'Estorno de R$ 45,90 em Loja Modelo no cartão final 9999', { quando: AGORA + 60 * MIN }));
    assert.deepEqual(r.itens.map((i) => i.tipo), ['lancamento', 'estorno']);
    ok('final de cartão diferente não descarta a compra');
  }

  /* 10. Loja diferente: não casa. Estorno antes da compra: não casa. */
  {
    let r = await sync('dono-loja',
      aviso('Compra aprovada', 'Compra de R$ 45,90 aprovada em Loja Modelo'),
      aviso('Estorno', 'Estorno de R$ 45,90 em Padaria Exemplo', { quando: AGORA + 60 * MIN }));
    assert.deepEqual(r.itens.map((i) => i.tipo), ['lancamento', 'estorno']);
    r = await sync('dono-antes',
      aviso('Estorno', 'Estorno de R$ 45,90 em Loja Modelo', { quando: AGORA }),
      aviso('Compra aprovada', 'Compra de R$ 45,90 aprovada em Loja Modelo', { quando: AGORA + 60 * MIN }));
    assert.deepEqual(r.itens.map((i) => i.tipo), ['estorno', 'lancamento']);
    ok('loja diferente ou estorno antes da compra não descartam nada');
  }

  /* 11. O mesmo estorno avisado pelo banco e pela carteira: um item só. */
  {
    const r = await sync('dono-repetido',
      aviso('Estorno', 'Estorno de R$ 30,00 em Loja Modelo final 1234', { pacote: NUBANK }),
      aviso('Estorno', 'Estorno de R$ 30,00 em Loja Modelo final 1234', { pacote: WALLET, quando: AGORA + 2 * MIN }));
    assert.equal(r.itens.length, 1);
    ok('estorno repetido em até 5 minutos não abre dois itens');
  }

  /* 12. Item pendente antigo que era recusa sai da lista ao reler o diário. */
  {
    const tentativa = aviso('Tentativa de compra', 'Identificamos uma tentativa de compra de R$ 45,90 em Loja Modelo');
    /* Estado gravado por uma versão que ainda transformava isso em compra. */
    const antigo = {
      itens: [{ id: tentativa.id, avisoIds: [tentativa.id], pacote: C6, classe: 'banco', quando: AGORA, expiraEm: AGORA + 30 * DIA,
        tipo: 'lancamento', data: '2026-11-07', direcao: 'out', forma: null, valor: 45.9, parcelas: null, contraparte: 'Loja Modelo', descricao: 'Loja Modelo', digitos: null }],
      vistos: { [tentativa.id]: { quando: AGORA, pacote: C6, chave: tentativa.chave, classe: 'banco', valor: 45.9, itemId: tentativa.id } },
    };
    disco.dados.set('grana_avisos_caixa:dono-antigo', JSON.stringify(antigo));
    let r = await sync('dono-antigo', tentativa);
    assert.equal(r.itens.length, 0);
    /* Sem o texto no diário, o item fica: não dá para saber. */
    disco.dados.set('grana_avisos_caixa:dono-antigo2', JSON.stringify(antigo));
    r = await sync('dono-antigo2');
    assert.equal(r.itens.length, 1);
    /* Já gravado (marca de gravado) não é tocado. */
    disco.dados.set('grana_avisos_caixa:dono-antigo3', JSON.stringify(antigo));
    disco.dados.set('grana_avisos_gravados:dono-antigo3', JSON.stringify({ [tentativa.id]: false }));
    r = await sync('dono-antigo3', tentativa);
    assert.equal(r.itens.length, 1);
    assert.equal(chamadas.filter((c) => c[0] === 'apagar').length, 1, 'limpeza de recusa nunca apaga lançamento');
    ok('recusa antiga ainda no diário sai da lista; sem texto ou já gravada, fica');
  }

  /* 13. Compra pendente já gravada (falta só sair da lista) + estorno: pergunta, não descarta. */
  {
    const compra = COMPRA_UBER({ quando: AGORA });
    let r = await sync('dono-meio', compra);
    disco.dados.set('grana_avisos_gravados:dono-meio', JSON.stringify({ [r.itens[0].id]: false }));
    r = await sync('dono-meio', compra, ESTORNO_UBER({ quando: AGORA + 5 * MIN }));
    assert.deepEqual(r.itens.map((i) => i.tipo), ['lancamento', 'estorno']);
    ok('compra gravada que ainda está na lista conta como confirmada');
  }

  /* 14. Sem falso positivo: compra, Pix enviado, Pix recebido e pagamento seguem virando item. */
  {
    const r = await sync('dono-normal',
      aviso('Compra aprovada', 'Compra no crédito de R$ 89,90 em Mercado Modelo'),
      aviso('Pix enviado', 'Pix enviado de R$ 50,00 para Maria Modelo', { quando: AGORA + 10 * MIN }),
      aviso('Pix recebido', 'Pix recebido de R$ 70,00 de João Modelo', { quando: AGORA + 20 * MIN }),
      aviso('Pagamento realizado', 'Pagamento de R$ 30,00 realizado em Padaria Modelo com o cartão de débito', { quando: AGORA + 30 * MIN }));
    assert.deepEqual(r.itens.map((i) => [i.tipo, i.direcao, i.valor]), [
      ['lancamento', 'out', 89.9], ['lancamento', 'out', 50], ['lancamento', 'in', 70], ['lancamento', 'out', 30],
    ]);
    ok('compras normais continuam virando item como antes');
  }

  /* 15. Caixa gravada antes de 07/11 (sem recibos) continua legível. */
  {
    disco.dados.set('grana_avisos_caixa:dono-velha', JSON.stringify({ itens: [], vistos: {} }));
    const r = await sync('dono-velha');
    assert.deepEqual(r.recibos, []);
    ok('caixa sem o campo de recibos continua valendo');
  }

  /* Rodada 2 (achado do Watchtower): correspondência forte. */
  {
    const m = decidir.mesmoComerciante;
    assert.equal(m('Uber', 'UberEats'), false);
    assert.equal(m('Uber', 'Uber Eats'), false);
    assert.equal(m('Loja Modelo', 'Loja Modelo Centro'), false, 'resto que não é localização não casa');
    assert.equal(m('DL *UberRides', 'DL *UberRides Sao Paulo BRA'), true);
    assert.equal(m('Padaria Modelo', 'PADARIA MODELO SP'), true);
    assert.equal(m('Mercado Modelo', 'Mercado Modelo Campinas SP BRA'), true);
    assert.equal(m('Mercado Modelo', 'Mercado-Modelo'), true);
    assert.equal(m('Uber', 'Uber BRA'), false, 'nome curto demais só casa igual');
    ok('loja: igual, ou nome de 6+ letras seguido só de cidade, estado ou país');

    let r = await sync('dono-ubereats',
      aviso('Compra aprovada', 'Compra de R$ 25,00 aprovada em Uber no cartão final 4321'),
      aviso('Estorno', 'Estorno de R$ 25,00 em UberEats no cartão final 4321', { quando: AGORA + 60 * MIN }));
    assert.deepEqual(r.itens.map((i) => i.tipo), ['lancamento', 'estorno']);
    assert.equal(r.recibos.length, 0);
    ok('compra "Uber" e estorno "UberEats" do mesmo valor não se anulam');

    r = await sync('dono-bancos',
      aviso('Compra aprovada', 'Compra de R$ 45,90 aprovada em Loja Modelo no cartão final 4321', { pacote: NUBANK }),
      aviso('Estorno', 'Estorno de R$ 45,90 em Loja Modelo no cartão final 4321', { pacote: C6, quando: AGORA + 60 * MIN }));
    assert.deepEqual(r.itens.map((i) => i.tipo), ['lancamento', 'estorno']);
    ok('compra de um banco e estorno de outro não se anulam');

    r = await sync('dono-mesmo-banco', COMPRA_UBER({ quando: AGORA }), ESTORNO_UBER({ quando: AGORA + 30 * MIN }));
    assert.equal(r.itens.length, 0);
    assert.equal(r.recibos.length, 1);
    ok('"DL *UberRides" e "DL *UberRides Sao Paulo BRA" no mesmo banco continuam se anulando');

    /* Compra avisada pelo banco e pela carteira: o estorno do banco ainda casa. */
    r = await sync('dono-par-carteira',
      aviso('Compra aprovada', 'Compra no crédito de R$ 40,00 em Padaria Modelo, final 1234', { pacote: NUBANK }),
      aviso('Padaria Modelo', 'R$ 40,00 com Visa ••1234', { pacote: WALLET, quando: AGORA + 2 * MIN }),
      aviso('Estorno', 'Estorno de R$ 40,00 em Padaria Modelo, final 1234', { pacote: NUBANK, quando: AGORA + 60 * MIN }));
    assert.equal(r.itens.length, 0);
    ok('compra com par da carteira casa com o estorno do mesmo banco');

    const est = { id: 'e', avisoIds: ['e'], pacote: C6, classe: 'banco', quando: AGORA, expiraEm: AGORA + DIA, tipo: 'estorno', data: '2026-11-07', valor: 25, contraparte: 'Loja Modelo', descricao: 'Loja Modelo', digitos: null };
    const t = (id, extra = {}) => ({ id, type: 'out', amount: 25, occurred_on: '2026-11-06', description: 'Loja Modelo', bank: 'c6', card_id: null, ...extra });
    assert.deepEqual(decidir.ofertaDoEstorno(est, [t('a')]), { tipo: 'remover', lancamento: t('a') });
    assert.deepEqual(decidir.ofertaDoEstorno(est, [t('a'), t('b')]), { tipo: 'varios' });
    assert.deepEqual(decidir.ofertaDoEstorno(est, [t('a', { description: 'Loja Modelo Centro' })]), { tipo: 'nenhum' });
    assert.deepEqual(decidir.ofertaDoEstorno(est, null), { tipo: 'sem_historico' });
    assert.deepEqual(decidir.ofertaDoEstorno({ ...est, valor: undefined }, [t('a')]), { tipo: 'sem_valor' });
    ok('oferta do cartão: remover só com exatamente um lançamento forte');
  }

  /* Identidade conservadora: casos sintéticos Watchtower, caixa e decisão reais. */
  {
    const antes = chamadas.length;
    const compra = (pacote, loja = 'Loja Modelo', extra = {}) => aviso('Compra aprovada',
      `Compra no crédito de R$ 25,00 em ${loja} final 1234`, { pacote, ...extra });
    const estorno = (pacote, loja = 'Loja Modelo', extra = {}) => aviso('Estorno',
      `Estorno de R$ 25,00 em ${loja} final 1234`, { pacote, ...extra });
    const c6 = compra(C6);
    const wallet = compra(WALLET, 'Loja Modelo', { quando: AGORA + 1000 });
    const nu = compra(NUBANK, 'Loja Modelo', { quando: AGORA + 2000 });
    let r = await sync('wt-ponte', c6, wallet, nu);
    assert.equal(r.itens.length, 2, 'Wallet não funde duas compras de bancos distintos');
    assert.deepEqual(r.itens.find((i) => i.id === c6.id).avisoIds, [c6.id], 'A2: Wallet não entra no grupo bancário');
    assert.ok(!disco.dados.get('grana_avisos_caixa:wt-ponte').includes(wallet.id), 'A2: Wallet não fica nos vistos');
    const legado = decidir.aplicarAvisos(decidir.CAIXA_VAZIA, [c6, wallet, nu], AGORA + DIA);
    assert.equal(legado.itens.length, 2, 'parser legado mantém a proteção contra ponte');
    assert.equal(legado.itens.find((i) => i.id === c6.id).avisoIds.length, 2, 'parser legado ainda reconhece par forte');
    r = await sync('wt-ponte', c6, wallet, nu, estorno(NUBANK, 'Loja Modelo', { quando: AGORA + 3000 }));
    assert.deepEqual(r.itens.map((i) => i.id), [c6.id], 'C6 real continua para conferir');
    assert.equal(r.recibos.length, 1, 'só Nubank foi anulado');
    r = await sync('wt-wallet-primeiro', compra(WALLET), compra(C6, 'Loja Modelo', { quando: AGORA + 1000 }), compra(NUBANK, 'Loja Modelo', { quando: AGORA + 2000 }));
    assert.equal(r.itens.length, 2, 'a ordem Wallet/banco também impede ponte entre bancos');
    ok('WT-R1: C6+Wallet+Nubank do mesmo valor preserva C6 após estorno Nubank');

    // Caixa antiga já contaminada: o estorno não pode confiar em só uma origem.
    const antiga = decidir.aplicarAvisos(decidir.CAIXA_VAZIA, [c6], AGORA);
    antiga.itens[0].avisoIds.push(nu.id);
    antiga.vistos[nu.id] = { quando: nu.quando, pacote: NUBANK, chave: nu.chave, classe: 'banco', valor: 25, itemId: c6.id };
    disco.dados.set('grana_avisos_caixa:wt-legado', JSON.stringify(antiga));
    r = await sync('wt-legado', c6, nu, estorno(NUBANK, 'Loja Modelo', { quando: AGORA + 3000 }));
    assert.deepEqual(r.itens.map((i) => i.tipo), ['lancamento', 'estorno']);
    assert.equal(r.recibos.length, 0);
    const semIdentidade = decidir.aplicarAvisos(decidir.CAIXA_VAZIA, [c6], AGORA);
    for (const v of Object.values(semIdentidade.vistos)) { delete v.direcao; delete v.contraparte; delete v.digitos; }
    disco.dados.set('grana_avisos_caixa:wt-visto-antigo', JSON.stringify(semIdentidade));
    r = await sync('wt-visto-antigo', c6, wallet);
    assert.deepEqual(r.itens.map((i) => i.id), [c6.id], 'A2: visto antigo conserva o banco e ignora Wallet');
    assert.equal(decidir.aplicarAvisos(semIdentidade, [wallet], AGORA + DIA).itens.length, 2, 'parser legado: visto sem identidade não prova fusão');
    ok('WT-R1: item legado com origens conflitantes nunca é descartado automaticamente');

    for (const [pacote, loja] of [[NUBANK, 'Outra Loja'], [C6, 'Outra Loja'], [C6, 'Loja Modelo']]) {
      r = await sync(`wt-estornos-${pacote}-${loja}`, estorno(C6), estorno(pacote, loja, { quando: AGORA + 1000 }));
      assert.equal(r.itens.length, 2, 'duas chaves bancárias distintas continuam dois estornos reais');
      assert.ok(r.itens.every((i) => i.tipo === 'estorno'));
      assert.equal(r.recibos.length, 0);
    }
    r = await sync('wt-estornos-forte', estorno(C6), estorno(WALLET, 'Loja Modelo', { quando: AGORA + 1000 }));
    assert.equal(r.itens.length, 1, 'A2: somente o estorno bancário entra');
    assert.equal(r.itens[0].avisoIds.length, 1, 'A2: estorno da Wallet não se associa ao banco');
    r = await sync('wt-estornos-sem-final',
      aviso('Estorno', 'Estorno de R$ 25,00 em Loja Modelo'),
      aviso('Estorno', 'Estorno de R$ 25,00 em Loja Modelo', { pacote: WALLET, quando: AGORA + 1000 }));
    assert.equal(r.itens.length, 1, 'A2: Wallet sem final também é ignorada');
    assert.equal(decidir.aplicarAvisos(decidir.CAIXA_VAZIA, diario.itens, AGORA + DIA).itens.length, 2, 'parser legado: sem final não se presume duplicidade');
    ok('WT-R2: estornos reais distintos ficam, par forte é único e par incerto é preservado');

    const primeiro = estorno(C6);
    r = await sync('wt-atualizacao', primeiro, { ...primeiro, id: 'atualizado'.padEnd(64, '0'), quando: AGORA + 1000 });
    assert.equal(r.itens.length, 1, 'mesma chave e identidade atualizada não duplicam');
    r = await sync('wt-chave-reutilizada', primeiro, estorno(C6, 'Outra Loja', { chave: primeiro.chave, quando: AGORA + 1000 }));
    assert.equal(r.itens.length, 2, 'chave reutilizada com outra loja não esconde operação');
    r = await sync('wt-chave-outro-dia', primeiro, estorno(C6, 'Loja Modelo', { chave: primeiro.chave, quando: AGORA + 10 * MIN }));
    assert.equal(r.itens.length, 2, 'chave reutilizada fora da janela não prova a mesma operação');
    ok('atualização da mesma chave exige identidade e prazo; outra loja ou outra operação ficam');

    // Dois bancos candidatos antes da Wallet: não escolher só o primeiro.
    r = await sync('wt-par-ambiguo', compra(C6), compra(NUBANK), compra(WALLET));
    assert.equal(r.itens.length, 2, 'A2: apenas os dois bancos entram');
    assert.equal(decidir.aplicarAvisos(decidir.CAIXA_VAZIA, diario.itens, AGORA + DIA).itens.length, 3, 'parser legado: par ambíguo não escolhe banco');
    for (const outro of [compra(WALLET, 'Outra Loja'), compra(WALLET, 'Loja Modelo', { texto: 'Pix recebido de R$ 25,00 de Loja Modelo final 1234' }), compra(WALLET, 'Loja Modelo', { texto: 'Compra de R$ 25,00 em Loja Modelo final 9999' })]) {
      r = await sync(`wt-identidade-${outro.id}`, compra(C6), outro);
      assert.equal(r.itens.length, 1, 'A2: Wallet é ignorada independentemente da identidade');
      assert.equal(decidir.aplicarAvisos(decidir.CAIXA_VAZIA, diario.itens, AGORA + DIA).itens.length, 2, 'parser legado: loja, direção ou final conflitante não funde');
    }
    ok('pares ambíguos ou com loja/direção/final conflitante continuam separados');

    const item = decidir.aplicarAvisos(decidir.CAIXA_VAZIA, [estorno(NUBANK)], AGORA).itens[0];
    const t = { id: 'confirmado', type: 'out', amount: 25, occurred_on: '2026-11-07', description: 'Loja Modelo', card_id: null };
    const oferta = (tx, cartoes = [], e = item) => decidir.ofertaDoEstorno(e, [tx], cartoes);
    assert.equal(oferta({ ...t, bank: 'c6' }).tipo, 'nenhum');
    assert.equal(oferta(t).tipo, 'nenhum', 'candidato único sem banco não basta');
    assert.equal(oferta({ ...t, description: 'Loja Nubank' }).tipo, 'nenhum', 'nome de loja não identifica banco');
    assert.equal(oferta({ ...t, bank: 'outro' }).tipo, 'nenhum');
    assert.equal(oferta({ ...t, bank: 'nubank' }).tipo, 'remover');
    assert.equal(oferta({ ...t, card_id: 'c' }, [{ id: 'c', bank: 'nubank', last_digits: '1234' }]).tipo, 'remover');
    assert.equal(oferta({ ...t, bank: 'nubank', card_id: 'c' }, [{ id: 'c', bank: 'c6', last_digits: '1234' }]).tipo, 'nenhum');
    assert.equal(oferta({ ...t, bank: 'nubank', card_id: 'c' }, [{ id: 'c', bank: 'nubank', last_digits: '9999' }]).tipo, 'nenhum');
    assert.equal(oferta({ ...t, bank: 'nubank' }, [], { ...item, pacote: WALLET }).tipo, 'nenhum');
    assert.equal(oferta({ ...t, bank: 'nubank' }, [], { ...item, pacote: 'app.desconhecido' }).tipo, 'nenhum');
    assert.equal(chamadas.length, antes, 'sync, recibos e oferta nunca escrevem dinheiro nem apagam lançamentos');
    ok('WT-R5: só oferece confirmado com banco confiável compatível, inclusive cartão; conflito/ausência não oferecem');
  }

  /* Nada some sem a pessoa ver (07/11/2026): vencido só sai depois de visto com "Vence hoje". */
  {
    const compra = COMPRA_UBER({ quando: AGORA });
    await sync('dono-venc', compra);
    const item0 = (await caixa.listarCaixa('dono-venc'))[0];
    assert.equal(decidir.venceHoje(item0, AGORA + 28 * DIA), false, 'antes do último dia não marca');
    assert.equal(decidir.venceHoje(item0, AGORA + 29 * DIA + MIN), true, 'no último dia marca');
    /* Ninguém abriu o app no último dia: passou da validade e o item continua. */
    diario.itens = [];
    let r = await caixa.sincronizarCaixa('dono-venc', AGORA + 40 * DIA);
    assert.equal(r.itens.length, 1, 'vencido e nunca visto marcado continua');
    assert.equal(decidir.venceHoje(r.itens[0], AGORA + 40 * DIA), true, 'e aparece marcado');
    /* A janela o mostra marcado; depois disso a validade o tira. */
    await caixa.registrarVencimentoVisto('dono-venc', AGORA + 40 * DIA);
    r = await caixa.sincronizarCaixa('dono-venc', AGORA + 40 * DIA + MIN);
    assert.equal(r.itens.length, 0, 'visto marcado sai depois do prazo');
    /* Visto no último dia, ainda dentro do prazo: segue até vencer de fato. */
    await sync('dono-venc2', COMPRA_UBER({ quando: AGORA }));
    diario.itens = [];
    await caixa.registrarVencimentoVisto('dono-venc2', AGORA + 29 * DIA + MIN);
    r = await caixa.sincronizarCaixa('dono-venc2', AGORA + 29 * DIA + 2 * MIN);
    assert.equal(r.itens.length, 1, 'visto mas ainda no prazo continua');
    r = await caixa.sincronizarCaixa('dono-venc2', AGORA + 30 * DIA + MIN);
    assert.equal(r.itens.length, 0);
    /* Marcar antes do último dia não vale. */
    await sync('dono-venc3', COMPRA_UBER({ quando: AGORA }));
    diario.itens = [];
    await caixa.registrarVencimentoVisto('dono-venc3', AGORA + 10 * DIA);
    r = await caixa.sincronizarCaixa('dono-venc3', AGORA + 31 * DIA);
    assert.equal(r.itens.length, 1, 'visto cedo demais não conta');
    /* "Não entendi" (7 dias) e estorno (nunca marca). */
    const base = { id: 'x', avisoIds: ['a'], pacote: C6, classe: 'banco', quando: AGORA, data: '2026-11-07' };
    const nao = { ...base, tipo: 'nao_entendi', expiraEm: AGORA + 7 * DIA };
    assert.equal(decidir.venceHoje(nao, AGORA + 6 * DIA + MIN), true);
    assert.equal(decidir.venceHoje(nao, AGORA + 5 * DIA), false);
    let e = decidir.aplicarAvisos({ itens: [nao], vistos: {} }, [], AGORA + 8 * DIA);
    assert.equal(e.itens.length, 1, 'não entendi vencido sem ser visto continua');
    e = decidir.aplicarAvisos(decidir.marcarVencimentoVisto({ itens: [nao], vistos: {} }, AGORA + 8 * DIA), [], AGORA + 8 * DIA);
    assert.equal(e.itens.length, 0, 'não entendi visto marcado sai');
    const est = { ...base, tipo: 'estorno', expiraEm: AGORA + 30 * DIA };
    assert.equal(decidir.venceHoje(est, AGORA + 40 * DIA), false, 'estorno não recebe a marca');
    assert.equal(decidir.aplicarAvisos({ itens: [est], vistos: {} }, [], AGORA + 40 * DIA).itens.length, 0, 'estorno vence como sempre');
    /* Recibos continuam com a validade de hoje. */
    const recibo = { id: 'r', quando: AGORA, expiraEm: AGORA + 7 * DIA, valor: 1, contraparte: null, dataDaCompra: '2026-11-07', dataDoEstorno: '2026-11-07' };
    assert.equal(decidir.aplicarAvisos({ itens: [], vistos: {}, recibos: [recibo] }, [], AGORA + 8 * DIA).recibos, undefined);
    ok('vencimento: item vencido só sai depois de visto com "Vence hoje"; estorno e recibo seguem a validade de sempre');
  }

  /* O listener nativo não publica "Novo aviso para conferir" para recusa, com o
     MESMO padrão do app: os dois textos têm de ser idênticos. */
  {
    const kt = fs.readFileSync(path.join(root, 'modules/grana-avisos/android/src/main/java/com/gabriouss/grana/avisos/AvisosFiltro.kt'), 'utf8');
    const doKotlin = kt.match(/PADRAO_DE_RECUSA = """(.*?)"""/)[1];
    assert.equal(doKotlin, interpretar.RECUSA.source, 'AvisosFiltro.kt divergiu de RECUSA em interpretar.ts');
    const ouvinte = fs.readFileSync(path.join(root, 'modules/grana-avisos/android/src/main/java/com/gabriouss/grana/avisos/GranaAvisosListener.kt'), 'utf8');
    assert.ok(ouvinte.indexOf('AvisosFiltro.ehRecusa(titulo, texto)) return') < ouvinte.indexOf('publicarNotificacao(valor)'));
    assert.ok(ouvinte.indexOf('diario(this).guardar(') < ouvinte.indexOf('AvisosFiltro.ehRecusa('), 'a recusa continua indo ao diário');
    ok('listener nativo usa o mesmo padrão de recusa e não notifica antes de conferir');
  }

  /* Nada aqui toca rede além de gravar.ts. */
  for (const arquivo of ['caixa', 'decidir', 'interpretar']) {
    const fonte = fs.readFileSync(path.join(root, `lib/avisos-banco/${arquivo}.ts`), 'utf8');
    assert.ok(!/supabase|fetch\(|offline-cache|['"]\.\.\/data['"]/.test(fonte), `${arquivo} não pode tocar em rede`);
  }
  ok('caixa, decidir e interpretar continuam sem rede');

  console.log(`\navisos-recusa-estorno: ${passou} ok`);
})().catch((e) => { console.error(e); process.exit(1); });
