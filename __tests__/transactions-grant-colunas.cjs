/* Toda coluna acrescentada a `transactions` por migration precisa de grant de
 * INSERT para `authenticated`, senão o cliente que a envia leva
 * "permission denied for table transactions".
 *
 * Origem (25/09/2026): a migration 20260924230000 criou `client_request_id` e
 * não a incluiu no `grant insert (colunas)` que protege a tabela. O `tsc`, a
 * suíte e o Expo Go com dados em cache não pegam: só o servidor recusa, na hora
 * de gravar. O grant foi corrigido em 20260925030000.
 *
 * Checagem de texto sobre schema.sql + supabase/migrations. Só olha o que está
 * no repositório: se o SQL foi ou não aplicado em produção se confere com
 * has_column_privilege (regra 9 do AGENTS.md). */
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const migrations = fs.readdirSync(path.join(raiz, 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => fs.readFileSync(path.join(raiz, 'supabase', 'migrations', f), 'utf8'));
const schema = fs.readFileSync(path.join(raiz, 'supabase', 'schema.sql'), 'utf8');
const tudo = [schema, ...migrations].map((s) => s.replace(/--.*$/gm, '')).join('\n');

let falhou = 0;
function checar(nome, ok) {
  if (ok) console.log(`  ok  ${nome}`);
  else { falhou++; console.error(`  FALHOU  ${nome}`); }
}

/* Colunas gravadas só pelo servidor (webhook do WhatsApp, service_role): o
 * cliente não pode forjá-las, então a AUSÊNCIA de grant é o desenho. */
const SO_SERVIDOR = new Set(['source', 'source_event_id']);

const adicionadas = [...new Set([...tudo.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?public\.transactions\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?/gi)]
  .map((m) => m[1].toLowerCase()))].filter((c) => !SO_SERVIDOR.has(c));

const colunasComInsert = new Set();
for (const m of tudo.matchAll(/grant\s+insert\s*\(([^)]*)\)\s*on\s+public\.transactions\s+to\s+authenticated/gi)) {
  m[1].split(',').map((c) => c.trim().toLowerCase()).filter(Boolean).forEach((c) => colunasComInsert.add(c));
}
const colunasComUpdate = new Set();
for (const m of tudo.matchAll(/grant\s+update\s*\(([^)]*)\)\s*on\s+public\.transactions\s+to\s+authenticated/gi)) {
  m[1].split(',').map((c) => c.trim().toLowerCase()).filter(Boolean).forEach((c) => colunasComUpdate.add(c));
}

checar('achou colunas acrescentadas a transactions por migration', adicionadas.length > 0);
checar('source e source_event_id continuam SEM grant de INSERT (só o servidor as grava)', !colunasComInsert.has('source') && !colunasComInsert.has('source_event_id'));
for (const coluna of adicionadas) {
  checar(`transactions.${coluna} tem grant de INSERT para authenticated`, colunasComInsert.has(coluna));
}
checar('client_request_id nunca é atualizável pelo cliente (chave imutável)', !colunasComUpdate.has('client_request_id'));
checar('o grant de INSERT protegido continua existindo (revoke de tabela + grant de colunas)',
  /revoke\s+insert\s+on\s+public\.transactions\s+from\s+authenticated/i.test(tudo) && colunasComInsert.size > 10);

if (falhou) { console.error(`FALHOU transactions-grant-colunas: ${falhou}`); process.exitCode = 1; }
else console.log('OK transactions-grant-colunas.');
