#!/usr/bin/env bash
# Testes do enviar.sh com dubles do `maestri`: nenhuma chamada chega ao CLI
# real nem gasta limite de agente. Roda o script REAL em subprocesso, com
# `maestri` e `sleep` trocados por funcoes exportadas, e confere o codigo de
# saida E as escritas que aconteceram (regra 9: asserte nas chamadas).
# Uso: bash .maestri/enviar.test.sh

set -uo pipefail
aqui="$(cd "$(dirname "$0")" && pwd)"
D="$(mktemp -d)"
trap 'rm -rf "$D"' EXIT
export D

sleep() { :; }

# Estado em arquivos, porque o script chama o duble em subshells.
#   $D/estado  shell | aviso1 | aviso2 | vazio | texto | trabalhando
#   $D/cenario regras do caso
#   $D/log     uma linha por escrita: "<rc> <bytes>"
maestri() {
  local cen est marcador rodape
  cen="$(cat "$D/cenario")"
  est="$(cat "$D/estado")"
  if [[ "$1" == check ]]; then
    marcador="$(cat "$D/marcador")"; rodape="$(cat "$D/rodape")"
    if [[ "$cen" == historico ]]; then printf '› pedido antigo ja enviado\n• RECEBIDO\n'; fi
    {
    case "$est" in
      shell) printf 'user@PC MINGW64 /e/GranaPonto (main)\n$ \n' ;;
      aviso1) printf '› 1. Update now (runs npm)\n  2. Skip\n  3. Skip until next version\n  enter continue · esc skip\n' ;;
      aviso2) printf '  1. Update now (runs npm)\n› 2. Skip\n  3. Skip until next version\n  enter continue · esc skip\n' ;;
      vazio) printf '› pedido antigo ja enviado\n• RECEBIDO\n› Ask Codex to do anything\n  GPT-6.1-Sol medium fast · E:\\GranaPonto\n  ? for shortcuts\n' ;;
      rascunho) printf '› rascunho anterior\n  GPT-6.1-Sol medium fast · E:\\GranaPonto\n  ? for shortcuts\n' ;;
      rascunho-aviso) printf '› Earlier messages available. enter/esc latest\n  GPT-6.1-Sol medium fast · E:\\GranaPonto\n' ;;
      rascunho-esc) printf '› esc again to edit previous message\n  GPT-6.1-Sol medium fast · E:\\GranaPonto\n' ;;
      texto) printf '› mensagem de\n  teste que continua na proxima linha\n  GPT-6.1-Sol medium fast · E:\\GranaPonto\n' ;;
      fila) printf '› mensagem de\n  teste que continua na proxima linha\n  tab to queue message\n  GPT-6.1-Sol medium fast · E:\\GranaPonto\n' ;;
      trabalhando) printf '› mensagem de teste que continua na proxima linha\n• Working (2s • esc to interrupt)\n› Ask Codex to do anything\n  GPT-6.1-Sol medium fast · E:\\GranaPonto\n  ? for shortcuts\n' ;;
    esac
    } | sed "s/›/$marcador/g; s/medium fast/$rodape/g" | {
      case "$cen" in
        aviso-anteriores) sed '/GPT-/c\  Earlier messages available. enter/esc latest' | sed '/for shortcuts/d' ;;
        aviso-edicao) sed '/GPT-/c\  esc again to edit previous message' | sed '/for shortcuts/d' ;;
        sem-atalhos) sed '/for shortcuts/d' ;;
        *) cat ;;
      esac
    }
    return 0
  fi
  # maestri ask <agente> --raw <bytes>
  local bytes="$4" rc=0
  case "$cen:$bytes" in
    falha-tudo:*) rc=7 ;;
    falha-texto:mensagem*) rc=7 ;;
    falha-enter:'\r') rc=7 ;;
    falha-seta:'\e[B') rc=7 ;;
  esac
  printf '%s %s\n' "$rc" "$bytes" >>"$D/log"
  if (( rc != 0 )); then
    echo 'pipe fechado' >&2
    return "$rc"
  fi
  case "$bytes" in
    'codex\r') echo aviso1 >"$D/estado" ;;
    '\e[B') [[ "$cen" == seta-morta ]] || { [[ "$est" == aviso1 ]] && echo aviso2 >"$D/estado"; } ;;
    '\t') [[ "$est" == fila ]] && echo trabalhando >"$D/estado" ;;
    '\r')
      case "$est" in
        aviso1) echo shell >"$D/estado" ;;
        aviso2) echo vazio >"$D/estado" ;;
        texto) [[ "$cen" == enter-engolido ]] || echo trabalhando >"$D/estado" ;;
      esac ;;
    *)
      if [[ "$cen" == texto-some ]]; then :
      elif [[ "$cen" == fila ]]; then echo fila >"$D/estado"
      else echo texto >"$D/estado"; fi ;;
  esac
  return 0
}
export -f maestri sleep

falhas=0
# caso <nome> <cenario> <estado inicial> <saida esperada> <escritas esperadas, separadas por |>
caso() {
  local nome="$1" cen="$2" ini="$3" quer="$4" escritas="$5" rc obtidas
  echo "$cen" >"$D/cenario"; echo "$ini" >"$D/estado"; : >"$D/log"
  printf '%s' "${6:-›}" >"$D/marcador"; printf '%s' "${7:-medium fast}" >"$D/rodape"
  bash "$aqui/enviar.sh" Fake 'mensagem de teste que continua na proxima linha' >"$D/out" 2>&1
  rc=$?
  obtidas="$(paste -sd'|' "$D/log")"
  if [[ "$rc" == "$quer" && "$obtidas" == "$escritas" ]]; then
    echo "ok    $nome (saida $rc)"
  else
    echo "FALHA $nome: saida $rc (esperada $quer)"
    echo "      escritas: $obtidas"
    echo "      esperadas: $escritas"
    sed 's/^/      > /' "$D/out"
    falhas=$((falhas + 1))
  fi
}

T='mensagem de teste que continua na proxima linha'
caso 'envio normal'                       normal         vazio    0 "0 $T|0 \\r"
caso 'toda escrita falha'                 falha-tudo     vazio    3 "7 $T"
caso 'falha ao escrever o texto'          falha-texto    vazio    3 "7 $T"
caso 'falha no Enter, sem repetir texto'  falha-enter    vazio    3 "0 $T|7 \\r"
caso 'rascunho na caixa, nada digitado'   normal         rascunho 1 ''
caso 'texto escrito nao aparece'          texto-some     vazio    3 "0 $T"
caso 'Enter engolido, caixa em 2 linhas'  enter-engolido vazio    1 "0 $T|0 \\r|0 \\r|0 \\r|0 \\r|0 \\r"
caso 'aviso: seta, Skip, Enter, envio'    normal         aviso1   0 "0 \\e[B|0 \\r|0 $T|0 \\r"
caso 'aviso: seta falha, sem Enter'       falha-seta     aviso1   3 '7 \e[B'
caso 'aviso: seta sem efeito, sem Enter'  seta-morta     aviso1   1 '0 \e[B|0 \e[B'
caso 'shell: reabre, pula aviso, envia'   normal         shell    0 "0 codex\\r|0 \\e[B|0 \\r|0 $T|0 \\r"
caso 'fila: Tab e nenhum Enter depois'    fila           vazio    0 "0 $T|0 \\t"
caso 'historico antigo e caixa nova vazia' historico     vazio    0 "0 $T|0 \\r" '»' ultra
caso 'caixa nova ocupada nao recebe texto' historico     rascunho 1 '' '»' xhigh
caso 'rodape ultra sem atalhos abre Codex' sem-atalhos   vazio    0 "0 $T|0 \\r" '»' ultra
caso 'rodape xhigh sem atalhos abre Codex' sem-atalhos   vazio    0 "0 $T|0 \\r" '›' xhigh
caso 'marcador novo preserva texto multilinha' enter-engolido vazio 1 "0 $T|0 \\r|0 \\r|0 \\r|0 \\r|0 \\r" '»' ultra
caso 'marcador novo enfileira por Tab'    fila           vazio    0 "0 $T|0 \\t" '»' xhigh
caso 'aviso com marcador novo usa Skip'  normal         aviso1   0 "0 \\e[B|0 \\r|0 $T|0 \\r" '»' ultra
caso 'rodape Earlier nao ocupa caixa vazia' aviso-anteriores vazio 0 "0 $T|0 \\r" '»' ultra
caso 'rodape esc again nao ocupa caixa vazia' aviso-edicao vazio 0 "0 $T|0 \\r" '›' xhigh
caso 'texto Earlier no prompt nao e rodape' aviso-anteriores rascunho-aviso 1 '' '»' ultra
caso 'texto esc again no prompt nao e rodape' aviso-edicao rascunho-esc 1 '' '›' xhigh

if (( falhas > 0 )); then
  echo "$falhas caso(s) falharam"
  exit 1
fi
echo 'todos os casos passaram'
