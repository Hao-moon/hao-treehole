import {currentWorld,worlds} from './world-theme.js';
import {preloadStageImage} from './stage.js';
import {runTransition,afterPaint,animationDone} from './transition-sequence.js';
import {measureTransition} from './transition-metrics.js';

const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let active=null,controller=null,cachedCapture=null,captureTicket=0,pending=false;
const warmed=new Map();

export function warmWorld(id){
  if(warmed.has(id))return warmed.get(id);
  const src=id==='ghostblade'?'/assets/worlds/ghostblade/base-medium.webp':'/assets/scene/persona5-base-medium.webp';
  const task=preloadStageImage(src).catch(()=>null);warmed.set(id,task);return task;
}
export function configureWorldTransitions(value){controller=value;}
export function prepareWorldTransition(){
  const ticket=++captureTicket;cachedCapture=null;
  warmWorld(currentWorld==='persona'?'ghostblade':'persona');
  // Copy the old room while choosing a world, before the switch click.
  const prepare=()=>{if(ticket!==captureTicket||active)return;try{cachedCapture=controller?.capture();}catch{}};
  if(globalThis.requestIdleCallback)requestIdleCallback(prepare,{timeout:650});else requestAnimationFrame(prepare);
}
function paint(record,snapshot){
  const destination=worlds.find(world=>world.id===record.to),overlay=document.createElement('dialog');
  overlay.id='world-transition';overlay.className='world-transition';overlay.dataset.to=record.to;overlay.dataset.phase='preparing';
  overlay.setAttribute('aria-labelledby','world-transit-title');overlay.tabIndex=-1;
  const panels=document.createElement('div');panels.className='world-transit-panels';panels.setAttribute('aria-hidden','true');
  // Rasterize four small, static panels once. Only their transforms move;
  // no per-frame mask, canvas readback or JavaScript animation loop.
  const source=snapshot.canvas;
  for(let index=0;index<4;index++){
    const top=Math.floor(source.height*index/4),bottom=Math.floor(source.height*(index+1)/4);
    const strip=document.createElement('canvas');strip.className='world-transit-strip';strip.width=source.width;strip.height=bottom-top;
    strip.style.top=(top/source.height*100)+'%';strip.style.height=`calc(${(bottom-top)/source.height*100}% + 1px)`;
    strip.getContext('2d').drawImage(source,0,top,source.width,bottom-top,0,0,strip.width,strip.height);panels.append(strip);
  }
  overlay.append(panels);
  overlay.insertAdjacentHTML('beforeend','<div class="world-transit-tint" aria-hidden="true"></div><div class="world-transit-signal" aria-hidden="true"><i></i></div><div class="world-transit-origin" aria-hidden="true"><i></i><i></i></div><div class="world-transit-caption"><span class="world-transit-route"></span><strong id="world-transit-title"></strong><span class="world-transit-status" role="status">正在展开另一面的日常</span></div>');
  overlay.querySelector('#world-transit-title').textContent=destination.name;
  overlay.querySelector('.world-transit-route').textContent=worlds.find(world=>world.id===record.from).number+' / '+destination.number;
  const origin=snapshot.origin||{x:.53,y:.7};
  overlay.style.setProperty('--origin-x',origin.x*100+'%');overlay.style.setProperty('--origin-y',origin.y*100+'%');
  document.body.append(overlay);overlay.showModal();overlay.focus({preventScroll:true});
  const state={record,overlay,panels,animations:[],skip:false,finished:false};
  overlay.addEventListener('cancel',event=>{event.preventDefault();state.skip=true;if(overlay.dataset.phase==='revealing')finish(state);});
  return state;
}
function animate(state,node,frames,options){
  const animation=node.animate(frames,{fill:'forwards',...options});state.animations.push(animation);
  return animationDone(animation,options.duration+(options.delay||0)+100);
}
function finish(state){
  if(state.finished)return;state.finished=true;
  state.metrics?.finish();state.animations.forEach(animation=>animation.cancel());
  state.overlay.close();state.overlay.remove();
  if(active===state)active=null;
  cachedCapture=null;delete document.documentElement.dataset.worldSwitching;
  controller.resume?.();document.querySelector('#world-button')?.focus({preventScroll:true});
}
export async function transitionToWorld(to,{history=true}={}){
  if(!controller||active||pending||to===currentWorld||!worlds.some(world=>world.id===to))return;
  pending=true;captureTicket++;
  const record={from:currentWorld,to};let state;
  try{
    const snapshot=cachedCapture||controller.capture();
    state=paint(record,snapshot);active=state;cachedCapture=null;
    state.metrics=measureTransition(record.from,to);controller.suspend?.();void warmWorld(to);
    await runTransition({
      intro:async()=>{
        // Present feedback before any context creation or texture uploads.
        await afterPaint();await afterPaint();
        if(!reduced.matches)await animate(state,state.panels,[{transform:'scale(1)'},{transform:'scale(1.012)'}],{duration:220,easing:'cubic-bezier(.2,.7,.3,1)'});
      },
      prepare:async()=>{
        state.metrics.phase('prepare');
        await controller.change(to,{history});
        await controller.prepare?.();
        state.overlay.dataset.phase='ready';
        // Let the prepared GPU frame and decoded screen image reach paint.
        await afterPaint();await afterPaint();
      },
      skip:()=>state.skip||state.finished,
      reveal:async()=>{
        state.overlay.dataset.phase='revealing';
        state.overlay.querySelector('.world-transit-status').textContent='同一张桌面，另一面的日常';
        state.metrics.phase('reveal');
        if(reduced.matches){await animate(state,state.overlay,[{opacity:1},{opacity:0}],{duration:160});return;}
        const offsets=[60,0,40,100];
        await Promise.all([...state.panels.children].map((strip,index)=>animate(state,strip,[
          {transform:'translate3d(0,0,0)',opacity:1,offset:0},
          {opacity:1,offset:.7},
          {transform:`translate3d(${index%2?106:-106}%,0,0)`,opacity:0,offset:1}
        ],{duration:800,delay:offsets[index],easing:'cubic-bezier(.65,0,.2,1)'})));
      },
      finish:()=>finish(state)
    });
  }catch(error){
    if(state)finish(state);
    controller.notify?.('世界暂时未能切换，请稍后重试');console.error(error);
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
