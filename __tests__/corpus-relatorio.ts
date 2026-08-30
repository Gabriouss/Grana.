/* O HTML do relatório mensal — a parte pura, sem expo-print nem navegador.
 *
 * Este é o único artefato do Grana. que sai do app: a pessoa imprime, salva e
 * mostra para alguém. Um número errado aqui não aparece como erro de tela,
 * aparece como documento errado na mão de terceiro. E é justamente o arquivo
 * mais difícil de conferir a olho, porque exige gerar, abrir e ler.
 *
 * A seção "Retrospectiva" é a mais nova: ela só existe quando o relatório é
 * pedido de dentro da retrospectiva mensal, e some quando não é.
 */
import { montarHtml } from '../lib/pdf-report-html';
import type { MonthlyWrapped } from '../lib/monthly-wrapped';
import type { Bill, Transaction } from '../lib/types';

let total = 0;
let falhas = 0;

function checar(nome: string, condicao: boolean, detalhe = '') {
  total += 1;
  if (!condicao) {
    falhas += 1;
    console.log(`  FALHA  ${nome}${detalhe ? '\n         ' + detalhe : ''}`);
  }
}

function tx(campos: Partial<Transaction> & { id: string; occurred_on: string; amount: number }): Transaction {
  return {
    user_id: 'u', type: 'out', description: 'Compra', category: 'Alimentação', color: '#bb6b60',
    recurring: false, parent_id: null, created_at: `${campos.occurred_on}T12:00:00Z`,
    ...campos,
  } as Transaction;
}

const transacoes: Transaction[] = [
  tx({ id: '1', occurred_on: '2026-07-03', amount: 4000, type: 'in', description: 'Salário', category: 'Salário' }),
  tx({ id: '2', occurred_on: '2026-07-05', amount: 1200, description: 'Aluguel', category: 'Moradia' }),
  tx({ id: '3', occurred_on: '2026-07-11', amount: 350, description: 'Mercado' }),
  tx({ id: '4', occurred_on: '2026-07-19', amount: 90, description: 'Farmácia', category: 'Saúde' }),
  // Mês anterior, para a comparação existir.
  tx({ id: '5', occurred_on: '2026-06-10', amount: 1000, description: 'Aluguel', category: 'Moradia' }),
];
const contas: Bill[] = [];

const wrapped: MonthlyWrapped = {
  ano: 2026, mes: 6, chave: '2026-07', label: 'Julho de 2026',
  entradas: 4000, saidas: 1640, saldo: 2360,
  taxaPoupanca: 0.59, totalLancamentos: 4,
  maiorDespesa: transacoes[1],
  categoriaCampea: { nome: 'Moradia', cor: '#93739e', total: 1200, fatiaDasSaidas: 0.73, orcamento: 1000, usoDoOrcamento: 1.2 },
  boletosPagos: 0, valorBoletosPagos: 0,
  saidasMesAnterior: 1000, comprometidoFixo: 0,
  diasComRegistro: 4, diasNoMes: 31,
  level: { xp: 720, level: 5, elo: { key: 'construtor', title: 'Construtor', minLevel: 5, icone: 'construct-outline' }, nextElo: null, xpAtualNoLevel: 24, xpParaProximoLevel: 100, progressoLevel: 0.24 },
  vazio: false,
} as MonthlyWrapped;

const base = { ano: 2026, mes: 6, transactions: transacoes, bills: contas, carteira: 'Total' };

// ── Sem retrospectiva: a seção não existe ─────────────────────────────────
{
  const html = montarHtml(base);
  checar('sem retrospectiva, a seção não aparece', !html.includes('Retrospectiva de'));
  checar('o relatório continua saindo', html.includes('Balanço consolidado'));
  checar('a marca está no documento', html.includes('Grana<span>.</span>'));
}

// ── Com retrospectiva: a seção aparece com os números certos ──────────────
{
  const html = montarHtml({ ...base, wrapped });

  checar('a seção aparece com o mês no título', html.includes('Retrospectiva de Julho de 2026'));
  checar('a fatia da renda que sobrou sai em porcentagem', html.includes('59%'));
  checar('a categoria campeã é nomeada', html.includes('Categoria que mais pesou: Moradia'));
  checar('o teto definido pela pessoa aparece', html.includes('R$ 1.000,00'));
  checar('e o quanto passou dele', html.includes('acima em'));
  checar('a comparação com o mês anterior aparece', html.includes('Comparado ao mês anterior'));
  checar('a variação é +64% (1.640 contra 1.000)', html.includes('+ 64%'), 'esperava "+ 64%" no documento');
  checar('o nível alcançado aparece', html.includes('Nível 5') && html.includes('Construtor'));

  /* Nenhum emoji no papel. Desde a rodada de tom eles saíram também da tela,
     mas o documento é onde isso mais pesa: um ícone colorido do sistema
     operacional num relatório impresso denuncia app de jogo. */
  checar('nenhum emoji no documento', !/[🌀-🫿]/u.test(html));

  /* Não repetir o que a "Leitura do mês" já diz. */
  const secaoRetro = html.slice(html.indexOf('Retrospectiva de'));
  checar('a retrospectiva não repete a constância do registro', !secaoRetro.includes('Constância'));
  checar('a retrospectiva não repete a maior saída isolada', !secaoRetro.includes('Maior saída'));
}

// ── Dados ausentes não viram número inventado ─────────────────────────────
{
  const semRenda = { ...wrapped, taxaPoupanca: null, saidasMesAnterior: null, categoriaCampea: null } as MonthlyWrapped;
  const html = montarHtml({ ...base, wrapped: semRenda });
  checar('sem renda no mês, a fatia poupada some', !html.includes('Fatia da renda'));
  checar('sem mês anterior, a comparação some', !html.includes('Comparado ao mês anterior'));
  checar('sem categoria campeã, a linha some', !html.includes('Categoria que mais pesou'));
  checar('mas a seção continua existindo pelo nível', html.includes('Retrospectiva de'));
}

// ── Escape de HTML: descrição é texto de usuário ──────────────────────────
{
  const perigosa = [tx({ id: 'x', occurred_on: '2026-07-02', amount: 10, description: '<script>alert(1)</script>' })];
  const html = montarHtml({ ...base, transactions: perigosa });
  checar('descrição do usuário é escapada', !html.includes('<script>alert(1)</script>'));
  checar('e o texto continua legível escapado', html.includes('&lt;script&gt;'));
}

console.log(`\n${total - falhas}/${total} checagens do relatório passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
