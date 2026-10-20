import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {getPlantDefinition} from './plant-library.js';
import {createPlantGradient,plantPaintColor} from './plant-lighting.js';
import {ghostWorld} from './world-theme.js';

const vec=p=>new THREE.Vector3(...p);

export function applyPlantSway(root,{x=0,z=0}){
  root.userData.foliage.rotation.set(x,0,z);
  root.updateMatrixWorld(true);
}

// Original geometry based on the approved concept silhouettes; no remote assets at runtime.
export function makePlant(id){
  const INK=ghostWorld?'#263b31':'#111316',PAPER=ghostWorld?'#c2cbb8':'#eeeadd',RED=ghostWorld?'#7f9579':'#e80c38';
  const definition=getPlantDefinition(id),root=new THREE.Group(),pot=new THREE.Group(),foliage=new THREE.Group();
  root.name=definition.name;root.userData.plantId=definition.id;
  root.add(pot,foliage);foliage.position.y=.29;
  const materials=new Map(),gradient=createPlantGradient();
  function material(color){
    if(ghostWorld&&!materials.has(color)){
      materials.set(color,new THREE.MeshStandardMaterial({...(color==='facets'?{vertexColors:true}:{color:new THREE.Color(color)}),roughness:.76,metalness:0,side:THREE.DoubleSide,shadowSide:THREE.DoubleSide}));
    }
    if(!materials.has(color))materials.set(color,color===INK
      ?new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide})
      :new THREE.MeshToonMaterial({...(color==='facets'?{vertexColors:true}:{color:plantPaintColor(color)}),gradientMap:gradient,side:THREE.DoubleSide,shadowSide:THREE.DoubleSide}));
    return materials.get(color);
  }
  function mesh(g,color,parent=foliage){const m=new THREE.Mesh(g,material(color));parent.add(m);return m;}
  function tube(points,r=.003,color=INK,parent=foliage){
    if(ghostWorld&&r<=.005){
      // The existing curves remain; their paint follows the ceramic/leaf surface
      // instead of the first world's light-catching graphic outlines.
      if(parent===pot)color=color===INK?'#b7b8ac':color;
      else color=({'#d7dbbb':'#68775e','#c6cfaf':'#617459','#98a98b':'#526548','#a09d84':'#6d7862'})[color]||color;
    }
    // Coincident blade tips destabilise Catmull-Rom tangents and create little loops.
    const clean=points.map(vec).filter((p,i,a)=>i===0||p.distanceToSquared(a[i-1])>1e-12);
    if(clean.length<2)return null;
    const curve=new THREE.CatmullRomCurve3(clean);
    return mesh(new THREE.TubeGeometry(curve,Math.max(8,clean.length*2),r,5,false),color,parent);
  }
  function spike(start,end,r,color,parent){
    const a=vec(start),b=vec(end),direction=b.clone().sub(a);
    const m=mesh(new THREE.ConeGeometry(r,direction.length(),6),color,parent);
    m.position.copy(a.add(b).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return m;
  }
  function cylinder(top,bottom,h,y,color,parent=pot){
    const m=mesh(new THREE.CylinderGeometry(top,bottom,h,8,1,true),color,parent);m.position.y=y;return m;
  }
  function polygon(r,y,color=INK,thickness=.003){
    for(let i=0;i<8;i++){const a=i*Math.PI/4,b=(i+1)*Math.PI/4;tube([[Math.sin(a)*r,y,Math.cos(a)*r],[Math.sin(b)*r,y,Math.cos(b)*r]],thickness,color,pot);}
  }
  function facets(positions,indices,tones,parent){
    const source=new THREE.BufferGeometry();source.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));source.setIndex(indices);
    const g=source.toNonIndexed();source.dispose();const colors=[];
    const palette=tones.map(color=>ghostWorld?new THREE.Color(color):plantPaintColor(color));
    for(let i=0;i<g.getAttribute('position').count;i++){const c=palette[Math.floor(i/3)%palette.length];colors.push(c.r,c.g,c.b);}
    g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return mesh(g,'facets',parent);
  }
  // The same eight-sided pot keeps the collection coherent when the plant changes.
  cylinder(.16,.15,.022,.018,INK);cylinder(.151,.145,.012,.034,PAPER);
  const pg=new THREE.CylinderGeometry(.174,.121,.22,8,1,true).toNonIndexed(),pc=[];
  const pn=pg.getAttribute('normal');
  for(let i=0;i<pn.count;i++){const c=ghostWorld?new THREE.Color('#c6c4b4'):plantPaintColor('#dddcd0');pc.push(c.r,c.g,c.b);}
  pg.setAttribute('color',new THREE.Float32BufferAttribute(pc,3));mesh(pg,'facets',pot).position.y=.151;
  for(let i=0;i<8;i++){const a=i*Math.PI/4;tube([[Math.sin(a)*.121,.041,Math.cos(a)*.121],[Math.sin(a)*.174,.261,Math.cos(a)*.174]],.0023,INK,pot);}
  polygon(.121,.041);polygon(.174,.261);
  cylinder(.172,.169,.009,.238,RED);polygon(.174,.242,RED,.002);
  cylinder(.183,.178,.027,.275,INK);
  const top=mesh(new THREE.RingGeometry(.161,.183,8),PAPER,pot);top.rotation.x=-Math.PI/2;top.position.y=.289;
  polygon(.183,.29);polygon(.161,.29,INK,.002);
  const soil=mesh(new THREE.CircleGeometry(.161,24),INK,pot);soil.rotation.x=-Math.PI/2;soil.position.y=.278;
  for(const [x,z,s] of [[-.09,.04,.014],[.075,.06,.009],[.02,-.1,.012],[-.065,-.07,.008],[.11,-.03,.01]]){
    const stone=mesh(new THREE.IcosahedronGeometry(s,0),'#77796b',pot);stone.position.set(x,.289,z);stone.scale.y=.45;
  }
  const tag=mesh(new THREE.BoxGeometry(.039,.065,.005),RED,pot);tag.position.set(.061,.181,.151);tag.rotation.z=-.08;
  tube([[.042,.157,.154],[.075,.16,.154]],.0015,PAPER,pot);

  // Folded blade with a raised central rib. Rotation gives each leaf its own 3D pose.
  function blade({position=[0,0,0],rotation=[0,0,0],length=.25,width=.06,bend=.05,fold=.02,power=.75,tones=['#34453d','#18251f'],edge=INK,rib=null,edgeRadius=.002,thickness=0,n=14},parent=foliage){
    const group=new THREE.Group();group.position.set(...position);group.rotation.set(...rotation,'YXZ');parent.add(group);
    const pos=[],indices=[],left=[],right=[],ridge=[];
    for(let i=0;i<=n;i++){
      const t=i/n,w=width*Math.pow(Math.sin(Math.PI*t),power),z=bend*t*t;
      left.push([-w,t*length,z]);right.push([w,t*length,z]);ridge.push([0,t*length,z+fold*Math.sin(Math.PI*t)]);
      pos.push(...left[i],...ridge[i],...right[i]);
      if(i<n){const a=i*3,b=a+3;indices.push(a,b,a+1,a+1,b,b+1,a+1,b+1,a+2,a+2,b+1,b+2);}
    }
    facets(pos,indices,[tones[0],tones[0],tones[1],tones[1]],group);
    if(thickness){
      const back=pos.map((value,i)=>i%3===2?value-thickness:value);facets(back,indices,[tones[1]],group);
      for(const points of [left,right])for(let i=0;i<n;i++){
        const a=points[i],b=points[i+1];facets([...a,...b,b[0],b[1],b[2]-thickness,a[0],a[1],a[2]-thickness],[0,1,2,0,2,3],['#758070'],group);
      }
    }
    tube([...left,...right.slice().reverse()],edgeRadius,ghostWorld?tones[1]:edge,group);
    if(rib)tube(ridge,.0014,ghostWorld?'#53634b':rib,group);
    return {group,left,right,ridge};
  }
  function stem(points,r=.01,color='#6c6a5b'){
    tube(points,r+ .002,INK);tube(points.map(p=>[p[0]-.002,p[1],p[2]+.003]),r,color);
    tube(points.map(p=>[p[0]-.005,p[1],p[2]+r]),r*.14,'#a09d84');
  }

  function aeonium(){
    // Flattened branches and fan-shaped growth lines distinguish a crest from ordinary rosettes.
    stem([[0,0,0],[-.035,.14,0],[.025,.31,-.02],[.1,.52,-.045]],.032,'#88806d');
    stem([[-.01,.12,0],[-.12,.24,.015],[-.24,.34,.035]],.024,'#8a8271');
    stem([[.015,.24,0],[.15,.25,.04],[.27,.3,.05]],.022,'#756b61');
    const fans=[
      {x:-.2,y:.31,z:.045,s:.89,rz:.48,ry:.18},
      {x:.07,y:.48,z:-.035,s:1,rz:-.1,ry:-.22},
      {x:.25,y:.29,z:.08,s:.76,rz:-.72,ry:.2},
      {x:.015,y:.32,z:.105,s:.88,rz:.08,ry:.06},
      {x:-.035,y:.19,z:.14,s:.65,rz:.12,ry:-.16},
    ];
    fans.forEach((f,fan)=>{
      const g=new THREE.Group();g.position.set(f.x,f.y,f.z);g.scale.setScalar(f.s);g.rotation.set(0,f.ry,f.rz);foliage.add(g);
      const points=[];for(let j=0;j<=16;j++){const t=j/16;points.push([(t-.5)*.30,.07+.055*Math.sin(t*Math.PI*3),.018*Math.sin(t*Math.PI*2)]);}
      tube([[0,-.1,0],[0,.045,0],points[6]],.013,'#8f8673',g);
      tube(points,.014,'#655c55',g);tube(points.map(p=>[p[0],p[1]+.005,p[2]+.012]),.0028,'#b0a38b',g);
      for(let row=0;row<3;row++)for(let j=0;j<12;j++){
        const t=j/11,x=(t-.5)*.30,y=.07+.055*Math.sin(t*Math.PI*3);
        const tilt=(t-.5)*-2.5+(row-1)*.11;
        const length=.12+(row===1?.04:0)+.018*Math.sin(j*1.7+fan);
        const leaf=blade({position:[x,y,row*.018],rotation:[(row-1)*.40,0,tilt],length,width:.034+row*.0015,bend:-.03,fold:.011,power:.40,tones:row===2?['#34282d','#15191c']:['#25272a','#15171b'],edge:'#a51232',edgeRadius:.0015,n:10},g);
        tube(leaf.ridge.slice(0,6),.0009,row===2?'#7d7266':'#4e5144',leaf.group);
        tube(leaf.left.slice(6),.001,'#e5274a',leaf.group);
      }
      // Small young leaves along the crest leave a subtle grey-green centre.
      for(let j=0;j<10;j++)blade({position:[(j/9-.5)*.25,.075+.05*Math.sin(j/9*Math.PI*3),.065],rotation:[.35,0,(j/9-.5)*-2],length:.065,width:.012,bend:.008,fold:.005,tones:['#626957','#333c32'],edge:'#2d3130',edgeRadius:.001,n:8},g);
    });
    foliage.scale.x=.78;
  }
  function agave(){
    const layers=[{count:8,length:.45,width:.092,tilt:1.05,y:.025},{count:7,length:.42,width:.087,tilt:.69,y:.06},{count:5,length:.35,width:.07,tilt:.32,y:.09}];
    layers.forEach((layer,row)=>{
      for(let j=0;j<layer.count;j++){
        const angle=j*Math.PI*2/layer.count+row*.49;
        const {group,left,right,ridge}=blade({position:[0,layer.y,0],rotation:[layer.tilt,angle,0],length:layer.length,width:layer.width,bend:-.065,fold:.032,thickness:.009,power:.65,tones:['#53615a','#263731'],edge:PAPER,edgeRadius:.0045,n:20});
        for(const sign of [-1,1]){
          const edge=sign<0?left:right;
          for(const index of [4,7,10,13,16]){
            const p=edge[index],tip=[p[0]+sign*(.017+(16-index)*.0005),p[1]+.026,p[2]+.002],base=edge[index+1];
            facets([...p,...tip,...base],[0,1,2],[PAPER],group);
            tube([p,tip,base],.0012,INK,group);
          }
        }
        spike([0,layer.length-.008,-.063],[0,layer.length+.04,-.077],.008,INK,group);
        if(j%3===0)spike([0,layer.length+.015,-.069],[0,layer.length+.037,-.076],.003,RED,group);
        tube(ridge.slice(1,17),.001,'#748076',group);
      }
    });
  }
  function alocasia(){
    const leaves=[
      {end:[-.17,.54,.01],s:1,ry:-.28,rz:.24,rx:-.12},
      {end:[.14,.65,-.09],s:1.04,ry:.20,rz:-.25,rx:-.08},
      {end:[-.29,.32,.09],s:.83,ry:-.37,rz:.6,rx:.15},
      {end:[.25,.36,.14],s:.9,ry:.3,rz:-.5,rx:.10},
      {end:[.015,.26,.21],s:.71,ry:.12,rz:-.07,rx:.32},
    ];
    leaves.forEach((l,index)=>{
      const [x,y,z]=l.end;stem([[0,.01,0],[x*.55,y*.6,z*.6],l.end],.006,'#52634b');
      const g=new THREE.Group();g.position.set(...l.end);g.rotation.set(l.rx,l.ry,l.rz);g.scale.setScalar(l.s);foliage.add(g);
      // Heart notch, flared shoulders, long shield tip; the central face is gently folded.
      const outline=new THREE.Shape();outline.moveTo(0,.095);outline.bezierCurveTo(-.045,.19,-.14,.19,-.15,.095);outline.bezierCurveTo(-.185,-.015,-.095,-.19,0,-.29);outline.bezierCurveTo(.095,-.19,.185,-.015,.15,.095);outline.bezierCurveTo(.14,.19,.045,.19,0,.095);
      const points=outline.getPoints(12),pos=[0,-.035,.039],indices=[];
      points.forEach(p=>pos.push(p.x,p.y,-.018*Math.abs(p.y)));
      for(let i=0;i<points.length-1;i++)indices.push(0,i+1,i+2);
      facets(pos,indices,['#283c34','#31463a','#24332d','#182823'],g);
      const back=mesh(new THREE.ShapeGeometry(outline,12),'#5c1b2d',g);back.position.z=-.012;
      const contour=points.map(p=>[p.x,p.y,-.018*Math.abs(p.y)]);tube(contour,.0036,INK,g);
      if(index===1||index===3)tube(contour.slice(0,16),.002,'#aa1835',g);
      const rib=[[0,.095,.012],[0,-.035,.043],[0,-.15,.024],[0,-.285,.001]];
      tube(rib,.0034,'#d7dbbb',g);
      for(const sign of [-1,1]){
        for(const [yy,ex,ey] of [[.04,.115,.12],[-.025,.141,.025],[-.095,.115,-.08],[-.16,.07,-.19]]){
          const zc=.035-Math.abs(yy+.035)*.06;
          tube([[0,yy,zc+.004],[sign*ex*.55,(yy+ey)/2,.024],[sign*ex,ey,.006]],.0022,'#c6cfaf',g);
          tube([[sign*ex*.55,(yy+ey)/2,.026],[sign*ex*.77,ey+.025,.01]],.0012,'#98a98b',g);
        }
      }
    });
    // A tightly folded new leaf at the back adds one controlled burgundy accent.
    stem([[0,0,-.02],[.01,.43,-.08],[.035,.66,-.12]],.004,'#5c6650');
    blade({position:[.035,.64,-.12],rotation:[-.1,.4,-.12],length:.18,width:.025,bend:.018,fold:.025,tones:['#79132b','#29272b'],edge:INK});
  }
  function batFlower(){
    for(let i=0;i<5;i++){
      const a=(i-2)*1.13;
      blade({position:[0,.02,.01],rotation:[1.03+i*.04,a,(i%2?1:-1)*.08],length:.40+(i%2)*.045,width:.10,bend:-.07,fold:.024,tones:['#526051','#24372c'],edge:INK,rib:'#92977b',edgeRadius:.003});
    }
    function flower(end,size,turn){
      const [x,y,z]=end;stem([[0,.01,0],[x*.55,y*.55,z-.015],end],.007,'#3c3939');
      const g=new THREE.Group();g.position.set(...end);g.rotation.y=turn;g.scale.setScalar(size);foliage.add(g);
      // The broad opposing bracts are botanical wings, without a literal face or animal.
      for(const sign of [-1,1]){
        const bract=blade({position:[sign*.018,0,0],rotation:[-.09,sign*-.24,sign*-1.08],length:.28,width:.095,bend:.045,fold:.028,power:.65,tones:['#421c2a','#1d1b25'],edge:'#a41b36',edgeRadius:.0025,rib:'#7c3a43',n:18},g);
        for(const t of [.3,.5,.7]){
          const i=Math.round(t*18);tube([bract.ridge[i],[bract.left[Math.min(i+4,17)][0]*.8,bract.left[Math.min(i+4,17)][1],.035]],.001,'#65303c',bract.group);
        }
      }
      blade({position:[0,-.005,-.02],rotation:[-.25,.1,-.28],length:.18,width:.046,bend:-.02,fold:.016,tones:['#4e1e2c','#251b25'],edge:'#8f1833',n:12},g);
      blade({position:[.018,-.005,.015],rotation:[.25,0,Math.PI-.18],length:.10,width:.037,bend:.02,fold:.008,tones:['#33222c','#1a1c23'],edge:INK,n:10},g);
      for(let i=0;i<12;i++){
        const a=i*2.4,r=.017+.007*(i%3),p=[Math.cos(a)*r,Math.sin(a)*r*.7,.045+.009*(i%2)];
        tube([[0,0,.015],p],.0017,'#8b344a',g);
        const bud=mesh(new THREE.IcosahedronGeometry(.012+(i%3)*.002,1),i%3===0?'#a42a43':'#542336',g);bud.position.set(...p);bud.scale.y=1.3;
      }
      for(let i=0;i<10;i++){
        const side=i<5?-1:1,k=i%5,xx=side*(.105+.022*k),drop=.24+.033*k;
        const points=[[side*.022,-.005,.035],[xx,.025-k*.01,.045],[xx+side*.035,-drop*.55,.06],[xx*.8,-drop,.065+(k%2)*.04]];
        tube(points,.0015,i%3===0?'#bc3150':'#4b2633',g);
      }
    }
    flower([-.12,.69,-.025],1,-.12);flower([.235,.46,.10],.7,.2);
  }
  ({'crested-aeonium':aeonium,agave,'bat-flower':batFlower,alocasia}[definition.id])();

  // Bake static transforms and merge by material so hundreds of leaves cost only a few draws.
  function consolidate(group){
    group.updateMatrixWorld(true);
    const inverse=group.matrixWorld.clone().invert(),batches=new Map(),originals=new Set(),parts=[];
    group.traverse(o=>{if(!o.isMesh)return;parts.push(o);const geometry=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
      geometry.applyMatrix4(inverse.clone().multiply(o.matrixWorld));
      for(const key of Object.keys(geometry.attributes))if(key!=='position'&&key!=='color'&&key!=='normal')geometry.deleteAttribute(key);
      const list=batches.get(o.material)||[];list.push(geometry);batches.set(o.material,list);originals.add(o.geometry);
    });
    group.clear();
    for(const [m,geometries] of batches){
      const merged=mergeGeometries(geometries,false);
      if(!merged)throw new Error('植物模型合并失败');
      merged.computeBoundingSphere();const item=new THREE.Mesh(merged,m);item.castShadow=true;item.receiveShadow=true;group.add(item);geometries.forEach(g=>g.dispose());
    }
    originals.forEach(g=>g.dispose());
  }
  root.updateMatrixWorld(true);consolidate(pot);consolidate(foliage);
  pot.userData.plantPart='pot';foliage.userData.plantPart='foliage';
  for(const group of [pot,foliage])group.traverse(o=>{if(o.isMesh)o.userData.plantPart=group.userData.plantPart;});
  root.userData.foliage=foliage;root.userData.pot=pot;
  root.userData.dispose=()=>{
    root.traverse(o=>o.geometry?.dispose());materials.forEach(m=>m.dispose());gradient.dispose();
  };
  root.updateMatrixWorld(true);
  return root;
}

