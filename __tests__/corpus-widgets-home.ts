import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { acaoInicialPendente, acaoParaParams, parseDeepLink } from '../lib/deep-links';
import { redirectSystemPath } from '../app/+native-intent';
import { montarSnapshotWidgets, selecionarCofrinho, selecionarProximoCompromisso } from '../lib/widgets-home-snapshot';
import type { Bill, Goal, Transaction } from '../lib/types';

const hoje = new Date(2026, 8, 4, 12, 0, 0);

const tx = (parcial: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'type'>): Transaction => ({
  user_id: 'u1',
  description: parcial.id,
  category: 'Outros',
  color: '#8b9198',
  occurred_on: '2026-09-04',
  recurring: false,
  parent_id: null,
  created_at: '2026-09-04T12:00:00.000Z',
  ...parcial,
});

const bill = (parcial: Partial<Bill> & Pick<Bill, 'id' | 'due_date'>): Bill => ({
  user_id: 'u1',
  description: parcial.id,
  amount: 100,
  category: 'Moradia',
  color: '#93739e',
  status: 'due',
  recurring: false,
  paid_transaction_id: null,
  created_at: '2026-09-01T12:00:00.000Z',
  ...parcial,
});

const goal = (parcial: Partial<Goal> & Pick<Goal, 'id' | 'current_amount' | 'target_amount'>): Goal => ({
  user_id: 'u1',
  title: parcial.id,
  color: '#7BD8C0',
  icon: 'flag',
  deadline: null,
  created_at: '2026-09-01T12:00:00.000Z',
  ...parcial,
});

let falhas = 0;
let verificacoes = 0;
function conferir(nome: string, condicao: boolean, detalhe?: unknown) {
  verificacoes++;
  if (condicao) return;
  falhas++;
  console.error(`FALHA  ${nome}`, detalhe ?? '');
}

const proximo = selecionarProximoCompromisso([
  bill({ id: 'futuro', due_date: '2026-09-10' }),
  bill({ id: 'pago', due_date: '2026-09-01', status: 'paid' }),
  bill({ id: 'atrasado', due_date: '2026-09-02', recurring: true }),
], hoje);
conferir('escolhe o vencimento pendente mais antigo', proximo?.id === 'atrasado', proximo);
conferir('marca compromisso atrasado', proximo?.overdue === true, proximo);
conferir('ignora boletos pagos', selecionarProximoCompromisso([bill({ id: 'pago', due_date: '2026-09-01', status: 'paid' })], hoje) === null);

const cofrinho = selecionarCofrinho([
  goal({ id: 'concluido', current_amount: 100, target_amount: 100 }),
  goal({ id: 'em-andamento', current_amount: 25, target_amount: 100 }),
]);
conferir('prioriza primeiro cofrinho incompleto', cofrinho?.id === 'em-andamento', cofrinho);
conferir('calcula progresso do cofrinho', cofrinho?.progress === 25, cofrinho);
conferir('mantém conquista se todos concluídos', selecionarCofrinho([goal({ id: 'feito', current_amount: 150, target_amount: 100 })])?.completed === true);
conferir('cofrinho vazio', selecionarCofrinho([]) === null);

const snapshot = montarSnapshotWidgets({
  userId: 'u1',
  transactions: [
    tx({ id: 'entrada', amount: 1000, type: 'in' }),
    tx({ id: 'debito', amount: 100, type: 'out', payment_method: 'debit' }),
    tx({ id: 'credito', amount: 500, type: 'out', payment_method: 'credit' }),
  ],
  bills: [bill({ id: 'conta', due_date: '2026-09-12', amount: 200 })],
  goals: [goal({ id: 'meta', current_amount: 100, target_amount: 1000 })],
  privacyHidden: true,
  hoje,
  updatedAt: '2026-09-04T15:00:00.000Z',
});
conferir('contrato versionado', snapshot.version === 1);
conferir('preserva modo privacidade', snapshot.privacyHidden === true);
conferir('não desconta compra no crédito do caixa', snapshot.safeToSpend.livreTotal === 600, snapshot.safeToSpend);
conferir('usa total de todas as carteiras', snapshot.safeToSpend.livreTotal === 600);
conferir('data determinística', snapshot.updatedAt === '2026-09-04T15:00:00.000Z');

const links: Array<[string, string, Record<string, string>]> = [
  ['com.gabriouss.grana://add-credit', 'add-credit', { acao: 'add-credit' }],
  ['com.gabriouss.grana://add-bill', 'add-bill', { acao: 'add-bill' }],
  ['com.gabriouss.grana://bills', 'bills', { acao: 'bills' }],
  ['com.gabriouss.grana://goals', 'goals', { acao: 'goals' }],
  ['com.gabriouss.grana://deposit-goal?goalId=abc-123', 'deposit-goal', { acao: 'deposit-goal', goalId: 'abc-123' }],
];
for (const [url, tipo, params] of links) {
  const acao = parseDeepLink(url);
  conferir(`interpreta ${tipo}`, acao?.tipo === tipo, acao);
  conferir(`converte parâmetros de ${tipo}`, !!acao && JSON.stringify(acaoParaParams(acao)) === JSON.stringify(params), acao && acaoParaParams(acao));
}
conferir('rejeita depósito sem id', parseDeepLink('com.gabriouss.grana://deposit-goal') === null);

/* ── A URL inicial que o Android entrega atrasado ─────────────────────────
 *
 * Em 18/09/2026 o autor relatou que os quatro botões do widget "Central de
 * Lançamentos" abriam o app sem abrir o formulário. Causa: o expo-router pede
 * a URL inicial ao Android com prazo de 150ms e, perdida a corrida, cai na
 * rota raiz — a ação some. A área logada passou a perguntar de novo, sem
 * prazo, e só age quando o roteador não deu conta.
 *
 * As URLs saem do PRÓPRIO arquivo do widget: se o Kotlin mudar um link e o JS
 * não acompanhar, este teste cai em vez de o botão virar um toque morto. */
{
  const kotlin = readFileSync(
    join(
      __dirname, '..', 'modules', 'grana-voice-widget', 'android', 'src', 'main', 'java',
      'com', 'gabriouss', 'grana', 'voicewidget', 'CentralLancamentoWidgetProvider.kt'
    ),
    'utf8'
  );
  const urlsDoWidget = [...kotlin.matchAll(/"(com\.gabriouss\.grana:\/\/[^"]+)"/g)].map((m) => m[1]);
  conferir('o widget de lançamentos dispara quatro links', urlsDoWidget.length === 4, urlsDoWidget);

  for (const url of urlsDoWidget) {
    /* 1. A rota que o roteador monta abre um formulário. */
    const rota = redirectSystemPath({ path: url, initial: true });
    conferir(`${url} vira rota que abre formulário`, /acao=add-tx|novaCompra=1|novaConta=1/.test(rota), rota);

    /* 2. Tratada pelo roteador, a rede de segurança fica quieta — senão o
       formulário abriria duas vezes. */
    conferir(`${url} tratada pelo roteador não repete`, acaoInicialPendente(url) === null, url);

    /* 3. Roteador perdeu a URL (o caso do prazo de 150ms): a rede vê a ação…
       e só uma vez, porque o Android devolve a mesma URL de abertura a cada
       remontagem da área logada. */
    const perdida = `${url}${url.includes('?') ? '&' : '?'}perdida=1`;
    conferir(`sem o roteador, ${url} ainda vira ação`, acaoInicialPendente(perdida) !== null, perdida);
    conferir(`${url} não é tratada duas vezes`, acaoInicialPendente(perdida) === null, perdida);
  }

  /* A rota raiz é o que o roteador usa quando o prazo estoura, e o link de
     confirmação de e-mail do Supabase chega pelo mesmo canal: nenhum dos dois
     pode virar abertura de formulário. */
  conferir('rota raiz não vira ação', acaoInicialPendente('com.gabriouss.grana:///') === null);
  conferir('link de autenticação não vira ação', acaoInicialPendente('com.gabriouss.grana://#access_token=abc') === null);
  conferir('sem URL, nada a fazer', acaoInicialPendente(null) === null);
}

if (falhas > 0) {
  console.error(`\n${falhas} falha(s) no corpus de widgets.`);
  process.exit(1);
}
console.log(`OK — widgets: ${verificacoes}/${verificacoes} verificações passaram.`);
