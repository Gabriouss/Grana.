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
const { RAIZ, SIMULAR, ler, tem, refSupabase } = require('../config.cjs');
const { pedirJson, ErroIntegracao } = require('./_http.cjs');
const gitLocal = require('./git-local.cjs');
const recibos = require('./recibos-funcoes.cjs');

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

// Causa sem o corpo do provedor: a mensagem do Postgres pode citar o valor que falhou,
// e a causa vai para a resposta e para o log do painel (O-01 da revisão LGPD, 24/10/2026).
// Fica só o status e o código SQLSTATE, que bastam para achar a origem.
function causaSql(r) {
  const m = /ERROR:\s+([0-9A-Z]{5})\b/.exec(typeof r.dados?.message === 'string' ? r.dados.message : '');
  return `HTTP ${r.status}${m ? ` SQLSTATE ${m[1]}` : ''}`;
}

let semReadOnly = false;
async function sql(consulta) {
  const ref = refSupabase();
  if (!semReadOnly) {
    const r = await pedirJson('Supabase', `${API}/projects/${ref}/database/query/read-only`, { metodo: 'POST', cabecalhos: cab(), corpo: { query: consulta } });
    if (r.status === 404 || r.status === 405) semReadOnly = true;
    else if (r.status >= 400) throw new ErroIntegracao('supabase-sql', `Supabase: consulta recusada (HTTP ${r.status}).`, 502, causaSql(r));
    else return r.dados || [];
  }
  const r = await pedirJson('Supabase', `${API}/projects/${ref}/database/query`, { metodo: 'POST', cabecalhos: cab(), corpo: { query: consulta } });
  if (r.status >= 400) throw new ErroIntegracao('supabase-sql', `Supabase: consulta recusada (HTTP ${r.status}).`, 502, causaSql(r));
  return r.dados || [];
}

const contagem = (v) => Number.isSafeInteger(v) && v >= 0 ? v : null;
const STATUS_ASSINATURA = new Set(['active', 'ativa', 'trialing', 'paid', 'aprovada', 'canceled', 'cancelled', 'inactive', 'expired', 'past_due', 'unpaid', 'pending', 'incomplete', 'incomplete_expired', 'paused']);

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
          'hoje', count(*) filter (where created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'))::int,
          'ultimos7', count(*) filter (where created_at > now() - interval '7 days')::int,
          'ultimos30', count(*) filter (where created_at > now() - interval '30 days')::int,
          'confirmados', count(*) filter (where email_confirmed_at is not null)::int) from auth.users),
      'temAssinaturas', to_regclass('public.subscriptions') is not null,
      'temPush', to_regclass('public.push_tokens') is not null
    ) as r`),
  ]);
  const base = (linhas[0] && linhas[0].r) || {};
  const usuarios = base.usuarios && ['total', 'hoje', 'ultimos7', 'ultimos30', 'confirmados'].every((k) => contagem(base.usuarios[k]) !== null)
    ? Object.fromEntries(['total', 'hoje', 'ultimos7', 'ultimos30', 'confirmados'].map((k) => [k, base.usuarios[k]])) : null;

  const extras = await Promise.all([
    base.temAssinaturas ? sql(`select coalesce(status::text, 'sem status') as status, count(*)::int as total from public.subscriptions group by 1 order by 2 desc`) : null,
    base.temPush ? sql(`select count(*)::int as total, count(distinct user_id)::int as usuarios from public.push_tokens`) : null,
  ]);

  let assinaturas = { status: 'ausente', motivo: 'Tabela de assinaturas não encontrada.' };
  if (extras[0]) {
    const ls = extras[0];
    if (Array.isArray(ls) && ls.every((l) => l && contagem(l.total) !== null)) {
      const agrupados = new Map();
      for (const l of ls) { const conhecido = typeof l.status === 'string' && STATUS_ASSINATURA.has(l.status.toLowerCase()); const status = conhecido ? l.status.toLowerCase() : 'outros'; agrupados.set(status, (agrupados.get(status) || 0) + l.total); }
      const porStatus = [...agrupados].map(([status, total]) => ({ status, total }));
      assinaturas = { status: 'ok', tabela: 'subscriptions', porStatus, ativas: porStatus.filter((l) => /^(active|ativa|trialing|paid|aprovada)$/.test(l.status)).reduce((s, l) => s + l.total, 0) };
    } else assinaturas = { status: 'indisponivel', motivo: 'Contagens de assinaturas indisponíveis.' };
  }
  let pushTokens = { status: 'ausente', motivo: 'Tabela push_tokens não encontrada.' };
  if (extras[1]) { const r = extras[1][0]; pushTokens = r && contagem(r.total) !== null && contagem(r.usuarios) !== null ? { status: 'ok', total: r.total, usuarios: r.usuarios } : { status: 'indisponivel', motivo: 'Contagens de push indisponíveis.' }; }

  return {
    status: 'ok',
    projeto: proj,
    usuarios,
    assinaturas,
    pushTokens,
  };
}

// Lista por conta: decisão do autor em 24/10/2026 ("2 com ultimo acesso"). Rota e tela
// próprias; resumo() continua só com números. Na lista o e-mail sai parcial, e completo só
// na busca pelo e-mail exato. Último acesso é a renovação mais recente da sessão (o app
// renova o token quando é usado depois de ~1 h): nada novo é gravado e o app não muda.
const EMAIL_BUSCA = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}$/;
const LIMITE_CONTAS = 500;
const ORIGEM_ASSINATURA = { interno: 'cortesia', cakto: 'venda', kiwify: 'venda' };
const isoOuNulo = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;

// Domínio de empresa ou de família identifica a pessoa mesmo com o começo do e-mail cortado
// (revisão LGPD do Lynx, 24/10/2026, L-04): só os provedores grandes saem inteiros.
const PROVEDORES_COMUNS = new Set(['gmail.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'yahoo.com', 'yahoo.com.br', 'live.com', 'uol.com.br', 'bol.com.br']);
const SUFIXOS_DUPLOS = new Set(['com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'co.uk']);

function mascararEmail(email) {
  const [local, dominio] = email.split('@');
  if (!local || !dominio) return 'e-mail fora do padrão';
  const inicio = `${local.slice(0, local.length > 2 ? 2 : 1)}•••@`;
  if (PROVEDORES_COMUNS.has(dominio)) return inicio + dominio;
  const partes = dominio.split('.');
  const sufixo = partes.length > 2 && SUFIXOS_DUPLOS.has(partes.slice(-2).join('.')) ? partes.slice(-2).join('.') : partes.slice(-1)[0];
  return `${inicio}${dominio[0]}•••.${sufixo}`;
}

async function contas(busca) {
  // QA de agente opera o painel com o mesmo .env; no modo simulado esta tela não lê produção
  // (revisão LGPD do Lynx, 24/10/2026, L-01).
  if (SIMULAR) return ausente('A tela Contas não abre no modo simulado: ela só lê contas reais.');
  const falta = pronto();
  if (falta) return falta;
  const email = busca == null ? null : String(busca).trim().toLowerCase();
  // O SQL vai como texto para a Management API: só passa e-mail sem aspas nem espaço.
  if (email !== null && (email.length > 254 || !EMAIL_BUSCA.test(email))) {
    throw new ErroIntegracao('pedido-invalido', 'Digite o e-mail completo da conta.', 400);
  }
  const linhas = await sql(`select coalesce(json_agg(c order by c.ultimo_acesso desc nulls last, c.cadastro desc), '[]'::json) as contas from (
    select u.email, u.created_at as cadastro, u.email_confirmed_at is not null as email_confirmado,
      u.last_sign_in_at as ultimo_login,
      greatest(u.last_sign_in_at,
        (select max(greatest(s.updated_at, s.refreshed_at at time zone 'UTC')) from auth.sessions s where s.user_id = u.id),
        (select max(coalesce(t.updated_at, t.created_at)) from auth.refresh_tokens t where t.user_id = u.id::text)) as ultimo_acesso,
      a.provider, a.status, a.access_until, a.grace_until
    from auth.users u
    left join lateral (select provider, status, access_until, grace_until from public.subscriptions s
      where s.user_id = u.id order by s.access_until desc nulls last limit 1) a on true
    ${email ? `where lower(u.email) = '${email}'` : ''}
    order by ultimo_acesso desc nulls last, u.created_at desc
    limit ${LIMITE_CONTAS}) c`);
  const brutas = linhas[0] && linhas[0].contas;
  if (!Array.isArray(brutas)) throw new ErroIntegracao('supabase-formato', 'Supabase: a lista de contas veio num formato inesperado.');
  const agora = Date.now();
  // DTO fechado: só estes campos saem, nunca id, IP ou aparelho da sessão.
  const lista = brutas.map((r) => {
    const acessoAte = isoOuNulo(r.access_until), carencia = isoOuNulo(r.grace_until);
    const status = typeof r.status === 'string' && ['active', 'canceled', 'past_due'].includes(r.status) ? r.status : 'outro';
    return {
      email: typeof r.email === 'string' ? (email ? r.email : mascararEmail(r.email)) : null,
      cadastro: isoOuNulo(r.cadastro),
      emailConfirmado: r.email_confirmado === true,
      ultimoLogin: isoOuNulo(r.ultimo_login),
      ultimoAcesso: isoOuNulo(r.ultimo_acesso),
      assinatura: typeof r.provider === 'string' ? {
        origem: ORIGEM_ASSINATURA[r.provider] || 'outra',
        status,
        comAcesso: (!!acessoAte && Date.parse(acessoAte) >= agora) || (status === 'past_due' && !!carencia && Date.parse(carencia) >= agora),
        acessoAte,
      } : null,
    };
  });
  const acessaramEm = (dias) => lista.filter((c) => c.ultimoAcesso && agora - Date.parse(c.ultimoAcesso) <= dias * 86_400_000).length;
  return {
    status: 'ok', busca: email !== null, contas: lista, limite: LIMITE_CONTAS,
    acessaram: email !== null ? null : { ultimos7: acessaramEm(7), ultimos30: acessaramEm(30) },
  };
}

function memo(fn) {
  const cache = new Map();
  return (k) => { if (!cache.has(k)) cache.set(k, fn(k)); return cache.get(k); };
}

async function funcoes() {
  const falta = pronto();
  if (falta) return falta;
  const lista = await mgmt('/functions');
  const commitDoArquivo = memo((rel) => gitLocal.ultimoCommit(rel));
  const pastaDaFuncao = (slug) => `supabase/functions/${slug}/`;
  const itens = await Promise.all((Array.isArray(lista) ? lista : []).map(async (f) => {
    const atualizadoMs = typeof f.updated_at === 'number' ? f.updated_at : Date.parse(f.updated_at);
    // O pacote publicado leva a pasta da função e tudo o que ela IMPORTA por
    // caminho relativo, direta ou indiretamente: _shared e também arquivos fora
    // dele, como lib/notification-catalog.ts nos lembretes. Vale o commit mais
    // novo entre a pasta da função e esses arquivos. (Antes: _shared inteiro
    // acusava 7 de 8 funções, P1 do Vigil; depois, só _shared deixava o
    // catálogo de fora, achado do Harbor de 07/10/2026.)
    const daFuncao = gitLocal.ultimoCommit(pastaDaFuncao(f.slug));
    const fontes = recibos.fontesDoPacote(f.slug);
    let commit = daFuncao;
    let arquivoDeReferencia = null;
    for (const rel of fontes) {
      if (rel.startsWith(pastaDaFuncao(f.slug))) continue; // já coberto pela pasta
      const c = commitDoArquivo(rel);
      if (c && (!commit || Date.parse(c.data) > Date.parse(commit.data))) { commit = c; arquivoDeReferencia = rel; }
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
    // Só um recibo de conferência de conteúdo apaga o alerta, e só enquanto
    // updated_at, pacote publicado e fontes locais forem os conferidos.
    let recibo = null;
    if (comparacao === 'producao-mais-nova-que-o-repositorio') {
      recibo = await recibos.conferirRecibo(f.slug, atualizadoMs);
      if (recibo.estado === 'valido') comparacao = 'publicada-depois-com-codigo-conferido';
    }
    return {
      slug: f.slug,
      nome: f.name,
      version: f.version,
      status: f.status,
      verify_jwt: f.verify_jwt,
      updated_at: Number.isFinite(atualizadoMs) ? new Date(atualizadoMs).toISOString() : null,
      ultimoCommitLocal: daFuncao, // último commit que tocou supabase/functions/<slug>/
      fontesDoPacote: fontes, // pasta da função + imports relativos transitivos
      commitDeReferencia: commit, // o mais novo entre a pasta e os arquivos importados
      arquivoDeReferencia, // null = a própria pasta da função; senão o arquivo importado que decidiu
      recibo, // null quando não houve alerta; senão { estado, motivo?, recibo }
      comparacao,
    };
  }));
  const locais = fs.readdirSync(path.join(RAIZ, 'supabase', 'functions'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name);
  return {
    status: 'ok',
    itens,
    soNoRepositorio: locais.filter((s) => !itens.some((i) => i.slug === s)),
    alertas: itens.filter((i) => i.comparacao === 'producao-mais-nova-que-o-repositorio').map((i) => i.slug),
    conferidas: itens.filter((i) => i.comparacao === 'publicada-depois-com-codigo-conferido').map((i) => i.slug),
    pendentesDePublicacao: itens.filter((i) => i.comparacao === 'repositorio-mais-novo-que-a-producao').map((i) => i.slug),
    observacao: 'Regra 11: compare updated_at com o histórico, não o número da versão. Publicação mais de 24h depois do último commit pede conferência (pode ser só republicação do mesmo código). O alerta só some com recibo de conferência de conteúdo válido para aquela publicação. Publicar função fica fora do painel.',
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

// Fixed, version-scoped CAS; only the local panel can call it after TOTP step-up.
async function regravarNotaRelease(versao, antes, aprovada) {
  if (pronto()) throw new ErroIntegracao('supabase-ausente', 'Supabase indisponivel.');
  if (!/^\d+\.\d+\.\d+$/.test(versao) || typeof antes !== 'string' || typeof aprovada !== 'string' || aprovada.length > 1024) throw new Error('nota-invalida');
  const literal = (v) => "'" + v.replace(/'/g, "''") + "'";
  const query = `update public.app_release set notes=${literal(aprovada)} where id=1 and version=${literal(versao)} and notes=${literal(antes)} returning version`;
  const r = await pedirJson('Supabase', `${API}/projects/${refSupabase()}/database/query`, { metodo: 'POST', cabecalhos: cab(), corpo: { query } });
  if (r.status >= 400 || !Array.isArray(r.dados) || r.dados.length !== 1) throw new ErroIntegracao('nota-nao-regravada', 'A nota mudou durante a conferencia ou a gravacao falhou. Confira de novo.');
  return { status: 'ok', versao };
}

module.exports = { projeto, resumo, contas, funcoes, migrations, appRelease, regravarNotaRelease, status };
