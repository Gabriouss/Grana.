#!/usr/bin/env bash
# Poe cada terminal Codex do Maestri no modelo certo. Decisao do autor, 02/10/2026:
#   Sol 6.1 medium nos agentes de codigo (Forge, Harbor, Watchtower);
#   Luna 6 xhigh nos demais (Compass, Prism, Sentinel, Beacon, Ledger, Codex).
# Reiniciar um terminal sem --command cai no padrao do ~/.codex/config.toml
# (Sol medium) e erra o Luna. Rode este script apos qualquer reinicio.
# Uso (so o autor, o classificador do Claude barra o bypass): bash .maestri/codex-modelos.sh [Agente ...]
# Sem argumentos aplica aos nove. Cada --replace reinicia o processo do agente.
set -uo pipefail
cd "$(dirname "$0")/.."
BASE='codex --no-daemon --dangerously-bypass-approvals-and-sandbox'
SOL="$BASE --model gpt-6.1-sol -c model_reasoning_effort=medium"
LUNA="$BASE --model gpt-6-luna -c model_reasoning_effort=xhigh"
declare -A ROLE=( [Forge]="App Engineer" [Harbor]="Backend Engineer" [Watchtower]="Auditor"
  [Compass]="Product Planner" [Prism]="UI and Design" [Sentinel]="QA"
  [Beacon]="Marketing and Growth" [Ledger]="Documentation and Vault" [Codex]="" )
declare -A CMD=( [Forge]="$SOL" [Harbor]="$SOL" [Watchtower]="$SOL"
  [Compass]="$LUNA" [Prism]="$LUNA" [Sentinel]="$LUNA" [Beacon]="$LUNA" [Ledger]="$LUNA" [Codex]="$LUNA" )
alvos=("$@"); [ ${#alvos[@]} -eq 0 ] && alvos=(Forge Harbor Watchtower Compass Prism Sentinel Beacon Ledger Codex)
for a in "${alvos[@]}"; do
  [ -z "${CMD[$a]:-}" ] && { echo "agente desconhecido: $a" >&2; continue; }
  args=(recruit "$a" --preset Codex --replace "$a" --command "${CMD[$a]}")
  [ -n "${ROLE[$a]}" ] && args+=(--role "${ROLE[$a]}")
  maestri "${args[@]}"
done
