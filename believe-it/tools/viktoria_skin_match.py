from pathlib import Path
from PIL import Image, ImageStat, ImageFilter
import json
R=Path(__file__).resolve().parents[1]
out=R/'assets/characters/viktoria/v04'
im=Image.open(R/'assets/characters/viktoria/v03/skin.png').convert('RGB')
ref=Image.open(out/'ref/concept_gemini.png').convert('RGB')
target=ImageStat.Stat(ref.crop((990,223,1020,250))).mean
mean=ImageStat.Stat(im).mean
gain=[t*.94/m for t,m in zip(target,mean)]
im=Image.merge('RGB',[ch.point(lambda v,k=k:max(0,min(255,int(v*gain[k])))) for k,ch in enumerate(im.split())])
im.save(out/'skin.png')
(out/'skin-match.json').write_text(json.dumps({'source':'v03/skin.png','referenceCrop':[990,223,1020,250],'gain':gain},indent=2))
