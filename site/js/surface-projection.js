// Map a local rectangle to a projected physical surface without flattening its perspective.
export function surfaceMatrix(quad,width=960,height=540){
  if(quad?.length!==4||!(width>0&&height>0)||quad.flat().some(x=>!Number.isFinite(x)))throw new Error('Invalid projected surface');
  const corners=[[0,0],[width,0],[width,height],[0,height]],rows=[];
  corners.forEach(([x,y],i)=>{const [u,v]=quad[i];rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);});
  for(let col=0;col<8;col++){let pivot=col;for(let row=col+1;row<8;row++)if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col]))pivot=row;[rows[col],rows[pivot]]=[rows[pivot],rows[col]];const d=rows[col][col];if(Math.abs(d)<1e-10)throw new Error('Degenerate projected surface');for(let j=col;j<9;j++)rows[col][j]/=d;for(let row=0;row<8;row++){if(row===col)continue;const factor=rows[row][col];for(let j=col;j<9;j++)rows[row][j]-=factor*rows[col][j];}}
  const [a,b,c,d,e,f,g,h]=rows.map(row=>row[8]);return [a,d,0,g,b,e,0,h,0,0,1,0,c,f,0,1];
}
export function transformPoint(matrix,x,y){const w=matrix[3]*x+matrix[7]*y+matrix[15];return [(matrix[0]*x+matrix[4]*y+matrix[12])/w,(matrix[1]*x+matrix[5]*y+matrix[13])/w];}
