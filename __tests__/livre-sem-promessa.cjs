/*
 * O Livre para gastar é uma projeção, não uma garantia (E8a item 3, 09/11/2026).
 *
 * Pela regra 20 do AGENTS.md, o Livre conta as entradas do mês desde o dia 1,
 * inclusive as que ainda não caíram, e boletos e faturas só pesam quando são
 * pagos. Mesmo assim, quatro textos prometiam segurança: a descrição da
 * ferramenta que o Granabô lê ("sem comprometer as contas fixas"), a linha do
 * widget no Perfil ("realmente disponível"), o princípio 3 do PRODUCT.md ("é
 * seguro gastar") e a notificação 39 do TOM_DE_VOZ.md ("com segurança").
 *
 * O que este teste confere:
 * - o catálogo de ferramentas que o HANDLER REAL manda ao provedor (andaime de
 *   granabo-recusa-conta-bloqueada.cjs), não o texto do arquivo;
 * - a descrição do widget no Perfil, lida pela AST do próprio perfil.tsx,
 *   com as duas últimas palavras unidas: na coluna estreita da linha, medida
 *   com a Neue Machina Light, nenhuma reescrita sem esse espaço evitou a
 *   palavra viúva (regra 29) em todas as larguras e escalas de fonte;
 * - os dois documentos, sem travessão e sem a construção "não é X, é Y";
 * - e uma varredura das frases de promessa no app, nas funções, nos módulos
 *   nativos e nos dois documentos, para nenhuma voltar por outro caminho.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { carregar, pedido } = require('./granabo-recusa-conta-bloqueada.cjs');

const RAIZ = path.resolve(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

/* Frases que prometem segurança sobre o Livre. Vale para qualquer texto. */
const PROMESSA = /é seguro gastar|seguro (?:de )?gastar|gastar com segurança|sem comprometer as contas|realmente disponível/i;
/* "não é X, é Y" e o espelho "é X, não Y" (regra de copy do projeto). */
const CONTRASTE = /\bnão é [^.]*?, é\b|, não (?:um|uma|o|a|só)\b/i;

(async () => {
  /* 1. Granabô: a descrição que o modelo recebe com a ferramenta. */
  const c = carregar({ acesso: true });
  const res = await c.handler(pedido());
  assert.equal(res.status, 200, 'o pedido com acesso chega ao modelo');
  const ferramentas = c.diario.ferramentas;
  assert.ok(Array.isArray(ferramentas) && ferramentas.length > 0, 'o handler passou o catálogo de ferramentas');
  const livre = ferramentas.find((t) => t.function?.name === 'livreParaGastar');
  assert.ok(livre, 'livreParaGastar continua no catálogo');
  const descricao = livre.function.description;
  assert.doesNotMatch(descricao, PROMESSA, 'a descrição do Livre não promete segurança');
  assert.match(descricao, /^Retorna o Livre para gastar do MÊS ATUAL, uma projeção feita com o que o usuário registrou/, 'a descrição abre dizendo que é uma projeção');
  assert.match(descricao, /sem garantia de que as contas do mês estejam cobertas/, 'a descrição diz que o Livre não garante as contas');
  assert.match(descricao, /Boleto pendente ou atrasado não entra: ele pesa quando é pago\./, 'o restante da descrição foi preservado');
  assert.match(descricao, /Para saber quanto sobrou num mês já fechado, use resumoMes\.$/, 'o fim da descrição foi preservado');

  /* 2. Perfil: a linha do widget Livre, lida da fonte real. */
  const fonte = ts.createSourceFile('perfil.tsx', ler('app/(app)/perfil.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let lista = null;
  const visitar = (no) => {
    if (ts.isVariableDeclaration(no) && no.name.getText() === 'WIDGETS_HOME') lista = no.initializer;
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
  assert.ok(lista && ts.isArrayLiteralExpression(lista), 'WIDGETS_HOME continua uma lista literal');
  const prop = (obj, nome) => obj.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText() === nome)?.initializer;
  const itemLivre = lista.elements.find((e) => ts.isObjectLiteralExpression(e) && prop(e, 'tipo')?.text === 'livre');
  assert.ok(itemLivre, 'o widget Livre continua na lista do Perfil');
  const noDescricao = prop(itemLivre, 'descricao');
  assert.ok(noDescricao && ts.isStringLiteral(noDescricao), 'a descrição do widget Livre é texto fixo');
  const linha = noDescricao.text;
  assert.doesNotMatch(linha, PROMESSA, 'a linha do widget no Perfil não promete segurança');
  assert.match(linha, /livre por dia até o fim do\u00a0mês\.$/, 'a linha descreve o Livre por dia e une "do mês." (sem palavra viúva)');
  assert.ok(!linha.includes('—'), 'sem travessão na linha do widget');

  /* 3. Documentos: o princípio 3 e a notificação 39. */
  const produto = ler('PRODUCT.md');
  const principio = produto.match(/^3\. Mostrar[\s\S]*?(?=^4\. )/m)?.[0];
  assert.ok(principio, 'o princípio 3 continua no PRODUCT.md');
  assert.doesNotMatch(principio, PROMESSA, 'o princípio 3 não promete segurança');
  assert.match(principio.replace(/\s+/g, ' '), /apresentado como projeção e sem tom de garantia/, 'o princípio 3 trata o Livre como projeção');
  assert.ok(!principio.includes('—'), 'sem travessão no princípio 3');
  assert.doesNotMatch(principio, CONTRASTE, 'sem "não é X, é Y" no princípio 3');

  const tom = ler('design-system/TOM_DE_VOZ.md');
  const aviso = tom.match(/^39\. \*\*Olho no 'Livre para Gastar'.*\r?\n(.*)$/m)?.[1];
  assert.ok(aviso, 'a notificação 39 continua no TOM_DE_VOZ.md');
  assert.doesNotMatch(aviso, PROMESSA, 'a notificação 39 não promete segurança');
  assert.match(aviso, /pelo que você registrou/, 'a notificação 39 diz que o valor vem do que a pessoa registrou');
  assert.match(aviso, /card da Início/, 'a notificação 39 usa o nome da aba do app');
  assert.ok(!aviso.includes('—'), 'sem travessão na notificação 39');
  assert.doesNotMatch(aviso, CONTRASTE, 'sem "não é X, é Y" na notificação 39');

  /* 4. Varredura: nenhuma frase de promessa em app, funções, módulos e nos dois documentos. */
  const PULAR = new Set(['node_modules', 'build', 'dist', '.gradle', '.cxx', '.expo']);
  const EXT = /\.(?:ts|tsx|js|cjs|mjs|xml|json|md)$/;
  const achados = [];
  const varrer = (rel) => {
    const abs = path.join(RAIZ, rel);
    if (!fs.existsSync(abs)) return;
    if (fs.statSync(abs).isDirectory()) {
      for (const nome of fs.readdirSync(abs)) if (!PULAR.has(nome)) varrer(path.join(rel, nome));
      return;
    }
    if (!EXT.test(rel)) return;
    ler(rel).split(/\r?\n/).forEach((texto, i) => { if (PROMESSA.test(texto)) achados.push(`${rel}:${i + 1}`); });
  };
  for (const alvo of ['app', 'components', 'lib', 'hooks', 'constants', 'supabase/functions', 'modules', 'PRODUCT.md', 'design-system']) varrer(alvo);
  assert.deepEqual(achados, [], 'frase de promessa sobre o Livre encontrada');

  console.log('OK Livre sem promessa: Granabô, Perfil, PRODUCT.md e TOM_DE_VOZ.md tratam o Livre como projeção.');
})().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
