import { descricaoDoLancamento, parseParcelas } from '../heuristics';
import type { TxType } from '../types';
import { classeDoApp } from './catalogo';

/**
 * Entende o texto de um aviso do banco. Função pura: não chama rede, não lê
 * disco e não guarda nada (trava T2).
 *
 * Falha fechada: só vira lançamento com verbo de transação e valor em R$ colados
 * na mesma frase. O valor sai de um padrão estrito de R$, e não de
 * `guessAmountFromText`, feita para fala e texto solto. O que tem R$ e não foi
 * entendido vira "Não entendi", para a pessoa preencher à mão.
 */
export type FormaDoAviso = 'credit' | 'debit' | 'pix' | 'boleto';

export type MotivoIgnorado =
  | 'sem_valor' | 'moeda_estrangeira' | 'recusada' | 'estorno' | 'agendado' | 'limite' | 'saldo'
  | 'oferta' | 'codigo' | 'aplicacao' | 'resgate' | 'fatura';

export type AvisoEntendido =
  | {
      tipo: 'lancamento';
      direcao: TxType;
      /** null quando o aviso não diz: a pessoa escolhe antes de gravar. */
      forma: FormaDoAviso | null;
      /** Sempre o total, também na compra parcelada. */
      valor: number;
      parcelas: number | null;
      /** Loja ou pessoa, como veio no aviso. */
      contraparte: string | null;
      descricao: string | null;
      digitos: string | null;
      /** Da hora local do aviso, nunca da hora em que foi processado. */
      data: string;
    }
  | { tipo: 'nao_entendi'; data: string }
  | { tipo: 'fatura_paga'; data: string }
  | { tipo: 'ignorar'; motivo: MotivoIgnorado };

export type AvisoParaInterpretar = { pacote: string; titulo: string; texto: string; quando: number };

const ESPACOS = /[   ]/g;
const VALOR = /r\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?(?!\d|,\d)/g;
/** Verbo e valor separados por mais que isto, ou por fim de frase, não contam como colados. */
const FOLGA_MAXIMA = 50;

const NEGATIVOS: [RegExp, MotivoIgnorado][] = [
  [/\b(?:recusad|negad|nao\s+(?:foi\s+|pode\s+ser\s+)?(?:autorizad|aprovad|concluid|realizad|efetuad|processad|finalizad)|nao foi possivel|nao conseguimos|falhou|bloquead|cancelad)/, 'recusada'],
  [/\b(?:estorn|reembols|devoluc|devolvid|revertid|revers[ao])/, 'estorno'],
  [/\b(?:agendad|agendament|programad)/, 'agendado'],
  [/\blimite\b/, 'limite'],
  [/\b(?:oferta|promoc|aproveite|ganhe|cashback|desconto|pre-?aprovad|emprestimo|consignado|cupom|convite|indique|sorteio)/, 'oferta'],
  [/\b(?:codigo (?:de )?(?:verificacao|seguranca|confirmacao|acesso)|token|senha)\b/, 'codigo'],
  [/\b(?:aplicac|aplicou|aplicad|investiment|investiu|cdb|tesouro|caixinha|cofrinho)/, 'aplicacao'],
  [/\b(?:resgat|rendeu|rendimento|dividendo)/, 'resgate'],
];

/* Sem janela de distância: banco escreve "pagamento de R$ 500,00 referente ao
   fechamento da sua fatura", com o rótulo longe e até em outra linha. */
const MENCAO_A_FATURA = /\bfatura\b/;
const PAGOU = /\b(?:pagamento|pagou|pago|paga|quit\w*)\b/;
/* "pagamento de" fica de fora de propósito: com fatura no texto, ele não é compra. */
const COMPRA_DE_VERDADE = /\bcompras?\b|\bcomprou\b|\bgastou\b/;

const BOLETO = /\bboleto\b.{0,30}\b(?:pago|paga|pagamento|quitado)\b|\b(?:pagou|pagamento|paguei|pago)\b.{0,30}\bboleto\b/;
const ENTRADA = /\b(?:pix|transferencia|ted|doc)\s+recebid[oa]\b|\brecebeu\b|\brecebemos\b/;
const SAIDA_PIX = /\bpix\s+(?:enviado|realizado|feito|efetuado|confirmado|concluido)\b|\b(?:enviou|fez|realizou)\s+(?:um\s+)?pix\b|\btransferencia\s+(?:enviada|realizada|efetuada|concluida|feita)\b|\btransferiu\b|\benviou\b|\bpagamento\s+(?:via|por|de|com)\s+pix\b|\bpix\s+(?:no\s+valor\s+)?de\b(?=[^.!?\n]*\bpara\b)/;
const COMPRA = /\bcompras?\b|\bcomprou\b|\bgastou\b|\bvoce\s+pagou\b|\bpagamento\s+(?:aprovado|realizado|efetuado|confirmado|de)\b|\bdebitad[oa]\b/;

const CREDITO = /\bcredito\b/;
const DEBITO = /\bdebito\b|\bdebitad[oa]\b|\bdebitamos\b/;
const PIX = /\bpix\b/;
/* Lidos no texto inteiro, porque limite e saldo saem antes de procurar o valor. */
const SINAL_DE_CREDITO = /\blimite\s+(?:\S+\s+){0,2}?(?:disponivel|restante)\b/;
const SINAL_DE_DEBITO = /\b(?:da|na)\s+sua\s+conta\b|\bconta\s+corrente\b|\bsaldo\s+(?:\S+\s+){0,2}?(?:disponivel|atual)\b/;

/**
 * `null` quando o texto não diz, e 'duvida' quando diz coisas que não combinam.
 * Crédito com Pix fica em dúvida porque Pix no crédito sai da fatura, não do caixa.
 */
function formaEscrita(texto: string): 'credit' | 'debit' | 'pix' | 'duvida' | null {
  const credito = CREDITO.test(texto);
  if (credito && (DEBITO.test(texto) || PIX.test(texto))) return 'duvida';
  if (credito) return 'credit';
  if (PIX.test(texto)) return 'pix';
  return DEBITO.test(texto) ? 'debit' : null;
}

/** A palavra escrita vence o sinal indireto, e sinais contrários deixam para a pessoa. */
function formaDaCompra(semSaldo: string, completo: string, parcelada: boolean): FormaDoAviso | null {
  const escrita = formaEscrita(semSaldo);
  if (escrita === 'duvida') return null;
  if (escrita) return parcelada && escrita !== 'credit' ? null : escrita;
  const credito = parcelada || SINAL_DE_CREDITO.test(completo);
  const debito = SINAL_DE_DEBITO.test(completo);
  if (credito === debito) return null;
  return credito ? 'credit' : 'debit';
}

/** Mesmo tamanho do original: as posições do texto normalizado valem nos dois. */
function normalizar(texto: string): string {
  return Array.from(texto.normalize('NFC').replace(ESPACOS, ' '))
    .map((c) => {
      const base = c.normalize('NFD')[0];
      return base.length === c.length ? base.toLowerCase().slice(0, c.length) : c;
    })
    .join('');
}

type ValorAchado = { valor: number; inicio: number; fim: number };

function valoresDe(base: string): ValorAchado[] {
  const achados: ValorAchado[] = [];
  for (const m of base.matchAll(VALOR)) {
    const reais = Number(m[1].replace(/\./g, ''));
    const valor = reais + (m[2] ? Number(m[2]) / 100 : 0);
    if (valor > 0) achados.push({ valor, inicio: m.index, fim: m.index + m[0].length });
  }
  return achados;
}

/** O valor mais próximo do verbo, sem fim de frase no meio. */
function valorColado(base: string, verbo: RegExp, valores: ValorAchado[]): ValorAchado | null {
  let melhor: ValorAchado | null = null;
  let menor = Infinity;
  for (const m of base.matchAll(new RegExp(verbo.source, 'g'))) {
    const inicio = m.index;
    const fim = inicio + m[0].length;
    for (const v of valores) {
      const entre = v.inicio >= fim ? base.slice(fim, v.inicio) : v.fim <= inicio ? base.slice(v.fim, inicio) : '';
      if (entre.length > FOLGA_MAXIMA || /[.!?\n]/.test(entre)) continue;
      if (entre.length < menor) {
        menor = entre.length;
        melhor = v;
      }
    }
  }
  return melhor;
}

const SAIDA = new RegExp(`${COMPRA.source}|${SAIDA_PIX.source}|${BOLETO.source}`);
/* "Para compras acima de R$ 500,00" é condição, não um gasto. */
const PROPOSTA = /\bpara\s+compras?\b|\b(?:ate|acima\s+de|a\s+partir\s+de|mais\s+de|menos\s+de)\s+r\$/;
const FIM_DE_FRASE = /[.!?](?:\s|$)|\n/;
const RODAPE = /\b(?:limite|saldo)\b(?:(?![.!?](?:\s|$)|\n).)*?r\$\s?[\d.,]*\d/g;

/**
 * Limite ou saldo depois de uma saída colada ao valor são rodapé: a compra não some
 * nem troca de valor. Antes da saída, nada muda. `duvida` vira "Não entendi", que fica
 * visível, quando não dá para separar a saída do limite. Recusa continua vencendo.
 */
function tirarRodapes(texto: string): { texto: string; duvida: boolean } {
  const inicio = texto.search(/\b(?:limite|saldo)\b/);
  if (inicio < 0) return { texto, duvida: false };
  const antes = texto.slice(0, inicio);
  const saida = valorColado(antes, SAIDA, valoresDe(antes));
  if (!saida) return { texto, duvida: false };
  if (PROPOSTA.test(antes)) return { texto, duvida: true };
  const limpo = antes + texto.slice(inicio).replace(RODAPE, (m) => ' '.repeat(m.length));
  const solto = limpo.search(/\blimite\b/);
  if (solto < 0) return { texto: limpo, duvida: false };
  if (!FIM_DE_FRASE.test(limpo.slice(saida.fim, solto))) return { texto: limpo, duvida: true };
  return { texto: limpo.replace(/\blimite\b/g, (m) => ' '.repeat(m.length)), duvida: false };
}

function dataLocal(quando: number): string {
  const d = new Date(quando);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function digitosDe(base: string): string | null {
  const m = base.match(/\bfinal\s*:?\s*(\d{4})\b/)
    ?? base.match(/(?:\*{2,}|•+|\.{2,})\s?(\d{4})\b/)
    ?? base.match(/\bcartao\s+(\d{4})\b/);
  return m ? m[1] : null;
}

const CORTE_DA_CONTRAPARTE = /\s+(?:com|no|na|pelo|pela|usando|utilizando|para|via|por)\s+(?:o\s+|a\s+|seu\s+|sua\s+)*(?:cart|final\b|conta\b|pix\b|qr\b|credito\b|debito\b)|\s+funcao\s+(?:credito|debito)\b|\s+final\b|\s+em\s+\d|\s+as\s+\d|\s+às\s+\d|[.!;\n]|,\s|\s+-\s/;
const INICIO_DEPOIS = /^[\s,:-]*(?:(?:foi\s+)?(?:aprovad[ao]s?|realizad[ao]s?|efetuad[ao]s?|autorizad[ao]s?|confirmad[ao]s?|recebid[ao]s?|enviad[ao]s?)\s+)?(?:em|no|na|nos|nas|para|pra|de|do|da)\s+/;
const NAO_E_NOME = /^(?:cart|credito|debito|valor|total|sua|seu|conta|pix\b)/;
/* A parte do parcelamento sai antes de procurar a loja, com as posições intactas. */
const TRECHO_DE_PARCELAS = /\b(?:em\s+)?\d{1,2}\s*(?:x|vezes|parcelas?)\b(?:\s+iguais)?(?:\s+de\s+r\$\s?[\d.,]*\d)?/g;

function contraparteDe(original: string, base: string, valor: ValorAchado): string | null {
  const depois = base.slice(valor.fim);
  const inicio = depois.match(INICIO_DEPOIS);
  let nome: string | null = null;
  if (inicio) {
    const resto = depois.slice(inicio[0].length);
    const corte = resto.search(CORTE_DA_CONTRAPARTE);
    const tamanho = corte >= 0 ? corte : resto.length;
    const comeco = valor.fim + inicio[0].length;
    nome = original.slice(comeco, comeco + tamanho).trim();
  }
  if (!nome || NAO_E_NOME.test(normalizar(nome))) {
    const antes = base.slice(0, valor.inicio).match(/\b(?:compra|pagamento)\s+(?:aprovad[ao]\s+|realizad[ao]\s+)?(?:em|no|na)\s+(.+?)\s+(?:no\s+valor|de\s*$|valor)/);
    if (antes && !NAO_E_NOME.test(antes[1])) {
      const comeco = base.indexOf(antes[1]);
      nome = original.slice(comeco, comeco + antes[1].length).trim();
    } else {
      nome = null;
    }
  }
  if (!nome) return null;
  /* Banco costuma mandar a loja toda em maiúscula. */
  return nome === nome.toUpperCase() && /\p{L}/u.test(nome)
    ? nome.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, espaco: string, letra: string) => espaco + letra.toUpperCase())
    : nome;
}

/**
 * `3x de R$ 100,00`, `3 vezes de R$ 100,00` e `R$ 300,00 em 3x` dão o mesmo
 * total. Sem como saber o total, responde 'incerto' e vira "Não entendi": o valor
 * da parcela gravado como total divide a compra por três sem ninguém notar.
 */
function parcelamentoDe(base: string, valores: ValorAchado[], valor: ValorAchado): { parcelas: number; total: number } | 'incerto' | null {
  if (!/\bparcel|\d\s*x\b|\bvezes\b/.test(base)) return null;
  const parcelas = parseParcelas(base);
  if (!parcelas) return 'incerto';

  const distintos = [...new Set(valores.map((v) => v.valor))].sort((a, b) => a - b);
  if (distintos.length > 2) return 'incerto';
  if (distintos.length === 2) {
    const [parcela, total] = distintos;
    return Math.abs(parcela * parcelas - total) <= 0.01 * parcelas ? { parcelas, total } : 'incerto';
  }

  const porParcela = new RegExp(`\\b${parcelas}\\s*(?:x|vezes|parcelas?)(?:\\s+iguais)?\\s*(?:de\\s*|no\\s+valor\\s+de\\s*)?$`);
  if (porParcela.test(base.slice(0, valor.inicio))) {
    return { parcelas, total: Math.round(valor.valor * parcelas * 100) / 100 };
  }
  const parcelasDepoisDoValor = /\b\S+\s+(?:vezes|parcelas?)\b|\b\d{1,2}\s*x\b|\bparcel\w*\s+em\s+\S+/;
  return parcelasDepoisDoValor.test(base.slice(valor.fim)) ? { parcelas, total: valor.valor } : 'incerto';
}

export function interpretarAviso(aviso: AvisoParaInterpretar): AvisoEntendido {
  const original = `${aviso.titulo} ${aviso.texto}`.normalize('NFC').replace(ESPACOS, ' ').trim();
  const completo = normalizar(original);
  const data = dataLocal(aviso.quando);

  if (/(?:us\$|u\$s|\busd\b|\beur\b|€|£|\bdolar|\beuro|moeda estrangeira)/.test(completo)) {
    return { tipo: 'ignorar', motivo: 'moeda_estrangeira' };
  }
  if (!valoresDe(completo).length) return { tipo: 'ignorar', motivo: 'sem_valor' };

  /* "Limite disponível: R$ 900,00" no fim de um aviso de compra não é o valor
     da compra. Troca por espaços para as posições continuarem valendo. */
  const apagar = (trecho: string) => ' '.repeat(trecho.length);
  const base = completo.replace(/\blimite(?:\s+\S+){0,3}?[\s:]*r\$\s?[\d.,]*\d/g, apagar);
  const { texto: semSaldo, duvida } = tirarRodapes(base.replace(/\bsaldo(?:\s+\S+){0,3}?[\s:]*r\$\s?[\d.,]*\d/g, apagar));
  const valores = valoresDe(semSaldo);
  if (!valores.length) {
    return { tipo: 'ignorar', motivo: base === completo ? 'saldo' : 'limite' };
  }

  /* Com fatura no texto, só compra, comprou ou gastou podem virar lançamento, e
     nunca junto de um pagamento, porque aí não dá para separar os dois. */
  if (MENCAO_A_FATURA.test(semSaldo)) {
    const pagou = semSaldo.search(PAGOU);
    const comprou = semSaldo.search(COMPRA_DE_VERDADE);
    if (comprou < 0) {
      if (pagou >= 0) return { tipo: 'fatura_paga', data };
      return { tipo: 'ignorar', motivo: 'fatura' };
    }
    if (pagou >= 0) return pagou < comprou ? { tipo: 'fatura_paga', data } : { tipo: 'nao_entendi', data };
  }

  const ehCompra = COMPRA.test(semSaldo);

  for (const [padrao, motivo] of NEGATIVOS) {
    if (motivo === 'limite' && duvida) continue;
    if (padrao.test(semSaldo)) return { tipo: 'ignorar', motivo };
  }
  if (duvida) return { tipo: 'nao_entendi', data };

  let direcao: TxType = 'out';
  let forma: FormaDoAviso | null = null;
  let achado: ValorAchado | null = null;
  let ehCompraPorVerbo = false;

  if (BOLETO.test(semSaldo)) {
    achado = valorColado(semSaldo, BOLETO, valores);
    forma = 'boleto';
  } else if (ENTRADA.test(semSaldo)) {
    achado = valorColado(semSaldo, ENTRADA, valores);
    direcao = 'in';
    forma = 'pix';
  } else if (SAIDA_PIX.test(semSaldo)) {
    achado = valorColado(semSaldo, SAIDA_PIX, valores);
    forma = 'pix';
  } else if (ehCompra) {
    ehCompraPorVerbo = true;
    achado = valorColado(semSaldo, COMPRA, valores);
  }

  const parcelamento = achado ? parcelamentoDe(semSaldo, valores, achado) : null;
  if (parcelamento === 'incerto') return { tipo: 'nao_entendi', data };
  if (ehCompraPorVerbo) forma = formaDaCompra(semSaldo, completo, !!parcelamento);
  else if (parcelamento) forma = 'credit';

  /* Dois valores sem ser parcelamento: não dá para saber qual é o certo. */
  const distintos = new Set(valores.map((v) => v.valor));
  if (achado && !parcelamento && distintos.size > 1) achado = null;

  let contraparte = achado ? contraparteDe(original, semSaldo.replace(TRECHO_DE_PARCELAS, apagar), achado) : null;

  /* Carteira costuma mandar só "R$ 30,00 com Visa ••1234", com a loja no título. */
  if (!achado && classeDoApp(aviso.pacote) === 'carteira' && distintos.size === 1
    && /r\$\s?[\d.,]+\s+(?:com|with|via|no|na)\b/.test(semSaldo) && digitosDe(semSaldo)) {
    achado = valores[0];
    contraparte = aviso.titulo.trim() || null;
    /* Aqui o título é a loja, e só o texto pode responder a forma. */
    const escrita = formaEscrita(normalizar(aviso.texto));
    forma = escrita === 'duvida' ? null : escrita;
  }

  if (!achado) return { tipo: 'nao_entendi', data };

  const descricao = contraparte ? descricaoDoLancamento(contraparte, direcao) || contraparte : null;
  return {
    tipo: 'lancamento',
    direcao,
    forma,
    valor: parcelamento?.total ?? achado.valor,
    parcelas: parcelamento?.parcelas ?? null,
    contraparte,
    descricao,
    digitos: digitosDe(semSaldo),
    data,
  };
}

/** A frase do diário do teste. */
export function resumoDoEntendido(e: AvisoEntendido): string {
  const FORMAS: Record<FormaDoAviso, string> = { credit: 'crédito', debit: 'débito', pix: 'Pix', boleto: 'boleto' };
  const MOTIVOS: Record<MotivoIgnorado, string> = {
    sem_valor: 'sem valor em R$', moeda_estrangeira: 'moeda estrangeira', recusada: 'recusada ou cancelada',
    estorno: 'estorno', agendado: 'agendamento', limite: 'aviso de limite', saldo: 'aviso de saldo',
    oferta: 'oferta', codigo: 'código de segurança', aplicacao: 'aplicação', resgate: 'resgate ou rendimento',
    fatura: 'aviso de fatura',
  };
  if (e.tipo === 'nao_entendi') return 'Não entendi. Foi para a lista, para preencher à mão.';
  if (e.tipo === 'fatura_paga') return 'Fatura paga. Não vira lançamento.';
  if (e.tipo === 'ignorar') return `Ignorado: ${MOTIVOS[e.motivo]}.`;
  const valor = `R$ ${e.valor.toFixed(2).replace('.', ',')}`;
  const partes = [
    e.direcao === 'in' ? 'Entrada' : 'Saída',
    valor,
    e.forma ? FORMAS[e.forma] : 'forma não informada',
    e.parcelas ? `em ${e.parcelas}x` : null,
    e.descricao,
    e.digitos ? `final ${e.digitos}` : null,
  ].filter(Boolean);
  return `${partes.join(', ')}.`;
}
