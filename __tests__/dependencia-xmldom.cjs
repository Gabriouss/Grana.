/*
 * O aviso de segurança do `@xmldom/xmldom`, e por que ele está resolvido pela
 * metade de propósito.
 *
 * Achado A3 da auditoria de segurança de 23/09/2026: `npm audit` acusava 1
 * high e 15 moderate. O high é o `@xmldom/xmldom`, que aparece DUAS vezes na
 * árvore, por caminhos diferentes:
 *
 *   plist          → @xmldom/xmldom ^0.9.10  (estava em 0.9.11, vulnerável)
 *   @expo/plist    → @xmldom/xmldom ^0.8.8   (0.8.14, vulnerável, sem 0.8.15)
 *
 * A cópia do `plist` sobe para 0.9.12 por `overrides`, que é um salto de
 * patch dentro da mesma major: risco nenhum.
 *
 * A do `@expo/plist` FICA. Não por descuido: a única versão corrigida é a
 * 0.9.12, e a 0.9 quebra o contrato que o `@expo/plist` usa. Conferido no
 * fonte instalado, não suposto:
 *
 *   - `@expo/plist/build/parse.js:69` chama
 *     `new DOMParser({ errorHandler() {} }).parseFromString(xml)`, com UM
 *     argumento;
 *   - em 0.9, `parseFromString` começa com
 *     `if (!isValidMimeType(mimeType)) throw new TypeError(...)`.
 *
 * Forçar 0.9 ali faria o `parse` estourar. Isso só apareceria durante um
 * `eas build`, que sai da cota mensal do autor e não dá para testar daqui.
 *
 * O risco que fica é de build, não do aplicativo: esses pacotes leem XML que
 * nós mesmos escrevemos (`app.json`, Info.plist, AndroidManifest) e não vão
 * para o APK nem para o pacote da web. Nenhuma entrada de terceiro chega lá.
 *
 * Este teste é o bilhete para a próxima sessão: quando a Expo passar a chamar
 * `parseFromString` com mimeType, a terceira checagem falha, e aí o
 * `overrides` pode virar global e o high some de vez.
 */
const fs = require('node:fs');

let total = 0;
let falhas = 0;
function conferir(nome, ok, visto) {
  total++;
  if (ok) return;
  falhas++;
  console.error(`x ${nome}${visto === undefined ? '' : ` — visto: ${JSON.stringify(visto)}`}`);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
conferir(
  'o override mantém a cópia do plist numa versão corrigida',
  pkg.overrides?.plist?.['@xmldom/xmldom'] === '^0.9.12',
  pkg.overrides?.plist
);
conferir(
  'e o override NÃO é global, porque 0.9 quebra o @expo/plist',
  pkg.overrides?.['@xmldom/xmldom'] === undefined,
  pkg.overrides
);

const caminhoParse = 'node_modules/@expo/plist/build/parse.js';
if (fs.existsSync(caminhoParse)) {
  const parse = fs.readFileSync(caminhoParse, 'utf8');
  const chamaSemMimeType = /parseFromString\(xml\)/.test(parse);
  conferir(
    'o @expo/plist ainda chama parseFromString sem mimeType (se falhar, dá para subir o override para global)',
    chamaSemMimeType,
    chamaSemMimeType
  );
} else {
  console.log('aviso: @expo/plist não instalado — checagem do bloqueio pulada');
}

const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const copias = Object.entries(lock.packages)
  .filter(([caminho]) => caminho.endsWith('@xmldom/xmldom'))
  .map(([caminho, info]) => `${caminho}@${info.version}`);
conferir('a árvore tem exatamente as duas cópias conhecidas', copias.length === 2, copias);
conferir(
  'e a do plist está em 0.9.12 ou acima',
  copias.some((c) => c.includes('plist/node_modules/@xmldom/xmldom@0.9.1') && !c.endsWith('@0.9.11')),
  copias
);

console.log(`\n${total - falhas}/${total} checagens da dependência xmldom passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
