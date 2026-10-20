import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeckTransition} from '../site/js/turntable-transition.js';
import {createFinishStore} from '../site/js/turntable-finish.js';

function rig(reduced=false){
  let now=0,id=0;const queue=new Map(),values=[];
  const motion=createDeckTransition({draw:v=>values.push(v),clock:()=>now,request:fn=>{queue.set(++id,fn);return id;},cancel:id=>queue.delete(id),reduced:()=>reduced});
  return {motion,values,tick(time){now=time;const batch=[...queue.values()];queue.clear();batch.forEach(fn=>fn(now));}};
}
test('拿起途中放回从当前画面继续，旧承诺取消且最终回到零',async()=>{
  const {motion,tick}=rig(),opening=motion.move(1);tick(430);assert.equal(motion.value,.5);
  const closing=motion.move(0);assert.equal(await opening,false);assert.equal(motion.value,.5);
  tick(600);assert.ok(motion.value>0&&motion.value<.5);tick(900);assert.equal(await closing,true);assert.equal(motion.value,0);
});
test('取放在减少动画时直接完成，卸载不会遗留等待',async()=>{
  const {motion,tick,values}=rig(true),opening=motion.move(1);tick(1);assert.equal(await opening,true);assert.deepEqual(values,[1]);
  const closing=motion.move(0);motion.dispose();assert.equal(await closing,false);
});
test('原始皮肤默认，两台订阅同步，重新创建保留换肤选择',()=>{
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const store=createFinishStore(storage);assert.equal(store.get(),'original');const desktop=[],held=[];
  store.subscribe(v=>desktop.push(v));const unsubscribe=store.subscribe(v=>held.push(v));store.set('eva02');
  assert.deepEqual(desktop,['eva02']);assert.deepEqual(held,['eva02']);assert.equal(createFinishStore(storage).get(),'eva02');
  unsubscribe();store.set('original');assert.deepEqual(held,['eva02']);assert.equal(createFinishStore(storage).get(),'original');
});
