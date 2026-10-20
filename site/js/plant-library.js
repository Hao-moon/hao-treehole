export const PLANT_SELECTION_KEY='hao-treehole-plant-v1';
export const PLANTS=Object.freeze([
  {id:'crested-aeonium',letter:'A',name:'缀化黑法师',subtitle:'波浪叶冠 · 墨黑与酒红',description:'深色叶片沿弯曲的枝冠层层展开，给窗边留下一小片不规则的风景。',touch:'轻碰叶冠',response:'叶冠轻轻晃动，红色叶缘掠过光线。',motion:.025},
  {id:'agave',letter:'B',name:'龙舌兰',subtitle:'骨白锯齿 · 紧凑的叶冠',description:'灰绿厚叶向上聚拢，骨白锯齿勾出鲜明轮廓，安静地守在桌旁。',touch:'轻碰叶片',response:'厚叶轻轻回摆，花盆安静地留在原位。',motion:.009},
  {id:'bat-flower',letter:'C',name:'黑蝙蝠花',subtitle:'暗色翼形 · 垂落的花须',description:'一高一低的暗色花序舒展开来，细长花须在叶片之间垂落。',touch:'轻碰花茎',response:'花茎微微摇动，花须随之轻摆。',motion:.035},
  {id:'alocasia',letter:'D',name:'面具海芋',subtitle:'盾形深叶 · 骨白叶脉',description:'面具般的盾形叶片，藏着清晰的白色叶脉和暗红叶背。',touch:'轻碰叶片',response:'盾形叶片轻轻晃了晃。',motion:.04},
].map(Object.freeze));
export const DEFAULT_PLANT=PLANTS[0].id;
export function getPlantDefinition(id){return PLANTS.find(p=>p.id===id)||PLANTS[0];}

// One selection feeds both WebGL scenes. Preference failure must not prevent switching.
export function createPlantLibrary({storage,eventTarget}={}){
  if(storage===undefined){try{storage=globalThis.localStorage;}catch{storage=null;}}
  let selected=DEFAULT_PLANT;
  try{selected=getPlantDefinition(storage?.getItem(PLANT_SELECTION_KEY)).id;}catch{}
  const listeners=new Set(),current=()=>getPlantDefinition(selected);
  const emit=info=>listeners.forEach(fn=>fn(current(),info));
  const onStorage=event=>{
    if(event.key!==PLANT_SELECTION_KEY&&event.key!==null)return;
    const next=getPlantDefinition(event.newValue).id;
    if(next!==selected){selected=next;emit({persisted:true,external:true});}
  };
  eventTarget?.addEventListener('storage',onStorage);
  return {
    current,list:()=>PLANTS,
    subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
    select(id){
      if(!PLANTS.some(p=>p.id===id))throw new Error('这株植物没有找到');
      selected=id;let persisted=false;
      try{if(storage){storage.setItem(PLANT_SELECTION_KEY,id);persisted=true;}}catch{}
      const info={persisted,external:false};emit(info);return info;
    },
    dispose(){eventTarget?.removeEventListener('storage',onStorage);listeners.clear();},
  };
}
export const plantLibrary=createPlantLibrary({eventTarget:typeof window==='undefined'?null:window});
