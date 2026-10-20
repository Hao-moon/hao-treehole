// Finish resource work before revealing. Escape skips the reveal, never the
// preparation or cleanup needed to leave an interactive room.
export async function runTransition({intro,prepare,reveal,finish,skip=()=>false}){
  try{
    await intro();
    await prepare();
    if(!skip())await reveal();
  }finally{finish();}
}

// Background/embedded views can throttle frame callbacks even while reporting
// visibilityState='visible'. Never let a paint opportunity hold up the switch.
export function afterPaint({requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=id=>cancelAnimationFrame(id),limit=80}={}){
  return new Promise(resolve=>{
    let frame,timer;
    const done=()=>{clearTimeout(timer);cancelFrame(frame);resolve();};
    frame=requestFrame(done);timer=setTimeout(done,limit);
  });
}

export function animationDone(animation,limit){
  let timer;
  const deadline=new Promise(resolve=>{timer=setTimeout(resolve,limit);});
  return Promise.race([animation.finished.catch(()=>{}),deadline]).finally(()=>clearTimeout(timer));
}
