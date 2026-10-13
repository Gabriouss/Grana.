#!/usr/bin/env bash
# Guardiao dos terminais do Maestri. Duas tarefas no mesmo laco:
#
# 1. Caixas dos Codex. Texto que chega por `maestri ask` puro fica na caixa
#    sem Enter (medido em 01 e 02/10/2026). Quando o MESMO texto continua na
#    caixa em duas leituras seguidas (>= 15 s), manda o Enter (ou Tab, se o
#    Codex estiver no meio de um turno e pedir "tab to queue") e CONFERE que a
#    caixa esvaziou. Nunca digita texto: so manda tecla.
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
VAZIA='Ask Codex to do anything'
ALVOS=(Codex Compass Forge Prism Sentinel Harbor Beacon Ledger Watchtower)
ORQUESTRADORES=(Codex "Claude Code" "Orquestrador Supremo")
RETOMADA='O limite de uso foi redefinido. Continue a tarefa em que voce estava quando o limite chegou; nao refaca o que ja esta concluido.'
LOG="${GUARDIAO_LOG:-/e/Grana-temporarios/guardiao-caixas.log}"
INTERVALO="${GUARDIAO_INTERVALO:-15}"
FOLGA=90          # segundos depois da hora anunciada
REPETE=300        # se ainda estiver no limite, tenta de novo 5 min depois
MAX_TENTATIVAS=3

# Estado da caixa a partir da tela: a ULTIMA linha com "›" e a caixa; o resto
# acima (›) e historico de mensagens ja enviadas.
estado() {
  local ult
  ult="$(grep -E '^[[:space:]]*›' | tail -1)"
  [ -z "$ult" ] && { echo sem-caixa; return; }
  case "$ult" in *"$VAZIA"*) echo vazia ;; *) echo texto ;; esac
}

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
  printf '%s' "$resto" | sed "s/› $VAZIA//g; s/❯ Try \"[^\"]*\"//g" |
    grep -qE '› [^ ]|❯ [^ ─]|• |● |esc to interrupt' && return
  aviso="$(printf '%s' "$fim" | grep -oE "hit your usage limit[^■›❯]*try again at [^■›❯]*[AP]M\.?|hit your [a-z-]+ limit · resets [^(·›❯]*" | tail -1)"
  [ -z "$aviso" ] && return
  hora="$(printf '%s' "$aviso" | sed -E 's/.*(try again at|resets) //')"
  e="$(quando "$hora")" || return
  echo "$e $aviso"
}

# Orquestrador ocioso e com a caixa livre: so assim um pedido pode ser digitado.
livre() {
  local t="$1"
  printf '%s' "$t" | tail -8 | grep -q 'esc to interrupt' && return 1
  if printf '%s' "$t" | grep -q "$VAZIA"; then
    [ "$(printf '%s\n' "$t" | estado)" = vazia ]; return
  fi
  local c; c="$(printf '%s\n' "$t" | grep -E '^[[:space:]]*❯' | tail -1)"
  [ -n "$c" ] && printf '%s' "$c" | grep -qE '^[[:space:]]*❯[[:space:]]*(Try ".*)?$'
}

if [ "${1:-}" = "--testar" ]; then estado; exit 0; fi
if [ "${1:-}" = "--testar-limite" ]; then limite; exit 0; fi

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
tela() { maestri check "$1" 2>/dev/null | grep -v '^[[:space:]]*$' | tail -40; }
declare -A visto agenda aviso_de tentativas feito

varrer() {
  local a t e assin tecla
  for a in "${ALVOS[@]}"; do
    t="$(tela "$a")"
    [ -z "$t" ] && continue
    # Aviso de atualizacao ou shell: nao e caixa, nao mexe.
    echo "$t" | tail -4 | grep -qE 'enter continue|^\$[[:space:]]*$' && continue
    e="$(echo "$t" | estado)"
    if [ "$e" != texto ]; then unset 'visto[$a]'; continue; fi
    assin="$(echo "$t" | grep -E '^[[:space:]]*›' | tail -1 | md5sum | cut -c1-12)"
    if [ "${visto[$a]:-}" != "$assin" ]; then visto[$a]="$assin"; continue; fi   # 1a leitura: espera
    if echo "$t" | tail -8 | grep -qi 'tab to queue'; then tecla='\t'; else tecla='\r'; fi
    maestri ask "$a" --raw "$tecla" >/dev/null 2>&1
    sleep 4
    if [ "$(tela "$a" | estado)" = texto ] && [ "$(tela "$a" | grep -E '^[[:space:]]*›' | tail -1 | md5sum | cut -c1-12)" = "$assin" ]; then
      log "FALHOU $a: texto continua na caixa depois da tecla"
    else
      log "ENVIADO $a: texto parado na caixa liberado ($( [ "$tecla" = '\t' ] && echo Tab || echo Enter ))"
      unset 'visto[$a]'
    fi
  done
}

# Digita o pedido de retomada. Codex vai pelo enviar.sh (Enter separado e
# conferido); Claude recebe o texto e o Enter em duas escritas.
retomar() {
  local a="$1" t="$2"
  if printf '%s' "$t" | grep -q "$VAZIA"; then
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
    if [ -z "$l" ] || [ "$l" = auto ]; then
      [ -n "${agenda[$a]:-}" ] && log "RETOMADA $a: saiu do limite sem precisar do guardiao"
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
if [ "${1:-}" = "--uma-vez" ]; then varrer; varrer; vigiar_limites; exit 0; fi
# Vive e morre com o Maestri: sem o processo dele nao ha caixa para vigiar.
maestri_aberto() { tasklist.exe /FI "IMAGENAME eq Maestri.exe" 2>/dev/null | grep -qi 'Maestri.exe'; }
log "guardiao iniciado (intervalo ${INTERVALO}s; orquestradores: ${ORQUESTRADORES[*]})"
while maestri_aberto; do varrer; vigiar_limites; sleep "$INTERVALO"; done
log "guardiao encerrado: o Maestri fechou"
