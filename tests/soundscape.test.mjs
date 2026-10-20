import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundscape } from '../site/js/soundscape.js';
import { normalizeSoundscape, normalizeMix, SOUNDSCAPE_KEY, timerEnvelope } from '../site/js/soundscape-state.js';

function setup(seed) {
  const values = new Map(seed ? [[SOUNDSCAPE_KEY, JSON.stringify(seed)]] : []), notices = [], jobs = new Set();
  let time = 0, audioState = 'suspended', stateListener;
  const audio = {
    last: null, volume: 0, levels: null,
    async play(presetId, layers, volume) { this.last = presetId; this.levels = { ...layers }; this.volume = volume; audioState = 'running'; },
    async pause() { audioState = 'suspended'; }, state: () => audioState,
    setPreset(presetId, levels) { this.last = presetId; this.levels = { ...levels }; },
    setLevels(levels) { this.levels = { ...levels }; }, setMaster(value) { this.volume = value; }, async dispose() { audioState = 'closed'; },
  };
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const controller = createSoundscape({ storage, notify: text => notices.push(text), now: () => time,
    scheduler: { setInterval(callback) { jobs.add(callback); return callback; }, clearInterval(callback) { jobs.delete(callback); } },
    audioFactory(listener) { stateListener = listener; return audio; },
  });
  return { controller, audio, storage, values, notices, jobs,
    advance(ms) { time += ms; [...jobs].forEach(callback => callback()); },
    interrupt() { audioState = 'suspended'; stateListener('suspended'); },
  };
}

test('saved mixes are bounded, unknown layers removed, damaged timer values repaired', () => {
  const state = normalizeSoundscape({ presetId: 'forest', layers: { wind: -2, leaves: 4, stream: 'broken', unknown: 1 }, master: 'broken', timerMinutes: 123, allowOverlap: 'yes', favorites: [{ id: 'a', name: '  own  ', presetId: 'train', layers: { wheels: 8 } }, null] });
  assert.deepEqual(state.layers, { wind: 0, leaves: 1, stream: .46, birds: .2 });
  assert.equal(state.master, .55); assert.equal(state.timerMinutes, 0); assert.equal(state.allowOverlap, false);
  assert.equal(state.favorites[0].name, 'own'); assert.equal(state.favorites[0].layers.wheels, 1);
  assert.deepEqual(normalizeMix({ presetId: 'missing' }).layers, { rain: .66, thunder: .22, paper: .15 });
});

test('choosing and adjusting a soundscape never starts audio; play awaits actual running audio', async () => {
  const { controller, audio } = setup();
  controller.selectPreset('train'); controller.setLayer('wheels', .91); controller.setMaster(.4);
  assert.equal(controller.snapshot().playing, false); assert.equal(audio.state(), 'suspended');
  await controller.play(); assert.equal(controller.snapshot().playing, true);
  assert.equal(audio.last, 'train'); assert.equal(audio.levels.wheels, .91); assert.equal(audio.volume, .4);
  controller.pause(); assert.equal(controller.snapshot().playing, false);
  await controller.dispose();
});

test('each layer stays independent, preset switch resets only its layers, favorites restore the entire mix', async () => {
  const { controller, storage } = setup();
  controller.setLayer('rain', .22); controller.setLayer('thunder', 0); controller.setMaster(.35);
  const id = controller.saveMix('窗边读书'); assert.ok(id);
  controller.selectPreset('forest'); assert.equal(controller.snapshot().master, .35);
  assert.equal(controller.snapshot().layers.wind, .43); assert.equal('rain' in controller.snapshot().layers, false);
  controller.loadMix(id); assert.equal(controller.snapshot().layers.rain, .22); assert.equal(controller.snapshot().layers.thunder, 0);
  assert.equal(controller.snapshot().layers.paper, .15); assert.equal(controller.snapshot().playing, false);
  const saved = JSON.parse(storage.getItem(SOUNDSCAPE_KEY)); assert.equal(saved.favorites[0].name, '窗边读书');
  await controller.dispose();
});

test('timer freezes when paused, fades only in final 30 seconds and stops at zero', async () => {
  const { controller, audio, advance, jobs, notices } = setup();
  controller.setTimer(15); await controller.play(); advance(60000);
  assert.equal(controller.snapshot().remainingSeconds, 840);
  controller.pause(); advance(120000); assert.equal(controller.snapshot().remainingSeconds, 840); assert.equal(jobs.size, 0);
  await controller.play(); advance(825000); assert.equal(controller.snapshot().remainingSeconds, 15); assert.equal(controller.snapshot().fading, true);
  assert.equal(audio.volume, .275);
  advance(15000); assert.equal(controller.snapshot().playing, false); assert.equal(controller.snapshot().remainingSeconds, 0); assert.equal(jobs.size, 0);
  assert.match(notices.at(-1), /定时结束/);
  await controller.play(); assert.equal(controller.snapshot().remainingSeconds, 900);
  controller.setTimer(0); assert.equal(controller.snapshot().remainingSeconds, null); assert.equal(audio.volume, .55);
  await controller.dispose();
});

test('timer change while playing restarts deadline; invalid durations are rejected', async () => {
  const { controller, advance } = setup(); await controller.play(); controller.setTimer(15); advance(300000);
  assert.equal(controller.snapshot().remainingSeconds, 600); controller.setTimer(30); assert.equal(controller.snapshot().remainingSeconds, 1800);
  assert.equal(controller.setTimer(-1), false); assert.equal(controller.snapshot().remainingSeconds, 1800);
  assert.equal(timerEnvelope(15), .5); assert.equal(timerEnvelope(400), 1); assert.equal(timerEnvelope(-1), 0);
  await controller.dispose();
});

test('closing a subscription keeps playback; browser interruption freezes timer and reports paused', async () => {
  const { controller, interrupt, advance } = setup(); controller.setTimer(15); await controller.play(); advance(10000);
  const snapshots = []; const unsubscribe = controller.subscribe(state => snapshots.push(state)); unsubscribe();
  advance(10000); assert.equal(controller.snapshot().playing, true); assert.equal(snapshots.length, 1);
  interrupt(); assert.equal(controller.snapshot().playing, false); advance(60000); assert.equal(controller.snapshot().remainingSeconds, 880);
  await controller.dispose();
});

test('blocked autoplay and a cancelled pending start never report playback', async () => {
  const blocked = setup(); blocked.audio.play = async () => { throw new Error('Playback blocked'); };
  assert.equal(await blocked.controller.play(), false); assert.equal(blocked.controller.snapshot().playing, false); assert.match(blocked.controller.snapshot().error, /blocked/);
  await blocked.controller.dispose();
  const pending = setup(); let complete;
  pending.audio.play = () => new Promise(resolve => { complete = resolve; });
  const start = pending.controller.play(); assert.equal(pending.controller.snapshot().pending, true);
  pending.controller.pause(); complete(); assert.equal(await start, false); assert.equal(pending.controller.snapshot().playing, false); assert.equal(pending.controller.snapshot().pending, false);
  await pending.controller.dispose();
});

test('favorites survive reload with escaped user names and do not falsely save after storage failure', async () => {
  const { controller, storage, values, notices } = setup(); const name = '<img src=x onerror=alert(1)>';
  const id = controller.saveMix(name); assert.ok(id); assert.equal(controller.snapshot().favorites[0].name, name);
  const saved = JSON.parse(values.get(SOUNDSCAPE_KEY)); const reloaded = setup(saved);
  assert.equal(reloaded.controller.snapshot().favorites[0].name, name);
  storage.setItem = () => { throw new Error('quota'); }; assert.equal(controller.saveMix('second'), null);
  assert.equal(controller.snapshot().favorites.length, 1); assert.equal(controller.removeMix(id), false); assert.match(notices.at(-1), /未能保存/);
  await controller.dispose(); await reloaded.controller.dispose();
});

test('defaults never autoplay after reload and overlap is a persistent opt in', async () => {
  const { controller, storage } = setup({ playing: true, pending: true, allowOverlap: false });
  assert.equal(controller.snapshot().playing, false); assert.equal(controller.snapshot().pending, false);
  controller.setAllowOverlap(true); assert.equal(JSON.parse(storage.getItem(SOUNDSCAPE_KEY)).allowOverlap, true);
  const state = controller.snapshot(); state.layers.rain = 0; assert.equal(controller.snapshot().layers.rain, .66);
  await controller.dispose();
});
