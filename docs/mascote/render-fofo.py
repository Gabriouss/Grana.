import numpy as np, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
D='/tmp/claude-0/-home-user-Grana-/9370b940-4925-51a0-ac92-ff52a48d29da/'
im=np.array(Image.open(D+'images/2.png').convert('RGBA')).astype(float)
dark=(im[...,3]>128)&(im[...,:3].mean(-1)<160)
ys,xs=np.where(dark); M0=dark[ys.min():ys.max()+1,xs.min():xs.max()+1]; MH,MW=M0.shape
R2=1.0; T=0.13; R1=R2-T
# band center in mask rows at right edge
col=M0[:,int(MW*0.97)]; gaprows=np.where(~col[int(MH*.2):int(MH*.6)])[0]+int(MH*.2)
BC=(gaprows.min()+gaprows.max())/2
def build(widen,blur):
    M=M0
    if widen:
        vv,uu=np.mgrid[0:MH,0:MW].astype(float); cx,cy=(MW-1)/2,(MH-1)/2
        phi=np.degrees(np.arctan2(-(vv-cy),uu-cx)); rho=np.hypot(uu-cx,vv-cy)
        w=np.clip((80-phi)/40,0,1)*(vv<192)*(uu>cx)
        ps=np.radians(phi-widen*w)
        su=np.clip(np.round(cx+rho*np.cos(ps)),0,MW-1).astype(int); sv=np.clip(np.round(cy-rho*np.sin(ps)),0,MH-1).astype(int)
        src=M0[sv,su]&(sv<150)
        M=np.where(w>0,src,M0)
    B=np.array(Image.fromarray((M*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur)))/255. if blur else M.astype(float)
    return B
def lookup(B,z,y):
    u=np.clip(((z/R2+1)/2*(MW-1)),0,MW-1); v=np.clip(((1-(y/R2+1)/2)*(MH-1)),0,MH-1)
    u0=np.floor(u).astype(int); v0=np.floor(v).astype(int); u1=np.minimum(u0+1,MW-1); v1=np.minimum(v0+1,MH-1)
    fu=u-u0; fv=v-v0
    return (B[v0,u0]*(1-fu)+B[v0,u1]*fu)*(1-fv)+(B[v1,u0]*(1-fu)+B[v1,u1]*fu)*fv
def outer(B,p,round_):
    b=lookup(B,p[...,2],p[...,1])
    if not round_: return np.where(b>0.5,R2,-1.0)
    s=np.clip((b-0.5)/0.5,0,1)*1.0
    s=np.clip(s*1.6,0,1); h=np.sqrt(np.clip(1-(1-s)**2,0,1))
    return np.where(b>0.5,R1+T*(0.15+0.85*h),-1.0)
def render(V,N=520,S=1.25,deg=0):
    B=build(V['widen'],V['blur'])
    a=np.radians(deg); c,s_=np.cos(a),np.sin(a); Rot=np.array([[c,0,s_],[0,1,0],[-s_,0,c]])
    xs=np.linspace(-S,S,N); X,Y=np.meshgrid(xs,-xs)
    o=np.stack([X,Y,np.full_like(X,3)],-1)@Rot.T; d=np.array([0,0,-1.])@Rot.T
    L=np.array([-0.5,0.7,0.6]); L/=np.linalg.norm(L); Lo=L@Rot.T; Vv=-d
    b=(o*d).sum(-1); disc=b*b-((o*o).sum(-1)-R2**2); hit=disc>0
    t=np.where(hit,-b-np.sqrt(np.maximum(disc,0)),0); tex=np.where(hit,-b+np.sqrt(np.maximum(disc,0)),0)
    done=~hit; kind=np.zeros((N,N),int); P=np.zeros((N,N,3))
    for i in range(500):
        idx=~done
        if not idx.any(): break
        p=o[idx]+t[idx,None]*d; r=np.linalg.norm(p,axis=-1)
        sh=(r>=R1)&(r<=outer(B,p,V['round'])); co=r<=R1
        k=np.where(sh,1,np.where(co,2,0)); sub=kind[idx]; sub[k>0]=k[k>0]; kind[idx]=sub
        PP=P[idx]; PP[k>0]=p[k>0]; P[idx]=PP
        dd=done[idx]; dd|=(k>0)|(t[idx]>tex[idx]); done[idx]=dd
        t[idx]+=0.004
    n=P/np.maximum(np.linalg.norm(P,axis=-1,keepdims=True),1e-6)
    m=kind==1
    if m.any() and V["round"]:
        p=P[m]; e=0.006
        def f(q): return np.linalg.norm(q,axis=-1)-np.maximum(outer(B,q,V['round']),R1-0.05)
        g=np.zeros_like(p)
        for k in range(3):
            dp=np.zeros(3); dp[k]=e; g[:,k]=f(p+dp)-f(p-dp)
        r=np.linalg.norm(p,axis=-1); inner=r<R1+0.01
        g[inner]=-p[inner]  # underside unlikely visible
        nn=g/np.maximum(np.linalg.norm(g,axis=-1,keepdims=True),1e-6)
        # clamp crazy normals on flat walls
        n[m]=nn
    ndl=np.clip((n*Lo).sum(-1),0,1); H=Lo+Vv; H/=np.linalg.norm(H)
    ndh=np.clip((n*H).sum(-1),0,1); ndv=np.clip((n*Vv).sum(-1),0,1)
    ao=np.ones((N,N)); m2=kind==2
    for k in range(1,5):
        q=P[m2]+n[m2]*(T*0.35*k); r=np.linalg.norm(q,axis=-1)
        ao[m2]-=0.12*((r>=R1)&(r<=outer(B,q,V['round'])))
    mint=np.array(V['mint']); glass=np.array([0.05,0.15,0.18])
    amb=V.get('amb',0.30)
    c1=mint*(amb+(1-amb)*ndl)[...,None]+V['spec']*(ndh**12)[...,None]+0.10*((1-ndv)**3)[...,None]
    c2=glass*(0.45+0.6*ndl)[...,None]*ao[...,None]+0.3*(ndh**140)[...,None]+0.12*((1-ndv)**4)[...,None]*np.array([.5,.9,.85])
    # eyes in angular coords
    lon=np.arctan2(n[...,0],n[...,2]); lat=np.arcsin(np.clip(n[...,1],-1,1))
    ey=V['eye_y']; glow=np.zeros((N,N)); white=np.zeros((N,N))
    for sx in (-1,1):
        dx=(lon-sx*V['eye_x']); dy=(lat-ey)
        if V['shape']=='dot':
            q=np.hypot(dx,dy)/V['eye_w']
            core=np.clip((1-q)/0.25,0,1)
        elif V['shape']=='oval':
            q=np.hypot(dx/V['eye_w'],dy/V['eye_h']); core=np.clip((1-q)/0.12,0,1)
            cl=np.hypot((dx+0.35*V['eye_w'])/(0.32*V['eye_w']),(dy-0.4*V['eye_h'])/(0.32*V['eye_w'])); white=np.maximum(white,np.clip((1-cl)/0.25,0,1))
        else:  # happy arc
            rr=np.hypot(dx/V['eye_w'],(dy+0.45*V['eye_h'])/V['eye_h']); band=np.abs(rr-1)
            core=np.clip((0.22-band)/0.06,0,1)*(dy>-0.45*V['eye_h'])
            q=rr
        halo=np.exp(-(np.maximum(q-1,0)/0.5)**2)*0.30 if V['shape']!='happy' else np.exp(-(band/0.3)**2)*0.25*(dy>-0.5*V['eye_h'])
        glow=np.maximum(glow,np.maximum(core,halo))
    mo=V.get('mouth')
    mouthc=np.zeros((N,N)); mouths=np.zeros((N,N))
    if mo:
        cy,w,hh,th=mo['y'],mo['w'],mo['h'],mo['t']
        dx=lon; dy=lat-cy
        rr=np.hypot(dx/w,(dy-hh)/hh); arc=np.clip((th-np.abs(rr-1))/0.04,0,1)*(dy<hh*0.8)
        if mo['on']=='core': mouthc=arc
        else:
            pn=P/np.maximum(np.linalg.norm(P,axis=-1,keepdims=True),1e-6)
            lon2=np.arctan2(pn[...,0],pn[...,2]); lat2=np.arcsin(np.clip(pn[...,1],-1,1))
            dx=lon2; dy=lat2-cy; k=mo.get('kind','arc'); sm=0.012
            if k=='arc':
                rr2=np.hypot(dx/w,(dy-hh)/hh); mouths=np.clip((th-np.abs(rr2-1))/0.04,0,1)*(dy<hh*0.8)
            elif k=='u':
                rr2=np.hypot(dx/w,(dy-hh)/hh); band=np.abs(rr2-1)*hh
                mouths=np.clip((th-band)/sm,0,1)*(dy<hh*0.9)
                # round caps
                for sx in (-1,1):
                    a=np.radians(-35); cxp=sx*w*0.82; cyp=hh-hh*0.57
                    mouths=np.maximum(mouths,np.clip((th-np.hypot(dx-cxp,dy-cyp))/sm,0,1)*0)
            elif k=='smile':
                r_=mo['r']; a_=np.radians(mo['a']); qx=dx; qy=dy-r_   # circle center above
                ang=np.arctan2(qx,-qy)
                d_arc=np.abs(np.hypot(qx,qy)-r_)
                ex=r_*np.sin(a_); ey=-r_*np.cos(a_)
                d_cap=np.minimum(np.hypot(qx-ex,qy-ey),np.hypot(qx+ex,qy-ey))
                dist=np.where(np.abs(ang)<=a_,d_arc,d_cap)
                mouths=np.clip((th-dist)/0.006,0,1)
            elif k=='open':
                q=np.hypot(dx/w,dy/hh); mouths=np.clip((1-q)*hh/sm,0,1)*np.clip(-dy/sm,0,1)
                # rounded top corners
            elif k=='w':
                m_=np.zeros_like(dx)
                for sx in (-1,1):
                    rr2=np.hypot((dx-sx*w/2)/(w/2),(dy-hh)/hh); m_=np.maximum(m_,np.clip((th-np.abs(rr2-1)*hh)/sm,0,1)*(dy<hh))
                mouths=m_
            mouths*=(pn[...,2]>0)
            mf=mo.get('fill','dark')
    glow=np.maximum(glow,mouthc)
    glow*=m2; white*=m2
    ec=np.array([0.62,1.0,0.86])
    c2=c2*(1-glow[...,None])+glow[...,None]*ec
    c2=c2*(1-white[...,None])+white[...,None]*np.array([1,1,1])
    if mo and mo['on']=='shell':
        mc=np.array([0.05,0.15,0.18])*(0.6+0.5*ndl)[...,None] if mo.get('fill','dark')=='dark' else np.array([0.62,1.0,0.86])[None,None,:]*np.ones((N,N,1))
        if mo.get('tongue'):
            tq=np.clip((0.55-np.hypot(lon2/(w*0.55),(lat2-cy+hh*0.85)/(hh*0.45)))/0.08,0,1)
            mc=mc*(1-tq[...,None])+tq[...,None]*np.array([0.45,0.80,0.68])*(0.7+0.3*ndl)[...,None]
        c1=c1*(1-mouths[...,None])+mouths[...,None]*mc
    img=np.zeros((N,N,3)); img[m]=c1[m]; img[m2]=c2[m2]
    return np.clip(img,0,1),(kind>0).astype(float)
