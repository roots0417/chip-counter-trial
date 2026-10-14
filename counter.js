// All counting operates on individual grid cells, including touching vacancies.
export function activeCell(row, col, cols, rows, target, side = 'left') {
  const fromBottom = rows - 1 - row;
  const full = Math.floor(target / cols), remainder = target % cols;
  return fromBottom < full || (fromBottom === full && (side === 'left' ? col < remainder : col >= cols - remainder));
}
export function solve(matrix, values) {
  const a = matrix.map((row, i) => [...row, values[i]]);
  for (let i = 0; i < values.length; i++) {
    let pivot = i;
    for (let j = i + 1; j < values.length; j++) if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j;
    [a[i], a[pivot]] = [a[pivot], a[i]];
    if (Math.abs(a[i][i]) < 1e-10) throw new Error('모서리가 겹치거나 검사 영역이 너무 작습니다.');
    const divisor = a[i][i];
    for (let k = i; k <= values.length; k++) a[i][k] /= divisor;
    for (let j = 0; j < values.length; j++) if (j !== i) {
      const factor = a[j][i];
      for (let k = i; k <= values.length; k++) a[j][k] -= factor * a[i][k];
    }
  }
  return a.map(row => row[values.length]);
}
export function projector(corners) {
  const matrix = [], values = [];
  [[0,0],[1,0],[1,1],[0,1]].forEach(([u,v], i) => {
    const {x,y} = corners[i];
    matrix.push([u,v,1,0,0,0,-u*x,-v*x]); values.push(x);
    matrix.push([0,0,0,u,v,1,-u*y,-v*y]); values.push(y);
  });
  const h = solve(matrix, values);
  return (u,v) => { const d = h[6]*u+h[7]*v+1; return {x:(h[0]*u+h[1]*v+h[2])/d,y:(h[3]*u+h[4]*v+h[5])/d}; };
}
export function validCorners(corners, width, height) {
  if (corners.length !== 4 || corners.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>width||p.y>height)) return false;
  const cross = corners.map((p,i)=>{const q=corners[(i+1)%4],r=corners[(i+2)%4];return (q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x);});
  const area = Math.abs(corners.reduce((sum,p,i)=>{const q=corners[(i+1)%4];return sum+p.x*q.y-p.y*q.x;},0))/2;
  return cross.every(n=>n>0) && area > width*height*.005;
}
function fit(points) {
  const n=points.length, mx=points.reduce((s,p)=>s+p[0],0)/n, my=points.reduce((s,p)=>s+p[1],0)/n;
  const slope=points.reduce((s,p)=>s+(p[0]-mx)*(p[1]-my),0)/points.reduce((s,p)=>s+(p[0]-mx)**2,0);
  return [slope,my-slope*mx];
}
export function findSheet({data,width,height}) {
  const step=Math.max(1,Math.floor(Math.max(width,height)/700));
  const points=[];
  for(let y=0;y<height;y+=step) for(let x=0;x<width;x+=step) {
    const i=(y*width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
    if(g>r*1.05 && g>b*1.06 && g>35) points.push([x,y]);
  }
  if(points.length<100) throw new Error('초록색 Sheet를 찾지 못했습니다. 모서리를 직접 지정하세요.');
  const xs=points.map(p=>p[0]).sort((a,b)=>a-b),ys=points.map(p=>p[1]).sort((a,b)=>a-b);
  const quant=(a,q)=>a[Math.floor((a.length-1)*q)];
  const x0=quant(xs,.01),x1=quant(xs,.99),y0=quant(ys,.01),y1=quant(ys,.99);
  const rowEdges=new Map(),colEdges=new Map();
  for(const [x,y] of points) {
    if(y>y0+(y1-y0)*.2 && y<y1-(y1-y0)*.2){const p=rowEdges.get(y)||[Infinity,-Infinity];p[0]=Math.min(p[0],x);p[1]=Math.max(p[1],x);rowEdges.set(y,p);}
    if(x>x0+(x1-x0)*.2 && x<x1-(x1-x0)*.2){const p=colEdges.get(x)||[Infinity,-Infinity];p[0]=Math.min(p[0],y);p[1]=Math.max(p[1],y);colEdges.set(x,p);}
  }
  const row=[...rowEdges].filter(([,p])=>p[1]-p[0]>(x1-x0)*.6),col=[...colEdges].filter(([,p])=>p[1]-p[0]>(y1-y0)*.6);
  if(row.length<10||col.length<10) throw new Error('배열 경계를 찾기 어렵습니다. 모서리를 직접 지정하세요.');
  const left=fit(row.map(([y,p])=>[y,p[0]-step/2])),right=fit(row.map(([y,p])=>[y,p[1]+step/2]));
  const top=fit(col.map(([x,p])=>[x,p[0]-step/2])),bottom=fit(col.map(([x,p])=>[x,p[1]+step/2]));
  const intersect=(vertical,horizontal)=>{const [a,b]=vertical,[c,d]=horizontal;const x=(a*d+b)/(1-a*c);return {x:Math.max(0,Math.min(width-1,x)),y:Math.max(0,Math.min(height-1,c*x+d))};};
  const corners=[intersect(left,top),intersect(right,top),intersect(right,bottom),intersect(left,bottom)];
  if(!validCorners(corners,width,height)) throw new Error('검사 영역을 확인할 수 없습니다. 모서리를 직접 지정하세요.');
  return corners;
}
export function analyze(image,corners,{cols,rows,target,side,threshold=0,margin=.025}) {
  if(!validCorners(corners,image.width,image.height)) throw new Error('검사 영역의 모서리를 확인하세요.');
  const map=projector(corners),cells=[];
  for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
    const active=activeCell(row,col,cols,rows,target,side),scores=[];
    if(active) for(let sy=0;sy<5;sy++) for(let sx=0;sx<5;sx++) {
      const p=map((col+.26+sx*.12)/cols,(row+.26+sy*.12)/rows);
      const x=Math.min(image.width-1,Math.max(0,Math.round(p.x))),y=Math.min(image.height-1,Math.max(0,Math.round(p.y)));
      const i=(y*image.width+x)*4,g=image.data[i+1],b=image.data[i+2];
      scores.push((b-g)/Math.max(1,b+g));
    }
    scores.sort((a,b)=>a-b);
    const score=active?scores[12]:null;
    const state=!active?'excluded':score>threshold+margin?'empty':score<threshold-margin?'occupied':'unsure';
    cells.push({row,col,active,score,state,manual:false,candidateEmpty:active&&score>=threshold});
  }
  return cells;
}
export function summarize(cells) {
  const active=cells.filter(c=>c.active),empty=active.filter(c=>c.state==='empty').length,unsure=active.filter(c=>c.state==='unsure').length;
  return {target:active.length,empty,unsure,chips:active.length-empty,minChips:active.length-empty-unsure,maxChips:active.length-empty};
}
