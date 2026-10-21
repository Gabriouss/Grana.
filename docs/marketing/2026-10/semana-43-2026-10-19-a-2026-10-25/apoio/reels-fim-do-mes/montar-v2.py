"""Versão 2 do Reels "Fim do mês" (21/10/2026), a partir do pedido do autor:
"Não gostei da entonação desse (começa pelo próximo gasto) [...] Tenta dar uma desacelerada na exibição
das funcionalidades [...] Pode estender um pouco a duração do vídeo [...] Tem que alterar a ultima frase
da narração e do final do vídeo." e, logo depois, "a fala também deve ser um pouco mais lenta".

- Narração: a take "d" até o fim do gráfico, cortada nos silêncios medidos entre as frases, mais a take
  nova g1 (ElevenLabs, mesma voz) com "E o app ainda mostra... / Assim, o fim do mês deixa de ser surpresa."
- Pausas novas antes de cada tela, e a fala inteira 8% mais lenta (rubberband, tom preservado).
- Grava audio/narracao-v2.wav e edit/mapa-v2.json (mapa de tempo antigo -> novo para a cena).
"""
import json, os, subprocess
AQ = os.path.dirname(os.path.abspath(__file__)); BASE = os.path.dirname(AQ)
AUD = os.path.join(BASE, 'audio')
TEMPO = 0.92          # fala 8% mais lenta
P = 0.30              # a narração começa 0,3 s depois do primeiro quadro (igual à v1)
# cortes na take d (s da narração), no meio dos silêncios medidos com silencedetect -38 dB
CORTES = [0.0, 6.45, 8.46, 11.02, 13.21, 15.55, 16.66, 20.71, 23.20, 25.63]
# pausa (s, já no tempo final) aberta ANTES de cada trecho: gancho, solução, voz, Pix, preenchido,
# cartão, fatura, lista, gráfico, e por fim a take nova
PAUSAS = [0.0, 0.4, 0.6, 1.2, 0.5, 1.0, 0.3, 1.2, 1.2, 1.2]
G1 = os.path.join(AUD, 'final', 'g1.mp3')     # 7,01 s; pausa interna de 3,02 a 4,42 s; fala até 6,74 s
G1_FIM = 6.80


def run(c): subprocess.run(c, check=True)


def main():
    seg, saida, t = [], [], 0.0
    fontes = [(os.path.join(AUD, 'narracao-d.mp3'), CORTES[i], CORTES[i + 1]) for i in range(len(CORTES) - 1)]
    fontes.append((G1, 0.0, G1_FIM))
    filtros, entradas = [], []
    for i, (arq, a, b) in enumerate(fontes):
        t += PAUSAS[i]
        seg.append({'fonte': os.path.basename(arq), 'de': a, 'ate': b, 'saida': round(P + t, 4)})
        entradas += ['-i', arq]
        # 8 ms de fade nas pontas para o corte não estalar
        d = b - a
        filtros.append(f'[{i}:a]atrim={a}:{b},asetpts=PTS-STARTPTS,aresample=48000,afade=t=in:d=0.008,afade=t=out:st={d - 0.008:.4f}:d=0.008,'
                       f'rubberband=tempo={TEMPO},apad=pad_dur={PAUSAS[i + 1] if i + 1 < len(PAUSAS) else 0}[s{i}]')
        t += d / TEMPO
    filtros.append(''.join(f'[s{i}]' for i in range(len(fontes))) + f'concat=n={len(fontes)}:v=0:a=1[a]')
    # o apad de cada trecho já carrega a pausa do seguinte; a 1ª pausa (0) não existe
    out = os.path.join(AUD, 'narracao-v2.wav')
    run(['ffmpeg', '-y', '-loglevel', 'error', *entradas, '-filter_complex', ';'.join(filtros), '-map', '[a]', '-ac', '1', out])
    mapa = {'tempo': TEMPO, 'P': P, 'segmentos': seg, 'fim_narracao': round(P + t, 4)}
    os.makedirs(os.path.join(BASE, 'edit'), exist_ok=True)
    json.dump(mapa, open(os.path.join(BASE, 'edit', 'mapa-v2.json'), 'w'), indent=1)
    print(json.dumps(mapa, indent=1))


if __name__ == '__main__':
    main()
