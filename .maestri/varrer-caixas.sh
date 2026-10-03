#!/usr/bin/env bash
# Varre os terminais Codex do Maestri e acusa os que tem TEXTO PARADO na caixa.
# Motivo (02/10/2026): agente que chama `maestri ask` puro para um Codex deixa
# o texto na caixa, sem Enter; `maestri check` mostra a caixa com o texto no
# lugar de "› Ask Codex to do anything". So le e avisa: nao digita e nao manda
# Enter (corrigir e decisao de quem coordena: `maestri ask "Agente" --raw '\r'`).
# Uso: bash .maestri/varrer-caixas.sh [Agente ...]   Sai com 1 se achar algum.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'
alvos=("$@"); [ ${#alvos[@]} -eq 0 ] && alvos=(Codex Compass Forge Prism Sentinel Harbor Beacon Ledger Watchtower)
achou=0
for a in "${alvos[@]}"; do
  t="$(maestri check "$a" 2>&1 | grep -v '^[[:space:]]*$' | tail -12)"
  if [ -z "$t" ]; then echo "?  $a: terminal inacessivel"; achou=1; continue; fi
  echo "$t" | grep -q 'esc to interrupt' && { echo "ok $a: trabalhando"; continue; }
  echo "$t" | grep -q '› Ask Codex to do anything' && { echo "ok $a: caixa vazia"; continue; }
  echo "!! $a: TEXTO PARADO na caixa (ou estado desconhecido). Confira: maestri check \"$a\""; achou=1
done
exit $achou
