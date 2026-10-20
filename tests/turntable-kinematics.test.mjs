import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tonearmAngle,sliderPosition} from '../site/js/turntable-kinematics.js';

const bytes=readFileSync(new URL('../site/assets/turntable/hao-turntable.glb',import.meta.url));
const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
const node=name=>gltf.nodes.find(item=>item.name===name);
const pivot=node('tonearm').translation,needle=node('DJ_绯红唱针').translation,disc=node('platter').translation;
const radius=name=>gltf.accessors[gltf.meshes[node(name).mesh].primitives[0].attributes.POSITION].max[0];
const current={id:'test-song'};
function needleRadius(angle){
  const x=pivot[0]+needle[0]*Math.cos(angle)+needle[2]*Math.sin(angle)-disc[0];
  const z=pivot[2]-needle[0]*Math.sin(angle)+needle[2]*Math.cos(angle)-disc[2];
  return Math.hypot(x,z);
}

test('实际 GLB 唱针从外圈单调走到内圈，全程留在唱片沟槽区域',()=>{
  let previous=Infinity;
  for(let time=0;time<=100;time++){
    const distance=needleRadius(tonearmAngle({current,duration:100,time,playing:true}));
    assert.ok(distance<previous,'歌曲前进时唱针必须向内移动');
    assert.ok(distance<radius('DJ_黑胶唱片'),'唱针不能越出唱片');
    assert.ok(distance>radius('DJ_绯红唱片标'),'唱针不能进入中心标签');
    previous=distance;
  }
  assert.ok(Math.abs(needleRadius(tonearmAngle({current,duration:100,time:0}))-.132)<.00001);
  assert.ok(Math.abs(needleRadius(tonearmAngle({current,duration:100,time:100}))-.060)<.00001);
});

test('暂停保留歌曲对应唱针位置；没有歌曲才回到停放位置',()=>{
  for(const time of [0,12,50,100]){
    const state={current,duration:100,time};
    assert.equal(tonearmAngle({...state,playing:false}),tonearmAngle({...state,playing:true}));
  }
  assert.equal(tonearmAngle({current:null,duration:100,time:50,playing:true}),0);
  assert.equal(tonearmAngle(),0);
});

test('越界进度限制在唱片两端，未知或无效时间不产生无穷或 NaN',()=>{
  const start=tonearmAngle({current,duration:100,time:0}),end=tonearmAngle({current,duration:100,time:100});
  assert.equal(tonearmAngle({current,duration:100,time:-30}),start);
  assert.equal(tonearmAngle({current,duration:100,time:200}),end);
  for(const duration of [0,-1,NaN,Infinity,-Infinity,undefined,null]){
    assert.equal(tonearmAngle({current,duration,time:50}),start);
  }
  for(const time of [NaN,Infinity,-Infinity,undefined,null]){
    assert.equal(tonearmAngle({current,duration:100,time}),start);
  }
});

test('音量帽从滑轨前端行进至后端，永不越出实际滑轨',()=>{
  const rail=node('DJ_推子滑轨'),position=gltf.accessors[gltf.meshes[rail.mesh].primitives[0].attributes.POSITION];
  const front=rail.translation[2]+position.max[2],back=rail.translation[2]+position.min[2];
  assert.ok(Math.abs(sliderPosition(0)-front)<1e-7);
  assert.ok(Math.abs(sliderPosition(1)-back)<1e-7);
  assert.ok(Math.abs(sliderPosition(.5)-rail.translation[2])<1e-7);
  assert.equal(sliderPosition(-10),sliderPosition(0));
  assert.equal(sliderPosition(10),sliderPosition(1));
  for(const volume of [NaN,Infinity,-Infinity,undefined])assert.equal(sliderPosition(volume),sliderPosition(1));
});
