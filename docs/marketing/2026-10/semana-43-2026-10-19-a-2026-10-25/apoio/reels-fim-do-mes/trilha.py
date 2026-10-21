import numpy as np, wave, sys
estilo="pop-fim-do-mes"; SR=48000; DUR=float(sys.argv[1])
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
# Trilha própria do Reels "Fim do mês" (21/10/2026): mesma pegada pop escolhida pelo autor em 25/09,
# outra música: 122 bpm, Lá menor, Fá, Dó, Sol, pluck sincopado e melodia nova a partir do 2º compasso.
BPM=122; B=60/BPM
prog=[(45,[57,60,64,69]),(41,[57,60,65,69]),(48,[55,60,64,67]),(43,[55,59,62,67])]
bars=int(DUR/(4*B))+1
for b in range(bars):
    t0=b*4*B; r,ch=prog[b%4]
    for k in (0,1.5,2.5,3.5):
        for j,m in enumerate(ch): add(ks(m,B*0.9,0.45,0.993),t0+k*B+j*0.008,pan=(j-1.5)*0.12,g=0.13)
    add(sub(r,B*1.8),t0,g=0.5); add(sub(r,B*1.2),t0+2*B,g=0.42)
    for k in range(4): add(kick(),t0+k*B,g=0.42)
    if b>=1: add(clap(),t0+B,g=0.28); add(clap(),t0+3*B,g=0.28)
    for k in range(8): add(noise(0.03,120),t0+k*B/2+B/4,pan=-0.35,g=0.07)
    if b>=1:
        mel=[(0,ch[3]+12),(0.75,ch[2]+12),(1.5,ch[3]+12),(2,ch[3]+14),(3,ch[2]+12)] if b%2==0 else [(0,ch[2]+12),(1,ch[1]+12),(2,ch[2]+12),(2.5,ch[3]+12)]
        for tt,m in mel: add(piano(m,0.5),t0+tt*B,pan=0.25,g=0.11)
mx=max(abs(L).max(),abs(R).max()); L/=mx*1.12; R/=mx*1.12
fade=np.ones(N); fi=int(SR*0.6); fade[:fi]=np.linspace(0,1,fi)
st=int(SR*(DUR-2.6)); fade[st:]=np.linspace(1,0,N-st)**1.5
L*=fade; R*=fade
data=(np.stack([L,R],1)*32767).astype('<i2')
w=wave.open(sys.argv[2],'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data.tobytes()); w.close()
print('trilha ok')
