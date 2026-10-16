'use strict';
// A prévia só decora um snapshot E5 do servidor. Nunca cria aceite ou manifesto remoto.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const catalogo = require('./catalogo.cjs');
const { carregar } = require('../adaptadores/_contratos-marketing.cjs');
const { validarPeca, identidadeSimulacao } = carregar('supabase/functions/_shared/marketing-simulacao.ts');
const MAX_ARQUIVO = 45 * 1024 * 1024 - 1;
const MAX_TOTAL = 64 * 1024 * 1024;
const HASH = /^[0-9a-f]{64}$/;
const bloqueada = estado => ({ estado, legenda: null, midias: [], capa: null, chave: null, versao: null });
function mime(bytes) {
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg';
  if (bytes.subarray(4,8).toString()==='ftyp') return 'video/mp4';
  return null;
}
function criarResolvedor({ obterPeca = catalogo.obterPeca } = {}) {
  let ativos = 0;
  return async function resolver(raiz, previa, indiceBinario) {
    if (ativos >= 2) return { previaConteudo: bloqueada('midia-indisponivel') };
    ativos++;
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),4000);
    try {
      if (!previa?.peca || !previa.alvo || !HASH.test(previa.chave || '')) return { previaConteudo: bloqueada('sem-conteudo-aprovado') };
      validarPeca(previa.peca);
      if (!previa.peca.aprovado) return { previaConteudo: bloqueada('sem-aceite') };
      if (await identidadeSimulacao(previa.peca,previa.alvo)!==previa.chave) return { previaConteudo: bloqueada('versao-divergente') };
      const p = await obterPeca(raiz,previa.peca.pecaId);
      if (!p?.aprovada || p.recusada || p.revisao?.superada || p.revisao?.pendencia) return { previaConteudo: bloqueada('sem-aceite') };
      if (p.id!==previa.peca.pecaId || p.versao!==previa.peca.versao) return { previaConteudo: bloqueada('versao-divergente') };
      if (typeof p.legenda!=='string' || !p.legenda.trim() || Buffer.byteLength(p.legenda)>64000) return { previaConteudo: bloqueada('legenda-indisponivel') };
      if (crypto.createHash('sha256').update(p.legenda,'utf8').digest('hex')!==previa.peca.manifesto.legendaSha256) return { previaConteudo: bloqueada('versao-divergente') };
      if (!Array.isArray(p.arquivos) || p.arquivos.length!==previa.peca.manifesto.midias.length || (!!p.capa)!==(previa.peca.manifesto.capaSha256!==null)) {
        return { previaConteudo: bloqueada('versao-divergente') };
      }
      let total = 0, binario = null;
      const ler = async (a, esperado, indice) => {
        // URL produzida pelo catálogo confiável, não por pedido de navegador ou provedor.
        const rel = decodeURIComponent(a.url || '').slice(1);
        if (!a.url?.startsWith('/') || !/^docs\/marketing\/\d{4}-\d{2}\/semana-[^/]+\/(?:para-aprovacao|aprovados|historico)\//.test(rel)) throw new Error('midia');
        const arquivo = catalogo.caminhoSeguro(raiz,rel);
        const stat = await fs.promises.stat(arquivo);
        if (!stat.isFile() || stat.size<1 || stat.size>MAX_ARQUIVO || (total+=stat.size)>MAX_TOTAL) throw new Error('midia');
        const sha = crypto.createHash('sha256'), sha1 = crypto.createHash('sha1');
        const partes = []; let tamanho=0, inicio=Buffer.alloc(0);
        for await (const parte of fs.createReadStream(arquivo,{signal:controller.signal,highWaterMark:128*1024})) {
          tamanho+=parte.length;
          if (tamanho>stat.size || tamanho>MAX_ARQUIVO) throw new Error('midia');
          sha.update(parte);sha1.update(parte);
          if (inicio.length<12) inicio=Buffer.concat([inicio,parte.subarray(0,12-inicio.length)]);
          if (indiceBinario===indice) partes.push(parte);
        }
        const tipoMime=mime(inicio);
        if (tamanho!==stat.size || sha.digest('hex')!==esperado || sha1.digest('hex')!==a.sha1
          || !tipoMime || (indice!=='capa' && (tipoMime.startsWith('video/')?'video':'imagem')!==a.tipo)
          || (indice==='capa' && !tipoMime.startsWith('image/'))) throw new Error('divergencia');
        if (indiceBinario===indice) binario={conteudo:Buffer.concat(partes),mime:tipoMime};
        return {sha256:esperado,mime:tipoMime,urlLocal:`/api/marketing/publicacoes-simulacao/midia?chave=${previa.chave}&indice=${indice}`};
      };
      const midias=[];
      for (let i=0;i<p.arquivos.length;i++) {
        if (p.arquivos[i].tipo!==previa.peca.manifesto.midias[i].tipo) return { previaConteudo: bloqueada('versao-divergente') };
        midias.push({ordem:i,tipo:p.arquivos[i].tipo,...await ler(p.arquivos[i],previa.peca.manifesto.midias[i].sha256,String(i))});
      }
      const capa=p.capa?await ler(p.capa,previa.peca.manifesto.capaSha256,'capa'):null;
      // Relê aceite/versão depois da leitura dos arquivos (sem transformar a pasta em aceite novo).
      const vigente=await obterPeca(raiz,p.id);
      if (!vigente?.aprovada || vigente.versao!==p.versao || vigente.recusada || vigente.revisao?.superada || vigente.revisao?.pendencia) return { previaConteudo: bloqueada('versao-divergente') };
      return { previaConteudo:{estado:'disponivel',legenda:p.legenda,midias,capa,chave:previa.chave,versao:p.versao}, ...(binario?{binario}:{}) };
    } catch {
      // Sem caminho, URL privada, corpo de erro ou conteúdo do acervo em log.
      return { previaConteudo: bloqueada('midia-indisponivel') };
    } finally {clearTimeout(timer);ativos--;}
  };
}
module.exports = { criarResolvedor, MAX_ARQUIVO, MAX_TOTAL };
