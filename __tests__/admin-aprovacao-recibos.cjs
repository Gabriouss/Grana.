'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-recibos-'));
process.env.GRANA_ADMIN_PASTA_CONTA = path.join(raiz, 'conta');
const c = require('../tools/admin-local/marketing/catalogo.cjs');
const ap = require('../tools/admin-local/marketing/aprovacoes.cjs');
const cal = require('../tools/admin-local/marketing/calendario.cjs');
const semana = 'docs/marketing/2099-01/semana-01-2099-01-01-a-2099-01-07';
const gravar = (rel, texto) => { const abs = path.join(raiz, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, texto); };
(async () => {
  try {
    gravar(semana + '/INDICE.md', '# Teste\n');
    gravar(semana + '/para-aprovacao/pecas/E01.jpg', 'arte v1');
    const copy = semana + '/para-aprovacao/pecas/COPYS-FINAIS.md';
    gravar(copy, '## E01 - Teste\n\n**Legenda:** Texto v1.\n');
    const p = c.montarCatalogo(raiz).find(p => p.tipo === 'imagem');
    let tentativas = 0;
    let r = await ap.aprovarEFechar(raiz, p.id, { versao: p.versao, confirmacao: true }, {
      promover: async () => { tentativas++; throw Object.assign(Error('Disco indisponível'), { codigo: 'disco' }); },
    });
    assert.equal(r.conclusao.estado, 'incompleta');
    assert.equal(r.conclusao.etapas.aceite.estado, 'concluido');
    assert.equal(r.conclusao.etapas.promocao.estado, 'pendente');
    assert.equal(c.obterPeca(raiz, p.id).conclusaoAprovacao.estado, 'incompleta');
    assert.equal(ap.listarAprovacoes(raiz).aprovacoes.length, 1);
    r = await ap.aprovarEFechar(raiz, p.id, { versao: p.versao, confirmacao: true });
    assert.equal(r.conclusao.estado, 'concluida');
    assert.equal(tentativas, 1);
    const promovida = c.obterPeca(raiz, r.promocao.id);
    assert.equal(promovida.conclusaoAprovacao.estado, 'concluida');
    assert.equal(ap.listarAprovacoes(raiz).aprovacoes.length, 2, 'aceite original e prova de promoção, sem novo aceite');
    await cal.planejar(raiz, { id: promovida.id, versao: promovida.versao, data: '2099-01-10', hora: '10:00', canal: 'instagram-feed' });
    gravar(copy, '## E01 - Teste\n\n**Legenda:** Texto v2.\n');
    const nova = c.obterPeca(raiz, promovida.id);
    let planos = 0;
    r = await ap.aprovarEFechar(raiz, nova.id, { versao: nova.versao, confirmacao: true }, {
      planejar: async () => { planos++; throw Object.assign(Error('Disco'), { codigo: 'disco' }); },
    });
    assert.equal(r.conclusao.estado, 'incompleta', 'aceite salvo não é conclusão com plano pendente');
    assert.equal(r.conclusao.etapas.plano.estado, 'pendente');
    assert.equal(planos, 1);
    const total = ap.listarAprovacoes(raiz).aprovacoes.length;
    r = await ap.aprovarEFechar(raiz, nova.id, { versao: nova.versao, confirmacao: true });
    assert.equal(r.conclusao.estado, 'concluida');
    assert.equal(ap.listarAprovacoes(raiz).aprovacoes.length, total, 'Continuar não aceita duas vezes');
    const juntos = await Promise.all([ap.aprovarEFechar(raiz, nova.id, { versao: nova.versao, confirmacao: true }), ap.aprovarEFechar(raiz, nova.id, { versao: nova.versao, confirmacao: true })]);
    assert(juntos.every(r => r.conclusao.estado === 'concluida'));
    assert.equal(ap.listarAprovacoes(raiz).aprovacoes.length, total, 'duplo clique conserva um aceite por versão');
    assert.equal(cal.obterCalendario(raiz, '2099-01').itens.find(x => (x.peca?.id || x.id) === nova.id).data, '2099-01-10');
    console.log('admin-aprovacao-recibos: parcial persistido, retomada de promoção/plano, sem aceite duplicado OK');
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
