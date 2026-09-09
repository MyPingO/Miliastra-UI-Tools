import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { demoFile } from './fixtures/game.mjs';
test('one native interface opens files, edits lists, validates, undoes, and switches documents', async () => {
  const dom = new JSDOM(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'), {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  for (const [key, value] of Object.entries({
    window: w,
    document: w.document,
    CustomEvent: w.CustomEvent,
  }))
    globalThis[key] = value;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  await import('../src/app.mjs?test');
  const $ = (id) => w.document.getElementById(id),
    change = (input) => input.dispatchEvent(new w.Event('change', { bubbles: true })),
    open = async (file) => {
      Object.defineProperty($('file-input'), 'files', { configurable: true, value: [file] });
      change($('file-input'));
      await new Promise((r) => setTimeout(r, 50));
    };
  assert.equal(w.document.querySelector('iframe'), null);
  assert.equal(w.document.querySelector('#demo'), null);
  const bytes = demoFile();
  await open({ name: 'game.gil', size: bytes.length, arrayBuffer: async () => bytes.buffer });
  assert.equal($('editor-layout').hidden, false);
  const section = [...w.document.querySelectorAll('.editor-section')].find(
    (n) => n.querySelector('h2')?.textContent === 'Magazine sizes',
  );
  assert.ok(section);
  const first = section.querySelector('tbody input');
  first.value = '1.5';
  change(first);
  assert.equal(first.getAttribute('aria-invalid'), 'true');
  first.value = '-12';
  change(first);
  assert.equal(first.hasAttribute('aria-invalid'), false);
  assert.match($('document-status').textContent, /Unsaved/);
  section.querySelector('[aria-label="Duplicate row 1"]').click();
  assert.equal(section.querySelectorAll('tbody tr').length, 6);
  $('undo').click();
  assert.equal(w.document.querySelectorAll('.editor-section')[1]?.tagName, 'SECTION');
  const json = JSON.stringify({
    type: 'Struct',
    struct_ype: 'basic',
    name: 'Settings',
    value: [
      {
        key: 'Items',
        param_type: 'StringList',
        value: { param_type: 'StringList', value: ['A', 'B'] },
      },
    ],
  });
  await open({ name: 'Settings.json', size: json.length, text: async () => json });
  assert.equal($('file-tabs').children.length, 2);
  assert.match($('inspector').textContent, /Settings/);
  await open({ name: 'broken.gia', size: 24, arrayBuffer: async () => new Uint8Array(24).buffer });
  assert.match($('status-message').textContent, /Could not open/);
  assert.equal($('file-tabs').children.length, 2);
  $('file-tabs').querySelector('button').click();
  assert.match($('inspector').textContent, /Magazine sizes/);
  assert.equal($('export').disabled, false);
  dom.window.close();
});
