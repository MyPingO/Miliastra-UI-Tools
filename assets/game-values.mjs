import * as W from './game-wire.mjs';
export const TYPES = {
  1: 'Entity',
  2: 'GUID',
  3: 'Integer',
  4: 'Boolean',
  5: 'Float',
  6: 'String',
  7: 'GUID list',
  8: 'Integer list',
  9: 'Boolean list',
  10: 'Float list',
  11: 'String list',
  12: 'Vector3',
  13: 'Entity list',
  15: 'Vector3 list',
  17: 'Faction',
  20: 'Configuration ID',
  21: 'Prefab ID',
  22: 'Configuration ID list',
  23: 'Prefab ID list',
  24: 'Faction list',
  25: 'Structure',
  26: 'Structure list',
  27: 'Dictionary',
};
export const LISTS = new Set([7, 8, 9, 10, 11, 13, 15, 22, 23, 24, 26]);
const SIMPLE_LISTS = new Map([
  [7, 2],
  [8, 3],
  [9, 4],
  [10, 5],
  [11, 6],
  [13, 1],
  [22, 20],
  [23, 21],
  [24, 17],
]);
const IDS = new Set([1, 2, 17, 20, 21]);
function singularPayload(bytes, type) {
  const f = W.one(bytes, type + 10, 2);
  if (!f) throw new Error('No recognized value payload; preserved as read-only.');
  return f.value;
}
export function readValue(bytes, depth = 0) {
  if (depth > 24) throw new Error('Value nesting exceeds 24 levels.');
  const type = Number(W.integer(bytes, 1)),
    payload = singularPayload(bytes, type);
  const model = { type, name: W.text(bytes, 501), raw: bytes, payload, editable: false };
  if ([3, 4, 5, 6].includes(type)) {
    const wire = type === 5 ? 5 : type === 6 ? 2 : 0;
    const f = W.one(payload, 1);
    if (f && f.wire !== wire) throw new Error('Unrecognized scalar encoding.');
    model.value =
      type === 6
        ? f
          ? W.string(f.value)
          : ''
        : type === 5
          ? f
            ? W.float(f.value)
            : 0
          : type === 4
            ? !!f?.value
            : Number(BigInt.asIntN(32, f?.value || 0n));
    model.editable = true;
  } else if (SIMPLE_LISTS.has(type)) {
    const element = SIMPLE_LISTS.get(type),
      values = [];
    for (const f of W.all(payload, 1)) {
      if (element === 6 && f.wire === 2) values.push(W.string(f.value));
      else if (element === 5 && f.wire === 5) values.push(W.float(f.value));
      else if (element === 5 && f.wire === 2) {
        if (f.value.length % 4) throw new Error('Invalid packed float list.');
        for (let i = 0; i < f.value.length; i += 4)
          values.push(W.float(f.value.subarray(i, i + 4)));
      } else if ([20, 21].includes(element) && f.wire === 2) {
        values.push(String(W.integer(f.value, 2)));
      } else if ([1, 2, 3, 4, 17].includes(element) && [0, 2].includes(f.wire)) {
        const entries = [];
        if (f.wire === 0) entries.push(f.value);
        else
          for (let p = 0; p < f.value.length; ) {
            const v = W.readVarint(f.value, p);
            p = v.offset;
            entries.push(v.value);
          }
        values.push(
          ...entries.map((v) =>
            element === 4 ? !!v : element === 3 ? Number(BigInt.asIntN(32, v)) : String(v),
          ),
        );
      } else throw new Error('Unrecognized list encoding.');
    }
    model.value = values;
    model.element = element;
    model.editable = true;
  } else if (type === 25 || type === 26) {
    model.children = W.all(payload, 1, 2).map((f) => readValue(f.value, depth + 1));
    model.structId = String(W.integer(payload, 501));
    model.editable = model.children.some((c) => c.editable);
  } else if (type === 27) {
    // Dictionaries contain BOTH serialized entry structures and key/value mirrors.
    // Edits require byte-identical mirrors; keep pair identities unchanged.
    model.keys = W.all(payload, 501, 2).map((f) => readValue(f.value, depth + 1));
    model.values = W.all(payload, 502, 2).map((f) => readValue(f.value, depth + 1));
    model.keyType = Number(W.integer(payload, 503));
    model.valueType = Number(W.integer(payload, 504));
    model.pairs = W.all(payload, 1, 2).map((f) => f.value);
    model.editable =
      model.keys.length === model.values.length &&
      model.pairs.length === model.keys.length &&
      model.pairs.every((p, i) => {
        const children = W.all(W.message(p, 35), 1, 2);
        return (
          children.length === 2 &&
          W.same(children[0].value, model.keys[i].raw) &&
          W.same(children[1].value, model.values[i].raw)
        );
      });
  } else if (type === 12) {
    const vector = W.message(payload, 1);
    model.value = [1, 2, 3].map((n) => {
      const f = W.one(vector, n, 5);
      return f ? W.float(f.value) : 0;
    });
    model.editable = true;
  } else if (IDS.has(type)) {
    const f = W.one(payload, 1);
    model.value = !f
      ? '0'
      : f.wire === 0
        ? String(f.value)
        : f.wire === 2
          ? String(W.integer(f.value, 2))
          : '(unrecognized reference)';
    model.editable = !f || ([20, 21].includes(type) ? f.wire === 2 : f.wire === 0);
  } else {
    model.value = '(preserved)';
  }
  return model;
}
function checkedScalar(type, value) {
  if (IDS.has(type)) {
    if (typeof value === 'number' && !Number.isSafeInteger(value))
      throw new Error('Large IDs must be decimal strings to preserve precision.');
    if (!/^\d+$/.test(String(value)) || BigInt(value) > 0xffffffffffffffffn)
      throw new Error('Enter an unsigned 64-bit ID as decimal text.');
    return String(value);
  }
  if (type === 6) {
    if (typeof value !== 'string') throw new Error('Expected text.');
    return value;
  }
  if (type === 4) {
    if (typeof value !== 'boolean') throw new Error('Expected true or false.');
    return value;
  }
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('Expected a finite number.');
  if (type === 3 && (!Number.isInteger(value) || value < -2147483648 || value > 2147483647))
    throw new Error('Integer must be between −2147483648 and 2147483647.');
  if (type === 5) W.floatBytes(value);
  return value;
}
export function writeValue(model, value) {
  if (
    !model.editable ||
    ![1, 2, 3, 4, 5, 6, 12, 17, 20, 21, ...SIMPLE_LISTS.keys()].includes(model.type)
  )
    throw new Error('This value shape is read-only.');
  let payload = model.payload;
  if (SIMPLE_LISTS.has(model.type)) {
    if (!Array.isArray(value) || value.length > 10000)
      throw new Error('A list must contain at most 10,000 items.');
    const type = model.element,
      values = value.map((v) => checkedScalar(type, v));
    let fields;
    if (type === 6) fields = values.map((v) => W.field(1, 2, W.utf8(v)));
    else if ([20, 21].includes(type)) {
      const originals = W.all(payload, 1, 2);
      fields = values.map((v) => {
        const original =
          originals.find((f) => String(W.integer(f.value, 2)) === v)?.value || W.EMPTY;
        return W.field(1, 2, W.set(original, 2, 0, BigInt(v)));
      });
    } else {
      const packed = W.concat(
        values.map((v) =>
          type === 5
            ? W.floatBytes(v)
            : W.varint(type === 4 ? (v ? 1 : 0) : BigInt.asUintN(64, BigInt(v))),
        ),
      );
      fields = values.length ? [W.field(1, 2, packed)] : [];
    }
    payload = W.replaceRepeated(payload, 1, fields);
  } else if (model.type === 12) {
    if (!Array.isArray(value) || value.length !== 3)
      throw new Error('Enter three vector coordinates.');
    let vector = W.message(payload, 1);
    value.forEach((v, i) => {
      vector = W.set(vector, i + 1, 5, W.floatBytes(v));
    });
    payload = W.set(payload, 1, 2, vector);
  } else if (IDS.has(model.type)) {
    checkedScalar(model.type, value);
    payload = [20, 21].includes(model.type)
      ? W.set(payload, 1, 2, W.set(W.message(payload, 1), 2, 0, BigInt(value)))
      : W.set(payload, 1, 0, BigInt(value));
  } else {
    checkedScalar(model.type, value);
    const wire = model.type === 5 ? 5 : model.type === 6 ? 2 : 0;
    const encoded =
      model.type === 5
        ? W.floatBytes(value)
        : model.type === 6
          ? W.utf8(value)
          : model.type === 4
            ? value
              ? 1
              : 0
            : BigInt.asUintN(64, BigInt(value));
    payload = W.set(payload, 1, wire, encoded);
  }
  return W.set(model.raw, model.type + 10, 2, payload);
}
export function valueJSON(model) {
  if (model.children)
    return model.children.map((c) => ({
      name: c.name,
      type: TYPES[c.type] || c.type,
      value: valueJSON(c),
    }));
  if (model.keys)
    return model.keys.map((k, i) => ({
      key: valueJSON(k),
      value: model.values[i] ? valueJSON(model.values[i]) : null,
    }));
  return model.value;
}
export function flattenValues(model, path = [], label = model.name || '') {
  const result = [{ model, path, label }];
  if (model.children)
    model.children.forEach((child, i) =>
      result.push(
        ...flattenValues(
          child,
          [...path, [model.type + 10, 0], [1, i]],
          `${label} / ${child.name || `Item ${i + 1}`}`,
        ),
      ),
    );
  return result;
}

export function replaceChild(model, collection, index, replacement) {
  if (collection === 'children' && model.children) {
    const next = W.patch(model.payload, [[1, index]], replacement);
    return W.set(model.raw, model.type + 10, 2, next);
  }
  if (['keys', 'values'].includes(collection) && model.type === 27 && model.editable) {
    const revised = readValue(replacement),
      items = model[collection];
    if (revised.type !== items[index]?.type)
      throw new Error('Dictionary entry type cannot change.');
    if (
      collection === 'keys' &&
      model.keys.some((k, i) => i !== index && String(valueJSON(k)) === String(valueJSON(revised)))
    )
      throw new Error('Dictionary keys must be unique.');
    const number = collection === 'keys' ? 501 : 502,
      slot = collection === 'keys' ? 0 : 1;
    let payload = W.patch(model.payload, [[number, index]], replacement);
    const pair = W.patch(
      model.pairs[index],
      [
        [35, 0],
        [1, slot],
      ],
      replacement,
    );
    payload = W.patch(payload, [[1, index]], pair);
    return W.set(model.raw, 37, 2, payload);
  }
  throw new Error('This nested value shape is read-only.');
}
export function editNested(model, path, value) {
  if (!path.length) return writeValue(model, value);
  const [collection, index] = path[0],
    child = model[collection]?.[index];
  if (!child) throw new Error('Value path no longer exists.');
  return replaceChild(model, collection, index, editNested(child, path.slice(1), value));
}
