# Inventário dos criativos e roteiros prontos · base de 30/09/2026

**Adendo de 04/10/2026, regra 21:** o autor abriu nesta sessão a produção de
um card, um carrossel e um Reel. A autorização vale para esta sessão. Ao
encerrá-la, a pausa volta a valer até novo pedido explícito do autor. Q1–Q5,
dia D e aprovação comercial seguem pendentes; não publicar nem agendar. Ver
[README](../README-MATERIAL-FINAL.md).

Fontes históricas: `FUNIL.md` (§5, §17.2, §17.3),
`2026-09-27-roteiros/roteiros-v2-beacon.md` e `roteiros-v3-beacon.md`, vault
`03 - Marketing` (Reels do Padeiro v8, Calendário do primeiro mês),
`app/index.tsx` (landing). O adendo de 04/10 registra a produção autorizada
nesta sessão. Nenhuma peça final foi publicada ou agendada.

**Legenda da marca.**
- **A** = só vale para Android (a promessa usa recurso que só o app Android tem).
- **B** = mostra o app como caminho único ou implícito, mas o gesto pode existir na web. A matriz v2 já existe: implementação não comprova validação. Voz permanece restrita ao material Android deste pacote.
- **C** = neutra: vale em qualquer plataforma, desde que a captura não mostre o convite de app nem a barra do Android.
- **W** = já é web, explícita.

Nenhum valor de preço aparece aqui. Onde a peça cita preço, vale só a formulação "menos de R$ 0,37 por dia", e o resto fica na nota "Preço Vigente e Parcelamento - Cakto".

## 0. Lote piloto de 04/10/2026

| Peça | Estado | Promessa central | Plataforma | Bloqueios antes de liberar |
|---|---|---|---|---|
| Card, variante de C01 | V2 gerada; precisão "incluindo hoje" aplicada; crítica visual pendente | Explicar o valor diário do Livre para Gastar | Web/neutra | Captura atual com dados inventados se houver tela; QA da fórmula e aprovação do autor |
| Carrossel C14, cinco telas | V2 gerada; precisão "incluindo hoje" e remoção de contadores aplicadas; render dos slides 2–4 aguarda a copy final | Explicar entradas, saídas e cálculo do Livre para Gastar | Web/neutra | Crítica visual do Prism; capturas atuais com dados inventados se houver telas; QA da fórmula e aprovação do autor |
| Reel R13 | B-roll e locução gerados sob autorização; montagem final aguarda captura atual e confirmação do custo efetivo | Situação cotidiana e consulta do Livre para Gastar | Web/neutra | Sobreposição de dados fictícios 5–17 s, captura liberada pelo Vigil, checagem de nome/e-mail/notificações, QA e aprovação do autor |

A revisão Watchtower do card e do carrossel aprovou a copy com dois ajustes:
explicitar que o cálculo inclui hoje nos dias restantes e retirar a nota de
dados fictícios quando a peça não demonstra tela nem valores. Flare estimou a
versão final do Reel em US$ 1,1490 e 6.319,27 créditos por um clipe e uma
locução; o Watchtower aprovou roteiro e conceito com a exigência de exibir
“Demonstração com dados fictícios” sobre as capturas entre 5 e 17 segundos.
A autorização do autor até US$ 1,15 foi recebida; Flare gerou b-roll e locução
uma vez conforme a estimativa de US$ 1,1490, mas o custo efetivo ainda precisa
ser confirmado. Não se pode repetir a geração. Separadamente,
o Orquestrador iniciou 11 gerações de mockups vazios na ElevenLabs, 6
celulares e 5 notebooks, cerca de 9.000 créditos ou US$ 1,64, dentro da
autorização do autor para uma variação por ângulo. Nenhum mockup tem tela do
app. A geração dos mockups seguia em andamento no último status lido. A
tentativa de Flare para abrir o app deixou o emulador em tela preta; a captura preta foi
tentativa de abrir o app deixou o emulador em tela preta; a captura preta foi
salva fora desta pasta e não é aproveitável. Não usar capturas antigas com
valores de setembro como prova atual. Os materiais recebidos em `arsenal`,
`assets`, `out` e `src` já existiam antes de Flare chegar e não foram alterados
por ele.

## 1. Reels e vídeos

| Peça | Estado | Promessa central | Marca | Fala ou quadro que causa a marca, e ajuste mínimo |
|---|---|---|---|---|
| Reels do padeiro v8 (`grana-reels-v8-pop.mp4`, 24,7 s) | Montagem aprovada 25/09; QA/publicação pendentes | Falar o gasto no widget de voz, sem abrir o app | **A** | Quadro do widget de voz na tela inicial. O widget não existe no navegador nem no iPhone. Ajuste: segmentar para Android; para os públicos 1 e 3 não serve como está. |
| Motion "desistiu porque cansa" (foto da nota) | Montagem existente; QA/dia D pendentes | Foto da nota lê o total | **A** (e portão de QA) | A foto da nota não aparece na web (`app/(app)/index.tsx:1562`, conferido por Lumen). Além disso o teste de 10 cupons ainda não rodou. Só Android, só depois do dia D e do teste. |
| M-FN (foto da nota, D+0) | Roteiro | Fotografar a nota | **A** | Mesma causa. |
| R6 cupom amassado, mão fotografa | Roteiro | Foto e conferência do total | **A** | O gesto "mão fotografa o cupom" mostra a foto como jeito de lançar. Não existe na web. |
| R7 widget Débito/Pix (v3) | Roteiro | Atalho na tela inicial abre a Saída | **A** | Fala "Toquei aqui" e legenda "No Android, o atalho está na tela inicial". Já se declara Android. Nada a ajustar além de segmentar. Nota: `FUNIL.md` §17.2 ainda traz R$ 45,00 no R7; os roteiros v2/v3 trazem R$ 12,50. Vale o roteiro (mais novo). |
| R-P (padeiro de reserva, D+4) | Roteiro | Falar o gasto no widget | **A** | Mesma causa do padeiro v8. |
| R2 mercado na porta (voz) | Roteiro v2 | "No próximo, fala no Grana." | **B** | Botão **Lançar por voz** real na captura e CTA "fala no Grana". Voz existe na web pelo código (Lumen, `lib/voz.ts:105`), mas microfone no Safari do iPhone e no Chrome do computador não estão confirmados. Ajuste: só publicar para os públicos 1 e 3 se a matriz marcar "funciona". |
| R3 cupom na sacola (voz) | Roteiro v2 | "O próximo gasto também cabe aqui." | **B, destino Android** | Mesma causa do R2; não usar como voz web. |
| R4 pão e leite (voz) | Roteiro v2 | "Fale seu próximo gasto no Grana." | **B, destino Android** | Mesma causa; não usar como voz web. |
| R10 almoço + Pix + cupom | Roteiro v2 | Três jeitos de lançar em um dia | **B, com trecho A** | Trecho de voz é B. Trecho de **foto do cupom** (14 a 21 s) é A. Ajuste: versão web troca a foto por um segundo colar comprovante ou por lançamento manual; a versão Android mantém como está, depois do teste dos 10 cupons. |
| R5 Pix colado (D+14) | Roteiro | Colar o texto do Pix e confirmar | **C, a confirmar** | O modal de colar existe no app; falta a matriz dizer se roda igual na web. É a peça mais provável de servir aos três públicos. Ajuste: gravar também no navegador (Lumen já listou como W5). |
| R9 importar extrato | Roteiro | Arquivo com oito linhas vira lançamentos | **C, a confirmar** | "Arquivo fictício no telefone" é a cena de abertura; na web o arquivo vem do computador. Ajuste: trocar a cena de abertura por "arquivo baixado do banco" (sem falar de conexão bancária). A matriz v2 marca implementação web, com QA pendente. Relaciona-se a C03-PC/CEL; escolher e importar CSV/OFX até persistência nos dois navegadores de celular. |
| R12 formulário | Roteiro v2 | Anotar antes de sair | **C** | Formulário de Saída, sem recurso nativo. Ajuste: gravar a captura no navegador (Início 1440) além da do celular. |
| R11 café (reserva) | Roteiro v2 | Primeiro gasto por formulário | **C** | Idem R12. Reserva, sem data. |
| R1 e R8 (resumo, fim de mês) | Roteiro | Abrir o resumo do mês | **C** | Sem recurso nativo. **Atenção à regra 20**: qualquer número de "Saldo atual" ou "Livre para gastar" precisa ser do mês vigente e sair de captura real. |
| R-GB1 e R-GB2 (Granabô) | Roteiro | Perguntar ao assistente | **C, a confirmar** | Falta a matriz dizer se o Granabô roda na web. |

## 2. Estáticos e carrosséis (texto de `FUNIL.md` §17.3)

| Peça | Estado | Texto na arte | Marca | Causa e ajuste |
|---|---|---|---|---|
| E02 | Recaptura pedida | "Mercado de R$ 187,40. Salário, condomínio e assinaturas no mesmo mês." | **C** | A captura hoje é `*-mobile.png`. Sem convite de app. Ajuste: gerar também versão navegador. |
| E05 | Frase aprovada | "O mês que vem já começou. Nas parcelas deste mês." | **C** | Retirar "COMPROMISSOS FUTUROS". |
| E01 | Recaptura pedida | "O salário caiu. Quanto já tem destino?" | **C** | Depende da regra 20 para qualquer número visível. |
| E06 | Reativada | "Os lançamentos do mês também cabem na tela grande." | **W** | Já é web. Precisa de captura nova (`public/telas/inicio-web.png` está velha: mostra "Escanear nota", que a web não tem). |
| S1 (reserva) | Espera captura | "Café de R$ 6,00. Foi para a lista." | **C** | Captura nova, sem rótulo "NO CELULAR". |
| S2 carrossel | Espera capturas | "Três gastos, três jeitos de anotar." (voz, Pix colado, foto) | **A no quadro 3** | O quadro "Cupom, R$ 18,70. Fotografe e confira." usa foto, que não existe na web. Ajuste: para os públicos 1 e 3, trocar o terceiro quadro por importar extrato ou formulário. |
| S3 | Recaptura na 1.10.5 | "Dia 27. Quanto ainda cabe hoje?" | **C** | Regra 20. Trocar o dia se a captura for de outro dia. |
| S4 | Nova captura | "As contas do mês, uma por uma." | **C** | Lista real de contas. |
| S7 | Formulação permitida | "Menos de R$ 0,37 por dia." | **C** | Único ponto de preço permitido. Destino é a landing. |
| S8 carrossel | Espera captura | "O primeiro gasto pode ser o café." | **C** | Sem recurso nativo. |
| S2 web (reserva) | Espera captura | "Suas faturas na tela grande." | **W** | Já é web. |
| E03, E04 | Sem texto final | (Beacon fecha depois das capturas) | a definir | |
| S5, S6 | Fora da fila | | fora | Decisão do autor: publicidade não fala de conexão bancária. |

## 3. Contagem

- **A (só Android):** 6 peças de vídeo (padeiro v8, motion "desistiu porque cansa", M-FN, R6, R7, R-P) e 1 carrossel com quadro A (S2, quadro 3), mais o trecho de foto do R10.
- **B (voz, depende da matriz):** 4 vídeos (R2, R3, R4, R10).
- **C ou a confirmar:** 6 vídeos (R5, R9, R12, R11, R1, R8) e 8 estáticos ou carrosséis (E02, E05, E01, S1, S3, S4, S7, S8), mais R-GB1 e R-GB2 a confirmar.
- **W (já web):** 2 estáticos (E06, S2 web).

**Leitura:** 7 peças são só-Android, 4 dependem da voz na web, e o resto é neutro mas usa captura de celular. O acervo está pesado para o app, como o autor percebeu. Só 2 peças são explicitamente web e nenhuma fala ao público iPhone.

## 4. Prioridade de produção atual

1. C01, C02 e C04 nas duas capturas web: primeiro lote de seis vídeos, após QA das funções.
2. C03, C05 e C06 nas duas capturas web; C09 e C12 no Android: segundo lote, com verificações específicas de importação, chat, atalhos e instalação.
3. C07, C08, C10, C11 e C13: oferta, voz, foto e biometria, após seus portões. C07 tem duas capturas.

R5 pode servir de referência de gesto a C02, R9 a C03, os roteiros do Granabô a C06, R7 a C09 e a foto a C10. Reaproveitar arquivo só depois de ver a mídia e conferir texto, plataforma, valores, estado do produto e QA. Nenhum vídeo do acervo foi aberto nesta revisão. O padeiro aprovado antes não comprova voz no APK físico.

## 5. Problemas achados nas fontes que valem fora do inventário

- **Landing, FAQ (`app/index.tsx:742`):** a resposta cita "a leitura do QR Code da nota fiscal" como recurso do app Android. O QR saiu da mensagem em 27/09 e a foto da nota entrou. Vale o dono da landing corrigir depois do dia D.
- **Landing, FAQ (`app/index.tsx:603`):** "um aviso por dia, no app de Android" é correto para o lembrete, mas confirma que notificação é só Android; nenhuma peça para iPhone pode prometê-la.
- **Landing já é web-primeiro** (`app/index.tsx:1187` a `1192` e `1340` a `1352`: "Funciona direto no navegador", "primeiro o que funciona em qualquer navegador"). Os anúncios devem seguir a mesma ordem.
- **Conflito de fontes:** o calendário do vault e o plano de tráfego (26/09) dizem que estáticos encerraram; o `FUNIL.md` (27/09) reativou. Vale o mais recente. A nota do vault precisa ser corrigida pelo Ledger.
- **Valores divergentes:** `FUNIL.md` §17.2 traz R7 em R$ 45,00 e R12 em R$ 12,00; os roteiros v2/v3 trazem R$ 12,50 e R$ 8,50. Vale o roteiro.
- **Marcas reais nos dados de exemplo** ("Nubank Ultravioleta", "Itaú Personalité Black"), levantado por Lumen: em anúncio pago pode ler como endosso. Pergunta para o Lynx.

## 6. O que ficou sem verificação

- Não abri os vídeos nem os arquivos de imagem: a marca A/B/C vem do texto dos roteiros, não do arquivo final.
- Não li `roteiros-v1`, `revisao-maestro-v2.md`, os prompts de `funil-criativos-flat-2026-09` nem as notas `Plano Editorial`, `Estilos de Vídeo` e `Copy da Landing`. Se alguma peça neles citar Android, ela não entrou aqui.
- Tudo o que está marcado "a confirmar" espera o `matriz-plataformas.md` do Meridian.
