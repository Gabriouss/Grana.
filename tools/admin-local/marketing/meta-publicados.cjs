'use strict';
// Camada "Publicado na Meta" do calendário: só LEITURA (GET) do que já saiu no Instagram e no Facebook,
// inclusive fora do painel. O token fica neste processo Node; a resposta leva só data, rede, formato,
// miniatura, legenda curta e link. Vínculo com a peça planejada só quando a legenda confere e é única
// nos dois sentidos; sem isso o post fica solto no dia. Nunca inventa vínculo.

const crypto = require('node:crypto');
const config = require('../config.cjs');
const { pedirJson } = require('../adaptadores/_http.cjs');
const { ErroMarketing, hojeLocal, listarPecas } = require('./catalogo.cjs');
const { temLegenda } = require('./legenda-publicacao.cjs');

const FUSO = 'America/Sao_Paulo';
const dataLocal = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const MAX_PAGINAS = 4;
const VALIDADE_MS = 60_000;

const diaLocal = (iso) => {
  const p = Object.fromEntries(dataLocal.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};
const https = (v) => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; } };
const curta = (t) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > 140 ? `${s.slice(0, 139).trimEnd()}…` : s; };
const normal = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const chave = (rede, id) => crypto.createHash('sha1').update(`${rede}:${id}`).digest('hex').slice(0, 16);

function formatoInstagram(m) {
  if (m.media_product_type === 'REELS') return 'reel';
  if (m.media_type === 'CAROUSEL_ALBUM') return 'carrossel';
  if (m.media_type === 'VIDEO') return 'video';
  return 'imagem';
}
function formatoFacebook(p) {
  const tipo = String(p.attachments?.data?.[0]?.media_type || '').toLowerCase();
  return tipo === 'video' ? 'video' : tipo === 'album' ? 'carrossel' : tipo === 'photo' ? 'imagem' : 'post';
}

// Uma rede por vez: falha de uma não apaga a outra.
async function lerRede({ rede, caminho, campos, inicio, fim, versao, token, normalizar, campoData }) {
  const posts = [];
  let depois = null;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const q = new URLSearchParams({ fields: campos, limit: '50', ...(depois ? { after: depois } : {}) });
    const r = await pedirJson(`meta-${rede}`, `https://graph.facebook.com/${versao}/${caminho}?${q}`, { cabecalhos: { Authorization: `Bearer ${token}` } });
    if (r.status >= 400 || !r.dados || !Array.isArray(r.dados.data)) {
      const codigo = Number(r.dados?.error?.code);
      throw new ErroMarketing([10, 100, 190, 200, 210].includes(codigo) ? 'sem-permissao' : 'resposta-invalida', 'A Meta não devolveu os posts desta rede.', 502);
    }
    let maisAntigo = null;
    for (const item of r.dados.data) {
      const quando = item[campoData];
      if (!Number.isFinite(Date.parse(quando))) continue;
      maisAntigo = maisAntigo === null || Date.parse(quando) < maisAntigo ? Date.parse(quando) : maisAntigo;
      const dia = diaLocal(quando);
      if (dia >= inicio && dia <= fim) posts.push(normalizar(item, quando, dia));
    }
    const proximo = r.dados.paging?.cursors?.after;
    if (!r.dados.paging?.next || !proximo || proximo === depois) return { posts, completo: true };
    // Mais antigos que o mês pedido: não há o que buscar.
    if (maisAntigo !== null && diaLocal(new Date(maisAntigo).toISOString()) < inicio) return { posts, completo: true };
    depois = proximo;
  }
  return { posts, completo: false };
}

async function tokenDaPagina(pagina, versao, usuario) {
  const r = await pedirJson('meta-facebook', `https://graph.facebook.com/${versao}/${pagina}?fields=access_token`, { cabecalhos: { Authorization: `Bearer ${usuario}` } });
  if (r.status >= 400 || typeof r.dados?.access_token !== 'string') throw new ErroMarketing('sem-permissao', 'A Meta não liberou a Página.', 502);
  return r.dados.access_token;
}

function vincular(posts, pecas) {
  const porLegenda = new Map();
  for (const p of pecas) {
    if (!temLegenda(p)) continue;
    const k = normal(p.legenda);
    if (k.length < 12) continue; // legenda curta demais não prova nada
    if (!porLegenda.has(k)) porLegenda.set(k, new Map());
    porLegenda.get(k).set(p.id, p);
  }
  const candidatos = posts.map((post) => {
    const k = normal(post.legendaCompleta);
    const achadas = k.length >= 12 ? porLegenda.get(k) : null;
    return achadas && achadas.size === 1 ? [...achadas.values()][0] : null;
  });
  const usos = new Map();
  candidatos.forEach((p, i) => { if (p) { const c = `${posts[i].rede}:${p.id}`; usos.set(c, (usos.get(c) || 0) + 1); } });
  return posts.map((post, i) => {
    const p = candidatos[i];
    const { legendaCompleta, ...publico } = post;
    return { ...publico, vinculo: p && usos.get(`${post.rede}:${p.id}`) === 1 ? { pecaId: p.id, versao: p.versao, criterio: 'mesma-legenda' } : null };
  });
}

function criarMetaPublicados({ ler = config.ler, catalogo = listarPecas, agora = () => new Date() } = {}) {
  const cache = new Map();
  return async function publicados(raiz, filtros = {}) {
    if (!filtros || typeof filtros !== 'object' || Array.isArray(filtros) || Object.keys(filtros).some((k) => k !== 'mes')) {
      throw new ErroMarketing('pedido-invalido', 'Confira os filtros do calendário.', 400);
    }
    const mes = filtros.mes === undefined ? hojeLocal().slice(0, 7) : filtros.mes;
    if (typeof mes !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new ErroMarketing('mes-invalido', 'Use o mês no formato AAAA-MM.', 400);
    const guardado = cache.get(mes);
    if (guardado && agora().getTime() - guardado.em < VALIDADE_MS) return guardado.dados;

    const [ano, m] = mes.split('-').map(Number);
    const inicio = `${mes}-01`, fim = `${mes}-${String(new Date(Date.UTC(ano, m, 0)).getUTCDate()).padStart(2, '0')}`;
    const versao = ler('META_GRAPH_API_VERSION') || '';
    // Posts orgânicos pedem permissão de conteúdo: o token só de anúncios (READ) fica por último.
    const tokens = ['META_ACCESS_TOKEN', 'META_INSIGHTS_ACCESS_TOKEN', 'META_READ_ACCESS_TOKEN'].map((n) => ler(n)).filter(Boolean);
    const ig = ler('META_IG_USER_ID') || '', pagina = ler('META_PAGE_ID') || '';
    const redes = {};
    const lidos = [];
    const configurado = /^v\d+\.\d+$/.test(versao) && tokens.length > 0;
    const jobs = [
      ['instagram', ig, (id) => `${id}/media`, 'caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp', 'timestamp',
        (i, quando, dia) => ({ rede: 'instagram', formato: formatoInstagram(i), data: dia, publicadoEm: quando, legenda: curta(i.caption), legendaCompleta: i.caption || '',
          miniatura: https(i.thumbnail_url) || https(i.media_url), link: https(i.permalink), chave: chave('instagram', i.id || i.permalink || quando) })],
      ['facebook', pagina, (id) => `${id}/published_posts`, 'message,created_time,permalink_url,full_picture,attachments{media_type}', 'created_time',
        (i, quando, dia) => ({ rede: 'facebook', formato: formatoFacebook(i), data: dia, publicadoEm: quando, legenda: curta(i.message), legendaCompleta: i.message || '',
          miniatura: https(i.full_picture), link: https(i.permalink_url), chave: chave('facebook', i.id || i.permalink_url || quando) })],
    ];
    for (const [rede, id, caminho, campos, campoData, normalizar] of jobs) {
      if (!configurado || !/^\d+$/.test(id)) { redes[rede] = { status: 'nao-configurado', completo: false }; continue; }
      try {
        let r, ultimo;
        for (const usuario of tokens) {
          try {
            // A Página só lista posts com o token DA PÁGINA, derivado em memória do token de usuário.
            const token = rede === 'facebook' ? await tokenDaPagina(id, versao, usuario) : usuario;
            r = await lerRede({ rede, caminho: caminho(id), campos, inicio, fim, versao, token, normalizar, campoData });
            break;
          } catch (e) { ultimo = e; if (!/sem-permissao|credencial-recusada/.test(e.codigo || '')) break; }
        }
        if (!r) throw ultimo;
        lidos.push(...r.posts);
        redes[rede] = { status: 'disponivel', completo: r.completo };
      } catch (e) {
        console.error(`[painel] meta-publicados-${rede}-${e.codigo || 'falhou'}`);
        redes[rede] = { status: 'indisponivel', completo: false, motivo: e.codigo || 'falhou' };
      }
    }
    const ordem = lidos.sort((a, b) => Date.parse(b.publicadoEm) - Date.parse(a.publicadoEm));
    const dados = {
      mes, redes, completo: Object.values(redes).every((r) => r.status === 'disponivel' && r.completo),
      consultadoEm: agora().toISOString(), posts: vincular(ordem, catalogo(raiz).pecas),
    };
    // Cache só do resultado inteiro: falha parcial é consultada de novo no próximo pedido.
    if (dados.completo) cache.set(mes, { em: agora().getTime(), dados });
    return dados;
  };
}

const padrao = criarMetaPublicados();
module.exports = { criarMetaPublicados, publicados: padrao, vincular };
