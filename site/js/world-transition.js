import {currentWorld,worlds} from './world-theme.js';
import {preloadStageImage} from './stage.js';

const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let active=null,controller=null,cachedCapture=null,captureTicket=0,pending=false;
const warmed=new Map();
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));

export function warmWorld(id){
  if(warmed.has(id))return warmed.get(id);
  const src=id==='ghostblade'?'/assets/worlds/ghostblade/base-medium.webp':'/assets/scene/persona5-base-medium.webp';
  const task=preloadStageImage(src).catch(()=>null);warmed.set(id,task);return task;
}
export function configureWorldTransitions(value){controller=value;}
export function prepareWorldTransition(){
  const ticket=++captureTicket;cachedCapture=null;
  warmWorld(currentWorld==='persona'?'ghostblade':'persona');
  // Capture while the world menu is open, never encode JPEG on the switch click.
  const prepare=()=>{if(ticket!==captureTicket||active)return;try{cachedCapture=controller?.capture();}catch{}};
  if(globalThis.requestIdleCallback)requestIdleCallback(prepare,{timeout:650});else requestAnimationFrame(prepare);
}
function paint(record,snapshot,preview){
  const destination=worlds.find(world=>world.id===record.to);
  const overlay=document.createElement('dialog');
  overlay.id='world-transition';overlay.className='world-transition';overlay.dataset.to=record.to;overlay.dataset.phase='preparing';
  overlay.setAttribute('aria-labelledby','world-transit-title');overlay.tabIndex=-1;
  if(preview){preview=preview.cloneNode(false);preview.className='world-transit-preview';overlay.append(preview);}
  const photo=snapshot.canvas;
  photo.className='world-transit-scene';photo.setAttribute('aria-hidden','true');overlay.append(photo);
  overlay.insertAdjacentHTML('beforeend','<div class="world-transit-edge" aria-hidden="true"></div><div class="world-transit-origin" aria-hidden="true"><i></i><i></i><i></i></div><div class="world-transit-caption"><span class="world-transit-route"></span><strong id="world-transit-title"></strong><span class="world-transit-status" role="status">正在连接另一面的日常</span></div>');
  overlay.querySelector('#world-transit-title').textContent=destination.name;
  overlay.querySelector('.world-transit-route').textContent=worlds.find(world=>world.id===record.from).number+' / '+destination.number;
  const origin=snapshot.origin||{x:.53,y:.7};
  overlay.style.setProperty('--origin-x',origin.x*100+'%');overlay.style.setProperty('--origin-y',origin.y*100+'%');
  document.body.append(overlay);overlay.showModal();overlay.focus({preventScroll:true});
  const state={record,overlay,origin,preview,skip:false,frame:0,ready:false};
  overlay.addEventListener('cancel',event=>{event.preventDefault();state.skip=true;if(overlay.dataset.phase==='revealing')finish(state);});
  return state;
}
function finish(state){
  if(active!==state)return;
  cancelAnimationFrame(state.frame);state.overlay.close();state.overlay.remove();active=null;cachedCapture=null;
  delete document.documentElement.dataset.worldSwitching;
  document.querySelector('#world-button')?.focus({preventScroll:true});
}
export async function transitionToWorld(to,{history=true}={}){
  if(!controller||active||pending||to===currentWorld||!worlds.some(world=>world.id===to))return;
  pending=true;
  captureTicket++;
  const record={from:currentWorld,to};
  let state;
  try{
    const snapshot=cachedCapture||controller.capture();
    const preview=await warmWorld(to);
    state=paint(record,snapshot,preview);active=state;cachedCapture=null;
    const start=performance.now();let revealStart=null,from=0;
    const advance=now=>{
      if(active!==state)return;
      if(state.ready&&revealStart===null){revealStart=now;from=state.progress||0;}
      const t=revealStart===null?0:Math.min(1,(now-revealStart)/(reduced.matches?160:1100));
      const progress=revealStart===null
        ? (preview && !reduced.matches ? .22*(1-Math.exp(-(now-start)/210)) : 0)
        : from+(1-from)*t*t*(3-2*t);
      state.progress=progress;
      if(reduced.matches)state.overlay.style.opacity=String(1-t);
      else{
        const {x,y}=state.origin,radius=Math.hypot(Math.max(x,1-x)*innerWidth,Math.max(y,1-y)*innerHeight)+90;
        state.overlay.style.setProperty('--reveal-radius',progress*radius+'px');
        state.overlay.style.setProperty('--edge-opacity',String(Math.min(1,progress*10)*(1-Math.max(0,(progress-.8)/.2))));
      }
      if(t<1)state.frame=requestAnimationFrame(advance);else finish(state);
    };
    state.frame=requestAnimationFrame(advance);
    // First paint shows immediate feedback; the audio element and page stay alive.
    await nextFrame();await nextFrame();
    await controller.change(to,{history});
    await nextFrame();await nextFrame();
    if(active!==state)return;
    if(state.skip){finish(state);return;}
    state.preview?.remove();state.ready=true;
    state.overlay.dataset.phase='revealing';
    state.overlay.querySelector('.world-transit-status').textContent='同一张桌面，另一面的日常';
  }catch(error){
    if(state)finish(state);
    controller.notify?.('世界暂时未能切换，已保留当前桌面');
    console.error(error);
  }finally{pending=false;}
}
export function bindWorldTransitions(container){
  prepareWorldTransition();
  container.querySelectorAll('a[data-world-choice]').forEach(link=>link.addEventListener('click',event=>{
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.target==='_blank')return;
    event.preventDefault();void transitionToWorld(link.dataset.worldChoice);
  }));
}
export function completeWorldTransition(){warmWorld(currentWorld==='persona'?'ghostblade':'persona');}
export function failWorldTransition(){if(active)finish(active);}

