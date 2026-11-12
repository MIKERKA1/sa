"""Current hair/ear textures. Generate current face.png first; writes v12 only."""
from pathlib import Path
from PIL import Image, ImageFilter, ImageStat
import json, math, struct

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/characters/viktoria/v12'
ref=Image.open(OUT/'ref/concept_gemini.png').convert('RGB')
skin=Image.open(OUT/'face.png').convert('RGB')
def sample(image,px,py):
    px=max(0,min(image.width-2,px));py=max(0,min(image.height-2,py))
    x=int(px);y=int(py);fx=px-x;fy=py-y
    return tuple(sum(image.getpixel((x+dx,y+dy))[k]*wx*wy for dx,wx in [(0,1-fx),(1,fx)] for dy,wy in [(0,1-fy),(1,fy)]) for k in range(3))
def skin_color(x,y,z):
    return sample(skin,(.5+math.atan2(x,z)/(2*math.pi))*skin.width-.5,(1-(y-1.275)/.310)*skin.height-.5)
def smooth(a,b,t):
    t=max(0,min(1,(t-a)/(b-a)));return t*t*(3-2*t)
# Ear portrait in the right-hand close-up. UV axes: forward->back, lobe->helix.
ear=ref.crop((1344,180,1415,278)).resize((256,352),Image.Resampling.LANCZOS)
light=ear.convert('L').filter(ImageFilter.GaussianBlur(14))
mean=ImageStat.Stat(light).mean[0]
result=[]
pixels=lambda im: im.get_flattened_data() if hasattr(im,'get_flattened_data') else im.getdata()
for i,(rgb,lum) in enumerate(zip(pixels(ear),pixels(light))):
    gain=(mean/max(20,lum))**.48*1.08
    px=1344+(i%ear.width+.5)/ear.width*71;py=180+(i//ear.width+.5)/ear.height*98
    y=1.4475-(py-198)*.0007;z=.0605-(px-1256.7)*.0007
    # Match only the buried anterior root; keep the concha and free rim from the portrait.
    blend=(1-smooth(1363,1375,px))*smooth(1.404,1.412,y)*(1-smooth(1.440,1.451,y))
    c=skin_color(.073,y,z) if blend else rgb
    result.append(tuple(max(0,min(255,round(v*gain*(1-blend)+c[k]*blend))) for k,v in enumerate(rgb)))
ear.putdata(result);ear.save(OUT/'ear.png')
Image.new('RGBA',ear.size,(128,128,255,38)).save(OUT/'ear_normal.png')
# Narrow, longitudinal strands rather than broad stripes in each swept lock.
w=512;im=Image.new('RGB',(w,w));normal=Image.new('RGBA',(w,w));p=im.load();n=normal.load()
for y in range(w):
    for x in range(w):
        t=x/w+.008*math.sin(y/w*math.pi*2)
        v=.52+.12*math.sin(t*math.pi*2*31)+.07*math.sin(t*math.pi*2*83)+.045*math.sin(t*math.pi*2*157)
        p[x,y]=tuple(round(a+b*v) for a,b in [(50,37),(36,28),(27,20)])
        n[x,y]=(round(128+7*math.sin(t*math.pi*2*83)),128,255,22)
im.save(OUT/'hair.png');normal.save(OUT/'hair_normal.png')
meta=json.loads((OUT/'textures.json').read_text(encoding='utf8'))
meta['materials']['ear']={'albedo':'ear.png','nmap':'ear_normal.png','roughness':.88,'crop':[1344,180,1415,278]}
coords=OUT/'hair-projection.f32'
if coords.exists():
    assert coords.stat().st_size==512*512*3*4, 'Regenerate the current hair projection before texturing'
    scalp=Image.new('RGB',(512,512));colors=[]
    for i,(x,y,z) in enumerate(struct.iter_unpack('<fff',coords.read_bytes())):
        a=math.atan2(x,z+.004);cy=198+(1.4475-y)/.0007
        f=sample(ref,1043.7+x/.0007,cy);s=sample(ref,1256.7-(z-.0605)/.0007,cy)
        t=max(0,min(1,(abs(a)-.4)/.85));t=t*t*(3-2*t)
        back=max(0,min(1,(abs(a)-1.85)/.35))
        blend=(1-smooth(0,.018,1-(i//512+.5)/512))*smooth(1.1,1.4,abs(a))*(1-smooth(2.1,2.4,abs(a)))
        c=skin_color(x,y,z) if blend else f
        colors.append(tuple(max(0,min(255,round((((1-t)*f[k]+t*s[k])*(1-back)*1.08+back*[65,47,34][k])*(1-blend)+c[k]*blend)))for k in range(3)))
    scalp.putdata(colors);scalp.save(OUT/'hair_scalp.png')
    # The shared renderer stores gloss in normal alpha; RGB implied alpha=1
    # and made hair glint like polished plastic despite its roughness value.
    Image.new('RGBA',(512,512),(128,128,255,20)).save(OUT/'hair_scalp_normal.png')
    meta['materials']['hair-scalp']={'albedo':'hair_scalp.png','nmap':'hair_scalp_normal.png','roughness':.94}
(OUT/'textures.json').write_text(json.dumps(meta,indent=2),encoding='utf8')
print('v12 ear and swept hair textures written')
