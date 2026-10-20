import test from 'node:test';
import assert from 'node:assert/strict';
import {createWindowFlicker,WINDOW_PULSE_MS,WINDOW_QUIET_MS,WINDOW_FIRST_MS,WINDOW_STAGGER_MS} from '../site/js/window-flicker.js';

function clock(){let id=0,now=0;const tasks=new Map();return {tasks,get now(){return now;},setTimeout(fn,delay){tasks.set(++id,{fn,delay,at:now+delay});return id;},clearTimeout(key){tasks.delete(key);},next(){const [key,value]=[...tasks].sort((a,b)=>a[1].at-b[1].at)[0];tasks.delete(key);now=value.at;value.fn();return value.delay;}};}
test('city windows flash in staggered groups of 4–6 with overlap and a short rest',()=>{
  const scheduler=clock(),visible=new Set(),seen=[];
  const fx=createWindowFlicker({count:12,random:()=>.5,scheduler,show:i=>{visible.add(i);seen.push({i,at:scheduler.now});},clear:i=>visible.delete(i)});
  assert.equal(scheduler.tasks.size,0);fx.setActive(true);
  const wait=scheduler.next();assert.ok(wait>=WINDOW_FIRST_MS[0]&&wait<=WINDOW_FIRST_MS[1]);
  for(let n=1;n<5;n++)scheduler.next();
  assert.equal(visible.size,5);assert.equal(new Set(seen.map(item=>item.i)).size,5);
  for(let n=1;n<5;n++){const gap=seen[n].at-seen[n-1].at;assert.ok(gap>=WINDOW_STAGGER_MS[0]&&gap<=WINDOW_STAGGER_MS[1]);}
  for(let n=0;n<5;n++)assert.equal(scheduler.next(),WINDOW_PULSE_MS);
  assert.equal(visible.size,0);const pause=scheduler.next();assert.ok(pause>=WINDOW_QUIET_MS[0]&&pause<=WINDOW_QUIET_MS[1]);
  assert.ok(!seen.slice(0,5).some(item=>item.i===seen[5].i));fx.dispose();assert.equal(scheduler.tasks.size,0);
});
test('pausing or disposing clears the pulse, and stale callbacks cannot restart it',()=>{
  const scheduler=clock(),seen=[],cleared=[];const fx=createWindowFlicker({count:2,random:()=>0,scheduler,show:i=>seen.push(i),clear:i=>cleared.push(i)});
  fx.setActive(true);const pending=[...scheduler.tasks.values()][0].fn;fx.setActive(false);pending();assert.equal(seen.length,0);assert.equal(scheduler.tasks.size,0);
  fx.setActive(true);scheduler.next();assert.deepEqual(seen,[0]);fx.setActive(false);assert.deepEqual(cleared,[0]);assert.equal(scheduler.tasks.size,0);
  fx.setActive(true);fx.dispose();fx.setActive(true);assert.equal(scheduler.tasks.size,0);
});
test('all six live windows and pending callbacks are released when paused',()=>{
  const scheduler=clock(),visible=new Set();const fx=createWindowFlicker({count:80,random:()=>.999,scheduler,show:i=>visible.add(i),clear:i=>visible.delete(i)});
  fx.setActive(true);for(let n=0;n<6;n++)scheduler.next();assert.equal(visible.size,6);
  const stale=[...scheduler.tasks.values()].map(item=>item.fn);fx.setActive(false);assert.equal(visible.size,0);assert.equal(scheduler.tasks.size,0);
  stale.forEach(fn=>fn());assert.equal(visible.size,0);assert.equal(scheduler.tasks.size,0);fx.dispose();
});
test('no windows means no scheduled work; one window remains a bounded single pulse',()=>{
  const scheduler=clock();createWindowFlicker({count:0,scheduler}).setActive(true);assert.equal(scheduler.tasks.size,0);
  const seen=[];const fx=createWindowFlicker({count:1,scheduler,random:()=>1,show:i=>seen.push(i)});fx.setActive(true);scheduler.next();scheduler.next();scheduler.next();assert.deepEqual(seen,[0,0]);fx.dispose();
});
