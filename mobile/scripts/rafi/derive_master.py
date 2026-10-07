"""Matte + spatial derivatives only. No temporal interpolation, reordered frames or retiming."""
import cv2, numpy as np, json, hashlib, sys
from PIL import Image
from pathlib import Path
source=Path(sys.argv[1]); out=Path(sys.argv[2]); out.mkdir(parents=True,exist_ok=True)
cap=cv2.VideoCapture(str(source)); fps=cap.get(cv2.CAP_PROP_FPS); n=int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
assert fps==24 and n==217
sizes={'hero':448,'medium':256,'mini':128}; frames={k:[] for k in sizes}; qa=[]
y,x=np.mgrid[:1440,:1440].astype(np.float32); cx,cy=720.,734.; radius=np.hypot(x-cx,y-cy); angle=np.arctan2(y-cy,x-cx)%(2*np.pi)
theta=np.linspace(0,2*np.pi,720,endpoint=False).astype(np.float32)
r=np.arange(420,530,dtype=np.float32)
mx=cx+np.cos(theta)[:,None]*r; my=cy+np.sin(theta)[:,None]*r
basis=np.stack([np.ones(720)]+[f(k*theta) for k in range(1,7) for f in (np.cos,np.sin)],axis=1)
for i in range(n):
 ok,bgr=cap.read(); assert ok
 rgb=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB).astype(np.float32)/255
 gray=cv2.cvtColor(bgr,cv2.COLOR_BGR2GRAY).astype(np.float32)/255
 polar=cv2.remap(gray,mx,my,cv2.INTER_LINEAR)
 # Outer reflective rim: steep falloff, spatially regularized contour. Interior never keyed by colour.
 blurred=cv2.GaussianBlur(polar,(7,1),0)
 edge=-np.gradient(blurred,axis=1)
 rr=r[np.argmax(edge,axis=1)]
 coeff=np.linalg.lstsq(basis,rr,rcond=None)[0]
 residual=rr-basis@coeff
 for _ in range(3):
  weight=1/np.maximum(1,abs(residual)/5)
  coeff=np.linalg.lstsq(basis*weight[:,None],rr*weight,rcond=None)[0];residual=rr-basis@coeff
 contour=coeff[0]+sum(coeff[2*k-1]*np.cos(k*angle)+coeff[2*k]*np.sin(k*angle) for k in range(1,7))
 core=np.clip((contour-radius)/3+.5,0,1); core=core*core*(3-2*core)
 # Fit smooth neutral background far outside silhouette; exclude bright halo samples.
 sampled=rgb[::12,::12]; sx=(x[::12,::12]-720)/720;sy=(y[::12,::12]-720)/720
 mask=(radius[::12,::12]>620)&(sampled.max(2)<.16)
 b=np.stack([np.ones_like(sx),sx,sy,sx*sx,sx*sy,sy*sy],axis=2)
 c=np.linalg.lstsq(b[mask],sampled[mask],rcond=None)[0]
 xx=(x-720)/720; yy=(y-720)/720
 bg=np.clip(c[0]+xx[:,:,None]*c[1]+yy[:,:,None]*c[2]+xx[:,:,None]**2*c[3]+(xx*yy)[:,:,None]*c[4]+yy[:,:,None]**2*c[5],0,.14)
 glow=np.maximum(rgb-bg,0)
 warm=np.clip((glow[:,:,0]-glow[:,:,2])*12,0,1)
 gate=np.clip((650-radius)/90,0,1)
 halo=glow*warm[:,:,None]*gate[:,:,None]*(1-core[:,:,None])
 ha=np.clip(halo.max(2)*1.4,0,1)
 alpha=core+(1-core)*ha
 premul=rgb*core[:,:,None]+halo
 straight=np.divide(premul,np.maximum(alpha[:,:,None],1/255));straight=np.clip(straight,0,1)
 rgba=np.dstack([straight,alpha]); rgba[alpha<1/255]=0
 qa.append({'frame':i,'core_alpha_min':float(alpha[radius<400].min()),'radius_mean':float(contour.mean()),'edge_alpha_max':float(alpha[(x<10)|(x>1429)|(y<10)|(y>1429)].max())})
 for name,size in sizes.items():
  # Premultiplied downsampling avoids dark fringes. MINI retains highlights with a small spatial contrast lift.
  a=cv2.resize(alpha,(size,size),interpolation=cv2.INTER_AREA)
  color=cv2.resize(straight*alpha[:,:,None],(size,size),interpolation=cv2.INTER_AREA)
  color=np.divide(color,np.maximum(a[:,:,None],1/255))
  if name=='mini': color=np.clip(color*1.08,0,1)
  im=Image.fromarray(np.round(np.clip(np.dstack([color,a]),0,1)*255).astype(np.uint8),'RGBA')
  frames[name].append(im)
 if i%40==0: print('matted',i,flush=True)
cap.release()
delays=[round((i+1)*1000/fps)-round(i*1000/fps) for i in range(n)]
for name,images in frames.items():
 images[0].save(out/f'rafi-{name}-poster.png')
 images[0].save(out/f'rafi-{name}.webp',save_all=True,append_images=images[1:],duration=delays,loop=0,quality=92,method=4,lossless=False,minimize_size=False,kmin=24,kmax=48,allow_mixed=True)
 check=Image.open(out/f'rafi-{name}.webp');assert check.n_frames==n
 for j in range(n): check.seek(j);check.load()
 print(name,(out/f'rafi-{name}.webp').stat().st_size,flush=True)
manifest={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source_frames':n,'source_fps':fps,'source_duration_seconds':n/fps,'runtime_duration_ms':sum(delays),'frame_delays_ms':delays,'temporal_changes':False,'loop_count':0,'variants':sizes,'alpha':'straight RGBA; black core opaque, source-derived champagne halo','matte':'radial reflective edge fit, opaque interior, neutral exterior subtraction','qa':qa}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
