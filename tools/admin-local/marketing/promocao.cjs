'use strict';
// Promoção local autorizada: não aprova uma versão, não publica e não chama Meta.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const c = require('./catalogo.cjs');
const { aceiteValido } = require('./aceite-evidencia.cjs');
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
      const trocarLink = (de, para) => {
        // Preserve links legados literais e o codec usado pelo vínculo novo.
        texto = texto.split(`](${de})`).join(`](${para})`);
        const encoded = c.linkDoIndice(de);
        if (encoded !== de) texto = texto.split(`](${encoded})`).join(`](${c.linkDoIndice(para)})`);
      };
      for (const a of registro.arquivosPromovidos) {
        trocarLink(a.origem.slice(base.length), a.destino.slice(base.length));
      }
      // Carrossel usa link da pasta no INDICE; preserve a coluna/token da linha.
      if (registro.arquivosPromovidos.length > 1) {
        const de = path.posix.dirname(registro.origem.caminho).slice(base.length);
        const para = de.replace('/para-aprovacao/', '/aprovados/').replace(/^para-aprovacao\//, 'aprovados/');
        trocarLink(de + '/', para + '/'); trocarLink(de, para);
      }
      const marcador = `<!-- promocao:${registro.id}:${registro.versao} -->`;
      if (!texto.includes(marcador)) texto = texto.trimEnd() + `\n\n${marcador}\n- Promoção ${registro.promovidoEm}: [peça em aprovados](${registro.arquivosPromovidos[0].destino.slice(base.length)}); aceite do autor em ${registro.aprovadoEm}, versão \`${registro.versao}\`. Origem \`${registro.origem.caminho}\`. Nada publicado ou agendado.\n`;
      const tmp = `${indice}.${crypto.randomUUID()}.tmp`; io.writeFileSync(tmp, texto, 'utf8'); io.renameSync(tmp, indice);
      registro.indice = path.relative(raiz, indice).split(path.sep).join('/');
      c.gravarJsonAtomico(c.caminhoPainel(raiz, 'aprovacoes.json'), dados);
      const relida = c.lerJson(c.caminhoPainel(raiz, 'aprovacoes.json'), {}).aprovacoes?.find((a) => a.id === registro.id && a.versao === registro.versao);
      if (!relida || JSON.stringify(relida) !== JSON.stringify(registro)) throw new Error('indice-sem-prova');
    } catch { registro.indice = null; log('promocao-indice-pendente'); avisos.push('Evidência salva no JSON; origem preservada. Confira a linha e os links do índice semanal e retome a promoção.'); }
  }
  return function promover(raiz, id, corpo = {}) {
    return c.serializar(raiz, () => {
      if (corpo.confirmacao !== true) throw new c.ErroMarketing('confirmacao-invalida', 'Confirme a promoção.', 400);
      if (!/^[a-f0-9]{16}$/.test(id) || !/^[a-f0-9]{40}$/.test(corpo.versao)) throw new c.ErroMarketing('versao-invalida', 'Informe a peça e a versão atual.', 400);
      const arq = c.caminhoPainel(raiz, 'aprovacoes.json');
      const dados = c.lerJson(arq, { formato: 1, aprovacoes: [], ajustes: [] });
      if (!Array.isArray(dados.aprovacoes)) throw new c.ErroMarketing('aceites-invalidos', 'Confira os registros de aceite.', 409);
      const pecas = c.montarCatalogo(raiz);
      const anterior = dados.aprovacoes.find((a) => a.origem?.id === id && a.versao === corpo.versao);
      if (anterior) {
        const p = pecas.find((v) => v.id === anterior.id);
        if (p) require('./legenda-publicacao.cjs').exigirLegenda(p);
        if (!p || p.estado !== 'aprovados' || !aceiteValido(anterior, p, Date.now(), dados.aprovacoes)) throw new c.ErroMarketing('promocao-desatualizada', 'A peça promovida mudou; confira a versão.', 409);
        // Retomada não contorna a supersessão nem a recusa (H-01): confere a revisão atual do destino
        // antes de índice, limpeza de origem ou sincronização do calendário.
        c.exigirVigente(c.obterPeca(raiz, p.id), 'A promoção');
        c.exigirItemAutonomo(p, 'A promoção');
        if (!PREFIXO.test(anterior.origem.caminho) || !Array.isArray(anterior.arquivosPromovidos) || anterior.arquivosPromovidos.length !== p.arquivos.length) throw new c.ErroMarketing('prova-invalida', 'Confira a prova da promoção antes de retomar.', 409);
        const arquivos = anterior.arquivosPromovidos.map((a, i) => {
          const origem = path.posix.join(path.posix.dirname(anterior.origem.caminho), p.arquivos[i].nome);
          if (a.origem !== origem || a.destino !== origem.replace('/para-aprovacao/', '/aprovados/') || a.sha1 !== p.arquivos[i].sha1) throw new c.ErroMarketing('prova-invalida', 'Confira os arquivos da promoção antes de retomar.', 409);
          const para = seguro(raiz, a.destino);
          if (sha(para) !== a.sha1) throw new c.ErroMarketing('prova-invalida', 'O destino mudou; preserve a origem e confira a promoção.', 409);
          return { de: seguro(raiz, origem), sha1: a.sha1 };
        });
        const avisos = [];
        if (!anterior.indice) indicePromocao(raiz, anterior, dados, avisos);
        if (anterior.indice) avisos.push(...limparOrigem(arquivos));
        const calendario = require('./cronograma.cjs').sincronizarComAviso(raiz, avisos, 'Promoção registrada');
        return { promocao: anterior, jaExistia: true, calendario, avisos };
      }
      const p = pecas.find((v) => v.id === id);
      if (!p) throw new c.ErroMarketing('peca-inexistente', 'Peça não encontrada no acervo.', 404);
      if (p.versao !== corpo.versao) throw new c.ErroMarketing('versao-mudou', 'A peça mudou; revise e aprove a versão atual.', 409);
      c.exigirVigente(c.obterPeca(raiz, p.id), 'A promoção');
      c.exigirItemAutonomo(p, 'A promoção');
      require('./legenda-publicacao.cjs').exigirLegenda(p);
      if (p.estado !== 'para-aprovacao' || !PREFIXO.test(p.caminho)) throw new c.ErroMarketing('pasta-invalida', 'Só peça de para-aprovacao pode ser promovida.', 409);
      // A promoção move só o vídeo. Capa pareada pelo nome ficaria para trás e o aceite composto
      // deixaria de valer: o vínculo precisa estar no registro de famílias, que sobrevive à troca de pasta.
      if (p.composicao && !pecas.find((v) => v.id === p.capa.pecaId)?.vinculoCapa) throw new c.ErroMarketing('capa-sem-registro', 'Este Reel tem capa ligada só pelo nome do arquivo. Registre o vínculo da capa no registro de famílias antes de promover.', 409);
      const aceite = dados.aprovacoes.find((a) => aceiteValido(a, p, Date.now(), dados.aprovacoes));
      if (!aceite) throw new c.ErroMarketing('sem-aceite', 'A versão precisa do aceite datado do autor antes da promoção.', 409);
      // A fila usa ID físico. Pedido aberto bloqueia a mudança de caminho: não o deixar órfão.
      let pedidos, estadoTerminal;
      try {
        const fila = require('./ajustes-fila.cjs');
        pedidos = fila.fila.listar(); estadoTerminal = fila.estadoTerminal;
      }
      catch { log('promocao-fila-indisponivel'); throw new c.ErroMarketing('fila-indisponivel', 'Confira a fila de ajustes antes de promover.', 503); }
      if (pedidos.some((r) => r.pecaId === p.id && !estadoTerminal(r.estado)) ||
        (dados.ajustes || []).some((r) => r.id === p.id && r.versao === p.versao && typeof r.estado === 'string' && !estadoTerminal(r.estado)) /* legado sem estado é histórico (18/10) */) {
        throw new c.ErroMarketing('ajuste-aberto', 'Há pedido de ajuste aberto. Conclua ou confira o pedido antes de promover a peça.', 409);
      }
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
          // Staging em diretório exclusivo: bytes parciais/divergentes nunca
          // entram no catálogo. Só a cópia conferida ocupa o destino, sem overwrite.
          const pasta = io.mkdtempSync(path.join(path.dirname(a.para), '.promocao-'));
          const tmp = path.join(pasta, 'copia.tmp');
          try {
            io.copyFileSync(a.de, tmp, fs.constants.COPYFILE_EXCL);
            if (sha(tmp) !== a.sha1) throw new Error('copia-divergente');
            io.linkSync(tmp, a.para); copiados.push(a);
          } finally {
            try { if (io.existsSync(tmp)) io.unlinkSync(tmp); io.rmdirSync(pasta); }
            catch { log('promocao-temporario-pendente'); }
          }
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
        if (!relida || !aceiteValido(relida, nova, Date.now(), dados.aprovacoes) || JSON.stringify(relida) !== JSON.stringify(registro)) throw new Error('prova-nao-confirmada');
        const avisos = [];
        indicePromocao(raiz, registro, dados, avisos);
        if (registro.indice) avisos.push(...limparOrigem(arquivos));
        const calendario = require('./cronograma.cjs').sincronizarComAviso(raiz, avisos, 'Promoção registrada');
        return { promocao: registro, jaExistia: false, calendario, avisos };
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
module.exports = { promover: criarPromocao(), criarPromocao };
