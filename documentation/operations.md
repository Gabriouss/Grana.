# Operação e diagnóstico

## Sinais que precisam ser acompanhados

| Sinal | Fonte | Ação |
| --- | --- | --- |
| Kiwify 401/5xx | logs de kiwify-webhook | conferir header, secret e RPC |
| assinatura vinculada não aparece | tabela subscriptions + tela paywall | confirmar e-mail/token e repetir vínculo |
| limite_indisponivel | logs de assistente-financeiro/processar-lancamento-voz | conferir migration/RPC de quota |
| erro_ia/erro_interno | logs das Edge Functions | verificar provedor, prazo e quota |
| tokens push inválidos | logs de enviar-lembretes-habito | remover token e testar nova build |
| APK não atualiza | app_release, URL estável e GitHub Release | conferir versão maior e asset grana.apk |

## Recibo mínimo

Toda falha que afeta dinheiro, acesso, voz ou push deve ter ao menos um destes
recibos: código HTTP estável, mensagem na tela/notificação, estado persistido
ou log estruturado. Logs não devem conter áudio, transcrição financeira,
tokens, secrets ou senha.

## Rotina de incidente

1. Identificar o código e o usuário afetado sem copiar dados financeiros.
2. Conferir logs da função e o estado correspondente no banco.
3. Desligar a flag comercial ou o recurso específico se houver risco de
   cobrança duplicada, escrita duplicada ou exposição de dados.
4. Corrigir e testar localmente.
5. Publicar migration antes de função quando houver dependência de schema.
6. Repetir uma transação descartável e registrar o resultado.

## Limite atual de observabilidade

O projeto usa logs nativos do Supabase e não depende de um serviço externo de
crash analytics. A abertura de um painel de alerta pago é uma evolução
operacional, não pode ser confundida com a ausência de recibos: os códigos e
logs acima são o contrato mínimo para o primeiro lançamento.

## Ambientes

Produção é o projeto Supabase apontado pelo `EXPO_PUBLIC_SUPABASE_URL` da
build publicada. Os perfis `preview` e `production` do `eas.json` geram APK,
mas ainda apontam para a mesma infraestrutura; `preview` é uma distribuição
interna, não um staging isolado.

Um staging de verdade precisa ser um segundo projeto Supabase, com URL e chave
pública próprias, dados fictícios e um perfil EAS separado. Nunca copie o
`.env` de produção para esse ambiente. Enquanto esse segundo projeto não for
provisionado, testes que escrevem no servidor devem usar apenas lançamentos
descartáveis da conta de teste autorizada.

**Restrição atual:** o projeto está no plano Free. Portanto, não consideramos
staging remoto dedicado nem recursos pagos de recuperação como concluídos. A
opção sem custo é um Supabase local com Docker ou uma conta remota descartável
explicitamente autorizada. Nesta máquina o Docker não está instalado; até ele
ser disponibilizado, o staging local fica documentado, mas não executável aqui.

## Backup e restauração

Migrations e `supabase/schema.sql` são a reconstrução do esquema, não backup
dos dados. O responsável do projeto deve confirmar no painel do Supabase o
backup automático disponível no plano, anotar o último ponto recuperável e
manter uma exportação manual segura quando necessário. Não ativar PITR pago
enquanto a conta estiver no Free. Uma restauração periódica só conta quando
uma conta fictícia consegue ler os dados restaurados e a produção permanece
intocada; sem staging disponível, esse teste continua pendente.

O bundle de uma Edge Function é salvo temporariamente antes de cada deploy,
fora do vault e sem credenciais. Esse artefato é uma cópia de retorno do
código, não substitui backup do banco.

## Rollback

Todo release deve ter um commit e uma tag. Para uma Edge Function, o rollback
é republicar o último commit conhecido como bom, depois de conferir a versão,
`updated_at` e `verify_jwt` no Management API. Para o banco, migrations são
avançadas e compensatórias; não se apaga nem se reescreve migration já
aplicada. Restauração de dados só ocorre a partir de backup/PITR testado.

O rollback precisa ser feito primeiro em staging quando esse ambiente existir.
Em produção, registrar no incidente o commit, a versão da função, o motivo e
o resultado da verificação pós-rollback.

## Analytics e privacidade

O Grana. não coleta analytics de produto neste momento. Isso é deliberado:
logs operacionais não carregam descrição, valor, transcrição, e-mail ou
token. Se analytics for ativado, deve haver uma lista fechada de eventos
técnicos, consentimento/opt-out quando aplicável, atualização da Política de
Privacidade e um teste que impeça dados financeiros de entrarem no payload.
