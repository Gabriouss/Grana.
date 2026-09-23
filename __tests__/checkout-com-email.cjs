/*
 * O checkout aberto de dentro do app leva o e-mail da conta.
 *
 * Achado C5 da auditoria de produto de 23/09/2026: quem já estava logado era
 * mandado ao checkout da Cakto sem nada preenchido e sem aviso. O vínculo
 * entre compra e conta é feito PELO E-MAIL, no webhook — digitar outro (o
 * navegador preenche o pessoal sozinho) faz a pessoa pagar e continuar no
 * paywall, e o conserto depende de um token que a auditoria de 22/09 achou
 * inalcançável.
 *
 * Os nomes dos parâmetros vêm da documentação da Cakto, conferida em
 * 23/09/2026: `name`, `email`, `confirmEmail`, `cpf`, `phone`, `coupon`.
 *
 * Roda o módulo real. O que fica preso:
 *
 * 1. os dois campos de e-mail vão na URL, com escape;
 * 2. parâmetro que já existia na URL configurada sobrevive — é por ali que a
 *    landing manda a atribuição de anúncio e o cupom;
 * 3. e-mail ausente não inventa parâmetro vazio;
 * 4. URL quebrada devolve a URL, em vez de impedir a compra;
 * 5. a tela usa o link com e-mail e avisa qual é.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

let total = 0;
let falhas = 0;
function conferir(nome, ok, visto) {
  total++;
  if (ok) return;
  falhas++;
  console.error(`x ${nome}${visto === undefined ? '' : ` — visto: ${JSON.stringify(visto)}`}`);
}

const codigo = ts.transpileModule(fs.readFileSync('lib/checkout.ts', 'utf8'), {
  fileName: 'lib/checkout.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const modulo = { exports: {} };
vm.runInNewContext(codigo, { module: modulo, exports: modulo.exports, URL, Error });
const { checkoutComEmail } = modulo.exports;

const BASE = 'https://pay.cakto.com.br/JFS83D9';

{
  const url = new URL(checkoutComEmail(BASE, 'pessoa@exemplo.com'));
  conferir('leva o e-mail', url.searchParams.get('email') === 'pessoa@exemplo.com', url.href);
  conferir('e a confirmação, que a Cakto pede separada', url.searchParams.get('confirmEmail') === 'pessoa@exemplo.com', url.href);
  conferir('o destino continua o mesmo', url.origin + url.pathname === BASE, url.href);
}

{
  /* `+` numa concatenação à mão viraria espaço do outro lado, e o e-mail não
     bateria com o da conta — o defeito voltaria com outra cara. */
  const url = new URL(checkoutComEmail(BASE, 'pessoa+teste@exemplo.com'));
  conferir('e-mail com "+" chega inteiro', url.searchParams.get('email') === 'pessoa+teste@exemplo.com', url.href);
  conferir('e vai escapado na URL', /%2B/.test(url.href), url.href);
}

{
  const comAtribuicao = `${BASE}?utm_source=meta&gclid=abc&coupon=LANCAMENTO`;
  const url = new URL(checkoutComEmail(comAtribuicao, 'pessoa@exemplo.com'));
  conferir('a atribuição de anúncio sobrevive', url.searchParams.get('utm_source') === 'meta' && url.searchParams.get('gclid') === 'abc', url.href);
  conferir('o cupom sobrevive', url.searchParams.get('coupon') === 'LANCAMENTO', url.href);
  conferir('e o e-mail entra junto', url.searchParams.get('email') === 'pessoa@exemplo.com', url.href);
}

{
  const comEmailFixo = `${BASE}?email=fixo@exemplo.com`;
  const url = new URL(checkoutComEmail(comEmailFixo, 'pessoa@exemplo.com'));
  conferir('e-mail já posto na URL configurada não é sobrescrito', url.searchParams.get('email') === 'fixo@exemplo.com', url.href);
}

conferir('sem e-mail, a URL não muda', checkoutComEmail(BASE, null) === BASE, checkoutComEmail(BASE, null));
conferir('e-mail vazio também não muda', checkoutComEmail(BASE, '') === BASE);
conferir('URL que não dá para analisar segue como está, em vez de barrar a compra', checkoutComEmail('nao-e-url', 'x@y.com') === 'nao-e-url');

{
  const tela = fs.readFileSync('app/assinar.tsx', 'utf8');
  conferir('a tela abre o link COM e-mail, nos dois planos',
    tela.includes('Linking.openURL(linkDoMensal)') && tela.includes('Linking.openURL(linkDoAnual)'), true);
  conferir('e nenhum botão de compra abre mais o destino cru',
    !/Linking\.openURL\(destino(Compra|Anual)\)/.test(tela));
  conferir('a tela diz qual e-mail vai, porque o campo continua editável',
    tela.includes('A compra é liberada pelo e-mail da conta'));
}

console.log(`\n${total - falhas}/${total} checagens do checkout com e-mail passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
