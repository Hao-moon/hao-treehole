import test from 'node:test';
import assert from 'node:assert/strict';
import {clampView,viewScale,zoomAt,screenToImage,imageToScreen,hotIndexAt,viewForBBox} from '../site/js/geometry.js';
import {validateImport,mergeContent,initialContent} from '../site/js/storage.js';

test('任意视口和缩放范围内，画面边缘不露出空白',()=>{
  const img={w:2560,h:1440};
  for(const vp of [{w:1440,h:900},{w:390,h:844},{w:2560,h:1080}])for(const zoom of [-10,1,1.7,5,100,NaN])for(const cx of [-10000,1280,10000]){
    const v=clampView({cx,cy:10000,zoom},vp,img),s=viewScale(v,vp,img);
    assert.ok(v.zoom>=1&&v.zoom<=5);assert.ok(v.cx-vp.w/(2*s)>=-1e-6);assert.ok(v.cx+vp.w/(2*s)<=img.w+1e-6);assert.ok(v.cy-vp.h/(2*s)>=-1e-6);assert.ok(v.cy+vp.h/(2*s)<=img.h+1e-6);
  }
});
test('指针锚定缩放与坐标逆运算保持物件位置',()=>{
  const vp={w:1440,h:810},img={w:2560,h:1440},v={cx:1280,cy:720,zoom:2},pt={x:540,y:480};
  const before=screenToImage(pt,v,vp,img),after=screenToImage(pt,zoomAt(v,1.2,pt,vp,img),vp,img);
  assert.ok(Math.abs(before.x-after.x)<1e-8&&Math.abs(before.y-after.y)<1e-8);
  const round=imageToScreen(before,v,vp,img);assert.ok(Math.abs(round.x-pt.x)<1e-8&&Math.abs(round.y-pt.y)<1e-8);
  assert.ok(Number.isFinite(viewForBBox([0,0,0,0],vp,img).zoom));
});
test('热点不会读取图片边界外的其他物件',()=>{
  const data=new Uint8ClampedArray([0,0,0,255,40,40,40,255]);
  assert.equal(hotIndexAt(data,2,1,1,0),5);assert.equal(hotIndexAt(data,2,1,-1,0),0);assert.equal(hotIndexAt(data,2,1,2,0),0);
});
test('文字备份拒绝损坏数据，合并不删除原有收藏',()=>{
  assert.throws(()=>validateImport({version:1,books:[{}],notes:[]}));
  assert.throws(()=>validateImport({version:1,books:[],notes:[{id:'x',text:'abc',created:'invalid'}]}));
  const base=initialContent();const incoming=validateImport({version:1,books:[{id:'next',title:'新书',status:'在读',note:'<script>这是文字</script>'}],notes:[{id:'note',text:'一段记录',created:'2026-10-19T00:00:00Z'}]});
  const merged=mergeContent(base,incoming);assert.equal(merged.books.length,2);assert.equal(merged.books[0].title,'我们生活在南京');assert.equal(merged.notes.length,1);assert.equal(mergeContent(merged,incoming).books.length,2);
});

test('旧备份升级不丢游戏，游戏备份校验状态并去重合并',()=>{
  const legacy=validateImport({version:1,books:[],notes:[]});assert.deepEqual(legacy.games,[]);
  const game={id:'save1',title:'测试游戏',status:'已通关',note:'一段感想'};
  const current={...initialContent(),games:[game]};
  assert.deepEqual(mergeContent(current,legacy).games,[game]);
  const restored=validateImport(JSON.parse(JSON.stringify(current)));
  assert.deepEqual(restored.games,[game]);
  assert.equal(mergeContent(current,restored).games.length,1);
  assert.throws(()=>validateImport({...current,games:[{...game,status:'坏状态'}]}));
  assert.throws(()=>validateImport({...current,games:[game,game]}));
});
