"""Medidor da skill Leis de UI.

Abre uma página em várias larguras e devolve, em JSON, as medidas que as leis
pedem: alvos de toque (Fitts), interativos na primeira dobra (Hick), estilos de
botão (semelhança e Von Restorff), tempos de carga (Doherty), elementos fixos
(Fitts distância), saídas da página, viúvas (regra 29), parágrafos longos
(carga cognitiva), títulos (posição serial) e rolagem horizontal.

Só lê. Clica em "Recusar" no aviso de cookies para não disparar o Pixel da
campanha, e nunca clica em comprar.

Uso:
  python -I medir.py <url> [--larguras 390x844,360x640,768x1024,1440x900] [--saida <pasta>]
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

JS_MEDIR = r"""
(params) => {
  const vw = innerWidth, vh = innerHeight;
  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05;
  };
  const texto = (el) => (el.getAttribute('aria-label') || el.innerText || el.value || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const caixa = (r) => ({ x: Math.round(r.left), y: Math.round(r.top + scrollerTop()), w: Math.round(r.width), h: Math.round(r.height) });

  // A landing em React Native Web pode rolar dentro de um contêiner, não na janela.
  let scroller = document.scrollingElement;
  let maior = scroller.scrollHeight - scroller.clientHeight;
  for (const el of document.querySelectorAll('div')) {
    const cs = getComputedStyle(el);
    if (!/(auto|scroll)/.test(cs.overflowY)) continue;
    const sobra = el.scrollHeight - el.clientHeight;
    if (sobra > maior + 50 && el.clientHeight > vh * 0.6) { scroller = el; maior = sobra; }
  }
  function scrollerTop() { return scroller === document.scrollingElement ? scrollY : scroller.scrollTop; }

  // Alvos interativos
  const SEL = 'a[href],button,[role=button],[role=link],[role=tab],[role=switch],[role=checkbox],input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])';
  const vistos = new Set();
  const alvos = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (!visivel(el)) continue;
    // ignora o filho quando o pai já é alvo (RNW aninha role=button em div)
    let p = el.parentElement, dentro = false;
    while (p) { if (vistos.has(p)) { dentro = true; break; } p = p.parentElement; }
    if (dentro) continue;
    vistos.add(el);
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const href = el.getAttribute('href');
    // No RNW a fonte fica no filho que tem o texto, não no wrapper do botão.
    let comTexto = el;
    for (const d of el.querySelectorAll('*')) { if ([...d.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) { comTexto = d; break; } }
    const ct = getComputedStyle(comTexto);
    alvos.push({
      tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), texto: texto(el), ...caixa(r),
      dobra1: r.top < vh && r.bottom > 0,
      href, target: el.getAttribute('target'),
      fixo: ['fixed', 'sticky'].includes(cs.position),
      estilo: { fundo: cs.backgroundColor, fundoImg: cs.backgroundImage !== 'none' ? 'gradiente/imagem' : '', cor: cs.color, borda: cs.borderTopWidth + ' ' + cs.borderTopColor, raio: cs.borderTopLeftRadius, fonte: ct.fontSize + ' ' + ct.fontFamily.split(',')[0], corTexto: ct.color },
    });
  }
  const pequenos = alvos.filter(a => a.w < params.minAlvo || a.h < params.minAlvo);
  const minimos = alvos.filter(a => a.w < 24 || a.h < 24);

  // Botões com cara de botão: fundo, gradiente ou borda.
  const comCara = alvos.filter(a => (a.estilo.fundo !== 'rgba(0, 0, 0, 0)' && a.estilo.fundo !== 'transparent') || a.estilo.fundoImg || !a.estilo.borda.startsWith('0px'));
  const estilos = {};
  for (const a of comCara) {
    const k = [a.estilo.fundo, a.estilo.fundoImg, a.estilo.borda, a.estilo.raio, a.estilo.fonte].join(' | ');
    (estilos[k] = estilos[k] || []).push(a.texto || a.tag);
  }

  // Saídas da página
  const saidas = alvos.filter(a => a.href && (a.target === '_blank' || (/^https?:/i.test(a.href) && !a.href.includes(location.host)))).map(a => ({ texto: a.texto, href: a.href, target: a.target }));

  // Elementos fixos que ficam sobre o conteúdo
  const fixos = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' || !visivel(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 400) continue;
    if (el.parentElement && getComputedStyle(el.parentElement).position === 'fixed') continue;
    fixos.push({ texto: texto(el).slice(0, 60), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), areaPct: Math.round(100 * r.width * r.height / (vw * vh)) });
  }

  // Títulos
  const titulos = [...document.querySelectorAll('h1,h2,h3,[role=heading]')].filter(visivel).map(el => ({ nivel: el.getAttribute('aria-level') || el.tagName.slice(1), texto: texto(el), y: caixa(el.getBoundingClientRect()).y }));

  // Blocos de texto: viúvas e parágrafos longos
  const viuvas = [], longos = [];
  const blocos = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!visivel(el)) continue;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'svg', 'IFRAME', 'BUTTON', 'A'].includes(el.tagName)) continue;
    const temTextoDireto = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (!temTextoDireto) continue;
    if (getComputedStyle(el).display.startsWith('inline')) continue;
    if (el.closest('a,button,[role=button]')) continue;
    blocos.push(el);
    if (blocos.length > 600) break;
  }
  for (const el of blocos) {
    const palavras = [];
    const andar = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = andar.nextNode())) {
      const re = /\S+/g; let m;
      while ((m = re.exec(n.textContent))) {
        const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
        const rr = rg.getClientRects()[0];
        if (rr) palavras.push({ p: m[0], top: Math.round(rr.top) });
      }
    }
    if (!palavras.length) continue;
    const linhas = [];
    for (const w of palavras) {
      const ult = linhas[linhas.length - 1];
      if (ult && Math.abs(ult.top - w.top) <= 3) ult.n++; else linhas.push({ top: w.top, n: 1, ultima: w.p });
      linhas[linhas.length - 1].ultima = w.p;
    }
    const txt = texto(el);
    if (linhas.length >= 2 && linhas[linhas.length - 1].n === 1) viuvas.push({ texto: txt.slice(0, 70), palavra: linhas[linhas.length - 1].ultima, linhas: linhas.length, y: caixa(el.getBoundingClientRect()).y });
    if (palavras.length > params.maxPalavras) longos.push({ palavras: palavras.length, texto: txt.slice(0, 70), y: caixa(el.getBoundingClientRect()).y });
  }

  return {
    viewport: { w: vw, h: vh },
    altura: scroller.scrollHeight, rolaNaJanela: scroller === document.scrollingElement,
    rolagemHorizontal: document.documentElement.scrollWidth > vw + 1,
    alvos: { total: alvos.length, naPrimeiraDobra: alvos.filter(a => a.dobra1).map(a => a.texto || a.tag), pequenos, abaixoDe24: minimos },
    estilosDeBotao: estilos,
    saidas, fixos, titulos, viuvas, paragrafosLongos: longos,
  };
}
"""

JS_PERF = r"""
async () => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const pegar = (tipo) => new Promise(res => {
    let v = null;
    try {
      new PerformanceObserver(l => { for (const e of l.getEntries()) v = e; }).observe({ type: tipo, buffered: true });
    } catch (e) {}
    setTimeout(() => res(v), 300);
  });
  const lcp = await pegar('largest-contentful-paint');
  let cls = 0;
  await new Promise(res => { try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {} setTimeout(res, 300); });
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];
  return {
    ttfb: Math.round(nav.responseStart || 0), domPronto: Math.round(nav.domContentLoadedEventEnd || 0), carga: Math.round(nav.loadEventEnd || 0),
    fcp: fcp ? Math.round(fcp.startTime) : null, lcp: lcp ? Math.round(lcp.startTime) : null, cls: Math.round(cls * 1000) / 1000,
    bytesTransferidos: performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || 0), 0) + (nav.transferSize || 0),
  };
}
"""

JS_ROLAR = r"""
async (passo) => {
  let s = document.scrollingElement, maior = s.scrollHeight - s.clientHeight;
  for (const el of document.querySelectorAll('div')) {
    const cs = getComputedStyle(el);
    if (!/(auto|scroll)/.test(cs.overflowY)) continue;
    const sobra = el.scrollHeight - el.clientHeight;
    if (sobra > maior + 50 && el.clientHeight > innerHeight * 0.6) { s = el; maior = sobra; }
  }
  // scrollTo não move contêiner com scroll-snap (a landing usa); scrollTop direto move.
  const ir = (y) => { if (s === document.scrollingElement) window.scrollTo(0, y); else s.scrollTop = y; };
  const posicoes = [];
  for (let y = 0; y <= maior + passo; y += passo) {
    ir(y); posicoes.push(Math.min(y, maior));
    await new Promise(r => setTimeout(r, 250));
  }
  return { posicoes, janela: s === document.scrollingElement };
}
"""


def rolar_para(page, y):
    page.evaluate("""(y) => {
      let s = document.scrollingElement, maior = s.scrollHeight - s.clientHeight;
      for (const el of document.querySelectorAll('div')) {
        const cs = getComputedStyle(el);
        if (!/(auto|scroll)/.test(cs.overflowY)) continue;
        const sobra = el.scrollHeight - el.clientHeight;
        if (sobra > maior + 50 && el.clientHeight > innerHeight * 0.6) { s = el; maior = sobra; }
      }
      if (s === document.scrollingElement) window.scrollTo(0, y); else s.scrollTop = y;
    }""", y)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('url')
    ap.add_argument('--larguras', default='390x844,360x640,768x1024,1440x900')
    ap.add_argument('--saida', default=None)
    ap.add_argument('--min-alvo', type=int, default=44)
    ap.add_argument('--max-palavras', type=int, default=60)
    a = ap.parse_args()

    slug = urlparse(a.url).netloc.replace('.', '-') + urlparse(a.url).path.replace('/', '-').rstrip('-')
    saida = a.saida or os.path.join('E:/Grana-temporarios/leis-de-ui', datetime.now().strftime('%Y-%m-%d-%H%M') + '-' + slug)
    os.makedirs(saida, exist_ok=True)
    resultado = {'url': a.url, 'quando': datetime.now().isoformat(timespec='seconds'), 'larguras': {}}

    with sync_playwright() as pw:
        nav = pw.chromium.launch()
        for par in a.larguras.split(','):
            w, h = (int(x) for x in par.split('x'))
            movel = w < 768
            ctx = nav.new_context(viewport={'width': w, 'height': h}, is_mobile=movel, has_touch=movel, device_scale_factor=1,
                                  locale='pt-BR', reduced_motion='no-preference')
            page = ctx.new_page()
            erros = []
            page.on('console', lambda m: erros.append(m.text[:200]) if m.type == 'error' else None)
            page.on('pageerror', lambda e: erros.append(str(e)[:200]))
            page.goto(a.url, wait_until='networkidle', timeout=60000)
            time.sleep(1.5)
            perf = page.evaluate(JS_PERF)
            page.screenshot(path=os.path.join(saida, f'{w}-00-chegada.png'))
            banner = None
            try:
                rec = page.get_by_role('button', name='Recusar', exact=True)
                if rec.count() and rec.first.is_visible():
                    banner = page.evaluate("""() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === 'Recusar');
                      let el = b; while (el && el.parentElement && getComputedStyle(el).position !== 'fixed') el = el.parentElement;
                      const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.top), areaPct: Math.round(100*r.width*r.height/(innerWidth*innerHeight)) }; }""")
                    rec.first.click()
                    time.sleep(0.5)
            except Exception as e:  # sem aviso, segue
                banner = {'erro': str(e)[:120]}
            rolagem = page.evaluate(JS_ROLAR, int(h * 0.85))
            rolar_para(page, 0)
            time.sleep(0.8)
            medidas = page.evaluate(JS_MEDIR, {'minAlvo': a.min_alvo, 'maxPalavras': a.max_palavras})
            for i, y in enumerate(range(0, medidas['altura'], h)):
                rolar_para(page, y)
                time.sleep(0.6)
                page.screenshot(path=os.path.join(saida, f'{w}-{i + 1:02d}.png'))
            resultado['larguras'][par] = {'perf': perf, 'avisoCookies': banner, 'errosConsole': erros[:20], **medidas}
            ctx.close()
            if movel and 'perfRedeMovel' not in resultado:
                # Doherty em condição de anúncio: celular médio em 4G lento (perfil do Lighthouse).
                ctx = nav.new_context(viewport={'width': w, 'height': h}, is_mobile=True, has_touch=True, locale='pt-BR')
                page = ctx.new_page()
                cdp = ctx.new_cdp_session(page)
                cdp.send('Network.enable')
                cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 150, 'downloadThroughput': 1.6e6 / 8, 'uploadThroughput': 750e3 / 8})
                cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
                page.goto(a.url, wait_until='load', timeout=120000)
                time.sleep(2)
                resultado['perfRedeMovel'] = {'largura': par, **page.evaluate(JS_PERF)}
                ctx.close()
        nav.close()

    with open(os.path.join(saida, 'medidas.json'), 'w', encoding='utf-8') as f:
        json.dump(resultado, f, ensure_ascii=False, indent=1)
    # Resumo curto na saída; o detalhe fica no JSON.
    for par, m in resultado['larguras'].items():
        print(f"{par}: lcp={m['perf']['lcp']}ms cls={m['perf']['cls']} altura={m['altura']} alvos={m['alvos']['total']} "
              f"pequenos(<{a.min_alvo})={len(m['alvos']['pequenos'])} <24={len(m['alvos']['abaixoDe24'])} "
              f"dobra1={len(m['alvos']['naPrimeiraDobra'])} estilosBotao={len(m['estilosDeBotao'])} saidas={len(m['saidas'])} "
              f"viuvas={len(m['viuvas'])} longos={len(m['paragrafosLongos'])} hscroll={m['rolagemHorizontal']} erros={len(m['errosConsole'])}")
    if 'perfRedeMovel' in resultado:
        r = resultado['perfRedeMovel']
        print(f"4G lento + CPU 4x ({r['largura']}): fcp={r['fcp']}ms lcp={r['lcp']}ms carga={r['carga']}ms bytes={r['bytesTransferidos']}")
    print('saida:', saida)


if __name__ == '__main__':
    sys.exit(main())
