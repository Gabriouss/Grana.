'use strict';
// Recusa local: copia verificada + prova persistida antes da remocao da origem.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const c = require('./catalogo.cjs');
const TERMINAIS = new Set(['aceito', 'desatualizado', 'encerrado', 'recusado-pelo-autor']);
// Registro de ajuste de antes da fila (07/10) não tem estado: é histórico, não pedido aberto (autor, 18/10).
const legadoAberto = (r) => typeof r.estado === 'string' && !TERMINAIS.has(r.estado);
const PREFIXO = /^docs\/marketing\/\d{4}-\d{2}\/semana-\d{2}-\d{4}-\d{2}-\d{2}-a-\d{4}-\d{2}-\d{2}\/(para-aprovacao|aprovados)\//;
function criarHistorico(io = fs, log = (codigo) => console.error(JSON.stringify({ codigo })), editorialInjetado) {
  const seguro = (raiz, rel) => c.caminhoSeguro(raiz, rel, io);
  const sha = (abs) => crypto.createHash('sha1').update(io.readFileSync(abs)).digest('hex');
  function gravar(arq, dados) {
    io.mkdirSync(path.dirname(arq), { recursive: true });
    const tmp = arq + '.' + crypto.randomUUID() + '.tmp';
    try { io.writeFileSync(tmp, JSON.stringify(dados, null, 2) + '\n', 'utf8'); io.renameSync(tmp, arq); }
    finally { if (io.existsSync(tmp)) io.unlinkSync(tmp); }
  }
  function finalizar(raiz, registro, dados, arq) {
    const avisos = [];
    if (!registro.indice) {
      try {
        const base = registro.origem.caminho.split('/').slice(0, 4).join('/') + '/';
        const indice = seguro(raiz, base + 'INDICE.md');
        let texto = io.readFileSync(indice, 'utf8');
        const marcador = `<!-- recusa:${registro.origem.id}:${registro.versao} -->`;
        if (!texto.includes(marcador)) texto = texto.trimEnd() + `\n\n${marcador}\n- Recusa do autor em ${registro.recusadoEm}: [peca em historico](${registro.arquivos[0].destino.slice(base.length)}). Motivo registrado no painel; nada publicado ou agendado.\n`;
        const tmp = indice + '.' + crypto.randomUUID() + '.tmp';
        try { io.writeFileSync(tmp, texto, 'utf8'); io.renameSync(tmp, indice); }
        finally { if (io.existsSync(tmp)) io.unlinkSync(tmp); }
        registro.indice = base + 'INDICE.md'; gravar(arq, dados);
      } catch { registro.indice = null; log('recusa-indice-pendente'); avisos.push('Recusa registrada; indice pendente. A origem foi preservada.'); }
    }
    if (registro.indice) {
      let pendente = false;
      for (const a of registro.arquivos) {
        const de = seguro(raiz, a.origem), para = seguro(raiz, a.destino);
        // Recheck destination and original immediately before each removal.
        if (!io.existsSync(para) || sha(para) !== a.sha1) throw new c.ErroMarketing('prova-invalida', 'Confira os arquivos preservados no historico.', 409);
        try { if (io.existsSync(de)) { if (sha(de) !== a.sha1) pendente = true; else io.unlinkSync(de); } }
        catch { pendente = true; }
      }
      if (pendente) { log('recusa-limpeza-pendente'); avisos.push('Recusa registrada; copia de origem pendente de conferencia.'); }
    }
    return { recusa: registro, avisos: [...avisos, 'Nada foi publicado ou agendado.'] };
  }
  // A capa pareada por nome é componente do Reel: recusar o Reel leva a capa junto, senão ela fica
  // sozinha em aprovados e aparece como próxima no Feed (19/10). Falha na capa não desfaz o Reel.
  function levarCapas(raiz, caminhos, motivo, resultado) {
    const capas = [], avisos = [];
    for (const caminho of caminhos) {
      const capa = c.montarCatalogo(raiz).find((x) => x.caminho === caminho);
      const nome = caminho.split('/').pop();
      try {
        if (!capa) throw new c.ErroMarketing('peca-inexistente', 'Capa não encontrada.', 404);
        const r = recusarUma(raiz, capa.id, { confirmacao: true, motivo, versao: capa.versao });
        capas.push({ id: r.recusa.id, caminho: r.recusa.caminho });
        avisos.push(`A capa ${nome} foi junto para o histórico.`);
      } catch (e) {
        log('recusa-capa-pendente');
        avisos.push(`A capa ${nome} ficou onde estava (${e.codigo || 'recusa-falhou'}). Recuse a capa à parte.`);
      }
    }
    return { ...resultado, capas, avisos: [...avisos, ...resultado.avisos] };
  }
  async function recusar(raiz, id, corpo = {}) {
    const editorial = editorialInjetado || require('./editorial-publicacao.cjs');
    if (editorial.ativo(raiz, { id })) {
      if (corpo.confirmacao !== true) throw new c.ErroMarketing('confirmacao-invalida', 'Confirme a recusa para continuar.', 400);
      if (typeof corpo.motivo !== 'string' || !corpo.motivo.trim() || [...corpo.motivo.trim()].length > 500) throw new c.ErroMarketing('motivo-invalido', 'Informe motivo de 1 a 500 caracteres.', 400);
      const p = c.montarCatalogo(raiz).find(x => x.id === id);
      if (p) {
        if (p.versao !== corpo.versao) throw new c.ErroMarketing('versao-mudou', 'A peca mudou; recarregue antes de recusar.', 409);
        await editorial.iniciarRevisao(raiz, c.obterPeca(raiz, id), 'recusa');
      }
    }
    return c.serializar(raiz, () => {
      const catalogo = c.montarCatalogo(raiz);
      const capas = catalogo.some((p) => p.id === id && p.estado !== 'historico')
        ? catalogo.filter((p) => p.capaDe === id && p.estado !== 'historico' && PREFIXO.test(p.caminho)).map((p) => p.caminho) : [];
      const r = recusarUma(raiz, id, corpo);
      return capas.length ? levarCapas(raiz, capas, corpo.motivo.trim(), r) : r;
    });
  }
  return recusar;
  function recusarUma(raiz, id, corpo = {}) {
    {
      if (corpo.confirmacao !== true) throw new c.ErroMarketing('confirmacao-invalida', 'Confirme a recusa para continuar.', 400);
      if (typeof corpo.motivo !== 'string' || !corpo.motivo.trim() || [...corpo.motivo.trim()].length > 500) throw new c.ErroMarketing('motivo-invalido', 'Informe motivo de 1 a 500 caracteres.', 400);
      if (!/^[0-9a-f]{16}$/.test(id || '') || !/^[0-9a-f]{40}$/.test(corpo.versao || '')) throw new c.ErroMarketing('versao-invalida', 'Peca ou versao invalida.', 400);
      const arq = seguro(raiz, 'docs/marketing/painel/historico.json');
      const dados = c.lerJson(arq, { recusas: [] });
      if (!Array.isArray(dados.recusas)) throw new c.ErroMarketing('historico-invalido', 'Confira o registro de recusas.', 503);
      const pecas = c.montarCatalogo(raiz);
      // Retomadas tambem podem remover originais: consultar a fila antes de
      // qualquer ramo de finalizacao, mesmo com prova ja persistida.
      let pedidos;
      try {
        pedidos = require('./ajustes-fila.cjs').fila.listar();
        if (!Array.isArray(pedidos) || pedidos.some((r) => !r || typeof r !== 'object')) throw new Error('fila-invalida');
      } catch { throw new c.ErroMarketing('fila-indisponivel', 'Confira a fila antes de recusar a peca.', 503); }
      const aprov = c.lerJson(seguro(raiz, 'docs/marketing/painel/aprovacoes.json'), { ajustes: [] });
      if (pedidos.some((r) => r.pecaId === id && !TERMINAIS.has(r.estado))
        || (aprov.ajustes || []).some((r) => r.id === id && legadoAberto(r))) throw new c.ErroMarketing('ajuste-aberto', 'Conclua o pedido aberto antes de recusar a peca.', 409);
      const anterior = dados.recusas.find((r) => r.origem?.id === id && r.versao === corpo.versao);
      if (anterior) {
        const destino = pecas.find((p) => p.id === anterior.id && p.estado === 'historico' && p.versao === anterior.versao);
        if (!destino || !Array.isArray(anterior.arquivos) || anterior.arquivos.length !== destino.arquivos.length
          || anterior.origem.caminho !== pecas.find((p) => p.id === id)?.caminho && pecas.some((p) => p.id === id)) throw new c.ErroMarketing('prova-invalida', 'Recusa anterior nao confere com o acervo.', 409);
        for (const [i, a] of anterior.arquivos.entries()) {
          const esperado = path.posix.join(path.posix.dirname(anterior.origem.caminho), destino.arquivos[i].nome);
          if (!PREFIXO.test(anterior.origem.caminho) || a.origem !== esperado || a.destino !== esperado.replace(/\/(para-aprovacao|aprovados)\//, '/historico/') || a.sha1 !== destino.arquivos[i].sha1) throw new c.ErroMarketing('prova-invalida', 'Arquivos da recusa anterior nao conferem.', 409);
        }
        return { ...finalizar(raiz, anterior, dados, arq), jaExistia: true };
      }
      const p = pecas.find((p) => p.id === id);
      if (!p) throw new c.ErroMarketing('peca-inexistente', 'Peca nao encontrada.', 404);
      if (p.estado === 'historico') {
        const r = c.recusaDaPeca(dados.recusas, p);
        const hora = /T(\d{2}:\d{2})/.exec(r?.recusadoEm || '')?.[1];
        throw new c.ErroMarketing('pasta-invalida', `Esta peça já está no histórico${hora ? ` (recusada às ${hora})` : ''}. Não há nada a fazer.`, 409);
      }
      if (!PREFIXO.test(p.caminho)) throw new c.ErroMarketing('pasta-invalida', 'Esta peça está fora das pastas de uma semana e não pode ser recusada pelo painel.', 409);
      if (p.versao !== corpo.versao) throw new c.ErroMarketing('versao-mudou', 'A peca mudou; recarregue antes de recusar.', 409);
      const sucessora = corpo.sucessora == null || corpo.sucessora === '' ? null : corpo.sucessora;
      if (sucessora) {
        const s = pecas.find((p) => p.id === sucessora);
        if (!s || s.id === p.id || s.estado === 'historico' || s.familia !== p.familia) throw new c.ErroMarketing('sucessora-invalida', 'Escolha outra peca da mesma familia.', 400);
      }
      const arquivos = p.arquivos.map((a) => {
        const origem = path.posix.join(path.posix.dirname(p.caminho), a.nome), destino = origem.replace(/\/(para-aprovacao|aprovados)\//, '/historico/');
        const de = seguro(raiz, origem), para = seguro(raiz, destino);
        if (!io.lstatSync(de).isFile() || io.existsSync(para)) throw new c.ErroMarketing('destino-existente', 'Arquivo de origem ou destino precisa ser conferido.', 409);
        if (sha(de) !== a.sha1) throw new c.ErroMarketing('versao-mudou', 'A origem mudou; recarregue.', 409);
        return { origem, destino, sha1: a.sha1, de, para };
      });
      if (!arquivos.length) throw new c.ErroMarketing('sem-arquivos', 'Peca sem arquivos.', 409);
      const copiados = []; let persistido = false;
      try {
        for (const a of arquivos) {
          io.mkdirSync(path.dirname(a.para), { recursive: true });
          // Uma copia parcial nunca ocupa o destino do acervo. O diretorio
          // exclusivo pertence a esta tentativa; .tmp nao entra no catalogo.
          const pasta = io.mkdtempSync(path.join(path.dirname(a.para), '.recusa-'));
          const tmp = path.join(pasta, 'copia.tmp');
          try {
            io.copyFileSync(a.de, tmp, fs.constants.COPYFILE_EXCL);
            if (sha(tmp) !== a.sha1) throw new Error('copia-divergente');
            // Hard link publica os bytes conferidos sem substituir destino
            // criado por outro processo entre a validacao e esta etapa.
            io.linkSync(tmp, a.para);
            copiados.push(a);
          } finally {
            try { if (io.existsSync(tmp)) io.unlinkSync(tmp); io.rmdirSync(pasta); }
            catch { log('recusa-temporario-pendente'); }
          }
        }
        const caminho = p.caminho.replace(/\/(para-aprovacao|aprovados)\//, '/historico/');
        const nova = c.montarCatalogo(raiz).find((p) => p.caminho === caminho);
        // Compara os arquivos movidos; a versão composta do Reel muda se a capa pareada por nome ficou para trás.
        if (!nova || nova.versaoArquivos !== p.versaoArquivos) throw new Error('destino-divergente');
        const registro = { id: nova.id, caminho: nova.caminho, versao: nova.versao, motivo: corpo.motivo.trim(), sucessora,
          recusadoEm: c.agoraLocalIso(), evidencia: 'recusa pelo autor no painel local', origem: { id: p.id, caminho: p.caminho, versao: p.versao },
          arquivos: arquivos.map(({ origem, destino, sha1 }) => ({ origem, destino, sha1 })), indice: null };
        dados.recusas.push(registro); gravar(arq, dados); persistido = true;
        const relida = c.lerJson(arq, {}).recusas?.find((r) => r.id === registro.id && r.versao === registro.versao);
        if (!relida || JSON.stringify(relida) !== JSON.stringify(registro)) throw new Error('prova-nao-confirmada');
        return { ...finalizar(raiz, registro, dados, arq), jaExistia: false };
      } catch (e) {
        if (!persistido) for (const a of copiados) { try { if (sha(a.para) === a.sha1) io.unlinkSync(a.para); } catch { log('recusa-copia-pendente'); } }
        log('recusa-falhou');
        if (e instanceof c.ErroMarketing) throw e;
        throw new c.ErroMarketing('recusa-falhou', 'A recusa nao foi concluida; originais preservados para conferencia.', 503);
      }
    }
  }
}
module.exports = { recusar: criarHistorico(), criarHistorico };
