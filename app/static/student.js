import {api, byId, CardEditor, message, randomKey} from './editor.js';

const REGISTRY = 'classroom-cards.registry.v1', ACTIVE = 'classroom-cards.active.v1';
let editor, token, version = 0, status = 'Draft', dirty = false, busy = false, generation = 0, pending;
let storageOK = true, registry = [];
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { storageOK = false; return fallback; } }
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { storageOK = false; return false; } }
function remove(key) { try { localStorage.removeItem(key); } catch { storageOK = false; } }
const draftKey = key => 'classroom-cards.draft.' + key;
function storageMessage() {
  message('local-state', storageOK ? 'Unsaved text is recovered on this browser. Use Save draft to keep it on the classroom computer.' : 'Browser storage is unavailable. Keep the recovery code and save to the classroom computer before leaving.', !storageOK);
}
function remember() {
  const data = editor.data();
  registry = registry.filter(item => item.token !== token);
  registry.unshift({token, title: data.values.common_name || data.values.title || Object.values(data.values).find(Boolean) || 'Untitled card', project_id: data.project_id});
  write(REGISTRY, registry); write(ACTIVE, token); renderRegistry();
}
function renderRegistry() {
  const select = byId('saved-cards'); select.replaceChildren(new Option('Choose a card…', ''));
  registry.forEach(item => select.add(new Option(item.title, item.token)));
  select.value = token || '';
}
function backup() {
  write(draftKey(token), {data: editor.data(), version, status, pending}); remember(); storageMessage();
}
function controls() {
  const locked = ['Submitted', 'Approved', 'Deleted'].includes(status);
  byId('save-draft').disabled = byId('submit-card').disabled = busy || locked || !editor;
  for (const id of ['new-card', 'saved-cards', 'restore-card', 'project', 'load-latest']) byId(id).disabled = busy || !editor;
  if (editor) editor.setLocked(busy || locked);
  byId('card-status').textContent = status;
  byId('save-hint').textContent = status === 'Deleted' ? 'This card was deleted. Choose New card to continue.' : locked ? 'This card is with your teacher. Needs Revision unlocks it for editing.' : 'Save a draft while you work. Submit when the card is complete.';
}
function canLeave() { return !busy && (!dirty || confirm('This card has unsaved changes. They will stay on this browser, but are not saved to the classroom computer. Switch cards?')); }

async function openCard(key, projectId, {discard = false} = {}) {
  const current = ++generation;
  busy = true; controls(); message('page-error', '');
  const local = discard ? null : read(draftKey(key), null);
  let card = null;
  try { card = await api('/api/student/card', {token: key}); }
  catch (error) {
    if (error.status === 410) {
      if (key === token) status = 'Deleted';
      busy = false; controls(); throw error;
    }
    // A failed reload must never replace unsaved work with an empty card.
    if (error.status !== 404 || discard) throw error;
  }
  const project = await api('/api/project?project_id=' + encodeURIComponent(card?.project_id || local?.data.project_id || projectId || 'field-guide'));
  if (current !== generation) return;
  editor?.destroy(); token = key; pending = null;
  status = card?.status || local?.status || 'Draft'; version = card?.version || local?.version || 0;
  let data = card || {};
  dirty = false;
  if (local && !['Submitted', 'Approved'].includes(status)) {
    data = {...data, ...local.data}; dirty = true;
    // Never silently rebase unsaved content over teacher changes.
    version = local.version; pending = local.pending;
    message('save-state', card && card.version !== local.version ? 'A newer saved version exists. Your unsaved text is shown. Copy anything you need, then Load latest saved card.' : 'Recovered unsaved work from this browser. Save draft when ready.');
  } else message('save-state', card ? `Loaded ${card.status.toLowerCase()} · saved ${card.updated_at} UTC.` : 'New card — nothing saved to the classroom computer yet.');
  editor = new CardEditor(byId('editor'), project, data, {token,
    onChange: () => { dirty = true; pending = null; backup(); message('save-state', 'Unsaved changes — use Save draft.'); },
    onBusy: value => { busy = value; controls(); }
  });
  byId('project').value = project.id; byId('project-instructions').textContent = project.template.instructions;
  byId('teacher-note').hidden = !card?.teacher_note; byId('teacher-note').textContent = card?.teacher_note ? 'Teacher note: ' + card.teacher_note : '';
  byId('recovery-code').value = token; busy = false; controls(); remember(); storageMessage();
  if (discard) remove(draftKey(token));
}

async function save(action) {
  if (busy) return;
  busy = true; controls(); message('page-error', '');
  const data = editor.data();
  if (!pending || pending.action !== action) pending = {...data, expected_version: version, mutation_id: randomKey(), action};
  backup();
  try {
    const result = await api('/api/student/card', {token, body: pending});
    version = result.version; status = result.status; dirty = false; pending = null;
    remove(draftKey(token)); remember();
    message('save-state', action === 'submit' ? 'Submitted to your teacher. Reopen this card later to check feedback.' : 'Draft saved to the classroom computer. You can reopen it on this device.');
  } catch (error) {
    message('page-error', error.message, true); editor.error(error);
    if (error.status) pending = null;
    if (error.status === 410) status = 'Deleted';
    backup();
  } finally { busy = false; controls(); }
}

async function guarded(action) {
  try { await action(); }
  catch (error) { busy = false; controls(); message('page-error', error.message, true); }
}
async function start() {
  const storedRegistry = read(REGISTRY, []);
  registry = (Array.isArray(storedRegistry) ? storedRegistry : []).filter(item => item && /^[A-Za-z0-9_-]{43}$/.test(item.token));
  const projects = await api('/api/projects');
  projects.forEach(project => byId('project').add(new Option(project.title, project.id)));
  const requested = new URLSearchParams(location.search).get('project');
  const active = read(ACTIVE, null);
  const remembered = typeof active === 'string' && /^[A-Za-z0-9_-]{43}$/.test(active) ? active : null;
  const rememberedProject = registry.find(item => item.token === remembered)?.project_id;
  const key = remembered && (!requested || requested === rememberedProject) ? remembered : randomKey();
  try { await openCard(key, requested || rememberedProject || projects[0].id); }
  catch (error) {
    if (error.status !== 410) throw error;
    registry = registry.filter(item => item.token !== key);
    await openCard(randomKey(), requested || rememberedProject || projects[0].id);
    message('page-error', 'Your previously opened card was deleted by the teacher. A new draft is ready.', true);
  }
  byId('save-draft').addEventListener('click', () => save('save'));
  byId('submit-card').addEventListener('click', () => save('submit'));
  byId('new-card').addEventListener('click', () => { if (canLeave()) guarded(() => openCard(randomKey(), byId('project').value)); });
  byId('saved-cards').addEventListener('change', event => {
    const selected = event.target.value;
    if (selected && canLeave()) guarded(() => openCard(selected)); else event.target.value = token;
  });
  byId('load-latest').addEventListener('click', () => {
    if (busy || dirty && !confirm('Replace the unsaved text on this device with the latest server version? Copy anything you want to keep first.')) return;
    guarded(() => openCard(token, editor.project.id, {discard: true}));
  });
  byId('restore-card').addEventListener('click', () => {
    const key = byId('restore-code').value.trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(key)) { message('page-error', 'Enter the complete 43-character recovery code.', true); return; }
    if (canLeave()) guarded(async () => { await api('/api/student/card', {token: key}); await openCard(key); });
  });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
}
start().catch(error => { busy = false; controls(); message('page-error', error.message, true); });



