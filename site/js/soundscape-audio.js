// These are synthesized environmental textures, not field recordings. Audio is
// created only following a play gesture; one AudioContext is reused for the room.
function randomGenerator(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
const noiseSeconds = 13;

function noiseBuffer(context, seed) {
  const rate = context.sampleRate, length = Math.floor(rate * noiseSeconds);
  const buffer = context.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const random = randomGenerator(seed + channel * 937), data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index++) data[index] = random() * 2 - 1;
    // White noise has no boundary condition. Filtering is done by continuous
    // nodes, so loop boundaries do not reset the filter state.
  }
  return buffer;
}

export function createSoundscapeAudio(onState = () => {}) {
  let context = null, master = null, compressor = null, graph = null, disposed = false;
  const buffers = new Map();
  function getContext() {
    if (disposed) throw new Error('声景已关闭');
    if (context) return context;
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) throw new Error('这个浏览器暂不支持环境声，请换用支持 Web Audio 的浏览器');
    context = new AudioContext(); master = context.createGain(); master.gain.value = 0;
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14; compressor.knee.value = 16; compressor.ratio.value = 4;
    compressor.attack.value = .02; compressor.release.value = .35;
    master.connect(compressor); compressor.connect(context.destination);
    context.addEventListener('statechange', () => onState(context.state));
    return context;
  }
  function getNoise(seed) { if (!buffers.has(seed)) buffers.set(seed, noiseBuffer(context, seed)); return buffers.get(seed); }
  function build(presetId, levels) {
    const ctx = getContext();
    if (graph?.presetId === presetId) { levelsTo(levels); return; }
    clearGraph();
    graph = { presetId, nodes: [], sources: [], layers: new Map(), events: [], next: {}, scheduler: null };
    const owned = graph;
    function keep(node) { owned.nodes.push(node); return node; }
    function start(source) { owned.sources.push(source); source.start(); return source; }
    function gain(value, destination) { const node = keep(ctx.createGain()); node.gain.value = value; if (destination) node.connect(destination); return node; }
    function layer(id) { const node = gain(levels[id] ?? 0, master); owned.layers.set(id, node); return node; }
    function noise(destination, type, frequency, amplitude, seed, q = .5) {
      const source = keep(ctx.createBufferSource()); source.buffer = getNoise(seed); source.loop = true;
      const filter = keep(ctx.createBiquadFilter()); filter.type = type; filter.frequency.value = frequency; filter.Q.value = q;
      const volume = gain(amplitude, destination); source.connect(filter); filter.connect(volume); start(source);
      return { source, filter, volume };
    }
    function tone(destination, frequency, amplitude, type = 'sine') {
      const oscillator = keep(ctx.createOscillator()); oscillator.type = type; oscillator.frequency.value = frequency;
      oscillator.connect(gain(amplitude, destination)); start(oscillator); return oscillator;
    }
    function sway(param, frequency, amount) {
      const lfo = keep(ctx.createOscillator()); lfo.frequency.value = frequency;
      lfo.connect(gain(amount, param)); start(lfo);
    }
    function burst(destination, time, duration, frequency, volume, type = 'bandpass', pan = 0, q = .5) {
      const source = ctx.createBufferSource(); source.buffer = getNoise(41); source.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency; filter.Q.value = q;
      const envelope = ctx.createGain(); envelope.gain.setValueAtTime(0, time);
      envelope.gain.linearRampToValueAtTime(volume, time + Math.min(.12, duration * .12));
      envelope.gain.exponentialRampToValueAtTime(.00001, time + duration);
      const panner = ctx.createStereoPanner(); panner.pan.value = pan;
      source.connect(filter); filter.connect(envelope); envelope.connect(panner); panner.connect(destination);
      const record = [source, filter, envelope, panner]; owned.events.push(record);
      source.onended = () => { record.forEach(node => node.disconnect()); const index = owned.events.indexOf(record); if (index >= 0) owned.events.splice(index, 1); };
      source.start(time, Math.random() * 9); source.stop(time + duration + .02);
      return { filter, envelope };
    }
    function bird(destination, time, pan) {
      for (let index = 0; index < 3; index++) {
        const startTime = time + index * .16, duration = .11 + Math.random() * .05;
        const source = ctx.createOscillator(), envelope = ctx.createGain(), panner = ctx.createStereoPanner();
        panner.pan.value = pan; source.type = 'sine';
        source.frequency.setValueAtTime(1700 + index * 190 + Math.random() * 600, startTime);
        source.frequency.exponentialRampToValueAtTime(3300 + Math.random() * 650, startTime + duration * .45);
        source.frequency.exponentialRampToValueAtTime(2100 + Math.random() * 500, startTime + duration);
        envelope.gain.setValueAtTime(0, startTime); envelope.gain.linearRampToValueAtTime(.035, startTime + .018);
        envelope.gain.exponentialRampToValueAtTime(.00001, startTime + duration);
        source.connect(envelope); envelope.connect(panner); panner.connect(destination);
        const record = [source, envelope, panner]; owned.events.push(record);
        source.onended = () => { record.forEach(node => node.disconnect()); const index = owned.events.indexOf(record); if (index >= 0) owned.events.splice(index, 1); };
        source.start(startTime); source.stop(startTime + duration + .02);
      }
    }
    let schedule;
    if (presetId === 'rain') {
      const rain = layer('rain'), thunder = layer('thunder'), paper = layer('paper');
      const bed = noise(rain, 'lowpass', 3700, .52, 19); sway(bed.volume.gain, .083, .055);
      noise(rain, 'highpass', 1800, .11, 23);
      owned.next = { drops: ctx.currentTime + .1, thunder: ctx.currentTime + 3, paper: ctx.currentTime + 7 };
      schedule = now => {
        if (owned.next.drops < now + .35) { burst(rain, now + .02, .10, 1600 + Math.random() * 3500, .09, 'bandpass', Math.random() * 1.6 - .8, 4); owned.next.drops = now + .14 + Math.random() * .20; }
        if (owned.next.thunder < now + .35) { const sound = burst(thunder, now + .02, 6, 135, 1.05, 'lowpass', -.35); sound.filter.frequency.linearRampToValueAtTime(60, now + 5); owned.next.thunder = now + 19 + Math.random() * 15; }
        if (owned.next.paper < now + .35) { const sound = burst(paper, now + .02, .75, 1100, .3, 'bandpass', .35, .8); sound.filter.frequency.exponentialRampToValueAtTime(3900, now + .22); sound.filter.frequency.exponentialRampToValueAtTime(700, now + .73); owned.next.paper = now + 15 + Math.random() * 10; }
      };
    } else if (presetId === 'train') {
      const wheels = layer('wheels'), carriage = layer('carriage'), wind = layer('trainwind');
      const rumble = noise(wheels, 'lowpass', 420, .65, 31); sway(rumble.volume.gain, 2.3, .15);
      tone(carriage, 51, .038); tone(carriage, 102.4, .012); const hum = noise(carriage, 'lowpass', 190, .60, 23); sway(hum.volume.gain, .19, .08);
      const air = noise(wind, 'bandpass', 620, .44, 19, .35); sway(air.filter.frequency, .074, 200); sway(air.volume.gain, .14, .11);
      owned.next = { wheels: ctx.currentTime + .1 };
      schedule = now => { while (owned.next.wheels < now + .35) { const time = Math.max(now + .01, owned.next.wheels); burst(wheels, time, .13, 290, .7, 'lowpass', -.25); burst(wheels, time + .15, .11, 490, .45, 'lowpass', .25); owned.next.wheels += .86; } };
    } else {
      const wind = layer('wind'), leaves = layer('leaves'), stream = layer('stream'), birds = layer('birds');
      const breeze = noise(wind, 'bandpass', 390, .49, 31, .4); sway(breeze.volume.gain, .067, .22); sway(breeze.filter.frequency, .041, 130);
      const rustle = noise(leaves, 'highpass', 2200, .15, 23); sway(rustle.volume.gain, .18, .085);
      const water = noise(stream, 'bandpass', 1250, .50, 19, .3); sway(water.filter.frequency, .38, 240);
      noise(stream, 'lowpass', 680, .28, 41);
      owned.next = { birds: ctx.currentTime + 2, ripple: ctx.currentTime + .4 };
      schedule = now => {
        if (owned.next.birds < now + .35) { bird(birds, now + .02, Math.random() * 1.5 - .75); owned.next.birds = now + 5 + Math.random() * 8; }
        if (owned.next.ripple < now + .35) { const sound = burst(stream, now + .02, .45, 600 + Math.random() * 800, .11, 'bandpass', Math.random() * 1.4 - .7, 5); sound.filter.frequency.exponentialRampToValueAtTime(320, now + .45); owned.next.ripple = now + .3 + Math.random() * .9; }
      };
    }
    owned.scheduler = setInterval(() => { if (context.state === 'running') schedule(context.currentTime); }, 160);
    schedule(ctx.currentTime);
  }
  function clearGraph() {
    if (!graph) return;
    clearInterval(graph.scheduler);
    graph.sources.forEach(source => { try { source.stop(); } catch { /* already stopped */ } });
    graph.events.forEach(record => { try { record[0].stop(); } catch { /* already ended */ } record.forEach(node => node.disconnect()); });
    graph.nodes.forEach(node => node.disconnect()); graph = null;
  }
  function levelsTo(levels) { if (!graph) return; graph.layers.forEach((node, id) => node.gain.setTargetAtTime(levels[id] ?? 0, context.currentTime, .06)); }
  return {
    async play(presetId, levels, volume) {
      const ctx = getContext(); const resumed = ctx.resume(); build(presetId, levels); await resumed;
      if (ctx.state !== 'running') throw new Error('浏览器没有开始播放，请再点一次开始聆听');
      this.setMaster(volume); return ctx.state;
    },
    pause() { if (!context) return; master.gain.cancelScheduledValues(context.currentTime); master.gain.setValueAtTime(0, context.currentTime); return context.suspend(); },
    setPreset(presetId, levels) { if (context) build(presetId, levels); },
    setLevels: levelsTo,
    setMaster(value) { if (master) master.gain.setTargetAtTime(Math.max(0, value), context.currentTime, .12); },
    state() { return context?.state || 'suspended'; },
    async dispose() { disposed = true; clearGraph(); buffers.clear(); if (context && context.state !== 'closed') await context.close(); },
  };
}
