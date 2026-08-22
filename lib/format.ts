import type { Transaction } from './types';

export function formatMoney(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Compra no cartão de crédito não é saída de caixa na hora — só quando a
 * fatura é paga (ver payCardInvoice em lib/data.ts). Mesmo critério que
 * app/(app)/credito.tsx já usa para achar compras no crédito.
 */
export function isCreditTx(t: Pick<Transaction, 'payment_method' | 'card_id'>): boolean {
  return t.payment_method === 'credit' || !!t.card_id;
}

/**
 * Lê um valor em dinheiro escrito do jeito que brasileiro escreve.
 *
 * A versão anterior tomava o ÚLTIMO separador como decimal, fosse ele vírgula
 * ou ponto. Isso acertava "1.234,56" e errava feio o caso mais comum de todos:
 * "1.500" virava um real e cinquenta centavos. Dentro do app o estrago era
 * invisível, porque o campo de valor usa `formatMoneyInput` e sempre entrega
 * duas casas decimais — mas lançamento por WhatsApp, por voz, por planilha e
 * por nota fiscal passam texto livre por aqui, e "Aluguel 1.500 reais"
 * entrava como R$ 1,50.
 *
 * A regra agora separa os dois papéis do ponto:
 *  - Existe vírgula? Então ela é o decimal e todo ponto é milhar (pt-BR).
 *  - Só ponto, seguido de exatamente três dígitos? É milhar — ninguém escreve
 *    preço com três casas decimais, mas todo mundo escreve "1.500".
 *  - Só ponto, com uma ou duas casas? É decimal, para aceitar "10.50" de quem
 *    digitou no formato americano ou colou de uma planilha.
 */
export function parseAmount(raw: string): number {
  /* Pontuação de frase nas pontas não faz parte do número. Sem isso, um
     "5,50," (a vírgula que separa o valor do resto da frase entrando junto
     na captura de quem chamou) era lido com a ÚLTIMA vírgula como separador
     decimal: R$ 5,50 virava R$ 550,00. Os chamadores em lib/heuristics.ts já
     capturam terminando em dígito, mas a limpeza fica aqui também porque
     esta função é o funil por onde todo valor do app passa. */
  const bruto = (raw || '').trim().replace(/^[^\d\-]+|[^\d]+$/g, '');
  if (!bruto) return 0;

  const soDigitos = (s: string) => s.replace(/[^0-9]/g, '');
  const sinal = bruto.includes('-') ? -1 : 1;

  const ultimaVirgula = bruto.lastIndexOf(',');
  const ultimoPonto = bruto.lastIndexOf('.');

  let posDecimal: number;

  if (ultimaVirgula !== -1) {
    posDecimal = ultimaVirgula;
  } else if (ultimoPonto !== -1) {
    const depois = soDigitos(bruto.slice(ultimoPonto + 1));
    const antes = soDigitos(bruto.slice(0, ultimoPonto));
    /* "0.999" continua decimal: o teste de `antes` diferente de zero evita
       transformar um valor abaixo de um real em novecentos e noventa e nove. */
    if (depois.length === 3 && antes !== '' && antes !== '0') {
      return sinal * (parseFloat(antes + depois) || 0);
    }
    posDecimal = ultimoPonto;
  } else {
    return sinal * (parseFloat(soDigitos(bruto)) || 0);
  }

  const inteiro = soDigitos(bruto.slice(0, posDecimal));
  const decimal = soDigitos(bruto.slice(posDecimal + 1));
  return sinal * (parseFloat(`${inteiro || '0'}.${decimal || '0'}`) || 0);
}

/**
 * Máscara de valor monetário digitado, no comportamento de app de banco: os
 * dígitos entram pela direita e a vírgula fica parada, sempre com duas casas.
 * Digitar 1, 2, 3, 4 vira 0,01 → 0,12 → 1,23 → 12,34.
 *
 * Por que uma máscara em vez de deixar a pessoa digitar a vírgula: sem ela, o
 * teclado decimal aceita "12.5", "12,5" e "12" para a mesma intenção, e cada
 * um vira um número diferente na hora de salvar — "12,5" é doze e cinquenta,
 * mas "12.5" também, e "125" era pra ser 1,25 quando a pessoa esqueceu a
 * vírgula. Fixando as duas casas, existe só uma leitura possível do que foi
 * digitado.
 *
 * O teto de 11 dígitos casa com `numeric(12,2)` do banco (ver schema.sql) e
 * com LIMITS.amount: acima disso o insert seria recusado depois de a pessoa
 * já ter digitado tudo.
 */
export function formatMoneyInput(raw: string): string {
  const digitos = (raw || '').replace(/\D/g, '').slice(0, 11);
  if (!digitos) return '';

  // Sem zeros à esquerda além do necessário: "007" é 0,07, não 007,00.
  const semZerosSobrando = digitos.replace(/^0+(?=\d{3})/, '');
  const preenchido = semZerosSobrando.padStart(3, '0');

  const centavos = preenchido.slice(-2);
  const inteiros = preenchido.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${inteiros},${centavos}`;
}

/* ── Telefone brasileiro (vínculo de WhatsApp) ─────────────────────────────
 *
 * O DDI +55 é fixo na interface e não é digitado: o app é só para o Brasil, e
 * pedir o DDI é uma pergunta a mais que quase sempre tem a mesma resposta —
 * e que, quando errada, gera um vínculo que nunca casa com a mensagem que
 * chega.
 *
 * O formato guardado importa: a Meta manda o remetente como dígitos puros
 * ("5585980773199"), e é assim que supabase/functions/whatsapp-webhook procura
 * o dono do número. Guardar "+55 (85) 98077-3199" faria a busca falhar.
 * Por isso a máscara é só de exibição; o que vai para o banco é `telefoneE164`.
 */

/** Máscara de digitação: "(85) 98077-3199". Recebe e devolve só o DDD + número, sem o +55. */
export function formatarTelefoneBR(raw: string): string {
  let d = (raw || '').replace(/\D/g, '');
  // Se a pessoa colar um número já com DDI, não duplica o 55.
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);

  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  // Celular tem 9 dígitos (9XXXX-XXXX); fixo tem 8 (XXXX-XXXX).
  const corte = resto.length > 8 ? 5 : 4;
  if (resto.length <= corte) return `(${ddd}) ${resto}`;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** Converte o que está no campo para o formato que a Meta usa: 55 + DDD + número, só dígitos. */
export function telefoneE164BR(raw: string): string {
  let d = (raw || '').replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return '55' + d.slice(0, 11);
}

/** DDD + 8 (fixo) ou 9 (celular) dígitos. */
export function telefoneBRValido(raw: string): boolean {
  const d = (raw || '').replace(/\D/g, '');
  return d.length === 10 || d.length === 11;
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function formatMonthYear(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

export function isSameMonth(isoDate: string, year: number, month: number): boolean {
  if (!isoDate) return false;
  const [y, m] = isoDate.split('-').map(Number);
  return y === year && m === month + 1;
}

/**
 * Soma N meses a uma data 'YYYY-MM-DD', preservando o dia quando o mês de
 * destino tem dias suficientes (senão cai no último dia dele — ex: 31/jan +
 * 1 mês vira 28/fev, não 3/mar).
 */
export function addMonthsToISO(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(d, lastDay));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

/**
 * Saudação de acordo com o horário: Bom dia até o meio-dia, Boa tarde até as
 * 18h, Boa noite dali até as 4h da manhã seguinte. Cai para só o período
 * (sem vírgula sobrando) quando não há nome para usar.
 */
export function saudacaoDoDia(nome: string): string {
  const hora = new Date().getHours();
  const periodo = hora >= 4 && hora < 12 ? 'Bom dia' : hora >= 12 && hora < 18 ? 'Boa tarde' : 'Boa noite';
  return nome ? `${periodo}, ${nome}` : periodo;
}

export function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${String(d).padStart(2, '0')} ${months[m - 1]} ${y}`;
}

