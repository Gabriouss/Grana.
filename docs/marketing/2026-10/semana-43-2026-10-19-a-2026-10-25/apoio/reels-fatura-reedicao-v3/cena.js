/* Fatura e parcelas v3. Cena deterministica: window.renderAt(t) e funcao pura do tempo.
   Tempos de palavra = inicio_real do WAV original (fontes/v2-inicio-real-original.json), voz em t=0. */
const $ = (s) => document.querySelector(s);
const DUR = 19.75;

/* ---------- ícones simples ---------- */
const ic = {
  card: '<svg width="34" height="28" viewBox="0 0 34 28"><rect x="2" y="3" width="30" height="22" rx="4" fill="none" stroke="#a6d9ce" stroke-width="3"/><line x1="2" y1="11" x2="32" y2="11" stroke="#a6d9ce" stroke-width="3"/></svg>',
  eye: '<svg width="40" height="28" viewBox="0 0 40 28"><path d="M2 14C8 4 32 4 38 14 32 24 8 24 2 14z" fill="none" stroke="#a6d9ce" stroke-width="3"/><circle cx="20" cy="14" r="5" fill="none" stroke="#a6d9ce" stroke-width="3"/></svg>',
  chev: '<svg width="22" height="14" viewBox="0 0 22 14"><path d="M2 2l9 9 9-9" fill="none" stroke="#a6d9ce" stroke-width="3"/></svg>',
  lt: '<svg width="22" height="36" viewBox="0 0 22 36"><path d="M18 3L4 18l14 15" fill="none" stroke="#effffa" stroke-width="4"/></svg>',
  gt: '<svg width="22" height="36" viewBox="0 0 22 36"><path d="M4 3l14 15L4 33" fill="none" stroke="#effffa" stroke-width="4"/></svg>',
  mic: '<svg width="26" height="32" viewBox="0 0 26 32"><rect x="8" y="2" width="10" height="18" rx="5" fill="none" stroke="#effffa" stroke-width="3"/><path d="M3 15a10 10 0 0020 0M13 25v5" fill="none" stroke="#effffa" stroke-width="3"/></svg>',
  cam: '<svg width="34" height="28" viewBox="0 0 34 28"><rect x="2" y="6" width="30" height="20" rx="4" fill="none" stroke="#effffa" stroke-width="3"/><circle cx="17" cy="16" r="6" fill="none" stroke="#effffa" stroke-width="3"/><path d="M11 6l3-4h6l3 4" fill="none" stroke="#effffa" stroke-width="3"/></svg>',
  clip: '<svg width="26" height="32" viewBox="0 0 26 32"><rect x="2" y="5" width="22" height="25" rx="4" fill="none" stroke="#effffa" stroke-width="3"/><rect x="8" y="2" width="10" height="6" rx="2" fill="#052229" stroke="#effffa" stroke-width="3"/></svg>',
  doc: '<svg width="26" height="32" viewBox="0 0 26 32"><path d="M3 2h13l7 7v21H3z" fill="none" stroke="#effffa" stroke-width="3"/><path d="M8 17h10M8 23h10" stroke="#effffa" stroke-width="3"/></svg>',
  shield: '<svg width="44" height="44" viewBox="0 0 44 44"><path d="M22 6l13 5v9c0 9-6 15-13 18-7-3-13-9-13-18v-9z" fill="#1fa98d"/><path d="M16 22l5 5 8-9" fill="none" stroke="#052229" stroke-width="3.5"/></svg>',
  plane: '<svg width="44" height="44" viewBox="0 0 44 44"><path d="M6 24l12-3 8-13h4l-4 13 10-2 3-4h3l-2 7 2 7h-3l-3-4-10-2 4 13h-4l-8-13-12-3z" fill="#00a6ca"/></svg>',
  flag: '<svg width="44" height="44" viewBox="0 0 44 44"><path d="M12 6v32M12 8h20l-5 8 5 8H12" fill="#4f8796" stroke="#4f8796" stroke-width="3"/></svg>',
};

/* ---------- tela Crédito (1080 x 2388, coordenadas da captura real) ---------- */
function row(id, top, nome, chip, sub, val, dot) {
  const n = chip ? `${nome} <span class="pchip" id="${id}k">(${chip})</span>` : nome;
  const d = dot ? `<span class="dot" style="background:${dot}"></span>` : '';
  return `<div class="L row" id="${id}" style="top:${top}px"><div class="abs pbg" style="left:14px;right:14px;top:-22px;bottom:-14px;border-radius:26px;background:#0e3640;border:2px solid rgba(174,255,227,.32);box-shadow:0 30px 60px rgba(0,0,0,.45);opacity:0"></div>
   <div class="n">${d}${n}</div><div class="s"${dot ? ' style="left:65px"' : ''}>${sub}</div><div class="v">${val}</div></div>`;
}
function ccard(left, nome, fim, val, lim, pct, w, dotc, cls) {
  return `<div class="ccard ${cls}" style="left:${left}px;top:474px;width:495px;height:336px${cls ? '' : ';border-color:rgba(174,255,227,.30)'}">
   <div class="abs" style="left:30px;top:34px;font-size:32px"><span class="dot" style="background:${dotc}"></span>${nome}</div>
   <div class="abs" style="left:62px;top:84px;font-size:25px;color:var(--faint)">●●●● ${fim}</div>
   <div class="abs" style="left:30px;top:146px;font-size:27px;color:var(--faint)">Fatura atual</div>
   <div class="abs" style="left:28px;top:184px;font-size:48px;color:var(--down)">${val}</div>
   <div class="abs" style="left:30px;top:258px;font-size:26px;color:var(--faint)">Limite: ${lim}</div>
   <div class="abs" style="right:30px;top:258px;font-size:27px">${pct}</div>
   <div class="bar" style="left:30px;top:302px;width:435px"><i style="width:${w}%;background:${dotc}"></i></div></div>`;
}
$('#scrC').innerHTML = `
 <div class="abs" style="left:35px;top:132px;font-size:46px">Crédito</div>
 <div class="pill" style="left:505px;top:122px;width:225px;height:92px">${ic.card}+ Cartão</div>
 <div class="pill" style="left:750px;top:122px;width:92px;height:92px">${ic.eye}</div>
 <div class="pill" style="left:862px;top:122px;width:183px;height:92px"><span class="dot" style="margin:0"></span>Total ${ic.chev}</div>
 <div class="abs" style="left:0;top:262px;width:1080px;height:2px;background:var(--rule)"></div>
 <div class="L box" id="cNav" style="left:35px;top:300px;width:1010px;height:120px">
   <div class="abs" style="left:46px;top:42px">${ic.lt}</div><div class="abs" style="right:46px;top:42px">${ic.gt}</div>
   <div class="abs" style="left:0;right:0;top:38px;text-align:center;font-size:35px">Fatura de Outubro 2026 <span style="font-size:27px;color:var(--accent);background:rgba(31,169,141,.16);border-radius:10px;padding:2px 12px;margin-left:8px">Atual</span></div></div>
 <div class="L" id="cCards" style="left:0;top:0">${ccard(35, 'Cartão Principal', '4821', 'R$ 306,90', 'R$ 3.500,00', '9%', 9, '#1fa98d', 'on')}${ccard(550, 'Cartão Horizonte', '4827', 'R$ 415,95', 'R$ 8.750,65', '5%', 5, '#7fa9a0', '')}</div>
 <div class="L box" id="cTot" style="left:35px;top:842px;width:1010px;height:170px">
   <div class="abs" style="left:34px;top:30px;font-size:27px;color:var(--faint)">Total das faturas (todos os cartões)</div>
   <div class="abs" style="left:32px;top:72px;font-size:56px;color:var(--down)">R$ 722,85</div></div>
 <div class="abs" style="left:35px;top:1046px;font-size:26px;color:var(--faint)">Compras por cartão · use as opções para editar ou excluir</div>
 ${row('h1', 1112, 'Cartão Principal', '', 'Ciclo 25 set a 24 out', 'R$ 306,90', '#1fa98d')}
 ${row('r1', 1250, 'Fone de ouvido', '1/3', '04 out 2026 • Outros', '− R$ 120,00')}
 ${row('r2', 1400, 'Jantar com amigos', '', '03 out 2026 • Alimentação', '− R$ 112,00')}
 ${row('r3', 1550, 'Livraria', '', '02 out 2026 • Lazer', '− R$ 74,90')}
 ${row('h2', 1712, 'Cartão Horizonte', '', 'Ciclo 25 set a 24 out', 'R$ 415,95', '#7fa9a0')}
 ${row('r4', 1850, 'Notebook de trabalho', '1/3', '19 out 2026 • Outros', '− R$ 415,95')}
 <div class="abs" style="left:400px;top:2336px;width:280px;height:10px;border-radius:5px;background:rgba(239,255,250,.45)"></div>`;

/* ---------- tela Início ---------- */
function act(l, t, i, txt) { return `<div class="box" style="left:${l}px;top:${t}px;width:495px;height:100px;display:flex;align-items:center;justify-content:center;gap:16px;font-size:27px">${i}${txt}</div>`; }
function meta(l, i, nome, v, de, w, pct, extra, cor) {
  return `<div class="box" style="left:${l}px;top:1232px;width:320px;height:372px;background:rgba(11,45,53,.7)">
  <div class="abs" style="left:24px;top:26px;width:66px;height:66px;border-radius:50%;background:rgba(174,255,227,.08);display:flex;align-items:center;justify-content:center">${i}</div>
  <div class="abs" style="right:26px;top:30px;font-size:28px;color:var(--soft)">···</div>
  <div class="abs" style="left:24px;top:116px;width:280px;font-size:30px;line-height:32px">${nome}</div>
  <div class="abs" style="left:24px;top:196px;font-size:36px">${v}</div>
  <div class="abs" style="left:24px;top:248px;font-size:25px;color:var(--faint)">de ${de}</div>
  <div class="bar" style="left:24px;top:296px;width:272px"><i style="width:${w}%;background:${cor}"></i></div>
  <div class="abs" style="left:24px;top:322px;font-size:25px;color:var(--faint)">${pct}</div>${extra}</div>`;
}
const barras = [[262, 70], [262, 70], [262, 70], [190, 0], [190, 0], [190, 0]].map((b, i) =>
  `<div class="abs" style="left:${70 + i * 152}px;top:${330 - b[0]}px;width:50px;height:${b[0]}px;border-radius:25px 25px 6px 6px;background:linear-gradient(180deg,#00a6ca 0,#00a6ca ${b[1]}px,#1fa98d ${b[1]}px)"></div>
   <div class="abs" style="left:${70 + i * 152}px;top:342px;width:50px;text-align:center;font-size:22px;line-height:26px;color:var(--faint)">${['Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar'][i]}</div>`).join('');
$('#scrH').innerHTML = `
 <div class="abs" style="left:35px;top:120px;width:86px;height:86px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#9aa39f,#5a625f)"></div>
 <div class="abs" style="left:142px;top:118px;font-size:25px;color:var(--faint)">Início</div>
 <div class="abs" style="left:142px;top:150px;font-size:38px">Boa noite, Ana</div>
 <div class="pill" style="left:750px;top:122px;width:92px;height:92px">${ic.eye}</div>
 <div class="pill" style="left:862px;top:122px;width:183px;height:92px"><span class="dot" style="margin:0"></span>Total ${ic.chev}</div>
 <div class="box" style="left:35px;top:300px;width:1010px;height:120px">
   <div class="abs" style="left:46px;top:42px">${ic.lt}</div><div class="abs" style="right:46px;top:42px">${ic.gt}</div>
   <div class="abs" style="left:0;right:0;top:38px;text-align:center;font-size:35px">Outubro 2026 <span style="font-size:27px;color:var(--accent);background:rgba(31,169,141,.16);border-radius:10px;padding:2px 12px;margin-left:8px">Atual</span></div></div>
 ${act(35, 470, ic.mic, 'Lançar por voz')}${act(550, 470, ic.cam, 'Fotografar nota')}${act(35, 590, ic.clip, 'Colar comprovante')}${act(550, 590, ic.doc, 'Importar extrato')}
 <div class="L box" id="hLivre" style="left:35px;top:742px;width:1010px;height:384px;background:#0b2d35">
   <div class="abs pbg" style="inset:-2px;border-radius:30px;border:3px solid #ADFBE3;box-shadow:0 0 60px rgba(173,251,227,.35),0 40px 80px rgba(0,0,0,.5);opacity:0"></div>
   <div class="abs" style="left:47px;top:46px;font-size:28px;color:var(--faint)">Livre para gastar</div>
   <div class="abs" style="left:44px;top:92px;font-size:33px;color:var(--faint);white-space:nowrap"><span id="hVal" style="font-size:66px;color:var(--ink);display:inline-block">R$ 719,81</span>/dia até o fim do mês</div>
   <div class="lrow" style="top:186px">Saldo atual<b>R$ 10.723,63</b></div>
   <div class="lrow" style="top:234px">Guardado do mês em cofrinhos<b>− R$ 643,27</b></div>
   <div class="lrow" id="hCred" style="top:282px"><span class="abs" id="hCredBg" style="left:-18px;right:-18px;top:-8px;bottom:-8px;border-radius:12px;background:rgba(173,251,227,.18);opacity:0"></span>Crédito ainda não pago<b>− R$ 722,85</b></div>
   <div class="lrow" style="top:330px;color:var(--faint)">Livre no total · 13 dias restantes<b style="color:var(--ink)">R$ 9.357,51</b></div></div>
 <div class="abs" style="left:35px;top:1170px;font-size:27px;color:var(--faint)">Cofrinhos &amp; metas</div>
 <div class="abs" style="right:35px;top:1160px;font-size:26px;color:var(--menta);background:rgba(31,169,141,.16);border-radius:999px;padding:6px 20px">Nível 3 · Aprendiz</div>
 ${meta(35, ic.shield, 'Reserva de emergência', 'R$ 600,00', 'R$ 6.000,00', 10, '10%', '', '#1fa98d')}
 ${meta(380, ic.plane, 'Viagem de fim de ano', 'R$ 350,00', 'R$ 3.000,00', 12, '12%', '<div class="abs" style="right:24px;top:322px;font-size:25px;color:var(--faint)">15 dez 2026</div>', '#00a6ca')}
 ${meta(725, ic.flag, 'Reserva para imprevistos', 'R$ 643,27', 'R$ 6.387,45', 10, '10%', '', '#4f8796')}
 <div class="box" style="left:35px;top:1650px;width:1010px;height:520px;background:rgba(11,45,53,.7)">
   <div class="abs" style="left:46px;top:36px;font-size:32px">Comprometimento futuro</div>
   <div class="abs" style="left:0;top:80px;width:1010px;height:380px">${barras}</div>
   <div class="abs" style="left:0;right:0;top:494px;text-align:center;font-size:23px;line-height:28px;color:var(--faint)">Total comprometido nos próximos 6 meses: R$ 10.050,75</div></div>
 <div class="abs" style="left:400px;top:2336px;width:280px;height:10px;border-radius:5px;background:rgba(239,255,250,.45)"></div>`;

/* ---------- nuvem de compras (S2) ---------- */
const COMPRAS = [
  ['k1', 'Fone de ouvido', '1/3', '04 out 2026 • Outros', '− R$ 120,00', -90, -330, 40, 14, -4],
  ['k2', 'Jantar com amigos', '', '03 out 2026 • Alimentação', '− R$ 112,00', 110, -70, -260, -16, 3],
  ['k3', 'Livraria', '', '02 out 2026 • Lazer', '− R$ 74,90', -110, 200, -420, 18, -2],
  ['k4', 'Notebook de trabalho', '1/3', '19 out 2026 • Outros', '− R$ 415,95', 90, 440, 20, -12, 4],
];
$('#cloud').innerHTML = COMPRAS.map(([id, n, k, s, v]) =>
  `<div class="card" id="${id}" style="left:-360px;top:-80px;width:720px;height:160px">
    <div class="abs" style="left:40px;top:26px;font-size:36px;line-height:46px">${n}${k ? ` <span class="pchip reg" id="${id}k" style="transform-origin:0 60%;color:#052229;background:#ADFBE3;padding:0 14px;border-radius:14px;font-size:34px">${k}</span>` : ''}</div>
    <div class="abs" style="left:40px;top:100px;font-size:27px;line-height:34px;color:var(--faint)">${s}</div>
    <div class="abs" style="right:40px;top:96px;font-size:34px;line-height:40px;color:var(--down)">${v}</div></div>`).join('');

/* ---------- legendas (S2 a S4) ---------- */
const G = [
  // [id, estilo, tamanho, linhas:[[palavra,t,classe]]]
  ['g1', 'slam', 138, [[['O', 3.002], ['susto', 3.1, 'mint reg']]]],
  ['g2', 'flip', 103, [[['vem', 3.56], ['das', 3.7], ['parcelas', 3.82, 'hl']]]],
  ['g3', 'flip', 88, [[['que', 4.52], ['a', 4.64], ['gente', 4.68], ['esquece', 4.82, 'mint reg sc']]]],
  ['g4', 'slide', 110, [[['pelo', 5.38], ['caminho.', 5.58]]]],
  ['g5', 'slam', 150, [[['Aqui,', 6.386, 'grad reg']]]],
  ['g6', 'flip', 103, [[['a', 6.96], ['fatura', 7.04, 'hl'], ['mostra', 7.34]]]],
  ['g7', 'slide', 76, [[['cada', 7.62], ['compra', 8.08], ['parcelada', 8.46, 'hl']]]],
  ['g8', 'flip', 99, [[['e', 9.22], ['em', 9.44], ['qual', 9.58], ['parcela', 9.8, 'hl']]]],
  ['g9', 'slam', 120, [[['ela', 10.36], ['está.', 10.46, 'mint reg']]]],
  ['g10', 'flip', 92, [[['E', 11.044], ['o', 11.12], ['valor', 11.16], ['do', 11.4], ['cartão', 11.56, 'mint reg']]]],
  ['g11', 'slam', 129, [[['a', 11.9], ['pagar', 11.97, 'hl']]]],
  ['g12', 'slide', 104, [[['já', 12.32], ['sai', 12.58], ['do', 12.9], ['seu', 13.0]], [['livre', 13.14, 'grad reg slamw big'], ['do', 13.46, 'grad reg slamw big'], ['dia', 13.64, 'grad reg slamw big']]]],
  ['g14', 'flip', 94, [[['antes', 13.94], ['do', 14.34]], [['vencimento', 14.54, 'hl'], ['chegar.', 14.98]]]],
];
const FIM = { g4: 5.92, g9: 10.98, g14: 15.25 };
$('#cap').innerHTML = G.map(([id, , fs, linhas]) => `<div class="cg" id="${id}">` + linhas.map((l) =>
  `<div class="cl" style="font-size:${fs}px;line-height:${Math.round(fs * 1.22)}px">` + l.map(([w, , c = ''], j) => {
    const inner = c.includes('hl') ? `<span class="bx"></span>${w}` : (c.includes('sc') ? [...w].map((ch) => `<span class="lt" style="display:inline-block">${ch}</span>`).join('') : w);
    return `<span class="w ${c}">${inner}</span>`;
  }).join('') + '</div>').join('') + '</div>').join('');

/* ---------- timeline ---------- */
const tl = gsap.timeline({ paused: true });
const S = (sel, v) => gsap.set(sel, v);
const at = (sel, from, to, t) => tl.fromTo(sel, from, Object.assign({ immediateRender: false }, to), t);

// estado inicial
S('#hook, #hA', { opacity: 1 }); S('#hB, #cloud, #phone, #badge, #tchip, #venc, #cta, .cg', { opacity: 0 });
S('#phone', { scale: 1.28, x: 0, y: 0, z: -1800, rotationY: -200, rotationX: 10 });
S('#world', { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0 });
S('#hcard', { z: -2600, rotationY: 70, rotationX: 20, opacity: 0 });
['#hw1', '#hw2', '#hw3', '#hw4', '#hw5', '#hw6', '#hw7', '#hw8', '#hw9', '#hq'].forEach((s) => S(s, { opacity: 0 }));

/* S1 gancho 0.00 a 2.62 */
at('#hcard', { z: -2600, rotationY: 70, rotationX: 20, opacity: 0 }, { z: 0, rotationY: -14, rotationX: 8, opacity: 1, duration: .42, ease: 'expo.out' }, 0);
at('#hcard', { rotationY: -14 }, { rotationY: 12, duration: 2.0, ease: 'sine.inOut' }, .42);
at('#hw1', { opacity: 0, scale: 2.4, filter: 'blur(14px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: .14, ease: 'power3.out' }, 0);
at('#hw2', { opacity: 0, y: 60, rotationX: -80 }, { opacity: 1, y: 0, rotationX: 0, duration: .16, ease: 'back.out(2)' }, .28);
at('#hbx', { scaleX: 0 }, { scaleX: 1, duration: .18, ease: 'power3.out' }, .3);
at('#hw3', { opacity: 0, x: -160, skewX: -20 }, { opacity: 1, x: 0, skewX: 0, duration: .14, ease: 'power3.out' }, .6);
at('#hw4', { opacity: 0, x: 160, skewX: 20 }, { opacity: 1, x: 0, skewX: 0, duration: .14, ease: 'power3.out' }, 1.0);
at('#hw5', { opacity: 0, scale: 3.2, filter: 'blur(24px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: .16, ease: 'power4.out' }, 1.26);
at('#hcard', { scale: 1 }, { scale: 1.16, duration: .16, ease: 'back.out(3)' }, 1.26);
at('#hval', { color: '#00a6ca', textShadow: '0 0 0 rgba(173,251,227,0)' }, { color: '#ADFBE3', textShadow: '0 0 50px rgba(173,251,227,.7)', duration: .2 }, 1.26);
at('#hw5', { scale: 1 }, { scale: 1.06, duration: .38, ease: 'sine.out' }, 1.42);
// linhas saem em chicote para cima, entra a pergunta
at('#hA', { y: 0, opacity: 1, filter: 'blur(0px)' }, { y: -760, opacity: 0, filter: 'blur(18px)', duration: .2, ease: 'power3.in' }, 1.58);
S('#hB', { opacity: 1 }); tl.set('#hB', { opacity: 1 }, 1.6);
at('#hw6', { opacity: 0, y: 120, filter: 'blur(10px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: .13, ease: 'power3.out' }, 1.64);
at('#hw7', { opacity: 0, y: 120, filter: 'blur(10px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: .13, ease: 'power3.out' }, 1.76);
at('#hw8', { opacity: 0, y: 120, filter: 'blur(10px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: .13, ease: 'power3.out' }, 1.86);
at('#hw9', { opacity: 0, scale: .4, rotationX: 90 }, { opacity: 1, scale: 1, rotationX: 0, duration: .2, ease: 'back.out(1.8)' }, 2.06);
at('#hq', { opacity: 0, rotation: -200, scale: .2 }, { opacity: 1, rotation: 0, scale: 1, duration: .3, ease: 'back.out(2)' }, 2.36);
at('#hcard', { rotationZ: 0 }, { rotationZ: -4, duration: .3, ease: 'power2.out' }, 2.06);
// cartao total sobe ao centro e explode nas compras
at('#hB', { opacity: 1, scale: 1, filter: 'blur(0px)' }, { opacity: 0, scale: .6, filter: 'blur(14px)', duration: .2, ease: 'power2.in' }, 2.62);
at('#hcard', { y: 0 }, { y: -250, scale: .7, rotationY: 0, rotationX: 0, rotationZ: 0, duration: .22, ease: 'power3.inOut' }, 2.5);
at('#hcard', { opacity: 1 }, { opacity: 0, scale: 1.5, filter: 'blur(20px)', duration: .14, ease: 'power2.in' }, 2.72);

/* S2 nuvem 2.72 a 6.2 */
tl.set('#cloud', { opacity: 1 }, 2.72);
COMPRAS.forEach(([id, , , , , x, y, z, ry, rz], i) => {
  at('#' + id, { x: 0, y: 0, z: -200, rotationY: 0, rotationZ: 0, scale: .3, opacity: 0 },
    { x, y, z, rotationY: ry, rotationZ: rz, scale: 1, opacity: 1, duration: .42, ease: 'back.out(1.5)' }, 2.74 + i * .055);
  // flutuacao lenta
  at('#' + id, { rotationX: 0 }, { rotationX: i % 2 ? 6 : -6, duration: 2.9, ease: 'sine.inOut' }, 3.2);
});
at('#cloud', { rotationY: -12, z: 0 }, { rotationY: 10, duration: 3.2, ease: 'none' }, 2.72);
at('#cloud', { y: 0 }, { y: -40, duration: .12, ease: 'power2.out' }, 3.1);
at('#cloud', { y: -40 }, { y: 0, duration: .4, ease: 'power2.out' }, 3.22);
// "parcelas": as duas parceladas vem para a frente
at('#k1', { z: 120 }, { x: 0, y: -150, z: 220, rotationY: 6, duration: .3, ease: 'power3.out' }, 3.82);
at('#k4', { z: 60 }, { x: 0, y: 200, z: 200, rotationY: -6, duration: .3, ease: 'power3.out' }, 3.86);
at('#k2, #k3', { opacity: 1, filter: 'blur(0px)' }, { opacity: .3, filter: 'blur(6px)', duration: .3 }, 3.82);
at('#k1k, #k4k', { scale: 1, boxShadow: '0 0 0 rgba(173,251,227,0)' }, { scale: 1.15, boxShadow: '0 0 40px rgba(173,251,227,.9)', duration: .18, ease: 'back.out(1.6)' }, 3.86);
at('#k1k, #k4k', { scale: 1.15 }, { scale: 1.08, duration: .3, ease: 'power2.out' }, 4.06);
// "esquece": somem na profundidade
at('#k1, #k4', { opacity: 1, filter: 'blur(0px)' }, { opacity: .28, filter: 'blur(7px)', z: -500, duration: .5, ease: 'power2.inOut' }, 4.82);
at('#k2, #k3', { z: 0 }, { z: -900, opacity: .12, duration: .5, ease: 'power2.inOut' }, 4.82);
// "pelo caminho": a nuvem passa pela camera
at('#cloud', { z: 0 }, { z: 1900, duration: .55, ease: 'power3.in' }, 5.42);
at('#k1, #k2, #k3, #k4', { opacity: .28 }, { opacity: 1, filter: 'blur(0px)', duration: .2 }, 5.42);
at('#cloud', { opacity: 1 }, { opacity: 0, duration: .08 }, 5.95);
at('#streak', { opacity: 0, y: -650, scaleX: .2 }, { opacity: 1, y: 0, scaleX: 1.3, duration: .16, ease: 'power2.out' }, 5.86);
at('#streak', { opacity: 1, y: 0 }, { opacity: 0, y: 700, scaleX: .4, duration: .2, ease: 'power2.in' }, 6.02);

/* S3 celular 6.0 a 10.9 */
tl.set('#phone', { opacity: 1 }, 6.02);
at('#phone', { z: -1800, rotationY: -200, rotationX: 10, x: 0, y: 0 }, { z: 0, rotationY: -16, rotationX: 6, duration: .55, ease: 'expo.out' }, 6.04);
at('#phone', { rotationY: -16, rotationX: 6 }, { rotationY: -6, rotationX: 3, duration: .62, ease: 'sine.inOut' }, 6.6);
// "fatura": cabecalho salta da tela
at('#cNav', { z: 0, scale: 1 }, { z: 110, scale: 1.08, duration: .2, ease: 'back.out(2)' }, 7.02);
at('#cNav', { boxShadow: '0 0 0 rgba(0,0,0,0)', background: 'rgba(11,45,53,.55)' }, { boxShadow: '0 0 70px rgba(173,251,227,.45)', background: 'rgba(14,54,64,1)', duration: .2 }, 7.02);
at('#cNav', { z: 110, scale: 1.08 }, { z: 0, scale: 1, boxShadow: '0 0 0 rgba(0,0,0,0)', background: 'rgba(11,45,53,.55)', duration: .25, ease: 'power2.inOut' }, 7.56);
at('#world', { z: 0 }, { z: 140, duration: 1.2, ease: 'sine.inOut' }, 7.0);
// "cada compra": camadas se separam
at('#phone', { rotationY: -6, x: 0 }, { rotationY: -30, x: 40, duration: .5, ease: 'power3.inOut' }, 7.58);
['#r1', '#r2', '#r3', '#r4'].forEach((r, i) => {
  at(r, { z: 0, scale: 1 }, { z: 70 + i * 34, scale: 1.04, duration: .24, ease: 'back.out(2)' }, 7.64 + i * .1);
  at(r + ' .pbg', { opacity: 0 }, { opacity: 1, duration: .16 }, 7.64 + i * .1);
});
// "parcelada": etiquetas acendem
at('#r1k, #r4k', { backgroundColor: 'rgba(173,251,227,0)', color: '#effffa', scale: 1 }, { backgroundColor: '#ADFBE3', color: '#052229', scale: 1.3, duration: .16, ease: 'back.out(3)' }, 8.46);
at('#r1k, #r4k', { scale: 1.3 }, { scale: 1.1, duration: .3 }, 8.64);
at('#phone', { rotationY: -30 }, { rotationY: -22, duration: .7, ease: 'sine.inOut' }, 8.3);
// "em qual parcela": celular vai a esquerda, selo 1/3 entra
['#r1', '#r2', '#r3'].forEach((r, i) => { at(r, { z: 70 + i * 34 }, { z: 0, scale: 1, duration: .24, ease: 'power2.inOut' }, 9.18); at(r + ' .pbg', { opacity: 1 }, { opacity: 0, duration: .2 }, 9.18); });
at('#r4', { z: 172 }, { z: 150, scale: 1.08, duration: .3 }, 9.18);
at('#phone', { x: 40, rotationY: -22 }, { x: -170, scale: 1.1, rotationY: 20, rotationX: 4, duration: .5, ease: 'power3.inOut' }, 9.2);
at('#world', { z: 140 }, { z: 60, duration: .5, ease: 'power2.inOut' }, 9.2);
tl.set('#badge', { opacity: 1 }, 9.5);
at('#badge', { z: 600, rotationY: -100, x: 160, opacity: 0 }, { z: 100, rotationY: -14, x: 0, opacity: 1, duration: .36, ease: 'back.out(1.4)' }, 9.5);
at('#badge', { scale: 1 }, { scale: 1.12, duration: .14, ease: 'power2.out' }, 9.8);
at('#badge', { scale: 1.12 }, { scale: 1, duration: .3, ease: 'power2.out' }, 9.94);
at('#badge', { rotationY: -14 }, { rotationY: -6, duration: .7, ease: 'sine.inOut' }, 9.9);
at('#badge', { x: 0, opacity: 1 }, { x: 900, rotationY: 40, opacity: 0, duration: .26, ease: 'power3.in' }, 10.62);
at('#r4', { z: 150, scale: 1.08 }, { z: 0, scale: 1, duration: .26 }, 10.62); at('#r4 .pbg', { opacity: 1 }, { opacity: 0, duration: .2 }, 10.62);

/* S4 10.7 a 15.3 */
at('#phone', { x: -170, scale: 1.1, rotationY: 20 }, { x: 0, scale: 1.28, rotationY: -8, rotationX: 4, duration: .4, ease: 'power3.inOut' }, 10.66);
// "valor do cartao": total salta
at('#cTot', { z: 0, scale: 1 }, { z: 150, scale: 1.1, duration: .22, ease: 'back.out(2)' }, 11.14);
at('#cTot', { background: 'rgba(11,45,53,.55)', boxShadow: '0 0 0 rgba(0,0,0,0)' }, { background: 'rgba(14,54,64,1)', boxShadow: '0 0 70px rgba(173,251,227,.5)', duration: .2 }, 11.14);
// "a pagar": o bloco se solta e sobe flutuando
tl.set('#tchip', { opacity: 1 }, 11.92);
at('#tchip', { x: 0, y: 200, z: 150, scale: .7, rotationX: 0 }, { y: -40, z: 260, scale: 1, rotationX: 10, duration: .36, ease: 'back.out(1.5)' }, 11.92);
at('#cTot', { z: 150, scale: 1.1, opacity: 1 }, { z: 0, scale: 1, opacity: .25, duration: .2 }, 11.92);
// "ja sai do seu": celular gira e mostra o Inicio
at('#phone', { rotationY: -8 }, { rotationY: 172, duration: .5, ease: 'power3.inOut' }, 12.3);
at('#world', { z: 60 }, { z: -60, duration: .25, ease: 'power2.out' }, 12.3);
at('#world', { z: -60 }, { z: 80, duration: .5, ease: 'power2.out' }, 12.55);
// o bloco cai em arco na linha "Credito ainda nao pago"
at('#tchip', { y: -40, x: 0, z: 260, scale: 1, rotationX: 10 }, { y: 450, x: 0, z: 120, scale: .4, rotationX: 0, duration: .42, ease: 'power2.in' }, 12.58);
at('#tchip', { opacity: 1 }, { opacity: 0, duration: .1 }, 12.94);
at('#hCredBg', { opacity: 0 }, { opacity: 1, duration: .1 }, 12.96);
at('#hCred', { color: '#7fa9a0' }, { color: '#ADFBE3', duration: .1 }, 12.96);
// "livre do dia": o card salta
at('#hLivre', { z: 0, scale: 1 }, { z: 170, scale: 1.1, duration: .24, ease: 'back.out(2)' }, 13.12);
at('#hLivre .pbg', { opacity: 0 }, { opacity: 1, duration: .2 }, 13.12);
at('#hVal', { color: '#effffa', textShadow: '0 0 0 rgba(0,0,0,0)', scale: 1 }, { color: '#ADFBE3', textShadow: '0 0 40px rgba(173,251,227,.8)', scale: 1.08, duration: .2 }, 13.14);
at('#phone', { rotationY: 172, rotationX: 4 }, { rotationY: 186, rotationX: 2, duration: 1.6, ease: 'sine.inOut' }, 12.8);
// "antes do vencimento chegar"
tl.set('#venc', { opacity: 1 }, 13.92);
at('#venc', { x: 500, z: 160, rotationY: -60, opacity: 0 }, { x: 0, z: 160, rotationY: -12, opacity: 1, duration: .34, ease: 'back.out(1.4)' }, 13.92);
at('#vring', { attr: { 'stroke-dashoffset': 302 } }, { attr: { 'stroke-dashoffset': 0 }, duration: .9, ease: 'power2.inOut' }, 14.3);
at('#venc', { scale: 1 }, { scale: 1.1, duration: .14, ease: 'back.out(3)' }, 14.54);
at('#venc', { scale: 1.1 }, { scale: 1, duration: .3 }, 14.7);
at('#hLivre', { z: 170 }, { z: 120, duration: .8, ease: 'sine.inOut' }, 14.2);

/* S5 CTA 15.25 a 19.75 */
at('#phone', { z: 0, rotationY: 186, opacity: 1 }, { z: -1600, rotationY: 280, rotationX: 30, opacity: 0, duration: .5, ease: 'power3.in' }, 15.2);
at('#venc', { x: 0, opacity: 1 }, { x: 700, opacity: 0, duration: .3, ease: 'power3.in' }, 15.2);
at('#world', { z: 80 }, { z: 0, duration: .5 }, 15.2);
tl.set('#cta', { opacity: 1 }, 15.7);
S('#cw1, #cw2, #btn, #cursor, #ctaB, #logo, #tag, #cw3, #cw4, #cw5', { opacity: 0 });
at('#cw1', { opacity: 0, y: 140, rotationX: -90 }, { opacity: 1, y: 0, rotationX: 0, duration: .18, ease: 'back.out(2)' }, 15.757);
at('#cw2', { opacity: 0, y: 140, rotationX: -90 }, { opacity: 1, y: 0, rotationX: 0, duration: .18, ease: 'back.out(2)' }, 15.98);
at('#btn', { opacity: 0, scale: 2.6, z: 0, filter: 'blur(20px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: .2, ease: 'power4.out' }, 16.12);
at('#btn', { rotationX: 0 }, { rotationX: 8, duration: 1.2, ease: 'sine.inOut' }, 16.3);
at('#seta', { x: 0 }, { x: 8, duration: .2, ease: 'power2.out', yoyo: true, repeat: 3 }, 16.3);
at('#cursor', { opacity: 0, x: 260, y: 400 }, { opacity: 1, x: 0, y: 0, duration: .3, ease: 'power3.out' }, 16.2);
at('#btn', { scale: 1 }, { scale: .93, duration: .07 }, 16.5);
at('#btn', { scale: .93 }, { scale: 1, duration: .2, ease: 'back.out(3)' }, 16.57);
at('#cursor', { scale: 1 }, { scale: .85, duration: .07, yoyo: true, repeat: 1 }, 16.5);
[['#rg1', 16.52], ['#rg2', 16.66]].forEach(([r, t]) => at(r, { opacity: .9, scale: 1 }, { opacity: 0, scale: 1.35, duration: .5, ease: 'power2.out' }, t));
// "e conhece o Grana."
at('#ctaA', { opacity: 1, y: 0 }, { opacity: 0, y: -220, filter: 'blur(12px)', duration: .18, ease: 'power3.in' }, 16.74);
at('#btn', { y: 0, scale: 1 }, { y: 560, scale: .72, duration: .4, ease: 'power3.inOut' }, 16.76);
at('#rg1, #rg2', { opacity: 0 }, { opacity: 0, duration: .01 }, 16.76);
at('#cursor', { opacity: 1, y: 0 }, { opacity: 0, y: 300, duration: .3, ease: 'power2.in' }, 16.76);
tl.set('#ctaB', { opacity: 1 }, 16.78);
at('#cw3', { opacity: 0, x: -120 }, { opacity: 1, x: 0, duration: .14, ease: 'power3.out' }, 16.8);
at('#cw4', { opacity: 0, x: 120 }, { opacity: 1, x: 0, duration: .16, ease: 'power3.out' }, 17.14);
at('#cw5', { opacity: 0, y: 80 }, { opacity: 1, y: 0, duration: .14, ease: 'power3.out' }, 17.6);
at('#logo', { opacity: 0, scale: .7, filter: 'blur(30px)', y: 30 }, { opacity: 1, scale: 1, filter: 'blur(0px)', y: 0, duration: .55, ease: 'expo.out' }, 17.7);
at('#tag', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .3, ease: 'power3.out' }, 18.15);
at('#cta', { scale: 1 }, { scale: 1.04, duration: 1.9, ease: 'sine.out' }, 17.8);

/* legendas: entrada palavra a palavra no inicio_real */
G.forEach(([id, estilo, , linhas], gi) => {
  const ws = [...document.querySelectorAll(`#${id} .w`)];
  const tempos = linhas.flat().map((w) => w[1]);
  const t0 = tempos[0];
  const prox = G[gi + 1] ? G[gi + 1][3][0][0][1] : 99;
  const fim = FIM[id] || prox - .05;
  tl.set('#' + id, { opacity: 1 }, t0 - .01);
  ws.forEach((w, i) => {
    S(w, { opacity: 0 });
    const t = tempos[i];
    if (estilo === 'slam' || w.classList.contains('slamw')) at(w, { opacity: 0, scale: 2.3, filter: 'blur(16px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: .14, ease: 'power3.out' }, t);
    else if (estilo === 'flip') at(w, { opacity: 0, rotationX: -95, y: 50, filter: 'blur(8px)' }, { opacity: 1, rotationX: 0, y: 0, filter: 'blur(0px)', duration: .16, ease: 'back.out(2)' }, t);
    else at(w, { opacity: 0, x: 140, skewX: -22 }, { opacity: 1, x: 0, skewX: 0, duration: .14, ease: 'power3.out' }, t);
    const bx = w.querySelector('.bx');
    if (bx) at(bx, { scaleX: 0 }, { scaleX: 1, duration: .18, ease: 'power3.out' }, t + .02);
  });
  at('#' + id, { opacity: 1, y: 0, filter: 'blur(0px)' }, { opacity: 0, y: -60, filter: 'blur(10px)', duration: .1, ease: 'power2.in' }, fim - .1);
});
// "esquece": letras se desfazem
document.querySelectorAll('#g3 .lt').forEach((l, i) => {
  const r = Math.sin(i * 12.9898) * 43758.5453; const f = r - Math.floor(r);
  at(l, { y: 0, x: 0, opacity: 1, rotation: 0 }, { y: -40 - f * 90, x: (f - .5) * 80, rotation: (f - .5) * 70, opacity: 0, duration: .45, ease: 'power2.in' }, 5.0 + i * .03);
});

/* clarões */
[[0, .85, .32], [2.72, .45, .25], [6.06, .55, .3], [12.52, .3, .25], [16.12, .5, .3], [17.7, .4, .45]].forEach(([t, a, d]) =>
  at('#flash', { opacity: a }, { opacity: 0, duration: d, ease: 'power2.out' }, t));
tl.set('#flash', { opacity: 0 }, DUR);

/* tremor deterministico */
const IMP = [[.02, 18], [1.26, 28], [3.1, 24], [6.6, 8], [13.14, 12], [16.12, 22]];
function tremor(t) {
  let x = 0, y = 0, r = 0;
  for (const [t0, a] of IMP) { const d = t - t0; if (d < 0 || d > .6) continue; const e = a * Math.exp(-d * 9); x += e * Math.sin(d * 58); y += e * Math.cos(d * 47) * .7; r += e * .02 * Math.sin(d * 39); }
  return `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${r.toFixed(3)}deg)`;
}
/* deriva continua do fundo: nada fica parado */
function deriva(t) {
  $('#floor').style.transform = `rotateX(78deg) translateY(${(-t * 60) % 120}px)`;
  $('#glow').style.transform = `translateX(${Math.sin(t * .5) * 60}px) scale(${1 + Math.sin(t * .7) * .05})`;
  $('#glow2').style.transform = `translate(${Math.sin(t * .4) * 120}px,${Math.cos(t * .3) * 80}px)`;
}

window.renderAt = function (t) {
  tl.seek(Math.min(t, DUR), false);
  $('#shake').style.transform = tremor(t);
  deriva(t);
  return { t, ph: gsap.getProperty('#phone', 'rotationY') };
};
document.fonts.ready.then(() => { window.renderAt(0); window.__ready = true; });
