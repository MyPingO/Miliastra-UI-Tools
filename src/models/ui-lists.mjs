import * as W from '../../assets/game-wire.mjs';
import { uiLists, editUIRow, writeUIRows } from '../../assets/game-document.mjs';
const seg = (f) => [f.number, f.occurrence];
function walk(bytes, callback, path = [], depth = 0) {
  if (depth > 18) return;
  let fields;
  try {
    fields = W.parse(bytes);
  } catch {
    return;
  }
  callback(bytes, fields, path);
  for (const f of fields) if (f.wire === 2) walk(f.value, callback, [...path, seg(f)], depth + 1);
}
export function formalNames(doc, record) {
  const names = new Map(),
    config = formalConfig(doc, record);
  if (config)
    for (const f of W.all(config.raw, 501, 2))
      try {
        names.set(String(W.integer(f.value, 503)), W.text(f.value, 502));
      } catch {}
  return names;
}
export function formalConfig(doc, record) {
  const seen = new Set();
  let current = record;
  while (current && !seen.has(current.key)) {
    seen.add(current.key);
    let found = null;
    walk(doc.bytes(current), (bytes, fields, path) => {
      const f = fields.find((f) => f.number === 34 && f.wire === 2);
      if (f && [501, 502, 503, 504].every((n) => fields.some((f) => f.number === n)))
        found = { record: current, path: [...path, seg(f)], raw: f.value };
    });
    if (found) return found;
    current = doc.records.find((r) => r.kind === 'ui' && r.id === current.parentId);
  }
  // Some exported floating pages omit the container's parent link. A single
  // definition in the entire GIA is unambiguous; never guess across GIL pages.
  if (doc.container.type === 3) {
    const configs = [];
    for (const candidate of doc.records.filter((r) => r.kind === 'ui'))
      walk(doc.bytes(candidate), (bytes, fields, path) => {
        const f = fields.find((f) => f.number === 34 && f.wire === 2);
        if (f && [501, 502, 503, 504].every((n) => fields.some((f) => f.number === n)))
          configs.push({ record: candidate, path: [...path, seg(f)], raw: f.value });
      });
    if (configs.length === 1) return configs[0];
  }
  return null;
}
export function addFormalColumn(doc, record, name, type) {
  if (!name.trim()) throw new Error('Enter a field name.');
  const types = { Int32: 0, Float: 1, String: 2 },
    typeEnum = types[type];
  if (typeEnum === undefined) throw new Error('Unsupported Formal Variable type.');
  const config = formalConfig(doc, record);
  if (!config) throw new Error('No associated Formal Variable definition found.');
  const definitions = W.all(config.raw, 501, 2);
  if (definitions.some((f) => W.text(f.value, 502) === name))
    throw new Error('A field with this name already exists.');
  const id = Math.max(0, ...definitions.map((f) => Number(W.integer(f.value, 503)))) + 1;
  if (id > 10000) throw new Error('Too many Formal Variables.');
  const definition = W.concat([
    W.field(501, 0, typeEnum),
    W.field(502, 2, W.utf8(name)),
    W.field(503, 0, id),
  ]);
  const pending = new Map([
    [
      config.record,
      W.patch(
        doc.bytes(config.record),
        config.path,
        W.concat([config.raw, W.field(501, 2, definition)]),
      ),
    ],
  ]);
  const code = typeEnum + 1,
    defaultValue =
      typeEnum === 2
        ? W.field(501, 2, W.EMPTY)
        : typeEnum === 1
          ? W.field(501, 5, W.floatBytes(0))
          : W.field(501, 0, 0);
  const pair = W.field(
    501,
    2,
    W.concat([
      W.field(501, 0, id),
      W.field(502, 2, W.concat([W.field(501, 0, code), W.field(code + 10, 2, defaultValue)])),
    ]),
  );
  for (const target of doc.records.filter((r) => r.kind === 'ui')) {
    const owner = formalConfig(doc, target);
    if (
      !owner ||
      owner.record.key !== config.record.key ||
      JSON.stringify(owner.path) !== JSON.stringify(config.path)
    )
      continue;
    let bytes = pending.get(target) || doc.bytes(target);
    for (const list of uiLists(bytes)) {
      const rows = list.rows.map((row) =>
        W.set(row.raw, 502, 2, W.concat([W.message(row.raw, 502), pair])),
      );
      bytes = W.patch(bytes, list.path, writeUIRows(list, rows));
    }
    if (!W.same(bytes, doc.bytes(target))) pending.set(target, bytes);
  }
  doc.changeMany(pending, 'Add Formal Variable ' + name);
}
function deckLists(bytes) {
  const result = [];
  walk(bytes, (raw, fields, path) => {
    const container = fields.find((f) => f.number === 504 && f.wire === 2),
      indexes = fields.filter((f) => f.number === 503 && f.wire === 2);
    if (!container || !indexes.length) return;
    try {
      const entries = W.all(container.value, 1, 2);
      if (!entries.length) return;
      const rows = entries
        .map((f) => {
          const id = W.one(f.value, 1, 0);
          if (!id || !W.one(f.value, 3, 0)) throw new Error('Not a deck row.');
          for (const n of [4, 8, 9]) if (!W.one(f.value, n, 2)) throw new Error('Not a deck row.');
          return {
            raw: f.value,
            id: Number(id.value),
            values: {
              title: W.text(W.message(f.value, 8), 501),
              description: W.text(W.message(f.value, 4), 501),
              tag: W.text(W.message(f.value, 9), 501),
              icon: String(W.integer(f.value, 3)),
              deckType: !!W.integer(f.value, 2),
              tagCode: String(W.integer(f.value, 6)),
            },
          };
        })
        .sort((a, b) => a.id - b.id);
      if (indexes.length !== rows.length) return;
      for (const index of indexes) if (!W.one(index.value, 503, 0)) return;
      result.push({ kind: 'deck', path, raw, rows, container: container.value, indexes });
    } catch {}
  });
  return result;
}
export function componentLists(doc, record) {
  const bytes = doc.bytes(record),
    names = formalNames(doc, record);
  const standard = uiLists(bytes).map((list, i) => ({
    ...list,
    kind: 'choice',
    label: 'List items',
    key: JSON.stringify(list.path),
    columns: [
      { id: 'name', label: 'Name', type: 'String' },
      ...[...new Set(list.rows.flatMap((r) => r.fields.map((f) => f.id)))].map((id) => {
        const sample = list.rows.flatMap((r) => r.fields).find((f) => f.id === id);
        return {
          id,
          label: names.get(id) || `Formal ${id}`,
          type: sample.type === 1 ? 'Int32' : sample.type === 2 ? 'Float' : 'String',
        };
      }),
    ],
    rows: list.rows.map((row) => ({
      ...row,
      values: { name: row.name, ...Object.fromEntries(row.fields.map((f) => [f.id, f.value])) },
    })),
  }));
  const decks = deckLists(bytes).map((list) => ({
    ...list,
    key: JSON.stringify(list.path),
    label: 'Deck selector',
    columns: [
      { id: 'title', label: 'Title', type: 'String' },
      { id: 'description', label: 'Description', type: 'String' },
      { id: 'tag', label: 'Tag', type: 'String' },
      { id: 'icon', label: 'Icon ID', type: 'ConfigReference', preserveOnAdd: true },
      { id: 'deckType', label: 'Alternate deck', type: 'Bool', preserveOnAdd: true },
      { id: 'tagCode', label: 'Tag code', type: 'ConfigReference', preserveOnAdd: true },
    ],
  }));
  return [...standard, ...decks];
}
export function updateRow(list, row, values) {
  if (list.kind === 'choice')
    return editUIRow(
      row,
      values.name ?? row.name,
      Object.fromEntries(Object.entries(values).filter(([k]) => k !== 'name')),
    );
  let bytes = row.raw;
  for (const [key, n] of [
    ['title', 8],
    ['description', 4],
    ['tag', 9],
  ])
    if (key in values)
      bytes = W.set(bytes, n, 2, W.set(W.message(bytes, n), 501, 2, W.utf8(values[key])));
  for (const [key, n] of [
    ['icon', 3],
    ['tagCode', 6],
  ])
    if (key in values) {
      if (!/^\d+$/.test(String(values[key])) || BigInt(values[key]) > 0xffffffffn)
        throw new Error('ID must be an unsigned 32-bit integer.');
      bytes = W.set(bytes, n, 0, BigInt(values[key]));
    }
  if ('deckType' in values) bytes = W.set(bytes, 2, 0, values.deckType ? 1 : 0);
  return bytes;
}
export function saveRows(doc, record, list, rows) {
  if (rows.length < 1 || rows.length > 10000)
    throw new Error('Keep between 1 and 10,000 component rows.');
  let next;
  if (list.kind === 'choice') next = writeUIRows(list, rows);
  else {
    const data = W.replaceRepeated(
      list.container,
      1,
      rows.map((r, i) => W.field(1, 2, W.set(r, 1, 0, i + 1))),
    );
    next = W.set(list.raw, 504, 2, data);
    next = W.replaceRepeated(
      next,
      503,
      rows.map((_, i) =>
        W.field(
          503,
          2,
          W.set(list.indexes[Math.min(i, list.indexes.length - 1)].value, 503, 0, i + 1),
        ),
      ),
    );
  }
  doc.change(record, W.patch(doc.bytes(record), list.path, next), 'Edit ' + list.label);
}
