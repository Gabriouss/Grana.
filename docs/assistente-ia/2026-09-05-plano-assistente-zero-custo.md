# Assistente de IA financeiro — plano de implementação a custo zero

**Data:** 05/09/2026

**Estado:** implementado em 05/09/2026. Migration **aplicada em
produção**; Edge Function **ainda não publicada** (escolha explícita do
autor). Enquanto não for publicada, o chat do app responde erro.

## Objetivo

Dar ao usuário um assistente conversacional dentro do Grana. capaz de
responder perguntas sobre as próprias finanças ("quanto gastei em
Alimentação esse mês?", "como está meu score?", "quanto tenho livre pra
gastar?"), com **custo de operação zero** — sem novo provedor pago, sem
novo cadastro, sem cobrança por token.

## O que já existe hoje (e por que muda o desenho)

Uma investigação de código encontrou duas coisas que reformulam a
premissa inicial:

1. **Não existe nenhum LLM de chat/texto integrado ao produto hoje.** O
   único uso de IA em produção é **transcrição de áudio** (Whisper),
   usado em `supabase/functions/processar-lancamento-voz/index.ts` e no
   webhook do WhatsApp (`supabase/functions/whatsapp-webhook/index.ts`),
   via dois provedores já configurados como secrets do Supabase:
   - `GROQ_API_KEY` — preferencial, modelo `whisper-large-v3`.
   - `OPENAI_API_KEY` — fallback, modelo `whisper-1`.

   A interpretação do texto transcrito (valor, categoria, parcelas,
   boleto) **não usa modelo de linguagem nenhum** — é feita por um
   parser determinístico próprio, `lib/heuristics.ts` (replicado no
   webhook e mantido em sincronia por `__tests__/sync-parser.js`, com um
   corpus de mais de 34 mil casos de teste).

2. **Já existe um precedente estreito de "assistente que responde
   pergunta financeira"**, hoje só dentro do WhatsApp (canal desligado
   por decisão do autor após o banimento das contas no Meta — **não
   reativar isso como parte deste trabalho**):
   `interpretarConsulta`/`responderConsulta` em
   `supabase/functions/whatsapp-webhook/index.ts:1186-1310`. É regex
   puro: reconhece três perguntas fixas (gasto por categoria, boletos a
   vencer, fatura de crédito), sempre limitado ao mês corrente, e
   consulta o Supabase direto para responder com o número real. É o
   modelo a **estender**, não a arquitetura final — mas é a prova de que
   o padrão "responder com dado real, sem inventar" já roda em produção.

## Provedor e modelo — por que Groq, por que estes modelos

A conta e a env var `GROQ_API_KEY` já estão provisionadas em produção e
em uso ativo (transcrição de voz). Reaproveitá-las para chat elimina
qualquer cadastro novo ou secret novo.

A Groq expõe um endpoint de chat/completions compatível com o formato
OpenAI (`https://api.groq.com/openai/v1/chat/completions`). Consultando a
documentação oficial de modelos:

| Modelo | Uso proposto | Custo |
|---|---|---|
| `llama-3.1-8b-instant` | padrão — rápido (560 tok/s), contexto 131K | sem preço por token listado (tier gratuito) |
| `llama-3.3-70b-versatile` | fallback opcional pra perguntas mais abertas (280 tok/s) | sem preço por token listado (tier gratuito) |
| `openai/gpt-oss-120b` / `openai/gpt-oss-20b` | **não usar** | cobrados por token ($0.15–0.60 / 1M) |

**Atenção — isto pode mudar:** a Groq altera seus limites de tier
gratuito (RPM/RPD/TPM) com alguma frequência, e a página pública de
limites não lista todos os modelos de texto de forma estável. Antes de
qualquer lançamento em produção, conferir os números atuais em
`console.groq.com/settings/limits` com a conta já usada pelo projeto. O
desenho abaixo assume que esse número pode ser baixo e apertado, e por
isso é defensivo por construção (ver "Proteção contra estouro de cota").

## Arquitetura: "grounded", sem alucinação de valores em reais

Um assistente financeiro que inventa um número é pior do que não
existir. O desenho central deste plano é: **o LLM nunca vê o banco de
dados nem escreve SQL, e nunca gera um valor em R$ por conta própria.**
Ele recebe a pergunta do usuário e escolhe, via *tool calling*, qual de
um conjunto FIXO de ferramentas determinísticas chamar; a ferramenta
busca o número real no Supabase; o modelo só recebe esse número já
calculado e o transforma em frase natural.

Isso resolve três problemas ao mesmo tempo:
- **Correção**: o número que aparece na tela sempre veio de uma consulta
  real, testada, igual às que o resto do app já usa — nunca de geração
  livre do modelo.
- **Custo/token**: o prompt fica pequeno (pergunta + resultado da
  ferramenta), nunca um dump de transações — cabe confortavelmente no
  tier gratuito.
- **Reaproveitamento**: cada ferramenta é a extensão de um cálculo já
  testado no projeto, não código novo arriscado.

### Ferramentas propostas

| Ferramenta | Baseada em | Observação |
|---|---|---|
| `gastoPorCategoria(categoria, período)` | tipo `'categoria'` de `responderConsulta` | generalizar período (hoje só mês corrente) |
| `boletosAVencer()` | tipo `'boletos'` de `responderConsulta` | mesma janela de `lib/projections.ts` |
| `resumoCredito()` | tipo `'credito'` de `responderConsulta` | detalha por cartão quando há mais de um |
| `resumoScore()` | `getGamificationState` (`lib/gamification.ts`) | portar pro servidor — só o score e o fator dominante, não o objeto inteiro |
| `livreParaGastar()` | Safe-to-Spend (`lib/projections.ts`) | mesmo valor exibido em `SafeToSpendCard` |

"Portar, não importar" é o mesmo padrão já usado pelo parser heurístico
dentro do webhook: Deno não importa de `lib/`, então a lógica é copiada
e mantida em sincronia (o projeto já tem esse guard-rail de teste
para o parser; o mesmo princípio se aplica aqui).

## Backend

Nova Edge Function `supabase/functions/assistente-financeiro/index.ts`:

- **Autenticação pelo JWT do próprio usuário** (não `service_role`).
  Diferente dos crons existentes (`enviar-lembretes-habito`, que roda
  sem ninguém logado), aqui há sempre um usuário real fazendo a
  pergunta — deixar o RLS de cada tabela filtrar naturalmente é mais
  seguro e mais simples do que replicar filtros de `user_id` à mão.
- **Rate limit em memória por usuário**, mesmo padrão já usado em
  `processar-lancamento-voz` (janela de 60s, N requisições). Barato de
  implementar e é a primeira linha de defesa contra estourar o tier
  gratuito por uso abusivo de uma única conta.
- **Degradação graciosa**: se a Groq responder 429 (limite de tier
  atingido) ou erro 5xx, a função devolve uma mensagem amigável
  ("Não consegui pensar nisso agora, tenta de novo em instantes") em vez
  de travar a tela ou devolver erro cru. Nunca re-tentar automaticamente
  sem teto — evita amplificar um estouro de cota já em curso.

## Schema

Uma tabela nova, `assistant_messages`, seguindo o padrão de toda tabela
de usuário do projeto:

```sql
create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null check (papel in ('usuario', 'assistente')),
  texto text not null,
  ferramenta_usada text,
  criado_em timestamptz not null default now()
);

alter table public.assistant_messages enable row level security;
create policy "usuario acessa proprio historico" on public.assistant_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Recomendado incluir desde a primeira versão: o risco/custo é baixo e o
valor é real — o usuário reabre o assistente mais tarde e continua de
onde parou, em vez de perder o histórico a cada sessão.

## Cliente

Nova tela `app/(app)/assistente.tsx`: chat de verdade (campo de texto
livre, lista de mensagens, scroll automático pro fim). A estrutura
visual de bolhas de `components/ConversaGranabo.tsx` serve de referência
de layout, mas **não as cores** — aquele componente usa a paleta
literal do WhatsApp por ser uma citação daquele produto na landing page;
uma tela dentro do próprio Grana. usa os tokens normais de
`lib/theme.ts`.

**Acesso — decidido e já implementado em 05/09/2026.** A ideia inicial
(botão flutuante na Início) foi descartada em favor de dar ao Granabô um
lugar fixo na navegação principal. A barra de abas passou de 5 para 7
destinos, nesta ordem:

> Início · Débito e Pix · Crédito · **Granabô** · Boletos · Gráficos · Desafios

Três consequências:

1. **O Granabô fica no centro exato** (4º de 7) e ganha um botão
   destacado — disco de menta sólida, elevado acima da aresta superior
   da pílula. É a ação primária da barra e segue o mesmo tratamento que
   o resto do produto já dá a ação primária (menta sólida + tinta
   petróleo), diferenciando-se pela elevação, não por uma cor nova.
2. **Gráficos volta para a barra.** Era desktop-only (`href: null` +
   `SideNav`) e no celular não tinha ponto de acesso nenhum — um destino
   real inalcançável. Agora é a 6ª aba.
3. **Perfil continua fora da barra**, acessível pelo avatar no cabeçalho
   da Início e pela lateral do desktop: é configuração, não destino de
   uso diário.

O limite de 5 abas nunca foi restrição do React Navigation — a barra é
100% desenhada em JavaScript (`FloatingTabBar`), então 7 itens é só uma
questão de largura, que cabe com folga mesmo em tela de 320px.

Na mesma passada foi corrigido o desfoque da barra, que não borrava o
conteúdo por trás: o container tinha `backgroundColor` semiopaco **e** a
camada de vidro repetia o mesmo tom por cima, somando ~88% de opacidade.
O desfoque existia, só não tinha o que mostrar. O tom passou a morar numa
camada só.

A tela em si (`app/(app)/assistente.tsx`) existe hoje como casca — um
botão que leva a lugar nenhum seria pior do que uma tela que diz
honestamente o que ainda não faz. A conversa entra quando a Edge
Function e a tabela deste documento forem implementadas.

**Bônus de custo zero**: permitir perguntar por voz reaproveitando
`lib/voz.ts` + `processar-lancamento-voz`, infraestrutura de
transcrição que já está paga/gratuita e em produção — nenhuma chamada
nova de custo, só um novo consumidor do mesmo pipeline.

## Skills a usar quando a implementação começar

- `grana-app:supabase-postgres-best-practices` — antes de escrever a
  migration da tabela nova e da Edge Function em produção.
- `copywriting` — tom das respostas do assistente, mesmas regras de
  marca já em vigor no projeto (sem travessão, sem "não é X, é Y", nunca
  julgando o usuário pelos próprios gastos).

## Fora de escopo

Reativar o Granabô/WhatsApp como canal do assistente. Está desligado
por decisão explícita do autor depois do banimento das contas no Meta —
assunto pausado, não faz parte deste plano.

## Verificação (quando a implementação for pedida)

- `npx tsc --noEmit` e `npm run test:parser` depois de cada mudança.
- Migration da tabela nova aplicada em produção só com token/acesso
  explícito do autor.
- QA manual: cada ferramenta devolvendo o mesmo número que a tela
  equivalente do app já mostra (ex.: `resumoScore()` bate com o score
  visto em Desafios).
- Testar o caminho de degradação (simular 429 da Groq) antes de
  considerar pronto — o requisito de "custo zero" só é seguro se o
  sistema nunca tenta forçar uma chamada além da cota.
- Nenhuma build EAS disparada sem pedido explícito (regra 4 do
  `AGENTS.md`).
