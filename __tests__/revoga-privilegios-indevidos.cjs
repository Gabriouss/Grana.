/* V-1 (15/10/2026): anon e authenticated não podem ter TRUNCATE, TRIGGER,
 * REFERENCES nem MAINTAIN em public, e anon não escreve em tabela nenhuma.
 * RLS não cobre TRUNCATE.
 *
 * Checagem de texto sobre supabase/migrations. Se o SQL foi aplicado em
 * produção se confere com has_table_privilege (regra 9 do AGENTS.md). Também
 * trava o contrário: SELECT de feedbacks/subscriptions continua com
 * authenticated, porque a exportação LGPD os lê. */
const fs = require('node:fs');
const path = require('node:path');

const pasta = path.join(__dirname, '..', 'supabase', 'migrations');
const arquivo = fs.readdirSync(pasta).find((f) => /revoga_privilegios_indevidos\.sql$/.test(f));

let falhou = 0;
function checar(nome, ok) {
  if (ok) console.log(`  ok  ${nome}`);
  else { falhou++; console.error(`  FALHOU  ${nome}`); }
}

checar('a migration da V-1 existe', Boolean(arquivo));
const sql = arquivo ? fs.readFileSync(path.join(pasta, arquivo), 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase() : '';

checar('revoga truncate/references/trigger/maintain de anon e authenticated em todas as tabelas',
  sql.includes('revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated'));
checar('anon perde insert/update/delete em todas as tabelas',
  sql.includes('revoke insert, update, delete on all tables in schema public from anon'));
checar('default privileges do postgres também revogam truncate e afins',
  /alter default privileges for role postgres in schema public revoke truncate, references, trigger, maintain on tables from anon, authenticated/.test(sql));
checar('default privileges do postgres tiram escrita de anon',
  /alter default privileges for role postgres in schema public revoke insert, update, delete on tables from anon/.test(sql));

for (const [tabela, privs] of [
  ['feedbacks', 'update, delete'],
  ['subscriptions', 'insert, update, delete'],
  ['app_release', 'insert, update, delete'],
  ['credit_card_invoices', 'update'],
]) {
  checar(`authenticated perde ${privs} em ${tabela}`, sql.includes(`revoke ${privs} on public.${tabela} from authenticated`));
}

/* O que NÃO pode sair: quebraria o app em uso. */
checar('nunca revoga SELECT de authenticated em massa', !/revoke [a-z, ]*select[a-z, ]* on all tables in schema public from [a-z, ]*authenticated/.test(sql));
for (const tabela of ['feedbacks', 'subscriptions', 'app_release', 'transactions', 'credit_card_invoices']) {
  checar(`${tabela} mantém SELECT para authenticated`,
    !new RegExp(`revoke [a-z, ]*select[a-z, ]* on public\\.${tabela} from [a-z, ]*authenticated`).test(sql));
}
checar('feedbacks mantém INSERT para authenticated', !/revoke [a-z, ]*insert[a-z, ]* on public\.feedbacks from/.test(sql));
for (const fn of ['buscar_exemplos_similares', 'registrar_memoria_assistente']) {
  checar(`${fn} continua executável por authenticated (assistente usa o JWT do usuário)`,
    !new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from [a-z, ]*authenticated`).test(sql));
}
for (const fn of ['buscar_exemplos_similares', 'registrar_memoria_assistente', 'validar_wallet_do_usuario']) {
  checar(`${fn} perde EXECUTE de PUBLIC e anon (sem heranca que reabra anon)`,
    new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public, anon`).test(sql));
}

if (falhou) { console.error(`FALHOU revoga-privilegios-indevidos: ${falhou}`); process.exitCode = 1; }
else console.log('OK revoga-privilegios-indevidos.');
