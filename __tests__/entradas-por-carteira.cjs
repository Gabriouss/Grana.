/* Guardas da RPC `entradas_por_carteira` (regra 20, 25/09/2026).
 *
 *   node __tests__/entradas-por-carteira.cjs
 *
 * O seletor de carteira deixou de mostrar saldo: mostra o total de entradas
 * de todo o período, por carteira. A migration
 * `20260925000000_entradas_por_carteira.sql` foi EXECUTADA num Postgres
 * embutido fora do repositório
 * (E:\Grana-temporarios\credito-ciclo\pglite\teste-entradas.mjs, 8/8). Aqui
 * ficam as guardas de texto e a igualdade com o `schema.sql`.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const migration = ler('supabase/migrations/20260925000000_entradas_por_carteira.sql');
const schema = ler('supabase/schema.sql');
const sql = migration.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
let passou = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };

ok(/returns table \(wallet_id uuid, entradas numeric\)/.test(sql), 'devolve (wallet_id, entradas)');
ok(/security definer\nset search_path = ''/.test(sql), 'security definer com search_path vazio, como as outras RPCs');
ok(/if v_user is null or not public\.tem_direito_acesso\(\) then\n\s+raise exception [^\n]+ using errcode = '42501';/.test(sql),
  'confere dono e direito de acesso, como a RLS de leitura de transactions');
ok(/where t\.user_id = v_user\n/.test(sql), 'filtra pelo dono (security definer ignora a RLS)');
ok(/and t\.type = 'in'\n/.test(sql), 'só entradas');
ok(/and coalesce\(t\.payment_method, ''\) <> 'credit'\n\s+and t\.card_id is null/.test(sql), 'estorno no cartão fica fora (mesma regra de caixa do app)');
ok(!/type = 'out'|-t\.amount|- t\.amount/.test(sql), 'não desconta saída: não é saldo');
ok(/revoke all on function public\.entradas_por_carteira\(\) from public, anon;/.test(sql), 'revoga de public e anon');
ok(/grant execute on function public\.entradas_por_carteira\(\) to authenticated;/.test(sql), 'concede a authenticated');
ok((migration.match(/\$\$/g) ?? []).length % 2 === 0, 'delimitadores $$ pareados');

const bloco = migration.slice(migration.indexOf('create or replace function public.entradas_por_carteira()')).trimEnd();
ok(schema.includes(bloco), 'schema.sql traz o mesmo bloco da migration, byte a byte');
ok((schema.match(/create or replace function public\.entradas_por_carteira\(/g) ?? []).length === 1, 'schema.sql tem uma definição só');

console.log(`entradas-por-carteira: ${passou} checagens OK`);
