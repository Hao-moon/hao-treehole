import * as THREE from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {ghostWorld,worldAssetRoot} from './world-theme.js';

let radiance;
// The probe is rendered from this exact room, not a stock studio environment.
// PMREM is Three's roughness-aware environment convolution; no screen filter.
export function attachUrbanEnvironment(scene,renderer,onReady=()=>{},intensity=.7){
  if(!ghostWorld)return {dispose(){}};
  let disposed=false,target=null;
  radiance||=new HDRLoader().loadAsync(worldAssetRoot+'room-environment.hdr');
  radiance.then(texture=>{
    if(disposed)return;
    texture.mapping=THREE.EquirectangularReflectionMapping;
    const generator=new THREE.PMREMGenerator(renderer);
    target=generator.fromEquirectangular(texture);generator.dispose();
    scene.environment=target.texture;scene.environmentIntensity=intensity;
    onReady();
  }).catch(error=>console.warn('Room reflections unavailable; direct lighting retained.',error));
  return {dispose(){disposed=true;if(target){scene.environment=null;target.dispose();}}};
}

export function addUrbanDesktopLight(scene,renderer){
  if(!ghostWorld)return {dispose(){}};
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  const ambient=new THREE.HemisphereLight('#c8d5cf','#454c43',.45);
  const sun=new THREE.DirectionalLight('#fff1db',3.8);
  sun.position.set(5.4,4.2,-2.7);sun.target.position.set(-1,.78,.2);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.radius=2;
  Object.assign(sun.shadow.camera,{left:-2.7,right:2.7,top:2.7,bottom:-2.7,near:.1,far:16});
  sun.shadow.normalBias=.0005;sun.shadow.bias=-.00005;
  scene.add(ambient,sun,sun.target);
  // Invisible shadow casters reproduce the frozen Blender window aperture.
  // Color and depth writes are disabled in the beauty pass, not in shadow maps.
  const blockers=new THREE.Group(),material=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false});
  const box=(size,position)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(size[0],size[2],size[1]),material);mesh.position.set(position[0],position[2],-position[1]);mesh.castShadow=true;blockers.add(mesh);};
  box([4,.16,4],[-1.25,.77,1.8]);box([6,.16,4],[5.15,.77,1.8]);box([1.65,.16,.52],[1.42,.77,.2]);
  for(const x of [.62,1.39,2.15])box([.052,.085,2.85],[x,.69,1.77]);
  for(const z of [.35,1.26,2.18,3.1])box([1.59,.085,.052],[1.385,.69,z]);
  scene.add(blockers);
  return {dispose(){scene.remove(ambient,sun,sun.target,blockers);sun.shadow.dispose();blockers.traverse(mesh=>mesh.geometry?.dispose());material.dispose();}};
}
