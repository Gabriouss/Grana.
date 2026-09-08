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
