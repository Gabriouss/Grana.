'use strict';
// Persistencia e servicos Node reais. Somente a fronteira remota e dublada.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const ids = require('../tools/admin-local/marketing/identidade-publicacao.cjs');
const { criarEditorial } = require('../tools/admin-local/marketing/editorial-publicacao.cjs');
const roots = [];
const root = () => { const r = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-editorial-')); roots.push(r); return r; };
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const reject = async (p, e, m) => { await assert.rejects(p, e, m); checks++; };
function peca(id = 'a'.repeat(16), versao = 'b'.repeat(40)) {
  const p = { id, versao, caminho: 'docs/marketing/2026-10/semana-42/aprovados/foto.png',
    legenda: 'Legenda aceita', aprovada: true, estado: 'aprovados',
    arquivos: [{ sha1: 'c'.repeat(40), tipo: 'imagem' }], capa: { pecaId: 'd'.repeat(16), sha1: 'e'.repeat(40) } };
  p.aceite = { id, versao, caminho: p.caminho, aprovadoEm: new Date(Date.now() - 1000).toISOString(), evidencia: 'aceite pelo autor no painel local' };
  return p;
}
function fronteira() {
  const calls = [], respostas = new Map(), aliases = new Map();
  let estado = null, perder = false, invalidar = false;
  const remoto = { executar: async p => {
    const contrato = require('../tools/admin-local/adaptadores/_contratos-marketing.cjs').carregar('supabase/functions/_shared/admin-publicacoes-reais.ts');
    contrato.validarPublicacaoReal(p); // consumidor remoto REAL valida o envelope, nao fixture permissiva.
    const wire = structuredClone(p);
    if (p.acao === 'editorial') p = { ...p.pedido, acao: p.acao, contractVersion: p.contractVersion };
    calls.push(structuredClone(p));
    eq(p.contractVersion, 'e5.real.v2', 'opt-in somente nesta fronteira');
    if (p.acao === 'acompanhar') return { contractVersion: 'e5.real.v2', jobs: [], legadoPendente: false,
      ...(aliases.has(p.pecaId) ? estado : { conteudoId: null }) };
    if (respostas.has(p.idempotencia)) {
      eq(respostas.get(p.idempotencia).pedido, wire, 'replay repete o corpo inteiro');
      return { ...respostas.get(p.idempotencia).resposta, replay: true };
    }
    eq(p.geracaoEsperada, estado?.geracaoEditorial || 0, 'CAS nao inventa revisao');
    estado = { contractVersion: 'e5.real.v2', conteudoId: p.conteudoId,
      geracaoEditorial: (estado?.geracaoEditorial || 0) + (p.operacao === 'iniciarRevisao' ? 1 : 0),
      versaoAtual: p.versao, estadoEditorial: { iniciarRevisao: 'em-revisao', registrarVersao: 'aguardando-aceite', registrarAceite: 'aceito' }[p.operacao] };
    for (const a of p.aliases) aliases.set(a, p.conteudoId);
    respostas.set(p.idempotencia, { pedido: wire, resposta: structuredClone(estado) });
    if (perder) { perder = false; throw Error('resposta-perdida'); }
    return invalidar ? { ...estado, contractVersion: 'e5.real.v1' } : structuredClone(estado);
  } };
  return { remoto, calls, respostas, get estado() { return estado; }, perder: () => { perder = true; }, invalidar: () => { invalidar = true; },
    avancar: () => { estado.geracaoEditorial++; } };
}
(async () => {
  try {
    const r = root(), p = peca(), f = fronteira();
    const svc = () => criarEditorial({ remoto: f.remoto, obterPeca: () => p, habilitado: () => true, log: () => {} });
    let ed = svc();
    let registro = await ed.registrarAceite(r, p);
    eq(f.calls.filter(c => c.acao === 'editorial').map(c => c.operacao), ['iniciarRevisao', 'registrarVersao', 'registrarAceite']);
    eq(registro.geracaoEditorial, 1);
    eq(ids.buscar(r, p.capa.pecaId).conteudoId, registro.conteudoId, 'capa e Reel compartilham identidade');
    const antes = f.calls.filter(c => c.acao === 'editorial').length;
    await ed.registrarAceite(r, p); await ed.registrarVersao(r, p);
    eq(f.calls.filter(c => c.acao === 'editorial').length, antes, 'repetir aceite/versao nao cria comando');
    f.perder();
    await reject(ed.iniciarRevisao(r, p, 'ajuste'), /resposta-perdida/);
    const primeiro = f.calls.at(-1);
    eq(Object.values(ids.buscar(r, p.id).pendentes)[0].idempotencia, primeiro.idempotencia, 'chave persistida antes da RPC');
    ed = svc(); registro = await ed.iniciarRevisao(r, p, 'ajuste');
    const repetidos = f.calls.filter(c => c.idempotencia === primeiro.idempotencia);
    eq(repetidos.length, 2); eq(repetidos[0], repetidos[1], 'reinicio recupera recibo sem outra revisao');
    eq(registro.geracaoEditorial, 2);
    await ed.iniciarRevisao(r, { ...p, id: p.capa.pecaId, capaDe: p.id });
    eq(f.estado.geracaoEditorial, 2, 'editar capa nao abre revisao independente');
    const nova = peca(p.id, 'f'.repeat(40)); nova.legenda = 'Legenda nova';
    registro = await ed.registrarVersao(r, nova);
    eq(registro.estadoEditorial, 'aguardando-aceite');
    registro = await ed.registrarAceite(r, nova);
    eq(registro.geracaoEditorial, 2, 'aprovar nao retoma nem troca geracao');
    ok(f.calls.every(c => ['acompanhar', 'editorial'].includes(c.acao)), 'nenhum confirmar, retomar, publicar ou Graph');
    eq(registro.aceita.legenda, nova.legenda);
    const movida = { ...nova, id: '2'.repeat(16) };
    await ids.garantir(r, movida, [nova.id]);
    eq(ids.buscar(r, movida.id).conteudoId, registro.conteudoId, 'mover com prova preserva identidade');
    const outra = { ...nova, id: '3'.repeat(16), capa: null }; await ids.garantir(r, outra);
    await reject(ids.garantir(r, outra, [movida.id]), { codigo: 'identidade-ambigua' });
    // Segunda maquina descobre o vinculo pelo alias remoto, sem criar outro UUID.
    const segunda = root();
    await svc().registrarVersao(segunda, nova);
    eq(ids.buscar(segunda, nova.id).conteudoId, registro.conteudoId);
    // Uma copia atrasada precisa sincronizar, nao sobrescrever a geracao remota.
    f.avancar(); const total = f.calls.filter(c => c.acao === 'editorial').length;
    await reject(ed.iniciarRevisao(r, nova), { codigo: 'sincronizacao-editorial-necessaria' });
    eq(f.calls.filter(c => c.acao === 'editorial').length, total);
    eq((await ed.sincronizar(r, nova)).geracaoEditorial, 3, 'sincronizacao explicita atualiza apenas o recibo local');
    eq(f.calls.filter(c => c.acao === 'editorial').length, total, 'sincronizar nao autoriza envio');
    const offline = criarEditorial({ habilitado: () => true, remoto: { executar: () => { throw Error('offline'); } } });
    eq(await offline.iniciarRevisao(root(), { ...p, aprovada: false, aceite: null, estado: 'para-aprovacao' }), null, 'rascunho offline continua editavel');
    await reject(offline.iniciarRevisao(root(), p), /offline/, 'aprovada desconhecida nao muda sem recibo');
    const desativado = criarEditorial({ habilitado: () => false, remoto: { executar: () => { throw Error('nao deve chamar'); } } });
    eq(await desativado.registrarAceite(root(), p), null, 'v1 nao ativa v2 automaticamente');
    const invalida = fronteira(); invalida.invalidar();
    await reject(criarEditorial({ habilitado: () => true, remoto: invalida.remoto }).iniciarRevisao(root(), p), { codigo: 'editorial-contrato-invalido' });
    // Fila real: nem o pedido nem a entrega sao gravados antes da suspensao.
    const { criarFila } = require('../tools/admin-local/marketing/ajustes-fila.cjs');
    let gravacoes = 0;
    const fila = criarFila({ iniciarRevisao: () => { throw Error('suspensao-sem-recibo'); },
      transacao: () => { gravacoes++; }, obterPeca: () => p });
    await reject(fila.solicitar(p, { versao: p.versao, motivo: 'Trocar a capa' }), /suspensao-sem-recibo/);
    eq(gravacoes, 0, 'falha remota nao cria pedido que permitiria editar');
    const ordem = [];
    const filaOk = criarFila({ iniciarRevisao: async () => ordem.push('suspensao-confirmada'),
      transacao: fn => { ordem.push('gravar'); return fn({ pedidos: [], eventos: [] }); },
      id: () => 'pedido', agora: () => new Date().toISOString() });
    await filaOk.solicitar(p, { versao: p.versao, motivo: 'Trocar a capa' });
    eq(ordem, ['suspensao-confirmada', 'gravar'], 'recibo vem antes da mutacao local');
    const revisada = root();
    const cat = require('../tools/admin-local/marketing/catalogo.cjs');
    cat.gravarJsonAtomico(cat.caminhoPainel(revisada, 'aprovacoes.json'), { aprovacoes: [p.aceite] });
    await reject(offline.iniciarRevisao(revisada, { ...p, aprovada: false, aceite: null, estado: 'para-aprovacao' }), /offline/,
      'perder o aceite da versao atual nao transforma conteudo antigo em rascunho livre');
    // Recusa real: antes de copiar/remover bytes, o servico exige o recibo remoto.
    const acervo = root(), base = 'docs/marketing/2026-10/semana-42-2026-10-12-a-2026-10-18/';
    const origem = path.join(acervo, base, 'aprovados/foto.png');
    fs.mkdirSync(path.dirname(origem), { recursive: true }); fs.writeFileSync(origem, 'bytes-originais');
    fs.writeFileSync(path.join(acervo, base, 'INDICE.md'), '# Acervo');
    const real = cat.listarPecas(acervo).pecas.find(x => x.caminho.endsWith('foto.png'));
    const recusar = require('../tools/admin-local/marketing/historico.cjs').criarHistorico(fs, () => {}, offline);
    await reject(recusar(acervo, real.id, { versao: real.versao, confirmacao: true, motivo: 'Alterar' }), /offline/);
    eq(fs.readFileSync(origem, 'utf8'), 'bytes-originais', 'sem recibo a origem permanece intacta');
    ok(!fs.existsSync(path.join(acervo, base, 'historico/foto.png')), 'sem recibo nem copia para o historico');
    // Node -> contrato Deno -> RPC reais, dublando somente o transporte Supabase.
    const rpcCalls = [];
    const cliente = { rpc: (nome, args) => ({ abortSignal: async () => {
      rpcCalls.push({ nome, args: structuredClone(args) });
      if (nome === 'admin_marketing_real_acompanhar_v2') return { data: { conteudoId: null, jobs: [], legadoPendente: false }, error: null };
      if (nome === 'admin_marketing_real_editorial_v2') {
        const d = args.p_pedido;
        return { data: { conteudoId: d.conteudoId, geracaoEditorial: 1, versaoAtual: d.versao, estadoEditorial: 'em-revisao' }, error: null };
      }
      if (nome === 'admin_marketing_real_consultar') return { data: { contas: [] }, error: null };
      throw Error('RPC fora do contrato: ' + nome);
    } }) };
    const adapter = require('../tools/admin-local/adaptadores/marketing-backend.cjs').criarPublicacoesReais({
      env: () => '11111111-1111-4111-8111-111111111111', remoto: () => null, cliente: () => cliente,
      relogio: () => new Date(), log: () => {}, rede: () => { throw Error('rede externa proibida'); } });
    const integrado = criarEditorial({ habilitado: () => true, remoto: adapter });
    eq((await integrado.iniciarRevisao(root(), p)).estadoEditorial, 'em-revisao');
    eq(rpcCalls.map(x => x.nome), ['admin_marketing_real_acompanhar_v2', 'admin_marketing_real_editorial_v2']);
    eq(Object.keys(rpcCalls[1].args.p_pedido).sort(), ['aliases', 'conteudoId', 'geracaoEsperada', 'idempotencia', 'operacao', 'pecaId', 'versao']);
    const v1 = await adapter.executar({ recurso: 'publicacoes-reais', modo: 'real', acao: 'contas' });
    eq(v1.contractVersion, 'e5.real.v1', 'mesmo adaptador continua v1 quando versao nao e pedida');
    eq(rpcCalls.at(-1).nome, 'admin_marketing_real_consultar', 'consulta v1 nao aciona RPC v2');
    const cli = require('../tools/admin-local/marketing/editorial-cli.cjs');
    const cliRoot = root(), cliFronteira = fronteira();
    const depsCli = { raiz: cliRoot, obterPeca: () => p, editorial: criarEditorial({ habilitado: () => true, remoto: cliFronteira.remoto }) };
    const recibo = await cli.main(['iniciar-revisao', p.id, p.versao], depsCli);
    eq(recibo.estadoEditorial, 'em-revisao'); ok(ids.UUID.test(recibo.idempotencia), 'CLI entrega recibo sem texto/credenciais');
    eq(await cli.main(['iniciar-revisao', p.id, p.versao], depsCli), recibo, 'CLI repetido preserva recibo');
    await reject(cli.main(['iniciar-revisao', p.id, '0'.repeat(40)], depsCli), { codigo: 'versao-mudou' });
    await reject(cli.main(['iniciar-revisao', p.id, p.versao], { ...depsCli, raiz: root(), editorial: desativado }), /nao deve chamar/, 'rollout local desligado não libera edição aceita: exige consulta remota');
    // Promocao real interrompida entre a prova dos arquivos e o alias editorial.
    const promoRoot = root(), pasta = path.join(promoRoot, base, 'para-aprovacao/pecas');
    fs.mkdirSync(pasta, { recursive: true }); fs.writeFileSync(path.join(pasta, 'E01.jpg'), 'arte-original');
    fs.writeFileSync(path.join(pasta, 'COPYS-FINAIS.md'), '## E01 - Fixture\n\n**Legenda:** Texto de publicacao.\n');
    fs.writeFileSync(path.join(promoRoot, base, 'INDICE.md'), '# Acervo\n');
    const candidata = cat.montarCatalogo(promoRoot).find(x => x.tipo === 'imagem');
    cat.gravarJsonAtomico(cat.caminhoPainel(promoRoot, 'aprovacoes.json'), { aprovacoes: [{
      id: candidata.id, caminho: candidata.caminho, versao: candidata.versao,
      aprovadoEm: new Date(Date.now() - 1000).toISOString(), evidencia: 'aceite pelo autor no painel local' }], ajustes: [] });
    const identidadeAntes = await ids.garantir(promoRoot, candidata);
    const filaReal = require('../tools/admin-local/marketing/ajustes-fila.cjs').fila, listarAntes = filaReal.listar;
    const vincularAntes = ids.vincularNaTransacao;
    filaReal.listar = () => [];
    const promover = require('../tools/admin-local/marketing/promocao.cjs').criarPromocao(fs, () => {});
    try {
      ids.vincularNaTransacao = () => { throw Error('disco-interrompido'); };
      await reject(promover(promoRoot, candidata.id, { versao: candidata.versao, confirmacao: true }), { codigo: 'promocao-falhou' });
      ok(fs.existsSync(path.join(pasta, 'E01.jpg')), 'falha de alias preserva origem');
      ids.vincularNaTransacao = vincularAntes;
      const promovida = await promover(promoRoot, candidata.id, { versao: candidata.versao, confirmacao: true });
      eq(promovida.jaExistia, true, 'retomada usa a prova ja persistida');
      eq(ids.buscar(promoRoot, promovida.promocao.id).conteudoId, identidadeAntes.conteudoId, 'retomada repara alias antes de remover a origem');
      ok(!fs.existsSync(path.join(pasta, 'E01.jpg')), 'limpeza acontece somente apos vincular identidade');
    } finally { ids.vincularNaTransacao = vincularAntes; filaReal.listar = listarAntes; }
    console.log('admin-editorial-identidade: ' + checks + ' verificacoes; identidade, unidade Reel/capa, CAS, replay e rollout opt-in; zero rede');
  } finally {
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
