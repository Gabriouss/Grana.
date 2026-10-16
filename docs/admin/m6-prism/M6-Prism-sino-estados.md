# M6 — Sino global e estados de publicação

Prism · 15/10/2026 · especificação para revisão. Nenhuma alteração no produto.

Pranchas: `M6-Prism-pranchas.html` e capturas em `M6-Prism-pranchas/`.
Os dados são ilustrativos; não há conta real, chamadas ou persistência.

## Intenção e encaixe no painel

Gabriel administra o Grana. e precisa perceber o que pede ação, abrir o contexto certo e distinguir plano de publicação comprovada. A apresentação conserva o modo Operar: chapado, água escura, menta rara, texto claro e sem negrito sintético. O foco é a ocorrência e seu próximo passo.

Vocabulário do domínio: peça, versão, aceite, destino, horário, recibo e reconciliação.

Paleta existente: água `#052229`, superfície `#0b2d35`, tinta `#effffa`, apoio `#a6d9ce`, menta `#aeffe3`, âmbar `#d3b869`, coral `#e08a7d` e sucesso `#74e291`.

Cada publicação apresenta a versão autorizada e um recibo separado por destino. A notificação leva à peça, à versão e à ocorrência exatas. O popover pequeno comprimiria os textos e as ações; uma página separada perderia o contexto ao consultar o sino. A proposta usa um painel lateral modal e, em telas estreitas, uma tela inteira. Não acrescenta indicadores financeiros, cartões decorativos ou outra família tipográfica.

## Fontes conferidas

- `tools/admin-local/web/estilo.css`: tokens, navegação, cabeçalho, selos, botões e diálogo.
- `tools/admin-local/web/index.html`: barra móvel, navegação e conteúdo global.
- `tools/admin-local/web/app.js`: rotas e contexto de calendário, aprovações e fila.
- `tools/admin-local/web/telas/calendario.js`: estado do cronograma, recibos e próximo passo.
- `E:/Grana-temporarios/2026-10-15-tarde/plano-proxima-rodada-compass.md`: estados, sino, retenção e retomada.
- Nota M2 de 15/10, “Plano de marketing e gestão no painel administrativo”: publicação, feedbacks e sino global. “Marcar todas como lidas” é requisito explícito.

Os contratos de M3 precisam ser conferidos antes de ligar dados reais. Os nomes de campos e regras visuais desta especificação são uma proposta de integração, não endpoints existentes.

## 1. Sino global

O sino fica disponível em todas as telas após autenticação. Usar ícone vetorial de traço entre 1,5 e 2 px, com 20 px, dentro de um botão de 44 × 44 px. Não usar emoji.

No desktop, uma faixa global de utilidades de 44 px fica no topo de `.conteudo`, com o sino à direita e 16 px até o cabeçalho da tela. A faixa pertence à casca, fora dos módulos de rota, sem repetir título ou ações específicas. Reservar espaço real; não sobrepor botão existente.

Até 899 px, reutilizar a barra móvel existente: Menu à esquerda, logotipo oficial ao centro e sino à direita. A barra tem pelo menos 60 px de altura; textos ampliados podem aumentá-la sem cortar controles.

O contador mostra notificações não lidas do administrador, incluindo grupos recolhidos, sem contar ocorrências como se fossem grupos. De 1 a 99, exibe o numeral; acima, `99+`; zero não exibe selo. O nome acessível conserva o total completo, por exemplo, “Notificações, 127 não lidas”. O número não cobre o desenho do sino nem sai da área de 44 × 44 px do controle.

Falha de atualização não vira zero. Conservar o último número conhecido e mostrar “Dados de 18:20” no painel aberto. Sem número conhecido, mostrar sinal de indisponibilidade e o nome “Notificações indisponíveis”. Abrir o sino ou uma ocorrência não marca leitura automaticamente; há ação explícita em cada item.

## 2. Central de notificações

Em 641 px ou mais, abrir um painel modal ancorado à borda direita, com 416 px de largura e altura disponível da janela. Até 640 px, ocupar toda a largura e altura dinâmica disponível, sem raio na moldura externa. Cabeçalho e rodapé ficam fora do conteúdo rolável; só a área central da lista e dos filtros rola. Respeitar a safe area no rodapé.

Hierarquia:

1. Cabeçalho: “Notificações” em 20/24 px, total de não lidas em 14/18,9 px e botão Fechar de 44 × 44 px.
2. Abas “Não lidas” e “Todas”; a aba ativa tem texto e traço, além da cor. As quantidades devem acompanhar as duas abas.
3. Filtros por fonte e importância, sem carrossel de chips. Fontes: “Todas as fontes”, “Publicações”, “Criativos”, “Feedbacks”, “Sistema” e “Novidades”. Importância: “Todas”, “Precisa agir” e “Informação”. São agrupamentos visuais, não estados de publicação.
4. Ação “Marcar todas como lidas”, com ajuda explícita de que inclui notificações de todos os filtros. Opera sobre as existentes no instante da ação; as que chegarem depois continuam não lidas. Não exige confirmação. Em caso de falha, preservar contador e lista e oferecer nova tentativa. A ação mostra a quantidade (“Marcar 3 como lidas”) e, ao concluir, oferece “Desfazer” por alguns segundos.
5. Lista agrupada por “Hoje” e “Anteriores”. Cada ocorrência apresenta importância com ícone e texto, título, resumo seguro, fonte, horário, ação específica e “Marcar como lida”. O texto tem largura flexível, `min-width: 0` e quebra natural.
6. Rodapé com Preferências e data da última atualização.

Em até 640 px, o cabeçalho precisa ficar acima da barra móvel e o painel ocupa a tela inteira. No primeiro acesso, manter o primeiro item útil visível sem rolagem; os filtros ficam recolhidos em “Filtros”, com quantidade de filtros ativos. “Marcar todas” fica no rodapé ou no menu da lista para deixar a ocorrência prioritária aparecer primeiro.

Cada item usa padding de 16 px; 8 px entre título e resumo e entre resumo e metadados; 12 px antes das ações; e 20–28 px entre ocorrências, com o traço existente. Título: 16/21,6 px regular. Resumo: 15/22,5 px light. Metadados e selos: pelo menos 15 px, acompanhando a escala do painel. Evitar metadados de 12 px para informação necessária à decisão.

Títulos e resumos não usam elipse; podem quebrar linha. Caminhos, identificadores extensos e URLs quebram dentro do item e ficam nos detalhes técnicos, sem empurrar botões.

Leitura e resolução são independentes: marcar como lida não resolve falha, não aceita criativo, não publica, não cancela e não encerra feedback. Incidente resolvido pode continuar não lido, com o estado “Resolvida”. Agrupar repetições do mesmo incidente por chave estável, preservando horários e eventos no detalhe. Não agrupar publicações de versões ou destinos diferentes em uma única ação. O contador total continua contando notificações não lidas.

“Criativo pronto para sua revisão” abre o pedido original, alterações, prévia e comparação da versão específica; a conclusão depende de peça, versão e commit validados pelo servidor. O aceite permanece explícito. “Novo feedback” abre a caixa administrativa sem reproduzir mensagem, nome, e-mail, dado financeiro ou consentimento de quem escreveu o relato no sino.

Falhas importantes podem receber e-mail pela Resend, sujeito às preferências e aos controles de volume do plano. Não acrescentar push do navegador. A central persiste ocorrências por 90 dias; feedbacks e recibos mantêm suas políticas próprias.

Preferências abrem um diálogo próprio e conservam o retorno do foco. Oferecem lista por tipo, recebimento no painel e e-mail somente para falhas importantes. Mostrar estado salvo, salvando e falha. Desligar e-mail não apaga a ocorrência do painel nem resolve o incidente.

Estados da central:

- **Carregando:** “Carregando notificações…”; não mostrar contador zero provisório.
- **Vazia:** “Você está em dia.” / “Nenhuma notificação não lida.” Filtros e aba Todas continuam disponíveis.
- **Filtro vazio:** “Nenhuma notificação com estes filtros.” e “Limpar filtros”.
- **Erro sem cache:** “Não foi possível carregar as notificações.” e “Tentar de novo”.
- **Cache desatualizado:** conservar a lista e mostrar “Sem atualização desde 18:20”. Fonte local mostra “Última verificação local: 18:20”; fonte remota mostra o próprio horário, sem alegar que a M1 desligada consultou um serviço local.
- **Item removido ou sem acesso:** abrir recibo seguro ou mostrar “Este item não está mais disponível”; não redirecionar silenciosamente para a página inicial.

## 3. Estados de publicação

O estado pertence ao envio por destino. Um item pode ter Facebook Publicado e Instagram Precisa conferir. O resumo agregado diz “1 de 2 destinos publicado; 1 precisa conferir”, sem selo global Publicado para execução parcial.

Os selos reutilizam a anatomia de `.selo`: texto por extenso, símbolo distinto e cor semântica. Altura mínima de 26 px, padding horizontal de 8 px e fonte mínima de 15 px nesta superfície. Podem crescer para duas linhas, especialmente “Cancelamento pendente” e “Programado no painel”; nunca cortar os nomes. Alvos clicáveis continuam com 44 px.

Mapeamento visual proposto: Planejado usa `.selo-ausente` (tracejado); Programado no painel, Preparando e Cancelado usam a nova regra completa `.selo-neutro`, com ícones próprios; Agendado na Meta usa `.selo-menta` (nova); Publicado usa `.selo-ok`; Cancelamento pendente e Precisa conferir usam `.selo-alerta` com relógio e interrogação distintos; Falhou usa `.selo-erro`. Hoje `estilo.css` define apenas `.selo-neutro::before`, sem texto/borda próprios; a classe completa precisa ser acrescentada. Não existe `.selo-menta`.

| Estado | Significado e evidência necessária | Apresentação e próximo passo |
|---|---|---|
| Planejado | Intenção e data no calendário; ainda sem autorização de execução desta combinação. | Neutro, tinta fraca e calendário. “Conferir e programar” abre prévia e confirmação. |
| Programado no painel | Autorização da versão, destino e horário, com execução remota persistida. Não comprova agendamento nativo. | Tinta suave e relógio. “Ver programação”; reagendamento exige confirmação. |
| Agendado na Meta | ID remoto e consulta que confirma destino e horário. | Menta e relógio confirmado. Mostrar plataforma, horário e última consulta; “Ver comprovante”. |
| Preparando | Mídia ou envio em preparação persistida; ainda sem confirmação de publicação. | Tinta suave e progresso; informar etapa e última atualização. “Ver andamento”. Animação não é a única indicação. |
| Publicado | Publicação confirmada no destino com ID/recibo e horário; URL quando houver. | Sucesso e marca de confirmação. “Abrir publicação” e “Ver comprovante”. Não oferecer repetição para este destino. |
| Cancelamento pendente | Cancelamento solicitado, ainda sem confirmação remota. | Âmbar e relógio. “Conferir cancelamento”. Avisar que o agendamento ainda pode executar; não chamar de Cancelado. |
| Cancelado | Cancelamento confirmado ou impedimento confirmado antes de qualquer envio remoto. Preservar recibo. | Neutro e cancelamento. “Ver comprovante”; nova programação exige nova confirmação. |
| Falhou | Falha definitiva conhecida daquela tentativa, com causa tratada. | Coral e alerta. “Ver falha”; nova tentativa só após validar versão, autorização, prazo e reconciliação necessária. |
| Precisa conferir | Resultado desconhecido, resposta ambígua ou evidência insuficiente. Timeout isolado pertence aqui, sem concluir falha. | Âmbar e interrogação/alerta. “Conferir resultado”. Repetir envio fica bloqueado até reconciliar. |

Estado não reconhecido ou ausente: “Estado indisponível” e “Conferir atualização”, sem transformar em Planejado, Cancelado ou Publicado. Código bruto só nos detalhes técnicos.

Pausa global ou por rede é política separada, mostrada na faixa “Publicações pausadas” e por destino. Não converter todos os estados em Cancelado. A faixa distingue cancelamentos confirmados, pendentes e recusados.

Mudança de versão remove a elegibilidade da autorização antiga e solicita cancelamento dos agendamentos afetados. Mostrar “Versão mudou; confira a prévia novamente” junto do estado remoto real. Atraso maior que 15 minutos exige confirmação de novo horário; não executar imediatamente.

Nos fluxos existentes de calendário e cronograma, preservar Planejamento local, Ensaio e comprovantes antigos. Não renomear ensaio para Programado no painel ou Agendado na Meta por inferência.

## 4. Calendário e detalhe

O calendário mostra título da peça, data/hora com fuso e estado por destino. Em células pequenas, usar contagem e rótulo “2 destinos”; o detalhe revela cada estado completo. Não comprimir nove cores em uma legenda sem texto.

No detalhe, ordenar: título e versão; data/hora; aviso que pede ação; destinos; recibos; histórico. Cada destino apresenta nome, selo, última consulta, próximo passo e ação própria. A autorização mostra a versão exata de vídeo/arte, capa, legenda e ordem do carrossel em detalhes expansíveis.

“Conferir resultado” tem prioridade quando existe destino desconhecido. Reagendar e cancelar atuam no destino correto. Não criar “Tentar tudo novamente” para execuções parciais.

Links externos só aparecem com URL de publicação válida do servidor; recibo sem URL continua consultável dentro do painel. Nenhuma credencial, token ou chave é renderizada.

## 5. Quatro larguras

| Viewport CSS | Casca e sino | Notificações | Publicação |
|---|---|---|---|
| 320 px | Menu 44 px, marca oficial central, sino 44 px; recuos 16 px. | Tela inteira, conteúdo útil de 288 px; cabeçalho, Fechar e rodapé preservados; controles de filtro recolhidos; primeiro item útil à vista. | Conteúdo útil de 288 px; destinos e ações em coluna; selos quebram linha dentro da largura; sem rolagem horizontal. |
| 390 px | Mesma barra móvel, recuos de 16 px. | Tela inteira, conteúdo útil de 358 px; linha de metadados pode quebrar; filtros abrem sob demanda. | Conteúdo útil de 358 px em uma coluna; horário e fuso completos; ação principal usa a largura disponível. |
| 768 px | Navegação recolhida e barra móvel existente. | Painel lateral de 416 px com fundo escurecido; texto útil de 384 px. | Uma coluna para destinos detalhados; recibos perto do destino; ações compartilham linha quando couberem. |
| 1440 px | Lateral de 248 px existente; sino na faixa global do conteúdo. | Painel direito de 416 px; não empurra nem redimensiona a tela por trás. | Área restante de 1192 px antes dos recuos; detalhe limitado a 960 px; destinos em duas colunas de mesma altura quando o conteúdo permitir. |

A prancha adicional `M6-Prism-pranchas/estados-390.png` registra carregamento, vazio, filtro vazio, erro sem cache, cache desatualizado, item indisponível, Preparando, Preferências e o aviso temporário de desfazer.

## 6. Teclado e acessibilidade

O painel é um diálogo modal nomeado “Notificações”, com `role="dialog"`, `aria-modal="true"` e título associado; o fundo fica inerte. O foco inicial vai ao título focável, Tab permanece no diálogo, e Esc e Fechar retornam ao sino. Abrir a ação de um item fecha a central e move o foco para o título do destino; diálogos secundários devolvem o foco ao controle que os abriu.

Abas têm seleção programática e navegação por setas; filtros têm rótulos visíveis. Fechar tem nome próprio e o ícone fica fora da leitura. Alvos têm 44 px; foco de 2 px em `--accent-2`, com deslocamento de 2 px.

Mudança do contador usa anúncio educado e resumido; não reler toda a lista a cada atualização. Falha da ação é anunciada junto do controle e continua visível. Estado sempre usa texto, sem depender da cor.

Zoom de 200%, fonte ampliada, teclado virtual e barra dinâmica podem aumentar a altura; cabeçalho e rodapé não devem cobrir conteúdo focado. Movimento reduzido desliga entradas/progresso animados; o texto Preparando permanece.

Pranchas estáticas não comprovam leitor de tela, foco, contraste calculado ou comportamento de rede. O aceite 9 exige teste real de teclado, Esc, retorno do foco e leitor de tela.

## 7. Aceite para implementação

1. Capturas reais nas quatro larguras mostram sino global, lista, filtros, nomes completos e ações sem corte ou rolagem horizontal.
2. Abrir/fechar sino e navegar em ocorrência não altera leituras; marcar uma altera só ela; marcar todas preserva eventos que chegaram depois do instante da ação.
3. Erro ao marcar leitura não zera contador; falha de rede distingue cache antigo de lista vazia.
4. Facebook publicado + Instagram desconhecido mostra dois resultados e bloqueia repetir o Facebook.
5. Agendado na Meta exige evidência remota; ensaio/local e intenção nunca recebem esse estado.
6. Cancelamento pendente continua visível até confirmação; pausa mantém recibos e estados verdadeiros.
7. Um título extenso e “Cancelamento pendente” cabem em 320 px e zoom de 200%.
8. Feedback não aparece com conteúdo pessoal no sino; criativo abre a revisão exata e pede novo aceite.
9. Testar teclado, Esc, retorno do foco e leitor de tela; controle focado não fica sob barra fixa ou teclado.
10. Fonte local não recebe verificação nova com M1 desligada; incidentes remotos continuam registrados pelo servidor.

## D2 — fechamento por etapas

- **R1–R3 (bloqueadores):** [concluído] texto e ícones reconstruídos em UTF-8; cabeçalho e Fechar visíveis sobre a barra móvel; oito capturas refeitas como viewports reais, incluindo 320 × 640.
- **Importantes:** R3b–R7 — [concluído] recolher controles antes do primeiro item, diferenciar os estados, manter o contador dentro do botão, incluir ação de desfazer e respeitar a escala mínima de texto.
- **Menores:** R8–R13 — [concluído] quantidades nas abas, alvo e foco, grade aprovada, token de aviso, estados alternativos e limite da evidência estática documentados.

## Registro para o documentador

1. **Pedido:** corrigir a especificação M6 segundo `revisao-Lumen-M6.md`, começando por R1, R2 e R3; depois os cinco pontos importantes e os seis menores.
2. **Sintoma e causa:** os caracteres especiais foram substituídos por `?` literal nos arquivos; o cabeçalho móvel ficou atrás da barra; a captura de 320 px mostrou o restante da página sob um painel que deveria ocupar a tela. O revisor atribuiu a perda de caracteres à gravação em codificação não UTF-8.
3. **Arquivos:** esta especificação, `M6-Prism-pranchas.html` e as capturas associadas. As mesmas fontes ficam em `E:/Grana-temporarios/2026-10-15-tarde/` para continuidade da rodada.
4. **Descartado:** popover pequeno, nova tipografia/paleta, um sucesso global para múltiplos destinos e implementação nesta etapa.
5. **Problemas no caminho:** os acentos e símbolos não podem ser recuperados da sequência de `?`; o conteúdo foi reconstruído a partir da revisão e da própria especificação restante, sem mexer no produto.
6. **Verificação:** conferir texto UTF-8 e renderizar as oito capturas; não há teste de produto, leitor de tela, navegador móvel real, integração, produção, build, deploy ou geração paga nesta etapa.
