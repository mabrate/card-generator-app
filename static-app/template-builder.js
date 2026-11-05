import {readTemplate,renderTemplate,replacePaint,checkedValue} from './template.js';
import {PALETTES} from './palettes.js';

const NS='http://www.w3.org/2000/svg';
const svg=(name,attrs={})=>{const el=document.createElementNS(NS,name);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);return el;};
const serialize=root=>new XMLSerializer().serializeToString(root);
const round=value=>Math.round(value*100)/100;
const matrix=value=>new DOMMatrix([value.a,value.b,value.c,value.d,value.e,value.f]);
const fonts=['Liberation Sans, sans-serif','Arial, sans-serif','Georgia, serif','Courier New, monospace'];
const title=el=>el.getAttribute('data-label') || el.getAttribute('data-field') || (el.localName==='g'?(el.id || 'Group').replaceAll('-',' ').replace(/^./,letter=>letter.toUpperCase()):el.hasAttribute('data-image')?'Artwork frame':el.localName==='text'?el.textContent.slice(0,32):el.id || el.localName);
const drawable=root=>[...root.querySelectorAll('g[data-visible-if],g[data-builder-group],text,rect,path,circle,ellipse,line,polygon,polyline,image')].filter(el=>!el.closest('defs,clipPath,mask,pattern,marker'));
const fresh=`<svg xmlns="${NS}" viewBox="0 0 180 252" data-title="New template" font-family="Liberation Sans, sans-serif"><rect width="180" height="252" fill="#ffffff"/><text x="14" y="27" font-size="12" fill="#244734" data-field="common_name" data-label="Common name" data-width="152" data-lines="2" data-max-chars="100" data-fit="wrap">{{common_name}}</text><rect x="14" y="68" width="152" height="168" data-image="artwork" fill="#eef3e8"/></svg>`;

export function openTemplateBuilder(options){return new TemplateBuilder(options);}

class TemplateBuilder{
  constructor(options){
    this.options=options;this.key=options.storageKey+':template-builder:'+(options.draftId || options.side);
    this.history=[];this.future=[];this.selected='';this.preview='card';this.pending=null;
    this.dialog=document.createElement('dialog');this.dialog.id='template-builder';this.dialog.setAttribute('aria-labelledby','tb-title');
    this.dialog.innerHTML=`
      <header class="tb-header"><div><h2 id="tb-title">Template builder</h2><p id="tb-context"></p></div><button type="button" class="button secondary" id="tb-close">Close</button></header>
      <div class="tb-toolbar"><label class="button secondary open-project">Upload template<input id="tb-upload" type="file" accept=".svg,image/svg+xml"></label><button type="button" class="button secondary" id="tb-download">Download template</button><button type="button" class="button secondary" id="tb-new">New template</button><span class="tb-toolbar-divider"></span><button type="button" class="button secondary" id="tb-undo">Undo</button><button type="button" class="button secondary" id="tb-redo">Redo</button></div>
      <div id="tb-draft" hidden><span>An unfinished template is saved in this browser.</span><button type="button" class="button secondary" id="tb-restore">Restore draft</button><button type="button" class="button secondary" id="tb-dismiss">Dismiss</button></div>
      <p id="tb-error" class="error" role="alert"></p>
      <div class="tb-workspace">
        <aside class="tb-layers"><label>Template name<input id="tb-name" maxlength="120"></label><h3>Elements</h3><div class="tb-add"><button type="button" class="button secondary" id="tb-add-field">+ Field</button><button type="button" class="button secondary" id="tb-add-label">+ Label</button><button type="button" class="button secondary" id="tb-add-shape">+ Rectangle</button><button type="button" class="button secondary" id="tb-add-badge">+ Badge</button></div><div id="tb-elements" role="group" aria-label="Template elements"></div></aside>
        <section class="tb-stage"><div class="tb-stage-tools"><label>Preview<select id="tb-preview"><option value="card">Current card</option><option value="placeholders">Placeholders</option></select></label><span>180 × 252 pt · 2.5 × 3.5 in</span></div><label class="tb-check tb-show-conditional">Show conditional elements<input id="tb-show-conditional" type="checkbox"></label><p id="tb-visibility-status" class="tb-help" role="status" hidden></p><div id="tb-canvas" tabindex="0" role="group" aria-label="Template canvas. Drag elements to move them. Arrow keys move the selected element."></div><p class="tb-help">Drag to move. Hold Shift or Ctrl while resizing to keep proportions. Arrow keys move 1 pt; Shift moves 10 pt.</p><ul id="tb-issues" class="error" aria-live="polite"></ul></section>
        <aside class="tb-inspector"><h3 id="tb-selection-title">Select an element</h3><p class="tb-help">Select on the card or in Elements. Positions and sizes use points: 72 pt = 1 inch.</p><div id="tb-properties"></div><div class="tb-object-actions"><button type="button" class="button secondary" id="tb-backward">Send backward</button><button type="button" class="button secondary" id="tb-forward">Bring forward</button><button type="button" class="button secondary danger" id="tb-delete">Delete element</button></div></aside>
      </div>
      <footer class="tb-footer"><p id="tb-status" role="status">Changes stay in this builder until you apply them.</p><button type="button" class="button" id="tb-apply"></button></footer>`;
    document.body.append(this.dialog);
    this.$=selector=>this.dialog.querySelector(selector);
    this.$('#tb-context').textContent=options.side==='back'?'Editing the back template':options.ownLayout?'Editing this card’s front layout':'Editing the front template';
    this.$('#tb-apply').textContent=options.ownLayout?'Apply to this card':`Apply to ${options.side} template`;
    try{const saved=JSON.parse(localStorage.getItem(this.key));if(saved?.source&&saved.source!==options.source){readTemplate(saved.source);this.pending=saved.source;this.$('#tb-draft').hidden=false;}}catch{}
    this.load(options.source);this.bind();this.dialog.showModal();this.refresh();
    this.dialog.addEventListener('close',()=>this.dialog.remove(),{once:true});
    this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.close();});
  }
  source(){return serialize(this.root);}
  load(source){
    const next=readTemplate(source);this.root=next.root;
    const used=new Set();let count=0;
    for(const el of drawable(this.root)){
      let id=el.getAttribute('data-builder-id');if(!id||used.has(id))id='element-'+(++count)+'-'+Math.random().toString(36).slice(2,8);
      el.setAttribute('data-builder-id',id);used.add(id);
      if(el.localName==='g')el.setAttribute('data-builder-group','true');
      if(el.matches('text[data-field],text[data-inline-field]')){
        const first=el.querySelector('tspan');
        if(first){if(first.hasAttribute('style'))el.style.cssText+=';'+first.getAttribute('style');for(const key of ['x','y','font-size','font-family','font-weight','font-style','text-anchor'])if(first.hasAttribute(key))el.setAttribute(key,first.getAttribute(key));el.textContent=el.hasAttribute('data-field')?'{{'+el.getAttribute('data-field')+'}}':el.getAttribute('data-label-text') ?? el.textContent;}
      }
    }
    if(!this.element())this.selected=drawable(this.root)[0]?.getAttribute('data-builder-id') || '';
  }
  element(){return drawable(this.root).find(el=>el.getAttribute('data-builder-id')===this.selected);}
  live(){return this.$('#tb-canvas').querySelector(`[data-builder-id="${this.selected}"]`);}
  error(error){this.$('#tb-error').textContent=error.message || String(error);}
  recover(){try{localStorage.setItem(this.key,JSON.stringify({source:this.source()}));this.$('#tb-status').textContent='Draft saved in this browser. Apply to update the project.';}catch{this.$('#tb-status').textContent='Browser draft storage is full. Download the template to keep your edits.';}}
  change(action){
    const before=this.source();
    try{action();readTemplate(this.source());if(before!==this.source()){this.history.push(before);if(this.history.length>60)this.history.shift();this.future=[];this.recover();}this.$('#tb-error').textContent='';this.refresh();}
    catch(error){this.load(before);this.refresh();this.error(error);}
  }
  bind(){
    this.$('#tb-close').onclick=()=>this.close();
    this.$('#tb-name').onchange=event=>this.change(()=>this.root.setAttribute('data-title',event.target.value || 'Custom template'));
    this.$('#tb-preview').onchange=event=>{this.preview=event.target.value;this.draw();this.properties();};
    this.$('#tb-show-conditional').onchange=()=>{this.draw();this.properties();};
    this.$('#tb-upload').onchange=async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;try{if(file.size>500000)throw Error('Choose a template SVG under 500 KB.');const source=await file.text();readTemplate(source);this.change(()=>this.load(source));}catch(error){this.error(error);}};
    this.$('#tb-download').onclick=()=>{try{const source=readTemplate(this.source()).source,name=this.root.getAttribute('data-title') || 'template',url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'})),link=document.createElement('a');link.href=url;link.download=name.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-template.svg';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.$('#tb-status').textContent='Template downloaded with its layout and fitting settings.';}catch(error){this.error(error);}};
    this.$('#tb-new').onclick=()=>this.change(()=>this.load(fresh));
    this.$('#tb-undo').onclick=()=>this.undo();this.$('#tb-redo').onclick=()=>this.undo(true);
    this.$('#tb-restore').onclick=()=>{this.change(()=>this.load(this.pending));this.$('#tb-draft').hidden=true;};
    this.$('#tb-dismiss').onclick=()=>{this.$('#tb-draft').hidden=true;try{localStorage.removeItem(this.key);}catch{}};
    this.$('#tb-add-field').onclick=()=>this.add('field');this.$('#tb-add-label').onclick=()=>this.add('label');this.$('#tb-add-shape').onclick=()=>this.add('shape');
    this.$('#tb-add-badge').onclick=()=>this.add('badge');
    this.$('#tb-delete').onclick=()=>this.remove();
    this.$('#tb-forward').onclick=()=>this.reorder(true);this.$('#tb-backward').onclick=()=>this.reorder(false);
    this.$('#tb-apply').onclick=async()=>{
      const button=this.$('#tb-apply');button.disabled=true;
      try{const next=readTemplate(this.source());await this.options.onApply(next.source);try{localStorage.removeItem(this.key);}catch{}this.dialog.close();}
      catch(error){this.error(error);}finally{button.disabled=false;}
    };
    const canvas=this.$('#tb-canvas');
    canvas.addEventListener('pointerdown',event=>this.pointerDown(event));
    canvas.addEventListener('pointermove',event=>this.pointerMove(event));
    canvas.addEventListener('pointerup',event=>this.pointerEnd(event));
    canvas.addEventListener('pointercancel',event=>this.pointerEnd(event,true));
    canvas.addEventListener('lostpointercapture',event=>{if(this.drag)this.pointerEnd(event,true);});
    this.dialog.addEventListener('keydown',event=>{
      if(event.target.matches('input,textarea,select'))return;
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();this.undo(event.shiftKey);return;}
      if(event.target!==canvas)return;
      if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();this.remove();return;}
      const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
      if(delta&&this.element()){event.preventDefault();const amount=event.shiftKey?10:1;this.change(()=>{this.detach();this.translate(delta[0]*amount,delta[1]*amount);});}
    });
  }
  close(){this.dialog.close();this.options.onClose?.();}
  undo(redo=false){const from=redo?this.future:this.history,to=redo?this.history:this.future;if(!from.length)return;to.push(this.source());this.load(from.pop());this.recover();this.refresh();}
  add(kind){
    this.change(()=>{
      let node;
      if(kind==='shape')node=svg('rect',{x:14,y:90,width:80,height:30,fill:'#dfe9d6'});
      else if(kind==='label'){node=svg('text',{x:14,y:85,'font-size':8,fill:'#244734'});node.textContent='Label';}
      else if(kind==='badge'){
        let index=1;const keys=new Set(readTemplate(this.source()).fields.map(field=>field.key));while(keys.has('badge_'+index))index++;
        const key='badge_'+index;
        node=svg('g',{'data-label':'Badge '+index,'data-visible-if':key,'data-builder-group':'true'});
        const circle=svg('circle',{cx:150,cy:20,r:7,fill:'#228b22','data-label':'Badge circle'});
        const text=svg('text',{x:150,y:23,'text-anchor':'middle','font-size':8,'font-weight':'bold',fill:'#ffffff','data-field':key,'data-label':'Badge '+index,'data-input':'checkbox','data-checked-text':'N','data-width':14,'data-lines':1,'data-max-chars':30});text.textContent='{{'+key+'}}';node.append(circle,text);
      }
      else{let index=1;const keys=new Set(readTemplate(this.source()).fields.map(f=>f.key));while(keys.has('field_'+index))index++;const key='field_'+index;node=svg('text',{x:14,y:60,'font-size':8,fill:'#244734','data-field':key,'data-label':'New field','data-width':152,'data-lines':2,'data-max-chars':200,'data-fit':'wrap'});node.textContent='{{'+key+'}}';}
      this.selected='element-'+crypto.randomUUID();node.setAttribute('data-builder-id',this.selected);this.root.append(node);
      if(kind==='badge')this.load(this.source());
    });
  }
  remove(){const el=this.element();if(!el)return;this.change(()=>{
    const keys=new Set([el,...el.querySelectorAll('[data-field]')].map(node=>node.getAttribute('data-field')).filter(Boolean));
    const ids=new Set([el,...el.querySelectorAll('[id]')].map(node=>node.id).filter(Boolean));
    for(const node of this.root.querySelectorAll('[data-relative-to]'))if(!el.contains(node)&&ids.has(node.getAttribute('data-relative-to')))throw Error('Another label is positioned relative to this element. Set its Relative to option to Fixed position before deleting.');
    for(const node of this.root.querySelectorAll('[data-flow-after],[data-after-field],[data-visible-if]'))if(!el.contains(node))for(const attr of ['data-flow-after','data-after-field','data-visible-if']){
      if(keys.has(node.getAttribute(attr)))throw Error(attr==='data-visible-if'?'This checkbox controls another element. Set that element’s “Show when” to Always before deleting.':'Another field follows this one. Set its “Relative to” option to Fixed position before deleting.');
    }
    el.remove();this.selected='';
  });}
  reorder(forward){const el=this.element();if(!el)return;this.change(()=>{if(forward){const next=el.nextElementSibling;if(next)next.after(el);}else{const previous=el.previousElementSibling;if(previous&&!previous.matches('title,desc,defs,metadata'))previous.before(el);}});}
  refresh(){
    this.$('#tb-name').value=this.root.getAttribute('data-title') || 'Custom template';
    const list=this.$('#tb-elements'),existing=new Map([...list.children].map(button=>[button.dataset.element,button]));
    for(const [index,el] of drawable(this.root).entries()){
      const id=el.getAttribute('data-builder-id');let button=existing.get(id);
      if(!button){button=document.createElement('button');button.type='button';button.className='tb-layer';button.dataset.element=id;button.onclick=()=>{if(this.selected!==button.dataset.element)this.$('.tb-inspector').scrollTop=0;this.selected=button.dataset.element;this.refresh();};}
      existing.delete(id);button.setAttribute('aria-pressed',String(id===this.selected));
      button.dataset.kind=el.localName;if(el.hasAttribute('data-field'))button.dataset.field=el.getAttribute('data-field');
      else delete button.dataset.field;
      const condition=el.getAttribute('data-visible-if'),caption=title(el)+'|'+(condition || '');
      if(button.dataset.caption!==caption){button.textContent=title(el);if(condition){const note=document.createElement('small');note.textContent='When '+condition+' is checked';button.append(note);}button.dataset.caption=caption;}
      if(condition)button.dataset.condition=condition;else delete button.dataset.condition;
      let depth=0;for(let parent=el.parentElement;parent&&parent!==this.root;parent=parent.parentElement)if(parent.hasAttribute('data-builder-group'))depth++;
      button.style.paddingLeft=(10+depth*12)+'px';
      if(list.children[index]!==button)list.insertBefore(button,list.children[index] || null);
    }
    for(const button of existing.values())button.remove();
    this.$('#tb-undo').disabled=!this.history.length;this.$('#tb-redo').disabled=!this.future.length;
    this.draw();this.properties();
  }
  draw(){
    try{
      const layout=readTemplate(this.source()),values=this.preview==='card'?{...this.options.values}:{};
      // New fields remain visible and selectable before they have card data.
      for(const field of layout.fields)if(this.preview==='placeholders'||!Object.hasOwn(values,field.key))values[field.key]=field.type==='checkbox'?(this.preview==='placeholders'?'true':'false'):'{{'+field.key+'}}';
      const overrides=new Set(),reveal=key=>{if(!checkedValue(this.options.values[key]))overrides.add(key);values[key]='true';};
      if(this.$('#tb-show-conditional').checked||this.preview==='placeholders'){
        for(const node of layout.root.querySelectorAll('[data-visible-if]'))reveal(node.getAttribute('data-visible-if'));
        for(const field of layout.fields)if(field.type==='checkbox')reveal(field.key);
      }
      for(let node=this.element();node&&node!==this.root;node=node.parentElement){if(node.hasAttribute('data-visible-if'))reveal(node.getAttribute('data-visible-if'));}
      if(this.element()?.getAttribute('data-input')==='checkbox')reveal(this.element().getAttribute('data-field'));
      const notice=this.$('#tb-visibility-status');notice.hidden=!overrides.size;notice.textContent=overrides.size?'Showing '+[...overrides].map(key=>layout.fields.find(field=>field.key===key)?.label || key).join(', ')+' as checked for editing. Card data is unchanged.':'';
      const result=renderTemplate(layout,values,layout.colors,this.options.imageData,this.options.crop,this.$('#tb-canvas'));
      this.rendered=result.root;
      const issues=this.$('#tb-issues');issues.replaceChildren(...result.issues.map(message=>{const li=document.createElement('li');li.textContent=message;return li;}));
      const live=this.live();if(!live)return;
      const box=this.bounds(live),overlay=svg('g',{'data-builder-overlay':'true','pointer-events':'none'});
      overlay.append(svg('rect',{x:box.x,y:box.y,width:box.width,height:box.height,fill:'none',stroke:'#176de0','stroke-width':.8,'stroke-dasharray':'2 1','vector-effect':'non-scaling-stroke'}));
      const handle=svg('rect',{x:box.x+box.width-2,y:box.y+box.height-2,width:4,height:4,fill:'#176de0',stroke:'white','stroke-width':.6,'data-builder-resize':'true','pointer-events':'all'});overlay.append(handle);this.rendered.append(overlay);
    }catch(error){this.error(error);}
  }
  bounds(live=this.live()){
    let box=live.getBBox();
    if(live.matches('text[data-field],text[data-inline-field]')){
      const width=Number(live.getAttribute('data-width')),anchor=getComputedStyle(live).textAnchor,x=Number(live.getAttribute('x') || 0);
      box={x:x-(anchor==='middle'?width/2:anchor==='end'?width:0),y:box.y,width,height:Math.max(box.height,Number(live.getAttribute('data-height')) || 0,4)};
    }
    const matrix=this.rendered.getScreenCTM().inverse().multiply(live.getScreenCTM());
    const points=[[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));
    const left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y));return {x:left,y:top,width:Math.max(2,Math.max(...points.map(p=>p.x))-left),height:Math.max(2,Math.max(...points.map(p=>p.y))-top)};
  }
  paint(el,property,color){
    if(!replacePaint(el,property,color)){el.setAttribute(property,color);el.style.setProperty(property,color);}
  }
  colorRole(el,property,role,fallback){
    if(role && !/^[a-z][a-z0-9_-]{0,29}$/.test(role))throw Error('Theme role names start with a lowercase letter and use letters, numbers, hyphens or underscores (up to 30 characters).');
    const colors=readTemplate(this.source()).colors;
    if(role){el.setAttribute('data-color-'+property,role);this.paint(el,property,colors[role] || fallback);}
    else{el.removeAttribute('data-color-'+property);if(!/^none$|^url\(/i.test(getComputedStyle(this.live()).getPropertyValue(property)))this.paint(el,property,fallback);}
    this.newRole=null;
  }
  color(el,property,value){
    const role=el.getAttribute('data-color-'+property);
    if(role)this.roleColor(role,value);
    this.paint(el,property,value);
  }
  roleColor(role,value){
    for(const node of this.root.querySelectorAll('[data-color-fill],[data-color-stroke]'))for(const paint of ['fill','stroke']){
      if(node.getAttribute('data-color-'+paint)===role)replacePaint(node,paint,value);
    }
    for(const node of this.root.querySelectorAll('text[data-inline-field][data-inline-color-role]'))if(node.getAttribute('data-inline-color-role')===role)node.setAttribute('data-inline-fill',value);
  }
  relativeTarget(el){
    const id=el.getAttribute('data-relative-to'),key=el.getAttribute('data-flow-after');
    return drawable(this.root).find(node=>id?node.id===id:key&&node.getAttribute('data-field')===key);
  }
  anchor(el,target,position=el.getAttribute('data-relative-position') || 'below'){
    if(!target.id)target.id='layout-'+crypto.randomUUID();
    if(!el.hasAttribute('data-relative-gap'))el.setAttribute('data-relative-gap',el.getAttribute('data-gap') || 3);
    el.setAttribute('data-relative-to',target.id);el.setAttribute('data-relative-position',position);el.removeAttribute('data-flow-after');el.removeAttribute('data-after-field');
  }
  properties(){
    const inspector=this.$('.tb-inspector'),scroll=inspector.scrollTop,host=this.$('#tb-properties');host.replaceChildren();const el=this.element(),live=this.live();
    const actions=this.dialog.querySelectorAll('.tb-object-actions button');actions.forEach(button=>button.disabled=!el);
    this.$('#tb-selection-title').textContent=el?title(el):'Select an element';if(!el||!live)return;
    const style=getComputedStyle(live),box=this.bounds(live),field=el.matches('text[data-field]'),labelBlock=el.matches('text[data-inline-field]:not([data-field])'),block=field||labelBlock;
    const section=name=>{const heading=document.createElement('h4');heading.textContent=name;host.append(heading);};
    const control=(label,key,value,setter,{type='text',options,min,max,step}={})=>{
      const wrapper=document.createElement('label');wrapper.textContent=label;
      const input=document.createElement(options?'select':type==='textarea'?'textarea':'input');input.id='tb-prop-'+key;
      if(options)for(const [caption,id] of options)input.append(new Option(caption,id));else if(type!=='textarea')input.type=type;
      if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;if(step!==undefined)input.step=step;
      if(type==='checkbox'){input.checked=value;wrapper.className='tb-check';}else input.value=value;
      let committed=false;
      input.onchange=()=>{if(committed||!input.isConnected)return;committed=true;const next=type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value;this.change(()=>{if(type==='number'&&(!Number.isFinite(next)||(min!==undefined&&next<min)||(max!==undefined&&next>max)))throw Error('Enter a valid '+label.toLowerCase()+'.');setter(next);});};
      wrapper.append(input);host.append(wrapper);return input;
    };
    const attr=(label,key,value,opts={})=>control(label,key,value,next=>{if(next===''||next===false)el.removeAttribute(key);else el.setAttribute(key,next===true?'true':next);},opts);
    section('Visibility');
    if(el.localName==='g')attr('Group name','data-label',title(el));
    const fields=readTemplate(this.source()).fields,condition=el.getAttribute('data-visible-if') || '',checkboxes=fields.filter(field=>field.type==='checkbox');
    const choices=checkboxes.map(field=>[field.label+' is checked',field.key]);if(condition&&!checkboxes.some(field=>field.key===condition))choices.push([condition+' is true',condition]);
    const ancestor=el.parentElement?.closest('[data-visible-if]');
    attr('Show when','data-visible-if',condition,{options:[[ancestor?'Always (within its group)':'Always',''],...choices]});
    if(ancestor){
      const note=document.createElement('p');note.className='tb-help';note.textContent='Inside “'+title(ancestor)+'”, shown when '+ancestor.getAttribute('data-visible-if')+' is checked.';host.append(note);
      const button=document.createElement('button');button.type='button';button.className='button secondary';button.textContent='Edit conditional group';button.id='tb-edit-conditional-group';
      button.onclick=()=>{this.selected=ancestor.getAttribute('data-builder-id');this.$('.tb-inspector').scrollTop=0;this.refresh();};host.append(button);
    }
    section('Position & size');
    if(el.localName==='text'){
      const target=this.relativeTarget(el),candidates=drawable(this.root).filter(node=>node!==el&&!node.contains(el)&&!el.contains(node));
      control('Relative to','data-relative-to',target?.getAttribute('data-builder-id') || '',value=>{
        if(!value){this.detach();return;}
        this.anchor(el,candidates.find(node=>node.getAttribute('data-builder-id')===value));
      },{options:[['Fixed position',''],...candidates.map(node=>[title(node),node.getAttribute('data-builder-id')])]});
      if(target){
        control('Placement','data-relative-position',el.getAttribute('data-relative-position') || 'below',value=>this.anchor(el,target,value),{options:[['Below','below'],['Above','above'],['Right of','right'],['Left of','left'],['Align with','align']]});
        control('Alignment','data-relative-align',el.getAttribute('data-relative-align') || 'start',value=>{this.anchor(el,target);el.setAttribute('data-relative-align',value);},{options:[['Start / top / left','start'],['Center','center'],['End / bottom / right','end']]});
        for(const [label,key,value,min,max] of [['Gap (pt)','data-relative-gap',el.getAttribute('data-relative-gap') ?? el.getAttribute('data-gap') ?? 3,0,252],['Horizontal offset (pt)','data-relative-x',el.getAttribute('data-relative-x') || 0,-1000,1000],['Vertical offset (pt)','data-relative-y',el.getAttribute('data-relative-y') || 0,-1000,1000]])control(label,key,value,next=>{this.anchor(el,target);el.setAttribute(key,next);},{type:'number',min,max,step:.5});
      }
    }
    control('X','x',round(box.x),value=>{this.detach();this.translate(value-box.x,0);},{type:'number',step:.5});
    control('Y','y',round(box.y),value=>{this.detach();this.translate(0,value-box.y);},{type:'number',step:.5});
    if(block){attr('Width','data-width',el.getAttribute('data-width'),{type:'number',min:1,max:180,step:.5});attr('Box height (optional)','data-height',el.getAttribute('data-height') || '',{type:'text'});}
    else{
      control('Width','width',round(box.width),value=>this.scale(value/box.width,1,box),{type:'number',min:1,max:360,step:.5});
      control('Height','height',round(box.height),value=>this.scale(1,value/box.height,box),{type:'number',min:1,max:504,step:.5});
    }
    if(el.localName==='text'){
      section('Text');
      const authoredFontSize=parseFloat(el.style.fontSize || el.getAttribute('font-size')) || parseFloat(style.fontSize);
      const lineSpacing=Number(el.getAttribute('data-line-spacing') ?? (el.hasAttribute('data-line-height')?Number(el.getAttribute('data-line-height'))/authoredFontSize:1.2));
      if(!field){
        control('Label text','label',el.getAttribute('data-label-text') ?? el.textContent,value=>{el.textContent=value;if(labelBlock)el.setAttribute('data-label-text',value);},{type:'textarea'});
        const metadata=readTemplate(this.source()).fields,inline=el.getAttribute('data-inline-field') || '';
        const keys=[...new Set([...metadata.map(field=>field.key),...Object.keys(this.options.values)])].filter(key=>!['card_id','image_filename','back_image_filename','copies','theme'].includes(key)&&metadata.find(field=>field.key===key)?.type!=='checkbox');
        control('Append field','data-inline-field',inline,value=>{
          const label=el.getAttribute('data-label-text') ?? el.textContent;
          if(!value){this.detach();for(const name of ['data-inline-field','data-inline-label','data-label-text','data-inline-prefix','data-inline-suffix'])el.removeAttribute(name);el.textContent=label;return;}
          el.setAttribute('data-label-text',label);el.setAttribute('data-inline-field',value);el.setAttribute('data-inline-label',metadata.find(field=>field.key===value)?.label || value.replaceAll('_',' '));
          if(!el.hasAttribute('data-inline-prefix'))el.setAttribute('data-inline-prefix',' ');if(!el.hasAttribute('data-inline-suffix'))el.setAttribute('data-inline-suffix','');
          if(!el.hasAttribute('data-width'))el.setAttribute('data-width',152);if(!el.hasAttribute('data-lines'))el.setAttribute('data-lines',2);if(!el.hasAttribute('data-max-chars'))el.setAttribute('data-max-chars',metadata.find(field=>field.key===value)?.max || 200);
        },{options:[['None',''],...keys.map(key=>[metadata.find(field=>field.key===key)?.label || key.replaceAll('_',' '),key])]});
        if(inline){control('Before appended value','data-inline-prefix',el.getAttribute('data-inline-prefix') ?? ' ',value=>el.setAttribute('data-inline-prefix',value));control('After appended value','data-inline-suffix',el.getAttribute('data-inline-suffix') ?? '',value=>el.setAttribute('data-inline-suffix',value));}
      }
      const families=[...fonts];
      const family=el.style.fontFamily || el.getAttribute('font-family') || style.fontFamily;if(!families.includes(family))families.unshift(family);
      control('Font','font-family',family,value=>{el.setAttribute('font-family',value);el.style.fontFamily=value;},{options:families.map(name=>[name.split(',')[0].replaceAll('"',''),name])});
      control('Font size','font-size',authoredFontSize,value=>{if(block){el.setAttribute('data-line-spacing',lineSpacing);el.removeAttribute('data-line-height');}el.setAttribute('font-size',value);el.style.fontSize=value+'px';},{type:'number',min:1,max:100,step:.5});
      control('Bold','bold',Number(style.fontWeight)>=600||style.fontWeight==='bold',value=>{el.setAttribute('font-weight',value?'bold':'normal');el.style.fontWeight=value?'bold':'normal';},{type:'checkbox'});
      control('Italic','italic',style.fontStyle==='italic',value=>{el.setAttribute('font-style',value?'italic':'normal');el.style.fontStyle=value?'italic':'normal';},{type:'checkbox'});
      control('Alignment','text-anchor',style.textAnchor || 'start',value=>{el.setAttribute('text-anchor',value);el.style.textAnchor=value;},{options:[['Left','start'],['Center','middle'],['Right','end']]});
      const note=document.createElement('p');note.className='tb-help';note.textContent='Liberation Sans is bundled in card downloads. Other fonts need to be installed on the receiving computer.';host.append(note);
    }
    section('Colors');
    const roles=[...new Set([...Object.keys(PALETTES[0].colors),...Object.keys(readTemplate(this.source()).colors),...[...this.root.querySelectorAll('[data-color-fill],[data-color-stroke]')].flatMap(node=>['fill','stroke'].map(property=>node.getAttribute('data-color-'+property))).filter(Boolean)])].sort();
    for(const property of ['fill','stroke']){
      const color=style.getPropertyValue(property),match=color.match(/^rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/),hex=match?'#'+match.slice(1).map(v=>Number(v).toString(16).padStart(2,'0')).join(''):'#244734';
      const role=el.getAttribute('data-color-'+property) || '',adding=this.newRole?.id===this.selected&&this.newRole.property===property;
      control(property==='fill'?'Fill theme role':'Stroke theme role',property+'-role',adding?'@new':role,value=>{
        if(value==='@new'){this.newRole={id:this.selected,property};return;}
        this.colorRole(el,property,value,hex);
      },{options:[['Fixed color',''],...roles.map(role=>[role,role]),['New theme role…','@new']]});
      if(adding)control('New '+property+' role name',property+'-new-role','',value=>this.colorRole(el,property,value,hex));
      control(role?'Default for '+role:(property==='fill'?'Fill color':'Stroke color'),property,hex,value=>this.color(el,property,value),{type:'color'});
      control('No '+property,'no-'+property,color==='none',value=>{
        if(value){el.setAttribute(property,'none');el.style.setProperty(property,'none');}
        else this.paint(el,property,readTemplate(this.source()).colors[role] || hex);
      },{type:'checkbox'});
      if(role){const note=document.createElement('p');note.className='tb-help';note.textContent=`Theme role “${role}”: changing its default updates all fills and strokes using this role in this template.`;host.append(note);}
    }
    control('Stroke width','stroke-width',parseFloat(style.strokeWidth) || 0,value=>{el.setAttribute('stroke-width',value);el.style.strokeWidth=String(value);},{type:'number',min:0,max:30,step:.25});
    const colorNote=document.createElement('p');colorNote.className='tb-help';colorNote.textContent='Theme roles follow the card’s selected theme. Fixed colors stay the same across themes. Role names and default colors are saved in the SVG.';host.append(colorNote);
    if(el.localName==='text'&&el.hasAttribute('data-inline-field')){
      section('Appended field style');
      const family=el.getAttribute('data-inline-font-family') || '',families=[...fonts];if(family&&!families.includes(family))families.unshift(family);
      attr('Appended font','data-inline-font-family',family,{options:[['Same as main text',''],...families.map(font=>[font.split(',')[0].replaceAll('"',''),font])]});
      attr('Appended font size (blank = same)','data-inline-font-size',el.getAttribute('data-inline-font-size') || '');
      control('Appended bold','data-inline-font-weight',el.getAttribute('data-inline-font-weight')==='bold',value=>el.setAttribute('data-inline-font-weight',value?'bold':'normal'),{type:'checkbox'});
      control('Appended italic','data-inline-font-style',el.getAttribute('data-inline-font-style')==='italic',value=>el.setAttribute('data-inline-font-style',value?'italic':'normal'),{type:'checkbox'});
      const role=el.getAttribute('data-inline-color-role'),adding=this.newRole?.id===this.selected&&this.newRole.property==='inline';
      const match=style.fill.match(/^rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/),inherited=match?'#'+match.slice(1).map(value=>Number(value).toString(16).padStart(2,'0')).join(''):'#244734';
      const hex=(role?readTemplate(this.source()).colors[role]:null) || el.getAttribute('data-inline-fill') || inherited;
      const inlineRole=value=>{
        if(!/^[a-z][a-z0-9_-]{0,29}$/.test(value))throw Error('Theme role names start with a lowercase letter and use letters, numbers, hyphens or underscores (up to 30 characters).');
        const colors=readTemplate(this.source()).colors;el.setAttribute('data-inline-color-role',value);el.setAttribute('data-inline-fill',colors[value] || hex);this.newRole=null;
      };
      const mode=role || (el.hasAttribute('data-inline-fill')?'@fixed':'@inherit');
      control('Appended color source','inline-color-source',adding?'@new':mode,value=>{
        if(value==='@new'){this.newRole={id:this.selected,property:'inline'};return;}
        if(value==='@inherit'){el.removeAttribute('data-inline-color-role');el.removeAttribute('data-inline-fill');this.newRole=null;}
        else if(value==='@fixed'){el.removeAttribute('data-inline-color-role');el.setAttribute('data-inline-fill',hex);this.newRole=null;}
        else inlineRole(value);
      },{options:[['Same as main text','@inherit'],['Fixed color','@fixed'],...roles.map(role=>[role,role]),['New theme role…','@new']]});
      if(adding)control('New appended color role','inline-new-role','',inlineRole);
      const picker=control(role?'Appended default for '+role:'Appended color','data-inline-fill',hex,value=>{if(role)this.roleColor(role,value);el.setAttribute('data-inline-fill',value);},{type:'color'});picker.disabled=mode==='@inherit';
    }
    if(field){
      section('Card field');attr('Field name','data-label',el.getAttribute('data-label') || '');
      control('Data key','data-field',el.getAttribute('data-field'),value=>{const old=el.getAttribute('data-field');el.setAttribute('data-field',value);el.textContent='{{'+value+'}}';for(const node of this.root.querySelectorAll('[data-flow-after],[data-after-field],[data-visible-if],[data-inline-field]'))for(const key of ['data-flow-after','data-after-field','data-visible-if','data-inline-field'])if(node.getAttribute(key)===old)node.setAttribute(key,value);});
      control('Input type','data-input',el.getAttribute('data-input')==='checkbox'?'checkbox':'text',value=>{
        if(value==='checkbox'){
          if(el.hasAttribute('data-inline-field'))throw Error('Separate the appended field before changing this block to a checkbox.');
          el.setAttribute('data-input','checkbox');el.setAttribute('data-lines',1);if(!el.hasAttribute('data-checked-text'))el.setAttribute('data-checked-text','✓');
        }else{
          if([...this.root.querySelectorAll('[data-visible-if]')].some(node=>node.getAttribute('data-visible-if')===el.getAttribute('data-field')))throw Error('This checkbox controls visibility. Set those elements’ “Show when” to Always before changing the input type.');
          el.removeAttribute('data-input');
        }
      },{options:[['Text','text'],['Checkbox','checkbox']]});
      if(el.getAttribute('data-input')==='checkbox')control('Checked symbol','data-checked-text',el.getAttribute('data-checked-text') ?? 'N',value=>el.setAttribute('data-checked-text',value));
      attr('Required','data-required',el.getAttribute('data-required')==='true',{type:'checkbox'});
      attr('Maximum characters','data-max-chars',el.getAttribute('data-max-chars') || 200,{type:'number',min:1,max:2000,step:1});
    }
    if(block&&el.getAttribute('data-input')!=='checkbox'){
        section('Text fitting');
        if(labelBlock)attr('Maximum characters','data-max-chars',el.getAttribute('data-max-chars') || 200,{type:'number',min:1,max:2000,step:1});
        control('Fit','data-fit',el.getAttribute('data-fit') || 'wrap',value=>{el.setAttribute('data-fit',value);if(value==='shrink')el.setAttribute('data-lines',1);},{options:[['Wrap','wrap'],['Shrink to one line','shrink'],['Wrap, then shrink to box','fit-box']]});
        attr('Maximum lines','data-lines',el.getAttribute('data-lines') || 1,{type:'number',min:1,max:30,step:1});
        attr('Minimum font size','data-min-font-size',el.getAttribute('data-min-font-size') || Math.min(5,parseFloat(style.fontSize)),{type:'number',min:1,max:100,step:.5});
        const authoredSize=parseFloat(el.style.fontSize || el.getAttribute('font-size')) || parseFloat(style.fontSize);
        const spacing=Number(el.getAttribute('data-line-spacing') ?? (el.hasAttribute('data-line-height')?Number(el.getAttribute('data-line-height'))/authoredSize:1.2));
        control('Line spacing (× font size)','data-line-spacing',Math.round(spacing*1000)/1000,value=>{el.setAttribute('data-line-spacing',value);el.removeAttribute('data-line-height');},{type:'number',min:.1,max:10,step:.05});
        attr('Bottom limit (optional)','data-bottom',el.getAttribute('data-bottom') || '');
        if(field){
        section('Combined text');
        const others=[...this.root.querySelectorAll('text[data-field]')].filter(node=>node!==el);
        const inline=el.getAttribute('data-inline-field') || '',keys=[...new Set([...readTemplate(this.source()).fields.map(f=>f.key),...Object.keys(this.options.values)])].filter(key=>key!==el.getAttribute('data-field')&&!['card_id','image_filename','back_image_filename','copies','theme'].includes(key));
        control('Append field','data-inline-field',inline,value=>{
          if(!value){el.removeAttribute('data-inline-field');return;}
          const other=others.find(node=>node.getAttribute('data-field')===value);
          if(other){el.setAttribute('data-inline-label',title(other));for(const node of this.root.querySelectorAll('[data-flow-after],[data-after-field]'))for(const key of ['data-flow-after','data-after-field'])if(node.getAttribute(key)===value)node.setAttribute(key,el.getAttribute('data-field'));for(const node of this.root.querySelectorAll('[data-relative-to]'))if(other.id&&node.getAttribute('data-relative-to')===other.id){if(!el.id)el.id='layout-'+crypto.randomUUID();node.setAttribute('data-relative-to',el.id);}other.remove();}
          el.setAttribute('data-inline-field',value);
        },{options:[['None',''],...keys.map(key=>[key.replaceAll('_',' '),key])]});
        if(inline){control('Before appended value','data-inline-prefix',el.getAttribute('data-inline-prefix') ?? ' (',value=>el.setAttribute('data-inline-prefix',value));control('After appended value','data-inline-suffix',el.getAttribute('data-inline-suffix') ?? ')',value=>el.setAttribute('data-inline-suffix',value));}
        }
    }
    inspector.scrollTop=scroll;
  }
  detach(){
    const el=this.element(),live=this.live();if(el?.localName!=='text'||!live)return;
    if(el.hasAttribute('data-relative-to')){if(live.hasAttribute('transform'))el.setAttribute('transform',live.getAttribute('transform'));else el.removeAttribute('transform');for(const key of ['data-relative-to','data-relative-position','data-relative-align','data-relative-gap','data-relative-x','data-relative-y'])el.removeAttribute(key);}
    if(el.hasAttribute('data-flow-after')||el.hasAttribute('data-after-field')){for(const key of ['x','y'])el.setAttribute(key,live.getAttribute(key));el.removeAttribute('data-flow-after');el.removeAttribute('data-after-field');}
  }
  transform(matrix){this.element().setAttribute('transform',`matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`);}
  globalTransform(change){const live=this.live(),parent=matrix(this.rendered.getScreenCTM().inverse().multiply(live.parentNode.getScreenCTM())),local=matrix(live.transform.baseVal.consolidate()?.matrix || new DOMMatrix());this.transform(parent.inverse().multiply(change).multiply(parent).multiply(local));}
  translate(dx,dy){this.globalTransform(new DOMMatrix().translate(dx,dy));}
  scale(x,y,box){this.globalTransform(new DOMMatrix().translate(box.x,box.y).scale(x,y).translate(-box.x,-box.y));}
  pointerDown(event){
    if(event.button!==0||this.drag)return;
    const resize=event.target.hasAttribute('data-builder-resize'),node=event.target.closest('[data-builder-id]') || (event.target.closest('[data-card-artwork]')?this.rendered.querySelector('rect[data-image]'):null);
    if(!resize&&!node)return;
    event.preventDefault();if(node)this.selected=node.getAttribute('data-builder-id');this.refresh();
    const live=this.live();if(!live)return;
    this.$('#tb-canvas').focus({preventScroll:true});
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(this.rendered.getScreenCTM().inverse());
    this.drag={id:event.pointerId,point,clientX:event.clientX,clientY:event.clientY,source:this.source(),resize,box:this.bounds(live),localHeight:Math.max(live.getBBox().height,Number(live.getAttribute('data-height')) || 0,4),moved:false};
    this.$('#tb-canvas').setPointerCapture(event.pointerId);
  }
  pointerMove(event){
    const drag=this.drag;if(!drag||event.pointerId!==drag.id)return;
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(this.rendered.getScreenCTM().inverse()),dx=point.x-drag.point.x,dy=point.y-drag.point.y;
    // Selecting an element must not detach its layout because of pointer jitter.
    // Use screen pixels so the drag threshold stays consistent at any zoom.
    if(!drag.moved&&Math.hypot(event.clientX-drag.clientX,event.clientY-drag.clientY)<4)return;
    drag.moved=true;
    // Re-render the original snapshot to resolve flow before detaching or transforming it.
    this.load(drag.source);this.draw();
    const el=this.element();
    if(drag.resize){
      if(event.shiftKey||event.ctrlKey){const ratio=Math.abs(dx/drag.box.width)>=Math.abs(dy/drag.box.height)?1+dx/drag.box.width:1+dy/drag.box.height,factor=Math.max(ratio,2/Math.min(drag.box.width,drag.box.height));this.scale(factor,factor,drag.box);}
      else if(el.matches('text[data-field],text[data-inline-field]')){const matrix=this.live().getScreenCTM().inverse().multiply(this.rendered.getScreenCTM()),delta=new DOMPoint(dx,dy).matrixTransform(matrix),zero=new DOMPoint(0,0).matrixTransform(matrix);el.setAttribute('data-width',Math.max(1,Math.min(180,Number(el.getAttribute('data-width'))+delta.x-zero.x)));el.setAttribute('data-height',Math.max(1,Math.min(252,drag.localHeight+delta.y-zero.y)));}
      else this.scale(Math.max(2,drag.box.width+dx)/drag.box.width,Math.max(2,drag.box.height+dy)/drag.box.height,drag.box);
    }else{this.detach();this.translate(dx,dy);}
    this.draw();
  }
  pointerEnd(event,cancel=false){
    const drag=this.drag;if(!drag||event.pointerId!==drag.id)return;this.drag=null;
    if(cancel)this.load(drag.source);
    else if(drag.moved){this.history.push(drag.source);this.future=[];this.recover();}
    this.refresh();
    const canvas=this.$('#tb-canvas');if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  }
}
