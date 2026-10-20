import { parseTextBook, decodeBookText, validateReaderFile, safeReadingSettings, normalizeTextLocation, flattenToc, excerptMarkdown, READER_LIMITS, READER_PAGE_GEOMETRY, readingPageGeometry, epubSpreadTarget } from './reader-model.js';
import { listReaderBooks, saveReaderBook, readReaderState, saveReaderState } from './reader-storage.js';
import { createReaderTurn, bindReaderPageTaps } from './reader-turn.js';

const DEMO_ID = 'hideout-window-last-bus-v1';
let epubLoader;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const uid = () => globalThis.crypto?.randomUUID?.() || `reader-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const timeout = (promise, message, ms = 15000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(message)), ms);
  promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src; script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error('阅读组件加载失败，请刷新后重试。')); };
    document.head.append(script);
  });
}
async function epubLibrary() {
  if (!epubLoader) epubLoader = (async () => {
    if (!window.JSZip) await loadScript('/vendor/reader/jszip.min.js');
    if (!window.ePub) await loadScript('/vendor/reader/epub.min.js');
    return window.ePub;
  })().catch(error => { epubLoader = null; throw error; });
  return epubLoader;
}
function readyPublication(book) {
  return Promise.race([book.ready, new Promise((resolve, reject) => book.on('openFailed', () => reject(new Error('EPUB 内容不完整或已损坏，无法打开。'))))]);
}

// This hook runs on parsed book documents before epub.js serializes them into
// sandboxed iframes. Never enable allowScriptedContent for imported publications.
function sanitizePublication(doc) {
  doc.querySelectorAll('script,iframe,object,embed,form,base,meta[http-equiv]').forEach(node => node.remove());
  doc.querySelectorAll('*').forEach(node => {
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name) || /^(?:javascript|vbscript):/i.test(attr.value.trim())) node.removeAttribute(attr.name);
    }
  });
  const head = doc.querySelector('head');
  if (head) {
    const csp = doc.createElement('meta');
    csp.setAttribute('http-equiv', 'Content-Security-Policy');
    csp.setAttribute('content', "default-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob:; font-src blob: data:; media-src blob: data:; script-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'");
    head.prepend(csp);
  }
}

async function inspectEpub(buffer) {
  const ePub = await epubLibrary();
  let zip;
  try { zip = await window.JSZip.loadAsync(buffer); } catch { throw new Error('无法打开这本 EPUB，文件可能损坏或带有加密。'); }
  const files = Object.values(zip.files);
  if (files.length > 5000 || files.reduce((sum, item) => sum + (item._data?.uncompressedSize || 0), 0) > READER_LIMITS.unpackedBytes) throw new Error('这本 EPUB 展开后过大，请换一个较小的版本。');
  if (!zip.file('META-INF/container.xml')) throw new Error('文件缺少 EPUB 书籍目录，无法读取。');
  if (zip.file('META-INF/encryption.xml')) {
    const encryption = await zip.file('META-INF/encryption.xml').async('string');
    if (/EncryptedData/.test(encryption) && !/font|obfuscat/i.test(encryption)) throw new Error('这本书带有加密，暂时不能在这里阅读。');
  }
  const book = ePub(buffer.slice(0), { replacements: 'blobUrl' });
  book.spine.hooks.content.register(sanitizePublication);
  try {
    await timeout(readyPublication(book), '这本 EPUB 没有完整打开，请检查文件是否有效。');
    if (!book.spine?.spineItems?.length) throw new Error('这本 EPUB 没有可阅读的正文。');
    const metadata = await book.loaded.metadata;
    return { title: metadata.title, author: metadata.creator || '' };
  } finally { book.destroy(); }
}

function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A complete, locally persisted reader. Cleanup is synchronous and flushes progress. */
export function mountReader(root, options = {}) {
  const { notify = () => {}, legacyBooks = [], onExcerpt } = options;
  root.classList.add('hideout-reader');
  const controller = new AbortController();
  const { signal } = controller;
  const pageTurn = createReaderTurn(root);
  let destroyed = false, generation = 0, books = [], selected = null, state = null;
  let settings = safeReadingSettings(), chapter = 0, page = 0, pageCount = 1, pageStep = 1;
  let bookEngine = null, rendition = null, toc = [], location = null, selection = null;
  let resizeObserver = null, resizeTimer, saveTimer, drawerType = null, activeReading = false, attachTo = null;
  let restoring = false, importBusy = false, savedAt = 0;
  root.innerHTML = '<div class="reader-loading" role="status">正在打开私人藏书…</div>';

  function listen(target, event, fn, extra = {}) { target.addEventListener(event, fn, { signal, ...extra }); }
  function message(text, error = false) {
    if (destroyed) return;
    const target = root.querySelector('.reader-status');
    if (target) { target.textContent = text; target.dataset.error = String(error); }
    if (error) notify(text);
  }
  function clearEngine() {
    pageTurn.cancel();
    resizeObserver?.disconnect(); resizeObserver = null;
    clearTimeout(resizeTimer); clearTimeout(saveTimer);
    if (bookEngine) bookEngine.destroy(); else rendition?.destroy();
    rendition = null; bookEngine = null;
  }
  function persistProgress() {
    clearTimeout(saveTimer);
    if (!state || !selected || !activeReading) return;
    if (selected.format === 'txt') location = captureTextLocation();
    state.location = location; state.updatedAt = Date.now();
    saveReaderState({ ...state }).then(() => { savedAt = Date.now(); }).catch(() => message('阅读位置未保存，浏览器存储空间可能不足。', true));
  }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(persistProgress, 350); }

  function shelf() {
    persistProgress(); activeReading = false; clearEngine(); generation += 1; selection = null;
    root.dataset.view = 'shelf'; root.removeAttribute('data-drawer');
    const validSelected = selected && books.find(book => book.id === selected.id);
    selected = validSelected || books[0] || null;
    root.innerHTML = `<div class="reader-shelf">
      <section class="reader-shelf-list" aria-label="私人藏书"><div class="reader-eyebrow">PERSONAL LIBRARY / 私人藏书</div><h2>把故事<br>留在手边。</h2><p class="reader-shelf-copy">选一本，回到上次停下的地方。</p><div class="reader-book-list"></div>
      <button type="button" class="reader-import reader-primary" data-action="import">＋ 导入一本书</button><p class="reader-file-hint">EPUB / TXT · 文件保存在这台设备</p></section>
      <section class="reader-book-detail" aria-label="所选书籍"></section>
      <input type="file" class="reader-file" accept=".epub,.txt,text/plain,application/epub+zip" aria-label="导入 EPUB 或 TXT 书籍" hidden>
      <p class="reader-status" role="status" aria-live="polite"></p></div>`;
    renderBookList(); renderBookDetail();
  }
  function renderBookList() {
    const list = root.querySelector('.reader-book-list'); if (!list) return;
    list.innerHTML = books.map((book, index) => `<button class="reader-book-row ${selected?.id === book.id ? 'is-selected' : ''}" type="button" data-book="${escape(book.id)}" aria-pressed="${selected?.id === book.id}"><span class="reader-book-index">${String(index + 1).padStart(2, '0')}</span><span><strong>${escape(book.title)}</strong><small>${book.format === 'legacy' ? '等待关联正文' : book.demo ? '原创演示短篇' : book.format.toUpperCase()}</small></span><span aria-hidden="true">↗</span></button>`).join('');
  }
  async function renderBookDetail() {
    const detail = root.querySelector('.reader-book-detail'); if (!detail || !selected) return;
    const book = selected;
    const progress = await readReaderState(book.id).catch(() => null);
    if (selected?.id !== book.id || destroyed || !detail.isConnected) return;
    detail.innerHTML = `<div class="reader-eyebrow">${book.demo ? 'ORIGINAL SHORT STORY / 原创短篇' : book.format === 'legacy' ? 'FROM YOUR SHELF / 原有藏书' : 'READY TO READ / 可以开始了'}</div>
      <div class="reader-cover" aria-hidden="true"><span>${book.demo ? 'HIDEOUT STORIES' : 'PERSONAL LIBRARY'}</span><strong>${escape(book.title)}</strong><i>${book.demo ? '01' : book.format === 'legacy' ? '…' : book.format.toUpperCase()}</i></div>
      <h3>${escape(book.title)}</h3><p>${escape(book.author || (book.demo ? '树洞原创 · 约 10 分钟' : '你的私人藏书'))}</p>
      ${book.format === 'legacy' ? `<p class="reader-legacy-note">原来的书名与笔记已保留。关联正文文件后，就可以真正翻页阅读。</p>${book.note ? `<blockquote>${escape(book.note)}</blockquote>` : ''}<button type="button" class="reader-primary" data-action="attach">关联 EPUB / TXT 正文 ↗</button>` : `<button type="button" class="reader-primary" data-action="read">${progress?.location ? '继续阅读' : '开始阅读'} ↗</button><p class="reader-file-hint">${book.demo ? '原创演示作品，可直接体验完整阅读' : '支持目录、书签、摘录与自动续读'}</p>`}`;
  }
  async function openBook(book, explicitLocation = null) {
    persistProgress(); clearEngine(); const run = ++generation;
    selected = book; activeReading = false; selection = null; drawerType = null;
    root.dataset.view = 'reading'; root.dataset.format = book.format; root.removeAttribute('data-drawer');
    root.innerHTML = `<div class="reader-session">
      <header class="reader-toolbar"><button type="button" data-action="shelf" class="reader-back">← 藏书</button><span class="reader-current-title">${escape(book.title)}</span><div class="reader-tools"><button type="button" data-action="toc" aria-label="打开目录">目录</button><button type="button" data-action="marks" aria-label="打开书签与摘录">书签</button><button type="button" data-action="settings" aria-label="阅读设置">Aa</button></div></header>
      <div class="reader-body"><div class="reader-viewport" tabindex="0" aria-label="书籍正文，点击左页向前翻，右页向后翻"><div class="reader-loading" role="status">正在展开书页…</div></div><aside class="reader-drawer" hidden aria-label="阅读工具"></aside></div>
      <div class="reader-excerpt-bar" hidden><span>留住这一段</span><button type="button" data-action="excerpt">保存摘录</button><button type="button" data-action="pin-selection">钉到墙上 ↗</button></div>
      <footer class="reader-footer"><button type="button" data-action="prev" aria-label="上一页">← <span>上一页</span></button><span class="reader-progress" aria-live="polite"></span><button type="button" data-action="next" aria-label="下一页"><span>下一页</span> →</button></footer>
      <p class="reader-status" role="status" aria-live="polite"></p></div>`;
    pageTaps(root.querySelector('.reader-body'));
    try {
      state = await readReaderState(book.id) || { id: book.id, bookmarks: [], excerpts: [], location: null };
      if (destroyed || run !== generation) return;
      state.bookmarks ||= []; state.excerpts ||= [];
      location = explicitLocation || state.location; activeReading = true;
      applySettings();
      if (book.format === 'txt') {
        toc = book.chapters.map((item, index) => ({ label: item.title, href: index, depth: 0 }));
        const start = normalizeTextLocation(location, book.chapters); chapter = start.chapter;
        renderText(start);
      } else await renderEpub(run);
      if (destroyed || run !== generation) return;
      const viewport = root.querySelector('.reader-viewport');
      resizeObserver = new ResizeObserver(() => {
        if (restoring) return;
        pageTurn.cancel();
        clearTimeout(resizeTimer); resizeTimer = setTimeout(() => {
          if (destroyed || !activeReading) return;
          if (selected.format === 'txt') { const anchor = location || captureTextLocation(); layoutText(anchor); }
          else {
            const previousColumns = root.dataset.columns;
            applySettings();
            // EPUB's gap also sets its outer page insets. Recreate only when
            // crossing the single/spread boundary so those insets stay in sync.
            if (previousColumns !== root.dataset.columns) openBook(selected, location);
            else rendition?.resize(viewport.clientWidth, viewport.clientHeight);
          }
        }, 120);
      }); resizeObserver.observe(viewport);
      message('阅读位置会自动保存');
      root.querySelector('.reader-back')?.focus({ preventScroll: true });
    } catch (error) { if (run === generation && !destroyed) { message(error.message || '这本书暂时无法打开。', true); const viewport = root.querySelector('.reader-viewport'); if (viewport) viewport.innerHTML = '<div class="reader-loading">书页未能打开。可以返回藏书后重新导入文件。</div>'; } }
  }
  function applySettings() {
    root.style.setProperty('--reader-font-size', `${settings.fontSize}px`);
    root.style.setProperty('--reader-line-height', settings.lineHeight);
    root.dataset.mode = settings.mode; root.dataset.spread = settings.spread;
    const viewport = root.querySelector('.reader-viewport');
    const geometry = readingPageGeometry(viewport?.clientWidth || 0, settings);
    root.dataset.columns = String(geometry.columns);
    root.style.setProperty('--reader-column-gap', `${geometry.gap}px`);
    return geometry;
  }
  function renderText(anchor = null) {
    const viewport = root.querySelector('.reader-viewport');
    const content = selected.chapters[chapter];
    viewport.innerHTML = `<article class="reader-text"><h2>${escape(content.title)}</h2>${content.paragraphs.map((paragraph, index) => `<p data-paragraph="${index}">${escape(paragraph)}</p>`).join('')}<div class="reader-chapter-end">${chapter === selected.chapters.length - 1 ? '— 全文完 —' : '— 本章完 —'}</div></article>`;
    viewport.scrollTop = 0; page = 0;
    syncTextHighlights();
    requestAnimationFrame(() => { if (!destroyed && activeReading && selected.format === 'txt') layoutText(anchor); });
  }
  function syncTextHighlights() {
    if (!globalThis.CSS?.highlights || !globalThis.Highlight) return;
    const article = root.querySelector('.reader-text');
    const ranges = [];
    for (const item of state?.excerpts || []) {
      if (item.location?.chapter !== chapter || item.endLocation?.chapter !== chapter) continue;
      const start = article?.querySelector(`[data-paragraph="${item.location.paragraph}"]`)?.firstChild;
      const end = article?.querySelector(`[data-paragraph="${item.endLocation.paragraph}"]`)?.firstChild;
      if (!start || !end) continue;
      try { const range = document.createRange(); range.setStart(start, Math.min(start.length, item.location.offset)); range.setEnd(end, Math.min(end.length, item.endLocation.offset)); ranges.push(range); } catch { /* A changed edition may no longer contain the selected range. */ }
    }
    CSS.highlights.set('hideout-reader-highlight', new Highlight(...ranges));
  }
  function layoutText(anchor = null) {
    const viewport = root.querySelector('.reader-viewport'), article = viewport?.querySelector('.reader-text');
    if (!article) return;
    restoring = true; const geometry = applySettings(); article.style.transform = '';
    if (settings.mode === 'pages') {
      // Integer viewport widths prevent subpixel drift over many consecutive
      // spreads. The half-gap page insets are included in this width, as in EPUB.
      article.style.width = `${geometry.width}px`;
      pageStep = geometry.step;
      pageCount = Math.max(1, Math.ceil((article.scrollWidth - 1) / pageStep));
      if (anchor?.end) page = pageCount - 1;
      else if (anchor) {
        const value = normalizeTextLocation({ ...anchor, chapter }, selected.chapters);
        const paragraph = article.querySelector(`[data-paragraph="${value.paragraph}"]`);
        if (paragraph?.firstChild) {
          const range = document.createRange(); range.setStart(paragraph.firstChild, Math.min(value.offset, paragraph.firstChild.length)); range.collapse(true);
          const rect = range.getBoundingClientRect(); page = Math.floor(Math.max(0, rect.left - article.getBoundingClientRect().left + 1) / pageStep);
        }
      }
      page = Math.max(0, Math.min(pageCount - 1, page)); article.style.transform = `translateX(${-page * pageStep}px)`;
    } else {
      article.style.width = '';
      pageCount = 1;
      if (anchor?.end) viewport.scrollTop = viewport.scrollHeight;
      else if (anchor) {
        const value = normalizeTextLocation({ ...anchor, chapter }, selected.chapters);
        const paragraph = article.querySelector(`[data-paragraph="${value.paragraph}"]`);
        if (paragraph?.firstChild) { const range = document.createRange(); range.setStart(paragraph.firstChild, Math.min(value.offset, paragraph.firstChild.length)); range.collapse(true); viewport.scrollTop += range.getBoundingClientRect().top - viewport.getBoundingClientRect().top; }
      }
    }
    location = captureTextLocation(); updateTextProgress(); restoring = false; scheduleSave();
  }
  function captureTextLocation() {
    const viewport = root.querySelector('.reader-viewport'), article = viewport?.querySelector('.reader-text');
    if (!article) return location || { chapter, paragraph: 0, offset: 0 };
    const bounds = viewport.getBoundingClientRect();
    let first = null;
    // getClientRects includes every column fragment, unlike a bounding box that
    // spans invisible pages. This keeps long paragraphs resumable on the right page.
    for (const paragraph of article.querySelectorAll('p[data-paragraph]')) {
      const range = document.createRange(); range.selectNodeContents(paragraph);
      if ([...range.getClientRects()].some(rect => rect.right > bounds.left + 1 && rect.left < bounds.right - 1 && rect.bottom > bounds.top + 1 && rect.top < bounds.bottom - 1)) { first = paragraph; break; }
    }
    if (!first) return { chapter, paragraph: 0, offset: 0 };
    const node = first.firstChild;
    let low = 0, high = Math.max(0, node.length - 1);
    const beforeViewport = offset => {
      const range = document.createRange(); range.setStart(node, offset); range.setEnd(node, Math.min(node.length, offset + 1));
      const rect = range.getBoundingClientRect();
      return settings.mode === 'pages' ? rect.right <= bounds.left + 1 : rect.bottom <= bounds.top + 1;
    };
    while (low < high) { const middle = Math.floor((low + high) / 2); if (beforeViewport(middle)) low = middle + 1; else high = middle; }
    return { chapter, paragraph: Number(first.dataset.paragraph), offset: low };
  }
  function updateTextProgress() {
    const progress = root.querySelector('.reader-progress'); if (!progress) return;
    progress.textContent = settings.mode === 'pages' ? `${chapter + 1} / ${selected.chapters.length} 章 · ${page + 1} / ${pageCount} 页` : `${chapter + 1} / ${selected.chapters.length} 章 · 连续滚动`;
    root.querySelectorAll('[data-action="prev"]').forEach(button => button.disabled = chapter === 0 && (settings.mode === 'scroll' ? root.querySelector('.reader-viewport').scrollTop < 2 : page === 0));
    root.querySelectorAll('[data-action="next"]').forEach(button => button.disabled = chapter === selected.chapters.length - 1 && (settings.mode === 'pages' ? page === pageCount - 1 : false));
  }
  async function renderEpub(run) {
    const ePub = await epubLibrary(); if (destroyed || run !== generation) return;
    const engine = ePub(selected.data.slice(0), { replacements: 'blobUrl' }); bookEngine = engine;
    engine.spine.hooks.content.register(sanitizePublication);
    await timeout(readyPublication(engine), '这本 EPUB 没有完整打开，请尝试重新导入。');
    if (destroyed || run !== generation) { engine.destroy(); return; }
    const navigation = await engine.loaded.navigation; toc = flattenToc(navigation.toc);
    const viewport = root.querySelector('.reader-viewport'); viewport.innerHTML = '';
    const geometry = applySettings();
    const view = engine.renderTo(viewport, { width: geometry.width, height: viewport.clientHeight, flow: settings.mode === 'scroll' ? 'scrolled-doc' : 'paginated', spread: settings.spread === 'single' ? 'none' : 'auto', minSpreadWidth: READER_PAGE_GEOMETRY.minSpreadWidth, allowScriptedContent: false, allowPopups: false, manager: 'default', gap: geometry.gap });
    rendition = view;
    view.themes.default({ html: { background: 'transparent !important' }, body: { color: '#17171b !important', background: 'transparent !important', 'font-family': '"Noto Serif SC", "Songti SC", SimSun, serif !important', 'line-height': `${settings.lineHeight} !important` }, p: { 'line-height': `${settings.lineHeight} !important`, 'text-align': 'justify', 'margin-bottom': '0.85em' }, 'h1,h2': { 'font-size': '1.32em !important', 'line-height': '1.5 !important', 'margin-bottom': '1.3em' }, 'a': { color: '#b90026' }, '::selection': { background: '#efb7c3' } });
    view.themes.fontSize(`${settings.fontSize}px`);
    view.on('relocated', result => { if (run !== generation) return; location = result.start.cfi; const index = result.start.index + 1; root.querySelector('.reader-progress').textContent = settings.mode === 'scroll' ? `${index} / ${engine.spine.length} 节 · 连续滚动` : `${index} / ${engine.spine.length} 节 · ${result.start.displayed.page} / ${result.start.displayed.total} 页`; root.querySelectorAll('[data-action="prev"]').forEach(button => button.disabled = result.atStart); root.querySelectorAll('[data-action="next"]').forEach(button => button.disabled = result.atEnd); scheduleSave(); });
    view.on('selected', (cfi, contents) => { const text = contents.window.getSelection()?.toString().trim(); if (text) { selection = { text, location: cfi }; showSelection(); } });
    view.hooks.content.register(contents => { contents.document.addEventListener('keydown', keyboard); pageTaps(contents.document, () => contents.window.frameElement?.getBoundingClientRect().left || 0); contents.document.addEventListener('click', event => { const link = event.target.closest?.('a'); if (link && /^(?:https?:|mailto:|javascript:)/i.test(link.getAttribute('href') || '')) { event.preventDefault(); event.stopImmediatePropagation(); } }, true); });
    await timeout(view.display(typeof location === 'string' ? location : undefined), '正文渲染超时，请返回藏书后重试。');
    state.excerpts.filter(item => typeof item.location === 'string').forEach(item => { try { view.annotations.highlight(item.location, {}, null, 'reader-highlight', { fill: '#eb3154', 'fill-opacity': '0.18' }); } catch { /* A revised EPUB may no longer contain this range. */ } });
  }
  async function turn(direction) {
    if (!activeReading || drawerType || pageTurn.busy || root.querySelector(`[data-action="${direction > 0 ? 'next' : 'prev'}"]`)?.disabled) return;
    hideSelection();
    try { await pageTurn.run(direction, () => turnContent(direction)); }
    catch { pageTurn.cancel(); message('翻页效果暂时未能显示，正文仍可继续阅读。'); }
  }
  function pageTaps(target, offset) {
    bindReaderPageTaps(target, { signal, offset, turn,
      enabled: () => activeReading && !drawerType && !pageTurn.busy && settings.mode === 'pages',
      bounds: () => root.querySelector('.reader-body').getBoundingClientRect(),
    });
  }
  async function turnContent(direction) {
    if (rendition) {
      try {
        const scroller = root.querySelector('.epub-container');
        const horizontal = rendition.getContents().every(contents => !contents.writingMode().startsWith('vertical'));
        if (settings.mode === 'pages' && scroller && horizontal && rendition.settings.direction !== 'rtl') {
          const target = epubSpreadTarget(scroller.scrollLeft, scroller.clientWidth, scroller.scrollWidth, direction);
          if (target !== null) {
            scroller.scrollLeft = target;
            await rendition.reportLocation();
            return;
          }
          if (Math.abs(scroller.scrollLeft) < 1) scroller.scrollLeft = 0;
        }
        await (direction > 0 ? rendition.next() : rendition.prev());
      } catch { message('这一页暂时无法打开。', true); }
      return;
    }
    const viewport = root.querySelector('.reader-viewport');
    if (settings.mode === 'scroll') {
      const atEnd = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 4;
      if (direction > 0 && !atEnd) { viewport.scrollBy({ top: viewport.clientHeight * 0.85, behavior: 'smooth' }); return; }
      if (direction < 0 && viewport.scrollTop > 4) { viewport.scrollBy({ top: -viewport.clientHeight * 0.85, behavior: 'smooth' }); return; }
    } else if (page + direction >= 0 && page + direction < pageCount) {
      page += direction; root.querySelector('.reader-text').style.transform = `translateX(${-page * pageStep}px)`;
      location = captureTextLocation(); updateTextProgress(); scheduleSave(); return;
    }
    if (chapter + direction >= 0 && chapter + direction < selected.chapters.length) { chapter += direction; renderText(direction < 0 ? { end: true } : { chapter, paragraph: 0, offset: 0 }); }
  }
  function keyboard(event) {
    if (!activeReading || drawerType || event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)) return;
    if (['ArrowRight', 'PageDown'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); turn(1); }
    if (['ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); turn(-1); }
  }
  function showSelection() { const bar = root.querySelector('.reader-excerpt-bar'); if (bar) bar.hidden = false; }
  function hideSelection() { selection = null; const bar = root.querySelector('.reader-excerpt-bar'); if (bar) bar.hidden = true; }
  function emitExcerpt(excerpt) { root.dispatchEvent(new CustomEvent('reader:excerpt', { detail: excerpt, bubbles: true })); onExcerpt?.(excerpt); }
  async function saveExcerpt(pin) {
    if (!selection?.text) return;
    const excerpt = { id: uid(), bookId: selected.id, bookTitle: selected.title, text: selection.text.slice(0, 20000), location: selection.location, endLocation: selection.endLocation, createdAt: new Date().toISOString() };
    const duplicate = state.excerpts.find(item => item.text === excerpt.text);
    if (!duplicate) { state.excerpts.push(excerpt); try { await saveReaderState({ ...state }); } catch { message('摘录没有保存成功，请检查浏览器存储空间。', true); return; } }
    if (destroyed) return;
    if (selected.format === 'txt') syncTextHighlights();
    if (rendition && !duplicate) { try { rendition.annotations.highlight(excerpt.location, {}, null, 'reader-highlight', { fill: '#eb3154', 'fill-opacity': '0.18' }); } catch { /* Text can still be saved when a highlight range is unavailable. */ } }
    if (pin) emitExcerpt(duplicate || excerpt);
    hideSelection(); message(pin ? '摘录已保存，并钉到收藏墙' : '摘录已保存到这本书');
  }
  async function bookmark() {
    persistProgress(); const value = selected.format === 'txt' ? captureTextLocation() : location;
    if (state.bookmarks.some(item => JSON.stringify(item.location) === JSON.stringify(value))) { message('这一页已经夹好书签'); return; }
    state.bookmarks.push({ id: uid(), location: value, label: selected.format === 'txt' ? `${selected.chapters[chapter].title} · 第 ${page + 1} 页` : root.querySelector('.reader-progress').textContent, createdAt: Date.now() });
    try { await saveReaderState({ ...state }); message('书签已夹好'); if (drawerType === 'marks') renderDrawer(); } catch { message('书签没有保存成功。', true); }
  }
  async function goTo(target) {
    pageTurn.cancel();
    closeDrawer(); hideSelection();
    if (rendition) { try { await rendition.display(target); } catch { message('没有找到这一段正文。', true); } }
    else { const value = normalizeTextLocation(typeof target === 'number' ? { chapter: target } : target, selected.chapters); chapter = value.chapter; renderText(value); }
  }
  function closeDrawer() { drawerType = null; root.removeAttribute('data-drawer'); const drawer = root.querySelector('.reader-drawer'); if (drawer) drawer.hidden = true; }
  function toggleDrawer(type) { pageTurn.cancel(); if (drawerType === type) { closeDrawer(); return; } drawerType = type; root.dataset.drawer = type; renderDrawer(); }
  function renderDrawer() {
    const drawer = root.querySelector('.reader-drawer'); if (!drawer) return;
    drawer.hidden = false;
    let content = '';
    if (drawerType === 'toc') content = `<nav aria-label="章节目录" class="reader-toc">${toc.map((item, index) => `<button type="button" data-toc="${index}" style="padding-left:${16 + item.depth * 14}px"><span>${String(index + 1).padStart(2, '0')}</span>${escape(item.label)}</button>`).join('')}</nav>`;
    if (drawerType === 'marks') content = `<button type="button" class="reader-primary" data-action="bookmark">＋ 夹住当前这一页</button><h4>书签 / ${state.bookmarks.length}</h4>${state.bookmarks.map(item => `<div class="reader-mark"><button type="button" data-mark="${item.id}">${escape(item.label)}</button><button type="button" data-remove-mark="${item.id}" aria-label="移除此书签">×</button></div>`).join('') || '<p class="reader-empty">还没有书签。</p>'}<h4>摘录 / ${state.excerpts.length}</h4>${state.excerpts.map(item => `<div class="reader-excerpt"><blockquote>${escape(item.text)}</blockquote><button type="button" data-excerpt-jump="${item.id}">回到原文</button><button type="button" data-pin="${item.id}">钉到墙上 ↗</button></div>`).join('') || '<p class="reader-empty">选中正文，即可留下喜欢的片段。</p>'}${state.excerpts.length ? '<button type="button" data-action="export">导出全部摘录 ↓</button>' : ''}`;
    if (drawerType === 'settings') content = `<label>字号 <output>${settings.fontSize}px</output><input aria-label="字号" data-setting="fontSize" type="range" min="14" max="30" step="1" value="${settings.fontSize}"></label><label>行距 <output>${settings.lineHeight.toFixed(1)}</output><input aria-label="行距" data-setting="lineHeight" type="range" min="1.4" max="2.4" step="0.1" value="${settings.lineHeight}"></label><label>阅读方式<select data-setting="mode"><option value="pages" ${settings.mode === 'pages' ? 'selected' : ''}>翻页阅读</option><option value="scroll" ${settings.mode === 'scroll' ? 'selected' : ''}>连续滚动</option></select></label><label>书页排版<select data-setting="spread"><option value="auto" ${settings.spread === 'auto' ? 'selected' : ''}>自动 · 宽屏双页</option><option value="single" ${settings.spread === 'single' ? 'selected' : ''}>单页</option><option value="double" ${settings.spread === 'double' ? 'selected' : ''}>双页 · 窄屏自动单页</option></select></label><p class="reader-empty">字号与排版会保留。方向键也可以翻页。</p>`;
    drawer.innerHTML = `<div class="reader-drawer-heading"><h3>${drawerType === 'toc' ? '这一段旅程' : drawerType === 'marks' ? '书页之间' : '读得舒服一点'}</h3><button type="button" data-action="close-drawer" aria-label="收起阅读工具">×</button></div>${content}`;
  }
  async function changeSetting(input) {
    if (!activeReading) return;
    pageTurn.cancel();
    const anchor = selected.format === 'txt' ? captureTextLocation() : location;
    settings = safeReadingSettings({ ...settings, [input.dataset.setting]: input.value });
    saveReaderState({ id: 'preferences', settings }).catch(() => message('阅读设置暂时无法保存。', true));
    if (selected.format === 'txt') { applySettings(); layoutText(anchor); renderDrawer(); }
    else { const previousDrawer = drawerType; await openBook(selected, anchor); drawerType = previousDrawer; if (previousDrawer) { root.dataset.drawer = previousDrawer; renderDrawer(); } }
  }
  async function importFile(file) {
    if (!file || importBusy) return;
    importBusy = true; message('正在把正文放进书架…');
    root.querySelectorAll('[data-action="import"],[data-action="attach"]').forEach(button => button.disabled = true);
    try {
      const format = validateReaderFile(file), data = await file.arrayBuffer();
      const metadata = format === 'txt' ? parseTextBook(decodeBookText(data), file.name) : await inspectEpub(data);
      const target = attachTo && books.find(item => item.id === attachTo);
      const imported = { id: target?.id || uid(), title: target?.title || metadata.title || file.name.replace(/\.epub$/i, ''), author: metadata.author || '', format, createdAt: target?.createdAt || Date.now(), note: target?.note || '', originalName: file.name, ...(format === 'txt' ? { chapters: metadata.chapters, characterCount: metadata.characterCount } : { data }) };
      await saveReaderBook(imported);
      if (destroyed) return;
      books = target ? books.map(book => book.id === target.id ? imported : book) : [...books, imported];
      selected = imported; shelf(); message('正文已保存，选择“开始阅读”即可翻开');
    } catch (error) { message(error.message || '导入失败，请检查书籍文件。', true); }
    finally { importBusy = false; attachTo = null; root.querySelectorAll('[data-action="import"],[data-action="attach"]').forEach(button => button.disabled = false); const input = root.querySelector('.reader-file'); if (input) input.value = ''; }
  }

  listen(root, 'click', async event => {
    const target = event.target.closest('button'); if (!target) return;
    if (target.dataset.book) { selected = books.find(book => book.id === target.dataset.book); renderBookList(); renderBookDetail(); return; }
    if (target.dataset.toc !== undefined) { goTo(toc[Number(target.dataset.toc)].href); return; }
    if (target.dataset.mark) { goTo(state.bookmarks.find(item => item.id === target.dataset.mark)?.location); return; }
    if (target.dataset.removeMark) { state.bookmarks = state.bookmarks.filter(item => item.id !== target.dataset.removeMark); saveReaderState({ ...state }).catch(() => message('书签更改未保存。', true)); renderDrawer(); return; }
    if (target.dataset.excerptJump) { goTo(state.excerpts.find(item => item.id === target.dataset.excerptJump)?.location); return; }
    if (target.dataset.pin) { const item = state.excerpts.find(item => item.id === target.dataset.pin); if (item) { emitExcerpt(item); message('摘录已钉到收藏墙'); } return; }
    switch (target.dataset.action) {
      case 'read': openBook(selected); break;
      case 'shelf': shelf(); break;
      case 'import': attachTo = null; root.querySelector('.reader-file').click(); break;
      case 'attach': attachTo = selected.id; root.querySelector('.reader-file').click(); break;
      case 'prev': turn(-1); break;
      case 'next': turn(1); break;
      case 'toc': case 'marks': case 'settings': toggleDrawer(target.dataset.action); break;
      case 'close-drawer': closeDrawer(); break;
      case 'bookmark': bookmark(); break;
      case 'excerpt': saveExcerpt(false); break;
      case 'pin-selection': saveExcerpt(true); break;
      case 'export': downloadText(`${selected.title}-摘录.md`, excerptMarkdown(state.excerpts)); message('摘录已导出'); break;
    }
  });
  listen(root, 'change', event => { if (event.target.matches('.reader-file')) importFile(event.target.files[0]); else if (event.target.dataset.setting) changeSetting(event.target); });
  listen(root, 'input', event => { if (event.target.dataset.setting && event.target.type === 'range') { const output = event.target.parentElement.querySelector('output'); if (output) output.textContent = event.target.dataset.setting === 'fontSize' ? `${event.target.value}px` : Number(event.target.value).toFixed(1); } });
  listen(root, 'mouseup', () => {
    if (!activeReading || selected?.format !== 'txt') return;
    const chosen = window.getSelection();
    if (chosen?.isCollapsed || !chosen?.rangeCount) return;
    const range = chosen.getRangeAt(0), article = root.querySelector('.reader-text');
    if (!article?.contains(range.commonAncestorContainer)) return;
    const text = chosen.toString().trim(); if (!text) return;
    const start = range.startContainer.parentElement?.closest('[data-paragraph]');
    const end = range.endContainer.parentElement?.closest('[data-paragraph]');
    selection = { text, location: { chapter, paragraph: Number(start?.dataset.paragraph || 0), offset: range.startOffset }, endLocation: end ? { chapter, paragraph: Number(end.dataset.paragraph), offset: range.endOffset } : null }; showSelection();
  });
  listen(root, 'scroll', event => { if (event.target.matches?.('.reader-viewport') && activeReading && selected.format === 'txt' && !restoring) { location = captureTextLocation(); updateTextProgress(); scheduleSave(); } }, { capture: true });
  listen(root, 'keydown', keyboard);
  listen(window, 'pagehide', persistProgress);
  listen(document, 'visibilitychange', () => { if (document.hidden) { pageTurn.cancel(); persistProgress(); } });

  (async () => {
    try {
      const [stored, preferences] = await Promise.all([listReaderBooks(), readReaderState('preferences')]);
      books = stored.sort((a, b) => Number(Boolean(b.demo)) - Number(Boolean(a.demo)) || a.createdAt - b.createdAt); settings = safeReadingSettings(preferences?.settings);
      if (!books.some(book => book.id === DEMO_ID)) {
        const response = await fetch('/assets/books/窗外最后一班车.txt'); if (!response.ok) throw new Error('演示书籍没有加载成功。');
        const parsed = parseTextBook(await response.text(), '窗外最后一班车');
        const demo = { id: DEMO_ID, ...parsed, format: 'txt', author: '树洞原创', demo: true, createdAt: Date.now() };
        await saveReaderBook(demo); books.unshift(demo);
      }
      for (const legacy of legacyBooks) {
        const id = `legacy-${legacy.id}`;
        if (books.some(book => book.id === id)) continue;
        const record = { id, title: String(legacy.title || '未命名的书'), note: String(legacy.note || ''), format: 'legacy', createdAt: Date.now() };
        await saveReaderBook(record); books.push(record);
      }
      if (destroyed) return;
      const initialId = options.initialBookId || options.initialBook;
      const requestedBook = books.find(book => book.id === initialId || book.id === `legacy-${initialId}`);
      selected = requestedBook || books.find(book => book.demo) || books[0];
      if (options.initialBookId && requestedBook && requestedBook.format !== 'legacy') openBook(requestedBook, options.initialLocation || null);
      else {
        shelf();
        if (options.initialBookId && !requestedBook) message('这台设备还没有这本书，请先导入该书的 EPUB 或 TXT 正文。', true);
      }
    } catch (error) { if (!destroyed) { root.innerHTML = `<div class="reader-loading" role="alert"><strong>藏书暂时没有打开</strong><p>${escape(error.message)}</p><p>请检查浏览器是否允许本地存储，然后重新打开书本。</p></div>`; notify(error.message); } }
  })();

  return () => { if (destroyed) return; persistProgress(); destroyed = true; generation += 1; controller.abort(); clearEngine(); globalThis.CSS?.highlights?.delete('hideout-reader-highlight'); root.replaceChildren(); root.classList.remove('hideout-reader'); ['view', 'mode', 'spread', 'columns', 'drawer', 'format'].forEach(name => delete root.dataset[name]); };
}
