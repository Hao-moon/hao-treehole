export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function webURL(value){try{const u=new URL(String(value).trim());return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}}
export function normalizeBoard(data={}){
  const arrays=['photos','projects','links','quotes'];
  return Object.fromEntries(arrays.map(k=>[k,Array.isArray(data[k])?data[k].filter(x=>x&&typeof x.id==='string').slice(0,k==='quotes'?300:100):[]]));
}
export function addExcerpt(data,excerpt){
  const text=String(excerpt.text||'').trim().slice(0,12000);if(!text)throw new Error('请先选中想留下的文字');
  const same=data.quotes.find(q=>q.bookId===excerpt.bookId&&q.text===text);if(same)return data;
  return {...data,quotes:[{id:excerpt.id||crypto.randomUUID(),text,bookId:String(excerpt.bookId||''),bookTitle:String(excerpt.bookTitle||'未命名书籍'),location:excerpt.location??null,createdAt:excerpt.createdAt||Date.now()},...data.quotes].slice(0,300)};
}
