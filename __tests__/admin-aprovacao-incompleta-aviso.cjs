// Aviso "Aprovação incompleta" nunca sai com lista vazia (achado do Lynx, 23/10/2026).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync('tools/admin-local/web/telas/aprovacao.js', 'utf8');
const m = /const ROTULOS_ETAPA_APROVACAO[^]*?\n}\n/.exec(src);
assert.ok(m, 'função do aviso existe');
const aviso = vm.runInNewContext(`${m[0]}; avisoAprovacaoIncompleta`);
const etapas = (o) => ({ aceite: { estado: 'concluido' }, ajuste: { estado: 'nao-necessario' }, promocao: { estado: 'concluido' }, plano: { estado: 'concluido' }, ...o });
// Pendente (com falha registrada) entra na lista.
assert.match(aviso({ etapas: etapas({ plano: { estado: 'pendente', codigo: 'falhou' } }) }), /Falta concluir: calendário\. /);
assert.match(aviso({ etapas: etapas({ aceite: { estado: 'pendente' }, promocao: { estado: 'pendente' } }) }), /Falta concluir: aceite, promoção\./);
// Etapa ausente ou com estado fora do contrato também conta como faltando.
assert.match(aviso({ etapas: { aceite: { estado: 'concluido' }, ajuste: { estado: 'concluido' }, promocao: { estado: 'concluido' } } }), /Falta concluir: calendário\./);
assert.match(aviso({ etapas: etapas({ ajuste: { estado: 'erro' } }) }), /Falta concluir: encerramento do ajuste\./);
// Sem dado de etapas (resposta sem conclusão): não lista nada e diz isso.
for (const c of [null, undefined, {}, { estado: 'incompleta', etapas: {} }, { etapas: null }]) {
  const t = aviso(c);
  assert.ok(!/Falta concluir/.test(t) && /Não foi possível ver quais etapas faltam/.test(t) && !/: \./.test(t), JSON.stringify(c));
}
// Nenhuma saída tem lista vazia.
for (const c of [null, {}, { etapas: etapas({}) }, { etapas: etapas({ plano: { estado: 'pendente' } }) }]) assert.ok(!/: \./.test(aviso(c)));
console.log('ok admin-aprovacao-incompleta-aviso');
