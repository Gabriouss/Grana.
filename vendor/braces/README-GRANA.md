# braces 3.0.3 com guarda de profundidade

Por que existe: o GHSA-vfj7-8cjw-p6xm (CVE-2026-93687, 18/09/2026) afeta toda braces até a
3.0.3, e não há versão corrigida publicada. Um padrão com chaves ou parênteses muito aninhados,
abaixo do limite de 10.000 caracteres, estoura a pilha dos percursos recursivos e o `RangeError`
derruba o processo. Aqui ela só roda em ferramenta (micromatch, Metro, @expo/cli), não chega
ao APK.

O que é: o tarball oficial `braces-3.0.3.tgz` do npm (mesmo sha512 do `package-lock.json`
anterior, conferido em 15/10/2026), com a correção do PR micromatch/braces#88:
`lib/assert-depth.js` novo (percurso iterativo que recusa AST com mais de `MAX_DEPTH` = 128
níveis ou com ciclo), chamado no início de `compile`, `expand` e `stringify`, e o mesmo teto
no `parse`, ao empilhar chave e parêntese. Nenhuma outra linha mudou. O `package.json` perdeu
`scripts` e `devDependencies`. Licença MIT original em `./LICENSE`.

Como entra: dependência `"braces": "file:./vendor/braces"` e override `"braces": "$braces"`
no `package.json`. Teste: `__tests__/vendor-braces-node-forge.cjs`.

Atenção: o `npm audit` não audita pacote ligado por `file:`. Ele fica em zero, e também deixa
de avisar de advisory NOVO da braces. Quem cuida das dependências confere o GHSA à mão.

Quando apagar: quando sair braces acima da 3.0.3 com a correção. Troque a dependência e o
override pela versão publicada (ou tire os dois), apague esta pasta e rode `npm audit`.
