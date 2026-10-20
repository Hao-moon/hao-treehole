import * as THREE from 'three';

let configuration;
export async function applyDesktopWindowLight(root){
  const config=await (configuration||=fetch('/assets/scene/scene-interactions.json').then(response=>response.json()));
  const light=config.windowBeam;if(!light||light.volume!==false)return;
  const vector=([x,y,z])=>new THREE.Vector3(x,z,-y),source=vector(light.sourceWorldBlender),target=vector(light.targetWorldBlender);
  const axis=target.clone().sub(source),distance=axis.length();axis.normalize();
  const u=axis.clone().cross(new THREE.Vector3(0,1,0)).normalize(),v=axis.clone().cross(u).normalize();
  root.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.material?.isMeshBasicMaterial)return;
    mesh.material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,{windowSource:{value:source},windowAxis:{value:axis},windowU:{value:u},windowV:{value:v},windowDistance:{value:distance},windowHalfSize:{value:new THREE.Vector2(light.surfaceHalfWidth,light.surfaceHalfHeight)}});
      shader.vertexShader='varying vec3 vWindowPosition;\nvarying vec3 vWindowNormal;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWindowPosition = (modelMatrix * vec4(position, 1.0)).xyz;\nvWindowNormal = normalize(mat3(modelMatrix) * normal);');
      shader.fragmentShader='varying vec3 vWindowPosition;\nvarying vec3 vWindowNormal;\nuniform vec3 windowSource, windowAxis, windowU, windowV;\nuniform float windowDistance;\nuniform vec2 windowHalfSize;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        vec3 windowDelta = vWindowPosition - windowSource;
        float windowTravel = dot(windowDelta, windowAxis);
        vec2 windowSize = windowHalfSize * max(windowTravel / windowDistance, 0.01);
        float windowLit = step(abs(dot(windowDelta, windowU)), windowSize.x) * step(abs(dot(windowDelta, windowV)), windowSize.y) * step(0.0, windowTravel);
        windowLit *= step(0.08, dot(normalize(vWindowNormal), normalize(-windowDelta)));
        outgoingLight *= mix(0.57, 1.0, windowLit);
        #include <opaque_fragment>
      `);
    };
    mesh.material.customProgramCacheKey=()=> 'desktop-window-surface-v1';
    mesh.material.needsUpdate=true;
  });
}
