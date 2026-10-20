// Two UNIT-02 inspired finishes, printed directly on the turntable surfaces.
// Canvas textures keep the moving instrument self-contained and work offline.
import {ghostWorld} from './world-theme.js';
const PAPER='#f1f0e9',INK='#141a21',ORANGE='#f4a444';
const SANS='Arial, "Microsoft YaHei", sans-serif';
const MONO='"Courier New", "Microsoft YaHei", monospace';
const clock=value=>{const n=Math.max(0,Math.floor(Number(value)||0));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};

export function createTurntableSkin(THREE,root,resources,{artTexture,desktop=false,skin='original'}={}){
  const SCARLET=ghostWorld?'#9fb394':'#e6342b';
  const armor=skin==='eva02';
  const marking=armor?PAPER:'#24282d',secondary=armor?ORANGE:'#777c7e',accent=armor?ORANGE:ghostWorld?'#789174':'#d91f42';
  const chassis=root.getObjectByName('chassis')||root;
  const group=new THREE.Group();group.name=`ORBIT-02 ${armor?'armor':'original'} surface markings`;chassis.add(group);
  const controls={
    play:{position:[-.19,.084,.145],size:[.045,.027]},
    like:{position:[-.205,.0915,.092],size:[.026,.026]},
    previous:{position:[-.132,.079,.16],size:[.031,.018]},
    next:{position:[-.09,.079,.16],size:[.031,.018]},
    import:{position:[.211,.079,-.16],size:[.041,.024]},
    close:{position:[.211,.079,-.126],size:[.041,.024]},
    skin:{position:[.211,.079,-.092],size:[.041,.024]},
  };
  function surface(name,position,size,resolution,paint,{action,parent=group,transparent=true}={}){
    const canvas=document.createElement('canvas');canvas.width=resolution[0];canvas.height=resolution[1];
    const context=canvas.getContext('2d');
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=4;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
    const geometry=new THREE.PlaneGeometry(size[0],size[1]);
    const Material=ghostWorld?THREE.MeshStandardMaterial:THREE.MeshBasicMaterial;
    const material=new Material({map:texture,transparent,alphaTest:.01,depthWrite:!transparent,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,...(ghostWorld?{roughness:.55,metalness:.12}:{})});
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(...position);mesh.rotation.x=-Math.PI/2;
    mesh.userData.deckSurface=true;if(action)mesh.userData.deckAction=action;parent.add(mesh);
    resources.add(texture);resources.add(geometry);resources.add(material);
    const redraw=value=>{context.clearRect(0,0,canvas.width,canvas.height);paint(context,canvas.width,canvas.height,value);texture.needsUpdate=true;};
    redraw();return {mesh,redraw};
  }
  function text(ctx,value,x,y,size,color=INK,weight=700,align='left',family=SANS){
    ctx.fillStyle=color;ctx.font=`${weight} ${size}px ${family}`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(value,x,y);
  }
  function fitted(ctx,value,maxWidth){
    if(ctx.measureText(value).width<=maxWidth)return value;
    let result=value;while(result.length&&ctx.measureText(result+'…').width>maxWidth)result=result.slice(0,-1);
    return result+'…';
  }

  function polygon(ctx,points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
  function octagons(ctx,x,y,r,color=ORANGE){
    ctx.strokeStyle=color;ctx.lineWidth=2;
    for(let layer=0;layer<4;layer++){ctx.beginPath();for(let k=0;k<8;k++){const a=k*Math.PI/4+Math.PI/8,rr=r+layer*19;const px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;k?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.stroke();}
  }
  // Full enamel livery, masked naturally by the real platter, arm and controls.
  surface('UNIT-02 armor livery',[0,.07265,0],[.477,.367],[1908,1468],(ctx,w,h)=>{
    if(!armor){
      ctx.fillStyle='#e9e8e1';ctx.fillRect(0,0,w,h);
      // Hairline panel divisions and a quiet warm-silver equipment finish.
      ctx.fillStyle='#e0e1dd';ctx.fillRect(w*.702,42,w*.278,h-84);
      ctx.strokeStyle='#c4c7c4';ctx.lineWidth=2;ctx.strokeRect(31,31,w-62,h-62);
      ctx.beginPath();ctx.moveTo(w*.69,52);ctx.lineTo(w*.69,h*.74);ctx.stroke();
      ctx.fillStyle=accent;ctx.fillRect(0,126,10,183);
      text(ctx,'STEREO / 02',55,h*.747,20,'#656c6d',600,'left',MONO);
      text(ctx,'02',w*.82,h*.82,155,'#c9cecb',900,'center');
      for(let i=0;i<5;i++){ctx.fillStyle=i===0?accent:'#b8bfbd';ctx.fillRect(w-171+i*19,h-51,9,18);}
      polygon(ctx,[[45,h*.45],[74,h*.466],[45,h*.482]],accent);
      return;
    }
    ctx.fillStyle='#c92d29';ctx.fillRect(0,0,w,h);
    polygon(ctx,[[w*.704,0],[w,0],[w,h],[w*.68,h],[w*.68,h*.29]],INK);
    polygon(ctx,[[0,h*.78],[w*.42,h*.78],[w*.49,h*.88],[w*.67,h*.88],[w*.67,h],[0,h]],'#22272d');
    polygon(ctx,[[0,0],[w*.33,0],[w*.29,38],[0,38]],'#ee5b40');
    polygon(ctx,[[w*.67,h*.32],[w*.69,h*.27],[w*.69,h*.70],[w*.67,h*.75]],ORANGE);
    // Warning chevrons on the left edge; no added UI outside the instrument.
    ctx.save();ctx.beginPath();ctx.rect(9,90,27,h*.55);ctx.clip();
    for(let y=90;y<h*.7;y+=48)polygon(ctx,[[0,y],[50,y-28],[50,y-8],[0,y+20]],'#f2b453');ctx.restore();
    ctx.strokeStyle='#ed6e4b';ctx.lineWidth=3;ctx.strokeRect(43,56,w*.62,h*.66);
    text(ctx,'PRODUCTION MODEL',55,h*.75,20,PAPER,600,'left',MONO);
    text(ctx,'02',w*.82,h*.82,180,'#2b353c',900,'center');
    text(ctx,'A.T. FIELD',w*.82,h*.55,26,ORANGE,700,'center',MONO);
    // Chassis-fixed index: moving record markers visibly pass this reference.
    polygon(ctx,[[45,h*.45],[78,h*.466],[45,h*.482]],PAPER);
  },{transparent:false});

  surface('UNIT-02 AT field insignia',[.137,.0734,.032],[.083,.119],[830,1190],(ctx,w,h)=>{
    if(!armor){
      ctx.save();ctx.globalAlpha=.75;octagons(ctx,w/2,h*.46,210,'#b5bfbb');ctx.restore();
      // A small, abstract field diagram reads as equipment engraving, not a poster.
      ctx.strokeStyle='#a1adaa';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(w/2-29,h*.46);ctx.lineTo(w/2+29,h*.46);ctx.moveTo(w/2,h*.46-29);ctx.lineTo(w/2,h*.46+29);ctx.stroke();
      text(ctx,'02',w/2,h*.46+118,67,'#aab6b2',700,'center',MONO);
      text(ctx,'A.T. FIELD',w/2,h-177,40,'#737e7b',700,'center',MONO);
      text(ctx,'ORBIT STUDIO / AUDIO',w/2,h-110,28,'#7a8481',400,'center',MONO);
      ctx.fillStyle=accent;ctx.fillRect(w/2-14,h-52,28,4);
      return;
    }
    ctx.save();ctx.globalAlpha=.45;octagons(ctx,w/2,h*.48,255);ctx.restore();
    if(artTexture?.image)ctx.drawImage(artTexture.image,28,115,w-56,w-56);
    text(ctx,'ORBIT STUDIO',w/2,h-159,43,PAPER,900,'center');
    text(ctx,'TEST / TYPE 02',w/2,h-95,31,ORANGE,700,'center',MONO);
    ctx.fillStyle=ORANGE;ctx.fillRect(w*.32,h-42,w*.36,5);
  });
  const front=surface('UNIT-02 front armor',[0,.047,.191],[.446,.023],[1784,92],(ctx,w,h)=>{
    if(!armor){
      ctx.fillStyle='#20242a';ctx.fillRect(0,0,w,h);
      text(ctx,'ORBIT / 02',35,h/2,31,'#c7cccb',700,'left',MONO);
      text(ctx,'DIRECT DRIVE STEREO',365,h/2,20,'#8c9595',400,'left',MONO);
      text(ctx,'ORIGINAL EDITION',w-35,h/2,19,'#a2aaa7',400,'right',MONO);
      ctx.fillStyle=accent;ctx.fillRect(w-444,h/2-3,48,6);
      return;
    }
    ctx.fillStyle=INK;ctx.fillRect(0,0,w,h);
    text(ctx,'ORBIT STUDIO',35,h/2,38,PAPER,900);
    text(ctx,'PRODUCTION MODEL 02',425,h/2,22,'#a0a6a9',700,'left',MONO);
    ctx.fillStyle=ORANGE;ctx.fillRect(w-560,0,560,h);
    for(let x=w-590;x<w+50;x+=64)polygon(ctx,[[x,0],[x+29,0],[x+79,h],[x+50,h]],INK);
  },{transparent:false});front.mesh.rotation.x=0;
  // Recessed metal fasteners reinforce the object's depth when it is turned.
  for(const x of [-.228,.228])for(const z of [-.174,.174]){
    const geometry=new THREE.CylinderGeometry(.0035,.0035,.0012,12),material=new THREE.MeshBasicMaterial({color:'#aeb1b5'});
    const bolt=new THREE.Mesh(geometry,material);bolt.position.set(x,.0734,z);group.add(bolt);resources.add(geometry);resources.add(material);
  }

  // The narrow back edge is clear of both the platter and the tonearm sweep.
  surface('ORBIT-02 rear silkscreen',[-.066,.0731,-.176],[.315,.019],[1575,95],(ctx,w,h)=>{
    ctx.fillStyle=accent;ctx.fillRect(0,0,13,h);
    text(ctx,'ORBIT / 02',34,47,67,marking,900);
    text(ctx,'ORBIT STUDIO AUDIO DIVISION',439,33,28,marking,700,'left',MONO);
    text(ctx,'STEREO  /  DIRECT DRIVE',439,69,22,secondary,400,'left',MONO);
    ctx.strokeStyle=secondary;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(1032,8);ctx.lineTo(1032,88);ctx.stroke();
    text(ctx,'UNIT',1064,29,25,marking,700,'left',MONO);
    text(ctx,'02',1064,67,39,accent,900);
    for(let i=0;i<11;i++){ctx.fillStyle=i%3===0?accent:marking;ctx.fillRect(1185+i*27,13,i%2===0?11:6,69);}
  });
  surface('ORBIT-02 arm caution',[.139,.0731,-.171],[.059,.013],[590,130],(ctx,w,h)=>{
    text(ctx,'CAUTION',w/2,39,39,accent,900,'center',MONO);
    text(ctx,'PICKUP ARM',w/2,91,27,secondary,700,'center',MONO);
  });
  surface('ORBIT-02 volume label',[.211,.0731,.128],[.047,.012],[470,120],(ctx,w)=>{
    text(ctx,'VOLUME',w/2,48,46,marking,700,'center',MONO);
    text(ctx,'−          +',w/2,96,30,secondary,700,'center',MONO);
  });
  surface('ORBIT-02 like label',[-.205,.0731,.114],[.035,.008],[420,96],(ctx,w,h)=>{
    text(ctx,'LIKE +1',w/2,h/2,61,marking,700,'center',MONO);
  });

  const play=surface('ORBIT-02 play symbol',controls.play.position,[.033,.021],[330,210],(ctx,w,h,active)=>{
    text(ctx,active?'Ⅱ':'▶',w/2,h/2+3,145,INK,900,'center');
  },{action:'play'});
  surface('ORBIT-02 like symbol',controls.like.position,[.017,.017],[204,204],(ctx,w,h)=>{
    text(ctx,'♥',w/2,h/2+7,164,PAPER,700,'center');
  },{action:'like'});
  for(const action of ['previous','next']){
    const direction=action==='previous'?'◀':'▶';
    surface(`ORBIT-02 ${action} symbol`,controls[action].position,[.021,.012],[294,168],(ctx,w,h)=>{
      text(ctx,direction,w/2,h/2+3,125,PAPER,900,'center');
      ctx.fillStyle=PAPER;ctx.fillRect(action==='previous'?42:w-54,42,12,84);
    },{action});
  }

  // Low-profile service keys keep every action on the physical instrument.
  for(const action of ['import','close','skin']){
    const {position,size}=controls[action];
    const geometry=new THREE.BoxGeometry(size[0],.006,size[1]);
    const material=new THREE.MeshBasicMaterial({color:INK});resources.add(geometry);resources.add(material);
    const key=new THREE.Mesh(geometry,material);key.name=`ORBIT-02 ${action} key`;
    key.position.set(position[0],position[1]-.0033,position[2]);key.userData.deckAction=action;group.add(key);
    surface(`ORBIT-02 ${action} label`,position,[size[0]*.88,size[1]*.82],[440,196],(ctx,w,h)=>{
      text(ctx,action==='import'?'＋ 加歌':action==='skin'?'换肤':'收起',w/2,h/2,action==='import'?78:86,PAPER,700,'center');
    },{action});
  }

  const display=surface('ORBIT-02 track display',[.055,.074,.158],[.23,.035],[1380,210],(ctx,w,h,state={})=>{
    ctx.fillStyle=INK;ctx.fillRect(0,0,w,h);
    ctx.fillStyle=SCARLET;ctx.fillRect(0,0,10,h);
    if(desktop){
      text(ctx,'ORBIT STUDIO / UNIT 02',38,70,68,PAPER);
      text(ctx,'DIRECT DRIVE / 33⅓ RPM',38,156,43,armor?ORANGE:'#adb5b2',700,'left',MONO);
      text(ctx,state.playing?'PLAY':'STANDBY',w-36,150,42,PAPER,700,'right',MONO);return;
    }
    const hasTrack=!!state.current,title=state.current?.title||'＋ 加入你的音乐';
    ctx.font=`700 68px ${SANS}`;
    text(ctx,fitted(ctx,title,1040),38,69,68,PAPER);
    text(ctx,`${clock(state.time)} / ${clock(state.duration)}`,38,155,46,PAPER,400,'left',MONO);
    const busy=state.pending||state.buffering;
    const status=busy?'读取中':state.playing?'PLAY':hasTrack?'PAUSE':'READY';
    text(ctx,status,597,155,37,PAPER,700,'left',MONO);
    ctx.fillStyle='#444448';ctx.fillRect(1105,26,2,157);
    const likes=Number(state.current?.likes??state.current?.likeCount??state.likes??state.likeCount??0)||0;
    text(ctx,'♥',1234,58,47,SCARLET,700,'center');
    text(ctx,String(Math.max(0,Math.floor(likes))).padStart(2,'0'),1234,135,58,PAPER,700,'center',MONO);
    const count=state.tracks?.length||0;
    if(count)text(ctx,`${String((state.index||0)+1).padStart(2,'0')}/${String(count).padStart(2,'0')}`,1055,155,35,PAPER,400,'right',MONO);
  },{transparent:false});
  let lastDisplay='',lastActive=null;
  function update(state={}){
    const active=!!(state.playing||state.pending||state.buffering);
    if(active!==lastActive){play.redraw(active);lastActive=active;}
    const signature=JSON.stringify([state.current?.id,state.current?.title,Math.floor(state.time||0),Math.floor(state.duration||0),state.current?.likes??state.current?.likeCount??state.likes??state.likeCount??0,active,!!state.playing,!!state.buffering,!!state.pending,state.index,state.tracks?.length]);
    if(signature!==lastDisplay){display.redraw(state);lastDisplay=signature;}
  }
  return {update,controls};
}
