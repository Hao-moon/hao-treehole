import {surfaceMatrix,transformPoint} from './surface-projection.js';

// Rasterize a real quadrilateral, including its perspective, into a 2D snapshot.
// Small affine triangles preserve the same projection as the live CSS surface.
export function drawProjectedRaster(context,source,quad,columns=16,rows=9){
  const width=source.naturalWidth||source.width,height=source.naturalHeight||source.height;
  if(!width||!height)return;
  const matrix=surfaceMatrix(quad,width,height);
  context.save();context.beginPath();quad.forEach(([x,y],i)=>i?context.lineTo(x,y):context.moveTo(x,y));context.closePath();context.clip();
  function triangle(points){
    const destination=points.map(([x,y])=>transformPoint(matrix,x,y));
    const [[sx0,sy0],[sx1,sy1],[sx2,sy2]]=points,[[x0,y0],[x1,y1],[x2,y2]]=destination;
    const ax=sx1-sx0,ay=sy1-sy0,bx=sx2-sx0,by=sy2-sy0,det=ax*by-bx*ay;
    const a=((x1-x0)*by-(x2-x0)*ay)/det,c=((x2-x0)*ax-(x1-x0)*bx)/det;
    const b=((y1-y0)*by-(y2-y0)*ay)/det,d=((y2-y0)*ax-(y1-y0)*bx)/det;
    const center=destination.reduce((p,q)=>[p[0]+q[0]/3,p[1]+q[1]/3],[0,0]);
    context.save();context.beginPath();
    // Overlap interior seams slightly, while the outer quad remains clipped.
    destination.forEach(([x,y],i)=>{const length=Math.hypot(x-center[0],y-center[1])||1;const px=x+(x-center[0])*.35/length,py=y+(y-center[1])*.35/length;i?context.lineTo(px,py):context.moveTo(px,py);});
    context.closePath();context.clip();context.transform(a,b,c,d,x0-a*sx0-c*sy0,y0-b*sx0-d*sy0);context.drawImage(source,0,0);context.restore();
  }
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const x=col*width/columns,y=row*height/rows,right=(col+1)*width/columns,bottom=(row+1)*height/rows;
    triangle([[x,y],[right,y],[right,bottom]]);triangle([[x,y],[right,bottom],[x,bottom]]);
  }
  context.restore();
}
