import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { control, checkInputs, modal } from '../src/ui/dom.mjs';
import { listEditor } from '../src/ui/list-editor.mjs';
import { createTemplate } from '../src/core/templates.mjs';
import { JsonSession } from '../src/models/json.mjs';

function setup(t) {
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  const w = dom.window;
  globalThis.window = w;
  globalThis.document = w.document;
  globalThis.CustomEvent = w.CustomEvent;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const downloads = [];
  const original = URL.createObjectURL;
  URL.createObjectURL = (blob) => {
    downloads.push(blob);
    return 'blob:test';
  };
  w.HTMLAnchorElement.prototype.click = function () {};
  t.after(() => {
    URL.createObjectURL = original;
    w.close();
  });
  const click = (name, scope = w.document) => {
    const b = [...scope.querySelectorAll('button')].find(
      (b) => (b.getAttribute('aria-label') || b.textContent) === name,
    );
    assert.ok(b, 'Missing button: ' + name);
    assert.equal(b.disabled, false, 'Disabled button: ' + name);
    b.click();
  };
  const draft = (input, value) => {
    input.value = value;
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
  };
  return { w, click, draft, downloads };
}

test('drafts commit before commands; invalid values explain recovery without corrupting data', (t) => {
  const { w, draft } = setup(t);
  let value = 5,
    saves = 0;
  const input = control(
    'Int32',
    value,
    (v) => {
      if (!Number.isInteger(Number(v))) throw new Error('Enter a whole number.');
      value = Number(v);
      saves++;
    },
    { label: 'Count' },
  );
  document.body.append(input);
  draft(input, '12');
  checkInputs();
  assert.equal(value, 12);
  input.dispatchEvent(new w.Event('change'));
  assert.equal(saves, 1, 'blur/change must not create duplicate history');
  draft(input, '1.5');
  assert.throws(() => checkInputs(), /whole number/);
  assert.equal(value, 12);
  assert.match(document.querySelector('[role=alert]').textContent, /Escape/);
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(input.value, '12');
  assert.equal(document.querySelector('[role=alert]'), null);
  assert.doesNotThrow(() => checkInputs());
});

test('list actions and download use the latest draft; adding and duplicating have distinct behavior', async (t) => {
  const { click, draft, downloads } = setup(t);
  let values;
  const host = listEditor({
    title: 'Labels',
    columns: [{ id: 'value', label: 'Text', type: 'String' }],
    rows: [{ values: { value: 'First' } }],
    defaultRow: () => ({ values: { value: '' } }),
    onSave: (rows) => (values = rows.map((r) => r.values.value)),
    notify() {},
  });
  document.body.append(host);
  draft(host.querySelector('textarea'), 'Changed before export');
  click('JSON ↓');
  assert.deepEqual(JSON.parse(await downloads[0].text()), ['Changed before export']);
  click('Add row');
  assert.deepEqual(values, ['Changed before export', '']);
  click('Duplicate row 1');
  assert.deepEqual(values, ['Changed before export', 'Changed before export', '']);
  click('Move down row 2');
  assert.deepEqual(values, ['Changed before export', '', 'Changed before export']);
  click('Remove row 1');
  assert.deepEqual(values, ['', 'Changed before export']);
  assert.equal(host.querySelector('[aria-label="Move up row 1"]').disabled, true);
});

test('bulk formats retain drafts and invalid replacement does not change the list', (t) => {
  const { w, click, draft } = setup(t);
  let values = ['A'],
    saves = 0;
  document.body.append(
    listEditor({
      title: 'Names',
      columns: [{ id: 'value', label: 'Name', type: 'String' }],
      rows: [{ values: { value: 'A' } }],
      defaultRow: () => ({ values: { value: '' } }),
      onSave: (rows) => {
        values = rows.map((r) => r.values.value);
        saves++;
      },
      notify() {},
    }),
  );
  click('Bulk edit / import');
  const dialog = document.querySelector('dialog'),
    select = dialog.querySelector('select'),
    input = dialog.querySelector('textarea');
  draft(input, '["My draft"]');
  select.value = 'CSV';
  select.dispatchEvent(new w.Event('change'));
  draft(input, 'value\nCSV draft');
  select.value = 'JSON';
  select.dispatchEvent(new w.Event('change'));
  assert.equal(input.value, '["My draft"]');
  draft(input, '{broken');
  click('Replace list');
  assert.equal(saves, 0);
  assert.match(dialog.querySelector('[role=alert]').textContent, /JSON|property/i);
  draft(input, '["B", "C"]');
  click('Replace list');
  assert.deepEqual(values, ['B', 'C']);
  assert.equal(document.querySelector('dialog'), null);
  click('Bulk edit / import');
  click('Cancel');
  assert.equal(saves, 1);
});

test('numeric generation has no irrelevant name pattern, preserves page across redraw, and enforces row bounds', (t) => {
  const { click } = setup(t);
  let rows = [{ values: { value: 1 } }];
  const view = {};
  const options = {
    title: 'Counts',
    columns: [{ id: 'value', label: 'Count', type: 'Int32' }],
    view,
    minRows: 1,
    onSave: (v) => (rows = v),
    notify() {},
  };
  document.body.append(listEditor({ ...options, rows }));
  assert.equal(document.querySelector('[aria-label="Remove row 1"]').disabled, true);
  click('Generate');
  const dialog = document.querySelector('dialog');
  assert.equal(dialog.querySelectorAll('input').length, 2);
  dialog.querySelectorAll('input')[0].value = '41';
  click('Append rows');
  assert.equal(rows.length, 42);
  assert.equal(view.page, 1);
  document.body.replaceChildren(listEditor({ ...options, rows }));
  assert.ok(document.querySelector('[aria-label="Move up row 41"]'));
  click('Move up row 41');
  assert.equal(view.page, 0);
});

test('dialogs are labelled and Escape returns focus; new JSON files need export', async (t) => {
  const { w } = setup(t);
  const origin = document.createElement('button');
  document.body.append(origin);
  origin.focus();
  const dialog = modal('Example dialog', ({ footer, close }) => {
    const button = document.createElement('button');
    button.textContent = 'Cancel';
    button.onclick = close;
    footer.append(button);
  });
  assert.equal(
    document.getElementById(dialog.getAttribute('aria-labelledby')).textContent,
    'Example dialog',
  );
  assert.ok(dialog.querySelector('[aria-label="Close dialog"]'));
  dialog.dispatchEvent(new w.Event('cancel', { cancelable: true }));
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(document.activeElement, origin);
  assert.equal((await createTemplate('structure-json')).newFile, true);
  assert.equal((await createTemplate('dictionary-json')).newFile, true);
});

test('renaming JSON fields rejects duplicates immediately and preserves nulls', () => {
  const session = new JsonSession(
    'fields.json',
    JSON.stringify({
      type: 'Struct',
      struct_ype: 'basic',
      value: [
        { key: 'One', param_type: 'String', value: { param_type: 'String', value: '' } },
        { key: 'Two', param_type: 'String', value: { param_type: 'String', value: '' } },
      ],
    }),
  );
  assert.throws(() => session.nodes()[0].children[1].rename('One'), /unique/);
  assert.equal(session.history.length, 0);
  const generic = new JsonSession('nullable.json', '{"value":null}');
  assert.equal(generic.nodes()[0].children[0].kind, 'readonly');
  assert.equal(generic.export(), '{"value":null}');
});
