# Plano: interruptores remotos + avisos (dentro e fora do app)

> Documento de execução. Escrito em 02/09/2026 na máquina remota, **sem
> nenhuma alteração de código**, para ser implementado na outra máquina.
> Nada aqui foi aplicado ao projeto — é tudo plano.

## O problema

O WhatsApp do Grana. caiu. Hoje não existe jeito de desligar o botão: quem
abre o app continua vendo "Lançar pelo WhatsApp", tenta, e não funciona. A
única saída seria uma build nova só pra esconder um botão.

O objetivo é inverter isso: **desligar funcionalidade por `UPDATE` no banco, em
segundos, sem build** — e avisar a pessoa do porquê.

## A ressalva que decide o cronograma

**Isto NÃO resolve o apagão de hoje.** O app instalado (1.4.1) não tem código
que procure por flags. Para o interruptor existir é preciso **uma build**; dela
em diante, todo apagão futuro se resolve por SQL.

Nenhum sistema de flags alcança um app que não sabe procurar por flags. Quem
ficar na 1.4.1 continua vendo o botão do WhatsApp normalmente, para sempre.

Consequência prática: **priorize subir a build com o interruptor**, mesmo com o
WhatsApp ainda fora do ar. É a build que compra o controle de todas as
próximas vezes.

---

## Arquitetura

Três peças, na ordem em que devem ser construídas:

1. **`feature_flags`** — tabela singleton-por-chave no Supabase. Fonte da
   verdade. Leitura liberada a quem está logado, escrita só por `service_role`.
2. **`FlagsProvider`** — contexto React que lê a tabela na entrada do app e a
   cada volta do background. Cada tela pergunta a ele se pode mostrar o botão.
3. **Avisos** — dentro do app (o próprio botão desabilitado + pop-up) e fora
   (push Android/iOS), os dois alimentados pela mesma linha da tabela.

**Decisão: flags genéricos por nome, não um booleano de WhatsApp.** O mesmo
trabalho, e amanhã você desliga importação de extrato, QR de nota fiscal ou
lançamento por voz sem build nenhuma. Um flag específico de WhatsApp exigiria
build nova no próximo incidente — exatamente o problema que estamos resolvendo.

**Decisão: falha ABERTA.** Se a leitura da tabela falhar (rede ruim, Supabase
fora), tudo continua LIGADO. O contrário transformaria uma instabilidade do
Supabase em app inteiro morto. Isto é o oposto do `EntitlementProvider`, que
falha fechado de propósito — lá a regra também é aplicada no RLS do servidor,
aqui não existe segunda barreira, e o custo de errar para cada lado é
invertido.

---

## Parte 1 — Banco

Acrescentar ao fim de `supabase/schema.sql` e aplicar no SQL Editor.

```sql
-- ─────────────────────────────────────────────────────────────────────────
-- feature_flags: interruptores remotos de funcionalidade.
--
-- Uma linha por funcionalidade. `enabled = false` faz o app esconder ou
-- desabilitar a entrada correspondente SEM build nova. `titulo`/`mensagem`
-- são o texto que o app mostra no lugar, então são copy de produto: escreva
-- pensando em quem usa, não em changelog técnico (mesma regra do AGENTS.md
-- para a mensagem de build).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists feature_flags (
  key          text primary key,
  enabled      boolean not null default true,
  titulo       text,
  mensagem     text,
  -- 'info' | 'aviso' | 'critico' — decide a cor e se o pop-up abre sozinho.
  severidade   text not null default 'aviso',
  -- Quando preenchido, o app volta a LIGAR sozinho depois desta data, mesmo
  -- que ninguém lembre de rodar o UPDATE de volta. Evita o caso clássico do
  -- flag que fica desligado meses depois do incidente resolvido.
  reativa_em   timestamptz,
  -- Bump manual para forçar o pop-up a reaparecer para quem já dispensou.
  aviso_versao integer not null default 1,
  updated_at   timestamptz not null default now(),
  constraint feature_flags_severidade_valida
    check (severidade in ('info', 'aviso', 'critico'))
);

alter table feature_flags enable row level security;

drop policy if exists "logados leem os flags" on feature_flags;
create policy "logados leem os flags"
  on feature_flags for select
  to authenticated
  using (true);

-- Escrita nunca pelo app: só service_role (SQL Editor, Edge Function).

insert into feature_flags (key, enabled, titulo, mensagem) values
  ('whatsapp',        true, null, null),
  ('importar_extrato',true, null, null),
  ('qr_nota',         true, null, null),
  ('lancamento_voz',  true, null, null)
on conflict (key) do nothing;
```

Índice não é necessário: são poucas linhas e a leitura é sempre a tabela toda.

---

## Parte 2 — Cliente: `lib/feature-flags.tsx`

Espelha `lib/entitlement-context.tsx`, que já é um provider alimentado pelo
Supabase e já está montado em `app/_layout.tsx`.

```tsx
import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useSession } from './auth-context';
import { supabase } from './supabase';

export type ChaveFlag = 'whatsapp' | 'importar_extrato' | 'qr_nota' | 'lancamento_voz';

export type Flag = {
  key: string;
  enabled: boolean;
  titulo: string | null;
  mensagem: string | null;
  severidade: 'info' | 'aviso' | 'critico';
  reativa_em: string | null;
  aviso_versao: number;
};

type FlagsContextValue = {
  /** `true` quando a funcionalidade pode ser usada. Falha ABERTA. */
  ligado: (chave: ChaveFlag) => boolean;
  /** A linha inteira, para quem precisa do texto do aviso. */
  flag: (chave: ChaveFlag) => Flag | null;
  /** Todos os flags desligados COM mensagem — a fila do pop-up. */
  avisosAtivos: Flag[];
  recarregar: () => Promise<void>;
};

const FlagsContext = createContext<FlagsContextValue | null>(null);

export function useFlags() {
  const value = use(FlagsContext);
  if (!value) throw new Error('useFlags precisa estar dentro de FlagsProvider');
  return value;
}

/* `reativa_em` no passado religa sozinho, sem depender de alguém lembrar de
   rodar o UPDATE de volta depois que o incidente passou. */
function efetivamenteLigado(f: Flag): boolean {
  if (f.enabled) return true;
  if (f.reativa_em && new Date(f.reativa_em).getTime() <= Date.now()) return true;
  return false;
}

export function FlagsProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const [flags, setFlags] = useState<Record<string, Flag>>({});

  const recarregar = useCallback(async () => {
    if (!session) return;
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('key, enabled, titulo, mensagem, severidade, reativa_em, aviso_versao');
      if (error) throw error;
      const mapa: Record<string, Flag> = {};
      for (const linha of (data ?? []) as Flag[]) mapa[linha.key] = linha;
      setFlags(mapa);
    } catch {
      /* FALHA ABERTA, de propósito: sem resposta, o mapa fica como está (vazio
         na primeira vez), e `ligado()` devolve true para chave desconhecida.
         Uma instabilidade do Supabase não pode desligar o app inteiro. */
    }
  }, [session]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  /* Recarrega ao voltar do background: sem isto, quem deixa o app aberto no
     bolso só veria o flag mudar na próxima abertura fria. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') recarregar();
    });
    return () => sub.remove();
  }, [recarregar]);

  const ligado = useCallback(
    (chave: ChaveFlag) => {
      const f = flags[chave];
      return f ? efetivamenteLigado(f) : true; // chave desconhecida = ligada
    },
    [flags]
  );

  const flag = useCallback((chave: ChaveFlag) => flags[chave] ?? null, [flags]);

  const avisosAtivos = Object.values(flags).filter((f) => !efetivamenteLigado(f) && f.mensagem);

  return (
    <FlagsContext value={{ ligado, flag, avisosAtivos, recarregar }}>{children}</FlagsContext>
  );
}
```

**Montagem:** em `app/_layout.tsx`, junto dos outros providers, DENTRO do
`SessionProvider` (precisa da sessão para ler com RLS).

---

## Parte 3 — Os quatro pontos do WhatsApp

Mapeados no código atual. São estes e só estes:

| # | Onde | Arquivo | O que fazer |
|---|---|---|---|
| 1 | Ícone no cabeçalho da Início | `app/(app)/index.tsx:1229` (`HeaderAction icon="logo-whatsapp"`) | Esconder o botão quando desligado |
| 2 | Linha "Lançar pelo WhatsApp" no Perfil | `app/(app)/perfil.tsx:478` | Manter visível, desabilitada, com o motivo abaixo |
| 3 | Vínculo no Perfil | `app/(app)/perfil.tsx:853` (`PareamentoWhatsapp`) | Bloquear vínculo novo; **manter o desvincular funcionando** |
| 4 | Vínculo na criação de conta | `components/OnboardingModal.tsx:42` (`PareamentoWhatsapp`) | Pular o passo inteiro |

**Regras que valem para os quatro:**

- **Nunca apagar dado.** Desligar o flag esconde a ENTRADA, jamais apaga
  `whatsapp_link`. Quem já vinculou continua vinculado e volta a funcionar
  sozinho quando o flag religa.
- **Desvincular continua funcionando.** É ação de saída; travar isso prende a
  pessoa num estado que ela quer desfazer.
- **O passo do onboarding some inteiro** (não aparece desabilitado). Numa
  criação de conta, um passo travado com explicação de instabilidade é a
  primeira impressão do produto.
- **Item 2 fica visível e desabilitado**, não some: no Perfil, sumir dá a
  impressão de que a funcionalidade acabou. O texto do flag é a explicação.

Exemplo do padrão, para o item 1:

```tsx
const { ligado } = useFlags();
// ...
{ligado('whatsapp') && (
  <HeaderAction icon="logo-whatsapp" onPress={abrirWhatsappBot} ... />
)}
```

E para o item 2:

```tsx
const { ligado, flag } = useFlags();
const wa = flag('whatsapp');
// ...
<AppPressable
  style={styles.tappableRow}
  onPress={abrirWhatsapp}
  disabled={!ligado('whatsapp')}
  accessibilityState={{ disabled: !ligado('whatsapp') }}
>
  <Text style={styles.rowKey}>Lançar pelo WhatsApp</Text>
  {!ligado('whatsapp') && wa?.mensagem ? (
    <Text style={styles.rowAviso}>{wa.mensagem}</Text>
  ) : null}
</AppPressable>
```

---

## Parte 4 — Aviso dentro do app

**Componente novo:** `components/AvisoFlagModal.tsx`, modelado em
`components/NovidadesModal.tsx`, que já resolve pop-up centralizado, foco de
acessibilidade e o botão "Entendi".

Comportamento:

- Abre na entrada da área logada quando existe flag desligado **com mensagem**.
- Dispensa gravada em `AsyncStorage`, com a chave
  `grana_aviso_flag_<key>_v<aviso_versao>` — subir `aviso_versao` no banco faz
  o aviso reaparecer para quem já dispensou. É o mesmo mecanismo do
  `grana_novidades_versao_vista`.
- `severidade`:
  - `info` — só o texto no ponto de uso, sem pop-up;
  - `aviso` — pop-up uma vez, dispensável;
  - `critico` — pop-up toda abertura até religar.
- Nunca bloqueia o app. Não existe estado onde a pessoa não consegue fechar.

**Texto sugerido para o incidente atual** (a gravar no banco, não no código):

> **Título:** Lançamento por WhatsApp fora do ar
> **Mensagem:** O WhatsApp do Grana. está passando por instabilidade e o
> lançamento por mensagem está temporariamente desativado. Seus lançamentos
> já registrados estão a salvo, e o vínculo do seu número continua ativo —
> assim que normalizar, volta a funcionar sozinho. Nesse meio-tempo dá para
> lançar por voz, colando comprovante ou escaneando a nota.

Repare que ela faz três coisas: diz o que caiu, garante que nada foi perdido,
e oferece o caminho alternativo. As três importam.

---

## Parte 5 — Notificação push (Android e iOS)

Esta é a parte grande. `expo-notifications` já está instalado
(`~57.0.15`) e configurado como plugin no `app.json`, mas hoje é usado **só
para notificação LOCAL** (lembrete de boleto, fatura, limite de cartão, em
`lib/notifications.ts`). Não existe registro de push token, tabela de token
nem remetente.

### 5.1 Credenciais (fazer primeiro — sem isso nada funciona)

- **Android (FCM v1):** criar projeto no Firebase, baixar o JSON da service
  account, subir com `eas credentials` → Android → FCM V1.
- **iOS (APNs):** com a conta Apple Developer, gerar a APNs Key (.p8) e subir
  com `eas credentials` → iOS → Push Notifications.
- `projectId` já existe: `9ef78d72-9cec-473a-98f8-5d8e67f01e70`.
- Push **não funciona no Expo Go** para push remoto no SDK 53+; testar em build
  de development ou preview.

### 5.2 Tabela

```sql
create table if not exists push_tokens (
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text primary key,
  plataforma text not null check (plataforma in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on push_tokens (user_id);

alter table push_tokens enable row level security;

drop policy if exists "dono gerencia o proprio token" on push_tokens;
create policy "dono gerencia o proprio token"
  on push_tokens for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

`token` é a chave primária de propósito: o mesmo aparelho reinstalado gera
token novo, e o mesmo token nunca deve existir para dois usuários.

### 5.3 Registro no app — `lib/push.ts`

```ts
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { getNotifications } from './notifications'; // o require preguiçoso que já existe

const PROJECT_ID = Constants.expoConfig?.extra?.eas?.projectId;

/**
 * Registra o aparelho para push. Chamar UMA vez, depois do login.
 *
 * Silencioso em qualquer falha: push é canal secundário, e o aviso dentro do
 * app já cobre o caso. Nada aqui pode impedir a pessoa de usar o produto.
 */
export async function registrarPush(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    const N = getNotifications();
    if (!N) return;

    const atual = await N.getPermissionsAsync();
    let status = atual.status;
    if (status !== 'granted') {
      /* Só pede se ainda não foi decidido. Repedir depois de um "não" é
         desrespeito e no iOS nem abre o diálogo de novo. */
      if (!atual.canAskAgain) return;
      status = (await N.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const { data: token } = await N.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    const { data: sessao } = await supabase.auth.getUser();
    if (!sessao.user || !token) return;

    await supabase.from('push_tokens').upsert(
      {
        user_id: sessao.user.id,
        token,
        plataforma: Platform.OS === 'ios' ? 'ios' : 'android',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );
  } catch {
    /* silencioso de propósito — ver doc acima */
  }
}
```

**Quando pedir a permissão:** NÃO na primeira abertura. Peça quando a pessoa
liga o primeiro lembrete de boleto (contexto em que ela entende o porquê), ou
num passo próprio do onboarding com explicação. Pedir permissão de notificação
na tela de boas-vindas é o jeito mais rápido de levar um "não" permanente.

### 5.4 Remetente — `supabase/functions/enviar-aviso/index.ts`

Edge Function em Deno, autenticada por HMAC igual à `eas-build-webhook` (copiar
o `hmacSha1Hex`/`timingSafeEqual` de lá) ou protegida por um segredo simples de
header, já que só você chama.

```ts
/* Envia um aviso para todos os aparelhos registrados.
   A API de push da Expo aceita no máximo 100 mensagens por requisição. */
const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

const { data: tokens } = await supabase.from('push_tokens').select('token');
const lista = (tokens ?? []).map((t) => t.token);

for (let i = 0; i < lista.length; i += 100) {
  const lote = lista.slice(i, i + 100).map((to) => ({
    to,
    sound: 'default',
    title: titulo,
    body: mensagem,
    data: { tipo: 'aviso_flag', key },
    channelId: 'default', // Android
  }));

  const r = await fetch(EXPO_PUSH, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept-encoding': 'gzip, deflate' },
    body: JSON.stringify(lote),
  });
  const json = await r.json();

  /* Limpeza obrigatória: token com erro DeviceNotRegistered nunca mais
     funciona (app desinstalado). Sem apagar, a tabela vira lixo crescente e
     cada envio fica mais lento. */
  for (const [idx, ticket] of (json.data ?? []).entries()) {
    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      await supabase.from('push_tokens').delete().eq('token', lote[idx].to);
    }
  }
}
```

**Não implemente o receipt-check na primeira versão.** A API da Expo devolve
tickets na hora e recibos só depois de ~15 min, num segundo endpoint. Para
avisar sobre um apagão, o ticket basta.

### 5.5 Ordem de disparo no dia do incidente

Push é **complemento**, nunca substituto: quem tem notificação desligada só
descobre pelo app. O flag no banco é a verdade; o push é um empurrão.

---

## Parte 6 — Como operar (o que rodar no dia)

**Desligar o WhatsApp e avisar:**

```sql
update feature_flags set
  enabled      = false,
  titulo       = 'Lançamento por WhatsApp fora do ar',
  mensagem     = 'O WhatsApp do Grana. está passando por instabilidade e o lançamento por mensagem está temporariamente desativado. Seus lançamentos já registrados estão a salvo, e o vínculo do seu número continua ativo — assim que normalizar, volta a funcionar sozinho. Nesse meio-tempo dá para lançar por voz, colando comprovante ou escaneando a nota.',
  severidade   = 'aviso',
  reativa_em   = now() + interval '7 days',
  aviso_versao = aviso_versao + 1,
  updated_at   = now()
where key = 'whatsapp';
```

**Religar:**

```sql
update feature_flags set
  enabled = true, titulo = null, mensagem = null,
  reativa_em = null, updated_at = now()
where key = 'whatsapp';
```

O `reativa_em` é rede de segurança: mesmo esquecendo de religar, volta sozinho
em 7 dias. Se o incidente durar mais, é só empurrar a data.

---

## Parte 7 — Testes e guardas

O projeto tem o hábito de virar regra em teste (`corpus-schema-guardas.ts`,
`corpus-design-system.ts`). Seguir:

1. **`__tests__/corpus-flags.ts`** — pura lógica, sem rede:
   - chave desconhecida devolve LIGADO (falha aberta);
   - `enabled = false` com `reativa_em` no passado devolve LIGADO;
   - `enabled = false` com `reativa_em` no futuro devolve DESLIGADO;
   - `enabled = false` sem `mensagem` não entra em `avisosAtivos`;
   - `severidade` inválida não derruba o provider.
2. **Estender `corpus-schema-guardas.ts`** para exigir que `feature_flags` e
   `push_tokens` tenham RLS ligado e política de select — o guarda de schema já
   faz isso para outras tabelas.
3. **Guarda de cobertura dos pontos do WhatsApp:** um teste que falha se
   `logo-whatsapp` ou `PareamentoWhatsapp` aparecer num arquivo que não importa
   `useFlags`. É o que impede um quinto ponto de entrada nascer sem
   interruptor — o padrão sistêmico já registrado no `IMPECCABLE_AUDIT.md`
   ("o projeto cria a ferramenta certa e aplica em um lugar só").

---

## Checklist de execução, na ordem

- [ ] 1. Aplicar o SQL da Parte 1 no Supabase e acrescentar ao `schema.sql`
- [ ] 2. Criar `lib/feature-flags.tsx` e montar o provider em `app/_layout.tsx`
- [ ] 3. Ligar os 4 pontos do WhatsApp da Parte 3
- [ ] 4. Criar `components/AvisoFlagModal.tsx` e chamá-lo na área logada
- [ ] 5. `npx tsc --noEmit` + `npm run test:parser`
- [ ] 6. Escrever `__tests__/corpus-flags.ts` (Parte 7) e incluir no `test:parser`
- [ ] 7. **Subir `expo.version` no `app.json`** (regra 5 do AGENTS.md)
- [ ] 8. `npm run notas:check "<mensagem>"` (regra 6 do AGENTS.md)
- [ ] 9. Build, e **testar o interruptor com o app instalado**: virar o flag no
       SQL e confirmar que o botão some sem reinstalar nada
- [ ] 10. Só então começar a Parte 5 (push), que é independente e não bloqueia
- [ ] 11. Atualizar `context.md` e `DESIGN.md` (o estado desabilitado é um
       estado visual novo e o DESIGN.md não tem vocabulário para ele)

Os passos 1 a 9 entregam o valor inteiro do interruptor. O push (10) é
melhoria de alcance, não pré-requisito.

---

## Armadilhas específicas deste projeto

1. **Build sem subir `expo.version` não avisa ninguém** — a Edge Function
   `eas-build-webhook` recusa versão que não seja maior (`older version
   ignored`) e o silêncio é indistinguível de "não saiu build". Regra 5 do
   `AGENTS.md`.
2. **A mensagem do build é copy de produto** e passa por verificador
   (`npm run notas:check`). Regra 6 do `AGENTS.md`.
3. **Build do EAS consome cota compartilhada entre as duas máquinas** — pedir
   explicitamente antes de disparar. Regra 4.
4. **Falha aberta é decisão, não descuido.** Se alguém "corrigir" o
   `catch {}` do provider para desligar tudo em caso de erro, uma queda do
   Supabase vira app inteiro morto. O comentário no código precisa sobreviver.
5. **`git fetch origin` e comparar com `origin/main` antes de commitar** —
   regra 1, e este repositório já sofreu reescrita acidental de histórico.
6. **Não confundir com o `EntitlementProvider`.** Ele falha FECHADO de
   propósito (o RLS aplica a mesma regra no servidor). Os flags falham ABERTOS.
   Os dois estão certos, por motivos opostos.

---

## Estimativa honesta

- **Partes 1–4 e 6 (interruptor + aviso no app):** meio dia de trabalho. Toda a
  infraestrutura já existe; é seguir padrões do próprio projeto.
- **Parte 5 (push):** um a dois dias, e a maior parte é credencial (Firebase,
  APNs) e teste em aparelho — não código.
- **Parte 7 (testes):** duas a três horas, e é o que impede o quinto ponto de
  entrada do WhatsApp nascer sem interruptor.
