import {GAME_STATUSES, GAME_RATINGS, GAME_GENRES, normalizeGameForDisplay, validateGameRecord} from './game-model.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options = (items, selected) => items.map(v => `<option value="${escape(v)}" ${v === selected ? 'selected' : ''}>${escape(v || '待评级')}</option>`).join('');
const tierClass = rating => `sw-tier-${GAME_RATINGS.indexOf(rating)}`;
const cover = game => `<span class="sw-art">${game.cover ? `<img src="${escape(game.cover)}" alt="${escape(game.title)}封面" draggable="false">` : `<span class="sw-no-cover"><b>＋</b><span>${escape(game.title || '上传封面')}</span></span>`}</span>`;
const hoursLabel = game => game.hours === null ? (game.hoursKind === '参考主线' ? '待公布' : '未填写') : `${game.hoursKind === '参考主线' ? '约 ' : ''}${game.hours} 小时`;

/** Resize user uploads before storing them in the same portable collection backup. */
async function readCover(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片');
  if (file.size > 10 * 1024 * 1024) throw new Error('请选择小于 10 MB 的图片');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60000000) throw new Error('图片尺寸过大，请换一张封面');
    const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#17171b'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const result = canvas.toDataURL('image/jpeg', .86);
    if (result.length > 2 * 1024 * 1024) throw new Error('封面图片过大，请换一张较小的图片');
    return result;
  } catch (error) {
    if (error.name === 'EncodingError') throw new Error('这张图片无法读取，请重新选择');
    throw error;
  } finally { URL.revokeObjectURL(url); }
}

export function mountGames(root, {getContent, persist, notify}) {
  let selected = null, view = 'library', genre = '', status = '', disposed = false, editor = null, uploadToken = 0, busy = false;
  const drafts = new Map();
  const allGames = () => (getContent().games || []).map(game => ({...normalizeGameForDisplay(game),genre:game.genre?.trim() || '其他'}));
  const visibleGames = () => allGames().filter(g => (!genre || g.genre === genre) && (!status || g.status === status));
  function focus(selector) { root.querySelector(selector)?.focus({preventScroll:true}); }
  function bindImages() {
    root.querySelectorAll('.sw-art img').forEach(img => { img.onerror = () => { img.parentElement.innerHTML = '<span class="sw-no-cover"><b>▧</b><span>封面暂不可用</span></span>'; }; });
  }
  function frame(content, editing = false) {
    root.innerHTML = `<div class="sw-console"><aside class="sw-joy sw-joy-left" aria-hidden="true"><span class="sw-minus">−</span><i class="sw-stick"></i><span class="sw-dpad">✚</span><i class="sw-square"></i></aside><section class="sw-screen" aria-label="我的游戏收藏"><header class="sw-header"><div class="sw-identity"><span class="sw-avatar" aria-hidden="true">H</span><div><small>HAO'S PLAYLOG</small><strong>${editing ? (editor.id ? '编辑游戏' : '添加游戏') : '我的游戏收藏'}</strong></div></div>${editing ? '<button class="sw-button sw-back" type="button">← 返回收藏</button>' : `<div class="sw-header-end"><span class="sw-count">${allGames().length} 张卡带</span><button class="sw-button sw-add" type="button">＋ 添加游戏</button></div>`}</header>${content}<footer class="sw-footer"><span>${editing ? '封面与资料一起保存在本机' : '我的卡带，我的冒险。'}</span><span>${editing ? '<kbd>Esc</kbd> 返回' : '<kbd>←</kbd><kbd>→</kbd> 选择 <kbd>Enter</kbd> 编辑'}</span></footer></section><aside class="sw-joy sw-joy-right" aria-hidden="true"><span class="sw-plus">＋</span><span class="sw-abxy"><i>X</i><i>Y</i><i>A</i><i>B</i></span><i class="sw-stick"></i><i class="sw-home">⌂</i></aside></div>`;
    bindImages();
  }
  function render() {
    if (disposed) return;
    if (editor) { renderEditor(); return; }
    const games = visibleGames(), game = games.find(g => g.id === selected) || games[0]; selected = game?.id || null;
    const genres = [...new Set(allGames().map(g => g.genre))];
    frame(`<nav class="sw-toolbar" aria-label="游戏收藏视图"><div class="sw-tabs"><button data-view="library" aria-pressed="${view === 'library'}">游戏卡带</button><button data-view="ranking" aria-pressed="${view === 'ranking'}">我的排行</button></div><div class="sw-filters"><select aria-label="按游戏类型筛选" id="sw-filter-genre"><option value="">全部类型</option>${options(genres, genre)}</select><select aria-label="按游玩状态筛选" id="sw-filter-status"><option value="">全部状态</option>${options(GAME_STATUSES,status)}</select></div></nav><div class="sw-content">${view === 'library' ? libraryMarkup(games,game) : rankingMarkup(games)}</div>`);
    root.querySelector('.sw-add').onclick = () => openEditor(null);
    root.querySelectorAll('[data-add]').forEach(b => b.onclick = () => openEditor(null));
    root.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { view = b.dataset.view; render(); focus(`[data-view="${view}"]`); });
    for (const field of ['genre','status']) root.querySelector(`#sw-filter-${field}`).onchange = e => {
      if (field === 'genre') genre = e.target.value; else status = e.target.value;
      render(); focus(`#sw-filter-${field}`);
    };
    root.querySelectorAll('[data-game]').forEach(button => {
      button.onclick = () => selectGame(button.dataset.game);
      button.ondblclick = () => openEditor(button.dataset.game);
      button.onkeydown = e => {
        if (['ArrowRight','ArrowLeft','Home','End'].includes(e.key)) {
          e.preventDefault(); const i = games.findIndex(g => g.id === selected);
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? games.length-1 : Math.max(0,Math.min(games.length-1,i + (e.key === 'ArrowRight' ? 1 : -1)));
          selectGame(games[next].id);
        } else if (e.key === 'Enter') { e.preventDefault(); openEditor(button.dataset.game); }
      };
    });
    root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openEditor(b.dataset.edit));
    root.querySelectorAll('[data-rank]').forEach(select => select.onchange = async () => {
      if (busy) return;
      const original = getContent().games.find(g => g.id === select.dataset.rank);
      busy = true;
      root.querySelectorAll('button,select').forEach(control => {control.disabled = true;});
      try {
        const content = getContent();
        await persist({...content,games:content.games.map(g => g.id === original.id ? {...g,rating:select.value,ratingKind:'个人评级'} : g)});
        busy = false;
        render(); focus(`[data-rank="${CSS.escape(original.id)}"]`); notify(`${original.title}的评级已保存`);
      } catch(error) { busy = false; render(); focus(`[data-rank="${CSS.escape(original.id)}"]`); notify(error.message || '评级没有保存成功'); }
    });
  }
  function libraryMarkup(games,game) {
    return `<div class="sw-selection"><div><span class="sw-eyebrow">${game ? 'NOW SELECTED' : 'NEW ADVENTURE'}</span><h2>${escape(game?.title || (allGames().length ? '这一栏还没有游戏' : '第一场冒险，由你开启'))}</h2></div>${game ? `<span class="sw-rating ${tierClass(game.rating)}"><b>${escape(game.rating || '待评级')}</b><small>${escape(game.ratingKind)}</small></span>` : ''}</div><div class="sw-rail" aria-label="选择游戏卡带">${games.map(g => `<button class="sw-cartridge ${g.id === selected ? 'is-selected' : ''}" data-game="${escape(g.id)}" aria-pressed="${g.id === selected}" aria-label="选择${escape(g.title)}" tabindex="${g.id === selected ? '0' : '-1'}">${cover(g)}<span class="sw-card-caption"><strong>${escape(g.title)}</strong><small>${escape(g.status)}</small></span></button>`).join('')}<button class="sw-add-tile" data-add aria-label="添加一张游戏卡带"><span>＋</span><strong>下一场冒险</strong><small>添加游戏</small></button></div>${game ? `<section class="sw-details" aria-label="选中游戏详情"><div class="sw-description"><div class="sw-tags"><span>${escape(game.genre)}</span><span>${escape(game.platforms || game.status)}</span>${game.releaseDate && game.releaseDate > new Date().toLocaleDateString('sv-SE') ? `<span>${escape(game.releaseDate.replaceAll('-','.'))} 发售</span>` : ''}</div><p>${escape(game.description || '还没有简介，编辑资料为这张卡带写下介绍。')}</p>${game.note ? `<p class="sw-note">我的感想 · ${escape(game.note)}</p>` : ''}${game.sourceUrl ? `<a class="sw-source" href="${escape(game.sourceUrl)}" target="_blank" rel="noopener noreferrer">游戏资料 ↗</a>` : ''}</div><div class="sw-playtime"><small>${escape(game.hoursKind)}</small><strong>${hoursLabel(game)}</strong><button class="sw-button sw-accent" data-edit="${escape(game.id)}">编辑资料 <span aria-hidden="true">↗</span></button></div></section>` : '<p class="sw-empty-copy">点击「添加游戏」，放入封面、简介和你的评分。</p>'}`;
  }
  function rankingMarkup(games) {
    const tiers = [...GAME_RATINGS, ...(games.some(g => !g.rating) ? [''] : [])];
    return `<div class="sw-ranking-intro"><h2>这一次，我来排。</h2><p>推荐与期待先占位，玩过之后写下自己的答案。</p></div><div class="sw-ranking">${tiers.map(rating => `<section class="sw-rank-row"><h3 class="${tierClass(rating)}">${rating || '待评级'}</h3><div class="sw-rank-games">${games.filter(g => g.rating === rating).map(g => `<article class="sw-rank-game"><button data-edit="${escape(g.id)}" aria-label="编辑${escape(g.title)}">${cover(g)}<span><strong>${escape(g.title)}</strong><small>${escape(g.ratingKind)}</small></span></button><select data-rank="${escape(g.id)}" aria-label="${escape(g.title)}的评级">${options(['',...GAME_RATINGS],g.rating)}</select></article>`).join('') || '<span class="sw-rank-empty">暂时空位</span>'}</div></section>`).join('')}</div>`;
  }
  function selectGame(id) {
    selected = id; const oldScroll = root.querySelector('.sw-rail')?.scrollLeft || 0; render();
    const rail = root.querySelector('.sw-rail'); if (rail) rail.scrollLeft = oldScroll;
    const target = root.querySelector(`[data-game="${CSS.escape(id)}"]`); target?.focus({preventScroll:true});
    target?.scrollIntoView({block:'nearest',inline:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }
  function openEditor(id) {
    if (busy || disposed) return;
    editor = {...(drafts.get(id || 'new') || (id ? normalizeGameForDisplay(getContent().games.find(g => g.id === id)) : {id:null,title:'',status:'在玩',note:'',cover:'',description:'',genre:'动作冒险',rating:'',ratingKind:'个人评级',hours:null,hoursKind:'实际游玩',platforms:'',releaseDate:'',sourceUrl:''}))};
    render(); focus('#sw-title');
  }
  function trackDraft() {
    if (!editor) return;
    const form = root.querySelector('#sw-editor'); if (!form) return;
    for (const field of ['title','status','note','description','genre','rating','ratingKind','hoursKind','platforms','releaseDate','sourceUrl']) editor[field] = form.elements[field].value;
    editor.hours = form.elements.hours.value === '' ? null : Number(form.elements.hours.value);
    drafts.set(editor.id || 'new',{...editor});
  }
  function leaveEditor() {
    if (busy) return;
    trackDraft(); const returnId = editor.id || selected; ++uploadToken; editor = null; render();
    const selector = returnId ? `[data-${view === 'ranking' ? 'edit' : 'game'}="${CSS.escape(returnId)}"]` : '.sw-add';
    focus(root.querySelector(selector) ? selector : '.sw-add');
  }
  function renderEditor() {
    const game = editor;
    frame(`<div class="sw-content sw-editor-content"><form id="sw-editor"><div class="sw-editor-grid"><aside class="sw-cover-field"><div id="sw-cover-preview">${cover(game)}</div><label class="sw-button sw-upload" for="sw-upload">${game.cover ? '更换封面' : '上传封面'}<input id="sw-upload" type="file" accept="image/jpeg,image/png,image/webp"></label><button type="button" class="sw-text" id="sw-clear-cover" ${game.cover ? '' : 'hidden'}>移除封面</button><p>JPG / PNG / WebP<br>最大 10 MB，自动压缩保存</p><output id="sw-upload-state" aria-live="polite"></output></aside><div class="sw-fields"><label for="sw-title">游戏名称<input id="sw-title" name="title" value="${escape(game.title)}" maxlength="100" placeholder="这一场冒险叫什么？" required></label><div class="sw-field-pair"><label>游戏类型<input name="genre" list="sw-genres" value="${escape(game.genre)}" maxlength="32"><datalist id="sw-genres">${GAME_GENRES.map(g => `<option value="${g}">`).join('')}</datalist></label><label>游玩状态<select name="status">${options(GAME_STATUSES,game.status)}</select></label></div><label>游戏简介<textarea name="description" rows="3" maxlength="4000" placeholder="游戏世界、玩法，或它吸引你的地方。">${escape(game.description)}</textarea></label><fieldset class="sw-rating-field"><legend>我的评级</legend><div class="sw-rating-options">${['',...GAME_RATINGS].map(r => `<label class="${tierClass(r)}"><input type="radio" name="rating" value="${r}" ${game.rating === r ? 'checked' : ''}><span>${r || '待评级'}</span></label>`).join('')}</div></fieldset><div class="sw-field-pair"><label>评级性质<select name="ratingKind">${options(['个人评级','编辑推荐','期待评级'],game.ratingKind)}</select></label><div class="sw-hours-field"><label>游戏时长（小时）<input name="hours" type="number" min="0" max="100000" step="0.1" value="${game.hours ?? ''}" placeholder="未填写"></label><label>时长性质<select name="hoursKind">${options(['实际游玩','参考主线'],game.hoursKind)}</select></label></div></div><details class="sw-more"><summary>感想与更多资料</summary><label>一句游戏感想<textarea name="note" maxlength="100000" rows="2">${escape(game.note)}</textarea></label><div class="sw-field-pair"><label>游戏平台<input name="platforms" maxlength="120" value="${escape(game.platforms)}" placeholder="PC / PS5…"></label><label>发售日期<input name="releaseDate" type="date" value="${escape(game.releaseDate)}"></label></div><label>资料链接<input name="sourceUrl" type="url" value="${escape(game.sourceUrl)}" placeholder="https://" maxlength="2000"></label></details></div></div><div class="sw-editor-actions"><button type="button" class="sw-text" id="sw-remove" ${game.id ? '' : 'hidden'}>移出收藏</button><span id="sw-form-error" role="alert"></span><button type="submit" class="sw-button sw-accent" id="sw-save">${game.id ? '保存修改' : '放入收藏'} ↗</button></div></form></div>`,true);
    root.querySelector('.sw-back').onclick = leaveEditor;
    const form = root.querySelector('#sw-editor');
    form.addEventListener('input',trackDraft); form.addEventListener('change',trackDraft);
    form.elements.rating.forEach(radio => radio.addEventListener('change',() => { form.elements.ratingKind.value = '个人评级'; trackDraft(); }));
    root.querySelector('#sw-clear-cover').onclick = () => { trackDraft(); ++uploadToken; editor.cover = ''; drafts.set(editor.id || 'new',{...editor}); renderEditor(); focus('.sw-upload input'); };
    root.querySelector('#sw-upload').onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      const token = ++uploadToken; root.querySelector('#sw-save').disabled = true; root.querySelector('#sw-upload-state').textContent = '正在处理封面…';
      try {
        const result = await readCover(file); if (disposed || token !== uploadToken || !editor) return;
        editor.cover = result; trackDraft(); root.querySelector('#sw-cover-preview').innerHTML = cover(editor); root.querySelector('#sw-clear-cover').hidden = false; root.querySelector('#sw-upload-state').textContent = '封面已准备好';
      } catch(error) { if (!disposed && token === uploadToken && editor) root.querySelector('#sw-upload-state').textContent = error.message || '封面上传失败'; }
      finally { if (!disposed && token === uploadToken && editor) { root.querySelector('#sw-save').disabled = false; e.target.value = ''; } }
    };
    form.onsubmit = async e => {
      e.preventDefault(); if (busy || root.querySelector('#sw-save').disabled) return; trackDraft();
      const save = {...editor,id:editor.id || crypto.randomUUID(),title:editor.title.trim(),genre:editor.genre.trim() || '其他'};
      if (!save.cover) delete save.cover; if (!save.sourceUrl.trim()) delete save.sourceUrl; else save.sourceUrl = save.sourceUrl.trim();
      const errorOutput = root.querySelector('#sw-form-error');
      try {
        if (allGames().some(g => g.id !== save.id && g.title.trim().toLowerCase() === save.title.toLowerCase())) throw new Error('这款游戏已经在收藏里');
        const validated = validateGameRecord(save), content = getContent(); busy = true; setEditorBusy(true);
        await persist({...content,games:editor.id ? content.games.map(g => g.id === editor.id ? validated : g) : [...content.games,validated]});
        drafts.delete(editor.id || 'new'); selected = save.id; editor = null; genre = ''; status = ''; view = 'library'; busy = false;
        if (!disposed) selectGame(save.id); notify('游戏资料已保存');
      } catch(error) { busy = false; if (!disposed) { setEditorBusy(false); errorOutput.textContent = error.message || '没有保存成功，请重试'; } }
    };
    root.querySelector('#sw-remove').onclick = async e => {
      if (e.currentTarget.dataset.confirm !== 'yes') { e.currentTarget.dataset.confirm = 'yes'; e.currentTarget.textContent = '再次点击，确认移出'; return; }
      if (busy) return; busy = true; setEditorBusy(true);
      try { const content = getContent(); await persist({...content,games:content.games.filter(g => g.id !== editor.id)}); drafts.delete(editor.id); editor = null; busy = false; render(); focus('.sw-add'); notify('已移出收藏'); }
      catch(error) { busy = false; if (!disposed) { setEditorBusy(false); root.querySelector('#sw-form-error').textContent = error.message || '移出失败'; } }
    };
  }
  function setEditorBusy(value) { root.querySelectorAll('#sw-editor button,#sw-editor input,#sw-editor select,#sw-editor textarea,.sw-back').forEach(el => {el.disabled = value;}); }
  const onKey = e => { if (e.key === 'Escape' && editor) { e.preventDefault(); e.stopPropagation(); leaveEditor(); } };
  root.addEventListener('keydown',onKey);
  render();
  return () => { disposed = true; ++uploadToken; root.removeEventListener('keydown',onKey); };
}
