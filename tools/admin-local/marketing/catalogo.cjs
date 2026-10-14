'use strict';
// Catálogo de peças de marketing do painel local (dono: Flare).
//
// Lê docs/marketing/AAAA-MM/semana-*/{para-aprovacao,aprovados,historico} sem
// copiar nada (regra 25: a pasta é a única verdade). Cada função recebe `raiz`,
// a pasta do repositório, para os testes rodarem numa cópia temporária.
//
// Convenção de erro para o Keel: toda falha esperada é um ErroMarketing com
// `codigo` (texto curto), `message` (pt-BR, sem caminho absoluto) e `status`
// (HTTP sugerido). As funções devolvem só `dados`; o envelope
// { ok, dados, atualizadoEm } é montado pela rota.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('node:os');

const PASTA_MARKETING = 'docs/marketing';
const PASTA_PAINEL = 'docs/marketing/painel';
const ESTADOS = ['para-aprovacao', 'aprovados', 'historico'];
const EXT_IMAGEM = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const EXT_VIDEO = new Set(['.mp4', '.webm', '.mov']);
const EXT_TEXTO = new Set(['.md', '.txt']);
// HTML é o fonte de render das artes (o PNG irmão é a peça); .gitkeep e
// manifests não são peça.
const IGNORAR = new Set(['.html', '.htm', '.json', '.gitkeep', '']);
const RE_SEMANA = /^semana-(\d{2})-(\d{4}-\d{2}-\d{2})-a-(\d{4}-\d{2}-\d{2})$/;
const RE_MES = /^\d{4}-\d{2}$/;

class ErroMarketing extends Error {
  constructor(codigo, mensagem, status = 400) {
    super(mensagem);
    this.codigo = codigo;
    this.status = status;
  }
}

// ---------- utilidades compartilhadas pelos outros módulos ----------

function agoraLocalIso(d = new Date()) {
  const p = (n) => String(Math.abs(Math.trunc(n))).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sinal = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sinal}${p(off / 60)}:${p(off % 60)}`;
}

function hojeLocal(d = new Date()) {
  return agoraLocalIso(d).slice(0, 10);
}

function caminhoPainel(raiz, nome) {
  return path.join(raiz, PASTA_PAINEL, nome);
}

// Codec único para destinos Markdown do índice; recebe caminho local já validado.
function linkDoIndice(relativo) {
  return relativo.split('/').map((s) => encodeURIComponent(s).replace(/[!'()*]/g,
    (v) => '%' + v.charCodeAt(0).toString(16).toUpperCase())).join('/');
}

function lerJson(arquivo, padrao) {
  let texto;
  try {
    texto = fs.readFileSync(arquivo, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return structuredClone(padrao);
    throw new ErroMarketing('leitura-falhou', `Não foi possível ler ${path.basename(arquivo)}.`, 500);
  }
  try {
    return JSON.parse(texto.replace(/^﻿/, ''));
  } catch {
    throw new ErroMarketing('json-invalido', `${path.basename(arquivo)} não é um JSON válido. Corrija o arquivo antes de gravar pelo painel.`, 500);
  }
}

// Grava em arquivo temporário e renomeia: nunca deixa JSON pela metade.
function gravarJsonAtomico(arquivo, dados) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const tmp = `${arquivo}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, arquivo);
}

// Uma escrita por vez no processo, para dois cliques não se atropelarem.
let fila = Promise.resolve();
function serializar(raiz, fn) {
  const r = fila.then(async () => {
    // Todos os writers cooperantes usam a raiz física, inclusive em portas diferentes.
    // Não recuperar por idade: um residual exige conferência operacional de host/PID.
    const arquivo = path.join(fs.realpathSync(raiz), '.grana-admin-writer.lock');
    const dono = JSON.stringify({ token: crypto.randomUUID(), host: os.hostname(), pid: process.pid, em: agoraLocalIso() });
    let fd;
    for (let tentativa = 0; ; tentativa++) {
      try { fd = fs.openSync(arquivo, 'wx', 0o600); break; }
      catch (e) {
        if (e.code !== 'EEXIST') throw new ErroMarketing('marketing-trava-falhou', 'Não foi possível reservar o acervo. Confira a pasta antes de repetir.', 503);
        if (tentativa >= 80) throw new ErroMarketing('marketing-trava-ocupada', 'O acervo está reservado por outra operação ou por um processo interrompido. O prazo de espera terminou; confira host e PID da trava antes de repetir.', 409);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
      }
    }
    try {
      // Se esta escrita falhar, o arquivo vazio permanece fail-closed para conferência.
      fs.writeFileSync(fd, dono, 'utf8');
    } finally { fs.closeSync(fd); }
    try { return await fn(); }
    finally {
      try {
        if (fs.readFileSync(arquivo, 'utf8') !== dono) throw new Error('dono mudou');
        fs.unlinkSync(arquivo);
      } catch {
        console.error(JSON.stringify({ codigo: 'marketing-trava-perdida' }));
        throw new ErroMarketing('marketing-trava-perdida', 'A reserva do acervo mudou ou não pôde ser liberada. Confira os recibos e a trava antes de repetir.', 409);
      }
    }
  });
  fila = r.catch(() => {});
  return r;
}

function dataValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function textoCurto(valor, max) {
  if (valor == null) return '';
  return String(valor).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

// ---------- hash com cache ----------

const cacheHash = new Map(); // caminho absoluto -> { tamanho, mtimeMs, sha1 }
function sha1Arquivo(abs) {
  const st = fs.statSync(abs);
  const c = cacheHash.get(abs);
  if (c && c.tamanho === st.size && c.mtimeMs === st.mtimeMs) return c.sha1;
  const sha1 = crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex');
  cacheHash.set(abs, { tamanho: st.size, mtimeMs: st.mtimeMs, sha1 });
  return sha1;
}

function idDe(relativo) {
  return crypto.createHash('sha1').update(relativo).digest('hex').slice(0, 16);
}

// ---------- varredura ----------

function listarArquivos(abs) {
  const saida = [];
  let entradas;
  try {
    entradas = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return saida;
  }
  for (const e of entradas) {
    if (e.isSymbolicLink()) continue; // nada de seguir link para fora do acervo
    const filho = path.join(abs, e.name);
    if (e.isDirectory()) saida.push(...listarArquivos(filho));
    else if (e.isFile()) saida.push(filho);
  }
  return saida;
}

function tipoDoArquivo(nome) {
  const ext = path.extname(nome).toLowerCase();
  if (EXT_IMAGEM.has(ext)) return 'imagem';
  if (EXT_VIDEO.has(ext)) return 'video';
  if (EXT_TEXTO.has(ext)) return 'texto';
  return null;
}

function urlServivel(relativoRepo) {
  return '/' + relativoRepo.split('/').map(encodeURIComponent).join('/');
}

// Familia editorial nao altera identidade fisica, versao ou aceite da peca.
function familia(caminho) {
  if (typeof caminho !== 'string' || caminho.includes('\\') || caminho.split('/').some((s) => !s || s === '.' || s === '..')) return null;
  const m = /^(docs\/marketing\/\d{4}-\d{2}\/semana-\d{2}-\d{4}-\d{2}-\d{2}-a-\d{4}-\d{2}-\d{2})\/(para-aprovacao|aprovados|historico)\/(.+)$/.exec(caminho);
  if (!m) return null;
  const editorial = editorialDaPeca(path.posix.basename(caminho), caminho);
  if (editorial && REELS_EDITORIAIS.some((r) => r.familia === editorial.familia)) return `${m[1]}/editorial/${editorial.familia}`;
  const dir = path.posix.dirname(m[3]);
  let nome = path.posix.basename(m[3], path.posix.extname(m[3]));
  let anterior;
  do { anterior = nome; nome = nome.replace(/-(?:narrado|capa|v\d+)$/i, ''); } while (nome !== anterior);
  return `${m[1]}/${dir}/${nome.toLowerCase()}`;
}
// Revisão superada fica em `superadas`, nunca em alternativas: não é escolha, é passado.
function agruparFamilias(pecas) {
  const grupos = new Map();
  for (const p of pecas) {
    const chave = p.familia || familia(p.caminho) || p.caminho;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(p);
  }
  return [...grupos].map(([chave, itens]) => {
    const versao = (p) => Number(/-v(\d+)(?:-(?:narrado|capa))*\.[^.]+$/i.exec(p.caminho)?.[1] || 0);
    const ordem = (a, b) => Number(!!b.revisao?.vigente) - Number(!!a.revisao?.vigente)
      || Number(a.estado === 'historico') - Number(b.estado === 'historico')
      || versao(b) - versao(a) || (b.modificadoEm || '').localeCompare(a.modificadoEm || '') || a.caminho.localeCompare(b.caminho);
    const superada = (p) => !!p.revisao?.superada || p.estadoEfetivo === 'superada';
    const superadas = itens.filter(superada).sort((a, b) => (b.revisao?.ordem || 0) - (a.revisao?.ordem || 0));
    const ativos = itens.filter((p) => !superada(p));
    const capas = ativos.filter((p) => p.capaDe || p.capaOrfa).sort(ordem);
    const alternativas = ativos.filter((p) => !p.capaDe && !p.capaOrfa).sort(ordem);
    const principal = alternativas.shift() || capas.shift() || null;
    const registro = itens.find((p) => p.revisao)?.revisao;
    return { id: idDe(chave), chave, principal, alternativas, capas, superadas,
      registro: registro ? { familia: registro.familia, nome: registro.nome, pendencia: registro.pendencia, vigente: registro.vigenteCaminho } : null };
  });
}

// ---------- registro explícito de famílias (docs/marketing/painel/familias.json) ----------
//
// O nome e a pasta não dizem que dois arquivos são revisões da mesma peça
// (lumen-v6 -> lumen-v7 virava outra família). O registro diz, em ordem, e
// aponta a vigente. Peça fora do registro mantém o agrupamento por caminho.
const ARQUIVO_FAMILIAS = 'familias.json';
function caminhoDoAcervo(c) {
  return typeof c === 'string' && c.startsWith(`${PASTA_MARKETING}/`) && !c.includes('\\')
    && !c.split('/').some((s) => !s || s === '.' || s === '..');
}
// A pasta de estado não faz parte da identidade: promover ou recusar a revisão
// (para-aprovacao -> aprovados -> historico) não a tira da família.
function chaveDoRegistro(c) {
  return c.replace(/^(docs\/marketing\/\d{4}-\d{2}\/semana-[^/]+)\/(?:para-aprovacao|aprovados|historico)\//, '$1/*/');
}
function lerRegistroFamilias(raiz) {
  const dados = lerJson(caminhoPainel(raiz, ARQUIVO_FAMILIAS), { familias: [], capas: [] });
  const invalido = (msg) => { throw new ErroMarketing('familias-invalido', `familias.json: ${msg}. Corrija o registro antes de decidir peças.`, 500); };
  const revisoes = new Map(), capas = new Map(), ids = new Set();
  for (const f of Array.isArray(dados.familias) ? dados.familias : invalido('"familias" precisa ser lista')) {
    if (!f || typeof f.id !== 'string' || !/^[A-Za-z0-9-]{1,40}$/.test(f.id) || ids.has(f.id)) invalido('família sem id único');
    if (typeof f.nome !== 'string' || !f.nome.trim() || f.nome.length > 80) invalido(`${f.id} sem nome legível`);
    ids.add(f.id);
    const lista = Array.isArray(f.revisoes) ? f.revisoes.map((r) => r?.caminho) : [];
    if (!lista.length || !lista.every(caminhoDoAcervo)) invalido(`revisões inválidas em ${f.id}`);
    if (f.vigente !== null && !lista.includes(f.vigente)) invalido(`vigente de ${f.id} não está entre as revisões`);
    if (f.vigente === null && (typeof f.pendencia !== 'string' || !f.pendencia.trim())) invalido(`${f.id} sem vigente precisa dizer a pendência`);
    lista.forEach((caminho, i) => {
      const chave = chaveDoRegistro(caminho);
      if (revisoes.has(chave)) invalido(`${caminho} aparece duas vezes no registro`);
      const vigente = f.vigente !== null && chaveDoRegistro(f.vigente) === chave;
      revisoes.set(chave, { familia: f.id, nome: f.nome.trim(), ordem: i + 1, total: lista.length, vigenteCaminho: f.vigente,
        vigente, superada: f.vigente !== null && !vigente,
        pendencia: f.vigente === null ? f.pendencia.trim() : null });
    });
  }
  for (const v of Array.isArray(dados.capas) ? dados.capas : invalido('"capas" precisa ser lista')) {
    if (!caminhoDoAcervo(v?.capa) || !caminhoDoAcervo(v?.reel) || capas.has(chaveDoRegistro(v.capa)) || revisoes.has(chaveDoRegistro(v.capa))) invalido('vínculo de capa inválido ou repetido');
    capas.set(chaveDoRegistro(v.capa), chaveDoRegistro(v.reel));
  }
  return { revisoes, capas };
}

// Recusa no servidor qualquer decisão sobre revisão que não é a vigente.
function exigirVigente(peca, acao) {
  if (peca?.revisao?.superada || peca?.estadoEfetivo === 'superada') {
    const vigente = peca.revisao?.vigenteCaminho ? path.posix.basename(peca.revisao.vigenteCaminho) : 'a revisão vigente';
    throw new ErroMarketing('revisao-superada', `Esta revisão foi substituída por ${vigente}. ${acao} só vale para a revisão vigente da família.`, 409);
  }
  if (peca?.revisao?.pendencia) {
    throw new ErroMarketing('familia-pendente', `A família ${peca.revisao.nome || 'desta peça'} ainda não tem revisão vigente escolhida pelo autor (${peca.revisao.pendencia}). ${acao} fica bloqueado até a escolha.`, 409);
  }
}
// Validador único de aceite do autor (W-C1, 14/10): catálogo, calendário, cronograma, promoção
// e ensaio usam este mesmo predicado; aceite-evidencia.cjs só o reexporta.
// Lista fechada: parecer de agente/revisor não é aceite do autor (regra 25).
const EVIDENCIA_PAINEL = 'aceite pelo autor no painel local';
const EVIDENCIA_DERIVADA = 'composto derivado de aceites separados';
const EVIDENCIAS_AUTOR = Object.freeze([EVIDENCIA_PAINEL]);
// Derivação de aceite composto (vídeo + capa) a partir de aceites separados já datados.
// Lista fechada no código, não no JSON: só estas duas, autorizadas pelo Orquestrador Supremo em
// 14/10/2026 para os Reels que já estavam em aprovados. Reel novo exige aceite composto explícito.
// Editar aprovacoes.json não cria derivação nova; a cadeia ainda é conferida byte a byte.
const DERIVACOES_AUTORIZADAS = Object.freeze([
  Object.freeze({ id: 'a73f19a82efb0f87', versao: 'c3f392ddc38abb04b0dca30d95490338db99e80a' }), // motion base
  Object.freeze({ id: 'a4d997e49dfa98fa', versao: 'd2291cb48d01c6943cb7d758c70a661c0119149e' }), // notificacao-1
]);
const RE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const dataPassada = (iso, agora) => typeof iso === 'string' && RE_ISO.test(iso) && dataValida(iso.slice(0, 10))
  && Number.isFinite(Date.parse(iso)) && Date.parse(iso) <= agora;

// A derivação só vale se: é uma das autorizadas; o Reel ainda é a mesma composição (vídeo,
// capa e peça da capa); a capa citada tem aceite de painel válido, dessa versão, com a
// mesma data; e a versão da capa citada é a dos bytes que estão selados no Reel.
function derivacaoValida(a, p, agora, aceites) {
  if (!DERIVACOES_AUTORIZADAS.some((d) => d.id === a.id && d.versao === a.versao)) return false;
  const c = p.composicao, d = a.derivadoDe;
  if (!c || !d || !d.video || !d.capa || !Array.isArray(aceites)) return false;
  if (JSON.stringify(a.composicao) !== JSON.stringify(c)) return false;
  if (d.video.caminho !== p.caminho || c.video.length !== 1 || d.video.sha1 !== c.video[0]) return false;
  if (d.capa.id !== c.capaPecaId || d.capa.versao !== versaoDeArquivos([c.capa], null)) return false;
  return aceites.some((x) => x && x.id === d.capa.id && x.versao === d.capa.versao && x.caminho === d.capa.caminho
    && x.evidencia === EVIDENCIA_PAINEL && x.aprovadoEm === d.capa.aprovadoEm && dataPassada(x.aprovadoEm, agora));
}

function aceiteValido(a, p, agora = Date.now(), aceites = null) {
  if (!a || !p || a.id !== p.id || a.versao !== p.versao || a.caminho !== p.caminho || !dataPassada(a.aprovadoEm, agora)) return false;
  if (EVIDENCIAS_AUTOR.includes(a.evidencia)) return true;
  return a.evidencia === EVIDENCIA_DERIVADA && derivacaoValida(a, p, agora, aceites);
}
// Capa vinculada a um Reel é componente dele: tem aceite próprio, mas não é item autônomo de
// planejamento, cronograma, promoção ou ensaio (W-C2, 14/10).
function exigirItemAutonomo(peca, acao) {
  if (peca?.capaDe) {
    throw new ErroMarketing('componente-do-reel', `Esta imagem é a capa de um Reel. ${acao} vale para o Reel, não para a capa sozinha.`, 409);
  }
}
function versaoDeArquivos(shas, legenda) {
  return crypto.createHash('sha1').update(shas.join('\n') + '\nlegenda:' + (legenda || '')).digest('hex');
}
function versaoComposta(shasVideo, shaCapa, legenda) {
  return versaoDeArquivos([...shasVideo, `capa:${shaCapa}`], legenda);
}
function caminhoSeguro(raiz, relativo, io = fs) {
  const ruim = (s) => !s || s.startsWith('.') || /[\\:\u0000-\u001f\u007f<>"|?*]/.test(s) || /[. ]$/.test(s)
    || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(s) || /~\d/.test(s);
  if (typeof relativo !== 'string' || relativo.normalize('NFKC') !== relativo || relativo.split('/').some(ruim)) throw new ErroMarketing('caminho-invalido', 'Caminho do acervo invalido.', 403);
  const root = path.resolve(raiz), abs = path.resolve(root, relativo);
  const dentro = (r, p) => { const rel = path.relative(r, p); return !rel.startsWith('..') && !path.isAbsolute(rel); };
  if (!dentro(root, abs) || abs === root) throw new ErroMarketing('caminho-invalido', 'Caminho fora do acervo.', 403);
  for (let cur = abs; cur !== root; cur = path.dirname(cur)) {
    if (io.existsSync(cur) && (io.lstatSync(cur).isSymbolicLink() || !dentro(io.realpathSync(root), io.realpathSync(cur)))) throw new ErroMarketing('caminho-invalido', 'Links nao sao permitidos no acervo.', 403);
  }
  return abs;
}

function listarSemanas(raiz) {
  const base = path.join(raiz, PASTA_MARKETING);
  const semanas = [];
  let meses;
  try {
    meses = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return semanas;
  }
  for (const m of meses) {
    if (!m.isDirectory() || !RE_MES.test(m.name)) continue;
    for (const s of fs.readdirSync(path.join(base, m.name), { withFileTypes: true })) {
      const r = s.isDirectory() && RE_SEMANA.exec(s.name);
      if (!r) continue;
      semanas.push({
        mes: m.name,
        pasta: s.name,
        numero: Number(r[1]),
        inicio: r[2],
        fim: r[3],
        relativo: `${PASTA_MARKETING}/${m.name}/${s.name}`,
      });
    }
  }
  return semanas.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

// Agrupa "carrossel-1.png ... carrossel-5.png" (mesmo prefixo, mesmo diretório,
// dois ou mais números) numa peça só. O resto vira uma peça por arquivo.
function agrupar(arquivosDoDiretorio) {
  const grupos = new Map();
  const soltos = [];
  for (const a of arquivosDoDiretorio) {
    const m = /^(.*?)[-_](\d{1,2})\.[^.]+$/.exec(a.nome);
    if (m && a.tipo === 'imagem') {
      const chave = m[1].toLowerCase();
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push({ ...a, ordem: Number(m[2]) });
    } else soltos.push([a]);
  }
  const pecas = [...soltos];
  for (const [chave, itens] of grupos) {
    if (itens.length >= 2) pecas.push(itens.sort((x, y) => x.ordem - y.ordem).map((i) => ({ ...i, grupo: chave })));
    else pecas.push(itens);
  }
  return pecas;
}

// ---------- legendas a partir dos documentos de copy existentes ----------

// Lê COPYS-FINAIS.md da semana: "## C01 · Título" e "### Card estático, C01".
function lerCopys(raiz, semana, ler = fs.readFileSync) {
  const mapa = {};
  for (const estado of ESTADOS) {
    const arq = path.join(raiz, semana.relativo, estado, 'pecas', 'COPYS-FINAIS.md');
    let texto;
    try {
      // CRLF (checkout do Windows com autocrlf) não pode mudar a legenda nem, por ela, a versão.
      texto = ler(arq, 'utf8').replace(/\r\n?/g, '\n');
    } catch {
      continue;
    }
    const secoes = texto.split(/^(?=#{2,3} )/m);
    for (const sec of secoes) {
      const cab = /^(#{2,3}) (.+)$/m.exec(sec);
      if (!cab) continue;
      const codigo = /\b([CRES]\d{1,2})\b/.exec(cab[2]);
      if (!codigo) continue;
      const corpo = sec.slice(cab[0].length).trim();
      const legenda = /\*\*Legenda:\*\*\s*([\s\S]*?)(?:\n\s*\n|$)/.exec(corpo);
      const limpo = corpo.replace(/\*\*/g, '').replace(/\n{3,}/g, '\n\n').trim();
      const item = {
        codigo: codigo[1],
        titulo: cab[2].replace(/\*\*/g, '').trim(),
        legenda: legenda ? legenda[1].replace(/\s+/g, ' ').trim() : limpo.slice(0, 1200),
        fonte: `${semana.relativo}/${estado}/pecas/COPYS-FINAIS.md`,
      };
      // O lote piloto (###) vale mais que a lista geral (##) para o mesmo código.
      if (!mapa[item.codigo] || cab[1] === '###') mapa[item.codigo] = item;
    }
  }
  return mapa;
}

function limparTitulo(t) {
  return t
    .replace(/\b[CRES]\d{1,2}\b/g, '')
    .replace(/,\s*,/g, ',')
    .replace(/^[\s·,]+|[\s·,]+$/g, '')
    .replace(/\s{2,}/g, ' ');
}

// Decisão editorial do autor: são variantes, não duplicatas a apagar. O
// vínculo é explícito para estes arquivos; não inferimos famílias pelo nome.
const SEMANA_39_EDITORIAL = 'docs/marketing/2026-09/semana-39-2026-09-21-a-2026-09-27';
const REELS_EDITORIAIS = [
  {
    familia: 'R5',
    codigo: 'R5',
    base: 'grana-r5-colar-pix-v6',
    pastas: {
      base: `${SEMANA_39_EDITORIAL}/para-aprovacao/pecas/reels`,
      narrado: `${SEMANA_39_EDITORIAL}/para-aprovacao/pecas/reels`,
    },
    copyCanonica: 'Recebeu um Pix e não quer digitar tudo?',
    fonteCopy: 'docs/marketing/r5-colar-pix/README.md',
    duracaoSegundos: 16.4,
    sha1CapasConfirmado: '646be9950a3347ecfbbc51383ee4a329c562f274',
  },
  {
    familia: 'motion-desistiu',
    codigo: null,
    base: 'grana-motion-desistiu-foto-da-nota',
    pastas: {
      base: `${SEMANA_39_EDITORIAL}/aprovados/pecas/reels`,
      narrado: `${SEMANA_39_EDITORIAL}/para-aprovacao/pecas/reels`,
    },
    copyCanonica: 'Já desistiu de controlar seus gastos porque anotar tudo toda hora cansa?\nPagou? É só falar.\nOu aponta pro QR code da nota.\nEsqueceu? O Grana. te lembra.\nRápido, fácil e sem complicação.',
    fonteCopy: 'docs/marketing/motion-desistiu/README.md',
    duracaoSegundos: 20,
    sha1CapasConfirmado: 'c34c5d2eea37158015b3ad9b44dbd4f4ca945eba',
  },
];

const PASTA_REVISAO_06 = 'docs/marketing/2026-09/semana-39-2026-09-21-a-2026-09-27/para-aprovacao/pecas/funil/revisao-06';
const ARTES_EDITORIAIS = {
  'E01-feed-1080x1440.png': {
    codigo: 'E01',
    copyCanonica: 'O salário caiu. Quanto já tem destino?',
    avisoHarmonizacao: 'Candidata visual da revisão 06. A copy da arte diverge da canônica do FUNIL 17.3; harmonização pendente.',
  },
  'E02-feed-1080x1440.png': {
    codigo: 'E02',
    copyCanonica: 'Mercado de R$ 187,40. Salário, condomínio e assinaturas no mesmo mês.',
    avisoHarmonizacao: 'Candidata visual da revisão 06. A arte repete a copy da revisão 05; harmonização com o FUNIL 17.3 pendente.',
  },
  'E06-feed-1080x1440.png': {
    codigo: 'E06',
    copyCanonica: 'Os lançamentos do mês também cabem na tela grande.',
    avisoHarmonizacao: 'Candidata visual da revisão 06. A copy da arte diverge da canônica do FUNIL 17.3; harmonização pendente.',
  },
};

function editorialDaPeca(nome, relativoRepo) {
  const arte = ARTES_EDITORIAIS[nome];
  if (arte && relativoRepo === `${PASTA_REVISAO_06}/${nome}`) {
    return {
      ...arte,
      familia: arte.codigo,
      tipo: 'visual-candidata',
      variante: 'revisao-06',
      copyEmbutida: 'divergente',
      fonteCopy: 'FUNIL 17.3 — decisão editorial do autor',
    };
  }
  for (const reel of REELS_EDITORIAIS) {
    for (const variante of ['base', 'narrado']) {
      const stem = reel.base + (variante === 'narrado' ? '-narrado' : '');
      if (nome !== `${stem}.mp4` && nome !== `${stem}-capa.png`) continue;
      if (relativoRepo !== `${reel.pastas[variante]}/${nome}`) continue;
      const ehCapa = nome.endsWith('-capa.png');
      return {
        familia: reel.familia,
        codigo: reel.codigo,
        tipo: ehCapa ? 'capa' : variante === 'base' ? 'canonico' : 'variante',
        variante,
        copyCanonica: reel.copyCanonica,
        fonteCopy: reel.fonteCopy,
        ...(ehCapa ? {
          duplicataVisual: {
            sha1Confirmado: reel.sha1CapasConfirmado,
            fonteConfirmacao: 'Autor — hash confirmado',
            arquivos: [`${reel.base}-capa.png`, `${reel.base}-narrado-capa.png`],
          },
        } : {}),
        ...(!ehCapa ? { duracaoSegundos: reel.duracaoSegundos } : {}),
      };
    }
  }
  return null;
}

// Liga a peça ao código de copy. Só regras explícitas, documentadas no
// DOCUMENTO-DE-MARKETING.md; sem palpite por semelhança.
function codigoDaPeca(relNaSemana) {
  const baixo = relNaSemana.toLowerCase();
  if (/(^|\/)r13[-/]/.test(baixo) || /reel-r13/.test(baixo)) return 'R13';
  if (/lumen[^/]*\/carrossel-(\d|\*)/.test(baixo)) return 'C14';
  if (/lumen[^/]*\/card\.png$/.test(baixo)) return 'C01';
  const m = /(?:^|\/)([CRES]\d{1,2})(?=[-_.])/i.exec(relNaSemana);
  return m ? m[1].toUpperCase() : null;
}

// ---------- linhas do INDICE.md ----------

function lerIndice(raiz, semana) {
  let texto;
  try {
    texto = fs.readFileSync(path.join(raiz, semana.relativo, 'INDICE.md'), 'utf8');
  } catch {
    return [];
  }
  const linhas = [];
  for (const l of texto.split(/\r?\n/)) {
    if (!l.startsWith('|') || /^\|\s*-/.test(l)) continue;
    const alvos = [...l.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1].replace(/^\.\//, ''));
    if (alvos.length) linhas.push({ texto: l.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim(), alvos });
  }
  return linhas;
}

function linhaDoIndice(linhas, relNaSemana) {
  for (const l of linhas) {
    for (const alvo of l.alvos) {
      if (alvo.startsWith('..')) continue;
      if (relNaSemana === alvo || relNaSemana.startsWith(alvo.endsWith('/') ? alvo : alvo + '/')) return l.texto;
    }
  }
  return null;
}

// ---------- catálogo ----------

function montarCatalogo(raiz) {
  const pecas = [];
  const registro = lerRegistroFamilias(raiz);
  for (const semana of listarSemanas(raiz)) {
    const copys = lerCopys(raiz, semana);
    const indice = lerIndice(raiz, semana);
    for (const estado of ESTADOS) {
      const absEstado = path.join(raiz, semana.relativo, estado);
      const porDiretorio = new Map();
      for (const abs of listarArquivos(absEstado)) {
        const nome = path.basename(abs);
        const ext = path.extname(nome).toLowerCase();
        if (IGNORAR.has(ext) || nome.startsWith('.')) continue;
        const tipo = tipoDoArquivo(nome);
        if (!tipo) continue;
        const dir = path.dirname(abs);
        if (!porDiretorio.has(dir)) porDiretorio.set(dir, []);
        porDiretorio.get(dir).push({ abs, nome, tipo });
      }
      for (const [, arquivos] of porDiretorio) {
        arquivos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
        // Capa de vídeo: <nome-do-video>-capa.png na MESMA pasta. A capa continua sendo uma peça
        // (o autor precisa aceitá-la), mas aponta para o vídeo (capaDe) e o vídeo para ela (capa).
        const capaDoVideo = new Map(); // nome do vídeo -> arquivo da capa
        const capasPareadas = new Set();
        for (const v of arquivos.filter((x) => x.tipo === 'video')) {
          const stem = v.nome.slice(0, v.nome.length - path.extname(v.nome).length).toLowerCase();
          const c = arquivos.find((x) => x.tipo === 'imagem' && x.nome.toLowerCase() === stem + '-capa.png');
          if (c) { capaDoVideo.set(v.nome, c); capasPareadas.add(c.nome); }
        }
        for (const grupo of agrupar(arquivos)) {
          const relRepo = (a) => path.relative(raiz, a.abs).split(path.sep).join('/');
          const primeiro = grupo[0];
          const ehCarrossel = grupo.length > 1;
          const relPeca = ehCarrossel
            ? `${path.posix.dirname(relRepo(primeiro))}/${primeiro.grupo}-*`
            : relRepo(primeiro);
          const relNaSemana = relPeca.slice(semana.relativo.length + 1);
          const relNoEstado = relNaSemana.slice(estado.length + 1);
          const shas = grupo.map((a) => sha1Arquivo(a.abs));
          const editorial = !ehCarrossel ? editorialDaPeca(primeiro.nome, relRepo(primeiro)) : null;
          const codigoOriginal = codigoDaPeca(relNaSemana);
          const codigo = editorial ? editorial.codigo : codigoOriginal;
          const copy = codigoOriginal && copys[codigoOriginal];
          const ehDocCopy = primeiro.nome === 'COPYS-FINAIS.md';
          // A referência editorial fica separada da legenda incorporada à
          // versão aceita. Classificar uma variante não altera seu aceite.
          const legenda = copy && !ehDocCopy ? copy.legenda : null;
          // A legenda entra na versão: mudar só o texto gera versão nova,
          // e o aceite anterior deixa de valer para ela.
          const versao = versaoDeArquivos(shas, legenda);
          const nomeCurto = relNoEstado.replace(/^pecas\//, '');
          const capaArq = !ehCarrossel && primeiro.tipo === 'video' ? capaDoVideo.get(primeiro.nome) : null;
          const editorialCapa = capaArq ? editorialDaPeca(capaArq.nome, relRepo(capaArq)) : null;
          const ehCapa = !ehCarrossel && capasPareadas.has(primeiro.nome);
          const videoDaCapa = ehCapa ? [...capaDoVideo].find(([, c]) => c.nome === primeiro.nome)[0] : null;
          const revisao = registro.revisoes.get(chaveDoRegistro(relPeca)) || null;
          pecas.push({
            id: idDe(relPeca),
            capa: capaArq ? {
              pecaId: idDe(relRepo(capaArq)),
              nome: capaArq.nome,
              url: urlServivel(relRepo(capaArq)),
              sha1: sha1Arquivo(capaArq.abs),
              ...(editorialCapa?.duplicataVisual
                ? { duplicataVisual: editorialCapa.duplicataVisual }
                : {}),
            } : null,
            capaDe: videoDaCapa ? idDe(path.posix.dirname(relPeca) + '/' + videoDaCapa) : null,
            capaOrfa: !ehCarrossel && primeiro.tipo === 'imagem' && /-capa.png$/i.test(primeiro.nome) && !ehCapa,
            caminho: relPeca,
            familia: revisao ? `registro/${revisao.familia}` : familia(relPeca),
            revisao: revisao ? { ...revisao } : null,
            modificadoEm: new Date(Math.max(...grupo.map((a) => fs.statSync(a.abs).mtimeMs))).toISOString(),
            versao,
            semana: { numero: semana.numero, inicio: semana.inicio, fim: semana.fim, mes: semana.mes },
            estado,
            tipo: ehCarrossel ? 'carrossel' : primeiro.tipo,
            titulo: copy && (estado !== 'historico' || revisao?.vigente) ?`${copy.codigo} · ${limparTitulo(copy.titulo)}` : nomeCurto,
            nome: nomeCurto,
            codigo: codigo || null,
            legenda,
            fonteLegenda: legenda ? copy.fonte : null,
            editorial: editorial ? {
              familia: editorial.familia,
              tipo: editorial.tipo,
              variante: editorial.variante,
              copyCanonica: editorial.copyCanonica,
              fonteCopy: editorial.fonteCopy,
              ...(editorial.duplicataVisual
                ? { duplicataVisual: editorial.duplicataVisual }
                : {}),
              ...(editorial.copyEmbutida
                ? { copyEmbutida: editorial.copyEmbutida }
                : {}),
              ...(editorial.avisoHarmonizacao
                ? { avisoHarmonizacao: editorial.avisoHarmonizacao }
                : {}),
              ...(editorial.duracaoSegundos !== undefined
                ? { duracaoSegundos: editorial.duracaoSegundos }
                : {}),
              canonicoId: null,
            } : null,
            indice: linhaDoIndice(indice, ehCarrossel ? relNaSemana.replace(/[^/]+$/, '') : relNaSemana),
            arquivos: grupo.map((a, i) => ({
              nome: a.nome,
              tipo: a.tipo,
              url: urlServivel(relRepo(a)),
              bytes: fs.statSync(a.abs).size,
              sha1: shas[i],
            })),
          });
        }
      }
    }
  }
  // Vínculo explícito capa -> Reel do registro (sufixo de tamanho ou outra semana
  // quebram o pareamento por nome). A capa vinculada entra na família do Reel e
  // nunca vira peça própria no Feed. Reel ausente do acervo: a capa fica como está.
  for (const [capaCaminho, reelCaminho] of registro.capas) {
    const capa = pecas.find((p) => chaveDoRegistro(p.caminho) === capaCaminho && p.tipo === 'imagem');
    const reel = pecas.find((p) => chaveDoRegistro(p.caminho) === reelCaminho && p.tipo === 'video');
    if (!capa || !reel) { console.error(JSON.stringify({ codigo: 'familias-capa-sem-par' })); continue; }
    capa.capaDe = reel.id; capa.capaOrfa = false; capa.familia = reel.familia;
    capa.vinculoCapa = 'registro';
    reel.capa = { pecaId: capa.id, nome: capa.arquivos[0].nome, url: capa.arquivos[0].url, sha1: capa.arquivos[0].sha1 };
  }
  // Aceite composto do Reel (W-A2): a versão sela vídeo + capa + legenda. Trocar a
  // capa, o vídeo ou a legenda gera versão nova, e o aceite anterior deixa de valer.
  // `versaoArquivos` continua sendo só a dos arquivos da peça, para conferir cópias.
  for (const p of pecas) {
    p.versaoArquivos = p.versao;
    if (p.tipo === 'video' && p.capa) {
      p.versao = versaoComposta(p.arquivos.map((a) => a.sha1), p.capa.sha1, p.legenda);
      p.composicao = { video: p.arquivos.map((a) => a.sha1), capa: p.capa.sha1, capaPecaId: p.capa.pecaId, legenda: p.legenda ? 'incluida' : 'sem-legenda' };
    }
  }
  // A base pode estar em aprovados e a variante em para-aprovacao. Ligamos
  // depois de montar a semana inteira, sem trocar IDs, estados ou aceites.
  for (const peca of pecas) {
    if (!peca.editorial) continue;
    const reel = REELS_EDITORIAIS.find((r) => r.familia === peca.editorial.familia);
    if (!reel) continue;
    const canonico = pecas.find((p) => p.editorial?.tipo === 'canonico' &&
      p.editorial.familia === peca.editorial.familia &&
      p.caminho === `${reel.pastas.base}/${reel.base}.mp4`);
    peca.editorial.canonicoId = canonico ? canonico.id : null;
  }
  return pecas;
}

// Junta o estado editorial efetivo: pasta + registros de aprovacoes.json.
function enriquecer(raiz, pecas) {
  const ap = lerJson(caminhoPainel(raiz, 'aprovacoes.json'), { aprovacoes: [], ajustes: [] });
  const cal = lerJson(caminhoPainel(raiz, 'calendario.json'), { planejados: [] });
  const historico = lerJson(caminhoPainel(raiz, 'historico.json'), { recusas: [] });
  const aprovacoes = Array.isArray(ap.aprovacoes) ? ap.aprovacoes : [];
  const ajustes = Array.isArray(ap.ajustes) ? ap.ajustes : [];
  // Pedidos novos vivem na fila privada (fora do repositório), não em ajustes[]. Pedido
  // ainda aberto para a versão na tela mantém o selo "Ajuste pedido".
  let fila = [], eventos = [], vigia;
  const dto = require('./ajustes-dto.cjs');
  try {
    const mod = require('./ajustes-fila.cjs');
    fila = mod.fila.listar(); eventos = mod.fila.eventos?.() || []; vigia = mod.vigiaEstado?.();
  } catch { console.error(JSON.stringify({ codigo: 'catalogo-fila-indisponivel' })); }
  const ABERTOS = new Set(['novo', 'em-correcao', 'falha-de-envio', 'aguardando-aprovacao-de-custo', 'precisa-de-atencao']);
  for (const r of fila) {
    if (ABERTOS.has(r.estado)) ajustes.push({ id: r.pecaId, versao: r.versaoAlvo, pedidoEm: r.criadoEm, pedidoId: r.id, estado: r.estado });
  }
  const planejados = Array.isArray(cal.planejados) ? cal.planejados : [];
  // Capa só conta como aceita com evidência PRÓPRIA da versão dela (aprovacoes[]). Estar na pasta
  // aprovados porque o vídeo está lá não é aceite da capa (regra 25).
  // Validador único de aceite (W-C1): o catálogo concorda com calendário, cronograma e ensaio.
  const agora = Date.now();
  const valido = (a, p) => aceiteValido(a, p, agora, aprovacoes);
  // Capa de Reel superado é superada junto: ela não pode ser aprovada sozinha.
  const superadas = new Set(pecas.filter((p) => p.revisao?.superada).map((p) => p.id));
  // Aceite composto de um Reel vigente cobre a capa que está selada na versão dele.
  const capasEmComposto = new Set(pecas.filter((r) => r.composicao && !superadas.has(r.id)
    && aprovacoes.some((a) => valido(a, r))).map((r) => r.capa.pecaId));
  const capaAprovada = (id) => {
    const cp = pecas.find((x) => x.id === id);
    return !!cp && (capasEmComposto.has(cp.id) || aprovacoes.some((a) => valido(a, cp)));
  };
  return pecas.map((p) => {
    const superada = superadas.has(p.id) || (!!p.capaDe && superadas.has(p.capaDe));
    const pendente = !superada && !!p.revisao?.pendencia;
    // A vigente escolhida no registro decide pelo registro, mesmo guardada em historico.
    const estado = p.revisao?.vigente && p.estado === 'historico' ? 'para-aprovacao' : p.estado;
    const aceiteDaVersao = aprovacoes.filter((a) => valido(a, p)).at(-1) || null;
    // Aceite de revisão superada fica no histórico e não vale mais para publicar.
    const aceite = superada ? null : aceiteDaVersao;
    const aceiteAntigo = !aceiteDaVersao && aprovacoes.some((a) => a.id === p.id);
    const ajuste = ajustes.filter((a) => a.id === p.id && a.versao === p.versao).at(-1) || null;
    const pedido = fila.filter((r) => r.pecaId === p.id).at(-1);
    const plano = planejados.find((c) => c.id === p.id && c.versao === p.versao) || null;
    const capaSemAceite = !!p.capaDe && estado !== 'historico' && !aceite && !capasEmComposto.has(p.id);
    // Reel com capa só é aprovado com aceite composto desta versão (vídeo + capa + legenda),
    // mesmo na pasta aprovados: a pasta não sela a capa (decisão do Supremo, 14/10).
    const reelSemComposto = !!p.composicao && !aceite;
    const aprovada = !superada && !pendente && !capaSemAceite && !reelSemComposto && (estado === 'aprovados' || !!aceite);
    let estadoEfetivo = estado;
    if (superada) estadoEfetivo = 'superada';
    else if (capaSemAceite) estadoEfetivo = ajuste ? 'ajuste-pedido' : 'aguardando-aceite';
    else if (estado === 'para-aprovacao') estadoEfetivo = aceite ? 'aprovada' : ajuste ? 'ajuste-pedido' : 'aguardando-aceite';
    else if (estado === 'aprovados') estadoEfetivo = pendente || reelSemComposto ? 'aguardando-aceite' : 'aprovada';
    return {
      ...p,
      revisao: p.revisao ? { ...p.revisao, superada } : (superada ? { superada: true, vigente: false, vigenteCaminho: null, familia: null, nome: null, pendencia: null } : null),
      capa: p.capa ? { ...p.capa, aprovada: capaAprovada(p.capa.pecaId) } : null,
      aprovada,
      estadoEfetivo,
      aceite,
      aceiteSuperado: superada ? aceiteDaVersao : null,
      recusa: p.estado === 'historico' && Array.isArray(historico.recusas)
        ? historico.recusas.filter((r) => r.id === p.id && r.versao === p.versao).map((r) => ({ motivo: r.motivo, sucessora: r.sucessora, recusadoEm: r.recusadoEm, evidencia: r.evidencia })).at(-1) || null : null,
      // Aceite dado a uma versão anterior não vale para esta (Sentinel A07).
      aceiteDeVersaoAnterior: aceiteAntigo,
      // Catalogo/feed tambem chegam ao navegador: nunca copiar o texto da fila.
      ajuste: ajuste ? {
        id: p.id, versao: p.versao,
        pedidoId: typeof ajuste.pedidoId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ajuste.pedidoId) ? ajuste.pedidoId : null,
        pedidoEm: typeof ajuste.pedidoEm === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(ajuste.pedidoEm) && Number.isFinite(Date.parse(ajuste.pedidoEm)) ? ajuste.pedidoEm : null,
        estado: ABERTOS.has(ajuste.estado) ? ajuste.estado : 'precisa-de-atencao',
        alertas: dto.alertasPublicos(pedido, vigia),
      } : null,
      planejamento: plano ? { data: plano.data, hora: plano.hora || null, canal: plano.canal } : null,
      trilha: {
        eventos: dto.trilhaPublica(p, fila, eventos, aprovacoes, planejados, Array.isArray(historico.recusas) ? historico.recusas : []),
        versao: true,
        revisao: !!(p.indice && /parecer|revis|watchtower|beacon|sentinel/i.test(p.indice)),
        aceite: aprovada,
        planejamento: !!plano,
      },
    };
  });
}

// GET /api/marketing/pecas  (filtros opcionais: estado, semana, tipo)
function listarPecas(raiz, filtros = {}) {
  let pecas = enriquecer(raiz, montarCatalogo(raiz));
  if (filtros.estado) pecas = pecas.filter((p) => p.estado === filtros.estado || p.estadoEfetivo === filtros.estado);
  if (filtros.semana) pecas = pecas.filter((p) => String(p.semana.numero) === String(filtros.semana));
  if (filtros.tipo) pecas = pecas.filter((p) => p.tipo === filtros.tipo);
  const semanas = listarSemanas(raiz).map((s) => ({ numero: s.numero, inicio: s.inicio, fim: s.fim, mes: s.mes }));
  // Revisão superada não entra na fila nem no contador: só em familias[].superadas.
  const familias = agruparFamilias(pecas);
  const ativas = filtros.estado === 'superada' ? pecas : pecas.filter((p) => p.estadoEfetivo !== 'superada');
  return { pecas: ativas, familias, semanas, total: ativas.length, totalSuperadas: pecas.length - ativas.length };
}

function obterPeca(raiz, id) {
  if (typeof id !== 'string' || !/^[0-9a-f]{16}$/.test(id)) throw new ErroMarketing('id-invalido', 'Identificador de peça inválido.', 400);
  const peca = enriquecer(raiz, montarCatalogo(raiz)).find((p) => p.id === id);
  if (!peca) throw new ErroMarketing('peca-inexistente', 'Peça não encontrada no acervo.', 404);
  return peca;
}

// GET /api/marketing/feed: só aprovadas, sem texto; data planejada, depois aceite.
function feed(raiz) {
  const pecas = enriquecer(raiz, montarCatalogo(raiz)).filter((p) => p.aprovada && p.tipo !== 'texto' && !p.capaDe);
  const chave = (p) => [p.planejamento ? `${p.planejamento.data}T${p.planejamento.hora || '00:00'}` : '9999', p.aceite ? p.aceite.aprovadoEm : ''];
  pecas.sort((a, b) => {
    const [a1, a2] = chave(a);
    const [b1, b2] = chave(b);
    return a1.localeCompare(b1) || a2.localeCompare(b2);
  });
  return {
    perfil: {
      nome: 'grana.',
      // Bio de perfil não existe em nenhum material aprovado; o painel não a inventa.
      bio: null,
      bioPendente: 'Bio do perfil ainda não definida pelo autor.',
      avatar: '/design-system/marca/icone-circular.svg',
      logotipo: '/design-system/marca/logotipo-gradiente.svg',
      observacao: 'Simulação local. Nada aqui foi publicado no Instagram.',
    },
    ordem: 'data planejada crescente; sem data no fim, pela data do aceite',
    pecas,
    total: pecas.length,
  };
}

// GET /api/marketing/documento
function documento(raiz) {
  const rel = `${PASTA_PAINEL}/DOCUMENTO-DE-MARKETING.md`;
  let texto;
  try {
    texto = fs.readFileSync(path.join(raiz, rel), 'utf8');
  } catch {
    throw new ErroMarketing('documento-ausente', 'DOCUMENTO-DE-MARKETING.md não foi encontrado.', 404);
  }
  return { caminho: rel, markdown: texto, bytes: Buffer.byteLength(texto) };
}

// Read a bounded historical snapshot; no checkout, temporary files or shell.
// resolver is the same static-file guard used by the local server.
function lerAnterior(raiz, pedido, peca, { resolver, executar, arquivo } = {}) {
  if (!pedido || !peca || pedido.pecaId !== peca.id || pedido.caminho !== peca.caminho
    || pedido.estado !== 'corrigido-aguardando-aceite' || !/^[0-9a-f]{40}$/.test(pedido.commit || '')
    || !/^[0-9a-f]{40}$/.test(pedido.versaoAlvo || '') || pedido.versaoCorrigida !== peca.versao) {
    throw new ErroMarketing('anterior-indisponivel', 'A versao anterior deste pedido nao esta comprovada.', 409);
  }
  const selecionado = peca.arquivos.find((a) => a.nome === (arquivo || peca.arquivos[0]?.nome));
  if (!selecionado || typeof resolver !== 'function') throw new ErroMarketing('arquivo-invalido', 'Arquivo da peca invalido.', 400);
  const protegido = resolver(selecionado.url);
  if (!protegido || protegido.publico || !['imagem', 'video', 'texto'].includes(selecionado.tipo)) throw new ErroMarketing('arquivo-recusado', 'Arquivo indisponivel para comparacao.', 403);
  const rel = path.posix.join(path.posix.dirname(peca.caminho), selecionado.nome);
  const atualSeguro = caminhoSeguro(raiz, rel);
  if (!fs.lstatSync(atualSeguro).isFile()) throw new ErroMarketing('arquivo-recusado', 'Arquivo atual nao regular.', 403);
  const semanaRel = peca.caminho.split('/').slice(0, 4).join('/');
  if (!familia(peca.caminho) || rel.includes(':') || rel.includes('\\') || rel.split('/').some((p) => p.startsWith('.') || p === '..' || /[\u0000-\u001f\u007f]/.test(p))) throw new ErroMarketing('arquivo-recusado', 'Caminho indisponivel para comparacao.', 403);
  const run = executar || require('node:child_process').execFileSync;
  const ref = pedido.commit + '^', prazo = Date.now() + 20000;
  let bytes = 0;
  const git = (args, limite) => {
    if (Date.now() >= prazo) throw new ErroMarketing('anterior-limite', 'A leitura da versao anterior excedeu o limite.', 503);
    try { return run('git', args, { cwd: raiz, shell: false, windowsHide: true, timeout: Math.max(1, prazo - Date.now()), maxBuffer: limite }); }
    catch { throw new ErroMarketing('anterior-indisponivel', 'Nao foi possivel ler a versao anterior no Git.', 409); }
  };
  const entradas = new Map();
  for (const linha of String(git(['ls-tree', '-r', '-l', '-z', ref, '--', semanaRel], 1024 * 1024)).split('\0')) {
    const m = /^(100644|100755|120000) blob ([0-9a-f]{40})\s+(\d+)\t(.+)$/.exec(linha);
    if (m) entradas.set(m[4], { modo: m[1], bytes: Number(m[3]) });
  }
  const conteudos = new Map();
  function ler(abs, encoding) {
    const caminho = path.relative(raiz, abs).split(path.sep).join('/');
    const e = entradas.get(caminho);
    if (!e || e.modo === '120000') throw new ErroMarketing('anterior-indisponivel', 'Arquivo anterior ausente ou nao regular.', 409);
    if (e.bytes > 64 * 1024 * 1024 || bytes + e.bytes > 256 * 1024 * 1024) throw new ErroMarketing('anterior-limite', 'Arquivo anterior excede o limite de leitura.', 413);
    if (!conteudos.has(caminho)) { const b = Buffer.from(git(['show', `${ref}:${caminho}`], 64 * 1024 * 1024)); bytes += b.length; conteudos.set(caminho, b); }
    const b = conteudos.get(caminho); return encoding ? b.toString(encoding) : b;
  }
  const dir = path.posix.dirname(peca.caminho);
  const arquivos = [...entradas].filter(([p, e]) => path.posix.dirname(p) === dir && e.modo !== '120000')
    .map(([p]) => ({ nome: path.posix.basename(p), tipo: tipoDoArquivo(p), rel: p })).filter((a) => a.tipo);
  const grupos = agrupar(arquivos);
  const grupo = grupos.find((g) => (g.length > 1 ? `${dir}/${g[0].grupo}-*` : g[0].rel) === peca.caminho);
  if (!grupo || grupo.length > 100 || !grupo.some((a) => a.nome === selecionado.nome)) throw new ErroMarketing('anterior-indisponivel', 'Composicao anterior nao comprovada.', 409);
  const semana = { relativo: semanaRel };
  const codigo = codigoDaPeca(peca.caminho.slice(semanaRel.length + 1));
  const copys = lerCopys(raiz, semana, ler);
  const legenda = codigo && copys[codigo] && grupo[0].nome !== 'COPYS-FINAIS.md' ? copys[codigo].legenda : null;
  const shas = grupo.map((a) => crypto.createHash('sha1').update(ler(path.join(raiz, a.rel))).digest('hex'));
  // Reel com capa: a versão pedida era composta; a capa é lida no mesmo commit.
  let alvo = versaoDeArquivos(shas, legenda);
  if (peca.composicao && peca.capa) {
    const capaRel = decodeURIComponent(peca.capa.url.slice(1));
    if (!caminhoDoAcervo(capaRel)) throw new ErroMarketing('anterior-indisponivel', 'Capa anterior nao comprovada.', 409);
    const capa = Buffer.from(git(['show', `${ref}:${capaRel}`], 64 * 1024 * 1024));
    alvo = versaoComposta(shas, crypto.createHash('sha1').update(capa).digest('hex'), legenda);
  }
  if (alvo !== pedido.versaoAlvo) throw new ErroMarketing('anterior-divergente', 'O commit pai nao corresponde a versao pedida.', 409);
  return { conteudo: ler(path.join(raiz, rel)), mime: protegido.mime, extras: protegido.extras || {} };
}

module.exports = {
  ErroMarketing,
  ESTADOS,
  agoraLocalIso,
  hojeLocal,
  caminhoPainel,
  linkDoIndice,
  lerJson,
  gravarJsonAtomico,
  serializar,
  dataValida,
  textoCurto,
  listarSemanas,
  montarCatalogo,
  enriquecer,
  listarPecas,
  listar: listarPecas,
  pecas: listarPecas,
  obterPeca,
  feed,
  documento,
  familia,
  agruparFamilias,
  lerRegistroFamilias,
  exigirVigente,
  exigirItemAutonomo,
  EVIDENCIAS_AUTOR,
  EVIDENCIA_DERIVADA,
  DERIVACOES_AUTORIZADAS,
  aceiteValido,
  versaoDeArquivos,
  versaoComposta,
  lerAnterior,
  caminhoSeguro,
};
