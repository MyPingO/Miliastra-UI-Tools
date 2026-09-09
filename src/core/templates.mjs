import * as W from '../../assets/game-wire.mjs';
import { BinarySession } from '../models/binary.mjs';
import { JsonSession } from '../models/json.mjs';
export const TEMPLATES = [
  { id: 'deck', name: 'Deck selector', detail: 'Titles, descriptions, icons, and tags' },
  { id: 'single', name: 'Single choice window', detail: 'List rows and Formal Variable values' },
  { id: 'tab', name: 'Tabs', detail: 'Tab rows and control properties' },
  { id: 'structure-json', name: 'Structure JSON', detail: 'Typed fields, lists, and nested data' },
  { id: 'dictionary-json', name: 'Variable JSON', detail: 'Typed dictionary entries' },
];
export async function createTemplate(id) {
  if (id === 'structure-json')
    return new JsonSession(
      'New Structure.json',
      JSON.stringify({ type: 'Struct', struct_ype: 'basic', name: 'New Structure', value: [] }),
    );
  if (id === 'dictionary-json')
    return new JsonSession(
      'New Variable.json',
      JSON.stringify({ type: 'Dict', key_type: 'String', value_type: 'String', value: [] }),
    );
  if (!TEMPLATES.some((t) => t.id === id)) throw new Error('Unknown template.');
  const response = await fetch(new URL(`../../assets/templates/${id}.json`, import.meta.url));
  if (!response.ok) throw new Error('Could not load the component template.');
  const data = await response.json(),
    bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
  const source = new BinarySession(
    'New ' + TEMPLATES.find((t) => t.id === id).name + '.gia',
    bytes,
  );
  // Replace only the known UI object IDs and their serialized references.
  const ids = new Map(),
    used = new Set(source.records.map((r) => r.id));
  for (const record of source.records.filter((r) => r.kind === 'ui')) {
    let candidate;
    do {
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      candidate = String(0x40000000 + (random[0] & 0xfffff));
    } while (used.has(candidate));
    used.add(candidate);
    ids.set(BigInt(record.id), BigInt(candidate));
  }
  const rewrite = (bytes, depth = 0) => {
    if (depth > 24) return bytes;
    let fields;
    try {
      fields = W.parse(bytes);
    } catch {
      return bytes;
    }
    return W.concat(
      fields.map((f) => {
        if (f.wire === 0 && ids.has(f.value)) return W.field(f.number, 0, ids.get(f.value));
        if (f.wire !== 2) return f.raw;
        if (f.number === 503) {
          try {
            const values = [];
            for (let p = 0; p < f.value.length; ) {
              const v = W.readVarint(f.value, p);
              values.push(v.value);
              p = v.offset;
            }
            if (values.length && values.every((v) => ids.has(v)))
              return W.field(f.number, 2, W.concat(values.map((v) => W.varint(ids.get(v)))));
          } catch {}
        }
        const next = rewrite(f.value, depth + 1);
        return W.same(next, f.value) ? f.raw : W.field(f.number, 2, next);
      }),
    );
  };
  const session = new BinarySession(source.name, W.pack(rewrite(source.doc.payload), 3));
  session.newFile = true;
  return session;
}
