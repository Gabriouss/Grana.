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

caixa() {
  local saida; saida="$(printf '%b' "$3" | bash "$G" --testar)"
  if [ "$saida" = "$2" ]; then echo "ok    $1"; else echo "FALHA $1: saiu \"$saida\""; falhas=$((falhas + 1)); fi
}
caixa 'historico antigo nao ocupa caixa nova' vazia '› pedido enviado\n• recebido\n» Ask Codex to do anything\n  GPT-6 ultra · pasta'
caixa 'caixa nova ocupada apos historico vazio' texto '› Ask Codex to do anything\n• recebido\n» pedido novo\n  GPT-6 xhigh · pasta'
caixa 'placeholder no rascunho nao e caixa vazia' texto '» escreva Ask Codex to do anything\n  GPT-6 ultra · pasta'
caixa 'continuacao do placeholder e rascunho' texto '› Ask Codex to do anything\n  mais texto\n  GPT-6 xhigh · pasta'
caixa 'caixa antiga vazia' vazia '› Ask Codex to do anything\n  GPT-6 medium · pasta'
caixa 'sem marcador e sem caixa' sem-caixa '• Working\n  GPT-6 ultra · pasta'
caixa 'Earlier antes do modelo e aviso' vazia '» Ask Codex to do anything\n  Earlier messages available. enter/esc latest\n  GPT-6 ultra · pasta'
caixa 'esc again antes do modelo e aviso' vazia '› Ask Codex to do anything\n  esc again to edit previous message\n  GPT-6 xhigh · pasta'
caixa 'Earlier dentro do prompt e texto' texto '» Earlier messages available. enter/esc latest\n  GPT-6 ultra · pasta'
caixa 'esc again dentro do prompt e texto' texto '› esc again to edit previous message\n  GPT-6 xhigh · pasta'
caixa 'frase maior que Earlier permanece texto' texto '» Ask Codex to do anything\n  preciso ler Earlier messages available. enter/esc latest agora\n  GPT-6 ultra · pasta'
caixa 'frase maior que esc again permanece texto' texto '› Ask Codex to do anything\n  explique esc again to edit previous message por favor\n  GPT-6 xhigh · pasta'
caixa 'aviso nao descarta continuacao real' texto '» Ask Codex to do anything\n  Earlier messages available. enter/esc latest\n  preservar esta continuacao\n  GPT-6 ultra · pasta'
source "$(dirname "$G")/codex-caixa.sh"
texto_da_caixa() {
  local saida; saida="$(printf '%b' "$3" | caixa_codex)"
  if [ "$saida" = "$2" ]; then echo "ok    $1"; else echo "FALHA $1: texto da caixa mudou"; falhas=$((falhas+1)); fi
}
texto_da_caixa 'Earlier literal em rascunho e preservado inteiro' \
  '› meu rascunho Earlier messages available. enter/esc latest preservar texto' \
  '» meu rascunho\n  Earlier messages available. enter/esc latest\n  preservar texto\n  GPT-6 ultra · pasta'
texto_da_caixa 'esc again literal em rascunho e preservado inteiro' \
  '› meu rascunho esc again to edit previous message preservar texto' \
  '› meu rascunho\n  esc again to edit previous message\n  preservar texto\n  GPT-6 xhigh · pasta'
caso 'Codex no limite com marcador novo' "^$(hm '11:50 PM') " \
  "■ You've hit your usage limit. try again at 11:50 PM.\n» Ask Codex to do anything\n  GPT-6 ultra · pasta"
caso 'Codex novo retomou depois do limite' '^$' \
  "■ You've hit your usage limit. try again at 11:50 PM.\n» continue\n• Working (3s • esc to interrupt)\n» Ask Codex to do anything"

# Exercita varrer() real: duas leituras iguais liberam a caixa, historico nao.
COM_TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$COM_TEST_DIR"' EXIT
export COM_TEST_DIR
sleep() { :; }
maestri() {
  local cen n
  [ "$2" = Compass ] || return 0
  cen="$(cat "$COM_TEST_DIR/cenario")"
  if [ "$1" = check ]; then
    n="$(cat "$COM_TEST_DIR/leituras")"; n=$((n+1)); echo "$n" >"$COM_TEST_DIR/leituras"
    printf '› pedido ja enviado\n• recebido\n'
    if [ -e "$COM_TEST_DIR/enviado" ] || [ "$cen" = vazio ]; then
      printf '» Ask Codex to do anything\n'
    else
      printf '» pedido atual\n'
      if [ "$cen" = instavel ]; then printf '  continuacao %s\n' "$n"; fi
      [ "$cen" != fila ] || printf '  tab to queue message\n'
    fi
    printf '  GPT-6 ultra · pasta\n'
  else
    printf '%s\n' "$4" >>"$COM_TEST_DIR/escritas"
    touch "$COM_TEST_DIR/enviado"
  fi
}
export -f sleep maestri
varredura() {
  local obtidas
  echo "$2" >"$COM_TEST_DIR/cenario"; echo 0 >"$COM_TEST_DIR/leituras"
  : >"$COM_TEST_DIR/escritas"; rm -f "$COM_TEST_DIR/enviado"
  if MAESTRI_PIPE=fixture GUARDIAO_LOG="$COM_TEST_DIR/guardiao.log" bash "$G" --uma-vez; then
    obtidas="$(paste -sd'|' "$COM_TEST_DIR/escritas")"
    if [ "$obtidas" = "$3" ]; then echo "ok    $1"; return; fi
  fi
  echo "FALHA $1: teclas $(cat "$COM_TEST_DIR/escritas")"; falhas=$((falhas+1))
}
varredura 'guardiao nao libera historico com caixa nova vazia' vazio ''
varredura 'guardiao NAO manda tecla em caixa com texto parado (rascunho do autor)' texto ''
varredura 'guardiao NAO manda Tab em caixa parada que pede tab to queue' fila ''
varredura 'guardiao espera continuacao multilinha estabilizar' instavel ''

[ "$falhas" -eq 0 ] && echo "todos passaram" || { echo "$falhas falha(s)"; exit 1; }
