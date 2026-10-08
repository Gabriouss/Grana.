# Solicitação à M1: gravar as duas cenas do Granabô para o Reels de apresentação

**Para:** a sessão da M1 (precisa do emulador e da conta de teste; a nuvem não
tem nenhum dos dois).
**Peça:** `docs/marketing/roteiro-reels-granabo-apresentacao.md`.
**Prévia já montada:** `docs/marketing/reels-granabo/granabo-reels-previa.mp4`.
As duas telas marcadas "CENA A GRAVAR NA M1" são o que esta solicitação pede.

**Por que gravar de novo:** as gravações v40 (`granabo-consulta-limpa.mp4`,
R$ 100,00, e `granabo-registro.mp4`, "gastei 20") usam valores redondos, e o
autor pediu em 08/10/2026 para evitar números redondos nas peças.

## Antes de gravar

1. Siga `docs/operar-o-app-no-emulador.md`. Entre só com
   `node scripts/emulador.cjs login`; nunca digite credencial à mão (regra 18).
2. Reserve a conta de teste e o emulador: nenhum outro agente usa durante a
   preparação, a captura e a limpeza.
3. Limpe o histórico da conversa do Granabô e confirme que nenhuma mensagem
   antiga aparece ao abrir o chat.
4. Deixe a conta com **exatamente duas saídas em Alimentação no mês, sem
   crédito**: R$ 38,70 e R$ 64,35. Prepare pela folha "Colar comprovante",
   como em `material-video-2026-09-26/roteiro-motion-granabo-consulta.md`,
   trocando os textos por:
   - `Você gastou R$ 38,70 no Mercado Modelo em Alimentação.`
   - `Você gastou R$ 64,35 na Padaria Modelo em Alimentação.`
5. Confira a Início antes de gravar: se algum número redondo aparecer em
   quadro (saldo, "Livre para gastar", total), ajuste os dados da conta, não a
   tela.

## Cena 1: consulta (vai em 8,4–13,4 s da peça)

1. `node scripts/emulador.cjs tocar "Abrir conversa com o Granabô"`
2. `node scripts/emulador.cjs tocar "Mensagem para o Granabô"`
3. `node scripts/emulador.cjs digitar "quanto eu gastei em Alimentação esse mês?"`
4. `node scripts/emulador.cjs tocar "Enviar mensagem"`
5. Grave a tela do início ao fim (`adb shell screenrecord`), sem segurar a
   espera: a edição corta o "pensando" para 0,5 s.
6. Resposta esperada: **R$ 103,05**. Anote o texto exato da bolha.

## Cena 2: registro (vai em 13,7–18,2 s da peça)

1. Limpe a conversa de novo, para a cena começar vazia.
2. `node scripts/emulador.cjs tocar "Mensagem para o Granabô"`
3. `node scripts/emulador.cjs digitar "gastei 23,90 no mercado"`
4. `node scripts/emulador.cjs tocar "Enviar mensagem"`
5. Grave até a confirmação aparecer inteira. Anote o texto exato.
6. Se o Granabô perguntar algo antes (por exemplo, a carteira), responda da
   forma mais simples e grave a troca; a peça se ajusta.

## Entrega

- `granabo-consulta-10305.mp4` e `granabo-registro-2390.mp4`, 1080 × 1920,
  30 fps, sem áudio, em `docs/marketing/material-video-2026-09-26/`.
- O texto exato das duas respostas, no relatório da sessão.
- Para encaixar na prévia: em `docs/marketing/reels-granabo/montar.py`, as
  funções que desenham a tela marcada "CENA A GRAVAR NA M1" são o lugar onde
  entram os quadros gravados (recortados pela tela do celular, sem cortar a
  bolha).

## Depois de gravar

Apague a conversa e os três lançamentos de teste (R$ 38,70, R$ 64,35 e
R$ 23,90) pela tela de Lançamentos, e confirme que a conta voltou ao estado
anterior.
