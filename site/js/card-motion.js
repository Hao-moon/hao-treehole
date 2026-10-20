// 物件卡片：一次翻入、一拍定格，再落定。取消动画也必须释放等待。
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
export function accent(element,kind='select'){
  if(!element||reduced.matches)return;
  const frames=kind==='paper'
    ?[{opacity:.3,transform:'perspective(900px) rotateY(-12deg) translateX(20px)'},{opacity:1,transform:'perspective(900px) rotateY(2deg) translateX(-3px)',offset:.72},{opacity:1,transform:'none'}]
    :[{translate:'-7px 0',scale:'1.03'},{translate:'3px 0',scale:'1.03',offset:.5},{translate:'3px 0',scale:'1.03',offset:.65},{translate:'0 0',scale:'1'}];
  element.getAnimations().filter(a=>a.id==='selection-impact').forEach(a=>a.cancel());
  const animation=element.animate(frames,{duration:kind==='paper'?320:260,easing:'cubic-bezier(.17,.8,.25,1)'});
  animation.id='selection-impact';
}
export function createCardMotion(panel){
  let generation=0,animations=[],physicalObject=null;
  function reset(){generation++;animations.forEach(a=>a.cancel());animations=[];return generation;}
  function play(element,frames,options){const a=element.animate(frames,{fill:'both',...options});a.finished.catch(()=>{});animations.push(a);return a;}
  function offset(point){return {x:Math.round((point?.x??innerWidth/2)-innerWidth/2),y:Math.round((point?.y??innerHeight/2)-innerHeight/2)};}
  async function enter(point,book,deck){
    const token=reset();panel.dataset.phase='opening';
    panel.dataset.bookMode=panel.dataset.section==='books'&&book?'physical':'static';
    const next=panel.dataset.section==='books'&&book?book:panel.dataset.section==='music'&&deck?deck:null;
    if(physicalObject&&physicalObject!==next)physicalObject.reset();
    physicalObject=next;
    if(physicalObject){
      const done=await physicalObject.open(panel);
      if(!done||token!==generation)return false;
      panel.dataset.phase='open';return true;
    }
    if(reduced.matches){panel.dataset.phase='open';return true;}
    const {x,y}=offset(point);
    if(panel.dataset.section==='music'){
      const animation=play(panel,[{opacity:0,transform:`translate(${x*.25}px,${y*.25}px) scale(.82)`},{opacity:1,transform:'none'}],{duration:420,easing:'cubic-bezier(.16,1,.3,1)'});
      try{await animation.finished;}catch{return false;}
      if(token!==generation)return false;
      animations.forEach(a=>a.cancel());animations=[];panel.dataset.phase='open';return true;
    }
    const launch=`perspective(1100px) translate(${x}px,${y}px) rotateY(-48deg) rotateZ(-17deg) scale(.12)`;
    const impact='perspective(1100px) translate(-7px,-3px) rotateY(0deg) rotateZ(-1.2deg) scale(1.025)';
    const animation=play(panel,[
      {opacity:0,transform:launch,offset:0},
      {opacity:.7,transform:launch,offset:.12},
      {opacity:1,transform:impact,offset:.68},
      {opacity:1,transform:impact,offset:.78},
      {opacity:1,transform:'perspective(1100px) translate(0,0) rotateY(0deg) rotateZ(0deg) scale(1)',offset:1}
    ],{duration:540,easing:'cubic-bezier(.16,.78,.24,1)'});
    play(panel.querySelector('.object-heading'),[{opacity:0,translate:'-28px 6px'},{opacity:1,translate:'4px 0',offset:.8},{opacity:1,translate:'0 0'}],{delay:230,duration:280});
    play(panel.querySelector('.panel-content'),[{opacity:0,translate:'16px 0'},{opacity:1,translate:'0 0'}],{delay:310,duration:230});
    play(panel.querySelector('.page-slash'),[{transform:'translateX(-130%) skewX(-20deg)'},{transform:'translateX(-130%) skewX(-20deg)',offset:.35},{transform:'translateX(130%) skewX(-20deg)'}],{duration:500});
    try{await animation.finished;}catch{return false;}
    if(token!==generation)return false;
    animations.forEach(a=>a.cancel());animations=[];panel.dataset.phase='open';return true;
  }
  async function leave(point){
    if(physicalObject){
      const token=reset();panel.dataset.phase='closing';
      const done=await physicalObject.close();
      if(!done||token!==generation)return false;
      panel.dataset.phase='closed';return true;
    }
    // Capture the in-flight frame before cancelling, so Escape never causes a jump.
    const frame=getComputedStyle(panel),from={transform:frame.transform,opacity:frame.opacity};
    const token=reset();panel.dataset.phase='closing';
    if(!reduced.matches){const {x,y}=offset(point);const animation=play(panel,[from,{transform:`perspective(1100px) translate(${x}px,${y}px) rotateY(45deg) rotateZ(12deg) scale(.1)`,opacity:0}],{duration:240,easing:'cubic-bezier(.6,0,.85,.45)'});try{await animation.finished;}catch{return false;}}
    if(token!==generation)return false;
    panel.dataset.phase='closed';return true;
  }
  function clear(){reset();physicalObject?.reset();physicalObject=null;panel.dataset.phase='closed';}
  return {enter,leave,clear};
}
