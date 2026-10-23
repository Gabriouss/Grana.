#!/usr/bin/env bash
# Le a caixa atual, nao mensagens antigas: Codex usa › ou » conforme a versao.
CAIXA_CODEX_VAZIA='› Ask Codex to do anything'
ESFORCO_CODEX='fast|minimal|low|medium|high|xhigh|ultra|default'
RODAPE_CODEX="for shortcuts|($ESFORCO_CODEX) · |tab to queue|edit last queued"
AVISO_RODAPE_CODEX='^[[:space:]]*(Earlier messages available[.][[:space:]]+enter/esc latest[.]?|esc again to edit previous message[.]?)[[:space:]]*$'

caixa_codex() {
  awk -v rodape="$RODAPE_CODEX" -v aviso="$AVISO_RODAPE_CODEX" '
    /^[[:space:]]*(›|»)/ { buf = $0; on = 1; next }
    on && $0 ~ aviso && buf ~ /^[[:space:]]*(›|») Ask Codex to do anything[[:space:]]*$/ { next }
    on && $0 ~ rodape { on = 0 }
    on { buf = buf "\n" $0 }
    END { print buf }
  ' | tr -s '[:space:]' ' ' | sed 's/^ //; s/ $//; s/^»/›/'
}

estado_caixa_codex() {
  local caixa
  caixa="$(caixa_codex)"
  case "$caixa" in
    '') echo sem-caixa ;;
    "$CAIXA_CODEX_VAZIA") echo vazia ;;
    *) echo texto ;;
  esac
}
