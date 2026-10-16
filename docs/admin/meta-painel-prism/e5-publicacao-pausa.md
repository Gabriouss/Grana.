# Contrato visual: publicação e pausa (E5)

**Destino:** painel local tools/admin-local. Handoff visual para Forge/UI; Harbor mantém motor, outbox, estados e recibos.

**Estado:** ponte Node e contrato Harbor estão presentes. A tela e item de menu ainda não estão registrados no app local. A operação permanece somente em SIMULAÇÃO.

**Prancha:** [e5-publicacao-pausa.html](./e5-publicacao-pausa.html). Conteúdo fictício; não é prévia de peça aprovada.

## Encaixe no painel local

- O servidor já declara GET e POST em /api/marketing/publicacoes-simulacao. O adaptador local chama Harbor com recurso publicacoes-simulacao e modo simulacao. Sem fonte/adaptador, o retorno é indisponível, não uma lista vazia.
- O app ainda não registra uma rota de tela. Rota sugerida: #/marketing/publicacoes; inserir “Publicação e pausa” no grupo Marketing depois de Calendário e antes de Tráfego pago. Consumir o adaptador existente; não alterar E4 nem arquivos de Harbor.
- Manter a casca de index.html, o roteador de app.js e o portão local senha + TOTP. O navegador não chama Supabase ou Meta e nunca recebe segredo.
- Reutilizar tela-cabecalho, secao, cartao, selo, estado-ausente, estado-erro, botao, botao-primario, botao-perigo, bloco-acao e tabela-rolagem de estilo.css. Usar --paper, --paper-raised, --paper-selected, --ink, --ink-soft, --ink-faint, --rule, --rule-strong, --atencao, --danger, --s-*, --r-* e --alvo.
- Aviso “SIMULAÇÃO · nenhuma publicação real” permanece visível mesmo se o status simulado for “Publicado” ou “Agendado na Meta”.

## Contrato Harbor consumido pela tela

Toda solicitação mantém recurso publicacoes-simulacao e modo simulacao. A UI envia somente ação e campos documentados; não envia adaptadores, URL, segredo ou cenário arbitrário.

- Listar usa acao listar; retorna até 50 registros, pausas e limitado=true quando houver mais. Não chamar resultado limitado de inventário completo.
- Prévia usa acao previa e alvo com pecaId, rede (facebook ou instagram), conta, formato (feed, reels ou stories), horario ISO UTC e estrategia (nativo-meta ou executor-remoto). A resposta inclui chave e manifesto aprovado com hashes e ordem.
- Confirmar usa acao confirmar, o mesmo alvo, chave da prévia e confirmado=true. Mudança de conteúdo, ordem, destino, formato, estratégia ou horário invalida a chave. A criação é idempotente e só confirma a simulação.
- Consultar usa acao consultar e chave. Executar, cancelar e reconciliar também exigem chave; cenários são fechados pelo backend Harbor.
- Pausar usa acao pausar e rede global, facebook ou instagram. Retomar usa acao retomar e confirmado=true. Pausa altera apenas controles simulados e não comprova cancelamento. Retomar não autoriza horário vencido nem resolve estado incerto.
- Toda resposta de negócio mantém modo simulacao. ID com prefixo sim- é marcador fictício, nunca recibo real.

O manifesto atual traz peça/versão, hashes, aceite e ordem; não traz legenda legível nem URL de mídia. Não há prévia visual de arte, vídeo ou legenda neste DTO. Exibir “Prévia indisponível no contrato atual” junto aos hashes/ordem recebidos. Não inventar conteúdo ou imagem. Não habilitar confirmação visual de uma combinação que a pessoa não pode verificar; Harbor precisa expor metadados sanitizados de prévia antes dessa promessa.

## Hierarquia, estados e interação

1. Cabeçalho com modo SIMULAÇÃO e estado de disponibilidade.
2. Controles de pausa global, Facebook e Instagram com estado textual.
3. Lista limitada com estado e horário por destino.
4. Detalhe da chave com manifesto, destino, formato, estratégia e horário exatos.
5. Recibos por destino, distintos de pausa e confirmação.

Estados por destino: Planejado, Programado no painel, Agendado na Meta, Preparando, Publicado, Cancelamento pendente, Cancelado, Falhou e Precisa conferir. Não condensar sucesso parcial num único status.

- “Agendado na Meta” só após retorno simulado com ID sim- e horário consultado, sempre rotulado como simulação.
- Resposta perdida, lease vencida ou reconciliação inconclusiva: Precisa conferir. Reconciliar primeiro; nunca oferecer retry cego.
- Destino concluído não é repetido quando outro destino falha.
- Cancelamento pendente não é Cancelado. Pausa não cancela agendamento existente.
- Atraso de até 15 minutos inclusive mantém o horário confirmado. Acima disso exige novo horário e confirmação.

Estados têm texto além de cor. Erro e recibo aparecem junto do destino e em role=status. Confirmação resume destino, conta, formato, estratégia e horário. Foco retorna ao disparador ou à linha operável após diálogo. Alvo mínimo --alvo; teclado e foco visível nos tamanhos 320/390/768/1440.

## Handoff

- **Forge/UI:** adicionar só o encaixe local, consumindo adaptador existente e mantendo aviso de simulação. Não prometer prévia que o DTO não fornece.
- **Harbor/backend:** preservar chaves, hashes, estados e recibos por destino. Definir DTO sanitizado para prévia visual se ela for requisito.
- QA em 16/10: a raiz do painel respondeu HTTP 200 com “Painel não pareado” e /api/health respondeu 403; sem browser pareado, a tela integrada E5 não foi validada. O protótipo estático foi conferido em 320/390/768/1440, sem overflow. A rota E5 continua ausente no app. Nenhuma chamada real à Meta foi autorizada ou executada; leitor de tela não usado.
