# Roteiro de gravação — R5 "Recebeu um Pix e não quer digitar tudo?"

**Atualizado em 25/09/2026: quem grava agora é o maestro, no emulador
(`scripts/emulador.cjs`), não o autor no aparelho dele.** Siga
`docs/operar-o-app-no-emulador.md` do começo ao fim; este roteiro só lista a
sequência específica desta peça. Regra de sempre: conta de teste, dado 100%
inventado, apagar no fim.

## Antes de gravar

1. `node scripts/emulador.cjs estado` — confirme emulador, Metro e app.
2. `node scripts/emulador.cjs abrir dev` (o APK de desenvolvimento tem todos os
   módulos nativos; use `abrir go` só se `dev` não estiver instalado).
3. `node scripts/emulador.cjs login` — conta de teste, nunca a real.
4. `node scripts/emulador.cjs tem "Início"` até responder `SIM`.
5. Se a faixa de debug do Metro estiver cobrindo a barra de abas, toque no X
   dela antes de continuar (canto direito, perto de x=996, y=2208 no Pixel_8).

## Texto de Pix a usar (100% inventado)

> Você transferiu R$ 32,90 para Mercado Modelo via Pix em 25/09/2026 às 18:42.

"Mercado Modelo" é claramente fictício, sem ser um nome real de
estabelecimento. Não troque por um Pix real, mesmo de valor baixo.

## Sequência de comandos

Tempos entre parênteses são o quanto segurar a tela (print ou gravação
parada) antes do próximo comando, para a edição ter margem.

1. `node scripts/emulador.cjs print r5-01-inicio` (2 s, tela em repouso)
2. `node scripts/emulador.cjs tocar "Colar comprovante"`
3. `node scripts/emulador.cjs print r5-02-folha-vazia` (1 s, folha "Colar
   comprovante ou Pix" aberta e vazia)
4. `node scripts/emulador.cjs tocar "Texto do comprovante"` (foca o campo de
   texto pelo `accessibilityLabel`)
5. `node scripts/emulador.cjs digitar "Você transferiu R$ 32,90 para Mercado Modelo via Pix em 25/09/2026 às 18:42."`
6. `node scripts/emulador.cjs print r5-03-colado` (1 s, texto colado visível
   no campo)
7. `node scripts/emulador.cjs tocar "Reconhecer dados"`
8. `node scripts/emulador.cjs print r5-04-confirmar` (2 a 3 s, tela "Confirmar
   lançamento" com Saída, a carteira, "Mercado Modelo" na descrição, "32,90"
   no valor, categoria sugerida marcada, e "Também reconhecido: Pix" visível)
9. `node scripts/emulador.cjs tocar "Salvar lançamento"`
10. `node scripts/emulador.cjs print r5-05-salvo` (1 a 2 s, aviso "Lançamento
    reconhecido e salvo" visível)

Duração de referência do trecho de tela (passos 1 a 10): cerca de 16 a 18
segundos se cada print marcar o tempo de espera indicado. Na edição, esse
trecho entra entre o segundo 2 e o segundo 8 do Reel completo (25 segundos);
o editor acelera ou corta as esperas conforme o ritmo pedir.

## Edição (instrução de 25/09/2026, depois da gravação)

O passo 5 (`digitar`) ficou gravado como digitação letra por letra — limitação
técnica do `adb`, que não tem um comando de "colar". O recurso real é **colar**
da área de transferência: o texto aparece inteiro e instantâneo, não sendo
digitado. Decisão do autor: **corrigir na montagem, não regravar.** Corte seco
do quadro com o campo vazio (fim do passo 3/print `r5-02-folha-vazia`) direto
para o quadro com o texto completo já no campo (print `r5-03-colado`),
cortando fora toda a digitação letra por letra que ficou no meio. O restante
da sequência (passos 7 a 10) segue sem alteração.

## Se der errado

- Se o passo 5 não recair no campo certo (a categoria ou o valor
  reconhecidos vierem errados), repita os passos 4 a 8 — não corrija o valor à
  mão na tela de confirmação: a cena mostra o reconhecimento automático.
- Se `tocar "Colar comprovante"` não achar o botão, rode `node
  scripts/emulador.cjs listar` para confirmar o texto exato visível na tela
  (pode ter mudado desde este roteiro).

## Depois de gravar

1. `node scripts/emulador.cjs tocar "Lançamentos"`
2. `node scripts/emulador.cjs listar` — confirme o lançamento "Mercado Modelo"
   na lista e ache o rótulo exato do jeito de excluir (pode ser um toque que
   abre o detalhe com um botão de excluir, ou um gesto; o texto exato não foi
   verificado nesta sessão — use `listar` e `print` para achar).
3. Exclua o lançamento de teste antes de encerrar, para não deixar dado
   fictício acumulando na conta de teste.
4. Envie os arquivos de `E:\Grana-temporarios\prints` (ou o vídeo, se a
   captura for contínua) para a edição, junto com a cena gerada por IA (FUNIL
   17.2, R5) e a legenda "Recebeu um Pix e não quer digitar tudo?".

## O que ficou sem verificação

O passo de exclusão (depois de gravar) não foi testado nesta sessão; o roteiro
aponta o caminho (`Lançamentos` → achar o lançamento → excluir) mas não o
texto exato do botão de excluir. Confirme com `listar` antes de agir.
