import test from 'node:test';
import assert from 'node:assert/strict';

const preference={matches:false};
globalThis.matchMedia=()=>preference;
globalThis.innerWidth=1280;globalThis.innerHeight=720;
globalThis.getComputedStyle=()=>({transform:'matrix(1,0,0,1,0,0)',opacity:'1'});
const {createCardMotion}=await import('../site/js/card-motion.js');

function surface(){
  const running=[];
  const element={dataset:{},querySelector:()=>element,animate(){
    let finish,reject;
    const finished=new Promise((resolve,fail)=>{finish=resolve;reject=fail;});
    // This mock eagerly creates promises for child animations; consume their cancellation.
    finished.catch(()=>{});
    const animation={finished,finish,cancel:()=>reject(new Error('cancelled'))};
    running.push(animation);return animation;
  }};
  return {element,running};
}

test('翻入中按返回：进入任务退出，关闭任务能完成',async()=>{
  const {element,running}=surface(),motion=createCardMotion(element);
  const opening=motion.enter({x:900,y:500});
  const closing=motion.leave({x:900,y:500});
  assert.equal(await opening,false);
  running.at(-1).finish();
  assert.equal(await closing,true);
  assert.equal(element.dataset.phase,'closed');
  motion.clear();
});

test('收回中前进：旧关闭不会关闭重新打开的卡片',async()=>{
  const {element,running}=surface(),motion=createCardMotion(element);
  const first=motion.enter();running[0].finish();await first;
  const closing=motion.leave();
  const start=running.length,reopened=motion.enter();
  assert.equal(await closing,false);
  running[start].finish();
  assert.equal(await reopened,true);
  assert.equal(element.dataset.phase,'open');
});

test('减少动态效果：不创建翻转动画，也不阻塞打开或关闭',async()=>{
  preference.matches=true;
  try{
    const {element,running}=surface(),motion=createCardMotion(element);
    assert.equal(await motion.enter(),true);
    assert.equal(element.dataset.phase,'open');
    assert.equal(await motion.leave(),true);
    assert.equal(element.dataset.phase,'closed');
    assert.equal(running.length,0);
  }finally{preference.matches=false;}
});

test('开书过程中返回，再次打开能正常完成',async()=>{
  const {element,running}=surface();element.dataset.section='books';const motion=createCardMotion(element);
  const opening=motion.enter({x:1000,y:600});
  const closing=motion.leave();assert.equal(await opening,false);
  const start=running.length,reopen=motion.enter();assert.equal(await closing,false);
  running[start].finish();assert.equal(await reopen,true);assert.equal(element.dataset.phase,'open');
  motion.clear();
});

test('实体书拿起过程中返回：取消拿起，等书放回才关闭阅读层',async()=>{
  const {element,running}=surface();element.dataset.section='books';const motion=createCardMotion(element);
  let resolveOpen,resolveClose,resets=0;
  const book={open:()=>new Promise(r=>resolveOpen=r),close:()=>{resolveOpen(false);return new Promise(r=>resolveClose=r);},reset:()=>resets++};
  const opened=motion.enter({x:1000,y:600},book);
  assert.equal(element.dataset.phase,'opening');assert.equal(running.length,0);
  const closed=motion.leave();assert.equal(await opened,false);assert.equal(element.dataset.phase,'closing');
  resolveClose(true);assert.equal(await closed,true);assert.equal(element.dataset.phase,'closed');
  motion.clear();assert.equal(resets,1);
});

test('实体书打开期间切换到其他物件：书回桌面，旧打开任务不能改变新卡片',async()=>{
  const {element,running}=surface();element.dataset.section='books';const motion=createCardMotion(element);
  let finish,resets=0;const book={open:()=>new Promise(r=>finish=r),reset:()=>{resets++;finish(false);}};
  const opening=motion.enter(null,book);element.dataset.section='music';const other=motion.enter();
  assert.equal(await opening,false);assert.equal(resets,1);running[0].finish();assert.equal(await other,true);
});

test('唱机取放由实体运动驱动：不叠加整页缩放，放回完成后才关闭',async()=>{
  const {element,running}=surface();element.dataset.section='music';const motion=createCardMotion(element);
  let finishOpen,finishClose,resets=0;
  const deck={open:()=>new Promise(resolve=>finishOpen=resolve),close:()=>new Promise(resolve=>finishClose=resolve),reset:()=>resets++};
  const opening=motion.enter(null,null,deck);
  assert.equal(running.length,0);assert.equal(element.dataset.phase,'opening');
  finishOpen(true);assert.equal(await opening,true);
  const closing=motion.leave();assert.equal(element.dataset.phase,'closing');assert.equal(running.length,0);
  finishClose(true);assert.equal(await closing,true);assert.equal(element.dataset.phase,'closed');
  motion.clear();assert.equal(resets,1);
});

test('唱机拿起未完成即清理：迟到的成功结果不能重新打开弹层',async()=>{
  const {element}=surface();element.dataset.section='music';const motion=createCardMotion(element);
  let finishOpen,resets=0;
  const deck={open:()=>new Promise(resolve=>finishOpen=resolve),reset:()=>resets++};
  const opening=motion.enter(null,null,deck);motion.clear();
  finishOpen(true);assert.equal(await opening,false);assert.equal(resets,1);assert.equal(element.dataset.phase,'closed');
});

test('唱机放回中重新拿起：旧放回完成不能关闭新视图',async()=>{
  const {element,running}=surface();element.dataset.section='music';const motion=createCardMotion(element);
  let finishClose;
  const deck={open:async()=>true,close:()=>new Promise(resolve=>finishClose=resolve),reset(){}};
  await motion.enter(null,null,deck);const closing=motion.leave();
  assert.equal(await motion.enter(null,null,deck),true);
  finishClose(true);assert.equal(await closing,false);assert.equal(element.dataset.phase,'open');assert.equal(running.length,0);
});

test('实体书和唱机互相切换：先归还旧物件，清理时归还当前物件',async()=>{
  const {element,running}=surface();const motion=createCardMotion(element);let bookResets=0,deckResets=0;
  const book={open:async()=>true,reset:()=>bookResets++},deck={open:async()=>true,reset:()=>deckResets++};
  element.dataset.section='books';await motion.enter(null,book);
  element.dataset.section='music';await motion.enter(null,book,deck);assert.equal(bookResets,1);
  element.dataset.section='books';await motion.enter(null,book,deck);assert.equal(deckResets,1);
  motion.clear();assert.equal(bookResets,2);assert.equal(running.length,0);assert.equal(element.dataset.phase,'closed');
});
