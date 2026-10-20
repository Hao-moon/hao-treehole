import {mkdir,copyFile} from 'node:fs/promises';
const files={
  'build/three.module.js':'three.module.js',
  'build/three.core.js':'three.core.js',
  'examples/jsm/loaders/GLTFLoader.js':'addons/loaders/GLTFLoader.js',
  'examples/jsm/controls/OrbitControls.js':'addons/controls/OrbitControls.js',
  'examples/jsm/utils/BufferGeometryUtils.js':'addons/utils/BufferGeometryUtils.js',
  'examples/jsm/utils/SkeletonUtils.js':'addons/utils/SkeletonUtils.js',
  'LICENSE':'LICENSE'
};
for(const [source,target] of Object.entries(files)){
  const destination=new URL('../site/vendor/three/'+target,import.meta.url);
  await mkdir(new URL('.',destination),{recursive:true});
  await copyFile(new URL('../node_modules/three/'+source,import.meta.url),destination);
}
console.log('Three.js 与加载器已复制到站点本地目录。');
