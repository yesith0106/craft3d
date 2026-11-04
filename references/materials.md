# Materials and light

## Base values (MeshStandardMaterial)

| Surface | color | metalness | roughness |
|---|---|---|---|
| Industrial enamel, white | #dddbd4 | 0 | 0.45–0.5 |
| Machine grey | #71767c / #a8acb0 | 0 | 0.5–0.55 |
| Dark primer, frames | #393c40 | 0 | 0.6 |
| Safety yellow | #c79a2c | 0 | 0.55 |
| Polished chrome rod | #c6c9cd | 1 | 0.12–0.2 |
| Machined steel | #b9bcc0 | 1 | 0.3 |
| Cast / forged iron | #585c61 | 1 | 0.42–0.5 |
| Rubber, hose | #1d1e20 | 0 | 0.85–0.9 |
| Concrete | texture, #a39d94 base | 0 | 0.9–0.95 |
| Emissive indicator | #ff3326, emissive 1.2–1.6 | 0 | 0.3 |

Paint is never metallic. Real white paint is not #ffffff: keep it at or below #e0e0e0, or it blows out under any sun.

## The wear shader (`lib/wear.js`)

`makeWorn({color, rough, painted = true, bare, metal, seed, dent})`, with the global `WEAR.uDamage.value` running 0 to 1.

What it does, in order of how damage builds up:

- **Edge chipping:** exact distance to the part's own box edges, in mm (from the `bbc`/`bbh` attributes), so a chip band is the same size on a bolt and on a hull.
- **Clustered chips:** warped noise, so chips are jagged and gather in "knock zones" instead of spreading evenly.
- **Chip rim:** a darker ring of lifted paint, and a 0.4 mm paint-thickness step in the normal.
- **Scratches:** two crossing directions, in clusters, with bright bare-metal lines that are rougher at the edges.
- **Rust:** only where paint is gone, with brown streaks running down below the chips.
- **Grime:** rises from the ground (rest-space y below 900 mm).
- **Soot:** patches, plus burns around impacts.
- **Impact craters:** a dented bowl with the paint blown off. The count grows with damage.

Parameters per material:

- `seed`: different for every material, so parts don't share one wear pattern.
- `bare`: the metal under the paint. Use a darker grey than the paint for dark parts and #8e9298 for white parts.
- `dent`: how much relief. 1 for armour, 0.15–0.3 for machined or polished parts.
- `painted: false` for raw metal. It still gets scratches, grime and some rust.

Rules:

- Call `bakeRest(root)` once, after everything is placed, in a rest pose. The wear is anchored to where each vertex sat then, so it travels with the part when it moves.
- Presets: factory 0.04, worn 0.45, battle 0.92. Check all three in screenshots. 0.45 should read as "used", not "wrecked".
- If chips look like a camouflage pattern (big soft blobs), the bare metal is too bright or the rust too saturated. Darken `bare` and keep rust brown, not orange.
- If speckle appears everywhere even at low damage, check every `smoothstep` for reversed edges first.

## Light

- **Studio** (`mode: 'studio'`): AgX tone mapping, room-light reflections at 0.55, key sun 2.4, cool fill, strong rim from behind. Use it to judge form and wear.
- **Outdoor** (`mode: 'outdoor'`): ACES at exposure 0.5, physical sky, image light from the same sky at 0.28, hemisphere at 0.25, haze 0.0115. If everything looks blue-white and flat, the environment or hemisphere is too strong. Lower them before touching materials.
- Shadows follow the subject (`stage.follow(p)`); keep the shadow box tight (±3.5 m studio, ±15 m outdoor) so 4096² stays sharp.
- AO radius: about 0.2 m for a model and 0.35 m for a world. Keep transparent cards out of AO (`stage.fx`).
