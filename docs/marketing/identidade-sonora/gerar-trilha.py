import numpy as np, wave, sys
estilo=sys.argv[1]; SR=48000; DUR=25.2
N=int(SR*DUR); L=np.zeros(N); R=np.zeros(N)
rng=np.random.default_rng(11)
def f(m): return 440*2**((m-69)/12)
def add(sig,t,pan=0.0,g=1.0):
    i=int(t*SR)
    if i>=N or i<0: return
    j=min(N,i+len(sig)); s=sig[:j-i]*g
    L[i:j]+=s*(1-pan); R[i:j]+=s*(1+pan)
def lp(x,a):  # one-pole lowpass
    y=np.empty_like(x); acc=0.0
    for k in range(len(x)): acc+=a*(x[k]-acc); y[k]=acc
    return y
def ks(m,dur,damp=0.5,decay=0.996):
    n=int(SR*dur); p=int(SR/f(m)); buf=lp(rng.uniform(-1,1,p),0.6)
    out=np.zeros(n); idx=0
    for k in range(n):
        a=buf[idx]; b=buf[(idx+1)%p]; out[k]=a
        buf[idx]=decay*(damp*a+(1-damp)*b); idx=(idx+1)%p
    return out*np.linspace(1,0,n)**0.7
def rhodes(m,dur):
    t=np.arange(int(SR*dur))/SR; fr=f(m)
    mod=np.sin(2*np.pi*fr*t)*1.2*np.exp(-t*6)
    s=np.sin(2*np.pi*fr*t+mod)*np.exp(-t*1.2)
    s*=1+0.15*np.sin(2*np.pi*4.5*t)  # tremolo
    return s*np.minimum(1,t/0.005)*np.minimum(1,(dur-t)/0.08)
def piano(m,dur):
    t=np.arange(int(SR*dur))/SR; fr=f(m)
    s=sum(np.sin(2*np.pi*fr*h*t)*np.exp(-t*(1.5+h*1.2))/h for h in range(1,6))
    return s*np.minimum(1,t/0.003)*np.minimum(1,(dur-t)/0.05)
def sub(m,dur):
    t=np.arange(int(SR*dur))/SR; fr=f(m)
    return (np.sin(2*np.pi*fr*t)+0.2*np.sin(4*np.pi*fr*t))*np.minimum(1,t/0.01)*np.exp(-t*1.8)
def noise(dur,decay,hp=True):
    n=int(SR*dur); x=rng.uniform(-1,1,n)
    if hp: x=np.diff(x,prepend=0)
    return x*np.exp(-np.arange(n)/SR*decay)
def kick(soft=1.0):
    t=np.arange(int(SR*0.3))/SR; fr=45+70*np.exp(-t*25)
    return np.sin(2*np.pi*np.cumsum(fr)/SR)*np.exp(-t*10)
def clap():
    s=np.zeros(int(SR*0.18))
    for d in (0,0.008,0.017):
        x=noise(0.18,30); i=int(d*SR); s[i:]+=x[:len(s)-i]
    return lp(s,0.5)
def brush(dur):
    n=int(SR*dur); x=lp(rng.uniform(-1,1,n),0.35); t=np.arange(n)/SR
    return x*np.sin(np.pi*t/dur)
if estilo=='lofi':
    BPM=84; B=60/BPM; SW=0.08
    prog=[(41,[53,57,60,64]),(43,[55,59,62,65]),(40,[52,55,59,62]),(45,[57,60,64,67])]  # Fmaj7 G7 Em7 Am7
    bars=int(DUR/(4*B))+1
    for b in range(bars):
        t0=b*4*B; r,ch=prog[b%4]
        for k,m in enumerate(ch): add(rhodes(m,4*B*0.95),t0+k*0.012,pan=(k-1.5)*0.15,g=0.28)
        add(sub(r,2*B),t0,g=0.55); add(sub(r+7 if b%2 else r,1.5*B),t0+2.5*B,g=0.4)
        add(kick(),t0,g=0.6); add(kick(),t0+2.5*B,g=0.45)
        add(lp(noise(0.25,18,False),0.3),t0+B,g=0.35); add(lp(noise(0.25,18,False),0.3),t0+3*B,g=0.35)
        for k in range(8): add(noise(0.04,90),t0+k*B/2+(SW if k%2 else 0),pan=0.4,g=0.10 if k%2 else 0.14)
        if b>=1:
            mel=[(0.5,ch[3]+12),(1.5,ch[2]+12),(2,ch[1]+12),(3.5,ch[2]+12)]
            for tt,m in mel: add(piano(m,0.8),t0+tt*B,pan=0.2,g=0.12)
    L+=rng.normal(0,0.004,N); R+=rng.normal(0,0.004,N)  # chiado de vinil
elif estilo=='bossa':
    BPM=128; B=60/BPM
    prog=[(48,[55,59,64,67]),(45,[55,60,64,67]),(50,[57,60,65,69]),(43,[53,59,62,65])]  # Cmaj7 Am7 Dm7 G7
    pat=[0,1.5,2.5,3,4.5,5.5,6.5]  # batida de bossa em colcheias (2 compassos = 8 tempos)
    bars=int(DUR/(4*B))+1
    for b in range(0,bars,2):
        t0=b*4*B
        for half in (0,1):
            r,ch=prog[(b+half)%4]; tb=t0+half*4*B
            add(ks(r-12+12,1.2,0.6),tb,g=0.5); add(ks(r+7-12+12,1.0,0.6),tb+2*B,g=0.45)
        for p in pat:
            r,ch=prog[(b+(1 if p>=4 else 0))%4]
            for k,m in enumerate(ch): add(ks(m,0.6,0.55,0.994),t0+p*B+k*0.01,pan=0.25,g=0.16)
        for k in range(16): add(brush(B*0.45),t0+k*B/2,pan=-0.3,g=0.05 if k%2 else 0.03)
        for k in (0,3,6): add(lp(noise(0.1,40,False),0.2),t0+k*B,pan=-0.2,g=0.10)
elif estilo=='pop':
    BPM=118; B=60/BPM
    prog=[(48,[60,64,67]),(43,[59,62,67]),(45,[60,64,69]),(41,[60,65,69])]  # C G Am F
    bars=int(DUR/(4*B))+1
    for b in range(bars):
        t0=b*4*B; r,ch=prog[b%4]
        for k in range(8):
            if k in (0,3,6,7) or b%2:
                for m in ch: add(piano(m,B*0.45),t0+k*B/2,g=0.10)
        add(sub(r,B*3.5),t0,g=0.45)
        for k in range(4): add(kick(),t0+k*B,g=0.45)
        if b>=1: add(clap(),t0+B,g=0.3); add(clap(),t0+3*B,g=0.3)
        for k in range(8): add(noise(0.03,120),t0+k*B/2+B/4,pan=0.4,g=0.08)
        if b>=2:
            for tt,m in [(0,ch[2]+12),(1,ch[1]+12),(1.5,ch[2]+12),(2.5,ch[0]+12+2),(3,ch[0]+12)]: add(ks(m,0.4,0.3),t0+tt*B,pan=-0.2,g=0.25)
mx=max(abs(L).max(),abs(R).max()); L/=mx*1.12; R/=mx*1.12
fade=np.ones(N); fi=int(SR*0.8); fade[:fi]=np.linspace(0,1,fi)
st=int(SR*22.2); fade[st:]=np.linspace(1,0,N-st)**1.5
L*=fade; R*=fade
data=(np.stack([L,R],1)*32767).astype('<i2')
w=wave.open(f'musica-{estilo}.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data.tobytes()); w.close()
print(estilo,'ok')
