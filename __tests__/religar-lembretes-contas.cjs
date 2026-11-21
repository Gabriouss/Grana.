/*
 * Religar os lembretes de contas pelo Perfil deixa recibo quando falha (L5,
 * 21/11/2026).
 *
 *   node __tests__/religar-lembretes-contas.cjs
 *
 * O ramo de religar em `app/(app)/perfil.tsx` disparava os agendamentos com
 * `.catch(() => {})` e envolvia as consultas num `catch {}` sem log. Sem rede,
 * o controle ficava "ligado" e nenhum lembrete era agendado, sem recibo.
 *
 * Módulo real: lib/religar-lembretes-contas.ts, chamado com os dublês das
 * consultas e do agendador. Afirma QUAIS agendamentos aconteceram e o
 * desfecho devolvido; e confere no Perfil que o desfecho vira log e janela.
 *
 * RED de base: RAIZ_DO_MODULO aponta para um `git archive` do HEAD anterior.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = process.env.RAIZ_DO_MODULO || path.join(__dirname, '..');
let checagens = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); checagens++; console.log('  ok  ' + nome); };

function carregar(arquivo) {
  const js = ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (id) => { throw new Error(`import inesperado: ${id}`); }, Promise }, { filename: arquivo });
  return exports;
}

function montar(op = {}) {
  const feitos = [];
  const deps = {
    suportado: () => op.suportado ?? true,
    buscar: async () => {
      feitos.push('buscar');
      if (op.semRede) throw new Error('Network request failed');
      return {
        contas: [{ id: 'c1' }, { id: 'c2' }],
        faturas: [{ cartao: { id: 'k1' }, year: 2026, month: 11, restante: 120 }, { cartao: { id: 'k2' }, year: 2026, month: 11, restante: 0 }],
      };
    },
    pedirPermissao: async () => { feitos.push('permissao'); return op.permitido ?? true; },
    agendarConta: async (conta) => { feitos.push('conta:' + conta.id); if (op.falhaConta === conta.id) throw new Error('SDK recusou'); },
    agendarFatura: async (cartao, ano, mes, restante) => { feitos.push(`fatura:${cartao.id}:${ano}-${mes}:${restante}`); },
    cancelarFatura: async (id, ano, mes) => { feitos.push(`cancelar:${id}:${ano}-${mes}`); },
  };
  return { deps, feitos };
}

async function principal() {
  const { religarLembretesDeContas } = carregar('lib/religar-lembretes-contas.ts');

  {
    const { deps, feitos } = montar();
    const r = await religarLembretesDeContas(deps);
    ok(r.situacao === 'ok', 'tudo certo: desfecho ok');
    ok(JSON.stringify(feitos) === JSON.stringify(['buscar', 'permissao', 'conta:c1', 'conta:c2', 'fatura:k1:2026-11:120', 'cancelar:k2:2026-11']),
      'agenda as duas contas, a fatura em aberto e cancela a quitada');
  }
  {
    const { deps, feitos } = montar({ semRede: true });
    const r = await religarLembretesDeContas(deps);
    ok(r.situacao === 'falhou' && /Network/.test(String(r.erro && r.erro.message)), 'sem rede: desfecho falhou com o erro, não silêncio');
    ok(feitos.length === 1, 'sem rede: nada é agendado');
  }
  {
    const { deps, feitos } = montar({ falhaConta: 'c2' });
    const r = await religarLembretesDeContas(deps);
    ok(r.situacao === 'falhou' && r.falhas === 1, 'um agendamento recusado: falhou com a contagem');
    ok(feitos.includes('conta:c1') && feitos.includes('fatura:k1:2026-11:120'), 'a recusa de um não impede os outros');
  }
  {
    const { deps, feitos } = montar({ permitido: false });
    const r = await religarLembretesDeContas(deps);
    ok(r.situacao === 'sem-permissao' && !feitos.some((f) => f.startsWith('conta:')), 'permissão negada: desfecho próprio, nada agendado');
  }
  {
    const { deps, feitos } = montar({ suportado: false });
    const r = await religarLembretesDeContas(deps);
    ok(r.situacao === 'indisponivel' && feitos.length === 0, 'web ou Expo Go: indisponível, sem consulta e sem aviso');
  }

  // O Perfil transforma o desfecho em log e janela, e não engole mais falha.
  const perfil = fs.readFileSync(path.join(root, 'app/(app)/perfil.tsx'), 'utf8');
  const inicio = perfil.indexOf("} else if ('lembretesContasAtivo' in mudanca)");
  const ramo = perfil.slice(inicio, perfil.indexOf('function abrirEdicaoNome', inicio));
  ok(inicio > 0 && /religarLembretesDeContas\(/.test(ramo), 'Perfil religa pelo módulo');
  ok(!/\.catch\(\(\) => \{\}\)/.test(ramo) && !/catch \{/.test(ramo), 'ramo de religar sem catch vazio');
  ok(/situacao === 'falhou'[\s\S]*console\.error[\s\S]*Alert\.alert/.test(ramo), 'falha: console.error e janela flutuante');
  ok(/situacao === 'sem-permissao'[\s\S]*console\.warn[\s\S]*Alert\.alert/.test(ramo), 'permissão negada: log e janela flutuante');

  console.log(`\n${checagens} verificações passaram.`);
}
principal().catch((e) => { console.error(e); process.exitCode = 1; });
