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
let lancamentos = 0;
let semForma = 0;
function lancamento(titulo: string, texto: string, e: Esperado, pacote = NUBANK) {
  const r = ler(titulo, texto, pacote);
  if (r.tipo === 'lancamento') {
    lancamentos++;
    if (!r.forma) semForma++;
  }
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

/* A1: toda forma de recusa, em palavras, é recusa */
for (const fim of ['não foi aprovada', 'não foi autorizada', 'não foi concluída', 'não foi realizada', 'não foi efetuada', 'não pôde ser concluída', 'não foi processada']) {
  ignorado('Compra no débito', `Compra de R$ 89,90 em Mercado Modelo ${fim}`, 'recusada');
}
ignorado('', 'Não foi possível concluir a compra de R$ 89,90', 'recusada');
ignorado('', 'Compra de R$ 89,90 foi revertida', 'estorno');
lancamento('', 'Compra aprovada de R$ 89,90 em Mercado Modelo', { direcao: 'out', forma: null, valor: 89.9, descricao: 'Mercado Modelo' });

/* A2: fatura sem compra nunca lança, a qualquer distância e em outra linha */
tipo('Pagamento realizado', 'Seu pagamento de R$ 500,00 referente ao fechamento da sua fatura foi realizado', 'fatura_paga');
tipo('Pagamento confirmado', 'Pagamento de R$ 500,00 referente ao total da fatura do cartão', 'fatura_paga');
tipo('Pagamento confirmado', 'Pagamento de R$ 500,00\nreferente à sua\nfatura do cartão de crédito deste mês de outubro', 'fatura_paga');
ignorado('', 'R$ 500,00 da fatura foram compensados', 'fatura');
lancamento('', 'Compra de R$ 50,00 no cartão final 1234 lançada na fatura', { direcao: 'out', forma: null, valor: 50, digitos: '1234' });
/* Compra e pagamento de fatura no mesmo texto, sem dar para separar: nunca lança direto */
tipo('Pagamento da fatura', 'Pagamento de R$ 500,00 referente às compras do mês fechadas no total da sua fatura atual', 'fatura_paga');
tipo('', 'Compra de R$ 40,00 em Loja Modelo. Registramos o pagamento automático de uma conta e a sua fatura segue aberta', 'nao_entendi');

/* A3: valor da parcela nunca vira total */
lancamento('Compra aprovada', 'Compra parcelada em 3 vezes de R$ 100,00 em Loja Modelo', { direcao: 'out', forma: 'credit', valor: 300, parcelas: 3 });
lancamento('Compra aprovada', 'Compra em 3 parcelas de R$ 100,00 em Loja Modelo', { direcao: 'out', forma: 'credit', valor: 300, parcelas: 3 });
lancamento('Compra aprovada', 'Compra em 3 parcelas iguais de R$ 100,00 em Loja Modelo', { direcao: 'out', forma: 'credit', valor: 300, parcelas: 3, descricao: 'Loja Modelo' });
lancamento('Compra aprovada', 'Compra parcelada em 3x de R$ 100,00', { direcao: 'out', forma: 'credit', valor: 300, parcelas: 3 });
lancamento('Compra aprovada', 'Compra de R$ 300,00 em 3 vezes em Loja Modelo', { direcao: 'out', forma: 'credit', valor: 300, parcelas: 3, descricao: 'Loja Modelo' });
lancamento('Compra aprovada', 'Compra de R$ 300,00 em 3 parcelas de R$ 100,00 em Loja Modelo', { direcao: 'out', forma: 'credit', valor: 300, parcelas: 3, descricao: 'Loja Modelo' });
lancamento('Compra aprovada', 'Compra em 3 parcelas de R$ 100,00 no total de R$ 300,00', { direcao: 'out', forma: 'credit', valor: 300, parcelas: 3, descricao: null });
/* Sem como saber o total: "Não entendi", nunca palpite */
tipo('Compra aprovada', 'Compra de R$ 300,00 em 3 parcelas de R$ 110,00 em Loja Modelo', 'nao_entendi');
tipo('Compra aprovada', 'Compra parcelada em 3 no valor de R$ 100,00', 'nao_entendi');
tipo('Compra aprovada', 'Compra parcelada de R$ 300,00 em Loja Modelo', 'nao_entendi');

/* Com R$ e sem verbo colado: vai para a pessoa, nunca vira lançamento */
tipo('Atenção', 'Você tem R$ 50,00 esperando por você', 'nao_entendi');
tipo('Compra', 'Veja o app. Seu resumo tem R$ 50,00', 'nao_entendi');
tipo('', 'Compra de R$ 50,00 e taxa de R$ 5,00 em Loja Modelo', 'nao_entendi');
tipo('', 'R$ 40,00 com Visa ••1234', 'nao_entendi');
/* "R$ 50" no meio de outra palavra ou sem R$ */
ignorado('Compra aprovada', 'Compra de 50,00 em Loja Modelo', 'sem_valor');

/* Passo 1 da forma: palavra explícita */
const compra = (forma: string | null, valor = 10) => ({ direcao: 'out' as const, forma, valor });
lancamento('Você pagou Loja Exemplo', 'R$ 10,00 com Pix', compra('pix'));
lancamento('', 'Você pagou R$ 10,00 com Pix', compra('pix'));
lancamento('', 'Você pagou R$ 10,00 em Loja Exemplo com Pix', { ...compra('pix'), descricao: 'Loja Exemplo' });
lancamento('Pagamento aprovado', 'Pagamento de R$ 10,00 via Pix', compra('pix'));
lancamento('Compra aprovada', 'Compra de R$ 10,00 em Loja Exemplo por Pix', { ...compra('pix'), descricao: 'Loja Exemplo' });
lancamento('Compra aprovada', 'Compra de R$ 10,00 por QR Code Pix', compra('pix'));
lancamento('Compra aprovada', 'Compra de R$ 10,00 em Loja Exemplo no crédito', { ...compra('credit'), descricao: 'Loja Exemplo' });
lancamento('Compra aprovada', 'Compra de R$ 10,00 no cartão de crédito', compra('credit'));
lancamento('Compra aprovada', 'Compra de R$ 10,00 em Loja Exemplo função crédito', { ...compra('credit'), descricao: 'Loja Exemplo' });
lancamento('Compra aprovada', 'Compra de R$ 10,00 em Loja Exemplo no débito', { ...compra('debit'), descricao: 'Loja Exemplo' });
lancamento('Compra aprovada', 'Compra de R$ 10,00 no cartão de débito', compra('debit'));
lancamento('Compra aprovada', 'Compra de R$ 10,00 em Loja Exemplo função débito', { ...compra('debit'), descricao: 'Loja Exemplo' });
lancamento('Você pagou Loja Exemplo', 'Debitamos R$ 10,00 da sua conta.', compra('debit'));
lancamento('Boleto pago', 'Boleto pago de R$ 10,00 para Energia Modelo', compra('boleto'));
/* Na carteira, o título é a loja: só o texto responde a forma */
lancamento('Mercado Modelo', 'R$ 10,00 com cartão de crédito ••1234', { ...compra('credit'), digitos: '1234' }, WALLET);
lancamento('Mercado Modelo', 'R$ 10,00 no débito ••1234', { ...compra('debit'), digitos: '1234' }, WALLET);
lancamento('Crédito Modelo', 'R$ 10,00 com Visa ••1234', { ...compra(null), digitos: '1234' }, WALLET);

/* Crédito e débito no mesmo aviso: nem o sinal indireto desempata */
lancamento('Compra aprovada', 'Compra de R$ 10,00 no crédito ou no débito', compra(null));
lancamento('Compra aprovada', 'Compra de R$ 10,00 no crédito ou no débito. Limite disponível: R$ 900,00', compra(null));
lancamento('Compra aprovada', 'Compra de R$ 10,00 no crédito ou no débito. Saldo atual: R$ 900,00', compra(null));
/* Pix no crédito existe e sai da fatura, não do caixa: quem responde é a pessoa */
lancamento('Compra aprovada', 'Compra de R$ 10,00 com Pix no crédito', compra(null));

/* Passo 2: sinal indireto, sem mudar o valor escolhido */
lancamento('Compra aprovada', 'Compra de R$ 10,00 em Loja Exemplo. Limite disponível: R$ 900,00', { ...compra('credit'), descricao: 'Loja Exemplo' });
lancamento('Compra aprovada', 'Compra de R$ 10,00 em Loja Exemplo. Limite restante: R$ 900,00', compra('credit'));
lancamento('Compra aprovada', 'Compra de R$ 10,00 em Loja Exemplo. Limite de crédito disponível: R$ 900,00', compra('credit'));
lancamento('Você pagou Loja Exemplo', 'Saíram R$ 10,00 da sua conta', compra('debit'));
lancamento('Compra aprovada', 'R$ 10,00 da sua conta em Loja Exemplo', compra('debit'));
lancamento('Compra aprovada', 'Compra de R$ 10,00 em Loja Exemplo. O valor saiu da sua conta', { ...compra('debit'), descricao: 'Loja Exemplo' });
lancamento('Compra aprovada', 'Compra de R$ 10,00 em Loja Exemplo. O valor foi retirado da sua conta', { ...compra('debit'), descricao: 'Loja Exemplo' });
/* "Da sua conta" e "na sua conta" soltos não dizem a forma */
lancamento('Compra aprovada', 'Compra de R$ 10,00 em Loja Exemplo na sua conta', { ...compra(null), descricao: 'Loja Exemplo' });
lancamento('Compra aprovada', 'Compra de R$ 10,00. Veja na sua conta', compra(null));
lancamento('Compra aprovada', 'Compra de R$ 10,00. Confira os detalhes da sua conta', compra(null));
lancamento('Compra aprovada', 'Compra de R$ 10,00 em Loja Exemplo na conta corrente', { ...compra('debit'), descricao: 'Loja Exemplo' });
lancamento('Compra aprovada', 'Compra de R$ 10,00 em Loja Exemplo. Saldo disponível: R$ 90,00', compra('debit'));
lancamento('Compra aprovada', 'Compra de R$ 10,00 em Loja Exemplo. Saldo atual: R$ 90,00', compra('debit'));
/* Sinais contrários: sem forma */
lancamento('Compra aprovada', 'Compra de R$ 10,00 em Loja Exemplo. Limite disponível: R$ 900,00. Saldo atual: R$ 90,00', compra(null));
lancamento('Compra aprovada', 'Compra de R$ 300,00 em 3x em Loja Modelo. Saldo atual: R$ 900,00', { ...compra(null, 300), parcelas: 3 });
lancamento('Compra aprovada', 'Compra no débito de R$ 300,00 em 3x em Loja Modelo', { ...compra(null, 300), parcelas: 3 });
lancamento('Compra aprovada', 'Compra de R$ 300,00 em 3x com Pix em Loja Modelo', { ...compra(null, 300), parcelas: 3 });
/* A palavra explícita vence o sinal indireto */
lancamento('Compra aprovada', 'Compra no débito de R$ 10,00. Limite disponível: R$ 900,00', compra('debit'));
lancamento('Compra aprovada', 'Compra no crédito de R$ 10,00. Saldo atual: R$ 90,00', compra('credit'));
lancamento('Compra aprovada', 'Compra no crédito de R$ 300,00 em 3x. Saldo atual: R$ 90,00', { ...compra('credit', 300), parcelas: 3 });

/* T5: nada disto vira gasto, e o valor do limite ou do saldo nunca vira o da compra */
tipo('', 'Pagamento da fatura de R$ 500,00 via Pix', 'fatura_paga');
tipo('', 'Debitamos R$ 500,00 da sua conta referente ao pagamento da fatura', 'fatura_paga');
tipo('Fatura paga', 'Você pagou R$ 500,00 da sua conta corrente. Saldo atual: R$ 90,00. Referente à fatura', 'fatura_paga');
ignorado('', 'Seu limite disponível aumentou para R$ 5.000,00', 'limite');
ignorado('', 'Seu saldo disponível é R$ 1.000,00', 'saldo');
ignorado('', 'Limite restante: R$ 900,00', 'limite');
ignorado('Pix', 'Aproveite: pague com Pix e ganhe R$ 20,00', 'oferta');
ignorado('', 'Ganhe R$ 5,00 de cashback no Pix', 'oferta');
ignorado('', 'Empréstimo de R$ 1.000,00 na sua conta', 'oferta');
tipo('', 'Debitamos R$ 10,00 da sua conta.', 'nao_entendi');
tipo('', 'R$ 10,00 da sua conta corrente', 'nao_entendi');

/* Limite ou saldo depois da saída são rodapé: a compra não some nem troca de valor */
lancamento('', 'Compra de R$ 10,00 em Loja Exemplo. Seu limite de crédito disponível é R$ 900,00', { ...compra('credit'), descricao: 'Loja Exemplo' });
lancamento('', 'Compra de R$ 10,00 em Loja Exemplo, seu limite de crédito disponível agora é R$ 900,00', { ...compra('credit'), descricao: 'Loja Exemplo' });
lancamento('', 'Compra de R$ 10,00 em Loja Exemplo. Confira seu limite no app', { ...compra(null), descricao: 'Loja Exemplo' });
lancamento('', 'Compra de R$ 10,00 em Loja Exemplo. Seu saldo disponível em conta agora é R$ 900,00', { ...compra('debit'), descricao: 'Loja Exemplo' });
lancamento('Você pagou Loja Exemplo', 'R$ 10,00 no débito. Seu saldo disponível em conta agora é R$ 900,00', compra('debit'));
lancamento('Pix enviado', 'Pix enviado de R$ 10,00 para Maria Exemplo. Seu limite Pix disponível para hoje é R$ 900,00', { ...compra('pix'), descricao: 'Maria Exemplo' });
/* "Limite" antes de qualquer compra continua descartado, e nunca vira compra de R$ 5.000,00 */
ignorado('', 'Seu limite disponível para compras é de R$ 5.000,00', 'limite');
ignorado('', 'Aumentamos seu limite para R$ 5.000,00', 'limite');
/* Recusa vence, com o limite em qualquer lugar */
ignorado('', 'Compra de R$ 10,00 negada por falta de limite', 'recusada');
ignorado('', 'Compra de R$ 10,00 negada. Seu limite de crédito disponível é R$ 900,00', 'recusada');
ignorado('', 'Limite insuficiente, compra de R$ 10,00 negada', 'limite');
/* Vírgula logo depois do valor não pode fazer a compra sumir */
lancamento('', 'Compra de R$ 10,00, em Loja Exemplo', { ...compra(null), descricao: 'Loja Exemplo' });
/* Na dúvida entre compra e descarte: visível, nunca lançamento */
tipo('', 'Para compras acima de R$ 500,00, aumente seu limite', 'nao_entendi');
tipo('', 'Compras de até R$ 5.000,00. Seu limite aumentou', 'nao_entendi');
tipo('', 'Você gastou R$ 500,00 do seu limite', 'nao_entendi');
tipo('', 'Seu saldo disponível em conta agora é R$ 900,00', 'nao_entendi');
tipo('', 'Seu saldo disponível em conta agora é R$ 900,00. Compra de R$ 10,00', 'nao_entendi');
/* T5: fatura paga continua sem virar gasto, com rodapé longo */
tipo('', 'Pagamento de R$ 500,00 da fatura. Seu limite de crédito disponível é R$ 3.000,00', 'fatura_paga');

/* "Você pagou" no título: o resto dele é a loja, na caixa original, só se o texto não trouxer */
lancamento('Você pagou Loja Exemplo', 'Debitamos R$ 10,00 da sua conta.', { ...compra('debit'), descricao: 'Loja Exemplo' });
lancamento('Você pagou KFC', 'Debitamos R$ 10,00 da sua conta.', { ...compra('debit'), descricao: 'KFC' });
lancamento('VOCÊ PAGOU Loja Exemplo', 'Debitamos R$ 10,00 da sua conta.', { ...compra('debit'), descricao: 'Loja Exemplo' });
lancamento('Você pagou Loja Exemplo', 'Compra de R$ 10,00 em Mercado Modelo', { ...compra(null), descricao: 'Mercado Modelo' });
/* O que sobra do título precisa parecer nome */
lancamento('Você pagou R$ 10,00', 'Debitamos R$ 10,00 da sua conta.', { ...compra('debit'), descricao: null });
lancamento('Você pagou com Pix', 'R$ 10,00 da sua conta', { ...compra('pix'), descricao: null });
lancamento('Você pagou', 'Debitamos R$ 10,00 da sua conta.', { ...compra('debit'), descricao: null });
/* Outro título não responde pela loja */
lancamento('Pagamento feito Loja Exemplo', 'Compra de R$ 10,00.', { ...compra(null), descricao: null });
lancamento('Compra aprovada', 'Debitado R$ 10,00 da sua conta.', { ...compra('debit'), descricao: null });
/* O título continua entrando na procura de forma, como antes */
lancamento('Você pagou Pix Modelo', 'R$ 10,00 na loja', compra('pix'));
lancamento('Você pagou Crédito Modelo', 'Debitamos R$ 10,00 da sua conta.', compra(null));
lancamento('Você pagou Débito Modelo', 'R$ 10,00 na loja', compra('debit'));

/* A data é a da hora local do aviso, mesmo perto da meia-noite */
const r = interpretarAviso({ pacote: NUBANK, titulo: 'Compra', texto: 'Compra de R$ 10,00 em Loja Modelo', quando: QUANDO });
if ('data' in r && r.data === '2026-10-30') passaram++;
else falhou('data local', r);

/* Toda decisão tem frase para o diário */
for (const e of [ler('', 'Compra no crédito de R$ 10,00 em Loja Modelo'), ler('', 'Seu saldo é R$ 1,00'), ler('Fatura paga', 'Pagamento da fatura de R$ 5,00')]) {
  if (resumoDoEntendido(e).length > 5) passaram++;
  else falhou('resumo', e);
}

console.log(`corpus-avisos-banco: ${semForma} de ${lancamentos} lançamentos sem forma`);
console.log(`corpus-avisos-banco: ${passaram} ok, ${falhas} falhas`);
if (falhas) process.exit(1);
