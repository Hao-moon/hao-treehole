// Only the foliage group receives this pose. The pot, soil and roots stay still.
export const PLANT_FLEX=Object.freeze({'crested-aeonium':.9,agave:.6,'bat-flower':1.1,alocasia:1});

export function samplePlantSway({kind,elapsed,duration,amplitude,direction=1,phase=0,initial={x:0,z:0}}){
  const t=Math.min(1,Math.max(0,elapsed/duration));
  if(t===1)return {x:0,z:0,done:true};
  const carry=Math.exp(-7*t)*(1-t),envelope=kind==='touch'?Math.exp(-3.5*t)*(1-t):Math.sin(Math.PI*t)**2;
  const wave=kind==='touch'?Math.sin(t*Math.PI*5):Math.sin(t*Math.PI*2)+.22*Math.sin(t*Math.PI*5);
  return {
    x:initial.x*carry+amplitude*.32*envelope*Math.sin(t*Math.PI*(kind==='touch'?4:2.4)+phase)*Math.sin(Math.PI*t),
    z:initial.z*carry+amplitude*direction*envelope*wave,
    done:false,
  };
}

// The scheduler sleeps on a timer between gusts. It owns an RAF only while a
// gust/touch is moving, so an idle or background tab does no animation work.
export function createPlantMotion({onPose,strength=()=>1,enabled=true,random=Math.random,now=()=>performance.now(),requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=id=>cancelAnimationFrame(id),setTimer=(callback,delay)=>setTimeout(callback,delay),clearTimer=id=>clearTimeout(id)}={}){
  let active=enabled,disposed=false,timer=null,frame=null,motion=null,pose={x:0,z:0};
  const unit=()=>Math.min(1,Math.max(0,Number(random())||0));
  function apply(next){pose={x:next.x,z:next.z};onPose(pose);}
  function cancel(){if(timer!==null)clearTimer(timer);if(frame!==null)cancelFrame(frame);timer=frame=null;motion=null;}
  function neutral(){if(pose.x||pose.z)apply({x:0,z:0});}
  function schedule(first=false){
    if(!active||disposed)return;
    timer=setTimer(()=>{timer=null;start('breeze');},first?2500+unit()*6000:6000+unit()*13000);
  }
  function tick(time){
    frame=null;if(!active||disposed||!motion)return;
    const next=samplePlantSway({...motion,elapsed:time-motion.start});apply(next);
    if(next.done){motion=null;schedule();}else frame=requestFrame(tick);
  }
  function start(kind){
    if(!active||disposed)return false;
    cancel();const flex=Math.max(.2,Math.min(1.5,Number(strength())||1));
    motion={kind,start:now(),duration:kind==='touch'?1600:2300+unit()*1000,amplitude:(kind==='touch'?.105:.014+unit()*.009)*flex,direction:unit()<.5?-1:1,phase:unit()*Math.PI,initial:{...pose}};
    frame=requestFrame(tick);return true;
  }
  schedule(true);
  return {
    touch:()=>start('touch'),
    reset(){if(disposed)return;cancel();neutral();schedule(true);},
    setEnabled(value){if(disposed||active===Boolean(value))return;active=Boolean(value);cancel();neutral();if(active)schedule(true);},
    dispose(){if(disposed)return;disposed=true;cancel();neutral();},
  };
}
