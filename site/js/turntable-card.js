import {createDeckCloseup} from './turntable-model.js';
import {getTurntableSkin,setTurntableSkin,subscribeTurntableSkin} from './turntable-finish.js';

export function mountTurntable(body,panel,player,motor,notify,desktop){
  const buttons=[['play','播放 / 暂停'],['like','喜爱这首歌，按一次累计一次'],['previous','上一首，红色按钮'],['next','下一首，黑色按钮'],['import','加入本地歌曲'],['close','收起唱机，音乐继续'],['skin','切换唱机皮肤']];
  body.innerHTML=`<section class="deck-player" aria-label="ORBIT 02 唱机">
    <canvas class="deck-canvas" tabindex="0" aria-label="可旋转唱机。拖动旋转，双指或滚轮缩放；方向键旋转，Home 复位，Escape 收起。使用机身按钮播放和切歌。"></canvas>
    <div class="deck-hit-controls" aria-label="机身控制">${buttons.map(([id,label])=>`<button class="deck-hit" data-deck-action="${id}" aria-label="${label}" title="${label}" disabled></button>`).join('')}
      <button class="deck-hit deck-volume-hit" data-deck-action="volume" role="slider" aria-label="音量，方向键调整" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" disabled></button>
    </div>
    <span class="deck-model-state" role="status">正在拿起唱机…</span>
    <p class="deck-a11y" data-deck-announcement aria-live="polite"></p>
    <input class="deck-files" type="file" accept="audio/*,.mp3,.flac,.m4a,.wav,.ogg,.opus" multiple hidden>
  </section>`;
  const $=selector=>body.querySelector(selector),shell=$('.deck-player'),canvas=$('.deck-canvas'),files=$('.deck-files');
  const pads=Object.fromEntries([...body.querySelectorAll('[data-deck-action]')].map(button=>[button.dataset.deckAction,button]));
  let disposed=false,view=null,loading=false,ready=false,lastAnnouncement='',motionGeneration=0,held=false;
  canvas.style.visibility='hidden';
  function action(name){
    if(disposed)return;
    if(name==='play')player.toggle();
    else if(name==='like'){
      const count=player.like();
      if(count!==null){pads.like.classList.remove('is-pressed');void pads.like.offsetWidth;pads.like.classList.add('is-pressed');$('[data-deck-announcement]').textContent=`${player.snapshot().current.title}，喜爱已累计 ${count} 次`;}
    }
    else if(name==='previous'&&player.snapshot().tracks.length>1)player.previous();
    else if(name==='next'&&player.snapshot().tracks.length>1)player.next();
    else if(name==='import'&&!loading)files.click();
    else if(name==='close')panel.querySelector('#close-panel').click();
    else if(name==='skin')setTurntableSkin(getTurntableSkin()==='original'?'eva02':'original');
  }
  function updateSkinLabel(){
    if(disposed)return;
    const original=getTurntableSkin()==='original',label=`切换皮肤，当前：${original?'原始皮肤':'轨道装甲'}，切换为${original?'轨道装甲':'原始皮肤'}`;
    pads.skin.title=label;pads.skin.setAttribute('aria-label',label);
  }
  updateSkinLabel();
  const unsubscribeSkin=subscribeTurntableSkin(updateSkinLabel);
  // DOM pads are keyboard targets. Pointer activation uses the actual 3D surface,
  // so rotated or overlapping projected bounds never activate a neighbouring key.
  for(const [name,pad] of Object.entries(pads))pad.onclick=()=>action(name);
  pads.volume.onkeydown=event=>{
    const steps={ArrowUp:.05,ArrowRight:.05,ArrowDown:-.05,ArrowLeft:-.05};
    if(event.key in steps){event.preventDefault();player.volume(player.snapshot().volume+steps[event.key]);}
    else if(['Home','End'].includes(event.key)){event.preventDefault();player.volume(event.key==='Home'?0:1);}
  };
  function fail(){
    if(disposed)return;ready=false;shell.classList.add('model-unavailable');
    $('.deck-model-state').hidden=false;$('.deck-model-state').textContent='唱机画面未能加载。可刷新重试，或按 Escape 返回桌面。';
    for(const pad of Object.values(pads))pad.disabled=true;
  }
  const viewReady=createDeckCloseup(canvas,motor,{pickup:()=>desktop?.pickupCamera(),onAction:action,onVolume:value=>player.volume(value),onPositions:points=>{
    if(disposed)return;
    for(const [name,point] of Object.entries(points)){
      const pad=pads[name];if(!pad)continue;
      pad.style.left=`${point.x}px`;pad.style.top=`${point.y}px`;
      pad.style.width=`${Math.max(name==='previous'||name==='next'?20:24,point.width+6)}px`;
      pad.style.height=`${Math.max(24,point.height+8)}px`;
    }
  },onError:fail}).then(result=>{
    if(disposed){result.dispose();return null;}
    view=result;ready=true;$('.deck-model-state').hidden=true;shell.classList.add('ready');update(player.snapshot());return result;
  }).catch(()=>{fail();return null;});
  // The canvas follows the desk camera until the physical pickup is prepared.
  // A generation token prevents a late load from reopening a dismissed machine.
  const motion={
    async open(){
      if(disposed)return false;
      const token=++motionGeneration,result=await viewReady;
      if(!result||disposed||token!==motionGeneration)return false;
      if(!held){
        try{if(await desktop?.take()===false)return false;}catch{desktop?.putBack();fail();return false;}
        if(disposed||token!==motionGeneration)return false;
        held=true;
        const angle=desktop?.snapshot()?.angle;
        if(Number.isFinite(angle))result.adoptAngle(angle);
      }
      canvas.style.visibility='visible';
      const done=await result.moveTo(1);
      return done!==false&&!disposed&&token===motionGeneration;
    },
    async close(){
      const token=++motionGeneration;
      // Returning during GLB/desk-patch loading must not wait for the network.
      if(!view||!held){view?.snapTo(0);canvas.style.visibility='hidden';held=false;desktop?.putBack();return true;}
      const done=await view.moveTo(0);
      if(done===false||disposed||token!==motionGeneration)return false;
      canvas.style.visibility='hidden';held=false;desktop?.putBack(view.angle);return true;
    },
    reset(){motionGeneration++;const angle=held?view?.angle:undefined;view?.snapTo(0);canvas.style.visibility='hidden';held=false;desktop?.putBack(angle);}
  };
  async function addFiles(list){
    if(loading||!list.length)return;loading=true;pads.import.disabled=true;
    try{await player.add(list);}catch(error){notify(error.name==='QuotaExceededError'?'本地存储空间不足，请移除部分歌曲再试':'歌曲未能保存，请重试');}
    finally{loading=false;if(!disposed){files.value='';update(player.snapshot());}}
  }
  files.onchange=()=>addFiles([...files.files]);
  shell.ondragover=event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();};
  shell.ondrop=event=>{event.preventDefault();void addFiles([...event.dataTransfer.files]);};
  function update(state){
    if(disposed)return;
    const active=state.playing||state.pending||state.buffering;
    shell.dataset.playback=state.playing?'playing':active?'loading':'paused';
    pads.play.disabled=!ready||!state.current;pads.like.disabled=!ready||!state.current;
    pads.previous.disabled=pads.next.disabled=!ready||state.tracks.length<2;
    pads.import.disabled=!ready||loading;pads.close.disabled=pads.volume.disabled=pads.skin.disabled=!ready;
    pads.play.setAttribute('aria-label',active?'暂停':'播放');pads.play.setAttribute('aria-pressed',String(active));pads.play.title=active?'暂停':'播放';
    pads.like.setAttribute('aria-label',`喜爱这首歌，已累计 ${state.likeCount||0} 次。每按一次加一`);pads.like.title=`喜爱 +1 / 已累计 ${state.likeCount||0} 次`;
    pads.volume.setAttribute('aria-valuenow',String(Math.round(state.volume*100)));
    pads.volume.title=`音量 ${Math.round(state.volume*100)}%，拖动实体推子调整`;
    const announcement=`${state.current?.title||'尚未放入歌曲'}，${state.playing?'正在播放':active?'读取中':'已暂停'}`;
    if(lastAnnouncement!==announcement){$('[data-deck-announcement]').textContent=announcement;lastAnnouncement=announcement;}
    view?.update(state);
  }
  const unsubscribe=player.subscribe(update);
  const cleanup=()=>{if(disposed)return;disposed=true;motion.reset();unsubscribe();unsubscribeSkin();view?.dispose();};
  cleanup.motion=motion;return cleanup;
}
