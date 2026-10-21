// 19/10/2026: todo código de erro do contrato real vira frase com causa e ação (nunca o código cru
// nem frase vazia); antecedência mínima e estado real por rede em palavras do autor. Módulo real,
// carregado como ESM; os códigos do servidor são lidos do próprio fonte da Edge Function.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const m = await import(pathToFileURL(path.resolve('tools/admin-local/web/telas/_publicacoes-reais.js')).href);
  const ts = fs.readFileSync('supabase/functions/_shared/admin-publicacoes-reais.ts', 'utf8');
  const lista = /const CODIGOS=new Set\(\[([\s\S]*?)\]\)/.exec(ts)[1].match(/'([a-z0-9-]+)'/g).map((s) => s.slice(1, -1));
  assert.ok(lista.length >= 25, 'leu a lista CODIGOS do servidor');
  const generica = m.mensagemHumana({}).frase;
  const cliente = ['previa-invalida', 'contrato-real-invalido', 'nao-pareado', 'cabecalho-ausente', 'reautenticar', 'cancelado', 'rede', 'prazo',
    'fonte-indisponivel', 'limite', 'nao-autenticado', 'legenda-divergente', 'hash-de-midia-divergente', 'confirmacao-bloqueada', 'credencial-ausente', 'meta-recusou'];
  for (const codigo of [...lista, ...cliente]) {
    const r = m.mensagemHumana({ codigo, message: 'Mensagem crua', status: 409 });
    assert.equal(r.codigo, codigo);
    assert.notEqual(r.frase, generica, `${codigo}: tem frase própria`);
    assert.ok(!r.frase.includes(codigo) && !/HTTP|Mensagem crua/.test(r.frase), `${codigo}: frase sem código nem texto cru`);
    assert.ok(/\.$/.test(r.frase) && r.frase.length > 20, `${codigo}: frase completa`);
  }
  // Erro do cliente lançado só com o código na mensagem também vira frase.
  assert.match(m.mensagemHumana(new Error('hash-de-midia-divergente')).frase, /Gere outra prévia/);
  // Desconhecido: mensagem humana do servidor local vale; sem nada, frase genérica com ação.
  assert.equal(m.mensagemHumana({ codigo: 'codigo-novo', message: 'O servidor explicou em português.' }).frase, 'O servidor explicou em português.');
  assert.match(generica, /Nada foi confirmado/);

  // Antecedência: carrossel/Reels 30 min, imagem 15; horário passado e em cima da hora bloqueiam.
  assert.equal(m.antecedenciaMinima([{ formato: 'carrossel' }]), 30);
  assert.equal(m.antecedenciaMinima([{ formato: 'feed' }], { tipo: 'imagem' }), 15);
  assert.equal(m.antecedenciaMinima([{ formato: 'feed' }], { tipo: 'carrossel' }), 30);
  const agora = Date.parse('2026-10-19T03:02:00Z'); // 00:02 em São Paulo
  assert.equal(m.sugestaoHorario(30, agora), '2026-10-19T00:35');
  assert.deepEqual(m.conferirHorario('2026-10-19T03:20:00Z', 30, agora), { ok: false,
    texto: 'Muito em cima da hora: o Grana. precisa de 30 min para preparar a publicação. Para sair na hora, marque a partir das 00:35.' });
  assert.equal(m.conferirHorario('2026-10-19T03:00:00Z', 30, agora).texto, 'Esse horário já passou. Marque a partir das 00:35.');
  assert.deepEqual(m.conferirHorario('2026-10-19T04:00:00Z', 30, agora), { ok: true, texto: 'O Grana. começa a preparar às 00:30 e publica às 01:00.' });
  assert.match(m.conferirHorario('2026-10-21T04:00:00Z', 30, agora).texto, /^O Grana\. começa a preparar em .*21\/10.*00:30 e publica em .*21\/10.*01:00\.$/);

  // Estado real por rede: nunca "Planejado"; atenção traz ação e nunca manda repetir o envio.
  const job = (estado, extra = {}) => ({ estado, destino: { rede: 'instagram', publicarEm: '2026-10-19T04:00:00Z' }, ...extra });
  for (const estado of ['planejado', 'programado-no-painel', 'preparando', 'agendado-na-meta', 'publicado', 'cancelamento-pendente', 'cancelado', 'falhou', 'precisa-conferir', 'outro']) {
    const d = m.descreverJobReal(job(estado), agora);
    assert.ok(!/Planejado/i.test(d.texto), `${estado}: não usa a palavra do editorial`);
    if (d.atencao) assert.ok(d.acao && !/tente (de novo|novamente) agora|reenvi/i.test(d.acao), `${estado}: ação sem repetir envio`);
  }
  assert.equal(m.descreverJobReal(job('agendado-na-meta'), agora).texto, 'Agendado na Meta, sai às 01:00');
  // Preparando n/m (Keel, 2fb8582): só com contagem íntegra; servidor antigo sem preparo continua sem número.
  assert.equal(m.descreverJobReal(job('preparando', { preparo: { itens: 3, total: 5, container: false } }), agora).texto, 'Preparando 3/5 na rede, sai às 01:00');
  for (const preparo of [undefined, null, { itens: 1, total: 1 }, { itens: 6, total: 5 }, { itens: '3', total: 5 }, { itens: -1, total: 5 }])
    assert.equal(m.descreverJobReal(job('preparando', { preparo }), agora).texto, 'Preparando na rede, sai às 01:00', JSON.stringify(preparo));
  const pub = m.descreverJobReal(job('publicado', { permalink: 'https://www.instagram.com/p/x/' }), agora);
  assert.deepEqual([pub.texto, pub.link, pub.linkRotulo], ['Publicado', 'https://www.instagram.com/p/x/', 'Abrir no Instagram']);
  assert.equal(m.descreverJobReal(job('publicado', { permalink: 'javascript:alert(1)' }), agora).link, null, 'link só https');
  const conferir = m.descreverJobReal(job('precisa-conferir'), agora);
  assert.equal(conferir.texto, 'Precisa conferir: não confirmamos se saiu'); assert.match(conferir.acao, /Abra o Instagram antes de tentar de novo/);
  assert.equal(m.ROTULOS_ESTADO['programado-no-painel'], 'Agendado no painel');
  assert.equal(m.descreverJobReal(job('suspenso-para-revisao'), agora).texto, 'Suspenso para revisão');
  assert.match(m.descreverJobReal(job('falhou', { codigoErro: 'credencial-ausente' }), agora).motivo, /chave de acesso/);
  // AUD-09: cancelamento comum é neutro e pode sugerir reagendar; com envio anterior incerto, só conferir.
  const cancelComum = m.descreverJobReal(job('cancelado'), agora);
  assert.equal(cancelComum.atencao, false); assert.match(cancelComum.acao, /agende de novo/);
  assert.equal(m.descreverJobReal(job('cancelado', { codigoErro: 'credencial-ausente' }), agora).atencao, false, 'motivo sem efeito remoto continua comum');
  for (const extra of [{ codigoErro: 'resultado-desconhecido' }, { codigoErro: 'lease-vencida' }, { codigoErro: 'prazo' }, { remotoId: '17890' },
    { permalink: 'https://www.instagram.com/p/x/' }, { recibos: [{ reciboId: 'r', operacao: 'publicar', estado: 'incerto' }] },
    { recibos: [{ reciboId: 'r', operacao: 'publicar', estado: 'iniciado' }] }]) {
    const d = m.descreverJobReal(job('cancelado', extra), agora), tudo = `${d.texto} ${d.motivo} ${d.acao}`;
    assert.equal(d.atencao, true, JSON.stringify(extra));
    assert.match(d.acao, /só encerrou a execução no Grana\. Confira no Instagram e nos recibos/, JSON.stringify(extra));
    assert.ok(!/agend|repit|de novo/i.test(d.acao), `não convida a repetir: ${JSON.stringify(extra)}`);
    assert.ok(!(/n[aã]o repita|n[aã]o publique/i.test(tudo) && /agend|de novo/i.test(tudo)), `sem contradição: ${tudo}`);
  }
  assert.equal(m.descreverJobReal(job('cancelado', { recibos: [{ reciboId: 'r', operacao: 'publicar', estado: 'falhou' }] }), agora).atencao, false,
    'publicar recusado sem efeito não é incerto');
  assert.equal(m.jobAtivo(job('agendado-na-meta')), true); assert.equal(m.jobAtivo(job('precisa-conferir')), false);

  console.log(`admin-agendamento-mensagens: ${lista.length} códigos do servidor + ${cliente.length} do cliente com frase, antecedência e estado real por rede OK`);
})().catch((e) => { console.error(e); process.exit(1); });
