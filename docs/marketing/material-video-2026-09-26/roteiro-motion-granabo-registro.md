# Roteiro — Motion "Granabô: o registro"

**Atualizado em 25/09/2026: tela real, gravada pelo maestro no emulador**, não
recriada em HTML. Só o fundo com texto, a transição e o fecho continuam
recriados.

Par do motion "Granabô: a consulta" (mesma razão para serem duas peças,
registrada naquele arquivo). **Fase A, sem dependência de build.** O item está
desbloqueado pelo Harbor: o registro funcionou, e o problema anterior foi da
leitura de tela do emulador. A gravação começa quando o Sentinel liberar o
emulador.

## Pré-condições obrigatórias para a gravação

1. Use a conta de teste sem nenhum outro agente operando nela durante toda a
   captura e a limpeza posterior.
2. Limpe o histórico da conversa do Granabô antes de abrir a cena e confirme
   que mensagens antigas não aparecem rolando no quadro inicial.
3. Não grave uma espera parada: capture o indicador por um instante e corte
   para a resposta assim que a bolha aparecer.

## Antes de gravar

Se for na mesma sessão da consulta, já está logado; só confirme
`node scripts/emulador.cjs tem "Início"` → `SIM`. Se for sessão nova, siga os
mesmos passos do início do roteiro do R5.

## Frase a enviar (100% inventada, sem nome de estabelecimento)

> gastei 20 no mercado

Deliberadamente genérica: "mercado" sem nome próprio não identifica nenhum
lugar real, e o valor é baixo e comum, sem parecer um dado real específico.

## Sequência de gravação

1. `node scripts/emulador.cjs tocar "Abrir conversa com o Granabô"` (pule este
   passo se a consulta já deixou o chat aberto **e o histórico foi limpo**)
2. `node scripts/emulador.cjs tocar "Mensagem para o Granabô"`
3. `node scripts/emulador.cjs digitar "gastei 20 no mercado"`
4. `node scripts/emulador.cjs print granabo-registro-01-digitado` (1 s)
5. `node scripts/emulador.cjs tocar "Enviar mensagem"`
6. `node scripts/emulador.cjs print granabo-registro-02-pensando` (um instante,
   assim que aparecer "Granabô está pensando…"; sem espera parada)
7. Assim que a resposta aparecer, corte para ela. **Duas situações possíveis — grave a que acontecer de
   verdade:**
   - **(A) Ele registra direto.** `node scripts/emulador.cjs print
     granabo-registro-03-confirmado` (2 a 3 s com a bolha de confirmação
     inteira visível — **anote o texto exato**, que deve ter o formato
     "Lançamento registrado: R$ 20,00 em [categoria] ([descrição]), na
     carteira [nome]. Se quiser desfazer, é só dizer "desfaz".", mas o real
     pode variar).
   - **(B) Ele pergunta algo antes** (por exemplo, qual carteira usar, se a
     conta de teste tiver mais de uma). Nesse caso: `print
     granabo-registro-03b-pergunta` (anote a pergunta exata), responda da
     forma mais simples que resolva (`digitar` a resposta e `tocar "Enviar
     mensagem"` de novo), depois `print granabo-registro-04b-confirmado` com a
     confirmação final.

## Estrutura por tempo do motion — versão (A), sem pergunta intermediária

| Tempo | Cena | Texto na tela | Real ou recriado |
|---|---|---|---|
| 0,0–3,0 s | Fundo petróleo, brilho ciano subindo. | "Ou só manda registrar." | recriado |
| 3,0–8,0 s | Sequência real: digitar, enviar, "pensando" (passos 2 a 6). | (o próprio app mostra o texto) | real |
| 8,0–13,0 s | Bolha de confirmação (passo 7A), segurando 2 a 3 s. O "plim" toca no instante em que a bolha aparece. | (o texto real anotado no passo 7A) | real |
| 13,0–15,0 s | Fundo petróleo, sem tela. | "Registrado. Sem abrir tela nenhuma." | recriado |
| 15,0–17,0 s | Fecho: logo "Grana." com o ponto. | "Fala com o Grana. Ele também registra." | recriado |

## Estrutura por tempo — versão (B), com pergunta intermediária

Se a gravação cair no caso (B), a peça estica para caber a troca extra:

| Tempo | Cena | Texto na tela | Real ou recriado |
|---|---|---|---|
| 0,0–3,0 s | Igual à versão (A). | "Ou só manda registrar." | recriado |
| 3,0–7,0 s | Digitar, enviar, "pensando", bolha da pergunta do Granabô (passo 7B, primeira parte). | (o próprio app mostra o texto) | real |
| 7,0–9,0 s | Bolha de resposta da pessoa (a resposta simples enviada). | (o próprio app mostra o texto) | real |
| 9,0–10,0 s | "Pensando" de novo. | (o indicador real) | real |
| 10,0–15,0 s | Bolha de confirmação final, com o "plim" no instante em que aparece. | (o texto real anotado) | real |
| 15,0–17,0 s | Fundo petróleo. | "Registrado. Sem abrir tela nenhuma." | recriado |
| 17,0–19,0 s | Fecho. | "Fala com o Grana. Ele também registra." | recriado |

## Som

Trilha pop leve, mixada abaixo, com o "plim" no instante em que a bolha de
confirmação aparece — o único momento de lançamento salvo entre os dois
motions do Granabô.

## Depois de gravar

1. Confirme se o lançamento foi criado de fato (tela de Lançamentos ou
   perguntando "desfaz" ao próprio Granabô, o que também testa o desfazer).
2. Apague o lançamento de teste antes de encerrar.
3. Envie os prints (ou vídeo) e o texto exato anotado para a edição.

## O que ficou sem verificação

- Se o Granabô registra direto (versão A) ou pergunta antes (versão B) — só se
  sabe ao gravar. As duas versões de estrutura por tempo estão prontas para
  quando isso for confirmado.
- O texto exato de qualquer confirmação ou pergunta.
