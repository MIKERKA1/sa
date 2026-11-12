"""Audit preservation and package the completed v01 update. Never overwrite a release."""
from pathlib import Path
import datetime
import hashlib
import json
import shutil
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / 'qa/caecilia-v01/resume-02'
OUT = ROOT / 'outputs/caecilia-v01'
ALLOWED = {
    'CODEX_HANDOFF.md', 'README.md', 'package.json', 'src/character/main.js',
    'dist/browser/believe_it_caecilia.html', 'docs/build_browser.md',
    'docs/todo.md', 'tasks/todo.md', 'tasks/plan.md',
}


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024*1024), b''):
            h.update(block)
    return h.hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_new(path, data):
    with path.open('x', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def audit():
    inventory = read(QA/'inventory-before.json')
    changed, missing, snapshot_errors, neighbor_errors = [], [], [], []
    for entry in inventory['files']:
        p = ROOT/entry['path']
        if not p.is_file():
            missing.append(entry['path'])
        elif sha(p) != entry['sha256']:
            changed.append(entry['path'])
    old = {x['path']: x for x in inventory['files']}
    for rel in inventory['snapshotPaths']:
        if not (QA/'before'/rel).is_file() or sha(QA/'before'/rel) != old[rel]['sha256']:
            snapshot_errors.append(rel)
    neighbors = 0
    for group in inventory['neighbors']:
        folder = Path(group['root'])
        actual = {p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file()}
        expected = {x['path'] for x in group['files']}
        for rel in actual ^ expected:
            neighbor_errors.append(str(folder/rel))
        for entry in group['files']:
            neighbors += 1
            p = folder/entry['path']
            if not p.is_file() or sha(p) != entry['sha256']:
                neighbor_errors.append(str(p))
    v11 = read(ROOT/'outputs/door-access-v11/release-manifest.json')['files']
    source_errors = [rel for rel, entry in v11.items() if rel.startswith('src/') and sha(ROOT/rel) != entry['sha256']]
    identity = read(QA/'build-identity.json')
    result = {
        'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'originalFilesChecked': len(inventory['files']), 'changed': changed,
        'unexpectedChanges': sorted(set(changed)-ALLOWED), 'missing': missing,
        'snapshotFilesChecked': len(inventory['snapshotPaths']), 'snapshotErrors': snapshot_errors,
        'neighborFilesChecked': neighbors, 'neighborErrors': neighbor_errors,
        'v11SourceErrors': source_errors, 'buildIdentity': identity,
    }
    result['pass'] = not any([result['unexpectedChanges'], missing, snapshot_errors, neighbor_errors, source_errors]) and all(identity.values())
    return result


def package():
    # Recheck current files; a historical passing report alone cannot authorize packaging.
    integrity = audit()
    if not integrity['pass']:
        raise RuntimeError(json.dumps(integrity))
    for report in ['browser-final/report.json', 'resize-after/report.json']:
        if not read(QA/report)['pass']:
            raise RuntimeError('Failed QA: '+report)
    deliver = ROOT/'deliver/believe_it_caecilia_v01.html'
    archive = OUT/'believe_it_caecilia_v01_update.zip'
    for p in [deliver, archive, OUT/'release-manifest.json', OUT/'archive-manifest.json', OUT/'qa-index.json']:
        if p.exists():
            raise FileExistsError(p)
    shutil.copy2(ROOT/'dist/browser/believe_it_caecilia.html', deliver)
    paths = {
        'CODEX_HANDOFF.md', 'README.md', 'package.json', 'package-lock.json',
        'docs/build_browser.md', 'docs/todo.md', 'tasks/plan.md', 'tasks/todo.md',
        'tools/build.mjs', 'tools/caecilia_bake.mjs', 'tools/caecilia_textures.py',
        'tools/caecilia-regression.cjs', 'tools/caecilia-resize.cjs', 'tools/caecilia-release.py',
        'tests/caecilia-geometry.test.mjs', 'tests/caecilia-glb.test.mjs', 'tests/grain-texture.test.mjs',
        'src/models/caecilia.js', 'src/models/caecilia_geometry.js', 'src/models/caecilia_asset.gen.js',
        'deliver/believe_it_caecilia_v01.html', 'dist/browser/believe_it_caecilia.html',
        'outputs/caecilia-v01/MODEL_REPORT.md',
    }
    for directory in ['src/character', 'assets/characters/caecilia', 'assets/concepts/characters', 'qa/caecilia-v01/resume-02']:
        for p in (ROOT/directory).rglob('*'):
            if p.is_file() and p.name != 'downloaded.glb' and '/build/' not in p.as_posix():
                paths.add(p.relative_to(ROOT).as_posix())
    for rel in ['geometry-before.tap', 'geometry-after-01.tap', 'tests-01.tap', 'browser-before/report.json', 'browser-after-01/report.json', 'inventory-before.json']:
        paths.add('qa/caecilia-v01/resume-01/'+rel)
    qa_index = {p.relative_to(ROOT).as_posix(): {'bytes': p.stat().st_size, 'sha256': sha(p)} for p in (ROOT/'qa/caecilia-v01').rglob('*') if p.is_file()}
    write_new(OUT/'qa-index.json', qa_index)
    paths.add('outputs/caecilia-v01/qa-index.json')
    files = {rel: {'bytes': (ROOT/rel).stat().st_size, 'sha256': sha(ROOT/rel)} for rel in sorted(paths)}
    manifest = {
        'version': 'Caecilia static v01', 'date': '2026-11-08',
        'scope': 'Update over the existing Believe It project; no farm/story changes',
        'html': 'deliver/believe_it_caecilia_v01.html',
        'glb': 'assets/characters/caecilia/v01/caecilia_gruber_v01.glb',
        'unitTests': 8, 'browserChecks': 33, 'resizeChecks': 10,
        'files': files,
    }
    write_new(OUT/'release-manifest.json', manifest)
    with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for rel in sorted(paths):
            z.write(ROOT/rel, rel)
        z.write(OUT/'release-manifest.json', 'outputs/caecilia-v01/release-manifest.json')
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None:
            raise RuntimeError('Archive CRC failure')
        for rel, entry in files.items():
            if hashlib.sha256(z.read(rel)).hexdigest() != entry['sha256']:
                raise RuntimeError('Archive SHA failure: '+rel)
        manifest_rel = 'outputs/caecilia-v01/release-manifest.json'
        if z.read(manifest_rel) != (OUT/'release-manifest.json').read_bytes():
            raise RuntimeError('Archive manifest mismatch')
        count = len(z.infolist())
    summary = {'file': archive.name, 'files': count, 'bytes': archive.stat().st_size, 'sha256': sha(archive), 'crcVerified': True, 'allEntrySha256Verified': True}
    write_new(OUT/'archive-manifest.json', summary)
    print(json.dumps(summary))


if __name__ == '__main__':
    if sys.argv[1:] == ['audit']:
        result = audit()
        write_new(QA/'integrity-final.json', result)
        print(json.dumps(result))
        if not result['pass']:
            sys.exit(1)
    elif sys.argv[1:] == ['package']:
        package()
    else:
        raise SystemExit('Usage: python tools/caecilia-release.py audit|package')
