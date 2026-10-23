'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const fonte = fs.readFileSync(require('node:path').join(__dirname, '../tools/admin-local/web/telas/_publicacoes-reais.js'), 'utf8');
const box = { Date, Intl, URLSearchParams, console };
vm.runInNewContext(fonte.replace(/^export /gm, '') + '\nglobalThis.api = { dadosReais, resumirLote, estadoApresentacaoJob, capacidadeDaPeca, criarClientePublicacoes };', box);
const api = box.api;
const id = n => `${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const job = (rede, n) => ({ jobId: id(n), loteId: id('3'), snapshotId: id('4'), revisao: 1,
  destino: { rede, contaId: rede, formato: 'feed' }, estado: 'publicado', atualizadoEm: new Date().toISOString(), recibos: [] });
const fb = job('facebook', '1'), ig = job('instagram', '2');
assert.notEqual(api.resumirLote([fb, ig]).rotulo, 'Publicado', 'sem readback não é sucesso');
assert.equal(api.estadoApresentacaoJob(fb), 'precisa-conferir');
const provado = j => ({ ...j, remotoId: j.destino.rede + '-post', recibos: [{ reciboId: id('5'), operacao: 'verificar-publicacao', estado: 'confirmado', remotoId: j.destino.rede + '-post' }] });
assert.equal(api.resumirLote([provado(fb), provado(ig)], { integral: true }).completo, true);
assert.equal(api.resumirLote([provado(fb), provado(ig)]).completo, false, 'página parcial não comprova lote completo');
assert.equal(api.resumirLote([provado(fb)]).completo, false, 'uma rede não comprova as duas');
assert.equal(api.resumirLote([provado(fb), ig]).parcial, true);
assert.equal(api.dadosReais({ ok: true, dados: { contractVersion: 'e5.real.v2', modo: 'real' } }).modo, 'real');
// Cláusula "Stories fora dos pedidos novos" revogada pelo autor em 23/10: Stories só no Instagram, uma mídia.
const jpeg = { tipo: 'imagem', mime: 'image/jpeg' };
assert.equal(api.capacidadeDaPeca({ midias: [jpeg] }, 'instagram', 'stories').disponivel, true);
assert.equal(api.capacidadeDaPeca({ midias: [jpeg] }, 'facebook', 'stories').disponivel, false);
assert.equal(api.capacidadeDaPeca({ midias: [jpeg, jpeg] }, 'instagram', 'stories').disponivel, false);
console.log('admin-confiabilidade-consumidor: readback por rede, parcial sem falso sucesso, v1/v2 e Stories só no Instagram OK');
