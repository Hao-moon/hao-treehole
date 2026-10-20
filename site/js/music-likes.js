export const MUSIC_LIKES_KEY = 'hao-treehole-music-likes-v1';

// Likes are counts, not a toggle. Persist separately from audio blobs so built-in
// songs and imported songs use the same stable track IDs.
export function createMusicLikes(storage) {
  let counts = new Map();
  const target = () => storage === undefined ? globalThis.localStorage : storage;

  function load() {
    const local = target();
    if (!local) throw new Error('Local storage is unavailable');
    const saved = local.getItem(MUSIC_LIKES_KEY);
    if (saved == null) { counts = new Map(); return; }
    const data = JSON.parse(saved);
    if (data?.version !== 1 || !data.counts || typeof data.counts !== 'object' || Array.isArray(data.counts)) {
      throw new Error('Invalid music like counts');
    }
    const entries = Object.entries(data.counts);
    if (entries.some(([id, count]) => !id || !Number.isSafeInteger(count) || count < 0)) {
      throw new Error('Invalid music like count');
    }
    counts = new Map(entries);
  }

  return {
    load,
    count: id => counts.get(id) || 0,
    stats: () => [...counts].map(([id, count]) => ({ id, count })),
    increment(id) {
      if (typeof id !== 'string' || !id) throw new Error('A stable track ID is required');
      // Read the last durable value on each press, including writes by another
      // player instance. Synchronous read/write also preserves rapid presses.
      load();
      const count = (counts.get(id) || 0) + 1;
      if (!Number.isSafeInteger(count)) throw new Error('Music like count is too large');
      const next = new Map(counts).set(id, count);
      target().setItem(MUSIC_LIKES_KEY, JSON.stringify({ version: 1, counts: Object.fromEntries(next) }));
      // Only acknowledge a like after its write succeeded.
      counts = next;
      return count;
    },
  };
}
