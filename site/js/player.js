import { listAudio, saveAudio, deleteAudio } from './storage.js';
import { createMusicLikes } from './music-likes.js';
export function createPlayer(audio, changed, notify, storage = { listAudio, saveAudio, deleteAudio }, likes = createMusicLikes()) {
  let tracks = [], selected = -1, url = null, pending = false, buffering = false, revision = 0;
  const listeners=new Set();
  const snapshot = () => ({tracks,current:tracks[selected] || null,index:selected,likeCount:likes.count(tracks[selected]?.id),playing:!pending && !audio.paused && !audio.ended && !audio.error&&!buffering,pending,buffering,duration:Number.isFinite(audio.duration)?audio.duration:0,time:audio.currentTime,volume:audio.volume});
  const emit = () => {const state=snapshot();changed(state);listeners.forEach(listener=>listener(state));};
  function release() { if (url) URL.revokeObjectURL(url); url=null; }
  function select(index) {
    if (!tracks.length) return;
    selected = (index + tracks.length) % tracks.length;
    audio.pause(); buffering=false; release();
    const track=tracks[selected];
    audio.src=track.builtin ? track.src : (url=URL.createObjectURL(track.blob)); emit();
  }
  function pause() { revision++; pending=false; buffering=false; audio.pause(); emit(); }
  function like() {
    const track=tracks[selected];
    if(!track)return null;
    try { const count=likes.increment(track.id);emit();return count; }
    catch { notify('喜爱次数未保存，请检查浏览器的本地存储权限或空间后重试');return null; }
  }
  async function play(index) {
    if (!tracks.length) return;
    const request=++revision; pending=true; emit();
    if (Number.isInteger(index) && index !== selected) select(index);
    if (selected < 0 && tracks.length) select(0);
    try { await audio.play(); if(request===revision)buffering=false; }
    catch (error) { if(request===revision){buffering=false;audio.pause();if(error.name!=='AbortError')notify(error.name==='NotAllowedError'?'请点击播放按钮开始聆听':'无法播放这首音频，请尝试其他格式或重新选择文件');} }
    finally { if(request===revision){pending=false;emit();} }
  }
  async function add(files) {
    let count=0, skipped=0, encrypted=0;
    for (const file of files) {
      if (/\.(mflac\d*|mgg\w*|qmc\w*|ncm)$/i.test(file.name)) { encrypted++; continue; }
      if (!(file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac|opus)$/i.test(file.name))) { skipped++; continue; }
      if (file.size > 150*1024*1024) { skipped++; continue; }
      if (tracks.some(t=>t.name===file.name&&t.size===file.size)) { skipped++; continue; }
      const track={id:crypto.randomUUID(),name:file.name,size:file.size,title:file.name.replace(/\.[^.]+$/,''),blob:file,added:Date.now()};
      await storage.saveAudio(track); tracks.push(track); count++;
    }
    if (selected<0 && tracks.length) select(0);
    emit(); notify((count ? `已加入 ${count} 首歌曲${skipped ? `，跳过 ${skipped} 个重复、过大或不支持的文件` : ''}` : '没有新增歌曲，请选择未添加的音频文件（单个不超过 150 兆）')+(encrypted?'；加密音频不能直接播放，请使用普通 MP3、FLAC 或 M4A 文件':''));
  }
  async function remove(id) {
    const i=tracks.findIndex(t=>t.id===id); if(i<0)return;
    if(tracks[i].builtin){notify('这是网站内置曲目');return;}
    await storage.deleteAudio(id);
    const wasSelected=i===selected;
    if(wasSelected){pause();release();audio.removeAttribute('src');audio.load();}
    tracks.splice(i,1);
    if(wasSelected){selected=-1;if(tracks.length)select(Math.min(i,tracks.length-1));}
    else if(i<selected)selected--;
    emit();
  }
  for(const event of ['play','pause','timeupdate','loadedmetadata','durationchange','volumechange','emptied'])audio.addEventListener(event,emit);
  audio.addEventListener('waiting',()=>{buffering=!audio.paused;emit();});
  audio.addEventListener('playing',()=>{buffering=false;emit();});
  audio.addEventListener('pause',()=>{buffering=false;emit();});
  audio.addEventListener('ended',()=> {if(tracks.length>1)play((selected+1)%tracks.length);else emit();});
  audio.addEventListener('error',()=>{revision++;pending=false;buffering=false;if(audio.getAttribute('src'))notify('浏览器无法读取这首歌，请换用 MP3、WAV 或其他支持的音频');emit();});
  return { snapshot, async init(builtins=[]){
    try{likes.load();}catch{notify('喜爱次数无法读取，请检查浏览器的本地存储权限后重试');}
    tracks=builtins.filter(t=>t.src).map(t=>({...t,builtin:true}));
    try{tracks.push(...(await storage.listAudio()).sort((a,b)=>a.added-b.added).filter(t=>!tracks.some(b=>b.id===t.id)));}
    finally{if(tracks.length)select(0);emit();}
  }, add,remove,play,pause,like,
    likeStats(){return likes.stats().map(item=>({...item,title:tracks.find(track=>track.id===item.id)?.title || item.id}));},
    subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);},
    toggle(){audio.paused&&!pending?play():pause();}, next(){if(tracks.length)play((selected+1)%tracks.length);},previous(){if(tracks.length)play((selected-1+tracks.length)%tracks.length);},seek(seconds){if(Number.isFinite(audio.duration)){audio.currentTime=Math.max(0,Math.min(seconds,audio.duration));emit();}},volume(value){audio.volume=Math.max(0,Math.min(1,value));emit();},dispose(){pause();release();listeners.clear();} };
}
