/* Guardas da migration de idempotência da fila offline (24/09/2026).
 *
 *   node __tests__/idempotencia-fila-offline.cjs
 *
 * `supabase/migrations/20260924230000_idempotencia_fila_offline.sql` dá a
 * `transactions` e `bills` a chave `client_request_id`, única por usuário, e
 * faz `adicionar_compra_parcelada` devolver a série existente quando a mesma
 * chave chega de novo. A migration foi EXECUTADA num Postgres embutido fora do
 * repositório (E:\Grana-temporarios\credito-ciclo\pglite\teste-idempotencia.mjs,
 * 20/20 checagens, partindo da função de produção). Aqui ficam as guardas de
 * texto que qualquer edição futura precisa respeitar, e a igualdade com o
 * `schema.sql`.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const migration = ler('supabase/migrations/20260924230000_idempotencia_fila_offline.sql');
const schema = ler('supabase/schema.sql');
let passou = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };

/* Código SQL sem os comentários de linha (os comentários citam o que NÃO fazer). */
const semComentario = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const sql = semComentario(migration);

for (const tabela of ['transactions', 'bills']) {
  ok(new RegExp(`alter table public\\.${tabela} add column if not exists client_request_id uuid;`).test(sql),
    `${tabela}: coluna client_request_id uuid, nula (APK antigo não manda a chave)`);
  const indice = sql.match(new RegExp(`create unique index if not exists ${tabela}_user_client_request_uniq\\s+on public\\.${tabela} \\(user_id, client_request_id\\)([^;]*);`));
  ok(indice, `${tabela}: índice único por (user_id, client_request_id)`);
  ok(indice && !/where/i.test(indice[1]), `${tabela}: índice NÃO parcial (o PostgREST não infere índice parcial no ON CONFLICT)`);
  ok(!/nulls not distinct/i.test(indice?.[1] ?? ''), `${tabela}: NULL continua distinto (várias linhas sem chave convivem)`);
}

ok(/drop function if exists public\.adicionar_compra_parcelada\(text, numeric, text, text, date, integer, text, text, uuid, uuid\);/.test(sql),
  'a assinatura antiga de 10 parâmetros sai (duas no banco = ambiguidade no PostgREST)');
ok(/p_client_request_id uuid default null\n\)/.test(sql), 'o parâmetro novo é o último e tem default null (chamada antiga continua casando)');
ok(/revoke all on function public\.adicionar_compra_parcelada\(text, numeric, text, text, date, integer, text, text, uuid, uuid, uuid\) from public, anon;/.test(sql),
  'revoga de public e anon na assinatura nova');
ok(/grant execute on function public\.adicionar_compra_parcelada\(text, numeric, text, text, date, integer, text, text, uuid, uuid, uuid\) to authenticated;/.test(sql),
  'concede a authenticated na assinatura nova');
ok(/security definer\nset search_path = ''/.test(sql), 'continua security definer com search_path vazio');

const corpo = sql.slice(sql.indexOf('create or replace function public.adicionar_compra_parcelada('), sql.indexOf('$$;') + 3);
ok(corpo.indexOf('tem_direito_acesso()') < corpo.indexOf('client_request_id = p_client_request_id'),
  'o acesso é conferido ANTES de devolver série existente');
const buscasPelaChave = corpo.match(/where t\.user_id = v_user and t\.client_request_id = p_client_request_id/g) ?? [];
ok(buscasPelaChave.length === 2, 'as duas buscas pela chave filtram pelo dono (reenvio e corrida)');
ok(/exception when unique_violation then\n\s+-- [^\n]*\n\s+if p_client_request_id is null then raise; end if;/.test(migration.replace(/\r\n/g, '\n')),
  'unique_violation só é engolido quando há chave; sem chave, sobe');
ok(/case when serie\.i = 1 then p_client_request_id else null end/.test(corpo), 'a chave vai só na primeira parcela');
ok((migration.match(/\$\$/g) ?? []).length % 2 === 0, 'delimitadores $$ pareados (a geração por script já trocou $$ por $)');

/* O schema.sql descreve o banco depois da migration: o bloco tem de ser o mesmo. */
const blocoMigration = migration.slice(migration.indexOf('alter table public.transactions add column if not exists client_request_id uuid;')).trimEnd();
ok(schema.replace(/\r\n/g, '\n').includes(blocoMigration), 'schema.sql traz o mesmo bloco da migration, byte a byte');
ok((schema.match(/create or replace function public\.adicionar_compra_parcelada\(/g) ?? []).length === 1,
  'schema.sql tem uma definição só da função');
ok(!/grant execute on function public\.adicionar_compra_parcelada\(text, numeric, text, text, date, integer, text, text, uuid, uuid\) to/.test(schema),
  'schema.sql não concede mais a assinatura antiga');

console.log(`idempotencia-fila-offline: ${passou} checagens OK`);
