import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createSiteServer } from '../server.mjs';
import { inspectAudio } from '../scripts/import-music.mjs';

async function removeTestDirectory(root) {
  const resolved=path.resolve(root),parent=path.resolve(tmpdir());
  assert.equal(path.dirname(resolved),parent);
  assert.ok(path.basename(resolved).startsWith('hao-audio-'));
  await rm(resolved,{recursive:true,force:true});
}

test('音频服务支持正确类型、HEAD、拖动所需分段请求与越界检查',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'hao-audio-test-'));
  const data=Buffer.from('RIFF1234WAVEabcdefghijklmnop');await writeFile(path.join(root,'sample.wav'),data);
  const server=createSiteServer(root);server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await removeTestDirectory(root);});
  const url=`http://127.0.0.1:${server.address().port}/sample.wav`;
  const full=await fetch(url);assert.equal(full.status,200);assert.equal(full.headers.get('content-type'),'audio/wav');assert.deepEqual(Buffer.from(await full.arrayBuffer()),data);
  const head=await fetch(url,{method:'HEAD'});assert.equal(head.headers.get('content-length'),String(data.length));assert.equal((await head.arrayBuffer()).byteLength,0);
  for(const [range,start,end] of [['bytes=5-9',5,9],['bytes=12-',12,data.length-1],['bytes=-4',data.length-4,data.length-1]]){
    const part=await fetch(url,{headers:{Range:range}});assert.equal(part.status,206);assert.equal(part.headers.get('content-range'),`bytes ${start}-${end}/${data.length}`);assert.deepEqual(Buffer.from(await part.arrayBuffer()),data.subarray(start,end+1));
  }
  for(const range of ['bytes=999-','bytes=9-2','bytes=-0','bytes=','bytes=0-1,4-6']){
    const response=await fetch(url,{headers:{Range:range}});assert.equal(response.status,416);assert.equal(response.headers.get('content-range'),`bytes */${data.length}`);await response.arrayBuffer();
  }
});

test('音源检查按文件内容识别 musicex，改成 .flac 后仍拒绝',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'hao-audio-inspect-'));t.after(()=>removeTestDirectory(root));
  const encrypted=path.join(root,'renamed.flac');await writeFile(encrypted,Buffer.concat([Buffer.alloc(64,0x23),Buffer.from('musicex\0')]));
  const result=await inspectAudio(encrypted);assert.equal(result.playable,false);assert.equal(result.format,'musicex');
  const ordinary=path.join(root,'ordinary.flac');await writeFile(ordinary,Buffer.concat([Buffer.from('fLaC'),Buffer.alloc(64)]));assert.equal((await inspectAudio(ordinary)).format,'flac');
});
