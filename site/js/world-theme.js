// Presentation only. The sealed world remains the exact default/fallback.
export let ghostWorld = new URLSearchParams(globalThis.location?.search || '').get('world') === 'ghostblade';
export const worldAssetRoot = '/assets/worlds/ghostblade/';
export let worldTitle = ghostWorld ? 'hao的树洞 · 日光工作室' : 'hao的树洞 · 绯红夜航';
export let currentWorld = ghostWorld ? 'ghostblade' : 'persona';
export const worlds = Object.freeze([
  Object.freeze({id:'persona',name:'绯红夜航',lines:['绯红','夜航'],description:'红与黑之间，日常有了另一面。',number:'01'}),
  Object.freeze({id:'ghostblade',name:'日光工作室',lines:['日光工作室'],description:'日光穿过高楼，生活留在桌上。',number:'02'}),
]);
// Stable deep links also support opening a world directly in a new tab.
// Normal in-page switches use applyWorld and retain the live audio instances.
export function worldHref(id, currentURL = globalThis.location.href) {
  if (!worlds.some(world => world.id === id)) throw new RangeError('Unknown world');
  const url = new URL(currentURL);
  if (id === 'persona') url.searchParams.delete('world');
  else url.searchParams.set('world', id);
  url.hash = '';
  return url.href;
}
const surfaces = new Set(['book-cover.png','mission-profile.png','board-gallery.png','board-links.png','board-projects.png','board-quotes.png']);
export function themeAsset(path) {
  if (!ghostWorld) return path;
  if (path === '/assets/turntable/empty-desktop-slot.webp') return worldAssetRoot + 'empty-desktop-slot.webp';
  const name = path.split('/').pop();
  return surfaces.has(name) ? worldAssetRoot + name : path;
}
export function applyWorld(id){
  if(!worlds.some(world=>world.id===id))throw new RangeError('Unknown world');
  currentWorld=id;ghostWorld=id==='ghostblade';worldTitle='hao的树洞 · '+worlds.find(world=>world.id===id).name;
  if(!globalThis.document)return;
  if(ghostWorld)document.documentElement.dataset.world='ghostblade';else delete document.documentElement.dataset.world;
  document.title=worldTitle;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',ghostWorld?'#142421':'#e31336');
  document.querySelector('#fallback')?.setAttribute('src',ghostWorld?worldAssetRoot+'base-medium.webp':'/assets/scene/persona5.webp');
}
if(globalThis.document)applyWorld(currentWorld);
