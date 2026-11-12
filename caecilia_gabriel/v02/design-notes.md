# Caecilia Gabriel — design notes (v02)

Believe It · Caecilia Gabriel, 7 years old · rural Upper Bavaria · late March 1922.

v02 is a development of `../v01`, not a redesign. Nothing in `v01` was changed.

## 1. What the repository contains

The whole repository is one folder, `caecilia_gabriel/v01`:

| Asset | What it is | Opened and inspected |
|---|---|---|
| `concept-preview.webp` (1536 × 1024) | The v01 concept sheet: front / right side / back, face front and profile, hands, hair, dress, apron, boots, palette, size table | yes — primary reference |
| `caecilia_gabriel_v01.glb` (489 k triangles, 50 parts) | 3D model built from that sheet | yes — rendered orthographically from four sides, see `reference/` |
| `face.png`, `hair_scalp.png`, `ear.png`, `eye.png` | Projected head textures | yes |
| `wool`, `linen`, `collar`, `stocking`, `leather`, `patch`, `hair`, `skin` `.png` + normal maps | Tiling material maps | yes |
| `textures.json`, `model-manifest.json` | Material roughness, projection data, part list | yes |

**Not in the repository:** any asset or description of Viktoria Gabriel or other family members, any other character, any environment art, any written character description or art-direction document, and the original `caecilia_gabriel_concept_v01.png` that `textures.json` names as its source (only the 1536 px preview is present). Family resemblance and the game-wide style could therefore not be checked against anything; the only evidence of the art direction is the v01 sheet itself. The image attached to the task is the same picture as `concept-preview.webp`.

## 2. Art direction, as far as v01 shows it

Grounded, naturalistic and quiet: realistic child proportions, a muted earth palette (grey-brown wool, unbleached linen, cream cotton, brown leather), matte materials, soft even light, no stylisation of anatomy, no decorative Tracht elements. The sheet itself is a technical plate on warm grey paper with serif capitals and thin rules. v02 keeps that palette, that restraint and that page grammar.

## 3. Identity — what must not change

- Round-oval child's face, full cheeks, small rounded chin, high forehead.
- Large, wide-set eyes with a level, slightly serious gaze; soft, fairly straight brows.
- Short, slightly upturned nose with a rounded tip; small closed mouth, lower lip a little fuller.
- Light freckles over the nose and cheeks, faint flush on the cheeks, fair skin (#D0AE95).
- Fine straight chestnut-brown hair (#534033), centre parting, two short plaits ending at collar level, each tied with a small cream bow; loose wisps at the temples.
- Grey-brown long-sleeved wool dress with a cream round collar, a buttoned front placket flanked by vertical pintucks, full sleeves gathered into buttoned cuffs, gathered skirt to mid-calf.
- Unbleached linen half apron tied in a bow at the back.
- One square patch on the back of the skirt, wearer's right.
- Grey-olive wool stockings; brown lace-up ankle boots with a toe cap.
- 122 cm in boots, 20 cm head (6.1 head heights), mild A-pose.

## 4. Inconsistencies found in v01 and how v02 settles them

| # | v01 says | v01 also says | v02 decision |
|---|---|---|---|
| 1 | Height ruler on the turnaround | The ruler is not linear: 0–50 cm takes about 7.9 px/cm, 50–122 cm about 10.3 px/cm | Heights are taken from the drawn silhouette scaled to 122 cm, which is also what the GLB did (`dimensionPolicy`). Dress hem 29 cm, apron hem 35.5 cm, waistband 73.6–76.6 cm, boot top 12.3 cm. If the ruler is trusted instead, the hem would sit near 35 cm (at the knee). |
| 2 | "5 buttons" (dress detail, GLB) | Six buttons drawn on the front view | 5 buttons, Ø 1.1 cm, 4 cm apart. |
| 3 | Front opening with placket | Back view shows a centre-back line and a split collar with a fastening | One opening, in front. The back line becomes an inverted box pleat under a yoke; the collar is continuous across the back. |
| 4 | Plaits lie in front of the shoulders (front view, face close-up) | Plaits lie behind the shoulders (back view, hair detail) | Default rest is forward over the shoulders, bows at collar level. Plaits are a secondary-motion element and may swing behind. |
| 5 | "28 cm (braid)" | Drawn plaits are roughly 12 cm of hanging plait plus a 6 cm tail | Drawn length kept (three views and two close-ups agree). |
| 6 | Apron "46 cm" long | Apron ends about 6 cm above the hem in all three views (≈ 41 cm) | 41 cm including the 3 cm band. |
| 7 | Apron "34 cm" wide | About 19 cm at the band, 30 cm at the hem on the front view | 34 cm is the flat cloth width, gathered to the band; it wraps to ±80° at the waist and ±50° at the hem. |
| 8 | Iris swatch #75705D (grey-olive) | Painted eyes read brown-hazel | Hazel: grey-olive outer iris, brown towards the pupil, dark rim. **Needs the owner's word.** |
| 9 | Painted hair is chestnut #534033 | `face.png` in the GLB carries lighter, sandier hair and a broader face than the painting | The painted concept is treated as the truth; the GLB head is not. |
| 10 | Patch drawn low on the wearer's right (back view) | Patch drawn centred (dress detail), label garbled ("6 ε cm", "Ø 1 button") | 6.5 × 6 cm, wearer's right, 34.5–40.5 cm above ground. No button on it. |
| 11 | Palette lists "THREAD / LACES #A6987F" twice and "WOOL WEAR", "HORNS BUTTONS" | — | Read as: thread/laces, worn wool highlight, horn buttons. |
| 12 | Three views only | — | Three-quarter view added (35°). |
| 13 | Collar round, buttons dark, apron and skirt gathered, boots with toe cap and heel (painting) | GLB: pointed collar, wool-coloured buttons, ungathered apron and skirt, slab-soled boots without toe cap, bows pinned to the chest | Painting followed in every case. |

## 5. What was refined

- **Anatomy.** One measurement set drives every view (see §6), so head size, shoulder width, limb length and garment landmarks cannot differ between views. Child proportions are kept: large head, short neck, narrow sloping shoulders, slight tummy, straight sturdy lower legs.
- **Closure logic.** A single front opening; continuous back collar; yoke and pleat at the back.
- **Boots.** v01's detail shows a thick, lugged, rubber-looking sole and speed-lacing that read as a modern work boot. v02 keeps the silhouette, toe cap, five eyelet pairs and back strap, and gives them a thin leather sole, a low stacked heel and a hobnailed underside.
- **Wear.** Kept to what v01 shows (one patch) plus plausible rubbing at hem, cuffs, elbows and toes. Nothing added that v01 does not support: no shawl, no hat, no jewellery, no embroidery.

## 6. Measurements (cm, in boots)

| Landmark | Height | | Dimension | Value |
|---|---|---|---|---|
| Crown | 122 | | Head height / skull width / depth | 20 / 14.5 / 17.5 |
| Eye line | 110 | | Face width | 12.8 |
| Chin | 102 | | Interpupillary distance | 6.0 |
| Shoulder point | 95.4 | | Shoulders, body / with sleeves | 26 / 29 |
| Top button … bottom button | 94.6 … 78.6 | | Chest / waist (v01 table) | 58 / 56 |
| Apron band | 76.6 – 73.6 | | Arm, shoulder to wrist | 37 |
| Wrist | 61.6 | | Hand length / width | 13 / 5.6 |
| Fingertips | 49 | | Skirt hem, width / depth | 41 / 32 |
| Patch | 40.5 – 34.5 | | Boot length / height | 20.5 / 12.3 |
| Apron hem | 35.5 | | Plait width | 2.3 |
| Dress hem | 29 | | Hair ribbon | 1.2 |
| Boot top | 12.3 | | Cuff band | 3 |

The exact section data (every ellipse of the body, head, boots) is in `source/lib.mjs`.

## 7. Historical notes

Checked against sources:

- Everyday dresses for girls were dark; new clothes were rare, and children wore altered or handed-down garments that mothers and grandmothers mended ([Zeitklicks, Weimarer Republik](https://www.zeitklicks.de/weimarer-republik/alltag/kindheit-und-jugend/die-kleidung-der-kinder)). This supports the dull wool, the deep let-down hem and the patch.
- Fashionable hems in the 1920s rose to the knee; calf length was the older, pre-war length (same source). A mid-calf hem on a country child in 1922 is therefore conservative or grown-into rather than fashionable, which suits her.
- Hair bows were a normal part of girls' dress (same source; [histclo, German 1920s](https://histclo.com/country/ger/proj/chron/1920/gar/og/20og-mar.html), which also notes that high-top shoes were still common).
- Aprons stayed part of rural everyday dress well into the 20th century; everyday ones were made of hard-wearing, often reused cloth ([Fränkisches Freilandmuseum Bad Windsheim](https://freilandmuseum.de/entdecken/neuigkeiten-und-blogs/einzeleintrag/eine-kinderschuerze-schuetzt-und-schmueckt)).
- Long hand-knit stockings were held up by straps buttoned to a *Leibchen* ([Heimatgeschichtsverein Aidlingen](https://heimatgeschichtsverein-aidlingen.de/weisst-du-noch-die-schrecklichen-leibchen/); a later example is in the [Bayerisches Nationalmuseum](https://www.bayerisches-nationalmuseum.de/sammlung/00223369)). Hence smooth stockings with no visible garter.

Not confirmed by the sources read, and marked as such:

- The same museum article describes smock (*Kittelschürze*) and bib aprons for children; it does not mention waist-only aprons. The half apron is kept because v01 establishes it, but a bib or smock apron would be the better-documented choice.
- Hobnailed leather soles and an iron heel plate are my own period assumption for country boots; no source was fetched for it.
- Corozo/horn buttons, machine lockstitch seams and a front-buttoned bodice are plausible for 1922 but were not individually sourced.

## 8. How the plates were made, and their limit

No image-generation tool was connected to this workspace. The plates are therefore **construction drawings**, not paintings: a small parametric model of the character (elliptical body sections, one face profile, landmark points) is projected orthographically at 0°, 35°, 90° and 180° and drawn as vector art, using the v01 palette and the v01 material maps as fills. That guarantees consistency between views and gives exact measurements, but the rendering is flat and schematic — it does not reach the painted finish of v01. The face in particular is a proportion and landmark guide; the v01 face close-up remains the likeness reference.

`generation-prompt.md` holds a prompt for producing a painted version of these plates with an image generator, using the v01 sheet and the v02 plates as inputs.

## 9. Open questions for the project owner

1. Eye colour (§4 #8).
2. Hem height: silhouette (29 cm, used here and in the GLB) or printed ruler (≈ 35 cm)?
3. Half apron (v01) or the better-documented bib/smock apron?
4. Hobnailed leather sole instead of the v01 lug sole — acceptable?
5. Are there Viktoria or other character references outside this repository? None could be compared.
