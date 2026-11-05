// Text layout shared by the studio, template builder, SVG downloads and print sheets.
const NS='http://www.w3.org/2000/svg';
const number=(el,key,fallback)=>el.hasAttribute(key)?Number(el.getAttribute(key)):fallback;
const checked=value=>/^(true|1|yes|y|on)$/i.test(String(value ?? '').trim());

export function renderText(el,field,values,root,colors={}){
  const label=field.type==='label'?(el.getAttribute('data-label-text') ?? el.textContent):null;
  const first=el.querySelector('tspan');
  let x=Number(first?.getAttribute('x') ?? el.getAttribute('x') ?? 0);
  let y=Number(first?.getAttribute('y') ?? el.getAttribute('y') ?? 0),width=field.width;
  if(first?.getAttribute('style'))el.style.cssText+=';'+first.getAttribute('style');
  for(const attr of ['font-size','font-family','font-weight','font-style','text-anchor'])if(first?.hasAttribute(attr))el.setAttribute(attr,first.getAttribute(attr));
  el.replaceChildren();el.setAttribute('x',x);el.setAttribute('y',y);
  const find=key=>[...root.querySelectorAll('text[data-field]')].find(node=>node.getAttribute('data-field')===key);
  const after=el.getAttribute('data-after-field');
  if(after){const previous=find(after),used=previous?.getComputedTextLength() || 0;x=Number(previous?.getAttribute('x') || 0)+used+1.5;width=Math.max(1,width-used-1.5);el.setAttribute('x',x);}
  const value=field.type==='checkbox'?(checked(values[field.key])?(el.getAttribute('data-checked-text') ?? 'N'):''):String(values[field.key] || '');
  const main=label ?? (value?(el.getAttribute('data-prefix') || '')+value+(el.getAttribute('data-suffix') || ''):'');
  const inlineKey=el.getAttribute('data-inline-field'),inline=String(values[inlineKey] || '');
  const suffix=inlineKey&&inline?(el.getAttribute('data-inline-prefix') ?? (label===null?' (':' '))+inline+(el.getAttribute('data-inline-suffix') ?? (label===null?')':'')):'';
  const full=main+suffix,styles=[...main].map(()=>false).concat([...suffix].map(()=>true)),chars=[...full];
  const baseSize=parseFloat(getComputedStyle(el).fontSize) || 7;
  const inlineSize=number(el,'data-inline-font-size',baseSize),inlineRole=el.getAttribute('data-inline-color-role'),inlineFill=(inlineRole?colors[inlineRole]:null) || el.getAttribute('data-inline-fill');
  const spacing=number(el,'data-line-spacing',number(el,'data-line-height',baseSize*1.2)/baseSize),mode=el.getAttribute('data-fit') || 'wrap';
  const height=number(el,'data-height',Infinity),minSize=Math.min(baseSize,number(el,'data-min-font-size',Math.min(5,baseSize)));
  let currentSize=baseSize;
  function spans(start,end){
    const nodes=[];
    for(let i=start;i<end;i++){
      let span=nodes.at(-1);
      if(!span || styles[i]!==styles[i-1]){
        span=document.createElementNS(NS,'tspan');
        if(styles[i]){
          span.setAttribute('data-appended-field',inlineKey);span.setAttribute('font-style',el.getAttribute('data-inline-font-style') || 'normal');span.setAttribute('font-weight',el.getAttribute('data-inline-font-weight') || 'normal');
          if(el.hasAttribute('data-inline-font-family'))span.setAttribute('font-family',el.getAttribute('data-inline-font-family'));
          if(el.hasAttribute('data-inline-font-size'))span.setAttribute('font-size',inlineSize*currentSize/baseSize);
          if(inlineFill)span.setAttribute('fill',inlineFill);
        }
        nodes.push(span);
      }
      span.textContent+=chars[i];
    }
    return nodes;
  }
  function layout(size){
    currentSize=size;
    el.style.fontSize=size+'px';
    const lineHeight=spacing*Math.max(baseSize,inlineSize)*size/baseSize;
    const measure=(start,end)=>{el.replaceChildren(...spans(start,end));return el.getComputedTextLength();};
    const lines=[];let start=0,end=0,index=0;
    const add=()=>{lines.push([start,end]);start=index;end=index;};
    while(index<chars.length){
      if(chars[index]==='\n'){add();index++;start=end=index;continue;}
      if(/\s/u.test(chars[index])){index++;continue;}
      let wordEnd=index;while(wordEnd<chars.length&&!/\s/u.test(chars[wordEnd]))wordEnd++;
      if(mode==='shrink' || measure(start,wordEnd)<=width+.01){end=wordEnd;index=wordEnd;continue;}
      if(end>start){add();start=index;}
      while(index<wordEnd){
        if(end>start && measure(start,index+1)>width+.01){add();start=index;}
        index++;end=index;
      }
    }
    lines.push([start,end]);
    el.replaceChildren(...lines.map(([from,to],i)=>{const line=document.createElementNS(NS,'tspan');line.setAttribute('x',x);line.setAttribute('y',y+i*lineHeight);line.append(...spans(from,to));return line;}));
    const box=el.getBBox(),tooWide=[...el.children].some(line=>line.getComputedTextLength()>width+.01);
    return {fits:!tooWide&&lines.length<=field.lines&&box.height<=height+.01,lines,box};
  }
  let result=layout(baseSize);
  if(mode!=='wrap'&&!result.fits){
    let low=minSize,high=baseSize;result=layout(low);
    if(result.fits){for(let i=0;i<12;i++){const middle=(low+high)/2;if(layout(middle).fits)low=middle;else high=middle;}result=layout(low);}
  }
  const flow=el.getAttribute('data-flow-after');
  if(flow){
    const previous=find(flow),box=previous.getBBox(),matrix=el.getCTM().inverse().multiply(previous.getCTM());
    const corners=[[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]].map(([a,b])=>new DOMPoint(a,b).matrixTransform(matrix));
    const bottom=Math.max(...corners.map(p=>p.y));
    const dy=bottom+number(el,'data-gap',3)-result.box.y;
    y+=dy;el.setAttribute('y',y);
    for(const line of el.children)line.setAttribute('y',Number(line.getAttribute('y'))+dy);
    result.box=el.getBBox();
  }
  const issues=[];
  if(!result.fits)issues.push(`${field.label}: text does not fit ${field.lines} line${field.lines===1?'':'s'}${mode==='wrap'?'':' at the minimum font size'}.`);
  if([...value].length>field.max)issues.push(`${field.label}: shorten the text to ${field.max} characters.`);
  if(field.required&&!value.trim())issues.push(`${field.label} is required.`);
  return issues;
}
