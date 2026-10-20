export function createExplorer() {
  const root=document.querySelector('.exploration'),trigger=document.querySelector('#explore-toggle'),drawer=document.querySelector('#explore-drawer');
  function close(restoreFocus=false){
    drawer.hidden=true;trigger.setAttribute('aria-expanded','false');
    if(restoreFocus)trigger.focus({preventScroll:true});
  }
  trigger.addEventListener('click',()=>{
    if(!drawer.hidden){close();return;}
    drawer.hidden=false;trigger.setAttribute('aria-expanded','true');
    drawer.querySelector('button:not([hidden])')?.focus({preventScroll:true});
  });
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!drawer.hidden){event.preventDefault();event.stopPropagation();close(true);}
  });
  root.addEventListener('focusout',event=>{if(event.relatedTarget&&!root.contains(event.relatedTarget))close();});
  document.addEventListener('pointerdown',event=>{if(!root.contains(event.target)&&!drawer.hidden)close(drawer.contains(document.activeElement));});
  drawer.addEventListener('click',event=>{if(event.target.closest('[data-dismiss-explore]'))close(true);});
  return {close:()=>close(drawer.contains(document.activeElement))};
}
