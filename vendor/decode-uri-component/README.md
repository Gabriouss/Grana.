# decode-uri-component 0.5.0, cópia CommonJS

Por que existe: a 0.5.0 corrige o GHSA-vcc3-ghjq-m6fr (negação de serviço ao decodificar
`%` malformado), e é a única das vulnerabilidades do `npm audit` que chega ao app instalado:
o expo-router 57 lê as URLs com `query-string` 7, que usa este pacote. Só que a 0.5.0 saiu
apenas como ESM, e o `query-string` 7 faz `require()` dela. Forçar a 0.5.0 original quebra
a navegação; forçar o `query-string` 9 também quebra (o expo-router chama `.parse` e
`.stringify`, que a 9 só exporta dentro de `default`).

O que é: o `index.js` da 0.5.0, do tarball oficial do npm (integridade sha512 conferida
com o registro em 15/10/2026), com uma única mudança: `export default function` vira
`function` + `module.exports` no fim. Licença MIT do autor original em `./license`.

Como entra, em duas linhas do `package.json`: a dependência
`"decode-uri-component": "file:./vendor/decode-uri-component"` e o override
`"query-string": { "decode-uri-component": "$decode-uri-component" }`. O `file:` direto
dentro do override NÃO serve: o npm resolve o caminho a partir do `query-string`
(`node_modules/query-string/vendor/...`) e grava no lock um pacote vazio.
Teste: `__tests__/decode-uri-component-vendor.cjs`.

Quando apagar: quando o expo-router deixar de depender do `query-string` 7 (ou quando sair
uma decode-uri-component corrigida em CommonJS). Confira com
`npm ls decode-uri-component`; se nada mais apontar para esta pasta, apague a pasta e o
override juntos. Aprovado pelo autor em 15/10/2026.
