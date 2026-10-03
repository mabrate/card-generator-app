const NS = 'http://www.w3.org/2000/svg';
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
function replacePaint(el, property, color) {
  const original = editablePaint(el, property);
  if (!original) return;
  const rgb = color.slice(1).match(/../g).map(v => parseInt(v,16));
  const value = original.alpha < 1 ? `rgba(${rgb.join(',')},${original.alpha})` : color;
  el.setAttribute(property, value); el.style.setProperty(property, value);
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
  const slots = [...root.querySelectorAll('text[data-field]')];
  const fields = slots.map(el => {
    const key = el.getAttribute('data-field');
    const width = Number(el.getAttribute('data-width')), lines = Number(el.getAttribute('data-lines') || 1), max = Number(el.getAttribute('data-max-chars') || 200);
    if (!/^[a-z][a-z0-9_]{0,49}$/.test(key) || ['image_filename','theme','card_id'].includes(key) || !(width > 0 && width <= 180) || !(lines >= 1 && lines <= 30) || !Number.isInteger(lines) || !(max >= 1 && max <= 2000)) throw Error('Each text placeholder needs a unique field key, data-width, data-lines, and data-max-chars.');
    return {key, label: el.getAttribute('data-label') || key.replaceAll('_',' '), width, lines, max, required: el.getAttribute('data-required') === 'true'};
  });
  if (!fields.length || fields.length > 12 || new Set(fields.map(f => f.key)).size !== fields.length) throw Error('Use 1–12 unique text placeholders marked with data-field.');
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
  return {root, fields, colors, source: new XMLSerializer().serializeToString(root), title: root.getAttribute('data-title') || 'Custom template'};
}

export function renderTemplate(template, values, colors, imageData, crop, host) {
  const root = template.root.cloneNode(true);
  host.replaceChildren(root);
  for (const el of root.querySelectorAll('[data-color-fill],[data-color-stroke]')) for (const property of ['fill','stroke']) {
    const key = el.getAttribute('data-color-' + property);
    if (key && /^#[0-9a-f]{6}$/i.test(colors[key] || '')) {
      replacePaint(el, property, colors[key]);
    }
  }
  const issues = [];
  for (const field of template.fields) {
    const el = [...root.querySelectorAll('text[data-field]')].find(e => e.getAttribute('data-field') === field.key);
    const first = el.querySelector('tspan');
    const x = first?.getAttribute('x') ?? el.getAttribute('x') ?? '0';
    const y = first?.getAttribute('y') ?? el.getAttribute('y') ?? '0';
    // Inkscape often puts font styling on the tspan instead of its parent.
    if (first?.getAttribute('style')) el.style.cssText += ';' + first.getAttribute('style');
    for (const attr of ['font-size','font-family','font-weight','font-style','text-anchor']) if (first?.hasAttribute(attr)) el.setAttribute(attr, first.getAttribute(attr));
    const colorKey = el.getAttribute('data-color-fill');
    if (colors[colorKey]) replacePaint(el, 'fill', colors[colorKey]);
    el.replaceChildren(); el.setAttribute('x', x); el.setAttribute('y', y);
    const value = String(values[field.key] || '');
    const computed = getComputedStyle(el), fontSize = parseFloat(computed.fontSize) || 7;
    const lineHeight = Number(el.getAttribute('data-line-height')) || fontSize * 1.2;
    const measure = document.createElementNS(NS, 'tspan'); el.append(measure);
    const fits = text => { measure.textContent = text; return measure.getComputedTextLength() <= field.width + .01; };
    const lines = [];
    for (const paragraph of value.split('\n')) {
      let line = '';
      for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
        if (fits(line ? line + ' ' + word : word)) { line = line ? line + ' ' + word : word; continue; }
        if (line) { lines.push(line); line = ''; }
        // Long words are split visibly, never shortened or silently omitted.
        for (const char of [...word]) { if (line && !fits(line + char)) { lines.push(line); line = ''; } line += char; }
      }
      lines.push(line);
    }
    el.replaceChildren(...lines.map((line, i) => { const t = document.createElementNS(NS,'tspan'); t.setAttribute('x',x); t.setAttribute('y',String(Number(y) + i * lineHeight)); t.textContent = line; return t; }));
    if (lines.length > field.lines || [...value].length > field.max) issues.push(`${field.label}: shorten the text to fit ${field.lines} line${field.lines === 1 ? '' : 's'} and ${field.max} characters.`);
    if (field.required && !value.trim()) issues.push(`${field.label} is required.`);
  }
  const frame = root.querySelector('rect[data-image]');
  if (imageData) {
    const x = Number(frame.getAttribute('x')), y = Number(frame.getAttribute('y')), w = Number(frame.getAttribute('width')), h = Number(frame.getAttribute('height'));
    const group = document.createElementNS(NS, 'g');
    if (frame.hasAttribute('transform')) group.setAttribute('transform',frame.getAttribute('transform'));
    const clip = document.createElementNS(NS,'clipPath'); clip.id = 'static-card-image-clip';
    const box = frame.cloneNode(); box.removeAttribute('transform'); box.removeAttribute('id'); clip.append(box);
    const defs = document.createElementNS(NS,'defs'); defs.append(clip); group.append(defs);
    const clipped = document.createElementNS(NS,'g'); clipped.setAttribute('clip-path','url(#static-card-image-clip)');
    const image = document.createElementNS(NS,'image');
    const zoom = Math.max(1, Math.min(4,Number(crop?.zoom) || 1));
    image.setAttribute('x',String(x - (w * zoom - w) * (crop?.x ?? .5))); image.setAttribute('y',String(y - (h * zoom - h) * (crop?.y ?? .5)));
    image.setAttribute('width',String(w * zoom)); image.setAttribute('height',String(h * zoom)); image.setAttribute('preserveAspectRatio','xMidYMid slice'); image.setAttribute('href',imageData);
    clipped.append(image); group.append(clipped); frame.after(group);
  }
  root.querySelectorAll('[data-placeholder]').forEach(el => el.remove());
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
