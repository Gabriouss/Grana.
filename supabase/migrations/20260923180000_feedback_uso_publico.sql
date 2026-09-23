-- 23/09/2026 — Autorização para usar o feedback publicamente, e anonimização
-- completa quando a conta é excluída.
--
-- Pedido do autor: "precisamos manter os feedbacks para ajustes do aplicativo
-- e geração de prova social" e "adicione a caixa de permissão do uso do
-- feedback do usuário para futuras necessidades de uso".
--
-- Por que a caixa existe. A LGPD tira o dado ANONIMIZADO do alcance da lei
-- (art. 12), e é isso que permite guardar o feedback para sempre depois da
-- exclusão da conta. Só que depoimento com nome não é anônimo por definição:
-- usar publicamente COM atribuição precisa de autorização específica, colhida
-- na hora. A coluna guarda essa autorização por feedback, e não por pessoa —
-- quem autoriza hoje não autoriza para sempre, autoriza aquele comentário.
--
-- Nasce `false` e o formulário nasce desmarcado, sempre: caixa pré-marcada não
-- é consentimento.
--
-- Depois da exclusão da conta o `user_id` some, então não há mais a quem
-- atribuir — o feedback autorizado só pode ser usado de forma anônima a partir
-- dali. Isso é consequência da anonimização, não uma regra separada.
--
-- NÃO aplicada em produção por esta sessão: aplicar é decisão do autor. Este
-- projeto não tem supabase_migrations.schema_migrations (regra 9 do
-- AGENTS.md), então a aplicação é manual e precisa ser registrada quando
-- acontecer.

alter table public.feedbacks
  add column if not exists public_use_consent boolean not null default false;

comment on column public.feedbacks.public_use_consent is
  'A pessoa autorizou o uso público deste comentário (prova social). Colhido no envio, nunca pré-marcado. Depois da exclusão da conta o vínculo some e o uso só pode ser anônimo.';
