#!/usr/bin/env bash
# Envia um pedido a um terminal Codex do Maestri e CONFERE que saiu da caixa.
#
# Por que nao basta `maestri ask "Agente" "texto"`: o Maestri digita o texto no
# terminal e manda o Enter colado nele. O Codex le uma rajada de caracteres
# como colagem e trata esse Enter como quebra de linha da colagem, entao o
# pedido fica parado na caixa e o `ask` fica esperando uma resposta que nunca
# vem. Visto em 01/10/2026 com o orquestrador Codex: o texto so saiu quando um
# Enter foi mandado sozinho, depois. O Enter precisa ir SEPARADO, com pausa.
#
# Segundo defeito, do mesmo dia: terminal que caiu no shell (o Codex fechou
# depois do aviso de atualizacao) recebe o pedido como comando do bash. Este
# script reabre o Codex antes de digitar.
#
# Uso: bash .maestri/enviar.sh "Agente" "texto"
#
# Saida:
#   0  "enviado para <agente>": o texto ENTROU na caixa e depois SAIU dela.
#   1  "NAO ENVIADO": nada foi aceito. A mensagem diz se o texto ficou parado
#      na caixa (nesse caso NAO reenvie: resolva com `maestri check`).
#   3  "ESTADO INCERTO": uma escrita no terminal falhou ou a tela nao deu para
#      ler. Pode ter ido ou nao. Confira com `maestri check` antes de reenviar.
# O texto e digitado UMA vez so; o script nunca o repete. Nao espera a
# resposta do agente: peca o retorno por `maestri ask "<seu nome>" "..."`
# dentro do proprio texto.
# Testes com dubles do maestri: bash .maestri/enviar.test.sh

set -uo pipefail
# Sem isto o Git Bash converte "/clear" em "C:/Program Files/Git/clear".
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

a="${1:-}"
t="${2:-}"
if [[ -z "$a" || -z "$t" ]]; then
  echo 'Uso: bash .maestri/enviar.sh "Agente" "texto"' >&2
  exit 2
fi

# Caixa vazia do Codex. Qualquer outra coisa na caixa e tratada como rascunho.
VAZIA='› Ask Codex to do anything'
RODAPE='for shortcuts|(fast|low|medium|high|default) · |tab to queue|edit last queued'

tela() { maestri check "$a" 2>/dev/null | grep -v '^[[:space:]]*$' | tail -"${1:-15}"; }

incerto() {
  echo "ESTADO INCERTO para $a: $1. Nao reenvie sem conferir: maestri check \"$a\"" >&2
  exit 3
}
# Toda escrita no terminal tem o retorno conferido. Escrita que falha encerra
# o envio: seguir adiante ja anunciou "enviado" sem nada ter sido digitado.
tecla() {
  local saida
  if ! saida="$(maestri ask "$a" --raw "$1" 2>&1 >/dev/null)"; then
    incerto "falhou a escrita de ${2:-uma tecla} (${saida:-sem mensagem})"
  fi
}

# A caixa do Codex e o bloco INTEIRO que vai da ultima linha com "›" ate o
# rodape, porque texto longo quebra em varias linhas. Sai numa linha so.
caixa() {
  tela 40 | awk '/^[[:space:]]*›/ { buf = ""; on = 1 } on { buf = buf "\n" $0 } END { print buf }' |
    grep -vE "$RODAPE" | tr -s '[:space:]' ' ' | sed 's/^ //; s/ $//'
}

if ! maestri check "$a" >/dev/null 2>&1; then
  echo "NAO ENVIADO para $a: terminal inacessivel (maestri list / maestri debug)" >&2
  exit 1
fi

# O `maestri check` devolve tambem o que ja rolou na tela, entao o estado do
# terminal se le SO nas ultimas linhas: um aviso de atualizacao antigo, mais
# acima, ja enganou este script e fez o Enter cair em "Update now".
no_shell() { tela 1 | grep -qE '^\$[[:space:]]*$'; }
no_aviso() { tela 4 | grep -q 'enter continue'; }
no_skip() { tela 4 | grep -qE '›[[:space:]]*2\. Skip'; }
# Codex aberto de verdade: o rodape dele esta nas ultimas linhas. So a caixa
# "›" nao basta, porque durante a subida a tela ainda mostra restos antigos e
# o texto digitado cedo demais cai no aviso de atualizacao.
aberto() { ! no_shell && ! no_aviso && tela 3 | grep -qE 'for shortcuts|(fast|low|medium|high|default) · '; }
espera() { for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do "$@" && return 0; sleep 2; done; return 1; }

# 1. Terminal no shell: reabre o Codex e espera a tela dele aparecer.
if no_shell; then
  tecla 'codex\r' 'do comando codex'
  # Ao subir, o terminal mostra por um instante a tela do Codex ANTERIOR, com
  # caixa e rodape, e so depois o aviso de atualizacao (medido em 01/10). O
  # estado so vale quando se repete em duas leituras seguidas.
  ant=''
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 3
    if no_aviso; then est=aviso; elif aberto; then est=aberto; else est=''; fi
    [[ -n "$est" && "$est" == "$ant" ]] && break
    ant="$est"
  done
fi

# 2. Aviso de atualizacao: desce para "Skip" e confirma. O Enter direto cai em
#    "Update now", que falha com EBUSY enquanto houver outro Codex aberto e
#    devolve o terminal ao shell. Foi assim que o time inteiro caiu em 01/10.
#    Sem ver "Skip" marcado, o Enter NAO e mandado.
if no_aviso; then
  tecla '\e[B' 'da seta no aviso'
  sleep 1
  if ! no_skip; then
    tecla '\e[B' 'da seta no aviso'
    sleep 1
  fi
  if ! no_skip; then
    echo "NAO ENVIADO para $a: nao consegui marcar Skip no aviso de atualizacao; nada foi confirmado" >&2
    exit 1
  fi
  tecla '\r' 'do Enter no aviso'
  espera aberto
fi

if ! aberto; then
  echo "NAO ENVIADO para $a: o Codex nao esta aberto neste terminal" >&2
  tela 8 >&2
  exit 1
fi

# 3. A caixa tem de estar livre: rascunho que ja estava la iria junto com o
#    pedido, ou seria confundido com ele.
antes="$(caixa)"
if [[ "$antes" != "$VAZIA" ]]; then
  echo "NAO ENVIADO para $a: a caixa nao esta vazia (\"${antes:0:80}\"); nada foi digitado" >&2
  exit 1
fi

# 4. Digita o texto numa linha so (quebra de linha no meio enviaria pela
#    metade) e com a barra invertida dobrada, porque --raw le \n, \t e \e.
txt="$(printf '%s' "$t" | tr '\r\n\t' '   ')"
tecla "${txt//\\/\\\\}" 'do texto'
sleep 2
if [[ "$(caixa)" == "$VAZIA" ]]; then
  incerto 'o texto foi escrito mas nao apareceu na caixa'
fi

# 5. Enter separado. So vale como enviado a TRANSICAO: a caixa, que estava
#    com o texto, voltou a ficar vazia. Aqui so se mandam teclas, nunca o texto.
for _ in 1 2 3 4 5; do
  # Agente no meio de um turno: o Codex pede Tab para enfileirar.
  if tela 6 | grep -qi 'tab to queue'; then
    tecla '\t' 'do Tab da fila'
  else
    tecla '\r' 'do Enter'
  fi
  sleep 3
  if no_shell || no_aviso; then
    incerto 'o Codex fechou depois do texto digitado'
  fi
  if [[ "$(caixa)" == "$VAZIA" ]]; then
    echo "enviado para $a"
    exit 0
  fi
done

echo "NAO ENVIADO para $a: o texto continua PARADO na caixa. Nao reenvie; confira com: maestri check \"$a\"" >&2
exit 1
