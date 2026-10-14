import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 3847;
const BASE_DIR = path.resolve('docs/marketing');
const TRASH_DIR = path.resolve('docs/marketing/.lixeira');

if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
if (!fs.existsSync(TRASH_DIR)) fs.mkdirSync(TRASH_DIR, { recursive: true });

// Caminho dentro de docs/marketing, por path.relative: recusa '..', absoluto e pasta irmã
// (docs/marketing-x passava no startsWith antigo). Devolve o caminho absoluto ou null.
function dentroDaBase(relativo) {
  const alvo = path.resolve(BASE_DIR, String(relativo || ''));
  const rel = path.relative(BASE_DIR, alvo);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null;
  return alvo;
}

// Rotas que escrevem só aceitam pedido desta página: Host do próprio servidor e, quando o
// navegador manda Origin, a mesma origem. Outro site aberto no navegador recebe 403.
const ORIGENS = [`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`];
function hostDoServidor(req) {
  const host = String((req.headers && req.headers.host) || '').toLowerCase();
  return ORIGENS.some((o) => o.slice('http://'.length) === host);
}
function pedidoDaPropriaPagina(req) {
  if (!hostDoServidor(req)) return false;
  const origem = req.headers && req.headers.origin;
  return origem === undefined || ORIGENS.includes(String(origem).toLowerCase());
}


function classificarMidia(relPath) {
  const norm = relPath.toLowerCase().replace(/\\/g, '/');
  if (
    norm.includes('arsenal/') ||
    norm.includes('apoio/') ||
    norm.includes('capturas-fonte') ||
    norm.includes('mockup') ||
    norm.includes('referencia') ||
    norm.includes('historico/')
  ) {
    return 'producao';
  }
  if (
    norm.includes('aprovados/') ||
    norm.includes('para-aprovacao/') ||
    norm.includes('pecas/') ||
    !norm.includes('/')
  ) {
    return 'criativo';
  }
  return 'producao';
}

// Imagens e vídeos. O vídeo (Reel) não aparecia porque a lista só aceitava imagem.
const EXT_IMAGEM = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
const EXT_VIDEO = ['.mp4', '.webm', '.mov'];
const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime'
};

// Serve o arquivo com Range (206/416): sem isso o navegador não consegue buscar no meio do vídeo.
function servirArquivo(req, res, caminho) {
  const tipo = MIME[path.extname(caminho).toLowerCase()] || 'application/octet-stream';
  const tamanho = fs.statSync(caminho).size;
  const range = req.headers && req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    let inicio = NaN;
    let fim = NaN;
    if (m && (m[1] !== '' || m[2] !== '')) {
      if (m[1] === '') { inicio = Math.max(0, tamanho - Number(m[2])); fim = tamanho - 1; }
      else { inicio = Number(m[1]); fim = m[2] === '' ? tamanho - 1 : Math.min(Number(m[2]), tamanho - 1); }
    }
    if (!Number.isSafeInteger(inicio) || !Number.isSafeInteger(fim) || inicio > fim || inicio >= tamanho) {
      res.writeHead(416, { 'Content-Range': `bytes */${tamanho}` });
      return res.end();
    }
    res.writeHead(206, { 'Content-Type': tipo, 'Content-Length': fim - inicio + 1, 'Content-Range': `bytes ${inicio}-${fim}/${tamanho}`, 'Accept-Ranges': 'bytes' });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(caminho, { start: inicio, end: fim }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': tamanho, 'Accept-Ranges': 'bytes' });
  if (req.method === 'HEAD') return res.end();
  return fs.createReadStream(caminho).pipe(res);
}

function listarImagensBrutas(dir) {
  let resultados = [];
  if (!fs.existsSync(dir)) return resultados;
  const itens = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of itens) {
    if (item.name === '.lixeira') continue;
    const caminhoCompleto = path.join(dir, item.name);
    if (item.isDirectory()) {
      resultados = resultados.concat(listarImagensBrutas(caminhoCompleto));
    } else {
      const ext = path.extname(item.name).toLowerCase();
      const ehVideo = EXT_VIDEO.includes(ext);
      if (EXT_IMAGEM.includes(ext) || ehVideo) {
        const stats = fs.statSync(caminhoCompleto);
        const relPath = path.relative(BASE_DIR, caminhoCompleto).replace(/\\/g, '/');
        const categoria = classificarMidia(relPath);
        resultados.push({
          nome: item.name,
          caminhoRelativo: relPath,
          tamanhoKb: Math.round(stats.size / 1024),
          modificadoEm: stats.mtime,
          categoria,
          midia: ehVideo ? 'video' : 'imagem'
        });
      }
    }
  }
  return resultados;
}

function agruparMidias(lista) {
  const grupos = [];
  const carrosselMap = new Map();

  for (const item of lista) {
    const match = item.midia === 'video' ? null : item.nome.match(/^(.*carrossel[_-]?|.*slide[_-]?|.*pagina[_-]?)(\d+)(\.[a-z0-9]+)$/i);
    if (match) {
      const dirPai = path.dirname(item.caminhoRelativo);
      const prefixo = match[1];
      const numeroPagina = parseInt(match[2], 10);
      const chaveCarrossel = `${dirPai}/${prefixo}`.toLowerCase();

      if (!carrosselMap.has(chaveCarrossel)) {
        const grupo = {
          tipo: 'carrossel',
          nome: `${prefixo.replace(/[_-]$/, '')} (Carrossel)`,
          caminhoRelativo: item.caminhoRelativo,
          categoria: item.categoria,
          modificadoEm: item.modificadoEm,
          paginas: []
        };
        carrosselMap.set(chaveCarrossel, grupo);
        grupos.push(grupo);
      }

      const grp = carrosselMap.get(chaveCarrossel);
      grp.paginas.push({
        numero: numeroPagina,
        nome: item.nome,
        caminhoRelativo: item.caminhoRelativo,
        tamanhoKb: item.tamanhoKb
      });
      if (item.modificadoEm > grp.modificadoEm) grp.modificadoEm = item.modificadoEm;
    } else {
      grupos.push({
        tipo: 'unico',
        midia: item.midia,
        nome: item.nome,
        caminhoRelativo: item.caminhoRelativo,
        tamanhoKb: item.tamanhoKb,
        categoria: item.categoria,
        modificadoEm: item.modificadoEm,
        paginas: [item]
      });
    }
  }

  for (const grp of carrosselMap.values()) {
    grp.paginas.sort((a, b) => a.numero - b.numero);
    if (grp.paginas.length > 0) {
      grp.caminhoRelativo = grp.paginas[0].caminhoRelativo;
      grp.tamanhoKb = grp.paginas.reduce((acc, p) => acc + p.tamanhoKb, 0);
    }
  }

  return grupos.sort((a, b) => b.modificadoEm - a.modificadoEm);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Leitura também: Host estranho é outro site resolvendo para 127.0.0.1 (achado G4 do Vigil).
  if (!hostDoServidor(req)) {
    res.writeHead(403);
    return res.end('Host recusado.');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD' && !pedidoDaPropriaPagina(req)) {
    res.writeHead(403);
    return res.end('Origem recusada.');
  }

  if (url.pathname === '/api/imagens') {
    const brutas = listarImagensBrutas(BASE_DIR);
    const agrupadas = agruparMidias(brutas);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(agrupadas));
  }

  // Caminho único de pedido de correção (13/10): a fila do painel admin, na Aprovação, que
  // liga o pedido à peça e à versão. Esta galeria não grava chamado nem avisa agente.
  if (url.pathname === '/api/notificar-correcao' && req.method === 'POST') {
    res.writeHead(410, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: false, codigo: 'correcao-pelo-painel',
      mensagem: 'Pedidos de correção agora são feitos na Aprovação do painel admin, na janela da peça. Nada foi gravado aqui.' }));
  }

  if (url.pathname === '/api/lixeira' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { itens } = JSON.parse(body);
        if (!Array.isArray(itens)) {
          res.writeHead(400);
          return res.end('Formato inválido');
        }
        let movidos = 0;
        for (const relPath of itens) {
          const origem = dentroDaBase(relPath);
          if (origem && fs.existsSync(origem)) {
            const timestamp = Date.now();
            const nomeDestino = `${timestamp}_${path.basename(origem)}`;
            const destino = path.join(TRASH_DIR, nomeDestino);
            fs.renameSync(origem, destino);
            movidos++;
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, movidos }));
      } catch (err) {
        res.writeHead(500);
        return res.end(err.message);
      }
    });
    return;
  }

  if (url.pathname.startsWith('/midia/')) {
    const decoded = decodeURIComponent(url.pathname.replace('/midia/', ''));
    const safePath = dentroDaBase(decoded);
    if (!safePath || !fs.existsSync(safePath) || !fs.statSync(safePath).isFile()) {
      res.writeHead(404);
      return res.end('Arquivo nao encontrado');
    }
    return servirArquivo(req, res, safePath);
  }

  // Interface Web com Visualização Expandida (Lightbox)
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Galeria de Mídias - Grana.</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0c0d0e; color: #f3f4f6; padding: 24px; user-select: none; }
    header { border-bottom: 1px solid #22252a; padding-bottom: 16px; margin-bottom: 24px; position: sticky; top: 0; background: #0c0d0e; z-index: 100; }
    .top-bar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .tabs { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-width: 0; }
    .tab-btn { background: #16181b; color: #9ca3af; border: 1px solid #23272e; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; text-align: left; }
    .tab-btn:hover { background: #23272e; color: #fff; }
    .tab-btn.active { background: #10b981; color: #000; border-color: #10b981; font-weight: 700; }
    .tab-badge { background: rgba(0,0,0,0.25); color: inherit; padding: 2px 7px; border-radius: 9999px; font-size: 11px; }
    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    button { border: none; padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-size: 13px; }
    .btn-refresh { background: #1f2937; color: #f3f4f6; }
    .btn-refresh:hover { background: #374151; }
    .btn-select-all { background: #1f2937; color: #9ca3af; }
    .btn-select-all:hover { background: #374151; color: #fff; }
    .btn-trash { background: #ef4444; color: #fff; display: none; }
    .btn-trash:hover { background: #dc2626; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px; }
    .card { background: #16181b; border: 1px solid #23272e; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s; position: relative; }
    .card:hover { transform: translateY(-2px); border-color: #3b82f6; }
    .card.selected { border-color: #ef4444; box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.4); background: #1a1517; }
    
    .checkbox-wrapper { position: absolute; top: 10px; left: 10px; z-index: 15; cursor: pointer; }
    .custom-checkbox { width: 22px; height: 22px; border-radius: 6px; background: rgba(0,0,0,0.65); border: 2px solid rgba(255,255,255,0.4); display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
    .card.selected .custom-checkbox { background: #ef4444; border-color: #ef4444; }
    .custom-checkbox svg { display: none; width: 14px; height: 14px; fill: white; }
    .card.selected .custom-checkbox svg { display: block; }
    
    .tags { position: absolute; top: 10px; right: 10px; display: flex; gap: 6px; z-index: 5; }
    .tag-cat { background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .tag-cat.criativo { color: #87f9cc; border: 1px solid rgba(135, 249, 204, 0.3); }
    .tag-cat.producao { color: #9ca3af; border: 1px solid rgba(156, 163, 175, 0.3); }
    .tag-carrossel { background: #3b82f6; color: #fff; border-radius: 6px; font-size: 10px; font-weight: 700; padding: 3px 7px; text-transform: uppercase; }
    
    .img-wrapper { aspect-ratio: 4/5; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: zoom-in; position: relative; }
    .img-wrapper img { width: 100%; height: 100%; object-fit: contain; }
    .img-wrapper video { width: 100%; height: 100%; object-fit: contain; background: #000; }
    .tag-video { background: #0f766e; color: #fff; border-radius: 6px; font-size: 10px; font-weight: 700; padding: 3px 7px; text-transform: uppercase; }
    .expand-hint { pointer-events: none; position: absolute; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; font-size: 12px; font-weight: 600; color: #fff; gap: 6px; }
    .img-wrapper:hover .expand-hint { opacity: 1; }
    
    .carousel-nav { position: absolute; bottom: 8px; left: 0; right: 0; display: flex; justify-content: center; gap: 6px; z-index: 8; }
    .carousel-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.3); transition: all 0.2s; }
    .carousel-dot.active { background: #87f9cc; width: 14px; border-radius: 4px; }

    .info { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
    .info .name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; display: block; width: 100%; padding: 0; border: 0; background: none; color: inherit; font-family: inherit; text-align: left; }
    .info .name:focus-visible { outline: 2px solid #10b981; outline-offset: 2px; border-radius: 4px; }
    .info .name:hover { color: #87f9cc; }
    .info .meta { font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
    
    .page-controls { display: flex; align-items: center; justify-content: space-between; background: #0c0d0e; padding: 4px 8px; border-radius: 6px; border: 1px solid #22252a; }
    .btn-page { background: #1f2937; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer; }
    .btn-page:hover { background: #374151; }
    .page-indicator { font-size: 11px; color: #9ca3af; font-weight: 600; }

    .btn-feedback { background: #27272a; color: #87f9cc; border: 1px solid rgba(135, 249, 204, 0.3); padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; text-align: center; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .btn-feedback:hover { background: #87f9cc; color: #000; border-color: #87f9cc; }
    .empty { grid-column: 1 / -1; text-align: center; padding: 60px; color: #6b7280; font-size: 14px; }

    /* Lightbox de Visualização Expandida */
    .lightbox-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.92); backdrop-filter: blur(8px); z-index: 2000; align-items: center; justify-content: center; flex-direction: column; }
    .lightbox-header { position: absolute; top: 16px; left: 24px; right: 24px; display: flex; justify-content: space-between; align-items: center; z-index: 10; }
    .lightbox-title { font-size: 14px; font-weight: 600; color: #e5e7eb; display: flex; align-items: center; gap: 12px; }
    .lightbox-close { background: #27272a; border: 1px solid #3f3f46; color: #fff; width: 36px; height: 36px; border-radius: 50%; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
    .lightbox-close:hover { background: #ef4444; border-color: #ef4444; }
    .lightbox-content { max-width: 92vw; max-height: 85vh; display: flex; align-items: center; justify-content: center; position: relative; }
    .lightbox-img { max-width: 92vw; max-height: 82vh; object-fit: contain; border-radius: 8px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8); }
    .lightbox-actions { position: absolute; bottom: 20px; display: flex; gap: 12px; z-index: 10; }
    .btn-lightbox-action { background: #16181b; color: #87f9cc; border: 1px solid rgba(135, 249, 204, 0.4); padding: 10px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; transition: all 0.2s; font-size: 13px; }
    .btn-lightbox-action:hover { background: #87f9cc; color: #000; }

    /* Modal de Correção */
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); z-index: 3000; align-items: center; justify-content: center; }
    .modal { background: #16181b; border: 1px solid #2a2e37; border-radius: 14px; width: 520px; max-width: 90vw; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .modal-title { font-size: 16px; font-weight: 700; color: #87f9cc; display: flex; align-items: center; gap: 8px; }
    .modal-close { background: transparent; border: none; color: #9ca3af; font-size: 18px; cursor: pointer; padding: 4px; }
    .modal-close:hover { color: #fff; }
    .target-file { font-size: 12px; color: #9ca3af; background: #0c0d0e; padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; word-break: break-all; border: 1px solid #22252a; }
    textarea { width: 100%; height: 120px; background: #0c0d0e; border: 1px solid #2a2e37; border-radius: 8px; color: #fff; padding: 12px; font-family: inherit; font-size: 13px; resize: vertical; margin-bottom: 18px; outline: none; }
    textarea:focus { border-color: #87f9cc; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
    .btn-cancel { background: #27272a; color: #d4d4d8; }
    .btn-send { background: #87f9cc; color: #000; font-weight: 700; }
    .btn-send:hover { background: #6ee7b7; }
  </style>
</head>
<body>
  <header>
    <div class="top-bar">
      <h1><span>✨ Galeria de Mídias</span></h1>
      <div class="actions">
        <button class="btn-select-all" id="btnSelectAll" onclick="alternarTodos()">Selecionar aba</button>
        <button class="btn-trash" id="btnTrash" onclick="excluirSelecionados()">🗑️ Mover para a lixeira (0)</button>
        <button class="btn-refresh" onclick="carregar()">Atualizar</button>
      </div>
    </div>
    <div class="tabs">
      <button class="tab-btn active" id="tab-criativo" onclick="mudarAba('criativo')">
        🎨 Criativos Finais <span class="tab-badge" id="badge-criativo">0</span>
      </button>
      <button class="tab-btn" id="tab-producao" onclick="mudarAba('producao')">
        🛠️ Materiais de Produção (Arsenal / Apoio) <span class="tab-badge" id="badge-producao">0</span>
      </button>
      <button class="tab-btn" id="tab-todos" onclick="mudarAba('todos')">
        📁 Todos <span class="tab-badge" id="badge-todos">0</span>
      </button>
    </div>
  </header>
  <div class="grid" id="grid">
    <div class="empty">Carregando mídias...</div>
  </div>

  <!-- Lightbox Expandido -->
  <div class="lightbox-overlay" id="lightboxOverlay" role="dialog" aria-modal="true" aria-labelledby="lightboxTitle" onclick="fecharLightbox(event)">
    <div class="lightbox-header">
      <div class="lightbox-title" id="lightboxTitle">Nome do Arquivo</div>
      <button class="lightbox-close" id="lightboxClose" aria-label="Fechar" onclick="fecharLightbox(null)">✕</button>
    </div>
    <div class="lightbox-content">
      <img class="lightbox-img" id="lightboxImg" src="" alt="Ampliado" />
      <video class="lightbox-img" id="lightboxVideo" controls playsinline preload="metadata" hidden></video>
    </div>
    <div class="lightbox-actions">
      <button class="btn-lightbox-action" id="btnLightboxFeedback" onclick="pedirCorrecaoDoLightbox()">💬 Pedir Correção desta Peça</button>
      <button class="btn-lightbox-action" style="background:#1f2937;color:#fff;border-color:#374151" onclick="abrirImagemAba()">↗️ Abrir Original</button>
    </div>
  </div>

  <!-- Modal de Correção -->
  <div class="modal-overlay" id="modalOverlay">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title"><span>📝 Pedir Correção aos Agentes</span></div>
        <button class="modal-close" onclick="fecharModal()">✕</button>
      </div>
      <div class="target-file" id="modalTargetFile">Arquivo: ...</div>
      <textarea id="modalInstrucoes" placeholder="Descreva exatamente o que precisa ser corrigido (ex: ajustar contraste do fundo, trocar texto do H2, reposicionar notificação)..."></textarea>
      <div class="modal-actions">
        <button class="btn-cancel" onclick="fecharModal()">Cancelar</button>
        <button class="btn-send" id="btnEnviarCorrecao" onclick="enviarCorrecao()">🚀 Notificar Agentes</button>
      </div>
    </div>
  </div>

  <script>
    let itensGlobais = [];
    let abaAtiva = 'criativo';
    const selecionados = new Set();
    const indicePagina = new Map();
    let arquivoParaCorrecao = null;
    let arquivoAbertoNoLightbox = null;

    async function carregar() {
      const res = await fetch('/api/imagens');
      itensGlobais = await res.json();
      
      const criativos = itensGlobais.filter(i => i.categoria === 'criativo').length;
      const producao = itensGlobais.filter(i => i.categoria === 'producao').length;
      
      document.getElementById('badge-criativo').textContent = criativos;
      document.getElementById('badge-producao').textContent = producao;
      document.getElementById('badge-todos').textContent = itensGlobais.length;
      
      renderizar();
    }

    function mudarAba(aba) {
      abaAtiva = aba;
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.getElementById('tab-' + aba).classList.add('active');
      renderizar();
    }

    function getItensFiltrados() {
      if (abaAtiva === 'todos') return itensGlobais;
      return itensGlobais.filter(i => i.categoria === abaAtiva);
    }

    function mudarSlide(idGrupo, delta, max, evt) {
      if (evt) evt.stopPropagation();
      let atual = indicePagina.get(idGrupo) || 0;
      atual = (atual + delta + max) % max;
      indicePagina.set(idGrupo, atual);
      renderizar();
    }

    function renderizar() {
      const grid = document.getElementById('grid');
      const itens = getItensFiltrados();

      if (itens.length === 0) {
        grid.innerHTML = '<div class="empty">Nenhum item encontrado nesta categoria.</div>';
        atualizarBotoes();
        return;
      }

      grid.innerHTML = itens.map((item, idx) => {
        const isCarrossel = item.tipo === 'carrossel';
        const totalPags = item.paginas.length;
        const idGrupo = 'grp_' + idx;
        const pagAtual = indicePagina.get(idGrupo) || 0;
        const dadosPagina = item.paginas[pagAtual] || item.paginas[0];
        const todasPaginasSelecionadas = item.paginas.every(p => selecionados.has(p.caminhoRelativo));

        return \`
          <div class="card \${todasPaginasSelecionadas ? 'selected' : ''}">
            <div class="checkbox-wrapper" onclick="toggleSelecaoGrupo(\${idx}, event)">
              <div class="custom-checkbox">
                <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              </div>
            </div>
            
            <div class="tags">
              \${isCarrossel ? \`<div class="tag-carrossel">🎠 \${totalPags} slides</div>\` : ''}
              \${item.midia === 'video' ? '<div class="tag-video">🎬 Vídeo</div>' : ''}
              <div class="tag-cat \${item.categoria}">\${item.categoria === 'criativo' ? 'Criativo' : 'Produção'}</div>
            </div>

            <!-- Clique na imagem abre a Visualização Expandida -->
            <div class="img-wrapper" onclick="abrirLightbox('\${dadosPagina.caminhoRelativo}', '\${dadosPagina.nome}', event)">
              \${item.midia === 'video'
                ? \`<video src="/midia/\${encodeURIComponent(dadosPagina.caminhoRelativo)}" controls playsinline preload="metadata" onclick="event.stopPropagation()"></video>\`
                : \`<img src="/midia/\${encodeURIComponent(dadosPagina.caminhoRelativo)}" alt="\${dadosPagina.nome}" loading="lazy" />\`}
              <div class="expand-hint">🔍 Clique para expandir</div>
              \${isCarrossel ? \`
                <div class="carousel-nav">
                  \${item.paginas.map((_, i) => \`<div class="carousel-dot \${i === pagAtual ? 'active' : ''}"></div>\`).join('')}
                </div>
              \` : ''}
            </div>

            <div class="info">
              <button type="button" class="name" title="\${dadosPagina.nome}" onclick="abrirLightbox('\${dadosPagina.caminhoRelativo}', '\${dadosPagina.nome}', event)">
                \${dadosPagina.nome}
              </button>
              <div class="meta">
                <span>\${dadosPagina.caminhoRelativo.split('/')[0] || 'geral'}</span>
                <span>\${dadosPagina.tamanhoKb} KB</span>
              </div>

              \${isCarrossel ? \`
                <div class="page-controls">
                  <button class="btn-page" onclick="mudarSlide('\${idGrupo}', -1, \${totalPags}, event)">◀ Ant</button>
                  <span class="page-indicator">Slide \${pagAtual + 1} de \${totalPags}</span>
                  <button class="btn-page" onclick="mudarSlide('\${idGrupo}', 1, \${totalPags}, event)">Próx ▶</button>
                </div>
              \` : ''}

              <button class="btn-feedback" onclick="abrirModalCorrecao('\${dadosPagina.caminhoRelativo}', event)">
                💬 Pedir Correção (\${isCarrossel ? 'Slide ' + (pagAtual + 1) : 'Peça'})
              </button>
            </div>
          </div>
        \`;
      }).join('');
      atualizarBotoes();
    }

    /* Lightbox Expandido */
    let focoAntesDoLightbox = null;
    function lightboxAberto() { return document.getElementById('lightboxOverlay').style.display === 'flex'; }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lightboxAberto()) { e.preventDefault(); fecharLightbox(null); }
    });

    function abrirLightbox(caminho, nome, evt) {
      if (evt) evt.stopPropagation();
      if (!lightboxAberto()) {
        const ativo = document.activeElement;
        const doCard = evt && evt.currentTarget && evt.currentTarget.closest ? evt.currentTarget.closest('.card') : null;
        focoAntesDoLightbox = ativo && ativo !== document.body ? ativo : doCard ? doCard.querySelector('button.name') : null;
      }
      arquivoAbertoNoLightbox = caminho;
      document.getElementById('lightboxTitle').textContent = nome + ' (' + caminho + ')';
      const ehVideo = /\\.(mp4|webm|mov)$/i.test(caminho);
      const img = document.getElementById('lightboxImg');
      const video = document.getElementById('lightboxVideo');
      img.hidden = ehVideo;
      video.hidden = !ehVideo;
      if (ehVideo) { img.removeAttribute('src'); video.src = '/midia/' + encodeURIComponent(caminho); }
      else { pararVideoDoLightbox(); img.src = '/midia/' + encodeURIComponent(caminho); }
      document.getElementById('lightboxOverlay').style.display = 'flex';
      document.getElementById('lightboxClose').focus();
    }

    function pararVideoDoLightbox() {
      const video = document.getElementById('lightboxVideo');
      video.pause();
      video.removeAttribute('src');
      video.load();
    }

    function fecharLightbox(evt) {
      if (!evt || evt.target.id === 'lightboxOverlay' || evt.target.classList.contains('lightbox-close')) {
        pararVideoDoLightbox();
        document.getElementById('lightboxOverlay').style.display = 'none';
        arquivoAbertoNoLightbox = null;
        const volta = focoAntesDoLightbox;
        focoAntesDoLightbox = null;
        if (volta && volta.isConnected && typeof volta.focus === 'function') volta.focus();
      }
    }

    function abrirImagemAba() {
      if (arquivoAbertoNoLightbox) {
        window.open('/midia/' + encodeURIComponent(arquivoAbertoNoLightbox), '_blank');
      }
    }

    function pedirCorrecaoDoLightbox() {
      const alvo = arquivoAbertoNoLightbox;
      fecharLightbox(null);
      abrirModalCorrecao(alvo);
    }

    function toggleSelecaoGrupo(idx, evt) {
      if (evt) evt.stopPropagation();
      const item = getItensFiltrados()[idx];
      const todasMarcadas = item.paginas.every(p => selecionados.has(p.caminhoRelativo));
      if (todasMarcadas) {
        item.paginas.forEach(p => selecionados.delete(p.caminhoRelativo));
      } else {
        item.paginas.forEach(p => selecionados.add(p.caminhoRelativo));
      }
      renderizar();
    }

    function alternarTodos() {
      const itens = getItensFiltrados();
      const todasPaginas = itens.flatMap(i => i.paginas.map(p => p.caminhoRelativo));
      const todosJaMarcados = todasPaginas.every(p => selecionados.has(p));
      if (todosJaMarcados) {
        todasPaginas.forEach(p => selecionados.delete(p));
      } else {
        todasPaginas.forEach(p => selecionados.add(p));
      }
      renderizar();
    }

    function atualizarBotoes() {
      const btnTrash = document.getElementById('btnTrash');
      const btnSelectAll = document.getElementById('btnSelectAll');
      const itens = getItensFiltrados();
      const todasPaginas = itens.flatMap(i => i.paginas.map(p => p.caminhoRelativo));

      if (selecionados.size > 0) {
        btnTrash.style.display = 'block';
        btnTrash.textContent = \`🗑️ Mover para a lixeira (\${selecionados.size} arquivos)\`;
      } else {
        btnTrash.style.display = 'none';
      }
      const todosJaMarcados = todasPaginas.length > 0 && todasPaginas.every(p => selecionados.has(p));
      btnSelectAll.textContent = todosJaMarcados ? 'Desmarcar aba' : 'Selecionar aba';
    }

    async function excluirSelecionados() {
      if (selecionados.size === 0) return;
      const count = selecionados.size;
      if (!confirm(\`Tem certeza que deseja mover \${count} arquivo(s) para a lixeira?\`)) return;

      const res = await fetch('/api/lixeira', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: Array.from(selecionados) })
      });
      if (res.ok) {
        selecionados.clear();
        await carregar();
      } else {
        alert('Erro ao mover arquivos para a lixeira.');
      }
    }

    function abrirModalCorrecao(caminho, evt) {
      if (evt) evt.stopPropagation();
      arquivoParaCorrecao = caminho;
      document.getElementById('modalTargetFile').textContent = 'Alvo: ' + caminho;
      document.getElementById('modalInstrucoes').value = '';
      document.getElementById('modalOverlay').style.display = 'flex';
      setTimeout(() => document.getElementById('modalInstrucoes').focus(), 50);
    }

    function fecharModal() {
      document.getElementById('modalOverlay').style.display = 'none';
      arquivoParaCorrecao = null;
    }

    async function enviarCorrecao() {
      const instrucoes = document.getElementById('modalInstrucoes').value.trim();
      if (!instrucoes) {
        alert('Por favor, digite as instruções de correção.');
        return;
      }
      const btn = document.getElementById('btnEnviarCorrecao');
      btn.textContent = 'Enviando...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/notificar-correcao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ arquivo: arquivoParaCorrecao, instrucoes })
        });
        if (res.status === 410) {
          const r = await res.json().catch(() => ({}));
          alert(r.mensagem || 'Peça a correção pela Aprovação do painel admin. Nada foi gravado aqui.');
          fecharModal();
        } else {
          alert('Erro ao enviar solicitação.');
        }
      } catch (err) {
        alert('Erro de conexão: ' + err.message);
      } finally {
        btn.textContent = '🚀 Notificar Agentes';
        btn.disabled = false;
      }
    }

    carregar();
    setInterval(carregar, 8000);
  </script>
</body>
</html>`);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Servidor da galeria rodando em http://localhost:${PORT}`);
});
