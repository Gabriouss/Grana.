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
import type { MonthlyWrapped } from './monthly-wrapped';

import { montarHtml, type DadosRelatorio } from './pdf-report-html';
export type { DadosRelatorio } from './pdf-report-html';

function cabecalhoDaFonte(): { base: string; faces: string } {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return { base: '', faces: '' };
  const regras = document.getElementById('expo-generated-fonts')?.textContent ?? '';
  const faces = regras.match(/@font-face\s*\{[^}]*NeueMachina[^}]*\}/g);
  if (!faces?.length) return { base: '', faces: '' };
  return { base: `<base href="${globalThis.location?.origin ?? ''}/" />`, faces: faces.join('\n') };
}

export async function gerarRelatorioPdf(dados: DadosRelatorio): Promise<{ uri: string; compartilhado: boolean }> {
  const html = montarHtml(dados, cabecalhoDaFonte());

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

