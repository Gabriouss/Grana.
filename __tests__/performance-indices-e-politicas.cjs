/* B4 (16/10/2026): advisors de performance. A migration só pode acrescentar
 * índice e reorganizar política sem mudar o resultado de consulta nenhuma.
 *
 * Checagem de texto sobre a migration. Se foi aplicada em produção se confere
 * com pg_indexes e pg_policies. */
const fs = require('node:fs');
const path = require('node:path');

const pasta = path.join(__dirname, '..', 'supabase', 'migrations');
const arquivo = fs.readdirSync(pasta).find((f) => /_performance_indices_e_politicas\.sql$/.test(f));

let falhou = 0;
function checar(nome, ok) {
  if (ok) console.log(`  ok  ${nome}`);
  else { falhou++; console.error(`  FALHOU  ${nome}`); }
}

checar('a migration da B4 existe', Boolean(arquivo));
const sql = arquivo ? fs.readFileSync(path.join(pasta, arquivo), 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase() : '';

for (const [tabela, coluna] of [['bills', 'parent_id'], ['whatsapp_pending', 'card_id'], ['admin_ajuste_pedidos', 'pai']]) {
  checar(`índice na FK ${tabela}.${coluna}`, new RegExp(`create index if not exists \\w+ on public\\.${tabela} \\(${coluna}\\)`).test(sql));
}
checar('não apaga índice nenhum', !/drop index/.test(sql));
checar('não mexe em tabela nem em grant', !/(alter table|drop table|grant |revoke )/.test(sql));

const CONDICAO = '(select auth.uid()) = user_id and (select public.tem_direito_acesso())';
for (const tabela of ['assistant_messages', 'assistant_memory']) {
  checar(`${tabela}: some a FOR ALL que duplicava o SELECT`, sql.includes(`drop policy if exists "${tabela}: dono com acesso escreve" on public.${tabela}`));
  checar(`${tabela}: nenhuma política nova de SELECT ou FOR ALL`, !new RegExp(`on public\\.${tabela} for (select|all)`).test(sql));
  checar(`${tabela}: não toca na política de leitura do dono`, !sql.includes(`"${tabela}: dono le sempre"`));
  for (const [cmd, nome, partes] of [['insert', 'insere', ['with check']], ['update', 'altera', ['using', 'with check']], ['delete', 'apaga', ['using']]]) {
    const inicio = sql.indexOf(`create policy "${tabela}: dono com acesso ${nome}"`);
    const bloco = inicio < 0 ? '' : sql.slice(inicio, sql.indexOf(';', inicio));
    checar(`${tabela}: ${cmd} só para authenticated`, bloco.includes(`for ${cmd} to authenticated`));
    for (const parte of partes) {
      checar(`${tabela}: ${cmd} mantém a mesma condição em ${parte}`, bloco.includes(`${parte} (${CONDICAO})`));
    }
  }
}

if (falhou) { console.error(`FALHOU performance-indices-e-politicas: ${falhou}`); process.exitCode = 1; }
else console.log('OK performance-indices-e-politicas.');
