# Plano para o Codex — ciclo de fatura do cartão de crédito (correção + 2 pendências novas)

Data: 2026-09-06
Pedido por: Gabriel (autor)
Para: Codex (sessão sem o histórico desta conversa — este documento precisa
bastar sozinho, sem depender de nada dito antes dele)

## Por que este documento existe

O autor pediu, nesta mesma tarde, que a Cláudia (sessão anterior) implementasse
um design já aprovado (`2026-09-03-ciclo-fatura-cartao-design.md`) que nunca
tinha saído do papel: os lançamentos no cartão de crédito precisam se agrupar
pela FATURA (ciclo de fechamento/vencimento do cartão), não pelo mês do
calendário. A implementação saiu em rodadas, com bugs reais encontrados pelo
autor testando ao vivo a cada rodada — o tipo de vaivém que cansa quem está do
outro lado pedindo a correção. Este documento existe pra dar ao Codex o
histórico completo (o que já foi feito, o que já deu errado e foi corrigido, o
que ainda falta) numa vez só, pra não repetir os mesmos erros nem redescobrir
o que já está resolvido.

**Duas coisas ainda estão pendentes**, pedidas pelo autor na mensagem mais
recente, verbatim:

1. "A lista precisa ser visualizada em ciclo de faturas, não ciclo mensal do
   calendário comum."
2. "É preciso criar uma forma de separar lançamentos de dois cartões
   diferentes em listas diferentes, para não misturar o lançamento de um
   cartão e de outro ou mais de 2."

O item 1, pelo que já foi implementado e testado (ver seção "Estado atual"),
**já está resolvido** em todos os lugares conhecidos — mas o autor reafirmou o
requisito, então o Codex deve tratar isto como um item de VERIFICAÇÃO
obrigatória (rodar os cenários de teste desta doc de novo, com o código atual)
antes de assumir que está pronto, e corrigir qualquer lugar onde não estiver.

O item 2 é um requisito **novo**, ainda não implementado. Está detalhado na
seção "Tarefa nova — separar lançamentos por cartão".

## A regra de negócio (não é ambígua, já foi validada com o autor)

> A partir do dia do fechamento (inclusive), todo gasto entra no ciclo
> seguinte, não no que está fechando.

Concretamente, com um cartão de fechamento no dia 15:

- Um lançamento no dia 14 (ou antes) pertence à fatura que fecha NESTE mês.
- Um lançamento no dia 15 (ou depois) pertence à fatura que fecha no mês
  SEGUINTE.
- Ex.: fechamento dia 15 — a fatura que fecha em setembro cobre lançamentos de
  15/08 a 14/09. Um lançamento em 31/08 pertence a essa fatura de setembro,
  não à de agosto.

Isso já está implementado como função pura em `lib/faturaCiclo.ts` (ver
abaixo) e testado com 15 casos em `__tests__/corpus-fatura-ciclo.ts`. **Não
reimplemente esta lógica em outro lugar — importe daqui.**

## Estado atual — o que já foi implementado (histórico completo, em ordem)

Design original aprovado em 03/09/2026:
`docs/superpowers/specs/2026-09-03-ciclo-fatura-cartao-design.md` — leia-o
primeiro, ele explica o modelo de ciclo com mais profundidade (janela de
datas, nome da fatura pelo mês de fechamento, etc.).

Commits, em ordem, todos já na `main`:

1. **`46bd60d`** — implementação inicial. Criou `lib/faturaCiclo.ts`
   (`mesFaturaDoLancamento`, `janelaFatura`, `dataVencimentoFatura`),
   `__tests__/corpus-fatura-ciclo.ts` (15 casos), e reescreveu
   `app/(app)/credito.tsx` pra ter dois eixos de navegação por mês
   independentes: `selectedYear`/`selectedMonth` (mês civil, só pra visão
   "Total") e `faturaCardYear`/`faturaCardMonth` (ciclo do cartão específico
   selecionado, resetado pra "fatura em aberto agora" toda vez que um cartão
   é selecionado). `components/MonthSelector.tsx` ganhou `currentYear`/
   `currentMonth` opcionais, porque o selo "Atual" e o toque-pra-voltar
   comparavam sempre contra o mês civil de hoje, o que fica errado pra fatura
   de cartão. Script de prévia de migração das faturas já pagas (mudam de
   convenção de chave) em
   `docs/superpowers/specs/2026-09-06-migracao-fatura-cartao-preview.sql` —
   **nunca executado**, só escrito.
2. **`2f7f6a3`** — bug de LAYOUT: o texto "Fecha dia X" que tinha acabado de
   ser adicionado entrou na MESMA linha do "Vence em...", e a soma dos dois
   textos quebrava linha em tela estreita — o selo de status (Aberta/Paga/
   Atrasada), que fica na mesma fileira, passava a SOBREPOR o texto quebrado.
   Corrigido: "Fecha dia X" virou linha própria, acima da fileira "Vence
   em... + selo".
3. **`470ee45`** — bug de CONSISTÊNCIA: o carrossel de cartões (a pílula
   "Fatura atual" de cada cartão, no topo da tela) tinha ficado de propósito
   fora da correção, com a justificativa de que "cartões podem ter
   closing_day diferentes, não existe um ciclo único pra agregar". O autor
   testou e mostrou que essa justificativa não se sustenta: um lançamento
   dentro do período real da fatura não aparecia junto com o resto do ciclo
   no carrossel, mesmo aparecendo certo no painel de detalhe embaixo.
   Corrigido: `cardSpent` (o valor do carrossel) passou a agrupar por
   `mesFaturaDoLancamento` com o `closing_day` de CADA cartão. Isso exigiu
   alargar a busca de dados: `loadData` passou a buscar sempre o par de HOJE
   (mês atual + anterior) além do par do eixo navegado, com dedup por id —
   sem isso, cartões que não são o navegado ficavam com dado incompleto
   quando a tela estava longe de hoje.
4. **`566b774`** — feature nova (não bug): editar um cartão já cadastrado não
   existia, só criar e excluir. `lib/data.ts` ganhou `updateCreditCard`; o
   menu de opções do cartão (antes só lixeira, exclusão direta) e o toque
   longo passaram a abrir o mesmo menu Editar/Excluir que os lançamentos já
   usam (`ItemActionSheet`).
5. **`f5bb94b`** — bug de CONSISTÊNCIA (o mais sério, e o que motivou a
   frustração do autor): a visão **"Total" (Todos os Cartões)** — que é a
   ABA PADRÃO da tela, a que abre primeiro — continuava agrupando por mês
   civil, com a MESMA justificativa errada do item 3 ("não existe um ciclo
   único"). O autor testou essa aba especificamente com o cartão real dele
   (fechamento dia 15) e reagiu mal, com razão: viu uma lista de lançamentos
   de fim de agosto agrupados por calendário, exatamente o comportamento que
   pediu pra tirar. Corrigido: `creditTransactions` agora resolve CADA
   lançamento pelo ciclo do SEU PRÓPRIO cartão (via `card_id`), mesmo na
   visão Total — "Setembro" ali passa a significar "soma de toda fatura que
   fecha em setembro", não mês civil. Só um lançamento SEM cartão vinculado
   (o cartão foi excluído) cai no mês civil, único caso sem `closing_day`
   disponível pra classificar.

Depois do commit 5 (`f5bb94b`), testado ao vivo com um cartão de fechamento
dia 15: um lançamento em 31/08 sumiu do Total de agosto e apareceu no Total
de setembro, junto com os outros lançamentos daquele ciclo. **Este era o
estado "correto" no momento em que o autor mandou as duas pendências novas
que abrem este documento.**

### Arquivos que compõem a feature hoje

| Arquivo | Papel |
|---|---|
| `lib/faturaCiclo.ts` | Matemática pura do ciclo — única fonte de verdade |
| `__tests__/corpus-fatura-ciclo.ts` | 15 casos de teste da matemática pura |
| `app/(app)/credito.tsx` | Tela inteira — navegação, listagem, carrossel, pagamento de fatura |
| `components/MonthSelector.tsx` | Seletor de mês/fatura, compartilhado com outras 3+ telas |
| `lib/data.ts` | `fetchCreditCards`, `addCreditCard`, `updateCreditCard`, `deleteCreditCard`, `fetchCreditTransactionsForMonth`, `payCardInvoice`, `reopenCardInvoice` |
| `docs/superpowers/specs/2026-09-06-migracao-fatura-cartao-preview.sql` | Script de prévia (SELECT) pra faturas já pagas sob a convenção antiga — não executado |

## Erro cometido durante o teste (não é bug do app — registrado pra não confundir)

Ao testar o cenário de fechamento dia 15 (reproduzindo o cartão real do
autor), um lançamento que deveria ter sido datado "31 de agosto" foi salvo
como **31 de julho** por engano — o segundo clique em "mês anterior" no
calendário, feito às pressas, foi parar um mês além do esperado. Não era
bug de agrupamento: dia 31 com fechamento dia 15 pertence mesmo à fatura de
AGOSTO, e o app mostrou isso corretamente ao navegar pra lá. **Isto não
prova nada sobre `DatePickerModal` estar com bug** — a checagem do código
(`components/DatePickerModal.tsx:39-48`) mostra que ele reseta corretamente
pro mês de `currentISO` toda vez que abre (`useEffect` com deps
`[visible, currentISO]`). Registrado só pra quem for testar de novo não
cair na mesma armadilha de contar clique errado.

## Tarefa 1 — verificar que TODA lista usa ciclo de fatura (não calendário)

O autor reafirmou este requisito depois do commit `f5bb94b` já estar
publicado. Antes de mexer em qualquer código, o Codex deve:

1. Ler `app/(app)/credito.tsx` do zero (não confiar só neste resumo) e listar
   TODO lugar que filtra `transactions` por data, ou que exibe "R$ X" ligado a
   um período.
2. Para cada um, confirmar que a classificação vem de
   `mesFaturaDoLancamento(occurred_on, closing_day)` (do cartão do próprio
   lançamento), nunca de `isSameMonth`/comparação direta de mês civil — EXCETO
   o caso documentado (lançamento sem `card_id`, cartão excluído, que cai no
   mês civil por não ter `closing_day` nenhum pra usar).
3. Rodar os cenários de teste da seção "Roteiro de verificação" abaixo, com
   `agent-browser` ou no app real, antes de considerar concluído.
4. Se achar mais um lugar ainda preso ao mês civil (é o padrão que já se
   repetiu 2 vezes — carrossel e Total), **não deixe de propósito de novo**:
   corrija, mesmo que pareça fora de escopo. O autor já disse duas vezes que
   não aceita essa exceção.

## Tarefa 2 — separar lançamentos de cartões diferentes em listas diferentes

**Requisito novo, ainda não implementado.** Pedido do autor, verbatim: "é
preciso criar uma forma de separar lançamentos de dois cartões diferentes em
listas diferentes, para não misturar o lançamento de um cartão e de outro ou
mais de 2".

### O problema concreto

Na visão **"Total" (Todos os Cartões)** — a aba padrão, quando `selectedCardId
=== 'all'` — a lista de lançamentos (`creditTransactions`, renderizada pelo
`<FlatList>` em `app/(app)/credito.tsx`) é um array ÚNICO, com lançamentos de
TODOS os cartões do usuário misturados, ordenados só por data. Quem tem 2+
cartões vê as compras de cada um intercaladas na mesma lista, sem indicação
visual de qual cartão é qual além do texto pequeno de categoria em cada linha.

### Proposta concreta de solução (ponto de partida, não obrigatório seguir à risca)

Trocar a lista plana por uma lista agrupada POR CARTÃO, só na visão Total
(quando um cartão específico está selecionado, já não há o que separar — é
só um cartão). Sugestão de implementação:

1. Derivar, a partir de `creditTransactions` (já filtrado pelo ciclo certo,
   ver Tarefa 1), um agrupamento por `card_id`:
   ```ts
   const gruposPorCartao = useMemo(() => {
     if (selectedCardId !== 'all') return null; // um cartão só, sem o que separar
     const mapa = new Map<string, { card: CreditCard | null; txs: Transaction[] }>();
     for (const t of creditTransactions) {
       const chave = t.card_id ?? '__sem_cartao__';
       const card = t.card_id ? walletCards.find((c) => c.id === t.card_id) ?? null : null;
       if (!mapa.has(chave)) mapa.set(chave, { card, txs: [] });
       mapa.get(chave)!.txs.push(t);
     }
     return Array.from(mapa.values());
   }, [selectedCardId, creditTransactions, walletCards]);
   ```
2. Trocar o `<FlatList data={creditTransactions} .../>` por uma renderização
   em seções quando `gruposPorCartao` não for nulo — `SectionList` do React
   Native é o componente natural pra isso (`sections={gruposPorCartao.map(g
   => ({ title: g.card?.name ?? 'Sem cartão vinculado', data: g.txs, card:
   g.card }))}`), com `renderSectionHeader` mostrando o nome do cartão + a
   bolinha de cor dele (mesmo padrão visual do carrossel) + o subtotal
   daquele cartão no ciclo atual (`g.txs.reduce(...)`).
3. Cartão específico selecionado continua exatamente como está hoje — uma
   lista plana, sem seção, porque não há ambiguidade nenhuma (só um cartão).
4. Lançamentos sem cartão vinculado (órfãos, de um cartão excluído) formam a
   própria seção, com título claro ("Sem cartão vinculado" ou similar) — não
   escondê-los nem misturá-los silenciosamente com um cartão real.
5. Ordem das seções: sugestão é a mesma ordem do carrossel (`walletCards`),
   pra quem olha o carrossel em cima e a lista embaixo reconhecer a mesma
   sequência.

### O que NÃO mudar nesta tarefa

- O resumo agregado no topo ("Total em Faturas — Todos os Cartões: R$ X")
  continua sendo a SOMA de tudo — a separação é só na LISTA de lançamentos,
  não no número agregado.
- O carrossel de cartões no topo já mostra "Fatura atual" por cartão
  individualmente (ver commit `470ee45`) — não precisa mudar, ele já resolve
  a mesma necessidade de "ver por cartão" de outro jeito. A lista agrupada é
  complementar, pra quando a pessoa rola a lista de lançamentos em si.
- Contas a pagar (`app/(app)/contas.tsx`) e Lançamentos (`lancamentos.tsx`)
  não têm o conceito de "cartão" e não são afetados por esta tarefa.

## Dívidas conhecidas, ainda não resolvidas (fora do escopo das duas tarefas acima, mas relacionadas)

1. **Migração de `credit_card_invoices`** — o script de prévia
   (`docs/superpowers/specs/2026-09-06-migracao-fatura-cartao-preview.sql`)
   nunca foi rodado contra o banco de produção. Faturas pagas ANTES da
   correção do ciclo guardam a chave `(year, month)` sob a convenção antiga
   (mês civil); se o autor já pagou alguma fatura antes de hoje, ela pode
   estar com a chave errada agora. Rodar a prévia (só SELECT, no SQL Editor
   do Supabase) e mostrar o resultado ao autor antes de cogitar qualquer
   UPDATE — o próprio script já vem com essa trava documentada.
2. **`resumoCredito` no Granabô** (`supabase/functions/assistente-financeiro/
   index.ts`) — a ferramenta que o assistente de IA usa pra responder
   perguntas sobre cartão de crédito foi escrita ANTES desta correção e
   nunca foi conferida contra o novo modelo de ciclo. Provavelmente ainda
   responde por mês civil. Não foi tocada nesta rodada porque é um arquivo
   totalmente diferente (Edge Function, não a tela) e o autor não pediu —
   mas é o mesmo tipo de inconsistência já corrigida duas vezes na tela, e
   vale conferir.
3. **Lembretes de vencimento** (`scheduleCardInvoiceReminders`, dentro de
   `loadData` em `credito.tsx`) já foram corrigidos pra usar o ciclo (commit
   `46bd60d`), mas não foram testados em aparelho físico com notificação de
   verdade — só a lógica de cálculo foi verificada.

## Roteiro de verificação (rodar antes de considerar qualquer tarefa concluída)

Usar a conta de testes (`gbr.design30@gmail.com` / `Gelitogelado1`) ou
`agent-browser` no dev server (`npx expo start --web`). Criar um cartão de
teste com fechamento dia 15, vencimento dia 22 (mesma config do cartão real
do autor, "C6"), e:

1. **Corte exato**: lançar uma compra no PRÓPRIO dia 15 — tem que aparecer na
   fatura do mês SEGUINTE, nunca na que fecha naquele mês.
2. **Fim de mês**: lançar uma compra em 31 do mês — com fechamento dia 15,
   pertence à fatura que fecha no mês seguinte (dia 31 >= 15).
3. **Total consistente com cartão específico**: com 1 cartão só, o valor
   mostrado na aba "Total" pro ciclo de setembro tem que ser IGUAL ao valor
   mostrado quando esse mesmo cartão está selecionado, no mesmo ciclo.
4. **Dois cartões, sem mistura**: criar um segundo cartão com fechamento
   diferente (ex.: dia 5), lançar em cada um, e confirmar (a) que a Tarefa 2
   realmente separa os dois na visão Total, e (b) que trocar de "Total" pra
   um cartão específico mostra só as compras DAQUELE cartão.
5. **Vencimento cruzando mês civil**: cartão com `due_day < closing_day` (ex.:
   fechamento 20, vencimento 5) — confirmar que "Vence em" mostra o mês
   SEGUINTE ao de fechamento.
6. **Editar cartão muda o agrupamento sozinho**: editar o `closing_day` de um
   cartão com lançamentos já existentes e confirmar que a lista/carrossel/
   Total se reclassificam sozinhos, sem precisar tocar em nenhum lançamento
   (isso já é o comportamento esperado, por design — os testes 1-4 servem
   também pra confirmar que continua assim depois da Tarefa 2).
7. `npx tsc --noEmit` e `npm run test:parser` (a suíte cobre os 15 casos
   puros de `lib/faturaCiclo.ts`, mas NÃO cobre a tela — os testes 1-6 acima
   são manuais, sem framework de UI configurado neste projeto).

## Regras permanentes do projeto (não específicas desta tarefa, mas valem)

Do `AGENTS.md`, resumidas:

- `git fetch origin` e comparar com `origin/main` antes de qualquer commit.
- Nunca `git init` neste diretório.
- Commitar e publicar (`git push`) antes de encerrar a sessão, mesmo trabalho
  incompleto.
- Build do EAS consome cota mensal compartilhada entre duas máquinas — NUNCA
  disparar sem pedido explícito do autor na sessão atual.
- Todo build de release passa por `npm run build:preparar` — nunca subir
  `expo.version` nem escrever a mensagem do build à mão.
- Atualizar `context.md` ao terminar, com o que mudou e o estado atual.
