#!/bin/bash
# Interrompe cada agente (ESC) e deixa na fila a instrução de pausa.
M='PAUSA TEMPORÁRIA pedida pelo autor: o limite de uso do Claude/Codex chegou a 90%. Pare agora. Antes de parar, só isto: salve na sua nota de auditoria o ponto exato em que parou e a lista de cobertura marcada (feito / falta). Não comece nada novo, não rode mais comandos, e aguarde eu mandar RETOMAR. Não precisa responder.'
for a in Sentinel Forge Prism Harbor Beacon Ledger Watchtower Compass; do
  maestri ask "$a" --raw "\e" >/dev/null 2>&1
done
sleep 3
for a in Sentinel Forge Prism Harbor Beacon Ledger Watchtower Compass; do
  ( timeout 20 maestri ask "$a" "$M" >/dev/null 2>&1 & )
done
echo "pausa enviada"
