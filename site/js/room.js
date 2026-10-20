import { createStage } from './stage.js';
import {readSceneJSON,readHitMap} from './scene-resources.js';
import {ghostWorld, worldAssetRoot, themeAsset} from './world-theme.js';
import {createDesktopFigure} from './desktop-figure.js';
import {createDesktopBook} from './desktop-book.js';
import {createRoomPlant} from './plant.js';
import {createDesktopTurntable} from './turntable-model.js';
import {createRoomSurfaces} from './room-surfaces.js';
import { clampView,viewScale,screenToImage,imageToScreen,zoomAt,hotIndexNear,lerpView,easeInOut } from './geometry.js';

const names={computer:'打开电脑',music:'播放唱片',books:'拿起书本',headphones:'私人声景',mask:'切换世界',board:'HAO 个人档案',asuka:'轨道雕塑 · 桌面收藏',tower:'主机电源',games:'我的游戏收藏',plant:'切换窗边植物','board-gallery':'影像收藏','board-projects':'正在创造','board-links':'去往别处','board-quotes':'一句留存'};
const destinations={computer:'computer',music:'music',books:'books',headphones:'headphones',mask:'world',board:'about',asuka:'asuka',tower:'tower',games:'games',plant:'plant','board-gallery':'board-gallery','board-projects':'board-projects','board-links':'board-links','board-quotes':'board-quotes'};
const image = src => new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('场景图片未能加载'));i.src=src;});
export async function createRoom(open,notify,figureLibrary,discMotion,services={}) {
  let disposed=false,hiTimer,suspended=!!services.transition,hiLoaded=false;
  const liveJobs=[];
  const abort=new AbortController(),cleanups=[];
  const on=(node,event,callback,options={})=>node.addEventListener(event,callback,{...options,signal:abort.signal});
  const canvas=document.querySelector('#scene'), label=document.querySelector('#hot-label'),markers=document.querySelector('#object-markers');
  markers.replaceChildren();
  const metadata=await readSceneJSON('/assets/scene/scene.json'),img={w:metadata.width,h:metadata.height},hots=structuredClone(metadata.hots);
  let vp={w:innerWidth,h:innerHeight},view={cx:img.w/2,cy:img.h/2,zoom:1},previous=null,restoring=null,hover=0,stage=null,animation=null,raf=0,showHints=false,dpr=Math.min(devicePixelRatio,2),dirty=true;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let figureStage=null,bookStage=null,plantStage=null,turntableStage=null,surfaces=null;
  let deckHeld=false,takeVersion=0,slotImage=null;
  const slotCanvas=document.querySelector('#empty-turntable-slot'),slotContext=slotCanvas.getContext('2d');
  const slotReady=image(themeAsset('/assets/turntable/empty-desktop-slot.webp')).then(value=>{slotImage=value;});
  slotReady.catch(()=>{});
  function drawSlot(){
    slotCanvas.hidden=!deckHeld;if(!deckHeld||!slotImage)return;
    slotCanvas.width=Math.round(vp.w*dpr);slotCanvas.height=Math.round(vp.h*dpr);slotContext.setTransform(dpr,0,0,dpr,0,0);
    const p=imageToScreen({x:1056,y:2400},view,vp,img),scale=viewScale(view,vp,img);
    slotContext.drawImage(slotImage,p.x,p.y,1632*scale,960*scale);
  }
  const desktopDeck={
    async take(){const token=++takeVersion;await slotReady;if(token!==takeVersion)return false;deckHeld=true;turntableStage?.setHeld(true);surfaces?.setDeckHeld(true);drawSlot();invalidate();return true;},
    putBack(angle){takeVersion++;if(Number.isFinite(angle))discMotion.alignAngle(angle);deckHeld=false;turntableStage?.setHeld(false);surfaces?.setDeckHeld(false);drawSlot();invalidate();},
    pickupCamera:()=>turntableStage?.pickupCamera(),
    snapshot:()=>turntableStage?.snapshot()||{angle:0,running:false},
    update:state=>turntableStage?.update(state)
  };
  hots.plant={index:11,center:[7000,2800],dynamic:true};
  const sample=await readHitMap(),hotImage=sample.image,pixels=sample.pixels;
  function staticFallback(){
    surfaces?.hide();
    stage=null;
    canvas.hidden=true;document.querySelector('#fallback').hidden=false;
    document.querySelectorAll('#empty-turntable-slot,#desktop-turntable,#desktop-figure,#desktop-book,#room-plant,#world-button').forEach(el=>el.hidden=true);
    document.querySelectorAll('[data-scene-control]').forEach(control=>control.hidden=true);
    document.querySelector('#explore-help').textContent='当前使用静态画面，可以从这里打开每个物件的收藏。';
    document.querySelector('#object-shortcuts').open=true;
    const trigger=document.querySelector('#explore-toggle');if(trigger.getAttribute('aria-expanded')!=='true')trigger.click();
  }
  const sceneStyle=ghostWorld?'base':'persona5-base';
  try{stage=createStage(canvas,img,ghostWorld?worldAssetRoot:undefined);await stage.loadStyle(sceneStyle,'medium').catch(()=>stage.loadStyle(sceneStyle,false));stage.setHot(hotImage);stage.resize(vp,dpr);}
  catch(e){staticFallback();notify('当前设备使用静态画面，阅读、电脑和音乐仍可使用');}
  if(stage&&services.computer&&services.soundscape){try{surfaces=await createRoomSurfaces(document.querySelector('#room'),{...services,notify});}catch(error){notify('桌面屏幕暂时未能连接，电脑面板仍可使用');console.error(error);}}
  if(stage)liveJobs.push((async()=>{try{plantStage=await createRoomPlant(document.querySelector('#room-plant'),info=>{if(info?.selection&&plantStage)hots.plant.center=plantStage.imageAnchor();invalidate();});hots.plant.center=plantStage.imageAnchor();}catch{notify('植物暂时未能加载，仍可从探索菜单打开');}})());
  on(window,'pagehide',event=>{if(!event.persisted)plantStage?.dispose();},{once:true});
  on(window,'pagehide',event=>{if(!event.persisted)turntableStage?.dispose();},{once:true});
  on(window,'pagehide',event=>{if(!event.persisted)surfaces?.dispose();},{once:true});
  const byIndex=Object.fromEntries(Object.entries(hots).filter(([key])=>destinations[key]).map(([key,value])=>[value.index,key]));
  for(const [key,hot] of Object.entries(hots)){if(!destinations[key])continue;const marker=document.createElement('span');marker.className='marker';marker.dataset.key=key;marker.textContent=names[key]||key;markers.append(marker);}
  function updateMarkers(){for(const m of markers.children){const hot=hots[m.dataset.key];const p=imageToScreen({x:hot.center[0],y:hot.center[1]},view,vp,img);m.style.left=p.x+'px';m.style.top=p.y+'px';m.hidden=p.x<0||p.x>vp.w||p.y<100||p.y>vp.h-90;}}
  function positionWorldButton(){if(!stage){document.querySelector('#world-button').hidden=true;return;}const hot=hots.mask,p=imageToScreen({x:hot.center[0],y:hot.center[1]},view,vp,img),el=document.querySelector('#world-button'),scale=viewScale(view,vp,img);el.style.left=p.x+'px';el.style.top=p.y+'px';el.style.width=Math.max(44,(hot.bbox[2]-hot.bbox[0])*scale)+'px';el.style.height=Math.max(44,(hot.bbox[3]-hot.bbox[1])*scale)+'px';el.hidden=p.x<0||p.x>vp.w||p.y<0||p.y>vp.h;}
  function frame(now,force=false){raf=0;if(disposed||document.hidden||(suspended&&!force))return;
    if(animation){const t=Math.min((now-animation.start)/animation.duration,1);view=clampView(lerpView(animation.from,animation.to,easeInOut(t)),vp,img);if(t===1){animation=null;restoring=null;}dirty=true;}
    if(dirty||hover){stage?.draw({a:sceneStyle,b:sceneStyle,t:0,view,scale:viewScale(view,vp,img)*dpr,time:reduced.matches?0:now/1000,hover,hi:[1,1,.94]});figureStage?.draw(view,vp,img,viewScale(view,vp,img));bookStage?.draw(view,vp,img,viewScale(view,vp,img));plantStage?.draw(view,vp,img,viewScale(view,vp,img));turntableStage?.draw(view,vp,img,viewScale(view,vp,img));surfaces?.draw(view,vp,img);surfaces?.setHover(hover);dirty=false;positionWorldButton();if(showHints)updateMarkers();}
    if(deckHeld)drawSlot();
    if(!suspended&&(animation||(hover&&!reduced.matches)))raf=requestAnimationFrame(frame);
  }
  function invalidate(){if(disposed)return;dirty=true;if(!suspended&&!raf)raf=requestAnimationFrame(frame);}
  function animate(to){if(reduced.matches){view=to;animation=null;restoring=null;}else animation={from:{...view},to,start:performance.now(),duration:560};hover=0;label.hidden=true;invalidate();}
  function reset(){restoring=null;animate(clampView({cx:img.w/2,cy:img.h/2,zoom:1},vp,img));}
  function resize(){vp={w:innerWidth,h:innerHeight};dpr=Math.min(devicePixelRatio,2);view=clampView(view,vp,img);stage?.resize(vp,dpr);invalidate();}
  function hit(pt,touch=false){if(plantStage?.hit(pt))return 11;if(figureStage?.hit(pt))return 7;const p=screenToImage(pt,view,vp,img);return hotIndexNear(pixels,sample.width,sample.height,p.x*sample.width/img.w,p.y*sample.height/img.h,touch?Math.max(4,18*sample.width/(img.w*viewScale(view,vp,img))):0);}
  function setHover(e){const point={x:e.clientX,y:e.clientY},next=hit(point);hover=byIndex[next]?next:0;canvas.classList.toggle('hovering',!!hover);label.hidden=!hover;if(hover){label.textContent=next===11&&plantStage?.hitPart(point)==='foliage'?'轻碰叶片':names[byIndex[hover]];label.style.left=Math.min(e.clientX+20,vp.w-170)+'px';label.style.top=Math.max(110,e.clientY-45)+'px';}invalidate();}
  const pointers=new Map();let down=null,last=null,pinch=null,moved=false;
  on(canvas,'pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});animation=null;restoring=null;if(pointers.size===1){down={x:e.clientX,y:e.clientY};last={...down};moved=false;}else{moved=true;pinch=null;}hover=0;label.hidden=true;canvas.classList.add('dragging');invalidate();});
  on(canvas,'pointermove',e=>{if(!pointers.has(e.pointerId)){if(e.pointerType==='mouse')setHover(e);return;}pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>1){const [a,b]=[...pointers.values()];const distance=Math.hypot(a.x-b.x,a.y-b.y),center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(pinch&&distance>0)view=zoomAt(view,distance/pinch.distance,center,vp,img);pinch={distance,center};moved=true;}
    else{const dx=e.clientX-last.x,dy=e.clientY-last.y;if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)moved=true;const scale=viewScale(view,vp,img);view=clampView({...view,cx:view.cx-dx/scale,cy:view.cy-dy/scale},vp,img);last={x:e.clientX,y:e.clientY};}
    invalidate();});
  function end(e,cancel=false){if(!pointers.has(e.pointerId))return;const tap=!moved&&pointers.size===1&&!cancel;pointers.delete(e.pointerId);pinch=null;if(pointers.size){last={...[...pointers.values()][0]};down={...last};}else{canvas.classList.remove('dragging');}
    if(tap){const point={x:e.clientX,y:e.clientY};if(plantStage?.hitPart(point)==='foliage')plantStage.touch();else{const index=hit(point,e.pointerType!=='mouse');if(byIndex[index])open(destinations[byIndex[index]]);}}invalidate();}
  on(canvas,'pointerup',e=>end(e));on(canvas,'pointercancel',e=>end(e,true));
  on(canvas,'pointerleave',()=>{hover=0;label.hidden=true;invalidate();});
  on(canvas,'wheel',e=>{e.preventDefault();animation=null;restoring=null;view=zoomAt(view,Math.exp(-e.deltaY*.0012),{x:e.clientX,y:e.clientY},vp,img);hover=0;label.hidden=true;invalidate();},{passive:false});
  on(canvas,'keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();animation=null;restoring=null;const step=70/viewScale(view,vp,img);view=clampView({...view,cx:view.cx+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),cy:view.cy+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)},vp,img);invalidate();}else if(e.key==='+'||e.key==='=')zoom(1.25);else if(e.key==='-')zoom(.8);else if(e.key==='Home')reset();});
  const zoom=factor=>{animation=null;restoring=null;view=zoomAt(view,factor,{x:vp.w/2,y:vp.h/2},vp,img);invalidate();};
  document.querySelector('#zoom-in').onclick=()=>zoom(1.25);document.querySelector('#zoom-out').onclick=()=>zoom(.8);
  document.querySelector('#reset-view').onclick=reset;
  document.querySelector('#hint-toggle').onclick=e=>{showHints=!showHints;markers.hidden=!showHints;e.currentTarget.setAttribute('aria-pressed',String(showHints));e.currentTarget.textContent=showHints?'隐藏物件线索':'显示物件线索';invalidate();};
  on(window,'resize',resize);on(document,'visibilitychange',invalidate);
  on(canvas,'webglcontextlost',e=>{e.preventDefault();staticFallback();notify('画面已切换为静态预览，刷新可重新连接');});
  invalidate();
  function scheduleHighResolution(){
    clearTimeout(hiTimer);
    if(stage&&!hiLoaded&&!suspended)hiTimer=setTimeout(()=>{
      if(disposed||suspended)return;
      hiLoaded=true;stage.loadStyle(sceneStyle,true).then(invalidate).catch(()=>notify('8K 画面未能加载，当前保持 4K 画质'));
    },2500);
  }
  scheduleHighResolution();
  if(stage&&discMotion)liveJobs.push((async()=>{try{turntableStage=await createDesktopTurntable(document.querySelector('#desktop-turntable'),discMotion);}catch{notify('动态唱盘暂时未能加载，音乐播放仍可使用');}})());
  if(stage)liveJobs.push((async()=>{try{bookStage=await createDesktopBook(document.querySelector('#desktop-book'));}catch{notify('立体书暂时未能加载，仍可从书籍入口阅读');}})());
  if(stage&&figureLibrary)liveJobs.push((async()=>{
    try{figureStage=await createDesktopFigure(document.querySelector('#desktop-figure'),figureLibrary,invalidate);const p=figureStage.imageAnchor();hots.asuka.center=[p.x*img.w/figureStage.sourceSize.w,p.y*img.h/figureStage.sourceSize.h];names.asuka=figureLibrary.current().name+' · 桌面收藏';cleanups.push(figureLibrary.subscribe(entry=>{names.asuka=entry.name+' · 桌面收藏';const m=markers.querySelector('[data-key="asuka"]');if(m)m.textContent=names.asuka;}));}
    catch{notify('实时手办暂时未能加载，可打开手办卡重试');}
  })());
  await Promise.all(liveJobs);
  invalidate();

  plantStage?.setActive(!suspended);turntableStage?.setActive(!suspended);surfaces?.setActive(!suspended);
  function setTransitioning(value){
    suspended=!!value;
    if(suspended){cancelAnimationFrame(raf);raf=0;clearTimeout(hiTimer);}
    plantStage?.setActive(!suspended);turntableStage?.setActive(!suspended);surfaces?.setActive(!suspended);
    if(!suspended){scheduleHighResolution();invalidate();}
  }
  async function prepareReveal(){
    // Settle reflections and compile programs before the first visible frame.
    await Promise.all([figureStage?.warmup(),bookStage?.warmup(),plantStage?.warmup(),turntableStage?.warmup(),surfaces?.ready()]);
    dirty=true;frame(performance.now(),true);
  }
  function capture({asCanvas=false}={}){
    const captureView={cx:img.w/2,cy:img.h/2,zoom:1},scale=viewScale(captureView,vp,img);
    const snapshot=document.createElement('canvas'),ratio=Math.min(1,1600/vp.w);
    snapshot.width=Math.round(vp.w*ratio);snapshot.height=Math.round(vp.h*ratio);
    const context=snapshot.getContext('2d');context.scale(snapshot.width/vp.w,snapshot.height/vp.h);
    const mask=imageToScreen({x:hots.mask.center[0],y:hots.mask.center[1]},captureView,vp,img);
    const origin={x:Math.max(0,Math.min(1,mask.x/vp.w)),y:Math.max(0,Math.min(1,mask.y/vp.h))};
    if(!stage){
      const fallback=document.querySelector('#fallback');if(!fallback.complete||!fallback.naturalWidth)throw new Error('场景预览尚未就绪');
      const fit=Math.max(vp.w/fallback.naturalWidth,vp.h/fallback.naturalHeight),width=fallback.naturalWidth*fit,height=fallback.naturalHeight*fit;
      context.drawImage(fallback,(vp.w-width)/2,(vp.h-height)/2,width,height);
      return asCanvas?{canvas:snapshot,origin}:{image:snapshot.toDataURL('image/jpeg',.86),origin};
    }
    const layers=[[figureStage,'#desktop-figure'],[bookStage,'#desktop-book'],[plantStage,'#room-plant'],[turntableStage,'#desktop-turntable']];
    function drawBase(source){stage.draw({a:sceneStyle,b:sceneStyle,t:0,view:source,scale:viewScale(source,vp,img)*dpr,time:0,hover:0,hi:[1,1,.94]});}
    try{
      // Copy each WebGL buffer immediately after its render; no permanent buffer retention.
      drawBase(captureView);context.drawImage(canvas,0,0,vp.w,vp.h);
      if(deckHeld&&slotImage){const p=imageToScreen({x:1056,y:2400},captureView,vp,img);context.drawImage(slotImage,p.x,p.y,1632*scale,960*scale);}
      for(const [layer,selector] of layers){
        const element=document.querySelector(selector);if(!layer||element.hidden||element.style.visibility==='hidden')continue;
        layer.draw(captureView,vp,img,scale);context.drawImage(element,0,0,vp.w,vp.h);
      }
      surfaces?.capture(context,captureView,vp,img);
      const border=getComputedStyle(document.querySelector('.scene-shade')),thickness=Number.parseFloat(border.borderTopWidth)||0;
      if(thickness){context.strokeStyle=border.borderTopColor;context.lineWidth=thickness;context.strokeRect(thickness/2,thickness/2,vp.w-thickness,vp.h-thickness);}
      return asCanvas?{canvas:snapshot,origin}:{image:snapshot.toDataURL('image/jpeg',.86),origin};
    }finally{
      // Restore live cameras synchronously; the screenshot never changes user navigation.
      drawBase(view);for(const [layer] of layers)layer?.draw(view,vp,img,viewScale(view,vp,img));invalidate();
    }
  }
  function anchor(section,source=view){const key={computer:'computer',notes:'computer','board-gallery':'board-gallery','board-projects':'board-projects','board-links':'board-links','board-quotes':'board-quotes',music:'music',headphones:'headphones',books:'books',world:'mask',about:'board',asuka:'asuka',tower:'tower',keyboard:'keyboard',games:'games',plant:'plant'}[section],hot=hots[key];if(!hot)return {x:vp.w/2,y:vp.h/2};const p=imageToScreen({x:hot.center[0],y:hot.center[1]},source,vp,img);return {x:Math.max(30,Math.min(vp.w-30,p.x)),y:Math.max(30,Math.min(vp.h-30,p.y))};}
  return {reset,anchor,capture,setTransitioning,prepareReveal,dispose(){if(disposed)return;disposed=true;clearTimeout(hiTimer);abort.abort();cancelAnimationFrame(raf);cleanups.forEach(fn=>fn());surfaces?.dispose();figureStage?.dispose();bookStage?.dispose();plantStage?.dispose();turntableStage?.dispose();stage?.dispose();markers.replaceChildren();},get book(){return bookStage;},get turntable(){return turntableStage?desktopDeck:null;},focus(section){
    plantStage?.setActive(false);surfaces?.setActive(false);
    // Reopening while the camera is returning must use its destination, not accumulate zoom.
    if(!previous)previous={...(restoring||view)};
    restoring=null;
    if(section==='books'||section==='music'){animation=null;hover=0;label.hidden=true;invalidate();}
    else if(stage)animate(zoomAt(previous,1.06,anchor(section,previous),vp,img));
  },restore(){plantStage?.setActive(true);surfaces?.setActive(true);if(previous){restoring=clampView(previous,vp,img);previous=null;animate(restoring);}}};
}
