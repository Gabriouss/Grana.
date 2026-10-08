# Solicitação: gravar o final do R5 na tela "Débito e Pix"

- **Quem pede:** o autor, por meio da sessão na nuvem, em 27/09/2026.
- **Quem executa:** o agente local da M1, com o emulador.
- **Onde entregar:** na branch `claude/cool-einstein-c63bq0`.

## Por que

No R5 ("Recebeu um Pix e não quer digitar tudo?"), depois do "Lançamento reconhecido e salvo", o vídeo volta para a Início **vazia**: "Sem saldo disponível este mês ainda" e R$ 0,00 em tudo. O autor quer que essa parte mostre a **aba "Débito e Pix" (Lançamentos) com o lançamento recém-feito no topo da lista**, para provar que ele entrou.

O clipe atual (`r5-clipe.mp4`) não tem essa tela. Este pedido serve para gravá-la.

## O que gravar

Um clipe curto e contínuo, de uns 6 a 8 s, com a conta de teste:

1. **Antes de gravar**, deixe a conta com o lançamento do R5 salvo: Saída "Mercado Modelo", R$ 32,90, Alimentação, Pix, na data de hoje. O caminho é o mesmo do `roteiro-gravacao-r5.md` ("Colar comprovante", texto do Pix, "Reconhecer dados", "Salvar lançamento").
   - **Se o `adb` conseguir pôr o texto na área de transferência e colar de verdade, cole.** Assim o clipe pode ser reaproveitado inteiro.
   - Senão, digite como antes. A edição só usa a parte final.
   - **Se possível, deixe a conta com alguns outros lançamentos fictícios do mês**, com nomes claramente inventados e sem marca real, para a lista não ficar com uma linha só. O autor não gostou da tela vazia.
2. Comece a gravação na Início, com o aviso "Lançamento reconhecido e salvo" ainda na tela, ou logo depois.
3. Toque na aba **"Débito e Pix"** da barra de baixo. O nome vem de `app/(app)/_layout.tsx`. Se `tocar "Débito e Pix"` não achar a aba, use `node scripts/emulador.cjs listar`.
4. Deixe a lista parada de **3 a 4 s**, com "Mercado Modelo · Alimentação · − R$ 32,90" visível no topo.
5. Pare a gravação.

## Cuidados

- **Feche a faixa de debug do Metro e qualquer aviso vermelho do modo de desenvolvimento** antes de gravar. No `r5-clipe.mp4` apareceu uma mancha vermelha embaixo do botão central depois do salvar.
- **Conta de teste sempre.** Login só por `node scripts/emulador.cjs login`, e nenhuma credencial em arquivo.
- **Depois de entregar, apague os lançamentos de teste** criados para a gravação.

## Entrega

Salve como `docs/marketing/2026-09/semana-39-2026-09-21-a-2026-09-27/para-aprovacao/videos/r5-final-debito-pix.mp4` e faça commit e push na branch `claude/cool-einstein-c63bq0`. A sessão na nuvem troca o final do R5 v6 por esse trecho, sem mexer no resto da peça, que já foi aprovado.
