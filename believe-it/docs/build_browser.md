# Сборка браузерной демки

Для продолжения в этой папке зависимости уже установлены. Node.js 20.6+; Three.js 0.170.0, meshoptimizer 0.22.0, esbuild 0.28.2. Установочные скрипты повторять не требуется.

```sh
npm run build
node --test tests/*.test.mjs
```

Пять самостоятельных HTML в `dist/browser/`: `believe_it_farm.html`, `believe_it_hands.html`, `believe_it_caecilia.html`, `believe_it_viktoria.html`, `believe_it_caecilia_gabriel.html`. Сервер и Node.js игроку не нужны. Вступление хранится отдельно и этой командой не пересобирается.

Отдельные цели: `npm run build:farm`, `npm run build:viewer`, `npm run build:character`, `npm run build:viktoria`, `npm run build:caecilia-gabriel`.
Чтобы сохранить текущий dist при новой проверке:

```sh
node tools/build.mjs all qa/NEW-check/build
```

Использовать новое имя каталога. Относительный путь считается от корня проекта. Сборщик упаковывает существующие встроенные модели; он не запекает геометрию и не перезаписывает `deliver/`. Вступление не пересобирается.

## Цецилия-младшая v01

Готовые GLB и текстуры находятся в `assets/characters/caecilia_gabriel/v01/`. Обычная HTML-сборка использует их без перезапекания:

```sh
node tools/build.mjs caecilia-gabriel qa/NEW-check/build
node --test tests/*.test.mjs
node tools/caecilia-gabriel-preview.cjs qa/NEW-check/build/believe_it_caecilia_gabriel.html qa/NEW-check/views
node tools/caecilia-gabriel-regression.cjs qa/NEW-check/browser qa/NEW-check/build/believe_it_caecilia_gabriel.html
node tools/caecilia-gabriel-resize.cjs qa/NEW-check/resize qa/NEW-check/build/believe_it_caecilia_gabriel.html
```

При изменении формы головы сначала сохранить затрагиваемые исходники, ассеты и `qa/caecilia-gabriel-v01-2026-11-11/head-atlas.f32`. Порядок обновления: `node tools/caecilia_gabriel_atlas.mjs` → `python tools/caecilia_gabriel_textures.py` → `node tools/caecilia_gabriel_bake.mjs` → HTML → проверки. Атлас использует текущую SDF; текстуры читают его по фиксированному пути. Генератор текстур и bake пишут в v01 и обновляют встроенный `src/models/caecilia_gabriel_asset.gen.js`. Для правок только одежды без изменения головы достаточно bake и HTML. Все старые пробы сохранять; эти команды не нужны для простого просмотра или обычной сборки.

## Виктория v12

Текстуры и GLB уже готовы. Текущие генераторы лица, деталей, проекции волос и bake пишут в v12. После правок сохранить снимок затрагиваемых файлов и затем запускать только необходимый шаг:

```sh
node tools/viktoria_face_tex.mjs 1024
python tools/viktoria_detail_textures.py
node tools/viktoria_bake.mjs
node tools/build.mjs viktoria qa/NEW-check/build
node --test tests/*.test.mjs
node tools/viktoria-regression.cjs qa/NEW-check/browser qa/NEW-check/build/believe_it_viktoria.html
node tools/viktoria-resize.cjs qa/NEW-check/resize qa/NEW-check/build/believe_it_viktoria.html
```

Генератор лица перезаписывает производные face/eye текстуры v12; bake обновляет `assets/characters/viktoria/v12/viktoria_gabriel_v12.glb`, манифест и `src/models/viktoria_asset.gen.js`. Следующую итерацию сохранять отдельно. Унаследованные `v05/viktoria_gabriel_v04.glb` и `v09/viktoria_gabriel_v08.glb` не являются текущим экспортом. `viktoria_textures.py` пишет в прежний каталог v03, `viktoria_skin_match.py` — в v04; они не нужны для обычной сборки HTML и не обновляют v12.

Если меняется геометрия волос или линия их роста, перед bake нужно обновить координаты проекции и производные текстуры:

```sh
node tools/viktoria_hair_projection.mjs
node tools/viktoria_face_tex.mjs 1024
python tools/viktoria_detail_textures.py
```

Порядок для одновременной правки лица и волос: проекция волос → текстуры лица → текстуры деталей → bake → HTML → тесты. `hair-projection.f32` зависит от текущей геометрии; старые координаты нельзя использовать с новой формой волос. `viktoria_detail_textures.py` читает текущую `face.png` для согласования краёв: после изменения лица его нужно запускать снова перед bake. Он обновляет текстуры ушей, волос и их записи в `textures.json`; обычная сборка этих действий не требует.

Браузерные проверки используют отдельный Edge/Playwright без личного профиля. Настройки только для процесса: `BELIEVE_IT_BROWSER` и `BELIEVE_IT_PLAYWRIGHT`. Сеть блокируется. Не менять глобальную конфигурацию для запуска QA.

## Цецилия v06

**Обычная HTML-сборка использует сохранённый GLB v06 и воспроизводится точно.** Полного соответствующего генератора тела в перенесённых исходниках нет. Не запускать `caecilia_bake*.mjs`, `caecilia_textures.py` или старые генераторы лица ради обновления v06 до восстановления её исходников. Они могут заменить готовую модель ранней версией.

Тесты `caecilia-geometry.test.mjs` проверяют имеющийся ранний генератор. `caecilia-glb.test.mjs` отдельно проверяет архив v01 и точную сохранность встроенного v06. Эти тесты не подтверждают воспроизводимость v06 из генератора. Прежние браузерные QA-скрипты Цецилии ориентированы на v01; перед их применением к v06 нужно проверить ожидаемое имя скачивания и эталонный GLB.

## Исторические инструменты

`build.sh`, `build_farm.sh`, `build_intro.py` сохранены для истории. Старые упаковщики и инвентаризаторы имеют фиксированные пути и могут перезаписать прошлые результаты; автоматически их не запускать.

Подробное состояние и ограничения: [CODEX_HANDOFF.md](../CODEX_HANDOFF.md).
