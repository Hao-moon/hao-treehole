// Persistent motor state survives view lifetimes. The desk includes ambience;
// the close-up uses its own instance driven only by the selected record.
export function advanceDisc(state, seconds, running) {
  const dt = Math.max(0, seconds), target = running ? Math.PI * 2 * 33.333 / 60 : 0;
  const rate = running ? 5.5 : 3.8, decay = Math.exp(-rate * dt);
  const speed = target + (state.speed - target) * decay;
  const distance = target * dt + (state.speed - target) * (1 - decay) / rate;
  return {angle: (state.angle + distance) % (Math.PI * 2), speed: !running && speed < .001 ? 0 : speed};
}

export function createDiscMotion({request=requestAnimationFrame, cancel=cancelAnimationFrame, clock=()=>performance.now(), events=document, motion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')}={}) {
  let state={angle:0,speed:0}, running=false, previous=clock(), frame=0, disposed=false;
  const listeners=new Set();
  const snapshot=()=>({...state,running,reducedMotion:!!motion?.matches});
  function advance(now){if(!motion?.matches)state=advanceDisc(state,Math.max(0,now-previous)/1000,running);previous=now;}
  function emit(){const current=snapshot();listeners.forEach(listener=>listener(current));}
  function schedule(){if(!frame&&!disposed&&!events.hidden&&!motion?.matches&&(running||state.speed))frame=request(tick);}
  function tick(now){frame=0;advance(now);emit();schedule();}
  function visibility(){if(events.hidden){cancel(frame);frame=0;}else{advance(clock());emit();schedule();}}
  function motionChanged(){cancel(frame);frame=0;state.speed=0;previous=clock();emit();schedule();}
  events.addEventListener('visibilitychange',visibility);
  motion?.addEventListener('change',motionChanged);
  return {
    snapshot,
    alignAngle(angle){if(!Number.isFinite(angle))return;advance(clock());state.angle=((angle%(Math.PI*2))+Math.PI*2)%(Math.PI*2);emit();},
    setRunning(value){advance(clock());running=Boolean(value);emit();schedule();},
    subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);},
    dispose(){disposed=true;cancel(frame);events.removeEventListener('visibilitychange',visibility);motion?.removeEventListener('change',motionChanged);listeners.clear();}
  };
}
