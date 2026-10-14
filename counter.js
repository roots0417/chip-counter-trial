export function inspectionRows(cols, rows, target, partial=false) {
  return partial ? Math.ceil(target/cols) : rows;
}
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
function median(a){const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)];}
function chroma(r,g,b){const sum=Math.max(1,r+g+b);return [(r-g)/sum,(b-g)/sum];}
function background(image){const values=[[],[]];const {width,height,data}=image;const step=Math.max(1,Math.floor(Math.max(width,height)/200));for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){if(x>width*.015&&x<width*.985&&y>height*.015&&y<height*.985)continue;const i=(y*width+x)*4,c=chroma(data[i],data[i+1],data[i+2]);values[0].push(c[0]);values[1].push(c[1]);}return values.map(median);}
function robustFit(points){let line=fit(points);for(let pass=0;pass<3;pass++){const errors=points.map(p=>p[1]-line[0]*p[0]-line[1]),center=median(errors),mad=median(errors.map(v=>Math.abs(v-center)));const kept=points.filter((p,i)=>Math.abs(errors[i]-center)<Math.max(2,3*mad));if(kept.length<8)break;line=fit(kept);}return line;}
export function findSheet(image, options={}) {
  const {data,width,height}=image,step=Math.max(1,Math.floor(Math.max(width,height)/650));
  const sw=Math.ceil(width/step),sh=Math.ceil(height/step),features=new Float32Array(sw*sh),values=[];
  const bg=background(image),bgGreen=-(bg[0]+bg[1])/2;
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const i=(Math.min(height-1,y*step)*width+Math.min(width-1,x*step))*4,c=chroma(data[i],data[i+1],data[i+2]),green=-(c[0]+c[1])/2;features[y*sw+x]=green;if(x>sw*.15&&x<sw*.85&&y>sh*.15&&y<sh*.85)values.push(green);}
  values.sort((a,b)=>a-b);const sheetGreen=values[Math.floor(values.length*.7)],contrast=sheetGreen-bgGreen;
  if(contrast<.012)throw new Error('Sheet와 테이프의 색상 차이가 작습니다. 모서리를 직접 지정하세요.');
  const cutoff=bgGreen+contrast*.48,mask=new Uint8Array(sw*sh);
  // Local averaging bridges narrow grid lines instead of collecting sparse green pixels.
  const integral=new Float64Array((sw+1)*(sh+1));for(let y=0;y<sh;y++){let sum=0;for(let x=0;x<sw;x++){sum+=features[y*sw+x];integral[(y+1)*(sw+1)+x+1]=integral[y*(sw+1)+x+1]+sum;}}
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const a=Math.max(0,x-2),b=Math.min(sw,x+3),c=Math.max(0,y-2),d=Math.min(sh,y+3);const mean=(integral[d*(sw+1)+b]-integral[c*(sw+1)+b]-integral[d*(sw+1)+a]+integral[c*(sw+1)+a])/((b-a)*(d-c));mask[y*sw+x]=mean>cutoff?1:0;}
  // Keep one contiguous Sheet; background speckles must not determine its corners.
  let biggest=[];const seen=new Uint8Array(sw*sh);for(let n=0;n<mask.length;n++){if(!mask[n]||seen[n])continue;const queue=[n];seen[n]=1;for(let q=0;q<queue.length;q++){const v=queue[q],x=v%sw,y=Math.floor(v/sw);for(const k of [x>0?v-1:-1,x<sw-1?v+1:-1,y>0?v-sw:-1,y<sh-1?v+sw:-1])if(k>=0&&mask[k]&&!seen[k]){seen[k]=1;queue.push(k);}}if(queue.length>biggest.length)biggest=queue;}
  if(biggest.length<sw*sh*.04)throw new Error('Sheet 전체 영역을 찾지 못했습니다. 모서리를 직접 지정하세요.');
  const rows=new Map(),cols=new Map();for(const n of biggest){const x=(n%sw)*step,y=Math.floor(n/sw)*step;const r=rows.get(y)||[Infinity,-Infinity],c=cols.get(x)||[Infinity,-Infinity];r[0]=Math.min(r[0],x);r[1]=Math.max(r[1],x);c[0]=Math.min(c[0],y);c[1]=Math.max(c[1],y);rows.set(y,r);cols.set(x,c);}
  const xs=[...cols.keys()].sort((a,b)=>a-b),ys=[...rows.keys()].sort((a,b)=>a-b),x0=xs[0],x1=xs.at(-1),y0=ys[0],y1=ys.at(-1);
  const rr=[...rows].filter(([y,p])=>y>y0+(y1-y0)*.2&&y<y1-(y1-y0)*.2&&p[1]-p[0]>(x1-x0)*.6),cc=[...cols].filter(([x,p])=>x>x0+(x1-x0)*.2&&x<x1-(x1-x0)*.2&&p[1]-p[0]>(y1-y0)*.6);
  if(rr.length<8||cc.length<8)throw new Error('배열 경계를 확인할 수 없습니다. 모서리를 직접 지정하세요.');
  const left=robustFit(rr.map(([y,p])=>[y,p[0]-step/2])),right=robustFit(rr.map(([y,p])=>[y,p[1]+step/2])),top=robustFit(cc.map(([x,p])=>[x,p[0]-step/2])),bottom=robustFit(cc.map(([x,p])=>[x,p[1]+step/2]));
  const intersect=(v,h)=>{const x=(v[0]*h[1]+v[1])/(1-v[0]*h[0]);return {x:Math.max(0,Math.min(width-1,x)),y:Math.max(0,Math.min(height-1,h[0]*x+h[1]))};};
  let topBoundary=top;
  if(options.partial && options.target%options.cols){
    // The top partial row has a step-shaped outline. Fit its outer grid edge parallel
    // to the bottom instead of fitting a diagonal across full and partial row tops.
    const edge=Math.min(...[...cols].map(([x,p])=>p[0]-bottom[0]*x))-step/2;
    topBoundary=[bottom[0],edge];
  }
  const corners=[intersect(left,topBoundary),intersect(right,topBoundary),intersect(right,bottom),intersect(left,bottom)];
  if(!validCorners(corners,width,height))throw new Error('검사 영역이 불안정합니다. 모서리를 직접 지정하세요.');
  return corners;
}
export function sampleColor(image,p,radius=2){const colors=[[],[]];for(let y=Math.max(0,Math.round(p.y)-radius);y<=Math.min(image.height-1,Math.round(p.y)+radius);y++)for(let x=Math.max(0,Math.round(p.x)-radius);x<=Math.min(image.width-1,Math.round(p.x)+radius);x++){const i=(y*image.width+x)*4,c=chroma(image.data[i],image.data[i+1],image.data[i+2]);colors[0].push(c[0]);colors[1].push(c[1]);}return colors.map(median);}
export function analyze(image,corners,{cols,rows,target,side,threshold=0,references=null,partial=false}) {
  rows=inspectionRows(cols,rows,target,partial);
  if(!validCorners(corners,image.width,image.height))throw new Error('검사 영역의 모서리를 확인하세요.');
  const map=projector(corners),cells=[];
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const active=activeCell(row,col,cols,rows,target,side),samples=[[],[]];
    if(active)for(let sy=0;sy<5;sy++)for(let sx=0;sx<5;sx++){const p=map((col+.3+sx*.1)/cols,(row+.3+sy*.1)/rows),x=Math.min(image.width-1,Math.max(0,Math.round(p.x))),y=Math.min(image.height-1,Math.max(0,Math.round(p.y))),i=(y*image.width+x)*4,c=chroma(image.data[i],image.data[i+1],image.data[i+2]);samples[0].push(c[0]);samples[1].push(c[1]);}
    cells.push({row,col,active,color:active?samples.map(median):null,state:active?'unsure':'excluded',manual:false});
  }
  const active=cells.filter(c=>c.active),occupied=references?.occupied||[0,1].map(i=>median(active.map(c=>c.color[i]))),empty=references?.empty||background(image);
  const delta=empty.map((v,i)=>v-occupied[i]),distance=delta[0]**2+delta[1]**2;
  // A uniform blue target can contain zero Chips; use the green chroma direction to detect this.
  const uniformBlue=!references&&distance<.0002&&occupied[1]>.025;
  for(const cell of active){const score=distance>.0002?((cell.color[0]-occupied[0])*delta[0]+(cell.color[1]-occupied[1])*delta[1])/distance:uniformBlue?1:0;
    cell.score=score;cell.candidateEmpty=score>=.5+threshold;
    const neutral=Math.abs(cell.color[1])<.008;
    cell.state=neutral&&!references?'unsure':score>.5+threshold+.12?'empty':score<.5+threshold-.12?'occupied':'unsure';
  }
  return cells;
}
export function summarize(cells) {
  const active=cells.filter(c=>c.active),empty=active.filter(c=>c.state==='empty').length,unsure=active.filter(c=>c.state==='unsure').length;
  return {target:active.length,empty,unsure,chips:active.length-empty,minChips:active.length-empty-unsure,maxChips:active.length-empty};
}
