# Inline intro images into one self-contained HTML file.
import base64, pathlib, re, sys
root = pathlib.Path('/data/fears_game')
tpl = (root / 'src/intro/index.html').read_text(encoding='utf-8')
def uri(name):
    b = (root / 'assets/intro' / f'{name}.jpg').read_bytes()
    return 'data:image/jpeg;base64,' + base64.b64encode(b).decode()
names = set(re.findall(r'__IMG_([a-z0-9_]+)__', tpl))
cache = {n: uri(n) for n in names}
out = re.sub(r'__IMG_([a-z0-9_]+)__', lambda m: cache[m.group(1)], tpl)
dst = root / 'deliver' / (sys.argv[1] if len(sys.argv) > 1 else 'believe_it_intro_v1.html')
dst.write_text(out, encoding='utf-8')
print(dst, round(dst.stat().st_size / 1e6, 2), 'MB', sorted(names))
