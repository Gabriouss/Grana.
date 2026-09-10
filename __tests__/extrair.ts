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
import ts from 'typescript';
export function corpoDaFuncao(nome: string, arquivo: string = WEBHOOK): string {
  const fonte = ts.createSourceFile(arquivo, fs.readFileSync(arquivo, 'utf8'), ts.ScriptTarget.Latest, true);
  const no = fonte.statements.find(node =>
    (ts.isFunctionDeclaration(node) && node.name?.text === nome) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(fonte) === nome)));
  if (!no) throw new Error(`não achei ${nome} em ${path.basename(arquivo)}`);
  // O compilador remove tipos sem confundir objetos, regex ou funções locais.
  return ts.transpileModule(no.getText(fonte).replace(/^export /, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
}
export const WEBHOOK = path.join(__dirname, '..', 'supabase', 'functions', 'whatsapp-webhook', 'index.ts');
export const APP_WHATSAPP = path.join(__dirname, '..', 'lib', 'whatsapp.ts');

/* Aceita `function` e `const`: regex e tabela costumam morar numa constante
   de módulo, e uma função que depende dela não roda sozinha dentro do
   `new Function`. Sem isso a saída era piorar o código de produção pra caber
   na ferramenta — inlinar a constante dentro da função só pra o teste
   conseguir lê-la. */

/** Monta as funções pedidas num objeto só, opcionalmente com dependências injetadas. */
export function funcoesDoWebhook<T>(nomes: string[], deps: Record<string, unknown> = {}): T {
  const fonte = nomes.map((n) => corpoDaFuncao(n)).join('\n\n');
  const nomesDeps = Object.keys(deps);
  return new Function(
    ...nomesDeps,
    `${fonte}\nreturn { ${nomes.join(', ')} };`
  )(...nomesDeps.map((n) => deps[n])) as T;
}
