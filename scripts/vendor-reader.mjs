import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('site/vendor/reader/', root), { recursive: true });
await mkdir(new URL('licenses/reader/', root), { recursive: true });
for (const [source, target] of [
  ['node_modules/epubjs/dist/epub.min.js', 'site/vendor/reader/epub.min.js'],
  ['node_modules/jszip/dist/jszip.min.js', 'site/vendor/reader/jszip.min.js'],
  ['node_modules/epubjs/license', 'licenses/reader/epubjs-BSD-2-Clause.txt'],
  ['node_modules/jszip/LICENSE.markdown', 'licenses/reader/jszip-MIT-GPL.txt'],
  ['node_modules/page-flip/LICENSE', 'licenses/reader/page-flip-MIT.txt'],
]) await copyFile(new URL(source, root), new URL(target, root));
// Upstream 2.0.7 leaves its frame loop and resize listener alive after destroy.
// These exact, version-checked patches release the transient animation surface.
let flip=await readFile(new URL('node_modules/page-flip/dist/js/page-flip.module.js',root),'utf8');
for(const [before,after] of [
  ['start(){this.update();const t=e=>{this.render(e),requestAnimationFrame(t)};requestAnimationFrame(t)}','start(){this.update();this.stopped=false;const t=e=>{if(this.stopped)return;this.render(e);if(!this.stopped)this.frameId=requestAnimationFrame(t)};this.frameId=requestAnimationFrame(t)}stop(){this.stopped=true;cancelAnimationFrame(this.frameId)}'],
  ['destroy(){this.ui.destroy(),this.block.remove()}','destroy(){this.render.stop(),this.ui.destroy(),this.block.remove()}'],
  ['destroy(){this.app.getSettings().useMouseEvents&&this.removeHandlers(),this.distElement.remove(),this.wrapper.remove()}','destroy(){window.removeEventListener("resize",this.onResize),this.app.getSettings().useMouseEvents&&this.removeHandlers(),this.distElement.remove(),this.wrapper.remove()}'],
]){if(!flip.includes(before))throw new Error('PageFlip vendor patch no longer matches pinned 2.0.7');flip=flip.replace(before,after);}
await writeFile(new URL('site/vendor/reader/page-flip.module.js',root),flip);
console.log('Local EPUB reader and licenses copied.');
