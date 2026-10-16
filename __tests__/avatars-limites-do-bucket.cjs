/*
 * V4-4 (16/10/2026): limites do bucket `avatars`, executando o SQL real num Postgres embutido.
 *
 *   node __tests__/avatars-limites-do-bucket.cjs
 *
 * Trava: bucket com tamanho e MIME limitados; avatar legítimo ({uid}/avatar.jpg) grava e
 * regrava; outro nome na própria pasta e pasta alheia são recusados; leitura e remoção de
 * arquivo antigo continuam; objeto antigo e o bucket marketing não são tocados.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let passou = 0;
const ok = (c, nome) => { assert.ok(c, nome); passou++; };
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261016010000_avatars_limites_do_bucket.sql'), 'utf8');
ok(/N[ÃA]O APLICADA/.test(sql), 'marcada como não aplicada');
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const dono = (cond) => `bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text${cond ? ' and ' + cond : ''}`;
(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon;
      create schema storage; create schema auth;
      create table storage.buckets (id text primary key, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id serial primary key, bucket_id text, name text);
      create function storage.foldername(n text) returns text[] language sql as 'select string_to_array(n, ''/'')';
      create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''app.uid'', true), '''')::uuid';
      alter table storage.objects enable row level security;
      grant usage on schema storage, auth to authenticated; grant all on storage.objects to authenticated;
      grant usage, select on all sequences in schema storage to authenticated;
      grant execute on function auth.uid() to authenticated;
      insert into storage.buckets values ('avatars', false, null, null), ('marketing', false, null, null);
      insert into storage.objects (bucket_id, name) values ('avatars', '${A}/velho.png'), ('marketing', 'peca.mp4');
      create policy "avatars: dono lê o próprio arquivo" on storage.objects for select to authenticated using (${dono()});
      create policy "avatars: dono grava na própria pasta" on storage.objects for insert to authenticated with check (${dono()});
      create policy "avatars: dono atualiza a própria foto" on storage.objects for update to authenticated using (${dono()}) with check (${dono()});
      create policy "avatars: dono apaga a própria foto" on storage.objects for delete to authenticated using (${dono()});`);
    await db.exec(sql);
    await db.exec(sql); // reaplicar é inofensivo

    const { rows: [av] } = await db.query(`select file_size_limit, allowed_mime_types, public from storage.buckets where id='avatars'`);
    ok(Number(av.file_size_limit) === 524288 && av.allowed_mime_types.join() === 'image/jpeg' && av.public === false, 'avatars: 512 KB, só image/jpeg, continua privado');
    const { rows: [mk] } = await db.query(`select file_size_limit, allowed_mime_types from storage.buckets where id='marketing'`);
    ok(mk.file_size_limit === null && mk.allowed_mime_types === null, 'marketing não foi tocado');
    const { rows: [n] } = await db.query(`select count(*)::int c from storage.objects`);
    ok(n.c === 2, 'nenhum objeto existente foi apagado');

    const como = async (uid, consulta) => {
      await db.exec(`set app.uid = '${uid}'; set role authenticated`);
      try { return await db.query(consulta); } finally { await db.exec('reset role'); }
    };
    const recusa = async (uid, consulta) => { try { await como(uid, consulta); return false; } catch { return true; } };

    await como(A, `insert into storage.objects (bucket_id, name) values ('avatars', '${A}/avatar.jpg')`);
    ok(true, 'avatar legítimo grava em {uid}/avatar.jpg');
    const up = await como(A, `update storage.objects set name = name where name = '${A}/avatar.jpg' returning id`);
    ok(up.rows.length === 1, 'troca da foto (upsert) continua permitida');
    ok(await recusa(A, `insert into storage.objects (bucket_id, name) values ('avatars', '${A}/lixo.bin')`), 'outro nome na própria pasta é recusado');
    ok(await recusa(A, `insert into storage.objects (bucket_id, name) values ('avatars', '${A}/sub/avatar.jpg')`), 'subpasta é recusada');
    ok(await recusa(A, `insert into storage.objects (bucket_id, name) values ('avatars', '${B}/avatar.jpg')`), 'pasta de outro usuário é recusada');
    ok(await recusa(A, `update storage.objects set name = '${A}/outro.jpg' where name = '${A}/avatar.jpg'`), 'renomear para outro nome é recusado');
    const lido = await como(A, `select name from storage.objects where bucket_id='avatars'`);
    ok(lido.rows.length === 2, 'dono ainda lê os dois arquivos, inclusive o antigo');
    ok((await como(B, `select name from storage.objects where bucket_id='avatars'`)).rows.length === 0, 'outro usuário não lê nada');
    const del = await como(A, `delete from storage.objects where name = '${A}/velho.png' returning id`);
    ok(del.rows.length === 1, 'dono ainda remove arquivo antigo com outro nome');
    console.log(`avatars-limites-do-bucket: ${passou} checagens passaram — 0 falhas`);
  } finally { await db.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
