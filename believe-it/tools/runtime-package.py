"""Gate the v10 update on completed QA, and verify archive CRC and every entry's SHA."""
import difflib
import hashlib
import json
import math
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
qa = root / "qa/runtime-v10"
out = root / (sys.argv[1] if len(sys.argv) > 1 else "outputs/runtime-v10")
sources = ["src/farm/main.js", "src/scenes/farm_tex.js"]

def sha(p):
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def read(p):
    return json.loads(p.read_text(encoding="utf-8"))

def clean(r):
    assert not any(r.get(k) for k in ["failure", "errors", "warnings", "requests", "externalRequests"]), "Browser QA failed"

def passed(r, count):
    assert len(r["checks"]) == count and all(c["pass"] for c in r["checks"]), "Checks failed"

def write(p, text):
    with p.open("x", encoding="utf-8", newline="\n") as f:
        f.write(text)

def write_json(p, r):
    write(p, json.dumps(r, ensure_ascii=False, indent=2) + "\n")

inventory = read(qa / "inventory-before.json")
assert inventory["release"]["checkedManifestFiles"] == 24 and not inventory["release"]["mismatches"]
assert inventory["release"]["archiveMatches"] and inventory["release"]["distMatchesFarmV9"] and inventory["release"]["distMatchesViewerV14"]
integrity = read(qa / "integrity-release.json")
assert integrity["pass"] and all(integrity["checks"].values()), "Preservation audit failed"
assert integrity["sourceChanges"] == sources, "Unexpected production edits"
old_files = {f["path"]: f for f in inventory["files"]}
for name in sources:
    assert sha(qa / "before" / name) == old_files[name]["sha256"], "Baseline source changed"
farm = root / "deliver/believe_it_farm_v10.html"
farm_hash = sha(farm)
assert farm_hash == integrity["farmSha256"] == sha(root / "dist/browser/believe_it_farm.html")
assert sha(root / "deliver/believe_it_hands_v14.html") == old_files["deliver/believe_it_hands_v14.html"]["sha256"]
assert sha(root / "dist/browser/believe_it_hands.html") == old_files["dist/browser/believe_it_hands.html"]["sha256"]
geometry = read(qa / "geometry-after/checks.json")
placement = read(qa / "placement-after.json")
interactions = read(qa / "interactions-after/report.json")
routes = read(qa / "routes-after/report.json")
smoke = read(qa / "smoke-after/report.json")
for report, count in [(geometry, 24), (placement, 9), (interactions, 15), (routes, 18)]:
    passed(report, count)
for report in [interactions, routes, smoke]:
    clean(report)
assert smoke["production"] and smoke["canvasVisible"] and len(smoke["shots"]) == 4 and smoke["buildSha256"] == farm_hash
visual = read(qa / "visual-controlled-comparison/report.json")
assert visual["summary"]["pairs"] == visual["summary"]["pixelIdentical"] == 72 and visual["summary"]["different"] == 0
assert visual["geometryUnchanged"] and visual["afterSHA256"] == farm_hash
assert visual["beforeSHA256"] == sha(root / "deliver/believe_it_farm_v9.html")
for name in ["visual-v9-controlled", "visual-v10-controlled"]:
    r = read(qa / name / "report.json")
    clean(r)
    assert r["conditions"]["controlled"] and len(r["shots"]) == 144 and not r["geometry"]["bad"]
    assert all(s["beforeCapture"] == s["afterCapture"] for s in r["shots"]), "RAF advanced during capture"
    repeat = read(qa / (name + "-repeat") / "report.json")
    assert repeat["summary"]["pixelIdentical"] == 72 and repeat["summary"]["different"] == 0
startup = {n: read(qa / ("startup-" + n) / "report.json") for n in ["before", "grain", "after", "no-parallel"]}
for name, r in startup.items():
    assert len(r["runs"]) == (1 if name == "no-parallel" else 3)
    clean(r["summary"])
    for run in r["runs"]:
        clean(run)
        assert run["page"]["ready"] and not run["page"]["contextLost"] and not run["page"]["debug"]
assert startup["after"]["sha256"] == farm_hash, "Startup measured a different build"
assert startup["after"]["summary"]["readyMaxMs"] < startup["before"]["summary"]["readyMinMs"]
assert startup["no-parallel"]["conditions"]["hideParallel"] and not startup["no-parallel"]["runs"][0]["page"]["parallelShaderCompile"]
grain_before, grain_after = (read(qa / f"grain-{s}.json") for s in ["before", "after"])
assert grain_after["sourceSha256"] == sha(root / "src/scenes/farm_tex.js")
for a, b in zip(grain_before["samples"], grain_after["samples"], strict=True):
    assert all(a[k] == b[k] for k in ["mode", "width", "height", "bytes", "sha256", "magFilter", "minFilter", "wrapS", "wrapT", "generateMipmaps"])
mutation = read(qa / "mutation/report.json")
assert mutation["mutantExitCode"] != 0 and mutation["restoredExitCode"] == 0 and mutation["sourceRestored"]
assert mutation["sourceSha256"] == sha(root / "src/scenes/farm_tex.js")
perf_before, perf_after = (read(qa / f"performance-{s}.json") for s in ["before", "after"])
for r in [perf_before, perf_after]:
    clean(r)
    assert len(r["samples"]) == 18 and r["device"]["invalid"] == 0
    assert all(not s["contextLost"] and math.isfinite(s["fps"]) for s in r["samples"])
walk = read(qa / "walk-after/report.json")
clean(walk)
assert walk["sha256"] == farm_hash and walk["seconds"] == 360 and walk["measuredWallSeconds"] >= 360
assert len(walk["segments"]) == 12 and len(walk["memory"]) == 7
assert all(s["distance"] >= 5 and s["frames"] > 0 for s in walk["segments"])
assert walk["summary"]["gpuCountsStableInLastThreeMinutes"] and not walk["summary"]["contextLost"]
tail = walk["memory"][-3:]
assert len({m["gpu"]["programs"] for m in tail}) == 1, "Shader program count keeps growing"
summary = {"farm": "v10", "viewer": "v14 (unchanged)", "farmSha256": farm_hash,
           "startup": {n: r["summary"] for n, r in startup.items()},
           "startupReductionPercent": 100 * (1 - startup["after"]["summary"]["readyMedianMs"] / startup["before"]["summary"]["readyMedianMs"]),
           "geometry": read(qa / "visual-v10-controlled/report.json")["geometry"],
           "checks": {"textureGoldens": 2, "geometry": 24, "v8Regressions": 9, "interactions": 15, "doorRoutes": 18,
                      "exactVisualPairs": 72, "productionSmokeScenes": 4, "performanceSamples": 18},
           "performance": {"minFps": min(s["fps"] for s in perf_after["samples"]), "maxP95Ms": max(s["p95FrameMs"] for s in perf_after["samples"])},
           "walk": walk["summary"], "walkWallSeconds": walk["measuredWallSeconds"], "memory": walk["memory"],
           "preservation": integrity["checks"],
           "limitations": ["Only RTX 4060 / Edge headless at 1280x800 DPR 1 was measured", "VRAM bytes were not measured",
                           "Six-minute endurance is bounded evidence; all devices and all triangle pairs remain untested"]}
out.mkdir()
write_json(out / "runtime-summary.json", summary)
patch = "".join("".join(difflib.unified_diff((qa / "before" / name).read_text(encoding="utf-8").splitlines(keepends=True),
                 (root / name).read_text(encoding="utf-8").splitlines(keepends=True), fromfile="a/" + name, tofile="b/" + name)) for name in sources)
write(out / "runtime-v10.patch", patch)

lines = ["# Believe It: запуск и длительная работа v10", "",
         "Продолжена завершённая версия окружения v9. Изменены два производственных исходника:",
         "точное вычисление зерновой текстуры и предварительная параллельная компиляция шейдеров.",
         "Обе текстуры совпадают с v9 всеми RGBA-байтами; 72 пары камер совпали всеми пикселями.",
         "Геометрия, интерактивность, сюжетные границы и витрина v14 сохранены.", "",
         "Условия: RTX 4060, ANGLE D3D11, Edge headless, WebGL 2, 1280×800, DPR 1.",
         "Старт измерен на обычном HTML без dev-хуков, в свежем процессе на каждый запуск.",
         "Профили и диагностические сборки используются отдельно от итоговых замеров.", "",
         "| Вариант | Запусков | Медиана до готовности, с | Диапазон, с |",
         "|---|---:|---:|---:|"]
labels = {"before": "v9", "grain": "Только зерно", "after": "v10: обе оптимизации", "no-parallel": "KHR скрыт в QA: запасной путь"}
for name, r in startup.items():
    s = r["summary"]
    lines.append(f"| {labels[name]} | {len(r['runs'])} | {s['readyMedianMs']/1000:.3f} | {s['readyMinMs']/1000:.3f}–{s['readyMaxMs']/1000:.3f} |")
lines += ["", f"Сокращение медианы запуска: {summary['startupReductionPercent']:.1f}%. Результат относится к этой конфигурации.",
          "Без KHR проверен именно запасной путь через скрытие расширения в изолированной странице.",
          "Геометрия сцены: 528 объектов, 2 609 188 вершин, 1 288 733 треугольника; не упрощалась.", "",
          "| Короткие замеры (18 в каждой версии) | v9 | v10 |", "|---|---:|---:|",
          f"| Минимум FPS | {min(s['fps'] for s in perf_before['samples']):.2f} | {summary['performance']['minFps']:.2f} |",
          f"| Максимум p95 кадра, мс | {max(s['p95FrameMs'] for s in perf_before['samples']):.2f} | {summary['performance']['maxP95Ms']:.2f} |", "",
          "Шестиминутная прогулка использовала реальный W/S-ввод, нормальные коллизии,",
          "смену освещения и обоих режимов графики. Перед замером прогреты кухня, лес и двор.",
          f"Пройдено {walk['summary']['walkedMeters']:.1f} м; {walk['summary']['renderedFrames']} измеренных кадров;",
          f"{walk['measuredWallSeconds']:.3f} с; максимум p95 {walk['summary']['maxP95FrameMs']:.2f} мс.",
          "Ошибок, предупреждений, внешних запросов, краша страницы и потери WebGL-контекста нет.", "",
          "| Снимок после GC | JS heap, МиБ | CDP backingStorage, МиБ | Геометрии | Текстуры | Программы |",
          "|---|---:|---:|---:|---:|---:|"]
for m in walk["memory"]:
    lines.append(f"| {m['label']} | {m['heap']['usedSize']/2**20:.3f} | {m['heap']['backingStorageSize']/2**20:.3f} | {m['gpu']['geometries']} | {m['gpu']['textures']} | {m['gpu']['programs']} |")
lines += ["", f"Разброс JS heap за последние три минуты: {walk['summary']['lastThreeHeapRange']} байт",
          f"({walk['summary']['lastThreeHeapRange']/1024:.2f} КиБ); backingStorage — {walk['summary']['lastThreeBackingStorageRange']} байт.",
          "Счётчики renderer.info геометрий, текстур и программ постоянны во всех семи снимках.",
          "CDP backingStorage и JS heap не являются измерением VRAM. Шесть минут — ограниченная проверка.", "",
          "Первое асинхронное сравнение screenshot дало 17 несовпадений. Повторение неизменного v9",
          "дало 40 несовпадающих пар при одинаковых времени и камере; прямой PNG canvas был стабилен.",
          "Остановка RAF только в QA-странице на время снимка дала 72/72 точных пары v9/v10",
          "и 72/72 повторных пары каждой версии. Введённых допусков, масок и производственных правок ради QA нет.",
          "Внутренний механизм артефакта GPU/композитора не устанавливался; исходные результаты сохранены.", "",
          "Пройдены 2 теста текстур с проверкой чувствительности к мутации, 24+9 геометрических условий,",
          "15 взаимодействий, 18 дверных условий и четыре сцены обычного UI. Полные результаты: qa/runtime-v10/.",
          "Следующие задачи: слабые GPU/мобильные браузеры при наличии оборудования, затем отложенные",
          "ведро, поза поглаживания собаки и травинка газеты в витрине. Игровой день 1 исключён.", "",
          "Архив является обновлением поверх существующего v9/v14: два исходника, HTML, инструменты,",
          "документация, полный снимок before, отчёты/логи/CPU-профили и избранные кадры.",
          "Полная QA-история, включая все неудачные сравнения и остальные PNG, остаётся на диске",
          "и перечислена с SHA-256 в qa-index.json. Неизменённые assets и node_modules в обновление не входят.", "",
          "API компиляции: https://github.com/mrdoob/three.js/blob/r170/docs/api/en/renderers/WebGLRenderer.html", ""]
write(out / "PERFORMANCE_REPORT.md", "\n".join(lines))
qa_files = sorted(p for p in qa.rglob("*") if p.is_file())
qa_index = {"root": "qa/runtime-v10", "completeHistoryRetainedInWorkspace": True,
            "files": {p.relative_to(root).as_posix(): {"bytes": p.stat().st_size, "sha256": sha(p)} for p in qa_files}}
write_json(out / "qa-index.json", qa_index)
tools = ["tools/runtime-inventory.mjs", "tools/runtime-startup.cjs", "tools/runtime-diagnostic.mjs", "tools/runtime-grain.mjs",
         "tools/runtime-mutation.mjs", "tools/runtime-walk.cjs", "tools/runtime-compare.py", "tools/runtime-visual.cjs",
         "tools/runtime-visual-stats.py", "tools/runtime-integrity.mjs", "tools/runtime-package.py", "tools/build.mjs",
         "tools/environment-geometry.mjs", "tools/environment-capture.mjs", "tools/environment-views.json",
         "tools/placement-geometry.mjs", "tools/placement-smoke.cjs", "tools/recovery-interactions.cjs",
         "tools/environment-routes.cjs", "tools/recovery-performance.cjs"]
docs = ["README.md", "CODEX_HANDOFF.md", "tasks/plan.md", "tasks/todo.md", "package.json", "package-lock.json"]
releases = ["deliver/believe_it_farm_v10.html", "deliver/believe_it_hands_v14.html"]
items = set(sources + tools + docs + releases + ["tests/grain-texture.test.mjs"])
selected = {"attic-grain-day-enh.png", "kitchen-water-close-dusk-enh.png", "forest-path-night-enh.png"}
for p in qa_files:
    rel = p.relative_to(qa)
    if rel.parts[0] == "before" or p.suffix in {".json", ".log", ".cpuprofile"} or p.name == "handoff-before-final.md" or (
        p.suffix == ".png" and (rel.parts[0] in {"smoke-after", "walk-after"} or
                               rel.parts[0] in {"visual-v9-controlled", "visual-v10-controlled"} and p.name in selected)):
        items.add(p.relative_to(root).as_posix())
items.update(p.relative_to(root).as_posix() for p in out.iterdir() if p.is_file())
manifest = {"date": "2026-11-07", "farm": "v10", "viewer": "v14 (unchanged)",
            "checks": summary["checks"], "farmSha256": farm_hash,
            "onlyChangedProductionSources": sources,
            "archiveScope": "Update over v9/v14; before snapshot, all reports/logs/profiles and selected screenshots. Full workspace QA indexed separately.",
            "files": {n: {"bytes": (root / n).stat().st_size, "sha256": sha(root / n)} for n in sorted(items)}}
write_json(out / "release-manifest.json", manifest)
items.add((out / "release-manifest.json").relative_to(root).as_posix())
expected = {n: sha(root / n) for n in items}
target = out / "believe_it_farm_v10_update.zip"
with ZipFile(target, "x", compression=ZIP_DEFLATED, compresslevel=4) as archive:
    for name in sorted(items):
        archive.write(root / name, name)
with ZipFile(target) as archive:
    assert set(archive.namelist()) == items and len(archive.namelist()) == len(items)
    assert archive.testzip() is None, "Archive CRC failed"
    for name in archive.namelist():
        h = hashlib.sha256()
        with archive.open(name) as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
        assert h.hexdigest() == expected[name], "Archive entry SHA differs: " + name
archive_manifest = {"file": target.name, "files": len(items), "bytes": target.stat().st_size,
                    "sha256": sha(target), "crcVerified": True, "allEntrySha256Verified": True,
                    "fullQaFilesIndexed": len(qa_files)}
write_json(out / "archive-manifest.json", archive_manifest)
print(json.dumps({"out": str(out), "archive": archive_manifest, "checks": summary["checks"]}, ensure_ascii=False))
