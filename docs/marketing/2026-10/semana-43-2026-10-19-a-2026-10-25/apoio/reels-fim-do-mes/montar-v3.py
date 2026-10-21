"""Versão 3 do Reels "Fim do mês" (21/10/2026).

Pedidos do autor sobre a v2 (46 s): "Pode acelerar um pouco o vídeo, dessa vez ficou lento demais",
"A palavra Mês saiu cortada na narração", "Preciso que essa fala tenha entonação mais natural e humana,
tá muito robótica" e "sem muita pausa entre uma funcionalidade e outra [...] a troca precisa ser fluida e
natural".

- Narração nova inteira no eleven_v4 (mesma voz, take h3), sem esticar o áudio: o rubberband da v2 é
  suspeito do timbre robótico, e o "mês" cortado era da take emendada com <break>.
- Silêncio entre frases limitado a 0,3 s; nada de pausa longa entre as funções.
- Tempos da cena recalculados direto da transcrição: cada troca de tela entra com a frase da função.

Uso: python montar-v3.py audio    (narração + transcrição)
     python montar-v3.py cena     (tempos-v3.json + script da cena)
"""
import json, os, re, subprocess, sys
AQ = os.path.dirname(os.path.abspath(__file__)); BASE = os.path.dirname(AQ)
AUD = os.path.join(BASE, 'audio'); EDIT = os.path.join(BASE, 'edit')
TAKE = os.path.join(AUD, 'v4', 'h3.mp3')
NARR = os.path.join(AUD, 'narracao-v3.wav')
TR = os.path.join(AUD, 'edit-v3', 'transcripts', 'narracao-v3.json')
CENA = os.path.join(BASE, 'projeto', 'compositions', 'scenes', 'fim-do-mes.html')
P = 0.30                 # a narração começa 0,3 s depois do primeiro quadro
PAUSA_MAX = 0.30
EDITONNY = r'C:\Users\user\.local\share\editonny\scripts\editonny.py'
# blocos de texto da cena, em número de palavras da narração, na ordem
BLOCOS = [('t1', 9), ('t2', 14), ('t3', 5), ('t4', 9), ('t5', 6), ('t6', 7), ('t7', 3), ('t8', 4), ('t9', 9),
          ('t10', 7), ('t11', 9), ('t12', 9), ('t13', 7), ('t14', 9)]


def run(c, **k): return subprocess.run(c, check=True, **k)


def silencios(arq, limiar='-40dB', minimo=0.12):
    err = subprocess.run(['ffmpeg', '-hide_banner', '-i', arq, '-af', f'silencedetect=noise={limiar}:d={minimo}', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    ini = [float(x) for x in re.findall(r'silence_start: ([0-9.]+)', err)]
    fim = [float(x) for x in re.findall(r'silence_end: ([0-9.]+)', err)]
    return list(zip(ini, fim))


def audio():
    # remove o excesso de cada silêncio interno, no meio dele, mantendo PAUSA_MAX
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', TAKE],
                               capture_output=True, text=True).stdout)
    corta = []
    for a, b in silencios(TAKE):
        # a pausa antes de "Assim…" (últimos 4 s) é a respiração do fechamento, quando o celular desce
        limite = 0.6 if a > dur - 4.0 else PAUSA_MAX
        if a < 0.05 or b > dur - 0.05 or b - a <= limite:
            continue
        meio = (a + b) / 2
        corta.append((meio - (b - a - limite) / 2, meio + (b - a - limite) / 2))
    manter, t = [], 0.0
    for a, b in corta:
        manter.append((t, a)); t = b
    manter.append((t, dur))
    sel = '+'.join(f'between(t,{a:.4f},{b:.4f})' for a, b in manter)
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', TAKE, '-af', f"aselect='{sel}',asetpts=N/SR/TB,aresample=48000", '-ac', '1', NARR])
    run(['python', EDITONNY, 'helper', 'transcribe', NARR, '--edit-dir', os.path.join(AUD, 'edit-v3')], stdout=subprocess.DEVNULL)
    print('cortes de silêncio:', [(round(a, 2), round(b, 2)) for a, b in corta])


def cena():
    t = json.load(open(TR, encoding='utf-8'))
    ws = t.get('words') or [w for s in t['segments'] for w in s['words']]
    assert len(ws) == sum(n for _, n in BLOCOS), f'{len(ws)} palavras na transcrição'
    blocos, i = {}, 0
    for nome, n in BLOCOS:
        blocos[nome] = [(round(w['start'] + P, 2), round(w['end'] + P, 2)) for w in ws[i:i + n]]; i += n
    ini = lambda b: blocos[b][0][0]
    fim = lambda b: blocos[b][-1][1]
    ordem = [b for b, _ in BLOCOS]
    sai = {}
    for k, b in enumerate(ordem[:-1]):
        prox = ini(ordem[k + 1])
        sai[b] = round(max(fim(b) + .12, prox - .22), 2)
    T = {
        'sumiu': blocos['t1'][-1][0], 'nada': blocos['t2'][-1][0],
        'cel_sobe': round(ini('t3') + .35, 2),
        'v2': round(ini('t5') - .05, 2), 'v3': round(ini('t7') - .05, 2), 'v4': round(ini('t10') - .05, 2),
        'v5': round(ini('t11') - .05, 2), 'v6': round(ini('t12') - .05, 2),
        'cel_desce': round(fim('t13') + .15, 2),
    }
    T['logo'] = round(fim('t14') + .55, 2)
    T['total'] = round(T['logo'] + 2.2, 1)
    sai['t14'] = round(fim('t14') + .3, 2)
    # telas: início e duração de cada vídeo dentro da moldura
    telas = {'voz': (T['cel_sobe'] - .35, T['v2']), 'pix': (T['v2'], T['v3']), 'credito': (T['v3'], T['v4']),
             'lista': (T['v4'], T['v5']), 'grafico': (T['v5'], T['v6'])}
    tempos = {'blocos': blocos, 'sai': sai, 'T': T, 'telas': {k: [round(a, 2), round(b - a, 2)] for k, (a, b) in telas.items()}}
    json.dump(tempos, open(os.path.join(EDIT, 'tempos-v3.json'), 'w'), indent=1)

    s = open(CENA, encoding='utf-8').read()
    s = re.sub(r'(<div id="root" data-composition-id="fim-do-mes"[^>]*data-duration=")[0-9.]+', rf'\g<1>{T["total"]}', s)
    for k, nome in enumerate(['voz', 'pix', 'credito', 'lista', 'grafico'], 1):
        a, d = tempos['telas'][nome]
        s = re.sub(rf'(id="fm-v{k}" src="[^"]+") data-start="[0-9.]+" data-duration="[0-9.]+"', rf'\1 data-start="{a}" data-duration="{d}"', s)
    js = lambda b: '[' + ', '.join(f'{a:.2f}' for a, _ in blocos[b]) + ']'
    gira = int((T['cel_desce'] - (T['cel_sobe'] + .65)) / 2.2) | 1
    script = f'''<script>
(function () {{
  window.__timelines = window.__timelines || {{}};
  const tl = gsap.timeline({{ paused: true }});
  // v3 (21/10/2026): tempos gerados por ferramentas/montar-v3.py a partir da transcrição da narração
  // (edit/tempos-v3.json). Cada palavra entra quando é dita; cada tela troca com a frase da função.

  function palavras(id, tempos, sai, sobe) {{
    document.querySelectorAll(id + " .w").forEach(function (w, i) {{
      tl.fromTo(w, {{ opacity: 0, y: sobe || 34, scale: .92 }}, {{ opacity: 1, y: 0, scale: 1, duration: .26, ease: "back.out(2)" }}, tempos[i] - .05);
    }});
    tl.to(id, {{ opacity: 0, y: -44, duration: .3, ease: "power2.in" }}, sai);
  }}
  function soco(id, t) {{ tl.fromTo(id + " .d", {{ scale: 1 }}, {{ scale: 1.12, duration: .12, yoyo: true, repeat: 1, ease: "power1.out" }}, t); }}
  // troca de tela: soco de escala e clarão menta, como no Reels aprovado
  function troca(de, para, t) {{
    tl.to("#fm-cel", {{ scale: .95, duration: .18, ease: "power2.in" }}, t - .18);
    tl.fromTo("#fm-flash", {{ opacity: 0 }}, {{ opacity: .55, duration: .09, yoyo: true, repeat: 1 }}, t - .1);
    if (de) tl.set(de, {{ opacity: 0 }}, t);
    tl.set(para, {{ opacity: 1 }}, t);
    tl.to("#fm-cel", {{ scale: 1, duration: .35, ease: "back.out(2.2)" }}, t);
  }}

  // a dor: o dinheiro some no "sumiu" e a carteira treme vazia
  tl.fromTo("#fm-i1", {{ opacity: 0, y: 30 }}, {{ opacity: .5, y: -30, duration: 6, ease: "none" }}, .1);
  tl.fromTo("#fm-i2", {{ opacity: 0, y: 60, rotation: -6 }}, {{ opacity: 1, y: 0, rotation: 4, duration: .5, ease: "back.out(1.6)" }}, .2);
  tl.fromTo("#fm-i3", {{ opacity: 0, y: 60 }}, {{ opacity: 1, y: 0, duration: .5, ease: "back.out(1.6)" }}, .35);
  tl.to("#fm-i2", {{ y: -520, x: 120, rotation: 28, scale: .3, opacity: 0, duration: .7, ease: "power2.in" }}, {T['sumiu'] - .05:.2f});
  tl.to("#fm-i3", {{ rotation: 5, duration: .07, yoyo: true, repeat: 5, ease: "none", transformOrigin: "50% 90%" }}, {T['sumiu'] + .05:.2f});
  palavras("#fm-t1", {js('t1')}, {sai['t1']});
  soco("#fm-t1", {T['sumiu'] + .1:.2f});
  palavras("#fm-t2", {js('t2')}, {sai['t2']});
  soco("#fm-t2", {T['nada'] + .1:.2f});
  tl.to("#fm-i3", {{ y: 80, opacity: 0, duration: .35, ease: "power2.in" }}, {T['nada'] + .1:.2f});
  tl.to("#fm-i1", {{ opacity: 0, duration: .35 }}, {T['nada'] + .1:.2f});

  // a solução: o celular sobe e assenta
  palavras("#fm-t3", {js('t3')}, {sai['t3']}, 20);
  tl.set("#fm-v1", {{ opacity: 1 }}, {T['cel_sobe']:.2f});
  tl.fromTo("#fm-cel", {{ opacity: 1, y: 1760, rotation: -4 }}, {{ opacity: 1, y: 0, rotation: 0, duration: .6, ease: "back.out(1.1)" }}, {T['cel_sobe']:.2f});
  tl.fromTo("#fm-cel", {{ rotation: 0 }}, {{ rotation: .6, duration: 2.2, yoyo: true, repeat: {gira}, ease: "sine.inOut", immediateRender: false }}, {T['cel_sobe'] + .65:.2f});

  // voz
  palavras("#fm-t4", {js('t4')}, {sai['t4']}, 20);

  // Pix colado: o formulário chega preenchido e o aparelho chega mais perto
  troca("#fm-v1", "#fm-v2", {T['v2']});
  palavras("#fm-t5", {js('t5')}, {sai['t5']}, 20);
  palavras("#fm-t6", {js('t6')}, {sai['t6']}, 20);
  tl.to("#fm-cel", {{ scale: 1.07, duration: .8, ease: "power2.inOut" }}, {ini('t6') - .05:.2f});
  tl.to("#fm-cel", {{ scale: 1, duration: .4, ease: "power2.inOut" }}, {fim('t6') + .05:.2f});

  // cartão
  troca("#fm-v2", "#fm-v3", {T['v3']});
  palavras("#fm-t7", {js('t7')}, {sai['t7']}, 20);
  palavras("#fm-t8", {js('t8')}, {sai['t8']}, 20);
  palavras("#fm-t9", {js('t9')}, {sai['t9']}, 20);
  tl.to("#fm-cel", {{ scale: 1.07, duration: .8, ease: "power2.inOut" }}, {ini('t9'):.2f});

  // lista
  troca("#fm-v3", "#fm-v4", {T['v4']});
  palavras("#fm-t10", {js('t10')}, {sai['t10']}, 20);

  // gráfico
  troca("#fm-v4", "#fm-v5", {T['v5']});
  palavras("#fm-t11", {js('t11')}, {sai['t11']}, 20);

  // Início com o "Livre para gastar"
  troca("#fm-v5", "#fm-v6", {T['v6']});
  palavras("#fm-t12", {js('t12')}, {sai['t12']}, 20);
  palavras("#fm-t13", {js('t13')}, {sai['t13']}, 20);
  tl.to("#fm-cel", {{ scale: 1.07, duration: .8, ease: "power2.inOut" }}, {ini('t12') + .45:.2f});

  // o celular desce, a frase final entra com a fala e o logo fecha
  tl.to("#fm-cel", {{ y: 1750, duration: .4, ease: "power3.in" }}, {T['cel_desce']:.2f});
  tl.set("#fm-cel", {{ opacity: 0 }}, {T['cel_desce'] + .45:.2f});
  palavras("#fm-t14", {js('t14')}, {sai['t14']});
  soco("#fm-t14", {blocos['t14'][-1][1] - .1:.2f});
  tl.fromTo("#fm-logo", {{ opacity: 0, scale: .86 }}, {{ opacity: 1, scale: 1, duration: .5, ease: "back.out(1.6)" }}, {T['logo']:.2f});
  tl.to({{}}, {{ duration: {T['total']} }}, 0);
  window.__timelines["fim-do-mes"] = tl;
}})();
</script>'''
    s = s[:s.index('<script>\n(function')] + script + s[s.index('</script>', s.index('<script>\n(function')) + len('</script>'):]
    open(CENA, 'w', encoding='utf-8').write(s)
    print(json.dumps({'T': T, 'telas': tempos['telas']}, indent=1))


if __name__ == '__main__':
    for passo in sys.argv[1:]:
        {'audio': audio, 'cena': cena}[passo]()
