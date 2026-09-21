# Maestri no Grana.

Esta pasta versiona os oito papéis do workspace para que M1 e M2 usem as
mesmas responsabilidades, política de modelos e gate de escalonamento para
Opus.

## Instalação na M1

1. Atualize o repositório em `E:\GranaPonto` com `git pull`.
2. Instale e abra o Maestri apontando o workspace para `E:\GranaPonto`.
3. Confirme os papéis com `maestri role list`.
4. Recrute os agentes usando os papéis versionados em `.maestri/roles`.

Os arquivos de papel não usam caminho absoluto: cada agente trabalha na raiz
do workspace que contém esta pasta. Isso permite usar a mesma configuração em
`C:\Users\User\Music\GranaPonto` na M2 e em `E:\GranaPonto` na M1.

## Limite do que o Git transporta

`.maestri/roles` transporta os papéis. O layout visual do canvas, terminais,
notas, fichários e conexões pertencem ao estado do workspace do aplicativo e
não aparecem nesta pasta. Quando o workspace de origem estiver disponível no
mesmo Maestri, a forma suportada de copiar esse estado é criar outro workspace
com `maestri workspace create ... --from "Grana."`, que retargeta os caminhos
para a nova raiz.

Os documentos que formam o contexto compartilhado continuam versionados na
raiz do repositório (`AGENTS.md`, `context.md`, `PRODUCT.md`, `DESIGN.md`,
`FUNIL.md` e `CLAUDE.md`). Não coloque tokens, credenciais ou conteúdo de
`.env` nesta pasta.
