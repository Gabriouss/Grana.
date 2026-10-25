/* V1 Quanto pode gastar hoje. Tema claro (sharingan do criativo do autor) + assinatura "elevador":
   legendas sobem de máscaras, o celular nasce deitado e se levanta, trocas na vertical. */
$('#extra').textContent = `
#cap{left:70px;top:150px;width:940px;height:470px}
.cg{width:940px;height:470px;align-items:flex-start;text-align:left}
#saldo{left:150px;top:820px;width:780px;height:240px}
.modal{position:absolute;left:30px;top:520px;width:1020px;height:700px;border-radius:40px;background:#0b2d35;border:2px solid rgba(174,255,227,.26);transform-style:preserve-3d}
`;
const mk = (lines) => lines.map((l) => l.map(([w, t, c = '']) => [w, t, (c + ' mk').trim()]));
const G = [
  ['g1', 'rise', 120, mk([[['Você', 0], ['sabe', .2]]])],
  ['g2', 'rise', 108, mk([[['quanto', .773], ['pode', .92]], [['gastar', 1.28], ['hoje?', 1.66, 'hl']]])],
  ['g3', 'rise', 86, mk([[['Se', 2.267], ['o', 2.38], ['salário', 2.44]], [['some', 2.8, 'grad'], ['antes', 3.12]]])],
  ['g4', 'rise', 86, mk([[['do', 3.58], ['fim', 3.8], ['do', 3.98], ['mês,', 4.08]]])],
  ['g5', 'slam', 118, [[['olha', 4.768], ['isso.', 4.92, 'hl']]]],
  ['g6', 'rise', 90, mk([[['O', 5.691], ['app', 5.78], ['mostra,', 5.92]]])],
  ['g7', 'slam', 116, [[['todo', 6.599], ['dia,', 6.7, 'hl']]]],
  ['g8', 'rise', 84, mk([[['quanto', 7.34], ['está', 7.44], ['livre', 7.76, 'hl']], [['pra', 8.04], ['gastar,', 8.24]]])],
  ['g9', 'rise', 86, mk([[['já', 8.9], ['descontando', 9.02]], [['o', 9.54], ['cartão', 9.62, 'hl']]])],
  ['g10', 'rise', 80, mk([[['e', 10.04], ['o', 10.22], ['que', 10.3], ['você', 10.34]], [['separou', 10.58, 'hl'], ['no', 10.98], ['mês.', 11.06]]])],
  ['g11', 'rise', 84, mk([[['Anota', 11.669], ['um', 11.94], ['gasto', 12.06]], [['em', 12.36], ['segundos', 12.44, 'hl']]])],
  ['g12', 'rise', 76, mk([[['colando', 13.0], ['o', 13.52]], [['comprovante', 13.62], ['do', 14.02], ['Pix', 14.16, 'hl']]])],
  ['g13', 'slam', 96, [[['ou', 14.48], ['falando', 14.78, 'hl']], [['o', 15.1], ['gasto.', 15.28]]]],
];
const sobe = (w, t) => at(w, { opacity: 0, yPercent: 115 }, { opacity: 1, yPercent: 0, duration: .16, ease: 'power3.out' }, t);

montar({
  dur: 19.8, voz: 'E:/Grana-temporarios/2026-10-24-tino-videos/trabalho/narracoes/v1-narracao-final.wav',
  trilha: { arquivo: 'E:/Grana-temporarios/2026-10-25-reels-cinco-estilos-60fps/audio/v1-trilha.wav', inicio: .731 },
  G, FIM: { g10: 11.25, g13: 15.75 }, estilos: { rise: sobe },
  imp: [[.02, 10], [2.8, 14], [4.77, 20], [13.0, 8], [16.26, 18]],
  flash: [[0, .55, .3], [4.77, .5, .3], [16.26, .4, .3], [17.74, .35, .45]],
  sfx: [['synthetic/rise.wav', 0, .4], ['synthetic/pop.wav', .2, .3], ['synthetic/whoosh.wav', .77, .3], ['snap.wav', 1.68, .5],
    ['synthetic/whoosh.wav', 2.27, .3], ['synthetic/rewind.wav', 2.8, .35], ['synthetic/whoosh.wav', 3.6, .45],
    ['synthetic/bass_drop.wav', 4.77, .5], ['click.wav', 5.69, .3], ['synthetic/pop.wav', 6.6, .4], ['synthetic/synth_hit.wav', 7.76, .3],
    ['synthetic/tick.wav', 9.62, .4], ['synthetic/tick.wav', 10.58, .4], ['synthetic/whoosh.wav', 11.3, .45],
    ...[0, 1, 2, 3].map((i) => ['synthetic/tick.wav', 11.7 + i * .08, .25]), ['mouse_click.wav', 12.95, .5], ['synthetic/whoosh.wav', 13.25, .3],
    ['synthetic/pop.wav', 14.16, .4], ['synthetic/whoosh.wav', 14.5, .3], ['synthetic/data.wav', 14.8, .25],
    ['synthetic/whoosh.wav', 15.5, .45], ['synthetic/rise.wav', 15.9, .3], ['synthetic/bass_drop.wav', 16.24, .4], ['mouse_click.wav', 16.5, .6], ['success.wav', 17.74, .35]],
}, () => {
  temaClaro({ disco: { x: -560, y: 60, r: 1420 }, gota: 980,
    icones: [['dinheiro', 850, 420, 270, 12], ['calendario', -110, 1250, 240, -15], ['tempo', 880, 1470, 150, 18]] });

  const modal = `<div class="L" id="aDim" style="left:0;top:0;width:1080px;height:2388px;background:rgba(1,10,13,.6);opacity:0"></div>
   <div class="L modal" id="aModal" style="opacity:0">
    <div class="abs" style="left:44px;top:46px;font-size:42px">Colar comprovante ou Pix</div><div class="abs" style="right:44px;top:50px">${ic.x}</div>
    <div class="abs" style="left:44px;top:118px;width:930px;font-size:28px;line-height:38px;color:var(--soft)">Cole o texto copiado de um comprovante Pix, fatura ou recibo. Identificamos o valor, categoria e tipo automaticamente.</div>
    <div class="abs" id="aIn" style="left:44px;top:250px;width:932px;height:250px;border-radius:24px;border:3px solid #ADFBE3;background:rgba(5,34,41,.6)">
      <div class="abs" style="left:28px;top:26px;font-size:28px;color:var(--faint)">Ex.: Você pagou R$ 45,90 ao Mercado</div>
      <div class="abs" id="aTip" style="left:20px;top:-70px;padding:10px 26px;border-radius:14px;background:#22343a;font-size:28px;color:var(--ink);box-shadow:0 10px 30px rgba(0,0,0,.4);opacity:0">Colar</div></div>
    <div class="abs" style="left:44px;top:540px;width:932px;height:100px;border-radius:24px;background:#effffa;color:#052229;display:flex;align-items:center;justify-content:center;font-size:32px">Reconhecer dados</div></div>
   <div class="L" id="aOuv" style="left:35px;top:470px;width:495px;height:100px;border-radius:30px;background:#ADFBE3;display:flex;align-items:center;justify-content:center;gap:16px;font-size:27px;color:#052229;opacity:0">${ic.mic('#052229')}Ouvindo...</div>`;
  $('#world').insertAdjacentHTML('beforeend', `
   <div id="saldo" class="card p3"><div class="abs" style="left:48px;top:44px;font-size:34px;color:var(--faint)">Saldo atual</div>
     <div class="abs" id="saldoV" style="left:44px;top:100px;font-size:96px;line-height:110px;white-space:nowrap">${[...'R$ 10.723,63'].map((c) => `<span class="sd" style="display:inline-block">${c === ' ' ? '&nbsp;' : c}</span>`).join('')}</div></div>
   ${celular('pa', inicio('a', { extra: modal }), null, 262, 720)}
   ${[1, 2, 3].map((i) => `<div class="ring" id="mr${i}" style="left:226px;top:1069px;width:240px;height:240px;border-radius:50%;border-color:#ADFBE3"></div>`).join('')}`);

  // ícones derivam devagar (parallax) para nada ficar parado
  [0, 1, 2].forEach((i) => at('#icf' + i, { y: 0 }, { y: i % 2 ? -90 : 70, duration: 19.8, ease: 'none' }, 0));
  at('#disco', { x: 0, y: 0 }, { x: 60, y: -120, duration: 19.8, ease: 'none' }, 0);

  /* gancho: celular deitado sobe por baixo, como um elevador */
  S('#pa', { scale: 1.15, rotationX: 74, y: 820, z: -300 });
  at('#pa', { y: 1400, rotationX: 80 }, { y: 820, rotationX: 74, duration: .7, ease: 'expo.out' }, 0);
  at('#pa', { rotationZ: -6 }, { rotationZ: 6, duration: 4.6, ease: 'sine.inOut' }, .2);
  /* saldo que some */
  S('#saldo', { opacity: 0 });
  at('#saldo', { opacity: 0, y: 500, rotationX: -40 }, { opacity: 1, y: 0, rotationX: 8, duration: .32, ease: 'back.out(1.4)' }, 2.25);
  $$('.sd').forEach((s, i) => at(s, { y: 0, rotation: 0, opacity: 1 }, { y: 520 + rnd(i) * 300, rotation: (rnd(i + 3) - .5) * 120, opacity: 0, duration: .5, ease: 'power2.in' }, 2.8 + i * .035));
  at('#saldo', { y: 0, rotationX: 8 }, { y: 1300, rotationX: 50, duration: .5, ease: 'power3.in' }, 3.62);
  /* "olha isso": o celular se levanta */
  at('#pa', { y: 820, rotationX: 74, z: -300, rotationZ: 6 }, { y: 0, rotationX: 6, z: 0, rotationZ: 0, duration: .5, ease: 'back.out(1.3)' }, 4.62);
  at('#pa', { rotationY: 0 }, { rotationY: -10, duration: 1.4, ease: 'sine.inOut' }, 5.1);
  /* "todo dia": Livre para gastar salta */
  at('#aLivre', { z: 0, scale: 1 }, { z: 150, scale: 1.1, duration: .24, ease: 'back.out(2)' }, 6.58);
  at('#aLivre .pbg', { opacity: 0 }, { opacity: 1, duration: .2 }, 6.58);
  at('#aVal', { transformOrigin: 'left center', color: '#effffa', textShadow: '0 0 0 rgba(0,0,0,0)', scale: 1 }, { color: '#ADFBE3', textShadow: '0 0 40px rgba(173,251,227,.8)', scale: 1.12, duration: .2 }, 7.74);
  at('#pa', { rotationY: -10 }, { rotationY: 8, duration: 1.6, ease: 'sine.inOut' }, 6.6);
  /* cartão e cofrinhos descontados: as linhas saem da tela */
  [['#aCred', 9.6], ['#aGuard', 10.56]].forEach(([r, t]) => {
    at(r, { z: 0, scale: 1, backgroundColor: 'rgba(173,251,227,0)', color: '#7fa9a0' }, { z: 50, scale: 1, backgroundColor: 'rgba(173,251,227,.2)', color: '#ADFBE3', duration: .18, ease: 'back.out(2)' }, t);
    at(r, { z: 50 }, { z: 0, duration: .3 }, t + .7);
  });
  [0, 1, 2].forEach((i) => at('#aM' + i, { z: 0 }, { z: 60, duration: .2, ease: 'back.out(2)', yoyo: true, repeat: 1, repeatDelay: .25 }, 10.6 + i * .08));
  at('#aLivre', { z: 150, scale: 1.1 }, { z: 0, scale: 1, duration: .3 }, 11.0);
  /* elevador: o celular sobe e volta mostrando os botões de lançar */
  at('#pa', { y: 0, rotationY: 8 }, { y: -1500, rotationY: 0, duration: .32, ease: 'power3.in' }, 11.2);
  at('#pa', { y: 1500, scale: 1.15 }, { y: 360, scale: 1.55, duration: .42, ease: 'expo.out' }, 11.52);
  ['#aVoz', '#aFoto', '#aColar', '#aImp'].forEach((b, i) => at(b, { z: 0, scale: 1 }, { z: 80, scale: 1.06, duration: .2, ease: 'back.out(2)' }, 11.7 + i * .08));
  at('#aVoz, #aFoto, #aImp', { z: 80, scale: 1.06, opacity: 1 }, { z: 0, scale: 1, opacity: .45, duration: .25 }, 12.7);
  at('#aColar', { scale: 1.06 }, { scale: .94, duration: .08, yoyo: true, repeat: 1 }, 12.92);
  /* modal do Pix sobe dentro da tela (janela aberta antes de colar, como decidido antes) */
  at('#pa', { y: 360, scale: 1.55 }, { y: 120, scale: 1.3, duration: .4, ease: 'power3.inOut' }, 13.05);
  at('#aDim', { opacity: 0 }, { opacity: 1, duration: .2 }, 13.1);
  at('#aModal', { opacity: 0, y: 500 }, { opacity: 1, y: 0, duration: .32, ease: 'expo.out' }, 13.12);
  at('#aModal', { z: 0 }, { z: 110, duration: .26, ease: 'back.out(1.6)' }, 13.6);
  at('#aTip', { opacity: 0, scale: .6, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: .18, ease: 'back.out(2.5)' }, 14.14);
  at('#aIn', { boxShadow: '0 0 0 rgba(173,251,227,0)' }, { boxShadow: '0 0 40px rgba(173,251,227,.6)', duration: .2, yoyo: true, repeat: 1 }, 14.16);
  /* "ou falando o gasto": modal desce e o botão vira Ouvindo... com anéis */
  at('#aModal', { y: 0, z: 110, opacity: 1 }, { y: 700, z: 0, opacity: 0, duration: .26, ease: 'power3.in' }, 14.44);
  at('#aDim', { opacity: 1 }, { opacity: 0, duration: .2 }, 14.5);
  at('#aColar, #aFoto, #aImp', { opacity: .45 }, { opacity: 1, duration: .2 }, 14.6);
  at('#pa', { y: 120, scale: 1.3 }, { y: 380, scale: 1.55, duration: .35, ease: 'power3.inOut' }, 14.5);
  at('#aOuv', { opacity: 0, scale: .9 }, { opacity: 1, scale: 1, duration: .14, ease: 'back.out(2)' }, 14.76);
  at('#aOuv', { z: 0 }, { z: 90, duration: .2, ease: 'back.out(2)' }, 14.8);
  [1, 2, 3].forEach((i) => at('#mr' + i, { opacity: .9, scale: .4 }, { opacity: 0, scale: 2.6, duration: .7, ease: 'power2.out' }, 14.82 + (i - 1) * .22));
  /* saída: o celular desce, o botão sobe */
  at('#pa', { y: 380, opacity: 1 }, { y: 2000, opacity: 0, duration: .4, ease: 'power3.in' }, 15.45);
  cta([15.894, 16.1, 16.26, 16.6, 16.86, 17.22, 17.68, 17.76],
    (b, t) => at(b, { opacity: 0, y: 760, scale: .85 }, { opacity: 1, y: 0, scale: 1, duration: .34, ease: 'back.out(1.6)' }, t));
});
