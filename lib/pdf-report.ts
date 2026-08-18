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

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatMoney, MONTH_NAMES } from './format';
import type { Bill, Transaction } from './types';

const VERDE = '#0d7a63';
const VERMELHO = '#a8443c';
const PETROLEO = '#052229';
const TINTA_FRACA = '#6d7b78';

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

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 28px 32px; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: ${PETROLEO};
    font-size: 11px;
    line-height: 1.5;
    margin: 0;
  }
  header {
    display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 2px solid ${PETROLEO}; padding-bottom: 10px; margin-bottom: 20px;
  }
  .marca { font-size: 26px; font-weight: 300; letter-spacing: -0.5px; }
  .marca span { color: ${VERDE}; font-weight: 600; }
  .cabecalho-meta { text-align: right; color: ${TINTA_FRACA}; font-size: 10px; }
  .cabecalho-meta strong { display: block; color: ${PETROLEO}; font-size: 13px; font-weight: 600; }

  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: ${TINTA_FRACA};
       margin: 22px 0 8px; font-weight: 600; }

  .resumo { display: flex; gap: 10px; }
  .card { flex: 1; border: 1px solid #dde5e3; border-radius: 8px; padding: 12px 14px; }
  .card .rotulo { color: ${TINTA_FRACA}; font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px; }
  .card .valor { font-size: 17px; font-weight: 600; margin-top: 3px; }
  .positivo { color: ${VERDE}; }
  .negativo { color: ${VERMELHO}; }
  .card.destaque { background: #f2f8f6; border-color: ${VERDE}; }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px;
       color: ${TINTA_FRACA}; border-bottom: 1px solid #dde5e3; padding: 6px 6px; font-weight: 600; }
  td { padding: 6px 6px; border-bottom: 1px solid #eef3f2; vertical-align: middle; }
  .num { text-align: right; white-space: nowrap; }
  .forte { font-weight: 600; }
  .vazio { color: ${TINTA_FRACA}; font-style: italic; text-align: center; padding: 14px; }
  tbody tr:nth-child(even) td { background: #fafcfb; }

  .cat-nome { width: 26%; }
  .cat-barra { width: 42%; }
  .ponto { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .barra-trilho { background: #eef3f2; border-radius: 4px; height: 8px; width: 100%; }
  .barra-preenchida { height: 8px; border-radius: 4px; }

  footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #dde5e3;
           color: ${TINTA_FRACA}; font-size: 9px; display: flex; justify-content: space-between; }
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
