# Mapa do Grana. para quem vai usar e auditar o app (guia para agentes, Codex inclusive)

Escrito em 19/09/2026 pelo Claude, a pedido do autor, para passar ao Codex o que
se aprendeu na auditoria de 100% do app no emulador (70 achados, A1 a A70). Este
arquivo é a memória prática: onde cada coisa fica, como chegar lá, o que
conferir, e onde o app costuma quebrar. Para entrar no app e operar o emulador,
leia primeiro `docs/operar-o-app-no-emulador.md` e use `scripts/emulador.cjs`.

Nenhuma credencial mora aqui (o repositório é público, regra 15). A conta de
teste está no `.env` da máquina, em `E2E_TEST_EMAIL` e `E2E_TEST_PASSWORD`, e só
o `node scripts/emulador.cjs login` a usa.

## O aparelho e o ambiente da auditoria

- Emulador `Pixel_8`, 1080x2400, Android 15. APK de desenvolvimento
  `com.gabriouss.grana` (tem todos os módulos nativos) ou Expo Go
  (`host.exp.exponent`, conjunto fixo de módulos: módulo ausente vira tela
  branca com Metro limpo).
- Metro na porta 8081 com `adb reverse tcp:8081 tcp:8081`.
- O app é **só escuro e só retrato** (decisão do autor, 19/09/2026). Não existe
  tema claro nem tela deitada; não audite nem proponha nenhum dos dois.
- Conta de teste "Auditoria", com acesso de cortesia (o bloqueio por assinatura
  fica desligado). Tudo que você criar leva o prefixo **`AUDIT`** no nome ou na
  descrição e é **apagado no fim**. Nunca use dado real nem logue conta real.
- Regra 17 do `AGENTS.md`: uma verificação iniciada vai até o fim, sem parar,
  sem perguntar e sem pausar; verificar não é corrigir.

## Armadilhas do ambiente (todas já custaram tempo)

| Armadilha | Como reconhecer | O que fazer |
|---|---|---|
| Faixa de debug do Metro cobre a barra de abas e o botão do Granabô | toques nas abas não respondem | toque no X da faixa (perto de x=996, y=2208) |
| Bundle velho depois de mudar código | tela mostra o comportamento antigo | reinicie com `npx expo start -c` |
| `adb shell` no Git Bash troca `/sdcard/...` por caminho do Windows | erro de arquivo no `uiautomator dump` | use `node scripts/emulador.cjs`, que chama o `adb` sem shell |
| `tocar "texto"` casa sem diferenciar maiúsculas e por trecho | "Excluir" tocou em "Excluir categoria AUDIT..." de outra sessão | leia `listar` antes, e use o índice (`tocar "Excluir" 1`) |
| Pedido de permissão do Android consome o primeiro toque | depois de "While using the app" nada acontece | toque de novo (é o A48, achado em aberto) |
| Microfone do emulador é mudo | gravação sai vazia | a voz só vai até "Ouvindo…" e "Transcrevendo…"; o resto é "não verificável no emulador" |
| Câmera virtual sem nota fiscal | Escanear nota abre a câmera e não lê nada | marque "não verificável", com o motivo |
| Depois de `pm clear`, "Bloquear captura de tela" volta ligado | os prints saem pretos | audite pela árvore de acessibilidade (`listar`), não pelo print |
| Toast nasce atrás do painel escurecido | mensagem curta some sob o fundo | confira por `listar` logo depois da ação |
| Element Inspector ligado no menu de desenvolvimento | tela cheia de retângulos verde e azul, lista de componentes embaixo e abas "Inspect" e "Touchables" | não é bug do app. Abra o menu (`adb shell input keyevent 82`) e toque em "Hide Element Inspector", ou recarregue o app. Não toque no meio da tela enquanto ele estiver ligado: cada toque só seleciona um componente |
| Avisos vermelho e amarelo (LogBox) no pé da tela | "Erro ao carregar saldos 42501" e "fetchGamification falhou: Usuário não autenticado" | são avisos de desenvolvimento e ficam acumulados. Se nasceram na tela de login, vêm de chamadas feitas antes da sessão existir. Só vale investigar se reaparecerem com a Início já logada depois de fechar os avisos |
| Rotação forçada por `adb` não gira o app | `ROTATION_0` permanece | irrelevante: o app é só retrato |

## Mapa de telas e como chegar

Barra de abas (nesta ordem): **Início**, **Débito e Pix** (rota `lancamentos`),
**Crédito**, **Granabô** (chat), **Boletos** (rota `contas`, título "Contas a
pagar"), **Gráficos**, **Desafios**. **Perfil** fica à parte, pelo avatar no
cabeçalho da Início. Telas fora do grupo: `sign-in`, `sign-up`, `nova-senha`
(só pelo link do e-mail), `assinar`, `ativar`, `termos`, `privacidade`,
`exclusao-de-dados`, e a landing `app/index.tsx` (é página web, fora do
emulador). Atalhos `grana://` existem em `lib/deep-links.ts` (`add-tx`,
`scan-qr`, `safe-to-spend`, `add-credit`, `add-bill`, `bills`, `goals`,
`deposit-goal`), mas foram tirados da tela do Perfil e servem só para teste.

### Início (`app/(app)/index.tsx`)
- Cabeçalho: avatar (abre Perfil), olho de **ocultar valores**, seletor de
  **carteira** (abre `WalletPickerModal`: total, lista, criar, editar, excluir).
- Fileira rolável de atalhos: **Lançamento por voz**, **Colar comprovante**,
  **Importar extrato**, **Escanear nota**. Ela só rola com arrasto lento.
- Blocos personalizáveis (**Personalizar Início**): Livre para gastar, Fluxo
  financeiro (`FlowChart`), donut de categorias e orçamentos, cofrinhos e metas
  (`GoalsCarousel`, com "Guardar" e "Resgatar"), contas e demais.
- Botão **+** (`FabButton`): Entrada, Saída, Boleto, Crédito. A folha de
  lançamento (categoria, carteira, data "Hoje / Ontem / Dia 1º", recorrência,
  parcelas no crédito) é a mesma em todas as abas.

### Débito e Pix (`lancamentos.tsx`)
Seletor de mês, resumo (Entradas, Saídas, Saldo), busca, filtro de categoria e
lista. Toque na linha abre **Editar / Excluir** (`ItemActionSheet`); excluir
pede confirmação nomeada; compra parcelada oferece três opções (só esta, esta e
as futuras, a compra inteira). Não há seleção múltipla.

### Crédito (`credito.tsx`)
Faixa de faturas fechadas pendentes (toque abre o ciclo), carrossel de cartões
("Fatura atual" só no ciclo atual; outros ciclos mostram "Fatura de mmm/aa"),
resumo da fatura, botão **Pagar fatura** / **Pagar restante**, **Desfazer
pagamento**, criar/editar/excluir cartão, compra no crédito (parcelada,
recorrente). Crédito só entra no caixa quando a fatura é paga.

### Boletos (`contas.tsx`)
Lista por mês de vencimento, atrasadas primeiro. **Um toque paga, outro
reabre**; editar e excluir ficam no botão de opções (excluir pede confirmação).
Criar boleto, recorrente, vazio.

### Gráficos (`graficos.tsx`)
Abas Despesas, Renda e Geral; granularidade **Ano a Ano**, **Mês a Mês** e
**Período** (com data inicial e final); exportar relatório em PDF. Crédito fica
fora dos totais.

### Desafios (`desafios.tsx`)
Nível, XP, faixa de pontos, conquistas com filtro Todas, Obtidas e Pendentes,
ritmo da semana, indicadores do Score.

### Perfil (`perfil.tsx`)
Seções: Conta (nome, foto, e-mail), Widgets da tela inicial, Preferências,
Notificações (lembrete diário, faturas e contas), Personalização (categorias,
orçamento sugerido, refazer diagnóstico, **Dados de exemplo**, privacidade e
captura de tela), Legal (termos, privacidade, exclusão de dados), Feedback,
**Sair** e **Excluir conta** (pede senha; audite só até a confirmação).

### Granabô (`components/Granachat.tsx`)
Não é uma tela de arquivo próprio: o item "Granabô" da barra abre o chat
sobre a tela atual (`app/(app)/_layout.tsx`). Chat com histórico, lançamento pelo chat com desfazer, perguntas sobre gasto,
fatura e contas. Resposta em poucos segundos. Com a faixa de debug por cima, o
botão não recebe toque.

### Voz, widgets, notificações
Voz é uma ferramenta só, dentro do app e no widget (regra 13). Widgets: Livre
para gastar, Contas do mês, Cofrinho, Central de lançamentos, lançar por voz.
Notificações locais (lembrete às 20:30) e push (dependem do FCM, que o build de
desenvolvimento não tem: `FIS_AUTH_ERROR` no log é esperado).

## Estados que 100% de cobertura exige, em cada tela

Vazio, carregando, com erro, **sem rede** (desligue Wi-Fi e dados no emulador),
texto longo (nome de carteira, categoria, meta), **valores ocultos** (o olho
fechado), fonte grande do sistema (130%) e a mesma tela com teclado de letras e
com teclado numérico. **Não** existem tema claro nem paisagem.

## Classes de defeito que a auditoria achou várias vezes (procure primeiro)

1. **Janela sobe sob a barra de status com teclado de letras** (A9, A13). Teclado
   numérico cabe; o de texto empurra a folha para cima do relógio.
2. **Valor "oculto" que vaza** (A5): olho fechado esconde o valor mas mostra alvo
   e percentual, que entregam o número.
3. **Destrutivo sem confirmação ou sem dizer o efeito** (A30, A42, A52, A44).
4. **Erro sem recibo**: sair da conta que não sai (A64), voz que fica em
   "Transcrevendo…" (A47), widget que volta ao repouso sem aviso (A63). Todo
   caminho de falha precisa mostrar algo (regra 9).
5. **Mesma palavra, dois números** (A12 saldo, A46 crédito no Granabô contra
   Gráficos). Compare a mesma grandeza em todas as telas que a mostram.
6. **Sem rede diz "lento"** (A57) e **promete dados salvos enquanto carrega**
   (A58); lançamento offline some da lista até sincronizar (A59); tela não sai do
   modo offline sozinha (A60).
7. **Vocabulário e maiúsculas**: "carteira" e "conta" para a mesma coisa (A6),
   maiúsculas de título (A28), travessão (regra de copy, sem "—" nem "–"),
   "(s)" no lugar do plural.
8. **Texto cortado** (A37 conquistas, A10 nome de carteira, A53 meta longa) e
   fileiras que passam da margem (A1, A8).
9. **Rótulo que muda de sentido conforme a seleção** (A22 "Fatura atual").
10. **Primeiro toque perdido** depois de teclado ou permissão (A48, A51).

## Como registrar cada achado (na hora, não no fim)

Tela, passos para reproduzir, o que se esperava, o que apareceu, gravidade e o
caminho do print. Gravidade: **P0** impede a tarefa; **P1** dificulta muito ou
quebra padrão da plataforma; **P2** incomoda, com contorno; **P3** acabamento.
Registre na nota da sessão do vault (`00 - Sessões`) e nunca coloque credencial
ali. Prints ficam em `E:\Grana-temporarios\prints`.

## O que já foi corrigido e o que segue em aberto (19/09/2026)

Não refaça o que está feito. **Corrigidos:** A2, A3, A4, A5, A6, A11, A12, A14,
A16, A17, A19, A20, A21, A22, A23, A24, A25, A28, A30, A31, A32, A33, A36, A37,
A38, A40, A41, A42, A43, A44, A46 (só no fonte da Edge Function, **não
publicada**), A47, A49, A50, A64, A65, A67, A68; **parcial:** A45, A56; A39 e A18
dependem de build nova (`predictiveBackGestureEnabled` já está `false` no
`app.json`).

**Em aberto, para conferir no aparelho ou decidir com o autor:** A7 (dois
"Cancelar" no painel de carteira), A8, A10, A15, A26, A27, A29, A34, A35, A45
(botão "Voltar" que rola com o texto), A48, A51, A52, A53, A54, A58, A69, A70 e
os nativos A55, A61, A62, A63 (exigem build). Se você reproduzir algum destes,
registre o passo a passo; se não reproduzir, diga isso em vez de fechar em
silêncio.

## O que não fazer durante uma varredura

Nada de `eas build` (regra 4), Edge Function ou migration (regra 11),
credencial fora do `.env` (regra 15) nem dado real. Não corrija código no meio
da varredura (regra 17): a exceção é o bug que impede de continuar, e aí você
registra o contorno. Falha técnica (app fechou, Metro caiu) não é motivo para
parar: reinicie e retome do item em que estava.
