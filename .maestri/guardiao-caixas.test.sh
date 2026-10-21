#!/usr/bin/env bash
# Testes da leitura de limite do guardiao (--testar-limite). Telas montadas a
# partir de avisos reais do Codex e do Claude Code, copiados das sessoes.
# Uso: bash .maestri/guardiao-caixas.test.sh
G="$(dirname "$0")/guardiao-caixas.sh"
falhas=0
caso() { # nome, esperado (regex sobre a saida, ou "^$" para nada), tela
  local saida; saida="$(printf '%b' "$3" | bash "$G" --testar-limite)"
  if printf '%s' "$saida" | grep -qE "$2" || { [ "$2" = '^$' ] && [ -z "$saida" ]; }; then
    echo "ok    $1"
  else
    echo "FALHA $1: saiu \"$saida\""; falhas=$((falhas + 1))
  fi
}
hm() { date -d "$1" +%s; }
amanha4=$(( $(hm 4am) < $(date +%s) - 21600 ? $(hm 4am) + 86400 : $(hm 4am) ))

caso "Codex no limite" "^$(hm '11:50 PM') " \
  "■ You've hit your usage limit. Upgrade to Pro, visit https://chatgpt.com/\nsettings/usage to purchase more credits or try again at 11:50 PM.\n› Ask Codex to do anything\n  ? for shortcuts"
caso "Codex com data e ordinal" "^$(hm 'Sep 19 2026 9:53 AM') " \
  "■ You've hit your usage limit. Upgrade your plan or add credits to continue, or try again at Sep 19th, 2026, 9:53 AM.\n› Ask Codex to do anything"
caso "Codex no limite de novo depois do continue" "^$(hm '11:50 PM') " \
  "■ You've hit your usage limit. try again at 11:50 PM.\n› continue\n■ You've hit your usage limit. try again at 11:50 PM.\n› Ask Codex to do anything"
caso "Codex ja retomou" '^$' \
  "■ You've hit your usage limit. try again at 11:50 PM.\n› continue\n• Working (3s • esc to interrupt)\n› Ask Codex to do anything"
caso "Claude sessao, hora ja passada vira amanha" "^$amanha4 " \
  "  ⎿  You've hit your session limit · resets 4am (America/Sao_Paulo)\n────\n❯ \n────\n  ⏵⏵ auto mode on"
caso "Claude semanal com data" "^$(hm 'Oct 14 5pm') " \
  "  ⎿  You've hit your weekly limit · resets Oct 14, 5pm (America/Sao_Paulo)\n❯ Try \"how does x work?\""
caso "Claude retoma sozinho" '^auto$' \
  "● Usage limit reached · continuing automatically at 8:50pm · esc or type to cancel\n❯ "
caso "Claude so avisando uso (nao e limite)" '^$' \
  "  You've used 87% of your weekly limit · resets Oct 14, 5pm (America/Sao_Paulo)\n❯ "
caso "Claude ja retomou" '^$' \
  "  ⎿  You've hit your session limit · resets 4am (America/Sao_Paulo)\n❯ oi\n● Ola\n❯ "

decisao() { # nome, esperado, agora, agenda, ocupado
  local saida; saida="$(bash "$G" --testar-sem-aviso "$3" "$4" "$5")"
  if [ "$saida" = "$2" ]; then echo "ok    $1"; else echo "FALHA $1: saiu \"$saida\""; falhas=$((falhas + 1)); fi
}
# Caso real de 20/10 20h12: aviso das 00h25 saiu da tela, Codex ocioso.
decisao "aviso sumiu antes da hora, ocioso: mantem a agenda" manter 1000 2000 0
decisao "aviso sumiu, hora passou, ocioso: retoma" retomar 2000 2000 0
decisao "aviso sumiu e esta trabalhando: ja voltou" retomou 1000 2000 1

[ "$falhas" -eq 0 ] && echo "todos passaram" || { echo "$falhas falha(s)"; exit 1; }
