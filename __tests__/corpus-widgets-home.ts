import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { acaoInicialPendente, acaoParaParams, parseDeepLink } from '../lib/deep-links';
import { redirectSystemPath } from '../app/+native-intent';
import { LIMITE_COMPROMISSOS, montarSnapshotWidgets, selecionarCofrinho, selecionarCompromissosDoMes, selecionarProximoCompromisso } from '../lib/widgets-home-snapshot';
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

/* O pedido do autor em 19/09/2026: "se a gente tem um boleto de agosto
   atrasado, esse boleto de agosto precisa aparecer junto com os boletos de
   setembro, e vai aparecer como atrasado mesmo". Antes, um único atrasado
   prendia o widget nele e as contas do mês nunca apareciam. */
{
  const dia19 = new Date(2026, 8, 19, 12, 0, 0);
  const lista = selecionarCompromissosDoMes([
    bill({ id: 'outubro', due_date: '2026-10-05' }),
    bill({ id: 'setembro-25', due_date: '2026-09-25' }),
    bill({ id: 'agosto-atrasado', due_date: '2026-08-15' }),
    bill({ id: 'setembro-10', due_date: '2026-09-10' }),
    bill({ id: 'setembro-pago', due_date: '2026-09-05', status: 'paid' }),
    bill({ id: 'setembro-19', due_date: '2026-09-19' }),
  ], dia19);
  conferir('agosto atrasado aparece junto com as de setembro, em ordem de vencimento',
    lista.itens.map((c) => c.id).join(',') === 'agosto-atrasado,setembro-10,setembro-19,setembro-25', lista.itens.map((c) => c.id));
  conferir('agosto e o dia 10 de setembro saem como atrasados',
    lista.itens.filter((c) => c.overdue).map((c) => c.id).join(',') === 'agosto-atrasado,setembro-10', lista.itens);
  conferir('o que vence hoje ainda não é atrasado', lista.itens.find((c) => c.id === 'setembro-19')?.overdue === false);
  conferir('outubro fica fora da lista de setembro', !lista.itens.some((c) => c.id === 'outubro'));
  conferir('boleto pago fica fora', !lista.itens.some((c) => c.id === 'setembro-pago'));
  conferir('o total bate com a lista', lista.total === 4, lista.total);

  const soOutubro = selecionarCompromissosDoMes([bill({ id: 'outubro', due_date: '2026-10-02' })], dia19);
  conferir('sem nada no mês nem atrasado, mostra o próximo vencimento',
    soOutubro.itens.length === 1 && soOutubro.itens[0].id === 'outubro' && soOutubro.total === 1, soOutubro);
  conferir('sem nenhum boleto pendente, lista vazia', selecionarCompromissosDoMes([], dia19).total === 0);

  const muitos = selecionarCompromissosDoMes(
    Array.from({ length: 20 }, (_, i) => bill({ id: `b${String(i).padStart(2, '0')}`, due_date: `2026-09-${String(i + 1).padStart(2, '0')}` })),
    dia19,
  );
  conferir('a lista respeita o teto, e o total conta todas', muitos.itens.length === LIMITE_COMPROMISSOS && muitos.total === 20, muitos.total);

  const snap = montarSnapshotWidgets({
    userId: 'u1', transactions: [], goals: [], privacyHidden: false, hoje: dia19, saldoInicial: 0,
    bills: [bill({ id: 'agosto-atrasado', due_date: '2026-08-15' }), bill({ id: 'setembro-25', due_date: '2026-09-25' })],
  });
  conferir('o snapshot leva a lista e o total', snap.commitments.length === 2 && snap.commitmentsCount === 2, snap.commitments);
  conferir('nextCommitment segue sendo o primeiro, para o widget de builds antigas', snap.nextCommitment?.id === snap.commitments[0]?.id);
}

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
  saldoInicial: 0,
  updatedAt: '2026-09-04T15:00:00.000Z',
});
conferir('contrato versionado', snapshot.version === 1);
conferir('preserva modo privacidade', snapshot.privacyHidden === true);
conferir('não desconta compra no crédito do caixa', snapshot.safeToSpend.livreTotal === 600, snapshot.safeToSpend);
conferir('usa total de todas as carteiras', snapshot.safeToSpend.livreTotal === 600);
conferir('data determinística', snapshot.updatedAt === '2026-09-04T15:00:00.000Z');

/* ── A12: saldo inicial das carteiras entra na conta (19/09/2026) ────────
   Antes o widget e a Home somavam só o fluxo lançado, sem o saldo com que a
   carteira começou — a mesma conta que lib/wallets.ts::calcularSaldosWallets
   já fazia para o seletor de carteira, gerando dois números pra "saldo" na
   mesma tela. */
const snapshotComSaldoInicial = montarSnapshotWidgets({
  userId: 'u1',
  transactions: [tx({ id: 'saida', amount: 200, type: 'out', payment_method: 'debit' })],
  bills: [],
  goals: [],
  privacyHidden: false,
  hoje,
  saldoInicial: 1000,
  updatedAt: '2026-09-04T15:00:00.000Z',
});
conferir(
  'saldo inicial soma ao fluxo lançado, não fica de fora',
  snapshotComSaldoInicial.safeToSpend.livreTotal === 800,
  snapshotComSaldoInicial.safeToSpend
);
conferir(
  'sem saldo inicial nem fluxo positivo, "sem saldo" continua certo',
  montarSnapshotWidgets({
    userId: 'u1', transactions: [], bills: [], goals: [], privacyHidden: false, hoje, saldoInicial: 0,
  }).safeToSpend.semSaldo === true
);

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

/* O widget de contas desenha a LISTA (19/09/2026), e o armazenamento aceita o
   snapshot antigo, que só tinha `nextCommitment`. Checagem do fonte Kotlin: o
   comportamento nativo só é visto num APK. */
{
  const pasta = join(__dirname, '..', 'modules', 'grana-voice-widget', 'android', 'src', 'main');
  const provider = readFileSync(join(pasta, 'java', 'com', 'gabriouss', 'grana', 'voicewidget', 'ProximoCompromissoWidgetProvider.kt'), 'utf8');
  const store = readFileSync(join(pasta, 'java', 'com', 'gabriouss', 'grana', 'voicewidget', 'WidgetSnapshotStore.kt'), 'utf8');
  const layout = readFileSync(join(pasta, 'res', 'layout', 'grana_compromisso_widget.xml'), 'utf8');
  conferir('o provider lê a lista de contas', /snapshot\?\.commitments\.orEmpty\(\)/.test(provider));
  conferir('o provider desenha uma linha por conta', /views\.addView\(R\.id\.grana_compromisso_lista, linha\(/.test(provider));
  conferir('o provider limpa a linha de prévia antes de desenhar', /views\.removeAllViews\(R\.id\.grana_compromisso_lista\)/.test(provider));
  conferir('o provider mostra quantas ficaram de fora', /snapshot\.commitmentsCount - visiveis\.size/.test(provider));
  conferir('atrasada leva a palavra "atrasado", não só a cor', /grana_compromisso_linha_atrasado/.test(provider));
  conferir('o store lê a lista', /optJSONArray\("commitments"\)/.test(store));
  conferir('o store aceita o snapshot antigo', /\?: listOfNotNull\(compromisso\)/.test(store));
  conferir('o layout tem o contêiner da lista', /android:id="@\+id\/grana_compromisso_lista"/.test(layout));
}

/* ── O widget de voz sem permissão de microfone deixa recibo ─────────────
 *
 * Achado S4 da auditoria de 22/09/2026: com `RECORD_AUDIO` ainda não
 * concedido, o toque no widget não fazia NADA — nenhum estado, nenhuma
 * notificação, só `GranaVoz: gravação abortada: erro_interno` no logcat.
 *
 * A causa não era a checagem de permissão de `iniciar()`, que existe desde
 * sempre: a partir do Android 14, `startForeground` com o tipo `microphone`
 * exige `RECORD_AUDIO` e lança `SecurityException`, então o serviço estourava
 * ANTES de chegar lá e caía num `catch` que voltava ao repouso calado.
 *
 * Kotlin não roda no sandbox deste repositório, então aqui a checagem é
 * estrutural, de propósito: ela prende a ORDEM (permissão antes de subir a
 * primeiro plano) e o desfecho de cada caminho de falha (estado de atenção,
 * nunca repouso silencioso), que é exatamente o que regrediria. */
{
  const servico = readFileSync(
    join(
      __dirname, '..', 'modules', 'grana-voice-widget', 'android', 'src', 'main', 'java',
      'com', 'gabriouss', 'grana', 'voicewidget', 'GranaVoiceCaptureService.kt'
    ),
    'utf8'
  );

  const posPermissao = servico.indexOf('!temPermissaoDeMicrofone()');
  const posPrimeiroPlano = servico.indexOf('subirEmPrimeiroPlano()');
  conferir('o serviço confere a permissão de microfone', posPermissao >= 0);
  conferir(
    'e confere ANTES de subir a primeiro plano, que é o que estoura sem ela',
    posPermissao >= 0 && posPrimeiroPlano >= 0 && posPermissao < posPrimeiroPlano,
    { posPermissao, posPrimeiroPlano }
  );

  /* Todo `abortar` com motivo acende o estado de atenção, salvo os motivos em
     que dá para tentar de novo na hora — que é a regra escrita no próprio
     `abortar`. A lista de exceções fica CURTA de propósito: um motivo novo que
     volte ao repouso calado derruba este teste, que é o ponto.

     `abortar(null)` é o cancelamento pedido pela pessoa, e volta ao repouso. */
  const PODE_TENTAR_DE_NOVO = ['"microfone_ocupado"'];
  const chamadas = [...servico.matchAll(/(?<!fun )abortar\(([^)]*)\)/g)].map((m) => m[1].trim());
  const comMotivo = chamadas.filter(
    (args) => args !== 'null' && args !== '' && !args.startsWith('motivo:')
  );
  conferir('há abortos com motivo para conferir', comMotivo.length >= 3, chamadas);
  for (const args of comMotivo) {
    if (PODE_TENTAR_DE_NOVO.includes(args.split(',')[0].trim())) continue;
    conferir(
      `abortar(${args}) deixa recibo na tela, em vez de voltar ao repouso`,
      args.includes('EstadoWidget.ATENCAO'),
      args
    );
  }

  conferir(
    'a falha ao subir a primeiro plano vai para o log, e não some',
    /catch \(e: Exception\) \{[\s\S]{0,400}?Log\.w\("GranaVoz"/.test(servico)
  );
}

if (falhas > 0) {
  console.error(`\n${falhas} falha(s) no corpus de widgets.`);
  process.exit(1);
}
console.log(`OK — widgets: ${verificacoes}/${verificacoes} verificações passaram.`);
