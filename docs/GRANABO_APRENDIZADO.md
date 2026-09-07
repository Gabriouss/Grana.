# Aprendizado operacional do Granabô

O servidor aprende por usuário usando a tabela existente `assistant_memory` e
o cliente autenticado (RLS). Não usa service role, não modifica o modelo e não
executa código gerado pelo modelo.

## Fluxo

1. Recupera preferências, fatos, apelidos e exemplos verificados. Exemplos antigos
   sem versão/validação deixam de ser usados; não são apagados em massa.
2. Recupera o plano da última consulta (ferramentas e filtros), vinculado à última
   resposta recebida no histórico. O contexto expira após 30 minutos e não é usado
   se outra conversa/dispositivo tiver uma resposta diferente.
3. O modelo interpreta continuidades e mudanças de assunto usando esse plano e
   o histórico. Pode aprender preferências/apelidos e consultar na mesma rodada.
4. Até três rodadas de ferramentas e uma redação final permitem recuperar nomes
   ou argumentos inválidos. JSON e argumentos são validados contra o catálogo.
   Chamadas idênticas não são reexecutadas. Há até oito ferramentas por rodada.
5. Valores escritos como `R$` são conferidos contra consultas bem-sucedidas. Se a
   redação falhar, uma consulta completa pode ser devolvida com redação simples.
   Mensagens internas de metaferramentas não são usadas como fallback.
6. Exemplos guardam apenas ferramentas e argumentos: `execucao_verificada`
   indica execução e consistência dos valores, não certeza sobre a intenção.
   Uma confirmação explícita promove para `confirmado_usuario`. Rejeições
   explícitas retiram o exemplo vinculado à resposta anterior antes da próxima
   interpretação. Correções de preferências reutilizam a chave existente.

O limite compartilhado das chamadas ao modelo é 27 segundos, com no máximo
10 segundos por tentativa de provedor. Consultas ao banco, autenticação e
persistência ainda acrescentam latência; isso não é garantia de duração total.

## Validação

`npm run test:assistente-aprendizado` executa políticas e handler real com banco
e modelo simulados. Cobre recuperação, consulta após aprendizado, argumentos
inválidos, valores inventados, falha de redação, loops, confirmação/rejeição,
isolamento por usuário e falha de gravação. Não mede a qualidade do modelo real.

`deno check supabase/functions/assistente-financeiro/index.ts` verifica o backend;
`tsc --noEmit` verifica o app, que exclui Edge Functions do seu tsconfig.

## Limites e acompanhamento

- A interpretação e as correções de preferência continuam dependendo do modelo.
  Ter o mesmo valor de uma ferramenta não prova categoria/período corretos.
- Verificação monetária cobre a notação R$; não é uma auditoria de toda afirmação
  numérica ou cálculo verbal produzido pelo modelo.
- Feedback automático tem reconhecimento conservador de frases explícitas.
  Silêncio, "obrigado" e mera continuação não confirmam uma resposta.
- A memória temporária contém pergunta/resposta para vincular o contexto; os
  valores dessa resposta nunca são injetados como fonte financeira. Expiração é
  lógica, sem exclusão automática dessa linha; nova consulta a sobrescreve.
- A tabela comporta um plano recente por usuário. Conversas concorrentes não
  compartilham esse plano se o vínculo falhar; o histórico continua disponível.
- Não há reescrita autônoma do código nem monitor periódico. Falhas continuam
  registradas no histórico/logs; novas correções precisam passar pelos testes.

Para avaliar em produção, usar conversas encadeadas sobre cartões, categorias
customizadas, troca de meio de pagamento e mudanças de assunto. Conferir os
filtros/resultados no banco, não apenas a fluência da frase do assistente.

## Publicação de 06/09/2026

Função publicada. A sonda real continuou de Alimentação (R$ 130,00) para
"E em Outros?" (R$ 50,00), preservando setembro/2026. A conta tem zero cartões,
confirmado por consulta direta: C6 foi informado como ausente. Não é validação
do cálculo de faturas com C6 cadastrado. Tempos observados: 12,4 a 18,9 segundos.

A sonda também motivou uma proteção adicional: ferramentas de recuperação
herdam filtros de cartão/categoria/carteira e são recusadas se não suportarem
esses filtros. Ausência de cadastro não permite apresentar um total mais amplo.
