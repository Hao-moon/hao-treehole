// Artwork and edge marks belong to the physical platter, so they stay in phase
// with the motor in both the desktop and the close-up view.
import {ghostWorld} from './world-theme.js';
const INK='#17171c',GROOVE='#3b3c43',PAPER='#f3eee2',ORANGE='#ff9c3a';
const TAU=Math.PI*2;

function canvasTexture(THREE,canvas,resources){
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=4;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  resources.add(texture);return texture;
}

function rotatingRim(THREE,group,resources){
  const SCARLET=ghostWorld?'#8ba581':'#ef2844';
  // The GLB has 144 identical strobe dots, two rows spaced at exactly 5 degrees.
  // At speed that repeating pattern aliases into a seemingly stationary edge.
  // Replace it with unequal, widely spaced groups on the actual side wall.
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=128;
  const ctx=canvas.getContext('2d'),shade=ctx.createLinearGradient(0,0,0,128);
  shade.addColorStop(0,'#faf8ef');shade.addColorStop(.18,'#f0eee6');
  shade.addColorStop(.74,'#deded7');shade.addColorStop(1,'#b7b9b4');
  ctx.fillStyle=shade;ctx.fillRect(0,0,2048,128);
  ctx.fillStyle='#faf9f3';ctx.fillRect(0,3,2048,7);
  const groups=[
    {u:.025,width:112,color:'#34373b',bars:[17,8,27]},
    {u:.226,width:47,color:'#777b7d',bars:[10,19]},
    {u:.397,width:80,color:SCARLET,bars:[24,8]},
    {u:.581,width:145,color:'#45494b',bars:[8,19,12,31]},
    {u:.823,width:61,color:'#777b7d',bars:[17,7,12]}
  ];
  for(const mark of groups){
    const x=Math.round(mark.u*2048);
    ctx.fillStyle=mark.color;ctx.fillRect(x,22,mark.width,35);
    // The lower marks retain a machined rim appearance, without a repeated
    // spacing that can lock visually to the display's refresh rate.
    let offset=0;
    for(const width of mark.bars){ctx.fillRect(x+offset,76,width,28);offset+=width+13;}
  }
  // One thin red datum travels through the broad unprinted portion of the rim.
  ctx.fillStyle=SCARLET;ctx.fillRect(1430,19,13,90);
  const texture=canvasTexture(THREE,canvas,resources);
  const geometry=new THREE.CylinderGeometry(.14825,.14825,.0181,192,1,true);
  const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
  const rim=new THREE.Mesh(geometry,material);rim.name='Nonperiodic rotating platter sidewall';
  rim.position.y=-.015;group.add(rim);resources.add(geometry);resources.add(material);

  // Continue the larger side marks over the narrow upper lip. This keeps the
  // edge motion visible even at the steeper desktop camera angle. Cylinder UV
  // u starts on +Z, whereas RingGeometry starts on +X, hence the quarter turn.
  for(const mark of groups){
    const length=mark.width/2048*TAU,start=mark.u*TAU-Math.PI/2;
    const geometry=new THREE.RingGeometry(.1428,.14835,10,1,start,length);
    const material=new THREE.MeshBasicMaterial({color:mark.color,toneMapped:false,side:THREE.DoubleSide});
    const tab=new THREE.Mesh(geometry,material);tab.name='Rotating rim reference tab';
    tab.rotation.x=-Math.PI/2;tab.position.y=-.00565;group.add(tab);
    resources.add(geometry);resources.add(material);
  }
}

export function createRecordGraphics(THREE,root,resources,artTexture,{skin='original'}={}){
  const SCARLET=ghostWorld?'#8ba581':'#ef2844';
  const platter=root.getObjectByName('platter');
  if(!platter)return {setRunning(){}};
  platter.traverse(node=>{
    if(/绯红唱片标|唱片白色切角|ORBIT-02 record label|频闪圆点/.test(node.name))node.visible=false;
  });
  const eva=skin==='eva02',group=new THREE.Group();
  group.name=eva?'UNIT-02 rotating picture disc':'Original rotating vinyl';platter.add(group);
  rotatingRim(THREE,group,resources);

  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const ctx=canvas.getContext('2d'),c=512;
  const point=(radius,angle)=>[c+Math.cos(angle)*radius,c+Math.sin(angle)*radius];
  function sector(inner,outer,start,end,color){
    ctx.fillStyle=color;ctx.beginPath();
    ctx.arc(c,c,outer,start,end);ctx.arc(c,c,inner,end,start,true);ctx.closePath();ctx.fill();
  }
  function mark(angle,radius,width,height,color){
    const [x,y]=point(radius,angle);ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    ctx.fillStyle=color;ctx.fillRect(-height/2,-width/2,height,width);ctx.restore();
  }
  ctx.fillStyle=INK;ctx.fillRect(0,0,1024,1024);
  if(eva){
    sector(226,493,3.68,4.40,SCARLET);
    sector(226,493,3.68,3.74,ORANGE);
    sector(464,493,4.43,4.54,SCARLET);
  }
  for(const radius of [248,279,312,346,381,415,449,482]){
    ctx.strokeStyle=GROOVE;ctx.lineWidth=radius===248?3:2;
    ctx.beginPath();ctx.arc(c,c,radius,0,TAU);ctx.stroke();
  }
  if(eva){
    ctx.save();ctx.translate(c,c);ctx.rotate(4.04);ctx.fillStyle=PAPER;
    ctx.beginPath();ctx.moveTo(386,-31);ctx.lineTo(421,0);ctx.lineTo(386,31);
    ctx.lineTo(386,10);ctx.lineTo(360,10);ctx.lineTo(360,-10);ctx.lineTo(386,-10);
    ctx.closePath();ctx.fill();ctx.restore();
    mark(.40,475,72,21,PAPER);mark(1.85,472,28,49,PAPER);mark(5.69,475,42,15,PAPER);
    mark(.40,435,72,5,SCARLET);mark(1.85,434,10,10,ORANGE);
    ctx.strokeStyle='#58575d';ctx.lineWidth=2;ctx.beginPath();ctx.arc(c,c,221,0,TAU);ctx.stroke();
    ctx.save();ctx.translate(c,c);ctx.rotate(.90);ctx.fillStyle=PAPER;
    ctx.font='700 17px "Courier New", monospace';ctx.textAlign='center';ctx.fillText('UNIT 02 / SIDE A',0,-461);ctx.restore();
  }else{
    // Original livery: the familiar small red label and white cut-corner mark,
    // with restrained serial printing. The edge itself carries the motion cue.
    ctx.fillStyle=SCARLET;ctx.beginPath();ctx.arc(c,c,142,0,TAU);ctx.fill();
    ctx.strokeStyle='#ff7284';ctx.lineWidth=2;ctx.beginPath();ctx.arc(c,c,127,0,TAU);ctx.stroke();
    ctx.save();ctx.translate(c,c);ctx.rotate(-.38);ctx.fillStyle=PAPER;
    ctx.beginPath();ctx.moveTo(-82,29);ctx.lineTo(47,-55);ctx.lineTo(101,-38);
    ctx.lineTo(-64,57);ctx.closePath();ctx.fill();
    ctx.font='700 13px "Courier New", monospace';ctx.textAlign='center';ctx.fillText('SIDE A / 33⅓',0,99);ctx.restore();
    mark(.25,480,28,5,'#bcbcc0');mark(2.11,476,14,8,'#686971');
    ctx.save();ctx.translate(c,c);ctx.rotate(4.7);ctx.fillStyle='#777880';
    ctx.font='11px "Courier New", monospace';ctx.textAlign='center';ctx.fillText('PERSONAL AUDIO / 01',0,-462);ctx.restore();
  }

  const texture=canvasTexture(THREE,canvas,resources);
  const geometry=new THREE.CircleGeometry(.139,160);
  const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const print=new THREE.Mesh(geometry,material);print.name=eva?'UNIT-02 asymmetric vinyl print':'Original red-label vinyl print';
  print.rotation.x=-Math.PI/2;print.position.y=.0025;group.add(print);
  resources.add(geometry);resources.add(material);

  if(eva&&artTexture){
    const artwork=artTexture.clone();artwork.colorSpace=THREE.SRGBColorSpace;
    artwork.anisotropy=4;artwork.needsUpdate=true;
    const artGeometry=new THREE.PlaneGeometry(.151,.151);
    const artMaterial=new THREE.MeshBasicMaterial({map:artwork,transparent:true,alphaTest:.02,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
    const helmet=new THREE.Mesh(artGeometry,artMaterial);helmet.name='UNIT-02 helmet picture-disc artwork';
    helmet.rotation.x=-Math.PI/2;helmet.position.set(0,.0031,0);group.add(helmet);
    for(const resource of [artwork,artGeometry,artMaterial])resources.add(resource);
  }
  return {group,setRunning(running){group.userData.running=!!running;}};
}
