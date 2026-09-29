-- Restore two user-facing error messages without replacing any other part of
-- the live function. ASCII-only on purpose: this survives clients that send
-- a SQL file through a non-UTF-8 terminal.
-- The MD5 guards make a second run a no-op and reject unreviewed live changes.
do $migration$
declare
  v_oid oid := to_regprocedure('public.reatribuir_wallet_antes_de_excluir()');
  v_before text;
  v_after text;
  v_bad_principal text := 'A carteira Principal n' || chr(65533) || 'o pode ser exclu' || chr(65533) || 'da';
  v_good_principal text := 'A carteira Principal n' || chr(227) || 'o pode ser exclu' || chr(237) || 'da';
  v_bad_user text := 'Usu' || chr(65533) || 'rio sem carteira Principal para receber os dados';
  v_good_user text := 'Usu' || chr(225) || 'rio sem carteira Principal para receber os dados';
  v_owner oid;
  v_acl aclitem[];
  v_security boolean;
  v_config text[];
  v_volatility "char";
  v_parallel "char";
begin
  if v_oid is null then
    raise exception 'reatribuir_wallet_antes_de_excluir() is missing';
  end if;

  v_before := pg_get_functiondef(v_oid);
  if md5(v_before) = '4b1447a1619620034509343a751a602f' then
    return;
  end if;
  if md5(v_before) <> '7daa570c03ab75dc52e3dd3cc308d6f3' then
    raise exception 'reatribuir_wallet_antes_de_excluir() changed since the read-only preflight';
  end if;

  select proowner, proacl, prosecdef, proconfig, provolatile, proparallel
    into v_owner, v_acl, v_security, v_config, v_volatility, v_parallel
    from pg_proc where oid = v_oid;

  v_after := replace(replace(v_before, v_bad_principal, v_good_principal), v_bad_user, v_good_user);
  if md5(v_after) <> '4b1447a1619620034509343a751a602f' then
    raise exception 'Unexpected function text after UTF-8 replacement';
  end if;

  execute v_after;

  if md5(pg_get_functiondef(v_oid)) <> '4b1447a1619620034509343a751a602f'
     or exists (
       select 1 from pg_proc
        where oid = v_oid
          and (proowner is distinct from v_owner
            or proacl is distinct from v_acl
            or prosecdef is distinct from v_security
            or proconfig is distinct from v_config
            or provolatile is distinct from v_volatility
            or proparallel is distinct from v_parallel)
     ) then
    raise exception 'Function body, owner, grants, security or configuration changed unexpectedly';
  end if;
end;
$migration$;
