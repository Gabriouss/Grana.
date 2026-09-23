#!/bin/bash
# Uso: retomar-todos.sh <epoch>  — espera até o epoch e manda RETOMAR a todos.
alvo=$1; while [ "$(date +%s)" -lt "$alvo" ]; do sleep 30; done
M='RETOMAR: o limite de uso foi redefinido. Retome a sua tarefa exatamente do ponto salvo na sua nota, com as mesmas regras de antes, e mande o relatório final como combinado (maestri ask "Codex" "<resumo>"). Se você já tinha terminado, não faça nada.'
for a in Sentinel Forge Prism Harbor Beacon Ledger Watchtower Compass; do ( timeout 20 maestri ask "$a" "$M" >/dev/null 2>&1 & ); done
echo "retomada enviada $(date '+%F %H:%M')"
