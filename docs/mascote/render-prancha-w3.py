import sys; sys.path.insert(0,'.')
exec(open('comparar.py').read().split('N=520')[0])
V=L3
F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',26); Fs=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
N=520; S=1.25; BG=np.array([0.88,0.885,0.89]); H=N+110
views=[(0,'FRENTE 0°'),(-45,'TRÊS QUARTOS 45°'),(-90,'PERFIL 90°'),(180,'TRASEIRA 180°')]
sheet=Image.new('RGB',(N*4,H+130),tuple((BG*255).astype(int))); dr=ImageDraw.Draw(sheet)
dr.text((30,30),'GRANABÔ — PRANCHA DE CONSTRUÇÃO (W3 · BOCA L3)',fill=(30,50,60),font=F)
dr.text((30,66),'Esfera única Ø = 1,00 · carcaça em G, 0,13, bordas arredondadas · núcleo de vidro sólido · câmera ortográfica, mesma escala',fill=(80,95,100),font=Fs)
oy=20
for i,(deg,lab) in enumerate(views):
    img,al=render(V,deg=deg)
    sh=Image.new('L',(N,H),0); sd=ImageDraw.Draw(sh); gy=oy+int(N*(0.5+1/(2*S)))+28
    sd.ellipse([N//2-150,gy-12,N//2+150,gy+12],fill=110); s_=np.array(sh.filter(ImageFilter.GaussianBlur(14)))/255.
    b=np.ones((H,N,3))*BG*(1-0.45*s_)[...,None]; b[oy:oy+N]=b[oy:oy+N]*(1-al[...,None])+img*al[...,None]
    sheet.paste(Image.fromarray((b*255).astype(np.uint8)),(i*N,120))
    dr.text((i*N+N//2,120+H-40),lab,fill=(30,50,60),font=F,anchor='mm')
for yy in [120+oy+int(N*(0.5-1/(2*S))),120+oy+N//2,120+oy+int(N*(0.5+1/(2*S)))]:
    for x in range(0,N*4,14): dr.line([x,yy,x+6,yy],fill=(150,160,165))
sheet.save('granabo-prancha-w3.png'); print('ok')
