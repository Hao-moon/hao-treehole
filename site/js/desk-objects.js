export {mountGames} from './games.js';

export function mountTower(root){
  root.innerHTML=`<div class="tower-layout"><div class="tower-illustration" aria-hidden="true"><div class="tower-vents"></div><i class="fan"></i><i class="fan"></i><div class="tower-strip"></div></div><section class="tower-control"><span class="paper-caption">DESKTOP / POWER</span><h2>唤醒一点灵感。</h2><p>按下电源，看风扇和指示灯亮起。</p><button class="power-switch" aria-pressed="false">启动主机</button><output class="power-state" aria-live="polite">待机中</output><div class="power-leds" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div></section></div>`;
  const button=root.querySelector('button');button.onclick=()=>{const on=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(on));button.textContent=on?'进入待机':'启动主机';root.querySelector('.tower-layout').classList.toggle('powered',on);root.querySelector('output').textContent=on?'已启动 · 随时出发':'待机中';};
  return ()=>{};
}

export function mountKeyboard(root){
  const rows=['Q W E R T Y U I O P','A S D F G H J K L','Z X C V B N M'];
  root.innerHTML=`<div class="keyboard-play"><div class="key-display" aria-live="polite"><small>KEY / PLAY</small><strong>敲下一点节奏。</strong><span>按字母键，或点击下面的键帽</span></div><div class="keyboard-model" aria-label="互动键盘">${rows.map(row=>`<div class="keyboard-row">${row.split(' ').map(key=>`<button data-key="${key}" aria-label="${key} 键">${key}</button>`).join('')}</div>`).join('')}<div class="keyboard-row"><button class="space-key" data-key="SPACE" aria-label="空格键">SPACE</button></div></div><p class="small-copy">这一刻，随手弹奏。不记录输入。</p></div>`;
  let last=null,timer;
  function strike(key){const button=root.querySelector(`[data-key="${key}"]`);if(!button)return;last?.classList.remove('pressed');button.classList.add('pressed');last=button;root.querySelector('.key-display strong').textContent=key==='SPACE'?'留一点空白。':key;clearTimeout(timer);timer=setTimeout(()=>button.classList.remove('pressed'),260);}
  const keydown=e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.repeat||e.target.closest('input,textarea,select,[contenteditable=true]'))return;if(e.key===' '&&e.target.closest('button:not([data-key])'))return;const key=e.key===' '?'SPACE':e.key.toUpperCase();if(/^[A-Z]$/.test(key)||key==='SPACE'){e.preventDefault();strike(key);}};
  root.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>strike(b.dataset.key));
  window.addEventListener('keydown',keydown);return ()=>{clearTimeout(timer);window.removeEventListener('keydown',keydown);};
}
