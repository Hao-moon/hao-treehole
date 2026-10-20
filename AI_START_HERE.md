# AI recreation guide

The complete distributable site is in this repository. Reproduce it by cloning and running, not by regenerating its screenshots or guessing geometry.

## Entry points

| Task | Files |
| --- | --- |
| Start locally | `server.mjs`, `site/index.html` |
| App panels / services | `site/js/hideout.js` |
| Room / picking / live layers | `site/js/room.js`, `stage.js`, `geometry.js`, `room-surfaces.js` |
| Worlds / transition | `world-theme.js`, `world-transition.js`, `scene-capture.js`; `site/css/world-*.css`, `ghostblade.css` |
| Audio continuity | `background-music.js`, `player.js`, `disc-motion.js` |
| Reading | `reader.js`, `reader-model.js`, `reader-turn.js` |
| Screen wallpaper | `computer.js`, `computer-model.js` |
| Plants / sculpture | `plant*.js`, `figure-library.js`, `figure-engine.js` |
| Demo data | `music-library.js`, `game-library.js`, `board.js` |
| Offline generated art | `scripts/generate-demo-assets.py`, `blender/render_demo.py`, `scripts/package-renders.py` |

File names in the table are relative to `site/js/` unless another path is shown. `asuka`, `eva02`, `persona` and `ghostblade` are legacy internal keys; the public resources are original neutral demos. Display names may be edited separately from these keys.

## Minimum recreation

1. `git clone https://github.com/Hao-moon/hao-treehole.git` into a new directory.
2. Check `node --version` (20+); run `node server.mjs` there.
3. Open `http://127.0.0.1:4173/`. If busy, set another `PORT` without killing another process.
4. Check the second world via the red beacon. BGM should keep playing at its existing position.
5. Open a book and try the included original demo text. Imported files remain local to this browser.

For a UI-only customization, do not rebuild Blender assets. Change text, CSS or the relevant JS component. Changes to offline geometry, camera, desk material or baked lighting require re-rendering and matching hotspot projections; see ASSETS.md. Committed pre-rendered backgrounds are sufficient for ordinary running and theming.

## Validation

Run `node --check` on changed JS and targeted `node --test tests/<relevant>.test.mjs` files. The full fast unit suite is `node --test tests/*.test.mjs`. After changing shared room lifecycle, visually check both directions of world switching and confirm audio remains continuous. Do not read private browser storage to generate a public fixture.

World switching separates preparation from the visible reveal (`transition-sequence.js`). Keep expensive renderer creation, environment processing and first renders before that reveal. `scene-resources.js` caches immutable scene data and the hit-map readback; clone data before modifying it. `room.prepareReveal()` settles the live layers, while `setTransitioning()` pauses visual work without pausing audio. High-resolution upgrades resume after the transition. For local performance checks only, append `?transitionDebug=1` (or `&transitionDebug=1`); phase timings and frame gaps are logged to the browser console, with no telemetry.

## Publishing a fork

Keep the code license, upstream notices and asset attribution. Self-imported files are not automatically redistributable. Static hosting should serve `site/` at a domain root; subdirectory hosting needs base-path adaptation. The default local server is a development server, not a public production service.
