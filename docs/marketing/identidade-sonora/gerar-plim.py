import numpy as np, wave
SR=48000
def f(m): return 440*2**((m-69)/12)
def marimba(m,dur=0.6):
    t=np.arange(int(SR*dur))/SR; fr=f(m)
    s=np.sin(2*np.pi*fr*t)*np.exp(-t*7)+0.35*np.sin(2*np.pi*fr*4*t)*np.exp(-t*25)+0.15*np.sin(2*np.pi*fr*10*t)*np.exp(-t*60)
    return s*np.minimum(1,t/0.002)
def bell(m,dur=1.2):
    t=np.arange(int(SR*dur))/SR; fr=f(m)
    mod=2.0*np.exp(-t*5)*np.sin(2*np.pi*fr*3.5*t)
    return np.sin(2*np.pi*fr*t+mod)*np.exp(-t*3.2)*np.minimum(1,t/0.002)
def soft(m,dur=0.5):
    t=np.arange(int(SR*dur))/SR; fr=f(m)
    return (np.sin(2*np.pi*fr*t)+0.2*np.sin(4*np.pi*fr*t))*np.exp(-t*9)*np.minimum(1,t/0.004)
def mix(parts,total):
    out=np.zeros(int(SR*total))
    for sig,t,g in parts:
        i=int(t*SR); j=min(len(out),i+len(sig)); out[i:j]+=sig[:j-i]*g
    return out
sons={
 'duplo': mix([(marimba(88),0,1),(marimba(95),0.11,0.9)],1.0),          # E6 -> B6
 'sino':  mix([(bell(93),0,1),(bell(100),0.0,0.25)],1.3),                 # A6 com brilho
 'sucesso': mix([(soft(84),0,0.8),(soft(88),0.07,0.8),(soft(91),0.14,0.9),(soft(96),0.21,0.7)],0.9),  # C6 E6 G6 C7
}
for n,s in sons.items():  # o escolhido pelo autor em 25/09/2026 é 'sucesso'
    s=s/np.abs(s).max()*0.7
    st=np.stack([s,s],1)
    d=(st*32767).astype('<i2')
    w=wave.open(f'plim-{n}.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(d.tobytes()); w.close()
    print(n)
