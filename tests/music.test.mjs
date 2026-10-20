import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundMusic } from '../site/js/background-music.js';
import { createPlayer } from '../site/js/player.js';

class AudioMock extends EventTarget {
  paused=true; ended=false; currentTime=0; duration=120; volume=1; src=''; calls=0; fail=null; pendingPlay=null;
  play(){
    this.calls++;
    if(this.fail)return Promise.reject(new DOMException('blocked',this.fail));
    if(this.pendingPlay)return this.pendingPlay;
    this.paused=false;this.ended=false;this.dispatchEvent(new Event('play'));this.dispatchEvent(new Event('playing'));return Promise.resolve();
  }
  pause(){if(!this.paused){this.paused=true;this.dispatchEvent(new Event('pause'));}}
  removeAttribute(key){this[key]='';}
  getAttribute(key){return this[key];}
  load(){}
}
const source={src:'/assets/audio/instrumental.mp3',title:'Instrumental',volume:0.28};
const builtin={id:'vocal',src:'/assets/audio/vocal.mp3',title:'Vocal'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};};
const noStorage={listAudio:async()=>[],saveAudio:async()=>{},deleteAudio:async()=>{}};

test('BGM 缓冲时唱盘停止，playing 恢复；关闭后迟到的事件不能假报播放',async()=>{
  const audio=new AudioMock(),bgm=createBackgroundMusic(audio,{storage:memory(),events:new EventTarget()});
  await bgm.init(source);assert.equal(bgm.snapshot().playing,true);
  audio.dispatchEvent(new Event('waiting'));assert.equal(bgm.snapshot().buffering,true);assert.equal(bgm.snapshot().playing,false);
  audio.dispatchEvent(new Event('playing'));assert.equal(bgm.snapshot().playing,true);
  await bgm.toggle();audio.dispatchEvent(new Event('playing'));assert.equal(bgm.snapshot().playing,false);bgm.dispose();
});

test('背景和唱片的 play 请求未完成时不提前驱动唱盘',async()=>{
  for(const kind of ['background','record']){
    const audio=new AudioMock();let settle;audio.pendingPlay=new Promise(resolve=>settle=resolve);
    const controller=kind==='background'?createBackgroundMusic(audio,{storage:memory(),events:new EventTarget()}):createPlayer(audio,()=>{},()=>{},noStorage);
    if(kind==='record')await controller.init([builtin]);
    const attempt=kind==='background'?controller.init(source):controller.play();
    audio.paused=false;audio.dispatchEvent(new Event('play'));
    assert.equal(controller.snapshot().pending,true);assert.equal(controller.snapshot().playing,false);
    audio.dispatchEvent(new Event('playing'));settle();await attempt;
    assert.equal(controller.snapshot().playing,true);controller.dispose();
  }
});

test('关闭音乐视图只取消订阅，实际歌曲持续；重开恢复当前进度',async()=>{
  const audio=new AudioMock(),player=createPlayer(audio,()=>{},()=>{},noStorage);await player.init([builtin]);
  let state;const close=player.subscribe(value=>state=value);await player.play();audio.currentTime=24;
  audio.dispatchEvent(new Event('timeupdate'));assert.equal(state.time,24);close();assert.equal(audio.paused,false);
  audio.currentTime=38;player.subscribe(value=>state=value);assert.equal(state.time,38);assert.equal(state.playing,true);
  player.dispose();
});

test('音频缓冲和播放失败不能驱动转盘，恢复 playing 才继续',async()=>{
  const audio=new AudioMock(),player=createPlayer(audio,()=>{},()=>{},noStorage);await player.init([builtin]);await player.play();
  audio.dispatchEvent(new Event('waiting'));assert.equal(player.snapshot().playing,false);assert.equal(player.snapshot().buffering,true);
  audio.dispatchEvent(new Event('playing'));assert.equal(player.snapshot().playing,true);assert.equal(player.snapshot().buffering,false);
  player.pause();audio.fail='NotAllowedError';await player.play();assert.equal(player.snapshot().playing,false);assert.equal(player.snapshot().pending,false);player.dispose();
});

test('BGM 在允许时自动循环，手动关闭后再次访问仍保持关闭',async()=>{
  const audio=new AudioMock(),storage=memory(),events=new EventTarget();
  const bgm=createBackgroundMusic(audio,{storage,events});
  await bgm.init(source);assert.equal(audio.calls,1);assert.equal(audio.loop,true);assert.equal(audio.volume,0.28);
  await bgm.toggle();assert.equal(audio.paused,true);
  events.dispatchEvent(new Event('pointerup'));await tick();assert.equal(audio.calls,1);
  const reopenedAudio=new AudioMock(),reopened=createBackgroundMusic(reopenedAudio,{storage,events:new EventTarget()});
  await reopened.init(source);assert.equal(reopenedAudio.calls,0);assert.equal(reopened.snapshot().enabled,false);
  bgm.dispose();reopened.dispose();
});

test('自动播放受限时不假报播放，第一次页面操作可恢复',async()=>{
  const audio=new AudioMock(),events=new EventTarget(),messages=[];audio.fail='NotAllowedError';
  const bgm=createBackgroundMusic(audio,{storage:memory(),events,notify:m=>messages.push(m)});
  await bgm.init(source);assert.equal(bgm.snapshot().blocked,true);assert.equal(bgm.snapshot().playing,false);assert.deepEqual(messages,[]);
  audio.fail=null;events.dispatchEvent(new Event('pointerup'));await tick();
  assert.equal(bgm.snapshot().playing,true);assert.equal(bgm.snapshot().blocked,false);assert.equal(audio.calls,2);
  events.dispatchEvent(new Event('pointerup'));assert.equal(audio.calls,2);bgm.dispose();
});

test('直接点击 BGM 开启被拦截的音乐，不会误把偏好关闭',async()=>{
  const audio=new AudioMock();audio.fail='NotAllowedError';
  const bgm=createBackgroundMusic(audio,{storage:memory(),events:new EventTarget()});await bgm.init(source);
  audio.fail=null;await bgm.toggle();assert.equal(bgm.snapshot().enabled,true);assert.equal(bgm.snapshot().playing,true);bgm.dispose();
});

test('没有真实音源时不发起播放，也不创建假曲目',async()=>{
  const audio=new AudioMock(),bgm=createBackgroundMusic(audio,{storage:memory(),events:new EventTarget()});
  await bgm.init({...source,src:null});await bgm.toggle();assert.equal(audio.calls,0);assert.equal(bgm.snapshot().available,false);
  const player=createPlayer(new AudioMock(),()=>{},()=>{},noStorage);await player.init([{...builtin,src:null}]);assert.equal(player.snapshot().tracks.length,0);player.dispose();bgm.dispose();
});

test('人声正在加载或切歌时持续暂停 BGM，停止后恢复；手动关闭优先',async()=>{
  const ambient=new AudioMock(),foreground=new AudioMock();
  const bgm=createBackgroundMusic(ambient,{storage:memory(),events:new EventTarget()});await bgm.init(source);
  const player=createPlayer(foreground,state=>bgm.setForeground(state.playing||state.pending),()=>{},noStorage);
  await player.init([builtin,{...builtin,id:'other',src:'/other.mp3'}]);
  let settle;foreground.pendingPlay=new Promise(r=>settle=r);
  const starting=player.play();assert.equal(ambient.paused,true);assert.equal(player.snapshot().pending,true);
  foreground.pendingPlay=null;foreground.paused=false;foreground.dispatchEvent(new Event('play'));settle();await starting;
  const calls=ambient.calls;await player.play(1);assert.equal(ambient.calls,calls);assert.equal(ambient.paused,true);
  player.pause();await tick();assert.equal(ambient.paused,false);
  await player.play();await bgm.toggle();player.pause();await tick();assert.equal(ambient.paused,true);
  player.dispose();bgm.dispose();
});

test('人声播放失败或单曲结束时能恢复 BGM',async()=>{
  const ambient=new AudioMock(),foreground=new AudioMock(),bgm=createBackgroundMusic(ambient,{storage:memory(),events:new EventTarget()});
  await bgm.init(source);
  const player=createPlayer(foreground,s=>bgm.setForeground(s.playing||s.pending),()=>{},noStorage);await player.init([builtin]);
  foreground.fail='NotSupportedError';await player.play();await tick();assert.equal(ambient.paused,false);
  foreground.fail=null;await player.play();assert.equal(ambient.paused,true);
  foreground.ended=true;foreground.paused=true;foreground.dispatchEvent(new Event('ended'));await tick();assert.equal(ambient.paused,false);
  player.dispose();bgm.dispose();
});

test('存储不可用时内置曲目仍存在；内置播放不会写入或删除本地收藏',async()=>{
  let saves=0,deletes=0;
  const audio=new AudioMock(),player=createPlayer(audio,()=>{},()=>{},{listAudio:async()=>{throw new Error('storage blocked');},saveAudio:async()=>saves++,deleteAudio:async()=>deletes++});
  await assert.rejects(player.init([builtin]));assert.equal(player.snapshot().current.id,'vocal');assert.equal(audio.src,builtin.src);
  await player.play();await player.remove('vocal');assert.equal(player.snapshot().tracks.length,1);assert.equal(saves,0);assert.equal(deletes,0);player.dispose();
});

test('停止等待中的人声不会在迟到的播放结果之后重新暂停 BGM',async()=>{
  const audio=new AudioMock(),states=[],player=createPlayer(audio,s=>states.push(s.pending),()=>{},noStorage);
  await player.init([builtin]);let settle;audio.pendingPlay=new Promise(r=>settle=r);
  const attempt=player.play();player.pause();settle();await attempt;assert.equal(player.snapshot().pending,false);assert.equal(states.at(-1),false);player.dispose();
});

test('加密文件即使被标为 audio/flac 也不会导入并造成假成功',async()=>{
  let saves=0;const messages=[],player=createPlayer(new AudioMock(),()=>{},m=>messages.push(m),{...noStorage,saveAudio:async()=>saves++});
  await player.init();await player.add([{name:'song.mflac',type:'audio/flac',size:1024}]);
  assert.equal(saves,0);assert.equal(player.snapshot().tracks.length,0);assert.match(messages.at(-1),/加密音频不能直接播放/);player.dispose();
});

test('人声播放中途解码失败会释放 BGM，背景解码失败不显示播放中',async()=>{
  const ambient=new AudioMock(),foreground=new AudioMock();
  const bgm=createBackgroundMusic(ambient,{storage:memory(),events:new EventTarget()});await bgm.init(source);
  const player=createPlayer(foreground,s=>bgm.setForeground(s.playing||s.pending),()=>{},noStorage);await player.init([builtin]);await player.play();
  foreground.error={code:3};foreground.dispatchEvent(new Event('error'));await tick();assert.equal(ambient.paused,false);
  ambient.error={code:3};ambient.dispatchEvent(new Event('error'));assert.equal(bgm.snapshot().playing,false);assert.equal(bgm.snapshot().failed,true);
  player.dispose();bgm.dispose();
});
