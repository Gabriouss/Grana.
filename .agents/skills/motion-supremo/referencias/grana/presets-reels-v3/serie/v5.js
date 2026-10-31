/* V5 Comprometimento futuro. Tema escuro + assinatura "túnel": a câmera atravessa os portais dos seis meses,
   contas e parcelas convergem para o aparelho, o gráfico salta com as barras crescendo e o total trava em placa de aeroporto.
   Legendas entram esticadas na horizontal e se recolhem (o V4 freia de lado, o V3 vira, o V1 sobe). */
const BC = 'E:/Grana-temporarios/2026-10-25-reels-cinco-estilos-60fps/audio/sfx/';
$('#extra').textContent = `
#cap{top:120px}
#tun{position:absolute;left:0;top:0;width:1080px;height:1920px;transform-style:preserve-3d}
.gate{position:absolute;left:110px;top:330px;width:860px;height:1300px;border-radius:60px;border:6px solid rgba(173,251,227,.55);box-shadow:0 0 60px rgba(173,251,227,.25),0 0 60px rgba(173,251,227,.15) inset}
.gate b{position:absolute;left:56px;top:1130px;font-weight:300;font-size:120px;line-height:130px;color:#effffa}
.gate i{position:absolute;left:0;right:0;bottom:0;border-radius:0 0 54px 54px;background:linear-gradient(180deg,rgba(0,166,202,.45),rgba(0,166,202,.1));opacity:0}
.cc{position:absolute;width:660px;height:150px;border-radius:32px;background:#0b2d35;border:2px solid rgba(174,255,227,.3);box-shadow:0 30px 70px rgba(0,0,0,.5)}
.cc .n{position:absolute;left:34px;top:28px;font-size:32px}
.cc .k{position:absolute;left:34px;top:84px;font-size:26px;color:var(--faint)}
.cc .v{position:absolute;right:34px;top:28px;font-size:34px}
#tot{position:absolute;left:140px;top:1470px;width:800px;height:270px;border-radius:40px;background:#0b2d35;border:2px solid #ADFBE3;box-shadow:0 0 70px rgba(173,251,227,.3),0 50px 110px rgba(0,0,0,.6);transform-style:preserve-3d}
#tot small{position:absolute;left:46px;top:34px;font-size:32px;color:var(--faint)}
#totV{position:absolute;left:46px;top:96px;display:flex;gap:6px}
#totV span{display:inline-block;width:62px;height:120px;border-radius:12px;background:#052229;font-size:90px;line-height:120px;text-align:center;color:#ADFBE3}
#totV span.s{width:30px;background:none}
`;
const G = [
  ['g1', 'estica', 84, [[['Você', 0], ['sabe', .22], ['quanto', .721]], [['do', .88], ['seu', 1.14], ['dinheiro', 1.28, 'hl']]]],
  ['g2', 'estica', 100, [[['já', 1.66], ['está', 1.86]], [['comprometido', 2.08, 'hl']]]],
  ['g3', 'slam', 104, [[['nos', 2.76], ['próximos', 2.88]], [['meses?', 3.34, 'hl']]]],
  ['g4', 'estica', 88, [[['Junte', 4.106], ['as', 4.36], ['contas', 4.52, 'hl']], [['do', 4.86], ['mês', 4.98]]]],
  ['g5', 'estica', 80, [[['e', 5.24], ['as', 5.5], ['compras', 5.64]], [['parceladas', 5.94, 'hl'], ['no', 6.58], ['cartão', 6.76]]]],
  ['g6', 'slam', 110, [[['em', 7.2], ['um', 7.42]], [['lugar', 7.54, 'hl'], ['só.', 7.8]]]],
  ['g7', 'estica', 72, [[['O', 8.469], ['gráfico', 8.54, 'hl'], ['de', 8.94]], [['comprometimento', 8.98], ['futuro', 9.66]]]],
  ['g8', 'estica', 86, [[['soma', 10.1], ['parcelas', 10.46, 'hl']], [['e', 11.12], ['contas', 11.2], ['fixas', 11.54, 'hl']]]],
  ['g9', 'estica', 96, [[['dos', 11.96], ['próximos', 12.1]], [['seis', 12.64, 'hl'], ['meses', 12.88]]]],
  ['g10', 'estica', 100, [[['pra', 13.34], ['você', 13.6]], [['planejar', 13.8, 'mint']]]],
  ['g11', 'estica', 86, [[['o', 14.36], ['alívio', 14.48, 'hl']], [['com', 14.82], ['antecedência.', 14.98]]]],
];
const estica = (w, t) => at(w, { opacity: 0, scaleX: 2.2, scaleY: .6, filter: 'blur(10px)' }, { opacity: 1, scaleX: 1, scaleY: 1, filter: 'blur(0px)', duration: .2, ease: 'expo.out' }, t);

const CONTAS = [['Aluguel', 'Moradia', 'R$ 1.100,00'], ['Conta de luz', 'Contas', 'R$ 187,35'], ['Plano de celular', 'Assinaturas', 'R$ 59,90'], ['Internet da casa', 'Contas', 'R$ 98,79']];
const PARC = [['Fone de ouvido', 'Parcela 1/3', 'R$ 120,00'], ['Notebook de trabalho', 'Parcela 1/3', 'R$ 415,95']];
const TOTAL = 'R$ 10.050,75';
const T = { z: 0 };
/* tela do Início já rolada até os cofrinhos e o gráfico (sem rolagem animada: a tela não recorta, para o 3D funcionar) */
function rolado(p) {
  return `<div class="abs" style="left:35px;top:70px;font-size:27px;color:var(--faint)">Cofrinhos &amp; metas</div>
   <div class="abs" style="right:35px;top:60px;font-size:26px;color:var(--menta);background:rgba(31,169,141,.16);border-radius:999px;padding:6px 20px">Nível 3 · Aprendiz</div>`
   + metaCard(p, 0, 35, 132) + metaCard(p, 1, 380, 132) + metaCard(p, 2, 725, 132) + grafico(p, 550)
   + '<div class="abs" style="left:400px;top:2336px;width:280px;height:10px;border-radius:5px;background:rgba(239,255,250,.45)"></div>';
}

montar({
  dur: 19.7, voz: 'E:/Grana-temporarios/2026-10-24-tino-videos/trabalho/narracoes/v5-narracao-final.wav',
  trilha: { arquivo: 'E:/Grana-temporarios/2026-10-25-reels-cinco-estilos-60fps/audio/v5-trilha.wav', inicio: 1.149 },
  G, FIM: { g3: 3.95, g6: 8.3, g11: 15.7 }, estilos: { estica },
  imp: [[.02, 10], [2.08, 12], [3.34, 14], [7.54, 18], [10.1, 10], [15.9, 18]],
  flash: [[0, .5, .3], [3.75, .5, .3], [7.54, .4, .3], [15.95, .5, .35], [17.96, .35, .45]],
  sfx: [['synthetic/rise.wav', 0, .45], [BC + 'v5-passagem-mes.wav', .5, .35], [BC + 'v5-passagem-mes.wav', 1.1, .35], [BC + 'v5-passagem-mes.wav', 1.7, .35],
    ['synthetic/synth_hit.wav', 2.08, .35], [BC + 'v5-passagem-mes.wav', 2.5, .35], [BC + 'v5-passagem-mes.wav', 3.0, .35], ['synthetic/bass_drop.wav', 3.34, .45],
    ['synthetic/flash.wav', 3.75, .35], ...[0, 1, 2, 3].map((i) => ['synthetic/whoosh.wav', 4.52 + i * .1, .22]),
    ...[0, 1].map((i) => ['synthetic/whoosh.wav', 5.94 + i * .14, .3]), ['synthetic/rewind.wav', 7.2, .3], ['metal_hit.wav', 7.54, .4],
    ['synthetic/pop.wav', 8.54, .4], ...[0, 1, 2, 3, 4, 5].map((i) => ['synthetic/tick.wav', 8.7 + i * .07, .22]),
    ['synthetic/data.wav', 10.1, .35], ['click.wav', 10.46, .3], ['click.wav', 11.54, .3], [BC + 'v5-periodo-seis-meses.wav', 12.64, .4],
    ['synthetic/rise.wav', 14.2, .3], ['success.wav', 14.5, .3], ['synthetic/whoosh.wav', 15.7, .5], ['synthetic/bass_drop.wav', 16.07, .4],
    ['mouse_click.wav', 16.66, .6], ['success.wav', 17.98, .35]],
}, () => {
  const gates = MESES.map((m, i) => `<div class="gate" id="gt${i}"><i id="gf${i}" style="height:${BARRAS[i][1] ? 100 : 0}%;border-radius:54px"></i><b>${m}</b></div>`).join('');
  const cc = (id, [n, k, v], l, t, cor) => `<div class="cc" id="${id}" style="left:${l}px;top:${t}px;${cor ? `border-color:${cor}` : ''}"><div class="n">${n}</div><div class="k">${k}</div><div class="v"${cor ? ' style="color:#7fdcf0"' : ''}>${v}</div></div>`;
  $('#world').insertAdjacentHTML('beforeend', `<div id="tun">${gates}</div>
   ${CONTAS.map((c, i) => cc('ct' + i, c, 40, 660 + i * 180)).join('')}
   ${PARC.map((c, i) => cc('pc' + i, c, 340, 1430 + i * 180, 'rgba(0,166,202,.7)')).join('')}
   ${celular('pa', rolado('a'), null, 262, 700)}
   <div id="tot"><small>Total comprometido nos próximos 6 meses</small><div id="totV">${[...TOTAL].map((c, i) => `<span id="tc${i}" class="${/\d/.test(c) ? '' : 's'}">${c === ' ' ? '&nbsp;' : c}</span>`).join('')}</div></div>`);
  S('#pa, #tot, .cc', { opacity: 0 });

  /* gancho: atravessar os seis meses; os três primeiros já têm parcela */
  at(T, { z: -600 }, { z: 5100, duration: 3.7, ease: 'power2.inOut' }, 0);
  at(T, { z: 5100 }, { z: 5650, duration: .96, ease: 'power1.in' }, 3.7);
  [0, 1, 2].forEach((i) => at('#gf' + i, { opacity: 0, scaleY: 0, transformOrigin: '50% 100%' }, { opacity: 1, scaleY: 1, duration: .3, ease: 'back.out(2)' }, .88 + i * .08));
  at('#tun', { rotationZ: -4 }, { rotationZ: 4, duration: 3.7, ease: 'sine.inOut' }, 0);
  /* contas do mês chegam pela esquerda, parcelas pela direita */
  CONTAS.forEach((_, i) => at('#ct' + i, { opacity: 0, x: -900, rotationY: 70, z: -200 }, { opacity: 1, x: 0, rotationY: 12, z: 0, duration: .32, ease: 'expo.out' }, 4.52 + i * .1));
  PARC.forEach((_, i) => at('#pc' + i, { opacity: 0, x: 900, rotationY: -70, z: -200 }, { opacity: 1, x: 0, rotationY: -12, z: 0, duration: .34, ease: 'expo.out' }, 5.94 + i * .14));
  at('#ct0, #ct1, #ct2, #ct3', { y: 0 }, { y: -30, duration: 1.6, ease: 'sine.inOut' }, 4.9);
  at('#pc0, #pc1', { y: 0 }, { y: -50, duration: 1.2, ease: 'sine.inOut' }, 6.1);
  /* um lugar só: tudo converge para o aparelho que vem do fundo */
  at('#pa', { opacity: 1, z: -2600, rotationY: 30, y: 120, scale: 1.45 }, { z: 0, rotationY: -8, duration: .45, ease: 'expo.out' }, 7.3);
  ['#ct0', '#ct1', '#ct2', '#ct3', '#pc0', '#pc1'].forEach((c, i) => at(c, { scale: 1 }, { x: i < 4 ? 260 : -250, y: i < 4 ? 400 - i * 180 : -300 - (i - 4) * 180, z: -500, scale: .2, opacity: 0, rotationY: 0, duration: .3, ease: 'power3.in' }, 7.36 + i * .03));
  /* o gráfico: a tela rola até ele e ele salta com as barras crescendo */
  at('#aGraf', { z: 0, scale: 1, rotationX: 0 }, { z: 220, scale: 1.18, rotationX: 14, duration: .3, ease: 'back.out(1.8)' }, 8.54);
  at('#aGraf .pbg', { opacity: 0 }, { opacity: 1, duration: .2 }, 8.54);
  BARRAS.forEach((_, i) => at('#aG' + i, { scaleY: 0 }, { scaleY: 1, duration: .35, ease: 'back.out(1.6)' }, 8.7 + i * .07));
  at('#pa', { rotationY: -8 }, { rotationY: 10, duration: 2.4, ease: 'sine.inOut' }, 8.6);
  /* soma: o total trava como placa de aeroporto */
  at('#tot', { opacity: 0, y: 260, z: 0, rotationX: -40 }, { opacity: 1, y: 0, z: 200, rotationX: 0, duration: .32, ease: 'back.out(1.5)' }, 10.06);
  at('#aG0, #aG1, #aG2', { filter: 'brightness(1)' }, { filter: 'brightness(1.6)', duration: .15, yoyo: true, repeat: 1, repeatDelay: .3 }, 10.46);
  at('#aG3, #aG4, #aG5, #aG0, #aG1, #aG2', { filter: 'brightness(1)' }, { filter: 'brightness(1.4)', duration: .15, yoyo: true, repeat: 1, repeatDelay: .2 }, 11.54);
  at('#tot', { opacity: 1, z: 200, y: 0 }, { opacity: 0, z: 0, y: 200, duration: .25, ease: 'power2.in' }, 12.2);
  /* seis meses: as barras andam uma a uma */
  BARRAS.forEach((_, i) => at('#aG' + i, { y: 0 }, { y: -26, duration: .12, yoyo: true, repeat: 1, ease: 'power2.out' }, 12.64 + i * .06));
  /* o alívio: Jan a Mar acendem, Out a Dez apagam */
  at('#aG0, #aG1, #aG2', { opacity: 1 }, { opacity: .35, duration: .25 }, 14.4);
  [3, 4, 5].forEach((i) => at('#aG' + i, { scaleX: 1, boxShadow: '0 0 0 rgba(173,251,227,0)' }, { scaleX: 1.25, boxShadow: '0 0 40px rgba(173,251,227,.9)', duration: .22, ease: 'back.out(2.5)' }, 14.48 + (i - 3) * .06));
  at('#pa', { rotationY: 10, scale: 1.45 }, { rotationY: -6, scale: 1.5, duration: 1.3, ease: 'sine.inOut' }, 14.3);
  /* saída: o aparelho atravessa a câmera, como mais um portal */
  at('#pa', { z: 0, opacity: 1 }, { z: 2000, opacity: 0, duration: .35, ease: 'power3.in' }, 15.65);
  cta([16.073, 16.26, 16.4, 16.74, 17.02, 17.34, 17.86, 17.96],
    (b, t) => at(b, { opacity: 0, z: -1800, rotationX: 40 }, { opacity: 1, z: 0, rotationX: 0, duration: .4, ease: 'expo.out' }, t));
});

/* túnel e placa de aeroporto são desenhados a cada quadro */
const base = window.renderAt;
window.renderAt = function (t) {
  base(t);
  MESES.forEach((_, i) => {
    const zz = -i * 900 - 300 + T.z, el = document.getElementById('gt' + i);
    el.style.transform = `translateZ(${zz}px)`;
    const f = t < 4.46 ? 1 : Math.max(0, 1 - (t - 4.46) / .2);
    el.style.opacity = f * (zz > 1000 ? 0 : zz > 300 ? (1000 - zz) / 700 : zz < -4200 ? Math.max(0, (zz + 5600) / 1400) : 1);
    el.style.visibility = zz > 1000 || t > 4.66 ? 'hidden' : 'visible';
  });
  [...TOTAL].forEach((c, i) => {
    if (!/\d/.test(c)) return;
    const trava = 10.06 + .55 + i * .05;
    document.getElementById('tc' + i).textContent = t >= trava ? c : String(Math.floor(t * 15 + i * 3) % 10);
  });
  return t;
};
