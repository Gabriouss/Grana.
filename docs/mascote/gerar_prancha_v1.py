import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
AQUI=os.path.dirname(os.path.abspath(__file__))
D=AQUI+'/'
im=np.array(Image.open(os.path.join(AQUI,'logo-g.png')).convert('RGBA')).astype(float)
dark=(im[...,3]>128)&(im[...,:3].mean(-1)<160)
ys,xs=np.where(dark); y0,y1,x0,x1=ys.min(),ys.max(),xs.min(),xs.max()
M=dark[y0:y1+1,x0:x1+1]; MH,MW=M.shape
R2=1.0; T=0.13; R1=R2-T
def mask(z,y):
    u=((z/R2+1)/2*(MW-1)).round().astype(int); v=((1-(y/R2+1)/2)*(MH-1)).round().astype(int)
    ok=(u>=0)&(u<MW)&(v>=0)&(v<MH); out=np.zeros(z.shape,bool)
    out[ok]=M[v[ok],u[ok]]; return out
def inshell(p):
    r=np.linalg.norm(p,axis=-1); return (r>=R1)&(r<=R2)&mask(p[...,2],p[...,1])
eyes=[np.array([s*0.24,0.24,1.0]) for s in (-1,1)]
for e in eyes: e/=np.linalg.norm(e)
L=np.array([-0.5,0.7,0.6]); L/=np.linalg.norm(L)  # fixed in camera space
N=520; S=1.25
def render(deg):
    a=np.radians(deg); c,s=np.cos(a),np.sin(a)
    Rot=np.array([[c,0,s],[0,1,0],[-s,0,c]])  # camera->object
    xs=np.linspace(-S,S,N); X,Y=np.meshgrid(xs,-xs)
    o=np.stack([X,Y,np.full_like(X,3)],-1)@Rot.T; d=np.array([0,0,-1.])@Rot.T
    Lo=L@Rot.T; V=-d
    img=np.zeros((N,N,3)); alpha=np.zeros((N,N))
    b=(o*d).sum(-1); cc=(o*o).sum(-1)-R2**2; disc=b*b-cc; hit=disc>0
    t0=np.where(hit,-b-np.sqrt(np.maximum(disc,0)),0)
    done=~hit; tcur=t0.copy(); kind=np.zeros((N,N),int); P=np.zeros((N,N,3))
    tex=np.where(hit,-b+np.sqrt(np.maximum(disc,0)),0)
    for i in range(400):
        p=o+tcur[...,None]*d
        r=np.linalg.norm(p,axis=-1)
        sh=(~done)&inshell(p); core=(~done)&(r<=R1)
        kind[sh]=1; kind[core&~sh]=2; P[sh|core]=p[sh|core]
        done|=sh|core|(tcur>tex)
        if done.all(): break
        tcur+=0.006
    # normals
    n=P/np.maximum(np.linalg.norm(P,axis=-1,keepdims=True),1e-6)
    # cut walls: if entry point well inside outer sphere, normal from mask gradient
    r=np.linalg.norm(P,axis=-1); wall=(kind==1)&(r<R2-0.008)
    if wall.any():
        e=0.02; pw=P[wall]
        g=np.zeros_like(pw)
        for k in (1,2):
            dp=np.zeros(3); dp[k]=e
            g[:,k]=inshell(pw-dp).astype(float)-inshell(pw+dp).astype(float)
        g[:,0]=0; g+=n[wall]*0.15
        n[wall]=g/np.maximum(np.linalg.norm(g,axis=-1,keepdims=True),1e-6)
    ndl=np.clip((n*Lo).sum(-1),0,1); H=(Lo+V); H/=np.linalg.norm(H)
    ndh=np.clip((n*H).sum(-1),0,1); ndv=np.clip((n*V).sum(-1),0,1)
    # occlusion of core by shell (crude AO): sample along normal
    ao=np.ones((N,N))
    m2=kind==2
    for k in range(1,5):
        q=P[m2]+n[m2]*(T*0.35*k)
        ao[m2]-=0.13*inshell(q)
    mint=np.array([0.55,0.86,0.74]); glass=np.array([0.05,0.15,0.18])
    col1=mint*(0.30+0.70*ndl)[...,None]+0.25*(ndh**18)[...,None]+0.08*((1-ndv)**3)[...,None]*np.array([.8,1,1])
    fr=(1-ndv)**4
    col2=glass*(0.45+0.6*ndl)[...,None]*ao[...,None]+0.35*(ndh**140)[...,None]+0.12*fr[...,None]*np.array([.5,.9,.85])
    # eyes
    glow=np.zeros((N,N))
    for e in eyes:
        dd=np.linalg.norm(n-e,axis=-1)
        glow=np.maximum(glow,np.clip(1-dd/0.06,0,1)**0.35*1.0)
        halo=np.exp(-(dd/0.12)**2)*0.35
        glow=np.maximum(glow,halo)
    col2=col2*(1-glow[...,None])+glow[...,None]*np.array([0.62,1.0,0.86])
    img[kind==1]=col1[kind==1]; img[kind==2]=col2[kind==2]
    alpha=(kind>0).astype(float)
    return np.clip(img,0,1),alpha
BG=np.array([0.88,0.885,0.89])
views=[(0,'FRENTE 0°'),(-45,'TRÊS QUARTOS 45°'),(-90,'PERFIL 90°'),(180,'TRASEIRA 180°')]
SS=2; cellW=N; H=N+110
sheet=Image.new('RGB',(cellW*4,H+120),tuple((BG*255).astype(int)))
dr=ImageDraw.Draw(sheet)
try: F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',26); Fs=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
except: F=Fs=ImageFont.load_default()
dr.text((30,30),'GRANABÔ — PRANCHA DE CONSTRUÇÃO',fill=(30,50,60),font=F)
dr.text((30,66),'Esfera única Ø = 1,00 · carcaça 0,13 · núcleo de vidro sólido · câmera ortográfica, mesma escala',fill=(80,95,100),font=Fs)
top=120; ground=top+N-30; oy=20
for i,(deg,lab) in enumerate(views):
    img,al=render(deg)
    # shadow
    sh=Image.new('L',(cellW,H),0); sd=ImageDraw.Draw(sh)
    cx=cellW//2; gy=oy+int(N*(0.5+1/(2*S)))+28; sd.ellipse([cx-150,gy-12,cx+150,gy+12],fill=110)
    sh=sh.filter(ImageFilter.GaussianBlur(14))
    base=np.ones((H,cellW,3))*BG
    s=np.array(sh)/255.
    base*=(1-0.45*s)[...,None]
    oy=20
    base[oy:oy+N,:][...]=base[oy:oy+N,:]*(1-al[...,None])+img*al[...,None]
    tile=Image.fromarray((base*255).astype(np.uint8))
    sheet.paste(tile,(i*cellW,0+0),None) if False else sheet.paste(tile.crop((0,0,cellW,H)),(i*cellW,top-10))
    dr.text((i*cellW+cellW//2,top+H-40),lab,fill=(30,50,60),font=F,anchor='mm')
# guides
for yy in [top-10+oy+int(N*(0.5-1/(2*S))) , top-10+oy+N//2, top-10+oy+int(N*(0.5+1/(2*S)))]:
    for x in range(0,cellW*4,14): dr.line([x,yy,x+6,yy],fill=(150,160,165))
sheet.save(D+'granabo-prancha.png'); print('saved')
