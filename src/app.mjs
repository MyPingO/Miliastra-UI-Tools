import { BinarySession } from './models/binary.mjs';
import { JsonSession } from './models/json.mjs';
import { componentLists } from './models/ui-lists.mjs';
import { properties } from '../assets/game-properties.mjs';
import { createTemplate, TEMPLATES } from './core/templates.mjs';
import { renderInspector } from './ui/inspector.mjs';
import { el, button, modal, download, checkInputs } from './ui/dom.mjs';
const $ = (id) => document.getElementById(id);
const state = {
  sessions: [],
  active: null,
  selected: null,
  tab: 'data',
  filter: 'all',
  query: '',
  page: 0,
  busy: 0,
};
const kinds = {
  all: 'All',
  ui: 'UI',
  objects: 'Objects',
  structure: 'Structures',
};
const navigation = new WeakMap(),
  editorViews = new WeakMap();
const visibleRecords = (session) =>
  session.records.filter((r) => !['asset', 'section'].includes(r.kind));
const kindNames = {
  ui: 'UI element',
  scene: 'Scene object',
  prefab: 'Prefab',
  decoration: 'Decoration',
  structure: 'Structure',
  json: 'JSON document',
};
function status(message, error = false) {
  $('status-message').textContent = message;
  $('status-message').classList.toggle('error', error);
}
function run(action) {
  try {
    if (state.busy) return status('Please wait for the current file to finish loading.');
    checkInputs();
    const result = action();
    if (result?.catch) result.catch((e) => status(e.message, true));
  } catch (e) {
    status(e.message, true);
  }
}
function activeRecord() {
  return state.active?.records.find((r) => r.key === state.selected);
}
function refreshName(record = activeRecord()) {
  if (!record) return;
  if (state.active?.format === 'JSON') {
    record.name = state.active.root.name || state.active.name;
    return;
  }
  if (!state.active?.doc) return;
  const name = properties(record, state.active.doc.bytes(record)).find((p) => p.label === 'Name');
  if (name) record.name = name.value;
}
function changed(message, error = false) {
  if (!error) {
    refreshName();
    // Update labels in place: replacing clicked buttons during input blur loses clicks.
    [...$('file-tabs').children].forEach((tab, i) => {
      const session = state.sessions[i];
      tab.firstElementChild.textContent = `${session.dirty || session.newFile ? '● ' : ''}${session.name}`;
    });
    for (const item of $('record-list').querySelectorAll('[data-record-key]')) {
      const record = state.active.records.find((r) => r.key === item.dataset.recordKey);
      if (record) item.querySelector('strong').textContent = record.name;
    }
    const heading = $('inspector').querySelector('h1');
    if (heading && activeRecord()) heading.textContent = activeRecord().name;
    renderActions();
  }
  status(message, error);
}
function renderActions() {
  const session = state.active;
  $('undo').disabled = !session?.history.length || state.busy > 0;
  $('redo').disabled = !session?.future.length || state.busy > 0;
  $('editor-layout').inert = state.busy > 0;
  $('editor-layout').setAttribute('aria-busy', String(state.busy > 0));
  $('export').disabled = !session || state.busy > 0;
  $('new').disabled = $('open').disabled = $('welcome-open').disabled = state.busy > 0;
  $('templates')
    .querySelectorAll('button')
    .forEach((b) => (b.disabled = state.busy > 0));
  $('undo').title = session?.history.length
    ? 'Undo: ' + session.history.at(-1).label
    : 'Nothing to undo';
  $('redo').title = session?.future.length
    ? 'Redo: ' + session.future.at(-1).label
    : 'Nothing to redo';
  $('document-status').textContent = session
    ? session.dirty
      ? 'Unexported edits'
      : session.newFile
        ? 'Not exported yet'
        : session.exported
          ? 'Exported'
          : 'Unchanged'
    : '';
  $('document-status').classList.toggle('dirty', !!session?.dirty);
}
function renderFiles() {
  const host = $('file-tabs');
  host.replaceChildren();
  for (const session of state.sessions) {
    const tab = el('div', 'file-tab' + (session === state.active ? ' active' : ''));
    const open = button(`${session.dirty || session.newFile ? '● ' : ''}${session.name}`, () =>
      run(() => selectSession(session)),
    );
    open.title = session.name;
    open.setAttribute('aria-pressed', String(session === state.active));
    tab.append(open);
    const close = button(
      '×',
      () =>
        run(() => {
          if (session.dirty || session.newFile) {
            modal('Close file?', ({ body, footer, close }) => {
              body.append(
                el(
                  'p',
                  '',
                  `“${session.name}” has not been exported${session.newFile ? '' : ' with its latest edits'}.`,
                ),
              );
              footer.append(
                button('Keep editing', close),
                button(
                  'Export and close',
                  () => {
                    run(() => {
                      exportFile(session);
                      close();
                      closeSession(session);
                    });
                  },
                  'primary',
                ),
                button(
                  'Close without exporting',
                  () => {
                    close();
                    closeSession(session);
                  },
                  'danger',
                ),
              );
            });
          } else closeSession(session);
        }),
      'close-file',
    );
    close.setAttribute('aria-label', 'Close ' + session.name);
    tab.append(close);
    host.append(tab);
  }
}
function closeSession(session) {
  state.sessions = state.sessions.filter((s) => s !== session);
  if (state.active === session) selectSession(state.sessions.at(-1) || null);
  else renderFiles();
}
function selectSession(session) {
  if (state.active)
    navigation.set(
      state.active,
      Object.fromEntries(
        ['selected', 'page', 'query', 'filter', 'tab'].map((key) => [key, state[key]]),
      ),
    );
  state.active = session;
  state.selected = null;
  state.page = 0;
  state.query = '';
  state.filter = 'all';
  state.tab = 'data';
  $('object-search').value = '';
  $('welcome').hidden = !!session;
  $('editor-layout').hidden = !session;
  if (session) {
    const first = session.doc
      ? session.records.find((r) => r.kind === 'ui' && componentLists(session.doc, r).length) ||
        session.records.find((r) => ['structure', 'scene', 'prefab', 'ui'].includes(r.kind))
      : session.records[0];
    state.selected = (first || visibleRecords(session)[0])?.key;
    Object.assign(state, navigation.get(session) || {});
  }
  $('object-search').value = state.query;
  renderFiles();
  renderFilters();
  renderRecords();
  renderActions();
  renderEditor();
}
function addSession(session) {
  state.sessions.push(session);
  selectSession(session);
  status(`Opened ${session.name}.`);
}
function renderFilters() {
  const host = $('record-filters');
  $('editor-layout').classList.toggle('json-document', state.active?.format === 'JSON');
  host.replaceChildren();
  $('object-search').hidden = state.active?.format === 'JSON';
  if (state.active?.format === 'JSON') return;
  for (const [key, label] of Object.entries(kinds)) {
    const b = button(label, () =>
      run(() => {
        state.filter = key;
        state.page = 0;
        renderFilters();
        renderRecords();
      }),
    );
    b.classList.toggle('active', state.filter === key);
    b.setAttribute('aria-pressed', String(state.filter === key));
    host.append(b);
  }
}
function renderRecords() {
  const host = $('record-list');
  host.replaceChildren();
  const session = state.active;
  if (!session) return;
  const q = state.query.toLowerCase(),
    records = visibleRecords(session).filter(
      (r) =>
        (state.filter === 'all' ||
          (state.filter === 'objects' && ['scene', 'prefab', 'decoration'].includes(r.kind)) ||
          r.kind === state.filter) &&
        (!q ||
          `${r.name} ${r.id} ${(r.variables || []).map((v) => v.name).join(' ')}`
            .toLowerCase()
            .includes(q)),
    );
  const count = 70;
  state.page = Math.min(state.page, Math.max(0, Math.ceil(records.length / count) - 1));
  $('record-count').textContent =
    session.format === 'JSON'
      ? 'JSON'
      : `${records.length.toLocaleString()} ${records.length === 1 ? 'object' : 'objects'}`;
  for (const record of records.slice(state.page * count, (state.page + 1) * count)) {
    const b = button(
      '',
      () =>
        run(() => {
          state.selected = record.key;
          state.tab = 'data';
          renderRecords();
          renderEditor();
        }),
      'record' + (record.key === state.selected ? ' selected' : ''),
    );
    b.setAttribute('aria-pressed', String(record.key === state.selected));
    b.dataset.recordKey = record.key;
    b.title = record.name;
    b.append(
      el(
        'span',
        'record-icon',
        record.kind === 'ui'
          ? '▤'
          : record.kind === 'structure'
            ? '▦'
            : record.kind === 'json'
              ? '{}'
              : '◇',
      ),
    );
    const title = el('span', 'record-title');
    title.append(
      el('strong', '', record.name),
      el('small', '', kindNames[record.kind] || 'Object'),
    );
    b.append(title);
    host.append(b);
  }
  if (!records.length) {
    host.append(
      el(
        'p',
        'empty-note',
        state.query || state.filter !== 'all'
          ? 'No matching objects.'
          : 'This file has no supported objects to edit. Its contents will be preserved on export.',
      ),
    );
    if (state.query || state.filter !== 'all')
      host.append(
        button('Clear search and filters', () => {
          state.query = '';
          state.filter = 'all';
          state.page = 0;
          $('object-search').value = '';
          renderFilters();
          renderRecords();
        }),
      );
  }
  $('records-page').parentElement.hidden = records.length <= count;
  $('records-prev').disabled = state.page === 0;
  $('records-next').disabled = (state.page + 1) * count >= records.length;
  $('records-page').textContent =
    `${state.page + 1} / ${Math.max(1, Math.ceil(records.length / count))}`;
}
function renderEditor() {
  if (!state.active) {
    $('inspector').replaceChildren();
    return;
  }
  const host = $('inspector');
  if (!editorViews.has(state.active)) editorViews.set(state.active, new Map());
  const views = editorViews.get(state.active),
    key = state.selected + '/' + state.tab;
  if (!views.has(key)) views.set(key, { scroll: 0, nodes: new Map() });
  const view = views.get(key);
  host.onscroll = () => (view.scroll = host.scrollTop);
  renderInspector(host, state.active, activeRecord(), {
    run,
    changed,
    tab: state.tab,
    setTab: (tab) => {
      state.tab = tab;
    },
    refresh: () => renderEditor(),
    view: (key) => {
      if (!view.nodes.has(key)) view.nodes.set(key, {});
      return view.nodes.get(key);
    },
  });
  host.scrollTop = view.scroll;
}
async function openFiles(files) {
  for (const file of files) {
    if (file.size > 256 * 1024 * 1024) {
      status('Files larger than 256 MB are not supported.', true);
      continue;
    }
    state.busy++;
    renderActions();
    status(`Reading ${file.name}…`);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      let session;
      if (file.name.toLowerCase().endsWith('.json'))
        session = new JsonSession(file.name, await file.text());
      else if (/\.(gia|gil)$/i.test(file.name))
        session = new BinarySession(file.name, new Uint8Array(await file.arrayBuffer()));
      else throw new Error('Choose a GIA, GIL, or JSON file.');
      // Reject files that cannot render before adding a partially opened session.
      if (session.format === 'JSON') session.nodes();
      addSession(session);
    } catch (e) {
      status(`Could not open ${file.name}: ${e.message}`, true);
    } finally {
      state.busy--;
      renderActions();
    }
  }
}
function newMenu() {
  modal('Create a file', ({ body, close }) => {
    const grid = el('div', 'template-grid');
    for (const template of TEMPLATES) {
      const b = button(
        '',
        () =>
          run(async () => {
            close();
            await newFile(template);
          }),
        'template-card',
      );
      b.append(el('strong', '', template.name), el('span', '', template.detail));
      grid.append(b);
    }
    body.append(grid);
  });
}
async function newFile(template) {
  state.busy++;
  renderActions();
  status('Creating ' + template.name + '…');
  try {
    addSession(await createTemplate(template.id));
  } finally {
    state.busy--;
    renderActions();
  }
}
function exportFile(session = state.active) {
  if (!session) return;
  const data = session.export(),
    name =
      session.name.replace(/\.(gia|gil|json)$/i, '') +
      (session.dirty ? ' - edited' : '') +
      '.' +
      session.format.toLowerCase();
  download(name, data, session.format === 'JSON' ? 'application/json' : 'application/octet-stream');
  session.markSaved();
  session.newFile = false;
  session.exported = true;
  changed(`Exported ${name}.`);
}
function history(direction) {
  const s = state.active;
  if (!s) return;
  const step = (direction === 'undo' ? s.history : s.future).at(-1);
  if (!step) return;
  s[direction]();
  if (step?.key) refreshName(s.records.find((r) => r.key === step.key));
  renderEditor();
  changed(`${direction === 'undo' ? 'Undid' : 'Redid'}: ${step.label || 'last change'}.`);
}
$('open').onclick = $('welcome-open').onclick = () => run(() => $('file-input').click());
$('file-input').onchange = () => {
  const files = [...$('file-input').files];
  $('file-input').value = '';
  run(() => openFiles(files));
};
$('new').onclick = () => run(newMenu);
$('export').onclick = () => run(exportFile);
$('undo').onclick = () => run(() => history('undo'));
$('redo').onclick = () => run(() => history('redo'));
$('object-search').oninput = () => {
  state.query = $('object-search').value;
  state.page = 0;
  renderRecords();
};
$('records-prev').onclick = () => {
  state.page--;
  renderRecords();
};
$('records-next').onclick = () => {
  state.page++;
  renderRecords();
};
$('help').onclick = () =>
  modal('Using the editor', ({ body }) => {
    body.append(
      el(
        'p',
        '',
        'Open GIA, GIL, or JSON files, choose an object, then edit its lists or properties. Changes stay in this tab until you export the file. Export downloads a copy; it does not overwrite your original.',
      ),
      el(
        'p',
        '',
        'Add row starts a new value. Duplicate copies a row. Generate appends rows; bulk import replaces the list. Undo and redo apply to the current file.',
      ),
      el(
        'p',
        '',
        'Enter applies a number or ID. Escape restores an unfinished value. Ctrl/Cmd+S exports; Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z undo and redo outside text inputs.',
      ),
    );
    body.append(
      el(
        'p',
        '',
        'GIA and GIL support UI lists, deck selectors, object variables, Structure defaults, and supported properties. JSON supports Structures, dictionaries, variables, and nested lists.',
      ),
      el(
        'p',
        '',
        'Settings that are not supported are kept in the file. An unchanged export matches the original. Creating new Structures or adding nested Structure and dictionary rows in GIA/GIL files is not supported yet. Edited files still need an import check in Miliastra.',
      ),
    );
    const link = el('a', '', 'Format notes and implementation limits ↗');
    link.href = './docs/gil-format.md';
    link.target = '_blank';
    link.rel = 'noopener';
    body.append(link);
  });
for (const template of TEMPLATES) {
  const b = button(
    '',
    () =>
      run(async () => {
        await newFile(template);
      }),
    'template-card',
  );
  b.append(
    el('span', 'template-icon', template.id.endsWith('json') ? '{}' : '▤'),
    el('strong', '', template.name),
    el('span', '', template.detail),
  );
  $('templates').append(b);
}
document.addEventListener('editor-error', (e) => status(e.detail, true));
document.addEventListener('editor-restored', () => status('Restored the previous value.'));
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (document.querySelector('dialog[open]')) {
    if (['s', 'o'].includes(key)) e.preventDefault();
    return;
  }
  if (key === 's') {
    e.preventDefault();
    document.activeElement?.blur();
    run(exportFile);
  }
  if (key === 'o') {
    e.preventDefault();
    run(() => $('file-input').click());
  }
  if (
    ['z', 'y'].includes(key) &&
    !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
  ) {
    e.preventDefault();
    run(() => history(e.shiftKey || key === 'y' ? 'redo' : 'undo'));
  }
});
let dragDepth = 0;
document.addEventListener('dragenter', (e) => {
  if (e.dataTransfer?.types.includes('Files')) {
    e.preventDefault();
    dragDepth++;
    document.body.classList.add('dragging');
  }
});
document.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
});
document.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    document.body.classList.remove('dragging');
  }
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  if (e.dataTransfer?.files.length) run(() => openFiles([...e.dataTransfer.files]));
});
window.addEventListener('beforeunload', (e) => {
  if (
    state.sessions.some((s) => s.dirty || s.newFile) ||
    document.querySelector('[data-pending="true"]')
  ) {
    e.preventDefault();
    e.returnValue = '';
  }
});
selectSession(null);
