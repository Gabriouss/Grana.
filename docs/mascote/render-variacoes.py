import sys; sys.path.insert(0,'.'); from fofo import *
base=dict(widen=0,blur=0,round=False,mint=[0.55,0.86,0.74],spec=0.25,shape='dot',eye_x=0.25,eye_y=0.30,eye_w=0.07,eye_h=0.07)
A=dict(base)
Bv=dict(base,widen=0,blur=7,round=True,shape='oval',eye_x=0.30,eye_y=0.32,eye_w=0.10,eye_h=0.13)
C=dict(Bv,mint=[0.66,0.90,0.80],spec=0.18,amb=0.45)
Dv=dict(C,shape='happy',eye_h=0.11,eye_w=0.11)
W1=dict(C,widen=8,eye_y=0.36,eye_h=0.16,eye_w=0.11)
W2=dict(C,widen=14,eye_y=0.40,eye_h=0.19,eye_w=0.12)
W3=dict(W2,mouth=dict(on='shell',y=-0.10,w=0.17,h=0.07,t=0.10))
base3=dict(W2)
def sm(r,a,t,y): return dict(base3,mouth=dict(on='shell',kind='smile',y=y,r=r,a=a,t=t,w=0,h=0))
L1=sm(0.13,42,0.020,-0.035); L2=sm(0.17,40,0.020,-0.04); L3=sm(0.22,36,0.020,-0.045); L4=sm(0.17,48,0.020,-0.045)
vs=[(L1,'L1 · LARGURA 1,5×'),(L2,'L2 · LARGURA 2×'),(L3,'L3 · LARGURA 2,5×'),(L4,'L4 · 2×, MAIS CURVADO')]
_=[(A,'A · ATUAL'),(Bv,'B · OLHOS GRANDES + BORDAS SUAVES'),(C,'C · B + MENTA LEITOSO'),(Dv,'D · C COM EXPRESSÃO FELIZ')]
N=520; BG=np.array([0.88,0.885,0.89]); H=N+110
sheet=Image.new('RGB',(N*4,H+130),tuple((BG*255).astype(int))); dr=ImageDraw.Draw(sheet)
F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',26); Fs=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18); Fm=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',17)
dr.text((30,30),'GRANABÔ — SORRISOS MAIS LARGOS (VISTA FRONTAL)',fill=(30,50,60),font=F)
dr.text((30,66),'Mesma esfera, mesmo G do logo. Base W3 (ponta do G girada 14°). Mesmo arco com pontas arredondadas, traço do S4; muda a largura (em relação ao S2).',fill=(80,95,100),font=Fs)
for i,(V,lab) in enumerate(vs):
    img,al=render(V); oy=20
    sh=Image.new('L',(N,H),0); sd=ImageDraw.Draw(sh); gy=oy+int(N*(0.5+1/2.5))+28
    sd.ellipse([N//2-150,gy-12,N//2+150,gy+12],fill=110); s=np.array(sh.filter(ImageFilter.GaussianBlur(14)))/255.
    base_=np.ones((H,N,3))*BG*(1-0.45*s)[...,None]
    base_[oy:oy+N]=base_[oy:oy+N]*(1-al[...,None])+img*al[...,None]
    sheet.paste(Image.fromarray((base_*255).astype(np.uint8)),(i*N,120))
    dr.text((i*N+N//2,120+H-40),lab,fill=(30,50,60),font=Fm,anchor='mm')
sheet.save('granabo-sorrisos-largos.png'); print('ok')
