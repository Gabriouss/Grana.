-- NÃO APLICADA, aguarda autor.
-- M3: rascunho da fundação remota; não instala cron, executor, bucket ou API.
-- Mesmo modelo da fila administrativa: RLS sem policies e sem grants de cliente.
-- SOMENTE backend com service_role, após autorizarAdmin (ADMIN_USER_IDS, aal2,
-- TOTP), origem e CSRF. RLS não distingue administradores com service_role;
-- a autorização humana fica na API ainda NÃO implementada. Nunca expor a chave.
-- Não guarda tokens, URLs assinadas, dados financeiros individuais ou feedbacks.
-- Retenção é contrato de dados; limpeza e limites de consumo ainda não executam.
begin;

-- Um aceite por combinação exata de peça, conteúdo, destino e horário.
-- O manifesto contém hashes/ordem da arte, vídeo, capa, legenda e carrossel.
-- Novos conteúdo/destino/horário exigem nova linha; nunca editar o aceite.
create table public.admin_marketing_autorizacoes (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique check (chave ~ '^[0-9a-f]{64}$'),
  admin_id uuid not null,
  peca_id text not null check (peca_id ~ '^[0-9a-f]{16}$'),
  versao text not null check (versao ~ '^[0-9a-f]{40}$'),
  manifesto jsonb not null check (jsonb_typeof(manifesto) = 'object' and octet_length(manifesto::text) between 2 and 65536),
  rede text not null check (rede in ('facebook', 'instagram')),
  conta_destino text not null check (conta_destino ~ '^[0-9]{1,40}$'),
  formato text not null check (formato in ('feed', 'reels', 'stories')),
  publicar_em timestamptz not null,
  fuso text not null default 'America/Sao_Paulo' check (fuso = 'America/Sao_Paulo'),
  confirmado_em timestamptz not null default now(),
  check (publicar_em > confirmado_em)
);
create index admin_marketing_autorizacoes_peca_idx on public.admin_marketing_autorizacoes (peca_id, confirmado_em);

-- Cada linha já representa UM destino. Sucesso de uma rede não reenvia a outra.
-- Reagendamento cria autorização e agendamento novos após cancelar o anterior.
create table public.admin_marketing_agendamentos (
  id uuid primary key default gen_random_uuid(),
  autorizacao_id uuid not null unique references public.admin_marketing_autorizacoes(id),
  estado text not null default 'planejado' check (estado in (
    'planejado', 'programado-no-painel', 'agendado-na-meta', 'preparando',
    'publicado', 'cancelamento-pendente', 'cancelado', 'falhou', 'precisa-conferir')),
  estrategia text not null check (estrategia in ('nativo-meta', 'executor-remoto')),
  proxima_verificacao_em timestamptz not null default now(),
  lease_id uuid,
  lease_expira_em timestamptz,
  remoto_id text check (char_length(remoto_id) between 1 and 200),
  horario_remoto_confirmado_em timestamptz,
  concluido_em timestamptz,
  codigo_erro text check (codigo_erro ~ '^[a-z0-9-]{1,80}$'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check ((lease_id is null) = (lease_expira_em is null)),
  check (lease_id is null or estado = 'preparando'),
  check (estado <> 'agendado-na-meta' or (estrategia = 'nativo-meta' and remoto_id is not null and horario_remoto_confirmado_em is not null)),
  check (estado <> 'publicado' or remoto_id is not null),
  check ((estado in ('publicado', 'cancelado')) = (concluido_em is not null))
);
create index admin_marketing_agendamentos_fila_idx on public.admin_marketing_agendamentos (proxima_verificacao_em, id)
  where estado in ('programado-no-painel', 'preparando', 'cancelamento-pendente', 'precisa-conferir');

-- Recibo durável por tentativa, incluindo resposta incerta. Idempotência por
-- operação, não apenas por peça. Sem RPC de claim/retry nesta proposta.
create table public.admin_marketing_envios (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references public.admin_marketing_agendamentos(id),
  chave text not null unique check (chave ~ '^[0-9a-f]{64}$'),
  tentativa integer not null check (tentativa between 1 and 10),
  operacao text not null check (operacao in ('preparar', 'agendar', 'publicar', 'cancelar', 'reconciliar')),
  estado text not null default 'iniciado' check (estado in ('iniciado', 'confirmado', 'falhou', 'incerto')),
  remoto_id text check (char_length(remoto_id) between 1 and 200),
  codigo_erro text check (codigo_erro ~ '^[a-z0-9-]{1,80}$'),
  iniciado_em timestamptz not null default now(),
  terminado_em timestamptz,
  unique (agendamento_id, operacao, tentativa),
  check ((estado = 'iniciado') = (terminado_em is null)),
  check (terminado_em is null or terminado_em >= iniciado_em),
  check (estado <> 'confirmado' or operacao not in ('agendar', 'publicar') or remoto_id is not null)
);
create index admin_marketing_envios_incerto_idx on public.admin_marketing_envios (iniciado_em) where estado = 'incerto';

-- Bucket privado será provisionado/revisado separadamente. Apenas caminho
-- relativo, jamais URL pública/assinada; não cria nem altera storage.objects.
-- Só inicia os sete dias DEPOIS de conclusão/cancelamento confirmado.
create table public.admin_marketing_midias (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references public.admin_marketing_agendamentos(id),
  objeto text not null unique check (char_length(objeto) between 1 and 400 and objeto !~ '(^/|://|\.\.)'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes bigint not null check (bytes > 0),
  terminal_confirmado_em timestamptz,
  excluir_apos timestamptz,
  removido_em timestamptz,
  criado_em timestamptz not null default now(),
  check ((terminal_confirmado_em is null) = (excluir_apos is null)),
  check (excluir_apos is null or excluir_apos = terminal_confirmado_em + interval '7 days'),
  check (removido_em is null or (excluir_apos is not null and removido_em >= excluir_apos))
);
create index admin_marketing_midias_agendamento_idx on public.admin_marketing_midias (agendamento_id);
create index admin_marketing_midias_retencao_idx on public.admin_marketing_midias (excluir_apos) where removido_em is null;

-- Eventos técnicos sanitizados; sem payload livre de provedor ou de usuário.
create table public.admin_marketing_eventos (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique check (chave ~ '^[0-9a-f]{64}$'),
  agendamento_id uuid references public.admin_marketing_agendamentos(id),
  origem text not null check (origem in ('executor', 'meta', 'painel', 'criativos', 'feedback', 'cakto')),
  codigo text not null check (codigo ~ '^[a-z0-9-]{1,80}$'),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '90 days'),
  check (expira_em = criado_em + interval '90 days')
);
create index admin_marketing_eventos_agendamento_idx on public.admin_marketing_eventos (agendamento_id, criado_em);
create index admin_marketing_eventos_retencao_idx on public.admin_marketing_eventos (expira_em);

-- Uma notificação por incidente/destinatário. Abrir o sino não marca leitura;
-- ler e resolver são operações independentes. E-mail ainda não é enviado.
create table public.admin_marketing_notificacoes (
  id uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null,
  chave text not null check (chave ~ '^[0-9a-f]{64}$'),
  codigo text not null check (codigo ~ '^[a-z0-9-]{1,80}$'),
  importancia text not null check (importancia in ('informacao', 'atencao', 'critica')),
  agendamento_id uuid references public.admin_marketing_agendamentos(id),
  lida_em timestamptz,
  resolvida_em timestamptz,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '90 days'),
  unique (destinatario_id, chave),
  check (expira_em = criado_em + interval '90 days')
);
create index admin_marketing_notificacoes_nao_lidas_idx on public.admin_marketing_notificacoes (destinatario_id, criado_em desc) where lida_em is null;
create index admin_marketing_notificacoes_agendamento_idx on public.admin_marketing_notificacoes (agendamento_id);
create index admin_marketing_notificacoes_retencao_idx on public.admin_marketing_notificacoes (expira_em);

-- Auditoria e autorizações NÃO entram na limpeza de 90 dias. Guardam códigos,
-- identidades administrativas e referências; sem texto do feedback ou segredo.
create table public.admin_marketing_auditoria (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique check (chave ~ '^[0-9a-f]{64}$'),
  admin_id uuid,
  agendamento_id uuid references public.admin_marketing_agendamentos(id),
  codigo text not null check (codigo ~ '^[a-z0-9-]{1,80}$'),
  criado_em timestamptz not null default now()
);
create index admin_marketing_auditoria_agendamento_idx on public.admin_marketing_auditoria (agendamento_id, criado_em);

-- Somente agregados técnicos, sem vínculo com usuário/conta financeira.
-- Dados ausentes não são zero: só inserir quando a fonte estiver confirmada.
create table public.admin_marketing_agregados (
  dia date not null,
  origem text not null check (origem in ('meta', 'cakto', 'medicao-propria')),
  metrica text not null check (metrica ~ '^[a-z0-9-]{1,80}$'),
  quantidade bigint not null check (quantidade >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (dia, origem, metrica)
);
-- Limpeza futura: dia < (current_date - interval '13 months')::date.

-- Sem configuração válida, o futuro executor deve falhar fechado. Nenhuma
-- ativação/cota é inferida deste rascunho. Pausas por rede ficam independentes.
create table public.admin_marketing_controles (
  id boolean primary key default true check (id),
  habilitado boolean not null default false,
  pausa_global boolean not null default true,
  pausa_facebook boolean not null default true,
  pausa_instagram boolean not null default true,
  capacidade_validada_em timestamptz,
  atualizado_em timestamptz not null default now(),
  check (not habilitado or capacidade_validada_em is not null)
);

alter table public.admin_marketing_autorizacoes enable row level security;
alter table public.admin_marketing_agendamentos enable row level security;
alter table public.admin_marketing_envios enable row level security;
alter table public.admin_marketing_midias enable row level security;
alter table public.admin_marketing_eventos enable row level security;
alter table public.admin_marketing_notificacoes enable row level security;
alter table public.admin_marketing_auditoria enable row level security;
alter table public.admin_marketing_agregados enable row level security;
alter table public.admin_marketing_controles enable row level security;

revoke all on public.admin_marketing_autorizacoes, public.admin_marketing_agendamentos,
  public.admin_marketing_envios, public.admin_marketing_midias, public.admin_marketing_eventos,
  public.admin_marketing_notificacoes, public.admin_marketing_auditoria,
  public.admin_marketing_agregados, public.admin_marketing_controles from public, anon, authenticated, service_role;

-- Sem UPDATE/DELETE dos aceites e da auditoria, mesmo pelo serviço.
grant select, insert on public.admin_marketing_autorizacoes, public.admin_marketing_auditoria to service_role;
grant select, insert on public.admin_marketing_agendamentos, public.admin_marketing_envios,
  public.admin_marketing_midias, public.admin_marketing_notificacoes to service_role;
grant update (estado, proxima_verificacao_em, lease_id, lease_expira_em, remoto_id,
  horario_remoto_confirmado_em, concluido_em, codigo_erro, atualizado_em)
  on public.admin_marketing_agendamentos to service_role;
grant update (estado, remoto_id, codigo_erro, terminado_em) on public.admin_marketing_envios to service_role;
grant update (terminal_confirmado_em, excluir_apos, removido_em) on public.admin_marketing_midias to service_role;
grant update (lida_em, resolvida_em) on public.admin_marketing_notificacoes to service_role;
grant select, insert, delete on public.admin_marketing_eventos to service_role;
grant delete on public.admin_marketing_notificacoes to service_role;
grant select, insert, update, delete on public.admin_marketing_agregados to service_role;
grant select, insert, update on public.admin_marketing_controles to service_role;

-- PENDENTE antes de aplicar/ativar: revisão SQL e operacional, API administrativa,
-- validação do manifesto/versão vigente, revogação de aceite, claim atômico,
-- reconciliação obrigatória de resultado incerto, atraso >15 min, pausa/cancelar,
-- comparação de horário remoto, cotas/limites medidos, bucket privado, e-mail
-- deduplicado, limpeza em lotes e backup/restauração sem republicar.
commit;
