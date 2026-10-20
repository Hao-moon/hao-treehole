import { open, stat } from 'node:fs/promises';
export async function inspectAudio(file) {
  const size=(await stat(file)).size, handle=await open(file,'r');
  const header=Buffer.alloc(32), tail=Buffer.alloc(16);
  try{await handle.read(header,0,32,0);await handle.read(tail,0,16,Math.max(0,size-16));}finally{await handle.close();}
  if(tail.subarray(-8).toString('ascii')==='musicex\0') return {playable:false,format:'musicex',reason:'新版加密文件未内嵌解码密钥，不能仅凭文件转换成普通音频'};
  const text=header.toString('ascii');
  const mp3Frame=header[0]===255&&(header[1]&224)===224&&(header[1]&6)!==0&&(header[1]&24)!==8;
  const format=text.startsWith('fLaC')?'flac':text.startsWith('ID3')||mp3Frame?'mp3':text.startsWith('OggS')?'ogg':text.startsWith('RIFF')&&text.slice(8,12)==='WAVE'?'wav':text.slice(4,8)==='ftyp'?'m4a':null;
  if(!format)return {playable:false,format:'unknown',reason:'文件头不是支持的普通音频格式'};
  // Header checks prevent renamed encrypted files from being published. Playback still needs browser verification.
  return {playable:true,format,size};
}
