# Roteiro — Motion "Granabô: a consulta"

**Atualizado em 25/09/2026: tela real, gravada pelo maestro no emulador**
(`scripts/emulador.cjs`, `docs/operar-o-app-no-emulador.md`), não recriada em
HTML. Só o fundo com texto, a transição e o fecho (sem tela do app) continuam
recriados, do mesmo jeito que o motion "desistiu" já fazia para essas partes.

**Por que motion separado do "registro" e não uma peça só:** consulta e
registro são duas ações diferentes (perguntar contra mandar), cada uma com seu
próprio gancho e fecho. Juntar as duas numa peça de ~22 a 24 segundos deixaria
cada demonstração curta demais para valer como prova; duas peças de 16 a 18
segundos cada cabem melhor na faixa de 15 a 25 segundos da seção 7 do
`FUNIL.md`, e cada uma sustenta um gancho só.

**Fase A, sem dependência de build.** O Granabô já está em produção (v38,
24/09) e a pergunta escolhida não depende da regra 20 (achado registrado em
`proposta-2-motions.md`: "quanto posso gastar hoje" divergiria da Início hoje;
"quanto gastei em Alimentação" já está correto em produção desde o `fe8e210`).

## Antes de gravar

Mesmos passos 1 a 5 de "Antes de gravar" em `roteiro-gravacao-r5.md` (estado,
abrir dev, login, confirmar "Início", limpar a faixa de debug se precisar).

## Pré-condições obrigatórias para esta regravação

1. Limpe o histórico da conversa do Granabô na conta de teste e confirme que
   nenhuma mensagem antiga aparece ao abrir o chat. Os R$ 440,30 e R$ 486,41
   eram histórico antigo da própria conta, não dados de outra conta nem um
   defeito do produto.
2. Reserve a conta e o emulador para esta gravação. Nenhum outro agente pode
   usar a conta durante a preparação, a captura ou a limpeza posterior.
3. Use a pergunta exatamente com acentos: `quanto eu gastei em Alimentação esse
   mês?`.
4. Não mantenha um quadro parado de espera: capture o indicador por no máximo
   um instante e corte diretamente para a resposta quando ela aparecer.

## Estado dos dados antes de gravar (G2 fechado)

Deixe a conta com exatamente duas saídas em Alimentação neste mês, R$ 60,00 e
R$ 40,00, sem crédito. A resposta esperada para a pergunta é R$ 100,00.
Não relance essas entradas se elas já estiverem presentes. Remova antes os
lançamentos de teste pendentes de gravações anteriores e confirme o estado na
tela de Lançamentos.

Se for necessário preparar as entradas, use a mesma folha "Colar comprovante"
do R5 (rótulos confirmados: "Colar comprovante", "Texto do comprovante",
"Reconhecer dados", "Salvar lançamento"):

1. `node scripts/emulador.cjs tocar "Colar comprovante"`
2. `node scripts/emulador.cjs tocar "Texto do comprovante"`
3. `node scripts/emulador.cjs digitar "Você gastou R$ 40,00 no Mercado Modelo em Alimentação."`
4. `node scripts/emulador.cjs tocar "Reconhecer dados"`
5. Confira na tela de confirmação se a categoria marcada é "Alimentação". Se
   não for, toque no chip "Alimentação" antes de salvar.
6. `node scripts/emulador.cjs tocar "Salvar lançamento"`
7. Repita os passos 1 a 6 com: `"Você gastou R$ 60,00 na Padaria Modelo em
   Alimentação."`

Total esperado: R$ 100,00 em Alimentação neste mês, sem somar crédito.

## Sequência de gravação da peça

1. `node scripts/emulador.cjs tocar "Abrir conversa com o Granabô"` (o botão
   central da barra, disco menta elevado)
2. `node scripts/emulador.cjs print granabo-01-aberto` (1 s, tela do Granachat
   vazia, sem histórico antigo visível)
3. `node scripts/emulador.cjs tocar "Mensagem para o Granabô"` (foca o campo)
4. `node scripts/emulador.cjs digitar "quanto eu gastei em Alimentação esse mês?"`
5. `node scripts/emulador.cjs print granabo-02-digitado` (1 s, texto no campo
   antes de enviar)
6. `node scripts/emulador.cjs tocar "Enviar mensagem"`
7. `node scripts/emulador.cjs print granabo-03-pensando` (somente um instante,
   assim que aparecer o indicador "Granabô está pensando…"; não segure uma
   espera parada)
8. Assim que a resposta aparecer, corte para ela e rode `node
   scripts/emulador.cjs print granabo-04-resposta` (2 a 3 s com a bolha inteira
   visível — **anote o texto exato que aparecer**, para a legenda e a edição
   usarem a mesma frase, letra por letra)

## Estrutura por tempo do motion (para a edição)

| Tempo | Cena | Texto na tela | Real ou recriado |
|---|---|---|---|
| 0,0–3,0 s | Fundo petróleo, brilho ciano subindo (mesmo efeito do motion "desistiu"). | "Quanto você gastou em Alimentação esse mês?" | recriado |
| 3,0–4,0 s | Transição: texto se apaga, brilho menta sobe. | "Pergunta pro Grana." | recriado |
| 4,0–9,0 s | Sequência de telas reais (passos 1 a 6 da gravação): abrir o Granabô, digitar, enviar, "pensando". | (o próprio app mostra o texto) | real |
| 9,0–13,0 s | Tela real da resposta (passo 8), segurando 2 a 3 s com a bolha inteira visível. | (o texto real anotado no passo 8) | real |
| 13,0–15,0 s | Fundo petróleo, sem tela. | "Sem inventar número." | recriado |
| 15,0–17,0 s | Fecho: logo "Grana." com o ponto. | "Fala com o Grana." | recriado |

## Som

Trilha pop leve, mixada abaixo (mesmo padrão dos motions aprovados). Sem
"plim": é consulta, não lançamento salvo.

## Depois de gravar

1. Apague as duas entradas de teste ("Mercado Modelo" e "Padaria Modelo") pela
   tela de Lançamentos, do mesmo jeito descrito em "Depois de gravar" no
   roteiro do R5.
2. Envie os prints (ou o vídeo) e o texto exato anotado no passo 8 para a
   edição.

## O que ficou sem verificação

- O texto exato da resposta do Granabô: só se sabe depois de gravar.
- Se o indicador de espera muda para "Ainda estou consultando seus dados…" em
  vez de ficar em "Granabô está pensando…" (o componente troca esse texto se a
  resposta demorar); se acontecer, o passo 7 da gravação já captura o que
  aparecer de fato.
- O rótulo exato do botão de excluir lançamento (mesma ressalva do roteiro do
  R5).
