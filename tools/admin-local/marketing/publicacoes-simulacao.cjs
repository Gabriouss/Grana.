'use strict';
const { backend } = require('../adaptadores/marketing-backend.cjs');
module.exports = {
  listar: () => backend().simulacao({ recurso: 'publicacoes-simulacao', modo: 'simulacao', acao: 'listar' }),
  executar: (_raiz, corpo) => backend().simulacao(corpo),
};
