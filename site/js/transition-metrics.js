// Opt-in local diagnostics; no telemetry and no work in normal visits.
export function measureTransition(from,to){
  if(!new URLSearchParams(location.search).has('transitionDebug'))return {phase(){},finish(){}};
  const start=performance.now(),phases=[],frames=[],tasks=[];
  let phase='prepare',last=start,raf,observer;
  function tick(now){frames.push({phase,ms:now-last});last=now;raf=requestAnimationFrame(tick);}
  raf=requestAnimationFrame(tick);
  try{observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(entry=>({start:entry.startTime,ms:entry.duration}))));observer.observe({type:'longtask'});}catch{}
  return {
    phase(name){phase=name;last=performance.now();phases.push({name,at:last-start});},
    finish(){
      cancelAnimationFrame(raf);observer?.disconnect();
      const reveal=frames.filter(frame=>frame.phase==='reveal').map(frame=>frame.ms).sort((a,b)=>a-b);
      console.info('[world-transition]',JSON.stringify({from,to,totalMs:Math.round(performance.now()-start),phases:phases.map(entry=>({...entry,at:Math.round(entry.at)})),revealFrames:reveal.length,revealP95Ms:Math.round(reveal[Math.floor(reveal.length*.95)]||0),revealMaxMs:Math.round(reveal.at(-1)||0),longTasks:tasks.map(entry=>({at:Math.round(entry.start-start),ms:Math.round(entry.ms)}))}));
    }
  };
}
