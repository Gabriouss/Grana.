-- Fase 1: aditiva sobre 20261008190000. Somente no repositorio; NAO aplicada.
-- Altera apenas a lista de estados. Lease, aceite, RLS, grants e imutabilidade
-- continuam regidos pelas migrations anteriores.
begin;
alter table public.admin_ajuste_pedidos
  drop constraint if exists admin_ajuste_pedidos_estado_check;
alter table public.admin_ajuste_pedidos
  add constraint admin_ajuste_pedidos_estado_check check (estado in (
    'novo', 'em-correcao', 'corrigido-aguardando-aceite', 'aceito',
    'falha-de-envio', 'desatualizado', 'aguardando-aprovacao-de-custo',
    'precisa-de-atencao', 'encerrado', 'recusado-pelo-autor'));
commit;
