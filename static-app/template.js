import {renderText} from './template-text.js';
import {validatePositioning,resolvePositioning,rootBounds} from './template-position.js';
export const checkedValue = value => /^(true|1|yes|y|on)$/i.test(String(value ?? '').trim());
const NS = 'http://www.w3.org/2000/svg';
let imageClipSequence=0;
const allowed = new Set(['svg','g','defs','clipPath','mask','linearGradient','radialGradient','stop','pattern','image','rect','text','tspan','title','desc','metadata','use','path','ellipse','circle','line','polygon','polyline']);
function inheritedPaint(el, property) {
  for (let node = el; node?.nodeType === 1; node = node.parentElement) {
    const value = (node.style.getPropertyValue(property) || node.getAttribute(property) || '').trim();
    if (!value || /^(inherit|unset)$/i.test(value)) continue;
    if (/^currentcolor$/i.test(value)) return inheritedPaint(node, 'color');
    if (/^initial$/i.test(value)) break;
    return value;
  }
  return property === 'stroke' ? 'none' : '#000000';
}
function editablePaint(el, property) {
  const value = inheritedPaint(el, property);
  // Inkscape can remove a stroke or use a gradient without removing the role tag.
  // Keep those paints exactly as authored instead of inventing a solid color.
  if (/^none$/i.test(value) || /^url\(/i.test(value)) return null;
  if (!CSS.supports('color', value)) throw Error(`Cannot read the ${property} color on SVG element “${el.id || el.localName}”. Use a CSS color, none, or a local SVG gradient.`);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1);
  const [r,g,b,a] = ctx.getImageData(0, 0, 1, 1).data;
  // The color picker edits RGB; retain the original paint's alpha during rendering.
  const solid = document.createElement('span'); solid.style.color = value;
  const serialized = solid.style.color;
  const channels = serialized.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/i);
  const rgb = channels ? channels.slice(1,4).map(v => Math.round(Number(v))) : [r,g,b];
  return {color:'#' + rgb.map(v => v.toString(16).padStart(2,'0')).join(''), alpha:a / 255};
}
export function replacePaint(el, property, color) {
  const original = editablePaint(el, property);
  if (!original) return false;
  const rgb = color.slice(1).match(/../g).map(v => parseInt(v,16));
  const value = original.alpha < 1 ? `rgba(${rgb.join(',')},${original.alpha})` : color;
  el.setAttribute(property, value); el.style.setProperty(property, value);
  return true;
}
function textLimits(el){
  const width=Number(el.getAttribute('data-width')),lines=Number(el.getAttribute('data-lines') || 1),max=Number(el.getAttribute('data-max-chars') || 200);
  if(!(width>0&&width<=180)||!(lines>=1&&lines<=30)||!Number.isInteger(lines)||!(max>=1&&max<=2000))throw Error('Text blocks need a valid width, maximum lines, and maximum characters.');
  return {width,lines,max};
}
export function readTemplate(source) {
  if (typeof source !== 'string' || source.length > 500000 || /<!DOCTYPE|<!ENTITY/i.test(source)) throw Error('Use an SVG template under 500 KB without XML entities.');
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== NS) throw Error('Choose a valid SVG template.');
  if (root.getAttribute('data-card-app') === 'finished-card') throw Error('Open a template SVG, rather than a finished card SVG.');
  for (const el of [...root.querySelectorAll('*')]) if (!allowed.has(el.localName) || el.namespaceURI !== NS) el.remove();
  for (const el of [root, ...root.querySelectorAll('*')]) for (const attr of [...el.attributes]) {
    const value = attr.value.trim();
    const unsafeURL = [...value.matchAll(/url\((.*?)\)/gi)].some(m => !/^['"]?#[\w.-]+['"]?$/.test(m[1].trim()));
    if (/^on/i.test(attr.localName) || attr.name === 'xml:base' || unsafeURL || /javascript:|@import/i.test(value) ||
        (attr.localName === 'href' && !/^#[\w.-]+$/.test(value) && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value))) el.removeAttributeNode(attr);
  }
  const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some(v => !Number.isFinite(v)) || vb[2] !== 180 || vb[3] !== 252 || vb[0] !== 0 || vb[1] !== 0) throw Error('Use viewBox="0 0 180 252" for a 2.5 × 3.5 inch card.');
  root.setAttribute('width', '2.5in'); root.setAttribute('height', '3.5in');
  const slots = [...root.querySelectorAll('text[data-field],text[data-inline-field]')];
  const fields = slots.filter(el=>el.hasAttribute('data-field')).map(el => {
    const key = el.getAttribute('data-field');
    const {width,lines,max}=textLimits(el);
    if (!/^[a-z][a-z0-9_]{0,49}$/.test(key) || ['image_filename','theme','card_id'].includes(key)) throw Error('Each text placeholder needs a valid unique field key.');
    return {key, type:el.getAttribute('data-input')==='checkbox'?'checkbox':'text', label: el.getAttribute('data-label') || key.replaceAll('_',' '), width, lines, max, required: el.getAttribute('data-required') === 'true'};
  });
  if (fields.length > 12 || new Set(fields.map(f => f.key)).size !== fields.length) throw Error('Use up to 12 unique text placeholders marked with data-field.');
  const keys=new Set(fields.map(f=>f.key)), visiting=new Set(),visited=new Set();
  for(const el of slots){
    const limits=textLimits(el);
    const mode=el.getAttribute('data-fit');
    if(mode && !['wrap','shrink','fit-box'].includes(mode))throw Error('Choose Wrap, Shrink to one line, or Fit text box.');
    for(const [key,min,max] of [['data-height',.1,252],['data-min-font-size',1,100],['data-line-height',.1,252],['data-line-spacing',.1,10],['data-gap',0,252],['data-bottom',0,252]])if(el.hasAttribute(key)){
      const value=Number(el.getAttribute(key));if(!Number.isFinite(value)||value<min||value>max)throw Error('Invalid template text setting: '+key);
    }
    const inline=el.getAttribute('data-inline-field');
    if(inline){
      if(!/^[a-z][a-z0-9_]{0,49}$/.test(inline)||['image_filename','theme','card_id'].includes(inline)||inline===el.getAttribute('data-field'))throw Error('Choose a different valid field to append.');
      if(!keys.has(inline)){fields.push({key:inline,label:el.getAttribute('data-inline-label') || inline.replaceAll('_',' '),type:'text',...(el.hasAttribute('data-field')?{width:180,lines:1,max:200}:limits),required:false});keys.add(inline);}
      if(el.hasAttribute('data-inline-font-size')&&(!Number.isFinite(Number(el.getAttribute('data-inline-font-size')))||Number(el.getAttribute('data-inline-font-size'))<1||Number(el.getAttribute('data-inline-font-size'))>100))throw Error('Appended field font size must be between 1 and 100 points.');
      for(const [key,choices] of [['data-inline-font-weight',['normal','bold']],['data-inline-font-style',['normal','italic']]])if(el.hasAttribute(key)&&!choices.includes(el.getAttribute(key)))throw Error('Invalid appended field style.');
      if(el.hasAttribute('data-inline-fill')&&!/^#[0-9a-f]{6}$/i.test(el.getAttribute('data-inline-fill')))throw Error('Appended field colors need a six-digit hex color.');
    }
  }
  if(!fields.length||fields.length>12)throw Error('Use 1–12 card fields.');
  function visit(el){
    if(visiting.has(el))throw Error('Text flow cannot contain a circular dependency.');
    if(visited.has(el))return;
    visiting.add(el);
    for(const key of [el.getAttribute('data-flow-after'),el.getAttribute('data-after-field')].filter(Boolean)){
      const previous=slots.find(node=>node.getAttribute('data-field')===key);if(!previous)throw Error('Text flow refers to a missing field: '+key);visit(previous);
    }
    visiting.delete(el);visited.add(el);
  }
  slots.forEach(visit);
  validatePositioning(root);
  const frame = root.querySelector('rect[data-image]');
  if (!frame) throw Error('The template needs a rectangle marked data-image="artwork".');
  for (const name of ['x','y','width','height']) if (!Number.isFinite(Number(frame.getAttribute(name)))) throw Error('The image rectangle needs numeric x, y, width, and height.');
  if (!(Number(frame.getAttribute('width')) > 0 && Number(frame.getAttribute('height')) > 0)) throw Error('The image frame needs positive dimensions.');
  const colors = {};
  for (const el of root.querySelectorAll('[data-color-fill],[data-color-stroke]')) for (const property of ['fill','stroke']) {
    const key = el.getAttribute('data-color-' + property);
    if (!key) continue;
    if (!/^[a-z][a-z0-9_-]{0,29}$/.test(key)) throw Error('Color roles must use lowercase names.');
    const paint = editablePaint(el, property);
    if (paint) colors[key] ??= paint.color;
  }
  for(const el of root.querySelectorAll('text[data-inline-field][data-inline-color-role]')){
    const role=el.getAttribute('data-inline-color-role');if(!/^[a-z][a-z0-9_-]{0,29}$/.test(role))throw Error('Color roles must use lowercase names.');
    colors[role] ??= el.getAttribute('data-inline-fill') || editablePaint(el,'fill')?.color || '#244734';
  }
  return {root, fields, colors, source: new XMLSerializer().serializeToString(root), title: root.getAttribute('data-title') || 'Custom template'};
}

export function renderTemplate(template, values, colors, imageData, crop, host) {
  const previousImage=host.id==='card-preview'?host.querySelector('image[data-card-artwork]'):null;
  const root = template.root.cloneNode(true);
  // SVG glyph bounds can be rounded differently at different display scales.
  // Measure every output at the same 1:1 viewBox scale, then restore its size.
  const authoredStyle=root.getAttribute('style');
  root.style.setProperty('width','180px','important');root.style.setProperty('height','252px','important');
  root.style.setProperty('max-width','none','important');root.style.setProperty('max-height','none','important');
  host.replaceChildren(root);
  for (const el of root.querySelectorAll('[data-color-fill],[data-color-stroke]')) for (const property of ['fill','stroke']) {
    const key = el.getAttribute('data-color-' + property);
    if (key && /^#[0-9a-f]{6}$/i.test(colors[key] || '')) {
      replacePaint(el, property, colors[key]);
    }
  }
  const issues = [];
  function text(el){
    if(!el.matches('text[data-field],text[data-inline-field]'))return;
    const primary=el.getAttribute('data-field'),metadata=template.fields.find(f=>f.key===(primary || el.getAttribute('data-inline-field')));
    const field=primary?metadata:{...metadata,...textLimits(el),required:false,type:'label'};
    issues.push(...renderText(el,field,values,root,colors));
    const colorKey=el.getAttribute('data-color-fill');if(colors[colorKey])replacePaint(el,'fill',colors[colorKey]);
  }
  resolvePositioning(root,text);
  for(const el of root.querySelectorAll('text[data-bottom]'))if(rootBounds(root,el).y+rootBounds(root,el).height>Number(el.getAttribute('data-bottom'))+.01){
    const field=template.fields.find(field=>field.key===(el.getAttribute('data-field') || el.getAttribute('data-inline-field')));
    issues.push(`${field?.label || el.getAttribute('data-label-text') || 'Label'}: text extends below its bottom limit.`);
  }
  const frame = root.querySelector('rect[data-image]');
  if (imageData) {
    const x = Number(frame.getAttribute('x')), y = Number(frame.getAttribute('y')), w = Number(frame.getAttribute('width')), h = Number(frame.getAttribute('height'));
    const group = document.createElementNS(NS, 'g');
    if (frame.hasAttribute('transform')) group.setAttribute('transform',frame.getAttribute('transform'));
    const clip = document.createElementNS(NS,'clipPath'); clip.id = 'static-card-image-clip-'+(++imageClipSequence);
    const box = frame.cloneNode(); box.removeAttribute('transform'); box.removeAttribute('id'); clip.append(box);
    const defs = document.createElementNS(NS,'defs'); defs.append(clip); group.append(defs);
    const clipped = document.createElementNS(NS,'g'); clipped.setAttribute('clip-path','url(#'+clip.id+')');
    const image = previousImage?.getAttribute('href')===imageData?previousImage:document.createElementNS(NS,'image');
    image.setAttribute('data-card-artwork','true');
    const zoom = Math.max(.1, Math.min(4,Number(crop?.zoom) || 1));
    image.setAttribute('x',String(x - (w * zoom - w) * (crop?.x ?? .5))); image.setAttribute('y',String(y - (h * zoom - h) * (crop?.y ?? .5)));
    image.setAttribute('width',String(w * zoom)); image.setAttribute('height',String(h * zoom)); image.setAttribute('preserveAspectRatio','xMidYMid slice'); if(image.getAttribute('href')!==imageData)image.setAttribute('href',imageData);
    clipped.append(image); group.append(clipped); frame.after(group);
  }
  root.querySelectorAll('[data-visible-if]').forEach(el=>{if(!checkedValue(values[el.getAttribute('data-visible-if')]))el.remove();});
  root.querySelectorAll('[data-placeholder]').forEach(el => el.remove());
  if(authoredStyle===null)root.removeAttribute('style');else root.setAttribute('style',authoredStyle);
  return {root, issues};
}

export function parseCsv(text) {
  text = text.replace(/^\ufeff/,'');
  let rows = [], row = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i+1] === '"') { cell += '"'; i++; } else if (c === '"') { quoted = false; closed = true; } else cell += c; }
    else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; closed = false; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i+1] === '\n') i++; row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = ''; closed = false; }
    else { if (closed || c === '"') throw Error('Malformed CSV quotes. Save the sheet as UTF-8 CSV again.'); cell += c; }
  }
  if (quoted) throw Error('The CSV has an unclosed quote.');
  if (cell || row.length || closed) { row.push(cell); if (row.some(v => v.trim())) rows.push(row); }
  if (rows.length < 2) throw Error('Add at least one card row below the CSV headers.');
  const headers = rows.shift().map(h => h.trim());
  if (headers.length > 40 || new Set(headers).size !== headers.length || headers.some(h => !h)) throw Error('Use up to 40 unique, nonempty column names.');
  if (rows.length > 500) throw Error('Import at most 500 cards at once.');
  for (const [i,r] of rows.entries()) if (r.length !== headers.length) throw Error(`CSV row ${i+2} has ${r.length} cells; expected ${headers.length}.`);
  return {headers, rows: rows.map(r => Object.fromEntries(headers.map((h,i) => [h,r[i]])))};
}
export const csvCell = value => '"' + String(value ?? '').replaceAll('"','""') + '"';
