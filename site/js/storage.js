import {validateGameRecord, validateGameCoverBudget} from './game-model.js';

const DB_NAME = 'hao-treehole-personal';
let database;
export function openStorage() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('content');
      db.createObjectStore('audio', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('请关闭其他树洞标签页后重试'));
  });
  return database;
}
async function operation(store, mode, action) {
  const db = await openStorage();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('没有保存成功'));
  });
}
export const readContent = () => operation('content','readonly', s => s.get('collection'));
export const saveContent = value => {
  validateGameCoverBudget(value.games);
  return operation('content','readwrite', s => s.put(value,'collection'));
};
export const listAudio = () => operation('audio','readonly',s => s.getAll());
export const saveAudio = value => operation('audio','readwrite',s => s.put(value));
export const deleteAudio = id => operation('audio','readwrite',s => s.delete(id));
export const initialContent = () => ({ version:1, books:[{id:'nanjing',title:'我们生活在南京',status:'想读',note:''}], notes:[], games:[] });
export function validateImport(value) {
  if (value?.version !== 1 || !Array.isArray(value.books) || !Array.isArray(value.notes)) throw new Error('这不是树洞的书籍与记录备份');
  if (value.books.length > 1000 || value.notes.length > 10000) throw new Error('这份备份内容过多');
  const ids = new Set();
  const books = value.books.map(b => {
    if (typeof b.id !== 'string' || ids.has(b.id) || typeof b.title !== 'string' || !b.title.trim() || b.title.length > 100 || !['想读','在读','读完'].includes(b.status) || typeof b.note !== 'string' || b.note.length > 100000) throw new Error('书籍数据格式不正确');
    ids.add(b.id); return {id:b.id,title:b.title,status:b.status,note:b.note};
  });
  ids.clear();
  const notes = value.notes.map(n => {
    if (typeof n.id !== 'string' || ids.has(n.id) || typeof n.text !== 'string' || !n.text.trim() || n.text.length > 100000 || typeof n.created !== 'string' || !Number.isFinite(Date.parse(n.created))) throw new Error('记录数据格式不正确');
    ids.add(n.id); return {id:n.id,text:n.text,created:n.created};
  });
  ids.clear();
  if (value.games !== undefined && (!Array.isArray(value.games) || value.games.length > 1000)) throw new Error('游戏收藏格式不正确');
  const games=(value.games||[]).map(g=>{
    const game=validateGameRecord(g);
    if(ids.has(game.id))throw new Error('游戏收藏格式不正确');
    ids.add(game.id);return game;
  });
  validateGameCoverBudget(games);
  const result={version:1,books,notes,games};
  if(value.gameSeeds!==undefined){
    if(!Array.isArray(value.gameSeeds)||value.gameSeeds.length>1000||value.gameSeeds.some(id=>typeof id!=='string'||!id.trim()||id.length>200))throw new Error('内置游戏记录格式不正确');
    result.gameSeeds=[...new Set(value.gameSeeds)];
  }
  return result;
}
export function mergeContent(current, incoming) {
  const merge = (a,b) => [...new Map([...a,...b].map(v=>[v.id,v])).values()];
  const result={version:1,books:merge(current.books,incoming.books),notes:merge(current.notes,incoming.notes).sort((a,b)=>Date.parse(b.created)-Date.parse(a.created)),games:merge(current.games||[],incoming.games||[])};
  if(current.gameSeeds!==undefined||incoming.gameSeeds!==undefined)result.gameSeeds=[...new Set([...(current.gameSeeds||[]),...(incoming.gameSeeds||[])])];
  validateGameCoverBudget(result.games);
  return result;
}
