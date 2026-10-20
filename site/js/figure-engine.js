import {ghostWorld} from './world-theme.js';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneModel} from 'three/addons/utils/SkeletonUtils.js';

const cache=new Map();
export async function loadFigure(entry){
  if(!cache.has(entry.id)){
    const task=new GLTFLoader().loadAsync(entry.src).then(gltf=>{
      let meshCount=0;
      gltf.scene.traverse(o=>{if(!o.isMesh)return;meshCount++;o.castShadow=true;o.receiveShadow=false;
        for(const m of (Array.isArray(o.material)?o.material:[o.material])){
          if(m.map)m.map.anisotropy=8;
          // 使用原模型贴图；柔和反射不覆盖角色眼睛与细线。
          if('roughness'in m)m.roughness=Math.max(.65,m.roughness);
          if('metalness'in m)m.metalness=Math.min(.15,m.metalness);
        }
      });
      const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3());
      if(!meshCount||!Number.isFinite(size.y)||size.y<=0)throw new Error('模型中没有可显示的几何体');
      return {scene:gltf.scene,bounds,size};
    }).catch(e=>{cache.delete(entry.id);throw e;});cache.set(entry.id,task);
  }
  return cache.get(entry.id);
}
export async function makeFigure(entry,{pedestal=entry.pedestal!==false,headTilt=0}={}){
  const asset=await loadFigure(entry),group=new THREE.Group(),figure=cloneModel(asset.scene);
  const owned=[];
  figure.traverse(mesh=>{if(mesh.isSkinnedMesh&&mesh.skeleton)owned.push(mesh.skeleton);});
  // 桌面俯视机位沿用原 Blender 场景的轻微抬头；详情保留正视姿态。
  // 只改当前实例的几何，避免桌面和收藏卡互相影响。
  if(['asuka-refined','asuka-original'].includes(entry.id)&&headTilt){
    figure.updateMatrixWorld(true);
    const neck=1.3273,lift=new THREE.Matrix4().makeTranslation(0,neck,0)
      .multiply(new THREE.Matrix4().makeRotationX(-headTilt*Math.PI/180))
      .multiply(new THREE.Matrix4().makeTranslation(0,-neck,0));
    figure.traverse(mesh=>{
      if(!mesh.isMesh||!([].concat(mesh.material)).some(m=>/^(Face|Hair)/.test(m.name)))return;
      const transform=mesh.matrixWorld.clone().invert().multiply(lift).multiply(mesh.matrixWorld);
      mesh.geometry=mesh.geometry.clone();mesh.geometry.applyMatrix4(transform);owned.push(mesh.geometry);
    });
  }
  const center=asset.bounds.getCenter(new THREE.Vector3()),scale=1/asset.size.y;
  figure.scale.multiplyScalar(scale);figure.position.set(-center.x*scale,-asset.bounds.min.y*scale,-center.z*scale);
  const stand=pedestal ? .064 : 0;figure.position.y+=stand;group.add(figure);
  if(pedestal){
    for(const [radius,height,y,color] of [[.24,.027,.0135,0x101014],[.237,.008,.031,0xed002b],[.218,.020,.045,0x101014],[.204,.006,.058,0x292932]]){
      const geometry=new THREE.CylinderGeometry(radius,radius,height,8),material=new THREE.MeshStandardMaterial({color,roughness:.7});
      const mesh=new THREE.Mesh(geometry,material);mesh.position.y=y;mesh.rotation.y=Math.PI/8;mesh.castShadow=true;group.add(mesh);owned.push(geometry,material);
    }
    // 切角、警戒刻线、两块红色装甲与正面编号铭牌。
    function block(size,position,color,angle=0){const geometry=new THREE.BoxGeometry(...size),material=new THREE.MeshStandardMaterial({color,roughness:.8}),mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.rotation.y=angle;group.add(mesh);owned.push(geometry,material);return mesh;}
    for(const side of [-1,1]){
      block([.046,.006,.18],[side*.165,.063,0],0xed002b,side*.18);
      for(let i=0;i<4;i++)block([.019,.002,.005],[side*.148,.067,-.058+i*.019],0xf6f2e8,-side*.35);
      block([.010,.005,.10],[side*.185,.063,.028],0xf6f2e8,side*.18);
    }
    const plate=document.createElement('canvas');plate.width=512;plate.height=160;const ctx=plate.getContext('2d');
    ctx.fillStyle='#101014';ctx.fillRect(0,0,512,160);ctx.strokeStyle='#f6f2e8';ctx.lineWidth=5;ctx.strokeRect(9,9,494,142);
    const number=String(entry.number||'◆').slice(0,3);
    ctx.fillStyle='#ed002b';ctx.fillRect(18,18,129,124);ctx.fillStyle='#f6f2e8';ctx.font=`900 ${number.length>2?70:102}px Arial`;ctx.fillText(number,20,116,120);
    ctx.font='bold 25px Arial';ctx.fillText(entry.number==='02'?'COLLECTION':'COLLECTION',167,65);ctx.font='19px Arial';ctx.fillText('HAO / PERSONAL ARCHIVE',167,103);
    const map=new THREE.CanvasTexture(plate);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
    const geometry=new THREE.PlaneGeometry(.19,.059),material=new THREE.MeshBasicMaterial({map}),plaque=new THREE.Mesh(geometry,material);
    plaque.position.set(0,.037,.223);plaque.rotation.x=-.22;group.add(plaque);owned.push(map,geometry,material);
  }
  group.userData.dispose=()=>owned.forEach(r=>r.dispose());
  return group;
}
export function addFigureLights(scene){
  if(ghostWorld){scene.add(new THREE.HemisphereLight(0xc8d5cf,0x454c43,.8));const sunlight=new THREE.DirectionalLight(0xfff1db,3.6);sunlight.position.set(6.4,3.42,-2.9);scene.add(sunlight);const fill=new THREE.DirectionalLight(0xcbd7ce,.35);fill.position.set(-3,2,4);scene.add(fill);return;}
  scene.add(new THREE.HemisphereLight(0xf7f2ec,0x555365,2.2));
  const key=new THREE.DirectionalLight(0xfff5e5,2.5);key.position.set(-3,5,5);scene.add(key);
  const fill=new THREE.DirectionalLight(0xb4c7ff,.9);fill.position.set(4,2,3);scene.add(fill);
  const face=new THREE.DirectionalLight(0xfff8f2,1.0);face.position.set(0,1.6,4);scene.add(face);
  const rim=new THREE.DirectionalLight(0xffb6aa,1.5);rim.position.set(2,4,-3);scene.add(rim);
}
export function figureRenderer(canvas){
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
  return renderer;
}
export {THREE};
