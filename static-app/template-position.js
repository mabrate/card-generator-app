// Relative layout is resolved on rendered SVG geometry before preview or export.
const visual=node=>!node.closest('defs,clipPath,mask,pattern,marker');
const byId=(root,id)=>[...root.querySelectorAll('[id]')].find(node=>node.id===id);
const byField=(root,key)=>[...root.querySelectorAll('text[data-field]')].find(node=>node.getAttribute('data-field')===key);

export function positionDependencies(root,node){
  const result=[];
  if(node.matches('g,svg'))result.push(...[...node.children].filter(visual));
  const id=node.getAttribute('data-relative-to');if(id){const target=byId(root,id);if(target)result.push(target);}
  for(const key of [node.getAttribute('data-flow-after'),node.getAttribute('data-after-field')].filter(Boolean)){
    const target=byField(root,key);if(target)result.push(target);
  }
  return result;
}

export function validatePositioning(root){
  for(const node of root.querySelectorAll('[data-relative-to]')){
    const matches=[...root.querySelectorAll('[id]')].filter(target=>target.id===node.getAttribute('data-relative-to'));
    if(node.localName!=='text')throw Error('Relative positioning is available for labels and text fields.');
    if(matches.length!==1||!visual(matches[0])||!matches[0].matches('g,text,rect,path,circle,ellipse,line,polygon,polyline,image,use'))throw Error('Relative positioning needs an existing, uniquely named visual element.');
    if(matches[0]===node||matches[0].contains(node)||node.contains(matches[0]))throw Error('An element cannot be positioned relative to itself or its containing group.');
    if(!['below','above','right','left','align'].includes(node.getAttribute('data-relative-position') || 'below'))throw Error('Choose a supported relative position.');
    if(!['start','center','end'].includes(node.getAttribute('data-relative-align') || 'start'))throw Error('Choose start, center or end alignment.');
    for(const [key,min,max] of [['data-relative-gap',0,252],['data-relative-x',-1000,1000],['data-relative-y',-1000,1000]])if(node.hasAttribute(key)){
      const value=Number(node.getAttribute(key));if(!Number.isFinite(value)||value<min||value>max)throw Error('Invalid relative positioning value: '+key);
    }
  }
  const done=new Set(),active=new Set();
  function visit(node){
    if(active.has(node))throw Error('Relative positioning cannot contain a circular dependency.');
    if(done.has(node))return;
    active.add(node);for(const dependency of positionDependencies(root,node))visit(dependency);active.delete(node);done.add(node);
  }
  for(const node of [...root.querySelectorAll('*')].filter(visual))visit(node);
}

export function rootBounds(root,node){
  const box=node.getBBox(),matrix=root.getCTM().inverse().multiply(node.getCTM());
  const points=[[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));
  const x=Math.min(...points.map(point=>point.x)),y=Math.min(...points.map(point=>point.y));
  return {x,y,width:Math.max(...points.map(point=>point.x))-x,height:Math.max(...points.map(point=>point.y))-y};
}

function place(root,node){
  const id=node.getAttribute('data-relative-to');if(!id)return;
  const target=rootBounds(root,byId(root,id)),own=rootBounds(root,node),mode=node.getAttribute('data-relative-position') || 'below';
  const align={start:0,center:.5,end:1}[node.getAttribute('data-relative-align') || 'start'];
  const gap=node.hasAttribute('data-relative-gap')?Number(node.getAttribute('data-relative-gap')):3;
  let x=target.x+(target.width-own.width)*align,y=target.y+(target.height-own.height)*align;
  if(mode==='below')y=target.y+target.height+gap;
  if(mode==='above')y=target.y-gap-own.height;
  if(mode==='right')x=target.x+target.width+gap;
  if(mode==='left')x=target.x-gap-own.width;
  x+=Number(node.getAttribute('data-relative-x') || 0);y+=Number(node.getAttribute('data-relative-y') || 0);
  const matrix=node.parentElement.getCTM().inverse().multiply(root.getCTM()),zero=new DOMPoint(0,0).matrixTransform(matrix),delta=new DOMPoint(x-own.x,y-own.y).matrixTransform(matrix);
  node.setAttribute('transform',`translate(${delta.x-zero.x} ${delta.y-zero.y}) `+(node.getAttribute('transform') || ''));
}

export function resolvePositioning(root,renderText){
  const done=new Set();
  function visit(node){
    if(done.has(node))return;
    for(const dependency of positionDependencies(root,node))visit(dependency);
    renderText(node);place(root,node);done.add(node);
  }
  for(const node of [...root.querySelectorAll('*')].filter(visual))visit(node);
}
