import {ghostWorld,worldAssetRoot} from './world-theme.js';
import {escapeHTML as esc,webURL,normalizeBoard,addExcerpt} from './board-model.js';

export function createBoard({notify=()=>{}}={}){
  let data=normalizeBoard(),db=null;const listeners=new Set();
  const snapshot=()=>structuredClone(data),emit=()=>listeners.forEach(fn=>fn(snapshot()));
  const ready=new Promise((resolve,reject)=>{const req=indexedDB.open('hao-collection-wall',1);req.onupgradeneeded=()=>req.result.createObjectStore('wall');req.onerror=()=>reject(req.error);req.onsuccess=()=>{db=req.result;const get=db.transaction('wall').objectStore('wall').get('content');get.onerror=()=>reject(get.error);get.onsuccess=()=>{data=normalizeBoard(get.result||{
    photos:[{id:'desk',title:'我的秘密基地',image:'/assets/scene/persona5-base-medium.webp'}],
    projects:[{id:'hideout',title:"HAO'S HIDEOUT",description:'阅读、听歌与收藏喜欢的事物。这个桌面正在慢慢长大。',url:location.origin+'/',image:'/assets/scene/persona5-base-medium.webp'}],
    links:[{id:'github',title:'GitHub',url:'https://github.com/',description:'代码与灵感'},{id:'steam',title:'Steam',url:'https://store.steampowered.com/',description:'下一段冒险'}],quotes:[]});emit();resolve();};};}).catch(error=>{notify('墙板收藏暂时无法读取，请检查浏览器存储权限');throw error;});
  ready.catch(()=>{});
  async function commit(next){await ready;await new Promise((resolve,reject)=>{const tx=db.transaction('wall','readwrite');tx.objectStore('wall').put(normalizeBoard(next),'content');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('保存未完成'));});data=normalizeBoard(next);emit();}
  return {ready,snapshot,subscribe(fn){listeners.add(fn);fn(snapshot());return()=>listeners.delete(fn);},
    async add(kind,item){if(!['photos','projects','links'].includes(kind))return;await ready;if(data[kind].length>=100)throw new Error('这个收藏夹已满，请先移除不需要的条目');await commit({...data,[kind]:[...data[kind],{...item,id:crypto.randomUUID()}]});},
    async update(kind,id,item){await commit({...data,[kind]:data[kind].map(x=>x.id===id?{...x,...item,id}:x)});},
    async remove(kind,id){await commit({...data,[kind]:data[kind].filter(x=>x.id!==id)});},
    async pin(excerpt){await ready;await commit(addExcerpt(data,excerpt));notify('摘录已钉到墙上的「一句留存」');},
    export(){const url=URL.createObjectURL(new Blob([JSON.stringify({format:'hao-wall-v1',...data},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='hao-墙板收藏.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);},
    async import(file){if(file.size>25*1024*1024)throw new Error('墙板备份请小于 25 MB');const value=JSON.parse(await file.text());if(value.format!=='hao-wall-v1')throw new Error('请选择墙板导出的备份');const next=normalizeBoard(value);for(const kind of ['projects','links'])if(next[kind].some(x=>!webURL(x.url)))throw new Error('备份中存在不支持的网址');if(next.photos.some(x=>!/^data:image\/(jpeg|png|webp);base64,|^\/assets\//.test(x.image||'')))throw new Error('备份中的照片格式不支持');await commit(Object.fromEntries(Object.keys(data).map(k=>[k,[...new Map([...data[k],...next[k]].map(x=>[x.id,x])).values()]])));},
  };
}

async function readPhoto(file){
  if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type))throw new Error('请选择 JPG、PNG、WebP 或 GIF 图片');
  if(file.size>20*1024*1024)throw new Error('单张图片请小于 20 MB');
  const url=URL.createObjectURL(file);try{const image=new Image();image.src=url;await image.decode();const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(image.naturalWidth*scale));c.height=Math.max(1,Math.round(image.naturalHeight*scale));c.getContext('2d').drawImage(image,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.88);}finally{URL.revokeObjectURL(url);}
}

export function mountBoard(root,board,{kind='photos',notify=()=>{},openBook=()=>{}}={}){
  let disposed=false,selected=0,editing=null,state=board.snapshot(),unsubscribe=()=>{};
  const labels={photos:['影像收藏','把想看的画面，留在这里。'],projects:['正在创造','从档案袋里，抽出一个项目。'],links:['去往别处','下一站，由你决定。'],quotes:['一句留存','从书页，留到墙上。']};
  root.innerHTML='<div class="wall-collection"><p role="status">正在打开收藏…</p></div>';
  function message(error){notify(error?.name==='QuotaExceededError'?'浏览器存储空间不足，请先导出收藏':error.message||'操作未完成，请重试');}
  const run=fn=>async event=>{try{await fn(event);}catch(error){message(error);}};
  function draw(){if(disposed)return;const items=state[kind];selected=Math.min(selected,Math.max(0,items.length-1));const item=items[selected],label=labels[kind];
    root.innerHTML=`<section class="wall-collection wall-${kind}"><header class="wall-title"><span>${label[1]}</span><h2>${label[0]}</h2><span class="wall-count">${items.length} ${kind==='photos'?'张':kind==='quotes'?'段':'项'}</span></header><div class="wall-workspace">${kind==='photos'?photoMarkup(item,items):kind==='quotes'?quoteMarkup(items):listMarkup(items,item)}</div><footer class="wall-tools">${kind==='quotes'?'<button type="button" data-action="read">去读一本书 ↗</button>':'<button type="button" data-action="add">＋ '+(kind==='photos'?'放入照片':kind==='projects'?'加入项目':'收藏网址')+'</button>'}<details><summary>收藏保管</summary><button type="button" data-action="export">导出墙板收藏</button><button type="button" data-action="import">导入墙板备份</button></details></footer><input type="file" class="wall-file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden><input type="file" class="wall-backup" accept="application/json,.json" hidden><div class="wall-editor" hidden></div></section>`;
    root.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>{selected=Number(b.dataset.select);draw();});
    root.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{selected=(selected+Number(b.dataset.step)+items.length)%items.length;draw();});
    root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=run(async()=>{if(b.dataset.confirm!=='yes'){b.dataset.confirm='yes';b.textContent='确认移除';return;}await board.remove(kind,b.dataset.remove);}));
    root.querySelectorAll('[data-read-quote]').forEach(b=>b.onclick=()=>openBook(items.find(x=>x.id===b.dataset.readQuote)));
    root.querySelector('[data-action="read"]')?.addEventListener('click',()=>openBook(null));
    root.querySelector('[data-action="add"]')?.addEventListener('click',()=>kind==='photos'?root.querySelector('.wall-file').click():showEditor());
    root.querySelector('[data-action="edit"]')?.addEventListener('click',()=>showEditor(item));
    root.querySelector('[data-action="export"]').onclick=()=>board.export();
    root.querySelector('[data-action="import"]').onclick=()=>root.querySelector('.wall-backup').click();
    root.querySelector('.wall-backup').onchange=run(async e=>{if(e.target.files[0]){await board.import(e.target.files[0]);notify('墙板收藏已合并');}});
    root.querySelector('.wall-file').onchange=run(async e=>{const files=[...e.target.files];for(const file of files){await board.add('photos',{title:file.name.replace(/\.[^.]+$/,''),image:await readPhoto(file)});}notify(`已放入 ${files.length} 张照片`);});
  }
  const displayImage=item=>ghostWorld&&['desk','hideout'].includes(item.id)&&item.image==='/assets/scene/persona5-base-medium.webp'?worldAssetRoot+'base-medium.webp':item.image;
  function photoMarkup(item,items){return item?`<div class="wall-photo-stage"><figure class="wall-polaroid"><img src="${esc(displayImage(item))}" alt="${esc(item.title)}"><figcaption>${esc(item.title)}</figcaption></figure><div class="wall-photo-nav"><button type="button" data-step="-1" aria-label="上一张照片" ${items.length<2?'disabled':''}>←</button><span>${selected+1} / ${items.length}</span><button type="button" data-step="1" aria-label="下一张照片" ${items.length<2?'disabled':''}>→</button></div><div class="wall-photo-strip">${items.map((x,i)=>`<button type="button" data-select="${i}" aria-label="查看 ${esc(x.title)}" aria-pressed="${i===selected}"><img src="${esc(displayImage(x))}" alt=""></button>`).join('')}</div><button type="button" class="wall-remove" data-remove="${esc(item.id)}">移除这张</button></div>`:'<div class="wall-empty">这里还没有照片。<br>把一张喜欢的画面放进来。</div>';}
  function listMarkup(items,item){return `<nav class="wall-index" aria-label="${labels[kind][0]}">${items.map((x,i)=>`<button type="button" data-select="${i}" aria-pressed="${i===selected}"><small>${String(i+1).padStart(2,'0')}</small><span>${esc(x.title)}</span></button>`).join('')||'<p>你的收藏还在等第一项。</p>'}</nav>${item?`<article class="wall-file-paper">${item.image?`<img class="wall-project-cover" src="${esc(displayImage(item))}" alt="${esc(item.title)}">`:''}<span class="wall-paper-tag">${kind==='projects'?'PROJECT FILE':'DESTINATION'}</span><h3>${esc(item.title)}</h3><p>${esc(item.description||'')}</p><a class="wall-visit" href="${esc(webURL(item.url)||'#')}" target="_blank" rel="noopener noreferrer">${kind==='projects'?'打开项目':'前往网站'} ↗</a><div class="wall-item-tools"><button type="button" data-action="edit">编辑</button><button type="button" data-remove="${esc(item.id)}">移除</button></div></article>`:'<div class="wall-empty">留一个入口，<br>下次再来。</div>'}`;}
  function quoteMarkup(items){return items.length?`<div class="wall-quotes">${items.map(x=>`<article class="wall-quote"><blockquote>${esc(x.text)}</blockquote><cite>${esc(x.bookTitle)}</cite><div><button type="button" data-read-quote="${esc(x.id)}">回到书页 ↗</button><button type="button" data-remove="${esc(x.id)}">取下</button></div></article>`).join('')}</div>`:'<div class="wall-empty"><strong>还没有钉上的句子。</strong><p>读书时选中文字，点「钉到墙上」，就会留在这里。</p></div>';}
  function showEditor(item){editing=item?.id||null;const host=root.querySelector('.wall-editor');host.hidden=false;host.innerHTML=`<form><h3>${item?'编辑':'加入'}${kind==='projects'?'项目':'网址'}</h3><label>名称<input name="title" required maxlength="90" value="${esc(item?.title||'')}" autocomplete="off"></label><label>网址<input name="url" type="url" required placeholder="https://" value="${esc(item?.url||'')}"></label><label>一句介绍<textarea name="description" maxlength="600">${esc(item?.description||'')}</textarea></label><div><button type="submit">保存</button><button type="button" data-cancel>取消</button></div><p class="wall-form-error" role="alert"></p></form>`;host.querySelector('[data-cancel]').onclick=()=>{host.hidden=true;};host.querySelector('input').focus();host.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=new FormData(e.target),url=webURL(form.get('url'));if(!url){host.querySelector('[role="alert"]').textContent='请填写 http 或 https 网址';return;}const value={title:String(form.get('title')).trim(),url,description:String(form.get('description')).trim()};try{if(editing)await board.update(kind,editing,value);else await board.add(kind,value);notify('已放回收藏墙');}catch(error){host.querySelector('[role="alert"]').textContent=error.message||'保存失败';}};}
  const onKey=e=>{if(kind!=='photos'||e.target.closest('input,textarea,button,summary')||!state.photos.length)return;if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();selected=(selected+(e.key==='ArrowLeft'?-1:1)+state.photos.length)%state.photos.length;draw();}};
  root.addEventListener('keydown',onKey);
  board.ready.then(()=>{if(!disposed){unsubscribe=board.subscribe(value=>{state=value;draw();});}}).catch(error=>{if(!disposed)root.innerHTML=`<p role="alert">${esc(error.message||'无法打开收藏')}</p>`;});
  return ()=>{disposed=true;unsubscribe();root.removeEventListener('keydown',onKey);};
}
