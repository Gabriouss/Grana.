/* V4 Cabe no meu mês. Tema escuro + assinatura "freada": tudo entra rápido de lado e trava com derrapagem,
   trocas por chicote horizontal entre dois aparelhos, balões do Granabô em 3D e débito/crédito separados. */
const BC = 'E:/Grana-temporarios/2026-10-25-reels-cinco-estilos-60fps/audio/sfx/';
$('#extra').textContent = `
#cap{top:120px}
.ccard{position:absolute;left:190px;top:860px;width:700px;height:440px;border-radius:40px;transform-style:preserve-3d;
 background:linear-gradient(135deg,#0e4a55 0%,#0b2d35 55%,#06323a 100%);border:2px solid rgba(174,255,227,.3);box-shadow:0 50px 120px rgba(0,0,0,.55)}
.bal{position:absolute;border-radius:36px;font-size:36px;line-height:48px;padding:30px 36px;transform-style:preserve-3d}
.chipc{position:absolute;border:2px solid var(--rule2);border-radius:999px;padding:0 30px;height:84px;display:flex;align-items:center;font-size:30px;color:var(--soft);background:rgba(11,45,53,.7);white-space:nowrap}
.split{position:absolute;width:430px;padding:30px 36px;border-radius:34px;background:#0b2d35;border:2px solid rgba(174,255,227,.3);box-shadow:0 40px 90px rgba(0,0,0,.5);transform-style:preserve-3d}
.split small{display:block;font-size:30px;color:var(--faint);line-height:40px}
.split b{display:block;font-weight:400;font-size:60px;line-height:76px}
.skid{position:absolute;height:6px;border-radius:3px;background:linear-gradient(90deg,rgba(173,251,227,0),rgba(173,251,227,.8));transform-origin:100% 50%}
`;
const G = [
  ['g1', 'freio', 80, [[['Antes', 0], ['de', .26]], [['comprar', .42], ['por', .68], ['impulso,', .88, 'hl']]]],
  ['g2', 'freio', 100, [[['faça', 1.715], ['uma', 1.9]], [['pergunta:', 2.08, 'hl']]]],
  ['g3', 'slam', 116, [[['cabe', 2.935], ['no', 3.12]], [['meu', 3.24], ['mês?', 3.36, 'hl']]]],
  ['g4', 'freio', 92, [[['Na', 4.142], ['tela', 4.22]], [['inicial,', 4.44, 'mint']]]],
  ['g5', 'freio', 96, [[['você', 5.18], ['bate', 5.32]], [['o', 5.66], ['olho', 5.88, 'hl']]]],
  ['g6', 'freio', 90, [[['e', 6.1], ['vê', 6.32], ['quanto', 6.616]], [['pode', 6.82], ['gastar', 7.14, 'hl']]]],
  ['g7', 'slam', 132, [[['por', 7.56], ['dia', 7.72, 'hl']]]],
  ['g8', 'freio', 96, [[['até', 8.08], ['o', 8.5], ['mês', 8.64]], [['acabar.', 8.8, 'mint']]]],
  ['g9', 'freio', 88, [[['Quer', 9.58], ['conferir', 9.66]], [['uma', 10.1], ['categoria', 10.24, 'hl']]]],
  ['g10', 'freio', 88, [[['antes', 10.84], ['de', 11.16], ['passar', 11.3]], [['o', 11.52], ['cartão?', 11.68, 'hl']]]],
  ['g11', 'freio', 100, [[['Pergunta', 12.393], ['pro', 12.68]], [['Granabô', 12.884, 'hl']]]],
  ['g12', 'freio', 88, [[['e', 13.36], ['ele', 13.58], ['responde', 13.7]], [['na', 14.2], ['hora,', 14.42, 'hl']]]],
  ['g13', 'freio', 92, [[['separando', 14.98]], [['débito', 15.4, 'hl'], ['e', 15.94], ['crédito.', 16.12, 'hl']]]],
];
/* freada: entra de lado em alta velocidade, passa do ponto e volta com o corpo inclinado */
const freio = (w, t) => at(w, { opacity: 0, x: 320, skewX: -38, filter: 'blur(10px)' }, { opacity: 1, x: 0, skewX: 0, filter: 'blur(0px)', duration: .22, ease: 'back.out(2.8)' }, t);

function chat() {
  return `<div class="abs" style="left:35px;top:132px">${ic.lt}</div>
   <img class="abs" src="assets/granabo-frente.png" style="left:100px;top:110px;width:92px;height:92px;border-radius:50%;background:#0b2d35;object-fit:contain">
   <div class="abs" style="left:212px;top:112px;font-size:25px;color:var(--faint)">Assistente</div>
   <div class="abs" style="left:212px;top:146px;font-size:40px">Granabô</div>
   <div class="abs" style="left:35px;right:35px;top:250px;height:2px;background:var(--rule)"></div>
   <div class="L chipc" id="bC0" style="left:35px;top:1250px">Quanto gastei em Alimentação?</div>
   <div class="L chipc" id="bC1" style="left:35px;top:1354px">Como está meu crédito?</div>
   <div class="L chipc" id="bC2" style="left:500px;top:1354px">Quanto posso gastar?</div>
   <div class="L chipc" id="bC3" style="left:35px;top:1458px">Resumo do mês</div>
   <div class="L bal" id="bQ" style="right:35px;top:330px;background:#ADFBE3;color:#052229;border-bottom-right-radius:10px">Quanto gastei com mercado?</div>
   <div class="L" id="bPensa" style="left:35px;top:470px;font-size:30px;color:var(--faint)">Consultando seus dados...</div>
   <div class="L bal" id="bR" style="left:35px;top:470px;width:900px;background:#0b2d35;border:2px solid var(--rule2);border-bottom-left-radius:10px">Em outubro de 2026, você gastou <span id="bDeb" class="pchip">R$ 561,25</span> em Alimentação, sem contar compras no crédito. Houve também <span id="bCre" class="pchip">R$ 112,00</span> em compras no crédito nessa mesma categoria e período. Como regra do app, as compras no crédito entram no caixa somente quando a fatura é paga.
     <div style="margin-top:18px;font-size:26px;line-height:34px;color:var(--accent)"><span class="dot" style="width:12px;height:12px"></span>Números conferidos</div></div>
   <div class="abs" style="left:35px;top:2190px;width:1010px;height:110px;border-radius:55px;border:2px solid var(--rule2);background:rgba(11,45,53,.6)"></div>
   <div class="abs" style="left:975px;top:2225px">${ic.send}</div>
   <div class="abs" style="left:400px;top:2336px;width:280px;height:10px;border-radius:5px;background:rgba(239,255,250,.45)"></div>`;
}

montar({
  dur: 20.6, voz: 'E:/Grana-temporarios/2026-10-24-tino-videos/trabalho/narracoes/v4-narracao-final.wav',
  trilha: { arquivo: 'E:/Grana-temporarios/2026-10-25-reels-cinco-estilos-60fps/audio/v4-trilha.wav', inicio: .894 },
  G, FIM: { g3: 3.95, g8: 9.4, g13: 16.85 }, estilos: { freio },
  imp: [[.32, 22], [2.95, 12], [4.14, 14], [7.56, 18], [9.58, 16], [12.88, 10], [17.34, 16]],
  flash: [[0, .45, .25], [7.56, .35, .3], [17.7, .35, .4]],
  sfx: [['synthetic/whoosh.wav', 0, .55], [BC + 'v4-frenagem.wav', .12, .55], ['metal_hit.wav', .32, .35],
    ['synthetic/whoosh.wav', 1.7, .35], [BC + 'v4-pergunta.wav', 2.08, .45], ['synthetic/bass_drop.wav', 2.93, .4], ['snap.wav', 3.36, .45],
    ['synthetic/whoosh.wav', 4.0, .5], [BC + 'v4-frenagem.wav', 4.14, .35], ['synthetic/pop.wav', 5.88, .35], ['synthetic/synth_hit.wav', 7.14, .3],
    ['synthetic/bass_drop.wav', 7.56, .45], ['synthetic/tick.wav', 8.64, .35], ['synthetic/whoosh.wav', 9.46, .55], [BC + 'v4-frenagem.wav', 9.6, .35],
    ...[0, 1, 2, 3].map((i) => ['synthetic/pop.wav', 10.24 + i * .07, .25]), ['click.wav', 11.68, .35],
    ['mouse_click.wav', 12.39, .5], ['synthetic/whoosh.wav', 12.5, .35], ['synthetic/pop.wav', 12.88, .4], ['synthetic/data.wav', 13.4, .25],
    [BC + 'v4-resposta.wav', 14.2, .45], ['synthetic/tick.wav', 15.4, .4], ['synthetic/tick.wav', 16.12, .4],
    ['synthetic/whoosh.wav', 16.6, .45], ['synthetic/bass_drop.wav', 16.98, .4], ['mouse_click.wav', 17.6, .6], ['success.wav', 18.92, .35]],
}, () => {
  $('#world').insertAdjacentHTML('beforeend', `
   <div class="skid" id="sk1" style="left:-40px;top:1280px;width:640px"></div><div class="skid" id="sk2" style="left:-40px;top:1240px;width:520px"></div>
   <div class="ccard" id="cartao">
     <div class="abs" style="left:52px;top:52px;font-size:34px;color:var(--soft)">Cartão Principal</div>
     <div class="abs" style="right:52px;top:46px">${ic.card.replace('width="34" height="28"', 'width="68" height="56"')}</div>
     <div class="abs" style="left:52px;top:150px;width:96px;height:72px;border-radius:14px;background:linear-gradient(135deg,#d9c79a,#8e7d55)"></div>
     <div class="abs" style="left:52px;top:262px;font-size:52px;letter-spacing:.08em">•••• 4821</div>
     <div class="abs" style="left:52px;top:350px;font-size:28px;color:var(--faint)">Limite R$ 3.500,00</div></div>
   ${celular('pa', inicio('a'), null, 262, 720)}
   ${celular('pb', chat(), null, 262, 720)}
   <img id="gbo" class="abs" src="assets/granabo-frente.png" style="left:600px;top:1400px;width:340px">
   <img id="gbo2" class="abs" src="assets/granabo-feliz.png" style="left:600px;top:1400px;width:340px">
   <div class="split" id="spD" style="left:120px;top:1460px"><small>Sem o crédito</small><b>R$ 561,25</b><small>Alimentação</small></div>
   <div class="split" id="spC" style="left:540px;top:1460px;border-color:rgba(0,166,202,.6)"><small>No crédito</small><b style="color:#7fdcf0">R$ 112,00</b><small>mesma categoria</small></div>`);
  S('#pa, #pb, #gbo, #gbo2, #spD, #spC, #sk1, #sk2, #bQ, #bPensa, #bR', { opacity: 0 });
  S('#paSh, #pbSh', { opacity: 0 });

  /* gancho: o cartão vem a toda e freia na frente da câmera */
  at('#cartao', { x: 1500, rotationY: -60, rotationZ: 8, skewX: -20, z: -200, scale: 1.25 }, { x: 0, rotationY: 12, rotationZ: -4, skewX: 0, z: 120, scale: 1.25, duration: .34, ease: 'expo.out' }, 0);
  at('#cartao', { rotationY: 12, rotationZ: -4 }, { rotationY: -6, rotationZ: 2, duration: .5, ease: 'back.out(3)' }, .3);
  [['#sk1', .14], ['#sk2', .2]].forEach(([s, t]) => { at(s, { opacity: 0, scaleX: 0 }, { opacity: 1, scaleX: 1, duration: .18 }, t); at(s, { opacity: 1 }, { opacity: 0, duration: .5 }, t + .4); });
  at('#cartao', { rotationY: -6, rotationX: 0 }, { rotationY: 10, rotationX: 10, duration: 1.4, ease: 'sine.inOut' }, .8);
  /* pergunta: o cartão vira de lado e trava; "cabe no meu mês?" o cartão pesa */
  at('#cartao', { z: 120, scale: 1.25 }, { z: 260, scale: 1.3, duration: .2, ease: 'back.out(2)' }, 2.08);
  at('#cartao', { y: 0 }, { y: 40, duration: .12, yoyo: true, repeat: 1 }, 3.36);
  at('#cartao', { x: 0, opacity: 1, rotationY: 10 }, { x: -1500, opacity: 1, rotationY: 50, skewX: 20, duration: .26, ease: 'power3.in' }, 3.88);
  /* tela inicial: o celular chega de lado e freia */
  at('#pa', { opacity: 1, x: 1500, y: 60, scale: 1.3, rotationY: -55, skewX: -12 }, { opacity: 1, x: 0, y: 60, scale: 1.3, rotationY: 8, skewX: 0, duration: .36, ease: 'expo.out' }, 4.06);
  at('#paSh', { opacity: 0 }, { opacity: 1, duration: .2 }, 4.1);
  at('#pa', { rotationY: 8 }, { rotationY: -4, duration: .5, ease: 'back.out(3)' }, 4.4);
  at('#pa', { y: 60, scale: 1.3 }, { y: 160, scale: 1.5, duration: .6, ease: 'power3.inOut' }, 5.1);
  at('#aLivre', { z: 0, scale: 1 }, { z: 150, scale: 1.08, duration: .24, ease: 'back.out(2)' }, 5.88);
  at('#aLivre .pbg', { opacity: 0 }, { opacity: 1, duration: .2 }, 5.88);
  at('#pa', { rotationY: -4 }, { rotationY: 10, duration: 1.6, ease: 'sine.inOut' }, 5.9);
  /* por dia: o valor salta e fica parado na frente, com eco */
  at('#aVal', { transformOrigin: 'left center', z: 0, scale: 1, color: '#effffa', textShadow: '0 0 0 rgba(0,0,0,0)' }, { z: 140, scale: 1.25, color: '#ADFBE3', textShadow: '0 0 50px rgba(173,251,227,.85)', duration: .2, ease: 'back.out(2.5)' }, 7.54);
  at('#aVal', { z: 140, scale: 1.25 }, { z: 0, scale: 1, duration: .3 }, 8.3);
  /* até o mês acabar: a linha dos dias restantes acende */
  $('#aLivre').insertAdjacentHTML('beforeend', '<div class="abs" id="aDias" style="left:30px;top:324px;width:950px;height:52px;border-radius:14px;background:rgba(173,251,227,.2);opacity:0"></div>');
  at('#aDias', { opacity: 0, scaleX: 0, transformOrigin: '0 50%' }, { opacity: 1, scaleX: 1, duration: .25, ease: 'power3.out' }, 8.64);
  at('#aLivre', { z: 150, scale: 1.08 }, { z: 0, scale: 1, duration: .3 }, 9.25);
  /* chicote horizontal: o Início sai pela esquerda e o chat do Granabô freia vindo da direita */
  at('#pa', { x: 0, rotationY: 10, opacity: 1 }, { x: -1600, rotationY: 40, opacity: 1, duration: .24, ease: 'power3.in' }, 9.42);
  at('#paSh', { opacity: 1 }, { opacity: 0, duration: .1 }, 9.5);
  at('#streak', { opacity: 0, scaleX: .2 }, { opacity: 1, scaleX: 1, duration: .1, yoyo: true, repeat: 1 }, 9.5);
  at('#pb', { opacity: 1, x: 1600, y: 160, scale: 1.5, rotationY: -40, skewX: -10 }, { x: 0, rotationY: -6, skewX: 0, duration: .36, ease: 'expo.out' }, 9.58);
  at('#pbSh', { opacity: 0 }, { opacity: 1, duration: .2 }, 9.66);
  at('#pb', { rotationY: -6 }, { rotationY: 4, duration: .5, ease: 'back.out(3)' }, 9.94);
  /* categoria: as sugestões saltam */
  ['#bC0', '#bC1', '#bC2', '#bC3'].forEach((c, i) => at(c, { z: 0, x: 0, scale: 1, transformOrigin: '0 50%' }, { z: 160, x: [60, 30, 90, 60][i], scale: 1.3, duration: .22, ease: 'back.out(2.5)' }, 10.24 + i * .07));
  at('#bC1, #bC2, #bC3', { z: 160, scale: 1.3, opacity: 1 }, { z: 0, scale: 1, opacity: .4, duration: .2 }, 11.1);
  at('#bC0', { z: 160, scale: 1.3 }, { z: 260, scale: 1.5, borderColor: '#ADFBE3', color: '#effffa', duration: .22, ease: 'back.out(2)' }, 11.6);
  /* pergunta pro Granabô: a pergunta sobe ao topo, o Granabô aparece ao lado */
  at('#bC0, #bC1, #bC2, #bC3', { opacity: 1 }, { opacity: 0, duration: .15 }, 12.36);
  at('#pb', { y: 160, rotationY: 4 }, { y: 160, rotationY: -10, duration: .45, ease: 'power3.inOut' }, 12.3);
  at('#bQ', { opacity: 0, y: 1300, z: 200, scale: .9, transformOrigin: '100% 0' }, { opacity: 1, y: 0, z: 200, scale: 1.35, duration: .34, ease: 'expo.out' }, 12.4);
  at('#gbo', { opacity: 0, x: 260, z: 120, rotation: 25, scale: .6 }, { opacity: 1, x: 0, rotation: -6, scale: 1, duration: .3, ease: 'back.out(2)' }, 12.88);
  at('#gbo', { y: 0 }, { y: -30, duration: .45, ease: 'sine.inOut', yoyo: true, repeat: 3 }, 13.2);
  at('#bPensa', { opacity: 0 }, { opacity: 1, duration: .1 }, 13.4);
  at('#bPensa', { opacity: 1 }, { opacity: 0, duration: .1 }, 14.1);
  /* responde na hora: o balão cresce e o Granabô sorri */
  at('#bR', { opacity: 0, scale: .6, transformOrigin: '0 0', z: 0 }, { opacity: 1, scale: 1.25, z: 160, duration: .3, ease: 'back.out(1.6)' }, 14.18);
  at('#gbo', { opacity: 1 }, { opacity: 0, duration: .1 }, 14.2);
  at('#gbo2', { opacity: 0, scale: .9, rotation: -6 }, { opacity: 1, scale: 1.05, rotation: 4, duration: .25, ease: 'back.out(2.5)' }, 14.2);
  at('#pb', { y: 160, rotationY: -10 }, { y: 160, rotationY: 6, duration: 1.2, ease: 'sine.inOut' }, 14.3);
  /* separando débito e crédito: os dois valores saem do balão e se separam */
  at('#bDeb', { backgroundColor: 'rgba(173,251,227,0)', color: '#effffa' }, { backgroundColor: '#ADFBE3', color: '#052229', duration: .15 }, 15.4);
  at('#bCre', { backgroundColor: 'rgba(0,166,202,0)', color: '#effffa' }, { backgroundColor: '#00a6ca', color: '#052229', duration: .15 }, 16.12);
  at('#gbo2', { opacity: 1 }, { opacity: 0, x: 200, duration: .2 }, 15.2);
  at('#spD', { opacity: 0, x: 300, y: -400, z: -200, rotationY: -40, scale: .5 }, { opacity: 1, x: 0, y: 0, z: 120, rotationY: 8, scale: 1, duration: .32, ease: 'back.out(1.6)' }, 15.4);
  at('#spC', { opacity: 0, x: -300, y: -400, z: -200, rotationY: 40, scale: .5 }, { opacity: 1, x: 0, y: 0, z: 120, rotationY: -8, scale: 1, duration: .32, ease: 'back.out(1.6)' }, 16.12);
  /* saída: tudo derrapa para fora */
  at('#pb, #spD, #spC', { x: 0, opacity: 1 }, { x: -1700, skewX: 18, opacity: 1, duration: .3, ease: 'power3.in', stagger: .05 }, 16.78);
  at('#pbSh', { opacity: 1 }, { opacity: 0, duration: .1 }, 16.86);
  cta([16.979, 17.18, 17.34, 17.7, 18.02, 18.36, 18.82, 18.9],
    (b, t) => at(b, { opacity: 0, x: 1200, skewX: -30 }, { opacity: 1, x: 0, skewX: 0, duration: .32, ease: 'back.out(2.4)' }, t));
});
