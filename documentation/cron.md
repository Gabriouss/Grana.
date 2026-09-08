# Trabalho agendado

| Trabalho | Gatilho | Efeito | Proteção |
| --- | --- | --- | --- |
| enviar-lembretes-habito | pg_cron/HTTP interno | reivindica e envia push de almoço/noite | service_role, janela local, unique token/data/janela |
| lembretes locais | abertura/retorno do app | agenda no aparelho | preferências locais e cancelamento após lançamento |
| sincronização de voz | abertura/foreground/widget | retoma operações pendentes | request_id idempotente e estado de atenção |

O job remoto não deve ser chamado com anon. Entregas são reivindicadas com
lock e tokens inválidos são removidos. Falhas são registradas e não marcam
entrega como concluída.
