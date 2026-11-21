// Achado 51-A (21/11/2026): com fonte do sistema 1,3, "Saldo do mês" quebrava
// no resumo de Lançamentos, deixava "mês" viúva (regra 29) e descia o valor em
// relação a Entradas e Saídas. Os três rótulos ficam em uma linha e encolhem
// até 0,75 se faltar coluna. Medido com a Neue Machina Light (legenda 12 dp,
// letterSpacing 0,5): 115 dp em 1,3 contra coluna de 92 dp a 360 dp, razão
// 0,80, acima do mínimo. A medida em si fica no comentário do estilo; aqui se
// trava que os três rótulos continuam com o mesmo mecanismo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fonte = fs.readFileSync(path.join(__dirname, '..', 'app', '(app)', 'lancamentos.tsx'), 'utf8');

let falhas = 0;
for (const rotulo of ['Entradas', 'Saídas', 'Saldo do mês']) {
  try {
    const m = fonte.match(new RegExp('<Text style=\\{styles\\.monthSummaryLabel\\}([^>]*)>' + rotulo + '</Text>'));
    assert.ok(m, `rótulo "${rotulo}" não encontrado no resumo`);
    assert.match(m[1], /numberOfLines=\{1\}/, `"${rotulo}" sem numberOfLines={1}`);
    assert.match(m[1], /adjustsFontSizeToFit/, `"${rotulo}" sem adjustsFontSizeToFit`);
    const escala = Number((m[1].match(/minimumFontScale=\{([\d.]+)\}/) || [])[1]);
    assert.ok(escala > 0 && escala <= 0.8, `"${rotulo}": minimumFontScale ${escala} não cobre 360 dp em 1,3 (precisa <= 0,80)`);
    console.log('ResumoRotuloUmaLinha OK ' + rotulo);
  } catch (e) { falhas++; console.error('ResumoRotuloUmaLinha FALHA ' + e.message); }
}
console.log(`ResumoRotuloUmaLinha ${3 - falhas}/3`);
process.exitCode = falhas ? 1 : 0;
