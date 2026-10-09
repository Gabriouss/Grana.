# Guia operacional C/D do painel de marketing

Data: 2026-10-08. Escopo: regras de campanha, ciclo de ajustes e passagem do aceite ao calendário. Este guia descreve os contratos e o estado local observado. Não autoriza produzir peças, movê-las, gastar verba, chamar a Meta ou publicar.

## Autoridade e estado atual

- Frente C segue o desenho Compass revisado por Meridian. A fila privada local tem estados, recibos e lease, mas ainda não há prova de uma rodada C real ponta a ponta. O relatório Compass registra a ponte M1↔Supabase como inativa. Pedidos antigos em `aprovacoes.json` continuam como legado; novos motivos não devem ser copiados para esse arquivo nem para commit, log ou relatório.
- Frente D usa `cronograma.json` como fonte editorial e `calendario.json` como projeção operacional. O código de manifesto está no repositório, mas `docs/marketing/painel/cronograma.json` ainda não existe. Hoje `calendario.json` tem `diaD: null` e nenhuma programação efetiva.
- A ordem do autor de 08/10 determina que o aceite exato projete a peça no calendário. A projeção não cria publicação nem agenda na Meta.
- `meta-ensaio.cjs` só gera ensaio local. O recibo informa `realHabilitado: false` e `chamadasMeta: 0`. Não há integração real, scheduler Meta ou outbox com reconciliação comprovados.
- `trafego.json` mantém dois rascunhos de campanha, sem peças vinculadas e sem gasto autorizado. O campo local `no-ar` é anotação, não confirmação da Meta.
- O Reel da padaria tem aceite para SHA1 `bc01c04e92badb8c64de75c15d46eb13e7a920cb`, em `2026-10-07T10:31:32-03:00`, e vínculo `campanha-grana-organico-2026#reels-widget-padaria@1`, posição R-P D+4. `diaD` segue nulo; a previsão não tem data resolvida e faltam hora e canal. Não declarar D nesta rodada nem preencher esses campos por inferência.
- O handoff desta rodada permite consolidar critérios, sem autorização para editar peças de campanha. Nenhuma fixture C ou correção real foi processada aqui.

Fontes: `E:/Grana-temporarios/2026-10-08-painel/relatorio-compass-frente-c-ciclo-ajustes.md`, `relatorio-compass-frente-d-calendario-meta.md`, `ORDEM-aprovou-vai-ao-calendario.md` e `parecer-keel-D3b-cronograma.md`; `tools/admin-local/marketing/ajustes-fila.cjs`, `cronograma.cjs`, `meta-ensaio.cjs` e `trafego.cjs`. Estado lido em `HEAD fcd2792`.

## C. Ciclo de ajuste

| Estado | Regra de entrada e ação | Recibo visível |
|---|---|---|
| `novo` | Pedido imutável ligado ao ID e SHA1 da peça. | ID do pedido, hora de entrada e confirmação de que ninguém o pegou. Não repetir o motivo fora da fila privada. |
| `em-correcao` | Claim atômico com agente e lease de 45 minutos; renovar enquanto o trabalho continua. | Agente, início, validade do lease e tentativa. Claim expirado volta a `novo` com evento, salvo após três tentativas, quando vai a atenção. |
| `corrigido-aguardando-aceite` | SHA1 atual e commit publicado conferem com o resultado. O pedido original permanece intacto. | SHA1 anterior e novo, ID da peça, commit e comparação visual antes/depois no índice semanal, sem o texto livre do pedido. |
| `aceito` | Só ação explícita do autor sobre o SHA1 corrigido exato. | SHA1 aceito e data/hora. Esse aceite projeta a versão no calendário quando há vínculo válido. |
| `falha-de-envio` | Entrega falhou ou ficou incerta. | Código e hora. Em `entrega-incerta`, conferir com o agente antes de reenviar. Retry permitido até o limite de três tentativas. |
| `desatualizado` | O SHA1 atual difere do SHA1-alvo do pedido. | ID, SHA1-alvo e confirmação de que nada foi alterado. Abra um novo pedido para a nova versão. |
| `aguardando-aprovacao-de-custo` | A correção exige ferramenta paga. | Ferramenta e estimativa de créditos e dólares. Pausar até o “sim” do autor para aquela geração. |
| `precisa-de-atencao` | Limite de tentativas, linha remota inválida ou falha que exige intervenção. | Código, horário, tentativas e próximo passo. Não encobrir a falha com sucesso aparente. |

### Procedimento futuro após a ponte ativa

1. O painel confirma recebimento somente depois da gravação na fila privada. Só após autorização da ponte e recibo de estado `ativo`, usar fixture controlada. Se a ponte remota estiver ausente, com erro ou sem sincronização recente, mostrar isso; não dizer que o pedido chegou ao outro dispositivo.
2. O vigia reclama um pedido por vez, consulta o texto original pela ferramenta específica e confere o SHA1 antes de editar. Se a versão mudou, marca `desatualizado` e para.
3. Correção gratuita segue as regras de criativo 23 e 25. Celular e notebook inteiros dentro da margem, logotipo oficial em gradiente e aviso de dado fictício somente na legenda. ElevenLabs exige autorização nova do autor antes de cada geração, com custo estimado em créditos e dólares.
4. Ao concluir, calcular SHA1, comparar visualmente e deixar a versão em `para-aprovacao`. Registrar o recibo datado no `INDICE.md` semanal. Não inserir a versão em `aprovacoes[]`, não inventar campo `estado` e não mover para `aprovados` sem o aceite exato do autor.
5. O agente confirma o resultado depois do commit publicado e da verificação do caminho. O sistema aceita somente a versão corrigida indicada. Em um pedido novo, criar novo ID e preservar a solicitação anterior.

O evento da fila guarda transições sem copiar o texto do autor para logs. O arquivo legado `aprovacoes.json` pode conter motivos históricos já versionados. Não apagar nem repetir esses textos sem decisão do autor.

## D. Cronograma, calendário e ensaio

### Fonte e vínculo

- `docs/marketing/painel/cronograma.json` é a fonte editorial canônica. Cada atualização aumenta `versao`, usa `manifestoId` estável, `fuso: America/Sao_Paulo`, `diaD`, itens com IDs permanentes e tombstones `removidos`.
- Cada item recebe data absoluta (`data`, `hora`, `canal`) ou relativa (`diaD` e `diasUteis`). Na relativa, hora e canal podem ficar pendentes, mas o envio Meta permanece bloqueado até serem definidos.
- O `INDICE.md` semanal liga a peça ao item por `manifestoId#itemId@manifestoVersao`. O caminho ajuda a localizar a peça e não define sua identidade. Mantenha uma peça ativa por item.
- `calendario.json` guarda a projeção. O aceite exato da peça projeta automaticamente o planejamento. A chave é `(manifestoId, itemId, versaoPeca)`. Uma substituição manual de data precisa de recibo e permanece preservada durante novas projeções.
- Mudança no conteúdo invalida o aceite da versão anterior e tira essa versão do calendário. Mudança só na data não revoga o aceite do conteúdo. Vínculo ausente, inválido, duplicado ou item removido recebe alerta; não adivinhar associação.
- Dia D só pode ser declarado ou alterado pelo autor com a confirmação literal `DECLARAR DIA D`; registrar antes, depois e hora local. Não derivar D de um calendário antigo ou de posição do funil.

| Estado ou aviso | Significado operacional |
|---|---|
| `planejado` | Previsão local ligada a peça aceita e item válido. Não é agendamento Meta. |
| `aguardando dia D` | Item relativo sem D declarado. Data ainda não resolvida. |
| `horário pendente` / `canal pendente` | Alerta não bloqueante na projeção; ensaio Meta bloqueia até preencher o campo. |
| `sem data no cronograma` | Item aposentado ou sem previsão válida; resolver no manifesto com decisão editorial. |
| `vínculo inválido` / `vínculo duplicado` | Relação ambígua entre peça e manifesto. Não escolher automaticamente. |
| `desatualizado` | O recibo antigo não corresponde a uma peça ativa e aceita; não reenviar. |
| `cronograma inválido` | Previsões derivadas suspensas; preservar datas manuais e recibos enquanto se corrige o manifesto. |
| `ensaio` / `bloqueado` | Resultado individual do ensaio local. O relatório geral continua com Meta desligada e zero chamadas. |

Datas relativas contam dias úteis de segunda a sexta. O cálculo não exclui feriados. `datasComAviso` cria alerta, sem mudar o cálculo. Data no passado recebe aviso e nunca vira publicação imediata. Se o manifesto estiver inválido ou indisponível, suspender previsões derivadas e preservar datas manuais e recibos.

### Portões do dia D

Aplicar o portão editorial já definido: build pública e testada; QA das funções anunciadas nas plataformas citadas; capturas feitas com conta de teste; cada versão criativa aceita pelo autor. Enquanto um item estiver pendente, exibir a pendência e aguardar decisão. Dia D nulo mantém posições relativas sem data resolvida.

### Ensaio Meta

O ensaio local não chama a Meta. Para cada item, emitir recibo com hash SHA256, peça e SHA1, canal, data/hora local, instante UTC, fuso, hora do aceite, modo, estado e bloqueios. O cabeçalho deve preservar `realHabilitado: false`, `chamadasMeta: 0` e `geradoEm`.

Bloquear quando a peça não estiver em `aprovados`, o aceite não corresponder ao SHA1 atual, o dia D não estiver declarado, a data não for futura, hora/canal faltarem, o vínculo estiver pendente ou o formato de mídia não corresponder ao canal. `anuncio` é fluxo pago separado e não passa pelo ensaio orgânico. O ensaio do Instagram não agenda uma execução futura.

Uma publicação real exigiria implementação e revisão próprias: conta e permissões confirmadas, token e quota validados sem registrar segredos, mídia em URL acessível aprovada, scheduler e outbox duráveis, idempotência e reconciliação após timeout, e julgamento técnico de Harbor/Keel. Só depois desses portões e da autorização específica do autor alguém pode propor ativação. Nenhum desses pré-requisitos fica provado pelo ensaio.

## Campanhas e verba

`trafego.json` aceita os rótulos `rascunho`, `pronta`, `no-ar` e `encerrada`. Eles organizam o plano local. `pronta` não autoriza gasto. `no-ar` não prova veiculação: o próprio código avisa que é apenas anotação e pede conferência no Gerenciador de Anúncios.

| Rótulo local | Uso operacional | Recibo exigido |
|---|---|---|
| `rascunho` | Hipótese em edição; gasto, campanha e veiculação ficam desligados. | ID, objetivo, público, peças/SHA1, destino, orçamento, período e pendências. |
| `pronta` | Checklist local completo e peças aceitas. Ainda aguarda a autorização explícita de gasto e não chama a Meta. | Evidência de cada porta, aceite exato do autor, limite semanal, orçamento total e autorização pendente ou recebida. |
| `no-ar` | Marcar só depois de confirmar a veiculação no Gerenciador de Anúncios. O painel não inicia nem confirma essa ação. | Confirmação externa, ID da campanha, início, gasto observado, destino e link ou captura de evidência. |
| `encerrada` | Usar depois de confirmar que a campanha parou. | Hora de encerramento, gasto total, resultado, evidência da pausa e decisão de continuidade. |

O código atual grava status e `atualizadoEm`, sem histórico imutável de transições nem confirmação autoral. Até essa trilha existir, preservar cada autorização e confirmação em recibo datado separado. Nunca promover `pronta` ou `no-ar` só porque o campo foi salvo.

As quatro portas do rascunho pago permanecem fechadas ou sem medição: build nova publicada e testada; taxa de visita para clique em plano acima de 5%; ao menos uma compra orgânica real; Pixel e `InitiateCheckout` medidos. Também estão pendentes consentimento do Pixel, eventos `InitiateCheckout` e `Purchase` com valor do webhook Cakto, e UTM por peça. Esses números de referência ainda não foram medidos no Grana.

Os planos atuais são hipóteses: R$ 7/dia por sete dias (R$ 49) e R$ 14/dia por sete dias (R$ 98), em fases separadas; a soma proposta é R$ 147 e nenhum valor foi autorizado. O limite do autor é R$ 100 por semana. Uma campanha acima disso exige nova decisão explícita, mas ficar abaixo do teto também não equivale a autorização. Antes de qualquer gasto, apresentar objetivo, público, destino, peça e SHA1 aceitos, período, valor diário, total, limite semanal, métricas e condições de parada. Registrar a decisão exata do autor e a data.

Não impulsionar sem UTM, não criar campanha de instalação do APK e sempre usar a landing como destino. Não abrir outra conta para contornar bloqueio da Meta. Reprovação, checkout quebrado, promessa não comprovada ou saldo pré-pago zerado interrompem a campanha e pedem decisão do autor antes de retomar.

## Quando pedir decisão editorial

Pedir ao autor somente quando houver uma escolha concreta pronta para revisão. O pedido deve mostrar o que muda e o recibo que ficará registrado:

- para calendário: manifesto e versão, IDs dos itens, versão exata de cada peça, datas absolutas ou posições relativas, hora, canal, avisos e pendências;
- para declarar D: resultado de todos os portões, data solicitada e confirmação literal `DECLARAR DIA D`;
- para gasto: objetivo, público, destino, peça/SHA1, período, orçamento diário, total e limite semanal;
- para publicação real: todos os bloqueios técnicos resolvidos, janela, conta/destino e ação exata pedida.

Sem resposta explícita, manter o item em espera. Aceite de conteúdo, aceite de copy, parecer de revisor, autorização de custo, data no calendário e autorização de publicar são decisões separadas.

## Regras de copy e criativo

Seguir `AGENTS.md` e `DOCUMENTO-DE-MARKETING.md`: promessas compatíveis com a matriz de plataforma e a versão pública; preço só pela formulação permitida; sem conexão bancária, Open Finance, escassez inventada ou prova social sem fonte. Escrever sem travessão e preferir frases afirmativas, sem oposição artificial. Parecer de Flare é revisão editorial; não substitui aceite do autor.
