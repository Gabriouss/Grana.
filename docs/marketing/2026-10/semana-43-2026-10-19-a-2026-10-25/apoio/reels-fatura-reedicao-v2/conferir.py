"""Confere o MP4 entregue, com amostras reais e sem reenviar conteudo a servicos."""
import json,subprocess,re,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
R=Path(__file__).parent
video=Path(sys.argv[1])
info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
v=next(x for x in info['streams'] if x['codec_type']=='video')
a=next(x for x in info['streams'] if x['codec_type']=='audio')
assert (v['width'],v['height'],v['r_frame_rate'],v['pix_fmt'])==(1080,1920,'30/1','yuv420p')
assert a['sample_rate']=='48000' and a['channels']==2
err=subprocess.run(['ffmpeg','-hide_banner','-i',str(video),'-af','loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True).stderr
loud=json.loads(err[err.rindex('{'):err.rindex('}')+1])
assert -15<=float(loud['input_i'])<=-13, loud
assert float(loud['input_tp'])<=-1.0,loud
err=subprocess.run(['ffmpeg','-hide_banner','-i',str(video),'-vf','blackdetect=d=0.1:pix_th=0.025:pic_th=0.98','-an','-f','null','-'],capture_output=True,text=True).stderr
black=re.findall('black_start:.*',err)
assert not black,black
raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(video),'-vf','fps=10,scale=108:192','-pix_fmt','rgb24','-f','rawvideo','-'])
frames=np.frombuffer(raw,np.uint8).reshape(-1,192,108,3).astype(np.float32)
intervals={'gancho':(.1,2.8),'compras':(3.7,5.8),'celular':(6.1,15.5),'cta':(16.2,18.2),'logo':(18.7,20.2)}
motion={}
for label,(start,end) in intervals.items():
 f=frames[int(start*10):int(end*10)];delta=np.abs(np.diff(f,axis=0)).mean(axis=(1,2,3));motion[label]={'deltaMedio':float(delta.mean()),'deltaMaximo':float(delta.max())};assert delta.max()>.1,(label,'sem movimento')
sheet=Image.new('RGB',(1350,1000),'#021319');d=ImageDraw.Draw(sheet)
times=[.4,2.6,4.6,5.5,7.6,9.1,10.4,13.6,17.8,19.6]
for i,t in enumerate(times):
 out=R/f'final-{i:02}.png'
 subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(video),'-frames:v','1',str(out)],check=True)
 im=Image.open(out);im.thumbnail((270,480));sheet.paste(im,((i%5)*270,(i//5)*500));d.text(((i%5)*270+8,(i//5)*500+482),f'{t:.1f}s',fill='white')
sheet.save(R/'final-folha.png')
res={'arquivo':str(video),'duracao':info['format']['duration'],'quadros':v.get('nb_frames'),'formato':'1080x1920 30fps H264 yuv420p AAC48kHz stereo','loudness':loud,'black':black,'motion':motion,'status':'PASS'}
(R/'qa-final.json').write_text(json.dumps(res,indent=2,ensure_ascii=False),encoding='utf8')
print(json.dumps(res,indent=2,ensure_ascii=False))
