/* Bateria 7: módulo real compartilhado, duas origens, valores e efeitos.
 * Sem microfone, banco ou rede reais. Qualquer falha encerra com código 1. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { carregar, montarWidget, montarOperacoes, memoriaLocal, heuristics: h } = require('./voz-auditoria-rodada6.cjs');
const confianca = carregar('lib/voz-confiabilidade.ts', { './heuristics': h });
let total = 0;
const falhas = [];
function check(nome, atual, esperado) {
  total++;
  try { assert.deepEqual(JSON.parse(JSON.stringify(atual)), JSON.parse(JSON.stringify(esperado))); }
  catch { if (falhas.length < 30) falhas.push({ nome, atual, esperado }); else falhas.push(null); }
}

async function valoresEParidade() {
  let texto = '';
  const gravacoes = [];
  const { task, reg } = montarWidget({
    transcrever: async () => ({ ok: true, transcript: texto }),
    registrar: async (id, source, payload) => {
      gravacoes.push({ source, payload });
      return { status: 'committed', operationId: id, ids: ['t1'] };
    },
    carteiras: [{ id: 'w1', name: 'Pessoal', is_default: true }, { id: 'w2', name: 'Empresa', is_default: false }],
    cartoes: [{ id: 'c6', name: 'C6', bank: 'C6', wallet_id: 'w1' }, { id: 'itau', name: 'Itaú', bank: 'Itaú', wallet_id: 'w2' }],
  });
  async function caso(fala, esperado) {
    texto = fala;
    const resultados = [];
    for (const source of ['app', 'widget']) {
      gravacoes.length = 0; reg.notificacoes.length = 0;
      await task({ caminho: '/cache/teste.m4a', requestId: 'teste', source });
      check(source + ': quantidade ' + fala, gravacoes.length, esperado === null ? 0 : 1);
      if (esperado !== null && gravacoes.length) {
        check(source + ': valor ' + fala, gravacoes[0].payload.amount, esperado);
        check(source + ': auditoria origem', gravacoes[0].source, source);
      }
      if (esperado === null) check(source + ': revisão visível ' + fala, reg.notificacoes.some(n => n[0] === 'revisao'), true);
      resultados.push({ payloads: gravacoes.map(g => g.payload), recibos: [...reg.notificacoes] });
    }
    check('paridade ' + fala, resultados[0], resultados[1]);
  }
  // Não introduzir heurística de dividir por 100: nem 1254 nem 125400 provam centavos.
  for (const inteiro of [1, 5, 12, 18, 99, 100, 1254, 1899, 10000, 45000, 125400, 999999]) {
    for (let centavos = 0; centavos < 100; centavos++) {
      const c = String(centavos).padStart(2, '0');
      for (const t of [`Cinema ${inteiro}${c}`, `Cinema ${inteiro} ${c}`]) {
        check('valor inseguro não preenche revisão: ' + t, confianca.valorSeguroParaRevisaoVoz(t), null);
      }
      const t = `Cinema ${inteiro},${c}`;
      check('decimal explícito: ' + t, confianca.valorSeguroParaRevisaoVoz(t), Number(`${inteiro}.${c}`));
    }
  }
  for (const t of ['Cinema 1254', 'Cinema 12 54', 'Cinema 12.54.00', 'Cinema 12,54,00',
    'Cinema 1.254', 'Cinema 125400', 'Cinema 45 mil', 'Cinema 12,54 e pipoca 20', 'não lançar cinema 12,54']) await caso(t, null);
  for (const [t, valor] of [
    ['Cinema 12,54', 12.54], ['Cinema 12.54', 12.54], ['Cinema 12 e 54', 12.54],
    ['Cinema dezoito e noventa e nove', 18.99], ['Cinema 99 centavos', .99],
    ['Cinema dois e meio', 2.5], ['Cinema 12:54', 12.54], ['Cinema 5h57', 5.57], ['Cinema 1.254,00', 1254],
    ['mercado 34,57 cartão C6 carteira pessoal', 34.57], ['festa 143,98 carteira empresa', 143.98],
    ['Cinema 12,54 cartão Itaú carteira empresa', 12.54],
    ['Cinema 12,54 no pix carteira pessoal', 12.54],
  ]) await caso(t, valor);
  for (const resto of ['cartão desconhecido', 'carteira inexistente', 'cartão C6 carteira empresa', 'em parcelas']) {
    await caso('Cinema 12,54 ' + resto, null);
  }
  for (let reais = 1; reais <= 50; reais++) {
    for (const c of ['00', '01', '09', '10', '54', '99']) {
      await caso(`Cinema ${reais},${c} no pix`, Number(`${reais}.${c}`));
      await caso(`Cinema ${reais}${c}`, null);
      await caso(`Cinema ${reais} ${c}`, null);
    }
  }
}

async function falhasEPersistencia() {
  /* Dois grupos, e a diferença entre eles é o dinheiro da pessoa.

     RECUSA DO DADO (22xxx dado inválido, 23xxx violação de restrição, 42501
     sem permissão): o servidor analisou e disse não. Repetir para sempre não
     ajuda, então lança e descarta.

     OBJETO AUSENTE OU SESSÃO (PGRST202, PGRST205, 42883, 42P01, PGRST301):
     migration não aplicada ou token vencido. São erros NOSSOS, que serão
     corrigidos, e `explicarFalhaDeEnvio` promete na tela "Nada foi perdido".
     Descartar apagaria a fala por um defeito de deploy — foi o que aconteceria
     nos dois dias de 07/09/2026 em que a RPC não existia. Ficam pendentes.

     A expectativa original desta bateria colocava os oito no mesmo balde;
     corrigida em 11/09/2026. */
  for (const code of ['22003', '23503', '42501']) {
    for (const source of ['app', 'widget']) {
      const { mod, store } = montarOperacoes({ erroRpc: { code, message: 'simulado' } });
      let erro;
      try { await mod.registrarOperacaoVoz('x', source, { kind: 'transaction', amount: 12.54 }); } catch (e) { erro = e; }
      check('recusa do dado sobe ' + source + code, erro?.code, code);
      check('recusa do dado nao vira pendencia ' + source + code, store.mapa.size, 0);
    }
  }
  for (const code of ['PGRST202', 'PGRST205', '42883', '42P01', 'PGRST301']) {
    for (const source of ['app', 'widget']) {
      const { mod, store } = montarOperacoes({ erroRpc: { code, message: 'simulado' } });
      let erro, res;
      try { res = await mod.registrarOperacaoVoz('x', source, { kind: 'transaction', amount: 12.54 }); } catch (e) { erro = e; }
      // `check` compara via JSON, e JSON.stringify(undefined) quebra o parse:
      // comparar com undefined falharia sempre. Assere booleano.
      check('erro nosso nao lanca ' + source + code, erro === undefined, true);
      check('erro nosso fica pendente ' + source + code, res?.status, 'pending');
      check('erro nosso preserva o lancamento ' + source + code, store.mapa.size, 1);
    }
  }
  for (const source of ['app', 'widget']) {
    /* O que decide entre GUARDAR a fala e APAGÁ-LA não é só o código da falha:
       é se existe conta gravada neste aparelho. Recusa por credencial COM
       sessão no disco significa token de acesso vencido — temporário, o
       cliente renova sozinho em até um minuto — e apagar o áudio ali
       destruiria a gravação por causa dessa janela. Sem sessão nenhuma,
       "entre na conta de novo" é uma instrução que a pessoa consegue cumprir,
       e aí o descarte é honesto. Distinção introduzida em 11/09/2026, depois
       de o app ter deslogado sozinho num lugar sem sinal; até então
       `nao_autenticado` apagava a fala nos dois casos. */
    const casosDeCredencial = [
      { codigo: 'sem_rede', semSessao: false, guarda: true },
      { codigo: 'demorou', semSessao: false, guarda: true },
      { codigo: 'nao_autenticado', semSessao: false, guarda: true },
      { codigo: 'sem_sessao', semSessao: false, guarda: true },
      { codigo: 'nao_autenticado', semSessao: true, guarda: false },
      { codigo: 'sem_sessao', semSessao: true, guarda: false },
    ];
    for (const { codigo, semSessao, guarda } of casosDeCredencial) {
      const nome = `${source} ${codigo} ${semSessao ? 'sem conta no aparelho' : 'com conta no aparelho'}`;
      const { task, reg } = montarWidget({ semSessao, transcrever: async () => ({ ok: false, codigo }) });
      await task({ caminho: '/cache/a.m4a', requestId: 'r', source });
      check(nome + ' fila', reg.fila.length, guarda ? 1 : 0);
      check(nome + ' descarte', reg.apagados.length, guarda ? 0 : 1);
      check(nome + ' recibo', reg.notificacoes.length + reg.pendenteNotificado > 0, true);
    }
    const { task, reg } = montarWidget({ podeNotificar: false });
    await task({ caminho: '/cache/a.m4a', requestId: 'r', source });
    check(source + ' permissão revogada preserva', reg.fila.length, 1);
    check(source + ' permissão revogada não apaga', reg.apagados.length, 0);
  }
}

(async () => {
  await valoresEParidade();
  await falhasEPersistencia();
  console.log(`Bateria 7: ${total} asserções, ${total - falhas.length} aprovadas, ${falhas.length} falhas.`);
  for (const f of falhas.filter(Boolean)) console.error(f);
  if (falhas.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
