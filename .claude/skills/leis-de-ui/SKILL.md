---
name: leis-de-ui
description: Leis de UI. Auditoria de interface do Grana. pelas 20 leis de UX (Hick, Fitts, Jakob, proximidade, Miller, Doherty, Von Restorff, posição serial, pico-fim, Zeigarnik, Occam, Tesler, Postel, Murphy, semelhança, conectividade uniforme, Parkinson, carga cognitiva e gradiente de meta), com medidor automático para páginas web. Use quando o autor disser "leis de UI", pedir auditoria de UX, usabilidade ou conversão de uma tela do app, da landing, do site de vendas ou do painel admin, ou quando uma mudança de interface precisar ser conferida antes de ir ao ar.
---

# Leis de UI

Skill pedida pelo autor em 24/10/2026, a partir da lista "20 leis de UX para o Claude melhorar suas interfaces":
"Pode transformar em uma skill de auditoria, nomeie ela como Leis de UI". A primeira auditoria feita com ela foi a da
landing, no mesmo dia.

Ela não substitui nenhuma regra do `AGENTS.md` nem as skills de acabamento (`impeccable`, `ui-visual-composition`,
`apple-design`). Ela pergunta outra coisa: **a tela ajuda a pessoa a fazer o que veio fazer?** Se esta skill e uma regra
do projeto discordarem, vale a regra, e esta skill é corrigida no mesmo commit.

## 0. Antes de abrir a tela

1. **Auditoria só lê.** Corrigir é outro pedido. Achado confirmado vira proposta de correção; a mudança de posição ou
   estrutura vai em commit próprio quando for feita (regra 14).
2. **Em produção, não poluir a medição de campanha.** Na landing, clique em **Recusar** no aviso de cookies, nunca em
   Aceitar, para não gerar `PageView` falso no Pixel. Nunca clique em comprar: dispara `InitiateCheckout` e sai para a
   Cakto. O medidor já faz as duas coisas sozinho.
3. **Decisão do autor não é defeito.** Antes de apontar rótulo, ordem de seção ou texto, procure o comentário no código
   e o registro no `context.md`. A landing tem comentários com a decisão de quase cada bloco (a "estrutura de 13
   blocos" de 13/09/2026, os rótulos dos CTAs de 17/09/2026). Quando a lei pedir o contrário de uma decisão
   registrada, o achado entra como **recomendação para o autor decidir**, com a decisão citada, e não como defeito.
4. **O que nunca entra:** tema claro e tela deitada (o app é só escuro e só retrato, decisão de 19/09/2026).

## 1. Medir

### Página web (landing, site de vendas, painel admin)

```
python -I .claude/skills/leis-de-ui/scripts/medir.py <url> [--larguras 390x844,360x640,768x1024,1440x900] [--saida <pasta>]
```

Saída padrão: `E:\Grana-temporarios\leis-de-ui\<data-hora>-<alvo>\` com `medidas.json` e um print por altura de tela
(`<largura>-NN.png`, mais `<largura>-00-chegada.png` com o que a pessoa vê ao chegar). O resumo no terminal é uma linha
por largura; o detalhe fica no JSON. O que ele mede:

| Medida | Lei |
| --- | --- |
| `alvos.pequenos` (< 44 px num lado) e `abaixoDe24` | Fitts |
| `alvos.naPrimeiraDobra` | Hick |
| `estilosDeBotao` (agrupa por fundo, borda, raio e fonte, com os textos de cada grupo) | Semelhança, Von Restorff |
| `perf` (TTFB, FCP, LCP, CLS) e `perfRedeMovel` (4G lento + CPU 4x, o celular de quem vem do anúncio) | Doherty |
| `fixos` e `avisoCookies` (área ocupada) | Fitts (distância), carga cognitiva |
| `titulos` com a posição de cada um, e `altura` (divida pela altura da tela para ter "quantas telas") | Posição serial, carga cognitiva |
| `paragrafosLongos` (> 60 palavras) | Carga cognitiva, Miller |
| `viuvas` (última linha com uma palavra só) | Regra 29 |
| `saidas` (link com `target=_blank` ou para outro domínio) | Regra da landing: só o checkout da Cakto sai da página |
| `rolagemHorizontal`, `errosConsole` | Murphy |

Para olhar os prints sem gastar contexto, monte uma folha de contato (6 prints lado a lado, em escala 0,6) com PIL e
leia a folha; abra o print inteiro só onde houver achado.

**Armadilhas já resolvidas no medidor, para ninguém reescrever pior:**

- A landing rola dentro de um contêiner com `scroll-snap`, não na janela. Nele `scrollTo()` não move nada; só
  `scrollTop = y` move. Sem isso todos os prints saem iguais ao topo.
- No React Native Web a fonte fica no filho que tem o texto, não no wrapper do botão; ler a fonte do wrapper dá
  "Times New Roman".
- `text-wrap: pretty` **não garante** ausência de viúva no Chromium: conferido em 24/10/2026, a viúva continuou com
  `pretty` e sumiu com `balance`. Viúva medida é achado mesmo com `pretty` aplicado. E `balance` também tem dois
  furos: não age em texto com mais de 6 linhas, e deixa a palavra sozinha quando as duas linhas já têm a mesma
  largura ("Contas com / vencimento"). Nesses casos a correção é `semViuva()` (`lib/sem-viuva.ts`).
- Depois de corrigir uma viúva, meça de novo nas quatro larguras: ela muda de lugar com a largura, e a correção de
  uma largura pode criar outra.
- Viúva dentro de mockup de tela (nome de loja, "R$ 172,02/dia") é dado de exemplo do desenho, não texto corrido:
  descarte esses casos.
- O LCP medido sem limitação de rede engana. Use o `perfRedeMovel` para julgar Doherty.

### App (Android)

O medidor é só para web. No app, siga a regra 18 (`node scripts/emulador.cjs`, `docs/operar-o-app-no-emulador.md`): os
alvos saem dos `bounds` do `uiautomator dump`, e a mesma tabela da seção 2 vale, trocando "primeira dobra" por "tela
sem rolar".

## 2. As 20 leis: o que conferir

Gravidade: **P1** desvia ou impede a ação principal da tela (comprar, lançar, entender o saldo) ou viola regra do
projeto; **P2** atrapalha de forma mensurável; **P3** é acabamento.

| # | Lei | O que conferir | Limiar ou sinal |
| --- | --- | --- | --- |
| 1 | Hick | Quantas ações competem por atenção em cada tela e na primeira dobra | Uma ação principal por tela; até 3 ou 4 na primeira dobra; menu até 7 itens |
| 2 | Fitts (tamanho) | Área de toque de todo alvo | 44 x 44 px recomendado, 24 x 24 px mínimo (WCAG 2.5.8), 8 px entre alvos |
| 3 | Jakob | A tela funciona como os apps e sites que a pessoa já usa | Logo leva ao topo, preço numa seção de preço, perguntas em acordeão, abas embaixo no app |
| 4 | Proximidade | O espaço agrupa o que é do mesmo assunto | Espaço entre grupos pelo menos 1,5x o espaço dentro do grupo; garantia e forma de pagamento perto do preço |
| 5 | Miller | Quanto a pessoa precisa guardar de cabeça | Blocos de até 7 itens; nada que precise ser lembrado de uma tela para outra |
| 6 | Doherty | Tempo até a tela responder | LCP até 2,5 s em 4G lento (acima de 4 s é ruim); CLS até 0,1; resposta visual ao toque abaixo de 100 ms e ação abaixo de 400 ms |
| 7 | Von Restorff | O elemento que mais chama atenção é a ação principal | Nenhuma ação secundária com peso visual igual ou maior que a principal; um destaque por tela |
| 8 | Fitts (distância) | Distância até a ação principal | No celular, a ação principal fica na zona do polegar ou sempre à vista; elemento fixo não cobre conteúdo |
| 9 | Posição serial | O que está nas pontas (primeira e última seção, primeiro e último item) | Promessa e ação nas pontas; secundário no meio |
| 10 | Pico-fim | O momento mais forte e o final da jornada | O pico (simulador, demonstração) funciona sem atrito; o fecho tem a ação e nenhum ruído |
| 11 | Zeigarnik | Tarefa de várias etapas mostra o que falta | Passos numerados ou barra de progresso |
| 12 | Navalha de Occam | Cada elemento muda alguma decisão da pessoa | Conteúdo repetido ou seção que não muda decisão é achado |
| 13 | Tesler | Quem carrega a complexidade: o app ou a pessoa | Valores padrão preenchidos, nada de conta de cabeça, texto em vez de formulário quando der |
| 14 | Postel | Entrada tolerante, saída padronizada | Campo aceita "30", "30,00", "R$30"; e-mail aceita espaço e maiúscula; saída sempre no mesmo formato |
| 15 | Murphy | O que acontece quando dá errado | Estado de erro, sem rede, desfazer, confirmação em ação destrutiva, recibo visível (regra 9) |
| 16 | Semelhança | Mesma função, mesmo visual; função diferente, visual diferente | No máximo 3 estilos de botão (principal, secundário, link); a mesma ação nunca com dois estilos |
| 17 | Conectividade uniforme | Caixa, linha ou fundo ligando só o que é relacionado | Ela vence proximidade e semelhança: um contêiner errado junta coisas que não são do mesmo assunto |
| 18 | Parkinson | A tarefa tem o mínimo de passos e de campos | Passo opcional removido ou adiado; tempo estimado quando a tarefa for longa |
| 19 | Carga cognitiva | Esforço mental total | Um tema por seção; parágrafo até 60 palavras; sem jargão financeiro; elemento flutuante competindo com o texto conta |
| 20 | Gradiente de meta | Perto do objetivo, a motivação cresce | Progresso que já começa andado; reforço perto do fim |

**Regras do projeto conferidas junto**, porque a auditoria passa pelas mesmas telas: viúva (regra 29), saída da página
na landing (só o checkout da Cakto; exceções: "Entrar" do topo, links do rodapé e Instagram em aba nova), tipografia só
Light e Regular sem `fontWeight`, copy sem travessão e sem "não é X, é Y", e conformidade legal (texto de
consentimento, cobrança e privacidade só muda com revisão de LGPD e CDC).

## 3. Confirmar no código

Todo achado aponta o `arquivo:linha` que o produz. Leia o trecho antes de escrever o achado, e procure a decisão
registrada (seção 0, item 3). Quando a causa não for encontrada, diga isso; hipótese não passa por fato.

## 4. Formato do achado

Mesmo padrão dos revisores (regra 16). Achado sem cenário concreto é palpite e não entra.

```
A<n> · <Lei> · P1|P2|P3 · confirmado | sem confiabilidade suficiente | recomendação (decisão do autor)
Onde: <tela/seção, largura> · <arquivo:linha>
Evidência: <medida do medidor e/ou print>
Cenário: <quem, fazendo o quê, vê o quê, e o que isso custa>
Proposta: <a menor mudança que resolve>
```

## 5. Relatório

Salve em `<pasta da medição>\relatorio.md` e entregue ao autor um resumo curto:

1. **Placar das 20 leis**: passa, achado ou não se aplica, para cada uma. As 20 aparecem; lei pulada em silêncio é o
   defeito que a regra 17 proíbe.
2. **Achados por gravidade**, P1 primeiro.
3. **Recomendações que dependem do autor**, com a decisão anterior citada.
4. **O que não foi verificado** (aparelho real, Safari do iPhone, leitor de tela, rede real), como checklist.

## 6. Depois da auditoria

- Correção só com pedido do autor, e com as regras de sempre: 9 (verificação), 14 (layout em commit próprio), 29
  (viúvas), e a da landing (nada sai da página).
- Registrar a auditoria no `context.md`, na nota da sessão no vault e na nota da rodada no canvas (regras 6 e 12).
