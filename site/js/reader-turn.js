import { PageFlip } from '../vendor/reader/page-flip.module.js';

const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const PAPER_INSET = 8;
const TURN_MS = 820;

function publicationSnapshot(doc) {
  const html = doc.documentElement.cloneNode(true);
  const styles = html.querySelectorAll('style');
  // epub.js inserts its font/theme rules through CSSOM. outerHTML alone leaves
  // those style tags empty and would briefly turn the moving paper white.
  doc.querySelectorAll('style').forEach((source, index) => {
    try { if (source.sheet) styles[index].textContent = [...source.sheet.cssRules].map(rule => rule.cssText).join('\n'); }
    catch { /* Keep the serialized stylesheet when CSSOM access is unavailable. */ }
  });
  return `<!doctype html>${html.outerHTML}`;
}

// Snapshot only the displayed spread. The existing reader still owns pagination,
// selection and saved locations; StPageFlip supplies the moving sheet and shadows.
function capturePages(body, columns) {
  const viewport = body.querySelector('.reader-viewport');
  const width = body.clientWidth, height = body.clientHeight - PAPER_INSET * 2;
  const leafWidth = width / columns, bounds = viewport.getBoundingClientRect();
  const ready = [], pages = [];
  for (let side = 0; side < columns; side++) {
    const leaf = document.createElement('div');
    leaf.className = `reader-turn-leaf reader-turn-${columns === 1 ? 'single' : side ? 'right' : 'left'}`;
    leaf.dataset.density = 'soft';
    leaf.style.width = `${leafWidth}px`; leaf.style.height = `${height}px`;
    const spread = document.createElement('div'); spread.className = 'reader-turn-spread';
    Object.assign(spread.style, { width: `${width}px`, height: `${height}px`, left: `${-side * leafWidth}px` });
    const clip = document.createElement('div'); clip.className = 'reader-turn-viewport';
    Object.assign(clip.style, { left: `${viewport.offsetLeft}px`, top: `${viewport.offsetTop - PAPER_INSET}px`, width: `${viewport.clientWidth}px`, height: `${viewport.clientHeight}px` });
    const text = viewport.querySelector('.reader-text');
    if (text) clip.append(text.cloneNode(true));
    else {
      // Keep imported EPUB markup inside the same script-free sandbox and CSP.
      // Copying its CSS into the host document would lose that isolation.
      for (const source of viewport.querySelectorAll('iframe')) {
        const doc = source.contentDocument, rect = source.getBoundingClientRect();
        if (!doc || rect.right <= bounds.left || rect.left >= bounds.right) continue;
        const copy = document.createElement('iframe');
        copy.setAttribute('sandbox', 'allow-same-origin'); copy.setAttribute('aria-hidden', 'true'); copy.tabIndex = -1;
        Object.assign(copy.style, { position: 'absolute', left: `${rect.left - bounds.left}px`, top: `${rect.top - bounds.top}px`, width: `${source.clientWidth}px`, height: `${source.clientHeight}px`, pointerEvents: 'none' });
        ready.push(new Promise(resolve => {
          const timer = setTimeout(resolve, 800);
          copy.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
        }));
        copy.srcdoc = publicationSnapshot(doc);
        clip.append(copy);
      }
    }
    spread.append(clip); leaf.append(spread); pages.push(leaf);
  }
  return { pages, ready: Promise.all(ready), width, height, leafWidth };
}

export function createReaderTurn(root) {
  let serial = 0, current = null;
  function cancel() {
    serial++;
    if (current) {
      clearTimeout(current.timer);
      current.flip?.destroy(); current.layer.remove(); current.resolve?.();
      current = null;
    }
    delete root.dataset.turning;
  }
  return {
    get busy() { return current !== null; },
    cancel,
    async run(direction, advance) {
      if (current) return;
      const body = root.querySelector('.reader-body');
      if (!body || root.dataset.mode !== 'pages' || matchMedia('(prefers-reduced-motion: reduce)').matches) { await advance(); return; }
      const token = ++serial, columns = Number(root.dataset.columns) === 2 ? 2 : 1;
      const before = capturePages(body, columns);
      const layer = document.createElement('div'); layer.className = 'reader-turn-layer';
      layer.setAttribute('aria-hidden', 'true'); layer.inert = true;
      const hold = document.createElement('div'); hold.className = 'reader-turn-hold';
      hold.append(...before.pages); layer.append(hold); body.append(layer);
      const job = { layer, flip: null, timer: null, resolve: null }; current = job;
      root.dataset.turning = 'preparing';
      try {
        await before.ready;
        if (token !== serial) return;
        layer.dataset.ready = 'true';
        await advance(); await frames();
        if (token !== serial) return;
        const after = capturePages(body, columns);
        const staging = document.createElement('div'); staging.className = 'reader-turn-staging';
        staging.append(...after.pages); layer.append(staging);
        await after.ready;
        if (token !== serial) return;
        const host = document.createElement('div'); host.className = 'reader-turn-book'; layer.append(host);
        const flip = new PageFlip(host, {
          width: before.leafWidth, height: before.height, size: 'fixed', autoSize: false,
          usePortrait: columns === 1, startPage: direction > 0 ? 0 : columns,
          showCover: false, drawShadow: true, maxShadowOpacity: .3,
          flippingTime: TURN_MS, useMouseEvents: false, showPageCorners: false,
          mobileScrollSupport: true, startZIndex: 1,
        });
        job.flip = flip;
        await new Promise(resolve => {
          job.resolve = resolve;
          let started = false;
          flip.on('changeState', event => { if (started && event.data === 'read') resolve(); });
          flip.on('init', async () => {
            await frames();
            if (token !== serial) return;
            hold.remove(); staging.remove(); started = true; root.dataset.turning = direction > 0 ? 'forward' : 'back';
            direction > 0 ? flip.flipNext('bottom') : flip.flipPrev('bottom');
          });
          flip.loadFromHTML(direction > 0 ? [...before.pages, ...after.pages] : [...after.pages, ...before.pages]);
          // A cancelled layout or a publication with no following page must never
          // leave an invisible input shield or an animation loop behind.
          job.timer = setTimeout(resolve, TURN_MS + 1200);
        });
      } finally { if (token === serial) cancel(); }
    },
  };
}

/** Full-page taps without stealing drag selection, long-presses or links. */
export function bindReaderPageTaps(target, { signal, enabled, turn, bounds, offset = () => 0 }) {
  let pressed = null;
  const interactive = node => node?.closest?.('a,button,input,textarea,select,[contenteditable=true],.reader-drawer,.reader-excerpt-bar');
  target.addEventListener('pointerdown', event => {
    pressed = enabled() && event.button === 0 && event.isPrimary !== false && !interactive(event.target)
      ? { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() } : null;
  }, { signal });
  target.addEventListener('pointermove', event => {
    if (pressed && (event.pointerId !== pressed.id || Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 7)) pressed = null;
  }, { signal });
  target.addEventListener('pointercancel', () => { pressed = null; }, { signal });
  target.addEventListener('click', event => {
    const down = pressed; pressed = null;
    if (!down || !enabled() || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || interactive(event.target) || performance.now() - down.at > 500) return;
    const doc = target.ownerDocument || target;
    if (doc.getSelection()?.toString().trim()) return;
    const rect = bounds(), x = event.clientX + offset();
    turn(x < rect.left + rect.width / 2 ? -1 : 1);
  }, { signal });
}
