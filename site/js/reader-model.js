export const READER_LIMITS = Object.freeze({ txtBytes: 12 * 1024 * 1024, epubBytes: 50 * 1024 * 1024, unpackedBytes: 180 * 1024 * 1024 });
export const DEFAULT_READING_SETTINGS = Object.freeze({ fontSize: 19, lineHeight: 1.9, mode: 'pages', spread: 'auto' });
export const READER_PAGE_GEOMETRY = Object.freeze({ minSpreadWidth: 720, spreadGap: 112, singleGap: 40 });

// Both EPUB and TXT reserve half the gap at each outside edge, then a full gap
// at the book's centre. One turn always advances exactly one viewport width.
export function readingPageGeometry(viewportWidth, settings = {}) {
  const width = Math.max(1, Number(viewportWidth) || 1);
  const columns = settings.mode !== 'scroll' && settings.spread !== 'single' && width >= READER_PAGE_GEOMETRY.minSpreadWidth ? 2 : 1;
  const gap = columns === 2 ? READER_PAGE_GEOMETRY.spreadGap : READER_PAGE_GEOMETRY.singleGap;
  return { width, columns, gap, edgeInset: gap / 2, columnWidth: Math.max(1, width / columns - gap), step: width };
}

// Browser zoom can quantize scrollLeft to a fractional CSS pixel. epub.js uses
// an exact next-boundary comparison; snap the requested spread with tolerance
// before asking it to cross to another chapter.
export function epubSpreadTarget(scrollLeft, viewportWidth, scrollWidth, direction) {
  if (!(viewportWidth > 0) || scrollLeft < -1) return null;
  const target = (Math.round(scrollLeft / viewportWidth) + direction) * viewportWidth;
  const maximum = Math.max(0, scrollWidth - viewportWidth);
  return target >= 0 && target <= maximum + 1 ? Math.min(target, maximum) : null;
}

export function safeReadingSettings(value = {}) {
  return {
    fontSize: Math.min(30, Math.max(14, Number(value.fontSize) || 19)),
    lineHeight: Math.min(2.4, Math.max(1.4, Number(value.lineHeight) || 1.9)),
    mode: value.mode === 'scroll' ? 'scroll' : 'pages',
    spread: ['single', 'double'].includes(value.spread) ? value.spread : 'auto',
  };
}

export function validateReaderFile(file) {
  const extension = String(file?.name || '').split('.').at(-1).toLowerCase();
  if (!['epub', 'txt'].includes(extension)) throw new Error('请选择 EPUB 或 TXT 书籍文件。');
  if (!file.size) throw new Error('这份文件是空的，请换一个文件。');
  if (file.size > READER_LIMITS[`${extension}Bytes`]) throw new Error(extension === 'txt' ? 'TXT 文件请控制在 12 MB 以内。' : 'EPUB 文件请控制在 50 MB 以内。');
  return extension;
}

export function decodeBookText(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('gb18030').decode(bytes); }
}

// Actual paragraph text flows through CSS columns. Chapter boundaries are navigation,
// never a substitute for pagination or arbitrary character-count pages.
export function parseTextBook(text, filename = '未命名的书') {
  const cleaned = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
  if (!cleaned || !/[\p{L}\p{N}]/u.test(cleaned)) throw new Error('没有找到可以阅读的文字。');
  const lines = cleaned.split('\n').map(line => line.trim()).filter(Boolean);
  const heading = /^(?:第[〇零一二三四五六七八九十百千万两\d]+[章回卷部节篇](?:\s|　|[：:、.]|$)|(?:序章|序言|楔子|前言|引子|尾声|终章|后记|跋)(?:\s|　|[：:、.]|$)|chapter\s+[\divxlc]+\b)/i;
  const chapters = [];
  let chapter = { title: '正文', paragraphs: [] };
  for (const line of lines) {
    if (line.length < 90 && heading.test(line)) {
      if (chapter.paragraphs.length) chapters.push(chapter);
      chapter = { title: line, paragraphs: [] };
    } else chapter.paragraphs.push(line);
  }
  if (chapter.paragraphs.length || !chapters.length) chapters.push(chapter);
  const title = String(filename).replace(/\.(?:txt|epub)$/i, '').trim() || '未命名的书';
  return { title, chapters, characterCount: chapters.reduce((sum, item) => sum + item.paragraphs.join('').length, 0) };
}

export function normalizeTextLocation(location, chapters) {
  const chapter = Math.max(0, Math.min(chapters.length - 1, Number.isInteger(location?.chapter) ? location.chapter : 0));
  const paragraphs = chapters[chapter]?.paragraphs || [''];
  const paragraph = Math.max(0, Math.min(paragraphs.length - 1, Number.isInteger(location?.paragraph) ? location.paragraph : 0));
  return { chapter, paragraph, offset: Math.max(0, Math.min(paragraphs[paragraph]?.length || 0, Number(location?.offset) || 0)) };
}

export function flattenToc(items, depth = 0) {
  return (Array.isArray(items) ? items : []).flatMap(item => [
    { label: String(item.label || '未命名章节').trim(), href: String(item.href || ''), depth },
    ...flattenToc(item.subitems, Math.min(4, depth + 1)),
  ]);
}

export function excerptMarkdown(excerpts) {
  return excerpts.map(item => `## ${String(item.bookTitle).replace(/[\r\n]/g, ' ')}\n\n${item.text.split('\n').map(line => `> ${line}`).join('\n')}\n\n${new Date(item.createdAt).toLocaleDateString('zh-CN')}\n`).join('\n');
}
