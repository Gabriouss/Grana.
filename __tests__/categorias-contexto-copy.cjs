/* H02: renderiza o componente REAL, sem rede, cobrindo estados de consulta. */
const assert = require('node:assert/strict');
const { componente, textos } = require('./_copy-componentes-reais.cjs');
const Contexto = componente('components/CategoriasContexto.tsx').default;
for (const [resultado, erro, anuncia] of [
  [null, null, false], [null, 'Sem conexão.', false],
  [{ doCache: false }, null, false], [{ doCache: true }, null, true],
  [{ doCache: false }, 'Sem conexão.', true], [{ doCache: true }, 'Sem conexão.', true],
]) {
  let tentativas = 0;
  const arvore = Contexto({ visao: 'tudo', onChange() {}, resultado, erro, carregar: () => { tentativas++; } });
  const texto = textos(arvore).join(' ');
  assert.equal(texto.includes('Último resultado disponível'), anuncia,
    'so anuncia resultado anterior quando ele existe e cache/erro justificam');
  if (erro) {
    assert.ok(texto.includes('Toque para tentar novamente.'), 'erro conserva orientacao');
    const acao = arvore.props.children.find(n => n?.props?.onPress);
    acao.props.onPress();
    assert.equal(tentativas, 1, 'acao continua chamando carregar uma vez');
  }
}
console.log('categorias-contexto-copy: 6 estados reais OK');
