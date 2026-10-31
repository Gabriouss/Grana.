"""Mix v3: voz original inteira em t=0 (sem retime), trilha V2 electro 124 BPM do Beacon com batida em t=0,
SFX locais do Editonny nos eventos da cena. Loudnorm 2 passadas -14 LUFS / TP -1.5."""
import subprocess, json, pathlib
B = pathlib.Path(r'E:/Grana-temporarios/reels-fatura-v3')
VOZ = r'E:/Grana-temporarios/2026-10-24-tino-videos/trabalho/narracoes/v2-narracao-final.wav'
TRI = r'E:/Grana-temporarios/2026-10-25-reels-cinco-estilos-60fps/audio/v2-trilha.wav'
FX = r'C:/Users/user/.local/share/editonny/engine/assets/sfx/'
BC = r'E:/Grana-temporarios/2026-10-25-reels-cinco-estilos-60fps/audio/sfx/'
DUR = 19.75
EV = [  # (arquivo, t, ganho)
    (FX + 'synthetic/bass_drop.wav', 0.0, .55), (FX + 'synthetic/whoosh.wav', 0.0, .5),
    (FX + 'snap.wav', .29, .45), (FX + 'synthetic/whoosh.wav', .58, .25), (FX + 'synthetic/whoosh.wav', .98, .25),
    (FX + 'metal_hit.wav', 1.26, .45), (FX + 'synthetic/whoosh.wav', 1.56, .45),
    (FX + 'synthetic/pop.wav', 2.36, .35), (FX + 'synthetic/flash.wav', 2.70, .4),
    (BC + 'v2-cartao.wav', 2.76, .5), (BC + 'v2-cartao.wav', 2.82, .45), (BC + 'v2-cartao.wav', 2.87, .45), (BC + 'v2-cartao.wav', 2.93, .45),
    (FX + 'synthetic/synth_hit.wav', 3.1, .45), (FX + 'synthetic/pop.wav', 3.86, .4), (FX + 'synthetic/pop.wav', 3.92, .35),
    (FX + 'synthetic/rewind.wav', 4.84, .3), (FX + 'synthetic/rise.wav', 5.3, .35), (FX + 'synthetic/whoosh.wav', 5.82, .55),
    (FX + 'synthetic/whoosh.wav', 6.04, .45), (FX + 'click.wav', 6.6, .35),
    (FX + 'synthetic/tick.wav', 7.02, .4), *[(FX + 'synthetic/tick.wav', 7.64 + i * .1, .3) for i in range(4)],
    (FX + 'synthetic/pop.wav', 8.46, .35), (FX + 'synthetic/whoosh.wav', 9.18, .35), (FX + 'snap.wav', 9.52, .45),
    (FX + 'synthetic/whoosh.wav', 10.6, .35), (FX + 'synthetic/pop.wav', 11.14, .35), (BC + 'v2-papel.wav', 11.92, .5),
    (FX + 'synthetic/whoosh.wav', 12.28, .5), (FX + 'coin.wav', 12.96, .35), (FX + 'synthetic/synth_hit.wav', 13.14, .3),
    (FX + 'synthetic/whoosh.wav', 13.9, .3), (FX + 'synthetic/data.wav', 14.3, .2),
    (FX + 'synthetic/whoosh.wav', 15.18, .45), (FX + 'synthetic/bass_drop.wav', 16.1, .45), (FX + 'mouse_click.wav', 16.5, .6),
    (FX + 'synthetic/whoosh.wav', 16.74, .3), (FX + 'success.wav', 17.7, .35),
]
def ln(src):
    e = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(src), '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return json.loads(e[e.rindex('{'):e.rindex('}') + 1])
pre = B / 'saida' / 'mix-pre.wav'
cmd = ['ffmpeg', '-y', '-v', 'error', '-i', VOZ, '-ss', '0.441', '-i', TRI]
for f, _, _ in EV: cmd += ['-i', f]
gv = -14 - float(ln(VOZ)['input_i'])
fc = (f'[0:a]aformat=sample_rates=48000:channel_layouts=stereo,volume={gv:.2f}dB,asplit=2[voz][key];'
      f'[1:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=-6dB,afade=t=out:st={DUR - 1.2}:d=1.2[mus];'
      '[mus][key]sidechaincompress=threshold=0.03:ratio=5:attack=15:release=250[bed];')
for j, (_, t, g) in enumerate(EV):
    d = round(t * 1000)
    fc += f'[{j + 2}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume={g},adelay={d}|{d}[e{j}];'
fc += '[voz][bed]' + ''.join(f'[e{j}]' for j in range(len(EV))) + f'amix=inputs={len(EV) + 2}:duration=longest:normalize=0,apad,atrim=duration={DUR}[m]'
subprocess.run(cmd + ['-filter_complex', fc, '-map', '[m]', '-ar', '48000', '-c:a', 'pcm_f32le', str(pre)], check=True)
q = ln(pre)
af = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={q['input_i']}:measured_TP={q['input_tp']}:measured_LRA={q['input_lra']}"
      f":measured_thresh={q['input_thresh']}:offset={q['target_offset']}:linear=true")
out = B / 'saida' / 'fatura-e-parcelas-reedicao-v3.mp4'
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(B / 'saida' / 'video-sem-audio.mp4'), '-i', str(pre), '-map', '0:v', '-map', '1:a',
                '-c:v', 'copy', '-af', af, '-ar', '48000', '-ac', '2', '-c:a', 'aac', '-b:a', '256k', '-t', str(DUR), '-movflags', '+faststart', str(out)], check=True)
print(out, json.dumps(ln(out))[:200])
