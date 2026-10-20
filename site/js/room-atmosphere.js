import {imageToScreen,viewScale} from './geometry.js';
import {createWindowFlicker,WINDOW_PULSE_MS} from './window-flicker.js';
import {ghostWorld} from './world-theme.js';

const asset=name=>name?.startsWith('/')?name:'/assets/scene/'+name;

export function createRoomAtmosphere(parent,config){
  const world=document.createElement('div');world.className='room-atmosphere';world.style.width=config.width+'px';world.style.height=config.height+'px';parent.prepend(world);
  // The second world's light is baked with physical occlusion and soft shadows.
  const beam=ghostWorld?null:config.windowBeam;
  if(beam?.texture){const image=document.createElement('img');image.className='room-window-beam';image.alt='';image.src=asset(beam.texture);world.append(image);}
  let disc=null;
  if(beam?.discTexture){disc=document.createElement('img');disc.className='room-disc-light';disc.alt='';disc.src=asset(beam.discTexture);world.append(disc);}
  const windows=config.cityWindows?.windows||[],panes=new Map();
  const pulse=createWindowFlicker({count:windows.length,weights:windows.map(item=>item.pixels||1),show:index=>{
    const pane=document.createElement('canvas');pane.className='room-city-pulse';pane.setAttribute('aria-hidden','true');
    const item=windows[index],[x,y,right,bottom]=item.bbox;pane.width=right-x;pane.height=bottom-y;
    pane.style.left=x+'px';pane.style.top=y+'px';pane.style.width=pane.width+'px';pane.style.height=pane.height+'px';
    const ctx=pane.getContext('2d');ctx.beginPath();
    (item.panePolygon||item.polygon).forEach(([px,py],i)=>i?ctx.lineTo(px-x,py-y):ctx.moveTo(px-x,py-y));ctx.closePath();
    ctx.fillStyle=ghostWorld?'#e2bf7d':'#ef0038';ctx.fill();
    pane.dataset.window=item.id;pane.style.animation=`room-window-pulse ${WINDOW_PULSE_MS}ms ease-in-out both`;
    panes.set(index,pane);world.append(pane);
  },clear:index=>{panes.get(index)?.remove();panes.delete(index);}});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');let active=false,disposed=false;
  const sync=()=>pulse.setActive(!disposed&&active&&!document.hidden&&!reduced.matches);
  reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
  return {
    draw(view,vp,img){const origin=imageToScreen({x:0,y:0},view,vp,img),scale=viewScale(view,vp,img)*img.w/config.width;world.style.transform=`translate(${origin.x}px,${origin.y}px) scale(${scale})`;},
    setActive(value){active=!!value;sync();},
    setDeckHeld(value){if(disc)disc.hidden=!!value;},
    dispose(){if(disposed)return;disposed=true;pulse.dispose();reduced.removeEventListener('change',sync);document.removeEventListener('visibilitychange',sync);world.remove();},
  };
}
