#!/usr/bin/env bash
# Executa a varredura real com check dublado; nunca escreve no terminal real.
set -uo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
COM_TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$COM_TEST_DIR"' EXIT
export COM_TEST_DIR
maestri() {
  [ "$1" = check ] || { echo escrita-indevida >>"$COM_TEST_DIR/escritas"; return 1; }
  cat "$COM_TEST_DIR/tela"
}
export -f maestri
falhas=0
caso() {
  local rc
  printf '%b' "$4" >"$COM_TEST_DIR/tela"
  bash "$AQUI/varrer-caixas.sh" Fake >"$COM_TEST_DIR/out" 2>&1; rc=$?
  if [ "$rc" = "$2" ] && grep -q "$3" "$COM_TEST_DIR/out" && [ ! -e "$COM_TEST_DIR/escritas" ]; then
    echo "ok    $1"
  else echo "FALHA $1: saida $rc"; cat "$COM_TEST_DIR/out"; falhas=$((falhas+1)); fi
}
caso 'historico ocupado e caixa nova vazia' 0 'caixa vazia' '› pedido enviado\n• recebido\n» Ask Codex to do anything\n  GPT-6 ultra · pasta'
caso 'historico vazio e caixa nova ocupada' 1 'TEXTO PARADO' '› Ask Codex to do anything\n• recebido\n» pedido novo\n  GPT-6 xhigh · pasta'
caso 'caixa ocupada durante trabalho' 1 'TEXTO PARADO' '• Working (3s • esc to interrupt)\n» pedido novo\n  tab to queue message\n  GPT-6 ultra · pasta'
caso 'trabalhando com caixa vazia' 0 'trabalhando' '• Working (3s • esc to interrupt)\n» Ask Codex to do anything\n  GPT-6 xhigh · pasta'
caso 'caixa antiga vazia' 0 'caixa vazia' '› Ask Codex to do anything\n  GPT-6 medium · pasta'
caso 'placeholder com continuacao' 1 'TEXTO PARADO' '» Ask Codex to do anything\n  mais texto\n  GPT-6 ultra · pasta'
caso 'tela desconhecida' 1 'TEXTO PARADO' 'shell desconhecido'
caso 'Earlier isolado nao ocupa caixa vazia' 0 'caixa vazia' '» Ask Codex to do anything\n  Earlier messages available. enter/esc latest'
caso 'esc again isolado nao ocupa caixa vazia' 0 'caixa vazia' '› Ask Codex to do anything\n  esc again to edit previous message'
caso 'Earlier escrito no prompt continua ocupado' 1 'TEXTO PARADO' '» Earlier messages available. enter/esc latest\n  GPT-6 ultra · pasta'
caso 'esc again escrito no prompt continua ocupado' 1 'TEXTO PARADO' '› esc again to edit previous message\n  GPT-6 xhigh · pasta'
[ "$falhas" -eq 0 ] && echo 'todos passaram' || { echo "$falhas falha(s)"; exit 1; }
