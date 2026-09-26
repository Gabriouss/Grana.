# Roteiro — R7 "O lançamento acompanha o dia, não o contrário"

**Reescrito em 25/09/2026: a parte do widget é RECRIADA em HTML, não capturada
ao vivo.** Aprendizado do autor no mesmo dia: tela de widget e de notificação
fica melhor recriada (a exibição delas no emulador é instável — bate com
achados do Sentinel de notificação sem texto no shade e widget com
"atualizado" desatualizado). **A parte de dentro do app, depois do toque
(formulário abrindo), continua captura real no emulador**, que funciona bem.
Sem pressa: R7 só entra na fila depois de D (widget e formulário já existem
hoje, mas a peça está longe na fila).

## Correção de texto encontrada nesta revisão

O roteiro anterior (antes de 25/09) dizia para tocar em "Saída" no widget.
**Está errado.** Conferido agora em
`modules/grana-voice-widget/android/src/main/res/values/strings.xml`: o botão
correto chama **"Débito/Pix"**, não "Saída". A tabela abaixo usa o texto
exato.

## Widget "Central de lançamentos": texto e cor exatos (conferido no código)

Fonte: `strings.xml`, `colors.xml`, `grana_central_widget.xml` e os ícones
`ic_grana_widget_*.xml` do módulo `grana-voice-widget`, em 25/09/2026.

- **Fileira de 4 cápsulas lado a lado**, sem fundo nem borda própria da
  fileira (mostra o papel de parede por baixo). Cada cápsula: 34dp de altura,
  raio total (cápsula real), preenchimento `#123B44`, borda de 1dp em
  `#2A5660`, ícone de 15dp + rótulo de 9sp em `#EFFFFA`, com respiro entre as
  4.
- **Ordem e rótulo exatos, da esquerda para a direita:**
  1. **"Entrada"** — ícone na cor `#74E291`.
  2. **"Débito/Pix"** — ícone na cor `#00A6CA`.
  3. **"Crédito"** — ícone na cor `#AEFFE3`.
  4. **"Boleto"** — ícone na cor `#EFFFFA`.
- Cada botão abre o app direto num destino diferente (deep link); esta peça
  usa o segundo ("Débito/Pix"), que abre o formulário de saída.

## Estrutura por tempo

| Tempo | Cena | Texto na tela | Real ou recriado |
|---|---|---|---|
| 0,0–3,0 s | Recorte de uma tela inicial do Android (papel de parede escuro genérico, sem foto real de ninguém), com a fileira do widget "Central de lançamentos" visível, nas cores e rótulos exatos acima. | "O lançamento acompanha o dia." | recriado |
| 3,0–4,0 s | Toque animado na cápsula "Débito/Pix" (destaque sutil menta no instante do toque). | (sem texto extra) | recriado |
| 4,0–9,0 s | Corte para a tela real do app: o formulário de novo lançamento já aberto, tipo "Saída" selecionado, categoria e data preenchidas. Preencher descrição e valor inventados e salvar (sequência de gravação abaixo). | (o próprio app mostra o texto) | real |
| 9,0–12,0 s | Segurar a confirmação de salvo. | "Não o contrário." | real (o toast) + recriado (o texto de apoio, se a edição preferir sobrepor) |
| 12,0–14,0 s | Fecho: logo "Grana." com o ponto. | "Grana. O lançamento acompanha o dia." | recriado |

Duração total: cerca de 14 segundos.

## Sequência de gravação da parte real (depois do "toque")

Em vez de tentar reproduzir um widget de verdade na tela inicial do emulador
(o que a mudança de regra evita), o toque é simulado pelo mesmo destino que o
botão abre — assim a tela real capturada é EXATAMENTE a que o toque no widget
abriria, sem depender da exibição instável do widget no emulador.

1. `node scripts/emulador.cjs estado`
2. `node scripts/emulador.cjs abrir dev`
3. `node scripts/emulador.cjs login`
4. `node scripts/emulador.cjs tem "Início"` → `SIM`
5. **Comando fora do `scripts/emulador.cjs`** (o script não tem um comando de
   deep link; este é um `adb` direto, não credencial nem dado sensível):
   `adb shell am start -W -a android.intent.action.VIEW -d "com.gabriouss.grana://add-tx?type=out"`
6. `node scripts/emulador.cjs print r7-01-formulario` (2 s, formulário aberto,
   tipo "Saída", categoria e data já preenchidas, descrição e valor vazios)
7. `node scripts/emulador.cjs tocar "Descrição do lançamento"`
8. `node scripts/emulador.cjs digitar "Padaria Modelo"`
9. `node scripts/emulador.cjs tocar "Valor do lançamento em reais"`
10. `node scripts/emulador.cjs digitar "12,50"`
11. `node scripts/emulador.cjs print r7-02-preenchido` (1 s)
12. `node scripts/emulador.cjs tocar "Salvar lançamento"`
13. `node scripts/emulador.cjs print r7-03-salvo` (1 a 2 s, confirmação
    visível)

## Depois de gravar

Apague o lançamento de teste "Padaria Modelo" pela tela de Lançamentos, do
mesmo jeito descrito no roteiro do R5.

## O que ficou sem verificação

- O comando `adb shell am start` com o deep link não foi executado nesta
  sessão; a sintaxe é a convenção padrão do Android para abrir uma `VIEW`
  intent com uma URI, e o esquema `com.gabriouss.grana://add-tx?type=out` foi
  confirmado no código (`CentralLancamentoWidgetProvider.kt`), mas o efeito
  exato (se abre direto no formulário ou passa por uma tela intermediária)
  só foi confirmado por leitura de código (`app/(app)/index.tsx`,
  `params.acao === 'add-tx'`), não por execução real.
- Os rótulos exatos dos campos do formulário de lançamento (`Descrição do
  lançamento`, `Valor do lançamento em reais`, `Salvar lançamento`) vêm de
  `components/TransactionSheet.tsx`, conferidos no código, não testados ao
  vivo nesta sessão.
