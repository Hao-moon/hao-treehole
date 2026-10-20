import {THREE,makeFigure,figureRenderer,addFigureLights} from './figure-engine.js';

export async function createDesktopFigure(canvas,library,invalidate){
  const config=await fetch('/assets/collectibles/desktop-camera.json').then(r=>r.json());
  const renderer=figureRenderer(canvas),scene=new THREE.Scene();addFigureLights(scene);
  const camera=new THREE.PerspectiveCamera(config.fov,config.width/config.height,.01,100);
  new THREE.Matrix4().fromArray(config.matrix).decompose(camera.position,camera.quaternion,camera.scale);
  camera.updateMatrixWorld();camera.setViewOffset(config.width,config.height,0,config.offsetY||0,config.width,config.height);const baseCamera=camera.clone();
  const raycaster=new THREE.Raycaster();let figure=null,generation=0,vp={w:innerWidth,h:innerHeight};
  const position=new THREE.Vector3(...config.position);
  // 接触阴影随手办一起缩放，避免模型看起来悬在桌面上。
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;
  const ctx=shadowCanvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,12,64,64,64);
  gradient.addColorStop(0,'rgba(0,0,0,.55)');gradient.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(.26,.20),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.copy(position);shadow.position.y+=.001;scene.add(shadow);
  async function setModel(entry){
    const token=++generation;const next=await makeFigure(entry);
    if(token!==generation){next.userData.dispose();return;}
    if(figure){scene.remove(figure);figure.userData.dispose();}
    figure=next;figure.position.copy(position);figure.scale.setScalar(config.figureHeight);figure.rotation.y=-12*Math.PI/180;
    scene.add(figure);figure.updateMatrixWorld(true);canvas.dataset.model=entry.id;invalidate();
  }
  const unsubscribe=library.subscribe(entry=>setModel(entry).catch(()=>{}));
  await setModel(library.current());
  return {
    sourceSize:{w:config.width,h:config.height},
    draw(view,size,img,scale){
      vp=size;renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(vp.w,vp.h,false);
      camera.setViewOffset(img.w,img.h,view.cx-vp.w/(2*scale),view.cy-vp.h/(2*scale)+(config.offsetY||0)*img.w/config.width,vp.w/scale,vp.h/scale);
      renderer.render(scene,camera);
    },
    hit(point){if(!figure)return false;raycaster.setFromCamera(new THREE.Vector2(point.x/vp.w*2-1,1-point.y/vp.h*2),camera);return raycaster.intersectObject(figure,true).length>0;},
    imageAnchor(){const p=position.clone().add(new THREE.Vector3(0,config.figureHeight*.52,0)).project(baseCamera);return {x:(p.x+1)*config.width/2,y:(1-p.y)*config.height/2};},
    dispose(){generation++;unsubscribe();figure?.userData.dispose();shadow.geometry.dispose();shadow.material.map.dispose();shadow.material.dispose();renderer.dispose();renderer.forceContextLoss();}
  };
}
