import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_STATUSES, GAME_RATINGS, GAME_GENRES, validateGameRecord, normalizeGameForDisplay, applyBuiltinGames} from '../site/js/game-model.js';
import {initialContent, validateImport, mergeContent, saveContent} from '../site/js/storage.js';

const oldGame = {id:'old', title:'旧收藏', status:'已通关', note:'保留原有感想'};
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const builtin = {id:'builtin-wukong', title:'黑神话：悟空', status:'想玩', note:'', cover:'/assets/games/black-myth-wukong.jpg', genre:'动作角色扮演', rating:'夯', ratingKind:'编辑推荐', hours:35.5, hoursKind:'参考主线'};
const backup = games => ({version:1, books:[], notes:[], games});

test('旧游戏备份不被补字段，展示默认值不改写旧收藏', () => {
  const original = structuredClone(oldGame);
  assert.deepEqual(validateGameRecord(oldGame), original);
  assert.deepEqual(validateImport(backup([oldGame])).games, [original]);
  const view = normalizeGameForDisplay(oldGame);
  assert.equal(view.hours, null);
  assert.equal(view.rating, '');
  assert.equal(view.cover, '');
  assert.equal(view.genre, '其他');
  assert.equal(view.status, '已通关');
  assert.deepEqual(oldGame, original);
  assert.deepEqual(initialContent().games, []);
  assert.ok(GAME_STATUSES.includes('在玩') && GAME_RATINGS.includes('拉完了') && GAME_GENRES.includes('动作冒险'));
});

test('新字段及上传封面经 JSON 导出导入后保持原值', () => {
  const full = {...oldGame, cover:png, description:'一段简介\n下一行', genre:'动作冒险', rating:'人上人', ratingKind:'个人评级', hours:12.3, hoursKind:'实际游玩', platforms:'PC / PlayStation 5', sourceUrl:'https://example.com/game?lang=zh', releaseDate:'2024-02-29'};
  assert.deepEqual(validateImport(JSON.parse(JSON.stringify(backup([full])))).games, [full]);
  assert.deepEqual(validateGameRecord({...full, unexpected:'do not import'}), full);
  assert.equal(validateGameRecord({...oldGame, hours:0}).hours, 0);
  assert.equal(validateGameRecord({...oldGame, hours:null}).hours, null);
  assert.equal(validateGameRecord({...oldGame, releaseDate:''}).releaseDate, '');
});

test('导入拒绝外部、活动、越界或伪造格式的封面', () => {
  const badCovers = [
    'https://example.com/cover.jpg', 'javascript:alert(1)', 'blob:https://example.com/123',
    '/assets/games/../private.jpg', '/assets/games/%2e%2e/private.jpg', '/assets/games/x.svg',
    '/assets/games/x.jpg?url=https://example.com', '//example.com/assets/games/x.jpg',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:image/png;base64,PHN2Zz48L3N2Zz4=', 'data:image/jpeg;base64,<script>',
    png + '!', '', null,
  ];
  for (const cover of badCovers) assert.throws(() => validateGameRecord({...oldGame, cover}), String(cover));
  for (const cover of [png, '/assets/games/black-myth-wukong.jpg', '/assets/games/user/a-b_1.webp']) {
    assert.equal(validateGameRecord({...oldGame, cover}).cover, cover);
  }
});

test('来源、时长、分类、评分与发行日期校验不接受损坏数值', () => {
  for (const hours of [NaN, Infinity, -1, 100000.1, 12.34, '12', undefined]) assert.throws(() => validateGameRecord({...oldGame, hours}));
  for (const sourceUrl of ['javascript:alert(1)', 'http://example.com', '/relative', 'https://', ' https://example.com', 'https://name:pass@example.com', 'https://example.com/' + 'x'.repeat(2000)]) assert.throws(() => validateGameRecord({...oldGame, sourceUrl}));
  for (const releaseDate of ['2025-02-29', '2026-04-31', '2026-13-01', '26-01-01', '2026-01-01T00:00:00Z', null]) assert.throws(() => validateGameRecord({...oldGame, releaseDate}));
  for (const fields of [{description:'x'.repeat(4001)}, {genre:'x'.repeat(33)}, {rating:'五颗星'}, {ratingKind:'别人的分数'}, {hoursKind:'猜测'}, {platforms:'x'.repeat(121)}]) assert.throws(() => validateGameRecord({...oldGame, ...fields}));
  assert.equal(validateGameRecord({...oldGame, hours:100000}).hours, 100000);
});

test('预置只注入一次，刷新保留用户编辑且不会复活已删除的预置', () => {
  const second = {...builtin, id:'builtin-phantom', title:'影之刃零'};
  const base = initialContent();
  const installed = applyBuiltinGames(base, [builtin, second]);
  assert.deepEqual(base.games, []);
  assert.equal(installed.games.length, 2);
  assert.strictEqual(applyBuiltinGames(installed, [builtin, second]), installed);
  const edited = {...installed, games:[{...installed.games[0], rating:'NPC', hours:9, note:'我的记录'}]};
  const restored = validateImport(JSON.parse(JSON.stringify(edited)));
  const refreshed = applyBuiltinGames(restored, [builtin, second]);
  assert.deepEqual(refreshed.games, edited.games);
  assert.deepEqual(refreshed.gameSeeds, ['builtin-wukong', 'builtin-phantom']);
  assert.equal(refreshed.games.length, 1);
});

test('同名或同 id 的用户游戏保留资料，记录 seed 防止随后重复注入', () => {
  const userGame = {...oldGame, title:'  黑神话：悟空  ', note:'用户已有收藏'};
  const withName = applyBuiltinGames({...initialContent(), games:[userGame]}, [builtin]);
  assert.deepEqual(withName.games, [userGame]);
  assert.deepEqual(applyBuiltinGames({...withName, games:[]}, [builtin]).games, []);
  const withId = {...oldGame, id:builtin.id, title:'我的游戏名'};
  assert.deepEqual(applyBuiltinGames({...initialContent(), games:[withId]}, [builtin]).games, [withId]);
  assert.equal(applyBuiltinGames({...initialContent(), games:[{...oldGame, title:'  Test Game  '}]}, [{...builtin, title:'test game'}]).games.length, 1);
});

test('合并 seed 仅记录注入历史，不能通过备份 seed 删除当前游戏', () => {
  const current = applyBuiltinGames({...initialContent(), games:[oldGame]}, [builtin]);
  const incoming = validateImport({...backup([]), gameSeeds:['builtin-phantom', builtin.id]});
  const merged = mergeContent(current, incoming);
  assert.deepEqual(merged.games, current.games);
  assert.deepEqual(merged.gameSeeds, [builtin.id, 'builtin-phantom']);
  const updated = {...builtin, note:'备份中的新备注'};
  assert.equal(mergeContent(merged, validateImport(backup([updated]))).games.find(game => game.id === builtin.id).note, '备份中的新备注');
  assert.throws(() => validateImport({...backup([]), gameSeeds:['']}));
  assert.throws(() => validateImport({...backup([]), gameSeeds:'builtin-wukong'}));
});

test('单张和合并后的封面总量都有限制，超额不会写入本地存储', () => {
  const bytes = Buffer.alloc(1499997);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  const large = `data:image/png;base64,${bytes.toString('base64')}`;
  const games = Array.from({length:14}, (_, index) => ({...oldGame, id:`large-${index}`, cover:large}));
  const first = validateImport(backup(games.slice(0,7)));
  const second = validateImport(backup(games.slice(7)));
  assert.throws(() => validateImport(backup(games)), /总量/);
  assert.throws(() => mergeContent(first, second), /总量/);
  assert.throws(() => saveContent(backup(games)), /总量/);
  assert.throws(() => validateGameRecord({...oldGame, cover:large + 'A'.repeat(200000)}), /cover/);
});
