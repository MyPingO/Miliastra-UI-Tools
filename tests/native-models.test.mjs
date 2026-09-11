import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as W from '../assets/game-wire.mjs';
import { readValue, writeValue, editNested } from '../assets/game-values.mjs';
import { BinarySession } from '../src/models/binary.mjs';
import { JsonSession, scalar } from '../src/models/json.mjs';
import {
  componentLists,
  saveRows,
  updateRow,
  addFormalColumn,
  formalConfig,
} from '../src/models/ui-lists.mjs';
import { properties, writeProperty } from '../assets/game-properties.mjs';
import { readCSV, writeCSV } from '../src/core/csv.mjs';
const template = (kind) =>
  new BinarySession(
    kind + '.gia',
    new Uint8Array(
      Buffer.from(
        JSON.parse(fs.readFileSync(new URL(`../assets/templates/${kind}.json`, import.meta.url)))
          .base64,
        'base64',
      ),
    ),
  );
const typed = (type, payload) => W.concat([W.field(1, 0, type), W.field(type + 10, 2, payload)]);
test('native deck, choice and tab rows export edited data with intact surrounding records', () => {
  for (const kind of ['single', 'tab', 'deck']) {
    const session = template(kind),
      record = session.records.find((r) => componentLists(session.doc, r).length),
      list = componentLists(session.doc, record)[0];
    assert.equal(session.dirty, false);
    assert.deepEqual(session.export(), session.doc.container.original);
    const row = list.rows[0],
      key = list.kind === 'deck' ? 'title' : 'name';
    const next = updateRow(list, row, { ...row.values, [key]: '<text> Unicode 雪\nsecond line' });
    saveRows(session.doc, record, list, [next, next]);
    assert.equal(session.dirty, true);
    const reopened = new BinarySession('result.gia', session.export()),
      r = reopened.records.find((r) => r.id === record.id),
      result = componentLists(reopened.doc, r)[0];
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].values[key], '<text> Unicode 雪\nsecond line');
    for (const untouched of session.records.filter((r) => r !== record))
      assert.deepEqual(
        reopened.doc.bytes(reopened.records.find((r) => r.key === untouched.key)),
        untouched.original,
      );
    session.undo();
    assert.deepEqual(session.export(), session.doc.container.original);
    session.redo();
    assert.equal(componentLists(session.doc, record)[0].rows.length, 2);
    session.markSaved();
    assert.equal(session.dirty, false);
    session.undo();
    assert.equal(session.dirty, true);
  }
});
test('adding Formal Variables updates the page and rows as one undoable change', () => {
  for (const kind of ['single', 'tab']) {
    const session = template(kind),
      record = session.records.find((r) => componentLists(session.doc, r).length);
    assert.ok(formalConfig(session.doc, record));
    addFormalColumn(session.doc, record, 'Player name', 'String');
    let list = componentLists(session.doc, record)[0];
    assert.equal(list.columns[1].label, 'Player name');
    assert.equal(list.rows[0].values['1'], '');
    session.undo();
    assert.equal(componentLists(session.doc, record)[0].columns.length, 1);
    session.redo();
    assert.equal(componentLists(session.doc, record)[0].columns.length, 2);
    list = componentLists(session.doc, record)[0];
    saveRows(session.doc, record, list, [updateRow(list, list.rows[0], { 1: 'Player A' })]);
    const reopened = new BinarySession('new.gia', session.export());
    const read = componentLists(
      reopened.doc,
      reopened.records.find((r) => r.id === record.id),
    )[0];
    assert.equal(read.rows[0].values['1'], 'Player A');
  }
});
test('dictionary leaf edits update both serialized mirrors and retain instance metadata', () => {
  const key = typed(6, W.field(1, 2, W.utf8('Key'))),
    value = typed(8, W.field(1, 2, W.concat([W.varint(1), W.varint(2)])));
  const meta = W.field(4, 0, 1077936000),
    pair = typed(25, W.concat([W.field(1, 2, key), W.field(1, 2, value), W.field(502, 2, meta)]));
  const dict = typed(
    27,
    W.concat([
      W.field(1, 2, pair),
      W.field(501, 2, key),
      W.field(502, 2, value),
      W.field(503, 0, 6),
      W.field(504, 0, 8),
      W.field(777, 2, W.utf8('unknown')),
    ]),
  );
  const result = readValue(editNested(readValue(dict), [['values', 0]], [-1, 9, 15]));
  assert.equal(result.editable, true);
  assert.deepEqual(result.values[0].value, [-1, 9, 15]);
  assert.deepEqual(W.message(W.message(result.pairs[0], 35), 502), meta);
  assert.equal(W.text(result.payload, 777), 'unknown');
  const damaged = readValue(W.set(dict, 37, 2, W.replaceRepeated(readValue(dict).payload, 1, [])));
  assert.equal(damaged.editable, false);
  assert.throws(() => editNested(damaged, [['values', 0]], [7]));
});
test('JSON edits preserve wrappers, extra metadata, IDs and undo snapshots', () => {
  const object = {
    type: 'Struct',
    struct_ype: 'basic',
    name: 'Test',
    extra: 'preserve',
    value: [
      {
        key: 'Numbers',
        param_type: 'Int32List',
        value: { param_type: 'Int32List', value: ['1', '2'] },
      },
    ],
  };
  const text = '\uFEFF' + JSON.stringify(object, null, 3),
    session = new JsonSession('Test.json', text);
  assert.equal(session.export(), text);
  const list = session.nodes()[0].children[0];
  list.set([-1, 2147483647]);
  assert.deepEqual(session.root.value[0].value.value, ['-1', '2147483647']);
  assert.equal(session.root.extra, 'preserve');
  assert.throws(() => list.set([2147483648]));
  session.undo();
  assert.equal(session.export(), text);
  session.redo();
  assert.equal(session.nodes()[0].children[0].value[0], -1);
  session.nodes()[0].add('String', 'Text');
  assert.equal(session.root.value[1].key, 'Text');
  assert.throws(() => session.nodes()[0].add('String', 'Text'));
  const dictionary = new JsonSession(
    'variable.json',
    JSON.stringify({ type: 'Dict', key_type: 'String', value_type: 'String', value: [] }),
  );
  dictionary.nodes()[0].add();
  dictionary.nodes()[0].add();
  assert.equal(dictionary.nodes()[0].entries.length, 2);
  assert.throws(() => dictionary.nodes()[0].entries[1].key.set('Key 1'), /unique/);
  assert.doesNotThrow(() => dictionary.export());
});
test('property writes preserve wire types and support uint64 without precision loss', () => {
  const bytes = W.concat([
    W.field(1, 0, 9007199254740993n),
    W.field(2, 2, W.field(501, 2, W.utf8('Caption'))),
    W.field(3, 5, W.floatBytes(1.25)),
    W.field(77, 2, Uint8Array.of(0xff)),
  ]);
  const id = { path: [[1, 0]], kind: 'uint' };
  const changed = writeProperty(bytes, id, '18446744073709551615');
  assert.equal(W.integer(changed, 1), 0xffffffffffffffffn);
  assert.throws(() => writeProperty(bytes, id, '18446744073709551616'));
  const text = {
    path: [
      [2, 0],
      [501, 0],
    ],
    kind: 'text',
  };
  const result = writeProperty(bytes, text, 'Hello\nworld');
  assert.equal(W.text(W.message(result, 2), 501), 'Hello\nworld');
  assert.deepEqual(W.one(result, 77).raw, W.one(bytes, 77).raw);
});
test('CSV round-trips multiline cells, quotes, Unicode and empty rows', () => {
  const rows = [
    ['name', 'value'],
    ['雪, "text"', 'line 1\nline 2'],
    ['', ''],
  ];
  assert.deepEqual(readCSV(writeCSV(rows)), rows);
  assert.throws(() => readCSV('"open'));
  assert.throws(() => readCSV('"text"unexpected'));
});
test('bulk value validation rejects coercions and unsafe numeric IDs', () => {
  for (const value of [true, null, {}, [], '']) assert.throws(() => scalar('Int32', value));
  assert.throws(() => scalar('String', { text: 'unexpected' }));
  assert.throws(() => scalar('Guid', 9007199254740992));
  assert.equal(scalar('Guid', '18446744073709551615'), '18446744073709551615');
});
