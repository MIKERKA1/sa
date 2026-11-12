"""Extract the approved child concept into reproducible local material textures."""
from pathlib import Path
from PIL import Image,ImageOps,ImageFilter
from array import array
import json,hashlib,math

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/characters/caecilia_gabriel/v01'
SOURCE=ROOT/'assets/concepts/characters/caecilia_gabriel_concept_v01.png'
im=Image.open(SOURCE).convert('RGB')
assert im.size==(1536,1024),'Reference pixel registrations require the approved 1536x1024 source'
pixels=im.load();illum=im.filter(ImageFilter.GaussianBlur(13)).load();size=768
data=array('f');data.frombytes((ROOT/'qa/caecilia-gabriel-v01-2026-11-11/head-atlas.f32').read_bytes())
assert len(data)==size*size*6
def sample(x,y):
 x=max(0,min(im.width-1.001,x));y=max(0,min(im.height-1.001,y));ix=int(x);iy=int(y);fx=x-ix;fy=y-iy
 return tuple(round(pixels[ix,iy][k]*(1-fx)*(1-fy)+pixels[ix+1,iy][k]*fx*(1-fy)+pixels[ix,iy+1][k]*(1-fx)*fy+pixels[ix+1,iy+1][k]*fx*fy) for k in range(3))
def blend(a,b,t):return tuple(round(x*(1-t)+y*t) for x,y in zip(a,b))
def smooth(a,b,x):
 t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
skin=(210,169,144);hair=(75,57,40)
def deshade(c,x,y):
 p=illum[max(0,min(1535,int(x))),max(0,min(1023,int(y)))];l=.3*p[0]+.59*p[1]+.11*p[2];gain=.65+.35*194/max(80,l)
 return tuple(max(0,min(255,round(v*gain))) for v in c)
face=Image.new('RGB',(size,size),skin);scalp=Image.new('RGB',(size,size),hair);f=face.load();ha=scalp.load()
for j in range(size):
 for i in range(size):
  k=(j*size+i)*6;x,y,z,nx,ny,nz=data[k:k+6]
  if nx==ny==nz==0:continue
  frontx=854.5+x/.000855;py=195.5+(1.102-y)/.000855
  sidepx=1030-(z-.068)/.000855;sidepy=195.5+(1.102-y)/.000855
  fc=deshade(sample(frontx,py),frontx,py);pc=deshade(sample(sidepx,sidepy),sidepx,sidepy)
  # Restrict projected skin to the portrait face: collar, braid and background cannot become skin.
  fm=smooth(.35,.80,nz)*smooth(94,119,py)*(1-smooth(302,320,py))*smooth(0,10,91-abs(frontx-854.5))
  pm=smooth(.45,.85,abs(nx))*(1-smooth(.30,.70,nz))*smooth(117,137,sidepy)*(1-smooth(297,317,sidepy))
  pm*=1-.92*(1-smooth(-.010,.015,z))*smooth(1.045,1.060,y)*(1-smooth(1.098,1.110,y))
  fm*=.15+.85*smooth(8,20,fc[0]-fc[2])
  pm*=.15+.85*smooth(8,20,pc[0]-pc[2])
  color=blend(skin,fc,fm);color=blend(color,pc,pm)
  f[i,j]=color
  hc=blend(sample(sidepx,sidepy),sample(frontx,py),smooth(.10,.65,nz))
  hc=blend(hc,hair,smooth(128,172,max(hc)))
  hc=blend(hair,hc,smooth(6,16,hc[0]-hc[2]))
  ha[i,j]=blend(hair,hc,.90 if nz>.2 or abs(nx)>.4 else .40)
face.resize((1536,1536),Image.Resampling.BICUBIC).save(OUT/'face.png')
scalp.resize((1536,1536),Image.Resampling.BICUBIC).save(OUT/'hair_scalp.png')

def tile(crop,target,amount=.7):
 p=im.crop(crop).resize((128,128),Image.Resampling.LANCZOS)
 # Mirrored repeat keeps edges continuous without introducing a blur over the whole weave.
 block=Image.new('RGB',(256,256));block.paste(p,(0,0));block.paste(ImageOps.mirror(p),(128,0));block.paste(ImageOps.flip(p),(0,128));block.paste(ImageOps.flip(ImageOps.mirror(p)),(128,128))
 gray=block.convert('L');mean=sum(gray.tobytes())/(256*256)
 out=Image.new('RGB',(512,512));dst=out.load();src=gray.load()
 for y in range(512):
  for x in range(512):
   v=(src[x%256,y%256]-mean)*amount
   dst[x,y]=tuple(max(0,min(255,round(c+v))) for c in target)
 return out
materials={
 'wool':((1211,918,1263,990),(96,89,74),.86),
 'linen':((1278,918,1329,990),(175,162,136),.92),
 'collar':((1278,918,1329,990),(202,188,160),.94),
 'stocking':((1343,918,1395,990),(84,80,66),.90),
 'leather':((1410,918,1462,990),(73,53,37),.74),
 'hair':((1166,140,1207,208),hair,.84),
 'skin':((827,502,849,526),skin,.85),
 'patch':((615,444,643,465),(121,108,85),.91),
}
cfg={}
for name,(crop,color,rough) in materials.items():
 texture=tile(crop,color,.48 if name=='skin' else .75);texture.save(OUT/(name+'.png'))
 if name in ['wool','linen']:
  values=texture.convert('L').tobytes();columns=[sum(values[y*512+x] for y in range(512))/512 for x in range(512)]
  assert max(columns)-sum(columns)/512<18,(name,'a sheet border leaked into the repeated material')
 gray=texture.convert('L');gp=gray.load();normal=Image.new('RGB',texture.size);np=normal.load();strength=.018 if name=='skin' else .16
 for y in range(512):
  for x in range(512):
   dx=(gp[(x+1)%512,y]-gp[(x-1)%512,y])*strength;dy=(gp[x,(y+1)%512]-gp[x,(y-1)%512])*strength
   np[x,y]=(max(0,min(255,round(128-dx))),max(0,min(255,round(128+dy))),255)
 normal.save(OUT/(name+'_normal.png'));cfg[name]={'albedo':name+'.png','nmap':name+'_normal.png','roughness':rough}
for name in ['face','hair_scalp']:
 Image.new('RGB',(512,512),(128,128,255)).save(OUT/(name+'_normal.png'))
cfg['face']={'albedo':'face.png','nmap':'face_normal.png','roughness':.83}
cfg['hair-scalp']={'albedo':'hair_scalp.png','nmap':'hair_scalp_normal.png','roughness':.83}
ear=ImageOps.mirror(im.crop((1106,202,1149,252))).resize((512,512),Image.Resampling.LANCZOS)
ear.save(OUT/'ear.png');Image.new('RGB',(256,256),(128,128,255)).save(OUT/'ear_normal.png');cfg['ear']={'albedo':'ear.png','nmap':'ear_normal.png','roughness':.85}
eye=Image.new('RGB',(512,512));ep=eye.load()
for y in range(512):
 theta=y/512*math.pi;radius=.012*math.sin(theta)
 for x in range(512):
  if theta<.55:
   a=x/512*2*math.pi;r=radius/.0062;photo=sample(821.8+5.7*r*math.cos(a),195.7+5.7*r*math.sin(a));color=photo
   if r<.36:color=blend((25,22,18),photo,.15)
   if r>.91:color=blend(color,(195,187,165),smooth(.91,1.05,r))
  else:color=(209,205,187)
  ep[x,y]=color
eye.save(OUT/'eye.png');Image.new('RGB',(256,256),(128,128,255)).save(OUT/'eye_normal.png')
cfg['eye']={'albedo':'eye.png','nmap':'eye_normal.png','roughness':.32}
report={'sourceSHA256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'source':str(SOURCE.relative_to(ROOT)),'materials':cfg,'projection':{'frontEyePixels':[854.5,195.5],'frontMetresPerPixel':.000855,'profileEyePixels':[1030,195.5],'profileFrontDepth':.068,'atlasSize':size},'dimensionPolicy':'Match illustrated silhouette; use printed overall height 122 cm'}
(OUT/'textures.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print('Child face, scalp, eyes and 8 material sets generated from the approved concept.')
