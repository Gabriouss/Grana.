'use strict';
// Frente D: leitura do plano, nunca publicação. Não importa config/.env nem cliente Graph.
const crypto = require('node:crypto');
const path = require('node:path');
const catalogo = require('./catalogo.cjs');
const { aceiteValido } = require('./aceite-evidencia.cjs');
const FUSO = 'America/Sao_Paulo';
const FORMATADOR = new Intl.DateTimeFormat('sv-SE', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function instante(data, hora) {
  if (!catalogo.dataValida(data) || typeof hora !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return null;
  const alvo = Date.parse(`${data}T${hora}:00Z`);
  let utc = alvo;
  // Calcula pelo banco IANA do runtime, sem presumir offset fixo nem fuso do Windows.
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(FORMATADOR.formatToParts(utc).map((v) => [v.type, v.value]));
    const local = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    utc += alvo - local;
  }
  const p = Object.fromEntries(FORMATADOR.formatToParts(utc).map((v) => [v.type, v.value]));
  if (`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` !== `${data}T${hora}`) return null;
  return new Date(utc).toISOString();
}

function criarEnsaio(deps) {
  return function ensaiar(raiz) {
    const agora = deps.agora();
    const plano = deps.lerPlano(raiz);
    if (!plano || !Array.isArray(plano.planejados)) throw new catalogo.ErroMarketing('calendario-invalido', 'O calendário precisa de uma lista de planejamentos.', 409);
    const pecas = new Map(deps.pecas(raiz).map((p) => [p.id, p]));
    const aceites = deps.aceites(raiz);
    const vistos = new Set();
    const itens = plano.planejados.map((r) => {
      const p = pecas.get(r?.id), bloqueios = [];
      const negar = (codigo) => { if (!bloqueios.includes(codigo)) bloqueios.push(codigo); };
      const data = catalogo.dataValida(r?.data) ? r.data : null;
      const hora = typeof r?.hora === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.hora) ? r.hora : null;
      const canal = ['instagram-feed', 'stories', 'reels', 'anuncio'].includes(r?.canal) ? r.canal : null;
      const versao = /^[a-f0-9]{40}$/.test(r?.versao) ? r.versao : null;
      const id = /^[a-f0-9]{16}$/.test(r?.id) ? r.id : null;
      const quandoUtc = instante(data, hora);
      if (!catalogo.dataValida(plano.diaD)) negar('dia-d-nao-declarado');
      else if (catalogo.dataValida(data) && data < plano.diaD) negar('antes-do-dia-d');
      if (!quandoUtc) negar('data-ou-hora-invalida');
      else if (Date.parse(quandoUtc) <= agora) negar('horario-nao-futuro');
      if (!p) negar('peca-ausente');
      if (!versao || !p || versao !== p.versao || r.caminho !== p.caminho) negar('versao-ou-caminho-mudou');
      if (!p || p.estado !== 'aprovados' || !/^docs\/marketing\/\d{4}-\d{2}\/semana-[^/]+\/aprovados\//.test(p.caminho)) negar('fora-de-aprovados');
      const aceite = p && aceites.find((a) => aceiteValido(a, p, agora));
      if (!aceite) negar('sem-evidencia-datada-desta-versao');
      if (!canal) negar('canal-invalido');
      if (canal === 'anuncio') negar('anuncio-fora-do-fluxo-organico');
      const arquivos = p?.arquivos || [];
      const jpeg = (a) => a.tipo === 'imagem' && /\.jpe?g$/i.test(a.nome);
      const mp4 = (a) => a.tipo === 'video' && /\.mp4$/i.test(a.nome);
      if (canal === 'instagram-feed' && !(arquivos.length >= 1 && arquivos.length <= 10 && arquivos.every(jpeg))) negar('formato-de-midia-nao-validado');
      if (canal === 'reels' && !(arquivos.length === 1 && mp4(arquivos[0]))) negar('formato-de-midia-nao-validado');
      if (canal === 'stories' && !(arquivos.length === 1 && (jpeg(arquivos[0]) || mp4(arquivos[0])))) negar('formato-de-midia-nao-validado');
      const chave = crypto.createHash('sha256').update(JSON.stringify([id, versao, canal, quandoUtc])).digest('hex');
      if (vistos.has(chave)) negar('planejamento-duplicado');
      vistos.add(chave);
      return {
        recibo: chave, pecaId: id, versao, canal, data, hora, fuso: FUSO, quandoUtc,
        estado: bloqueios.length ? 'bloqueado' : 'ensaio', bloqueios,
        evidenciaEm: aceite?.aprovadoEm || null,
        estrategia: canal && canal !== 'anuncio' ? 'publicacao-instagram-na-hora-marcada' : null,
        midias: arquivos.map((a) => ({ nome: path.basename(a.nome), tipo: a.tipo })),
      };
    });
    return {
      modo: 'ensaio', realHabilitado: false, chamadasMeta: 0, geradoEm: new Date(agora).toISOString(),
      fuso: FUSO, diaD: catalogo.dataValida(plano.diaD) ? plano.diaD : null, itens,
      resumo: { total: itens.length, ensaiados: itens.filter((i) => i.estado === 'ensaio').length, bloqueados: itens.filter((i) => i.estado === 'bloqueado').length },
      bloqueiosGerais: [...(!catalogo.dataValida(plano.diaD) ? ['dia-d-nao-declarado'] : []), ...(!itens.length ? ['calendario-sem-planejamentos'] : [])],
      pendenciasReais: ['julgamento-keel-e-aviso-orquestrador', 'confirmacao-real-do-autor', 'conta-permissoes-token-e-quota', 'midia-remota-validada', 'agendador-e-outbox-com-reconciliacao'],
      aviso: 'Ensaio local. Nada foi agendado ou publicado na Meta. Instagram exige execução na hora marcada; este ensaio não cria um agendador.',
    };
  };
}

const ensaiar = criarEnsaio({
  agora: () => Date.now(),
  lerPlano: (raiz) => catalogo.lerJson(catalogo.caminhoPainel(raiz, 'calendario.json'), { diaD: null, planejados: [] }),
  pecas: (raiz) => catalogo.montarCatalogo(raiz),
  aceites: (raiz) => catalogo.lerJson(catalogo.caminhoPainel(raiz, 'aprovacoes.json'), { aprovacoes: [] }).aprovacoes || [],
});
module.exports = { ensaiar, criarEnsaio, instante };
