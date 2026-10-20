import {THREE,makeFigure,figureRenderer,addFigureLights} from './figure-engine.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

export function createModelViewer(root,initial){
  const canvas=root.querySelector('canvas'),viewport=root.querySelector('.character-view');
  const message=root.querySelector('.character-loading'),scaleText=root.querySelector('.character-scale');
  const abort=new AbortController(),signal=abort.signal;
  let renderer,controls,observer,figure=null,raf=0,disposed=false,generation=0,entry=initial;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.01,100);
  addFigureLights(scene);
  const resting=new THREE.Vector3(0,.61,2.18),target=new THREE.Vector3(0,.55,0);
  let homeDistance=resting.distanceTo(target);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const on=(el,type,fn,opts={})=>el.addEventListener(type,fn,{...opts,signal});
  function fail(text){root.dataset.state='error';message.hidden=false;message.textContent=text;root.querySelector('[data-model-retry]').hidden=false;}
  function draw(){raf=0;if(disposed||document.hidden||!renderer)return;
    const moving=controls.update();renderer.render(scene,camera);
    const distance=camera.position.distanceTo(controls.target);scaleText.value=`${Math.round(homeDistance/distance*100)}%`;
    root.dataset.orbit=[camera.position.x,camera.position.y,camera.position.z].map(n=>n.toFixed(3)).join(',');
    root.dataset.zoom=(homeDistance/distance).toFixed(2);
    if(moving||controls.autoRotate)invalidate();
  }
  function invalidate(){if(!disposed&&!raf)raf=requestAnimationFrame(draw);}
  function fitHome(){
    if(!figure)return;
    const bounds=new THREE.Box3().setFromObject(figure),size=bounds.getSize(new THREE.Vector3());
    bounds.getCenter(target);
    const tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2);
    const distance=Math.max(size.y/2/tangent,size.x/2/tangent/camera.aspect)*1.13+size.z/2;
    resting.copy(target).add(new THREE.Vector3(0,.06,distance));
    homeDistance=resting.distanceTo(target);controls.maxDistance=Math.max(4.8,homeDistance*2.2);
  }
  function reset(){if(!controls)return;controls.autoRotate=false;root.querySelector('[data-model-auto]').setAttribute('aria-pressed','false');const damping=controls.enableDamping;controls.enableDamping=false;controls.update();camera.position.copy(resting);controls.target.copy(target);controls.update();controls.enableDamping=damping;invalidate();}
  async function setModel(next){
    entry=next;const token=++generation;root.dataset.state='loading';message.textContent='正在唤醒收藏…';message.hidden=false;root.querySelector('[data-model-retry]').hidden=true;
    try{
      const model=await makeFigure(entry);
      if(disposed||token!==generation){model.userData.dispose();return;}
      if(figure){scene.remove(figure);figure.userData.dispose();}
      figure=model;scene.add(figure);root.dataset.model=entry.id;root.dataset.state='ready';message.hidden=true;fitHome();reset();
    }catch(e){if(!disposed&&token===generation)fail('模型未能加载，请重试。');}
  }
  try{
    renderer=figureRenderer(canvas);controls=new OrbitControls(camera,canvas);
    controls.enableDamping=!reduced.matches;controls.dampingFactor=.12;controls.rotateSpeed=.7;
    controls.minDistance=.28;controls.maxDistance=4.8;controls.zoomToCursor=true;
    controls.minPolarAngle=.04;controls.maxPolarAngle=Math.PI-.04;controls.autoRotateSpeed=1.8;
    controls.addEventListener('change',invalidate);
    controls.addEventListener('start',()=>{controls.autoRotate=false;root.querySelector('[data-model-auto]').setAttribute('aria-pressed','false');invalidate();});
    observer=new ResizeObserver(()=>{
      const w=viewport.clientWidth,h=viewport.clientHeight;if(!w||!h)return;
      renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();fitHome();reset();invalidate();
    });observer.observe(viewport);reset();setModel(initial);
    on(root,'click',e=>{const b=e.target.closest('button');if(!b)return;
      if(b.hasAttribute('data-model-reset'))reset();
      if(b.hasAttribute('data-model-in')){controls.dollyIn(.8);controls.update();invalidate();}
      if(b.hasAttribute('data-model-out')){controls.dollyOut(.8);controls.update();invalidate();}
      if(b.hasAttribute('data-model-auto')){controls.autoRotate=!controls.autoRotate;b.setAttribute('aria-pressed',String(controls.autoRotate));invalidate();}
      if(b.hasAttribute('data-model-retry')){if(!renderer||renderer.getContext().isContextLost())location.reload();else setModel(entry);}
    });
    on(canvas,'keydown',e=>{
      if(!['+','=','-','Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
      e.preventDefault();if(e.key==='Home'){reset();return;}
      if(e.key==='+'||e.key==='=')controls.dollyIn(.8);else if(e.key==='-')controls.dollyOut(.8);
      else{
        const offset=camera.position.clone().sub(controls.target),s=new THREE.Spherical().setFromVector3(offset);
        if(e.key==='ArrowLeft')s.theta-=.15;if(e.key==='ArrowRight')s.theta+=.15;
        if(e.key==='ArrowUp')s.phi=Math.max(.05,s.phi-.12);if(e.key==='ArrowDown')s.phi=Math.min(Math.PI-.05,s.phi+.12);
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
      }
      controls.update();invalidate();
    });
    on(canvas,'webglcontextlost',e=>{e.preventDefault();if(!disposed)fail('三维画面已中断，请刷新页面重试。');});
    on(document,'visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else invalidate();});
  }catch{fail('当前浏览器无法启动三维画面，请刷新重试。');}
  return {setModel,dispose(){disposed=true;generation++;abort.abort();cancelAnimationFrame(raf);observer?.disconnect();controls?.dispose();figure?.userData.dispose();renderer?.dispose();renderer?.forceContextLoss();}};
}
