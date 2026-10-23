-- SOMENTE apos gate da raiz e prova real do canal. Falha reverte a habilitacao inteira.
begin;
set local lock_timeout='5s';
select id from public.admin_marketing_controles where id for update;
do $$ begin
 if not exists(select 1 from public.admin_marketing_email_outbox where entrega_estado='entregue' and entrega_verificada_em is not null)
 then raise exception 'email-entrega-nao-verificada';end if;
 update public.admin_marketing_controles set politica_2h_habilitada=true where id;
 if not public.admin_marketing_real_politica_pronta() then raise exception 'integracoes-nao-prontas';end if;
end $$;
commit;
