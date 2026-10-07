'use strict';
// Design System (dono: Keel, dados para a tela do Lumen). Só leitura local de design-system/.

const fs = require('fs');
const path = require('path');
const { RAIZ } = require('../config.cjs');

const DS = path.join(RAIZ, 'design-system');

function listar(sub, filtro) {
  try {
    return fs.readdirSync(path.join(DS, sub)).filter((n) => !n.startsWith('.') && (!filtro || filtro.test(n))).sort()
      .map((nome) => ({ nome, url: `/design-system/${sub}/${encodeURIComponent(nome)}` }));
  } catch { return []; }
}

function texto(rel) {
  try { return fs.readFileSync(path.join(DS, rel), 'utf8'); } catch { return null; }
}

function variante(nome) {
  const [familia, ...resto] = nome.replace(/\.svg$/, '').split('-');
  return { familia, variante: resto.join('-') };
}

function resumo() {
  let tokens = null;
  try { tokens = JSON.parse(texto('tokens/tokens.json')); } catch { tokens = null; }
  return {
    status: tokens ? 'ok' : 'erro',
    tokens,
    tokensCss: '/design-system/tokens/tokens.css',
    tokensJson: '/design-system/tokens/tokens.json',
    marca: listar('marca', /\.svg$/i).map((m) => ({ ...m, ...variante(m.nome) })),
    logotipoOficial: '/design-system/marca/logotipo-gradiente.svg',
    iconeApp: '/design-system/marca/icone-circular.svg',
    fontes: [
      { familia: 'Neue Machina', peso: 300, estilo: 'Light', url: '/assets/fonts/NeueMachina-Light.otf' },
      { familia: 'Neue Machina', peso: 400, estilo: 'Regular', url: '/assets/fonts/NeueMachina-Regular.otf' },
    ],
    regraTipografica: 'Só Light e Regular. Nunca font-weight acima de 400: a fonte não tem bold e o navegador sintetiza um falso negrito.',
    previews: listar('previews', /\.html$/i),
    pagina: '/design-system/pagina/design-system.src.html',
    mockups: listar('marketing-mockups', /\.(png|jpe?g|webp)$/i),
    tomDeVoz: texto('TOM_DE_VOZ.md'),
    readme: texto('README.md'),
  };
}

module.exports = { resumo };
