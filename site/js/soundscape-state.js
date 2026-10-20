export const SOUNDSCAPE_KEY = 'hao.soundscape.v1';
export const TIMER_OPTIONS = [0, 15, 30, 45, 60];
export const SOUNDSCAPE_PRESETS = [
  { id: 'rain', name: '雨夜阅读', english: 'RAIN AT THE WINDOW', description: '把窗外的雨留在耳边，慢慢读完这一页。', layers: [
    { id: 'rain', name: '窗外雨', detail: '细密雨幕', value: .66 },
    { id: 'thunder', name: '远处雷声', detail: '低声滚过', value: .22 },
    { id: 'paper', name: '轻轻翻书', detail: '偶尔一页', value: .15 },
  ] },
  { id: 'train', name: '深夜列车', english: 'LAST TRAIN HOME', description: '一节安静的车厢，和不停向前的铁轨。', layers: [
    { id: 'wheels', name: '车轮节奏', detail: '规律的行进', value: .58 },
    { id: 'carriage', name: '车厢低鸣', detail: '温和的共振', value: .35 },
    { id: 'trainwind', name: '窗外风', detail: '掠过的空气', value: .28 },
  ] },
  { id: 'forest', name: '林间休息', english: 'A LITTLE FURTHER IN', description: '往树林深处走一点，让风和溪水接着说。', layers: [
    { id: 'wind', name: '林间风', detail: '缓慢起伏', value: .43 },
    { id: 'leaves', name: '树叶', detail: '细碎的沙沙声', value: .31 },
    { id: 'stream', name: '溪水', detail: '近处流动', value: .46 },
    { id: 'birds', name: '远处鸟鸣', detail: '稀疏的回应', value: .20 },
  ] },
];
export const clampVolume = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.min(1, Math.max(0, Number(value))) : fallback;
export function presetById(id) { return SOUNDSCAPE_PRESETS.find(preset => preset.id === id) || SOUNDSCAPE_PRESETS[0]; }
export function normalizeMix(value = {}) {
  const preset = presetById(value?.presetId);
  return {
    presetId: preset.id,
    layers: Object.fromEntries(preset.layers.map(layer => [layer.id, clampVolume(value?.layers?.[layer.id], layer.value)])),
    master: clampVolume(value?.master, .55),
  };
}
export function normalizeSoundscape(value = {}) {
  const mix = normalizeMix(value);
  const favorites = Array.isArray(value?.favorites) ? value.favorites.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string').slice(0, 8).map(item => ({
    ...normalizeMix(item), id: item.id.slice(0, 80), name: item.name.trim().slice(0, 28) || '我的声景',
  })) : [];
  return { ...mix, timerMinutes: TIMER_OPTIONS.includes(value?.timerMinutes) ? value.timerMinutes : 0, allowOverlap: value?.allowOverlap === true, favorites };
}
export function timerEnvelope(remainingSeconds, fadeSeconds = 30) {
  return Math.min(1, Math.max(0, remainingSeconds / fadeSeconds));
}
