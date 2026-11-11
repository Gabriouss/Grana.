// Módulos reais; contagem de leituras/Map/data e referências retidas, sem depender de tempo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const raiz = path.resolve(__dirname, '..');
const compilados = new Map();
const N = 3200;
const tx = (id, extra = {}) => ({ id, user_id: 'a', wallet_id: 'p', type: 'out', amount: 37.42,
  occurred_on: '2026-10-05', description: 'Pix', category: 'Outros', color: '#123456',
  payment_method: 'pix', card_id: null, recurring: false, parent_id: null, ...extra });
const linha = (id, extra = {}) => ({ id, fitid: 'pix-fixture:' + id, idBanco: id,
  data: '2026-10-05', centavos: 3742, direcao: 'out', descricao: 'Pix enviado',
  categoria: 'Outros', cor: '#123456', natureza: 'movimento', ...extra });

function carregar(fonteDir = process.env.PIX_INDICES_FONTE_DIR) {
  const c = { leituras: 0, mapas: 0, datas: 0, teto: Infinity, consultas: [], rpcs: [], hashes: 0, efeitos: 0 };
  const cache = new Map();
  function contar(campo) {
    c[campo]++;
    const custo = c.leituras + c.mapas + c.datas;
    assert.ok(custo <= c.teto, `orçamento determinístico excedido: ${custo} > ${c.teto} operações`);
  }
  class MapaContado extends Map {
    get(k) { contar('mapas'); return super.get(k); }
    set(k, v) { contar('mapas'); return super.set(k, v); }
    has(k) { contar('mapas'); return super.has(k); }
  }
  class DataContada extends Date {
    static parse(s) { contar('datas'); return Date.parse(s); }
  }
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'a' }, access_token: 'fixture' } }, error: null }),
      getUser: async () => ({ data: { user: { id: 'a' } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from(tabela) {
      let de = 0, ate = 999;
      const q = {
        select() { return q; },
        eq(k, v) { assert.equal(k, 'user_id'); assert.equal(v, 'a'); return q; },
        order(k) { assert.equal(k, 'id'); return q; },
        range(inicio, fim) { de = inicio; ate = fim; return q; },
        setHeader(k, v) {
          assert.equal(k, 'Authorization'); assert.equal(v, 'Bearer fixture');
          c.consultas.push({ tabela, de, ate });
          const lista = tabela === 'wallets' ? [{ id: 'p', user_id: 'a', is_default: true, created_at: '2026-01-01' }] : c.transacoes;
          return Promise.resolve({ data: lista.slice(de, ate + 1), error: null });
        },
      };
      return q;
    },
    rpc(nome) {
      c.rpcs.push(nome);
      assert.equal(nome, 'obter_estado_acesso', 'a prévia não escreve nem confirma lote');
      return { setHeader: async () => ({ data: { allowed: true }, error: null }) };
    },
  };
  function real(arquivo) {
    arquivo = path.resolve(arquivo);
    if (cache.has(arquivo)) return cache.get(arquivo);
    const nome = path.basename(arquivo);
    const fonte = fonteDir && ['conciliacao-pix.ts', 'conciliacao-pix-servico.ts'].includes(nome)
      ? path.join(fonteDir, nome) : arquivo;
    if (!compilados.has(fonte)) compilados.set(fonte, ts.transpileModule(fs.readFileSync(fonte, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
    const api = {};
    cache.set(arquivo, api);
    vm.runInNewContext(compilados.get(fonte), {
      exports: api, console, Date: DataContada, Map: MapaContado,
      require(id) {
        if (id === 'expo-crypto') return {
          CryptoDigestAlgorithm: { SHA256: 'sha256' },
          digestStringAsync: async (alg, s) => { c.hashes++; return crypto.createHash(alg).update(s).digest('hex'); },
        };
        if (id === './supabase') return { supabase };
        if (['./lancamentos-alterados', './cache-de-tela', './widgets-home-events'].includes(id)) return {
          marcarLancamentosAlterados() { c.efeitos++; }, invalidarRespostasAtrasadas() { c.efeitos++; },
          notificarDadosDosWidgetsAlterados() { c.efeitos++; },
        };
        if (id.startsWith('.')) return real(path.resolve(path.dirname(arquivo), id + '.ts'));
        throw new Error('Fronteira inesperada: ' + id);
      },
    }, { filename: fonte });
    return api;
  }
  const api = real(path.join(raiz, 'lib/conciliacao-pix.ts'));
  const servico = real(path.join(raiz, 'lib/conciliacao-pix-servico.ts'));
  return {
    c, api, servico,
    observar: objetos => objetos.map(o => new Proxy(o, { get(alvo, k, r) { contar('leituras'); return Reflect.get(alvo, k, r); } })),
    zerar(teto = Infinity) { c.leituras = c.mapas = c.datas = 0; c.teto = teto; },
    medir() { return { leituras: c.leituras, mapas: c.mapas, datas: c.datas, total: c.leituras + c.mapas + c.datas }; },
  };
}
const op = (linhas, lancamentos) => ({ userId: 'a', carteiraId: 'p', principalId: 'p', linhas, lancamentos });
const resumo = resultados => Array.from(resultados, r => ({ linha: r.linha.id, status: r.status,
  motivo: r.motivo, alvo: r.alvo?.id, candidatos: Array.from(r.candidatos, t => t.id) }));

function funcionais() {
  const h = carregar();
  const casos = [
    op([linha('a')], [tx('1')]),
    op([linha('a')], [tx('1', { occurred_on: '2026-10-06' })]),
    op([linha('a')], [tx('primeiro', { occurred_on: '2026-10-07' }), tx('segundo', { occurred_on: '2026-10-02' }), tx('terceiro')]),
    op([linha('a')], [tx('antigo', { occurred_on: '2026-10-01' }), tx('longe', { occurred_on: '2026-10-09' })]),
    op([linha('a'), linha('b')], [tx('unico')]),
    op([linha('a'), linha('b')], [tx('forte', { fitid: 'pix-fixture:a' }), tx('incerto')]),
    op([linha('a')], [tx('conflito', { fitid: 'pix-fixture:a', amount: 1 })]),
    op([linha('a')], [tx('outro-fitid', { fitid: 'outro' })]),
    op([linha('a')], [tx('outro-dono', { user_id: 'b' }), tx('outra-carteira', { wallet_id: 'q' }), tx('credito', { card_id: 'c', wallet_id: 'q' })]),
    op([linha('a')], [tx('legado', { wallet_id: null })]),
    op([linha('a'), linha('a')], []),
    op([linha('a'), linha('b')], [tx('mesmo-id'), tx('mesmo-id')]),
    op([linha('a', { data: '2026-01-01' })], [tx('menos3', { occurred_on: '2025-12-29' }), tx('mais3', { occurred_on: '2026-01-04' }), tx('mais4', { occurred_on: '2026-01-05' })]),
    op([linha('a', { data: '2026-03-01' })], [tx('fevereiro', { occurred_on: '2026-02-28', recurring: true })]),
    op([linha('a', { data: '2026-03-01' })], [tx('parcela', { occurred_on: '2026-02-28', recurring: true, installment_total: 2 })]),
    op([linha('a')], [tx('fatura', { occurred_on: '2026-10-06', description: 'Pagamento de fatura' })]),
    op([linha('a')], [tx('infinito', { amount: Infinity }), tx('nan', { amount: NaN }), tx('entrada', { type: 'in' })]),
  ];
  const original = linha('origem'), estorno = linha('volta', { direcao: 'in', natureza: 'estorno', idOriginal: 'origem' });
  casos.push(op([original, estorno], []), op([original, estorno], [tx('ja-lancado')]),
    op([original, estorno, linha('outra-volta', { ...estorno, id: 'outra-volta', fitid: 'outra-volta' })], []),
    op([original, { ...estorno, centavos: 1 }], []), op([original, { ...estorno, data: '2026-10-04' }], []),
    op([original, { ...original, id: 'origem2', fitid: 'outra-identidade' }, estorno], []),
    op([linha('a', { idBanco: null }), linha('b', { idBanco: null, direcao: 'in', natureza: 'estorno' })], []));
  for (const natureza of ['cofrinho', 'fatura', 'transferencia', 'estorno']) casos.push(op([linha('a', { natureza })], []));
  const repetida = linha('a');
  casos.push(op([repetida, repetida], []));
  const salvos = casos.map(caso => h.api.conciliarPix(caso));
  assert.equal(salvos[0][0].status, 'conciliado');
  assert.equal(salvos[1][0].status, 'data');
  assert.deepEqual(Array.from(salvos[2][0].candidatos, t => t.id), ['primeiro', 'segundo', 'terceiro'], 'ordem do histórico preservada entre dias');
  assert.equal(salvos[3][0].status, 'falta');
  assert.ok(salvos[4].every(r => r.status === 'revisar'), 'ocorrências legítimas não se fundem');
  assert.deepEqual(Array.from(salvos[5], r => r.status), ['conciliado', 'revisar']);
  assert.equal(salvos[8][0].status, 'revisar', 'crédito de outra carteira continua impedindo criação automática');
  assert.equal(salvos[9][0].status, 'conciliado');
  assert.ok(salvos[10].every(r => r.status === 'revisar'));
  assert.deepEqual(Array.from(salvos[12][0].candidatos, t => t.id), ['menos3', 'mais3']);
  assert.equal(salvos[13][0].status, 'revisar');
  assert.equal(salvos[14][0].status, 'data');
  assert.ok(salvos[17].every(r => r.status === 'ignorar'));
  assert.ok(salvos[18].every(r => r.status === 'revisar'));
  assert.ok(salvos[19].every(r => r.status === 'revisar'));
  let diferenciais = 0;
  if (process.env.PIX_INDICES_BASELINE_DIR) {
    const baseline = carregar(process.env.PIX_INDICES_BASELINE_DIR);
    let semente = 57;
    const sorteio = n => { semente = (Math.imul(semente, 1664525) + 1013904223) >>> 0; return semente % n; };
    for (let i = 0; i < 160; i++) {
      const linhas = Array.from({ length: 1 + sorteio(9) }, (_, k) => linha(String(k), {
        fitid: sorteio(7) ? 'f-' + k : '', idBanco: sorteio(4) ? 'b-' + k : null,
        idOriginal: sorteio(3) ? null : 'b-' + sorteio(3), centavos: 100 * (1 + sorteio(3)),
        data: '2026-10-0' + (2 + sorteio(7)), direcao: sorteio(2) ? 'in' : 'out',
        natureza: ['movimento', 'cofrinho', 'estorno', 'fatura', 'transferencia'][sorteio(5)],
      }));
      const transacoes = Array.from({ length: sorteio(10) }, (_, k) => tx(String(k), {
        fitid: sorteio(3) ? null : 'f-' + sorteio(linhas.length), amount: 1 + sorteio(3),
        type: sorteio(2) ? 'in' : 'out', occurred_on: '2026-10-0' + (1 + sorteio(9)),
        user_id: sorteio(5) ? 'a' : 'b', wallet_id: ['p', 'q', null][sorteio(3)],
        recurring: sorteio(3) === 0, parent_id: sorteio(3) ? null : 'pai',
        installment_total: sorteio(3) ? 1 : 2, payment_method: sorteio(4) ? 'pix' : 'credit',
      }));
      casos.push(op(linhas, transacoes));
    }
    for (const caso of casos) {
      const antes = JSON.stringify(caso);
      const esperado = baseline.api.conciliarPix(caso), atual = h.api.conciliarPix(caso);
      assert.deepEqual(resumo(atual), resumo(esperado));
      atual.forEach((r, i) => {
        assert.equal(r.linha, esperado[i].linha);
        assert.equal(r.alvo, esperado[i].alvo);
        r.candidatos.forEach((t, j) => assert.equal(t, esperado[i].candidatos[j]));
      });
      assert.equal(JSON.stringify(caso), antes, 'não muta nem consome os dados de entrada');
      diferenciais++;
    }
  }
  console.log(`funcionais: ${salvos.length} casos explícitos, ${diferenciais} diferenciais com módulo original`);
}

function complexidade() {
  for (const cenario of ['fitid', 'denso', 'credito-ausente', 'estorno']) {
    const h = carregar();
    let linhas = Array.from({ length: N }, (_, i) => linha(String(i)));
    let transacoes = Array.from({ length: N }, (_, i) => tx(String(i)));
    if (cenario === 'fitid') transacoes = transacoes.map((t, i) => ({ ...t, fitid: linhas[i].fitid }));
    if (cenario === 'credito-ausente') {
      transacoes = transacoes.map(t => ({ ...t, card_id: 'c', payment_method: 'credit' }));
      linhas = linhas.map(l => ({ ...l, centavos: 3743 }));
    }
    if (cenario === 'estorno') {
      transacoes = [];
      linhas = Array.from({ length: N / 2 }, (_, i) => [linha('a-' + i), linha('e-' + i, {
        direcao: 'in', natureza: 'estorno', idOriginal: 'a-' + i,
      })]).flat();
    }
    const entrada = op(h.observar(linhas), h.observar(transacoes));
    h.zerar(200 * N);
    const resultados = h.api.conciliarPix(entrada);
    const medidas = h.medir();
    assert.equal(resultados.length, N);
    const status = { fitid: 'conciliado', denso: 'revisar', 'credito-ausente': 'falta', estorno: 'ignorar' }[cenario];
    assert.ok(resultados.every(r => r.status === status), cenario + ': sem alterar desfecho');
    console.log(cenario, JSON.stringify(medidas), 'teto', 200 * N);
  }
}

function retencao() {
  const h = carregar();
  const transacoes = Array.from({ length: N }, (_, i) => tx(String(i)));
  const linhas = Array.from({ length: N }, (_, i) => linha(String(i)));
  const resultados = h.api.conciliarPix(op(linhas, transacoes));
  assert.equal(resultados.length, N);
  assert.ok(resultados.every(r => r.status === 'revisar' && r.candidatos.length === N));
  const listas = new Set(resultados.map(r => r.candidatos));
  const referencias = [...listas].reduce((n, lista) => n + lista.length, 0);
  console.log('retenção determinística:', JSON.stringify({ linhas: N, candidatos: N, listas: listas.size, referencias }));
  assert.equal(listas.size, 1, 'mesmo grupo de candidatos deve ser retido uma única vez');
  assert.equal(referencias, N, 'não reter matriz N × N');
  resultados[0].candidatos.forEach((t, i) => assert.equal(t, transacoes[i], 'ordem e ocorrência original conservadas'));
}

async function servico() {
  const h = carregar();
  h.c.transacoes = Array.from({ length: N }, (_, i) => tx(String(i)));
  const texto = 'Data;Descrição;Valor;ID\n' + Array.from({ length: N }, (_, i) => `05/10/2026;Pix enviado;-37,42;b-${i}`).join('\n');
  const analise = await h.servico.analisarExtratoPix({ userId: 'a', carteiraId: 'p', origemConta: 'Banco fixture', texto });
  assert.equal(analise.resultados.length, N, 'parser e serviço reais não cortam linhas');
  assert.ok(analise.resultados.every(r => r.status === 'revisar' && r.candidatos.length === N));
  assert.equal(new Set(analise.resultados.map(r => r.candidatos)).size, 1, 'serviço entrega grupos compartilhados');
  assert.equal(h.c.hashes, N + 1, 'identidade bancária continua sendo SHA-256 por origem/linha');
  const origem = crypto.createHash('sha256').update(JSON.stringify(['a', 'p', 'banco fixture'])).digest('hex');
  const identidade = crypto.createHash('sha256').update(JSON.stringify(['id', 'b-0'])).digest('hex');
  assert.equal(analise.resultados[0].linha.fitid, `pix1:${origem}:${identidade}`);
  assert.equal(h.c.consultas.filter(q => q.tabela === 'transactions').length, 4, 'histórico real paginado por mil, completo');
  assert.deepEqual(h.c.rpcs, ['obter_estado_acesso']);
  assert.equal(h.c.efeitos, 0, 'prévia sem escrita ou invalidar telas');
  analise.cancelar();
  console.log('serviço real: 3200 linhas/candidatos, identidades/ordem/paginação e prévia sem escrita preservadas');
}

const watchdog = setTimeout(() => { console.error('Focal de índices não concluiu'); process.exit(1); }, 45000);
(async () => {
  const modo = process.argv[2] || '--todos';
  assert.ok(['--todos', '--funcionais', '--complexidade', '--retencao', '--servico'].includes(modo), 'modo desconhecido');
  if (['--todos', '--funcionais'].includes(modo)) funcionais();
  if (['--todos', '--complexidade'].includes(modo)) complexidade();
  if (['--todos', '--retencao'].includes(modo)) retencao();
  if (['--todos', '--servico'].includes(modo)) await servico();
})().then(() => clearTimeout(watchdog), erro => { clearTimeout(watchdog); console.error(erro); process.exitCode = 1; });
