import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceDisc,createDiscMotion} from '../site/js/disc-motion.js';

test('电机按真实时间积分：30 帧与 120 帧播放相位一致',()=>{
  function run(fps){let state={angle:0,speed:0};for(let i=0;i<fps*4;i++)state=advanceDisc(state,1/fps,true);return state;}
  const slow=run(30),fast=run(120);
  assert.ok(Math.abs(slow.angle-fast.angle)<1e-10);assert.ok(Math.abs(slow.speed-fast.speed)<1e-10);
});

test('暂停惯性收停后保持角度；恢复从同一角度起转',()=>{
  let state=advanceDisc({angle:0,speed:0},1,true);const playingSpeed=state.speed;
  state=advanceDisc(state,.15,false);assert.ok(state.speed>0&&state.speed<playingSpeed);
  state=advanceDisc(state,4,false);assert.equal(state.speed,0);const stopped=state.angle;
  state=advanceDisc(state,10,false);assert.equal(state.angle,stopped);
  state=advanceDisc(state,.1,true);assert.ok(state.speed>0);assert.notEqual(state.angle,0);
});

test('放回时对齐唱片角度，不改变播放状态和电机速度',()=>{
  let now=0;const events=new EventTarget();events.hidden=false;
  const motor=createDiscMotion({clock:()=>now,request:()=>1,cancel:()=>{},events});
  motor.setRunning(true);now=1000;motor.setRunning(true);const speed=motor.snapshot().speed;
  motor.alignAngle(Math.PI*4+.7);assert.ok(Math.abs(motor.snapshot().angle-.7)<1e-10);
  assert.equal(motor.snapshot().speed,speed);assert.equal(motor.snapshot().running,true);
  motor.alignAngle(NaN);assert.ok(Number.isFinite(motor.snapshot().angle));motor.dispose();
});

test('关闭详情订阅不停止共享电机，重新打开收到桌面相同的相位',()=>{
  let now=0,id=0;const frames=new Map(),events=new EventTarget();events.hidden=false;
  const motor=createDiscMotion({clock:()=>now,request:fn=>{frames.set(++id,fn);return id;},cancel:id=>frames.delete(id),events});
  let desk,detail;motor.subscribe(state=>desk=state);
  const close= motor.subscribe(state=>detail=state);motor.setRunning(true);
  function step(ms){now+=ms;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));}
  step(250);assert.equal(desk.angle,detail.angle);close();const closedAngle=detail.angle;
  step(800);assert.notEqual(desk.angle,closedAngle);assert.equal(desk.running,true);
  const reopen=motor.subscribe(state=>detail=state);assert.equal(detail.angle,desk.angle);
  motor.setRunning(false);step(4000);assert.equal(motor.snapshot().speed,0);assert.equal(frames.size,0);
  reopen();motor.dispose();
});

test('后台页面停止逐帧绘制，回到前台按经过时间恢复相位',()=>{
  let now=0,id=0;const frames=new Map(),events=new EventTarget();events.hidden=false;
  const motor=createDiscMotion({clock:()=>now,request:fn=>{frames.set(++id,fn);return id;},cancel:id=>frames.delete(id),events});
  motor.setRunning(true);events.hidden=true;events.dispatchEvent(new Event('visibilitychange'));assert.equal(frames.size,0);
  now=12000;events.hidden=false;events.dispatchEvent(new Event('visibilitychange'));
  assert.ok(motor.snapshot().angle>0);assert.equal(frames.size,1);motor.dispose();assert.equal(frames.size,0);
});
test('减少动态效果保留真实播放状态与角度，切换设置后从原处恢复',()=>{
  let now=0,id=0;const frames=new Map(),events=new EventTarget(),motion=new EventTarget();events.hidden=false;motion.matches=true;
  const motor=createDiscMotion({clock:()=>now,request:fn=>{frames.set(++id,fn);return id;},cancel:id=>frames.delete(id),events,motion});
  motor.setRunning(true);now=5000;
  assert.equal(motor.snapshot().running,true);assert.equal(motor.snapshot().angle,0);assert.equal(frames.size,0);
  motion.matches=false;motion.dispatchEvent(new Event('change'));assert.equal(frames.size,1);
  now+=400;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));
  assert.ok(motor.snapshot().angle>0);const angle=motor.snapshot().angle;
  motion.matches=true;motion.dispatchEvent(new Event('change'));now+=5000;
  motor.setRunning(false);assert.equal(motor.snapshot().angle,angle);assert.equal(frames.size,0);motor.dispose();
});
