/**
 * Falas do Granabô narrador da landing (autor, 21/10/2026: "o Granabô deverá
 * aparecer em algumas sessões da página para explicar funcionalidades").
 *
 * Uma fala por seção, pelo `nativeID` dela em app/index.tsx. Regras de escrita
 * do Grana.: frase curta, voz de amigo, sem travessão, sem "não é X, é Y", sem
 * palavra viúva no fim, e só o que o app faz de verdade hoje.
 *
 * Seção sem fala, o narrador some. A de preços ficou sem fala de propósito
 * (auditoria Leis de UI, 24/10/2026): o balão cobria a lista do que o plano
 * inclui, e a garantia que ele dizia passou a estar escrita junto do botão.
 */
export type FalaNarrador = { secao: string; texto: string; imagem: 'feliz' | 'pensando' | 'piscando' | 'saudacao' };

export const FALAS_NARRADOR: FalaNarrador[] = [
  { secao: 'produto', imagem: 'pensando', texto: 'Café, app de corrida, um Pix aqui e ali. Somado, vira um bom pedaço do mês.' },
  { secao: 'registro-rapido', imagem: 'feliz', texto: 'Copiou o comprovante? Cola no Grana. que eu separo valor, data e tipo pra você.' },
  { secao: 'painel-web', imagem: 'piscando', texto: 'No computador o mês inteiro cabe numa tela, do saldo às faturas do cartão.' },
  { secao: 'beneficios', imagem: 'feliz', texto: 'Cada cartão desses foi desenhado a partir de uma tela de verdade do app.' },
  { secao: 'no-bolso', imagem: 'saudacao', texto: 'No Android dá pra falar o gasto e fotografar a nota. Eu entendo e lanço.' },
  { secao: 'habitos', imagem: 'piscando', texto: 'Esqueceu de anotar ontem? Acontece. Aqui ninguém leva bronca.' },
  { secao: 'granachat', imagem: 'pensando', texto: 'Esse sou eu! Pergunta quanto foi no mercado e eu respondo com os seus lançamentos.' },
  { secao: 'faq', imagem: 'pensando', texto: 'Ficou alguma dúvida? As respostas mais pedidas estão aqui embaixo.' },
];
