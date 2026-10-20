const KEY='hao-turntable-skin-v1';
const valid=value=>value==='eva02'?'eva02':'original';
export function createFinishStore(storage){
  let current='original';try{current=valid(storage?.getItem(KEY));}catch{}
  const listeners=new Set();
  return {
    get:()=>current,
    set(value){const next=valid(value);if(next===current)return current;current=next;try{storage?.setItem(KEY,current);}catch{}listeners.forEach(listener=>listener(current));return current;},
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}
  };
}
let storage;try{storage=globalThis.localStorage;}catch{}
const finish=createFinishStore(storage);
export const getTurntableSkin=finish.get;
export const setTurntableSkin=finish.set;
export const subscribeTurntableSkin=finish.subscribe;
