import * as THREE from 'three';
import {ghostWorld} from './world-theme.js';

// Same incoming window ray as Blender: (-.43, -.85, -1.05), with Z-up
// converted to Three's Y-up. Shadows travel left and towards the desk front.
export const WINDOW_LIGHT_SOURCE=Object.freeze(ghostWorld?[6.4/3,3.42/3,-2.9/3]:[.43,1.05,-.85]);

export function createPlantGradient(){
  const gradient=new THREE.DataTexture(new Uint8Array([64,164,255]),3,1,THREE.RedFormat);
  gradient.minFilter=gradient.magFilter=THREE.NearestFilter;
  gradient.generateMipmaps=false;gradient.needsUpdate=true;
  return gradient;
}

// Existing botanical hues remain intact; a raised paint value gives the window
// light room to show three tones instead of multiplying already-black leaves.
export function plantPaintColor(value){
  const color=new THREE.Color(value),hsl={};color.getHSL(hsl,THREE.SRGBColorSpace);
  return color.setHSL(hsl.h,hsl.s,.18+.82*hsl.l,THREE.SRGBColorSpace);
}

export function createPlantLighting(scene,{center=[0,.45,0],scale=1}={}){
  const ambient=new THREE.AmbientLight(ghostWorld?'#c8d5cf':'#f5f0e3',ghostWorld?.6:1.55);
  const windowLight=new THREE.DirectionalLight(ghostWorld?'#fff1db':'#fff7e9',ghostWorld?3.2:2.9);
  windowLight.position.fromArray(center).add(new THREE.Vector3(...(ghostWorld?[6.4/3,3.42/3,-2.9/3]:[.43,1.05,-.85])).multiplyScalar(4));
  windowLight.target.position.fromArray(center);
  windowLight.castShadow=true;windowLight.shadow.mapSize.set(1024,1024);
  const radius=1.25*scale,shadowCamera=windowLight.shadow.camera;
  shadowCamera.left=shadowCamera.bottom=-radius;shadowCamera.right=shadowCamera.top=radius;
  shadowCamera.near=.1;shadowCamera.far=12;
  windowLight.shadow.bias=-.00008;windowLight.shadow.normalBias=.003*scale;
  windowLight.shadow.radius=1;
  scene.add(ambient,windowLight,windowLight.target);
  return {ambient,windowLight,dispose(){windowLight.shadow.dispose();scene.remove(ambient,windowLight,windowLight.target);}};
}

export function createPlantDeskShadow(scene,{surfaceHeight,plantPosition,scale}){
  // Only shadowed fragments have alpha. The receiver's unshadowed area stays
  // completely transparent, so it never paints a black quad over the artwork.
  const receiver=new THREE.Mesh(new THREE.PlaneGeometry(2.95,1.52),new THREE.ShadowMaterial({color:ghostWorld?'#182d27':'#33343c',opacity:ghostWorld?.18:.26,depthWrite:false}));
  receiver.name='plant-window-shadow';receiver.rotation.x=-Math.PI/2;
  receiver.position.set(0,surfaceHeight+.0007,.16);receiver.receiveShadow=true;
  const contact=new THREE.Mesh(new THREE.CircleGeometry(.17,32),new THREE.MeshBasicMaterial({color:ghostWorld?'#14231c':'#202127',transparent:true,opacity:ghostWorld?.38:.23,depthWrite:false}));
  contact.name='plant-contact-shadow';contact.rotation.x=-Math.PI/2;
  contact.scale.setScalar(scale);contact.position.set(plantPosition[0],surfaceHeight+.001,plantPosition[2]);
  scene.add(receiver,contact);
  return {receiver,contact,dispose(){scene.remove(receiver,contact);for(const item of [receiver,contact]){item.geometry.dispose();item.material.dispose();}}};
}
