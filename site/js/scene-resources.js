// Immutable room data is shared across worlds; do not repeat JSON parsing or
// the large synchronous hit-map readback on each visit.
const json=new Map();
let hitMap;
export function readSceneJSON(src){
  if(!json.has(src)){
    const task=fetch(src).then(response=>{
      if(!response.ok)throw new Error(`场景资料未能加载：${src}`);
      return response.json();
    });
    json.set(src,task);task.catch(()=>json.delete(src));
  }
  return json.get(src);
}
export function readHitMap(){
  if(!hitMap){
    hitMap=new Promise((resolve,reject)=>{
      const image=new Image();image.onerror=()=>reject(new Error('场景热点未能加载'));
      image.onload=()=>{
        try{
          const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
          const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
          resolve({image,width:image.width,height:image.height,pixels:context.getImageData(0,0,image.width,image.height).data});
        }catch(error){reject(error);}
      };
      image.src='/assets/scene/hot-base.png';
    });
    hitMap.catch(()=>{hitMap=null;});
  }
  return hitMap;
}
