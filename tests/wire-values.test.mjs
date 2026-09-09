import test from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../assets/game-wire.mjs';
import { readValue, writeValue } from '../assets/game-values.mjs';
import { GameDocument, uiLists, editUIRow, writeUIRows } from '../assets/game-document.mjs';
import { demoFile } from './fixtures/game.mjs';
const typed = (type, payload) =>
  W.concat([
    W.field(1, 0, type),
    W.field(type + 10, 2, payload),
    W.field(500, 2, W.utf8('unknown metadata')),
  ]);
test('GIL and GIA envelopes reject corrupt lengths, magic, truncation, and kinds', () => {
  for (const type of [2, 3]) {
    const bytes = W.pack(W.field(49, 2, W.utf8('opaque')), type);
    assert.equal(W.unpack(bytes).type, type);
    assert.equal(W.unpack(bytes).length, bytes.length - 24);
  }
  for (const index of [0, 8, 12, 16, 23]) {
    const bytes = W.pack(W.EMPTY);
    bytes[index] ^= 1;
    assert.throws(() => W.unpack(bytes));
  }
  assert.throws(() => W.unpack(new Uint8Array(23)));
  assert.throws(() => W.parse(Uint8Array.of(10, 10, 1)));
  assert.throws(() => W.parse(Uint8Array.of(13, 0)));
  assert.throws(() => W.parse(Uint8Array.of(0)));
  assert.throws(() => W.readVarint(new Uint8Array(11).fill(255)));
  assert.throws(() => W.parse(Uint8Array.of(11)));
});
test('uint64 IDs are lossless and singular ambiguity is rejected', () => {
  const value = 18446744073709551615n;
  assert.equal(W.readVarint(W.varint(value)).value, value);
  assert.throws(() => W.varint(value + 1n));
  assert.throws(() => W.varint(-1));
  assert.throws(() => W.set(W.concat([W.field(1, 0, 1), W.field(1, 0, 2)]), 1, 0, 3));
});
test('nested patch preserves unknown fields and repeated occurrences', () => {
  const inner = W.concat([W.field(3, 2, W.utf8('keep')), W.field(5, 2, W.utf8('edit'))]);
  const original = W.concat([
    W.field(2, 2, inner),
    W.field(49, 2, Uint8Array.of(255, 0, 33)),
    W.field(2, 2, inner),
  ]);
  const edited = W.patch(
    original,
    [
      [2, 1],
      [5, 0],
    ],
    W.utf8('a longer replacement'),
  );
  assert.deepEqual(W.all(edited, 2)[0].raw, W.all(original, 2)[0].raw);
  assert.deepEqual(W.one(edited, 49).raw, W.one(original, 49).raw);
  assert.equal(
    W.string(
      W.at(edited, [
        [2, 1],
        [5, 0],
      ]),
    ),
    'a longer replacement',
  );
});
test('packed and unpacked signed Int32, bool, float, and Unicode string lists', () => {
  const original = typed(
    8,
    W.concat([
      W.field(1, 0, 7),
      W.field(99, 2, W.utf8('keep')),
      W.field(1, 2, W.concat([W.varint(BigInt.asUintN(64, -2n)), W.varint(0)])),
    ]),
  );
  assert.deepEqual(readValue(original).value, [7, -2, 0]);
  const out = writeValue(readValue(original), [-2147483648, -1, 0, 2147483647]);
  assert.deepEqual(readValue(out).value, [-2147483648, -1, 0, 2147483647]);
  assert.deepEqual(W.one(out, 500).raw, W.one(original, 500).raw);
  assert.deepEqual(W.one(W.message(out, 18), 99).raw, W.one(W.message(original, 18), 99).raw);
  for (const [type, values] of [
    [9, [true, false, true]],
    [10, [1.5, -2.25, 0]],
    [11, ['', 'Cryo ❄', 'a\nb', '你好']],
  ]) {
    const model = readValue(typed(type, W.EMPTY));
    assert.deepEqual(readValue(writeValue(model, values)).value, values);
    assert.deepEqual(readValue(writeValue(model, [])).value, []);
  }
});
test('scalar validation rejects coercions and does not wrap overflowing values', () => {
  const i = readValue(typed(3, W.EMPTY));
  for (const v of [2147483648, -2147483649, 1.5, NaN, '42']) assert.throws(() => writeValue(i, v));
  assert.equal(readValue(writeValue(i, -1)).value, -1);
  const f = readValue(typed(5, W.EMPTY));
  for (const v of [Infinity, NaN, 1e100]) assert.throws(() => writeValue(f, v));
  assert.throws(() => writeValue(readValue(typed(9, W.EMPTY)), [1]));
  assert.throws(() => writeValue(readValue(typed(11, W.EMPTY)), ['ok', 3]));
  assert.throws(() => writeValue(readValue(typed(8, W.EMPTY)), new Array(10001).fill(1)));
});
test('ID edits preserve reference metadata and dictionaries require the mirror-aware API', () => {
  const id = readValue(
    typed(20, W.field(1, 2, W.concat([W.field(1, 0, 1), W.field(2, 0, 1077936134)]))),
  );
  assert.equal(id.value, '1077936134');
  const changed = readValue(writeValue(id, '1'));
  assert.equal(changed.value, '1');
  assert.equal(W.integer(W.message(changed.payload, 1), 1), 1n);
  const dict = readValue(typed(27, W.EMPTY));
  assert.equal(dict.editable, true);
  assert.throws(() => writeValue(dict, []));
});
test('object edits, multiple object patches, undo/redo, and unedited export', () => {
  const original = demoFile(),
    doc = new GameDocument('example.gil', original),
    record = doc.records.find((r) => r.kind === 'scene');
  assert.deepEqual(doc.export(), original);
  const variable = doc.variables(record).find((v) => v.name === 'Magazine sizes');
  doc.editValue(record, variable.path, [], [31, -2, 4], 'Edit ammo');
  const edited = doc.export(),
    reopened = new GameDocument('edited.gil', edited);
  assert.deepEqual(
    reopened
      .variables(reopened.records.find((r) => r.id === record.id))
      .find((v) => v.name === 'Magazine sizes').model.value,
    [31, -2, 4],
  );
  for (const n of [2, 4, 49])
    assert.deepEqual(
      W.one(W.unpack(edited).payload, n).raw,
      W.one(W.unpack(original).payload, n).raw,
    );
  const prefab = doc.records.find((r) => r.kind === 'prefab');
  doc.editValue(prefab, doc.variables(prefab)[0].path, [], ['new', 'rows'], 'Edit prefab');
  assert.equal(new GameDocument('again.gil', doc.export()).records.length, 2);
  doc.undo();
  assert.deepEqual(doc.export(), edited);
  doc.redo();
  assert.equal(doc.changes.size, 2);
  doc.undo();
  doc.undo();
  assert.deepEqual(doc.export(), original);
  doc.redo();
  assert.deepEqual(doc.export(), edited);
});
test('unknown container versions allow inspection and exact export but reject edits', () => {
  const source = demoFile(),
    container = W.unpack(source),
    doc = new GameDocument('future.gil', W.pack(container.payload, 2, 99)),
    r = doc.records[0];
  assert.equal(doc.container.version, 99);
  assert.deepEqual(doc.export(), doc.container.original);
  assert.throws(() => doc.editValue(r, doc.variables(r)[0].path, [], ['no'], 'future'));
});
const uiRow = (name, order) =>
  W.concat([
    W.field(501, 2, W.field(501, 2, W.utf8(name))),
    W.field(502, 2, W.EMPTY),
    W.field(505, 0, order),
    W.field(600, 2, W.utf8('unknown row metadata')),
  ]);
test('UI list edits keep unknown row and container metadata, and normalize row order', () => {
  const rows = [uiRow('Second', 2), uiRow('First', 1)],
    list = W.concat([
      ...rows.map((r) => W.field(501, 2, r)),
      W.field(502, 0, 1),
      W.field(599, 2, W.utf8('untouched')),
    ]);
  const record = W.field(
    505,
    2,
    W.concat([W.field(502, 0, 47), W.field(503, 2, W.field(40, 2, list))]),
  );
  const model = uiLists(record)[0];
  assert.deepEqual(
    model.rows.map((r) => r.name),
    ['First', 'Second'],
  );
  const editedRow = editUIRow(model.rows[0], 'New first', {});
  assert.deepEqual(W.one(editedRow, 600).raw, W.one(model.rows[0].raw, 600).raw);
  const next = writeUIRows(model, [editedRow, model.rows[1].raw, editedRow]);
  assert.deepEqual(W.one(next, 599).raw, W.one(list, 599).raw);
  const reparsed = uiLists(W.patch(record, model.path, next))[0];
  assert.deepEqual(
    reparsed.rows.map((r) => r.name),
    ['New first', 'Second', 'New first'],
  );
  assert.deepEqual(
    reparsed.rows.map((r) => r.order),
    [1, 2, 3],
  );
  assert.throws(() => writeUIRows(model, []));
});
