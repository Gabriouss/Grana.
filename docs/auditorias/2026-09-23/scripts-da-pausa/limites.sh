#!/bin/bash
# Saída: codex=<pct> codex_reset=<epoch> claude=<agente com aviso> claude_reset=<texto do horário>
best=0; reset=0
for f in $(ls -t ~/.codex/sessions/*/*/*/*.jsonl 2>/dev/null | head -5); do
  l=$(grep -o '"primary":{"used_percent":[0-9.]*,"window_minutes":[0-9]*,"resets_at":[0-9]*' "$f" | tail -1)
  p=$(echo "$l" | sed -n 's/.*used_percent":\([0-9.]*\).*/\1/p'); r=$(echo "$l" | sed -n 's/.*resets_at":\([0-9]*\).*/\1/p')
  [ -n "$p" ] && awk "BEGIN{exit !($p>$best)}" && { best=$p; reset=$r; }
done
ca=""; cr=""
for a in Sentinel Forge Harbor Compass Ledger; do
  t=$(maestri check "$a" 2>&1 | tail -20)
  if echo "$t" | grep -qiE "used (9[0-9]|100)%|less than (10|[0-9])% of your|session limit|usage limit"; then
    ca=$a; cr=$(echo "$t" | grep -oiE "resets [0-9:]+ ?(am|pm)?" | tail -1); break
  fi
done
echo "codex=$best codex_reset=$reset claude=$ca claude_reset=$cr"
