/*
 * "Sair da conta" sai sempre, e em tempo limitado.
 *
 *   node __tests__/sair-da-conta.cjs
 *
 * Achado A64 da auditoria no emulador (19/09/2026): o diálogo "Sair" fechava,
 * a tela ficava no Perfil e a conta seguia logada, até depois de reabrir o
 * app. O `signOut` esperava em série, sem prazo, limpezas que são cortesia; a
 * remoção do token push entra na fila do registro do push, que pode ficar
 * parada esperando o pedido de permissão de notificação.
 *
 * O módulo é o de produção (`lib/sair-da-conta.ts`), transpilado em memória.
 * O tempo é do teste: `setTimeout` encurtado faz o prazo de 4 s passar em
 * milissegundos sem mexer na constante de produção. O teste afirma QUAIS
 * etapas rodaram e em que ordem, não só que a função voltou.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

let aprovadas = 0;
function ok(rotulo) { aprovadas++; console.log('  ok  ' + rotulo); }

function carregar() {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(root, 'lib/sair-da-conta.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console, Error, Promise,
    // O prazo real é 4 s; aqui vira 1/100 disso.
    setTimeout: (fn, ms) => setTimeout(fn, Math.max(1, Math.floor(ms / 100))),
    clearTimeout,
    require: (id) => { throw new Error('import nao simulado: ' + id); },
  }, { filename: 'lib/sair-da-conta.ts' });
  return exports;
}

const { sairDaConta, PRAZO_ETAPA_SAIDA_MS } = carregar();
const nunca = () => new Promise(() => {});

function etapasQueAnotam(sobrescrever = {}) {
  const chamadas = [];
  const avisos = [];
  const anotar = (nome, retorno) => async (...args) => { chamadas.push(args.length ? [nome, ...args] : [nome]); return retorno; };
  const etapas = {
    idDoUsuario: anotar('idDoUsuario', 'uid-1'),
    limparVozesDaConta: anotar('limparVozesDaConta'),
    limparWidgets: () => { chamadas.push(['limparWidgets']); },
    esquecerAcesso: anotar('esquecerAcesso'),
    esquecerTelas: anotar('esquecerTelas'),
    /* Etapa acrescentada em 23/09/2026 (achado A1): o cache de leitura dos
       lançamentos vive fora do cache de telas e ficava no aparelho depois da
       saída. */
    esquecerLancamentosLocais: anotar('esquecerLancamentosLocais'),
    removerPush: anotar('removerPush'),
    signOutNoServidor: anotar('signOutNoServidor'),
    esquecerSessaoDoDisco: anotar('esquecerSessaoDoDisco'),
    aplicarSaida: () => { chamadas.push(['aplicarSaida']); },
    avisar: (mensagem) => { avisos.push(mensagem); },
    ...sobrescrever,
  };
  return { etapas, chamadas, avisos, nomes: () => chamadas.map((c) => c[0]) };
}

(async () => {
  assert.equal(PRAZO_ETAPA_SAIDA_MS, 4000);
  ok('o prazo por etapa em produção é de 4 s');

  // ── Caminho feliz: tudo roda, na ordem que importa ─────────────────────
  {
    const t = etapasQueAnotam();
    await sairDaConta(t.etapas);
    const n = t.nomes();
    for (const etapa of ['limparWidgets', 'limparVozesDaConta', 'esquecerAcesso', 'esquecerTelas', 'esquecerLancamentosLocais', 'removerPush', 'signOutNoServidor', 'esquecerSessaoDoDisco', 'aplicarSaida']) {
      assert.ok(n.includes(etapa), `faltou ${etapa}`);
    }
    assert.deepEqual(t.chamadas.find((c) => c[0] === 'limparVozesDaConta'), ['limparVozesDaConta', 'uid-1']);
    assert.ok(n.indexOf('removerPush') < n.indexOf('signOutNoServidor'), 'o token sai antes de o servidor invalidar a sessão');
    assert.ok(n.indexOf('signOutNoServidor') < n.indexOf('esquecerSessaoDoDisco'));
    assert.equal(n[n.length - 1], 'aplicarSaida');
    assert.equal(t.avisos.length, 0);
    ok('sem problema, todas as etapas rodam; token antes do servidor, saída por último');
  }

  // ── O defeito: a remoção do token push nunca volta ─────────────────────
  {
    const t = etapasQueAnotam({ removerPush: nunca });
    const inicio = Date.now();
    await sairDaConta(t.etapas);
    const n = t.nomes();
    assert.ok(n.includes('esquecerSessaoDoDisco') && n.includes('aplicarSaida'), 'a pessoa sai mesmo com o push travado');
    assert.ok(n.includes('signOutNoServidor'), 'o servidor ainda é avisado');
    assert.ok(t.avisos.some((a) => a.includes('remover o token push')), 'o travamento fica no log');
    assert.ok(Date.now() - inicio < 1000, 'e volta dentro do prazo');
    ok('token push que nunca volta: a saída acontece mesmo assim, com aviso no log');
  }

  // ── Todas as cortesias travam, e o servidor também ─────────────────────
  {
    const t = etapasQueAnotam({
      idDoUsuario: nunca, esquecerAcesso: nunca, esquecerTelas: nunca, removerPush: nunca, signOutNoServidor: nunca,
    });
    await sairDaConta(t.etapas);
    assert.deepEqual(t.nomes().slice(-2), ['esquecerSessaoDoDisco', 'aplicarSaida']);
    assert.ok(!t.nomes().includes('limparVozesDaConta'), 'sem dono conhecido, não apaga voz de ninguém');
    ok('tudo travado: a sessão sai do aparelho e da tela do mesmo jeito');
  }

  // ── Etapas que LANÇAM, inclusive a síncrona ────────────────────────────
  {
    const erro = async () => { throw new Error('falhou'); };
    const t = etapasQueAnotam({
      limparWidgets: () => { throw new Error('widget'); },
      esquecerTelas: erro, signOutNoServidor: erro,
    });
    await sairDaConta(t.etapas);
    assert.deepEqual(t.nomes().slice(-2), ['esquecerSessaoDoDisco', 'aplicarSaida']);
    assert.ok(t.avisos.length >= 3);
    ok('etapas que falham viram aviso; nenhuma impede a saída');
  }

  // ── Até apagar do disco travar não segura a tela ───────────────────────
  {
    const t = etapasQueAnotam({ esquecerSessaoDoDisco: nunca });
    await sairDaConta(t.etapas);
    assert.equal(t.nomes()[t.nomes().length - 1], 'aplicarSaida');
    ok('se apagar do disco travar, a tela sai da conta mesmo assim');
  }

  // ── O contexto de autenticação usa este módulo, não uma cópia ──────────
  {
    const ctx = fs.readFileSync(path.join(root, 'lib/auth-context.tsx'), 'utf8');
    assert.ok(/async signOut\(\) \{\s*await sairDaConta\(\{/.test(ctx), 'signOut delega para sairDaConta');
    assert.ok(!/await removerPushHabitoAntesDeSair\(\)/.test(ctx), 'sem espera direta, sem prazo, pelo token push');
    ok('o signOut do app passa pelo módulo com prazo (o código anterior esperava o push direto)');
  }

  console.log(`\n${aprovadas} checagens de sair da conta passaram`);
})().catch((e) => { console.error(e); process.exit(1); });
