"""Extract the approved child concept into reproducible local material textures."""
from pathlib import Path
from PIL import Image,ImageOps,ImageFilter
from array import array
import json,hashlib,math

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/characters/caecilia_gabriel/v03';OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'assets/concepts/characters/caecilia_gabriel_concept_v01.png'
im=Image.open(SOURCE).convert('RGB')
assert im.size==(1536,1024),'Reference pixel registrations require the approved 1536x1024 source'
pixels=im.load();illum=im.filter(ImageFilter.GaussianBlur(13)).load();size=768
data=array('f');data.frombytes((ROOT/'qa/caecilia-gabriel-v03/head-atlas.f32').read_bytes())
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
face=Image.new('RGB',(size,size),skin);f=face.load()
for j in range(size):
 for i in range(size):
  k=(j*size+i)*6;x,y,z,nx,ny,nz=data[k:k+6]
  if nx==ny==nz==0:continue
  frontx=854.5+x/.000855;py=195.5+(1.102-y)/.000855
  sidepx=1030-(z-.068)/.000855;sidepy=195.5+(1.102-y)/.000855
  fc=deshade(sample(frontx,py),frontx,py);pc=deshade(sample(sidepx,sidepy),sidepx,sidepy)
  # Restrict projected skin to the portrait face: collar, braid and background cannot become skin.
  fm=smooth(.35,.80,nz)*smooth(94,119,py)*(1-smooth(296,308,py))*smooth(0,10,91-abs(frontx-854.5))
  pm=smooth(.45,.85,abs(nx))*(1-smooth(.30,.70,nz))*smooth(117,137,sidepy)*(1-smooth(297,317,sidepy))
  pm*=1-.92*(1-smooth(-.006,.012,z))*smooth(1.050,1.062,y)*(1-smooth(1.108,1.120,y))
  fm*=.15+.85*smooth(8,20,fc[0]-fc[2])
  pm*=.15+.85*smooth(8,20,pc[0]-pc[2])
  color=blend(skin,fc,fm);color=blend(color,pc,pm)
  f[i,j]=color
face.resize((1536,1536),Image.Resampling.BICUBIC).save(OUT/'face.png')
# v02: woven, knitted and grained tiles are generated. Mirroring a 51 px swatch of the sheet (v01) left
# kaleidoscope figures on large surfaces. The base colours are still the ones read from the approved sheet.
N=512
def hash2(i,j,seed):
 h=(i*374761393+j*668265263+seed*2147483647)&0xffffffff;h=((h^(h>>13))*1274126177)&0xffffffff
 return ((h^(h>>16))&0xffff)/65535
def vnoise(x,y,px,py,seed):
 """Value noise that repeats after px by py cells, so the 512 px tile is seamless."""
 ix=math.floor(x);iy=math.floor(y);fx=x-ix;fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
 a=hash2(ix%px,iy%py,seed);b=hash2((ix+1)%px,iy%py,seed);c=hash2(ix%px,(iy+1)%py,seed);d=hash2((ix+1)%px,(iy+1)%py,seed)
 return a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy
def weave(x,y,thread,twill,seed):
 i=x//thread;j=y//thread;u=(x%thread+.5)/thread;v=(y%thread+.5)/thread
 over=(i+j)%4<2 if twill else (i+j)%2==0
 if over:return math.sin(math.pi*u)**.7*(.82+.18*math.sin(math.pi*v))*(.72+.28*hash2(i,0,seed))
 return math.sin(math.pi*v)**.7*(.82+.18*math.sin(math.pi*u))*(.66+.28*hash2(0,j,seed+7))
def height(name,x,y):
 if name=='wool':return .58*weave(x,y,4,True,1)+.27*vnoise(x/4,y/4,128,128,2)+.15*vnoise(x/32,y/32,16,16,3)
 if name=='patch':return .50*weave(x,y,8,False,4)+.32*vnoise(x/4,y/4,128,128,5)+.18*vnoise(x/32,y/32,16,16,6)
 if name=='linen':return .62*weave(x,y,4,False,7)+.20*vnoise(x/64,y/4,8,128,8)+.18*vnoise(x/4,y/64,128,8,9)
 if name=='collar':return .66*weave(x,y,4,False,10)+.34*vnoise(x/8,y/8,64,64,11)
 if name=='stocking':
  u=(x%8+.5)/8;row=y/8+abs(u-.5)
  if (x//8)%2==0:return (.55+.45*math.cos(2*math.pi*row))*math.sin(math.pi*u)**.5
  return .22+.16*math.cos(2*math.pi*(y/8)+math.pi)*math.sin(math.pi*u)
 if name=='leather':
  crease=abs(vnoise(x/16,y/16,32,32,12)-.5)
  return .45*vnoise(x/8,y/8,64,64,13)+.30*vnoise(x/2,y/2,256,256,14)+.25*vnoise(x/32,y/32,16,16,15)-.30*max(0,.05-crease)/.05
 if name=='hair':
  sx=x+3.0*math.sin(2*math.pi*y/N*2+1.7)+1.5*math.sin(2*math.pi*y/N*5)
  return .40*vnoise(sx/2,y/128,256,4,16)+.30*vnoise(sx/4,y/128,128,4,17)+.30*vnoise(sx/16,y/256,32,2,18)
 if name=='skin':return .6*vnoise(x/2,y/2,256,256,19)+.4*vnoise(x/16,y/16,32,32,20)
 raise KeyError(name)
def procedural(name,target,amount):
 values=[height(name,x,y) for y in range(N) for x in range(N)];mean=sum(values)/len(values)
 out=Image.new('RGB',(N,N));out.putdata([tuple(max(0,min(255,round(c*(1+amount*(h-mean)/max(mean,.2))))) for c in target) for h in values])
 gray=Image.new('L',(N,N));gray.putdata([max(0,min(255,round(128+255*(h-mean)))) for h in values])
 return out,gray
# name: (base colour, roughness, contrast, normal strength)
materials={
 'wool':((96,89,74),.86,.34,.20),
 'linen':((175,162,136),.92,.22,.16),
 'collar':((202,188,160),.94,.13,.10),
 'stocking':((84,80,66),.90,.42,.22),
 'leather':((73,53,37),.74,.34,.14),
 'hair':(hair,.84,.46,.12),
 'skin':(skin,.85,.05,.02),
 'patch':((121,108,85),.91,.34,.20),
}
cfg={}
def normal_map(gray,strength):
 gp=gray.load();normal=Image.new('RGB',gray.size);np=normal.load();w,h=gray.size
 for y in range(h):
  for x in range(w):
   dx=(gp[(x+1)%w,y]-gp[(x-1)%w,y])*strength;dy=(gp[x,(y+1)%h]-gp[x,(y-1)%h])*strength
   np[x,y]=(max(0,min(255,round(128-dx))),max(0,min(255,round(128+dy))),255)
 return normal
for name,(color,rough,amount,strength) in materials.items():
 texture,gray=procedural(name,color,amount);texture.save(OUT/(name+'.png'))
 normal_map(gray,strength).save(OUT/(name+'_normal.png'));cfg[name]={'albedo':name+'.png','nmap':name+'_normal.png','roughness':rough}
Image.new('RGB',(512,512),(128,128,255)).save(OUT/'face_normal.png')
cfg['face']={'albedo':'face.png','nmap':'face_normal.png','roughness':.83}
ear=ImageOps.mirror(im.crop((1107,186,1149,247))).resize((512,512),Image.Resampling.LANCZOS)
ear.save(OUT/'ear.png');Image.new('RGB',(256,256),(128,128,255)).save(OUT/'ear_normal.png');cfg['ear']={'albedo':'ear.png','nmap':'ear_normal.png','roughness':.85}
EYE_PX=(821.3,191.6);IRIS=(104,88,68) # pupil centre of the sheet's right eye; mid iris tone
eye=Image.new('RGB',(512,512));ep=eye.load()
for y in range(512):
 theta=y/512*math.pi;radius=.012*math.sin(theta)
 for x in range(512):
  if theta<.62:
   a=x/512*2*math.pi;r=radius/.0067;photo=sample(EYE_PX[0]+7.8*r*math.cos(a),EYE_PX[1]+7.8*r*math.sin(a));color=photo
   if r<.37:color=blend((25,22,18),photo,.15)
   elif max(photo)>150:color=IRIS # the painted catchlight is not part of the eye
   if r>.93:color=blend(color,(205,198,182),smooth(.93,1.06,r))
  else:color=(205,198,182)
  ep[x,y]=color
eye.save(OUT/'eye.png');Image.new('RGB',(256,256),(128,128,255)).save(OUT/'eye_normal.png')
cfg['eye']={'albedo':'eye.png','nmap':'eye_normal.png','roughness':.32}
report={'sourceSHA256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'source':str(SOURCE.relative_to(ROOT)),'materials':cfg,'projection':{'frontEyePixels':[854.5,195.5],'frontMetresPerPixel':.000855,'profileEyePixels':[1030,195.5],'profileFrontDepth':.068,'atlasSize':size},'dimensionPolicy':'Match illustrated silhouette; use printed overall height 122 cm'}
(OUT/'textures.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print('Child face, eyes and ear taken from the approved concept; 8 generated material sets.')
