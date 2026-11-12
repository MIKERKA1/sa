"""Prepare Caecilia's model textures from the approved sheet; no network or generation.

Run with the existing Pillow installation: python tools/caecilia_textures.py
The original is immutable. Crops and face rectification are explicit, reproducible
art-direction choices, not recovered photographic ground truth.
"""
from pathlib import Path
from PIL import Image, ImageOps, ImageFilter, ImageStat
import hashlib
import json
import math

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/concepts/characters/caecilia_gruber_concept_v01.png'
OUT = ROOT / 'assets/characters/caecilia/v01'
EXPECTED = '998dfc1b8e9fd9e2a76527e804faf532dc21404242570a6a5f317756949fe7a7'
pixels = lambda im: im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata()


def normalize(im, amount=0.35, radius=24):
    """Reduce broad photographed shading, retaining color and fine surface detail."""
    im = im.convert('RGB')
    light = im.convert('L').filter(ImageFilter.GaussianBlur(radius))
    average = ImageStat.Stat(light).mean[0]
    result = []
    for rgb, lum in zip(pixels(im), pixels(light)):
        gain = (1-amount) + amount * average / max(12, lum)
        result.append(tuple(max(0, min(255, round(c * gain))) for c in rgb))
    dst = Image.new('RGB', im.size)
    dst.putdata(result)
    return dst


def tile(im, size=512):
    q = ImageOps.fit(im, (size//2, size//2), Image.Resampling.LANCZOS)
    row = Image.new('RGB', (size, size//2))
    row.paste(q, (0, 0))
    row.paste(ImageOps.mirror(q), (size//2, 0))
    dst = Image.new('RGB', (size, size))
    dst.paste(row, (0, 0))
    dst.paste(ImageOps.flip(row), (0, size//2))
    return dst


def normalmap(im, strength=1.8, wrap=True, gloss=.1):
    height = im.convert('L').filter(ImageFilter.GaussianBlur(0.6))
    broad = height.filter(ImageFilter.GaussianBlur(9))
    w, h = im.size
    p = [a-b for a, b in zip(pixels(height), pixels(broad))]
    def value(x, y):
        if wrap:
            return p[(y % h)*w + x % w]
        return p[max(0, min(h-1, y))*w + max(0, min(w-1, x))]
    normals = []
    for y in range(h):
        for x in range(w):
            dx = (value(x+1, y)-value(x-1, y))*strength/255
            dy = (value(x, y+1)-value(x, y-1))*strength/255
            length = math.sqrt(dx*dx+dy*dy+1)
            normals.append((round(127.5-127.5*dx/length), round(127.5+127.5*dy/length), round(127.5+127.5/length), round(gloss*255)))
    # Believe It's common shader reads gloss from normal-map alpha. Standard
    # glTF readers ignore that alpha, so the same asset works in both renderers.
    n = Image.new('RGBA', (w, h))
    n.putdata(normals)
    return n


def face(sheet):
    portrait = sheet.crop((960, 0, 1420, 452))
    # World-space heights correspond to the mesh's face landmarks. The horizontal
    # grid straightens the portrait's three-quarter perspective around those points.
    levels = [1.550, 1.510, 1.471, 1.445, 1.414, 1.395, 1.368, 1.337, 1.305]
    columns = [0, .18, .32, .5, .68, .82, 1]
    rows = [
        [(128,76),(165,56),(200,42),(249,36),(294,45),(329,64),(356,94)],
        [(135,150),(171,132),(212,116),(273,109),(306,113),(333,133),(355,162)],
        [(139,203),(174,194),(214,188),(266,183),(310,179),(337,187),(356,207)],
        [(142,244),(179,225),(214,224),(267,219),(311,215),(337,229),(352,248)],
        [(148,272),(184,262),(222,261),(286,270),(320,255),(337,262),(349,277)],
        [(157,299),(190,293),(233,294),(293,294),(319,288),(337,294),(344,301)],
        [(177,343),(207,338),(244,335),(281,332),(315,328),(333,329),(338,327)],
        [(206,384),(228,385),(252,386),(283,389),(313,377),(329,364),(335,350)],
        [(229,417),(240,416),(257,414),(284,413),(307,400),(319,386),(332,368)],
    ]
    w, h = 512, 768
    xs = [round(x*w) for x in columns]
    ys = [round((levels[0]-y)/(levels[0]-levels[-1])*h) for y in levels]
    mesh = []
    for j in range(len(rows)-1):
        for i in range(len(columns)-1):
            quad = rows[j][i] + rows[j+1][i] + rows[j+1][i+1] + rows[j][i+1]
            mesh.append(((xs[i],ys[j],xs[i+1],ys[j+1]), quad))
    return normalize(portrait.transform((w,h),Image.Transform.MESH,mesh,Image.Resampling.BICUBIC),.25,48)


def main():
    raw = SOURCE.read_bytes()
    if hashlib.sha256(raw).hexdigest() != EXPECTED:
        raise RuntimeError('Approved concept changed; do not silently rebuild from a different image.')
    OUT.mkdir(parents=True,exist_ok=True)
    sheet = Image.open(SOURCE).convert('RGB')
    config = {
        'wool': {'crop':[733,549,778,650], 'tile':.19, 'normal':2.2, 'roughness':.94},
        'linen': {'crop':[137,421,288,671], 'tile':.32, 'normal':1.8, 'roughness':.9},
        'kerchief': {'crop':[746,62,789,139], 'tile':.2, 'normal':1.2, 'roughness':.92},
        'leather': {'crop':[1545,626,1590,665], 'tile':.16, 'normal':.8, 'roughness':.82},
        'hair': {'crop':[1154,53,1276,121], 'tile':.12, 'normal':1.25, 'roughness':.86},
        'yarn': {'crop':[1480,774,1623,891], 'tile':.06, 'normal':1.1, 'roughness':.95},
    }
    entries = {}
    for name, spec in config.items():
        crop = sheet.crop(tuple(spec['crop']))
        # The yarn mesh supplies the crochet construction; avoid painting the
        # source's large holes onto individual threads a second time.
        if name == 'yarn':
            crop = crop.filter(ImageFilter.GaussianBlur(3))
        # The leather crop contains broad painted creases. Remove that lighting
        # before tiling so it cannot turn into long bright streaks on the boots.
        albedo = tile(normalize(crop,.92,5) if name == 'leather' else normalize(crop,.6,18))
        if name == 'hair':
            albedo = ImageOps.fit(normalize(crop,.35,16),(256,256),Image.Resampling.LANCZOS)
        albedo.save(OUT/f'{name}.png',optimize=True)
        normalmap(albedo,spec['normal'],gloss=1-spec['roughness']).save(OUT/f'{name}_normal.png',optimize=True)
        entries[name] = {**spec, 'albedo':f'{name}.png','nmap':f'{name}_normal.png'}
    skin = face(sheet)
    skin.save(OUT/'face.png',optimize=True)
    normalmap(skin,1.1,False,.18).save(OUT/'face_normal.png',optimize=True)
    entries['face'] = {'albedo':'face.png','nmap':'face_normal.png','roughness':.85,'projection':{'x':[-.105,.105],'y':[1.305,1.55]}}
    # Small, texture-only skin tile for hidden neck and the sides of the hands.
    plain = tile(normalize(sheet.crop((1160,296,1192,320)),.75,7),256)
    plain.save(OUT/'skin.png',optimize=True)
    normalmap(plain,.6).save(OUT/'skin_normal.png',optimize=True)
    entries['skin']={'albedo':'skin.png','nmap':'skin_normal.png','roughness':.88,'tile':.12}
    preview = sheet.copy()
    preview.thumbnail((1280,1280),Image.Resampling.LANCZOS)
    preview.save(OUT/'concept-preview.webp',quality=90,method=6)
    metadata={'source':SOURCE.relative_to(ROOT).as_posix(),'sourceSHA256':EXPECTED,'materials':entries}
    (OUT/'textures.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    print(json.dumps({'materials':len(entries),'output':str(OUT),'sourceSHA256':EXPECTED}))


if __name__ == '__main__':
    main()
