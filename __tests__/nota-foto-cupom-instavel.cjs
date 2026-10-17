// O MESMO cupom tem de dar o MESMO resultado em qualquer foto (lib/nota-foto-parser.ts).
//
// Vídeo do autor de 17/10/2026: o cupom "Mercadinho Irmaos Gemeos", VALOR
// TOTAL 29,97, funcionou numa foto e, em outras, saiu com o nome "Hift" ou
// "Fonte Ibpt Cartao De Credito Iten" e "Não achei o valor total". O que muda
// entre uma foto e outra é a ordem das linhas que o ML Kit devolve, o
// enquadramento e a inclinação. Aqui o cupom é remontado a partir do quadro
// do vídeo, linha a linha com a posição na foto, e passa pelo caminho real
// (`textoPorFileira` -> `extrairTotalDaFoto` e `extrairDetalhesDaNota`) em
// várias leituras: ordem dos blocos, embaralhada, rodapé primeiro, topo
// cortado com ruído, e girada em vários ângulos, com os cantos de cada linha
// como o ML Kit entrega.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const js = ts.transpileModule(fs.readFileSync('lib/nota-foto-parser.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, { exports: mod.exports, module: mod, Number, Set, RegExp, String, Math, Date });
const { textoPorFileira, extrairTotalDaFoto, extrairDetalhesDaNota } = mod.exports;

const HOJE = '2026-10-17';
// Sem cabecalho "Forma de pagamento" o cupom nao diz a forma com seguranca: fica para a pessoa, em toda leitura.
// [texto, esquerda, topo, largura, altura]: medidas de um quadro reto, em px.
const CUPOM = [
  ['OE', 470, 100, 40, 30],
  ['MERCADINHO IRMAOS GEMEOS', 250, 140, 500, 34],
  ['MERCADINHO IRMAOS GEMEOS LTDA EPP', 230, 180, 540, 30],
  ['RUA 09, 4651', 400, 215, 200, 30],
  ['PASSARE FORTALEZA CE 60862200', 260, 250, 480, 30],
  ['CNPJ: 03.187.860/0001-74 IE: 062814311 IM:', 180, 285, 700, 30],
  ['DANFE NFC-e Documento Auxiliar de', 250, 340, 520, 30],
  ['Nota Fiscal de Consumidor Eletronica', 230, 375, 560, 30],
  ['17/10/2026 13:45:54', 50, 425, 250, 30], ['Lj:1', 420, 425, 60, 30], ['Cx:005', 560, 425, 90, 30], ['Seq:829648', 770, 425, 160, 30],
  ['Oper.:000257-ANA LARA LUZ FERREIRA (FUNC1)', 50, 460, 560, 30], ['Vend.:', 840, 460, 90, 30],
  ['Item Codigo Descricao Qtde. Unid. Vl.unit. Valor total', 50, 515, 880, 30],
  ['001 07898505927228 ROLO TIRA PELOS TODO DIA 10FLS', 50, 550, 750, 30],
  ['1 unid X 6,49', 50, 585, 300, 30], ['6.49', 860, 585, 70, 30],
  ['002 07891000244425 IOGURTE NESTLE MORANGO 900G', 50, 640, 700, 30],
  ['1 unid X 14,49', 50, 675, 300, 30], ['14.49', 850, 675, 80, 30],
  ['003 07898080664402 ENERGETICO BALY MELANCIA LATA 473ML', 50, 730, 800, 30],
  ['1 unid X 8,99', 50, 765, 300, 30], ['8.99', 860, 765, 70, 30],
  ['VALOR TOTAL:', 60, 830, 280, 40], ['29.97', 800, 830, 130, 40],
  ['Cartao de Credito', 60, 875, 300, 30], ['29.97', 830, 875, 100, 30],
  ['Valor aprox. dos trib. (Lei Federal 12.741/2012)', 60, 910, 620, 30], ['R$ 10.41', 800, 910, 130, 30],
  ['Trib. aprox.: Federal R$4.18 Estadual R$6.23 Municipal R$0.00', 60, 945, 800, 30],
  ['Fonte: IBPT', 60, 980, 150, 30],
  ['17/10/26 13:45 LJ1 OP000257 CX005 SQ829648', 200, 1045, 600, 30],
  ['ICMS DEST. EXCLUSIVAMENTE PARA FINS DE EXCLUSAO DE SEU', 100, 1080, 800, 30],
  ['VEDADO O CREDITAMENTO', 330, 1150, 340, 30],
  ['CHAVE DE ACESSO', 300, 1200, 380, 34],
  ['2326 1003 1878 6000 0174 6500 5000 0722 9010 5825 6487', 120, 1240, 760, 30],
  ['CONSUMIDOR NAO IDENTIFICADO', 250, 1700, 500, 30],
];

/** Linha do ML Kit: cantos girados em volta do centro da foto, caixa reta envolvendo os cantos. */
function linha([text, x, y, w, h], graus) {
  const a = (graus * Math.PI) / 180;
  const cx = 500, cy = 900;
  const girar = (px, py) => ({
    x: cx + (px - cx) * Math.cos(a) - (py - cy) * Math.sin(a),
    y: cy + (px - cx) * Math.sin(a) + (py - cy) * Math.cos(a),
  });
  const cornerPoints = [girar(x, y), girar(x + w, y), girar(x + w, y + h), girar(x, y + h)];
  const xs = cornerPoints.map((p) => p.x), ys = cornerPoints.map((p) => p.y);
  const left = Math.min(...xs), top = Math.min(...ys);
  return { text, cornerPoints, frame: { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top } };
}

/** Embaralhamento com semente fixa: o teste falha sempre igual, nunca por sorte. */
function embaralhar(lista, semente) {
  const r = [...lista];
  let s = semente;
  for (let i = r.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

// O ML Kit agrupa por coluna: a coluna da esquerda num bloco, os valores alinhados à direita noutro.
const esquerda = CUPOM.filter((l) => l[1] < 700);
const direita = CUPOM.filter((l) => l[1] >= 700);
const semTopo = CUPOM.filter((l) => l[2] > 120);
const leituras = {
  'blocos por coluna': [...esquerda, ...direita],
  'linhas embaralhadas (1)': embaralhar(CUPOM, 7),
  'linhas embaralhadas (2)': embaralhar(CUPOM, 2026),
  'rodape primeiro': [...CUPOM].reverse(),
  'topo cortado, ruido "Hift" no alto': [['Hift', 420, 60, 70, 26], ...semTopo],
  'topo cortado ate a razao social': [['Hift', 420, 120, 70, 26], ...CUPOM.filter((l) => l[2] > 160)],
};

let ok = 0;
// Objeto criado dentro do vm tem outro prototipo: compara pelo conteudo.
const plano = (o) => JSON.parse(JSON.stringify(o));
function confere(nome, linhas) {
  const texto = textoPorFileira(linhas);
  const total = extrairTotalDaFoto(texto);
  const det = extrairDetalhesDaNota(texto, HOJE);
  const visto = { total: total.valorTotal, nome: det.estabelecimento, pagamento: det.pagamento, data: det.data };
  assert.deepEqual(visto, { total: 29.97, nome: 'Mercadinho Irmaos Gemeos', pagamento: null, data: HOJE },
    nome + '\n' + texto);
  ok++;
  console.log('  ok  ' + nome);
}

for (const [nome, cupom] of Object.entries(leituras)) {
  for (const graus of [0, 3, -5, 8, -12, 15, 90, -90, 180]) {
    confere(`${nome}, foto girada ${graus} graus`, cupom.map((l) => linha(l, graus)));
  }
}

/* Sem os cantos (leitor antigo, ou teste antigo) e com a foto reta, a ordem das linhas também não importa. */
for (const [nome, cupom] of Object.entries(leituras)) {
  confere(`${nome}, sem cantos`, cupom.map((l) => {
    const { text, frame } = linha(l, 0);
    return { text, frame };
  }));
}

/* Os dois "29.97" lado a lado (total e cartão) são o mesmo número: não é dúvida. */
{
  const L = (text, top, left) => ({ text, frame: { top, left, height: 40, width: 120 } });
  const r = extrairTotalDaFoto(textoPorFileira([L('VALOR TOTAL:', 100, 40), L('29.97', 128, 900), L('Cartao de Credito', 140, 40), L('29.97', 150, 900)]));
  assert.deepEqual(plano(r), { valorTotal: 29.97, motivo: 'ok' });
  ok++; console.log('  ok  total e cartao com o mesmo valor, proximos na foto torta');
}

/* Rotulo do total sem numero lido: vale a linha do pagamento, so com o valor na mesma linha. */
{
  assert.deepEqual(plano(extrairTotalDaFoto('VALOR TOTAL:\nCartao de Credito 29,97\nFonte: IBPT')), { valorTotal: 29.97, motivo: 'ok' });
  assert.deepEqual(plano(extrairTotalDaFoto('VALOR TOTAL:\nPix 10,00\nCartao de Credito 19,97')), { valorTotal: null, motivo: 'ambiguo' });
  assert.deepEqual(plano(extrairTotalDaFoto('VALOR TOTAL:\nCartao de Credito\n29,97')), { valorTotal: null, motivo: 'sem_total' });
  ok += 3; console.log('  ok  linha do pagamento como ultimo recurso, e so com uma forma');
}

/* Nome: rodape no topo do texto nunca vira nome, e loja com "credito" no nome continua valendo. */
{
  const nome = (t) => extrairDetalhesDaNota(t, HOJE).estabelecimento;
  assert.equal(nome('Fonte: IBPT Cartao de Credito Item\nMERCADINHO IRMAOS GEMEOS\nCNPJ 03.187.860/0001-74'), 'Mercadinho Irmaos Gemeos');
  assert.equal(nome('Hift\nMERCADINHO IRMAOS GEMEOS LTDA EPP\nCNPJ 03.187.860/0001-74'), 'Mercadinho Irmaos Gemeos');
  assert.equal(nome('Hift\nCNPJ 03.187.860/0001-74'), 'Hift');
  assert.equal(nome('CREDITO REAL MATERIAIS\nCNPJ 11.222.333/0001-81'), 'Credito Real Materiais');
  ok += 4; console.log('  ok  nome ancorado no CNPJ, sem rodape, sem ruido curto quando ha nome melhor');
}

console.log('\n' + ok + '/' + ok + ' checagens do cupom instavel de 17/10 passaram\n');
