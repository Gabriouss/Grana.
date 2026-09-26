# Solicitação: gravar o clipe do R9 com "Importar extrato"

- **Quem pede:** o autor, por meio da sessão na nuvem, em 26/09/2026.
- **Quem executa:** o agente local da M1, com o emulador.
- **Onde fica o que já existe:** na branch `claude/cool-einstein-c63bq0`.

## Por que

O R9 ("Planilha aberta versus lançamento simples") foi montado com o mesmo clipe do R5, o de colar o comprovante do Pix. O autor não quer a mesma função nos dois vídeos: o R5 fica com o colar Pix, e o R9 passa a mostrar **Importar extrato**. É o par natural de "planilha aberta": a pessoa traz o extrato inteiro de uma vez, em vez de digitar linha por linha.

Hoje não existe gravação dessa função. Este pedido serve para gravá-la.

## Material

O extrato fictício é o `extrato-exemplo-r9.csv`, nesta pasta. Tem 8 linhas, nomes claramente fictícios e valores inventados. Não troque por um extrato real.

## Passo a passo

Siga `docs/operar-o-app-no-emulador.md` e `scripts/emulador.cjs`. As regras de sempre continuam: conta de teste, nunca a real; login só por `node scripts/emulador.cjs login`; nenhuma credencial em arquivo.

1. `node scripts/emulador.cjs estado`, depois `abrir dev`, depois `login`. Espere `tem "Início"` responder `SIM`.
2. Confira que **"Dados de exemplo" está desligado** no Perfil. Com ele ligado, o app recusa importar e mostra "Modo de exemplo ativo".
3. Copie o arquivo para o emulador: `adb push docs/marketing/solicitacoes/extrato-exemplo-r9.csv /sdcard/Download/extrato-exemplo.csv`
4. Comece a gravação de tela contínua, do mesmo jeito que o `r5-clipe.mp4` foi gravado. Se a faixa de debug do Metro estiver cobrindo a tela, feche-a antes.
5. Deixe a Início parada por uns 2 s.
6. `tocar "Importar extrato"`. A folha "Importar extrato" abre. Deixe parada 1 s.
7. `tocar "Escolher arquivo do extrato"`. No seletor do Android, vá a Downloads e toque em `extrato-exemplo.csv`.
8. A folha mostra "Prévia: 8 lançamentos", com a lista. Deixe parada 2 a 3 s. Se der, role a lista devagar uma vez.
9. `tocar "Importar 8 lançamentos"`. Espere o fim e o aviso de sucesso. Deixe 2 s na tela seguinte.
10. Pare a gravação.

**Se o texto dos botões for diferente,** rode `node scripts/emulador.cjs listar` para achar o texto real. Os textos acima foram tirados de `components/ImportarExtratoModal.tsx` e não foram testados no emulador.

## Entrega

1. Salve o vídeo como `docs/marketing/material-video-2026-09-26/r9-importar-extrato.mp4` e faça commit e push **na branch `claude/cool-einstein-c63bq0`**, a mesma onde está o resto do material. Avise o autor.
2. Depois de gravar, **apague os 8 lançamentos de teste** da conta de teste, pela tela Lançamentos. Apague também o arquivo do emulador: `adb shell rm /sdcard/Download/extrato-exemplo.csv`.
3. Anote na nota da sessão (regra 12) o que foi gravado e o que deu errado.

## Cuidados

- A gravação tem que mostrar o **seletor de arquivo** e a **prévia**. É a prova de que o extrato entra inteiro sem digitar nada.
- Se aparecer o aviso de CSV sem identificador ("importar o mesmo arquivo duas vezes duplica os lançamentos"), grave assim mesmo. A edição decide o corte.
- Nada disso é publicado antes do dia D.
