---
tags: [grana, auditoria, maestri, agentes]
tipo: registro
data: 2026-09-23
---

# 2026-09-23 — M1 — Consolidado das auditorias dos agentes

> [!info] Para a M2, que retoma daqui
> Os oito agentes do canvas do Maestri auditaram cada um o seu segmento, só em
> leitura. Nada foi corrigido. Este é o resumo; o detalhe de cada achado está na
> nota do agente, linkada abaixo. **A pausa por limite de uso aconteceu às
> 07h30, com o Codex em 90%; a retomada foi agendada na M1 para 12h07**
> (reset do Codex + 1 min). Beacon e Sentinel ainda tinham trabalho quando
> pausaram (ver "Estado na pausa").

> [!tip] Onde está cada coisa, vista da M2
> - **Notas:** todas as deste consolidado estão no vault (Drive, `H:` na M2).
> - **Prints e scripts da auditoria:** copiados em 23/09 para `<letra>:\Meu Drive\Grana - Auditorias (fora do vault)\` (`2026-09-22-QA`, 180 arquivos; `2026-09-22-assinatura`; `scripts-da-pausa`). As notas citam o caminho original `E:\Grana-temporarios\...` da M1: troque pelo desta pasta. Só dado AUDIT da conta de teste; conferido sem credencial.
> - **Código e `context.md`:** GitHub, `origin/main` em `96e6f08` (`git pull`).

## O pedido, como chegou

Em 22 e 23/09 o autor pediu, pelo terminal coordenador do Maestri (o "Codex"
do canvas, que pela regra 19 só encaminha e coordena):

1. "Manda o sentinel continuar o trabalho de auditoria que estava sendo feito
   no pixel 8 pelo codex".
2. Testes do fluxo de assinatura (conta nova, volta pós-compra, cortesia),
   registrados em [[2026-09-22 - M1 - Testes do fluxo de assinatura]].
3. "Coloque todos os agentes para realizarem uma auditoria rigorosa de seus
   próprios segmentos dentro do projeto. Ao terminarem, quero que documentem
   todos os achados", depois "lembre de utilizar todas as skills" e "dê acesso
   ao navegador aqui dentro do workspace para os agentes que precisam".
4. "Quando os limites do claude e do codex chegarem a 90% eu quero que você
   paralise todos os trabalhos até o horário da redefinição +1 minuto. Ao
   chegar em 90% eu quero que você commite tudo, publique e me avise na M2."

## Como foi feito

- **Modelos.** Compass e Ledger passaram de Codex para Claude Code (limite do
  Codex abaixo de 5% em 22/09). Prism, Beacon e Watchtower foram reabertos em
  `gpt-6-sol` com esforço `medium`, a pedido do autor, só nos terminais do
  Maestri: o padrão de `~/.codex/config.toml` continua `gpt-5.6-luna xhigh`.
- **Navegadores próprios.** Cada agente que precisa de web ganhou um portal
  próprio ("Navegador Prism", "Navegador Beacon", "Navegador Compass",
  "Navegador Watchtower", "Navegador Harbor", "Navegador Forge"), para não
  disputarem os portais compartilhados "Landing desktop"/"Landing mobile".
- **Login.** A conta de teste dos agentes está no `.env` como
  `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`. O autor confirmou em 23/09 que é conta
  de teste **sem uso real**, apesar de usar o Gmail pessoal dele (isso responde
  o C14 do Compass e o L6 do Ledger). Nenhum agente recebeu a senha por texto:
  entrar é por `scripts/emulador.cjs login` ou script que lê o `.env` sem
  imprimir.
- **Regras comuns do pedido.** Auditar não é corrigir; nenhum commit, build,
  deploy ou escrita em produção; evidência com arquivo:linha; comprovado
  separado de hipótese; nota própria por agente; skills da biblioteca como
  apoio ativo.
- **Gatilho de 90%.** Scripts em `E:\Grana-temporarios\` (fora do repo):
  `limites.sh` lê o `used_percent` da janela de 5 h nos logs do Codex
  (`~/.codex/sessions/.../*.jsonl`) e procura o aviso de limite nos terminais
  Claude; `vigia-90.sh` dispara `pausar-todos.sh` (ESC + instrução de salvar o
  ponto de parada) e agenda `retomar-todos.sh` no reset + 60 s.

## Resultado por segmento

| Agente | Segmento | Cobertura | P1 | P2 | P3 | Nota |
|---|---|---|---|---|---|---|
| Sentinel | App Android no emulador | concluída (n/v com motivo) | 4 | 10 | 41 | [[2026-09-22 - M1 - Auditoria no emulador (Sentinel)]] |
| Forge | Engenharia do app | ~100% | 0 | 2 | 2 | [[2026-09-23 - M1 - Auditoria de Engenharia do App (Forge)]] |
| Harbor | Backend | ~95% | 0 | 1 | 2 | [[2026-09-23 - M1 - Auditoria de Backend (Harbor)]] |
| Watchtower | Segurança e conformidade | 100% do estático | 1 | 4 | 1 | [[2026-09-23 - M1 - Auditoria Transversal de Segurança e Conformidade (Auditor)]] |
| Ledger | Documentação e vault | ~85% | 0 | 10 | 7 | [[2026-09-23 - M1 - Auditoria de Documentação e Vault (Ledger)]] |
| Compass | Produto | ~80% | 0 | 7 | 7 | [[2026-09-23 - M1 - Auditoria de Produto (Compass)]] |
| Prism | UI e design | ~80% | 0 | 2 | 3 | [[2026-09-23 - M1 - Auditoria de UI e Design (Prism)]] |
| Beacon | Marketing e growth | 100% (8/8 frentes, concluída após a retomada) | 0 | 9 | 2 | [[2026-09-23 - M1 - Auditoria de Marketing e Growth (Marketing)]] |

Atenção aos identificadores: o Prism numerou os achados com a letra P, o que
colide com a gravidade. O "P1" do Prism é um achado **médio**, não crítico.

## Os mais graves, de todos os segmentos

**P1**
- **S4** (Sentinel): o widget "Lançar por voz" sem permissão de microfone
  morre calado, com `erro_interno` no logcat e nenhum aviso.
- **S30** (Sentinel): ANR ao alternar Gráficos e Desafios. Causa não isolada,
  pode ser memória do emulador. Hipótese.
- **S43** (Sentinel): o Granabô soma o crédito no gasto do mês (R$ 440,30)
  onde Gráficos diz R$ 140,30.
- **S51** (Sentinel): Crédito sem rede diz que não há cartões e troca o ciclo.
- **A1** (Watchtower): cache e fila offline atravessam contas no mesmo
  aparelho.

**P2 que mexem com dinheiro, acesso ou venda**
- **C1** (Compass): o Livre para Gastar ignora a fatura do cartão que vence no
  mês.
- **C2, C3** (Compass): a tela de assinar não tem saída (sem sair nem excluir),
  e quem deixa de pagar perde acesso aos próprios dados.
- **C5** (Compass) + teste de 22/09: o checkout aberto do app não leva o e-mail
  da conta; compra com e-mail diferente não se vincula sozinha.
- **A4** (teste de 22/09): o link de confirmação do cadastro feito pela web
  abre o navegador, não o app (sem App Links).
- **H1** (Harbor): o Granabô atende conta bloqueada e consome cota de IA; a
  escrita financeira continua protegida.
- **B9, B10, B11** (Beacon): copy promete foto onde o recurso lê só QR; a
  demonstração sugere compra preenchida; o plano de anúncio atribui parcelas ao
  Livre para Gastar.
- **A3** (Watchtower): `npm audit` com 1 high e 15 moderate.
- **A6** (Watchtower): o `.gitignore` aceita `.env.production`.
- **F7** (Forge): `expo-speech-recognition` preso no SDK 56, em uso ativo.
- **F2** (Forge): timeout de rede da voz 15 s no app e 60 s no widget, tensão
  entre as regras 13 e 9.

## Estado na pausa (07h30)

- **Terminaram e entregaram:** Forge, Harbor, Watchtower, Ledger, Compass,
  Prism.
- **Sentinel:** varredura concluída; resumo final recebido depois da retomada (seção abaixo).
- **Beacon:** parou no meio e concluiu depois da retomada das 12h07 (0 P1, 9 P2, 2 P3).
- **Retomada:** `retomar-todos.sh` agendado na M1 para 12h07. O primeiro timer
  morreu junto com o monitor que o criou (`nohup` dentro do Monitor não
  sobreviveu) e foi relançado à mão; se a M1 for desligada antes, ninguém
  retoma sozinho.

## Sentinel: relatório final (recebido depois da retomada das 12h07)

- **Reconferências que FALHARAM no aparelho** (correções dadas como feitas que
  não se sustentam): A11, A22, A46 (só no fonte, não publicado; é o S43), A57
  (só em Débito e Pix), A60, W1 (Crédito offline), A13 (não alcança os painéis),
  A58, A7, A10, A45, A52 (metade), A53.
- **Conferidos no aparelho:** A1, A2, A3, A4, A5, A6, A8, A9, A14, A16, A17,
  A20, A23, A27, A29, A30, A31, A32, A33, A36, A37, A42, A43, A44, A47, A56,
  A59, A64, A67, A68. A48 não reproduziu. A18 e A39 dependem de build nova (o
  APK do emulador é de 19/09, anterior a `0d5c033`).
- **P2 principais:** S39 guardar na meta leva 3 a 9 s sem recibo (causa
  provável do A51); S45 silêncio vira frase inventada e o app oferece salvar,
  igual no app e no widget; S48 o widget culpa a notificação por qualquer
  falha; S50 Boletos e Gráficos dizem "Conexão lenta" sem rede; S26 ocultar
  valores não alcança Desafios; S9 e S40 painéis sobem por baixo da barra de
  status com teclado; S16 e S17 fatura de outro ciclo e cartão selecionado sem
  sinal; S52 Início offline sem faixa e sem o nome.
- **Limpeza:** dados AUDIT criados pelo Sentinel apagados; rede, bloqueio de
  captura e fonte restaurados.
- **Skills:** usou só ui-visual-composition, maestri-portal-devices e
  intended-vs-implemented; o reforço chegou tarde. **Animação não foi
  auditada** (pendente para review-animations).
- **Perguntas do Sentinel ao autor:** (16) os três "Cafe gelado" de 18/09 sem
  AUDIT são lixo de teste? (17) os dados AUDIT antigos da conta (meta viagem,
  Cartao Teste0001017 com R$ 300, carteira, categoria, boletos pagos) são massa
  fixa ou devem ser apagados? (18) publicar a `assistente-financeiro`
  (A46/S43) pela regra 11? (19) Termos, Privacidade e Exclusão ainda citam
  WhatsApp: mudar? (20) seguem abertas A15, A26, A34, A35, A52 e A54.

## Beacon: relatório final (depois da retomada)

- **P2:** B1 schema declara iOS sem produto iOS; B2 HTML inicial quase sem
  conteúdo indexável; B3 canonical e sitemap apontam para host com 308; B4
  calendários editoriais divergem; B5 alegação universal sem base sobre apps
  gratuitos; B6 criativo A6 contra a diretriz do fundador; B9 copy promete foto
  e o scanner lê QR; B10 QR comum não preenche valor; B11 anúncio promete
  parcelas futuras descontadas do Livre para Gastar.
- **Perguntas do Beacon ao autor:** (21) qual cadência editorial vale? (22) o
  criativo A6 é exceção aprovada? (23) existe plano de foto/OCR, ou a promessa
  fica no QR com valor manual? (24) há Search Console, Web Vitals e eventos para
  validar B2, B7 e B8?

**Com isso, os oito segmentos estão concluídos.**

## O que foi commitado e publicado

- `PRODUCT.md`: a edição do Ledger de 22/09 que ficou sem commit (L1). Registra
  a cobrança ligada em 22/09 e os dois pontos do pós-compra.
- `context.md`: entrada de 23/09 com este consolidado.
- **Fora do commit, de propósito:** `.claude/settings.json`, que troca as
  liberações pontuais por `Bash(*)`, `Edit(*)`, `Read(*)`, `Write(*)`,
  `Glob(*)`, `Grep(*)`. Num repositório público, isso liberaria tudo sem
  confirmação em toda sessão das duas máquinas, e o classificador de
  permissões bloqueou a ação em 22/09. Continua pendente de decisão do autor
  (L2). Se for só da M1, o lugar é `.claude/settings.local.json`.
- **"Publicar" foi lido como push para o GitHub.** Nenhum `eas build`, deploy
  de Edge Function ou migration (regras 4 e 11). Continuam represados, sem
  pedido: `assistente-financeiro` (H3), `whatsapp-webhook` e
  `enviar-lembretes-habito`.

## O que deu errado no caminho

- O monitor de estados usava a palavra "limite" como sinal e acusou falso
  positivo no Prism e no Sentinel, porque o texto da própria pausa contém a
  palavra.
- A mensagem de reforço das skills falhou na primeira tentativa por escape de
  barra invertida no Node; reenviada com barras normais.
- O primeiro relatório do Compass não chegou por mensagem; foi lido da nota.
- O timer de retomada criado com `nohup` morreu com o monitor; relançado.

## O que ficou sem verificação

- Nenhuma correção foi feita, então nada disto foi conferido como resolvido.
- A tela depois da confirmação de e-mail (assinar/Cakto) segue sem teste.
- A26 do Sentinel e os S* de widgets não instalados no launcher, push FCM,
  microfone real: n/v no emulador.
- O `verificar-vault` desta rodada está registrado no fim desta nota.

## Perguntas ao autor, juntadas de todos

1. `.claude/settings.json`: versionado com `Bash(*)` ou só local? (L2)
2. A faixa da landing fica sem pausa de vez, apesar da acessibilidade? (Prism P1, L3)
3. O Granabô deve recusar conta bloqueada? (H1)
4. O Livre para Gastar deve descontar a fatura do cartão? (C1)
5. Quem está no paywall ou vencido pode sair, exportar e excluir? (C2, C3)
6. Caminho oficial de cancelar a assinatura na Cakto? (C6)
7. Mantém o selo "Mais popular"? (C13)
8. Retenção de feedback e prints na exclusão de conta? (Watchtower A2)
9. A política deve declarar a atribuição Cakto/Meta/Google (`gclid`, `fbclid`)? (A4)
10. F2 é exceção aceita à regra 13, ou a regra muda? Atualizar `expo-speech-recognition` na próxima build? (F2, F7)
11. Próxima build: 1.10.5 pelo `build:preparar`? (L17)
12. `context.md`: seções novas no topo ou no fim? (L14)
13. Apagar o usuário AUDIT não confirmado `delivered+audit20260922@resend.dev` com `service_role`?
14. Juntar os três deploys represados num pedido só? (H3)
15. Os cinco segredos expostos no EAS já foram trocados? (alerta do AGENTS.md)
