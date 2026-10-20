# Working on this repository

- Read README.md, AI_START_HERE.md and NOTICE.md first. This is the public demo edition, not the author's private media installation.
- Prefer small changes. Preserve the working desk layout and functionality unless the user requests otherwise.
- Start with `node server.mjs`; dependencies are vendored. Do not install or introduce an AI API for normal operation.
- Keep audio instances alive during in-page world changes. Do not implement a normal world switch using location reload or full navigation.
- The runtime paths begin at `/`. Check both the default URL and `?world=ghostblade` after editing shared scene/theme code.
- Do not commit browser data, user uploads, credentials, .env files, paid media, copyrighted reference art or local process screenshots.
- Add only project-created or clearly redistributable demo assets; document additions in ASSETS.md and refresh the manifest.
- Do not change internal object/theme IDs casually; they are also used by saved browser data, projected hotspot metadata and GLB parts.
- Use focused checks for changed behavior. Do not create repeated full browser test loops for a small visual change.
- Preserve upstream notices when editing adapted helpers or vendored dependencies. Vendored patches should remain reproducible via scripts/vendor-*.mjs.
- Never deploy or publish user modifications unless requested. Do not terminate another service to free a port; choose a different port.
