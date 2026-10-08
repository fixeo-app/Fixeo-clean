"""Deterministic framing of the existing RAFI MASTER pixels; no material regeneration.
Android adaptive assets use a 108-unit canvas and 72-unit visible mask. The
sphere occupies 62% of that visible width; iOS occupies 62% of its full canvas.
The canonical master-loop files are never modified.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np
import hashlib, json
root=Path(__file__).resolve().parents[2]
source=root/'assets/rafi/master-loop-v1/rafi-launcher.png'
out=root/'assets/rafi/launcher-pb1';out.mkdir(exist_ok=True)
base=Image.open(source).convert('RGBA');arr=np.array(base);y,x=np.nonzero(arr[:,:,3]>=250)
bounds=(int(x.min()),int(y.min()),int(x.max()+1),int(y.max()+1))
cx=(bounds[0]+bounds[2])/2;cy=(bounds[1]+bounds[3])/2;core_width=bounds[2]-bounds[0]
ivory=(247,247,245,255);report={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'material_changed':False,'target_visible_width_ratio':.62,'variants':{}}
frames={}
for name,visible in [('android',1024*72/108),('ios',1024)]:
 scale=visible*.62/core_width
 # Transform the complete premultiplied RGBA source, including its own subtle halo.
 size=round(base.width*scale);resized=base.convert('RGBa').resize((size,size),Image.Resampling.LANCZOS).convert('RGBA')
 layer=Image.new('RGBA',(1024,1024));layer.alpha_composite(resized,(round(512-cx*scale),round(512-cy*scale)))
 pixels=np.array(layer);yy,xx=np.nonzero(pixels[:,:,3]>=250)
 visual=(xx.max()-xx.min()+1)/visible
 assert .60<=visual<=.65
 if name=='android':
  # Entire nonzero halo fits the circular 72dp viewport; OEM masks no tighter than safe zone.
  hy,hx=np.nonzero(pixels[:,:,3]>0);radius=np.hypot(hx-511.5,hy-511.5).max()
  assert radius<1024*33/108, ('halo exceeds Android 66dp safe circle',radius)
  layer.save(out/'adaptive-foreground.png')
 canvas=Image.new('RGBA',(1024,1024),ivory);canvas.alpha_composite(layer)
 if name=='ios':canvas.convert('RGB').save(out/'icon.png')
 frames[name]=canvas
 report['variants'][name]={'sphere_visible_width_ratio':round(visual,4),'core_bounds':[int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)],'core_center_error_px':[round((xx.min()+xx.max()+1)/2-512,2),round((yy.min()+yy.max()+1)/2-512,2)]}
# Local asset inspection plate, not a Web Preview or a device screenshot.
plate=Image.new('RGB',(960,300),'#E9E8E3');d=ImageDraw.Draw(plate)
android=frames['android'].crop((171,171,853,853)).resize((224,224),Image.Resampling.LANCZOS)
for i,shape in enumerate(['circle','squircle','rounded','ios']):
 tile=android if i<3 else frames['ios'].resize((224,224),Image.Resampling.LANCZOS)
 mask=Image.new('L',(224,224));m=ImageDraw.Draw(mask)
 if shape=='circle':m.ellipse((0,0,223,223),fill=255)
 elif shape=='squircle':
  yy,xx=np.mgrid[:224,:224];v=(((xx-111.5)/111.5)**4+((yy-111.5)/111.5)**4<=1);mask=Image.fromarray((v*255).astype('uint8'))
 else:m.rounded_rectangle((0,0,223,223),radius=46,fill=255)
 plate.paste(tile.convert('RGB'),(i*240+8,20),mask);d.text((i*240+16,258),shape,fill='#252525')
plate.save(out/'mask-inspection.png')
(out/'manifest.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
