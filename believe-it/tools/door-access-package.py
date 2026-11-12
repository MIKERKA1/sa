"""Package the verified d7 fix as an update over v10; never overwrite a release."""
from pathlib import Path
import difflib
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parent.parent
QA = ROOT / 'qa/door-access-v11'
OUT = ROOT / 'outputs/door-access-v11'


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def clean(report):
    return all(not report.get(k) for k in ('errors', 'warnings', 'externalRequests', 'requests', 'failures', 'failure'))


def passed(report, expected):
    return clean(report) and len(report['checks']) == expected and all(c['pass'] for c in report['checks'])


before = read('qa/door-access-v11/regression-before/report.json')
after = read('qa/door-access-v11/regression-after/report.json')
interactions = read('qa/door-access-v11/interactions-after/report.json')
routes = read('qa/door-access-v11/routes-after/report.json')
smoke = read('qa/door-access-v11/smoke-after/report.json')
integrity = read('qa/door-access-v11/integrity-final.json')
static = read('qa/door-access-v11/static-checks.json')
farm = ROOT / 'deliver/believe_it_farm_v11.html'
farm_hash = digest(farm)
require(len(before['checks']) == 56 and len(before['failedChecks']) == 24 and clean(before), 'The saved v10 reproduction is incomplete')
require(before['buildSha256'] == digest(ROOT / 'deliver/believe_it_farm_v10.html'), 'RED was not run against the preserved v10')
require(passed(after, 56) and after['buildSha256'] == farm_hash, 'Current d7 regression did not pass against this release')
require(passed(interactions, 15), 'Existing interaction regressions did not pass')
require(passed(routes, 18), 'Doorway route checks did not pass')
require(clean(smoke) and smoke['production'] and smoke['canvasVisible'] and len(smoke['shots']) == 4 and smoke['buildSha256'] == farm_hash, 'Production smoke did not pass against this release')
require(integrity['pass'] and integrity['farmSha256'] == farm_hash, 'Preservation audit did not pass')
require(static['pass'], 'Build, unit tests or syntax checks did not pass')
require(not OUT.exists(), 'Use a new release folder; existing output must not be overwritten')
OUT.mkdir(parents=True)

summary = {
    'farm': 'v11', 'viewer': 'v14 (unchanged)', 'farmSha256': farm_hash,
    'sourceThread': '01a1b69b-a3a8-7213-81cd-de05670a8095',
    'sourceTurn': '01a1b797-821d-77a3-8bd3-765071054609',
    'before': {'checks': len(before['checks']), 'failed': len(before['failedChecks']), 'screenshots': len(before['shots'])},
    'after': {'checks': len(after['checks']), 'failed': len(after['failedChecks']), 'screenshots': len(after['shots'])},
    'legacyInteractions': len(interactions['checks']), 'doorRoutes': len(routes['checks']),
    'productionSmokeScenes': len(smoke['shots']), 'grainTests': 2,
    'sourceChanges': integrity['sourceChanges'], 'preservation': integrity['checks'],
}
(OUT / 'door-access-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
report = '''# Believe It: исправление засова d7, v11

После завершённого v10 пользователь сообщил, что из хлева можно открыть дверь в кладовую,
хотя засов расположен с её внутренней стороны. Ответ на это замечание в прежнем чате
оборвался до исправления. Контекст восстановлен по сообщениям, исходникам, SHA-манифестам
и сохранённым QA. Git в перенесённой копии отсутствует.

## Изменение

Закрытый засов доступен только из кладовой. При попытке из хлева дверь остаётся
закрытой, игрок видит причину. Подсказка и само действие учитывают сторону игрока;
старая подсказка с противоположной стороны не позволяет обойти проверку.
Дверь начинает открываться после полного отвода засова. Закрытие из кладовой возвращает
его после полного закрытия полотна. Закрытие из хлева оставляет засов отведённым:
такую дверь можно снова открыть с обеих сторон. Отмена и быстрые повторные действия проверены.

Изменены три производственных исходника: `src/farm/main.js`, `src/scenes/farm.js`,
`src/scenes/farm_house.js`. Геометрия, материалы, фурнитура, витрина v14 и оптимизации
запуска v10 сохранены. Два прежних QA-инструмента теперь передают положение игрока
и проверяют возврат засова со стороны кладовой.

## Проверки

| Проверка | Результат |
|---|---|
| Регрессия на v10 | 24 ожидаемых отказа из 56 условий; 24 кадра |
| Та же регрессия на v11 | 56/56; 24 кадра, улучшенная и ретро-графика |
| Прежние взаимодействия | 15/15; двери, замок, ворота и лестницы |
| Проходы через двери | 18/18; открытые проёмы в обе стороны и закрытая d8 |
| Обычный HTML без диагностических функций | 4 сцены интерфейса |
| Зерновые текстуры | 2/2 точных теста v10 |
| Сборка и синтаксис | Пройдены, установка зависимостей не запускалась |

Браузерные проверки выполнены в отдельном Edge через Playwright, WebGL 2 / RTX 4060,
1280×800. Использованы настоящие KeyE и экранная кнопка действия; диагностические функции
задают начальные позиции и шаг времени. Ошибок JavaScript, предупреждений и внешних
запросов нет. Сенсорная кнопка проверена в эмуляции; реальное мобильное устройство и
слабый GPU не проверялись. Новый замер производительности и длительная прогулка
не проводились; результаты v10 сохранены как исторические.

## Файлы и продолжение

Самостоятельный HTML: [хутор v11](../../deliver/believe_it_farm_v11.html).
Подробные действия, состояния и кадры: [QA](../../qa/door-access-v11/).
Точка продолжения: [CODEX_HANDOFF.md](../../CODEX_HANDOFF.md).

Все 2690 файлов начальной инвентаризации сохранены, кроме десяти явно перечисленных
исходников, инструментов, документов и текущего dist. Снимок 130 файлов и 1066 файлов
соседних каталогов совпадают по SHA-256. Старые релизы, assets, архивы и QA не изменялись.

Архив `believe_it_farm_v11_update.zip` содержит готовый HTML, изменения исходников,
инструменты, документацию и весь новый QA со снимком before. Это обновление поверх v10;
для запуска HTML распаковывать исходники не требуется. Состав и хеши перечислены в
`release-manifest.json`, проверка CRC и SHA каждой записи в `archive-manifest.json`.

Следующая задача по плану: старое ведро в витрине, затем поза поглаживания собаки и
травинка газеты. Игровой день 1, сценарий, вступление и слайды 6–8 остаются вне этого прохода.
'''
(OUT / 'DOOR_ACCESS_REPORT.md').write_text(report, encoding='utf-8')
changed = ['src/farm/main.js', 'src/scenes/farm.js', 'src/scenes/farm_house.js',
           'tools/recovery-interactions.cjs', 'tools/environment-routes.cjs']
patch = ''.join(''.join(difflib.unified_diff(
    (QA / 'before' / name).read_text(encoding='utf-8').splitlines(keepends=True),
    (ROOT / name).read_text(encoding='utf-8').splitlines(keepends=True),
    fromfile='a/' + name, tofile='b/' + name)) for name in changed)
(OUT / 'door-access-v11.patch').write_text(patch, encoding='utf-8')

names = set(changed + ['deliver/believe_it_farm_v11.html', 'README.md', 'CODEX_HANDOFF.md',
                      'tasks/plan.md', 'tasks/todo.md', 'tests/grain-texture.test.mjs',
                      'package.json', 'package-lock.json', 'tools/build.mjs',
                      'tools/door-access-inventory.mjs', 'tools/door-access-regression.cjs',
                      'tools/door-access-integrity.mjs', 'tools/door-access-package.py'])
names.update(p.relative_to(ROOT).as_posix() for p in QA.rglob('*') if p.is_file())
names.update(p.relative_to(ROOT).as_posix() for p in OUT.iterdir() if p.is_file())
entries = {name: {'bytes': (ROOT / name).stat().st_size, 'sha256': digest(ROOT / name)} for name in sorted(names)}
manifest_name = 'outputs/door-access-v11/release-manifest.json'
(ROOT / manifest_name).write_text(json.dumps({**summary, 'archiveScope': 'Update over v10 with complete new QA and before snapshot', 'files': entries}, ensure_ascii=False, indent=2), encoding='utf-8')
expected = {**entries, manifest_name: {'bytes': (ROOT / manifest_name).stat().st_size, 'sha256': digest(ROOT / manifest_name)}}
archive = OUT / 'believe_it_farm_v11_update.zip'
with zipfile.ZipFile(archive, mode='x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for name in sorted(expected):
        z.write(ROOT / name, arcname=name)
with zipfile.ZipFile(archive) as z:
    require(z.testzip() is None, 'Archive CRC mismatch')
    require(len(z.namelist()) == len(expected) and set(z.namelist()) == set(expected), 'Archive membership mismatch')
    for name, info in expected.items():
        content = z.read(name)
        require(len(content) == info['bytes'] and hashlib.sha256(content).hexdigest() == info['sha256'], 'Archive entry mismatch: ' + name)
archive_info = {'file': archive.name, 'files': len(expected), 'bytes': archive.stat().st_size,
                'sha256': digest(archive), 'crcVerified': True, 'allEntrySha256Verified': True}
(OUT / 'archive-manifest.json').write_text(json.dumps(archive_info, indent=2), encoding='utf-8')
print(json.dumps(archive_info))
