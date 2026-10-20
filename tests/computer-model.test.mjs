import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateWallpaper,normalisePreferences,nextWallpaper,SCREEN_THEMES,WALLPAPER_LIMIT} from '../site/js/computer-model.js';
test('wallpaper import rejects active SVG content, empty files and oversized images',()=>{
  for(const file of [{type:'image/svg+xml',size:100},{type:'image/png',size:0},{type:'image/webp',size:WALLPAPER_LIMIT+1},{type:'text/html',size:12}])assert.throws(()=>validateWallpaper(file));
  const valid={type:'image/png',size:WALLPAPER_LIMIT};assert.equal(validateWallpaper(valid),valid);
});
test('corrupt preferences clamp focal positions and only accept supported rotation durations',()=>{
  assert.deepEqual(normalisePreferences({focalX:-19,focalY:180,fit:'script',interval:1}),{focalX:0,focalY:100,fit:'cover',rotation:false,interval:60});
  assert.equal(normalisePreferences({focalX:'abc'}).focalX,50);assert.equal(normalisePreferences({fit:'contain',interval:'300'}).interval,300);
});
test('wallpaper rotation includes custom images and wraps to the first theme',()=>{
  const themes=[...SCREEN_THEMES,{id:'custom-1'}];assert.equal(nextWallpaper(themes,'persona'),'custom-1');assert.equal(nextWallpaper(themes,'custom-1'),themes[0].id);assert.equal(nextWallpaper([],'none'),null);assert.equal(nextWallpaper([{id:'only'}],'only'),'only');
});
test('screensaver panel has no retired shortcut UI, keyboard routing or game placeholder',async()=>{
  const source=await readFile(new URL('../site/js/computer.js',import.meta.url),'utf8');
  const model=await readFile(new URL('../site/js/computer-model.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../site/css/computer.css',import.meta.url),'utf8');
  for(const content of [source,model,css])assert.doesNotMatch(content,/keyboardCommand|data-command|computer-keyboard|data-app|像素游乐场|快捷控制/);
  assert.match(source,/data-power/);assert.match(source,/data-wake/);
});
