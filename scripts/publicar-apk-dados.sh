#!/usr/bin/env bash
# Reúne e confere os dados do workflow "Publicar APK" (.github/workflows/publicar-apk.yml).
#
# Por que um script e não `${{ }}` no `run:`: o GitHub substitui `${{ }}` no TEXTO
# do script antes de o shell rodar, então um payload com `$(...)`, aspas ou quebra
# de linha virava comando, num job com `contents: write` (achado C3 do Lynx,
# 08/10/2026). Aqui todo dado externo chega só por variável de ambiente, é lido
# entre aspas e nunca é interpretado. O teste `__tests__/publicar-apk-dados.cjs`
# roda este mesmo arquivo com payloads maliciosos.
#
# Entrada (env): EVENTO, P_VERSAO, P_APK_URL, P_NOTAS (repository_dispatch) e
# I_VERSAO, I_APK_URL, I_NOTAS (workflow_dispatch); GITHUB_OUTPUT.
# Saída: versao, apk_url e notas em $GITHUB_OUTPUT, ou falha com mensagem clara.
set -euo pipefail
# Classes como [a-z] iguais em qualquer runner.
export LC_ALL=C

if [ "${EVENTO:-}" = "repository_dispatch" ]; then
  VERSAO="${P_VERSAO:-}"; APK_URL="${P_APK_URL:-}"; NOTAS="${P_NOTAS:-}"
elif [ "${EVENTO:-}" = "workflow_dispatch" ]; then
  VERSAO="${I_VERSAO:-}"; APK_URL="${I_APK_URL:-}"; NOTAS="${I_NOTAS:-}"
else
  echo "::error::gatilho não esperado: só repository_dispatch e workflow_dispatch publicam" >&2
  exit 1
fi

# A versão vira nome de tag e o URL vira um download: nada passa sem a forma certa.
# [[ =~ ]] do bash, e não grep: o grep confere LINHA a linha, e "1.2.3<quebra>resto"
# passava por ter uma linha válida, injetando uma segunda linha na saída. Aqui ^ e $
# valem para a string inteira.
RE_VERSAO='^[0-9]+\.[0-9]+\.[0-9]+$'
if [[ ! "$VERSAO" =~ $RE_VERSAO ]]; then
  echo "::error::versão inválida; use o formato 1.2.3" >&2
  exit 1
fi
# Só o domínio do EAS (expo.dev ou subdomínio dele), sem espaço, aspas nem quebra de
# linha. O padrão antigo, [a-z0-9.-]*expo\.dev, aceitava "evilexpo.dev".
RE_URL='^https://(expo\.dev|[a-z0-9-]+\.expo\.dev)/[A-Za-z0-9._~/%?=&-]+$'
if [[ ! "$APK_URL" =~ $RE_URL ]]; then
  echo "::error::URL do artefato fora do domínio do EAS (https://expo.dev/...)" >&2
  exit 1
fi
# As notas só viram texto da release. Limite para não estourar o corpo nem a saída.
if [ "$(printf '%s' "$NOTAS" | wc -c)" -gt 8000 ]; then
  echo "::error::notas da versão passam de 8000 bytes" >&2
  exit 1
fi

# Delimitador aleatório por execução: notas contendo a palavra do delimitador não
# podem fechar o bloco antes da hora e injetar outra saída.
DELIM="NOTAS_$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
if printf '%s' "$NOTAS" | grep -qF "$DELIM"; then
  echo "::error::notas contêm o delimitador sorteado; repita a execução" >&2
  exit 1
fi
{
  printf 'versao=%s\n' "$VERSAO"
  printf 'apk_url=%s\n' "$APK_URL"
  printf 'notas<<%s\n%s\n%s\n' "$DELIM" "$NOTAS" "$DELIM"
} >> "$GITHUB_OUTPUT"
