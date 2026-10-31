'use strict';
// Pasta própria do painel: o tradutor caminho lógico <-> pasta física mora em catalogo.cjs
// (os testes carregam o catálogo em sandbox). Este arquivo só o expõe a scripts e ao servidor.
module.exports = require('./catalogo.cjs').pastaPainel;
