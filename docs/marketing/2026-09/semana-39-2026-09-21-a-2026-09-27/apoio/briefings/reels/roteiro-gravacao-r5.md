# Roteiro de gravação — R5 "Recebeu um Pix e não quer digitar tudo?"

**Especificação de 26/09/2026: o Sentinel grava no emulador
(`scripts/emulador.cjs`) quando receber a vez do maestro.** Siga
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

> Você recebeu um Pix de R$ 32,90 de Clara Exemplo em 26/09/2026 às 18:42.

"Clara Exemplo" é uma pessoa fictícia. O texto descreve uma **entrada**, como
o gancho "Recebeu um Pix". Não troque por um Pix real, mesmo de valor baixo, e
não inclua nome de banco.

## Sequência de comandos

Tempos entre parênteses são o quanto segurar a tela (print ou gravação
parada) antes do próximo comando, para a edição ter margem.

1. `node scripts/emulador.cjs print r5-01-inicio` (2 s, tela em repouso)
2. `node scripts/emulador.cjs tocar "Colar comprovante"`
3. `node scripts/emulador.cjs print r5-02-folha-vazia` (1 s, folha "Colar
   comprovante ou Pix" aberta e vazia)
4. `node scripts/emulador.cjs tocar "Texto do comprovante"` (foca o campo de
   texto pelo `accessibilityLabel`)
5. Cole pela área de transferência, de uma vez, o texto exato acima. Não use
   `node scripts/emulador.cjs digitar`: a digitação letra por letra contradiz
   a função demonstrada e pode perder os acentos.
6. `node scripts/emulador.cjs print r5-03-colado` (1 s, texto colado visível
   no campo)
7. `node scripts/emulador.cjs tocar "Reconhecer dados"`
8. `node scripts/emulador.cjs print r5-04-confirmar` (2 a 3 s, tela "Confirmar
   lançamento" com **Entrada**, carteira de destino, **Clara Exemplo** na
   descrição, **R$ 32,90** no valor e Pix reconhecido. Confira a data
   **26/09/2026** se ela aparecer no formulário. Se algum campo essencial
   divergir, pare e reporte; não o corrija manualmente para a gravação.)
9. `node scripts/emulador.cjs tocar "Salvar lançamento"`
10. `node scripts/emulador.cjs print r5-05-salvo` (1 a 2 s, aviso "Lançamento
    reconhecido e salvo" visível)

Duração alvo da captura útil (passos 1 a 10): cerca de **16 a 18 segundos**.
Comece na Início em repouso, por 2 s, e termine após manter o aviso de salvo
visível por 1 a 2 s. O Reel final é vertical **9:16, 1080×1920, 30 fps**;
se o emulador gravar em outra proporção, preserve o conteúdo real do app no
recorte final. O editor ajusta esperas para o ritmo de um Reel de até 25 s.

## Edição e limites da captura

A colagem deve aparecer inteira e instantânea na gravação nova. Mostre a
confirmação preenchida e o aviso "Lançamento reconhecido e salvo". Não use o
clipe antigo de saída, nem insira digitação letra por letra, correção manual
de campos, dados reais, banco, faixa do Metro, conteúdo de depuração,
notificações ou outra marca. A área de sistema e indicadores do emulador não
entram no corte final. O R9 tem captura própria de **Importar extrato** e não
reutiliza o Pix do R5, conforme o pedido versionado do autor de 26/09.

## Se der errado

- Se a colagem não recair no campo certo, ou se tipo, valor ou pessoa
  reconhecidos divergirem, interrompa a captura e reporte. Não altere a
  confirmação à mão para simular reconhecimento automático.
- Se `tocar "Colar comprovante"` não achar o botão, rode `node
  scripts/emulador.cjs listar` para confirmar o texto exato visível na tela
  (pode ter mudado desde este roteiro).

## Depois de gravar

1. `node scripts/emulador.cjs tocar "Lançamentos"`
2. `node scripts/emulador.cjs listar` — confirme o lançamento "Clara Exemplo"
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
