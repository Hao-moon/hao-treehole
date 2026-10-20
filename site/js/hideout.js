import {worldTitle,currentWorld,worlds,worldHref,applyWorld} from './world-theme.js';
import {bindWorldTransitions,completeWorldTransition,failWorldTransition,configureWorldTransitions,transitionToWorld} from './world-transition.js';
import {createRoom} from './room.js';
import {initialContent,readContent,saveContent,validateImport,mergeContent} from './storage.js';
import {createPlayer} from './player.js';
import {createBackgroundMusic} from './background-music.js';
import {musicLibrary} from './music-library.js';
import {createCardMotion} from './card-motion.js';
import {mountCharacterCard} from './character-card.js';
import {createFigureLibrary} from './figure-library.js';
import {mountGames} from './games.js';
import {mountPlant} from './plant.js';
import {createDiscMotion} from './disc-motion.js';
import {mountTurntable} from './turntable-card.js';
import {createExplorer} from './explore.js';
import {applyBuiltinGames} from './game-model.js';
import {builtinGames} from './game-library.js';
import {createSoundscape,mountSoundscape} from './soundscape.js';
import {createComputer,mountComputer} from './computer.js';
import {createBoard,mountBoard} from './board.js';
import {mountReader} from './reader.js';
import {escapeHTML as escape} from './board-model.js';

const $=selector=>document.querySelector(selector),panel=$('#panel'),body=$('#panel-content');
const cardMotion=createCardMotion(panel),explorer=createExplorer(),figureLibrary=createFigureLibrary();
let room,soundscape,computer,currentPanel='',disposeObject=()=>{},toastTimer,closeRequested=false,returnFocus=null,pendingRead=null;
let content=applyBuiltinGames(initialContent(),builtinGames),storageAvailable=true,foregroundPlaying=false,foregroundRequested=false,backgroundPlaying=false,soundExclusive=false;
function notify(text){const el=$('#toast');(panel.open?panel:document.body).append(el);el.textContent=text;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,4200);}
async function persist(next){if(!storageAvailable)throw new Error('当前浏览器无法保存，请允许本地存储后再试');await saveContent(next);content=next;}
const safe=fn=>async event=>{try{await fn(event);}catch(error){notify(error.name==='QuotaExceededError'?'浏览器存储空间不足，请先导出收藏':error.message||'操作未完成，请重试');}};
const discMotion=createDiscMotion(),recordMotion=createDiscMotion();
function updateDisc(){const running=foregroundPlaying||backgroundPlaying;if(discMotion.snapshot().running!==running)discMotion.setRunning(running);}
function updateBackgroundMusic(state){backgroundPlaying=state.playing;updateDisc();const label=state.failed?'BGM · 重试':state.blocked?'BGM · 点击开启':!state.enabled?'BGM · 已关闭':state.suspended?'BGM · 已让位':state.buffering?'BGM · 缓冲中':state.playing?'BGM · 播放中':'BGM · 准备播放';document.querySelectorAll('[data-bgm-toggle]').forEach(button=>{button.hidden=!state.available;button.textContent=label;button.setAttribute('aria-pressed',String(state.enabled&&!state.blocked&&!state.failed));button.setAttribute('aria-label',state.blocked||state.failed||!state.enabled?'开启背景音乐':'关闭背景音乐');button.title=state.title;});}
const backgroundMusic=createBackgroundMusic($('#bgm-audio'),{changed:updateBackgroundMusic,notify});
function updatePlayer(state){const active=state.playing||state.pending||state.buffering;const newlyActive=active&&!foregroundRequested;foregroundRequested=active;foregroundPlaying=state.playing;if(newlyActive&&soundscape&&!soundscape.snapshot().allowOverlap&&(soundscape.snapshot().playing||soundscape.snapshot().pending))soundscape.pause();room?.turntable?.update(state);if(recordMotion.snapshot().running!==state.playing)recordMotion.setRunning(state.playing);backgroundMusic.setForeground(active||soundExclusive);updateDisc();}
const player=createPlayer($('#audio'),updatePlayer,notify);
soundscape=createSoundscape({notify});computer=createComputer({notify});const board=createBoard({notify});
soundscape.subscribe(state=>{const exclusive=(state.playing||state.pending)&&!state.allowOverlap;const entering=exclusive&&!soundExclusive;soundExclusive=exclusive;if(entering&&(player.snapshot().playing||player.snapshot().pending||player.snapshot().buffering))player.pause();backgroundMusic.setForeground(foregroundRequested||soundExclusive);});
document.addEventListener('click',event=>{if(event.target.closest('[data-bgm-toggle]')){if(soundExclusive)soundscape.pause();void backgroundMusic.toggle();}});
void backgroundMusic.init(musicLibrary.background);

const titles={computer:['电脑 / 我的屏保','我的电脑'],books:['书本 / 私人书架','继续这一章'],music:['DJ 唱盘 / 本地歌单','此刻的旋律'],headphones:['耳机 / 私人声景','把世界调小'],world:['红色信标 / 世界入口','另一个世界'],about:['HAO / 个人档案','这里是 hao'],asuka:['手办 / 桌面收藏','轨道雕塑'],games:['掌机 / 我的游戏收藏','冒险存档'],tower:['主机 / 电源控制','唤醒电脑'],plant:['植物 / 窗边一角','窗边收藏'],'board-gallery':['墙板 / 拍立得','影像收藏'],'board-projects':['墙板 / 项目档案','正在创造'],'board-links':['墙板 / 网站收藏','去往别处'],'board-quotes':['墙板 / 阅读摘录','一句留存']};
const renderers={computer:()=>{disposeObject=mountComputer(body,computer,{mode:'screen'});},tower:()=>{disposeObject=mountComputer(body,computer,{mode:'tower'});},books:()=>{const target=pendingRead;pendingRead=null;disposeObject=mountReader(body,{notify,legacyBooks:content.books,onExcerpt:excerpt=>board.pin(excerpt).catch(e=>notify(e.message)),initialBookId:target?.bookId,initialLocation:target?.location});},music:()=>{disposeObject=mountTurntable(body,panel,player,recordMotion,notify,room?.turntable);},headphones:()=>{disposeObject=mountSoundscape(body,soundscape,{notify});},games:()=>{disposeObject=mountGames(body,{getContent:()=>content,persist,notify});},plant:()=>{disposeObject=mountPlant(body);},about:renderAbout,world:renderWorld,asuka:renderAsuka};
for(const [section,kind] of Object.entries({'board-gallery':'photos','board-projects':'projects','board-links':'links','board-quotes':'quotes'}))renderers[section]=()=>{disposeObject=mountBoard(body,board,{kind,notify,openBook:excerpt=>{pendingRead=excerpt;open('books');}});};
function showObject(section){
  if(!titles[section])return;explorer.close();closeRequested=false;const wasOpen=panel.open;
  if(wasOpen&&currentPanel===section&&panel.dataset.phase!=='closing'&&!pendingRead)return;
  if(wasOpen&&currentPanel===section&&section==='music'&&disposeObject.motion){cardMotion.enter(room?.anchor(section),null,disposeObject.motion);return;}
  if(!wasOpen)returnFocus=document.activeElement;
  disposeObject();disposeObject=()=>{};body.classList.remove('computer-mount');panel.querySelector('.figure-selector-toggle')?.remove();
  const origin=room?.anchor(section);currentPanel=section;panel.dataset.section=section;panel.classList.remove('is-playing');
  $('#panel-kicker').textContent=titles[section][0];const heading=section==='asuka'?figureLibrary.current().name:titles[section][1];$('#panel-title').setAttribute('aria-label',heading);$('#panel-title').innerHTML=[...heading].map(c=>`<span>${escape(c)}</span>`).join('');document.title=`${heading} · hao的树洞`;
  renderers[section]();room?.focus(section);if(!wasOpen)panel.showModal();document.body.classList.add('card-open');panel.querySelector('.object-page').scrollTop=0;
  const focusTarget=section==='music'?body.querySelector('.deck-canvas'):['computer','tower'].includes(section)?body.querySelector('.computer-shell'):$('#close-panel');focusTarget?.focus({preventScroll:true});
  cardMotion.enter(origin,section==='books'?room?.book:null,section==='music'?disposeObject.motion:null);
}
function open(section){if(section==='notes'||section==='keyboard')section='computer';if(!titles[section])return;if(location.hash!==`#${section}`)history.pushState({haoObjectEntry:true},'',`#${section}`);showObject(section);}
async function hideObject(){if(!panel.open||panel.dataset.phase==='closing')return;if(!await cardMotion.leave(room?.anchor(currentPanel)))return;disposeObject();disposeObject=()=>{};body.classList.remove('computer-mount');panel.close();cardMotion.clear();currentPanel='';closeRequested=false;document.title=worldTitle;document.body.classList.remove('card-open');room?.restore();(returnFocus?.isConnected?returnFocus:$('#scene'))?.focus({preventScroll:true});}
function requestClose(){if(closeRequested||panel.dataset.phase==='closing')return;closeRequested=true;history.replaceState(null,'',location.pathname+location.search);void hideObject();}
function syncRoute(){const world=new URLSearchParams(location.search).get('world')==='ghostblade'?'ghostblade':'persona';if(world!==currentWorld){void transitionToWorld(world,{history:false});return;}let key=location.hash.slice(1);if(key==='notes'||key==='keyboard'){key='computer';history.replaceState(history.state,'','#computer');}if(titles[key])showObject(key);else void hideObject();}
window.addEventListener('popstate',syncRoute);window.addEventListener('hashchange',syncRoute);
document.querySelectorAll('[data-open]').forEach(button=>button.addEventListener('click',()=>open(button.dataset.open)));
$('#close-panel').onclick=requestClose;panel.addEventListener('cancel',event=>{event.preventDefault();requestClose();});
let backdropDown=false;const outside=event=>{const r=panel.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;};
panel.addEventListener('pointerdown',event=>{backdropDown=event.target===panel&&outside(event);});panel.addEventListener('pointerup',event=>{if(backdropDown&&event.target===panel&&outside(event))requestClose();backdropDown=false;});
function renderAsuka(){disposeObject=mountCharacterCard(body,panel,figureLibrary,name=>{$('#panel-title').setAttribute('aria-label',name);$('#panel-title').innerHTML=[...name].map(c=>`<span>${escape(c)}</span>`).join('');document.title=`${name} · hao的树洞`;});}
function renderWorld(){
  const current=worlds.find(world=>world.id===currentWorld);
  body.innerHTML=`<div class="world-layout"><div class="world-ticket"><span>当前世界 · ${current.number}</span><strong>${current.lines.join('<br>')}</strong><small>${current.description}</small></div><div class="world-copy"><h2>换一个世界，继续日常。</h2><p>同一张桌面，带着你的收藏一起出发。</p><nav class="world-choices" aria-label="选择世界">${worlds.map(world=>world.id===currentWorld?`<div class="world-choice is-current" data-world-choice="${world.id}" aria-current="true"><span class="world-choice-number">${world.number}</span><span><strong>${world.name}</strong><small>${world.description}</small></span><em>当前</em></div>`:`<a class="world-choice" data-world-choice="${world.id}" href="${escape(worldHref(world.id))}" aria-label="前往${world.name}"><span class="world-choice-number">${world.number}</span><span><strong>${world.name}</strong><small>${world.description}</small></span><em aria-hidden="true">↗</em></a>`).join('')}</nav><button class="secondary" id="world-return">返回我的桌面 ↗</button></div></div>`;
  $('#world-return').onclick=requestClose;
  bindWorldTransitions(body);
}
async function changeWorld(to,{history:writeHistory=true}={}){
  const previous=currentWorld;
  cardMotion.clear();disposeObject();disposeObject=()=>{};if(panel.open)panel.close();currentPanel='';closeRequested=false;
  document.body.classList.remove('card-open');document.documentElement.dataset.worldSwitching='preparing';
  async function rebuild(id){
    room?.dispose();room=null;computer.dispose();applyWorld(id);computer=createComputer({notify});
    for(const canvas of document.querySelectorAll('#room > canvas')){const fresh=canvas.cloneNode(false);fresh.hidden=canvas.id==='empty-turntable-slot';fresh.style.visibility='';canvas.replaceWith(fresh);}
    $('#fallback').hidden=true;await computer.ready;
    room=await createRoom(open,notify,figureLibrary,discMotion,{computer,soundscape});room.turntable?.update(player.snapshot());
  }
  try{await rebuild(to);if(writeHistory)history.pushState({haoWorld:to},'',worldHref(to));}
  catch(error){await rebuild(previous);history.replaceState(null,'',worldHref(previous));throw error;}
  finally{delete document.documentElement.dataset.worldSwitching;}
  document.title=worldTitle;
}
configureWorldTransitions({capture:()=>room?.capture({asCanvas:true}),change:changeWorld,notify});
function renderAbout(){body.innerHTML=`<div class="about-layout"><section class="about-letter"><span class="paper-caption">一封写给来访者的短信</span><h2>喜欢的东西，慢慢放进来。</h2><p>这是 hao 的个人空间。读完一章，听一首歌，把喜欢的画面和句子钉在墙上。</p><p>书里可以读全文，耳机里有自己的声景。屏幕能换一张喜欢的画，窗边的叶子也会轻轻回应。</p><p class="small-copy">拖动平移，滚轮拉近。聚焦桌面后可用方向键环顾，＋／− 缩放，Home 回到全景。右下「探索」提供全部物件入口。</p></section><section class="about-links"><span class="paper-caption">收藏保管处</span><h3>带走你的收藏</h3><p class="small-copy">收藏保存在当前浏览器。这里导出原有书单、游戏与历史记录；墙板在各收藏夹中备份，阅读器可导出当前书摘录。电子书、歌曲、模型与自选屏保请保留源文件。</p><div class="button-row"><button id="export-content" class="secondary">导出原有收藏</button><button id="import-content" class="text-button">导入收藏备份</button></div><input id="backup-file" type="file" accept="application/json,.json" hidden><p class="small-copy">日常存档已从桌面退场，以前留下的记录仍保存在备份中。</p></section></div>`;
  $('#export-content').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='hao的树洞-原有收藏备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);notify('原有书单、游戏与历史记录已导出');};
  $('#import-content').onclick=()=>$('#backup-file').click();$('#backup-file').onchange=safe(async event=>{const file=event.target.files[0];if(!file)return;if(file.size>32*1024*1024)throw new Error('收藏备份请小于 32 MB');let data;try{data=JSON.parse(await file.text());}catch{throw new Error('请选择树洞导出的 JSON 备份');}await persist(mergeContent(content,validateImport(data)));notify('原有收藏已合并');});
}
async function boot(){const storageTask=(async()=>{let failed=false;try{const saved=validateImport(await readContent()||initialContent());content=applyBuiltinGames(saved,builtinGames);if(content!==saved)await saveContent(content);}catch{storageAvailable=false;failed=true;}try{await player.init(musicLibrary.tracks);}catch{failed=true;}if(failed)notify('部分本地收藏暂时无法读取，内置内容仍可使用');})();
  try{await figureLibrary.init();room=await createRoom(open,notify,figureLibrary,discMotion,{computer,soundscape});await storageTask;room?.turntable?.update(player.snapshot());$('#loading').classList.add('done');setTimeout(()=>$('#loading').hidden=true,450);syncRoute();completeWorldTransition();}catch(error){await storageTask;$('#loading-message').textContent='桌面未能加载，请检查本地服务后重试';$('#retry').hidden=false;failWorldTransition();console.error(error);}}
$('#retry').onclick=()=>location.reload();void boot();
