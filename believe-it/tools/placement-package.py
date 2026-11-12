"""Package the verified v8 update and make contact sheets; keep all historical evidence."""
import difflib
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent
qa = root / 'qa/placement-v8'
out = root / 'outputs/placement-v8'
if out.exists():
    raise RuntimeError('Use a fresh release output directory')
read_json = lambda p: json.loads(p.read_text(encoding='utf-8'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
visual = read_json(qa / 'visual-clearance/report.json')
geometry = read_json(qa / 'geometry-final-clearance.json')
interactions = read_json(qa / 'interactions/report.json')
smoke = read_json(qa / 'smoke-final/report.json')
for report in (visual, interactions, smoke):
    if report.get('failure') or report.get('errors') or report.get('warnings') or report.get('requests') or report.get('externalRequests'):
        raise RuntimeError('Browser QA has errors, warnings or external requests')
if any(not c['pass'] for report in (geometry, visual, interactions) for c in report['checks']):
    raise RuntimeError('A geometry or interaction check failed')
if visual['geometry']['bad'] or not smoke['production'] or not smoke['canvasVisible']:
    raise RuntimeError('Invalid geometry or production smoke result')
if len(visual['shots']) != 72 or len(geometry['checks']) != 9 or len(interactions['checks']) != 15 or len(smoke['shots']) != 4:
    raise RuntimeError('An expected QA sample is missing')
farm = root / 'deliver/believe_it_farm_v8.html'
farm_sha = sha(farm)
if farm_sha != sha(root / 'dist/browser/believe_it_farm.html') or farm_sha != visual['buildSha256'] or farm_sha != smoke['buildSha256']:
    raise RuntimeError('The issued farm build differs from the tested build')
old_manifest = read_json(root / 'outputs/recovery/release-manifest.json')
for name, entry in old_manifest['files'].items():
    if sha(root / name) != entry['sha256']:
        raise RuntimeError('Historical release changed: ' + name)
if sha(root / 'dist/browser/believe_it_hands.html') != sha(root / 'deliver/believe_it_hands_v14.html'):
    raise RuntimeError('Viewer differs from unchanged v14')
allowed = {'src/models/hardware.js','src/engine/ps1.js','dist/browser/believe_it_farm.html',
           'dist/browser/believe_it_hands.html','tasks/plan.md','tasks/todo.md',
           'src/scenes/farm_details.js','src/scenes/farm_props.js','src/scenes/farm_yard.js'}
inventory = read_json(root / 'qa/recovery/inventory-before.json')
changed, missing, preserved = [], [], 0
for entry in inventory['files']:
    p = root / entry['path']
    if not p.is_file(): missing.append(entry['path'])
    elif sha(p) != entry['sha256']: changed.append(entry['path'])
    else: preserved += 1
unexpected = sorted(set(changed) - allowed)
if missing or unexpected:
    raise RuntimeError(f'Unexpected changes: {unexpected}; missing: {missing}')
out.mkdir()
integrity = {'originalFiles': len(inventory['files']), 'preserved': preserved, 'changedSinceRecoveryStarted': changed,
             'missing': missing, 'unexpected': unexpected, 'v7AndV14Unchanged': True, 'testedBuildMatchesV8': True}
(out / 'integrity.json').write_text(json.dumps(integrity, ensure_ascii=False, indent=2), encoding='utf-8')
sources = ['src/scenes/farm_details.js','src/scenes/farm_props.js','src/scenes/farm_yard.js']
files = {n: {'bytes': (root/n).stat().st_size, 'sha256': sha(root/n)} for n in ['deliver/believe_it_farm_v8.html','deliver/believe_it_hands_v14.html'] + sources}
manifest = {'date': '2026-11-07', 'farm': 'v8', 'viewer': 'v14 (unchanged)', 'files': files,
            'visualReport': 'qa/placement-v8/visual-clearance/report.json', 'geometryReport': 'qa/placement-v8/geometry-final-clearance.json'}
(out / 'release-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
patch = ''
for name in sources:
    before = (qa / 'before-source' / Path(name).name).read_text(encoding='utf-8').splitlines(keepends=True)
    after = (root / name).read_text(encoding='utf-8').splitlines(keepends=True)
    patch += ''.join(difflib.unified_diff(before, after, fromfile='a/'+name, tofile='b/'+name))
(out / 'placement-v8.patch').write_text(patch, encoding='utf-8')
sheets = qa / 'sheets'
sheets.mkdir()
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 17)
for gfx in ('enh','retro'):
    for preset in ('day','dusk','night'):
        shots = [s for s in visual['shots'] if s['gfx']==gfx and s['preset']==preset]
        sheet = Image.new('RGB',(960,4*224),'#15191c'); draw = ImageDraw.Draw(sheet)
        for i, shot in enumerate(shots):
            x,y = i%3*320,i//3*224
            with Image.open(qa/'visual-clearance'/shot['file']) as im:
                im.thumbnail((314,196)); sheet.paste(im,(x+3,y+3))
            draw.text((x+5,y+201),shot['id'],font=font,fill='white')
        sheet.save(sheets/f'{preset}-{gfx}.jpg',quality=94)
comparison = Image.new('RGB',(1280,4*352),'#15191c'); draw = ImageDraw.Draw(comparison)
for i, name in enumerate(('rail-front','book-side','basket-top','exhaust-full')):
    for j, folder in enumerate(('visual-before','visual-clearance')):
        with Image.open(qa/folder/f'{name}-day-enh.png') as im:
            im = im.crop((0,62,1280,715)); im.thumbnail((640,327)); comparison.paste(im,(j*640,i*352))
        draw.text((j*640+8,i*352+328),f'{name}: '+('v7' if j==0 else 'v8'),font=font,fill='white')
comparison.save(sheets/'comparison.jpg',quality=94)
(out / 'PLACEMENT_REPORT.md').write_text('''# Believe It: исправления размещения v8

Исправлены четыре замечания пользователя: рейка и кольца закреплены вне проёма, книга стоит на доске над перегородкой короба, девять поленьев уложены от дна корзины, выхлоп мотора соединён с закреплённой трубой и проходит через отверстие в крыше.

Сборка и синтаксис проходят. Итоговая проверка: 72 кадра, 9 условий геометрии, 15 взаимодействий; 4 кадра выдачи без диагностических функций. Ошибки, предупреждения и внешние запросы отсутствуют. Геометрические условия отвергают сохранённые исходники v7. Для 20 seeds минимальный измеренный зазор вершин поленьев до плетёнки — 4.36 мм. Проверки выборочные, полного теста всех пересечений сцены нет.

В v8 изменены только три производственных исходника окружения и сборка хутора; витрина v14, сюжетный день 1 и вступление сохранены. Все старые файлы и отчёты остаются. Новая нагрузка на слабых GPU не измерялась.

`believe_it_farm_v8_update.zip` содержит готовые HTML, изменённые исходники, инструменты, документацию и QA. Это архив обновления поверх исходников v7, а не полный проект с assets и зависимостями. Готовый farm v8 HTML работает самостоятельно. Исторический полный архив исходников v7 находится в `../recovery/`.

Текущие файлы и хеши — в release-manifest.json. Неперезаписанные старые файлы проверены в integrity.json. Подробности и следующий этап — в CODEX_HANDOFF.md.
''',encoding='utf-8')
items = sources + ['README.md','CODEX_HANDOFF.md','tasks/todo.md','package.json','package-lock.json',
         'tools/placement-geometry.mjs','tools/placement-visual.cjs','tools/placement-smoke.cjs','tools/placement-package.py',
         'deliver/believe_it_farm_v8.html','deliver/believe_it_hands_v14.html']
items += [p.relative_to(root).as_posix() for folder in ('before-source','visual-before','visual-clearance','interactions','smoke-final','sheets','user-screenshots') for p in (qa/folder).glob('*') if p.is_file()]
items += [p.relative_to(root).as_posix() for p in qa.glob('geometry-*.json')]
items += [p.relative_to(root).as_posix() for p in out.glob('*') if p.is_file()]
target = out / 'believe_it_farm_v8_update.zip'
with ZipFile(target,'x',compression=ZIP_DEFLATED,compresslevel=4) as z:
    for name in sorted(set(items)): z.write(root/name,name)
with ZipFile(target) as z:
    bad = z.testzip()
    if bad: raise RuntimeError('ZIP CRC mismatch: ' + bad)
(out / 'archive-manifest.json').write_text(json.dumps({'file': target.name, 'files':len(set(items)), 'bytes':target.stat().st_size, 'sha256':sha(target), 'crcVerified':True},indent=2),encoding='utf-8')
print(json.dumps({'out':str(out),'integrity':integrity,'archiveBytes':target.stat().st_size,'crcVerified':True},ensure_ascii=False))
