# Attribution and distribution scope

Project application code, original parametric desk geometry, original geometric demo graphics, demo sculpture, synthesized audio and demo book are distributed under the root MIT license. See `ASSETS.md` and the generated asset manifest for what is included.

The geometry/viewport and WebGL stage helpers (`site/js/geometry.js`, `site/js/stage.js`) and Blender geometry helpers (`blender/kit.py`) are adapted from Evan Lin's [EdwinjJ1/personal-website](https://github.com/EdwinjJ1/personal-website), revision `84856a31b03f029705af99ecbec99b6638ff2b01`. Preserve `licenses/EdwinjJ1-MIT.txt` and `blender/REFERENCE-LICENSE` when redistributing these adaptations. No upstream personal photographs or identity content are included.

Vendored libraries retain their original licenses:

| Library | Version | License location |
| --- | --- | --- |
| Three.js | 0.186.1 | `site/vendor/three/LICENSE` (MIT) |
| epub.js | 0.3.93 | `licenses/reader/epubjs-BSD-2-Clause.txt` |
| JSZip | 3.10.1 | `licenses/reader/jszip-MIT-GPL.txt` (used under its MIT option) |
| StPageFlip | 2.0.7 | `licenses/reader/page-flip-MIT.txt` |

`scripts/vendor-reader.mjs` includes the documented fixed-version StPageFlip teardown patch, stopping its animation frame and resize listener on disposal.

This is the distributable **demo edition**, separate from the author's private installation. It does not bundle WLOP illustrations, game screenshots/covers, commercial soundtracks, franchise character models or the private repository's history and process screenshots. The public demo is not an official or affiliated work of those properties. Internal identifiers such as `persona`, `ghostblade`, `eva02` and `asuka` are retained as routing/data keys, not statements about included artwork or endorsement.

The turntable is project-created parametric geometry; no third-party turntable model was imported. Its general arrangement is based on a conventional DJ record player. Public markings and textures are original geometric designs.

Files imported by a visitor stay in their own browser and are not covered by this repository's license. Local system fonts are used to render original labels; font files are not included.
