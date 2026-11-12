"""Verified v9 update archive. Never overwrite previous releases or QA."""
import difflib
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
qa = root / 'qa/environment-v9'
out = root / 'outputs/environment-v9'
sources = ['src/scenes/farm_details.js', 'src/scenes/farm_props.js',
           'src/scenes/farm_interior.js', 'src/scenes/farm_yard.js']
def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):
    return json.loads(p.read_text(encoding='utf-8'))
def clean(r):
    if any(r.get(k) for k in ('failure', 'errors', 'warnings', 'requests', 'externalRequests')):
        raise RuntimeError('Browser QA failed')
def passed(r, count):
    if len(r['checks']) != count or not all(c['pass'] for c in r['checks']):
        raise RuntimeError('Geometry or interaction QA failed')

geometry = read(qa / 'geometry-after-second/checks.json')
baseline = read(qa / 'geometry-baseline-complete/checks.json')
placement = read(qa / 'placement-regressions.json')
visual = read(qa / 'visual-final/report.json')
focus = read(qa / 'visual-focused/report.json')
shavings = read(qa / 'visual-shavings/report.json')
interactions = read(qa / 'interactions/report.json')
routes = read(qa / 'routes-first/report.json')
smoke = read(qa / 'smoke/report.json')
passed(geometry, 24)
passed(placement, 9)
passed(interactions, 15)
passed(routes, 18)
if len(baseline['checks']) != 24 or any(c['pass'] for c in baseline['checks']):
    raise RuntimeError('Baseline did not reproduce the defects')
for report in (visual, focus, shavings, interactions, routes, smoke):
    clean(report)
for report, count in ((visual, 384), (focus, 60), (shavings, 12)):
    if len(report['shots']) != count or report['geometry']['bad']:
        raise RuntimeError('Visual coverage missing or geometry invalid')
if not smoke['production'] or not smoke['canvasVisible'] or len(smoke['shots']) != 4:
    raise RuntimeError('Production UI smoke failed')
farm = root / 'deliver/believe_it_farm_v9.html'
farm_sha = sha(farm)
if any(farm_sha != value for value in (sha(root / 'dist/browser/believe_it_farm.html'),
                                      visual['buildSha256'], focus['buildSha256'], shavings['buildSha256'], smoke['buildSha256'])):
    raise RuntimeError('Issued build differs from tested build')

before = qa / 'before'
original = {p.relative_to(before).as_posix(): p for p in (before / 'src').rglob('*') if p.is_file()}
current = {p.relative_to(root).as_posix(): p for p in (root / 'src').rglob('*') if p.is_file()}
if set(original) != set(current):
    raise RuntimeError('Production source added or removed unexpectedly')
changed = [name for name in original if sha(original[name]) != sha(current[name])]
if set(changed) != set(sources):
    raise RuntimeError('Unexpected production source changes: ' + str(changed))
for name, entry in read(root / 'outputs/recovery/release-manifest.json')['files'].items():
    if sha(root / name) != entry['sha256']:
        raise RuntimeError('Historical v7/v14 release changed: ' + name)
v8_manifest = read(root / 'outputs/placement-v8/release-manifest.json')
for name, entry in v8_manifest['files'].items():
    if name.startswith('deliver/') and sha(root / name) != entry['sha256']:
        raise RuntimeError('Historical v8 release changed: ' + name)
if sha(root / 'dist/browser/believe_it_hands.html') != sha(root / 'deliver/believe_it_hands_v14.html'):
    raise RuntimeError('Viewer changed')
for name, entry in read(root / 'outputs/recovery/archive-manifest.json').items():
    if sha(root / 'outputs/recovery' / name) != entry['sha256']:
        raise RuntimeError('Historical recovery archive changed')
archive_v8 = read(root / 'outputs/placement-v8/archive-manifest.json')
if sha(root / 'outputs/placement-v8' / archive_v8['file']) != archive_v8['sha256']:
    raise RuntimeError('Historical v8 archive changed')

out.mkdir()
integrity = {'sourceFilesCompared': len(original), 'changedSourceFiles': changed,
             'newSourceFiles': [], 'missingSourceFiles': [], 'v7V8V14Preserved': True,
             'viewerBuildPreserved': True, 'issuedBuildMatchesAllBrowserChecks': True}
(out / 'integrity.json').write_text(json.dumps(integrity, ensure_ascii=False, indent=2), encoding='utf-8')
tools = ['tools/environment-capture.mjs', 'tools/environment-geometry.mjs', 'tools/environment-visual.cjs',
         'tools/environment-views.json', 'tools/environment-focus-views.json', 'tools/environment-detail-views.json', 'tools/environment-routes.cjs',
         'tools/environment-sheets.py', 'tools/environment-package.py', 'tools/placement-smoke.cjs',
         'tools/placement-geometry.mjs', 'tools/recovery-interactions.cjs']
docs = ['README.md', 'CODEX_HANDOFF.md', 'tasks/plan.md', 'tasks/todo.md', 'package.json', 'package-lock.json']
releases = ['deliver/believe_it_farm_v9.html', 'deliver/believe_it_hands_v14.html']
manifest_files = sources + tools + docs + releases
manifest = {'date': '2026-11-07', 'farm': 'v9', 'viewer': 'v14 (unchanged)',
            'files': {n: {'bytes': (root / n).stat().st_size, 'sha256': sha(root / n)} for n in manifest_files},
            'checks': {'newGeometry': 24, 'v8Geometry': 9, 'interactions': 15, 'doorRoutes': 18,
                       'visualFrames': 456, 'productionSmokeFrames': 4},
            'geometryReport': 'qa/environment-v9/geometry-after-second/checks.json',
            'visualReports': ['qa/environment-v9/visual-final/report.json', 'qa/environment-v9/visual-focused/report.json', 'qa/environment-v9/visual-shavings/report.json']}
(out / 'release-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
patch = ''
for name in sources:
    a = (before / name).read_text(encoding='utf-8').splitlines(keepends=True)
    b = (root / name).read_text(encoding='utf-8').splitlines(keepends=True)
    patch += ''.join(difflib.unified_diff(a, b, fromfile='a/' + name, tofile='b/' + name))
(out / 'environment-v9.patch').write_text(patch, encoding='utf-8')
(out / 'ENVIRONMENT_REPORT.md').write_text('''# Believe It: окружение v9

Продолжен существующий проект после v8. Исправлены опоры посуды, бумаги и ткани, настенный крепёж,
положение инструментов и стружки, посадка игрушки и крышки корзины, колёса и оси хозяйственных телег.
Сборка и синтаксис проходят. Проверки: 24 условия геометрии, 9 регрессий v8, 15 взаимодействий,
18 условий дверных маршрутов, 456 визуальных кадров и четыре кадра обычного интерфейса релиза.
Ошибок JavaScript, предупреждений шейдеров и внешних запросов нет. Снимок v8 воспроизводит
24 нарушения. Полного теста всех пар треугольников и всех мерцаний на любом оборудовании нет.
Единственный оставшийся кандидат сканера — мягкое перекрытие узелка с одеялом в r2; он сохранён.

Текущий HTML: deliver/believe_it_farm_v9.html. Витрина остаётся v14. Изменены четыре исходника
окружения; другие исходники, старые релизы и архив v8 проверены по хешам. Игровой день 1,
вступление и сюжетные системы не менялись. Следующий пакет — измерение загрузки, памяти и
длительной нагрузки, затем оптимизация подтверждённых узких мест.

Архив обновления содержит самостоятельные HTML, изменённые исходники, инструменты, документацию
и сохранённые QA, включая исходники до v9 и неудачные проверки. Это обновление поверх существующего
проекта; неизменённые assets и node_modules повторно не включены. Полный контекст: CODEX_HANDOFF.md.
''', encoding='utf-8')
items = set(manifest_files)
items.update(p.relative_to(root).as_posix() for p in qa.rglob('*') if p.is_file())
items.update(p.relative_to(root).as_posix() for p in out.iterdir() if p.is_file())
target = out / 'believe_it_farm_v9_update.zip'
with ZipFile(target, 'x', compression=ZIP_DEFLATED, compresslevel=4) as archive:
    for name in sorted(items):
        archive.write(root / name, name)
with ZipFile(target) as archive:
    bad = archive.testzip()
    if bad:
        raise RuntimeError('Archive CRC failed: ' + bad)
archive_manifest = {'file': target.name, 'files': len(items), 'bytes': target.stat().st_size,
                    'sha256': sha(target), 'crcVerified': True}
(out / 'archive-manifest.json').write_text(json.dumps(archive_manifest, indent=2), encoding='utf-8')
print(json.dumps({'out': str(out), 'integrity': integrity, 'archive': archive_manifest}, ensure_ascii=False))
