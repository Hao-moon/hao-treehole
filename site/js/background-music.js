const PREFERENCE = 'hao-bgm-enabled-v1';

export function createBackgroundMusic(audio, { changed = () => {}, notify = () => {}, events = globalThis.document, storage } = {}) {
  let track = null, enabled = true, suspended = false, blocked = false, failed = false, pending = false, buffering = false, revision = 0;
  try { storage ??= globalThis.localStorage; enabled = storage?.getItem(PREFERENCE) !== 'off'; } catch {}
  const snapshot = () => ({ available: !!track?.src, title: track?.title || '', enabled, suspended, blocked, failed, pending, buffering, playing: enabled && !suspended && !blocked && !failed && !pending && !buffering && !audio.paused && !audio.ended && !audio.error });
  const emit = () => changed(snapshot());
  async function reconcile() {
    if (!track?.src || !enabled || suspended) {
      revision++; pending = false; buffering = false; audio.pause(); emit(); return;
    }
    if (!audio.paused || pending) { emit(); return; }
    const request = ++revision;
    pending = true; blocked = false; failed = false; emit();
    try { await audio.play(); }
    catch (error) {
      if (request !== revision) return;
      if (error.name === 'NotAllowedError') blocked = true;
      else if (error.name !== 'AbortError') {
        failed = true; notify('背景音乐暂时无法播放，可以稍后点击 BGM 重试');
      }
    } finally {
      if (request === revision) { pending = false; emit(); }
    }
  }
  function onGesture(event) {
    if (event.target?.closest?.('[data-bgm-toggle],[data-play-track],#play-toggle,[data-toggle],.deck-start-pad,.deck-canvas,#next-track,#prev-track')) return;
    if (event.type === 'keydown' && (event.repeat || event.ctrlKey || event.metaKey || event.altKey || ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key))) return;
    if (blocked && enabled && !suspended) void reconcile();
  }
  function onError() {
    revision++; pending=false; buffering=false; failed=true;
    if(track?.src&&enabled&&!suspended)notify('背景音乐暂时无法播放，可以稍后点击 BGM 重试');
    emit();
  }
  for (const event of ['pointerup', 'keydown']) events?.addEventListener(event, onGesture);
  function ready(){buffering=false;emit();}
  function waiting(){buffering=!audio.paused;emit();}
  for (const event of ['playing', 'pause', 'ended', 'emptied']) audio.addEventListener(event, ready);
  audio.addEventListener('waiting',waiting);
  audio.addEventListener('error',onError);
  return {
    snapshot,
    init(value) {
      revision++; audio.pause(); pending = false; buffering = false; track = value; blocked = false; failed = false;
      if (track?.src) {
        audio.src = track.src; audio.loop = true; audio.preload = 'none';
        audio.volume = Math.max(0, Math.min(1, track.volume ?? 0.28));
      } else { audio.removeAttribute('src'); }
      return reconcile();
    },
    toggle() {
      if (!track?.src) return;
      if (enabled && (blocked || failed) && !suspended) { if(failed)audio.load(); return reconcile(); }
      enabled = !enabled;
      try { storage?.setItem(PREFERENCE, enabled ? 'on' : 'off'); } catch {}
      return reconcile();
    },
    setForeground(active) {
      if (suspended === !!active) return;
      suspended = !!active; void reconcile();
    },
    dispose() {
      revision++; pending = false; audio.pause();
      for (const event of ['pointerup', 'keydown']) events?.removeEventListener(event, onGesture);
      for (const event of ['playing', 'pause', 'ended', 'emptied']) audio.removeEventListener(event, ready);
      audio.removeEventListener('waiting',waiting);
      audio.removeEventListener('error',onError);
    },
  };
}
