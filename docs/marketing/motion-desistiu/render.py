import sys, subprocess
from playwright.sync_api import sync_playwright
mode=sys.argv[1]
with sync_playwright() as p:
    b=p.chromium.launch(args=['--allow-file-access-from-files'])
    pg=b.new_page(viewport={'width':540,'height':960},device_scale_factor=2)
    import os; pg.goto('file://'+os.path.abspath('index.html')); pg.wait_for_timeout(800)
    pg.evaluate('document.fonts.ready')
    if mode=='stills':
        for t in sys.argv[2:]:
            pg.evaluate(f'anim({t})'); pg.screenshot(path=f'still-{t}.png')
    else:
        fps=30; dur=float(sys.argv[2])
        ff=subprocess.Popen(['ffmpeg','-v','error','-y','-f','image2pipe','-framerate',str(fps),'-i','-','-c:v','libx264','-pix_fmt','yuv420p','-crf','16','-preset','medium','video-sem-som.mp4'],stdin=subprocess.PIPE)
        for i in range(int(dur*fps)):
            pg.evaluate(f'anim({i/fps})'); ff.stdin.write(pg.screenshot(type='png'))
        ff.stdin.close(); ff.wait()
    b.close()
