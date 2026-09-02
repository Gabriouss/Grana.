# Pendências do Grana. — instruções para a outra máquina

> **Documento único.** Tudo o que está em aberto no projeto está aqui: o que
> corrigir, em que ordem, e por quê. Escrito em 02/09/2026 na máquina remota,
> onde não há login no app, nem acesso ao banco de produção, nem aparelho
> físico — as três limitações que definem o que sobrou para ser feito aí.
>
> Substitui o antigo `PLANO-INTERRUPTORES-REMOTOS.md`, que foi absorvido
> integralmente pelo Bloco 3 e apagado: dois documentos sobre o mesmo assunto
> viram duas fontes de verdade que divergem.

## Ordem recomendada

| # | O quê | Custo | Por que nesta ordem |
|---|---|---|---|
| 1 | SQL do acento no banco | 2 min | Único erro **visível ao usuário** ainda no ar |
| 2 | Validar visualmente o que mudou | 10 min | Muita coisa foi alterada sem ninguém ver; cada dia empilha mais código por cima |
| 3 | Interruptores remotos | ~1 dia | Cada dia sem isso é um dia sem controle sobre 13 ferramentas |
| 4 | Dívidas que exigem banco/aparelho | variável | Precisam de ambiente que a máquina remota não tem |
| 5 | Pequenos (P3) | ~2 h | Sem impacto real; fazer quando sobrar tempo |

Os blocos 1 e 2 são de minutos e destravam tudo. O 3 é o pedido do autor. O 4
e o 5 podem esperar.

---

# Bloco 1 — Agora (2 minutos)

## 1.1 O erro de acento ainda está no banco — RESOLVIDO em 02/09/2026

A versão 1.4.1 publicou no pop-up de novidades: *"Corrige tela branca **apos**
desbloqueio por digital"*, sem acento, na cara de todo mundo que atualizou.

O código que **impede isso de acontecer de novo** já está na `main` (guarda
ortográfica em `lib/notas-release.ts` + `npm run notas:check`). O texto em
`app_release.notes` (id 1, versão 1.4.1) foi corrigido via Management API do
Supabase (Personal Access Token temporário fornecido pelo autor), verificado
byte a byte (49 bytes, "ó" em UTF-8 `c3 b3`) e aprovado por `npm run
notas:check`. **Não é preciso repetir este passo.**

Quem já abriu o app e dispensou o pop-up não o verá de novo (o marcador local
`grana_novidades_versao_vista` já está em 1.4.1). A correção vale para quem
ainda não atualizou ou não abriu.

Nota para quem repetir uma correção assim: passar a query SQL via arquivo
(`curl --data-binary @arquivo.json`) em vez de string inline no shell —
inline corrompeu o acento (virou U+FFFD) na primeira tentativa, porque o Git
Bash no Windows não preserva UTF-8 em argumentos de linha de comando por
padrão.

## 1.2 A partir do próximo build, existe um passo novo

Antes de qualquer `eas build`:

```
npm run notas:check "Sua mensagem, com acentuação de português de verdade"
```

Reprovado, ele diz palavra por palavra o que está errado e sai com código 1. Se
esquecer de rodar, a Edge Function `eas-build-webhook` faz a mesma checagem e
**recusa a nota** — publicando a versão assim mesmo, sem notas, porque o aviso
de atualização não pode depender de ortografia. A recusa aparece no log da
função e na tela de webhooks do EAS.

---

# Bloco 2 — Validar visualmente (10 minutos)

**Este é o maior risco em aberto.** A sessão remota alterou muita coisa de
aparência e **nada foi visto rodando**: não há login disponível lá (o `.env` do
container é placeholder e o proxy bloqueia o Supabase por política).

`npx expo start --web` na sua máquina, e confira nesta ordem:

### 2.1 Entrelinha — 85 estilos em 6 telas

O maior volume, e o de maior risco de ficar estranho.

- **Início** — o bloco "Livre para gastar": as 4 linhas de saldo / contas a
  vencer / reservado / livre. Era o mais apertado depois do Crédito.
- **Lançamentos** e **Contas** — linhas da lista: descrição em cima,
  data e categoria embaixo.
- **Perfil** — os textos de ajuda abaixo de cada opção.
- **Desafios** e **Gráficos** — rótulos e legendas.

**Sinal de que passou do ponto:** algo espaçado demais, ou um bloco que cresceu
e empurrou o resto da tela.

Botões e campos de digitação ficaram **de fora de propósito**: no botão a
entrelinha muda a geometria, e em `TextInput` no Android corta o texto
verticalmente.

### 2.2 Início, cabeçalho — badges "exemplo" e "oculto"

Saíram de fonte monoespaçada para Neue Machina (era a única violação da
Only-Font Rule no repositório). Devem parecer parte da interface agora, não
etiqueta de debug.

### 2.3 Desafios — badges

No **celular** deve continuar 2 colunas, igual antes. No **navegador largo** é
onde muda: 3 ou 4 colunas, em vez de duas esticadas até ~690px cada.

### 2.4 Início — botões de ação

"Colar comprovante / Importar extrato / Escanear nota / Lançamento por voz"
voltaram a **deslizar para o lado**, em vez de empilhar em duas fileiras.

### 2.5 Busca de Lançamentos — digite rápido

Deve ficar mais responsivo. Era o pior caso de performance do app: quatro
passadas sobre a lista inteira **a cada tecla**, sendo que só a última depende
do texto buscado.

### 2.6 O que NÃO deve mudar

A memoização (Crédito, Lançamentos, Contas, Desafios) é pura performance e
**não deve alterar um pixel**. Se alterar, é bug — vale reportar.

### 2.7 Se algo ficar ruim

Os commits estão separados por tipo de mudança, então dá para reverter a
entrelinha sem perder a memoização, e vice-versa. Commits relevantes na `main`:
`fb45249` (auditoria), `93529ca` (UI), `a88fdf6` (segunda auditoria),
`b985bc9` (guarda do design system).

---

# Bloco 3 — Interruptores remotos de funcionalidade

## O escopo

**Toda ferramenta do Grana., não só o WhatsApp.** O WhatsApp é o incidente que
motivou o pedido, mas o requisito é: qualquer funcionalidade que entre em
instabilidade precisa poder ser desligada remotamente no aplicativo de todo
mundo, com aviso, e religada remotamente quando resolver. Nenhuma ferramenta
pode ficar de fora — uma que fique é exatamente a que vai cair.

## A ressalva que decide o cronograma

**Isto NÃO resolve o apagão de hoje.** O app instalado (1.4.1) não tem código
que procure por flags. Para o interruptor existir é preciso **uma build**; dela
em diante, todo apagão futuro se resolve por SQL, em segundos.

Nenhum sistema de flags alcança um app que não sabe procurar por flags. Quem
ficar na 1.4.1 continua vendo o botão do WhatsApp para sempre.

Consequência prática: **priorize subir a build com o interruptor**, mesmo com o
WhatsApp ainda fora do ar. É a build que compra o controle de todas as
próximas vezes.

### Arquitetura

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

### Parte 1 — Banco — RESOLVIDO em 02/09/2026

Aplicada em produção via Management API do Supabase (Personal Access Token
temporário) e já está no fim de `supabase/schema.sql`. Verificado depois de
aplicar: `feature_flags` existe, `relrowsecurity = true`, a política
`"logados leem os flags"` (SELECT, `authenticated`) está lá, e as 13 chaves do
inventário estão semeadas com `enabled = true`. `__tests__/corpus-schema-guardas.ts`
confirma RLS + política de select nesta tabela. **Não é preciso reaplicar.**

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
  -- ── Escopo do desligamento ──────────────────────────────────────────────
  -- Instabilidade quase nunca atinge as duas plataformas igual: o
  -- reconhecimento de voz quebra no Android e segue bom no iOS, a câmera
  -- muda de comportamento numa versão do iOS. Desligar para todo mundo
  -- quando só metade está afetada é punir quem está bem.
  -- NULL = todas as plataformas. Ex: '{android}'.
  plataformas  text[],
  -- Mesma ideia no eixo da versão: um defeito que existe na 1.4.1 e já foi
  -- corrigido na 1.5.0 não deve desligar nada para quem já atualizou.
  -- Comparação numérica por segmento, feita no cliente (ver compararVersoes
  -- em lib/atualizacao.ts, que já existe e faz exatamente isso).
  versao_min   text,
  versao_max   text,
  updated_at   timestamptz not null default now(),
  constraint feature_flags_severidade_valida
    check (severidade in ('info', 'aviso', 'critico')),
  -- Desligar sem explicar é o pior dos mundos: a pessoa acha que quebrou ou
  -- que a funcionalidade acabou. Se está desligado, tem que ter mensagem.
  constraint feature_flags_desligado_tem_mensagem
    check (enabled or (mensagem is not null and length(trim(mensagem)) > 0))
);

alter table feature_flags enable row level security;

drop policy if exists "logados leem os flags" on feature_flags;
create policy "logados leem os flags"
  on feature_flags for select
  to authenticated
  using (true);

-- Escrita nunca pelo app: só service_role (SQL Editor, Edge Function).

-- TODAS as ferramentas nascem ligadas. Semear todas de uma vez é o ponto:
-- uma chave que só é criada no dia do incidente é uma chave que não existe
-- justamente quando você precisa dela às pressas.
insert into feature_flags (key, enabled) values
  ('whatsapp'),            -- Meta Cloud API + Edge Function whatsapp-webhook
  ('importar_extrato'),    -- CSV/OFX, até 10 mil linhas
  ('colar_comprovante'),   -- parser de texto colado (lib/heuristics.ts)
  ('qr_nota'),             -- expo-camera + QR da NFC-e
  ('lancamento_voz'),      -- expo-speech-recognition
  ('relatorio_pdf'),       -- expo-print + expo-sharing
  ('foto_perfil'),         -- upload para o Storage do Supabase
  ('lembretes'),           -- notificação local de boleto/fatura/limite
  ('assinatura_checkout'), -- Kiwify + Edge Function kiwify-webhook
  ('orcamento_sugerido'),  -- geração de orçamento por renda
  ('diagnostico'),         -- diagnóstico/perfil financeiro
  ('cofrinhos'),           -- metas e depósitos
  ('desafios')             -- gamificação, streak e score
on conflict (key) do nothing;
```

Índice não é necessário: são poucas linhas e a leitura é sempre a tabela toda.

---

### Parte 2 — Cliente: `lib/feature-flags.tsx`

Espelha `lib/entitlement-context.tsx`, que já é um provider alimentado pelo
Supabase e já está montado em `app/_layout.tsx`.

```tsx
import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { compararVersoes } from './atualizacao'; // exportar de lá; hoje é interna
import { useSession } from './auth-context';
import { supabase } from './supabase';

/* As 13 chaves do Inventário. Esta união e o `insert` da Parte 1 precisam
   andar juntos: chave que existe no banco e não aqui não compila na chamada,
   e chave aqui sem linha no banco cai no caminho "desconhecida = ligada" e
   nunca desliga. O teste da Parte 7 compara as duas listas. */
export type ChaveFlag =
  | 'whatsapp'
  | 'importar_extrato'
  | 'colar_comprovante'
  | 'qr_nota'
  | 'lancamento_voz'
  | 'relatorio_pdf'
  | 'foto_perfil'
  | 'lembretes'
  | 'assinatura_checkout'
  | 'orcamento_sugerido'
  | 'diagnostico'
  | 'cofrinhos'
  | 'desafios';

export type Flag = {
  key: string;
  enabled: boolean;
  titulo: string | null;
  mensagem: string | null;
  severidade: 'info' | 'aviso' | 'critico';
  reativa_em: string | null;
  aviso_versao: number;
  plataformas: string[] | null;
  versao_min: string | null;
  versao_max: string | null;
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

/* Um flag só desliga de verdade quando o desligamento se aplica A ESTE
   aparelho: plataforma certa, versão dentro da faixa, e prazo não vencido.
   Qualquer dúvida resolve para LIGADO — é a mesma falha aberta do provider. */
function efetivamenteLigado(f: Flag): boolean {
  if (f.enabled) return true;

  /* `reativa_em` no passado religa sozinho, sem depender de alguém lembrar de
     rodar o UPDATE de volta depois que o incidente passou. */
  if (f.reativa_em && new Date(f.reativa_em).getTime() <= Date.now()) return true;

  /* Instabilidade quase nunca atinge as duas plataformas igual. NULL/vazio
     significa "todas". */
  if (f.plataformas?.length && !f.plataformas.includes(Platform.OS)) return true;

  /* Faixa de versão: um defeito já corrigido não deve desligar nada para quem
     atualizou. `compararVersoes` é a de lib/atualizacao.ts, que já compara por
     segmento numérico ("1.10.0" > "1.9.0", que como texto seria falso). */
  const instalada = Constants.expoConfig?.version ?? '0.0.0';
  if (f.versao_min && compararVersoes(instalada, f.versao_min) < 0) return true;
  if (f.versao_max && compararVersoes(instalada, f.versao_max) > 0) return true;

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
        .select('key, enabled, titulo, mensagem, severidade, reativa_em, aviso_versao, plataformas, versao_min, versao_max');
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

### Inventário completo das ferramentas

Levantado do código em 02/09/2026. **O WhatsApp é uma linha desta tabela, não
o assunto dela.** A coluna "risco" é o que pode dar errado depois de publicado,
sem ninguém mexer no código — é esse o critério para existir interruptor.

| Chave | Ferramenta | Pontos de entrada | Risco real |
|---|---|---|---|
| `whatsapp` | Lançar por mensagem | `index.tsx:1229` (ícone), `perfil.tsx:478` (linha), `perfil.tsx:853` (vínculo), `OnboardingModal.tsx:42` (vínculo) | Meta Cloud API e a Edge Function `whatsapp-webhook`. **Fora do ar hoje.** |
| `importar_extrato` | Importar extrato CSV/OFX | `index.tsx:1298`, `ImportarExtratoModal.tsx` | Parser, e carga de até 10 mil linhas no Supabase Free |
| `colar_comprovante` | Colar comprovante | `index.tsx:1291` | Regressão no parser (`lib/heuristics.ts`) atinge todo mundo de uma vez |
| `qr_nota` | Escanear nota fiscal | `index.tsx:1305`, `QrScannerModal.tsx` | `expo-camera`, permissão, e mudança no formato do QR da NFC-e |
| `lancamento_voz` | Lançamento por voz | `index.tsx` (`VoiceEntryButton`), `lancamentos.tsx` | `expo-speech-recognition` — quebra por plataforma, tipicamente só num lado |
| `relatorio_pdf` | Relatório em PDF | `perfil.tsx`, `lib/pdf-report.ts` | `expo-print`/`expo-sharing`, comportamento diferente por SO |
| `foto_perfil` | Foto de perfil | `perfil.tsx:470`, `OnboardingModal.tsx:514` | Upload para o Storage do Supabase |
| `lembretes` | Lembretes de vencimento | `perfil.tsx:475,512,538` | `expo-notifications`, permissão e agendamento |
| `assinatura_checkout` | Checkout da assinatura | tela de assinar | Kiwify e a Edge Function `kiwify-webhook`. Dinheiro entra por aqui. |
| `orcamento_sugerido` | Orçamento sugerido | `perfil.tsx:598`, `BudgetTemplatesModal` | Cálculo por renda |
| `diagnostico` | Diagnóstico financeiro | `perfil.tsx:604,612` | `lib/diagnostico.ts` |
| `cofrinhos` | Cofrinhos e metas | `index.tsx` (`GoalsCarousel`) | Depósito e resgate |
| `desafios` | Desafios e Score | aba Desafios | `get_gamification_summary()` no banco |

**O que NÃO recebe interruptor, e por quê.** Ver e registrar lançamento,
carteiras, categorias, saldo, login, bloqueio por biometria e modo privacidade
são o produto em si, não ferramentas acessórias. Desligar qualquer um deles não
é "instabilidade", é o app não existir — nesse caso o certo é uma página de
status, não um flag. Segurança (biometria, bloqueio de captura) nunca deve ter
interruptor remoto: seria um jeito de desligar a proteção de todo mundo por
`UPDATE`.

### Parte 3 — Exemplo trabalhado: os quatro pontos do WhatsApp

O WhatsApp é o caso mais espalhado do inventário (quatro pontos de entrada em
três arquivos), por isso serve de modelo. **O mesmo padrão vale para todas as
outras chaves** — só muda quantos pontos cada uma tem. As regras logo abaixo da
tabela são gerais, não específicas do WhatsApp.

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

### Parte 4 — Aviso dentro do app

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

### Parte 5 — Notificação push (Android e iOS)

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

### Parte 6 — Como operar (o que rodar no dia)

Vale para **qualquer** chave do inventário — troque o `where key`.

**Desligar e avisar (exemplo com o WhatsApp):**

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

**Desligar só numa plataforma** (ex.: voz quebrada só no Android):

```sql
update feature_flags set
  enabled = false, plataformas = '{android}',
  titulo = 'Lançamento por voz indisponível no Android',
  mensagem = 'O reconhecimento de voz está instável nos aparelhos Android e foi desativado temporariamente. Dá para lançar colando o comprovante ou escaneando a nota enquanto isso.',
  reativa_em = now() + interval '3 days', aviso_versao = aviso_versao + 1,
  updated_at = now()
where key = 'lancamento_voz';
```

**Desligar só nas versões afetadas** (defeito já corrigido na 1.5.0):

```sql
update feature_flags set
  enabled = false, versao_max = '1.4.1',
  titulo = 'Importação de extrato indisponível nesta versão',
  mensagem = 'A importação de extrato apresentou um problema nesta versão do app e foi desativada. Atualize para a versão mais recente para voltar a usar.',
  aviso_versao = aviso_versao + 1, updated_at = now()
where key = 'importar_extrato';
```

**Ver o que está desligado agora:**

```sql
select key, plataformas, versao_min, versao_max, reativa_em, titulo
from feature_flags where not enabled order by updated_at desc;
```

**Religar — vale para qualquer chave:**

```sql
update feature_flags set
  enabled = true, titulo = null, mensagem = null,
  reativa_em = null, plataformas = null,
  versao_min = null, versao_max = null, updated_at = now()
where key = 'whatsapp';   -- troque pela chave que quiser religar
```

Limpar `plataformas` e a faixa de versão junto é obrigatório: um flag religado
com escopo antigo pendurado vira armadilha no próximo incidente.

O `reativa_em` é a rede de segurança do religamento: mesmo esquecendo de rodar
o UPDATE acima, o flag volta sozinho na data marcada. Se o incidente durar
mais, é só empurrar a data — nunca deixar sem data, porque desligamento sem
prazo é o que vira permanente por esquecimento.

---

### Parte 7 — Testes e guardas

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
3. **Guarda de cobertura de TODAS as ferramentas** — o teste mais importante
   dos três. Um mapa `chave -> marcadores no código` e um teste que falha
   quando um marcador aparece num arquivo que não importa `useFlags`:

   ```ts
   /* As 13 chaves, com marcadores conferidos no código em 02/09/2026.
      Nenhuma linha inventada: cada símbolo abaixo existe hoje no repositório. */
   const COBERTURA: Record<ChaveFlag, string[]> = {
     whatsapp:            ['logo-whatsapp', 'PareamentoWhatsapp', 'WhatsappBotSheet'],
     importar_extrato:    ['ImportarExtratoModal'],
     colar_comprovante:   ['setPasteModalOpen'],
     qr_nota:             ['QrScannerModal'],
     lancamento_voz:      ['VoiceEntryButton'],
     relatorio_pdf:       ['gerarRelatorioPdf'],
     foto_perfil:         ['fotoUrl'],
     lembretes:           ['scheduleBillReminders', 'scheduleCardInvoiceReminders'],
     assinatura_checkout: ['temAssinaturaAtiva', 'KIWIFY_CHECKOUT_URL'],
     orcamento_sugerido:  ['BudgetTemplatesModal', 'upsertBudgetsBatch'],
     diagnostico:         ['diagnostico'],
     cofrinhos:           ['GoalsCarousel'],
     desafios:            ['BadgeCard', 'get_gamification_summary'],
   };

   // Três asserções, e as três importam:
   // 1. todo arquivo que contém um marcador importa `useFlags`;
   // 2. toda chave de ChaveFlag tem pelo menos um marcador aqui;
   // 3. o `insert` da Parte 1 e o tipo ChaveFlag têm exatamente as mesmas
   //    chaves — foi justamente essa lista sair de sincronia (o tipo ficou com
   //    4 chaves quando o inventário já tinha 13) o erro pego na revisão deste
   //    documento.
   ```

   Isto ataca diretamente o padrão sistêmico já registrado no
   `IMPECCABLE_AUDIT.md` — *"o projeto cria a ferramenta certa e aplica em um
   lugar só"*. Sem este teste, o interruptor cobre as ferramentas de hoje e a
   próxima nasce sem ele, que é a forma mais provável de este trabalho
   apodrecer.
4. **Teste de escopo:** flag com `plataformas = '{android}'` não desliga no
   iOS; flag com `versao_max = '1.4.1'` não desliga em quem está na 1.5.0.

---

### Checklist de execução, na ordem

**Itens 1-6 e 11 verificados como concluídos em 02/09/2026** — duas sessões
diferentes (uma sem acesso ao Supabase, outra com) trabalharam nisto em
paralelo sem saber uma da outra; o resultado foi reconciliado nesta rodada:
banco aplicado por uma sessão, código completo vindo da outra (commit
`8c06a7e`). Confirmado por verificação direta, não só por o commit dizer que
sim — `npx tsc --noEmit` limpo, `npm run test:parser` com 100% (incluindo
17/17 em `corpus-flags.ts` e 11/11 nas guardas de schema), e checagem manual
de que as 13 chaves aparecem em `ligado('<chave>')` nos arquivos certos.

- [x] 1. Aplicar o SQL da Parte 1 no Supabase e acrescentar ao `schema.sql`
- [x] 2. Criar `lib/feature-flags.tsx` e montar o provider em `app/_layout.tsx`
- [x] 3. Ligar TODOS os pontos de entrada do Inventário, não só os do
       WhatsApp — a chave de tudo é não parar na ferramenta que motivou o
       pedido. Se o tempo apertar, o corte honesto é por ferramenta inteira
       (deixar `cofrinhos` para depois), nunca por "só metade dos pontos do
       WhatsApp": meio interruptor é pior que nenhum, porque dá a impressão
       de que está coberto
- [x] 4. Criar `components/AvisoFlagModal.tsx` e chamá-lo na área logada
- [x] 5. `npx tsc --noEmit` + `npm run test:parser`
- [x] 6. Escrever `__tests__/corpus-flags.ts` (Parte 7) e incluir no
       `test:parser`. **O item 3 da Parte 7 (guarda de cobertura) não é
       opcional** — é ele que garante que a próxima ferramenta do Grana. nasça
       com interruptor em vez de repetir este trabalho daqui a seis meses
- [x] 7. **Subir `expo.version` no `app.json`** (regra 5 do AGENTS.md)
- [x] 8. `npm run notas:check "<mensagem>"` (regra 6 do AGENTS.md)
- [ ] 9. Build, e **testar o interruptor com o app instalado**: virar o flag no
       SQL e confirmar que o botão some sem reinstalar nada — **não disparado
       nesta sessão**: regra 4 do AGENTS.md exige pedido explícito, e não
       houve pedido de build, só de terminar o trabalho de código/banco
- [ ] 10. Só então começar a Parte 5 (push), que é independente e não bloqueia
- [x] 11. Atualizar `context.md` e `DESIGN.md` (o estado desabilitado é um
       estado visual novo e o DESIGN.md não tem vocabulário para ele)

Os passos 1 a 9 entregam o valor inteiro do interruptor. O push (10) é
melhoria de alcance, não pré-requisito. **Falta só o 9** (build) — peça
explicitamente quando quiser disparar, e citar que já sabe do custo de cota
compartilhada entre as duas máquinas.

---

### Armadilhas ao implementar os interruptores

1. **Build sem subir `expo.version` não avisa ninguém** — a Edge Function
   `eas-build-webhook` recusa versão que não seja maior (`older version
   ignored`) e o silêncio é indistinguível de "não saiu build". Regra 5 do
   `AGENTS.md`.
2. **A mensagem do build é copy de produto** e passa por verificador
   (`npm run notas:check`). Regra 6 do `AGENTS.md`.
3. **Build do EAS consome cota compartilhada entre as duas máquinas** — pedir
   explicitamente antes de disparar. Regra 4.
4. **Nunca dar interruptor a segurança.** Biometria, bloqueio de captura de
   tela e modo privacidade ficam fora do sistema de flags de propósito: um
   flag remoto sobre eles seria um jeito de desligar a proteção de todo mundo
   com um `UPDATE`, e quem conseguisse escrever na tabela conseguiria isso.
   Está registrado no Inventário e precisa continuar assim.
5. **Falha aberta é decisão, não descuido.** Se alguém "corrigir" o
   `catch {}` do provider para desligar tudo em caso de erro, uma queda do
   Supabase vira app inteiro morto. O comentário no código precisa sobreviver.
6. **`git fetch origin` e comparar com `origin/main` antes de commitar** —
   regra 1, e este repositório já sofreu reescrita acidental de histórico.
7. **Não confundir com o `EntitlementProvider`.** Ele falha FECHADO de
   propósito (o RLS aplica a mesma regra no servidor). Os flags falham ABERTOS.
   Os dois estão certos, por motivos opostos.

---

### Estimativa honesta

- **Partes 1–4 e 6 (interruptor + aviso no app):** um dia. Meio dia era a conta
  para o WhatsApp sozinho; cobrir as 13 ferramentas do inventário dobra a
  parte de ligar os pontos de entrada, mas não muda banco, provider nem aviso —
  esses são escritos uma vez e servem todas.
- **Parte 5 (push):** um a dois dias, e a maior parte é credencial (Firebase,
  APNs) e teste em aparelho — não código.
- **Parte 7 (testes):** duas a três horas, e é o que impede o quinto ponto de
  entrada do WhatsApp nascer sem interruptor.

---

# Bloco 4 — Dívidas que exigem ambiente que a máquina remota não tem

Estas foram deliberadamente **não** corrigidas, e o motivo importa tanto quanto
o achado. Todas estão detalhadas no `IMPECCABLE_AUDIT.md`.

## 4.1 Histórico sem paginação (Início, Gráficos, Desafios) — P1

`app/(app)/index.tsx:285`, `graficos.tsx:106` e `desafios.tsx:74` baixam o
histórico financeiro **inteiro**, sem limite.

**Por que ninguém simplesmente janelou a busca:** janelar não deixa a tela mais
lenta, deixa o **saldo errado**. A conta de saldo depende do histórico
completo. Uma tela lenta é um incômodo; um saldo errado num app de finanças é o
fim da confiança no produto.

A correção certa é **agregação no banco** — o padrão de
`get_gamification_summary()`, que a tela de Desafios já usa. Exige migração
aplicada e validada contra o banco de produção, o que a máquina remota não
alcança. A auditoria de 28/08 já tentou e reverteu por este mesmo motivo; não
tente de novo às cegas.

`perfil.tsx:244,264` e `desafios.tsx:63` já fazem certo, com `sinceDays` — são
a referência de como deve ficar.

## 4.2 Navegação e ícones nativos — P1, trava a conformidade em 1/4

Hoje iOS e Android usam a **mesma barra de abas em JavaScript** que a web usa,
com Ionicons em vez de SF Symbols / Material Symbols. É o tell clássico de "app
portado de site", e é o único motivo de a nota de Conformidade de Plataforma
ser 1/4.

As Native Tabs (`expo-router/unstable-native-tabs`) foram **removidas** em
`00de222` porque causavam tela branca muda: quando o componente Fabric falha ao
remontar, nada renderiza e nenhum erro sobe pro JavaScript. Aconteceu duas
vezes, a segunda numa build de release, no momento em que o Android recria a
Activity ao voltar do desbloqueio por digital.

**Reabrir exige validação em aparelho físico** — desbloqueio por digital,
recriação de Activity, retorno de background. Foi exatamente a falta desse
teste que deixou a regressão passar duas vezes. **Não reabilite sem isso.**

## 4.3 Verificação de dependências que não deu para rodar

`npx expo install --check` foi **bloqueado pelo proxy** na máquina remota
(`HTTP Proxy Network Error: Forbidden` — o egress bloqueia expo.dev).

Vale rodar aí **antes do próximo build**: incompatibilidade de versão de
pacote com o SDK 57 é o tipo de coisa que só aparece no EAS, depois de já ter
gasto cota de build.

---

# Bloco 5 — Pequenos (P3, ~2 horas no total)

Nenhum tem impacto real no usuário. Fazer quando sobrar tempo.

## 5.1 `perfil.tsx` fora do ritmo unificado

`app/(app)/perfil.tsx:970` usa `padding: spacing.xl, gap: spacing.lg` (20/16)
enquanto todas as outras telas usam `screenRhythm` (16/12). É exatamente o
drift que o token `screenRhythm` foi criado para eliminar — o comentário em
`lib/theme.ts` conta a história.

Ficou de fora da correção remota porque mudar o ritmo de uma tela inteira sem
poder vê-la é o tipo de alteração que precisa de olho humano.

## 5.2 Nove componentes órfãos — 614 linhas

Ninguém importa nenhum destes:

```
components/BrandLogo.tsx               36 linhas
components/EntradaEscalonada.tsx       60
components/FloatingIcon.tsx            73
components/GlowOrb.tsx                 49
components/IconeMetaAtingida.tsx       69
components/LandingHeroDemo.tsx        164
components/LaptopMockup.tsx            39
components/NotebookFloatEstatico.tsx   71
components/NotebookVideo.tsx           53
```

Não custam bundle (o Metro não empacota o que ninguém importa), então é
limpeza, não performance. **Confira antes de apagar** se algum é peça de
marketing que você pretende voltar a usar na landing.

Um detalhe: `FloatingIcon.tsx` faz parallax **sem checar `useReducedMotion`**.
Hoje é inofensivo porque está morto; se for reaproveitado, é violação de
acessibilidade.

## 5.3 Avatares sem cache

`perfil.tsx:429`, `index.tsx:1214` e `OnboardingModal.tsx:514` usam o `<Image>`
do React Native com `uri` remoto. O projeto não usa `expo-image` em lugar
nenhum. A foto que a pessoa subiu é decodificada em tamanho cheio para ser
exibida a 44px, e rebaixada de novo a cada montagem de tela, sem cache em disco
no Android.

Correção: `expo-image` com `cachePolicy` e `contentFit`.

## 5.4 `getItemLayout` nas listas de altura fixa

As 10 `FlatList` do app têm todas `keyExtractor` (verificado), mas só 5 pontos
usam `initialNumToRender` / `windowSize` / `removeClippedSubviews` /
`getItemLayout`. **Lançamentos e Crédito** têm altura de linha fixa e são as que
mais ganhariam — ainda mais com a importação em massa aceitando 10 mil
lançamentos.

---

# O que NÃO está pendente (para não refazer trabalho)

Coisas resolvidas nesta sessão e já na `main`:

- Acessibilidade dos gráficos (`PieChart` e `StackedBarChart` eram mudos para
  VoiceOver/TalkBack — WCAG 1.1.1)
- Memoização da Início, Crédito, Lançamentos, Contas e Desafios
- Entrelinha nas 8 telas (85 estilos)
- Trilho lateral em tablet nativo (iPad caía na barra flutuante esticada)
- `tabular-nums` nos campos de digitação de valor
- Badges do Desafios refluindo por classe de janela
- Botões de ação da Início voltando a deslizar
- Guarda ortográfica das notas de versão (`lib/notas-release.ts` + CLI + webhook)
- Guarda mecânica das Named Rules do DESIGN.md (`corpus-design-system.ts`)
- `DESIGN.md` reconciliado com o código (Native Tabs, `theme.danger`, sombras)

**`perfil.tsx` continuar com zero `useMemo` está CERTO** — ele não tem nenhum
valor derivado sobre lista. Não "corrija" isso.

---

# Regras permanentes do projeto (valem para tudo acima)

Do `AGENTS.md`, resumidas porque é fácil esquecer no meio do trabalho:

1. **`git fetch origin` e comparar com `origin/main` antes de qualquer commit.**
   Este repositório já sofreu reescrita acidental de histórico.
2. **Nunca `git init` neste diretório.** Se o `.git` quebrar, o reparo é clonar
   de novo — nunca reinicializar.
3. **Commitar e publicar antes de encerrar a sessão**, mesmo trabalho
   incompleto, para a outra máquina começar sincronizada.
4. **Build do EAS consome cota mensal compartilhada** entre as duas máquinas —
   pedir explicitamente antes de disparar.
5. **Subir `expo.version` no `app.json` ANTES de todo build de release.** Sem
   isso o webhook responde `older version ignored` e ninguém é avisado da
   atualização — e o silêncio é indistinguível de "não saiu build".
6. **A mensagem do build é copy de produto** e passa por verificador
   (`npm run notas:check`).
7. **Ler e atualizar o `context.md`** ao começar e ao terminar.

Antes de qualquer commit: `npx tsc --noEmit` e `npm run test:parser` — a suíte
hoje cobre corpus de voz/WhatsApp, OFX, dedup de CSV, limite de cartão,
paginação, recorrência, sequência, relatório, Score, guardas de schema, guarda
ortográfica das notas e guardas do design system.
