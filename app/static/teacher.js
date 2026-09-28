import {api, byId, CardEditor, message, randomKey} from './editor.js';

let editor, current, dirty = false, busy = false, projects = [], settings, page = 1, total = 0, listRevision = 0;
const settingsFields = new Map();
const safeLeave = () => !busy && (!dirty || confirm('Discard unsaved teacher text edits and open another view?'));
async function guard(task) {
  message('page-error', '');
  try { await task(); }
  catch (error) { message('page-error', error.message, true); if (error.issues?.length) editor?.error(error); }
}
function controls() {
  if (!current) return;
  byId('save-edits').disabled = busy || !dirty;
  byId('approve-card').disabled = busy || dirty || !(current.status === 'Submitted' || (current.external_id && current.status === 'Needs Revision'));
  byId('request-revision').disabled = busy || dirty || !['Submitted', 'Approved'].includes(current.status);
  for (const id of ['delete-card', 'reload-card', 'close-review']) byId(id).disabled = busy;
  editor?.setLocked(busy);
  byId('review-hint').textContent = dirty ? 'Save text edits before approving or requesting revision. Editing an approved card returns it to Submitted.' : 'Only submitted cards can be approved. Request revision to unlock a student card.';
}
async function loadProjects(selected) {
  projects = await api('/api/projects');
  const filter = byId('filter-project'), previous = filter.value;
  filter.replaceChildren(new Option('All projects', ''));
  const select = byId('settings-project'); select.replaceChildren();
  projects.forEach(project => { select.add(new Option(project.title, project.id)); filter.add(new Option(project.title, project.id)); });
  filter.value = previous; select.value = selected || projects[0].id;
}
async function loadSettings(identifier) {
  settings = await api('/api/project?project_id=' + encodeURIComponent(identifier));
  displaySettings();
}
function displaySettings() {
  byId('project-title').value = settings.title; byId('directions').value = settings.template.instructions;
  byId('student-url').textContent = settings.id ? location.origin + '/student?project=' + settings.id : 'Save this project to create its student link.';
  byId('student-qr').hidden = !settings.id;
  if (settings.id) byId('student-qr').src = '/api/teacher/qr?project_id=' + settings.id;
  byId('local-url-note').textContent = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? 'This address and QR code point to this computer only. Open the teacher page using its LAN IP address to get an iPad-ready link and QR code.' : 'Use this link and QR code while connected to the classroom Wi-Fi.';
  byId('allowed-themes').replaceChildren();
  for (const theme of settings.themes) {
    const label = document.createElement('label'); label.className = 'theme-option';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = theme.id; input.checked = settings.template.themes.includes(theme.id);
    label.append(input, document.createTextNode(theme.name)); byId('allowed-themes').append(label);
  }
  settingsFields.clear(); byId('field-settings').replaceChildren();
  for (const field of settings.template.fields) {
    const details = document.createElement('details'); details.className = 'field-config';
    const summary = document.createElement('summary'); summary.textContent = field.label; details.append(summary);
    const controls = {};
    for (const [key, text, type] of [['label', 'Field label', 'text'], ['instructions', 'Field instructions', 'textarea'], ['example', 'Example', 'textarea'], ['max_chars', 'Character limit', 'number'], ['required', 'Required to submit', 'checkbox']]) {
      const label = document.createElement('label'); label.textContent = text;
      const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
      input.id = 'setting-' + field.key + '-' + key; label.htmlFor = input.id;
      if (type !== 'textarea') input.type = type;
      if (type === 'checkbox') input.checked = field[key]; else input.value = field[key];
      if (type === 'number') { input.min = 1; input.max = 2000; input.required = true; }
      details.append(label, input); controls[key] = input;
    }
    settingsFields.set(field.key, controls); byId('field-settings').append(details);
  }
}
async function saveSettings(event) {
  event.preventDefault();
  if (!safeLeave()) return;
  const body = {title: byId('project-title').value, instructions: byId('directions').value, expected_version: settings.id ? settings.version : 0,
    themes: [...byId('allowed-themes').querySelectorAll('input:checked')].map(input => input.value),
    fields: [...settingsFields].map(([key, inputs]) => ({key, label: inputs.label.value, instructions: inputs.instructions.value, example: inputs.example.value, max_chars: Number(inputs.max_chars.value), required: inputs.required.checked}))};
  byId('save-project').disabled = true;
  try {
    const result = await api(settings.id ? '/api/teacher/projects/' + settings.id : '/api/teacher/projects', {body});
    await loadProjects(result.id); settings = result; displaySettings(); await refreshList();
    if (current?.project_id === result.id) await openCard(current.id, true);
    message('teacher-message', 'Project settings saved. Previously approved cards in this project need a fresh review.');
  } finally { byId('save-project').disabled = false; }
}
async function refreshList() {
  const revision = ++listRevision;
  const params = new URLSearchParams({page, project_id: byId('filter-project').value, class_name: byId('filter-class').value, status: byId('filter-status').value});
  const result = await api('/api/teacher/cards?' + params);
  if (revision !== listRevision) return;
  const lastPage = Math.max(1, Math.ceil(result.total / 30));
  if (page > lastPage) { page = lastPage; return refreshList(); }
  total = result.total; byId('card-list').replaceChildren();
  const classes = byId('filter-class'), selected = classes.value; classes.replaceChildren(new Option('All classes', ''));
  for (const name of result.classes) classes.add(new Option(name, name));
  if (selected && !result.classes.includes(selected)) classes.add(new Option(selected, selected));
  classes.value = selected;
  for (const card of result.cards) {
    const row = document.createElement('tr');
    for (const text of [card.title || 'Untitled card', card.student_name || 'Not entered', card.class_name || '—', card.project_title, card.status]) {
      const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
    }
    const cell = document.createElement('td'), button = document.createElement('button'); button.className = 'button secondary'; button.textContent = 'Review'; button.setAttribute('aria-label', `Review ${card.title || 'Untitled card'} by ${card.student_name || 'unnamed student'}`);
    button.addEventListener('click', () => { if (safeLeave()) guard(() => openCard(card.id)); }); cell.append(button); row.append(cell); byId('card-list').append(row);
  }
  byId('list-summary').textContent = total ? `${total} matching cards · page ${page} of ${Math.ceil(total / 30)}` : 'No cards match these filters. Student drafts will appear here after Save draft.';
  byId('previous-page').disabled = page <= 1; byId('next-page').disabled = page * 30 >= total;
}
async function openCard(identifier, keepPosition = false) {
  busy = true; controls();
  try {
    const card = await api('/api/teacher/cards/' + identifier);
    const project = await api('/api/project?project_id=' + card.project_id);
    editor?.destroy(); current = card; dirty = false;
    editor = new CardEditor(byId('editor'), project, card, {teacher: true, onChange: () => { dirty = true; controls(); }});
    byId('review-title').textContent = card.values.common_name || card.values.title || card.values[project.template.fields[0].key] || 'Untitled card'; byId('review-status').textContent = card.status;
    byId('edit-layout-link').href = '/teacher/studio?project=' + project.id;
    byId('review-project').textContent = project.title + (card.external_id ? ' · ' + card.copies + ' copies · ' + card.external_id : '') + ' · Last saved ' + card.updated_at + ' UTC';
    byId('revision-note').value = card.teacher_note; byId('review-detail').hidden = false;
    byId('history').replaceChildren();
    for (const item of card.history) { const li = document.createElement('li'); li.textContent = `${item.created_at} UTC · ${item.actor}: ${item.action}`; byId('history').append(li); }
    if (!keepPosition) byId('review-detail').scrollIntoView({behavior: 'smooth'});
  } finally { busy = false; controls(); }
}
async function saveEdits() {
  if (busy || !current) return;
  busy = true; controls();
  try {
    await api('/api/teacher/cards/' + current.id + '/save', {body: {...editor.data(), expected_version: current.version, mutation_id: randomKey(), action: 'save'}});
    dirty = false; await openCard(current.id, true); await refreshList(); message('teacher-message', 'Teacher edits saved.');
  } finally { busy = false; controls(); }
}
async function review(action) {
  if (busy || !current) return;
  if (dirty && action !== 'delete') throw new Error('Save text edits before changing review status.');
  if (action === 'delete' && !confirm(`Delete “${current.values.common_name || current.values.title || 'Untitled card'}” by ${current.student_name || 'unnamed student'}? It will disappear from review and the student can no longer reopen it. ${dirty ? 'Unsaved teacher edits will be lost. ' : ''}Original files and history remain in local storage.`)) return;
  busy = true; controls();
  try {
    await api('/api/teacher/cards/' + current.id + '/review', {body: {action, expected_version: current.version, note: byId('revision-note').value}});
    dirty = false;
    if (action === 'delete') { editor.destroy(); editor = null; current = null; byId('review-detail').hidden = true; }
    else await openCard(current.id, true);
    await refreshList(); message('teacher-message', action === 'delete' ? 'Card removed from student access and review. Local originals and history were retained.' : action === 'approve' ? 'Card approved.' : 'Revision requested. The student can edit and resubmit.');
  } finally { busy = false; controls(); }
}
async function start() {
  const dashboard = await api('/api/teacher/dashboard');
  byId('database-state').textContent = '✓ Local project database is ready.';
  await loadProjects(dashboard.project.id); await loadSettings(dashboard.project.id); await refreshList();
  byId('settings-project').addEventListener('change', () => guard(() => loadSettings(byId('settings-project').value)));
  byId('new-project').addEventListener('click', () => { settings = {...structuredClone(settings), id: null, title: 'New field guide', version: 0}; displaySettings(); byId('project-title').focus(); });
  byId('project-form').addEventListener('submit', event => guard(() => saveSettings(event)));
  for (const id of ['filter-project', 'filter-class', 'filter-status']) byId(id).addEventListener('change', () => { page = 1; guard(refreshList); });
  byId('refresh-list').addEventListener('click', () => guard(refreshList));
  byId('previous-page').addEventListener('click', () => { page--; guard(refreshList); });
  byId('next-page').addEventListener('click', () => { page++; guard(refreshList); });
  byId('reload-card').addEventListener('click', () => { if (safeLeave()) guard(() => openCard(current.id, true)); });
  byId('close-review').addEventListener('click', () => { if (safeLeave()) { editor.destroy(); editor = null; current = null; dirty = false; byId('review-detail').hidden = true; } });
  byId('save-edits').addEventListener('click', () => guard(saveEdits));
  for (const [id, action] of [['approve-card', 'approve'], ['request-revision', 'revision'], ['delete-card', 'delete']]) byId(id).addEventListener('click', () => guard(() => review(action)));
  byId('logout').addEventListener('click', () => { if (safeLeave()) guard(async () => { await api('/api/teacher/logout', {body: {}}); location.assign('/teacher/login'); }); });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
}
start().catch(error => message('page-error', error.message, true));



