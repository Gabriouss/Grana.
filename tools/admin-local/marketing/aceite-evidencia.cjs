'use strict';
// Validador único de aceite do autor (W-C1, 14/10). A implementação mora em catalogo.cjs, que
// também a usa no enriquecimento; este módulo só a reexporta para os demais consumidores.
const { EVIDENCIAS_AUTOR, EVIDENCIA_DERIVADA, DERIVACOES_AUTORIZADAS, aceiteValido } = require('./catalogo.cjs');
module.exports = { EVIDENCIAS_AUTOR, EVIDENCIA_DERIVADA, DERIVACOES_AUTORIZADAS, aceiteValido };
