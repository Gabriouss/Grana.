/* B1 (15/10/2026): o histórico do pg_cron (cron.job_run_details) não pode
 * crescer sem limite no plano Free. A migration agenda um job diário que apaga
 * execuções com mais de 7 dias, sem mexer nos outros jobs.
 *
 * Checagem de texto sobre a migration. Se o job existe em produção se confere
 * com `select * from cron.job where jobname = 'grana-limpa-historico-cron'`. */
const fs = require('node:fs');
const path = require('node:path');

const pasta = path.join(__dirname, '..', 'supabase', 'migrations');
const arquivo = fs.readdirSync(pasta).find((f) => /limpa_historico_do_cron\.sql$/.test(f));

let falhou = 0;
function checar(nome, ok) {
  if (ok) console.log(`  ok  ${nome}`);
  else { falhou++; console.error(`  FALHOU  ${nome}`); }
}

checar('a migration da B1 existe', Boolean(arquivo));
const sql = arquivo ? fs.readFileSync(path.join(pasta, arquivo), 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase() : '';

checar('agenda o job pelo nome próprio', sql.includes("cron.schedule( 'grana-limpa-historico-cron'"));
checar('roda uma vez por dia', /'grana-limpa-historico-cron', '\d{1,2} \d{1,2} \* \* \*'/.test(sql));
checar('apaga só job_run_details com mais de 7 dias',
  sql.includes("delete from cron.job_run_details where start_time < now() - interval '7 days'"));
checar('é reaplicável: desagenda antes só o próprio job',
  sql.includes("cron.unschedule(jobid) from cron.job where jobname = 'grana-limpa-historico-cron'"));
checar('não desagenda nenhum outro job', (sql.match(/cron\.unschedule/g) || []).length === 1);
checar('não apaga nem altera cron.job', !/(delete from|update|truncate) cron\.job\b/.test(sql));
checar('não usa truncate no histórico', !/truncate/.test(sql));

if (falhou) { console.error(`FALHOU cron-limpa-historico: ${falhou}`); process.exitCode = 1; }
else console.log('OK cron-limpa-historico.');
