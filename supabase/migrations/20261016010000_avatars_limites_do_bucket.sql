-- Bucket `avatars`: limite de tamanho, tipo e nome do arquivo (V4-4, 16/10/2026).
--
-- NÃO APLICADA: aguarda o autor (E:/Grana-temporarios/2026-10-15-tarde/PARA-O-AUTOR-APLICAR.md).
--
-- Hoje o bucket é privado e as policies prendem cada usuário à própria pasta, mas nada
-- limita tamanho, tipo ou nome: um cliente modificado grava qualquer arquivo, em qualquer
-- quantidade, dentro da própria pasta, e consome a cota de Storage compartilhada.
--
-- O contrato do app (lib/profile.ts, salvarFoto) é um JPEG de 512 px de largura, qualidade
-- 0,8, sempre em `{user_id}/avatar.jpg` com upsert. Isso dá dezenas de KB; 512 KB deixa
-- folga larga e ainda corta abuso.
--
-- O que muda e o que NÃO muda:
-- - `file_size_limit` e `allowed_mime_types` valem só para upload novo. Objeto que já está
--   no bucket não é tocado, nem apagado.
-- - Só INSERT e UPDATE passam a exigir o nome exato `{user_id}/avatar.jpg`. SELECT e DELETE
--   ficam como estão, então um arquivo antigo com outro nome continua legível e removível
--   pelo dono, e o `delete-account` continua limpando a pasta inteira.
-- - Build antiga do app já grava nesse caminho e nesse tipo: nada quebra para quem está
--   na versão instalada hoje.

update storage.buckets
set file_size_limit = 524288,
    allowed_mime_types = array['image/jpeg']
where id = 'avatars';

drop policy if exists "avatars: dono grava na própria pasta" on storage.objects;
create policy "avatars: dono grava na própria pasta"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.jpg');

drop policy if exists "avatars: dono atualiza a própria foto" on storage.objects;
create policy "avatars: dono atualiza a própria foto"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.jpg');
