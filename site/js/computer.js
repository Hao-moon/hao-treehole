import {SCREEN_THEMES, validateWallpaper, normalisePreferences, nextWallpaper} from './computer-model.js';
import {ghostWorld} from './world-theme.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let database;
function openWallpapers(){
  if(database)return database;
  database=new Promise((resolve,reject)=>{
    const request=indexedDB.open('hao-computer-wallpapers',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('images',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>{database=null;reject(request.error);};
    request.onblocked=()=>{database=null;reject(new Error('请关闭其他树洞标签后再试'));};
  });return database;
}
async function imageStore(mode,action){
  const db=await openWallpapers();return new Promise((resolve,reject)=>{
    const transaction=db.transaction('images',mode),request=action(transaction.objectStore('images'));
    transaction.oncomplete=()=>resolve(request.result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error||new Error('图片未能保存'));
  });
}
export function createComputer({notify=()=>{}}={}){
  const PREF_KEY=ghostWorld?'hao-computer-ghostblade-v1':'hao-computer-v1',DEFAULT_THEME=ghostWorld?'ghostblade':'persona';
  let saved={};try{saved=JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{};}catch{}
  let state={power:saved.power==='standby'?'standby':'on',theme:typeof saved.theme==='string'?saved.theme:DEFAULT_THEME,...normalisePreferences(ghostWorld?{fit:'contain',...saved}:saved)};
  let themes=SCREEN_THEMES.filter(t=>ghostWorld||t.id!=='ghostblade').map(t=>({...t})),listeners=new Set(),disposed=false,rotationTimer;
  const frames=Object.create(null);if(saved.frames&&typeof saved.frames==='object')for(const [id,value] of Object.entries(saved.frames)){if(value&&typeof value==='object'){const {fit,focalX,focalY}=normalisePreferences(value);frames[id]={fit,focalX,focalY};}}
  function currentTheme(){return themes.find(t=>t.id===state.theme)||themes.find(t=>t.id===DEFAULT_THEME);}
  function getState(){return {...state,themeData:{...currentTheme()},imageUrl:currentTheme().imageUrl,themes:themes.map(t=>({...t}))};}
  function save(){try{const {power,theme,fit,focalX,focalY,rotation,interval}=state;localStorage.setItem(PREF_KEY,JSON.stringify({power,theme,fit,focalX,focalY,rotation,interval,frames}));}catch{notify('屏幕设置暂时只能保留在本次访问中');}}
  function applyTheme(id){state.theme=id;Object.assign(state,frames[id]||{fit:ghostWorld&&id==='ghostblade'?'contain':'cover',focalX:50,focalY:50});}
  function emit(){if(disposed)return;listeners.forEach(fn=>fn(getState()));}
  function configureRotation(){clearInterval(rotationTimer);if(state.rotation&&state.power==='on')rotationTimer=setInterval(()=>{applyTheme(nextWallpaper(themes,state.theme));save();emit();},state.interval*1000);}
  const ready=imageStore('readonly',store=>store.getAll()).then(items=>{
    if(disposed)return;for(const item of items)themes.push({id:item.id,name:item.name,subtitle:'我的图片',builtin:false,imageUrl:URL.createObjectURL(item.blob)});
    if(!themes.some(t=>t.id===state.theme))state.theme=DEFAULT_THEME;emit();
  }).catch(()=>notify('自选屏保暂时无法读取，内置主题仍可使用'));
  configureRotation();
  return {
    ready,getState,subscribe(fn){listeners.add(fn);fn(getState());return()=>listeners.delete(fn);},
    setPower(power){state.power=power==='standby'?'standby':'on';save();configureRotation();emit();},
    selectTheme(id){if(!themes.some(t=>t.id===id))return;applyTheme(id);save();configureRotation();emit();},
    setPreferences(patch){state={...state,...normalisePreferences({...state,...patch})};frames[state.theme]={fit:state.fit,focalX:state.focalX,focalY:state.focalY};save();configureRotation();emit();},
    async importWallpaper(file){
      validateWallpaper(file);await ready;if(themes.filter(t=>!t.builtin).length>=16)throw new Error('最多保留 16 张自选图片，请先移除一张');
      const temporary=URL.createObjectURL(file);
      try{const image=new Image();image.src=temporary;await image.decode();if(image.naturalWidth<64||image.naturalHeight<64)throw new Error('请选择至少 64 × 64 像素的图片');if(image.naturalWidth*image.naturalHeight>40000000)throw new Error('图片尺寸过大，请缩小到 4000 万像素以内');}
      catch(error){URL.revokeObjectURL(temporary);throw new Error(error.message.includes('像素')?error.message:'无法读取这张图片，请换一张试试');}
      const item={id:`custom-${crypto.randomUUID()}`,name:file.name.replace(/\.[^.]+$/,'').slice(0,60)||'我的屏保',blob:file};
      try{await imageStore('readwrite',store=>store.put(item));}catch{URL.revokeObjectURL(temporary);throw new Error('图片没有保存成功，请检查浏览器可用空间');}
      if(disposed){URL.revokeObjectURL(temporary);return item.id;}
      themes.push({id:item.id,name:item.name,subtitle:'我的图片',builtin:false,imageUrl:temporary});applyTheme(item.id);save();emit();return item.id;
    },
    async removeWallpaper(id){const item=themes.find(t=>t.id===id&&!t.builtin);if(!item)return;await imageStore('readwrite',store=>store.delete(id));themes=themes.filter(t=>t.id!==id);delete frames[id];if(state.theme===id)applyTheme(DEFAULT_THEME);save();emit();URL.revokeObjectURL(item.imageUrl);},
    dispose(){disposed=true;clearInterval(rotationTimer);listeners.clear();themes.filter(t=>!t.builtin).forEach(t=>URL.revokeObjectURL(t.imageUrl));},
  };
}

export function mountComputer(root,controller,{mode='screen'}={}){
  const abort=new AbortController(),{signal}=abort;let disposed=false,lastThemeKey='';
  const on=(element,event,callback,options={})=>element.addEventListener(event,callback,{...options,signal});
  const entry=mode==='tower'?'tower':'screen';
  if(entry!=='tower')controller.setPower('on');
  root.classList.add('computer-mount');
  root.innerHTML=`<section class="computer-shell" aria-label="HAO 的电脑" data-entry="${entry}" tabindex="-1">
    <div class="computer-topbar"><span class="computer-brand">H / OS <b>01</b></span><span class="computer-section-label">屏保</span><button class="computer-power" data-power aria-label="电脑进入待机"><i></i><span>待机</span></button></div>
    <div class="computer-workspace">
      <div class="computer-view"><div class="computer-screen-view"><img class="computer-wallpaper" alt="当前屏保"><div class="computer-screen-label"><small>PERSONAL DESKTOP</small><strong></strong></div><div class="computer-screen-corner">HAO / HIDEOUT</div></div>
        <div class="computer-standby" hidden><span class="computer-standby-mark">H<span>/</span></span><h2>房间还醒着。</h2><p>电脑已待机，屏幕和指示灯已同步熄灭。</p><button data-wake>唤醒电脑 ↗</button></div>
      </div>
      <aside class="computer-tools">
        <div data-tools="screen"><div class="computer-tools-heading"><small>SCREEN / COLLECTION</small><h2>换一个画面。</h2></div><div class="computer-theme-list" role="group" aria-label="选择屏保"></div>
          <label class="computer-import">＋ 导入自己的图片<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" aria-label="导入自己的屏保图片"></label><p class="computer-fine-print">PNG / JPG / WebP / AVIF · 单张 12 MB 内<br>保存在此浏览器，下次回来仍在。</p>
          <div class="computer-framing"><label>画面适配<select data-pref="fit"><option value="cover">填满屏幕</option><option value="contain">完整显示</option></select></label><label>左右位置<input type="range" data-pref="focalX" min="0" max="100" step="1" aria-label="屏保左右位置"></label><label>上下位置<input type="range" data-pref="focalY" min="0" max="100" step="1" aria-label="屏保上下位置"></label></div>
          <label class="computer-rotation"><input type="checkbox" data-pref="rotation"> 自动轮播</label><label class="computer-interval">每隔<select data-pref="interval"><option value="30">30 秒</option><option value="60">1 分钟</option><option value="300">5 分钟</option></select>换一张</label><button class="computer-remove" data-remove hidden>移除这张自选图片</button>
        </div>
        <div class="computer-feedback" role="status" aria-live="polite"></div>
      </aside>
    </div><footer class="computer-bottom"><span><i></i><b>运行中</b></span><span>THIS ROOM IS YOURS.</span></footer>
  </section>`;
  const $=selector=>root.querySelector(selector),$$=selector=>root.querySelectorAll(selector);
  const feedback=message=>{$('.computer-feedback').textContent=message;};
  const unsubscribe=controller.subscribe(state=>{
    if(disposed)return;const standby=state.power==='standby';$('.computer-shell').dataset.power=state.power;
    $('.computer-standby').hidden=!standby;$('.computer-bottom b').textContent=standby?'待机中':'运行中';$('.computer-power span').textContent=standby?'唤醒':'待机';$('.computer-power').setAttribute('aria-label',standby?'唤醒电脑':'电脑进入待机');
    $('.computer-screen-view').hidden=standby;
    const wallpaper=$('.computer-wallpaper');if(wallpaper.getAttribute('src')!==state.imageUrl)wallpaper.src=state.imageUrl;wallpaper.style.objectFit=state.fit;wallpaper.style.objectPosition=`${state.focalX}% ${state.focalY}%`;wallpaper.alt=state.themeData.name+'屏保';$('.computer-screen-label strong').textContent=state.themeData.name;
    const themeKey=state.themes.map(t=>t.id).join('|');if(themeKey!==lastThemeKey){lastThemeKey=themeKey;$('.computer-theme-list').innerHTML=state.themes.map(t=>`<button data-theme="${escape(t.id)}" title="${escape(t.name)}"><img src="${escape(t.imageUrl)}" alt=""><span><strong>${escape(t.name)}</strong><small>${escape(t.subtitle)}</small></span><b>↗</b></button>`).join('');}
    $$('[data-theme]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.theme===state.theme)));
    $$('[data-pref]').forEach(el=>{if(el.type==='checkbox')el.checked=state[el.dataset.pref];else if(document.activeElement!==el)el.value=state[el.dataset.pref];});
    $('[data-remove]').hidden=state.themeData.builtin;$('[data-pref="interval"]').disabled=!state.rotation;
  });
  on(root,'click',async e=>{
    const button=e.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-power'))controller.setPower(controller.getState().power==='on'?'standby':'on');
    if(button.hasAttribute('data-wake'))controller.setPower('on');
    if(button.dataset.theme){controller.selectTheme(button.dataset.theme);feedback('已应用到桌面显示器。');}
    if(button.hasAttribute('data-remove')){button.disabled=true;try{await controller.removeWallpaper(controller.getState().theme);if(!disposed)feedback('自选图片已移除。');}catch{if(!disposed)feedback('图片未能移除，请重试。');}finally{button.disabled=false;}}
  });
  on(root,'change',e=>{if(e.target.dataset.pref){const key=e.target.dataset.pref;controller.setPreferences({[key]:e.target.type==='checkbox'?e.target.checked:e.target.value});}});
  on(root,'input',e=>{if(e.target.type==='range'&&e.target.dataset.pref)controller.setPreferences({[e.target.dataset.pref]:Number(e.target.value)});});
  on($('.computer-import input'),'change',async e=>{const file=e.target.files[0];if(!file)return;feedback('正在保存图片…');e.target.disabled=true;try{await controller.importWallpaper(file);if(!disposed)feedback('已保存，并应用到桌面显示器。');}catch(error){if(!disposed)feedback(error.message);}finally{e.target.value='';e.target.disabled=false;}});
  return()=>{disposed=true;abort.abort();unsubscribe();root.classList.remove('computer-mount');};
}
