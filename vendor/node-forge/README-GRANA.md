# node-forge 1.4.0 com a correção do DigestAlgorithm

Por que existe: o GHSA-86w9-cpqp-85rv (CVE-2026-85393, 03/09/2026) afeta toda node-forge até a
1.4.0, e não há versão corrigida publicada. Na verificação de assinatura RSA PKCS#1 v1.5 o
`DigestAlgorithm` aninhado aceitava elementos extras, e com expoente público baixo (e = 3) dá
para forjar assinatura para qualquer mensagem. Aqui ela só roda no @expo/cli e no
@expo/code-signing-certificates, não chega ao APK.

O que é: o tarball oficial `node-forge-1.4.0.tgz` do npm (mesmo sha512 do `package-lock.json`
anterior, conferido em 15/10/2026), só com `lib/`, `LICENSE`, `README.md` e `package.json`
(sem `dist/` e `flash/`, pacotes de navegador que ninguém aqui carrega; `files` e
`scripts`/`devDependencies` ajustados). A única mudança de código é a do PR
digitalbazaar/forge#1152 em `lib/rsa.js`: o `DigestAlgorithm` tem de ter só o OID e o NULL
opcional. Licença original (BSD-3-Clause OR GPL-2.0) em `./LICENSE`.

Como entra: dependência `"node-forge": "file:./vendor/node-forge"` e override
`"node-forge": "$node-forge"` no `package.json`. Teste: `__tests__/vendor-braces-node-forge.cjs`
(usa o vetor de ataque do próprio PR; na 1.4.0 original a assinatura forjada passa).

Atenção: o `npm audit` não audita pacote ligado por `file:`. Ele fica em zero, e também deixa
de avisar de advisory NOVO da node-forge. Quem cuida das dependências confere o GHSA à mão.

Quando apagar: quando sair a 1.4.1 (ou outra) com a correção. Troque a dependência e o
override pela versão publicada (ou tire os dois), apague esta pasta e rode `npm audit`.
