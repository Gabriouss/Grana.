'use strict';
// Supabase (dono: Keel). Só leitura.
//
// Usa a Management API com SUPABASE_ACCESS_TOKEN: dados do projeto, Edge
// Functions e consultas SQL FIXAS escritas aqui (nenhuma vem do navegador).
// As consultas vão primeiro para o endpoint read-only; se ele não existir na
// conta, caem no endpoint comum, ainda só com estes SELECTs.
// Deploy de função e migration ficam FORA do painel (regra 11).

const fs = require('fs');
const path = require('path');
const { RAIZ, ler, tem, refSupabase } = require('../config.cjs');
const { pedirJson, ErroIntegracao } = require('./_http.cjs');
const gitLocal = require('./git-local.cjs');

const API = 'https://api.supabase.com/v1';

function ausente(motivo) {
  return { status: 'ausente', motivo };
}

function pronto() {
  if (!tem('SUPABASE_ACCESS_TOKEN')) return ausente('SUPABASE_ACCESS_TOKEN não está no .env.');
  if (!refSupabase()) return ausente('EXPO_PUBLIC_SUPABASE_URL não está no .env ou não tem o formato esperado.');
  return null;
}

function cab() {
  return { Authorization: `Bearer ${ler('SUPABASE_ACCESS_TOKEN')}` };
}

async function mgmt(caminho) {
  const r = await pedirJson('Supabase', `${API}/projects/${refSupabase()}${caminho}`, { cabecalhos: cab() });
  if (r.status >= 400) throw new ErroIntegracao('supabase-http', `Supabase: HTTP ${r.status} em ${caminho || '/'}.`);
  return r.dados;
}

let semReadOnly = false;
async function sql(consulta) {
  const ref = refSupabase();
  if (!semReadOnly) {
    const r = await pedirJson('Supabase', `${API}/projects/${ref}/database/query/read-only`, { metodo: 'POST', cabecalhos: cab(), corpo: { query: consulta } });
    if (r.status === 404 || r.status === 405) semReadOnly = true;
    else if (r.status >= 400) throw new ErroIntegracao('supabase-sql', `Supabase: consulta recusada (HTTP ${r.status}).`, 502, JSON.stringify(r.dados));
    else return r.dados || [];
  }
  const r = await pedirJson('Supabase', `${API}/projects/${ref}/database/query`, { metodo: 'POST', cabecalhos: cab(), corpo: { query: consulta } });
  if (r.status >= 400) throw new ErroIntegracao('supabase-sql', `Supabase: consulta recusada (HTTP ${r.status}).`, 502, JSON.stringify(r.dados));
  return r.dados || [];
}

/** g***@gmail.com */
function mascararEmail(email) {
  const s = String(email || '');
  const i = s.indexOf('@');
  if (i < 1) return s ? '***' : null;
  return `${s[0]}***${s.slice(i)}`;
}

async function tabelaExiste(nome) {
  const r = await sql(`select to_regclass('public.${nome}') is not null as existe`);
  return !!(r[0] && r[0].existe);
}

async function projeto() {
  const falta = pronto();
  if (falta) return falta;
  const p = await mgmt('');
  return { status: 'ok', ref: p.id || refSupabase(), nome: p.name, regiao: p.region, estado: p.status, criadoEm: p.created_at, postgres: p.database && p.database.version };
}

async function resumo() {
  const falta = pronto();
  if (falta) return falta;
  // Uma consulta só (cada ida à Management API custa ~1,5s). Tabela ausente
  // vira null pelo to_regclass, sem quebrar a consulta inteira.
  const [proj, linhas] = await Promise.all([
    projeto(),
    sql(`select json_build_object(
      'usuarios', (select json_build_object(
          'total', count(*)::int,
          'ultimos7', count(*) filter (where created_at > now() - interval '7 days')::int,
          'ultimos30', count(*) filter (where created_at > now() - interval '30 days')::int,
          'confirmados', count(*) filter (where email_confirmed_at is not null)::int) from auth.users),
      'cadastros', (select coalesce(json_agg(c), '[]'::json) from (select created_at, email from auth.users order by created_at desc limit 10) c),
      'temAssinaturas', to_regclass('public.subscriptions') is not null,
      'temPush', to_regclass('public.push_tokens') is not null
    ) as r`),
  ]);
  const base = (linhas[0] && linhas[0].r) || {};
  const usuarios = [base.usuarios || null];
  const cadastros = base.cadastros || [];

  const extras = await Promise.all([
    base.temAssinaturas ? sql(`select coalesce(status::text, 'sem status') as status, count(*)::int as total from public.subscriptions group by 1 order by 2 desc`) : null,
    base.temPush ? sql(`select count(*)::int as total, count(distinct user_id)::int as usuarios from public.push_tokens`) : null,
  ]);

  let assinaturas = { status: 'ausente', motivo: 'Tabela de assinaturas não encontrada.' };
  if (extras[0]) {
    const ls = extras[0];
    assinaturas = { status: 'ok', tabela: 'subscriptions', porStatus: ls, ativas: ls.filter((l) => /^(active|ativa|trialing|paid|aprovada)$/i.test(l.status)).reduce((s, l) => s + l.total, 0) };
  }
  let pushTokens = { status: 'ausente', motivo: 'Tabela push_tokens não encontrada.' };
  if (extras[1]) pushTokens = { status: 'ok', ...extras[1][0] };

  return {
    status: 'ok',
    projeto: proj,
    usuarios: usuarios[0] || null,
    assinaturas,
    pushTokens,
    ultimosCadastros: cadastros.map((c) => ({ data: c.created_at, email: mascararEmail(c.email) })),
  };
}

function memo(fn) {
  const cache = new Map();
  return (k) => { if (!cache.has(k)) cache.set(k, fn(k)); return cache.get(k); };
}

// Arquivos de supabase/functions/_shared/ que a função importa, seguindo também
// os imports relativos entre os próprios arquivos de _shared. Só lê .ts locais.
const RE_IMPORT = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
function lerImports(arquivo) {
  let texto = '';
  try { texto = fs.readFileSync(arquivo, 'utf8'); } catch { return []; }
  return [...texto.matchAll(RE_IMPORT)].map((m) => m[1]);
}
function sharedImportados(slug) {
  const base = path.join(RAIZ, 'supabase', 'functions');
  const pastaShared = path.join(base, '_shared');
  const achados = new Set();
  const fila = [];
  const visitar = (deArquivo) => {
    for (const alvo of lerImports(deArquivo)) {
      if (!alvo.startsWith('.')) continue;
      const abs = path.resolve(path.dirname(deArquivo), alvo);
      const rel = path.relative(pastaShared, abs);
      if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
      const chave = rel.split(path.sep).join('/');
      if (!achados.has(chave)) { achados.add(chave); fila.push(abs); }
    }
  };
  let arquivos = [];
  try {
    arquivos = fs.readdirSync(path.join(base, slug), { recursive: true })
      .map(String).filter((n) => /\.(ts|tsx|js|mjs)$/.test(n)).map((n) => path.join(base, slug, n));
  } catch { return []; }
  arquivos.forEach(visitar);
  while (fila.length) visitar(fila.shift());
  return [...achados].sort();
}

async function funcoes() {
  const falta = pronto();
  if (falta) return falta;
  const lista = await mgmt('/functions');
  const commitDoArquivo = memo((rel) => gitLocal.ultimoCommit(`supabase/functions/_shared/${rel}`));
  const itens =(Array.isArray(lista) ? lista : []).map((f) => {
    const atualizadoMs = typeof f.updated_at === 'number' ? f.updated_at : Date.parse(f.updated_at);
    // O pacote publicado leva a pasta da função e os arquivos de _shared que ela
    // IMPORTA (direta ou indiretamente). Comparar com o commit mais novo de
    // _shared inteiro acusava 7 de 8 funções por um arquivo que só o assistente
    // importa (P1 do Vigil, 07/10/2026). Vale o commit mais novo entre a pasta
    // da função e os arquivos de _shared que estão no grafo de imports dela.
    const daFuncao = gitLocal.ultimoCommit(`supabase/functions/${f.slug}/`);
    const importados = sharedImportados(f.slug);
    let commit = daFuncao;
    let arquivoDeReferencia = null;
    for (const rel of importados) {
      const c = commitDoArquivo(rel);
      if (c && (!commit || Date.parse(c.data) > Date.parse(commit.data))) { commit = c; arquivoDeReferencia = `_shared/${rel}`; }
    }
    const commitMs = commit ? Date.parse(commit.data) : null;
    // Regra 11: deploy sem commit "por perto" é o sinal de código em produção
    // sem origem no main. Deploy até 24h depois do commit é o fluxo normal.
    let comparacao = 'sem-fonte-no-repositorio';
    if (commit) {
      const horas = (atualizadoMs - commitMs) / 3_600_000;
      if (horas > 24) comparacao = 'producao-mais-nova-que-o-repositorio';
      else if (horas >= 0) comparacao = 'publicada-logo-apos-o-commit';
      else comparacao = 'repositorio-mais-novo-que-a-producao';
    }
    return {
      slug: f.slug,
      nome: f.name,
      version: f.version,
      status: f.status,
      verify_jwt: f.verify_jwt,
      updated_at: Number.isFinite(atualizadoMs) ? new Date(atualizadoMs).toISOString() : null,
      ultimoCommitLocal: daFuncao, // último commit que tocou supabase/functions/<slug>/
      sharedImportados: importados.map((rel) => `_shared/${rel}`),
      commitDeReferencia: commit, // o mais novo entre a pasta da função e os _shared que ela importa
      arquivoDeReferencia, // null = a própria pasta da função; senão o arquivo de _shared que decidiu
      comparacao,
    };
  });
  const locais = fs.readdirSync(path.join(RAIZ, 'supabase', 'functions'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name);
  return {
    status: 'ok',
    itens,
    soNoRepositorio: locais.filter((s) => !itens.some((i) => i.slug === s)),
    alertas: itens.filter((i) => i.comparacao === 'producao-mais-nova-que-o-repositorio').map((i) => i.slug),
    pendentesDePublicacao: itens.filter((i) => i.comparacao === 'repositorio-mais-novo-que-a-producao').map((i) => i.slug),
    observacao: 'Regra 11: compare updated_at com o histórico, não o número da versão. Publicação mais de 24h depois do último commit pede conferência (pode ser só republicação do mesmo código). Publicar função fica fora do painel.',
  };
}

function migrations() {
  const pasta = path.join(RAIZ, 'supabase', 'migrations');
  let nomes = [];
  try { nomes = fs.readdirSync(pasta).filter((n) => n.endsWith('.sql')).sort(); } catch { return ausente('Pasta supabase/migrations não encontrada.'); }
  const itens = nomes.map((nome) => {
    const m = nome.match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?_(.+)\.sql$/);
    return {
      nome,
      data: m ? `${m[1]}-${m[2]}-${m[3]}${m[4] ? `T${m[4]}:${m[5] || '00'}:${m[6] || '00'}` : ''}` : null,
      descricao: m ? m[7].replace(/_/g, ' ') : nome,
    };
  }).reverse();
  return {
    status: 'ok',
    total: itens.length,
    itens,
    observacao: 'Lista do repositório. O projeto não tem schema_migrations, então o painel não afirma quais foram aplicadas em produção (regra 9).',
  };
}

async function appRelease() {
  const falta = pronto();
  if (falta) return falta;
  if (!(await tabelaExiste('app_release'))) return ausente('Tabela app_release não encontrada.');
  const r = await sql(`select * from public.app_release order by id limit 1`);
  if (!r[0]) return { status: 'ok', linha: null };
  const { version, apk_url, apk_expires_at, notes, updated_at, created_at, published_at } = r[0];
  return { status: 'ok', linha: { version, apk_url, apk_expires_at, notes, updated_at: updated_at || published_at || created_at || null } };
}

/** Status leve para a visão geral. */
async function status() {
  const falta = pronto();
  if (falta) return falta;
  const p = await projeto();
  return { status: 'ok', estado: p.estado, regiao: p.regiao };
}

module.exports = { projeto, resumo, funcoes, migrations, appRelease, status, mascararEmail };
