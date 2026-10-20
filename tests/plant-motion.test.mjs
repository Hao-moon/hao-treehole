import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlantMotion,samplePlantSway,PLANT_FLEX} from '../site/js/plant-motion.js';

function harness(options={}){
  let clock=0,next=0;const frames=new Map(),timers=new Map(),poses=[];
  const motion=createPlantMotion({onPose:p=>poses.push(p),random:()=>.5,now:()=>clock,
    requestFrame:fn=>{const id=++next;frames.set(id,fn);return id;},cancelFrame:id=>frames.delete(id),
    setTimer:(fn,delay)=>{const id=++next;timers.set(id,{fn,time:clock+delay});return id;},clearTimer:id=>timers.delete(id),...options});
  return {motion,frames,timers,poses,
    gust(){const [id,timer]=timers.entries().next().value;timers.delete(id);clock=timer.time;timer.fn();return clock;},
    frame(time){clock=time;const [id,fn]=frames.entries().next().value;frames.delete(id);fn(time);},
  };
}

test('静止时只保留随机等待计时器，阵风结束立即停止动画帧',()=>{
  const h=harness();assert.equal(h.frames.size,0);assert.equal(h.timers.size,1);
  const start=h.gust();assert.equal(h.frames.size,1);assert.equal(h.timers.size,0);
  h.frame(start+700);assert.ok(Math.abs(h.poses.at(-1).z)>0);assert.equal(h.frames.size,1);
  h.frame(start+4000);assert.deepEqual(h.poses.at(-1),{x:0,z:0});assert.equal(h.frames.size,0);assert.equal(h.timers.size,1);
  h.motion.dispose();assert.equal(h.timers.size,0);
});

test('轻碰从当前叶片姿态开始，并在阻尼回摆后完全复位',()=>{
  const h=harness();const start=h.gust();h.frame(start+500);const before={...h.poses.at(-1)};
  assert.equal(h.motion.touch(),true);assert.equal(h.frames.size,1);assert.equal(h.timers.size,0);
  h.frame(start+500);assert.deepEqual(h.poses.at(-1),before,'连续轻碰不能突然跳回静止姿态');
  h.frame(start+650);assert.notDeepEqual(h.poses.at(-1),before);
  h.frame(start+2200);assert.deepEqual(h.poses.at(-1),{x:0,z:0});assert.equal(h.frames.size,0);
  h.motion.dispose();
});

test('减少动画、后台或面板遮挡暂停后，清除所有帧与计时器并复位',()=>{
  const h=harness();h.motion.touch();h.frame(150);assert.notEqual(h.poses.at(-1).z,0);
  h.motion.setEnabled(false);assert.deepEqual(h.poses.at(-1),{x:0,z:0});assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);
  assert.equal(h.motion.touch(),false);
  h.motion.setEnabled(true);assert.equal(h.frames.size,0);assert.equal(h.timers.size,1);
  h.motion.dispose();assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);assert.equal(h.motion.touch(),false);
});

test('四种植物都有轻微阵风，轻碰更明显，运动起止均连续',()=>{
  for(const flex of Object.values(PLANT_FLEX)){
    let gust=0,touch=0;
    for(let elapsed=0;elapsed<=1600;elapsed+=16){
      gust=Math.max(gust,Math.abs(samplePlantSway({kind:'breeze',elapsed,duration:1600,amplitude:.018*flex}).z));
      touch=Math.max(touch,Math.abs(samplePlantSway({kind:'touch',elapsed,duration:1600,amplitude:.105*flex}).z));
    }
    assert.ok(gust>0&&gust<.025);assert.ok(touch>gust*2&&touch<.08);
    for(const kind of ['touch','breeze']){
      assert.deepEqual(samplePlantSway({kind,elapsed:0,duration:1600,amplitude:.1}),{x:0,z:0,done:false});
      assert.deepEqual(samplePlantSway({kind,elapsed:1600,duration:1600,amplitude:.1}),{x:0,z:0,done:true});
    }
  }
});

test('切换植物会清除旧运动，随机等待值不是固定循环',()=>{
  const low=harness({random:()=>0}),high=harness({random:()=>1});
  assert.notEqual([...low.timers.values()][0].time,[...high.timers.values()][0].time);
  low.motion.touch();low.frame(100);low.motion.reset();
  assert.deepEqual(low.poses.at(-1),{x:0,z:0});assert.equal(low.frames.size,0);assert.equal(low.timers.size,1);
  low.motion.dispose();high.motion.dispose();
});
