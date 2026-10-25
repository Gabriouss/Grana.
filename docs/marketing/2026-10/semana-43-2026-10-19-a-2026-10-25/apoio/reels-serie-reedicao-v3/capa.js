/* Capas 1080x1920 da série v3. Variante de capa do guia estático (seção 13): conteúdo nos 1080x1440 centrais
   (y 240 a 1680), painel até a borda. Arquétipo E: blocos do app feitos em HTML, flutuando, sem aparelho e sem print. */
const N = new URLSearchParams(location.search).get('n') || 'f';
const put = (html, x, y, s = 1, r = 0, ox = 0, oy = 0, z = '') => `<div class="cw" style="left:${x}px;top:${y}px;transform:rotate(${r}deg) scale(${s});${z}"><div class="abs" style="left:${-ox}px;top:${-oy}px">${html}</div></div>`;
const box = (w, h, inner, extra = '') => `<div class="box" style="left:0;top:0;width:${w}px;height:${h}px;${extra}">${inner}</div>`;
const A = (x, y, html, st = '') => `<div class="abs" style="left:${x}px;top:${y}px;${st}">${html}</div>`;

const CAPAS = {
  /* Fatura e parcelas (escuro) */
  f: { claro: false, t: ['Quanto da sua fatura', '<em>já é parcela?</em>'], fs: 80,
    G: { x: -520, y: 420, d: 1560, r: 160 }, ic: [['cartao', 900, 640, 250, 14], ['calendario', -80, 1330, 170, -12]],
    cards: () =>
      put(box(640, 330, `${A(44, 40, '<span class="dot"></span>Cartão Principal', 'font-size:34px')}${A(46, 92, '•••• 4821', 'font-size:28px;color:var(--faint);letter-spacing:.06em')}
        ${A(46, 150, 'Fatura atual', 'font-size:28px;color:var(--faint)')}${A(44, 186, 'R$ 306,90', 'font-size:68px;color:#ADFBE3')}
        ${A(46, 276, 'Limite: R$ 3.500,00', 'font-size:26px;color:var(--faint)')}${A(560, 270, '9%', 'font-size:28px')}
        <div class="bar" style="left:46px;top:316px;width:548px;height:8px"><i style="width:9%"></i></div>`, 'height:350px'), 120, 700, 1, -4)
      + put(box(780, 140, `${A(40, 30, 'Notebook de trabalho <span class="tag">1/3</span>', 'font-size:32px')}${A(40, 82, 'Outros · 19 out', 'font-size:24px;color:var(--faint)')}${A(0, 30, '− R$ 415,95', 'left:auto;right:40px;white-space:nowrap;font-size:32px;color:#7fdcf0')}`), 150, 1095, 1, 3)
      + put(box(780, 140, `${A(40, 30, 'Fone de ouvido <span class="tag">1/3</span>', 'font-size:32px')}${A(40, 82, 'Outros · 04 out', 'font-size:24px;color:var(--faint)')}${A(0, 30, '− R$ 120,00', 'left:auto;right:40px;white-space:nowrap;font-size:32px;color:#7fdcf0')}`), 110, 1255, 1, -2)
      + put(box(420, 120, `${A(36, 22, 'Vence em', 'font-size:24px;color:var(--faint)')}${A(36, 56, '02 nov 2026', 'font-size:36px')}`, 'border-color:rgba(173,251,227,.6)'), 560, 1420, 1, 5) },
  /* Quanto pode gastar hoje (claro) */
  1: { claro: true, t: ['Quanto você pode', '<em>gastar hoje?</em>'], fs: 86,
    disco: { x: -900, y: -150, r: 2350 }, ic: [['dinheiro', 860, 700, 250, 12], ['calendario', -90, 1380, 220, -15], ['tempo', 920, 1260, 140, 18]],
    cards: () =>
      put(livreCard('c'), 95, 730, .86, -3, 35, 742)
      + put(`<div class="box" style="left:0;top:0;width:1010px;height:220px;background:transparent;border:0">${acao('k1', 0, 0, ic.mic(), 'Lançar por voz')}${acao('k2', 515, 0, ic.cam, 'Fotografar nota')}${acao('k3', 0, 120, ic.clip, 'Colar comprovante')}${acao('k4', 515, 120, ic.doc, 'Importar extrato')}</div>`, 95, 1100, .86, 2)
      + put(box(430, 120, `${A(36, 22, 'Livre no total', 'font-size:24px;color:var(--faint)')}${A(36, 56, '13 dias restantes', 'font-size:34px')}`, 'border-color:rgba(173,251,227,.6)'), 560, 1380, 1, -5) },
  /* Metas e cofrinhos (claro) */
  3: { claro: true, t: ['Qual é a sua', '<em>próxima meta?</em>'], fs: 96,
    disco: { x: -300, y: -420, r: 2400 }, ic: [['desafios', -110, 820, 250, -14], ['salvo', 890, 1180, 220, 16]],
    cards: () =>
      put(metaCard('c', 0, 0, 0), 62, 805, .95, -5) + put(metaCard('c', 1, 0, 0), 382, 755, .98, 1, 0, 0, 'z-index:2')
      + put(metaCard('c', 2, 0, 0), 708, 800, .95, 5)
      + put(box(560, 150, `${A(40, 30, 'Mural de conquistas', 'font-size:32px')}${A(40, 84, '7 de 12', 'font-size:34px;color:#ADFBE3')}<div class="bar" style="left:200px;top:100px;width:320px"><i style="width:58.3%"></i></div>`), 130, 1260, 1, -3)
      + put(box(330, 84, A(30, 22, 'Nível 3 · Aprendiz', 'font-size:28px;color:#ADFBE3'), 'border-radius:999px;border-color:rgba(173,251,227,.6)'), 600, 1440, 1, 4) },
  /* Compra por impulso (escuro) */
  4: { claro: false, t: ['Cabe no', '<em>meu mês?</em>'], fs: 120,
    G: { x: 380, y: 520, d: 1600, r: -30 }, ic: [['mercado', -90, 700, 240, -12], ['cartao', 920, 1440, 170, 15]],
    cards: () =>
      put(`<div class="bal" style="position:absolute;left:0;top:0;background:#ADFBE3;color:#052229;border-radius:36px;border-bottom-right-radius:10px;font-size:38px;padding:26px 36px;white-space:nowrap">Quanto gastei com mercado?</div>`, 400, 715, 1, 2)
      + put(box(720, 300, `${A(40, 34, 'Em outubro de 2026, você gastou <b class="pc" style="background:#ADFBE3;color:#052229">R$ 561,25</b> em Alimentação, sem contar compras no crédito. Houve também <b class="pc" style="background:#00a6ca;color:#052229">R$ 112,00</b> em compras no crédito nessa mesma categoria.', 'width:640px;font-size:30px;line-height:42px')}${A(40, 262, '<span class="dot" style="width:12px;height:12px"></span>Números conferidos', 'font-size:22px;color:var(--accent)')}`, 'height:310px;border-bottom-left-radius:10px'), 90, 850, 1, -2)
      + `<img class="abs" src="assets/granabo-feliz.png" style="left:620px;top:1180px;width:320px;transform:rotate(6deg);filter:drop-shadow(0 30px 40px rgba(0,0,0,.5))">`
      + put(`<div class="split" style="left:0;top:0"><small>Sem o crédito</small><b>R$ 561,25</b><small>Alimentação</small></div>`, 90, 1210, .82, -4)
      + put(`<div class="split" style="left:0;top:0;border-color:rgba(0,166,202,.6)"><small>No crédito</small><b style="color:#7fdcf0">R$ 112,00</b><small>mesma categoria</small></div>`, 150, 1390, .82, 3) },
  /* Comprometimento futuro (escuro) */
  5: { claro: false, t: ['Quanto do seu dinheiro', '<em>já tem destino?</em>'], fs: 70,
    G: { x: -400, y: 300, d: 1640, r: 40 }, ic: [['calendario', 900, 620, 260, 12], ['graficos', -80, 1400, 180, -15]],
    cards: () =>
      put(grafico('c', 0), 100, 720, .86, -3, 35, 0)
      + put(`<div style="position:absolute;left:0;top:0;width:800px;height:230px;border-radius:40px;background:#0b2d35;border:2px solid #ADFBE3;box-shadow:0 0 70px rgba(173,251,227,.25),0 50px 110px rgba(0,0,0,.6)">${A(46, 34, 'Total comprometido nos próximos 6 meses', 'font-size:30px;color:var(--faint)')}${A(46, 90, 'R$ 10.050,75', 'font-size:96px;line-height:110px;color:#ADFBE3')}</div>`, 150, 1250, .92, 3) },
};
const C = CAPAS[N];
document.body.classList.toggle('claro', C.claro);
document.body.classList.add('capa');
const st = $('#stage');
if (C.claro) {
  const d = C.disco;
  st.insertAdjacentHTML('beforeend', `<div id="painel"><div class="disco" style="left:${d.x}px;top:${d.y}px;width:${d.r}px;height:${d.r}px"></div><div class="gota" style="left:-70px;top:1180px;width:150px;height:200px"></div><div class="brilho"></div></div>`);
} else {
  st.insertAdjacentHTML('beforeend', `<div id="painelE"><img id="gsym" src="assets/simbolo-menta-sem-ponto.svg" style="left:${C.G.x}px;top:${C.G.y}px;width:${C.G.d}px;transform:rotate(${C.G.r}deg)"></div>`);
}
const icSrc = (n) => C.claro ? `assets/ic-${n}.png` : `assets/icm-${n}.png`;
st.insertAdjacentHTML('beforeend', C.ic.map(([n, x, y, t, r]) => `<img class="icf" src="${icSrc(n)}" style="left:${x}px;top:${y}px;width:${t}px;transform:rotate(${r}deg)">`).join('')
  + `<div id="cards">${C.cards()}</div>
  <div id="cantosC"><img src="assets/${C.claro ? 'logotipo-petroleo' : 'logotipo-gradiente'}.svg" style="left:84px;top:300px;width:178px">
   <div class="rot" style="right:62px;top:314px">RÁPIDO</div><div class="rot" style="left:84px;top:1612px">FÁCIL</div><div class="rot" style="right:62px;top:1612px">PRÁTICO</div></div>
  <h1 id="tit" style="font-size:${C.fs}px;line-height:${Math.round(C.fs * 1.08)}px">${C.t.join('<br>')}</h1>`);
document.fonts.load('800 40px NMU').then(() => document.fonts.ready).then(() => { window.__ready = true; });
