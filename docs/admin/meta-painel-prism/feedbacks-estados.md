# Contrato visual: gestão de feedbacks (E3)

**Destino:** painel local tools/admin-local. Handoff visual para Forge; Harbor mantém backend e DTO.

**Estado:** a tela integrada já existe em tools/admin-local/web/telas/feedbacks.js. Esta revisão alinha o contrato ao código local e aos campos aceitos pelo servidor. M7 permanece parcial nas lacunas listadas abaixo.

**Prancha:** [feedbacks-estados.html](./feedbacks-estados.html). Conteúdo fictício, sem gravação.

## Encaixe no painel local

- Rota existente: #/marketing/feedbacks; item Feedbacks no grupo Marketing, depois de Aprovação. API local: GET /api/marketing/feedbacks e POST /api/marketing/feedbacks/gestao.
- Manter casca de index.html, roteador de app.js e padrões de estilo.css. Reutilizar tela-cabecalho, barra-filtros, campo, tabela-rolagem, tabela, selo, estado-ausente, estado-erro, botao e ctx.formulario. Não criar outra casca ou página web /admin.
- A tela é uma tabela e um modal comum de gestão. Não existe painel de detalhe nem mudança de vista móvel.
- Reutilizar tokens existentes: --paper, --paper-raised, --paper-selected, --ink, --ink-soft, --ink-faint, --rule, --rule-strong, --up, --atencao, --danger, --t-*, --s-*, --r-* e --alvo. Tipografia do painel usa Neue Machina 300/400; não sintetizar negrito.
- Em 320/390 px, tabela rola dentro de região nomeada e focável. Preservar caption e Gerir junto da mensagem na primeira coluna para manter a ação acessível.
- O navegador fala apenas com o servidor Node local. Indisponibilidade da gestão mantém leitura somente; falha de leitura não vira lista vazia.

## Dados e fluxo

- Lista paginada do mais recente para o mais antigo. Contagem e filtro de andamento descrevem somente os itens carregados.
- Filtros existentes: tipo e nota consultam o servidor; andamento da gestão filtra o lote carregado. Não anunciar filtro global por andamento.
- Colunas: mensagem resumida (até 160 caracteres), tipo/nota, versão do app, status no app, uso público autorizado, andamento, prioridade, recebimento e ação.
- Modal existente aceita andamento, prioridade, responsável, etiquetas, versão da resolução e evidência. Enviar somente propriedades alteradas. Erro de validação preserva o que foi digitado.
- Resolvido exige versão da resolução e evidência no estado final gravado. Arquivar exige confirmação. Triagem não altera mensagem original, status no app ou consentimento.
- Estados de gestão: novo, em_analise, planejado, em_execucao, resolvido e arquivado. Diferenciar visualmente estado de gestão do status original no app.
- Mensagem é conteúdo não confiável: renderizar como texto; não copiar para log, aviso ou notificação. Não mostrar user_id, e-mail, telefone ou identificador de conta.

## Estados, acessibilidade e limites

Carregando indica leitura em andamento. Vazio inicial diz "Ainda não chegaram feedbacks"; vazio filtrado diz que não há correspondências. Erro explica que a leitura falhou e não significa ausência de registros, com nova tentativa. Gestão indisponível aparece como somente leitura. Falha ao salvar preserva valores digitados; sucesso e erro deixam recibo textual visível.

Usar foco visível, alvos de pelo menos --alvo (44 px), nome acessível para ações e regiões roláveis, e região role=status para recibos. Estado não depende só de cor.

O DTO atual não oferece filtro de plataforma, consentimento, versão ou data; observação interna; tarefa vinculada; histórico visível; nem prova de que uma correção está no app instalado. Não desenhar esses controles ou inferir disponibilidade a partir de Resolvido. Consentimento é somente leitura. M7 3.1-3.7 segue parcial nos itens que dependem desses dados. Não duplicar aceite de criativo dos fluxos Aprovação e Ajustes.

## Handoff e QA conhecido

- **Forge/UI:** preservar a tabela e o modal existentes; ajustar apenas ao contrato local e manter mensagens originais/consentimento imutáveis.
- **Harbor/backend:** validar o estado resultante, não somente o patch, para impedir Resolvido sem versão e evidência.
- **Teclado:** risco no modal de gestão. feedbacks.js desabilita o botão Gerir enquanto aguarda ctx.formulario. app.js tenta devolver o foco antes de esse botão ser reabilitado; o foco pode cair no body ao fechar. Confirmar no navegador e devolver foco a um controle utilizável.
- QA em 16/10: o atalho oficial terminou com exit 0, mas a superfície de browser continuou indisponível no CUA. Playwright headless em 320/390/768/1440 viu somente o shell “Painel não pareado” (raiz HTTP 200; /api/health 403), sem dados de feedback. O Escape e retorno do foco passaram no protótipo estático; modal e teclado integrados continuam sem validação. Leitor de tela não usado.
