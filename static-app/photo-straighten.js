// Map a rectangle back into a photographed quadrilateral, then sample the photo.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function photoGeometry(points,ratio=0,maxSize=1600){
  if(points.length!==4 || points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('Place all four corners on the artwork.');
  for(let i=0;i<4;i++){
    const a=points[i],b=points[(i+1)%4],c=points[(i+2)%4];
    if(distance(a,b)<4 || (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)<=1)throw Error('Keep the corners in order around the artwork without crossing the edges.');
  }
  let width=(distance(points[0],points[1])+distance(points[3],points[2]))/2;
  let height=(distance(points[0],points[3])+distance(points[1],points[2]))/2;
  if(width*height<64)throw Error('Select a larger area of artwork.');
  if(ratio){if(!Number.isFinite(ratio)||ratio<=0)throw Error('Choose valid rectangle proportions.');width=Math.sqrt(width*height*ratio);height=width/ratio;}
  const scale=Math.min(1,maxSize/Math.max(width,height));
  width=Math.max(2,Math.round(width*scale));height=Math.max(2,Math.round(height*scale));
  const matrix=[];
  [[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{
    const {x,y}=points[i];
    matrix.push([u,v,1,0,0,0,-u*x,-v*x,x],[0,0,0,u,v,1,-u*y,-v*y,y]);
  });
  for(let col=0;col<8;col++){
    let pivot=col;for(let row=col+1;row<8;row++)if(Math.abs(matrix[row][col])>Math.abs(matrix[pivot][col]))pivot=row;
    if(Math.abs(matrix[pivot][col])<1e-10)throw Error('Spread the corners out to form a rectangle.');
    [matrix[col],matrix[pivot]]=[matrix[pivot],matrix[col]];
    const divisor=matrix[col][col];for(let j=col;j<9;j++)matrix[col][j]/=divisor;
    for(let row=0;row<8;row++)if(row!==col){const factor=matrix[row][col];for(let j=col;j<9;j++)matrix[row][j]-=factor*matrix[col][j];}
  }
  return {width,height,transform:matrix.map(row=>row[8])};
}

export function rectifyPhoto(source,points,ratio=0,maxSize=1600){
  const {width,height,transform:m}=photoGeometry(points,ratio,maxSize);
  const output=document.createElement('canvas');output.width=width;output.height=height;
  const input=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height),ctx=output.getContext('2d'),result=ctx.createImageData(width,height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=x/(width-1),v=y/(height-1),divisor=m[6]*u+m[7]*v+1;
    const sx=Math.max(0,Math.min(source.width-1,(m[0]*u+m[1]*v+m[2])/divisor)),sy=Math.max(0,Math.min(source.height-1,(m[3]*u+m[4]*v+m[5])/divisor));
    const left=Math.floor(sx),top=Math.floor(sy),right=Math.min(left+1,source.width-1),bottom=Math.min(top+1,source.height-1),dx=sx-left,dy=sy-top;
    const a=(top*source.width+left)*4,b=(top*source.width+right)*4,c=(bottom*source.width+left)*4,d=(bottom*source.width+right)*4;
    const wa=(1-dx)*(1-dy)*input.data[a+3],wb=dx*(1-dy)*input.data[b+3],wc=(1-dx)*dy*input.data[c+3],wd=dx*dy*input.data[d+3];
    const offset=(y*width+x)*4;
    // Interpolate premultiplied colors so transparent edges do not acquire dark halos.
    const alpha=wa+wb+wc+wd;
    result.data[offset+3]=alpha;
    for(let channel=0;channel<3;channel++)result.data[offset+channel]=alpha?(input.data[a+channel]*wa+input.data[b+channel]*wb+input.data[c+channel]*wc+input.data[d+channel]*wd)/alpha:0;
  }
  ctx.putImageData(result,0,0);return output;
}

export async function openPhotoStraightener({source,onApply}){
  if(document.querySelector('#photo-straightener'))return;
  const image=new Image();image.src=source;await image.decode();
  if(document.querySelector('#photo-straightener'))return;
  const photo=document.createElement('canvas');photo.width=image.naturalWidth;photo.height=image.naturalHeight;photo.getContext('2d').drawImage(image,0,0);
  const dialog=document.createElement('dialog');dialog.id='photo-straightener';dialog.setAttribute('aria-labelledby','photo-title');
  dialog.innerHTML=`<header class="photo-heading"><h2 id="photo-title">Straighten artwork photo</h2><button id="photo-close" class="button secondary" type="button" aria-label="Cancel photo correction">×</button></header>
    <div class="photo-body"><p id="photo-instructions">Drag the four numbered corners onto the corners of your paper or artwork. Keep them in order around the edges.</p>
    <div class="photo-columns"><section><h3>1. Mark the artwork</h3><div class="photo-source"><img alt="Original artwork photo" draggable="false"><svg id="photo-corners" aria-label="Artwork corners" aria-describedby="photo-instructions"><polygon/><g/></svg></div><p class="photo-hint">Use a finger, stylus, or mouse. You can also focus a corner and use the arrow keys; hold Shift for larger steps.</p></section>
    <section><h3>2. Check the rectangle</h3><label class="photo-proportions">Artwork proportions<select id="photo-ratio"><option value="0">Estimate from selected edges</option><option value="0.75">Portrait · 3:4</option><option value="1.3333333333333333">Landscape · 4:3</option><option value="1">Square · 1:1</option><option value="0.7727272727272727">Letter paper · 8.5:11</option><option value="0.7070707070707071">A4 paper · 210:297</option></select></label><p class="photo-hint">Choose your paper’s proportions if the estimate looks stretched.</p><div id="photo-result"></div><p id="photo-size" class="photo-hint"></p></section></div>
    <p id="photo-error" class="error" role="alert"></p><p class="photo-hint">Apply changes only this card side. The original stays in your image library.</p></div>
    <footer class="photo-actions"><button id="photo-reset" class="button secondary" type="button">Reset corners</button><button id="photo-cancel" class="button secondary" type="button">Cancel</button><button id="photo-apply" class="button" type="button">Apply rectangle</button></footer>`;
  const $=selector=>dialog.querySelector(selector),svg=$('#photo-corners'),group=svg.querySelector('g'),NS='http://www.w3.org/2000/svg';
  dialog.querySelector('img').src=source;svg.setAttribute('viewBox',`0 0 ${photo.width} ${photo.height}`);
  let points,frame,timer,drag=null,applying=false;
  const names=['Top left','Top right','Bottom right','Bottom left'];
  const handles=names.map((name,i)=>{
    const handle=document.createElementNS(NS,'g');handle.setAttribute('role','slider');handle.setAttribute('tabindex','0');handle.setAttribute('aria-label',`${i+1}. ${name} corner`);handle.setAttribute('aria-valuemin','0');handle.setAttribute('aria-valuemax','100');handle.dataset.corner=i;
    const circle=document.createElementNS(NS,'circle');circle.setAttribute('r','18');const label=document.createElementNS(NS,'text');label.textContent=i+1;label.setAttribute('text-anchor','middle');label.setAttribute('dy','.35em');handle.append(circle,label);group.append(handle);return handle;
  });
  function preview(){
    clearTimeout(timer);
    try{
      const result=rectifyPhoto(photo,points,Number($('#photo-ratio').value),480);result.setAttribute('aria-label','Straightened artwork preview');result.setAttribute('role','img');$('#photo-result').replaceChildren(result);
      const size=photoGeometry(points,Number($('#photo-ratio').value));$('#photo-size').textContent=`${size.width} × ${size.height} pixels`;$('#photo-error').textContent='';$('#photo-apply').disabled=false;
    }catch(error){$('#photo-error').textContent=error.message;$('#photo-apply').disabled=true;$('#photo-result').replaceChildren();$('#photo-size').textContent='';}
  }
  function draw(){
    svg.querySelector('polygon').setAttribute('points',points.map(p=>`${p.x},${p.y}`).join(' '));
    const radius=Math.max(1,photo.width/Math.max(1,svg.getBoundingClientRect().width))*20;
    handles.forEach((handle,i)=>{handle.setAttribute('transform',`translate(${points[i].x} ${points[i].y})`);handle.querySelector('circle').setAttribute('r',radius);handle.querySelector('text').setAttribute('font-size',radius*.85);handle.setAttribute('aria-valuenow',Math.round(points[i].x/photo.width*100));handle.setAttribute('aria-valuetext',`${Math.round(points[i].x/photo.width*100)}% across, ${Math.round(points[i].y/photo.height*100)}% down`);});
  }
  function schedule(){draw();clearTimeout(timer);timer=setTimeout(preview,80);}
  function reset(){points=[{x:photo.width*.06,y:photo.height*.06},{x:photo.width*.94,y:photo.height*.06},{x:photo.width*.94,y:photo.height*.94},{x:photo.width*.06,y:photo.height*.94}];draw();preview();}
  function move(index,x,y){points[index]={x:Math.max(0,Math.min(photo.width-1,x)),y:Math.max(0,Math.min(photo.height-1,y))};schedule();}
  svg.onpointerdown=event=>{const handle=event.target.closest('[data-corner]');if(!handle||applying||drag)return;event.preventDefault();handle.focus();drag={index:Number(handle.dataset.corner),id:event.pointerId};svg.setPointerCapture(event.pointerId);};
  svg.onpointermove=event=>{if(!drag||drag.id!==event.pointerId)return;event.preventDefault();const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());move(drag.index,p.x,p.y);};
  const finish=event=>{if(drag?.id===event.pointerId){drag=null;preview();}};svg.onpointerup=finish;svg.onpointercancel=finish;svg.onlostpointercapture=finish;
  svg.onkeydown=event=>{const index=event.target.dataset.corner,delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(index===undefined||!delta||applying)return;event.preventDefault();const step=(event.shiftKey?10:1)*Math.max(photo.width,photo.height)/500;move(Number(index),points[index].x+delta[0]*step,points[index].y+delta[1]*step);};
  $('#photo-ratio').onchange=preview;$('#photo-reset').onclick=reset;
  for(const id of ['photo-cancel','photo-close'])$('#'+id).onclick=()=>dialog.close();
  dialog.addEventListener('cancel',event=>{if(applying)event.preventDefault();});
  dialog.addEventListener('close',()=>{clearTimeout(timer);cancelAnimationFrame(frame);observer.disconnect();dialog.remove();});
  $('#photo-apply').onclick=async()=>{
    if(applying)return;applying=true;dialog.querySelectorAll('button,select').forEach(el=>el.disabled=true);$('#photo-apply').textContent='Straightening…';
    try{await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));const corrected=rectifyPhoto(photo,points,Number($('#photo-ratio').value));await onApply(corrected.toDataURL('image/png'));dialog.close();}
    catch(error){$('#photo-error').textContent=error.message;}
    finally{applying=false;dialog.querySelectorAll('button,select').forEach(el=>el.disabled=false);$('#photo-apply').textContent='Apply rectangle';}
  };
  document.body.append(dialog);dialog.showModal();
  const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);});observer.observe(svg);reset();
}
