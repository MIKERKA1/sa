"""Package the recovered project and check preserved files and ZIP integrity."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
out = root / 'outputs' / 'recovery'
inventory = json.loads((root / 'qa/recovery/inventory-before.json').read_text(encoding='utf-8'))
allowed_changes = {'src/models/hardware.js', 'src/engine/ps1.js', 'dist/browser/believe_it_farm.html',
                   'dist/browser/believe_it_hands.html', 'tasks/plan.md', 'tasks/todo.md'}
hash_file = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
changed, missing, preserved = [], [], 0
for entry in inventory['files']:
    p = root / entry['path']
    if not p.is_file():
        missing.append(entry['path'])
    elif hash_file(p) != entry['sha256']:
        changed.append(entry['path'])
    else:
        preserved += 1
unexpected = sorted(set(changed) - allowed_changes)
if missing or unexpected:
    raise RuntimeError(f'Unexpected changes: {unexpected}; missing files: {missing}')
manifest = json.loads((out / 'release-manifest.json').read_text(encoding='utf-8'))
for name, entry in manifest['files'].items():
    if hash_file(root / name) != entry['sha256']:
        raise RuntimeError(f'Release hash mismatch: {name}')
visual = json.loads((root / 'qa/recovery/visual-final/report.json').read_text(encoding='utf-8'))
if visual['buildSha256'] != manifest['files']['deliver/believe_it_farm_v7.html']['sha256']:
    raise RuntimeError('Visual QA ran against a different farm build')
integrity = {'originalFiles': len(inventory['files']), 'preserved': preserved, 'changed': changed,
             'missing': missing, 'unexpectedChanges': unexpected, 'visualMatchesRelease': True}
(out / 'integrity-final.json').write_text(json.dumps(integrity, ensure_ascii=False, indent=2), encoding='utf-8')

compact_qa = {'qa/recovery/inventory-before.json', 'qa/recovery/context-evidence.json',
              'qa/recovery/visual-final/report.json', 'qa/recovery/interactions-final/report.json',
              'qa/recovery/performance-final.json', 'qa/recovery/smoke/report.json',
              'qa/recovery/lock-probe-detached.json'}
source_files = []
for p in root.rglob('*'):
    if not p.is_file():
        continue
    parts = p.relative_to(root).parts
    name = p.relative_to(root).as_posix()
    if any(x in parts for x in ('node_modules', '.npm-cache', '.git')) or parts[0] == 'outputs':
        continue
    if name.startswith('qa/recovery/') and name not in compact_qa:
        continue
    source_files.append((p, name))
review_files = [(root / n, n) for n in manifest['files']]
review_files += [(root / n, n) for n in ('README.md', 'CODEX_HANDOFF.md', 'deliver/believe_it_intro_v1.html')]
review_files += [(out / n, n) for n in ('RECOVERY_REPORT.md', 'release-manifest.json', 'integrity-final.json')]
review_files += [(root / n, n) for n in compact_qa]
for folder in ('visual-final', 'interactions-final', 'sheets-final', 'smoke'):
    for p in (root / 'qa/recovery' / folder).glob('*'):
        if p.suffix.lower() in ('.png', '.jpg'):
            review_files.append((p, p.relative_to(root).as_posix()))
archives = {}
for name, items in (('believe_it_source_v7_v14.zip', source_files), ('believe_it_review_v7_v14.zip', review_files)):
    target = out / name
    with ZipFile(target, 'x', compression=ZIP_DEFLATED, compresslevel=4) as archive:
        for p, rel in sorted(items, key=lambda pair: pair[1]):
            archive.write(p, rel)
    with ZipFile(target) as archive:
        bad = archive.testzip()
        if bad:
            raise RuntimeError(f'ZIP CRC mismatch: {name}/{bad}')
    archives[name] = {'files': len(items), 'bytes': target.stat().st_size, 'sha256': hash_file(target), 'crcVerified': True}
(out / 'archive-manifest.json').write_text(json.dumps(archives, indent=2), encoding='utf-8')
print(json.dumps({'integrity': integrity, 'archives': archives}, ensure_ascii=False))
