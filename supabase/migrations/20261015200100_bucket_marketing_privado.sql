-- Bucket `marketing` deixa de ser público (V-2, prioridade de vulnerabilidades, 15/10/2026).
--
-- NÃO APLICADA: aguarda o autor (E:/Grana-temporarios/2026-10-15-tarde/PARA-O-AUTOR-APLICAR.md).
--
-- O bucket foi criado em 12/10/2026 por um agente externo, com a service role, para a
-- API da Meta baixar o Reel do Padeiro e a imagem do Story ("o café, o delivery").
-- A Meta copia a mídia ao criar a publicação, então nada mais depende da URL pública:
-- nenhum arquivo versionado (app, landing, painel local, calendário) lê esse bucket.
-- Enquanto ele for público, qualquer pessoa com a URL baixa peças de campanha, inclusive
-- peças que ainda nem foram aceitas pelo autor.
--
-- Só retira acesso: os 4 objetos ficam onde estão e continuam acessíveis com a service
-- role ou por URL assinada (createSignedUrl), que é o caminho do plano de publicação.
-- Não existe policy em storage.objects que cite o bucket, então, sem `public`, `anon` e
-- `authenticated` deixam de ler. O app não usa este bucket.

update storage.buckets
set public = false
where id = 'marketing' and public = true;
