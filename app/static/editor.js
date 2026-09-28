export const byId = id => document.getElementById(id);

export async function api(path, {body, token, method, headers = {}} = {}) {
  const options = {method: method || (body === undefined ? 'GET' : 'POST'), headers: {...headers}};
  if (token) options.headers['X-Edit-Token'] = token;
  if (options.method !== 'GET') options.headers['X-Card-App'] = '1';
  if (body !== undefined) {
    if (body instanceof Blob) options.body = body;
    else { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  }
  let response;
  try { response = await fetch(path, options); }
  catch { throw new Error('Cannot reach the classroom computer. Your text is still here. Reconnect to classroom Wi-Fi and try again.'); }
  const data = await response.json();
  if (!response.ok) {
    const detail = data.detail;
    const error = new Error(typeof detail === 'string' ? detail : detail?.message || (Array.isArray(detail) ? detail.map(item => `${item.loc?.slice(1).join('.') || 'Input'}: ${item.msg}`).join(' ') : 'Check the input and try again.'));
    error.status = response.status;
    error.issues = detail?.issues || [];
    throw error;
  }
  return data;
}

export function randomKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function message(id, text, bad = false) {
  const element = byId(id);
  element.textContent = text;
  element.classList.toggle('error', bad);
}

export class CardEditor {
  constructor(container, project, card = {}, options = {}) {
    this.container = container; this.project = project; this.options = options;
    this.revision = 0; this.busy = false; this.destroyed = false;
    this.state = {
      values: {...(card.values || {})}, student_name: card.student_name || '', class_name: card.class_name || '',
      theme: card.theme || project.template.themes[0], image_id: card.image_id || null,
      crop: {...(card.crop || {x: .5, y: .5, zoom: 1, rotation: 0})}
    };
    container.innerHTML = `<div class="studio"><section class="panel form-panel">
      <h2>Card content</h2><form class="editor-form"><div class="identity-fields">
      <div><label for="student_name">Student name <span class="hint">(required to submit)</span></label><input id="student_name" maxlength="80" autocomplete="off"></div>
      <div><label for="class_name">Class / period <span class="hint">(required to submit)</span></label><input id="class_name" maxlength="40" autocomplete="off"></div></div>
      <div class="editor-fields"></div><section class="image-tools"><h3>Organism image</h3>
      <p class="hint">Use a JPG, PNG, or WebP up to 12 MB and 25 megapixels. The original is kept; cropping does not change it.</p>
      <div class="image-inputs"><label>Choose image<input class="image-file" type="file" accept="image/jpeg,image/png,image/webp"></label>
      <label>Take a photo<input class="camera-file" type="file" accept="image/*" capture="environment"></label></div>
      <p class="image-name hint"></p><div class="crop-controls">
      <label>Zoom <output class="zoom-value"></output><input class="crop-zoom" type="range" min="1" max="4" step="0.05"></label>
      <label>Horizontal position<input class="crop-x" type="range" min="0" max="1" step="0.01"></label>
      <label>Vertical position<input class="crop-y" type="range" min="0" max="1" step="0.01"></label>
      <div class="inline-actions"><button type="button" class="button secondary rotate">Rotate 90°</button><button type="button" class="button secondary reset-crop">Reset crop</button><button type="button" class="text-button remove-image">Remove image</button></div>
      </div></section></form></section>
      <section class="preview-panel"><h2>Live preview</h2><div class="preview-stage"><div class="card-view live-card" aria-busy="true"></div></div>
      <p class="caption">2.5 × 3.5 IN · FIXED TYPE · ENLARGED PREVIEW</p><fieldset class="theme-picker"><legend>Choose a color theme</legend><div class="editor-themes"></div></fieldset>
      <div class="fit-status" role="status" aria-live="polite">Checking text fit…</div><ul class="issues"></ul><p class="image-warning hint"></p><p class="editor-error error" role="alert"></p>
      <p class="hint">Red outlines mark text that needs shortening. Drafts may leave required fields blank; submitted cards must be complete.</p></section></div>`;
    this.inputs = new Map();
    for (const name of ['student_name', 'class_name']) {
      const input = this.find('#' + name); input.value = this.state[name];
      input.addEventListener('input', () => { this.state[name] = input.value; this.changed(); });
    }
    for (const field of project.template.fields) {
      const wrapper = document.createElement('div'), heading = document.createElement('div'); heading.className = 'field-heading';
      const label = document.createElement('label'); label.htmlFor = field.key; label.textContent = field.label + (field.required ? ' *' : '');
      const counter = document.createElement('span'); counter.id = field.key + '-counter'; counter.className = 'counter';
      const instruction = document.createElement('p'); instruction.className = 'field-instruction hint'; instruction.id = field.key + '-help'; instruction.textContent = field.instructions;
      const input = document.createElement(field.key.startsWith('section_') || field.key === 'intro_text' ? 'textarea' : 'input');
      input.id = field.key; input.value = this.state.values[field.key] || ''; input.autocomplete = 'off';
      input.setAttribute('aria-describedby', `${counter.id} ${instruction.id}`); input.setAttribute('aria-required', String(field.required));
      input.addEventListener('input', () => { this.state.values[field.key] = input.value; this.count(field.key); this.changed(); });
      heading.append(label, counter); wrapper.append(heading, instruction, input);
      if (field.example) { const example = document.createElement('p'); example.className = 'hint example-text'; example.textContent = 'Example: ' + field.example; wrapper.append(example); }
      this.find('.editor-fields').append(wrapper); this.inputs.set(field.key, {input, counter, field}); this.count(field.key);
    }
    const themes = project.themes.filter(theme => project.template.themes.includes(theme.id));
    // A previously allowed theme stays visible, but must be changed before a save.
    if (!themes.some(theme => theme.id === this.state.theme)) themes.push({id: this.state.theme, name: this.state.theme + ' (no longer allowed)'});
    for (const theme of themes) {
      const label = document.createElement('label'); label.className = 'theme-option';
      const input = document.createElement('input'); input.type = 'radio'; input.name = 'theme'; input.value = theme.id; input.checked = theme.id === this.state.theme;
      input.addEventListener('change', () => { this.state.theme = theme.id; this.changed(); });
      label.append(input, document.createTextNode(theme.name)); this.find('.editor-themes').append(label);
    }
    for (const key of ['x', 'y', 'zoom']) {
      this.find('.crop-' + key).addEventListener('input', event => { this.state.crop[key] = Number(event.target.value); this.syncImage(); this.changed(); });
    }
    this.find('.rotate').addEventListener('click', () => { this.state.crop.rotation = (this.state.crop.rotation + 90) % 360; this.changed(); });
    this.find('.reset-crop').addEventListener('click', () => { this.state.crop = {x: .5, y: .5, zoom: 1, rotation: 0}; this.syncImage(); this.changed(); });
    this.find('.remove-image').addEventListener('click', () => { this.state.image_id = null; this.syncImage(); this.changed(); });
    for (const selector of ['.image-file', '.camera-file']) this.find(selector).addEventListener('change', event => this.upload(event.target.files[0]));
    this.find('.editor-form').addEventListener('submit', event => event.preventDefault());
    this.find('.image-tools').hidden = !!options.teacher;
    this.find('.image-name').textContent = card.image?.filename || (card.image_id ? 'Saved image' : 'No image selected.');
    this.syncImage(); this.schedule();
  }
  find(selector) { return this.container.querySelector(selector); }
  data() { return {...structuredClone(this.state), project_id: this.project.id, project_version: this.project.version}; }
  count(key) {
    const {input, counter, field} = this.inputs.get(key), count = Array.from(input.value).length;
    counter.textContent = `${count} / ${field.max_chars}`; counter.classList.toggle('over', count > field.max_chars);
  }
  changed() { this.options.onChange?.(this.data()); this.schedule(); }
  setLocked(locked) {
    this.locked = locked;
    this.container.querySelectorAll('input,textarea,button').forEach(input => { input.disabled = locked; });
  }
  syncImage() {
    this.find('.crop-controls').hidden = !this.state.image_id;
    for (const key of ['x', 'y', 'zoom']) this.find('.crop-' + key).value = this.state.crop[key];
    this.find('.zoom-value').textContent = this.state.crop.zoom.toFixed(2) + '×';
    if (!this.state.image_id) this.find('.image-name').textContent = 'No image selected.';
  }
  async upload(file) {
    if (!file || this.busy) return;
    if (file.size > 12 * 1024 * 1024) { this.error(new Error('Choose an image smaller than 12 MB.')); return; }
    this.busy = true; this.options.onBusy?.(true); this.setLocked(true);
    this.find('.image-name').textContent = 'Uploading image… Keep this page open.';
    try {
      const image = await api('/api/student/images', {body: file, token: this.options.token, headers: {'X-File-Name': encodeURIComponent(file.name)}});
      if (this.destroyed) return;
      this.state.image_id = image.id; this.state.crop = {x: .5, y: .5, zoom: 1, rotation: 0};
      this.find('.image-name').textContent = `${file.name} · ${image.width} × ${image.height}`;
      this.syncImage(); this.changed();
    } catch (error) { if (!this.destroyed) this.error(error); }
    finally { this.busy = false; if (!this.destroyed) { this.setLocked(false); this.options.onBusy?.(false); } }
  }
  schedule() {
    clearTimeout(this.timer); const revision = ++this.revision;
    this.find('.live-card').setAttribute('aria-busy', 'true'); this.find('.fit-status').textContent = 'Checking text fit…';
    this.timer = setTimeout(() => this.render(revision), 220);
  }
  showIssues(issues) {
    this.find('.issues').replaceChildren();
    const invalid = new Set(issues.map(issue => issue.field?.replace(/-label$/, '')));
    this.inputs.forEach((entry, key) => entry.input.setAttribute('aria-invalid', String(invalid.has(key))));
    for (const issue of issues) { const li = document.createElement('li'); li.textContent = issue.message; this.find('.issues').append(li); }
  }
  error(error) {
    this.find('.editor-error').textContent = error.message;
    if (error.issues?.length) this.showIssues(error.issues);
  }
  async render(revision) {
    const {values, theme, image_id, crop, project_id} = this.data();
    try {
      const result = await api('/api/preview', {body: {values, theme, image_id, crop, project_id}, token: this.options.token});
      if (this.destroyed || revision !== this.revision) return;
      this.find('.live-card').innerHTML = result.svg; this.find('.live-card').setAttribute('aria-busy', 'false');
      this.find('.editor-error').textContent = ''; this.showIssues(result.issues);
      this.find('.fit-status').textContent = result.valid ? '✓ Text fits the fixed card layout.' : 'Complete or shorten the marked fields before submitting.';
      this.find('.fit-status').classList.toggle('invalid', !result.valid);
      this.find('.image-warning').textContent = result.warnings.join(' ');
    } catch (error) {
      if (this.destroyed || revision !== this.revision) return;
      this.error(error); this.find('.fit-status').textContent = 'Preview unavailable — the displayed card may be out of date.';
      this.find('.fit-status').classList.add('invalid');
    }
  }
  destroy() { this.destroyed = true; clearTimeout(this.timer); }
}

