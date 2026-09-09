import { BinarySession } from './models/binary.mjs';
import { JsonSession } from './models/json.mjs';
import { componentLists } from './models/ui-lists.mjs';
import { properties } from '../assets/game-properties.mjs';
import { createTemplate, TEMPLATES } from './core/templates.mjs';
import { renderInspector } from './ui/inspector.mjs';
import { el, button, modal, download, checkInputs, numberFormat } from './ui/dom.mjs';
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
  section: 'Other',
};
function status(message, error = false) {
  $('status-message').textContent = message;
  $('status-message').classList.toggle('error', error);
}
function run(action) {
  try {
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
    renderFiles();
    renderRecords();
    renderActions();
  }
  status(message, error);
}
function renderActions() {
  const session = state.active;
  $('undo').disabled = !session?.history.length;
  $('redo').disabled = !session?.future.length;
  $('export').disabled = !session || state.busy > 0;
  $('document-status').textContent = session
    ? session.dirty
      ? 'Unsaved edits'
      : session.newFile
        ? 'New document'
        : 'Saved state'
    : '';
  $('document-status').classList.toggle('dirty', !!session?.dirty);
}
function renderFiles() {
  const host = $('file-tabs');
  host.replaceChildren();
  for (const session of state.sessions) {
    const tab = el('div', 'file-tab' + (session === state.active ? ' active' : ''));
    const open = button(`${session.dirty ? '● ' : ''}${session.name}`, () =>
      run(() => selectSession(session)),
    );
    open.title = session.name;
    tab.append(open);
    const close = button(
      '×',
      () =>
        run(() => {
          if (session.dirty) {
            modal('Close file?', ({ body, footer, close }) => {
              body.append(el('p', '', `“${session.name}” has unexported edits.`));
              footer.append(
                button('Keep editing', close),
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
    state.selected = (first || session.records[0])?.key;
  }
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
    records = session.records.filter(
      (r) =>
        (state.filter === 'all' ||
          (state.filter === 'objects' && ['scene', 'prefab', 'decoration'].includes(r.kind)) ||
          (state.filter === 'section' && ['section', 'asset'].includes(r.kind)) ||
          r.kind === state.filter) &&
        (!q ||
          `${r.name} ${r.id} ${(r.variables || []).map((v) => v.name).join(' ')}`
            .toLowerCase()
            .includes(q)),
    );
  const count = 70;
  state.page = Math.min(state.page, Math.max(0, Math.ceil(records.length / count) - 1));
  $('record-count').textContent = `${records.length.toLocaleString()} objects`;
  for (const record of records.slice(state.page * count, (state.page + 1) * count)) {
    const b = button(
      '',
      () =>
        run(() => {
          state.selected = record.key;
          state.tab = ['asset', 'section'].includes(record.kind) ? 'advanced' : 'data';
          renderRecords();
          renderEditor();
        }),
      'record' + (record.key === state.selected ? ' selected' : ''),
    );
    b.setAttribute('aria-pressed', String(record.key === state.selected));
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
    title.append(el('strong', '', record.name), el('small', '', `${record.kind} · ${record.id}`));
    b.append(title);
    if (session.doc?.changes.has(record.key)) b.append(el('span', 'edit-dot', '●'));
    host.append(b);
  }
  if (!records.length) host.append(el('p', 'empty-note', 'No matches. Try another filter.'));
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
  const host = $('inspector'),
    scroll = host.scrollTop,
    open = new Set(
      [...host.querySelectorAll('details[open][data-node-key]')].map((d) => d.dataset.nodeKey),
    );
  renderInspector(host, state.active, activeRecord(), {
    run,
    changed,
    tab: state.tab,
    setTab: (tab) => {
      state.tab = tab;
    },
    refresh: () => renderEditor(),
  });
  host.querySelectorAll('details[data-node-key]').forEach((d) => {
    if (open.has(d.dataset.nodeKey)) d.open = true;
  });
  host.scrollTop = scroll;
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
            status('Creating ' + template.name + '…');
            addSession(await createTemplate(template.id));
          }),
        'template-card',
      );
      b.append(el('strong', '', template.name), el('span', '', template.detail));
      grid.append(b);
    }
    body.append(grid);
  });
}
function exportFile() {
  const session = state.active;
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
  changed(`Exported ${name}.`);
}
function history(direction) {
  const s = state.active;
  if (!s) return;
  const step = (direction === 'undo' ? s.history : s.future).at(-1);
  s[direction]();
  if (step?.key) refreshName(s.records.find((r) => r.key === step.key));
  renderEditor();
  changed(direction === 'undo' ? 'Undid last change.' : 'Redid last change.');
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
  modal('File support', ({ body }) => {
    body.append(
      el(
        'p',
        '',
        'GIA and GIL: UI lists, deck selectors, object variables, Structure defaults, mapped properties, and existing stored fields. JSON: Structures, dictionaries, variables, and nested lists.',
      ),
      el(
        'p',
        '',
        'Unknown binary fields retain their original bytes. An unedited export matches the original. New binary Structure definitions, new nested binary Structure rows, dictionary row creation, and automatic repair of game references are not implemented. Edited files still need an import check in Miliastra.',
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
        status('Creating ' + template.name + '…');
        addSession(await createTemplate(template.id));
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
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (key === 's') {
    e.preventDefault();
    document.activeElement?.blur();
    run(exportFile);
  }
  if (key === 'o') {
    e.preventDefault();
    $('file-input').click();
  }
  if (key === 'z' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    e.preventDefault();
    run(() => history(e.shiftKey ? 'redo' : 'undo'));
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
  if (state.sessions.some((s) => s.dirty) || document.querySelector('[data-pending="true"]')) {
    e.preventDefault();
    e.returnValue = '';
  }
});
selectSession(null);
