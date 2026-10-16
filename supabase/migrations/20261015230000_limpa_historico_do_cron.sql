-- NÃO APLICADA em produção até a liberação do autor (B1, 15/10/2026).
--
-- O pg_cron grava uma linha em cron.job_run_details por execução e nunca
-- apaga. Em 15/10 eram 19 MB e 11.901 linhas (04/09 a 15/10), só com o job do
-- push a cada 5 min; com um executor de minuto em minuto o plano Free (500 MB)
-- acabaria em ~5,6 meses (viabilidade-anvil-custos.md da rodada).
--
-- Um job diário apaga o histórico com mais de 7 dias. Não toca em cron.job nem
-- nos jobs existentes: só cria (ou recria, pelo nome) o próprio job.
-- Horário: 03:17 UTC (00:17 em Brasília), fora do minuto cheio dos outros jobs.

select cron.unschedule(jobid)
from cron.job
where jobname = 'grana-limpa-historico-cron';

select cron.schedule(
  'grana-limpa-historico-cron',
  '17 3 * * *',
  $job$ delete from cron.job_run_details where start_time < now() - interval '7 days' $job$
);
