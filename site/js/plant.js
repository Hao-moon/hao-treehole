import * as THREE from 'three';
import {ghostWorld} from './world-theme.js';
import {attachUrbanEnvironment} from './world-lighting.js';
import {makePlant,applyPlantSway} from './plant-models.js';
import {plantLibrary} from './plant-library.js';
import {createPlantLighting,createPlantDeskShadow} from './plant-lighting.js';
import {createPlantMotion,PLANT_FLEX} from './plant-motion.js';
export {makePlant} from './plant-models.js';

// Blender's desk top: T - .032 + .055 / 2. The pot's lowest vertex is at .007.
// Keep the entire pot inside the desktop, to the right and slightly in front of the tower.
const desktopHeight=.7755,roomPlantScale=.43;
export const plantDefinition=Object.freeze({
  id:'window-plant',route:'plant',position:[1.30,desktopHeight-.007*roomPlantScale,.16],
  scale:roomPlantScale,surfaceHeight:desktopHeight,careEnabled:false,
});
function rendererFor(canvas){
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  if(ghostWorld){renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1.2;}
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;return renderer;
}
function bindPlantMotion(onPose,strength){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');let active=true;
  const motion=createPlantMotion({onPose,strength,enabled:!document.hidden&&!reduced.matches});
  const sync=()=>motion.setEnabled(active&&!document.hidden&&!reduced.matches);
  reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
  return {
    touch:motion.touch,reset:motion.reset,isReduced:()=>reduced.matches,
    setActive(value){active=Boolean(value);sync();},
    dispose(){reduced.removeEventListener('change',sync);document.removeEventListener('visibilitychange',sync);motion.dispose();},
  };
}
export async function createRoomPlant(canvas,onChange=()=>{}){
  const response=await fetch('/assets/collectibles/desktop-camera.json');
  if(!response.ok)throw new Error('植物相机未能加载');
  const config=await response.json(),renderer=rendererFor(canvas),scene=new THREE.Scene();
  const environment=attachUrbanEnvironment(scene,renderer,()=>onChange({lighting:true}),.5);
  // Rebuild shadows only for a selection or an active leaf movement.
  renderer.shadowMap.autoUpdate=false;
  const lighting=createPlantLighting(scene,{center:[plantDefinition.position[0],plantDefinition.position[1]+.20,plantDefinition.position[2]],scale:plantDefinition.scale});
  const camera=new THREE.PerspectiveCamera(config.fov,config.width/config.height,.01,100);
  new THREE.Matrix4().fromArray(config.matrix).decompose(camera.position,camera.quaternion,camera.scale);
  camera.updateMatrixWorld();camera.setViewOffset(config.width,config.height,0,config.offsetY||0,config.width,config.height);
  const baseCamera=camera.clone(),raycaster=new THREE.Raycaster();
  let plant=null,motion=null,vp={w:1,h:1},lastSize='',disposed=false;
  function replace(entry){
    motion?.reset();
    const next=makePlant(entry.id);
    if(plant){scene.remove(plant);plant.userData.dispose();}
    plant=next;plant.position.set(...plantDefinition.position);plant.scale.setScalar(plantDefinition.scale);
    scene.add(plant);plant.updateMatrixWorld(true);canvas.dataset.model=entry.id;renderer.shadowMap.needsUpdate=true;
  }
  replace(plantLibrary.current());
  const unsubscribe=plantLibrary.subscribe(entry=>{replace(entry);onChange({selection:true});});
  const shadow=createPlantDeskShadow(scene,{surfaceHeight:plantDefinition.surfaceHeight,plantPosition:plantDefinition.position,scale:plantDefinition.scale});
  motion=bindPlantMotion(pose=>{if(disposed||!plant)return;applyPlantSway(plant,pose);renderer.shadowMap.needsUpdate=true;onChange({motion:true});},()=>PLANT_FLEX[plant.userData.plantId]);
  function hitPart(point){
    if(disposed)return null;
    raycaster.setFromCamera(new THREE.Vector2(point.x/vp.w*2-1,1-point.y/vp.h*2),camera);
    return raycaster.intersectObject(plant,true)[0]?.object.userData.plantPart||null;
  }
  return {
    draw(view,size,img,scale){
      if(disposed)return;
      vp=size;const dpr=Math.min(devicePixelRatio,2),key=vp.w+':'+vp.h+':'+dpr;
      if(key!==lastSize){renderer.setPixelRatio(dpr);renderer.setSize(vp.w,vp.h,false);lastSize=key;}
      camera.setViewOffset(img.w,img.h,view.cx-vp.w/(2*scale),view.cy-vp.h/(2*scale)+(config.offsetY||0)*img.w/config.width,vp.w/scale,vp.h/scale);
      renderer.render(scene,camera);
    },
    hitPart,hit:point=>hitPart(point)!==null,
    async warmup(){await environment.ready;await renderer.compileAsync(scene,camera);},
    touch:()=>motion.touch(),setActive:value=>motion.setActive(value),
    imageAnchor(){
      const p=new THREE.Box3().setFromObject(plant).getCenter(new THREE.Vector3()).project(baseCamera);
      return [(p.x+1)*config.width/2,(1-p.y)*config.height/2];
    },
    dispose(){
      if(disposed)return;disposed=true;unsubscribe();motion.dispose();plant.userData.dispose();shadow.dispose();lighting.dispose();environment.dispose();renderer.dispose();renderer.forceContextLoss();
    },
  };
}

export function mountPlant(container){
  const initial=plantLibrary.current();
  container.innerHTML=`<div class="plant-layout">
    <div class="plant-portrait"><span class="plant-edition">BOTANICAL FILE / <b data-plant-letter>${initial.letter}</b></span><canvas role="img" aria-label="${initial.name}的三维近景"></canvas><div class="plant-portrait-caption"><span data-plant-caption>${initial.name}</span><small>窗边收藏</small></div><p class="plant-render-error" hidden>三维预览暂时无法显示</p></div>
    <section class="plant-story"><span class="paper-caption">我的植物 / 四种轮廓</span><h2 data-plant-name>${initial.name}</h2><p class="plant-subtitle" data-plant-subtitle>${initial.subtitle}</p><p class="plant-description" data-plant-description>${initial.description}</p>
      <div class="plant-selector" role="group" aria-label="切换窗边植物">${plantLibrary.list().map(entry=>`<button type="button" data-plant-select="${entry.id}" aria-pressed="${initial.id===entry.id}"><span aria-hidden="true">${entry.letter}</span><strong>${entry.name}</strong><i aria-hidden="true">↗</i></button>`).join('')}</div>
      <p class="plant-selection-status" role="status" aria-live="polite">选一株，放到窗边。</p>
      <button class="primary" type="button" id="plant-touch">${initial.touch}</button>
      <p class="plant-feedback" role="status" aria-live="polite">靠近一点，看看它的轮廓。</p>
      <div class="plant-future"><strong>养护玩法尚未开放</strong><p>以后，从这里照料它，记录每一次生长。</p></div>
    </section></div>`;
  const canvas=container.querySelector('canvas'),button=container.querySelector('#plant-touch'),feedback=container.querySelector('.plant-feedback');
  const selector=container.querySelector('.plant-selector'),status=container.querySelector('.plant-selection-status');
  let renderer=null,plant=null,scene=null,camera=null,lighting=null,motion=null,observer=null,disposed=false;
  const raycaster=new THREE.Raycaster();
  function draw(){if(renderer&&plant&&!disposed&&!document.hidden&&!canvas.hidden)renderer.render(scene,camera);}
  function fit(){
    if(!plant||!renderer)return;
    const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(width,height,false);
    camera.aspect=width/height;camera.updateProjectionMatrix();
    const box=new THREE.Box3().setFromObject(plant),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const distance=Math.max(size.y/2,size.x/2/camera.aspect)/Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*1.22+size.z*.55;
    camera.position.copy(center).add(new THREE.Vector3(.13,.20,1).normalize().multiplyScalar(distance));
    camera.lookAt(center);draw();
  }
  function unavailable(){
    canvas.hidden=true;button.hidden=true;motion?.dispose();motion=null;observer?.disconnect();
    container.querySelector('.plant-render-error').hidden=false;
    plant?.userData.dispose();plant=null;lighting?.dispose();lighting=null;renderer?.dispose();renderer?.forceContextLoss();renderer=null;
    feedback.textContent='仍可选择植物；返回房间查看，或刷新后重试预览。';
  }
  function replace(entry){
    motion?.reset();
    if(renderer){
      const next=makePlant(entry.id);if(plant){scene.remove(plant);plant.userData.dispose();}
      plant=next;scene.add(plant);canvas.dataset.model=entry.id;fit();
    }
    canvas.setAttribute('aria-label',entry.name+'的三维近景，点击叶片轻碰');
    container.querySelector('[data-plant-letter]').textContent=entry.letter;
    container.querySelector('[data-plant-name]').textContent=entry.name;
    container.querySelector('[data-plant-caption]').textContent=entry.name;
    container.querySelector('[data-plant-subtitle]').textContent=entry.subtitle;
    container.querySelector('[data-plant-description]').textContent=entry.description;
    selector.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.plantSelect===entry.id)));
    button.textContent=entry.touch;
    if(renderer)feedback.textContent='点点叶片，或等窗边的一阵微风。';
  }
  try{
    renderer=rendererFor(canvas);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(33,1,.01,20);
    lighting=createPlantLighting(scene);
    replace(initial);
    motion=bindPlantMotion(pose=>{if(disposed||!plant||!renderer)return;applyPlantSway(plant,pose);renderer.shadowMap.needsUpdate=true;draw();},()=>PLANT_FLEX[plant.userData.plantId]);
    observer=new ResizeObserver(fit);observer.observe(canvas);
  }catch{unavailable();}
  const unsubscribe=plantLibrary.subscribe((entry,info)=>{
    try{replace(entry);}catch{unavailable();}
    status.textContent=info.external?'窗边已同步为'+entry.name:info.persisted?'已放到窗边 · 下次回来还是它':'已放到窗边 · 本次选择暂不能保存';
  });
  selector.onclick=event=>{
    const target=event.target.closest('[data-plant-select]');if(!target)return;
    plantLibrary.select(target.dataset.plantSelect);
  };
  selector.onkeydown=event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    const buttons=[...selector.querySelectorAll('button')],index=buttons.indexOf(event.target);if(index<0)return;
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+buttons.length)%buttons.length;
    buttons[next].focus();plantLibrary.select(buttons[next].dataset.plantSelect);
  };
  const touch=()=>{
    if(!plant||!renderer||!motion)return;const entry=plantLibrary.current();
    feedback.textContent=motion.isReduced()?'轻碰了'+entry.name+'。':entry.response;
    motion.touch();
  };
  button.onclick=touch;
  canvas.onclick=event=>{
    if(!plant||!camera)return;const bounds=canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX-bounds.left)/bounds.width*2-1,1-(event.clientY-bounds.top)/bounds.height*2),camera);
    if(raycaster.intersectObject(plant,true)[0]?.object.userData.plantPart==='foliage')touch();
  };
  const contextLost=event=>{event.preventDefault();unavailable();};
  canvas.addEventListener('webglcontextlost',contextLost);
  return ()=>{
    if(disposed)return;disposed=true;unsubscribe();motion?.dispose();observer?.disconnect();
    canvas.removeEventListener('webglcontextlost',contextLost);
    selector.onclick=null;selector.onkeydown=null;button.onclick=null;canvas.onclick=null;
    plant?.userData.dispose();lighting?.dispose();renderer?.dispose();renderer?.forceContextLoss();
  };
}

