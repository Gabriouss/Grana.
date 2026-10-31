"""Maior trecho sem movimento perceptível (diferença média < 0,4 em 0-255) e quadros escuros."""
import sys, subprocess, numpy as np
f = sys.argv[1]; W, H = 108, 192
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-vf', f'scale={W}:{H}', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
d = np.abs(np.diff(fr, axis=0)).mean(axis=(1, 2))
run = best = 0; fim = 0
for i, v in enumerate(d):
    run = run + 1 if v < .4 else 0
    if run > best: best, fim = run, i
print(f'quadros {len(fr)}  maior parado {best/60:.2f}s (termina em {fim/60:.2f}s)  escuros {(fr.mean(axis=(1,2)) < 20).sum()}')
