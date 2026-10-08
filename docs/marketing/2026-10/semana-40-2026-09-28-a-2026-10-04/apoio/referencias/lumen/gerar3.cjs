// v4 (Lumen): aparelho RECORTADO (PNG com alfa) direto sobre o petroleo, sem cartao de fundo, com sombra recriada.
// Aplica a critica do Prism r1: logo 200 em x80 y72, titulo 72 a 84 px, corpo 42/56 #A6D9CE (max 3 linhas),
// sem aneis nem halos, CTA em texto simples. Sem contador nem aviso de exemplo (decisao do autor). Uso: node gerar3.cjs [nome ...]
const fs = require('fs'), cp = require('child_process');
const R = 'E:/Grana-temporarios/2026-10-04-marketing', D = R + '/lumen';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const A = '../../assets';
const SRC = process.env.RECORTES || R + '/lumen/final-crop';
const dim = (f) => { const b = fs.readFileSync(`${SRC}/${f}.png`); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const css = `@font-face{font-family:NM;src:url(${A}/NeueMachina-Regular.otf);font-weight:400}
@font-face{font-family:NM;src:url(${A}/NeueMachina-Light.otf);font-weight:300}
*{margin:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden;background:#052229;font-family:NM,sans-serif;color:#effffa}
.s{position:relative;width:1080px;height:1350px;overflow:hidden;background:#052229}
.logo{position:absolute;left:80px;top:64px;width:200px}
.h{position:absolute;left:80px;font-weight:400;letter-spacing:-.01em}
.p{position:absolute;left:80px;font-weight:300;color:#a6d9ce;font-size:42px;line-height:56px}
.cta{position:absolute;left:80px;font-weight:400;color:#a6d9ce;font-size:42px;line-height:56px}
.d{position:absolute}
.d img{display:block;height:100%;width:auto;filter:drop-shadow(0 12px 28px rgba(0,0,0,.25))}
.c{position:absolute;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.35),rgba(0,0,0,0));filter:blur(8px)}
.z{position:absolute;display:block;border-radius:16px;border:1px solid rgba(175,255,227,.22)}`;
// aparelho: cabe na caixa (x,y,w,h) do slide, alinhado embaixo e a direita da caixa; dentro de x 64..1016, y 64..1286
const dev = (f, bx, by, bw, bh) => { const [iw, ih] = dim(f); const s = Math.min(bw / iw, bh / ih), w = iw * s, h = ih * s, x = bx + bw - w, y = by + bh - h;
  return `<div class="c" style="left:${x + w * .1}px;top:${y + h - 20}px;width:${w * .8}px;height:34px"></div>
<div class="d" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><img src="file:///${SRC}/${f}.png"></div>`; };
const zoom = (f, x, y, w, h) => h ? `<div class="z" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#0b2d35;display:flex;align-items:center;justify-content:center"><img style="width:${w - 48}px" src="file:///${R}/lumen/panels/${f}.png"></div>` : f.startsWith('zoom-livre') ? `<img class="z" style="left:${x}px;top:${y}px;width:${w}px;border:0;border-radius:0" src="file:///${R}/lumen/panels/${f}.png">` : `<img class="z" style="left:${x}px;top:${y}px;width:${w}px" src="file:///${R}/lumen/panels/${f}.png">`;
const logo = `<img class="logo" src="${A}/logotipo-gradiente.svg">`;
const S = {
  'card': `${logo}<div class="h" style="top:210px;width:480px;font-size:76px;line-height:84px">Quanto fica livre por dia?</div>
    <div class="p" style="top:540px;width:480px">Desconta os cofrinhos e divide pelos dias que faltam.</div>
    ${dev('celular-3q-esquerda', 540, 210, 476, 1076)}`,
  'carrossel-1': `${logo}<div class="h" style="top:210px;width:800px;font-size:84px;line-height:92px">O que ainda fica livre neste mês?</div>
    ${zoom('zoom-livre-grande', 80, 430, 720)}
    ${dev('notebook-3q-esquerda', 64, 760, 952, 526)}`,
  'carrossel-2': `${logo}<div class="h" style="top:210px;width:500px;font-size:72px;line-height:82px">Registre as entradas e saídas do mês.</div>
    ${dev('celular-quase-frontal', 610, 64, 406, 1222)}`,
  'carrossel-4': `${logo}<div class="h" style="top:210px;width:920px;font-size:72px;line-height:82px">O que você guardou nos cofrinhos é descontado.</div>
    <div class="p" style="top:400px;width:880px">O restante é dividido pelos dias que faltam, incluindo hoje.</div>
    ${zoom('zoom-cofrinhos-grande', 80, 560, 920, 240)}
    ${dev('notebook-de-cima', 64, 830, 952, 456)}`,
  'carrossel-5': `${logo}<div class="h" style="top:210px;width:920px;font-size:72px;line-height:82px">Consulte o Livre para Gastar antes de planejar o próximo gasto.</div>
    <div class="cta" style="top:490px">Conhecer o Grana →</div>
    ${zoom('zoom-livre-grande', 80, 580, 720)}
    ${dev('notebook-frontal', 64, 920, 952, 366)}`,
};
const only = process.argv.slice(2);
for (const [n, b] of Object.entries(S)) {
  if (only.length && !only.includes(n)) continue;
  const f = `${D}/html3/${n}.html`; fs.writeFileSync(f, `<!doctype html><meta charset=utf-8><style>${css}</style><div class="s">${b}</div>`);
  const o = `${D}/out3/${n === 'carrossel-4' ? 'carrossel-4' : n}.png`;
  cp.spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars', '--virtual-time-budget=4000', '--force-device-scale-factor=1', '--window-size=1080,1350', '--screenshot=' + o, 'file:///' + f], { stdio: 'ignore' });
  console.log(n, fs.existsSync(o));
  const chk = cp.spawnSync('python3', ['-c', `from PIL import Image;im=Image.open(r'${o}').convert('RGB').crop((80,64,280,116));print(sum(1 for p in im.getdata() if p[1]>150))`], { encoding: 'utf8' }); console.log('  logo (pixels claros em x80 y64):', (chk.stdout || '').trim());
}
