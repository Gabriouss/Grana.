/*
 * Exemplo único da landing: os números que a página escreve em código batem
 * com a conta de demonstração que gerou as capturas.
 *
 * A landing já mostrou, ao mesmo tempo, três contas diferentes de "Livre para
 * Gastar" (achado V01 da auditoria de 06/09/2026), e em 13/09/2026 a conversa
 * do Granabô ainda dizia R$ 412,80 em Alimentação e R$ 544,75 em 3 boletos,
 * enquanto as capturas exibidas logo acima mostravam outro mês. As capturas
 * são imagem e não mudam junto com o código; este teste prende o código a
 * elas pelo caminho inverso: carrega os MÓDULOS REAIS (`lib/demo-data.ts`,
 * `lib/safe-to-spend.ts`, `lib/transaction-rules.ts`, o ciclo de fatura das
 * Edge Functions e o próprio `ConversaGranachat.tsx`), com o relógio parado no
 * dia das capturas, e confere cada número de `lib/exemplo-landing.ts`.
 *
 * Se `demo-data.ts` mudar, este teste falha, e a falha quer dizer: refazer as
 * capturas e atualizar o exemplo, nunca só trocar o número aqui.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

/* 5 de setembro de 2026: o dia que dá os "26 dias restantes" das capturas. */
const HOJE = [2026, 8, 5];
const DataReal = Date;
class DataFixa extends DataReal {
  constructor(...args) {
    super(...(args.length ? args : HOJE));
  }
  static now() {
    return new DataReal(...HOJE).getTime();
  }
}

function carregar(caminho, dependencias = {}) {
  const module = { exports: {} };
  const codigo = ts.transpileModule(fs.readFileSync(caminho, 'utf8'), {
    fileName: caminho,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  vm.runInNewContext(codigo, {
    module,
    exports: module.exports,
    Date: DataFixa,
    require: (nome) => {
      if (nome in dependencias) return dependencias[nome];
      throw new Error(`import inesperado em ${caminho}: ${nome}`);
    },
  });
  return module.exports;
}

let verificacoes = 0;
const conferir = (atual, esperado, mensagem) => {
  verificacoes += 1;
  assert.deepEqual(atual, esperado, mensagem);
};
const centavos = (valor) => Math.round(Number(valor) * 100);
const noMes = (iso) => iso.startsWith('2026-09-');

const demo = carregar('lib/demo-data.ts');
const regras = carregar('lib/transaction-rules.ts');
const livre = carregar('lib/safe-to-spend.ts');
const ciclo = carregar('supabase/functions/_shared/fatura-ciclo.ts');
const exemplo = carregar('lib/exemplo-landing.ts');
const { EXEMPLO_LIVRE, EXEMPLO_CONVERSA, emReais } = exemplo;

// ---- Livre para Gastar: a mesma regra da Início (crédito fora do caixa) ----
{
  /* `calcularSaldoAtual` passou a somar TODO o histórico de caixa (mais o
     saldo inicial da carteira), não só o mês corrente — achado A12,
     19/09/2026: a mesma carteira mostrava dois números diferentes para
     "saldo" (o seletor de carteira já somava tudo; "Livre para gastar"
     somava só o mês). `DEMO_TRANSACTIONS` tem abril a setembro de 2026 (usado
     por outros testes, ex.: navegação entre meses), mas a captura congelada
     da landing (`inicio-web.png`/`inicio-mobile.png`) mostra a conta como se
     começasse em setembro — é o recorte que bate com a imagem, e a imagem não
     se regera junto com este fix. Por isso o exemplo da landing continua
     filtrando só o mês da captura, com saldo inicial 0: ele ilustra a TELA
     CONGELADA, não o comportamento atual do app (que, em modo de exemplo de
     verdade, agora soma os 6 meses). */
  const caixa = demo.DEMO_TRANSACTIONS.filter((t) => !regras.isCreditTx(t) && noMes(t.occurred_on));
  const r = livre.calcularSafeToSpend(caixa, demo.DEMO_BILLS, demo.DEMO_GOALS, 0, new DataFixa());
  conferir(centavos(r.saldoAtual), centavos(EXEMPLO_LIVRE.saldo), 'saldo atual');
  conferir(centavos(r.contasFixasPendentes), centavos(EXEMPLO_LIVRE.contas), 'contas a vencer este mês');
  conferir(centavos(r.reservadoEmMetas), centavos(EXEMPLO_LIVRE.cofrinhos), 'reservado em cofrinhos');
  conferir(r.diasRestantes, EXEMPLO_LIVRE.diasRestantes, 'dias restantes');
  conferir(centavos(r.livreTotal), centavos(EXEMPLO_LIVRE.livreNoTotal), 'livre no total');
  conferir(centavos(r.livrePorDia), centavos(EXEMPLO_LIVRE.porDia), 'livre por dia, arredondado como o app');
}

// ---- Gasto em Alimentação no mês ----
{
  const alimentacao = demo.DEMO_TRANSACTIONS.filter(
    (t) => t.type === 'out' && t.category === 'Alimentação' && noMes(t.occurred_on)
  ).reduce((soma, t) => soma + Number(t.amount), 0);
  conferir(centavos(alimentacao), centavos(EXEMPLO_CONVERSA.alimentacao), 'Alimentação em setembro');
}

// ---- Contas pendentes do mês e a mais próxima ----
{
  const pendentes = demo.DEMO_BILLS.filter((b) => b.status === 'due' && noMes(b.due_date)).sort((a, b) =>
    a.due_date.localeCompare(b.due_date)
  );
  conferir(pendentes.length, EXEMPLO_CONVERSA.contas.quantidade, 'quantidade de contas pendentes');
  conferir(
    centavos(pendentes.reduce((soma, b) => soma + Number(b.amount), 0)),
    centavos(EXEMPLO_CONVERSA.contas.total),
    'total das contas pendentes'
  );
  const proxima = pendentes[0];
  const { contaMaisProxima } = EXEMPLO_CONVERSA;
  conferir(proxima.description.startsWith(contaMaisProxima.nome), true, `conta mais próxima é ${contaMaisProxima.nome}`);
  conferir(centavos(proxima.amount), centavos(contaMaisProxima.valor), 'valor da conta mais próxima');
  conferir(Number(proxima.due_date.slice(8)), contaMaisProxima.dia, 'dia de vencimento da conta mais próxima');
}

// ---- Fatura atual do cartão, pelo ciclo que o Granabô usa ----
{
  const { fatura } = EXEMPLO_CONVERSA;
  const cartao = demo.DEMO_CREDIT_CARDS.find((c) => c.name === fatura.cartao);
  conferir(Boolean(cartao), true, `cartão ${fatura.cartao} existe na demonstração`);
  conferir(Number(cartao.limit_amount), fatura.limite, 'limite do cartão');
  conferir(Number(cartao.closing_day), fatura.fechamento, 'dia de fechamento');

  const atual = ciclo.mesFaturaDoLancamento('2026-09-05', cartao.closing_day);
  const janela = ciclo.janelaFatura(atual.year, atual.month, cartao.closing_day);
  const valor = demo.DEMO_TRANSACTIONS.filter(
    (t) => t.card_id === cartao.id && t.type === 'out' && t.occurred_on >= janela.inicio && t.occurred_on <= janela.fim
  ).reduce((soma, t) => soma + Number(t.amount), 0);
  conferir(centavos(valor), centavos(fatura.valor), 'fatura atual no ciclo do cartão');

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const porExtenso = (iso) => `${Number(iso.slice(8))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;
  conferir(`${porExtenso(janela.inicio)} a ${porExtenso(janela.fim)}`, fatura.ciclo, 'ciclo da fatura por extenso');
}

// ---- A conversa do bloco 8 usa esses números, e só eles ----
{
  const tokens = new Proxy({}, { get: (_, chave) => (typeof chave === 'string' ? chave : undefined) });
  const conversa = carregar('components/ConversaGranachat.tsx', {
    react: { useEffect: () => {}, useRef: () => ({}), useState: (v) => [v, () => {}] },
    'react-native': {
      AccessibilityInfo: {},
      Platform: { OS: 'web' },
      ScrollView: 'ScrollView',
      StyleSheet: { create: (s) => s },
      Text: 'Text',
      View: 'View',
    },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Ionicons' },
    '@/lib/theme': { theme: tokens, radius: tokens, spacing: tokens, fonts: tokens, type: tokens, lh: () => 0, sombras: tokens },
    '@/components/AppPressable': { __esModule: true, default: 'AppPressable' },
    '@/lib/exemplo-landing': exemplo,
  });
  const falas = conversa.COMANDOS_GRANABO;
  conferir(falas.length, 4, 'quatro exemplos, como pede a estrutura de 13 blocos');

  /* `Intl` separa "R$" do número com espaço inseparável (U+00A0). */
  const texto = (s) => s.replace(/\u00a0/g, ' ');
  const [categoria, sobra, contas, cartao] = falas.map((f) => texto(f.resposta));
  const r = (v) => texto(emReais(v));
  const deve = (resposta, trecho, rotulo) => conferir(resposta.includes(trecho), true, `${rotulo}: "${trecho}" em "${resposta}"`);

  deve(categoria, r(EXEMPLO_CONVERSA.alimentacao), 'categoria');
  deve(categoria, EXEMPLO_CONVERSA.mes, 'categoria cita o período');
  deve(sobra, r(EXEMPLO_LIVRE.livreNoTotal), 'quanto sobra');
  deve(sobra, `${EXEMPLO_LIVRE.diasRestantes} dias restantes`, 'quanto sobra');
  deve(sobra, r(EXEMPLO_LIVRE.porDia), 'quanto sobra');
  deve(contas, `${EXEMPLO_CONVERSA.contas.quantidade} contas`, 'contas');
  deve(contas, r(EXEMPLO_CONVERSA.contas.total), 'contas');
  deve(contas, `${EXEMPLO_CONVERSA.contaMaisProxima.nome}, de ${r(EXEMPLO_CONVERSA.contaMaisProxima.valor)}`, 'contas');
  deve(contas, `dia ${EXEMPLO_CONVERSA.contaMaisProxima.dia}`, 'contas');
  deve(cartao, r(EXEMPLO_CONVERSA.fatura.valor), 'fatura');
  deve(cartao, EXEMPLO_CONVERSA.fatura.ciclo, 'fatura cita o ciclo');

  /* Regra de copy do autor: nada de travessão. O "−" dos valores negativos é
     sinal de menos, e não aparece nas falas; aqui a checagem é de traço. */
  for (const f of falas) {
    for (const campo of [f.rotulo, f.envio, f.resposta]) {
      conferir(/[—–]/.test(campo), false, `sem travessão em "${campo}"`);
    }
  }
}

console.log(`exemplo-landing: ${verificacoes} verificações passaram`);
