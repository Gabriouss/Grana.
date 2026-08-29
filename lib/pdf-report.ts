/**
 * Relatório Executivo em PDF — Épico 4 do PLANO_DE_EVOLUCAO.md.
 *
 * O PDF é gerado a partir de um HTML renderizado pela engine nativa do
 * expo-print (WebKit no iOS, Chromium no Android). Duas consequências
 * moldaram o template abaixo:
 *
 *  - Nada de recursos externos. Sem fonte web, sem imagem remota, sem CSS de
 *    CDN: a renderização acontece offline e um recurso que não carrega vira
 *    um buraco no relatório. As "barras" de categoria são divs com largura
 *    percentual, não um gráfico — assim não há dependência nenhuma.
 *  - Cores impressas em papel branco. A paleta do app é escura, e reproduzi-la
 *    no PDF gastaria tinta e ficaria ilegível impresso. O relatório usa fundo
 *    claro com os tons de acento do Grana. como destaque.
 */

import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatMoney, MONTH_NAMES } from './format';
import type { Bill, Transaction } from './types';

const VERDE = '#0d7a63';
const VERMELHO = '#a8443c';
const PETROLEO = '#052229';
const TINTA_FRACA = '#6d7b78';
const LINHA = '#dde5e3';
const MENTA_PAPEL = '#f2f8f6';

/* A pilha termina na fonte do sistema porque no nativo é ela que vai valer
   (ver `cabecalhoDaFonte`). Na web a Neue Machina entra na frente. */
const FAMILIA_REGULAR = `'NeueMachina-Regular', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
const FAMILIA_LIGHT = `'NeueMachina-Light', 'NeueMachina-Regular', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;

function escaparHtml(texto: string): string {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dataBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export type DadosRelatorio = {
  ano: number;
  mes: number; // 0-11
  transactions: Transaction[];
  bills: Bill[];
  /** Nome da carteira filtrada, ou 'Total' quando são todas. */
  carteira: string;
};

/**
 * Faz o relatório sair na Neue Machina em vez da fonte do sistema.
 *
 * O template nasceu com `-apple-system, Segoe UI, Roboto` porque a regra do
 * arquivo é não depender de recurso externo: uma fonte que não carrega vira
 * um buraco no PDF. Só que isso deixava o único documento que a pessoa
 * IMPRIME e mostra para alguém com a cara de uma exportação de planilha,
 * enquanto o app inteiro é Neue Machina.
 *
 * Na web dá para ter as duas coisas. O react-native-web já injeta as
 * `@font-face` da marca num `<style id="expo-generated-fonts">`, com a fonte
 * baixada e em cache; copiar essas regras para a janela do relatório não custa
 * requisição nova nem peso de bundle. As URLs são relativas, então o HTML
 * também leva um `<base>` apontando para a origem (a janela é `about:blank` e
 * sem isso resolveria contra nada).
 *
 * No nativo o expo-print roda num WebView isolado, sem acesso aos assets do
 * app por URL, e embutir a fonte em base64 custaria ~155 KB no bundle por um
 * recurso de uso pontual. Lá o relatório continua na fonte do sistema, que é
 * a escolha certa entre "sem fonte" e "bundle 5% maior".
 */
function cabecalhoDaFonte(): { base: string; faces: string } {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return { base: '', faces: '' };
  const regras = document.getElementById('expo-generated-fonts')?.textContent ?? '';
  const faces = regras.match(/@font-face\s*\{[^}]*NeueMachina[^}]*\}/g);
  if (!faces?.length) return { base: '', faces: '' };
  return { base: `<base href="${globalThis.location?.origin ?? ''}/" />`, faces: faces.join('\n') };
}

type Insight = { titulo: string; texto: string };

/**
 * A leitura do mês em texto — a parte que o relatório não tinha.
 *
 * Antes ele era só tabulação: totais, uma tabela por categoria, o extrato. Um
 * extrato responde "quanto" e "onde", e deixa "e daí?" por conta de quem lê.
 * As frases abaixo respondem isso a partir dos mesmos números já calculados.
 *
 * Duas regras valem para todas elas:
 *
 *  - **Cada insight só aparece quando o dado o sustenta.** Sem mês anterior na
 *    lista recebida, a comparação some em vez de virar uma variação inventada
 *    de −100%. Sem saída registrada, a concentração não é calculada.
 *  - **Descrever, não repreender.** O produto escuta sem julgar (ver a estrela
 *    guia do DESIGN.md), então nada aqui chama gasto de erro nem manda a
 *    pessoa cortar nada. Os números falam.
 */
function gerarInsights(dados: {
  entradas: number;
  saidas: number;
  saldo: number;
  saidasTx: Transaction[];
  doMes: Transaction[];
  categorias: [string, { total: number; cor: string }][];
  saidasMesAnterior: number | null;
  diasNoMes: number;
  boletosPagos: Bill[];
}): Insight[] {
  const { entradas, saidas, saldo, saidasTx, doMes, categorias, saidasMesAnterior, diasNoMes, boletosPagos } = dados;
  const out: Insight[] = [];
  const pct = (parte: number, todo: number) => (todo > 0 ? (parte / todo) * 100 : 0);

  /* 1. O resultado, lido como taxa de poupança. O valor absoluto já está no
     balanço acima; o que ele não diz é quanto da renda sobrou. */
  if (entradas > 0) {
    const taxa = pct(saldo, entradas);
    out.push(
      saldo >= 0
        ? {
            titulo: 'Sobrou no mês',
            texto: `De cada R$ 100 que entraram, R$ ${formatMoney(Math.max(0, taxa))} ficaram. O resultado do mês foi de R$ ${formatMoney(saldo)}.`,
          }
        : {
            titulo: 'Saiu mais do que entrou',
            texto: `As saídas passaram as entradas em R$ ${formatMoney(Math.abs(saldo))}, o equivalente a ${Math.abs(taxa).toFixed(0)}% do que foi recebido no mês.`,
          }
    );
  }

  /* 2. Comparação com o mês anterior. Só existe quando a lista recebida
     alcança o mês anterior, o que depende da tela que pediu o relatório. */
  if (saidasMesAnterior !== null && saidasMesAnterior > 0 && saidas > 0) {
    const variacao = ((saidas - saidasMesAnterior) / saidasMesAnterior) * 100;
    const estavel = Math.abs(variacao) < 5;
    out.push({
      titulo: estavel ? 'Ritmo parecido com o mês anterior' : variacao > 0 ? 'Gasto acima do mês anterior' : 'Gasto abaixo do mês anterior',
      texto: estavel
        ? `As saídas ficaram em R$ ${formatMoney(saidas)}, variação de ${variacao.toFixed(0)}% sobre os R$ ${formatMoney(saidasMesAnterior)} do mês passado.`
        : `As saídas somaram R$ ${formatMoney(saidas)}, ${Math.abs(variacao).toFixed(0)}% ${variacao > 0 ? 'a mais' : 'a menos'} que os R$ ${formatMoney(saidasMesAnterior)} do mês anterior.`,
    });
  }

  /* 3. Concentração: quantas categorias explicam a maior parte do mês. Uma
     lista de vinte categorias esconde que três respondem por quase tudo. */
  if (saidas > 0 && categorias.length > 1) {
    let acumulado = 0;
    let quantas = 0;
    for (const [, { total }] of categorias) {
      acumulado += total;
      quantas++;
      if (acumulado / saidas >= 0.7) break;
    }
    const [nomeLider, dadosLider] = categorias[0];
    out.push({
      titulo: 'Onde o mês se concentrou',
      texto:
        quantas === 1
          ? `${nomeLider} sozinha responde por ${pct(dadosLider.total, saidas).toFixed(0)}% das saídas, R$ ${formatMoney(dadosLider.total)}.`
          : `${quantas} de ${categorias.length} categorias somam 70% das saídas. A maior é ${nomeLider}, com ${pct(dadosLider.total, saidas).toFixed(0)}% do total.`,
    });
  }

  /* 4. Custo fixo contra gasto variável. Recorrentes e boletos quitados são o
     que já estava comprometido antes de o mês começar. */
  if (saidas > 0) {
    const recorrentes = saidasTx.filter((t) => t.recurring).reduce((s, t) => s + Number(t.amount), 0);
    const boletos = boletosPagos.reduce((s, b) => s + Number(b.amount), 0);
    const fixo = recorrentes + boletos;
    if (fixo > 0) {
      out.push({
        titulo: 'Quanto do mês já estava comprometido',
        texto: `R$ ${formatMoney(fixo)} saíram de contas recorrentes e boletos, ${pct(fixo, saidas).toFixed(0)}% das saídas. O restante, R$ ${formatMoney(saidas - fixo)}, foi decidido ao longo do mês.`,
      });
    }
  }

  /* 5. O maior lançamento isolado. Um único valor grande costuma explicar um
     mês fora da curva melhor que a média da categoria inteira. */
  if (saidasTx.length > 1) {
    const maior = saidasTx.reduce((a, b) => (Number(b.amount) > Number(a.amount) ? b : a));
    const fatia = pct(Number(maior.amount), saidas);
    if (fatia >= 12) {
      out.push({
        titulo: 'Maior saída isolada',
        texto: `"${maior.description}" custou R$ ${formatMoney(Number(maior.amount))} e sozinha responde por ${fatia.toFixed(0)}% do que saiu no mês.`,
      });
    }
  }

  /* 6. Constância do registro. É o insight sobre o USO do app, e o único que
     a pessoa controla diretamente no mês seguinte. */
  if (doMes.length > 0) {
    const dias = new Set(doMes.map((t) => t.occurred_on)).size;
    out.push({
      titulo: 'Constância do registro',
      texto: `Houve lançamento em ${dias} de ${diasNoMes} dias. Quanto mais perto de todos os dias, mais perto do real fica o retrato acima.`,
    });
  }

  /* 7. Parcelas: a parte do mês que continua pesando nos próximos. */
  const parcelados = saidasTx.filter((t) => (t.installment_total ?? 1) > 1);
  if (parcelados.length > 0) {
    const valorParcelas = parcelados.reduce((s, t) => s + Number(t.amount), 0);
    const restantes = parcelados.reduce(
      (max, t) => Math.max(max, (t.installment_total ?? 1) - (t.installment_current ?? 1)),
      0
    );
    out.push({
      titulo: 'Compras parceladas',
      texto: `R$ ${formatMoney(valorParcelas)} do mês vieram de ${parcelados.length} ${parcelados.length === 1 ? 'parcela' : 'parcelas'}${restantes > 0 ? `, e a mais longa ainda tem ${restantes} ${restantes === 1 ? 'mês' : 'meses'} pela frente` : ''}.`,
    });
  }

  return out;
}

function montarHtml({ ano, mes, transactions, bills, carteira }: DadosRelatorio): string {
  const doMes = transactions.filter((t) => {
    const [y, m] = t.occurred_on.split('-').map(Number);
    return y === ano && m - 1 === mes;
  });

  const entradasTx = doMes.filter((t) => t.type === 'in');
  const saidasTx = doMes.filter((t) => t.type === 'out');
  const entradas = entradasTx.reduce((s, t) => s + Number(t.amount), 0);
  const saidas = saidasTx.reduce((s, t) => s + Number(t.amount), 0);
  const saldo = entradas - saidas;

  const porCategoria = new Map<string, { total: number; cor: string }>();
  for (const t of saidasTx) {
    const atual = porCategoria.get(t.category) ?? { total: 0, cor: t.color };
    atual.total += Number(t.amount);
    porCategoria.set(t.category, atual);
  }
  const categorias = [...porCategoria.entries()].sort((a, b) => b[1].total - a[1].total);

  const boletosPagos = bills.filter((b) => {
    const [y, m] = b.due_date.split('-').map(Number);
    return b.status === 'paid' && y === ano && m - 1 === mes;
  });

  /* Mês anterior para comparação. A lista que chega aqui é a que a tela já
     tinha carregado, e nem sempre alcança o mês passado — em Gráficos ela
     segue o período escolhido. Por isso `null` quando não há NENHUM
     lançamento anterior: sem isso, um mês ausente viraria "queda de 100%",
     que é o oposto do que aconteceu. */
  const mesAnterior = mes === 0 ? 11 : mes - 1;
  const anoAnterior = mes === 0 ? ano - 1 : ano;
  const doMesAnterior = transactions.filter((t) => {
    const [y, m] = t.occurred_on.split('-').map(Number);
    return y === anoAnterior && m - 1 === mesAnterior;
  });
  const saidasMesAnterior = doMesAnterior.length
    ? doMesAnterior.filter((t) => t.type === 'out').reduce((s, t) => s + Number(t.amount), 0)
    : null;

  const diasNoMes = new Date(ano, mes + 1, 0).getDate();

  const insights = gerarInsights({
    entradas,
    saidas,
    saldo,
    saidasTx,
    doMes,
    categorias,
    saidasMesAnterior,
    diasNoMes,
    boletosPagos,
  });

  const blocoInsights = insights.length
    ? `
  <h2>Leitura do mês</h2>
  <div class="insights">
    ${insights
      .map(
        (i) => `<div class="insight">
      <div class="insight-titulo">${escaparHtml(i.titulo)}</div>
      <div class="insight-texto">${escaparHtml(i.texto)}</div>
    </div>`
      )
      .join('')}
  </div>`
    : '';

  const linhasCategorias = categorias
    .map(([nome, { total, cor }]) => {
      const pct = saidas > 0 ? (total / saidas) * 100 : 0;
      return `
        <tr>
          <td class="cat-nome"><span class="ponto" style="background:${escaparHtml(cor)}"></span>${escaparHtml(nome)}</td>
          <td class="cat-barra">
            <div class="barra-trilho"><div class="barra-preenchida" style="width:${pct.toFixed(1)}%;background:${escaparHtml(cor)}"></div></div>
          </td>
          <td class="num">${pct.toFixed(1)}%</td>
          <td class="num forte">R$ ${formatMoney(total)}</td>
        </tr>`;
    })
    .join('');

  const linhasBoletos = boletosPagos.length
    ? boletosPagos
        .map(
          (b) => `
        <tr>
          <td>${escaparHtml(b.description)}</td>
          <td>${escaparHtml(b.category)}</td>
          <td class="num">${dataBr(b.due_date)}</td>
          <td class="num forte">R$ ${formatMoney(Number(b.amount))}</td>
        </tr>`
        )
        .join('')
    : '<tr><td colspan="4" class="vazio">Nenhum boleto quitado neste mês.</td></tr>';

  const extrato = [...doMes].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  const linhasExtrato = extrato.length
    ? extrato
        .map(
          (t) => `
        <tr>
          <td class="num">${dataBr(t.occurred_on)}</td>
          <td>${escaparHtml(t.description)}</td>
          <td>${escaparHtml(t.category)}</td>
          <td class="num ${t.type === 'in' ? 'positivo' : 'negativo'}">
            ${t.type === 'in' ? '+' : '−'} R$ ${formatMoney(Number(t.amount))}
          </td>
        </tr>`
        )
        .join('')
    : '<tr><td colspan="4" class="vazio">Nenhum lançamento neste mês.</td></tr>';

  const geradoEm = new Date().toLocaleString('pt-BR');
  const fonte = cabecalhoDaFonte();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
${fonte.base}
<style>
${fonte.faces}
  @page { margin: 26px 30px; }
  * { box-sizing: border-box; }

  /* A marca só tem Light e Regular, e font-weight nunca entra: o navegador
     sintetizaria um falso negrito na Neue Machina. A hierarquia inteira deste
     documento é feita com TAMANHO, COR e ESPACEJAMENTO, que é como a
     tipografia do produto já funciona nas telas. */
  /* O padding do corpo existe pra TELA. Na web o relatório abre numa janela
     que a pessoa lê antes de mandar imprimir, e ali o @page ainda não vale:
     sem isto o texto encostava nas bordas da janela e a coluna de valores
     saía cortada. Na impressão o @page assume e o padding sai de cena, pra
     margem não ser contada duas vezes. */
  body {
    font-family: ${FAMILIA_REGULAR};
    color: ${PETROLEO};
    font-size: 10.5px;
    line-height: 1.55;
    margin: 0;
    padding: 26px 30px;
    max-width: 820px;
    -webkit-font-smoothing: antialiased;
  }
  @media print {
    body { padding: 0; max-width: none; }
  }
  .leve { font-family: ${FAMILIA_LIGHT}; }

  header {
    display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 1.5px solid ${PETROLEO}; padding-bottom: 12px; margin-bottom: 22px;
  }
  .marca { font-family: ${FAMILIA_LIGHT}; font-size: 27px; letter-spacing: -0.6px; line-height: 1; }
  .marca span { color: ${VERDE}; }
  .cabecalho-meta { text-align: right; color: ${TINTA_FRACA}; font-size: 9.5px; line-height: 1.5; }
  .cabecalho-meta strong { display: block; color: ${PETROLEO}; font-size: 13px; font-weight: normal; letter-spacing: -0.2px; }

  h2 { font-size: 9px; text-transform: uppercase; letter-spacing: 1.4px; color: ${TINTA_FRACA};
       margin: 26px 0 10px; font-weight: normal; }

  .resumo { display: flex; gap: 9px; }
  .card { flex: 1; border: 1px solid ${LINHA}; border-radius: 10px; padding: 11px 13px; }
  .card .rotulo { color: ${TINTA_FRACA}; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.7px; }
  .card .valor { font-size: 16px; margin-top: 4px; letter-spacing: -0.3px; font-variant-numeric: tabular-nums; }
  .positivo { color: ${VERDE}; }
  .negativo { color: ${VERMELHO}; }
  .card.destaque { background: ${MENTA_PAPEL}; border-color: ${VERDE}; }

  /* Leitura do mês: duas colunas de blocos curtos. Cada um tem uma régua
     menta à esquerda, o mesmo recurso que separa citação de corpo de texto —
     aqui separando interpretação de dado bruto, que é a distinção que o
     relatório passou a fazer. */
  .insights { display: flex; flex-wrap: wrap; gap: 9px; }
  /* max-width junto do flex-basis: com um número ímpar de insights, sem o
     teto o último card esticava sozinho pela largura toda e quebrava a grade
     de duas colunas. */
  .insight {
    flex: 1 1 calc(50% - 5px); max-width: calc(50% - 5px); min-width: 210px;
    border: 1px solid ${LINHA}; border-left: 2.5px solid ${VERDE};
    border-radius: 0 8px 8px 0; padding: 9px 12px;
    break-inside: avoid;
  }
  .insight-titulo { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.7px; color: ${VERDE}; }
  .insight-texto { font-family: ${FAMILIA_LIGHT}; margin-top: 3px; color: ${PETROLEO}; }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.7px;
       color: ${TINTA_FRACA}; border-bottom: 1px solid ${LINHA}; padding: 7px 6px; font-weight: normal; }
  td { padding: 7px 6px; border-bottom: 1px solid #eef3f2; vertical-align: middle; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .forte { letter-spacing: -0.2px; }
  .vazio { color: ${TINTA_FRACA}; text-align: center; padding: 16px; font-family: ${FAMILIA_LIGHT}; }
  tbody tr:nth-child(even) td { background: #fafcfb; }
  /* Uma tabela de extrato longa é o caso normal: repetir o cabeçalho a cada
     página evita que a partir da segunda folha as colunas fiquem sem nome. */
  thead { display: table-header-group; }
  tr { break-inside: avoid; }

  .cat-nome { width: 26%; }
  .cat-barra { width: 42%; }
  .ponto { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 7px; }
  .barra-trilho { background: #eef3f2; border-radius: 4px; height: 7px; width: 100%; }
  .barra-preenchida { height: 7px; border-radius: 4px; }

  footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid ${LINHA};
           color: ${TINTA_FRACA}; font-size: 8.5px; display: flex; justify-content: space-between;
           font-family: ${FAMILIA_LIGHT}; }
</style>
</head>
<body>
  <header>
    <div class="marca">Grana<span>.</span></div>
    <div class="cabecalho-meta">
      <strong>Relatório Executivo</strong>
      ${escaparHtml(MONTH_NAMES[mes])} de ${ano} · Carteira: ${escaparHtml(carteira)}
    </div>
  </header>

  <h2>Balanço consolidado</h2>
  <div class="resumo">
    <div class="card">
      <div class="rotulo">Entradas</div>
      <div class="valor positivo">R$ ${formatMoney(entradas)}</div>
    </div>
    <div class="card">
      <div class="rotulo">Saídas</div>
      <div class="valor negativo">R$ ${formatMoney(saidas)}</div>
    </div>
    <div class="card destaque">
      <div class="rotulo">Resultado do mês</div>
      <div class="valor ${saldo >= 0 ? 'positivo' : 'negativo'}">
        ${saldo >= 0 ? '+' : '−'} R$ ${formatMoney(Math.abs(saldo))}
      </div>
    </div>
    <div class="card">
      <div class="rotulo">Lançamentos</div>
      <div class="valor">${doMes.length}</div>
    </div>
  </div>

${blocoInsights}

  <h2>Divisão das saídas por categoria</h2>
  <table>
    <thead><tr><th>Categoria</th><th>Participação</th><th class="num">%</th><th class="num">Valor</th></tr></thead>
    <tbody>${linhasCategorias || '<tr><td colspan="4" class="vazio">Nenhuma saída registrada neste mês.</td></tr>'}</tbody>
  </table>

  <h2>Boletos quitados</h2>
  <table>
    <thead><tr><th>Descrição</th><th>Categoria</th><th class="num">Vencimento</th><th class="num">Valor</th></tr></thead>
    <tbody>${linhasBoletos}</tbody>
  </table>

  <h2>Extrato detalhado</h2>
  <table>
    <thead><tr><th class="num">Data</th><th>Descrição</th><th>Categoria</th><th class="num">Valor</th></tr></thead>
    <tbody>${linhasExtrato}</tbody>
  </table>

  <footer>
    <span>Gerado pelo app Grana. em ${escaparHtml(geradoEm)}</span>
    <span>Documento de uso pessoal — sem valor fiscal</span>
  </footer>
</body>
</html>`;
}

/**
 * Gera o PDF e abre a folha de compartilhamento do sistema. Devolve o caminho
 * local do arquivo. Quando o compartilhamento não está disponível (simulador,
 * web), o PDF ainda é gerado e o caminho devolvido — quem chama decide o que
 * dizer ao usuário.
 */
export async function gerarRelatorioPdf(dados: DadosRelatorio): Promise<{ uri: string; compartilhado: boolean }> {
  const html = montarHtml(dados);

  /* Web tem caminho próprio porque o shim de web do expo-print IGNORA o HTML:
     `printToFileAsync()` lá é literalmente `window.print()` (ver
     node_modules/expo-print/build/ExponentPrint.web.js). O efeito era que, no
     navegador, o botão "Exportar relatório" imprimia a TELA — com barra
     lateral, navegação e os valores mascarados do modo privacidade — em vez
     do relatório montado acima, e ainda devolvia `uri: undefined`, que o
     chamador exibia num alerta como "o arquivo ficou em: undefined".

     A saída é uma janela nova com o HTML do relatório e o print dela. Janela,
     e não iframe: a CSP do vercel.json não declara `frame-src`, então cai no
     `default-src 'self'` e um iframe `srcdoc`/`blob:` seria bloqueado — uma
     janela aberta a partir do clique não passa por essa restrição. */
  if (Platform.OS === 'web') {
    const janela = globalThis.window?.open('', '_blank', 'noopener,width=900,height=1200');
    if (!janela) {
      throw new Error('O navegador bloqueou a janela do relatório. Permita pop-ups para este site e tente de novo.');
    }
    janela.document.open();
    janela.document.write(html);
    janela.document.close();
    /* `onload` em vez de imprimir na sequência: sem esperar, o Safari abre a
       caixa de impressão com a página ainda em branco. */
    janela.onload = () => {
      janela.focus();
      janela.print();
    };
    return { uri: '', compartilhado: true };
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  if (!(await Sharing.isAvailableAsync())) {
    return { uri, compartilhado: false };
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Relatório Grana. — ${MONTH_NAMES[dados.mes]} de ${dados.ano}`,
    UTI: 'com.adobe.pdf',
  });
  return { uri, compartilhado: true };
}
