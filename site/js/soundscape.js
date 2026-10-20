import { createSoundscapeAudio } from './soundscape-audio.js';
import { SOUNDSCAPE_KEY, SOUNDSCAPE_PRESETS, TIMER_OPTIONS, clampVolume, normalizeMix, normalizeSoundscape, presetById, timerEnvelope } from './soundscape-state.js';

export function createSoundscape(options = {}) {
  const notify = options.notify || (() => {}), now = options.now || Date.now, scheduler = options.scheduler || globalThis;
  let storage = options.storage, state = normalizeSoundscape(), playing = false, pending = false, error = '', revision = 0, disposed = false;
  let remainingMs = 0, deadline = null, ticker = null;
  const listeners = new Set();
  try { storage ??= globalThis.localStorage; const value = storage?.getItem(SOUNDSCAPE_KEY); if (value) state = normalizeSoundscape(JSON.parse(value)); }
  catch { notify('声景设置暂时无法读取，可以继续聆听'); }
  remainingMs = state.timerMinutes * 60000;
  const audio = (options.audioFactory || createSoundscapeAudio)(audioState => {
    if (disposed) return;
    if (audioState !== 'running' && playing) {
      freezeTimer(); playing = false; stopTicker(); emit();
    }
  });
  const remaining = () => state.timerMinutes ? Math.max(0, deadline === null ? remainingMs : deadline - now()) : null;
  function snapshot() {
    const seconds = remaining();
    return { ...state, layers: { ...state.layers }, favorites: state.favorites.map(item => ({ ...item, layers: { ...item.layers } })),
      playing, pending, error, remainingSeconds: seconds === null ? null : Math.ceil(seconds / 1000), fading: playing && seconds !== null && seconds <= 30000,
    };
  }
  function emit() { const current = snapshot(); listeners.forEach(listener => listener(current)); }
  function persist(next = state) {
    try { if (!storage) throw new Error('unavailable'); storage.setItem(SOUNDSCAPE_KEY, JSON.stringify(next)); return true; }
    catch { notify('这次声景设置未能保存，仍可在当前页面使用'); return false; }
  }
  function volume() { const ms = remaining(); return state.master * (ms === null ? 1 : timerEnvelope(ms / 1000)); }
  function freezeTimer() { if (deadline !== null) remainingMs = Math.max(0, deadline - now()); deadline = null; }
  function stopTicker() { if (ticker !== null) scheduler.clearInterval(ticker); ticker = null; }
  function tick() {
    if (!playing) return;
    if (remaining() === 0) { pause(); notify('定时结束，声景已轻轻停下'); return; }
    audio.setMaster(volume()); emit();
  }
  function pause() {
    revision++; pending = false; freezeTimer(); playing = false; stopTicker();
    Promise.resolve(audio.pause()).catch(() => {}); emit();
  }
  async function play() {
    if (disposed || pending || playing) return false;
    const request = ++revision; pending = true; error = ''; emit();
    try {
      await audio.play(state.presetId, state.layers, state.master);
      if (request !== revision || disposed) { if (!playing && !pending) await audio.pause(); return false; }
      if (audio.state() !== 'running') throw new Error('浏览器没有开始播放，请再点一次开始聆听');
      if (state.timerMinutes && remainingMs <= 0) remainingMs = state.timerMinutes * 60000;
      deadline = state.timerMinutes ? now() + remainingMs : null;
      pending = false; playing = true; audio.setMaster(volume());
      stopTicker(); ticker = scheduler.setInterval(tick, 1000); emit(); return true;
    } catch (failure) {
      if (request === revision) {
        pending = false; playing = false; error = failure.message || '声景暂时无法播放，请再试一次';
        await Promise.resolve(audio.pause()).catch(() => {}); notify(error); emit();
      }
      return false;
    }
  }
  return {
    snapshot, subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
    play, pause, toggle() { return playing || pending ? pause() : play(); },
    stop() { pause(); remainingMs = state.timerMinutes * 60000; emit(); },
    selectPreset(id) {
      if (!SOUNDSCAPE_PRESETS.some(preset => preset.id === id)) return false;
      const mix = normalizeMix({ presetId: id, master: state.master }); state = { ...state, ...mix }; error = '';
      audio.setPreset(id, state.layers); persist(); emit(); return true;
    },
    setLayer(id, value) { if (!(id in state.layers)) return; state.layers[id] = clampVolume(value, state.layers[id]); audio.setLevels(state.layers); persist(); emit(); },
    setMaster(value) { state.master = clampVolume(value, state.master); audio.setMaster(playing ? volume() : 0); persist(); emit(); },
    setTimer(minutes) {
      minutes = Number(minutes); if (!TIMER_OPTIONS.includes(minutes)) return false;
      state.timerMinutes = minutes; remainingMs = minutes * 60000; deadline = playing && minutes ? now() + remainingMs : null;
      audio.setMaster(playing ? volume() : 0); persist(); emit(); return true;
    },
    setAllowOverlap(value) { state.allowOverlap = value === true; persist(); emit(); },
    saveMix(name) {
      const title = String(name || '').trim().slice(0, 28) || `${presetById(state.presetId).name} · 我的混音`;
      if (state.favorites.length >= 8) { notify('最多保留 8 组声景，请先移除一组'); return null; }
      const mix = { ...normalizeMix(state), id: globalThis.crypto?.randomUUID?.() || `mix-${now()}-${Math.random().toString(36).slice(2)}`, name: title };
      const next = { ...state, favorites: [...state.favorites, mix] };
      if (!persist(next)) return null; state = next; emit(); notify('这组声音已留下'); return mix.id;
    },
    loadMix(id) {
      const mix = state.favorites.find(item => item.id === id); if (!mix) return false;
      state = { ...state, ...normalizeMix(mix) }; audio.setPreset(state.presetId, state.layers); audio.setMaster(playing ? volume() : 0);
      persist(); emit(); notify(`已换成「${mix.name}」`); return true;
    },
    removeMix(id) {
      const next = { ...state, favorites: state.favorites.filter(item => item.id !== id) };
      if (!persist(next)) return false; state = next; emit(); return true;
    },
    dispose() { if (disposed) return; pause(); disposed = true; listeners.clear(); return audio.dispose(); },
  };
}

const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
function timeLabel(seconds) { if (seconds === null) return '不限时'; return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; }

export function mountSoundscape(root, controller, { notify = () => {} } = {}) {
  root.innerHTML = `<section class="soundscape" aria-label="私人声景">
    <div class="soundscape-head"><div><span class="soundscape-kicker">留一点安静给自己</span><h2>私人声景</h2></div><span class="soundscape-medium">合成环境声<br>无需联网</span></div>
    <div class="soundscape-body">
      <div class="soundscape-listening">
        <div class="soundscape-presets" role="group" aria-label="选择声景">${SOUNDSCAPE_PRESETS.map((preset, index) => `<button type="button" data-sound-preset="${preset.id}" aria-pressed="false"><span>0${index + 1}</span><strong>${preset.name}</strong></button>`).join('')}</div>
        <div class="soundscape-cup" data-sound-cup><span class="soundscape-cup-label" data-sound-english></span><div class="soundscape-cup-rings" aria-hidden="true"></div><button class="soundscape-play" type="button" data-sound-play aria-label="开始聆听"><span data-sound-play-symbol aria-hidden="true">▶</span><strong data-sound-play-label>开始聆听</strong></button><span class="soundscape-cup-sign" aria-hidden="true">L / PRIVATE LISTENING</span></div>
        <p class="soundscape-description" data-sound-description></p>
        <p class="soundscape-status" data-sound-status role="status" aria-live="polite"></p>
      </div>
      <div class="soundscape-desk">
        <div class="soundscape-mix-heading"><h3>调成你的声音</h3><span>各层可独立静音</span></div>
        <div class="soundscape-layers" data-sound-layers></div>
        <div class="soundscape-master"><label for="sound-master">耳机音量 <output data-sound-master-value></output></label><input id="sound-master" type="range" min="0" max="100" step="1" value="55" data-sound-master></div>
        <div class="soundscape-timer"><label for="sound-timer">到点轻轻停下</label><select id="sound-timer" data-sound-timer aria-describedby="sound-timer-help">${TIMER_OPTIONS.map(minutes => `<option value="${minutes}">${minutes ? `${minutes} 分钟` : '不限时'}</option>`).join('')}</select><strong data-sound-countdown></strong><small id="sound-timer-help">最后 30 秒渐弱，暂停时计时也暂停</small></div>
        <label class="soundscape-overlap"><input type="checkbox" data-sound-overlap><span>与唱片 / BGM 叠加</span></label>
      </div>
    </div>
    <div class="soundscape-save"><form data-sound-save><label for="sound-mix-name">留下这组声音</label><div><input id="sound-mix-name" type="text" maxlength="28" placeholder="给这组混音起个名字" autocomplete="off"><button type="submit">保存混音 ↗</button></div></form><div class="soundscape-favorites" data-sound-favorites aria-label="收藏的声景"></div></div>
    <p class="soundscape-footer">放回耳机，声音会继续陪着你。<span>再次点击耳机可调整或暂停。</span></p>
  </section>`;
  const panel = root.querySelector('.soundscape'), find = selector => panel.querySelector(selector), muted = new Map();
  let lastPreset = '', lastFavorites = '', lastStatus = '';
  function layerMarkup(preset) {
    return preset.layers.map(layer => `<div class="soundscape-layer"><button type="button" data-sound-mute="${layer.id}" aria-pressed="false" aria-label="静音${layer.name}"><span class="soundscape-layer-indicator" aria-hidden="true"></span><strong>${layer.name}</strong><small>${layer.detail}</small></button><label class="soundscape-layer-slider" for="sound-layer-${layer.id}"><span class="soundscape-sr-only">${layer.name}音量</span><input type="range" id="sound-layer-${layer.id}" data-sound-layer="${layer.id}" min="0" max="100" step="1"><output data-sound-level="${layer.id}"></output></label></div>`).join('');
  }
  const unsubscribe = controller.subscribe(state => {
    const preset = presetById(state.presetId);
    panel.dataset.playing = String(state.playing); panel.dataset.preset = preset.id;
    if (lastPreset !== preset.id) { find('[data-sound-layers]').innerHTML = layerMarkup(preset); lastPreset = preset.id; }
    panel.querySelectorAll('[data-sound-preset]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.soundPreset === preset.id)));
    find('[data-sound-english]').textContent = preset.english;
    find('[data-sound-description]').textContent = preset.description;
    find('[data-sound-play-label]').textContent = state.pending ? '正在准备' : state.playing ? '暂停聆听' : '开始聆听';
    find('[data-sound-play-symbol]').textContent = state.pending ? '···' : state.playing ? 'Ⅱ' : '▶';
    find('[data-sound-play]').setAttribute('aria-label', state.pending ? '取消准备' : state.playing ? '暂停聆听' : '开始聆听');
    find('[data-sound-play]').setAttribute('aria-pressed', String(state.playing));
    for (const layer of preset.layers) {
      const percent = Math.round(state.layers[layer.id] * 100), input = find(`[data-sound-layer="${layer.id}"]`), button = find(`[data-sound-mute="${layer.id}"]`);
      input.value = percent; input.style.setProperty('--level', `${percent}%`); find(`[data-sound-level="${layer.id}"]`).textContent = String(percent).padStart(2, '0');
      button.setAttribute('aria-pressed', String(percent === 0)); button.setAttribute('aria-label', `${percent === 0 ? '开启' : '静音'}${layer.name}`);
    }
    find('[data-sound-master]').value = Math.round(state.master * 100); find('[data-sound-master-value]').textContent = `${Math.round(state.master * 100)}%`;
    find('[data-sound-timer]').value = state.timerMinutes; find('[data-sound-countdown]').textContent = timeLabel(state.remainingSeconds);
    find('[data-sound-overlap]').checked = state.allowOverlap;
    const silent = state.master === 0 || Object.values(state.layers).every(value => value === 0);
    const status = state.error || (state.pending ? '把外面的声音慢慢放进来…' : state.playing ? (silent ? '播放中 · 当前音量为零' : state.fading ? '快到时间了，声音正在渐弱' : `正在聆听 · ${preset.name}`) : '戴上耳机，按下开始。');
    if (status !== lastStatus) { find('[data-sound-status]').textContent = status; lastStatus = status; }
    const key = JSON.stringify(state.favorites);
    if (key !== lastFavorites) {
      find('[data-sound-favorites]').innerHTML = state.favorites.length ? state.favorites.map(mix => `<span class="soundscape-favorite"><button type="button" data-sound-load="${escapeHTML(mix.id)}" title="加载${escapeHTML(mix.name)}">${escapeHTML(mix.name)}</button><button type="button" data-sound-remove="${escapeHTML(mix.id)}" aria-label="移除${escapeHTML(mix.name)}">×</button></span>`).join('') : '<span class="soundscape-no-favorites">喜欢的组合，会留在这里。</span>';
      lastFavorites = key;
    }
  });
  function click(event) {
    const target = event.target.closest('button'); if (!target) return;
    if (target.matches('[data-sound-play]')) controller.toggle();
    if (target.dataset.soundPreset) controller.selectPreset(target.dataset.soundPreset);
    if (target.dataset.soundLoad) controller.loadMix(target.dataset.soundLoad);
    if (target.dataset.soundRemove) controller.removeMix(target.dataset.soundRemove);
    if (target.dataset.soundMute) {
      const id = target.dataset.soundMute, current = controller.snapshot().layers[id];
      if (current > 0) { muted.set(id, current); controller.setLayer(id, 0); }
      else controller.setLayer(id, muted.get(id) || .4);
    }
  }
  function input(event) {
    const target = event.target;
    if (target.dataset.soundLayer) controller.setLayer(target.dataset.soundLayer, Number(target.value) / 100);
    if (target.matches('[data-sound-master]')) controller.setMaster(Number(target.value) / 100);
  }
  function change(event) {
    if (event.target.matches('[data-sound-timer]')) controller.setTimer(event.target.value);
    if (event.target.matches('[data-sound-overlap]')) { controller.setAllowOverlap(event.target.checked); notify(event.target.checked ? '已允许声景与音乐同时播放' : '声景将独立播放'); }
  }
  function submit(event) {
    if (!event.target.matches('[data-sound-save]')) return;
    event.preventDefault(); const name = find('#sound-mix-name'); if (controller.saveMix(name.value)) name.value = '';
  }
  panel.addEventListener('click', click); panel.addEventListener('input', input); panel.addEventListener('change', change); panel.addEventListener('submit', submit);
  return () => { unsubscribe(); panel.removeEventListener('click', click); panel.removeEventListener('input', input); panel.removeEventListener('change', change); panel.removeEventListener('submit', submit); };
}
