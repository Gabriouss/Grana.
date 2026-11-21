/* Item 34 (20/11/2026): o sincronizador dos widgets buscava o histórico
   inteiro mesmo com zero widgets que leem o snapshot, e cada evento abria
   outra busca com a anterior ainda em voo. Executa lib/widgets-home-sync.ts
   REAL (ts.transpileModule + vm) com fontes e ponte nativa falsas, e conta as
   chamadas. Contrato da ponte do 26: dono, privacidade e limpeza valem sempre,
   inclusive com zero widgets e com busca em voo; resultado tardio depois de
   logout/troca de dono não publica; falha conserva o último snapshot.
   WIDGETS_SYNC_FONTE=<arquivo .ts> roda outra versão (baseline RED). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const FONTE = process.env.WIDGETS_SYNC_FONTE || path.join(__dirname, '..', 'lib', 'widgets-home-sync.ts');
let checks = 0;
const check = (v, label) => { assert.ok(v, label); checks++; };
// Sem isto, uma promessa que nunca resolve esvazia o laço e o Node sai com 0 em silêncio.
let concluido = false;
process.on('exit', (code) => { if (!concluido && code === 0) { console.error('widgets-home-sync-coalescencia: terminou sem concluir (promessa pendente)'); process.exitCode = 1; } });
const tick = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
const adiado = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };
const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

function montar() {
  const m = { instalados: { livre: 0, compromisso: 0, cofrinho: 0, voz: 1, central: 1 }, lotes: [], ponte: [] };
  const fonte = (nome) => () => {
    let lote = m.lotes.at(-1);
    if (!lote || lote.fechado || lote[nome]) { lote = { fechado: false }; m.lotes.push(lote); }
    const d = adiado(); lote[nome] = d;
    if (['transacoes', 'contas', 'metas', 'cartoes', 'pagamentos', 'sobra'].every((k) => lote[k])) lote.fechado = true;
    return d.p;
  };
  const api = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(FONTE, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports: api, Promise, Date, String, Array, console: { ...console, error() {} },
    require: (id) => ({
      './data': { fetchTransactions: fonte('transacoes'), fetchBills: fonte('contas'), fetchCreditCards: fonte('cartoes'), fetchCardInvoicePayments: fonte('pagamentos') },
      './goals': { fetchGoals: fonte('metas') },
      './widgets-home-snapshot': { montarSnapshotWidgets: (e) => ({ marca: e.transactions, privacyHidden: e.privacyHidden, userId: e.userId }) },
      './sobra-do-mes': { buscarSobraDoMes: fonte('sobra'), mesLocalDaSobra: mesAtual, sobraParaOLivre: () => 0 },
      '@/modules/grana-voice-widget': {
        widgetDisponivel: true,
        quantidadeInstalada: (tipo) => m.instalados[tipo] ?? 0,
        atualizarSnapshot: (s) => m.ponte.push(['atualizar', s]),
        definirPrivacidade: (h) => m.ponte.push(['privacidade', h]),
        garantirUsuario: (u) => m.ponte.push(['dono', u]),
        limparSnapshot: () => m.ponte.push(['limpar']),
      },
    })[id] ?? assert.fail(`import não simulado ${id}`),
  });
  m.api = api;
  m.responder = (lote, marca) => { for (const k of ['transacoes', 'contas', 'metas', 'cartoes', 'pagamentos', 'sobra']) lote[k].resolve(k === 'transacoes' ? marca : []); };
  m.publicados = () => m.ponte.filter((p) => p[0] === 'atualizar').map((p) => p[1]);
  return m;
}

(async () => {
  // 1. Zero widgets que leem o snapshot: nenhuma busca, mas dono e privacidade valem.
  {
    const m = montar();
    const pendente = m.api.sincronizarWidgetsHome('usuario-a', true); await tick();
    check(m.lotes.length === 0, `zero widgets financeiros, nenhuma busca (${m.lotes.length} lotes)`);
    const r = await pendente;
    check(r === false, 'sem widget, nada publicado');
    check(m.ponte.some((p) => p[0] === 'dono' && p[1] === 'usuario-a') && m.ponte.some((p) => p[0] === 'privacidade' && p[1] === true), 'dono e privacidade aplicados mesmo sem widget');
    m.api.limparSnapshotWidgets();
    check(m.ponte.at(-1)[0] === 'limpar', 'logout limpa mesmo sem widget');
  }

  // 2. Busca retida e novos eventos: uma repetição depois, nunca buscas em paralelo.
  {
    const m = montar();
    m.instalados.livre = 1;
    const primeira = m.api.sincronizarWidgetsHome('usuario-a', false); await tick();
    check(m.lotes.length === 1, 'primeira busca sai');
    const eventos = [m.api.sincronizarWidgetsHome('usuario-a', false), m.api.sincronizarWidgetsHome('usuario-a', false), m.api.sincronizarWidgetsHome('usuario-a', true)];
    await tick();
    check(m.lotes.length === 1, `três eventos com a busca retida não abrem outra (${m.lotes.length} lotes)`);
    check(m.ponte.filter((p) => p[0] === 'privacidade').at(-1)[1] === true, 'ocultar vale na hora, mesmo com busca em voo');
    m.responder(m.lotes[0], 'v1'); await tick();
    check(await primeira === true && m.publicados().length === 1, 'primeira resposta publicada');
    check(m.lotes.length === 2, `uma única repetição depois da resposta (${m.lotes.length} lotes)`);
    m.responder(m.lotes[1], 'v2');
    const fins = await Promise.all(eventos);
    check(fins.every((f) => f === true), 'os três eventos terminam com a repetição');
    const ultimo = m.publicados().at(-1);
    check(ultimo.marca === 'v2' && ultimo.privacyHidden === true, 'snapshot final é o dado novo com a privacidade mais recente');
    check(m.lotes.length === 2, 'nenhuma busca extra depois');
  }

  // 3. Logout e troca de dono durante o voo: resultado tardio não publica; a conta nova busca a sua.
  {
    const m = montar();
    m.instalados.cofrinho = 2;
    const deA = m.api.sincronizarWidgetsHome('usuario-a', false); await tick();
    m.api.limparSnapshotWidgets();
    const deB = m.api.sincronizarWidgetsHome('usuario-b', false); await tick();
    check(m.lotes.length === 2, 'conta nova não espera a busca da conta anterior');
    m.responder(m.lotes[0], 'de-a'); await tick();
    check(await deA === false && !m.publicados().some((s) => s.marca === 'de-a'), 'resposta tardia da conta anterior não publica');
    m.responder(m.lotes[1], 'de-b');
    check(await deB === true && m.publicados().at(-1).userId === 'usuario-b', 'conta nova publica o próprio dado');
  }

  // 4. Falha conserva o último snapshot e a próxima chamada tenta de novo.
  {
    const m = montar();
    m.instalados.compromisso = 1;
    const ok = m.api.sincronizarWidgetsHome('usuario-a', false); await tick();
    m.responder(m.lotes[0], 'bom'); await ok;
    const falha = m.api.sincronizarWidgetsHome('usuario-a', false); await tick();
    m.lotes[1].transacoes.reject(new Error('rede')); for (const k of ['contas', 'metas', 'cartoes', 'pagamentos', 'sobra']) m.lotes[1][k].resolve([]);
    check(await falha === false && m.publicados().length === 1, 'falha não troca o snapshot válido');
    const nova = m.api.sincronizarWidgetsHome('usuario-a', false); await tick();
    check(m.lotes.length === 3, 'depois da falha, nova busca');
    m.responder(m.lotes[2], 'de-novo'); await nova;
  }

  // 5. L1 (revisão do Lynx, 21/11): evento em voo vira a repetição encadeada; a
  //    limpeza da saída chega antes dela. A repetição NÃO pode readotar a conta
  //    que saiu: zero dono, privacidade, busca ou snapshot depois da limpeza.
  {
    const m = montar();
    m.instalados.livre = 1;
    const primeira = m.api.sincronizarWidgetsHome('usuario-a', false); await tick();
    const repeticao = m.api.sincronizarWidgetsHome('usuario-a', false); await tick();
    check(m.lotes.length === 1, 'evento em voo fica como repetição');
    m.api.limparSnapshotWidgets();
    const depoisDaLimpeza = m.ponte.length;
    m.responder(m.lotes[0], 'tardio'); await tick();
    check(await primeira === false, 'busca em voo da conta que saiu não publica');
    // Chamadas conferidas ANTES de esperar a repetição: no defeito ela abre uma busca nova que nunca volta.
    const vazou = m.ponte.slice(depoisDaLimpeza);
    check(vazou.length === 0, `nada chega à ponte depois da limpeza (${JSON.stringify(vazou)})`);
    check(m.lotes.length === 1, `nenhuma busca nova para a conta que saiu (${m.lotes.length} lotes)`);
    check(await repeticao === false, 'repetição encadeada desiste depois da limpeza');
    // A conta seguinte continua sincronizando normalmente.
    const deB = m.api.sincronizarWidgetsHome('usuario-b', false); await tick();
    m.responder(m.lotes[1], 'de-b');
    check(await deB === true && m.publicados().at(-1).userId === 'usuario-b', 'conta seguinte publica o próprio dado');
  }

  concluido = true;
  console.log(`widgets-home-sync-coalescencia: ${checks} verificações ok`);
})().catch((e) => { console.error(e); process.exit(1); });
