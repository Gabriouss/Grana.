/* Geração de ocorrências recorrentes — a regra pura, sem banco.
 *
 * Este corpus existe por um motivo específico: `ocorrenciasFaltantes` é a
 * função que decide CRIAR lançamento de dinheiro, e a idempotência dela
 * depende inteiramente de receber o histórico da série INTEIRA. Alimentá-la
 * com um recorte (o mês visível, por exemplo) faz cada mês ausente parecer
 * um mês a preencher, e o resultado não é um erro na tela: é lançamento
 * duplicado no extrato de quem usa o app.
 *
 * O caso "histórico recortado" abaixo é o guarda dessa armadilha. Ele não
 * descreve o comportamento desejado: descreve o estrago, para que ninguém
 * ligue esta função a uma busca por período sem perceber.
 */
import { ocorrenciasFaltantes } from '../lib/recorrencia';
import type { Transaction } from '../lib/types';

let total = 0;
let falhas = 0;

function checar(nome: string, recebido: unknown, esperado: unknown) {
  total += 1;
  if (JSON.stringify(recebido) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  FALHA  ${nome}\n         esperado: ${JSON.stringify(esperado)}\n         recebido: ${JSON.stringify(recebido)}`);
  }
}

/** Transação mínima; só os campos que a regra lê importam. */
function tx(campos: Partial<Transaction> & { id: string; occurred_on: string }): Transaction {
  return {
    user_id: 'u', type: 'out', description: 'Assinatura', amount: 30, category: 'Assinaturas',
    color: '#d3b869', recurring: false, parent_id: null, created_at: '2026-01-01T00:00:00Z',
    ...campos,
  } as Transaction;
}

const cabeca = tx({ id: 'serie-1', occurred_on: '2026-01-10', recurring: true });
const meses = (r: { occurred_on: string }[]) => r.map((f) => f.occurred_on).sort();

// Série que nunca gerou nada: precisa preencher fevereiro a maio.
checar(
  'cabeça sozinha gera todos os meses até hoje',
  meses(ocorrenciasFaltantes([cabeca], '2026-05-20')),
  ['2026-02-10', '2026-03-10', '2026-04-10', '2026-05-10']
);

// Idempotência: com as ocorrências já criadas, não gera nada de novo.
const jaCriadas = [
  cabeca,
  tx({ id: 'o1', occurred_on: '2026-02-10', parent_id: 'serie-1' }),
  tx({ id: 'o2', occurred_on: '2026-03-10', parent_id: 'serie-1' }),
  tx({ id: 'o3', occurred_on: '2026-04-10', parent_id: 'serie-1' }),
  tx({ id: 'o4', occurred_on: '2026-05-10', parent_id: 'serie-1' }),
];
checar('série completa não gera nada', ocorrenciasFaltantes(jaCriadas, '2026-05-20').length, 0);
checar(
  'rodar de novo no mesmo dia continua não gerando nada',
  ocorrenciasFaltantes(jaCriadas, '2026-05-20').length,
  0
);

// Buraco no meio: só o mês que falta.
checar(
  'preenche apenas o mês que falta',
  meses(ocorrenciasFaltantes(jaCriadas.filter((t) => t.id !== 'o3'), '2026-05-20')),
  ['2026-04-10']
);

/* ── O guarda da armadilha ─────────────────────────────────────────────────
   Mesma série, mesmo dia, mas recebendo só o mês visível: a função passa a
   enxergar quatro meses vazios e manda criar os quatro de novo. Se algum dia
   a tela de Lançamentos passar a buscar por período, é ESTE caso que explica
   por que a geração de recorrência precisa continuar recebendo o contexto
   completo (`fetchRecurrenceContext` em lib/data.ts). */
const soUmMes = jaCriadas.filter((t) => t.occurred_on.startsWith('2026-05') || t.id === 'serie-1');
checar(
  'histórico recortado faria a função duplicar meses já lançados',
  meses(ocorrenciasFaltantes(soUmMes, '2026-05-20')),
  ['2026-02-10', '2026-03-10', '2026-04-10']
);

// Recorrência desligada na cabeça: para de gerar, sem apagar o que existe.
checar(
  'cabeça sem recurring não gera',
  ocorrenciasFaltantes([tx({ id: 'serie-1', occurred_on: '2026-01-10', recurring: false })], '2026-05-20').length,
  0
);

// Parcelamento não é assinatura, mesmo com recurring marcado por engano.
checar(
  'compra parcelada não é tratada como série recorrente',
  ocorrenciasFaltantes(
    [tx({ id: 'p1', occurred_on: '2026-01-10', recurring: true, installment_total: 3, installment_current: 1 })],
    '2026-05-20'
  ).length,
  0
);

// Série que começa no mês corrente ou no futuro não gera nada.
checar(
  'série do mês corrente não gera',
  ocorrenciasFaltantes([tx({ id: 's', occurred_on: '2026-05-03', recurring: true })], '2026-05-20').length,
  0
);
checar(
  'série futura não gera',
  ocorrenciasFaltantes([tx({ id: 's', occurred_on: '2026-08-03', recurring: true })], '2026-05-20').length,
  0
);

// Teto retroativo: uma assinatura antiga não despeja anos de lançamentos.
{
  const antiga = tx({ id: 'velha', occurred_on: '2020-01-15', recurring: true });
  const gerados = ocorrenciasFaltantes([antiga], '2026-05-20');
  checar('assinatura antiga respeita o teto de 24 meses', gerados.length, 24);
  checar('o mais antigo gerado é 24 meses antes de hoje', meses(gerados)[0], '2024-06-15');
  checar('o mais recente gerado é o mês corrente', meses(gerados)[gerados.length - 1], '2026-05-15');
}

// Duas séries independentes não se confundem.
{
  const a = tx({ id: 'A', occurred_on: '2026-01-10', recurring: true });
  const b = tx({ id: 'B', occurred_on: '2026-01-20', recurring: true });
  const comFilhoDeA = [a, b, tx({ id: 'a1', occurred_on: '2026-02-10', parent_id: 'A' })];
  const r = ocorrenciasFaltantes(comFilhoDeA, '2026-02-25');
  checar('série A já preenchida não gera', r.filter((f) => f.cabeca.id === 'A').length, 0);
  checar('série B ainda gera fevereiro', meses(r.filter((f) => f.cabeca.id === 'B')), ['2026-02-20']);
}

// Dia que não existe no mês de destino cai no último dia disponível.
checar(
  'dia 31 vira o último dia de fevereiro',
  meses(ocorrenciasFaltantes([tx({ id: 'd', occurred_on: '2026-01-31', recurring: true })], '2026-02-15')),
  ['2026-02-28']
);

console.log(`\n${total - falhas}/${total} checagens de recorrência passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
