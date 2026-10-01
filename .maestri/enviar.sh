#!/usr/bin/env bash
# Envia pelo canal de mensagens do Maestri, sem colar texto no composer.
# `maestri ask --raw` apenas digita no terminal; em Codex, colagens exigem
# envio explicito e, durante um turno ativo, podem ficar na fila do composer.
# O comando `maestri ask` submete a mensagem pelo canal do agente e retorna
# quando houver resposta. Se a chamada demorar, consulte `maestri check`;
# nao reenvie o mesmo pedido.
# Uso: bash .maestri/enviar.sh "Agente" "texto"

set -euo pipefail

a="${1:-}"
t="${2:-}"

if [[ -z "$a" || -z "$t" ]]; then
  echo 'Uso: bash .maestri/enviar.sh "Agente" "texto"' >&2
  exit 2
fi

maestri ask "$a" "$t"
printf 'Resposta recebida de %s.\n' "$a"
