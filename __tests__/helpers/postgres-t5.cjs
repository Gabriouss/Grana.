/*
 * Postgres de verdade (PGlite) para testar gatilhos e restricoes do Grana.
 *
 * O schema NAO e copiado a mao: a tabela `transactions` e as colunas que as
 * migrations tocam saem do `supabase/schema.sql` por trecho, e as migrations
 * sao lidas dos arquivos reais. Se alguem mudar o schema e o trecho sumir,
 * `extrair` lanca erro em vez de testar um banco inventado.
 *
 * Nunca conecta a producao: PGlite roda em memoria, sem rede e sem credencial.
 * Fora do PGlite ficam so os stubs que o Supabase fornece: schema `auth`,
 * `auth.uid()` e os papeis.
 */
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..', '..');
const schema = fs.readFileSync(path.join(raiz, 'supabase', 'schema.sql'), 'utf8').replace(/\r\n/g, '\n');

function extrair(regex, rotulo) {
  const m = schema.match(regex);
  if (!m) throw new Error('trecho do schema.sql nao encontrado: ' + rotulo + ' (o schema mudou?)');
  return m[0];
}

function migration(nome) {
  const arq = fs.readdirSync(path.join(raiz, 'supabase', 'migrations')).find((f) => f.startsWith(nome));
  if (!arq) throw new Error('migration nao encontrada: ' + nome);
  return fs.readFileSync(path.join(raiz, 'supabase', 'migrations', arq), 'utf8').replace(/\r\n/g, '\n');
}

async function novoBanco() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid());
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  `);
  await db.exec(extrair(/create table if not exists credit_cards \([\s\S]*?\n\);/, 'credit_cards'));
  await db.exec(extrair(/create table if not exists wallets \([\s\S]*?\n\);/, 'wallets'));
  await db.exec(extrair(/create table if not exists transactions \([\s\S]*?\n\);/, 'transactions'));
  for (const col of ['installment_current', 'installment_total', 'payment_method', 'card_id', 'wallet_id', 'client_request_id']) {
    await db.exec(extrair(new RegExp('alter table (public\.)?transactions add column if not exists ' + col + '[^;]*;'), 'coluna ' + col));
  }
  await db.exec(extrair(/alter table transactions add constraint transactions_payment_method_check\n[^;]*;/, 'payment_method check'));
  await db.exec(extrair(/create unique index if not exists transactions_user_id_id_uniq\n[^;]*;/, 'indice user_id,id'));
  await db.exec(extrair(/create index if not exists transactions_parent_id_idx[^;]*;/, 'indice parent_id'));
  await db.exec(extrair(/alter table public\.transactions\n\s+add constraint transactions_parent_same_owner_fkey[^;]*;/, 'fk de mesmo dono'));
  return db;
}

async function aplicar(db, nome, trocas = []) {
  let sql = migration(nome);
  for (const [de, para] of trocas) {
    if (!sql.includes(de)) throw new Error('mutacao nao encontrou o trecho: ' + de);
    sql = sql.split(de).join(para);
  }
  await db.exec(sql);
}

async function novoUsuario(db) {
  const r = await db.query('insert into auth.users default values returning id');
  return r.rows[0].id;
}

/* Insere e devolve o id. `extra` sobrescreve colunas. */
async function inserir(db, user, extra = {}) {
  const l = { user_id: user, type: 'out', description: 'T5', amount: 1, category: 'Outros', occurred_on: '2026-01-05', ...extra };
  const cols = Object.keys(l);
  const r = await db.query(
    'insert into public.transactions (' + cols.join(',') + ') values (' + cols.map((_, i) => '$' + (i + 1)).join(',') + ') returning id',
    cols.map((c) => l[c]),
  );
  return r.rows[0]?.id;
}

async function tentar(fn) {
  try { await fn(); return { ok: true }; } catch (e) { return { ok: false, code: e.code, message: e.message, hint: e.hint }; }
}

module.exports = { novoBanco, aplicar, novoUsuario, inserir, tentar, migration };
