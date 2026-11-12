# Image-generation prompt — Caecilia Gabriel, painted concept sheet

Use this to turn the v02 construction plates into a painted sheet in the v01 finish. It has not been run: no image generator was connected when v02 was made.

## Reference inputs, in priority order

1. `../v01/concept-preview.webp` — likeness, rendering style, palette. **Identity source.**
2. `plate-1-turnaround.png` — pose, proportions, garment landmarks, the three-quarter view. **Geometry source.**
3. `plate-2-head-and-expressions.png` — head from four sides, hair construction, expression ranges.
4. `plate-3-costume-and-materials.png` — collar, placket, cuff, boots, patch, materials.

Tell the generator: take the face, hair colour, skin and paint handling from input 1; take every measurement, view angle and construction detail from inputs 2–4. Where they disagree, input 1 wins on likeness and inputs 2–4 win on construction.

## Prompt

> Professional character concept sheet for 3D modelling, on warm light-grey paper with thin dark rules and serif capital headings, title "CAECILIA GABRIEL | BELIEVE IT | AGE 7 | 1922". Naturalistic, softly painted, muted earth palette, even diffuse studio light, no dramatic shadows, no stylisation.
>
> Subject: one seven-year-old girl from a farming family in Upper Bavaria, late March 1922. She must read unmistakably as a small child: 122 cm tall in boots, head 20 cm (about six head heights), large head, short neck, narrow sloping shoulders, slight tummy, straight sturdy lower legs, small soft hands. Not a teenager, not a miniature adult.
>
> Face: round-oval with full cheeks and a small rounded chin; high forehead; large wide-set hazel-brown eyes with a level, slightly serious gaze; soft straight light-brown brows; short, slightly upturned nose with a rounded tip; small closed mouth, lower lip a little fuller; light freckles across nose and cheeks; fair skin with a faint flush.
>
> Hair: fine, straight, medium chestnut brown; centre parting from forehead to nape; drawn back loosely over the top of the ears into two short three-strand plaits that begin behind the ear lobes and end at collar level, each tied with a small cream cotton bow, 6 cm loose tail below the bow; a few flyaway wisps at the temples.
>
> Clothing: grey-brown matte wool dress, hand-me-down, slightly faded. Cream cotton round two-piece collar meeting at centre front. Front placket with five dark horn buttons, three vertical pintucks on each side of it. Set-in long sleeves, full, gathered into a 3 cm cuff band with one horn button on the outer back of the wrist. Waist seam, gathered skirt to mid-calf (hem 29 cm above ground) with a visible let-down hem line. Back: plain yoke, inverted box pleat at centre, no back opening, collar continuous. One square hand-stitched patch of paler wool, 6 cm, low on the back of the skirt on her right side. Unbleached linen half apron, gathered into a 3 cm band, ending 6 cm above the dress hem, tied in a bow at centre back with two tails. Grey-olive ribbed hand-knit wool stockings. Brown leather lace-up ankle boots, 12 cm high, five eyelet pairs, stitched toe cap, back strap with pull loop, thin leather sole, low stacked heel, scuffed toes.
>
> Layout: (1) orthographic turnaround, four full-body views at identical scale on one ground line with a linear centimetre ruler — front, three-quarter at 35°, right side, back — neutral A-pose, arms about 17° from the body, palms toward the thighs. (2) Head close-ups: front, three-quarter, right profile, back. (3) Four restrained expressions: neutral, curious, thoughtful, frightened. (4) Details: collar and placket, sleeve and cuff, button and stitching, boots from side, front, back and underneath (hobnailed sole), patch, apron bow. (5) Material swatches: wool, worn wool, linen, cream cotton, knit stocking, leather.
>
> Every view shows exactly the same child, the same garments, the same colours. Five buttons in every view. Plaits forward over the shoulders in every view.

## Negative prompt

> teenager, adult proportions, long legs, make-up, modern haircut, fringe, loose hair, dirndl bodice, lacing, embroidery, edelweiss, alpine hat, jewellery, zip, snap fasteners, elastic, rubber sole, lugged sole, sneakers, bright colours, glossy fabric, anime, cartoon, exaggerated expression, open-mouthed scream, perspective distortion, dynamic pose, different faces between views, six buttons, back zipper, text errors, garbled labels

## Check before accepting an output

- Same face in all views, and it is the v01 face.
- Five buttons; front opening only; continuous back collar.
- Hem, apron hem, waistband, boot top at the heights in `design-notes.md` §6.
- Patch on the wearer's right at the back, nowhere else.
- Ruler is linear.
