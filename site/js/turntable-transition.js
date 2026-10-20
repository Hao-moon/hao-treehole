// Reversal starts at the displayed position; cancelled moves always settle.
export function createDeckTransition({initial=0,draw,request=requestAnimationFrame,cancel=cancelAnimationFrame,clock=()=>performance.now(),reduced=()=>false}){
  let value=initial,frame=0,settle=null;
  function stop(){cancel(frame);frame=0;if(settle){settle(false);settle=null;}}
  function snap(next){stop();value=next;draw(value);}
  return {
    get value(){return value;},
    snap,
    move(to){stop();const from=value,start=clock(),duration=reduced()?0:Math.max(160,Math.abs(to-from)*(to?860:680));
      return new Promise(resolve=>{settle=resolve;function tick(now){const t=duration?Math.min(1,Math.max(0,(now-start)/duration)):1;const eased=t*t*(3-2*t);value=from+(to-from)*eased;draw(value);if(t<1)frame=request(tick);else{frame=0;settle=null;resolve(true);}}frame=request(tick);});
    },
    dispose:stop
  };
}
