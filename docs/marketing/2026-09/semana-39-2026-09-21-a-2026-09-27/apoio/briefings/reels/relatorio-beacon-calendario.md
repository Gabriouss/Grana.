# Relatório do Beacon: calendário de marketing refeito (25/09/2026)

Modelo: Claude Sonnet 5, no lugar do gpt-6-sol (troca feita pelo autor no meio
da sessão). Nada foi publicado, nenhum código foi tocado, e o `context.md` e a
nota de sessão ficam para o Ledger.

## Revisões posteriores do autor (25/09/2026, via maestro): valem sobre o resto

Este bloco substitui o que estiver em conflito mais abaixo. Aplicado em
`FUNIL.md` (seções 2, 3, 4, 5, 13, 16, o prompt-mestre e a biblioteca 17.3) e na
nota do vault.

1. **Quem declara D é o Sentinel (QA)**, quando o portão do dia D estiver todo
   cumprido; o autor só aprova a publicação. O número de cupons reais o autor
   não definiu. **Proposta a confirmar:** no mínimo 10 cupons reais variados
   (mercado, farmácia, posto, padaria), valor total certo em pelo menos 8 e
   nenhum valor errado sem aviso ao usuário.
2. **Fase A com 2 Reels novos por semana, além do padeiro.** Semana 1 ficou
   como estava (padeiro, R1, R5 já eram 2 novos). Na semana 2 saiu o R11 (foi
   para a reserva), então ficam R3 e R9, e a sexta 09/10 fica sem peça. Total da
   fase A: 9 peças. Interpretei "uma peça a menos por semana" como o corte na
   semana 2, porque a semana 1 já cumpria a regra; se o autor quis 2 novos SEM
   contar o padeiro na semana 1, é preciso tirar mais um Reel dela.
3. **O motion "desistiu porque cansa" com a foto da nota espera o dia D**; a
   cena do leitor não é cortada. Já estava em D+0.
4. **A6 sem substituto.** O autor recusou o motion tipográfico sobre banco e vai
   descrever outro conceito. Nada dele é produzido. Minha proposta anterior
   está retirada.
5. **Versão pública.** Pelo `context.md`, a última build concluída é a 1.10.2
   (12/09); 1.10.3 e 1.10.4 foram barradas pelo EAS e o `867e1b5` não está em
   build pública. Isso permite usar a Início do app publicado, mas só depois de
   confirmar o que ele mostra antes de capturar. Mantive a fase A sem a Início
   (a captura envelheceria no dia D com a regra 20) e pus o S1, já pronto, na
   reserva com essa condição. Não conferi o app publicado.
6. **Perguntas abertas, sem decisão:** orçamento para variações de voz (custo
   por peça continua exigindo aprovação) e quem captura as telas reais e de qual
   build. Mantidos: só dias úteis; padeiro e widget segmentados para Android.
7. **Regra permanente: nenhum material de publicidade fala sobre o Grana.
   conectar ou não conectar a bancos, nem sobre Open Finance.** Vale só para
   publicidade; produto e documentação legal (política de privacidade, FAQ da
   landing) não foram tocados. **O que foi removido:**
   - do calendário e da reserva: S5 "Seu banco fica no banco" e S6 "Preciso
     conectar minha conta?" (a decisão anterior de fila de reserva os incluía);
   - `FUNIL.md` seção 2: o parágrafo "não conecta a bancos nem utiliza Open
     Finance... escolha de controle e privacidade" virou a regra permanente;
   - seção 3, linha Confiança: saiu "privacidade" e entrou a nota de que
     conexão bancária e Open Finance não entram;
   - prompt-mestre (seção 10): a frase "O produto não conecta a bancos ou Open
     Finance" virou "não mencione conexão bancária nem Open Finance, nem para
     negar nem para afirmar";
   - seção 13 (retargeting): S5 e S6 saíram da lista; ficou S8;
   - seção 17.3: os prompts e textos de S5 e S6 foram apagados e trocados por
     um aviso de peças retiradas (códigos não reaproveitados);
   - seção 16: registro do A6 como "conceito pendente do autor";
   - vault: a nota "Calendário do primeiro mês" registra a regra, a saída de S5
     e S6 e o A6 pendente.
   **Fora do meu escopo, para o Ledger conferir:** outros documentos com o tema
   (por exemplo o "Plano de Tráfego Pago", em 04 - Tráfego, e o
   `PRODUCT.md`/landing) não foram lidos nem alterados. Na memória do Claude
   foi registrada a regra permanente.

## O que foi entregue

- `E:\GranaPonto\FUNIL.md` (local, fora do git): seção 5 reescrita como
  calendário em duas fases, com as colunas data, código, formato, gancho,
  dependência e situação da arte; "Depois do dia 16/10" virou "Depois de D+18";
  seção 16 ("Próxima execução") refeita; uma linha de aviso na seção 4.
- `G:\Meu Drive\Obsidian\Gabriel\Grana\03 - Marketing\Calendário do primeiro
  mês.md`: corrigida no lugar (perene, `revisado: 2026-09-25`). O
  `verificar-vault.mjs` não acusa a nota; os dois itens atrasados que ele lista
  são de outras notas.
- `git status` limpo antes e depois. Nada a commitar (o `FUNIL.md` é ignorado
  pelo git; o vault não é repositório).

## Resumo do calendário

**Fase A, a partir de seg 28/09, sem build.** Semana 1: padeiro v8 (pronto),
E02 (pronto), R1, E06 (pronto), R5. Semana 2: R3, S4 (pronto), R9, E05
(pronto), R11. São 6 Reels (1 pronto, 5 a produzir) e 4 estáticos prontos.

**Fase B, relativa a D (dias úteis).** D+0 motion "desistiu porque cansa" com
a foto da nota (pronto); D+1 S3; D+2 R6; D+3 E01; D+4 R8; D+7 R2; D+8 S2
(carrossel dos três jeitos); D+9 R10; D+10 S1; D+11 R4; D+14 R7; D+15 S8; D+16
R12; D+17 S7; D+18 republicação com capa nova.

**Reserva:** S2 web (pronta), S5, S6, peças de A deslocadas por um D antecipado,
E03/E04.

**Portão do dia D:** build publicada com versão maior que a anunciada; foto da
nota testada com cupons reais; Início pela regra 20 com o mesmo número em
Início, widgets e Granabô; voz nas duas entradas (regra 13); capturas em Dados
de exemplo; Watchtower antes de cada peça.

## As seis perguntas da regra 12

**1. O pedido como chegou.** Do autor, via maestro: "mande o agente
responsável por isso fazer esse trabalho". Refazer o calendário porque o de
21/09 a 16/10 começou no passado e mistura peças que dependem de funções que
ainda não chegaram ao público. Fase A sem dependência de build a partir de seg
28/09; fase B relativa ao dia D, sem chutar data absoluta; manter 3 Reels e 2
estáticos por semana onde houver arte; nota do vault atualizada no mesmo
sentido; perguntas ao autor sem interromper o trabalho.

**2. Sintoma e causa.** Sintoma: o calendário publicava a foto da nota (R6,
02/10), o "Livre para Gastar" (S3 e R8) e o "o que sobra depois dos
compromissos" em datas fixas, todas antes de qualquer build nova, e a
primeira semana já estava vencida. Causa: o calendário foi escrito com datas
absolutas e sem coluna de dependência, então nada dizia o que o app público
faz. Consequência extra que achei: o gancho de R8, "O que sobra depois dos
compromissos?", promete o que a regra 20 tirou (conta pendente ou atrasada não
desconta do "Livre para Gastar"), então não basta adiar, precisa de gancho novo.
O mesmo vale para a legenda do E01, que cita "consultar o Livre para Gastar" ao
lado de aluguel, fatura e contas.

**3. Arquivos e identificadores.**
- `FUNIL.md`: seções 4 (aviso), 5, 16.
- Vault: `03 - Marketing/Calendário do primeiro mês.md`.
- Arte pronta usada: `docs/marketing/funil-criativos-flat-2026-09/revisao-05/`
  (`E02-feed-1080x1440.png`, `E05-...`, `E06-...`), `revisao-04/S4-feed.png`,
  `revisao-04/S2-feed.png` (faturas na web); vídeos na raiz do vault:
  `grana-reels-v8-pop.mp4`, `grana-motion-desistiu-foto-da-nota.mp4`.
- Rascunhos que geraram o texto: `_sec5.md`, `_sec16.md`, `_splice.py`, nesta
  pasta (podem ser apagados).
- Referências de código conferidas: commits `867e1b5` (19/09, saldo acumulado),
  `c7b2822` (prepara 1.10.3, 15/09), `3f23c6d` (prepara 1.10.4, 22/09).

**4. O que foi descartado, e por quê.**
- Colocar S1, S3 e E01 na fase A: as três mostram a Início. A Início mudou com
  a regra 20 e o número que o app publicado mostra pode não ser o prometido
  hoje. Foram para B, com recaptura da Início depois do dia D.
- Usar a revisão 04 do S3 e do S1 depois de D: as capturas são da Início antiga.
- Tratar o "S2" da revisão 04 como o carrossel "Três jeitos de lançar um
  gasto": o arquivo é outro tema (faturas na web, "Na tela grande"). O carrossel
  dos três jeitos (voz, Pix, foto da nota) nunca foi feito e depende da foto da
  nota, então está em D+8.
- R7 na fase A: o padeiro já é o widget sem abrir o app; R7 ficou em D+14 como a
  versão com o app aberto, e já estava decidido como "próximo criativo".
- Datas absolutas para a fase B, inclusive a estimativa de 05/10: só existe a
  estimativa, e fica escrita como estimativa.
- Publicar sábado e domingo: o calendário original era só de dias úteis; mantive.
- Cortar do motion "desistiu" a cena do leitor (9 a 13,4 s) para publicá-lo na
  fase A: depende de decisão do autor e de conferir o resto do vídeo (ver
  pergunta 5).
- Fazer o kit de prompts completo de cada Reel a produzir (personagem, voz, texto
  na tela): fora do que o pedido listou. Ver "sem verificação".

**5. O que deu errado no caminho.**
- A sessão anterior (Codex) foi interrompida; recomecei do contexto e dos
  arquivos, não do histórico dela.
- Uma execução de shell com dois heredocs falhou ("unexpected EOF"); nada foi
  escrito. Refiz gravando os arquivos pelo Write e splice por script; conferi a
  estrutura das seções depois.
- Erro meu, corrigido antes de fechar: escrevi que os estáticos prontos
  "cobrem quatro dos cinco encaixes", mas a fase A tem quatro estáticos (dois
  por semana); ajustei.
- Não achei no vault a definição do texto exato do gancho do Reels do padeiro;
  a linha dele descreve o conteúdo (lançar o gasto por voz pelo widget, sem abrir
  o app), sem citar frase que eu não vi.

**6. O que ficou sem verificação.**
- **Qual versão é a pública.** (Atualização: depois da entrega, o maestro
  informou que a pública é a 1.10.2, porque as builds 1.10.3 e 1.10.4 foram
  barradas pelo EAS, o que tira o risco do saldo acumulado; eu não conferi isso
  e a fase A continua sem a Início por prudência.) O contexto dizia 1.10.3 ou anterior, mas o
  commit `3f23c6d` de 22/09 prepara a 1.10.4. Não sei se ela foi construída e
  publicada. Se foi, ela contém o `867e1b5` (saldo acumulado, regressão que a
  regra 20 desfaz), e qualquer captura da Início feita nela mostra a grandeza
  errada. Por isso a fase A não usa a Início.
- Se as capturas prontas (S4 em contas na web, E05 em cartões) batem com o que a
  versão pública mostra; conferi só a copy e a ausência de Início e de Livre
  para Gastar, não abri o app.
- Se a versão web do Grana. está no ar como as peças E06, S4, E05 mostram.
- Que o "lembrete da noite" e a notificação do motion "desistiu" existem hoje no
  app (o guia diz que o "Salvo ✓" não existe e está no README).
- A viabilidade de produzir 5 Reels em duas semanas: não medi custo de geração
  nem tempo; depende de orçamento da ElevenLabs.
- Os kits de prompts da regra de 25/09 para os Reels a produzir: a seção 17.2
  cobre só a cena. Personagem fixo (a Carla, do guia de estilo, ou outra), voz e
  texto na tela precisam ser montados por peça; é o próximo passo natural, e
  posso entregar por semana de produção.
- Nada foi visto no navegador ou no aparelho. Sem mudança visual, não houve
  conferência de alinhamento.

## Perguntas ao autor (lista original; ver o bloco de revisões no topo)

Já respondidas em 25/09: 1 (Sentinel declara D), 2 (versão pública), 3 (2 Reels
novos por semana), 5 (motion espera D), 7 e 9 (padrões mantidos), 8 (A6 sem
substituto). Seguem abertas: 4 (quem captura as telas e de qual build) e 6
(orçamento de variações de voz).

1. **Quem declara o dia D e com qual critério de "testada"?** Sugestão: o
   autor declara; critério mínimo de foto da nota é uma lista de cupons reais
   (quantos e de que tipo) em que o valor total volta certo.
2. **A versão pública é a 1.10.3 ou a 1.10.4?** Muda se a Início do app
   publicado tem o saldo acumulado.
3. **Cinco Reels novos em duas semanas, com aprovação de custo de geração
   (rascunho em 360p, uma variação por vez)?** Alternativa: 2 Reels novos por
   semana, além do padeiro, e o calendário perde uma peça por semana.
4. **Quem captura as telas reais (Pix, widget, web) e de qual build?** Recomendo
   capturar do APK público em Dados de exemplo para as peças da fase A, e da
   build nova só para a fase B.
5. **Vale cortar a cena do leitor (9 a 13,4 s) do motion "desistiu" e
   publicá-lo já na fase A, com 15,6 s?** Fora isso, ele espera o dia D.
6. **Aprova orçamento para 2 ou 3 variações de voz por fala** (voz mais
   natural, prioridade sua), com teste de stability e style e pontuação que
   force pausa?
7. **Publicar aos sábados e domingos?** O plano é só de dias úteis.
8. **Substituto do A6 ("fundador falando para a câmera", reprovado).**
   Proposta minha, sem rosto nem voz do autor: um motion tipográfico no estilo
   B, "Por que o Grana. não conecta ao seu banco", com o texto na tela e a
   assinatura "Grana.", sem voz humana identificada. Aprova, ou prefere outro?
9. **Padeiro e widget só para Android:** confirma segmentar o anúncio dessas
   peças para Android?
