from pathlib import Path
import json, math, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

ROOT = Path(r'E:\\Grana-temporarios\\2026-10-04-marketing')
FLARE = ROOT / 'flare'
V3 = FLARE / 'v3'
V3.mkdir(parents=True, exist_ok=True)
OUT = FLARE / 'reel-r13-v3.mp4'
SILENT = V3 / 'reel-r13-v3-silent.mp4'
MUSIC = V3 / 'trilha-original-r13-v3.wav'
VOICE = FLARE / 'locucao-r13.mp3'
SHOTS = ROOT / 'prints-novos' / 'celular'
FONT_LIGHT = Path(r'E:\\GranaPonto\\assets\\fonts\\NeueMachina-Light.otf')
FONT_REG = Path(r'E:\\GranaPonto\\assets\\fonts\\NeueMachina-Regular.otf')
LOGO = V3 / 'logo-oficial.png'
W,H,FPS,DURATION = 1080,1920,30,19.5
NFRAMES=int(FPS*DURATION)
PETROLEO=(5,34,41); TIDE=(11,45,53); SEAFOAM=(239,255,250); KELP=(166,217,206); TEAL=(31,169,141); MINT=(174,255,227); CYAN=(0,166,202)

# Fundo de marca com brilho estável, sem granulação.
y,x=np.mgrid[0:H//2,0:W//2]
base=np.zeros((H//2,W//2,3),dtype=np.float32)
for i,(a,b) in enumerate(zip(PETROLEO,(8,42,49))):
    base[:,:,i]=a+(b-a)*(y/(H//2-1))
# Luz baixa no centro para dar profundidade sem competir com texto nem captura.
d=((x-W/4)/(W*.54))**2+((y-H*.80)/(H*.42))**2
glow=np.exp(-d*2.5)*0.25
for i,c in enumerate((7,74,85)):
    base[:,:,i]=base[:,:,i]*(1-glow)+c*glow
BG=Image.fromarray(np.uint8(np.clip(base,0,255))).resize((W,H),Image.Resampling.BICUBIC).convert('RGBA')

LIGHT=ImageFont.truetype(str(FONT_LIGHT),82)
REG=ImageFont.truetype(str(FONT_REG),44)
CALLOUT=ImageFont.truetype(str(FONT_LIGHT),42)
VALUE=ImageFont.truetype(str(FONT_REG),52)
CTA=ImageFont.truetype(str(FONT_LIGHT),48)
INTRO_TIMES={w:t for w,t in json.loads((FLARE/'tempos-fala.json').read_text(encoding='utf-8'))['intro']}
INTRO_LINES=[['Uma','parada','na'],['farmácia,','um','cupom'],['no','fundo','da','sacola.']]
LINE_Y=[755,860,965]
INTRO_ORDER=['Uma','parada','na','farmácia,','um','cupom','no','fundo','da','sacola.']

# Capturas completas do app, escaladas proporcionalmente. Sem moldura de aparelho ou mockup.
SCREEN_W,SCREEN_H=720,1600

def prep_screen(name):
    src=Image.open(SHOTS/name).convert('RGBA').resize((SCREEN_W,SCREEN_H),Image.Resampling.LANCZOS)
    mask=Image.new('L',(SCREEN_W,SCREEN_H),0)
    ImageDraw.Draw(mask).rounded_rectangle((0,0,SCREEN_W-1,SCREEN_H-1),radius=18,fill=255)
    src.putalpha(ImageChops.multiply(src.getchannel('A'),mask))
    return src
SCREEN_LIST=prep_screen('lancamentos-rolada.png')
SCREEN_HOME=prep_screen('inicio.png')

# Recorte do logotipo oficial, sem alterar o vetor de origem.
logo=Image.open(LOGO).convert('RGBA')
alpha=logo.getchannel('A')
bbox=alpha.getbbox()
LOGO_IMG=logo.crop(bbox)
logo_w=630; logo_h=round(LOGO_IMG.height*logo_w/LOGO_IMG.width)
LOGO_IMG=LOGO_IMG.resize((logo_w,logo_h),Image.Resampling.LANCZOS)

# Mapeamento e animação tipográfica da abertura em Neue Machina Light.
intro_layout={}
for li,line in enumerate(INTRO_LINES):
    x0=82; y0=LINE_Y[li]
    for word in line:
        width=ImageDraw.Draw(Image.new('L',(1,1))).textlength(word,font=LIGHT)
        intro_layout[word]=(x0,y0)
        x0+=width+14

def ease_out(v):
    v=max(0,min(1,v)); return 1-(1-v)**3

def smooth(v):
    v=max(0,min(1,v)); return v*v*(3-2*v)

def alpha_text(draw, xy, text, font, fill, a):
    if a<=0: return
    color=tuple(fill[:3])+(int(255*max(0,min(1,a))),)
    draw.text(xy,text,font=font,fill=color,stroke_width=0)

def draw_intro(frame,t):
    layer=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(layer)
    for i,word in enumerate(INTRO_ORDER):
        x0,y0=intro_layout[word]; start=INTRO_TIMES[word]
        p=ease_out((t-start)/0.24)
        if t<start: continue
        y=int(y0+(1-p)*18)
        color=MINT if word in ('farmácia,','sacola.') else SEAFOAM
        alpha_text(d,(x0,y),word,LIGHT,color,p)
    # Filete curto sob a palavra-chave, separado do texto e sincronizado com a pausa.
    if t>0.65:
        x0,y0=intro_layout['farmácia,']; w=d.textlength('farmácia,',font=LIGHT)
        p=smooth((t-.65)/.32); pulse=0.72+0.16*math.sin(max(0,t-.65)*7)
        d.rounded_rectangle((x0,y0+89,x0+w*p,y0+94),radius=3,fill=(*MINT,int(180*pulse)))
    frame.alpha_composite(layer)

def draw_background_motion(frame,t,scene):
    layer=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(layer)
    # Arcos largos de baixa opacidade dão ritmo, sem confete nem ornamentação gratuita.
    p=t*0.75
    if scene=='intro':
        cx=int(900+35*math.sin(p)); cy=int(570+22*math.cos(p*.7))
        d.arc((cx-245,cy-245,cx+245,cy+245),start=198+int((p*35)%60),end=330+int((p*35)%60),fill=(31,169,141,65),width=3)
        d.ellipse((100+int(20*math.sin(p)),1320,124+int(20*math.sin(p)),1344),fill=(0,166,202,100))
    elif scene in ('list','home'):
        drift=int(12*math.sin(p))
        d.arc((42,520+drift,290,768+drift),start=50+int((p*20)%90),end=210+int((p*20)%90),fill=(31,169,141,82),width=3)
        d.arc((790,1100-drift,1038,1348-drift),start=220-int((p*17)%80),end=350-int((p*17)%80),fill=(0,166,202,78),width=3)
        d.ellipse((890+int(12*math.cos(p)),330,904+int(12*math.cos(p)),344),fill=(174,255,227,110))
    else:
        r=170+int(8*math.sin(p))
        d.arc((540-r,960-r,540+r,960+r),start=32+int((p*14)%50),end=220+int((p*14)%50),fill=(31,169,141,48),width=3)
    frame.alpha_composite(layer)

def draw_screen(frame,screen,t,start,end,entrance_start,exit_start,seed):
    # O screenshot inteiro permanece dentro da tela e conserva os controles em todos os quadros.
    if t<entrance_start or t>=end: return 0
    enter=ease_out((t-entrance_start)/0.42)
    out=1.0 if t<exit_start else 1-smooth((t-exit_start)/.34)
    a=max(0,min(1,enter*out))
    if a<=0: return a
    phase=t*2.2+seed
    breathing=0.016*math.sin(phase)+0.006*math.sin(phase*.49)
    scale=(SCREEN_W/W)*(W/SCREEN_W) # documented neutral factor, overridden below
    base_scale=1.12 if (screen is SCREEN_LIST or (8.52<=t<10.25) or (11.22<=t<16.20)) else 1.0
    scale=base_scale*(1.0+breathing)
    sw,sh=round(SCREEN_W*scale),round(SCREEN_H*scale)
    panel=screen.resize((sw,sh),Image.Resampling.LANCZOS)
    # Flutuação breve de entrada; movimento contínuo muito pequeno enquanto o UI fica integral.
    ycenter=960 + int((1-enter)*72) + int(18*math.sin(phase*.62))
    xcenter=540 + int(14*math.sin(phase*.43))
    angle=0.45*math.sin(phase*.7)
    if abs(angle)>0.02:
        panel=panel.rotate(angle,resample=Image.Resampling.BICUBIC,expand=True)
    x0=xcenter-panel.width//2; y0=ycenter-panel.height//2
    # Sombra curta e suave da captura plana, sem simular um aparelho.
    shadow=Image.new('RGBA',panel.size,(0,0,0,0)); shadow.putalpha(panel.getchannel('A').filter(ImageFilter.GaussianBlur(14)).point(lambda v:int(v*.23)))
    full_shadow=Image.new('RGBA',(W,H),(0,0,0,0))
    full_shadow.alpha_composite(shadow,(x0+4,y0+9))
    full_shadow.putalpha(full_shadow.getchannel('A').point(lambda v:int(v*a)))
    frame.alpha_composite(full_shadow)
    panel.putalpha(panel.getchannel('A').point(lambda v:int(v*a)))
    frame.alpha_composite(panel,(x0,y0))
    return a

def draw_callout(frame,t):
    # Callouts ficam na faixa de fundo acima da captura, sem tocar na interface.
    value=None; label=None; opacity=0
    if 4.12<=t<5.48:
        label='Livre para gastar'
        p=smooth((t-4.22)/.22)
        n=smooth((t-4.45)/.85)
        # A contagem começa perto do valor verdadeiro para evitar um número
        # transitório que contradiga visualmente a captura real ao fundo.
        cents=10687+round(100*n)
        value=f'R$ {cents//100},{cents%100:02d}'
        opacity=p*(1-smooth((t-5.27)/.2))
    elif 5.48<=t<6.36:
        label='Saldo do mês'; opacity=smooth((t-5.48)/.17)*(1-smooth((t-6.22)/.14))
    elif 6.36<=t<7.27:
        label='Cofrinhos'; opacity=smooth((t-6.36)/.17)*(1-smooth((t-7.13)/.14))
    elif 7.27<=t<8.52:
        label='Dias que faltam, incluindo hoje'; opacity=smooth((t-7.27)/.18)*(1-smooth((t-8.36)/.15))
    elif 10.25<=t<11.22:
        label='O restante dividido pelos dias do mês'; opacity=smooth((t-10.25)/.18)*(1-smooth((t-11.08)/.16))
    if opacity<=0: return
    layer=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(layer)
    # Pílula em espaço vazio: conteúdo da captura continua sem qualquer sobreposição.
    d.rounded_rectangle((142,29,938,138),radius=50,fill=(11,45,53,int(214*opacity)),outline=(31,169,141,int(130*opacity)),width=2)
    dot_y=84
    d.ellipse((178,dot_y-6,190,dot_y+6),fill=(*TEAL,int(255*opacity)))
    if value is not None:
        text=f'{label}   {value}'
        font=VALUE
    else:
        text=label; font=CALLOUT
    bbox=d.textbbox((0,0),text,font=font)
    tw=bbox[2]-bbox[0]
    x=(W-tw)//2+12
    y=61 if value is None else 57
    alpha_text(d,(x,y),text,font,SEAFOAM,opacity)
    frame.alpha_composite(layer)

def draw_edge_pulse(frame,t,center_y,begin,duration=0.7):
    p=(t-begin)/duration
    if p<0 or p>1: return
    e=smooth(p); layer=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(layer)
    x=82+int(e*4); radius=7+int(13*e); a=int(160*(1-e))
    d.ellipse((x-radius,center_y-radius,x+radius,center_y+radius),outline=(*MINT,a),width=3)
    d.line((x+radius+4,center_y,x+radius+18,center_y),fill=(*TEAL,int(145*(1-e))),width=2)
    frame.alpha_composite(layer)

def draw_outro(frame,t):
    if t<16.55: return
    a=smooth((t-16.55)/.44)
    layer=Image.new('RGBA',(W,H),(0,0,0,0))
    logo=LOGO_IMG.copy()
    # Logo oficial em gradiente; respiração quase imperceptível para manter a tela viva.
    pulse=1.0+0.006*math.sin((t-17)*2.6)
    lw=round(logo_w*pulse); lh=round(logo_h*pulse)
    logo=logo.resize((lw,lh),Image.Resampling.LANCZOS)
    logo.putalpha(logo.getchannel('A').point(lambda v:int(v*a)))
    layer.alpha_composite(logo,((W-lw)//2,760+(LOGO_IMG.height-lh)//2))
    cta_alpha=smooth((t-17.06)/.36)*a
    d=ImageDraw.Draw(layer)
    text='Conheça o Grana.'
    bbox=d.textbbox((0,0),text,font=CTA); tw=bbox[2]-bbox[0]
    alpha_text(d,((W-tw)//2,1017),text,CTA,MINT,cta_alpha)
    # Linha curta de assinatura, entrando depois da marca.
    lp=smooth((t-17.38)/.32)*a
    d.rounded_rectangle((450,1100,450+180*lp,1104),radius=2,fill=(*TEAL,int(180*lp)))
    frame.alpha_composite(layer)

# Trilha inteiramente sintetizada nesta pasta. 6/8 a 104 BPM, plucks e pad suaves, sem samples.
def midi(n): return 440.0*2**((n-69)/12)
def make_music(path):
    sr=44100; n=int(sr*DURATION); mix=np.zeros((n,2),dtype=np.float32)
    bpm=104; beat=60/bpm; bar=3*beat
    chords=[([62,66,69,71],50),([67,71,74,78],43),([59,62,66,69],47),([57,59,64,69],45)]
    melody=[74,78,81,76,83,78,74,81,86,83,78,81,76,74,71,78]
    # Pad sustentado, com ataques e finais suaves.
    for bi in range(math.ceil(DURATION/bar)):
        chord,bass=chords[bi%len(chords)]; start=bi*bar
        for note in chord:
            i0=int(start*sr); dur=min(int((bar+.12)*sr),n-i0)
            if dur<=0: continue
            tt=np.arange(dur,dtype=np.float32)/sr
            env=np.minimum(1,tt/.18)*np.minimum(1,(bar-tt+.18)/.24)
            freq=midi(note-12)
            sig=np.sin(2*np.pi*freq*tt)+.18*np.sin(2*np.pi*freq*2*tt)
            pan=.30 if note%2 else -.30
            mix[i0:i0+dur,0]+=sig*env*.012*(1-pan)
            mix[i0:i0+dur,1]+=sig*env*.012*(1+pan)
        # Pulso grave sem kick sampleado, a cada compasso de 6/8.
        i0=int(start*sr); dur=min(int(.32*sr),n-i0)
        if dur>0:
            tt=np.arange(dur,dtype=np.float32)/sr
            freq=48+8*np.exp(-tt*10)
            phase=2*np.pi*np.cumsum(freq)/sr
            kick=np.sin(phase)*np.exp(-tt*11)*.075
            mix[i0:i0+dur,0]+=kick; mix[i0:i0+dur,1]+=kick
    # Motivo pentatônico saltado, diferente da batida regular dos Reels anteriores.
    offsets=[0,.39,.78,1.17,1.56]
    for bi in range(math.ceil(DURATION/bar)):
        base=bi*bar
        for j,off in enumerate(offsets):
            st=base+off
            if st>=DURATION: continue
            note=melody[(bi*3+j)%len(melody)]
            i0=int(st*sr); dur=min(int(.42*sr),n-i0)
            tt=np.arange(dur,dtype=np.float32)/sr
            attack=1-np.exp(-tt/.012)
            env=attack*np.exp(-tt/.16)
            freq=midi(note)
            tone=(np.sin(2*np.pi*freq*tt)+.30*np.sin(2*np.pi*freq*2*tt)+.08*np.sin(2*np.pi*freq*3*tt))
            pan=math.sin(bi*1.3+j*.9)*.34
            sig=tone*env*.075
            mix[i0:i0+dur,0]+=sig*(1-pan); mix[i0:i0+dur,1]+=sig*(1+pan)
    # Fade-in/out para evitar clicks; normalização moderada.
    fade=np.ones(n,dtype=np.float32)
    fade[:int(sr*.35)]=np.linspace(0,1,int(sr*.35))
    fade[int(sr*19.0):]=np.linspace(1,0,n-int(sr*19.0))
    mix*=fade[:,None]
    peak=float(np.max(np.abs(mix)))
    if peak>0: mix*=.22/peak
    pcm=np.int16(np.clip(mix,-1,1)*32767)
    with wave.open(str(path),'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes(pcm.tobytes())

make_music(MUSIC)
ffmpeg='ffmpeg'
cmd=[ffmpeg,'-y','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(SILENT)]
proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
try:
    for i in range(NFRAMES):
        t=i/FPS; frame=BG.copy()
        if t<3.45: scene='intro'
        elif t<3.82: scene='pause'
        elif t<3.85: scene='pause'
        elif t<16.55: scene='home'
        else: scene='outro'
        draw_background_motion(frame,t,scene)
        if t<1.59:
            draw_intro(frame,t)
        if 1.58<=t<3.76:
            draw_screen(frame,SCREEN_LIST,t,1.58,3.76,1.58,3.39,2.7)
            draw_edge_pulse(frame,t,1110,2.15,.85)
        if 3.84<=t<16.65:
            draw_screen(frame,SCREEN_HOME,t,3.84,16.65,3.84,16.20,4.2)
            draw_callout(frame,t)
            draw_edge_pulse(frame,t,875,5.40,.85)
            draw_edge_pulse(frame,t,875,8.95,.75)
            draw_edge_pulse(frame,t,875,12.45,.85)
        draw_outro(frame,t)
        proc.stdin.write(frame.convert('RGB').tobytes())
        if i%60==0: print(f'frame {i}/{NFRAMES}',flush=True)
    proc.stdin.close()
    err=proc.stderr.read().decode('utf-8','replace')
    code=proc.wait()
    if code: raise RuntimeError(f'ffmpeg video render failed ({code}): {err}')
finally:
    if proc.poll() is None:
        proc.kill()

# Mix existing narration with this original local composition; no provider call or external track.
filter_complex='[1:a]aformat=channel_layouts=stereo,volume=1.0,adelay=20|20[voice];[2:a]volume=0.52[bed];[voice][bed]amix=inputs=2:duration=longest:dropout_transition=0,alimiter=limit=0.95,loudnorm=I=-20.9:TP=-3:LRA=4[outa]'
subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','error','-i',str(SILENT),'-i',str(VOICE),'-i',str(MUSIC),'-filter_complex',filter_complex,'-map','0:v:0','-map','[outa]','-c:v','copy','-c:a','aac','-b:a','192k','-ac','2','-ar','48000','-t',str(DURATION),'-movflags','+faststart',str(OUT)],check=True)
print(f'created {OUT} frames={NFRAMES} duration={DURATION} music={MUSIC}',flush=True)
