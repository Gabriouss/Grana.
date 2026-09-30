#!/usr/bin/env bash
# Envia um pedido a um terminal do Maestri e CONFERE que saiu da caixa de texto.
# O Codex trata texto longo como colagem e não envia com o Enter que vem junto;
# o pedido fica parado ("[Pasted Content ...]") sem ninguém saber.
# Uso: bash .maestri/enviar.sh "Agente" "texto"
# Caminho do Windows no texto: use barras normais (o maestri lê \r como Enter).
a="$1"; t="$2"
parado() { maestri check "$a" | tail -8 | grep -qE '\[Pasted Content|^\s*› [^A ]'; }
maestri ask "$a" --raw "$t" >/dev/null
for i in 1 2 3; do
  sleep 3
  maestri ask "$a" --raw '\x0d' >/dev/null
  sleep 2
  parado || { echo "enviado para $a"; exit 0; }
done
echo "NAO ENVIADO para $a: confira com maestri check \"$a\"" >&2; exit 1
