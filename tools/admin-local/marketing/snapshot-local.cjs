'use strict';
// Captura bytes aprovados antes de qualquer upload. Nunca recebe paths do browser.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const catalogo = require('./catalogo.cjs');
const { MAX_ARQUIVO, MAX_TOTAL, detectarMime } = require('./previa-conteudo.cjs');
const hash = texto => crypto.createHash('sha256').update(texto).digest('hex');
const falhar = (codigo, status = 409) => { throw new catalogo.ErroMarketing(codigo, 'Confira o aceite, a versão e as mídias da peça antes de continuar.', status); };

// Predicado único de "peça agendável": o catálogo do agendamento real, a miniatura e a
// captura usam o mesmo. null = aceite datado do autor válido para esta versão.
function motivoSemAceite(raiz, q, agora = Date.now()) {
  if (!q?.aprovada || q.recusada || q.revisao?.superada || q.revisao?.pendencia) return 'sem-aceite';
  // Pasta "aprovados" sozinha não inventa registro datado do autor.
  const aceites = q.aceite?.evidencia === catalogo.EVIDENCIA_DERIVADA
    ? catalogo.lerJson(catalogo.caminhoPainel(raiz, 'aprovacoes.json'), { aprovacoes: [] }).aprovacoes : null;
  if (!q.aceite || !catalogo.aceiteValido(q.aceite, q, agora, aceites)) return 'aceite-nao-sincronizado';
  return null;
}

function criarCapturador({ obterPeca = catalogo.obterPeca, pastaTemporaria = os.tmpdir() } = {}) {
  let ativos = 0;
  const limpar = async pasta => {
    const destino = path.resolve(pasta), base = path.resolve(pastaTemporaria);
    if (path.dirname(destino) !== base || !path.basename(destino).startsWith('grana-snapshot-')) throw new Error('captura-limpeza-invalida');
    await fs.promises.rm(destino, { recursive: true, force: true });
  };
  return async function capturar(raiz, pecaId, versao, { signal, jpeg = false } = {}) {
    if (ativos >= 2) falhar('captura-ocupada', 429);
    ativos++;
    let pasta;
    const controller = new AbortController();
    const abortar = () => controller.abort();
    signal?.addEventListener('abort', abortar, { once: true });
    if (signal?.aborted) abortar();
    const timer = setTimeout(abortar, 30000);
    try {
      const p = await obterPeca(raiz, pecaId);
      const evidencia = q => {
        const motivo = motivoSemAceite(raiz, q);
        if (motivo === 'sem-aceite') falhar(motivo);
        if (q.id !== pecaId || q.versao !== versao) falhar('versao-divergente');
        if (motivo) falhar(motivo);
        catalogo.exigirItemAutonomo(q, 'O agendamento');
        return hash(JSON.stringify(q.aceite));
      };
      const aceiteSha256 = evidencia(p);
      if (!Array.isArray(p.arquivos) || p.arquivos.length < 1 || p.arquivos.length > 10
        || typeof p.legenda !== 'string' || !p.legenda.trim() || Buffer.byteLength(p.legenda) > 64000) falhar('midia-invalida', 415);
      pasta = await fs.promises.mkdtemp(path.join(pastaTemporaria, 'grana-snapshot-'));
      const fisica = await fs.promises.realpath(pasta);
      let total = 0;
      const ler = async (a, indice) => {
        const rel = typeof a.url === 'string' && a.url.startsWith('/') ? decodeURIComponent(a.url.slice(1)) : '';
        if (!/^docs\/marketing\/\d{4}-\d{2}\/semana-[^/]+\/(?:para-aprovacao|aprovados|historico)\//.test(rel)) falhar('midia-invalida', 415);
        const origem = catalogo.caminhoSeguro(raiz, rel);
        const entrada = await fs.promises.open(origem, 'r');
        try {
          const stat = await entrada.stat();
          if (!stat.isFile() || stat.size < 1 || stat.size > MAX_ARQUIVO || (total += stat.size) > MAX_TOTAL) falhar('midia-grande', 413);
          const sha1 = crypto.createHash('sha1'), sha256 = crypto.createHash('sha256');
          let bytes = 0, inicio = Buffer.alloc(0);
          const medir = new Transform({ transform(parte, _, cb) {
            bytes += parte.length;
            if (bytes > stat.size || bytes > MAX_ARQUIVO) return cb(new Error('tamanho-divergente'));
            sha1.update(parte); sha256.update(parte);
            if (inicio.length < 12) inicio = Buffer.concat([inicio, parte.subarray(0, 12 - inicio.length)]);
            cb(null, parte);
          } });
          const arquivo = path.join(fisica, String(indice));
          await pipeline(entrada.createReadStream({ autoClose: false, highWaterMark: 128 * 1024 }), medir,
            fs.createWriteStream(arquivo, { flags: 'wx', mode: 0o600 }), { signal: controller.signal });
          let mime = detectarMime(inicio);
          if (bytes !== stat.size || sha1.digest('hex') !== a.sha1) falhar('versao-divergente');
          if (!mime || (indice === 'capa' ? !mime.startsWith('image/') : (mime.startsWith('video/') ? 'video' : 'imagem') !== a.tipo)) falhar('midia-invalida', 415);
          let digest = sha256.digest('hex'), dimensoes = {};
          if (jpeg && mime === 'image/png') {
            // Derivado de transporte: a identidade/aceite continuam sendo dos originais.
            // A prévia e o upload usam os MESMOS bytes JPEG, com hash próprio.
            if (controller.signal.aborted) falhar('prazo-esgotado', 504);
            let imagem;
            try { imagem = await require('jimp-compact').read(arquivo); }
            catch { falhar('midia-invalida', 415); }
            dimensoes = { largura: imagem.bitmap.width, altura: imagem.bitmap.height };
            const convertido = await imagem.background(0xffffffff).quality(95).getBufferAsync('image/jpeg');
            if (controller.signal.aborted) falhar('prazo-esgotado', 504);
            total += convertido.length - bytes;
            if (convertido.length > MAX_ARQUIVO || total > MAX_TOTAL) falhar('midia-grande', 413);
            await fs.promises.writeFile(arquivo, convertido, { mode: 0o600 });
            digest = hash(convertido); bytes = convertido.length; mime = 'image/jpeg';
          }
          return { indice, arquivo, sha256: digest, mime, bytes, ...dimensoes, ...(indice === 'capa' ? {} : { ordem: indice, tipo: a.tipo }) };
        } finally { await entrada.close(); }
      };
      const midias = [];
      for (let i = 0; i < p.arquivos.length; i++) midias.push(await ler(p.arquivos[i], i));
      const capa = p.capa ? await ler(p.capa, 'capa') : null;
      const conferir = async () => {
        if (controller.signal.aborted) falhar('prazo-esgotado', 504);
        if (evidencia(await obterPeca(raiz, pecaId)) !== aceiteSha256) falhar('versao-divergente');
      };
      await conferir();
      const pastaPronta = pasta;
      // Manifesto não inclui paths temporários nem URL; ordem e capa são explícitas.
      const publico = ({ arquivo, indice, ...m }) => m;
      const manifesto = { legenda: p.legenda, legendaSha256: hash(p.legenda),
        midias: midias.map(publico), capa: capa ? publico(capa) : null };
      return { pecaId, versao, titulo: p.titulo, aceite: structuredClone(p.aceite), aceiteSha256,
        manifesto, midias, capa, conferir,
        abrir: indice => {
          const m = indice === 'capa' ? capa : midias[indice];
          if (!m) falhar('midia-inexistente', 404);
          return fs.createReadStream(m.arquivo, { highWaterMark: 128 * 1024 });
        },
        fechar: () => limpar(pastaPronta) };
    } catch (e) {
      if (pasta) await limpar(pasta);
      if (e instanceof catalogo.ErroMarketing) throw e;
      // Falhas de filesystem/stream não expõem paths, legenda ou valores de configuração.
      falhar(controller.signal.aborted ? 'prazo-esgotado' : 'captura-indisponivel', controller.signal.aborted ? 504 : 503);
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abortar); ativos--;
    }
  };
}
module.exports = { criarCapturador, motivoSemAceite };
