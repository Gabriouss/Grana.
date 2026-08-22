/* Lê uma função direto do ARQUIVO REAL e devolve o texto dela pronto pra
 * rodar dentro de `new Function`.
 *
 * Por que não `import`: as funções que interessam moram em
 * supabase/functions/whatsapp-webhook/index.ts, que é Deno — importa de URLs
 * e chama `Deno.serve` no topo. E lib/whatsapp.ts importa `react-native`.
 * Nenhum dos dois carrega no Node.
 *
 * Por que não copiar o código pro teste: já custou caro neste projeto. Uma
 * correção aplicada só de um lado deixou o bot quebrado em produção enquanto
 * os testes passavam (ver __tests__/sync-parser.js). Um teste que lê o
 * arquivo de verdade não consegue mentir sobre o que está publicado.
 *
 * A limpeza de tipos é ingênua de propósito: só serve pra funções pequenas,
 * puras e de regex, que é exatamente o que se extrai aqui. Quando ela não dá
 * conta, o erro aparece na hora de montar a função — barulhento, não silencioso.
 */
/// <reference types="node" />
import * as fs from 'fs';
import * as path from 'path';

export const WEBHOOK = path.join(__dirname, '..', 'supabase', 'functions', 'whatsapp-webhook', 'index.ts');
export const APP_WHATSAPP = path.join(__dirname, '..', 'lib', 'whatsapp.ts');

export function corpoDaFuncao(nome: string, arquivo: string = WEBHOOK): string {
  const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/);
  const re = new RegExp('^(?:export )?(?:async )?function ' + nome + '(?![A-Za-z0-9_])');
  const i = linhas.findIndex((l) => re.test(l));
  if (i === -1) throw new Error(`não achei ${nome} em ${path.basename(arquivo)}`);

  let profundidade = 0;
  const out: string[] = [];
  for (let j = i; j < linhas.length; j++) {
    out.push(linhas[j]);
    for (const ch of linhas[j]) {
      if (ch === '{') profundidade++;
      if (ch === '}') profundidade--;
    }
    if (j > i && profundidade === 0) break;
  }

  return (
    out
      .join('\n')
      /* O app exporta suas funções; o webhook não. Dentro de `new Function`
         não existe módulo, então o `export` precisa cair. */
      .replace(/^export /, '')
      /* O tipo de RETORNO sai primeiro: fazendo o contrário, `): number | null {`
         perdia só o "number" e sobrava um `| null` solto, que não é JS válido. */
      .replace(/\)\s*:\s*[A-Za-z<>[\]|',\s]+?\{/g, ') {')
      /* Genérico (`Record<string, number>`) antes do tipo simples: o simples
         casaria com o "string" de dentro dos sinais de maior e menor e
         deixaria `Record<, number>` para trás. */
      .replace(/:\s*Record<[^>]*>/g, '')
      /* O `[]` faz parte do tipo e precisa sair junto: sem ele,
         `const candidatos: string[] = []` virava `const candidatos[] = []`. */
      .replace(/:\s*(?:string|number|boolean)(?:\[\])?(?![A-Za-z0-9_])/g, '')
  );
}

/** Monta as funções pedidas num objeto só, opcionalmente com dependências injetadas. */
export function funcoesDoWebhook<T>(nomes: string[], deps: Record<string, unknown> = {}): T {
  const fonte = nomes.map((n) => corpoDaFuncao(n)).join('\n\n');
  const nomesDeps = Object.keys(deps);
  return new Function(
    ...nomesDeps,
    `${fonte}\nreturn { ${nomes.join(', ')} };`
  )(...nomesDeps.map((n) => deps[n])) as T;
}
