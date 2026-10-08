'use strict';
// Promoção local autorizada: não aprova uma versão, não publica e não chama Meta.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const c = require('./catalogo.cjs');
const { aceiteValido } = require('./aceite-evidencia.cjs');
const FRASE = 'PROMOVER PARA APROVADOS';
const PREFIXO = /^docs\/marketing\/\d{4}-\d{2}\/semana-\d{2}-\d{4}-\d{2}-\d{2}-a-\d{4}-\d{2}-\d{2}\/para-aprovacao\//;

function criarPromocao(io = fs, log = (codigo) => console.error(JSON.stringify({ codigo }))) {
  function sha(abs) { return crypto.createHash('sha1').update(io.readFileSync(abs)).digest('hex'); }
  function seguro(raiz, rel) {
    const abs = path.resolve(raiz, rel), root = path.resolve(raiz);
    if (!abs.startsWith(root + path.sep)) throw new c.ErroMarketing('caminho-invalido', 'O arquivo precisa ficar no acervo.', 409);
    // Não seguir links no destino, mesmo que o link aponte para dentro do acervo.
    for (let cur = abs; cur !== root; cur = path.dirname(cur)) {
      if (io.existsSync(cur) && io.lstatSync(cur).isSymbolicLink()) throw new c.ErroMarketing('caminho-invalido', 'O acervo não pode usar links simbólicos.', 409);
    }
    return abs;
  }
  function limparOrigem(arquivos) {
    let pendente = false;
    for (const a of arquivos) {
      try {
        if (io.existsSync(a.de)) {
          if (sha(a.de) !== a.sha1) { pendente = true; continue; }
          io.unlinkSync(a.de);
        }
      } catch { pendente = true; }
    }
    if (pendente) log('promocao-limpeza-pendente');
    return pendente ? ['Promoção registrada; há cópia de origem a conferir. Nada foi publicado ou agendado.'] : ['Promoção registrada. Nada foi publicado ou agendado.'];
  }
  function indicePromocao(raiz, registro, dados, avisos) {
    try {
      const base = registro.origem.caminho.split('/').slice(0, 4).join('/') + '/';
      const indice = seguro(raiz, base + 'INDICE.md');
      let texto = io.readFileSync(indice, 'utf8');
      for (const a of registro.arquivosPromovidos) {
        texto = texto.split(`](${a.origem.slice(base.length)})`).join(`](${a.destino.slice(base.length)})`);
      }
      const marcador = `<!-- promocao:${registro.id}:${registro.versao} -->`;
      if (!texto.includes(marcador)) texto = texto.trimEnd() + `\n\n${marcador}\n- Promoção ${registro.promovidoEm}: [peça em aprovados](${registro.arquivosPromovidos[0].destino.slice(base.length)}); aceite do autor em ${registro.aprovadoEm}, versão \`${registro.versao}\`. Origem \`${registro.origem.caminho}\`. Nada publicado ou agendado.\n`;
      const tmp = `${indice}.${crypto.randomUUID()}.tmp`; io.writeFileSync(tmp, texto, 'utf8'); io.renameSync(tmp, indice);
      registro.indice = path.relative(raiz, indice).split(path.sep).join('/');
      c.gravarJsonAtomico(c.caminhoPainel(raiz, 'aprovacoes.json'), dados);
    } catch { log('promocao-indice-pendente'); avisos.push('Evidência salva no JSON; confira a linha e os links do índice semanal.'); }
  }
  return function promover(raiz, id, corpo = {}) {
    return c.serializar(() => {
      if (corpo.confirmacao !== FRASE) throw new c.ErroMarketing('confirmacao-invalida', `Digite ${FRASE}.`, 400);
      if (!/^[a-f0-9]{16}$/.test(id) || !/^[a-f0-9]{40}$/.test(corpo.versao)) throw new c.ErroMarketing('versao-invalida', 'Informe a peça e a versão atual.', 400);
      const arq = c.caminhoPainel(raiz, 'aprovacoes.json');
      const dados = c.lerJson(arq, { formato: 1, aprovacoes: [], ajustes: [] });
      if (!Array.isArray(dados.aprovacoes)) throw new c.ErroMarketing('aceites-invalidos', 'Confira os registros de aceite.', 409);
      const pecas = c.montarCatalogo(raiz);
      const anterior = dados.aprovacoes.find((a) => a.origem?.id === id && a.versao === corpo.versao);
      if (anterior) {
        const p = pecas.find((v) => v.id === anterior.id);
        if (!p || p.estado !== 'aprovados' || !aceiteValido(anterior, p)) throw new c.ErroMarketing('promocao-desatualizada', 'A peça promovida mudou; confira a versão.', 409);
        if (!PREFIXO.test(anterior.origem.caminho) || !Array.isArray(anterior.arquivosPromovidos) || anterior.arquivosPromovidos.length !== p.arquivos.length) throw new c.ErroMarketing('prova-invalida', 'Confira a prova da promoção antes de retomar.', 409);
        const arquivos = anterior.arquivosPromovidos.map((a, i) => {
          const origem = path.posix.join(path.posix.dirname(anterior.origem.caminho), p.arquivos[i].nome);
          if (a.origem !== origem || a.destino !== origem.replace('/para-aprovacao/', '/aprovados/') || a.sha1 !== p.arquivos[i].sha1) throw new c.ErroMarketing('prova-invalida', 'Confira os arquivos da promoção antes de retomar.', 409);
          return { de: seguro(raiz, origem), sha1: a.sha1 };
        });
        const avisos = limparOrigem(arquivos);
        if (!anterior.indice) indicePromocao(raiz, anterior, dados, avisos);
        return { promocao: anterior, jaExistia: true, avisos };
      }
      const p = pecas.find((v) => v.id === id);
      if (!p) throw new c.ErroMarketing('peca-inexistente', 'Peça não encontrada no acervo.', 404);
      if (p.versao !== corpo.versao) throw new c.ErroMarketing('versao-mudou', 'A peça mudou; revise e aprove a versão atual.', 409);
      if (p.estado !== 'para-aprovacao' || !PREFIXO.test(p.caminho)) throw new c.ErroMarketing('pasta-invalida', 'Só peça de para-aprovacao pode ser promovida.', 409);
      const aceite = dados.aprovacoes.find((a) => aceiteValido(a, p));
      if (!aceite) throw new c.ErroMarketing('sem-aceite', 'A versão precisa do aceite datado do autor antes da promoção.', 409);
      const novoCaminho = p.caminho.replace('/para-aprovacao/', '/aprovados/');
      const arquivos = p.arquivos.map((a) => {
        const origem = path.posix.join(path.posix.dirname(p.caminho), a.nome);
        const destino = origem.replace('/para-aprovacao/', '/aprovados/');
        return { origem, destino, sha1: a.sha1, de: seguro(raiz, origem), para: seguro(raiz, destino) };
      });
      if (!arquivos.length) throw new c.ErroMarketing('sem-arquivos', 'A peça não tem arquivos para promover.', 409);
      for (const a of arquivos) {
        if (io.existsSync(a.para)) throw new c.ErroMarketing('destino-existente', 'Já existe arquivo em aprovados; confira antes de promover.', 409);
        if (sha(a.de) !== a.sha1) throw new c.ErroMarketing('versao-mudou', 'A peça mudou; revise a versão atual.', 409);
      }
      const copiados = [];
      let persistido = false;
      try {
        for (const a of arquivos) {
          io.mkdirSync(path.dirname(a.para), { recursive: true });
          io.copyFileSync(a.de, a.para, fs.constants.COPYFILE_EXCL); copiados.push(a);
          if (sha(a.para) !== a.sha1) throw new Error('copia-divergente');
        }
        const nova = c.montarCatalogo(raiz).find((v) => v.caminho === novoCaminho);
        if (!nova || nova.versao !== p.versao) throw new c.ErroMarketing('destino-divergente', 'A composição ou legenda do destino mudou; confira o acervo.', 409);
        // A evidência original fica imutável. O novo registro preserva seu momento e origem.
        const registro = { id: nova.id, caminho: nova.caminho, versao: nova.versao,
          aprovadoEm: aceite.aprovadoEm, evidencia: aceite.evidencia, escopo: aceite.escopo,
          promovidoEm: c.agoraLocalIso(), origem: { id: p.id, caminho: p.caminho, aprovadoEm: aceite.aprovadoEm },
          arquivosPromovidos: arquivos.map(({ origem, destino, sha1 }) => ({ origem, destino, sha1 })),
          indice: null };
        dados.aprovacoes.push(registro);
        // Persistência da prova ANTES de remover qualquer arquivo original.
        c.gravarJsonAtomico(arq, dados); persistido = true;
        const relida = c.lerJson(arq, {}).aprovacoes?.find((a) => a.id === nova.id && a.versao === nova.versao);
        if (!relida || !aceiteValido(relida, nova) || relida.origem?.id !== p.id || relida.origem?.caminho !== p.caminho) throw new Error('prova-nao-confirmada');
        const avisos = limparOrigem(arquivos);
        indicePromocao(raiz, registro, dados, avisos);
        return { promocao: registro, jaExistia: false, avisos };
      } catch (e) {
        if (!persistido) {
          for (const a of copiados) {
            try { if (sha(a.para) === a.sha1) io.unlinkSync(a.para); else log('promocao-copia-pendente'); }
            catch { log('promocao-copia-pendente'); }
          }
        }
        log('promocao-falhou');
        if (e instanceof c.ErroMarketing) throw e;
        throw new c.ErroMarketing('promocao-falhou', 'A promoção falhou. Os arquivos originais foram preservados; confira o acervo antes de repetir.', 503);
      }
    });
  };
}
module.exports = { promover: criarPromocao(), criarPromocao, FRASE };
