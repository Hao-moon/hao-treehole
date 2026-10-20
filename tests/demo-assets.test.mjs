import test from 'node:test';
import assert from 'node:assert/strict';
import {stat} from 'node:fs/promises';
import {builtinGames} from '../site/js/game-library.js';
import {validateGameRecord} from '../site/js/game-model.js';
import {SCREEN_THEMES} from '../site/js/computer-model.js';
import {musicLibrary} from '../site/js/music-library.js';
import {BUILTIN_FIGURES} from '../site/js/figure-library.js';

test('public demo metadata passes application validation before the app boots',()=>{
  for(const game of builtinGames)assert.equal(validateGameRecord(game).id,game.id);
});
test('a fresh checkout includes the media required by every built-in collection',async()=>{
  const paths=[...builtinGames.map(g=>g.cover),...SCREEN_THEMES.map(t=>t.imageUrl),
    musicLibrary.background.src,...musicLibrary.tracks.map(t=>t.src),...BUILTIN_FIGURES.map(f=>f.src),
    '/assets/scene/persona5-base-medium.webp','/assets/worlds/ghostblade/base-medium.webp'];
  for(const p of paths){assert.match(p,/^\/assets\//);assert.ok((await stat(new URL('../site'+p,import.meta.url))).size>0,p);}
});
