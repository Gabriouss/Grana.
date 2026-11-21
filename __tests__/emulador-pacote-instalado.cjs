/* `node scripts/emulador.cjs estado` compara o pacote pelo nome exato (21/11/2026).
 *
 * O estado dizia "APK de desenvolvimento (com.gabriouss.grana) instalado: sim"
 * com só o com.gabriouss.grana.sentinelqa no emulador, porque procurava o nome
 * como pedaço do texto do `pm list packages`; `abrir dev` falhava logo depois.
 * As listas abaixo seguem o formato real do `pm list packages` (com \r\n do
 * adb no Windows).
 * Rode com: node __tests__/emulador-pacote-instalado.cjs */
const assert = require('node:assert/strict');
const path = require('node:path');
const raiz = process.env.RAIZ_DO_MODULO || path.join(__dirname, '..');
const { pacoteInstalado } = require(path.join(raiz, 'scripts/emulador.cjs'));

assert.equal(typeof pacoteInstalado, 'function', 'scripts/emulador.cjs exporta pacoteInstalado');
const soQa = 'package:com.android.chrome\r\npackage:com.gabriouss.grana.sentinelqa\r\npackage:host.exp.exponent\r\n';
const comDev = 'package:com.gabriouss.grana.sentinelqa\npackage:com.gabriouss.grana\n';

assert.equal(pacoteInstalado(soQa, 'com.gabriouss.grana'), false, 'só o sentinelqa: APK de desenvolvimento NÃO instalado');
assert.equal(pacoteInstalado(soQa, 'host.exp.exponent'), true, 'Expo Go reconhecido com \\r\\n do Windows');
assert.equal(pacoteInstalado(comDev, 'com.gabriouss.grana'), true, 'APK de desenvolvimento instalado ao lado do sentinelqa');
assert.equal(pacoteInstalado('', 'com.gabriouss.grana'), false, 'lista vazia');
assert.equal(pacoteInstalado('package:com.gabriouss.grana.sentinelqa', 'com.gabriouss.gran'), false, 'prefixo não conta');
console.log('emulador-pacote-instalado: 6 checagens ok');
