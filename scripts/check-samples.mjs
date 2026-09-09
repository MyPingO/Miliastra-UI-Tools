import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as W from '../assets/game-wire.mjs';
import { BinarySession } from '../src/models/binary.mjs';
import { JsonSession } from '../src/models/json.mjs';
import { properties, writeProperty } from '../assets/game-properties.mjs';
const folder = process.argv[2];
if (!folder)
  throw new Error('Pass the folder containing the supplied Structure and Explainer samples.');
for (const name of [
  'Test Structure.gia',
  'Explainer.gia',
  'Explaine (Added a empty text bubble).gia',
]) {
  const original = new Uint8Array(fs.readFileSync(path.join(folder, name))),
    session = new BinarySession(name, original);
  assert.deepEqual(session.export(), original);
  let edits = 0,
    bubbles = 0;
  const visit = (node) => {
    if (node.editable && node.kind === 'scalar') {
      const value =
        node.type === 'String'
          ? String(node.value) + ' test'
          : node.type === 'Bool'
            ? !node.value
            : node.type === 'Vector3'
              ? [1, 2, 3]
              : node.type === 'Float'
                ? 1.25
                : node.type === 'Int32'
                  ? -9
                  : '123';
      node.set(value);
      edits++;
    } else if (node.editable && node.kind === 'list') {
      const v =
        node.element === 'String'
          ? 'test'
          : node.element === 'Bool'
            ? true
            : node.element === 'Int32'
              ? 9
              : '123';
      node.set([...node.value, v]);
      edits++;
    }
    for (const c of node.children || []) visit(c);
    for (const entry of node.entries || []) visit(entry.value);
  };
  for (const record of session.records) {
    session.nodes(record).forEach(visit);
    for (const item of properties(record, session.doc.bytes(record)).filter(
      (p) => p.group.startsWith('Text bubble') && p.label.startsWith('Text '),
    )) {
      session.doc.change(
        record,
        writeProperty(session.doc.bytes(record), item, 'Round-trip sample test'),
        'Edit bubble',
      );
      bubbles++;
    }
  }
  const out = new BinarySession('edited.gia', session.export());
  for (const record of session.records) {
    const reopened = out.records.find((r) => r.key === record.key);
    assert.deepEqual(out.doc.bytes(reopened), session.doc.bytes(record));
    out.nodes(reopened);
  }
  for (const record of out.records)
    for (const item of properties(record, out.doc.bytes(record)).filter(
      (p) => p.group.startsWith('Text bubble') && p.label.startsWith('Text '),
    ))
      assert.equal(item.value, 'Round-trip sample test');
  if (name.startsWith('Test')) assert.ok(edits > 40);
  else {
    assert.ok(bubbles >= 5);
    assert.ok(out.records.some((r) => r.kind === 'scene' && r.variables.length));
  }
  console.log(
    JSON.stringify({
      file: name,
      records: session.records.length,
      valueEdits: edits,
      textBubbleEdits: bubbles,
      noOpExact: true,
      roundTrip: true,
    }),
  );
}
const jsonName = 'Test Structure.json',
  text = fs.readFileSync(path.join(folder, jsonName), 'utf8'),
  json = new JsonSession(jsonName, text);
assert.equal(json.export(), text);
json.validate();
const root = json.nodes()[0];
assert.equal(root.children.length, 7);
root.children[1].set([-1, 0, 2147483647]);
assert.deepEqual(
  new JsonSession('copy.json', json.export()).nodes()[0].children[1].value,
  [-1, 0, 2147483647],
);
console.log(
  JSON.stringify({
    file: jsonName,
    fields: root.children.length,
    noOpExact: true,
    roundTrip: true,
  }),
);
