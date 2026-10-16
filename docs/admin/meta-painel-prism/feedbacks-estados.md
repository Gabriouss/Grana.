# Especificação visual: gestão de feedbacks

**Estado:** proposta visual para a Entrega 3.

**Superfície:** /admin web, após autenticação administrativa.

**Base de produto:** critérios M7 3.1 a 3.7; leitura existente em components/admin/FeedbacksAdmin.web.tsx.

**Contrato consultado:** migration 20261016020000_feedback_gestao.sql e supabase/functions/_shared/admin-feedbacks.ts.

**Protótipo:** [feedbacks-estados.html](./feedbacks-estados.html). Mensagens e identificadores das capturas são fictícios.

## Objetivo e limite

Permitir que o administrador triage feedbacks sem modificar o texto original, seu consentimento de uso público ou os dados preservados pela exclusão de conta. Os metadados da triagem ficam separados em feedback_gestao e no histórico administrativo.

A tela mantém uma lista filtrável e um painel de detalhe. O fluxo de correção pode apontar para uma solicitação existente e abrir a prévia/comparação exata. A decisão do autor sobre a versão fica separada da publicação. O feedback original é conteúdo não confiável e pode conter dado pessoal; a tela só aparece atrás do portão administrativo existente.

## Estrutura visual

- Cabeçalho do /admin, trilha “Marketing / Feedbacks” e título “Gestão de feedbacks”.
- Aviso de demonstração persistente na prancha.
- Filtros combináveis para andamento de gestão, tipo, nota, versão do app, plataforma, consentimento de uso público e data.
- Contagem por estado em rótulos textuais, sem depender de cor.
- Desktop: fila à esquerda, detalhe selecionado à direita.
- 768 px: duas colunas compactas, com lista e detalhe em sequência de foco previsível.
- 390 px e 320 px: uma vista por vez. Selecionar um feedback abre o detalhe; “Voltar à lista” devolve o foco ao item selecionado. Os controles de prévia no HTML alternam a composição.
- Detalhe: mensagem original somente leitura, tipo, nota, versão, plataforma, data e consentimento explícito.
- Gestão: andamento, prioridade, responsável e até oito etiquetas.
- Resolução: versão e evidência associadas à conclusão, com instrução para não colar dado pessoal. A evidência é obrigatória ao marcar Resolvido.
- Correção de criativo: solicitação associada, versão anterior/atual, prévia e comparação. “Pedir outro ajuste” preserva a cadeia. “Aceitar esta versão” refere-se somente à versão exibida; não autoriza publicação.
- Separar “No código” de “No app instalado”. O estado Resolvido, sozinho, não prova disponibilidade na build instalada.
- Feedback novo pode gerar aviso operacional sem texto de usuário; importação de feedback antigo não gera e-mail retroativo. Nenhuma notificação externa é enviada por esta prancha.

## Estados de gestão

| Valor persistido | Rótulo da interface |
|---|---|
| novo | Novo |
| em_analise | Em análise |
| planejado | Planejado |
| em_execucao | Em execução |
| resolvido | Resolvido |
| arquivado | Arquivado |

O andamento de gestão é independente do status original do feedback no app. A tela deve nomear ambos quando os dois forem exibidos. A triagem nunca modifica consentimento de uso público; essa permissão aparece como dado separado e explícito.

## Interações e segurança

- Filtrar atualiza a contagem e a lista sem apagar os filtros aplicados; Limpar restaura a consulta inicial.
- Selecionar item atualiza o detalhe. Em 320/390, abrir o detalhe é uma mudança de vista com botão de retorno.
- Salvar alterações mostra estado carregando e recibo de sucesso/erro. Uma falha não some com a mensagem original nem aparenta salvamento.
- Resolver exige evidência e versão de resolução; validação aparece junto dos campos.
- Arquivar é ação secundária e pede confirmação antes da gravação.
- Sem identidade, e-mail, telefone, screenshot ou user_id na lista. Não copiar mensagem para console, notificação, e-mail ou histórico de auditoria.
- Etiquetas, responsável, observação e evidência são campos administrativos. Não inserir conteúdo pessoal nelas.
- Teclado, foco visível, rótulos persistentes, alvos de 44 × 44 px e mensagens anunciadas por uma região de status contextual. Respeitar prefers-reduced-motion.

## Lacunas do contrato atual para Anvil e Harbor

A tela de leitura existente filtra status legado, tipo, nota, versão e datas. O pedido de listagem em admin-feedbacks.ts não inclui plataforma, public_use_consent nem estado de gestão. Os critérios M7 3.1 e 3.2 requerem esses filtros e mudanças de estado. O endpoint precisa aceitar filtros de gestão, plataforma e consentimento no servidor antes que a UI anuncie que combinou esses filtros. Filtrar só a página carregada, de até 50 linhas, daria resultados incompletos.

A migration e o DTO atuais suportam estado, prioridade, responsável, etiquetas, evidência e versão da resolução. Os critérios M7 também nomeiam observação e tarefa vinculada, mas esses campos não estão no contrato lido. O protótipo mantém esse espaço desativado e identificado como pendente. Não salvar observação dentro de evidência, etiqueta ou responsável. Harbor/Anvil precisam confirmar o vínculo à fila de pedidos existente e a política de retenção antes de ativar o campo.

O critério de disponibilidade exige distinguir correção pronta no código de correção disponível no app instalado. O DTO de gestão só carrega versaoResolucao; a tela não deve inferir publicação a partir de Resolvido. É necessária uma fonte explícita para disponibilidade no app, versão publicada e evidência do código antes de mostrar os dois estados como fatos.

A prancha inclui uma correção de criativo fictícia para mostrar a revisão, comparação e aceite de uma versão exata. A implementação deve reutilizar a cadeia de pedidos e versões existente. Peça, versão, commit, prévia e comparação precisam ser conferidos no servidor. Repetição de conclusão não duplica notificação nem aceite. Aceite não faz publicação nem muda orçamento.

## Responsividade e estados de borda

- 1440 px: filtros em uma faixa, lista/detalhe em grade e conteúdo limitado a 1120 px.
- 768 px: três colunas de filtros; lista/detalhe em duas colunas.
- 390 px e 320 px: filtros empilhados, sem overflow horizontal, lista e detalhe em vistas separadas.
- Carregando: preservar dimensões de lista/detalhe com skeleton e aria-busy.
- Vazio sem filtro: orientar que ainda não chegaram feedbacks.
- Vazio com filtro: informar que nenhum item corresponde aos filtros e oferecer Limpar.
- Erro ao listar/editar: recibo seguro, referência e tentar novamente. Não transformar falha permanente em fila vazia.
- Lista paginada: nova página não duplica itens; foco vai ao primeiro item novo quando ação é feita pelo teclado.
- Resolvido sem evidência/versão: manter gravação bloqueada e explicar como corrigir.
- Correção atualizada após revisão: invalidar aceite anterior e exigir decisão sobre a nova versão.

## Limites desta entrega

Este protótipo é estático e não grava metadados, consulta feedbacks nem envia mensagens. O usuário demonstrativo, as datas, as versões e o commit são fictícios. A migration e a Edge Function continuam dependentes da aprovação/aplicação posterior. Nenhum dado real foi acessado ou incluído nas capturas.
