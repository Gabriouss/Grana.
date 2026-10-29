#!/usr/bin/env bash
# Inicializacao por agente, conta, modelo e esforco observados em 28/10/2026.
# Fonte executavel: .maestri/codex-inicializacao.json. Nao impoe medium nem Luna.
# Sem argumentos: APENAS lista os comandos; nunca reinicia por omissao.
# --persistir: salva presets Maestri sem tocar nos processos atuais.
# --planejar-retomada Agente SESSION_ID: imprime replace + codex resume; NAO executa.
# Aplicacao futura exige handoff do trabalho e autorizacao; --reiniciar foi bloqueado.
set -euo pipefail
cd "$(dirname "$0")/.."
mode=--listar
case "${1:-}" in
  --listar|--persistir|--planejar-retomada) mode="$1"; shift ;;
  --help|-h) echo 'Uso: codex-modelos.sh [--listar|--persistir] [Agente ...] OU --planejar-retomada Agente SESSION_ID'; exit 0 ;;
  --reiniciar) echo 'Reinicio bloqueado. Prepare --planejar-retomada Agente SESSION_ID e preserve o handoff.' >&2; exit 2 ;;
  --*) echo "opcao desconhecida: $1 (nenhum agente alterado)" >&2; exit 2 ;;
esac
session_id=''
if [[ "$mode" = --planejar-retomada ]]; then
  if [[ $# -ne 2 || ! "$2" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
    echo 'Uso: --planejar-retomada Agente SESSION_ID (UUID exato da conversa; nunca --last)' >&2
    exit 2
  fi
  session_id="$2"
  set -- "$1"
fi
# Valida TODOS os alvos antes da primeira chamada Maestri.
rows="$(python - "$@" <<'PY'
import json,re,sys
from pathlib import Path
cfg=json.loads(Path('.maestri/codex-inicializacao.json').read_text(encoding='utf8'))
by_name={a['name']:a for a in cfg['agents']}
names=sys.argv[1:] or list(by_name)
if not sys.argv[1:] and cfg.get('unverifiedAgents'):
 print('Perfil incompleto (modelo/esforco/conta); nao alterados: '+', '.join(cfg['unverifiedAgents']),file=sys.stderr)
missing=[n for n in names if n not in by_name]
if missing: raise SystemExit('Sem estado atual comprovado: '+', '.join(missing))
for n in names:
 a=by_name[n]
 if not re.fullmatch(r'gpt-[a-z0-9.]+(?:-[a-z0-9.]+)*',a['model']): raise SystemExit('Modelo invalido: '+n)
 if a['effort'] not in ['none','minimal','low','medium','high','xhigh','max','ultra']: raise SystemExit('Esforco invalido: '+n)
 if a['account'] not in ['Gabriel Codex','Codex PH']: raise SystemExit('Conta nao autorizada: '+n)
 fields=[n,a['account'],a['model'],a['effort'],a['preset'],'on' if a['maestro'] else 'off']
 if any(any(c in v for c in '\t\r\n') for v in fields): raise SystemExit('Campo invalido: '+n)
 print('\t'.join(fields))
PY
)"
presets=''
if [[ "$mode" = --persistir ]]; then presets="$(maestri preset list)"; fi
while IFS=$'\t' read -r agent account model effort preset maestro; do
  maestro="${maestro%$'\r'}"
  command="codex --no-daemon --dangerously-bypass-approvals-and-sandbox --model $model -c model_reasoning_effort=$effort"
  case "$mode" in
    --listar)
      printf '%s | %s | %s | %s\n' "$agent" "$account" "$model" "$effort"
      ;;
    --persistir)
      if printf '%s\n' "$presets" | grep -Fq -- "\"$preset\""; then
        maestri preset set "$preset" --command "$command" --account "$account" --maestro "$maestro" --quick-start off
      else
        maestri preset create "$preset" --command "$command" --account "$account" --maestro "$maestro" --chat off --quick-start off
      fi
      ;;
    --planejar-retomada)
      resume_command="codex --no-daemon resume $session_id --dangerously-bypass-approvals-and-sandbox --model $model -c model_reasoning_effort=$effort"
      echo '# PLANO SOMENTE. Antes de aplicar: agente ocioso, handoff salvo e UUID conferido na conta/cwd corretos.'
      printf '%q ' maestri recruit --replace "$agent" --preset "$preset" --account "$account" --command "$resume_command"
      printf '\n'
      ;;
  esac
done <<< "$rows"
