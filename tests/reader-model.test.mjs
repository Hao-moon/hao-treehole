import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseTextBook, decodeBookText, validateReaderFile, safeReadingSettings, normalizeTextLocation, flattenToc, excerptMarkdown, readingPageGeometry, READER_PAGE_GEOMETRY, epubSpreadTarget } from '../site/js/reader-model.js';

test('TXT parser retains complete Chinese body, chapter headings, and literal markup', () => {
  const book = parseTextBook('\uFEFF前面的简介\r\n\r\n第一章 雨夜\r\n第一段。\n<script>这个是字面文字</script>\n第二章：回家\n真正的最后一段。', '一本书.txt');
  assert.equal(book.title, '一本书');
  assert.deepEqual(book.chapters.map(item => item.title), ['正文', '第一章 雨夜', '第二章：回家']);
  assert.equal(book.chapters[1].paragraphs[1], '<script>这个是字面文字</script>');
  assert.equal(book.chapters[2].paragraphs[0], '真正的最后一段。');
  assert.equal(book.characterCount, book.chapters.flatMap(item => item.paragraphs).join('').length);
});

test('TXT parser supports ordinary text, English chapters, and empty-file errors', () => {
  assert.equal(parseTextBook('没有标题的一段。').chapters[0].title, '正文');
  assert.deepEqual(parseTextBook('Chapter I\nHello.\nChapter 2\nGoodbye.').chapters.map(item => item.title), ['Chapter I', 'Chapter 2']);
  assert.throws(() => parseTextBook(' \n\u0000'), /没有找到/);
});

test('reader imports reject unsupported, empty and oversized files', () => {
  assert.equal(validateReaderFile({ name: 'BOOK.EPUB', size: 300 }), 'epub');
  assert.equal(validateReaderFile({ name: '中文.txt', size: 300 }), 'txt');
  assert.throws(() => validateReaderFile({ name: 'a.pdf', size: 200 }), /EPUB 或 TXT/);
  assert.throws(() => validateReaderFile({ name: 'a.txt', size: 0 }), /空/);
  assert.throws(() => validateReaderFile({ name: 'a.txt', size: 13 * 1024 * 1024 }), /12 MB/);
  assert.throws(() => validateReaderFile({ name: 'a.epub', size: 51 * 1024 * 1024 }), /50 MB/);
});

test('decoder reads UTF-8, UTF-16 BOM, and common GBK Chinese text', () => {
  assert.equal(decodeBookText(new TextEncoder().encode('你好，世界').buffer), '你好，世界');
  assert.equal(decodeBookText(Uint8Array.from([255, 254, 96, 79, 125, 89]).buffer), '你好');
  assert.equal(decodeBookText(Uint8Array.from([254, 255, 79, 96, 89, 125]).buffer), '你好');
  assert.equal(decodeBookText(Uint8Array.from([0xc4, 0xe3, 0xba, 0xc3]).buffer), '你好');
});

test('resume locations clamp stale chapter and character offsets', () => {
  const chapters = [{ title: 'A', paragraphs: ['abc', 'defg'] }, { title: 'B', paragraphs: ['中文'] }];
  assert.deepEqual(normalizeTextLocation({ chapter: 99, paragraph: 30, offset: 900 }, chapters), { chapter: 1, paragraph: 0, offset: 2 });
  assert.deepEqual(normalizeTextLocation({ chapter: -3, paragraph: -1, offset: -2 }, chapters), { chapter: 0, paragraph: 0, offset: 0 });
  assert.deepEqual(normalizeTextLocation({ chapter: 0, paragraph: 1, offset: 3 }, chapters), { chapter: 0, paragraph: 1, offset: 3 });
});

test('reader settings normalize invalid persisted preferences and nested EPUB TOC survives', () => {
  assert.deepEqual(safeReadingSettings({ fontSize: 90, lineHeight: 0.3, mode: 'invalid', spread: 'whatever' }), { fontSize: 30, lineHeight: 1.4, mode: 'pages', spread: 'auto' });
  assert.deepEqual(flattenToc([{ label: ' 第一卷 ', href: 'one.xhtml', subitems: [{ label: '第一章', href: 'one.xhtml#chapter1' }] }]), [{ label: '第一卷', href: 'one.xhtml', depth: 0 }, { label: '第一章', href: 'one.xhtml#chapter1', depth: 1 }]);
});

test('excerpt export keeps content and book attribution', () => {
  const output = excerptMarkdown([{ bookTitle: '窗外最后一班车', text: '第一行\n第二行', createdAt: '2026-10-19T12:00:00Z' }]);
  assert.match(output, /## 窗外最后一班车/); assert.match(output, /> 第一行\n> 第二行/);
});

test('book spread reserves a real centre gutter while advancing whole visible spreads', () => {
  const spread = readingPageGeometry(1024, { mode: 'pages', spread: 'auto' });
  assert.equal(spread.columns, 2);
  assert.equal(spread.gap, 112);
  assert.equal(spread.columnWidth * 2 + spread.gap + spread.edgeInset * 2, 1024);
  assert.equal((spread.columnWidth + spread.gap) * spread.columns, spread.step);
  assert.equal(spread.step, 1024);
  // Adjacent spreads neither overlap nor skip a column when font settings reflow.
  for (let index = 0; index < 30; index++) {
    const start = index * spread.step + spread.edgeInset;
    const nextStart = start + 2 * (spread.columnWidth + spread.gap);
    assert.equal(nextStart, (index + 1) * spread.step + spread.edgeInset);
  }
});

test('narrow, explicit single-page and scrolling layouts suppress the centre fold', () => {
  for (const [width, settings] of [[390, { mode: 'pages', spread: 'double' }], [719, { mode: 'pages' }], [1100, { mode: 'pages', spread: 'single' }], [1100, { mode: 'scroll', spread: 'double' }]]) {
    const single = readingPageGeometry(width, settings);
    assert.equal(single.columns, 1);
    assert.equal(single.gap, READER_PAGE_GEOMETRY.singleGap);
    assert.equal(single.columnWidth + single.edgeInset * 2, width);
    assert.equal(single.step, width);
  }
});

test('fractional browser zoom cannot skip the final EPUB spread', () => {
  assert.equal(epubSpreadTarget(1034.22216796875, 1034, 3102, 1), 2068);
  assert.equal(epubSpreadTarget(2068.444, 1034, 3102, -1), 1034);
  assert.equal(epubSpreadTarget(2068.444, 1034, 3102, 1), null);
  assert.equal(epubSpreadTarget(0.222, 1034, 3102, -1), null);
  assert.equal(epubSpreadTarget(324.222, 324, 2268, 1), 648);
});

test('bundled original demo is a full story, clearly distinct from legacy title records', async () => {
  const text = await readFile(new URL('../site/assets/books/窗外最后一班车.txt', import.meta.url), 'utf8');
  const parsed = parseTextBook(text, '窗外最后一班车');
  assert.ok(parsed.characterCount > 2000);
  assert.equal(parsed.chapters.length, 4);
  assert.match(text, /原创演示短篇|原创演示作品/);
  assert.match(text, /不是《我们生活在南京》的正文/);
  assert.match(text, /有一本书回到了它应该在的地方/);
});
