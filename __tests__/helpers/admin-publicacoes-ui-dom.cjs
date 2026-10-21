'use strict';
const fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const ROOT = path.resolve(__dirname, '../..'), WEB = path.join(ROOT, 'tools/admin-local/web');
function playwright() {
  const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache/_npx');
  const bases = [ROOT, process.env.PLAYWRIGHT_DIR, ...(fs.existsSync(cache) ? fs.readdirSync(cache).map(p => path.join(cache, p, 'node_modules')) : [])];
  for (const base of bases.filter(Boolean)) try { return createRequire(path.join(base, 'x.js'))('playwright'); } catch {}
  throw Error('Playwright local indisponível');
}
const BOOT = `import { montarReal } from '/telas/_publicacoes-reais-ui.js';
const h = (tag, attrs, ...children) => {
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'texto') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'dados') Object.assign(e.dataset, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) e.append(c);
  return e;
};
window.posts = []; window.gets = []; window.resolvido = false;
window.PECAS = [
  { id:'a'.repeat(16), versao:'b'.repeat(40), titulo:'Imagem', tipo:'imagem', midias:[{tipo:'imagem',mime:'image/jpeg'}], aprovada:true, bloqueios:[] },
  { id:'c'.repeat(16), versao:'d'.repeat(40), titulo:'MP4', tipo:'video', midias:[{tipo:'video',mime:'video/mp4'}], aprovada:true, bloqueios:[] }
];
const real = d => ({ok:true,dados:{contractVersion:'e5.real.v1',modo:'real',...d}});
const CONTAS = ['instagram','facebook'].map((rede,i) => ({ contaId:'conta'+i, rede, rotulo:rede, revisao:1, conexao:'verificada',pausada:false,
  capacidades:['feed','carrossel','reels','stories'].map(formato => ({formato,estado:'disponivel',revisao:1,motivos:[]})) }));
const JOB = { jobId:'11111111-1111-4111-8111-111111111111',loteId:'22222222-2222-4222-8222-222222222222',snapshotId:'33333333-3333-4333-8333-333333333333',
  estado:'programado-no-painel',revisao:1,atualizadoEm:'2026-10-21T13:00:00Z',recibos:[],destino:{contaId:'conta0',rede:'instagram',formato:'feed',publicarEm:'2027-01-01T15:00:00Z',fuso:'America/Sao_Paulo'}};
window.api = async p => {
  window.gets.push(p);
  if(p.includes('/capacidades')) return real({contas:CONTAS,controles:{habilitado:true,revisao:1,pausaGlobal:false,pausaFacebook:false,pausaInstagram:false}});
  if(p.includes('/catalogo')) return {ok:true,dados:{pecas:window.PECAS}};
  if(p.endsWith('/feed')) return {ok:true,dados:{pecas:window.PECAS}};
  if(p.includes('/detalhe')) {
    if(window.falhaConsulta) throw Object.assign(Error('consulta indisponível'), {status:404,codigo:'lote-inexistente'});
    return real({loteId:JOB.loteId,jobs:window.resolvido?[JOB]:[]});
  }
  return real({jobs:[JOB],limitado:false,proximoCursor:null});
};
window.exibir = async (vazio=false) => {
  window.limpar?.(); document.body.replaceChildren(); const raiz=h('main');document.body.append(raiz);
  const originais = window.PECAS; if(vazio) window.PECAS=[];
  window.limpar = await montarReal(raiz,{h,params:{},obsoleta:()=>false,api:window.api,
    acao:async(p,body)=>{window.posts.push(body);throw Object.assign(Error('resposta perdida'),{status:503,codigo:'resultado-desconhecido'});},
    confirmar:async()=>true, cabecalho:(r,t,d,acoes)=>r.append(...acoes),urlArquivo:u=>u});
  window.PECAS = originais;
};`;
async function abrirAmbiente() {
  const browser = await playwright().chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.origin !== 'http://127.0.0.1:4395') throw Error('Rede externa proibida');
    if (u.pathname === '/') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><script type="module" src="/qa/boot.js"></script></body></html>' });
    if (u.pathname === '/qa/boot.js') return r.fulfill({ contentType: 'text/javascript', body: BOOT });
    const arq = path.join(WEB, u.pathname);
    return fs.existsSync(arq) && fs.statSync(arq).isFile() ? r.fulfill({ path: arq }) : r.fulfill({ status: 404 });
  });
  await page.goto('http://127.0.0.1:4395/'); await page.waitForFunction(() => !!window.exibir);
  return { browser, page };
}
module.exports = { abrirAmbiente };
