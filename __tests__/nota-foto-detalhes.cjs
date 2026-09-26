/* Foto da nota: o que a confirmação preenche além do total (pedido do autor,
 * 26/09/2026: "deixe ela perfeita").
 *
 *   node __tests__/nota-foto-detalhes.cjs
 *
 * Módulo REAL lib/nota-foto-parser.ts, com cupons FICTÍCIOS em vários
 * formatos: supermercado, farmácia, posto, restaurante com taxa de serviço,
 * cupom com troco, cupom com crédito de tributos. Confere o total, a forma de
 * pagamento (só da região de pagamento, sem adivinhar), a data de emissão
 * (recusando futura e absurda) e o nome do estabelecimento.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/nota-foto-parser.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: mod.exports, module: mod, Number, Set, RegExp, String, Math, Date });
const { extrairTotalDaFoto, extrairDetalhesDaNota } = mod.exports;

const HOJE = '2026-09-26';
let ok = 0;
function cupom(nome, linhas, esperado) {
  const texto = linhas.join('\n');
  const total = extrairTotalDaFoto(texto);
  const d = JSON.parse(JSON.stringify(extrairDetalhesDaNota(texto, HOJE)));
  const obtido = { total: total.valorTotal, pagamento: d.pagamento, data: d.data, dataRecusada: d.dataRecusada, estabelecimento: d.estabelecimento };
  for (const [k, v] of Object.entries(esperado)) assert.deepEqual(obtido[k], v, `${nome}: ${k} = ${JSON.stringify(obtido[k])}`);
  ok++;
  console.log('  ok  ' + nome);
}

cupom('supermercado no crédito', [
  'MERCADO AUDIT FICTICIO LTDA',
  'CNPJ 00.000.000/0000-00',
  'RUA DAS FLORES, 100 - CENTRO',
  'DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR ELETRONICA',
  'ARROZ AUDIT 1KG 12,90',
  'Qtd. total de itens 3',
  'VALOR TOTAL R$ 37,80',
  'FORMA DE PAGAMENTO VALOR PAGO R$',
  'Cartão de Crédito 37,80',
  'Tributos Totais Incidentes (Lei 12.741/2012) 4,21',
  'NFC-e n 000123 Serie 001 Emissão: 25/09/2026 14:32:10',
], { total: 37.8, pagamento: 'credit', data: '2026-09-25', dataRecusada: false, estabelecimento: 'Mercado AUDIT Ficticio' });

cupom('farmácia no débito, com total bruto e líquido', [
  'DROGARIA AUDIT SAUDE EIRELI',
  'CNPJ: 00.000.000/0001-00  IE: 000000',
  'AV BRASIL 2000',
  'TOTAL BRUTO R$ 50,00',
  'DESCONTO R$ 5,00',
  'TOTAL LIQUIDO R$ 45,00',
  'FORMA PAGAMENTO VALOR PAGO',
  'CARTAO DE DEBITO 45,00',
  'EMISSAO 20/09/2026 09:10',
], { total: 45, pagamento: 'debit', data: '2026-09-20', estabelecimento: 'Drogaria AUDIT Saude' });

cupom('posto no Pix, escrito "Pagamento Instantâneo"', [
  'AUTO POSTO AUDIT GNV LTDA',
  'CNPJ 00.000.000/0002-00',
  'GASOLINA COMUM 40,000 L 5,99 239,60',
  'VALOR TOTAL R$ 239,60',
  'FORMA DE PAGAMENTO',
  'Pagamento Instantaneo (PIX) 239,60',
  'Emissão 26/09/2026 07:45:00',
], { total: 239.6, pagamento: 'pix', data: '2026-09-26', estabelecimento: 'Auto Posto AUDIT GNV' });

cupom('restaurante com taxa de serviço: o total é o que inclui a taxa', [
  'RESTAURANTE AUDIT SABOR',
  'CNPJ 00.000.000/0003-00',
  'SUBTOTAL 100,00',
  'TAXA DE SERVICO 10% 10,00',
  'TOTAL R$ 110,00',
  'FORMA DE PAGAMENTO VALOR PAGO',
  'CARTAO CREDITO VISA 110,00',
  'Emissao: 24/09/2026',
], { total: 110, pagamento: 'credit', data: '2026-09-24', estabelecimento: 'Restaurante AUDIT Sabor' });

cupom('cupom com troco: o total vale, o valor pago maior não', [
  'PADARIA AUDIT PAO QUENTE ME',
  'CNPJ 00.000.000/0004-00',
  'VALOR TOTAL R$ 37,80',
  'FORMA DE PAGAMENTO VALOR PAGO R$',
  'Dinheiro 50,00',
  'Troco R$ 12,20',
  'Emissão: 26/09/2026 08:01',
], { total: 37.8, pagamento: 'cash', estabelecimento: 'Padaria AUDIT Pao Quente' });

cupom('crédito de tributos NÃO vira crédito', [
  'MERCADINHO AUDIT',
  'CNPJ 00.000.000/0005-00',
  'VALOR TOTAL R$ 20,00',
  'FORMA DE PAGAMENTO VALOR PAGO',
  'Cartao de Debito 20,00',
  'Credito de ICMS conforme legislacao 0,50',
  'Valor aproximado dos tributos com credito presumido 2,00',
], { total: 20, pagamento: 'debit' });

cupom('"crédito" no nome da loja, pagamento no Pix', [
  'CREDITO REAL MATERIAIS AUDIT',
  'VALOR TOTAL R$ 80,00',
  'FORMA DE PAGAMENTO',
  'PIX 80,00',
], { pagamento: 'pix', estabelecimento: 'Credito Real Materiais AUDIT' });

cupom('"Outros": não adivinha', [
  'LOJA AUDIT', 'VALOR TOTAL R$ 30,00', 'FORMA DE PAGAMENTO', 'Outros 30,00',
], { total: 30, pagamento: null });

cupom('só "Cartão", sem dizer crédito ou débito: não adivinha', [
  'LOJA AUDIT', 'VALOR TOTAL R$ 30,00', 'FORMA DE PAGAMENTO VALOR PAGO', 'Cartao 30,00',
], { pagamento: null });

cupom('duas formas diferentes: não adivinha', [
  'LOJA AUDIT', 'VALOR TOTAL R$ 30,00', 'FORMA DE PAGAMENTO', 'Dinheiro 10,00', 'Cartao de Credito 20,00',
], { pagamento: null });

cupom('sem região de pagamento: não procura crédito no resto do cupom', [
  'LOJA AUDIT', 'VALOR TOTAL R$ 30,00', 'Cartao de Credito 30,00',
], { total: 30, pagamento: null });

cupom('erro comum de OCR: "CRED1TO" e "DEB1TO" com 1 no lugar do I', [
  'LOJA AUDIT', 'VALOR TOTAL R$ 30,00', 'FORMA DE PAGAMENTO', 'CARTAO DE CRED1TO 30,00',
], { pagamento: 'credit' });

cupom('data futura recusada', [
  'LOJA AUDIT', 'VALOR TOTAL R$ 30,00', 'Emissão: 26/09/2062 10:00',
], { data: null, dataRecusada: true });

cupom('data de mais de um ano recusada', [
  'LOJA AUDIT', 'VALOR TOTAL R$ 30,00', 'Emissão: 10/09/2025 10:00',
], { data: null, dataRecusada: true });

cupom('data impossível recusada', [
  'LOJA AUDIT', 'VALOR TOTAL R$ 30,00', 'Emissão: 31/02/2026 10:00',
], { data: null, dataRecusada: true });

cupom('sem data: nada recusado, a tela usa hoje', [
  'LOJA AUDIT', 'VALOR TOTAL R$ 30,00',
], { data: null, dataRecusada: false });

cupom('topo só com CNPJ e endereço: sem nome', [
  'CNPJ 00.000.000/0006-00', 'RUA AUDIT 10', 'VALOR TOTAL R$ 30,00',
], { estabelecimento: null });

cupom('nome longo encurtado na palavra', [
  'SUPERMERCADO AUDIT DISTRIBUIDORA DE ALIMENTOS E BEBIDAS DO INTERIOR LTDA', 'VALOR TOTAL R$ 30,00',
], { estabelecimento: 'Supermercado AUDIT Distribuidora De' });

{
  const d = extrairDetalhesDaNota('', HOJE);
  assert.deepEqual(JSON.parse(JSON.stringify(d)), { pagamento: null, data: null, dataRecusada: false, estabelecimento: null });
  ok++; console.log('  ok  foto sem texto: nada preenchido, nada inventado');
}

console.log(`\n${ok}/${ok} checagens dos detalhes da nota passaram\n`);
