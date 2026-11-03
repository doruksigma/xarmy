# Europa national miniature assets

The national models use the existing instanced model system. National helmet,
uniform, webbing, vehicle body, turret, gun-shield and truck-cab families retain
their national identity across research. Advanced iconic vehicle signatures appear
at visual tiers 2–3. These are period-inspired game miniatures,
not claims that a country manufactured every represented equipment type.

## Asset search and decision (2026-11-03)

The managed environment's enforced network policy allowed GitHub and GitHub raw
content. This was a bounded GitHub repository search, not a search of every asset
marketplace or the entire web. Repository search results and source/license files
were read; commercial game asset dumps were not downloaded.

| Query/source actually inspected | Result and reuse decision |
| --- | --- |
| [GitHub: `ww2 3d models`](https://github.com/search?q=ww2+3d+models&type=repositories) | Five repository results, including the original procedural Muster archive below. |
| [GitHub: `WWII models`](https://github.com/search?q=WWII+models&type=repositories) | 29 results; the first results page was inspected. Muster was the relevant reusable-model candidate. |
| [GitHub: `ww2 blender`](https://github.com/search?q=ww2+blender&type=repositories) | Four results, principally scenery/tools and a browser game; no replacement infantry/vehicle set selected. |
| [GitHub: `hoi4 unit models`](https://github.com/search?q=hoi4+unit+models&type=repositories) | No repository results for this exact query. This does not establish that no HOI4 models exist elsewhere. |
| [GitHub: `HOI4 models license`](https://github.com/search?q=HOI4+models+license&type=repositories) | Returned [Julienn-Modelling/HOI4-models-gpl](https://github.com/Julienn-Modelling/HOI4-models-gpl). Its `master/LICENSE` contains GPL v3; its description advertises animated models for HOI4. Asset authorship, individual provenance and integration terms were not established in this review. No models were downloaded or incorporated. It is not an official Paradox asset release. |
| [GitHub: `org:ParadoxInteractive hoi4`](https://github.com/search?q=org%3AParadoxInteractive+hoi4&type=repositories) | No repository results. No official HOI4 unit-model redistribution license was verified through this search. |
| [GitHub: `military models CC0`](https://github.com/search?q=military+models+CC0&type=repositories), [`wwii tank model license`](https://github.com/search?q=wwii+tank+model+license&type=repositories), [`ww2 3d models license`](https://github.com/search?q=ww2+3d+models+license&type=repositories) | No repository results for these exact queries. |

## Incorporated MIT source

[Muster — WWII Model Archive](https://github.com/Kenton-GMI/muster-ww2) was cloned
for source review outside this repository. The reviewed revision is
`7d2fa86ebc3b999eaf085831cdcd5dccefea63d4`.

- [README at the reviewed revision](https://github.com/Kenton-GMI/muster-ww2/blob/7d2fa86ebc3b999eaf085831cdcd5dccefea63d4/README.md) explicitly states that its models are procedurally authored in TypeScript/Three.js, without external meshes or texture images, and that the project is MIT licensed.
- [LICENSE](https://github.com/Kenton-GMI/muster-ww2/blob/7d2fa86ebc3b999eaf085831cdcd5dccefea63d4/LICENSE) grants reuse under MIT, copyright © 2026 Kenton Wang, with the copyright and permission notice retained.
- [Per-asset provenance](https://github.com/Kenton-GMI/muster-ww2/blob/7d2fa86ebc3b999eaf085831cdcd5dccefea63d4/docs/PROVENANCE.md) records original procedural construction and historical reference URLs. Those external historical pages were not fetched during this GitHub-only search.
- [M40 helmet source](https://github.com/Kenton-GMI/muster-ww2/blob/7d2fa86ebc3b999eaf085831cdcd5dccefea63d4/src/assets/germany/gear/helmet.ts) supplied the analytic `shellPoint` surface and its dimensional helpers: asymmetric dome, visor, flared side skirt and deeper neck guard.

The adaptation lives in
[`map3d-helmet-shell.ts`](../app/games/europa-war/strategy/map3d-helmet-shell.ts).
It retains the shell proportions while using 24 azimuth segments, eight shell
rings, a five-sided rolled edge, scale 2.35 and a head-local band offset of 0.53.
The shell and rim contain 313 vertices and 600 indexed triangles before the
existing model builder merges them into the infantry head. Country width is
bounded. The upstream hidden liner, chinstrap construction, material/texture
framework and runtime SDF generation are not imported. The full MIT notice is
served at [`/licenses/muster-ww2-MIT.txt`](../public/licenses/muster-ww2-MIT.txt).

Representative upstream Panzer IV turret/hull/track and infantry sources were
also inspected. They include substantially more detail, many small components,
large subdivisions, and model-specific skeleton, garment fitting and gear
contracts. No committed PNG/JPG/WebP previews were present in the reviewed clone.
They were not incorporated wholesale; that would require separate baking,
decimation, articulation and effect-anchor work. All other miniature geometry in
this change is authored in this project using its existing model builder.

## Validation

[`test-europa-national-models-browser.cjs`](../scripts/test-europa-national-models-browser.cjs)
uses decoded, validated public save imports and ordinary game controls. It checks
ten country comparisons at tiers 0 and 3 with identical cameras, research
isolation, a real civil-war country, unchanged saves, 390×844 touch controls for
Turkey and Germany, idle freezing and real combat.
Screenshots and canvas diagnostics are written to `EUROPA_ARTIFACT_DIR`.
The script requires Playwright plus Chromium; the cloud run resolves Playwright
from the prepared runtime through `NODE_PATH` and uses `/usr/bin/chromium`.
`EUROPA_CHROMIUM` can override that executable.

```sh
EUROPA_FIXTURES_ONLY=1 node scripts/test-europa-national-models-browser.cjs
EUROPA_BASE_URL=http://localhost:3000 node scripts/test-europa-national-models-browser.cjs
```

Unknown country identifiers cannot be imported as valid campaigns. The profile
resolver's bounded fallback is checked directly; national geometry and effect
anchor behavior are covered by the model unit tests. Browser diagnostics are
read-only, emitted after actual WebGL renders, and never alter simulation state.

The final production build passed type/lint checks. The 20-file visual suite
passed 177 tests (including the 52 focused model tests). The final browser run
passed all 30 desktop/mobile checks with no application/console errors:
`/workspace/scratch/europa-national-models-browser/report.json`.
This uses SwiftShader and mobile emulation, not a physical-device FPS guarantee.
