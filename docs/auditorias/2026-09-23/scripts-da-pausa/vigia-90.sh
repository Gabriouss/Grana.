#!/bin/bash
# Quando Codex >= 90% ou aparecer aviso de limite do Claude: pausa todos e agenda a retomada no reset + 60 s.
while true; do
  r=$(bash /e/Grana-temporarios/limites.sh 2>/dev/null)
  c=$(echo "$r" | sed -n 's/.*codex=\([0-9.]*\).*/\1/p'); cr=$(echo "$r" | sed -n 's/.*codex_reset=\([0-9]*\).*/\1/p')
  a=$(echo "$r" | sed -n 's/.*claude=\([^ ]*\) claude_reset.*/\1/p'); ar=$(echo "$r" | sed -n 's/.*claude_reset=\(.*\)/\1/p')
  quem=""; alvo=""
  if [ -n "$c" ] && awk "BEGIN{exit !($c>=90)}"; then quem="codex=$c%"; alvo=$((cr+60)); fi
  if [ -n "$a" ]; then
    h=$(echo "$ar" | sed 's/resets //I'); e=$(date -d "$h" +%s 2>/dev/null)
    [ -n "$e" ] && [ "$e" -lt "$(date +%s)" ] && e=$((e+86400))
    [ -z "$e" ] && e=$(( $(date +%s) + 5*3600 ))
    quem="$quem claude(aviso em $a, $ar)"; [ -z "$alvo" ] || [ $((e+60)) -gt "$alvo" ] && alvo=$((e+60))
  fi
  if [ -n "$quem" ]; then
    bash /e/Grana-temporarios/pausar-todos.sh >/dev/null 2>&1
    nohup bash /e/Grana-temporarios/retomar-todos.sh "$alvo" > /e/Grana-temporarios/retomada.log 2>&1 &
    echo "GATILHO $quem | todos pausados | retomada agendada para $(date -d @$alvo '+%F %H:%M')"
    exit 0
  fi
  sleep 60
done
