#!/usr/bin/env bash
# Guardiao dos terminais do Maestri. Uma tarefa no laco:
#
# 1. (removido em 23/10/2026) Antes mandava Enter/Tab em caixa Codex com o mesmo
#    texto parado em duas leituras. Os agentes usam o enviar.sh, que ja separa o
#    Enter e confere a entrega, e o recurso so arriscava enviar rascunho do autor.
#    Este guardiao NUNCA manda tecla em caixa parada.
#
# 2. Retomada dos orquestradores depois do limite de uso (13/10/2026). O aviso
#    de limite traz a hora da volta ("try again at 11:50 PM" no Codex,
#    "resets 4am (America/Sao_Paulo)" no Claude). O guardiao le essa hora e
#    manda UM pedido de retomada logo depois dela, em vez do "continue" a cada
#    10 min da antiga rotina AutoWake, que so recebia o mesmo aviso de volta.
#    Claude que mostra "continuing automatically" retoma sozinho e NAO e
#    tocado: qualquer tecla cancela a retomada nativa dele.
#
# PRECISA rodar dentro de um terminal do Maestri: fora dele o `maestri` falha
# com "MAESTRI_PIPE not set" e o guardiao nao enxerga nada. Foi assim de 03 a
# 13/10/2026, lancado pela pasta Inicializar do Windows, sem um unico recibo.
#
# Uso:  bash .maestri/guardiao-caixas.sh                  (laco, Ctrl-C para parar)
#       bash .maestri/guardiao-caixas.sh --uma-vez        (uma varredura e sai)
#       bash .maestri/guardiao-caixas.sh --testar         (tela no stdin -> vazia|texto|sem-caixa)
#       bash .maestri/guardiao-caixas.sh --testar-limite  (tela no stdin -> auto|<epoch> <aviso>|nada)
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'
AQUI="$(cd "$(dirname "$0")" && pwd)"
source "$AQUI/codex-caixa.sh"
VAZIA='Ask Codex to do anything'
ALVOS=(Codex Compass Forge Prism Sentinel Harbor Beacon Ledger Watchtower)
# 21/10/2026: os oito agentes Codex e o maestro "Claude Code #2" tambem sao
# retomados; antes so os orquestradores voltavam e o resto do time ficava
# parado depois do limite. Terminal que nao esta ligado a quem roda o
# guardiao devolve tela vazia e e pulado.
ORQUESTRADORES=(Codex Compass Forge Prism Sentinel Harbor Beacon Ledger Watchtower
  "Claude Code" "Orquestrador Supremo" "Claude Code #2")
RETOMADA='O limite de uso foi redefinido. Continue a tarefa em que voce estava quando o limite chegou; nao refaca o que ja esta concluido.'
LOG="${GUARDIAO_LOG:-/e/Grana-temporarios/guardiao-caixas.log}"
INTERVALO="${GUARDIAO_INTERVALO:-15}"
FOLGA=90          # segundos depois da hora anunciada
REPETE=300        # se ainda estiver no limite, tenta de novo 5 min depois
MAX_TENTATIVAS=3

# Usa a mesma caixa completa do envio, inclusive quando o marcador e ».
estado() { estado_caixa_codex; }

# Hora anunciada -> epoch. Hora sem data que ja passou ha mais de 6 h e a de
# amanha (o limite de sessao dura 5 h; o semanal sempre vem com data).
quando() {
  local h e agora
  h="$(printf '%s' "$1" | sed -E 's/\(.*//; s/([0-9])(st|nd|rd|th)/\1/; s/,//g; s/[. ]+$//; s/^ +//')"
  e="$(date -d "$h" +%s 2>/dev/null)" || return 1
  agora="$(date +%s)"
  if ! printf '%s' "$h" | grep -qiE '[a-z]{3} [0-9]'; then
    [ "$e" -lt $((agora - 21600)) ] && e=$((e + 86400))
  fi
  echo "$e"
}

# Aviso de limite nas ultimas linhas da tela (stdin). Imprime "auto" se o
# Claude vai retomar sozinho, "<epoch> <aviso>" se ha hora para retomar, ou
# nada. "You've used 87% of your weekly limit" nao e limite batido.
limite() {
  local fim aviso hora e
  fim="$(tail -14 | tr '\n' ' ' | tr -s ' ')"
  case "$fim" in *"continuing automatically"*|*"Continuing shortly"*) echo auto; return ;; esac
  # O aviso tem de ser o ultimo evento: depois dele, nada de mensagem nova
  # (› ou ❯ com texto), saida do agente (• ou ●) nem turno em andamento.
  local resto="${fim##*hit your}"
  [ "$resto" = "$fim" ] && return
  printf '%s' "$resto" | sed -E "s/(›|») $VAZIA//g; s/❯ Try \"[^\"]*\"//g" |
    grep -qE '(›|») [^ ]|❯ [^ ─]|• |● |esc to interrupt' && return
  aviso="$(printf '%s' "$fim" | grep -oE "hit your usage limit[^■›»❯]*try again at [^■›»❯]*[AP]M\.?|hit your [a-z-]+ limit · resets [^(·›»❯]*" | tail -1)"
  [ -z "$aviso" ] && return
  hora="$(printf '%s' "$aviso" | sed -E 's/.*(try again at|resets) //')"
  e="$(quando "$hora")" || return
  echo "$e $aviso"
}

# Orquestrador ocioso e com a caixa livre: so assim um pedido pode ser digitado.
livre() {
  local t="$1"
  printf '%s' "$t" | tail -8 | grep -q 'esc to interrupt' && return 1
  if [ "$(printf '%s\n' "$t" | estado)" != sem-caixa ]; then
    [ "$(printf '%s\n' "$t" | estado)" = vazia ]; return
  fi
  local c; c="$(printf '%s\n' "$t" | grep -E '^[[:space:]]*❯' | tail -1)"
  [ -n "$c" ] && printf '%s' "$c" | grep -qE '^[[:space:]]*❯[[:space:]]*(Try ".*)?$'
}

# Retomada agendada, mas o aviso de limite sumiu da tela (mensagem nova do
# time, comando no shell, rolagem). Ate 20/10/2026 isso contava como "voltou
# sozinho" e a retomada era cancelada: a das 00h26 de 21/10 caiu assim as
# 20h12. Agora so conta como retomado quem esta trabalhando; ocioso espera a
# hora e recebe o pedido. Args: agora, hora agendada, ocupado (1/0).
sem_aviso() {
  if [ "$3" = 1 ]; then echo retomou
  elif [ "$1" -lt "$2" ]; then echo manter
  else echo retomar; fi
}

if [ "${1:-}" = "--testar" ]; then estado; exit 0; fi
if [ "${1:-}" = "--testar-limite" ]; then limite; exit 0; fi
if [ "${1:-}" = "--testar-sem-aviso" ]; then sem_aviso "$2" "$3" "$4"; exit 0; fi

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
tela() { maestri check "$1" 2>/dev/null | grep -v '^[[:space:]]*$' | tail -40; }
declare -A agenda aviso_de tentativas feito

# Digita o pedido de retomada. Codex vai pelo enviar.sh (Enter separado e
# conferido); Claude recebe o texto e o Enter em duas escritas.
retomar() {
  local a="$1" t="$2"
  if [ "$(printf '%s\n' "$t" | estado)" != sem-caixa ]; then
    bash "$AQUI/enviar.sh" "$a" "$RETOMADA" >/dev/null 2>&1
  else
    maestri ask "$a" --raw "$RETOMADA" >/dev/null 2>&1 && sleep 2 && maestri ask "$a" --raw '\r' >/dev/null 2>&1
  fi
}

vigiar_limites() {
  local a t l e av agora
  agora="$(date +%s)"
  for a in "${ORQUESTRADORES[@]}"; do
    t="$(tela "$a")"
    [ -z "$t" ] && continue
    l="$(printf '%s\n' "$t" | limite)"
    if [ "$l" = auto ]; then
      [ -n "${agenda[$a]:-}" ] && log "RETOMADA $a: o Claude retoma sozinho"
      unset 'agenda[$a]' 'aviso_de[$a]' 'tentativas[$a]'; continue
    fi
    if [ -z "$l" ]; then
      [ -z "${agenda[$a]:-}" ] && continue
      local ocupado=0
      printf '%s' "$t" | tail -8 | grep -q 'esc to interrupt' && ocupado=1
      case "$(sem_aviso "$agora" "${agenda[$a]}" "$ocupado")" in
        manter) continue ;;
        retomou) log "RETOMADA $a: voltou a trabalhar sem precisar do guardiao" ;;
        retomar)
          livre "$t" || continue                           # rascunho na caixa: espera
          retomar "$a" "$t"
          log "RETOMADO $a: aviso saiu da tela antes da hora; pedido de retomada enviado"
          feito[$a]="${aviso_de[$a]}" ;;
      esac
      unset 'agenda[$a]' 'aviso_de[$a]' 'tentativas[$a]'; continue
    fi
    e="${l%% *}"; av="${l#* }"
    [ "${feito[$a]:-}" = "$e $av" ] && continue           # esse aviso ja foi atendido
    if [ "${aviso_de[$a]:-}" != "$e $av" ]; then
      aviso_de[$a]="$e $av"; agenda[$a]=$((e + FOLGA)); tentativas[$a]=0
      log "LIMITE $a: \"$av\"; retomada agendada para $(date -d "@${agenda[$a]}" '+%d/%m %H:%M')"
      continue
    fi
    [ "$agora" -lt "${agenda[$a]}" ] && continue
    if ! livre "$t"; then continue; fi                     # ocupado ou com rascunho: espera
    tentativas[$a]=$(( ${tentativas[$a]} + 1 ))
    retomar "$a" "$t"
    sleep 45
    if [ "$(tela "$a" | limite)" = "$l" ] && livre "$(tela "$a")"; then
      if [ "${tentativas[$a]}" -ge "$MAX_TENTATIVAS" ]; then
        log "FALHOU $a: ainda no limite depois de ${tentativas[$a]} tentativas; desisto deste aviso"
        feito[$a]="$e $av"
      else
        agenda[$a]=$(( $(date +%s) + REPETE ))
        log "AINDA NO LIMITE $a: tentativa ${tentativas[$a]}; nova tentativa as $(date -d "@${agenda[$a]}" '+%H:%M')"
      fi
    else
      log "RETOMADO $a: pedido de retomada enviado (tentativa ${tentativas[$a]})"
      feito[$a]="$e $av"
    fi
  done
}

mkdir -p "$(dirname "$LOG")"
if [ -z "${MAESTRI_PIPE:-}" ]; then
  log "guardiao NAO iniciado: fora de um terminal do Maestri (MAESTRI_PIPE vazio)"
  echo "guardiao: rode dentro de um terminal do Maestri" >&2; exit 1
fi
if [ "${1:-}" = "--uma-vez" ]; then vigiar_limites; exit 0; fi
# Vive e morre com o Maestri: sem o processo dele nao ha caixa para vigiar.
maestri_aberto() { tasklist.exe /FI "IMAGENAME eq Maestri.exe" 2>/dev/null | grep -qi 'Maestri.exe'; }
log "guardiao iniciado (intervalo ${INTERVALO}s; orquestradores: ${ORQUESTRADORES[*]})"
while maestri_aberto; do vigiar_limites; sleep "$INTERVALO"; done
log "guardiao encerrado: o Maestri fechou"
