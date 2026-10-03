#!/usr/bin/env bash
# Guardiao das caixas dos terminais Codex do Maestri. Texto que chega por
# `maestri ask` puro fica na caixa sem Enter (medido em 01 e 02/10/2026).
# Este laco confere cada Codex a cada 15 s e, quando o MESMO texto continua na
# caixa em duas leituras seguidas (>= 15 s), manda o Enter (ou Tab, se o Codex
# estiver no meio de um turno e pedir "tab to queue") e CONFERE que a caixa
# esvaziou. Nunca digita texto: so manda tecla. Deixa recibo em log.
# Uso:  bash .maestri/guardiao-caixas.sh            (laco, Ctrl-C para parar)
#       bash .maestri/guardiao-caixas.sh --uma-vez  (uma varredura e sai)
#       bash .maestri/guardiao-caixas.sh --testar   (le uma tela no stdin e diz vazia|texto|sem-caixa)
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'
VAZIA='Ask Codex to do anything'
ALVOS=(Codex Compass Forge Prism Sentinel Harbor Beacon Ledger Watchtower)
LOG="${GUARDIAO_LOG:-/e/Grana-temporarios/guardiao-caixas.log}"
INTERVALO="${GUARDIAO_INTERVALO:-15}"

# Estado da caixa a partir da tela: a ULTIMA linha com "›" e a caixa; o resto
# acima (›) e historico de mensagens ja enviadas.
estado() {
  local ult
  ult="$(grep -E '^[[:space:]]*›' | tail -1)"
  [ -z "$ult" ] && { echo sem-caixa; return; }
  case "$ult" in *"$VAZIA"*) echo vazia ;; *) echo texto ;; esac
}
[ "${1:-}" = "--testar" ] && { estado; exit 0; }

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
tela() { maestri check "$1" 2>/dev/null | grep -v '^[[:space:]]*$' | tail -40; }
declare -A visto

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

mkdir -p "$(dirname "$LOG")"
if [ "${1:-}" = "--uma-vez" ]; then varrer; varrer; exit 0; fi
# Vive e morre com o Maestri: sem o processo dele nao ha caixa para vigiar.
maestri_aberto() { tasklist.exe /FI "IMAGENAME eq Maestri.exe" 2>/dev/null | grep -qi 'Maestri.exe'; }
log "guardiao iniciado (intervalo ${INTERVALO}s)"
while maestri_aberto; do varrer; sleep "$INTERVALO"; done
log "guardiao encerrado: o Maestri fechou"
