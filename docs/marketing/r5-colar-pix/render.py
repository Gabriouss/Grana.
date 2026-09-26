import sys,subprocess,os
from playwright.sync_api import sync_playwright
mode,kind=sys.argv[1],sys.argv[2]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args=['--allow-file-access-from-files'])
    pg=b.new_page(viewport={'width':540,'height':960},device_scale_factor=2)
    pg.goto('file://'+os.path.abspath('r5v2.html')+'?m='+mode); pg.wait_for_timeout(800); pg.evaluate('document.fonts.ready')
    def at(t):
        pg.evaluate(f'anim({t})'); pg.evaluate('ready()')
    if kind=='stills':
        for t in sys.argv[3:]:
            at(t); pg.screenshot(path=f'{mode}-{t}.png')
    else:
        dur=float(sys.argv[3]); fps=30
        ff=subprocess.Popen(['../pyff/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2','-v','error','-y','-f','image2pipe','-framerate','30','-i','-','-c:v','libx264','-pix_fmt','yuv420p','-crf','16',f'r5v2-sem-som.mp4'],stdin=subprocess.PIPE)
        for i in range(int(dur*fps)):
            at(i/fps); ff.stdin.write(pg.screenshot(type='png'))
        ff.stdin.close(); ff.wait()
    b.close()
