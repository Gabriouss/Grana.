/* Base da série de Reels (estilo aprovado no Fatura e parcelas v3). Cada vN.js chama montar(cfg, cena).
   Função pura do tempo: window.renderAt(t). Tempos de palavra = inicio_real do WAV original. */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const tl = gsap.timeline({ paused: true });
const S = (sel, v) => gsap.set(sel, v);
const at = (sel, from, to, t) => tl.fromTo(sel, from, Object.assign({ immediateRender: false }, to), t);
const rnd = (i) => { const r = Math.sin(i * 12.9898) * 43758.5453; return r - Math.floor(r); };

const ic = {
  card: '<svg width="34" height="28" viewBox="0 0 34 28"><rect x="2" y="3" width="30" height="22" rx="4" fill="none" stroke="#a6d9ce" stroke-width="3"/><line x1="2" y1="11" x2="32" y2="11" stroke="#a6d9ce" stroke-width="3"/></svg>',
  eye: '<svg width="40" height="28" viewBox="0 0 40 28"><path d="M2 14C8 4 32 4 38 14 32 24 8 24 2 14z" fill="none" stroke="#a6d9ce" stroke-width="3"/><circle cx="20" cy="14" r="5" fill="none" stroke="#a6d9ce" stroke-width="3"/></svg>',
  chev: '<svg width="22" height="14" viewBox="0 0 22 14"><path d="M2 2l9 9 9-9" fill="none" stroke="#a6d9ce" stroke-width="3"/></svg>',
  lt: '<svg width="22" height="36" viewBox="0 0 22 36"><path d="M18 3L4 18l14 15" fill="none" stroke="#effffa" stroke-width="4"/></svg>',
  gt: '<svg width="22" height="36" viewBox="0 0 22 36"><path d="M4 3l14 15L4 33" fill="none" stroke="#effffa" stroke-width="4"/></svg>',
  mic: (c = '#effffa') => `<svg width="26" height="32" viewBox="0 0 26 32"><rect x="8" y="2" width="10" height="18" rx="5" fill="none" stroke="${c}" stroke-width="3"/><path d="M3 15a10 10 0 0020 0M13 25v5" fill="none" stroke="${c}" stroke-width="3"/></svg>`,
  cam: '<svg width="34" height="28" viewBox="0 0 34 28"><rect x="2" y="6" width="30" height="20" rx="4" fill="none" stroke="#effffa" stroke-width="3"/><circle cx="17" cy="16" r="6" fill="none" stroke="#effffa" stroke-width="3"/><path d="M11 6l3-4h6l3 4" fill="none" stroke="#effffa" stroke-width="3"/></svg>',
  clip: '<svg width="26" height="32" viewBox="0 0 26 32"><rect x="2" y="5" width="22" height="25" rx="4" fill="none" stroke="#effffa" stroke-width="3"/><rect x="8" y="2" width="10" height="6" rx="2" fill="#052229" stroke="#effffa" stroke-width="3"/></svg>',
  doc: '<svg width="26" height="32" viewBox="0 0 26 32"><path d="M3 2h13l7 7v21H3z" fill="none" stroke="#effffa" stroke-width="3"/><path d="M8 17h10M8 23h10" stroke="#effffa" stroke-width="3"/></svg>',
  shield: '<svg width="44" height="44" viewBox="0 0 44 44"><path d="M22 6l13 5v9c0 9-6 15-13 18-7-3-13-9-13-18v-9z" fill="#1fa98d"/><path d="M16 22l5 5 8-9" fill="none" stroke="#052229" stroke-width="3.5"/></svg>',
  plane: '<svg width="44" height="44" viewBox="0 0 44 44"><path d="M6 24l12-3 8-13h4l-4 13 10-2 3-4h3l-2 7 2 7h-3l-3-4-10-2 4 13h-4l-8-13-12-3z" fill="#00a6ca"/></svg>',
  flag: '<svg width="44" height="44" viewBox="0 0 44 44"><path d="M12 6v32M12 8h20l-5 8 5 8H12" fill="#4f8796" stroke="#4f8796" stroke-width="3"/></svg>',
  x: '<svg width="30" height="30" viewBox="0 0 30 30"><path d="M5 5l20 20M25 5L5 25" stroke="#effffa" stroke-width="3"/></svg>',
  send: '<svg width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#ADFBE3"/><path d="M20 29V12M12 19l8-8 8 8" fill="none" stroke="#052229" stroke-width="3.5"/></svg>',
  medal: '<svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="20" r="9" fill="none" stroke="#ADFBE3" stroke-width="3"/><path d="M11 3l6 8 6-8" fill="none" stroke="#ADFBE3" stroke-width="3"/></svg>',
};

/* ---------- celular realista (corpo metálico, bezel, furo de câmera, botões, espessura, reflexo) ---------- */
function celular(id, frente, verso, x = 262, y = 657) {
  /* lateral de alumínio arredondada: 24 camadas de 2 px; o meio da lateral sai mais e reflete mais luz (luz vem da esquerda) */
  const N = 30, mix = (a, b, p) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(a.substr(i + 1, 2), 16) * (1 - p) + parseInt(b.substr(i + 1, 2), 16) * p).toString(16).padStart(2, '0')).join('');
  const edges = Array.from({ length: N - 1 }, (_, k) => {
    const q = (k + 1) / N, p = Math.sin(Math.PI * q), ins = (5 * (1 - p)).toFixed(1);
    const L = mix('#34434a', '#dfecef', Math.pow(p, 3)), R = mix('#141c1f', '#5d6f74', p);
    return `<div class="edge" style="inset:${ins}px;border-radius:${80 - ins}px;transform:translateZ(-${(q * 60).toFixed(1)}px);background:linear-gradient(180deg,${L},${mix('#1b2427', '#7b8d92', p)} 50%,${L})"></div>`;
  }).join('');
  const face = (conteudo, extra) => `<div class="metal"></div><div class="glassrim"></div><div class="screenbg"></div>${conteudo}<div class="punch"></div><div class="glare"><i></i></div>${extra || ''}`;
  return `<div class="pshadow" id="${id}Sh" style="left:${x - 32}px;top:${y + 1150}px"></div>
  <div class="phone" id="${id}" style="left:${x}px;top:${y}px">
   <div class="tilt">
   <div class="btn" style="left:-21px;top:250px;height:110px;transform:translateZ(-30px) rotateY(-90deg)"></div>
   <div class="btn" style="left:-21px;top:400px;height:170px;transform:translateZ(-30px) rotateY(-90deg)"></div>
   ${edges}
   <div class="face" id="${id}F">${face(`<div class="scr" id="${id}A">${frente}</div>`)}</div>
   <div class="face" id="${id}B" style="transform:translateZ(-60px) rotateY(180deg)">${verso ? face(`<div class="scr" id="${id}V">${verso}</div>`) : '<div class="back"></div>'}</div>
  </div></div>`;
}

/* ---------- peças de tela (1080 x 2388, medidas da captura real) ---------- */
const topoInicio = `
 <div class="abs" style="left:35px;top:120px;width:86px;height:86px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#9aa39f,#5a625f)"></div>
 <div class="abs" style="left:142px;top:118px;font-size:25px;color:var(--faint)">Início</div>
 <div class="abs" style="left:142px;top:150px;font-size:38px">Boa noite, Ana</div>
 <div class="pill" style="left:750px;top:122px;width:92px;height:92px">${ic.eye}</div>
 <div class="pill" style="left:862px;top:122px;width:183px;height:92px"><span class="dot" style="margin:0"></span>Total ${ic.chev}</div>
 <div class="box" style="left:35px;top:300px;width:1010px;height:120px">
   <div class="abs" style="left:46px;top:42px">${ic.lt}</div><div class="abs" style="right:46px;top:42px">${ic.gt}</div>
   <div class="abs" style="left:0;right:0;top:38px;text-align:center;font-size:35px">Outubro 2026 <span style="font-size:27px;color:var(--accent);background:rgba(31,169,141,.16);border-radius:10px;padding:2px 12px;margin-left:8px">Atual</span></div></div>`;
const acao = (id, l, t, i, txt) => `<div class="L box" id="${id}" style="left:${l}px;top:${t}px;width:495px;height:100px;display:flex;align-items:center;justify-content:center;gap:16px;font-size:27px">${i}<span>${txt}</span></div>`;
function livreCard(p) {
  return `<div class="L box" id="${p}Livre" style="left:35px;top:742px;width:1010px;height:384px;background:#0b2d35">
   <div class="pbg"></div>
   <div class="abs" style="left:47px;top:46px;font-size:28px;color:var(--faint)">Livre para gastar</div>
   <div class="abs" style="left:44px;top:92px;font-size:33px;color:var(--faint);white-space:nowrap"><span id="${p}Val" style="font-size:66px;color:var(--ink);display:inline-block;margin-right:22px">R$ 719,81</span>/dia até o fim do mês</div>
   <div class="lrow" style="top:186px">Saldo atual<b>R$ 10.723,63</b></div>
   <div class="lrow" id="${p}Guard" style="top:234px">Guardado do mês em cofrinhos<b>− R$ 643,27</b></div>
   <div class="lrow" id="${p}Cred" style="top:282px">Crédito ainda não pago<b>− R$ 722,85</b></div>
   <div class="lrow" style="top:330px">Livre no total · 13 dias restantes<b style="color:var(--ink)">R$ 9.357,51</b></div></div>`;
}
const METAS = [['Reserva de emergência', 'R$ 600,00', 'R$ 6.000,00', 10, '10%', '', '#1fa98d', 'shield'],
  ['Viagem de fim de ano', 'R$ 350,00', 'R$ 3.000,00', 12, '12%', '15 dez 2026', '#00a6ca', 'plane'],
  ['Reserva para imprevistos', 'R$ 643,27', 'R$ 6.387,45', 10, '10%', '', '#4f8796', 'flag']];
function metaCard(p, i, l, t, w = 320, h = 372) {
  const [nome, v, de, pct, pt, prazo, cor, icn] = METAS[i];
  return `<div class="L box" id="${p}M${i}" style="left:${l}px;top:${t}px;width:${w}px;height:${h}px;background:#0b2d35">
  <div class="pbg"></div>
  <div class="abs" style="left:24px;top:26px;width:66px;height:66px;border-radius:50%;background:rgba(174,255,227,.08);display:flex;align-items:center;justify-content:center">${ic[icn]}</div>
  <div class="abs" style="right:26px;top:30px;font-size:28px;color:var(--soft)">···</div>
  <div class="abs" style="left:24px;top:116px;width:${w - 40}px;font-size:30px;line-height:32px">${nome}</div>
  <div class="abs" style="left:24px;top:196px;font-size:36px">${v}</div>
  <div class="abs" style="left:24px;top:248px;font-size:25px;color:var(--faint)">de ${de}</div>
  <div class="bar" style="left:24px;top:296px;width:${w - 48}px"><i id="${p}M${i}b" style="width:${pct}%;background:${cor}"></i></div>
  <div class="abs" style="left:24px;top:322px;font-size:25px;color:var(--faint)">${pt}</div>${prazo ? `<div class="abs" style="right:24px;top:322px;font-size:25px;color:var(--faint)">${prazo}</div>` : ''}</div>`;
}
const BARRAS = [[262, 70], [262, 70], [262, 70], [190, 0], [190, 0], [190, 0]];
const MESES = ['Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar'];
function grafico(p, top = 1650) {
  const b = BARRAS.map((x, i) => `<div class="abs" id="${p}G${i}" style="left:${70 + i * 152}px;top:${330 - x[0]}px;width:50px;height:${x[0]}px;border-radius:25px 25px 6px 6px;transform-origin:50% 100%;background:linear-gradient(180deg,#00a6ca 0,#00a6ca ${x[1]}px,#1fa98d ${x[1]}px)"></div>
   <div class="abs" style="left:${60 + i * 152}px;top:342px;width:70px;text-align:center;font-size:22px;line-height:26px;color:var(--faint)">${MESES[i]}</div>`).join('');
  return `<div class="L box" id="${p}Graf" style="left:35px;top:${top}px;width:1010px;height:560px;background:#0b2d35">
   <div class="pbg"></div>
   <div class="abs" style="left:46px;top:36px;font-size:32px">Comprometimento futuro</div>
   <div class="abs" style="left:0;top:80px;width:1010px;height:380px">${b}</div>
   <div class="abs" style="left:0;right:0;top:472px;text-align:center;font-size:23px;line-height:28px;color:var(--faint)"><span class="dot" style="width:12px;height:12px"></span>Contas recorrentes &nbsp; <span class="dot" style="width:12px;height:12px;background:#00a6ca"></span>Parcelas futuras</div>
   <div class="abs" style="left:0;right:0;top:512px;text-align:center;font-size:23px;line-height:28px;color:var(--faint)">Total comprometido nos próximos 6 meses: <span id="${p}Tot">R$ 10.050,75</span></div></div>`;
}
function inicio(p, o = {}) {
  return topoInicio + acao(p + 'Voz', 35, 470, ic.mic(), 'Lançar por voz') + acao(p + 'Foto', 550, 470, ic.cam, 'Fotografar nota')
    + acao(p + 'Colar', 35, 590, ic.clip, 'Colar comprovante') + acao(p + 'Imp', 550, 590, ic.doc, 'Importar extrato')
    + livreCard(p)
    + `<div class="abs" style="left:35px;top:1170px;font-size:27px;color:var(--faint)">Cofrinhos &amp; metas</div>
 <div class="abs" style="right:35px;top:1160px;font-size:26px;color:var(--menta);background:rgba(31,169,141,.16);border-radius:999px;padding:6px 20px">Nível 3 · Aprendiz</div>`
    + metaCard(p, 0, 35, 1232) + metaCard(p, 1, 380, 1232) + metaCard(p, 2, 725, 1232)
    + grafico(p, 1650) + (o.extra || '')
    + '<div class="abs" style="left:400px;top:2336px;width:280px;height:10px;border-radius:5px;background:rgba(239,255,250,.45)"></div>';
}

/* ---------- legendas ---------- */
function legendas(G, FIM, estilos = {}) {
  $('#cap').innerHTML = G.map(([id, , fs, linhas]) => `<div class="cg" id="${id}">` + linhas.map((l) =>
    `<div class="cl" style="font-size:${fs}px;line-height:${Math.round(fs * 1.22)}px">` + l.map(([w, , c = '']) => {
      const inner = c.includes('hl') ? `<span class="bx"></span>${w}` : (c.includes('sc') ? [...w].map((ch) => `<span class="lt" style="display:inline-block">${ch}</span>`).join('') : w);
      return c.includes('mk') ? `<span class="mask"><span class="w ${c}">${inner}</span></span>` : `<span class="w ${c}">${inner}</span>`;
    }).join('') + '</div>').join('') + '</div>').join('');
  S('.cg', { opacity: 0 });
  G.forEach(([id, estilo, , linhas], gi) => {
    const ws = $$(`#${id} .w`);
    const tempos = linhas.flat().map((w) => w[1]);
    const prox = G[gi + 1] ? G[gi + 1][3][0][0][1] : 99;
    const fim = FIM[id] || prox - .05;
    tl.set('#' + id, { opacity: 1 }, tempos[0] - .01);
    ws.forEach((w, i) => {
      S(w, { opacity: 0 });
      const t = tempos[i];
      const e = w.classList.contains('slamw') ? 'slam' : estilo;
      const f = estilos[e];
      if (f) f(w, t);
      else if (e === 'slam') at(w, { opacity: 0, scale: 2.3, filter: 'blur(16px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: .14, ease: 'power3.out' }, t);
      else if (e === 'flip') at(w, { opacity: 0, rotationX: -95, y: 50, filter: 'blur(8px)' }, { opacity: 1, rotationX: 0, y: 0, filter: 'blur(0px)', duration: .16, ease: 'back.out(2)' }, t);
      else at(w, { opacity: 0, x: 140, skewX: -22 }, { opacity: 1, x: 0, skewX: 0, duration: .14, ease: 'power3.out' }, t);
      const bx = w.querySelector('.bx');
      if (bx) at(bx, { scaleX: 0 }, { scaleX: 1, duration: .18, ease: 'power3.out' }, t + .02);
    });
    at('#' + id, { opacity: 1, y: 0, filter: 'blur(0px)' }, { opacity: 0, y: -60, filter: 'blur(10px)', duration: .1, ease: 'power2.in' }, fim - .1);
  });
}

/* ---------- CTA (botão Saiba mais + logo + assinatura) ---------- */
function cta(T, entrada) {
  const [tClica, tEm, tSaiba, tMais, tE, tConhece, tO, tGrana] = T;
  $('#world').insertAdjacentHTML('beforeend', `<div id="cta" class="p3 abs" style="left:0;top:0;width:1080px;height:1920px">
   <div class="hline" id="ctaA" style="top:600px;font-size:120px;line-height:140px"><span class="w" id="cw1">Clica</span> <span class="w" id="cw2">em</span></div>
   <div class="cta-btn" id="btn"><span>Saiba mais</span><svg width="70" height="70" viewBox="0 0 70 70"><path id="seta" d="M14 35h40M38 19l16 16-16 16" fill="none" stroke="#052229" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
   <div class="ring" id="rg1" style="left:190px;top:880px;width:700px;height:180px"></div><div class="ring" id="rg2" style="left:190px;top:880px;width:700px;height:180px"></div>
   <svg id="cursor" class="abs" style="left:700px;top:1100px" width="90" height="110" viewBox="0 0 90 110"><path d="M8 6l70 52-32 6 18 36-14 6-18-36-24 22z" fill="#effffa" stroke="#052229" stroke-width="5" stroke-linejoin="round"/></svg>
   <div class="hline" id="ctaB" style="top:640px;font-size:96px;line-height:120px"><span class="w" id="cw3">e</span> <span class="w" id="cw4">conhece</span> <span class="w" id="cw5">o</span></div>
   <img id="logo" class="abs" src="assets/${document.body.classList.contains('claro') ? 'logotipo-petroleo' : 'logotipo-gradiente'}.svg" style="left:190px;top:800px;width:700px">
   <div class="hline" id="tag" style="top:1060px;font-size:50px;line-height:60px;color:var(--soft)">Seu assistente de finanças pessoais</div></div>`);
  S('#cta', { opacity: 0 }); S('#cw1, #cw2, #btn, #cursor, #ctaB, #logo, #tag, #cw3, #cw4, #cw5', { opacity: 0 });
  tl.set('#cta', { opacity: 1 }, tClica - .05);
  at('#cw1', { opacity: 0, y: 140, rotationX: -90 }, { opacity: 1, y: 0, rotationX: 0, duration: .18, ease: 'back.out(2)' }, tClica);
  at('#cw2', { opacity: 0, y: 140, rotationX: -90 }, { opacity: 1, y: 0, rotationX: 0, duration: .18, ease: 'back.out(2)' }, tEm);
  entrada('#btn', tSaiba);
  at('#seta', { x: 0 }, { x: 8, duration: .2, ease: 'power2.out', yoyo: true, repeat: 3 }, tSaiba + .2);
  at('#cursor', { opacity: 0, x: 260, y: 400 }, { opacity: 1, x: 0, y: 0, duration: .3, ease: 'power3.out' }, tSaiba + .08);
  at('#btn', { scale: 1 }, { scale: .93, duration: .07 }, tMais - .1);
  at('#btn', { scale: .93 }, { scale: 1, duration: .2, ease: 'back.out(3)' }, tMais - .03);
  at('#cursor', { scale: 1 }, { scale: .85, duration: .07, yoyo: true, repeat: 1 }, tMais - .1);
  [['#rg1', tMais - .08], ['#rg2', tMais + .06]].forEach(([r, t]) => at(r, { opacity: .9, scale: 1 }, { opacity: 0, scale: 1.35, duration: .5, ease: 'power2.out' }, t));
  at('#ctaA', { opacity: 1, y: 0 }, { opacity: 0, y: -220, filter: 'blur(12px)', duration: .18, ease: 'power3.in' }, tE - .06);
  at('#btn', { y: 0 }, { y: 560, scale: .72, duration: .4, ease: 'power3.inOut' }, tE - .04);
  at('#cursor', { opacity: 1, y: 0 }, { opacity: 0, y: 300, duration: .3, ease: 'power2.in' }, tE - .04);
  tl.set('#ctaB', { opacity: 1 }, tE - .02);
  at('#cw3', { opacity: 0, x: -120 }, { opacity: 1, x: 0, duration: .14, ease: 'power3.out' }, tE);
  at('#cw4', { opacity: 0, x: 120 }, { opacity: 1, x: 0, duration: .16, ease: 'power3.out' }, tConhece);
  at('#cw5', { opacity: 0, y: 80 }, { opacity: 1, y: 0, duration: .14, ease: 'power3.out' }, tO);
  at('#logo', { opacity: 0, scale: .7, filter: 'blur(30px)', y: 30 }, { opacity: 1, scale: 1, filter: 'blur(0px)', y: 0, duration: .55, ease: 'expo.out' }, tGrana - .02);
  at('#tag', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .3, ease: 'power3.out' }, tGrana + .45);
  at('#cta', { scale: 1 }, { scale: 1.04, duration: 1.9, ease: 'sine.out' }, tGrana + .1);
}

/* ---------- montagem e relógio ---------- */
let CFG;
function tremor(t) {
  let x = 0, y = 0, r = 0;
  for (const [t0, a] of CFG.imp) { const d = t - t0; if (d < 0 || d > .6) continue; const e = a * Math.exp(-d * 9); x += e * Math.sin(d * 58); y += e * Math.cos(d * 47) * .7; r += e * .02 * Math.sin(d * 39); }
  return `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${r.toFixed(3)}deg)`;
}
function montar(cfg, cena) {
  CFG = cfg;
  window.DUR = cfg.dur; window.VOZ = cfg.voz; window.TRILHA = cfg.trilha; window.SFX = cfg.sfx;
  cena();
  legendas(cfg.G, cfg.FIM || {}, cfg.estilos || {});
  (cfg.flash || []).forEach(([t, a, d]) => at('#flash', { opacity: a }, { opacity: 0, duration: d, ease: 'power2.out' }, t));
  tl.set('#flash', { opacity: 0 }, cfg.dur);
  window.renderAt = function (t) {
    tl.seek(Math.min(t, cfg.dur), false);
    $('#shake').style.transform = tremor(t);
    $('#floor').style.transform = `rotateX(78deg) translateY(${(-t * 60) % 120}px)`;
    $('#glow').style.transform = `translateX(${Math.sin(t * .5) * 60}px) scale(${1 + Math.sin(t * .7) * .05})`;
    $('#glow2').style.transform = `translate(${Math.sin(t * .4) * 120}px,${Math.cos(t * .3) * 80}px)`;
    // reflexo do vidro acompanha o giro do aparelho; sombra segue o aparelho
    $$('.phone').forEach((p) => {
      const ry = gsap.getProperty(p, 'rotationY') || 0, rx = gsap.getProperty(p, 'rotationX') || 0;
      p.querySelectorAll('.glare i').forEach((g) => { g.style.transform = `translateX(${(ry % 360) * 9 + rx * 4}px) rotate(18deg)`; });
      const sh = document.getElementById(p.id + 'Sh');
      if (sh) { sh.style.opacity = gsap.getProperty(p, 'opacity'); sh.style.transform = `translateX(${gsap.getProperty(p, 'x')}px) scaleX(${(gsap.getProperty(p, 'scale') || 1) * Math.abs(Math.cos(ry * Math.PI / 180) * .7 + .3)})`; }
    });
    return t;
  };
  /* carrega as fontes de propósito antes de liberar a captura (a Ultrabold já faltou num render do V1) */
  Promise.all(['300 40px NM', '400 40px NM', '800 40px NMU'].map((f) => document.fonts.load(f))).then(() => document.fonts.ready).then(() => {
    if (document.body.classList.contains('claro') && !document.fonts.check('800 40px NMU')) throw new Error('Ultrabold ausente');
    window.renderAt(0); window.__ready = true;
  });
}

/* ---------- tema claro: moldura, painel com grade, disco claro, cantos fixos, ícones desfocados ---------- */
function temaClaro(o) {
  document.body.classList.add('claro');
  const d = o.disco || { x: -500, y: 120, r: 1250 };
  $('#stage').insertAdjacentHTML('afterbegin', `<div id="painel"><div class="disco" id="disco" style="left:${d.x}px;top:${d.y}px;width:${d.r}px;height:${d.r}px"></div>
   <div class="gota" style="left:-70px;top:${o.gota || 300}px;width:150px;height:200px"></div><div class="brilho"></div></div>`);
  $('#vig').insertAdjacentHTML('beforebegin', `<div id="cantos">
   <img src="assets/logotipo-petroleo.svg">
   <div class="rot" style="right:62px;top:86px">RÁPIDO</div>
   <div class="rot" style="left:84px;top:1800px">FÁCIL</div>
   <div class="rot" style="right:62px;top:1800px">PRÁTICO</div></div>`);
  (o.icones || []).forEach(([nome, x, y, tam, rot], i) =>
    $('#world').insertAdjacentHTML('afterbegin', `<img class="icf" id="icf${i}" src="assets/ic-${nome}.png" style="left:${x}px;top:${y}px;width:${tam}px">`));
  (o.icones || []).forEach(([, , , , rot], i) => S('#icf' + i, { rotation: rot }));
}
