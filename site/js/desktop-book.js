import * as THREE from 'three';
import {ghostWorld,themeAsset} from './world-theme.js';
import {attachUrbanEnvironment,addUrbanDesktopLight} from './world-lighting.js';

// 同一册书贯穿桌面、拿起、开封和放回；相机与 Blender 底图共享投影。
export async function createDesktopBook(canvas){
  const cfg=await fetch('/assets/collectibles/desktop-camera.json').then(r=>r.json());
  const texture=await new THREE.TextureLoader().loadAsync(themeAsset('/assets/scene/book-cover.png'));
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});
  renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  if(ghostWorld){renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1.2;}
  const scene=new THREE.Scene(),book=new THREE.Group(),cover=new THREE.Group();scene.add(book);
  const camera=new THREE.PerspectiveCamera(cfg.fov,cfg.width/cfg.height,.01,100);
  new THREE.Matrix4().fromArray(cfg.matrix).decompose(camera.position,camera.quaternion,camera.scale);camera.updateMatrixWorld();
  const material=options=>ghostWorld?new THREE.MeshStandardMaterial({roughness:.84,...options}):new THREE.MeshBasicMaterial(options);
  const ink=material({color:ghostWorld?0x202c32:0x101014}),paper=material({color:ghostWorld?0xe8e3d6:0xf6f2e8});
  const edge=material({color:0xb9b6ac}),red=material({color:ghostWorld?0x899d80:0xed002b});
  function box(parent,w,h,d,x,y,z,material){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);o.position.set(x,y,z);if(ghostWorld){o.castShadow=true;o.receiveShadow=true;}parent.add(o);return o;}
  box(book,.26,.36,.008,.13,0,-.023,ink);
  box(book,.243,.346,.034,.135,0,-.002,paper);
  for(let i=0;i<7;i++)box(book,.243,.0006,.001,.135,-.173,-.017+i*.005,edge);
  for(let i=0;i<7;i++)box(book,.0007,.346,.001,.256,0,-.017+i*.005,edge);
  box(book,.008,.36,.050,.002,0,-.004,red);
  box(book,.018,.075,.001,.19,-.186,-.007,red);
  book.add(cover);cover.position.z=.023;
  box(cover,.26,.36,.008,.13,0,0,ink);
  const art=new THREE.Mesh(new THREE.PlaneGeometry(.235,.344),material({map:texture}));art.position.set(.138,0,.0045);cover.add(art);
  const lining=new THREE.Mesh(new THREE.PlaneGeometry(.244,.344),paper);lining.position.set(.13,0,-.0045);lining.rotation.y=Math.PI;cover.add(lining);
  const leaves=[];
  for(let i=0;i<3;i++){
    const hinge=new THREE.Group();hinge.position.z=.017+i*.0013;book.add(hinge);
    const leaf=new THREE.Mesh(new THREE.PlaneGeometry(.245,.343,20,1),material({color:i===2?0xf8f4ea:0xe7e1d6,side:THREE.DoubleSide}));leaf.position.x=.129;hinge.add(leaf);leaves.push({hinge,leaf});
  }
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(.30,.385),new THREE.MeshBasicMaterial({color:0x101014,transparent:true,opacity:.24,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;const pos=cfg.book?.position||[1.05,.78,.55];shadow.position.set(pos[0]+.012,pos[1]+.001,pos[2]+.014);scene.add(shadow);
  const restingQuaternion=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),(cfg.book?.yaw??-12)*Math.PI/180).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2));
  const restingPosition=new THREE.Vector3(...pos).add(new THREE.Vector3(0,.028,0)).add(new THREE.Vector3(-.13,0,0).applyQuaternion(restingQuaternion));
  let progress=0,frame=0,settle=null,panel=null,viewport={w:innerWidth,h:innerHeight};
  const home=canvas.parentElement,reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  function size(){const w=innerWidth,h=innerHeight,dpr=Math.min(devicePixelRatio,2);viewport={w,h};if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){renderer.setPixelRatio(dpr);renderer.setSize(w,h,false);}}
  function target(){
    const r=panel.getBoundingClientRect(),depth=2;
    const center=new THREE.Vector3((r.left+r.width/2)/viewport.w*2-1,1-(r.top+r.height/2)/viewport.h*2,0).unproject(camera);
    const ray=center.sub(camera.position),forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
    const position=camera.position.clone().add(ray.multiplyScalar(depth/ray.dot(forward)));
    const a=new THREE.Vector3(-1,0,0).unproject(camera),b=new THREE.Vector3(1,0,0).unproject(camera);
    const planeScale=depth/new THREE.Vector3(0,0,0).unproject(camera).sub(camera.position).dot(forward);
    const worldPerPixel=a.distanceTo(b)*planeScale/viewport.w;
    return {position,scale:Math.min(r.width/.52,r.height/.36)*worldPerPixel};
  }
  function render(){
    size();const lift=smooth(progress/.57),opening=smooth((progress-.53)/.45);
    book.position.copy(restingPosition);book.quaternion.copy(restingQuaternion);book.scale.setScalar(1);
    if(panel&&progress>0){const goal=target();book.position.lerp(goal.position,lift);book.quaternion.slerp(camera.quaternion,lift);book.scale.setScalar(THREE.MathUtils.lerp(1,goal.scale,lift));
      // 沿相机上方划出一小段抬起的弧线，保留书脊的重量感。
      book.position.add(new THREE.Vector3(0,Math.sin(lift*Math.PI)*.10,0).applyQuaternion(camera.quaternion));}
    cover.rotation.y=-Math.PI*opening;
    leaves.forEach(({hinge,leaf},i)=>{const t=smooth((progress-.62-i*.045)/(.32-i*.045));hinge.rotation.y=-Math.PI*t;
      const points=leaf.geometry.attributes.position;
      for(let j=0;j<points.count;j++){const x=points.getX(j)+.1225;points.setZ(j,Math.sin(x/.245*Math.PI)*(Math.sin(t*Math.PI)*.023+t*.001));}points.needsUpdate=true;});
    shadow.material.opacity=.24*(1-lift);shadow.visible=!panel;
    canvas.dataset.progress=progress.toFixed(3);renderer.render(scene,camera);
  }
  function cancel(){cancelAnimationFrame(frame);frame=0;if(settle){settle(false);settle=null;}}
  function move(to){cancel();const from=progress,duration=reduced.matches?0:Math.max(300,Math.abs(to-from)*(to?850:700));
    return new Promise(resolve=>{settle=resolve;const start=performance.now();function tick(now){const t=duration?Math.min(1,(now-start)/duration):1;progress=from+(to-from)*t;render();if(t<1)frame=requestAnimationFrame(tick);else{settle=null;resolve(true);}}frame=requestAnimationFrame(tick);});
  }
  const light=addUrbanDesktopLight(scene,renderer),environment=attachUrbanEnvironment(scene,renderer,render,.5);
  return {
    draw(view,vp,img,scale){size();camera.setViewOffset(img.w,img.h,view.cx-vp.w/(2*scale),view.cy-vp.h/(2*scale)+(cfg.offsetY||0)*img.w/cfg.width,vp.w/scale,vp.h/scale);render();},
    async open(dialog){panel=dialog;dialog.append(canvas);canvas.classList.add('held-book');return move(1);},
    async close(){const done=await move(0);if(done){panel=null;canvas.classList.remove('held-book');home.append(canvas);render();}return done;},
    reset(){cancel();progress=0;panel=null;canvas.classList.remove('held-book');home.append(canvas);render();},
    get active(){return !!panel;},
    dispose(){cancel();environment.dispose();light.dispose();const resources=new Set([texture]);scene.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[]))resources.add(material);});resources.forEach(resource=>resource.dispose());renderer.dispose();renderer.forceContextLoss();}
  };
}
