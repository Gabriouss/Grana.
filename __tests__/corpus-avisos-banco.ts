/**
 * Corpus da leitura de avisos do banco, com o módulo real. Lojas, valores e nomes
 * são inventados, e aviso real nunca entra aqui (o repositório é público). Os
 * formatos são hipótese de como os bancos escrevem até serem conferidos com aviso
 * real no diário do teste.
 *
 *   npx tsx __tests__/corpus-avisos-banco.ts
 */
import { interpretarAviso, resumoDoEntendido, type AvisoEntendido } from '../lib/avisos-banco/interpretar';

let passaram = 0;
let falhas = 0;
const QUANDO = new Date(2026, 9, 30, 23, 50).getTime();
const NUBANK = 'com.nu.production';
const WALLET = 'com.google.android.apps.walletnfcrel';

function ler(titulo: string, texto: string, pacote = NUBANK): AvisoEntendido {
  return interpretarAviso({ pacote, titulo, texto, quando: QUANDO });
}
function falhou(rotulo: string, detalhe: unknown) {
  falhas++;
  console.log(`FALHOU   ${rotulo}: ${JSON.stringify(detalhe)}`);
}

type Esperado = { direcao: 'in' | 'out'; forma: string | null; valor: number; descricao?: string | null; parcelas?: number; digitos?: string };
function lancamento(titulo: string, texto: string, e: Esperado, pacote = NUBANK) {
  const r = ler(titulo, texto, pacote);
  const certo = r.tipo === 'lancamento' && r.direcao === e.direcao && r.forma === e.forma
    && Math.abs(r.valor - e.valor) < 0.001
    && (e.descricao === undefined || r.descricao === e.descricao)
    && (e.parcelas === undefined || r.parcelas === e.parcelas)
    && (e.digitos === undefined || r.digitos === e.digitos);
  if (certo) passaram++;
  else falhou(`${titulo} | ${texto}`, r);
}
function ignorado(titulo: string, texto: string, motivo: string) {
  const r = ler(titulo, texto);
  if (r.tipo === 'ignorar' && r.motivo === motivo) passaram++;
  else falhou(`${titulo} | ${texto}`, r);
}
function tipo(titulo: string, texto: string, esperado: AvisoEntendido['tipo'], pacote = NUBANK) {
  const r = ler(titulo, texto, pacote);
  if (r.tipo === esperado) passaram++;
  else falhou(`${titulo} | ${texto}`, r);
}

/* Compra no crédito */
lancamento('Compra aprovada', 'Compra no crédito de R$ 89,90 em Mercado Modelo', { direcao: 'out', forma: 'credit', valor: 89.9, descricao: 'Mercado Modelo' });
lancamento('Compra no crédito aprovada', 'R$ 50,00 em Padaria Modelo no cartão final 4321', { direcao: 'out', forma: 'credit', valor: 50, descricao: 'Padaria Modelo', digitos: '4321' });
lancamento('Cartão', 'Compra de R$ 1.250,00 APROVADA em LOJA EXEMPLO para o cartão com final 1234. Crédito', { direcao: 'out', forma: 'credit', valor: 1250, descricao: 'Loja Exemplo', digitos: '1234' });
lancamento('', 'Compra aprovada no seu cartão de crédito final 9876 de R$ 30,00 em Farmácia Central', { direcao: 'out', forma: 'credit', valor: 30, digitos: '9876' });
/* O limite no fim do aviso não é o valor da compra */
lancamento('Compra aprovada', 'Crédito: R$ 45,00 em Café Modelo. Limite disponível: R$ 900,00', { direcao: 'out', forma: 'credit', valor: 45, descricao: 'Café Modelo' });

/* Forma não informada: a pessoa escolhe */
lancamento('Compra aprovada', 'R$ 32,50 em Mercado Modelo, final 1111', { direcao: 'out', forma: null, valor: 32.5, digitos: '1111' });
lancamento('', 'Você gastou R$ 32,50 no Mercado Modelo', { direcao: 'out', forma: null, valor: 32.5, descricao: 'Mercado Modelo' });
lancamento('Compra por aproximação', 'Compra de R$ 18,00 em Banca Modelo', { direcao: 'out', forma: null, valor: 18, descricao: 'Banca Modelo' });

/* Débito */
lancamento('Compra no débito', 'Compra de R$ 25,00 no débito em Lanchonete Modelo', { direcao: 'out', forma: 'debit', valor: 25 });
lancamento('Conta', 'Compra debitada: R$ 70,00 em Posto Modelo', { direcao: 'out', forma: 'debit', valor: 70, descricao: 'Posto Modelo' });

/* Pix */
lancamento('Pix enviado', 'Pix enviado de R$ 150,00 para Maria Exemplo', { direcao: 'out', forma: 'pix', valor: 150, descricao: 'Maria Exemplo' });
lancamento('', 'Você transferiu R$ 50,00 para Mercado Modelo', { direcao: 'out', forma: 'pix', valor: 50, descricao: 'Mercado Modelo' });
lancamento('Transferência', 'Pix de R$ 12,00 para Joana Exemplo', { direcao: 'out', forma: 'pix', valor: 12 });
lancamento('Pix recebido', 'Você recebeu um Pix de R$ 300,00 de Carlos Exemplo', { direcao: 'in', forma: 'pix', valor: 300 });
lancamento('Transferência recebida', 'Transferência recebida: R$ 80,00 de Ana Exemplo', { direcao: 'in', forma: 'pix', valor: 80, descricao: 'Ana Exemplo' });

/* Parcelada: os dois jeitos dão o mesmo total */
lancamento('Compra aprovada', 'Compra parcelada em 3x de R$ 100,00 em Loja Modelo', { direcao: 'out', forma: 'credit', valor: 300, parcelas: 3 });
lancamento('Compra aprovada', 'Compra de R$ 300,00 em 3x em Loja Modelo', { direcao: 'out', forma: 'credit', valor: 300, parcelas: 3 });
lancamento('Compra aprovada', 'Compra de R$ 1.000,00 em 10x de R$ 100,00 em Loja Modelo', { direcao: 'out', forma: 'credit', valor: 1000, parcelas: 10 });

/* Boleto */
lancamento('Boleto pago', 'Boleto pago de R$ 210,00 para Energia Modelo', { direcao: 'out', forma: 'boleto', valor: 210 });
lancamento('', 'Pagamento de boleto: R$ 99,00 confirmado', { direcao: 'out', forma: 'boleto', valor: 99 });

/* Carteira: a loja vem no título */
lancamento('Mercado Modelo', 'R$ 40,00 com Visa ••1234', { direcao: 'out', forma: null, valor: 40, descricao: 'Mercado Modelo', digitos: '1234' }, WALLET);

/* Fatura paga nunca lança */
tipo('Fatura paga', 'Pagamento da fatura de R$ 500,00 confirmado', 'fatura_paga');
tipo('', 'Recebemos o pagamento da sua fatura no valor de R$ 500,00', 'fatura_paga');
tipo('', 'Você pagou a fatura do cartão: R$ 500,00', 'fatura_paga');
ignorado('Fatura fechada', 'Sua fatura de R$ 700,00 vence amanhã', 'fatura');

/* Negativos, com o mesmo peso */
ignorado('Compra recusada', 'Compra de R$ 89,90 em Mercado Modelo foi recusada', 'recusada');
ignorado('', 'Compra de R$ 89,90 não autorizada', 'recusada');
ignorado('', 'Compra de R$ 20,00 cancelada', 'recusada');
ignorado('Estorno', 'Estorno de R$ 89,90 em Mercado Modelo', 'estorno');
ignorado('', 'Reembolso de R$ 15,00 da compra em Loja Modelo', 'estorno');
ignorado('', 'Pix agendado de R$ 100,00 para Maria Exemplo', 'agendado');
ignorado('', 'Pagamento agendado: R$ 90,00', 'agendado');
ignorado('', 'Seu limite aumentou para R$ 5.000,00', 'limite');
ignorado('', 'Seu saldo atual é R$ 1.000,00', 'saldo');
ignorado('Oferta', 'Empréstimo pré-aprovado de R$ 10.000,00', 'oferta');
ignorado('', 'Aproveite: ganhe R$ 20,00 de cashback', 'oferta');
ignorado('', 'Seu código de verificação da compra de R$ 50,00 é 123456', 'codigo');
ignorado('', 'Aplicação de R$ 500,00 realizada no CDB', 'aplicacao');
ignorado('', 'Resgate de R$ 500,00 realizado', 'resgate');
ignorado('', 'Seu dinheiro rendeu R$ 3,20 hoje', 'resgate');
ignorado('Compra internacional', 'Compra de US$ 20,00 em Loja Modelo', 'moeda_estrangeira');
ignorado('Compra internacional', 'Compra de R$ 110,00 (USD 20,00) em Loja Modelo', 'moeda_estrangeira');
ignorado('Bom dia', 'Confira as novidades do app', 'sem_valor');
ignorado('Compra aprovada', 'Veja os detalhes no app', 'sem_valor');

/* Com R$ e sem verbo colado: vai para a pessoa, nunca vira lançamento */
tipo('Atenção', 'Você tem R$ 50,00 esperando por você', 'nao_entendi');
tipo('Compra', 'Veja o app. Seu resumo tem R$ 50,00', 'nao_entendi');
tipo('', 'Compra de R$ 50,00 e taxa de R$ 5,00 em Loja Modelo', 'nao_entendi');
tipo('', 'R$ 40,00 com Visa ••1234', 'nao_entendi');
/* "R$ 50" no meio de outra palavra ou sem R$ */
ignorado('Compra aprovada', 'Compra de 50,00 em Loja Modelo', 'sem_valor');

/* A data é a da hora local do aviso, mesmo perto da meia-noite */
const r = interpretarAviso({ pacote: NUBANK, titulo: 'Compra', texto: 'Compra de R$ 10,00 em Loja Modelo', quando: QUANDO });
if ('data' in r && r.data === '2026-10-30') passaram++;
else falhou('data local', r);

/* Toda decisão tem frase para o diário */
for (const e of [ler('', 'Compra no crédito de R$ 10,00 em Loja Modelo'), ler('', 'Seu saldo é R$ 1,00'), ler('Fatura paga', 'Pagamento da fatura de R$ 5,00')]) {
  if (resumoDoEntendido(e).length > 5) passaram++;
  else falhou('resumo', e);
}

console.log(`corpus-avisos-banco: ${passaram} ok, ${falhas} falhas`);
if (falhas) process.exit(1);
