#!/usr/bin/env bash
# Espelha context.md, AGENTS.md e PRODUCT.md no vault do Obsidian (regra 12 do
# AGENTS.md). Recebe como argumento a pasta "01 - Código" do vault, porque o
# caminho muda de máquina para máquina e não pode ser versionado aqui.
#
# A cópia leva frontmatter e um aviso de somente leitura, porque dentro do
# Obsidian nada indica que o arquivo é gerado: sem o aviso, uma edição feita
# ali é perdida em silêncio no fim do turno seguinte.
#
# A direção é uma só: o repositório manda. Compara antes de escrever, para não
# provocar sincronização do Google Drive à toa, e sai com zero mesmo com o
# vault desmontado.

set -u
destino="${1:-}"
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[ -n "$destino" ] && [ -d "$destino" ] || exit 0

espelhar() {
  origem="$repo/$1"
  alvo="$destino/$2"
  [ -f "$origem" ] || return 0

  tmp="$(mktemp)" || return 0
  {
    printf -- '---\n'
    printf -- 'tags: [grana, espelho]\n'
    printf -- 'tipo: espelho\n'
    printf -- 'fonte: %s\n' "$1"
    printf -- 'somente_leitura: true\n'
    printf -- '---\n\n'
    printf -- '> [!warning] Cópia automática do repositório, somente leitura\n'
    printf -- '> Gerado de `%s` pelo hook de Stop do Claude Code, ao fim de cada turno.\n' "$1"
    printf -- '> Editar esta nota dentro do Obsidian não volta para o repositório e será\n'
    printf -- '> sobrescrito. A alteração tem que ser feita no arquivo de origem.\n\n'
    cat "$origem"
  } > "$tmp"

  cmp -s "$tmp" "$alvo" || cp "$tmp" "$alvo"
  rm -f "$tmp"
}

espelhar "context.md" "Contexto do Projeto - Grana.md"
espelhar "AGENTS.md" "Regras para Agentes - Grana.md"
espelhar "PRODUCT.md" "Produto - Estado Atual - Grana.md"

exit 0
