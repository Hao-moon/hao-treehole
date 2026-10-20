import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicLikes, MUSIC_LIKES_KEY } from '../site/js/music-likes.js';
import { createPlayer } from '../site/js/player.js';

class AudioMock extends EventTarget {
  paused=true; ended=false; currentTime=0; duration=120; volume=1; src='';
  play(){this.paused=false;this.dispatchEvent(new Event('play'));return Promise.resolve();}
  pause(){this.paused=true;}
  getAttribute(key){return this[key];}
  removeAttribute(key){this[key]='';}
  load(){}
}
const songs=[
  {id:'builtin-first',title:'First song',src:'/first.mp3'},
  {id:'builtin-second',title:'Second song',src:'/second.mp3'},
];
const audioStorage={listAudio:async()=>[],saveAudio:async()=>{},deleteAudio:async()=>{}};
const memory=()=>{
  const values=new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
};
function setup(storage=memory()) {
  const audio=new AudioMock(),messages=[];
  const player=createPlayer(audio,()=>{},message=>messages.push(message),audioStorage,createMusicLikes(storage));
  return {player,audio,messages,storage};
}

test('每次快速点击都计数，喜爱不改变播放或进度，订阅拿到新计数',async()=>{
  const {player,audio}=setup();await player.init(songs);await player.play();audio.currentTime=37;
  const counts=[];const unsubscribe=player.subscribe(state=>counts.push(state.likeCount));
  for(let index=1;index<=100;index++)assert.equal(player.like(),index);
  assert.equal(player.snapshot().likeCount,100);
  assert.equal(audio.paused,false);assert.equal(audio.currentTime,37);assert.equal(audio.src,songs[0].src);
  assert.deepEqual(counts,Array.from({length:101},(_,index)=>index));
  unsubscribe();player.dispose();
});

test('切换歌曲隔离计数；收起重开订阅和重新载入播放器都保留计数',async()=>{
  const {player,storage}=setup();await player.init(songs);player.like();player.like();
  await player.play(1);assert.equal(player.snapshot().likeCount,0);player.like();
  await player.play(0);assert.equal(player.snapshot().likeCount,2);
  let state;const close=player.subscribe(value=>state=value);close();player.subscribe(value=>state=value);
  assert.equal(state.likeCount,2);
  assert.deepEqual(player.likeStats(),[
    {id:songs[0].id,title:songs[0].title,count:2},
    {id:songs[1].id,title:songs[1].title,count:1},
  ]);
  player.dispose();
  const reopened=setup(storage).player;await reopened.init(songs);
  assert.equal(reopened.snapshot().likeCount,2);await reopened.play(1);
  assert.equal(reopened.snapshot().likeCount,1);assert.equal(reopened.like(),2);reopened.dispose();
});

test('相同标题不同稳定 ID 的歌曲独立计数；重复初始化不清零',async()=>{
  const {player}=setup();await player.init(songs.map(song=>({...song,title:'Same title'})));
  player.like();await player.play(1);player.like();player.like();
  await player.init(songs);assert.equal(player.snapshot().likeCount,1);
  await player.play(1);assert.equal(player.snapshot().likeCount,2);player.dispose();
});

test('没有当前歌曲时喜爱不产生记录或存储写入',async()=>{
  const {player,storage}=setup();await player.init();
  assert.equal(player.like(),null);assert.equal(player.snapshot().likeCount,0);
  assert.deepEqual(player.likeStats(),[]);assert.equal(storage.getItem(MUSIC_LIKES_KEY),null);player.dispose();
});

test('存储写入失败不假报成功、不增加计数，恢复后可继续',async()=>{
  const storage=memory(),{player,messages}=setup(storage);await player.init(songs);player.like();
  const save=storage.setItem;storage.setItem=()=>{throw new Error('quota exceeded');};
  assert.equal(player.like(),null);assert.equal(player.snapshot().likeCount,1);
  assert.match(messages.at(-1),/喜爱次数未保存/);
  storage.setItem=save;assert.equal(player.like(),2);player.dispose();
  const reopened=setup(storage).player;await reopened.init(songs);
  assert.equal(reopened.snapshot().likeCount,2);reopened.dispose();
});

test('无法读取存储或数据损坏时不覆盖历史，仍然可以播放',async()=>{
  for(const storage of [
    {getItem(){throw new Error('blocked');},setItem(){throw new Error('must not write');}},
    {getItem:()=>'{bad json',setItem(){throw new Error('must not write');}},
    null,
  ]) {
    const {player,messages}=setup(storage);await player.init(songs);
    assert.match(messages.at(-1),/喜爱次数无法读取/);
    assert.equal(player.like(),null);assert.match(messages.at(-1),/喜爱次数未保存/);
    await player.play();assert.equal(player.snapshot().playing,true);player.dispose();
  }
});

test('不同播放器实例续写最新持久值，统计快照不能改动实际计数',()=>{
  const storage=memory(),first=createMusicLikes(storage),second=createMusicLikes(storage);
  first.load();second.load();assert.equal(first.increment('song'),1);assert.equal(second.increment('song'),2);
  assert.equal(first.increment('song'),3);first.stats()[0].count=100;
  assert.equal(first.count('song'),3);second.load();assert.equal(second.count('song'),3);
});
