# Marketing

Este diretório é a fonte única, versionada, para materiais de marketing que pertencem ao repositório. Cada artefato fica em uma semana e em um dos quatro estados. O índice semanal registra a origem e o estado editorial; aprovação, QA e publicação são campos distintos.

## Estrutura e regra de datas

Use o caminho:

    docs/marketing/AAAA-MM/semana-NN-AAAA-MM-DD-a-AAAA-MM-DD/{para-aprovacao,aprovados,historico,apoio}

A semana ISO começa na segunda-feira e termina no domingo. O mês-pai é o mês da quinta-feira dessa semana. Exemplo: 28/09/2026–04/10/2026 é a semana 40; como a quinta-feira cai em outubro, o destino é 2026-10/semana-40-2026-09-28-a-2026-10-04.

Escolha a semana pela data de publicação prevista quando houver uma data definida. Sem previsão, use a data de produção/criação. Para o acervo legado, datas do nome do artefato e primeira inclusão no Git serviram como evidência de criação quando não havia data interna; essa base está anotada no índice semanal. Não use o mtime do checkout como data de produção. Se a data não puder ser estabelecida, registre a dúvida no índice e resolva-a antes de classificar a semana.

## Estados

- **para-aprovacao**: peça criativa pendente de aceite explícito do autor. Parecer positivo de revisor, aprovação de copy, autorização de custo ou nome de arquivo como “final” não equivalem ao aceite do autor.
- **aprovados**: somente versões com aceite explícito do autor registrado. O índice deve apontar a data e a evidência exata do aceite, para aquela versão.
- **historico**: versões rejeitadas ou substituídas. Registre o motivo e, quando houver, o caminho da sucessora. Não sobrescreva artefatos históricos.
- **apoio**: briefings, pesquisa, relatórios, referências, ferramentas, manifests, evidências de QA, inventários e capturas-fonte. Esse material não recebe o estado editorial da peça.

Cada pasta semanal contém INDICE.md com peça/arquivo, fonte, status, responsável (ou “não registrado”), evidência de aceite do autor, QA e publicação. QA concluído não significa aceite; aceite não significa publicação.

## Apoio

As subpastas de apoio separam o tipo de material: briefings, pesquisas, relatorios, referencias, ferramentas, evidencias, capturas-fonte e inventarios. Preserve nomes e bytes de arquivos recebidos, salvo atualização pontual de referências internas quebradas pelo movimento. Cada artefato deve ter um único caminho canônico; não mantenha cópias paralelas.

## Índices semanais

- [Semana 36 · 2026-08-31 a 2026-09-06](2026-09/semana-36-2026-08-31-a-2026-09-06/INDICE.md)
- [Semana 37 · 2026-09-07 a 2026-09-13](2026-09/semana-37-2026-09-07-a-2026-09-13/INDICE.md)
- [Semana 38 · 2026-09-14 a 2026-09-20](2026-09/semana-38-2026-09-14-a-2026-09-20/INDICE.md)
- [Semana 39 · 2026-09-21 a 2026-09-27](2026-09/semana-39-2026-09-21-a-2026-09-27/INDICE.md)
- [Semana 40 · 2026-09-28 a 2026-10-04](2026-10/semana-40-2026-09-28-a-2026-10-04/INDICE.md)
- [Semana 41 · 2026-10-05 a 2026-10-11](2026-10/semana-41-2026-10-05-a-2026-10-11/INDICE.md)

## Regra para material futuro

1. Registre a data prevista de publicação; se não houver, a data de produção/criação e a evidência usada.
2. Calcule a semana ISO e o mês pela quinta-feira; preserve o nome original e coloque cada arquivo uma só vez.
3. Criativo sem aceite explícito do autor entra em para-aprovacao. Só mova a versão aceita para aprovados depois de registrar a evidência no índice. Rejeição ou substituição vai para historico, sem apagar versões anteriores.
4. Briefing, pesquisa, relatório, referência, ferramenta, evidência de QA e captura-fonte ficam em apoio, mesmo quando associados a uma peça aprovada.
5. Atualize o índice da semana e todos os links, manifests e scripts ativos no mesmo trabalho. Registre separadamente revisão, QA, aceite do autor e publicação.
6. Não atribua responsável pela autoria a partir do autor do commit ou do revisor; registre somente o responsável explicitamente indicado na fonte.

## Material ainda fora das pastas por semana

O acervo trazido pela M2 em 07 e 08/10/2026 (guia de produção, `arsenal/`, `identidade-sonora/`, `stories-estilo-referencias/`, `motion-desistiu/`, `r5-colar-pix/`, `material-video-2026-09-26/`, `reels-granabo/`, o roteiro do Reels do Granabô, `meta-configuracao-checklist.md` e três pastas novas de `funil-criativos-flat-2026-09/`) continua na raiz de docs/marketing. São ferramentas e guias sem semana própria, material com scripts de caminho relativo em produção na M2, ou peças sem data de produção nem aceite registrados. A classificação depende de decisão do autor; não mova por conta própria. `painel/` é ferramenta permanente e também fica na raiz.

Esta migração organiza os 136 arquivos que já estavam em docs/marketing. Materiais fora do repositório, inclusive os que estão em E:/Grana-temporarios, não fazem parte desta árvore nem foram movidos.

Os geradores que escrevem em docs/marketing usam scripts/destino-marketing.cjs para calcular a semana e o mês. Por padrão, o helper usa a data local de execução; defina GRANA_MARKETING_DATA=AAAA-MM-DD para uma data prevista de publicação ou para manter a mesma data-base entre etapas relacionadas. Os scripts devem continuar separando criativo, evidência, ferramenta e briefing nos destinos correspondentes.
