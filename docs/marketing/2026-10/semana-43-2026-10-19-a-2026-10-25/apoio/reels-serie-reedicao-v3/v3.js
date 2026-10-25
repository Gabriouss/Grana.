/* V3 Próxima meta. Tema claro (sharingan do criativo do autor) + assinatura "órbita":
   os cofrinhos giram em volta de um eixo, a íris troca de cena, o celular vira e monta o mural em blocos.
   Legendas centralizadas, palavras viram no eixo Y (o V1 sobe de máscara, à esquerda). */
$('#extra').textContent = `
#cap{left:70px;top:130px;width:940px;height:480px}
.cg{width:940px;height:480px}
#orb{position:absolute;left:0;top:0;width:1080px;height:1920px;transform-style:preserve-3d}
.oc{position:absolute;left:380px;top:930px;width:320px;height:372px;transform-style:preserve-3d}
.chip{position:absolute;padding:24px 38px;border-radius:32px;background:#0b2d35;border:2px solid rgba(174,255,227,.3);box-shadow:0 30px 70px rgba(0,40,50,.45);font-size:46px;line-height:56px;color:#effffa;white-space:nowrap}
.chip small{display:block;font-size:30px;line-height:38px;color:#7fa9a0}
.bdg{position:absolute;width:323px;height:330px;border-radius:30px;border:2px solid rgba(174,255,227,.16);background:#0b2d35}
.bdg .c{position:absolute;left:101px;top:28px;width:120px;height:120px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.bdg .n{position:absolute;left:18px;right:18px;top:166px;text-align:center;font-size:27px;line-height:32px}
.bdg .s{position:absolute;left:18px;right:18px;top:250px;text-align:center;font-size:24px;color:#ADFBE3}
.bdg .bar{left:40px;top:292px;width:243px}
`;
const G = [
  ['g1', 'vira', 96, [[['Qual', 0], ['é', .14], ['sua', .3]], [['próxima', .4], ['meta?', .52, 'hl']]]],
  ['g2', 'slam', 128, [[['Viagem,', 1.7, 'hl']]]],
  ['g3', 'vira', 100, [[['reserva', 2.56], ['de', 2.92]], [['emergência,', 2.98, 'hl']]]],
  ['g4', 'slam', 104, [[['imprevistos?', 4.02, 'hl']]]],
  ['g5', 'slam', 124, [[['Aqui,', 5.022]]]],
  ['g6', 'vira', 82, [[['cada', 5.603], ['objetivo', 5.74]], [['ganha', 6.2], ['um', 6.64], ['cofrinho', 6.72, 'hl']]]],
  ['g7', 'vira', 78, [[['com', 7.28], ['meta,', 7.46, 'hl'], ['prazo', 8.18, 'hl']], [['e', 8.56], ['progresso', 8.74, 'hl'], ['claro.', 9.28]]]],
  ['g8', 'vira', 84, [[['O', 10.113], ['que', 10.18], ['você', 10.24]], [['separa', 10.46, 'hl'], ['no', 10.92], ['mês', 11.0]]]],
  ['g9', 'vira', 84, [[['já', 11.28], ['sai', 11.6, 'grad'], ['do', 11.96]], [['livre', 12.08, 'hl'], ['pra', 12.32], ['gastar,', 12.5]]]],
  ['g10', 'vira', 92, [[['e', 13.189], ['o', 13.26], ['mural', 13.32]], [['de', 13.54], ['conquistas', 13.72, 'hl']]]],
  ['g11', 'vira', 86, [[['mostra', 14.22], ['o', 14.58], ['seu', 14.82]], [['ritmo', 14.94], ['crescendo.', 15.4, 'hl']]]],
];
const vira = (w, t) => at(w, { opacity: 0, rotationY: -100, x: -40, filter: 'blur(6px)' }, { opacity: 1, rotationY: 0, x: 0, filter: 'blur(0px)', duration: .17, ease: 'back.out(1.8)' }, t);

/* mural de conquistas (dados da conta de teste) */
const CONQ = [['Primeiro Registro'], ['Ritmo Inicial'], ['Arquiteto de Gastos'], ['Mês Verde'], ['Primeira Fortaleza'], ['Visão Completa'], ['Mapeador 360°'],
  ['Semana Blindada', 14], ['Hábito Inquebrável', 3], ['Centurião Financeiro', 97], ['Pontualidade Britânica', 20], ['Guardião dos Vencimentos', 5]];
function desafios() {
  const grade = CONQ.map(([n, p], i) => {
    const l = 35 + (i % 3) * 343, t = 520 + Math.floor(i / 3) * 350, ok = p === undefined;
    return `<div class="L bdg" id="bd${i}" style="left:${l}px;top:${t}px;${ok ? '' : 'border-color:rgba(174,255,227,.08)'}">
     <div class="c" style="background:${ok ? 'rgba(31,169,141,.22)' : 'rgba(174,255,227,.05)'}">${ok ? ic.medal.replace('width="34" height="34"', 'width="64" height="64"') : ic.medal.replace('width="34" height="34"', 'width="64" height="64"').replace(/#ADFBE3/g, '#4d6f6a')}</div>
     <div class="n" style="color:${ok ? '#effffa' : '#9bbab3'}">${n}</div>
     ${ok ? '<div class="s">Conquistado</div>' : `<div class="s" style="color:#9bbab3;top:238px">${p}%</div><div class="bar"><i id="bb${i}" style="width:${p}%"></i></div>`}</div>`;
  }).join('');
  return `<div class="abs" style="left:35px;top:130px;font-size:25px;color:var(--faint)">Desafios</div>
   <div class="abs" style="left:35px;top:162px;font-size:44px">Seu ritmo</div>
   <div class="L box" id="dMural" style="left:35px;top:290px;width:1010px;height:190px;background:#0b2d35">
     <div class="abs" style="left:46px;top:40px;font-size:36px">Mural de conquistas</div>
     <div class="abs" style="right:46px;top:36px;font-size:44px;color:#ADFBE3">7 de 12</div>
     <div class="bar" style="left:46px;top:126px;width:918px;height:14px"><i id="dBar" style="width:58.3%"></i></div></div>
   ${grade}
   <div class="abs" style="left:400px;top:2336px;width:280px;height:10px;border-radius:5px;background:rgba(239,255,250,.45)"></div>`;
}

const O = { r: -1080, R: 430, s: 1, o: 1 };
montar({
  dur: 20.2, voz: 'E:/Grana-temporarios/2026-10-24-tino-videos/trabalho/narracoes/v3-narracao-final.wav',
  trilha: { arquivo: 'E:/Grana-temporarios/2026-10-25-reels-cinco-estilos-60fps/audio/v3-trilha.wav', inicio: .511 },
  G, FIM: { g4: 4.9, g7: 9.95, g9: 13.05, g11: 16.2 }, estilos: { vira },
  imp: [[.02, 12], [1.7, 10], [5.02, 16], [13.2, 14], [16.68, 16]],
  flash: [[0, .6, .3], [5.02, .45, .3], [13.24, .45, .3], [17.02, .35, .4]],
  sfx: [['synthetic/whoosh.wav', 0, .5], ['synthetic/bass_drop.wav', 0, .45], ['snap.wav', .52, .45],
    ['synthetic/whoosh.wav', 1.6, .4], ['synthetic/pop.wav', 1.72, .35], ['synthetic/whoosh.wav', 2.5, .4], ['synthetic/pop.wav', 2.98, .35],
    ['synthetic/whoosh.wav', 3.95, .4], ['synthetic/pop.wav', 4.04, .35], ['synthetic/rise.wav', 4.6, .3], ['synthetic/flash.wav', 5.0, .4],
    ...[0, 1, 2].map((i) => ['synthetic/pop.wav', 5.6 + i * .14, .3]), ['synthetic/tick.wav', 7.46, .4], ['synthetic/tick.wav', 8.18, .4], ['synthetic/synth_hit.wav', 8.74, .3],
    ['synthetic/whoosh.wav', 9.9, .4], ['click.wav', 10.46, .35], ['coin.wav', 11.6, .4], ['synthetic/pop.wav', 12.08, .35],
    ['synthetic/whoosh.wav', 13.1, .5], ['synthetic/rewind.wav', 13.3, .2], ...[0, 1, 2, 3, 4, 5].map((i) => ['synthetic/tick.wav', 13.5 + i * .07, .2]),
    ['synthetic/rise.wav', 14.9, .35], ['success.wav', 15.45, .3], ['synthetic/whoosh.wav', 15.9, .45],
    ['synthetic/bass_drop.wav', 16.32, .4], ['mouse_click.wav', 16.94, .6], ['success.wav', 18.24, .35]],
}, () => {
  temaClaro({ disco: { x: 180, y: -260, r: 1500 }, gota: 1320,
    icones: [['desafios', -120, 660, 230, -14], ['salvo', 860, 1480, 230, 16], ['calendario', 60, 1660, 140, 10]] });
  $('#iris').style.background = '#013036';

  /* órbita de cofrinhos */
  $('#world').insertAdjacentHTML('beforeend', `<div id="orb">${[0, 1, 2].map((i) => `<div class="oc" id="oc${i}">${metaCard('o', i, 0, 0)}</div>`).join('')}</div>
   ${celular('pa', inicio('a'), desafios(), 262, 760)}
   <div class="chip p3" id="chMeta" style="left:90px;top:1000px">Meta<small>de R$ 3.000,00</small></div>
   <div class="chip p3" id="chPrazo" style="left:620px;top:1110px">Prazo<small>15 dez 2026</small></div>
   <div class="chip p3" id="chProg" style="left:100px;top:1500px">Progresso<small>12% guardado</small></div>
   <div class="chip p3" id="chSai" style="left:540px;top:1420px;background:#ADFBE3;color:#013036">− R$ 643,27<small style="color:#00585C">guardado no mês</small></div>`);
  S('#chMeta, #chPrazo, #chProg, #chSai', { opacity: 0 });

  [0, 1, 2].forEach((i) => at('#icf' + i, { y: 0 }, { y: i % 2 ? -110 : 80, duration: 20.2, ease: 'none' }, 0));
  at('#disco', { x: 0, y: 0, rotation: 0 }, { x: -80, y: 90, rotation: 25, duration: 20.2, ease: 'none' }, 0);

  /* gancho: os cofrinhos giram em volta do eixo e param na palavra dita */
  /* cartão i fica de frente quando r + 120i é múltiplo de 360 */
  at(O, { r: -1680 }, { r: -1000, duration: 1.6, ease: 'expo.out' }, 0);
  at(O, { r: -1000 }, { r: -1200, duration: .34, ease: 'back.out(1.4)' }, 1.62);           // Viagem (1)
  at(O, { r: -1200 }, { r: -1440, duration: .34, ease: 'back.out(1.4)' }, 2.5);            // reserva de emergência (0)
  at(O, { r: -1440 }, { r: -1680, duration: .36, ease: 'back.out(1.4)' }, 3.94);           // imprevistos (2)
  at(O, { r: -1680 }, { r: -1720, duration: .6, ease: 'sine.inOut' }, 4.32);
  at(O, { R: 430, s: 1, o: 1 }, { R: 0, s: .25, o: 0, duration: .34, ease: 'power3.in' }, 4.7);
  [1, 0, 2].forEach((i, k) => at('#oc' + i + ' .pbg', { opacity: 0 }, { opacity: 1, duration: .15, yoyo: true, repeat: 1, repeatDelay: .5 }, [1.7, 2.98, 4.02][k]));

  /* "Aqui": íris fecha e abre no celular */
  at('#iris', { opacity: 1, scale: 0 }, { opacity: 1, scale: 460, duration: .26, ease: 'power3.in' }, 4.78);
  at('#iris', { opacity: 1 }, { opacity: 0, duration: .26, ease: 'power2.out' }, 5.06);
  S('#pa', { opacity: 0 });
  at('#pa', { opacity: 1, scale: .6, rotationY: -200, y: 300 }, { opacity: 1, scale: 1, rotationY: 0, y: 0, duration: .6, ease: 'expo.out' }, 5.0);
  /* cada objetivo ganha um cofrinho: os três saltam da tela */
  at('#pa', { y: 0, scale: 1 }, { y: 40, scale: 1.25, duration: .5, ease: 'power3.inOut' }, 5.55);
  [0, 1, 2].forEach((i) => at('#aM' + i, { z: 0, rotationY: 0 }, { z: 130, rotationY: [-14, 0, 14][i], duration: .22, ease: 'back.out(2)' }, 5.6 + i * .14));
  at('#aM0 .pbg, #aM1 .pbg, #aM2 .pbg', { opacity: 0 }, { opacity: 1, duration: .2 }, 6.72);
  at('#pa', { rotationY: 0 }, { rotationY: 9, duration: 1.4, ease: 'sine.inOut' }, 6.0);
  /* meta, prazo e progresso: fichas saem do cofrinho da Viagem */
  [0, 2].forEach((i) => at('#aM' + i, { z: 130, opacity: 1 }, { z: 0, rotationY: 0, opacity: .5, duration: .25 }, 7.24));
  at('#aM1', { z: 130 }, { z: 200, duration: .25, ease: 'back.out(2)' }, 7.24);
  [['#chMeta', 7.46, -260], ['#chPrazo', 8.18, 260], ['#chProg', 8.74, -260]].forEach(([c, t, dx]) =>
    at(c, { opacity: 0, x: -dx, z: -200, scale: .5, rotationY: dx > 0 ? 50 : -50 }, { opacity: 1, x: 0, z: 160, scale: 1, rotationY: 0, duration: .26, ease: 'back.out(1.7)' }, t));
  at('#aM1b', { scaleX: 0 }, { scaleX: 1, duration: .5, ease: 'power2.out' }, 8.74);
  at('#pa', { rotationY: 9 }, { rotationY: -7, duration: 1.6, ease: 'sine.inOut' }, 7.6);
  at('#chMeta, #chPrazo, #chProg', { opacity: 1, scale: 1 }, { opacity: 0, scale: .6, z: -100, duration: .2, ease: 'power2.in', stagger: .05 }, 9.75);
  at('#aM0, #aM2', { opacity: .5 }, { opacity: 1, duration: .2 }, 9.8);
  at('#aM1', { z: 200 }, { z: 0, duration: .25 }, 9.8);
  /* o que você separa sai do Livre: câmera orbita até o card Livre */
  at('#pa', { y: 40, scale: 1.25, rotationY: -7, rotationX: 0 }, { y: 120, scale: 1.4, rotationY: 20, rotationX: 6, duration: .5, ease: 'power3.inOut' }, 9.95);
  at('#aLivre', { z: 0 }, { z: 120, duration: .24, ease: 'back.out(2)' }, 10.4);
  at('#aLivre .pbg', { opacity: 0 }, { opacity: 1, duration: .2 }, 10.4);
  at('#aGuard', { z: 0, backgroundColor: 'rgba(173,251,227,0)', color: '#7fa9a0' }, { z: 50, backgroundColor: 'rgba(173,251,227,.2)', color: '#ADFBE3', duration: .18, ease: 'back.out(2)' }, 10.46);
  at('#chSai', { opacity: 0, y: 260, z: 0, scale: .6 }, { opacity: 1, y: 0, z: 220, scale: 1, duration: .3, ease: 'back.out(1.6)' }, 11.55);
  at('#chSai', { y: 0 }, { y: -40, duration: .5, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 11.85);
  at('#pa', { rotationY: 20 }, { rotationY: 8, duration: 1.4, ease: 'sine.inOut' }, 10.5);
  at('#aVal', { transformOrigin: 'left center', color: '#effffa', scale: 1, textShadow: '0 0 0 rgba(0,0,0,0)' }, { color: '#ADFBE3', scale: 1.12, textShadow: '0 0 40px rgba(173,251,227,.8)', duration: .2 }, 12.08);
  at('#chSai', { opacity: 1 }, { opacity: 0, scale: .7, duration: .2 }, 12.95);
  /* mural de conquistas: o celular vira e as medalhas se montam em blocos */
  at('#pa', { rotationY: 8, rotationX: 6, y: 120, scale: 1.4 }, { rotationY: 180, rotationX: 0, y: 40, scale: 1.25, duration: .5, ease: 'power3.inOut' }, 13.05);
  at('#aLivre', { z: 120 }, { z: 0, duration: .2 }, 13.05);
  tl.set('#paF', { visibility: 'hidden' }, 13.3); tl.set('#paF', { visibility: 'visible' }, 16.12);
  CONQ.forEach((_, i) => at('#bd' + i, { opacity: 0, z: 500 + rnd(i) * 300, x: (rnd(i + 7) - .5) * 900, y: (rnd(i + 2) - .5) * 900, rotationZ: (rnd(i + 5) - .5) * 60 },
    { opacity: 1, z: 0, x: 0, y: 0, rotationZ: 0, duration: .32, ease: 'back.out(1.3)' }, 13.45 + i * .055));
  at('#dMural', { z: 0 }, { z: 120, duration: .22, ease: 'back.out(2)' }, 13.72);
  at('#pa', { rotationY: 180 }, { rotationY: 172, duration: 1.2, ease: 'sine.inOut' }, 13.6);
  /* ritmo crescendo: barras enchem, Centurião salta */
  [7, 8, 9, 10, 11].forEach((i) => at('#bb' + i, { scaleX: 0 }, { scaleX: 1, duration: .6, ease: 'power2.out' }, 14.9));
  at('#dBar', { scaleX: 0 }, { scaleX: 1, duration: .5, ease: 'power2.out' }, 14.22);
  at('#bd9', { z: 0, scale: 1 }, { z: 160, scale: 1.08, duration: .24, ease: 'back.out(2)' }, 15.36);
  at('#pa', { y: 40, scale: 1.25 }, { y: 60, scale: 1.32, duration: .7, ease: 'power2.inOut' }, 14.8);
  /* saída em giro */
  at('#pa', { rotationY: 172, opacity: 1, scale: 1.32 }, { rotationY: 360, opacity: 0, scale: .5, duration: .4, ease: 'power3.in' }, 15.92);
  cta([16.343, 16.52, 16.68, 17.02, 17.3, 17.62, 18.12, 18.22],
    (b, t) => at(b, { opacity: 0, rotationY: -150, scale: .7 }, { opacity: 1, rotationY: 0, scale: 1, duration: .4, ease: 'back.out(1.5)' }, t));
});

/* a órbita é desenhada a cada quadro: os cartões ficam de frente para a câmera e o da frente acende */
const base = window.renderAt;
window.renderAt = function (t) {
  base(t);
  [0, 1, 2].forEach((i) => {
    const a = (O.r + i * 120) * Math.PI / 180, x = Math.sin(a) * O.R, z = Math.cos(a) * O.R, f = (Math.cos(a) + 1) / 2;
    const el = document.getElementById('oc' + i);
    el.style.transform = `translate3d(${x.toFixed(1)}px,${(-z * .18).toFixed(1)}px,${z.toFixed(1)}px) scale(${(1.55 * O.s).toFixed(3)}) rotateY(${(-Math.sin(a) * 18).toFixed(1)}deg)`;
    el.style.opacity = (O.o * (.35 + .65 * f)).toFixed(3);
    el.style.filter = `blur(${((1 - f) * 5).toFixed(1)}px)`;
  });
  return t;
};
