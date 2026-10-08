# trilha "house" 128 bpm, com subida até o drop em 1,875 s e pausa + batida no logo
import numpy as np, wave
SR=48000; BPM=100; B=60/BPM; DUR=16.8; DROP=4*B; LOGO=22*B
N=int(SR*DUR); L=np.zeros(N); R=np.zeros(N); rng=np.random.default_rng(3)
def f(m): return 440*2**((m-69)/12)
def add(sig,t,pan=0,g=1):
    i=int(t*SR)
    if i>=N or i<0: return
    j=min(N,i+len(sig)); s=sig[:j-i]*g; L[i:j]+=s*(1-pan); R[i:j]+=s*(1+pan)
def kick():
    t=np.arange(int(SR*.32))/SR; fr=48+110*np.exp(-t*32)
    return np.tanh(1.6*np.sin(2*np.pi*np.cumsum(fr)/SR)*np.exp(-t*9))
def hat(open_=False):
    n=int(SR*(.16 if open_ else .05)); x=np.diff(rng.uniform(-1,1,n),prepend=0); x=np.diff(x,prepend=0)
    return x*np.exp(-np.arange(n)/SR*(18 if open_ else 80))
def clap():
    s=np.zeros(int(SR*.18))
    for d in (0,.009,.018):
        n=int(SR*.18); x=np.diff(rng.uniform(-1,1,n),prepend=0)*np.exp(-np.arange(n)/SR*28); i=int(d*SR); s[i:]+=x[:len(s)-i]
    return s
def saw(fr,dur,cut=1.0):
    t=np.arange(int(SR*dur))/SR; s=np.zeros_like(t)
    for d in (-0.08,0,0.08):
        ph=(t*fr*2**(d/12))%1; s+=2*ph-1
    s/=3; a=np.exp(-t*(7/cut)); return s*a*np.minimum(1,t/0.004)
def bass(fr,dur):
    t=np.arange(int(SR*dur))/SR; return (np.sin(2*np.pi*fr*t)+.35*np.sign(np.sin(2*np.pi*fr*t))*.3)*np.minimum(1,t/.005)*np.exp(-t*3)
prog=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]]  # Am F C G (ré-menor... energia pop)
roots=[45,41,36,43]
# subida (riser) antes do drop
n=int(SR*DROP); t=np.arange(n)/SR; nz=rng.uniform(-1,1,n); nz=np.convolve(nz,np.ones(6)/6,'same')
add(nz*(t/DROP)**2*.5,0,g=.5)
sw=np.sin(2*np.pi*np.cumsum(200+1400*(t/DROP)**2)/SR)*(t/DROP)**2*.25; add(sw,0,g=.6)
for k in range(8): add(clap()*(k/8),DROP-B*2+k*B/4,g=.35)   # rufada
# groove depois do drop, até o logo
beats=int((DUR-DROP)/B)+1
for i in range(beats):
    tb=DROP+i*B
    if tb>=LOGO-B*0.02 and tb<LOGO+B*2-0.01: continue  # respiro no logo
    add(kick(),tb,g=.9)
    add(hat(True),tb+B/2,pan=.3,g=.22)
    add(hat(),tb+B/4,pan=-.3,g=.1); add(hat(),tb+3*B/4,pan=-.3,g=.1)
    if i%2==1: add(clap(),tb,pan=-.1,g=.35)
    bar=(i//4)%4
    for k,m in enumerate(prog[bar]): add(saw(f(m+12),B*.45,.8),tb+B/2,pan=(k-1)*.3,g=.13)
    add(bass(f(roots[bar]),B*.4),tb+B/2,g=.45)
# golpe no logo
add(kick()*1.2,LOGO,g=1); add(nz[:int(SR*.8)]*np.exp(-np.arange(int(SR*.8))/SR*4),LOGO,g=.25)
for k,m in enumerate([57,60,64,69]): add(saw(f(m+12),1.6,3),LOGO,pan=(k-1.5)*.25,g=.12)
# duck lateral (bombeamento) simples no groove
env=np.ones(N)
for i in range(beats):
    tb=DROP+i*B; a=int(tb*SR); b=min(N,a+int(SR*B))
    env[a:b]=np.minimum(env[a:b],0.45+0.55*np.minimum(1,(np.arange(b-a)/SR)/(B*.6)))
L*=env; R*=env
mx=max(abs(L).max(),abs(R).max()); L/=mx*1.1; R/=mx*1.1
fo=int(SR*(DUR-1.0)); fade=np.ones(N); fade[fo:]=np.linspace(1,0,N-fo); L*=fade; R*=fade
d=(np.stack([L,R],1)*32767).astype('<i2')
w=wave.open('musica-house-r5-100.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(d.tobytes()); w.close()
print('ok', 'drop',DROP,'logo',LOGO)
