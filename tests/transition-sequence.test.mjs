import test from 'node:test';
import assert from 'node:assert/strict';
import {runTransition,afterPaint,animationDone} from '../site/js/transition-sequence.js';

test('a slow room cannot start or stall the visible reveal halfway through',async()=>{
  const events=[];let ready;
  const loading=new Promise(resolve=>{ready=resolve;});
  const task=runTransition({intro:()=>events.push('intro'),prepare:async()=>{events.push('preparing');await loading;events.push('ready');},reveal:()=>events.push('reveal'),finish:()=>events.push('finish')});
  await Promise.resolve();await Promise.resolve();
  assert.deepEqual(events,['intro','preparing']);
  ready();await task;
  assert.deepEqual(events,['intro','preparing','ready','reveal','finish']);
});

test('Escape waits for preparation and resumes the room without a reveal',async()=>{
  const events=[];let skip=false;
  await runTransition({intro:()=>{},prepare:async()=>{skip=true;events.push('ready');},skip:()=>skip,reveal:()=>events.push('reveal'),finish:()=>events.push('resume')});
  assert.deepEqual(events,['ready','resume']);
});

test('failed preparation still releases the transition overlay exactly once',async()=>{
  let finished=0,revealed=false;
  await assert.rejects(runTransition({intro:()=>{},prepare:()=>{throw new Error('room unavailable');},reveal:()=>{revealed=true;},finish:()=>finished++}),/room unavailable/);
  assert.equal(finished,1);assert.equal(revealed,false);
});

test('a throttled frame callback cannot keep the transition waiting',async()=>{
  let cancelled;
  await afterPaint({requestFrame:()=>42,cancelFrame:id=>{cancelled=id;},limit:5});
  assert.equal(cancelled,42);
});

test('a throttled animation completion still permits cleanup',async()=>{
  const neverFinished={finished:new Promise(()=>{})};
  await animationDone(neverFinished,5);
  await animationDone({finished:Promise.reject(new Error('cancelled'))},100);
});
