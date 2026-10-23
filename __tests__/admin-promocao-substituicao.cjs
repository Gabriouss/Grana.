'use strict';
let verificacoes = 0;
const assert = new Proxy(require('node:assert/strict'), {
  apply(alvo, self, args) { verificacoes++; return Reflect.apply(alvo, self, args); },
  get(alvo, propriedade) {
    const valor = Reflect.get(alvo, propriedade);
    return typeof valor === 'function' ? (...args) => { verificacoes++; return Reflect.apply(valor, alvo, args); } : valor;
  },
});
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-substituicao-'));
process.env.GRANA_ADMIN_PASTA_CONTA = path.join(raiz, 'conta');
const c = require('../tools/admin-local/marketing/catalogo.cjs');
const ap = require('../tools/admin-local/marketing/aprovacoes.cjs');
const cal = require('../tools/admin-local/marketing/calendario.cjs');
const ponte = require('../tools/admin-local/adaptadores/marketing-backend.cjs');
const backendOriginal = ponte.backend;
const chamadas = [];
let estadoRemoto = null;
ponte.backend = () => ({ publicacoes: { executar: async p => {
  chamadas.push(p);
  if (p.acao === 'acompanhar') return { contractVersion: 'e5.real.v2', jobs: [], legadoPendente: false, ...(estadoRemoto || { conteudoId: null }) };
  const manterAceite = p.pedido.operacao === 'registrarVersao' && estadoRemoto?.estadoEditorial === 'aceito' && estadoRemoto.versaoAtual === p.pedido.versao;
  estadoRemoto = { contractVersion: 'e5.real.v2', conteudoId: p.pedido.conteudoId,
    geracaoEditorial: p.pedido.geracaoEsperada + (p.pedido.operacao === 'iniciarRevisao' ? 1 : 0),
    versaoAtual: p.pedido.versao, estadoEditorial: manterAceite ? 'aceito' : { iniciarRevisao: 'em-revisao', registrarVersao: 'aguardando-aceite', registrarAceite: 'aceito' }[p.pedido.operacao] };
  return estadoRemoto;
} } });
const semana = 'docs/marketing/2099-01/semana-01-2099-01-01-a-2099-01-07';
const origem = semana + '/para-aprovacao/pecas/E01.jpg';
const grava = (rel, v) => { const a = path.join(raiz, rel); fs.mkdirSync(path.dirname(a), { recursive: true }); fs.writeFileSync(a, v); };
async function reelMesmoNome() {
  estadoRemoto = null;
  const inicio = chamadas.length;
  const s = semana.replace('semana-01-2099-01-01-a-2099-01-07', 'semana-02-2099-01-08-a-2099-01-14');
  const video = s + '/para-aprovacao/pecas/R01.mp4', capa = s + '/para-aprovacao/pecas/R01-capa.png';
  const videoAprovado = video.replace('/para-aprovacao/', '/aprovados/');
  const capaAprovada = capa.replace('/para-aprovacao/', '/aprovados/');
  grava(video, 'video anterior'); grava(capa, 'capa anterior'); grava(s + '/INDICE.md', '# Reel\n');
  grava(s + '/para-aprovacao/pecas/COPYS-FINAIS.md', '## R01 - Reel\n\n**Legenda:** Legenda anterior do Reel.\n');
  const familiasArq = 'docs/marketing/painel/familias.json';
  const familias = c.lerJson(path.join(raiz, familiasArq), { formato: 1, familias: [], capas: [] });
  familias.capas.push({ capa, reel: video }); grava(familiasArq, JSON.stringify(familias));
  let p = c.montarCatalogo(raiz).find(x => x.caminho === video);
  const promo = require('../tools/admin-local/marketing/promocao.cjs');
  const corpo = { versao: p.versao, confirmacao: true };
  let copias = 0;
  let r = await ap.aprovarEFechar(raiz, p.id, corpo, { promover: promo.criarPromocao({ ...fs,
    copyFileSync(...args) { if (++copias === 2) throw new Error('capa indisponivel'); return fs.copyFileSync(...args); },
  }, () => {}) });
  assert.equal(copias, 2); assert.equal(r.conclusao.estado, 'incompleta');
  assert.equal(r.conclusao.etapas.promocao.estado, 'pendente');
  assert.equal(fs.readFileSync(path.join(raiz, video), 'utf8'), 'video anterior');
  assert.equal(fs.readFileSync(path.join(raiz, capa), 'utf8'), 'capa anterior');
  assert.equal(fs.existsSync(path.join(raiz, videoAprovado)), false); assert.equal(fs.existsSync(path.join(raiz, capaAprovada)), false);
  r = await ap.aprovarEFechar(raiz, p.id, corpo, { promover: promo.criarPromocao({ ...fs,
    unlinkSync(abs) { if (abs === path.join(raiz, capa)) throw new Error('limpeza capa indisponivel'); return fs.unlinkSync(abs); },
  }, () => {}) });
  assert.equal(r.conclusao.estado, 'incompleta'); assert.equal(fs.existsSync(path.join(raiz, capa)), true);
  assert.equal(fs.readFileSync(path.join(raiz, capaAprovada), 'utf8'), 'capa anterior');
  const aceitesArq = 'docs/marketing/painel/aprovacoes.json';
  const salvos = c.lerJson(path.join(raiz, aceitesArq)), adulterados = structuredClone(salvos);
  adulterados.aprovacoes.find(a => a.origem?.id === p.id).componentesPromovidos[0].sha1 = '0'.repeat(40);
  grava(aceitesArq, JSON.stringify(adulterados));
  await assert.rejects(promo.promover(raiz, p.id, corpo), e => e.codigo === 'prova-invalida');
  assert.equal(fs.existsSync(path.join(raiz, capa)), true, 'prova de componente invalida nunca limpa a origem');
  grava(aceitesArq, JSON.stringify(salvos));
  const nAceites = salvos.aprovacoes.length;
  r = await ap.aprovarEFechar(raiz, p.id, corpo, { promover: promo.criarPromocao({ ...fs,
    copyFileSync() { throw new Error('retomada nao pode copiar'); },
  }, () => {}) });
  assert.equal(r.conclusao.estado, 'concluida');
  assert.equal(ap.listarAprovacoes(raiz).aprovacoes.length, nAceites, 'retomada da capa nao cria outro aceite ou prova');
  const velha = c.obterPeca(raiz, r.promocao.id);
  assert.equal(velha.capa.pecaId, c.idDe(capaAprovada), 'promocao preserva capa junto ao video antes de liberar o nome de origem');
  assert.equal(fs.readFileSync(path.join(raiz, capaAprovada), 'utf8'), 'capa anterior');
  assert.equal(fs.existsSync(path.join(raiz, capa)), false, 'nova revisao pode reutilizar o nome sem alterar o composto aceito');
  grava(video, 'video novo'); grava(capa, 'capa nova');
  grava(s + '/para-aprovacao/pecas/COPYS-FINAIS.md', '## R01 - Reel\n\n**Legenda:** Legenda nova do Reel.\n');
  p = c.montarCatalogo(raiz).find(x => x.caminho === video);
  assert.notEqual(p.capa.sha1, velha.capa.sha1);
  assert.equal(c.montarCatalogo(raiz).find(x => x.caminho === videoAprovado).capa.sha1, velha.capa.sha1, 'capa nova nao substitui a capa da revisao ainda aprovada');
  r = await ap.aprovarEFechar(raiz, p.id, { versao: p.versao, confirmacao: true });
  assert.equal(r.conclusao.estado, 'concluida');
  assert.equal(estadoRemoto.estadoEditorial, 'aceito', 'conclusao exige aceite remoto efetivo no primeiro clique');
  assert.equal(r.promocao.substituicoes.length, 1);
  const preservada = r.promocao.substituicoes[0];
  const anterior = c.obterPeca(raiz, c.idDe(preservada.caminhoHistorico));
  const nova = c.obterPeca(raiz, r.promocao.id);
  assert.equal(anterior.versao, velha.versao); assert.equal(anterior.legenda, 'Legenda anterior do Reel.');
  assert.equal(anterior.capa.sha1, velha.capa.sha1); assert.equal(anterior.arquivos[0].sha1, velha.arquivos[0].sha1);
  assert.equal(anterior.estadoEfetivo, 'superada'); assert.equal(anterior.aprovada, false);
  assert.equal(nova.versao, p.versao); assert.equal(nova.legenda, 'Legenda nova do Reel.');
  assert.equal(nova.capa.sha1, p.capa.sha1); assert.equal(nova.capa.pecaId, c.idDe(capaAprovada));
  assert.equal(nova.aprovada, true); assert.equal(nova.estadoEfetivo, 'aprovada');
  for (const [peca, bytes] of [[anterior, 'video anterior'], [nova, 'video novo']]) {
    assert.equal(fs.readFileSync(path.join(raiz, peca.caminho), 'utf8'), bytes);
  }
  const capaHistorica = preservada.arquivos.find(a => a.componente);
  assert.equal(fs.readFileSync(path.join(raiz, capaHistorica.destino), 'utf8'), 'capa anterior');
  assert.equal(fs.readFileSync(path.join(raiz, capaAprovada), 'utf8'), 'capa nova');
  const cpAntiga = c.obterPeca(raiz, c.idDe(capaHistorica.destino));
  const cpNova = c.obterPeca(raiz, nova.capa.pecaId);
  assert.equal(cpAntiga.capaDe, anterior.id); assert.equal(cpAntiga.estadoEfetivo, 'superada');
  assert.equal(cpAntiga.legenda, anterior.legenda, 'capa arquivada conserva a legenda da composicao anterior');
  assert.equal(cpNova.capaDe, nova.id); assert.equal(cpNova.cobertaPeloReel, true); assert.equal(cpNova.estadoEfetivo, 'aprovada');
  const familiasDepois = c.listarPecas(raiz).familias.filter(f => [f.principal, ...f.superadas].some(x => x?.id === nova.id));
  assert.equal(familiasDepois.length, 1); assert.equal(familiasDepois[0].principal.id, nova.id);
  assert(familiasDepois[0].superadas.some(x => x.id === anterior.id));
  assert(!c.feed(raiz).pecas.some(x => [cpAntiga.id, cpNova.id, anterior.id].includes(x.id)), 'somente Reel vigente e autonomo pode entrar no feed');
  const ids = require('../tools/admin-local/marketing/identidade-publicacao.cjs');
  const identidade = ids.buscar(raiz, nova.id);
  for (const id of [p.id, nova.id, anterior.id, cpNova.id, cpAntiga.id]) assert.equal(ids.buscar(raiz, id).conteudoId, identidade.conteudoId);
  assert.equal(identidade.aliases.find(a => a.pecaId === anterior.id).versao, velha.versao);
  assert.equal(identidade.aliases.find(a => a.pecaId === cpAntiga.id).versao, velha.versao);
  assert.equal(identidade.aliases.find(a => a.pecaId === nova.id).versao, p.versao);
  assert.equal(identidade.aliases.find(a => a.pecaId === cpNova.id).versao, p.versao, 'capa vigente identifica o composto novo');
  assert.equal(chamadas.slice(inicio).filter(x => x.pedido?.operacao === 'iniciarRevisao').length, 1);
  assert(chamadas.slice(inicio).every(x => ['acompanhar', 'editorial'].includes(x.acao)), 'substituicao nao reautoriza nenhuma rede');
  const n = ap.listarAprovacoes(raiz).aprovacoes.length, mutacoes = chamadas.filter(x => x.acao !== 'acompanhar').length;
  const replay = await ap.aprovarEFechar(raiz, p.id, { versao: p.versao, confirmacao: true });
  assert.equal(replay.conclusao.estado, 'concluida'); assert.equal(ap.listarAprovacoes(raiz).aprovacoes.length, n);
  assert.equal(chamadas.filter(x => x.acao !== 'acompanhar').length, mutacoes, JSON.stringify(chamadas.filter(x => x.acao !== 'acompanhar').slice(-2)));
  assert.equal(ids.buscar(raiz, anterior.id).aliases.find(a => a.pecaId === anterior.id).versao, velha.versao);
  const copyArquivo = path.join(raiz, s + '/para-aprovacao/pecas/COPYS-FINAIS.md');
  const copy = fs.readFileSync(copyArquivo); fs.unlinkSync(copyArquivo);
  try {
    const preservadasSemCopy = c.montarCatalogo(raiz);
    assert.equal(preservadasSemCopy.find(x => x.id === anterior.id).legenda, anterior.legenda, 'historico nao depende da copy corrente');
    assert.equal(preservadasSemCopy.find(x => x.id === cpAntiga.id).legenda, anterior.legenda);
  } finally { fs.writeFileSync(copyArquivo, copy); }
}
(async () => {
  try {
    grava(origem, 'primeira arte');
    grava(semana + '/INDICE.md', '# Teste\n');
    grava(semana + '/para-aprovacao/pecas/COPYS-FINAIS.md', '## E01 - Teste\n\n**Legenda:** Legenda teste.\n');
    let p = c.montarCatalogo(raiz).find(x => x.tipo === 'imagem');
    let r = await ap.aprovarEFechar(raiz, p.id, { versao: p.versao, confirmacao: true });
    const velha = c.obterPeca(raiz, r.promocao.id);
    await cal.planejar(raiz, { id: velha.id, versao: velha.versao, data: '2099-01-10', hora: '09:00', canal: 'instagram-feed' });
    grava('docs/marketing/painel/publicados.json', JSON.stringify({ vinculos: [{ peca: velha.caminho, link: 'https://example.com/post' }] }));
    grava(origem, 'segunda arte');
    grava(semana + '/para-aprovacao/pecas/COPYS-FINAIS.md', '## E01 - Teste\n\n**Legenda:** Legenda da segunda revisão.\n');
    p = c.montarCatalogo(raiz).find(x => x.caminho === origem);
    r = await ap.aprovarEFechar(raiz, p.id, { versao: p.versao, confirmacao: true });
    assert.equal(r.conclusao.estado, 'concluida');
    assert.equal(chamadas.filter(p => p.pedido?.operacao === 'iniciarRevisao').length, 1, 'suspensão remota comprovada antes da substituição');
    assert(chamadas.every(p => ['acompanhar', 'editorial'].includes(p.acao)), 'nenhuma confirmação/Meta');
    assert.equal(fs.readFileSync(path.join(raiz, velha.caminho), 'utf8'), 'segunda arte');
    assert.equal(r.promocao.substituicoes.length, 1);
    const arquivo = r.promocao.substituicoes[0].arquivos[0];
    assert.equal(fs.readFileSync(path.join(raiz, arquivo.destino), 'utf8'), 'primeira arte');
    assert.notEqual(arquivo.destino, velha.caminho);
    const historica = c.montarCatalogo(raiz).find(x => x.caminho === r.promocao.substituicoes[0].caminhoHistorico);
    assert.equal(historica.legenda, 'Legenda teste.', 'a copy nova não reescreve a legenda da revisão preservada');
    assert.equal(historica.versao, velha.versao);
    const vinculo = JSON.parse(fs.readFileSync(path.join(raiz, 'docs/marketing/painel/publicados.json'), 'utf8')).vinculos[0];
    assert.equal(vinculo.peca, r.promocao.substituicoes[0].caminhoHistorico, 'publicação antiga fica na revisão antiga');
    const identidades = require('../tools/admin-local/marketing/identidade-publicacao.cjs');
    assert.equal(identidades.buscar(raiz, p.id).conteudoId, identidades.buscar(raiz, r.promocao.id).conteudoId);
    const identidade = identidades.buscar(raiz, historica.id);
    assert.equal(identidade.aliases.find(a => a.pecaId === historica.id).versao, velha.versao, 'alias historico conserva a versao dos bytes arquivados');
    assert.equal(identidade.aliases.find(a => a.pecaId === r.promocao.id).versao, p.versao, 'alias do destino aprovado identifica a nova revisao');
    const n = ap.listarAprovacoes(raiz).aprovacoes.length;
    const replay = await ap.aprovarEFechar(raiz, p.id, { versao: p.versao, confirmacao: true });
    assert.equal(replay.conclusao.estado, 'concluida');
    assert.equal(ap.listarAprovacoes(raiz).aprovacoes.length, n);
    await reelMesmoNome();
    console.log(`admin-promocao-substituicao: ${verificacoes} verificacoes; imagem + Reel/capa mesmo nome, historico/identidade/rotulos, falha/retomada e replay sem duplicacao OK`);
  } finally { ponte.backend = backendOriginal; fs.rmSync(raiz, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
