import {ghostWorld,themeAsset,worldAssetRoot} from './world-theme.js';
import {imageToScreen,viewScale} from './geometry.js';
import {surfaceMatrix} from './surface-projection.js';
import {createRoomAtmosphere} from './room-atmosphere.js';
import {drawProjectedRaster} from './scene-capture.js';
import {readSceneJSON} from './scene-resources.js';

export async function createRoomSurfaces(container,{computer,soundscape,notify=()=>{}}={}){
  const config=await readSceneJSON('/assets/scene/scene-interactions.json');
  const root=document.createElement('div');root.className='room-surfaces';root.setAttribute('aria-hidden','true');
  root.innerHTML='<div class="room-live-screen"><img alt=""><div class="room-screen-sleep"></div></div><i class="room-power-led"></i><i class="room-sound-led" hidden></i>'+(ghostWorld?`<div class="room-wall-lift" hidden><img class="room-wall-paper" alt=""><img class="room-wall-photo" src="${worldAssetRoot}city-study.png" alt="" hidden></div>`:'<img class="room-wall-lift" alt="" hidden>');
  container.insertBefore(root,container.querySelector('#desktop-figure'));
  const atmosphere=createRoomAtmosphere(root,config);
  const screen=root.querySelector('.room-live-screen'),wall=root.querySelector('.room-wall-lift'),photo=screen.querySelector('img'),power=root.querySelector('.room-power-led'),sound=root.querySelector('.room-sound-led');
  const wallPaper=ghostWorld?wall.querySelector('.room-wall-paper'):wall,wallPhoto=wall.querySelector('.room-wall-photo');
  const paperSizes={'mission-profile.png':[1520,780],'board-gallery.png':[1060,1360],'board-projects.png':[1280,1280],'board-links.png':[2280,460],'board-quotes.png':[2000,540]};
  const fans=(config.towerFans||[]).map(key=>{
    const node=document.createElement('div');node.className='room-tower-fan';
    const rotor=document.createElement('canvas');rotor.width=rotor.height=240;node.append(rotor);root.append(node);
    const ctx=rotor.getContext('2d');ctx.translate(120,120);ctx.fillStyle=(ghostWorld?'#10171d':'#101015');ctx.beginPath();ctx.arc(0,0,120,0,Math.PI*2);ctx.fill();
    for(let i=0;i<7;i++){ctx.save();ctx.rotate(i*Math.PI*2/7);
      if(ghostWorld){const blade=ctx.createLinearGradient(30,-42,106,8);blade.addColorStop(0,'#1b242c');blade.addColorStop(.5,'#38434b');blade.addColorStop(.63,'#49565e');blade.addColorStop(.72,'#303b43');blade.addColorStop(1,'#202931');ctx.fillStyle=blade;}else ctx.fillStyle='#eae7dc';
      ctx.beginPath();ctx.moveTo(29,-11);ctx.quadraticCurveTo(50,-52,96,-48);ctx.lineTo(108,-14);ctx.quadraticCurveTo(66,-30,35,9);ctx.closePath();ctx.fill();ctx.restore();}
    if(ghostWorld){const hub=ctx.createRadialGradient(-8,-10,1,0,0,29);hub.addColorStop(0,'#4a555d');hub.addColorStop(.4,'#303a43');hub.addColorStop(1,'#1b252e');ctx.fillStyle=hub;}else ctx.fillStyle='#ec0035';ctx.beginPath();ctx.arc(0,0,29,0,Math.PI*2);ctx.fill();
    return {node,key};
  });
  let lastFrame=null,lastImage='',state=computer.getState(),hover=0,lastSurface='';
  function setState(value){state=value;root.dataset.power=state.power;screen.dataset.power=state.power;power.dataset.power=state.power;photo.style.objectFit=state.fit==='contain'?'contain':'cover';photo.style.objectPosition=`${state.focalX}% ${state.focalY}%`;if(lastImage!==state.imageUrl){lastImage=state.imageUrl;photo.src=lastImage;}root.dataset.theme=state.theme;}
  photo.onerror=()=>{screen.dataset.failed='true';notify('这张屏保暂时无法显示，请换一张图片');};photo.onload=()=>delete screen.dataset.failed;
  const offComputer=computer.subscribe(setState),offSound=soundscape.subscribe(value=>{sound.hidden=!value.playing;});
  function projected(quad,view,vp,img,dy=0){return quad.map(([x,y])=>{const p=imageToScreen({x:x*img.w/config.width,y:y*img.h/config.height},view,vp,img);return [p.x,p.y+dy];});}
  function draw(view,vp,img){lastFrame=[view,vp,img];atmosphere.draw(view,vp,img);const quad=projected(config.surfaces.screen.quad,view,vp,img);screen.style.transform=`matrix3d(${surfaceMatrix(quad).join(',')})`;
    for(const {node,key} of fans)node.style.transform=`matrix3d(${surfaceMatrix(projected(config.surfaces[key].quad,view,vp,img),240,240).join(',')})`;
    const scale=viewScale(view,vp,img);for(const [node,key] of [[power,'towerPower'],[sound,'headphonesStatus']]){const xy=config.points[key];if(!xy)continue;const p=imageToScreen({x:xy[0]*img.w/config.width,y:xy[1]*img.h/config.height},view,vp,img);node.style.left=p.x+'px';node.style.top=p.y+'px';node.style.width=node.style.height=Math.max(3,20*scale)+'px';}
    const entry=Object.entries(config.surfaces).find(([key,surface])=>key.startsWith('board')&&surface.hotIndex===hover);
    if(!entry){wall.hidden=true;return;}const [key,surface]=entry;
    const [paperWidth,paperHeight]=ghostWorld?(paperSizes[surface.texture]||[960,540]):[960,540];
    if(key!==lastSurface){wallPaper.src=themeAsset('/assets/scene/'+surface.texture);if(ghostWorld){wall.style.width=paperWidth+'px';wall.style.height=paperHeight+'px';wallPhoto.hidden=surface.texture!=='board-gallery.png';}lastSurface=key;}
    wall.hidden=false;wall.style.transform=`matrix3d(${surfaceMatrix(projected(surface.quad,view,vp,img,-Math.min(4,12*scale)),paperWidth,paperHeight).join(',')})`;
  }
  function capture(context,view,vp,img){
    if(root.hidden)return;
    const origin=imageToScreen({x:0,y:0},view,vp,img),scale=viewScale(view,vp,img)*img.w/config.width;
    for(const item of root.querySelectorAll('.room-atmosphere > img,.room-atmosphere > canvas')){
      const style=getComputedStyle(item),opacity=Number(style.opacity);
      if(item.hidden||style.display==='none'||opacity<=0||(item instanceof HTMLImageElement&&(!item.complete||!item.naturalWidth)))continue;
      const x=Number.parseFloat(item.style.left)||0,y=Number.parseFloat(item.style.top)||0;
      const width=item instanceof HTMLCanvasElement?item.width:config.width,height=item instanceof HTMLCanvasElement?item.height:config.height;
      context.save();context.globalAlpha=opacity;context.drawImage(item,origin.x+x*scale,origin.y+y*scale,width*scale,height*scale);context.restore();
    }
    const screenRaster=document.createElement('canvas');screenRaster.width=960;screenRaster.height=540;
    const screenContext=screenRaster.getContext('2d');screenContext.fillStyle='#0e0e13';screenContext.fillRect(0,0,960,540);
    if(state.power!=='standby'&&photo.complete&&photo.naturalWidth&&screen.dataset.failed!=='true'){
      const factor=(state.fit==='contain'?Math.min:Math.max)(960/photo.naturalWidth,540/photo.naturalHeight);
      const width=photo.naturalWidth*factor,height=photo.naturalHeight*factor;
      screenContext.drawImage(photo,(960-width)*(state.focalX??50)/100,(540-height)*(state.focalY??50)/100,width,height);
    }
    if(state.power==='standby'){screenContext.fillStyle='#0d0d12';screenContext.fillRect(0,0,960,540);}
    drawProjectedRaster(context,screenRaster,projected(config.surfaces.screen.quad,view,vp,img));
    for(const {node,key} of fans){
      const rotor=node.querySelector('canvas'),fanRaster=document.createElement('canvas');fanRaster.width=fanRaster.height=240;
      const fanContext=fanRaster.getContext('2d'),cssTransform=getComputedStyle(rotor).transform,transform=cssTransform==='none'?new DOMMatrixReadOnly():new DOMMatrixReadOnly(cssTransform);
      fanContext.translate(120,120);fanContext.beginPath();fanContext.arc(0,0,120,0,Math.PI*2);fanContext.clip();
      fanContext.rotate(Math.atan2(transform.b,transform.a));fanContext.drawImage(rotor,-120,-120);
      drawProjectedRaster(context,fanRaster,projected(config.surfaces[key].quad,view,vp,img),8,8);
    }
    for(const [node,key] of [[power,'towerPower'],[sound,'headphonesStatus']]){
      const xy=config.points[key];if(!xy||node.hidden)continue;
      const p=imageToScreen({x:xy[0]*img.w/config.width,y:xy[1]*img.h/config.height},view,vp,img),radius=Math.max(3,20*viewScale(view,vp,img))/2;
      context.fillStyle=getComputedStyle(node).backgroundColor;context.beginPath();context.arc(p.x,p.y,radius,0,Math.PI*2);context.fill();
    }
  }
  return {draw,capture,ready:()=>photo.decode().catch(()=>{}),setActive:value=>atmosphere.setActive(value),setDeckHeld:value=>atmosphere.setDeckHeld(value),setHover(value){if(hover===value)return;hover=value;if(lastFrame)draw(...lastFrame);},hide(){root.hidden=true;atmosphere.setActive(false);},dispose(){offComputer();offSound();atmosphere.dispose();root.remove();}};
}
