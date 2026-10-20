import {createModelViewer} from './model-viewer.js';
import {loadFigure} from './figure-engine.js';
import {accent} from './card-motion.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const externalLink=(url,label)=>url?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`:escape(label);
const modelUrl=entry=>entry.modelUrl||entry.sourceUrl||(entry.sketchfabId?`https://sketchfab.com/models/${encodeURIComponent(entry.sketchfabId)}`:entry.authorUrl);
const availability=entry=>entry.src?'local':entry.availability==='online'&&entry.sketchfabId?'online':'unavailable';
const count=value=>Number.isFinite(value)?new Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:1}).format(value):null;
function modelStats(entry){
  const stats=entry.stats||{},parts=[[stats.views,'浏览'],[stats.likes,'喜欢'],[stats.downloads,'下载']].flatMap(([value,label])=>count(value)!==null?[`${count(value)} ${label}`]:[]);
  return parts.length?`${parts.join(' · ')}${stats.checkedAt?` · ${String(stats.checkedAt).slice(0,10)}`:''}`:'';
}

export function mountCharacterCard(body,panel,library,onTitle){
  const current=library.current();
  body.innerHTML=`<div class="character-card">
    <section class="character-viewer" aria-label="可旋转的三维手办" data-state="loading">
      <div class="character-view"><span class="character-number" aria-hidden="true">${escape(current.number)}</span><span class="character-stamp">人物档案</span>
        <canvas tabindex="0" aria-label="拖动旋转手办，滚轮缩放，右键拖动平移" aria-describedby="character-help"></canvas>
        <p class="character-loading" role="status">正在唤醒收藏…</p><button data-model-retry hidden>重新加载</button>
      </div>
      <div class="character-controls" role="group" aria-label="三维手办控制"><button data-model-auto aria-pressed="false">自动旋转</button><button data-model-out aria-label="缩小模型">−</button><output class="character-scale" aria-label="模型缩放比例">100%</output><button data-model-in aria-label="放大模型">＋</button><button data-model-reset>复位</button></div>
      <p id="character-help" class="character-help">拖动旋转 · 滚轮 / 双指缩放 · 右键 / 双指平移<span class="sr-only">。方向键转动，加减键缩放，起始键复位。</span></p>
      <div class="character-online-info" hidden><p class="character-online-context"></p><p class="character-online-status" role="status"></p><div class="character-online-actions"><button data-return-desktop>回到桌面手办</button><a class="character-online-source" target="_blank" rel="noopener noreferrer">原站查看 ↗</a></div></div>
    </section><section class="character-dossier" aria-label="人物简介"></section>
    <section id="figure-picker" class="figure-picker" aria-label="切换桌面手办" hidden>
      <div class="figure-picker-heading"><h2>换一位主角</h2><button data-picker-close>收起</button></div>
      <p class="figure-picker-intro">本地模型可摆上桌面，在线模型在这里预览。</p><div class="figure-options"></div><p class="figure-picker-status" role="status" hidden></p>
      <details><summary>＋ 加入本地手办</summary><form class="figure-import">
        <label>模型文件<input name="model" type="file" accept=".glb" required></label>
        <label>角色名字<input name="name" maxlength="60" placeholder="例如：轨道雕塑"></label>
        <label>登场作品<input name="series" maxlength="60" placeholder="例如：《福音战士》"></label>
        <label>人物简介<textarea name="bio" maxlength="400" placeholder="留下简洁的人物介绍"></textarea></label>
        <button class="primary" type="submit">加入并摆上桌面 ↗</button><p class="small-copy">支持带贴图的 GLB，最大 40 兆。模型保存在当前浏览器；切换后，桌面会一起更新。</p>
      </form></details>
    </section>
  </div>`;
  const toggle=document.createElement('button');toggle.className='figure-selector-toggle';toggle.setAttribute('aria-label','切换桌面手办');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','figure-picker');toggle.innerHTML='<img src="/assets/scene/mask-icon.png" alt=""><span>切换手办</span>';panel.append(toggle);
  const picker=body.querySelector('.figure-picker'),status=body.querySelector('.figure-picker-status'),viewerRoot=body.querySelector('.character-viewer'),viewport=body.querySelector('.character-view'),onlineInfo=body.querySelector('.character-online-info');
  const abort=new AbortController(),signal=abort.signal;
  let disposed=false,switchToken=0,shown=current,frame=null,frameTimer=0;
  let viewer=createModelViewer(viewerRoot,current);
  function dossier(entry){
    const facts=[entry.origin&&['出身',entry.origin],entry.voice&&['配音',entry.voice]].filter(Boolean);
    body.querySelector('.character-number').textContent=entry.number||'藏';
    const attribution=entry.author?`模型：${externalLink(entry.authorUrl,entry.author)}${entry.license?` · ${externalLink(entry.license,entry.licenseLabel||'查看模型许可')}`:entry.licenseLabel?` · ${escape(entry.licenseLabel)}`:' · 原作者展示'}`:'本地收藏 · 仅保存在这个浏览器';
    body.querySelector('.character-dossier').innerHTML=`<span class="character-series">${escape(entry.series)}</span><h2>${escape(entry.fullName||entry.name)}</h2><span class="character-role">${escape(entry.role||'个人收藏')}</span><div class="character-profile"><p class="character-bio">${escape(entry.bio||'这件收藏的故事，等待你来记录。')}</p>${facts.length?`<dl class="character-facts">${facts.map(([k,v])=>`<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`).join('')}</dl>`:''}</div><div class="character-sources">${entry.bioSource?`${externalLink(entry.bioSource,'人物资料 · 介绍 ↗')}<br>`:''}${attribution}${entry.modelNote?`<br>${escape(entry.modelNote)}`:entry.id==='asuka-refined'?' · 脸型调整':''}${modelUrl(entry)?`<br>${externalLink(modelUrl(entry),'模型原页 ↗')}${entry.downloadUrl?` · ${externalLink(entry.downloadUrl,'免费下载 ↗')}`:''}`:''}</div>`;
    onTitle(entry.name);drawOptions();
  }
  function drawOptions(){
    const groups=new Map();let index=0;
    for(const entry of library.list()){const series=entry.series||'我的收藏';if(!groups.has(series))groups.set(series,[]);groups.get(series).push(entry);}
    body.querySelector('.figure-options').innerHTML=[...groups].map(([series,entries])=>`<section class="figure-group"><h3>${escape(series)}</h3><div class="figure-group-options">${entries.map(entry=>{
      const type=availability(entry),stats=modelStats(entry),desktop=entry.id===library.current().id;
      const state=type==='local'?(desktop?'桌面陈列中':'可摆上桌面'):type==='online'?'在线预览':'暂未接入';
      return `<button class="figure-option" data-figure-id="${escape(entry.id)}" data-availability="${type}" aria-pressed="${entry.id===shown.id}" ${type==='unavailable'?'disabled':''}><b aria-hidden="true">${String(++index).padStart(2,'0')}</b><span class="figure-option-copy"><strong>${escape(entry.label||entry.name)}</strong><small>${escape(entry.note||entry.modelNote||'')}</small>${stats?`<small class="figure-option-stats">${escape(stats)}</small>`:''}</span><span class="figure-option-badge">${state}</span></button>`;
    }).join('')}</div></section>`).join('');
  }
  function setPicker(open){picker.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open){const page=body.closest('.object-page');if(page)page.scrollTop=0;drawOptions();accent(picker,'paper');picker.querySelector('[aria-pressed=true]')?.focus({preventScroll:true});}else toggle.focus({preventScroll:true});}
  function clearFrame(){clearTimeout(frameTimer);frameTimer=0;frame?.remove();frame=null;}
  function showLocal(entry){
    clearFrame();shown=entry;viewerRoot.dataset.mode='local';onlineInfo.hidden=true;
    body.querySelector('.character-controls').hidden=false;body.querySelector('.character-help').hidden=false;
    if(viewer)viewer.setModel(entry);
    else{
      const oldCanvas=viewport.querySelector('canvas'),canvas=oldCanvas.cloneNode(false);oldCanvas.replaceWith(canvas);canvas.hidden=false;
      viewer=createModelViewer(viewerRoot,entry);
    }
    dossier(entry);
  }
  function showOnline(entry){
    clearFrame();viewer?.dispose();viewer=null;shown=entry;viewerRoot.dataset.mode='online';viewerRoot.dataset.state='external';delete viewerRoot.dataset.model;
    viewport.querySelector('canvas').hidden=true;viewport.querySelector('.character-loading').hidden=true;viewport.querySelector('[data-model-retry]').hidden=true;
    body.querySelector('.character-controls').hidden=true;body.querySelector('.character-help').hidden=true;onlineInfo.hidden=false;
    onlineInfo.querySelector('.character-online-context').textContent=`在线预览 · 桌面仍陈列${library.current().name}`;
    const message=onlineInfo.querySelector('.character-online-status');message.textContent='正在连接 Sketchfab 预览…';
    const source=onlineInfo.querySelector('.character-online-source');source.href=entry.downloadUrl||modelUrl(entry);source.textContent=entry.downloadUrl?'原页 / 免费下载 ↗':'原站查看 ↗';
    const iframe=document.createElement('iframe');frame=iframe;iframe.className='character-embed';iframe.title=`${entry.fullName||entry.name} · Sketchfab 三维模型`;iframe.allow='autoplay; fullscreen; xr-spatial-tracking';iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';
    iframe.addEventListener('load',()=>{if(frame!==iframe||disposed)return;clearTimeout(frameTimer);message.textContent='预览由 Sketchfab 提供；若画面空白或需要登录，可在原站打开。';},{once:true,signal});
    iframe.addEventListener('error',()=>{if(frame===iframe&&!disposed)message.textContent='暂时无法连接预览，可在原站打开模型。';},{once:true,signal});
    iframe.src=`https://sketchfab.com/models/${encodeURIComponent(entry.sketchfabId)}/embed?autostart=1&ui_hint=0`;
    viewport.append(iframe);frameTimer=setTimeout(()=>{if(frame===iframe&&!disposed)message.textContent='预览若未出现，可在原站打开；部分模型可能需要登录。';},15000);
    dossier(entry);
  }
  async function select(entry){
    const type=availability(entry);if(type==='unavailable')return;
    const token=++switchToken;
    if(type==='online'){showOnline(entry);status.hidden=true;setPicker(false);accent(body.querySelector('.character-dossier'),'paper');return;}
    status.hidden=false;status.textContent='正在准备手办…';
    try{await loadFigure(entry);if(disposed||token!==switchToken)return;library.select(entry.id);status.hidden=true;setPicker(false);accent(body.querySelector('.character-dossier'),'paper');}
    catch(error){if(disposed||token!==switchToken)return;status.textContent='这件手办暂时未能加载，请重新选择。';}
  }
  toggle.addEventListener('click',()=>setPicker(picker.hidden),{signal});
  body.addEventListener('click',e=>{if(e.target.closest('[data-picker-close]'))setPicker(false);if(e.target.closest('[data-return-desktop]')){switchToken++;showLocal(library.current());status.hidden=true;}const button=e.target.closest('[data-figure-id]');if(button&&!button.disabled){const entry=library.list().find(m=>m.id===button.dataset.figureId);if(entry)select(entry);}},{signal});
  picker.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();setPicker(false);}},{signal});
  const form=body.querySelector('.figure-import');
  form.addEventListener('submit',async e=>{
    e.preventDefault();const file=form.elements.model.files[0];if(!file)return;
    const submit=form.querySelector('button');submit.disabled=true;status.hidden=false;status.textContent='正在保存本地手办…';
    try{const entry=await library.add(file,{name:form.elements.name.value,series:form.elements.series.value,bio:form.elements.bio.value});if(disposed)return;form.reset();drawOptions();await select(entry);}
    catch(error){if(!disposed){status.hidden=false;status.textContent=error.name==='QuotaExceededError'?'浏览器空间不足，请保留原文件后再试':error.message||'导入失败，请重试';}}
    finally{submit.disabled=false;}
  },{signal});
  const unsubscribe=library.subscribe(entry=>{switchToken++;showLocal(entry);});dossier(current);
  return ()=>{disposed=true;switchToken++;abort.abort();unsubscribe();clearFrame();viewer?.dispose();toggle.remove();};
}
