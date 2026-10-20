import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createTurntableSkin} from './turntable-skin.js';
import {createRecordGraphics} from './turntable-disc.js';
import {tonearmAngle,sliderPosition} from './turntable-kinematics.js';
import {getTurntableSkin,subscribeTurntableSkin} from './turntable-finish.js';
import {createDeckTransition} from './turntable-transition.js';
import {applyDesktopWindowLight} from './turntable-window-light.js';
import {ghostWorld} from './world-theme.js';
import {attachUrbanEnvironment,addUrbanDesktopLight} from './world-lighting.js';

let source,artSource;
const load=()=>source||(source=new GLTFLoader().loadAsync('/assets/turntable/hao-turntable.glb').catch(error=>{source=null;throw error;}));
const loadArt=()=>artSource||(artSource=new THREE.TextureLoader().loadAsync('/assets/turntable/orbit-decal.png').then(texture=>{texture.colorSpace=THREE.SRGBColorSpace;return texture;}).catch(error=>{artSource=null;throw error;}));
export async function makeTurntable({desktop=false,skin=getTurntableSkin()}={}) {
  const [gltf,art]=await Promise.all([load(),skin==='eva02'?loadArt().catch(()=>null):null]), root=gltf.scene.clone(true), resources=new Set(),eva=skin==='eva02';
  const artTexture=art?.clone();if(artTexture){artTexture.needsUpdate=true;resources.add(artTexture);}
  const ramp=new THREE.DataTexture(new Uint8Array([65,155,255]),3,1,THREE.RedFormat);
  ramp.minFilter=ramp.magFilter=THREE.NearestFilter;ramp.needsUpdate=true;resources.add(ramp);
  const meshes=[];root.traverse(node=>{if(node.isMesh)meshes.push(node);});
  for(const mesh of meshes){
    mesh.geometry=mesh.geometry.clone();resources.add(mesh.geometry);
    const original=mesh.material;
    const color=original.color?.clone()||new THREE.Color('#c9c9c8');
    // UNIT-02 armor: scarlet enamel, graphite hardware and orange accents.
    if(/银色铝面板/.test(mesh.name))color.set(eva?'#b52b24':'#e9e8e1');
    if(/减震底盘|转盘基座/.test(mesh.name))color.set(eva?'#12171d':'#20242a');
    if(/唱臂银环/.test(mesh.name))color.set(eva?'#f3a140':'#dedfd9');
    if(/推子红线/.test(mesh.name))color.set(eva?'#f3a140':'#d91f42');
    if(/S形唱臂/.test(mesh.name))color.set('#bcc1c5');
    if(mesh.name.includes('黑胶'))color.set('#17171b');
    if(mesh.name.includes('刻纹'))color.set('#35353b');
    if(mesh.name.includes('绯红'))color.set('#ed2635');
    if(ghostWorld&&!eva){
      if(/银色铝面板/.test(mesh.name))color.set('#afb6b8');
      if(/绯红|红线|红色/.test(mesh.name))color.set('#7f919a');
      if(/减震底盘|转盘基座/.test(mesh.name))color.set('#252c31');
    }
    mesh.material=ghostWorld?new THREE.MeshStandardMaterial({color,roughness:.46,metalness:/银|金属|唱臂/.test(mesh.name)?.48:.1}):desktop?new THREE.MeshBasicMaterial({color}):new THREE.MeshToonMaterial({color,gradientMap:ramp});
    resources.add(mesh.material);
    if(ghostWorld){mesh.castShadow=true;mesh.receiveShadow=true;}
    if(!ghostWorld&&!desktop&&/铝面板|减震底盘|启停键|推子帽|黑色唱头/.test(mesh.name)){
      const geometry=new THREE.EdgesGeometry(mesh.geometry,32),material=new THREE.LineBasicMaterial({color:'#15151b'});
      resources.add(geometry);resources.add(material);mesh.add(new THREE.LineSegments(geometry,material));
    }
  }
  const platter=root.getObjectByName('platter'),arm=root.getObjectByName('tonearm'),chassis=root.getObjectByName('chassis');
  if(!platter||!arm)throw new Error('唱盘可动部件缺失');
  const slider=meshes.find(mesh=>mesh.name.includes('银色推子帽'));
  const stripe=meshes.find(mesh=>mesh.name.includes('推子红线'));
  const power=meshes.find(mesh=>mesh.name.includes('启停银面')),powerIdle=power?.material.color.clone();
  {
    const keys=meshes.filter(mesh=>mesh.name.includes('转速键')).sort((a,b)=>a.position.x-b.position.x);
    keys.forEach((key,index)=>{key.position.x=index?-.09:-.132;key.scale.x*=1.35;key.scale.z*=1.6;});
  }
  if(desktop){
    // Cover the original body with the same geometry and livery used in close-up.
    root.position.set(-1.01,.7803,.20);
  }
  const surface=createTurntableSkin(THREE,root,resources,{artTexture,desktop,skin});
  createRecordGraphics(THREE,root,resources,artTexture,{skin});
  if(desktop&&!ghostWorld)await applyDesktopWindowLight(root);
  return {root,platter,arm,
    setAngle(angle){platter.rotation.y=-angle;},
    controls:surface?.controls,
    updateSurface(state){surface?.update(state);},
    setPowered(running){if(power){power.material.color.copy(powerIdle);if(desktop&&running)power.material.color.set(ghostWorld?'#b8d0a0':'#ed123b');}if(desktop)surface.update({playing:running});},
    setArm(angle){arm.rotation.y=angle;},
    setVolume(value){if(slider){slider.position.z=sliderPosition(value);if(stripe)stripe.position.z=slider.position.z;}},
    dispose(){resources.forEach(resource=>resource.dispose());}
  };
}

export function makeDeckRenderer(canvas){
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  if(ghostWorld){renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1.2;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));return renderer;
}

export async function createDesktopTurntable(canvas,motor){
  let [model,config]=await Promise.all([makeTurntable({desktop:true}),fetch('/assets/collectibles/desktop-camera.json').then(r=>r.json())]);
  const renderer=makeDeckRenderer(canvas),scene=new THREE.Scene();scene.add(model.root);
  const urbanLight=addUrbanDesktopLight(scene,renderer),environment=attachUrbanEnvironment(scene,renderer,()=>render());
  const camera=new THREE.PerspectiveCamera(config.fov,config.width/config.height,.01,100);
  new THREE.Matrix4().fromArray(config.matrix).decompose(camera.position,camera.quaternion,camera.scale);
  let ready=false,size='',disposed=false,skinVersion=0,held=false,lastState={};
  function render(){if(ready&&!document.hidden)renderer.render(scene,camera);}
  const unsubscribe=motor.subscribe(state=>{
    model.setAngle(state.angle);model.setPowered(state.running);canvas.dataset.angle=state.angle.toFixed(4);canvas.dataset.running=String(state.running);render();
  });
  const unsubscribeSkin=subscribeTurntableSkin(async skin=>{
    const version=++skinVersion,next=await makeTurntable({desktop:true,skin});
    if(disposed||version!==skinVersion){next.dispose();return;}
    const state=motor.snapshot();next.setAngle(state.angle);next.setPowered(state.running);next.setArm(tonearmAngle(lastState));next.setVolume(lastState.volume??1);
    scene.remove(model.root);model.dispose();model=next;scene.add(model.root);canvas.dataset.skin=skin;render();
  });
  canvas.dataset.skin=getTurntableSkin();
  return {
    draw(view,vp,img,scale){
      const next=`${vp.w},${vp.h},${devicePixelRatio}`;
      if(next!==size){size=next;renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(vp.w,vp.h,false);}
      camera.setViewOffset(img.w,img.h,view.cx-vp.w/(2*scale),view.cy-vp.h/(2*scale)+(config.offsetY||0)*img.w/config.width,vp.w/scale,vp.h/scale);
      ready=true;render();
    },
    pickupCamera(){camera.updateMatrixWorld();return {position:camera.position.clone().sub(model.root.position),quaternion:camera.quaternion.clone(),projection:camera.projectionMatrix.clone(),angle:motor.snapshot().angle};},
    snapshot:()=>motor.snapshot(),
    update(state){lastState=state;model.setArm(tonearmAngle(state));model.setVolume(state.volume);render();},
    setHeld(value){held=!!value;canvas.style.visibility=held?'hidden':'';canvas.dataset.held=String(held);},
    dispose(){disposed=true;skinVersion++;unsubscribe();unsubscribeSkin();environment.dispose();urbanLight.dispose();model.dispose();renderer.dispose();renderer.forceContextLoss();}
  };
}

// A single physical object: orbit the body, activate only the engraved controls.
export async function createDeckCloseup(canvas,motor,{onAction,onVolume,onPositions,onError,pickup}){
  let model=await makeTurntable();
  let renderer;
  try{renderer=makeDeckRenderer(canvas);}catch(error){model.dispose();throw error;}
  const scene=new THREE.Scene();scene.add(model.root);
  const environment=attachUrbanEnvironment(scene,renderer,()=>render(),.55);
  scene.add(new THREE.HemisphereLight('#ffffff','#515563',1.7));
  const key=new THREE.DirectionalLight('#fff5eb',2);key.position.set(-1,3,2);scene.add(key);
  const camera=new THREE.PerspectiveCamera(35,1,.01,100);
  camera.position.set(.035,.86,.62);
  const orbit=new OrbitControls(camera,canvas);orbit.target.set(0,.055,0);
  orbit.enablePan=false;orbit.enableDamping=false;orbit.rotateSpeed=.55;
  orbit.minPolarAngle=.12;orbit.maxPolarAngle=1.2;
  orbit.touches.TWO=THREE.TOUCH.DOLLY_ROTATE;orbit.update();orbit.saveState();
  const homeDirection=camera.position.clone().sub(orbit.target).normalize();let fitDistance=0;
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  let armAngle=0,armTarget=0,last=performance.now(),armFrame=0,armInitialized=false,disposed=false,w=1,h=1,gesture=null,lastState={},skinVersion=0,angleOffset=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const transitCamera=new THREE.Camera();
  let returnPose=null,transition;
  const pose=cam=>({position:cam.position.clone(),quaternion:cam.quaternion.clone(),projection:cam.projectionMatrix.clone()});
  function renderCamera(){
    const lift=transition?.value??(pickup?.()?0:1),start=pickup?.();
    if(lift>=1||!start)return camera;
    const end=returnPose||pose(camera);
    transitCamera.position.copy(start.position).lerp(end.position,lift);
    // A short upward arc makes the hand-off feel lifted instead of zoomed.
    transitCamera.position.y-=Math.sin(Math.PI*lift)*.07;
    transitCamera.quaternion.copy(start.quaternion).slerp(end.quaternion,lift);
    for(let i=0;i<16;i++)transitCamera.projectionMatrix.elements[i]=THREE.MathUtils.lerp(start.projection.elements[i],end.projection.elements[i],lift);
    transitCamera.projectionMatrixInverse.copy(transitCamera.projectionMatrix).invert();transitCamera.updateMatrixWorld();return transitCamera;
  }
  const controls={...model.controls,volume:{position:[.207,.09,.045],size:[.035,.13]}};
  const project=point=>{const p=new THREE.Vector3(...point).project(camera);return {x:(p.x+1)*w/2,y:(1-p.y)*h/2};};
  function positions(){
    camera.updateMatrixWorld();
    const points={};
    for(const [name,control] of Object.entries(controls)){
      const [x,y,z]=control.position,[width,depth]=control.size,p=project([x,y,z]);
      const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([a,b])=>project([x+a*width/2,y,z+b*depth/2]));
      const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);
      points[name]={...p,width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
    }
    canvas.dataset.azimuth=orbit.getAzimuthalAngle().toFixed(3);
    canvas.dataset.polar=orbit.getPolarAngle().toFixed(3);
    onPositions?.(points);
  }
  function render(){if(!disposed&&!document.hidden){const lift=transition?.value??0;canvas.dataset.lift=lift.toFixed(3);canvas.style.setProperty('--deck-lift',lift);canvas.closest('dialog')?.style.setProperty('--deck-lift',lift);renderer.render(scene,renderCamera());}}
  transition=createDeckTransition({initial:pickup?.()?0:1,reduced:()=>reduced.matches,draw:value=>{orbit.enabled=value===1;render();}});
  function animateArm(now){
    armFrame=0;const dt=Math.min((now-last)/1000,.1);last=now;
    armAngle+=(armTarget-armAngle)*(1-Math.exp(-dt*8));
    if(Math.abs(armAngle-armTarget)<.0005)armAngle=armTarget;
    model.setArm(armAngle);canvas.dataset.armAngle=armAngle.toFixed(5);render();
    if(armAngle!==armTarget)armFrame=requestAnimationFrame(animateArm);
  }
  function armTo(value){armTarget=value;if(!armInitialized||reduced.matches){armInitialized=true;armAngle=value;model.setArm(value);canvas.dataset.armAngle=value.toFixed(5);render();}else if(!armFrame){last=performance.now();armFrame=requestAnimationFrame(animateArm);}}
  function resize(){
    w=canvas.clientWidth;h=canvas.clientHeight;if(!w||!h)return;
    const zoomRatio=fitDistance?camera.position.distanceTo(orbit.target)/fitDistance:1;
    renderer.setSize(w,h,false);const aspect=w/h,vertical=Math.max(.50,.60/aspect),distance=vertical/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
    fitDistance=distance;camera.aspect=aspect;camera.position.sub(orbit.target).normalize().multiplyScalar(distance*zoomRatio).add(orbit.target);
    orbit.minDistance=distance/1.6;orbit.maxDistance=distance/.85;
    camera.updateProjectionMatrix();orbit.update();positions();render();
  }
  function resetView(){camera.position.copy(homeDirection).multiplyScalar(fitDistance).add(orbit.target);orbit.update();}
  function orbitChanged(){positions();render();}
  orbit.addEventListener('change',orbitChanged);
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  const unsubscribe=motor.subscribe(state=>{model.setAngle(state.angle+angleOffset);model.setPowered(state.running);canvas.dataset.angle=(state.angle+angleOffset).toFixed(4);canvas.dataset.running=String(state.running);render();});
  const unsubscribeSkin=subscribeTurntableSkin(async skin=>{
    const version=++skinVersion,next=await makeTurntable({skin});
    if(disposed||version!==skinVersion){next.dispose();return;}
    const state=motor.snapshot();next.setAngle(state.angle+angleOffset);next.setPowered(state.running);next.setArm(armAngle);next.setVolume(lastState.volume??1);next.updateSurface(lastState);
    scene.remove(model.root);model.dispose();model=next;scene.add(model.root);canvas.dataset.skin=skin;render();
  });
  canvas.dataset.skin=getTurntableSkin();
  function setRay(event){const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);raycaster.setFromCamera(pointer,camera);}
  function hit(event){setRay(event);return raycaster.intersectObject(model.root,true).find(hit=>hit.object.isMesh&&hit.object.visible);}
  function actionFor(intersection){
    const object=intersection?.object,name=object?.name||'';
    if(object?.userData.deckAction)return object.userData.deckAction;
    if(/启停/.test(name))return 'play';
    if(/电源旋钮/.test(name))return 'like';
    if(/转速键/.test(name))return object.position.x<-.11?'previous':'next';
    if(/推子/.test(name))return 'volume';
    return '';
  }
  const sliderPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-.08),sliderPoint=new THREE.Vector3();
  function slide(event){setRay(event);if(raycaster.ray.intersectPlane(sliderPlane,sliderPoint))onVolume(Math.max(0,Math.min(1,(.105-sliderPoint.z)/.12)));}
  function down(event){
    if(transition.value<1)return;
    if(!event.isPrimary){if(gesture)gesture.moved=true;return;}
    if(event.button!==0)return;
    const intersection=hit(event),action=actionFor(intersection);
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,action,empty:!intersection,moved:false};
    if(action==='volume'){orbit.enabled=false;canvas.setPointerCapture(event.pointerId);slide(event);event.stopImmediatePropagation();}
  }
  function move(event){
    if(gesture){
      if(event.pointerId!==gesture.id){gesture.moved=true;return;}
      if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>5)gesture.moved=true;
      if(gesture.action==='volume'){slide(event);return;}
      canvas.style.cursor='grabbing';
    }else {
      const action=actionFor(hit(event));canvas.style.cursor=action?'pointer':'grab';
      canvas.title=({play:'播放 / 暂停',like:'喜爱 +1，每次点击都会累计',previous:'上一首',next:'下一首',volume:'拖动调整音量',import:'加入本地歌曲',close:'收起唱机，音乐继续',skin:'换肤：原始 / ORBIT 轨道'})[action]||'拖动旋转 · 滚轮或双指缩放';
    }
  }
  function up(event){
    if(!gesture||event.pointerId!==gesture.id)return;
    const done=gesture;gesture=null;orbit.enabled=true;canvas.style.cursor='grab';
    if(done.action==='volume'){if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);return;}
    if(!done.moved){const intersection=hit(event),action=actionFor(intersection);if(action&&action===done.action)onAction(action);else if(done.empty&&!intersection)onAction('close');}
  }
  function cancel(){gesture=null;orbit.enabled=transition.value===1;canvas.style.cursor='grab';}
  function keydown(event){
    if(transition.value<1)return;
    if(event.key==='Home'){resetView();event.preventDefault();return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();const spherical=new THREE.Spherical().setFromVector3(camera.position.clone().sub(orbit.target));
    if(event.key==='ArrowLeft')spherical.theta-=.15;if(event.key==='ArrowRight')spherical.theta+=.15;
    if(event.key==='ArrowUp')spherical.phi-=.1;if(event.key==='ArrowDown')spherical.phi+=.1;
    spherical.phi=THREE.MathUtils.clamp(spherical.phi,orbit.minPolarAngle,orbit.maxPolarAngle);
    camera.position.copy(orbit.target).add(new THREE.Vector3().setFromSpherical(spherical));orbit.update();
  }
  function contextLost(event){event.preventDefault();onError?.();}
  canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move);
  canvas.addEventListener('pointerup',up,true);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);
  canvas.addEventListener('keydown',keydown);canvas.addEventListener('webglcontextlost',contextLost);
  resize();
  return {
    update(state){lastState=state;model.setVolume(state.volume);model.updateSurface(state);canvas.dataset.track=state.current?.id||'';canvas.dataset.likes=String(state.likeCount||0);canvas.dataset.time=String(state.time||0);canvas.dataset.duration=String(state.duration||0);armTo(tonearmAngle(state));render();},
    moveTo(value){if(value===0&&transition.value===1)returnPose=pose(camera);if(value===1&&transition.value===0)returnPose=null;orbit.enabled=false;return transition.move(value);},
    snapTo(value){returnPose=null;transition.snap(value);},
    adoptAngle(angle){angleOffset=angle-motor.snapshot().angle;model.setAngle(angle);canvas.dataset.angle=angle.toFixed(4);render();},
    get angle(){return motor.snapshot().angle+angleOffset;},
    reset:resetView,
    dispose(){disposed=true;skinVersion++;transition.dispose();observer.disconnect();unsubscribe();unsubscribeSkin();cancelAnimationFrame(armFrame);orbit.dispose();
      canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up,true);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('lostpointercapture',cancel);canvas.removeEventListener('keydown',keydown);canvas.removeEventListener('webglcontextlost',contextLost);
      environment.dispose();model.dispose();renderer.dispose();renderer.forceContextLoss();}
  };
}

