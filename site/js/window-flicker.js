// Small, staggered groups of lit windows. No frame loop while the city is quiet.
export const WINDOW_PULSE_MS=2400;
export const WINDOW_QUIET_MS=Object.freeze([1800,3200]);
export const WINDOW_FIRST_MS=Object.freeze([600,1100]);
export const WINDOW_STAGGER_MS=Object.freeze([160,300]);

export function createWindowFlicker({count,weights=[],show=()=>{},clear=()=>{},random=Math.random,scheduler=globalThis}={}){
  let active=false,disposed=false,generation=0,first=true,last=[];
  const timers=new Set(),lit=new Set();
  const sample=()=>Math.min(.999999,Math.max(0,Number(random())||0));
  const between=range=>range[0]+sample()*(range[1]-range[0]);
  function later(fn,delay){
    const token=generation;
    const timer=scheduler.setTimeout(()=>{timers.delete(timer);if(token===generation&&active&&!disposed)fn();},delay);
    timers.add(timer);
  }
  function cancel(){generation++;for(const timer of timers)scheduler.clearTimeout(timer);timers.clear();for(const index of lit)clear(index);lit.clear();}
  function pick(options){
    const total=options.reduce((sum,i)=>sum+Math.max(1,weights[i]||1),0);let value=sample()*total;
    for(const i of options){value-=Math.max(1,weights[i]||1);if(value<0)return i;}
    return options.at(-1);
  }
  function schedule(){
    if(!active||disposed||!(count>0))return;
    later(()=>{
      const size=Math.min(count,4+Math.floor(sample()*3));
      let options=Array.from({length:count},(_,i)=>i);
      if(count-last.length>=size)options=options.filter(i=>!last.includes(i));
      const group=[];
      while(group.length<size){
        const large=first&&group.length===0?options.filter(i=>(weights[i]||1)>=Math.max(1,...weights)*.75):[];
        const index=pick(large.length?large:options);group.push(index);options=options.filter(i=>i!==index);
      }
      first=false;last=group;
      let remaining=group.length,delay=0;
      group.forEach((index,position)=>{
        const illuminate=()=>{lit.add(index);show(index);later(()=>{clear(index);lit.delete(index);if(--remaining===0)schedule();},WINDOW_PULSE_MS);};
        if(position===0)illuminate();else{delay+=between(WINDOW_STAGGER_MS);later(illuminate,delay);}
      });
    },between(first?WINDOW_FIRST_MS:WINDOW_QUIET_MS));
  }
  return {
    setActive(value){const next=!!value;if(disposed||next===active)return;active=next;cancel();if(active)schedule();},
    dispose(){if(disposed)return;disposed=true;active=false;cancel();},
  };
}
