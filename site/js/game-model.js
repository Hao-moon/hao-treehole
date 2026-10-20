export const GAME_STATUSES = Object.freeze(['在玩', '已通关', '想玩']);
export const GAME_RATINGS = Object.freeze(['夯', '顶级', '人上人', 'NPC', '拉完了']);
export const GAME_GENRES = Object.freeze(['动作角色扮演', '动作冒险', '角色扮演', '开放世界', '平台跳跃', '策略', '模拟经营', '竞速', '解谜', '其他']);

const COVER_LIMIT = 2 * 1024 * 1024;
const COVER_TOTAL_LIMIT = 24 * 1024 * 1024;
const RATING_KINDS = ['个人评级', '编辑推荐', '期待评级'];
const HOURS_KINDS = ['实际游玩', '参考主线'];
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function validCover(cover) {
  if (typeof cover !== 'string' || cover.length > COVER_LIMIT) return false;
  if (/^\/assets\/games\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|webp)$/i.test(cover)) return true;
  const match = /^data:image\/(png|jpeg|webp);base64,/.exec(cover);
  if (!match) return false;
  const encoded = cover.slice(match[0].length);
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return false;
  // Check the file signature as well as its declared MIME type: SVG cannot be
  // smuggled into an imported cover by relabelling its data URL as PNG.
  let header;
  try { header = atob(encoded.slice(0, 24)); } catch { return false; }
  if (match[1] === 'png') return header.startsWith('\x89PNG\r\n\x1a\n');
  if (match[1] === 'jpeg') return header.startsWith('\xff\xd8\xff');
  return header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
}

function validSource(value) {
  if (typeof value !== 'string' || value.length > 2000 || value !== value.trim()) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password; }
  catch { return false; }
}

function validDate(value) {
  if (value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Return a validated record, preserving the shape of legacy game records. */
export function validateGameRecord(game) {
  if (!game || typeof game !== 'object' || Array.isArray(game)
      || typeof game.id !== 'string' || typeof game.title !== 'string'
      || !game.title.trim() || game.title.length > 100
      || !GAME_STATUSES.includes(game.status)
      || typeof game.note !== 'string' || game.note.length > 100000) {
    throw new Error('游戏收藏格式不正确');
  }
  const record = {id: game.id, title: game.title, status: game.status, note: game.note};
  const checks = {
    cover: validCover,
    description: value => typeof value === 'string' && value.length <= 4000,
    genre: value => typeof value === 'string' && value.length <= 32,
    rating: value => value === '' || GAME_RATINGS.includes(value),
    ratingKind: value => RATING_KINDS.includes(value),
    hours: value => value === null || (typeof value === 'number' && Number.isFinite(value)
      && value >= 0 && value <= 100000 && Math.abs(value * 10 - Math.round(value * 10)) < 1e-7),
    hoursKind: value => HOURS_KINDS.includes(value),
    platforms: value => typeof value === 'string' && value.length <= 120,
    sourceUrl: validSource,
    releaseDate: validDate,
  };
  for (const [key, valid] of Object.entries(checks)) {
    if (!own(game, key)) continue;
    if (!valid(game[key])) throw new Error(`游戏收藏的 ${key} 格式不正确`);
    record[key] = game[key];
  }
  return record;
}

/** Defaults are for the view only; opening an old collection does not rewrite it. */
export function normalizeGameForDisplay(game) {
  return {
    cover: '', description: '', genre: '其他', rating: '', ratingKind: '个人评级',
    hours: null, hoursKind: '实际游玩', platforms: '', sourceUrl: '', releaseDate: '',
    ...validateGameRecord(game),
  };
}

export function validateGameCoverBudget(games = []) {
  let total = 0;
  for (const game of games) {
    if (typeof game?.cover !== 'string') continue;
    if (game.cover.length > COVER_LIMIT) throw new Error('单张游戏封面过大，请重新上传较小的图片');
    if (game.cover.startsWith('data:')) total += game.cover.length;
    if (total > COVER_TOTAL_LIMIT) throw new Error('游戏封面总量超过 24 兆，请减少封面图片后再保存或导入');
  }
}

/** Install a built-in once. Seed IDs also remember deliberate user deletions. */
export function applyBuiltinGames(content, builtins) {
  const games = [...(content.games || [])];
  const seeds = new Set(content.gameSeeds || []);
  const ids = new Set(games.map(game => game.id));
  const titleKey = value => value.trim().toLowerCase();
  const titles = new Set(games.map(game => titleKey(game.title)));
  let changed = false;
  for (const builtin of builtins) {
    const game = validateGameRecord(builtin);
    if (!game.id.trim() || game.id.length > 200) throw new Error('内置游戏需要稳定的标识');
    if (seeds.has(game.id)) continue;
    seeds.add(game.id);
    changed = true;
    if (ids.has(game.id) || titles.has(titleKey(game.title))) continue;
    games.push(game);
    ids.add(game.id);
    titles.add(titleKey(game.title));
  }
  if (!changed) return content;
  validateGameCoverBudget(games);
  return {...content, games, gameSeeds: [...seeds]};
}
