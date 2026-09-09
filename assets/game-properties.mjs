import * as W from './game-wire.mjs';
const seg = (f) => [f.number, f.occurrence];
export const fieldPath = (path) => path.map(([n, i]) => `${n}[${i}]`).join(' / ');
function valueAt(bytes, path, kind, fallback) {
  const parent = W.at(bytes, path.slice(0, -1)),
    [n, i] = path.at(-1),
    f = W.parse(parent).find((f) => f.number === n && f.occurrence === i);
  if (!f) return fallback;
  const wire = { text: 2, float: 5, uint: 0, fixed32: 5, fixed64: 1 }[kind];
  if (f.wire !== wire) throw new Error('Unrecognized property encoding.');
  if (kind === 'text') return W.string(f.value);
  if (kind === 'float') return W.float(f.value);
  if (kind === 'fixed32')
    return String(new DataView(f.value.buffer, f.value.byteOffset, 4).getUint32(0, true));
  if (kind === 'fixed64')
    return String(new DataView(f.value.buffer, f.value.byteOffset, 8).getBigUint64(0, true));
  return String(f.value);
}
export function writeProperty(bytes, item, value) {
  const parentPath = item.path.slice(0, -1),
    parent = W.at(bytes, parentPath),
    [n, i] = item.path.at(-1),
    f = W.parse(parent).find((f) => f.number === n && f.occurrence === i);
  const wire = { text: 2, float: 5, uint: 0, fixed32: 5, fixed64: 1 }[item.kind];
  if (f && f.wire !== wire) throw new Error('Property encoding changed. Reopen this property.');
  if (!f && (!item.allowMissing || i !== 0)) throw new Error('Stored field no longer exists.');
  let encoded;
  if (item.kind === 'text') {
    if (typeof value !== 'string') throw new Error('Enter text.');
    encoded = W.utf8(value);
  } else if (item.kind === 'float') {
    if (!['number', 'string'].includes(typeof value) || String(value).trim() === '')
      throw new Error('Enter a finite number.');
    encoded = W.floatBytes(value);
  } else {
    if (!/^\d+$/.test(String(value))) throw new Error('Enter a whole unsigned decimal number.');
    const number = BigInt(value),
      max = item.kind === 'fixed32' ? 0xffffffffn : 0xffffffffffffffffn;
    if (number > max) throw new Error(`Value exceeds ${max}.`);
    if (item.kind === 'uint') encoded = number;
    else {
      encoded = new Uint8Array(item.kind === 'fixed32' ? 4 : 8);
      const view = new DataView(encoded.buffer);
      if (item.kind === 'fixed32') view.setUint32(0, Number(number), true);
      else view.setBigUint64(0, number, true);
    }
  }
  if (item.min !== undefined && Number(value) < item.min)
    throw new Error(`Value must be at least ${item.min}.`);
  if (item.max !== undefined && Number(value) > item.max)
    throw new Error(`Value must be at most ${item.max}.`);
  const replacement = W.field(n, wire, encoded);
  const next = f
    ? W.concat([parent.subarray(0, f.start), replacement, parent.subarray(f.end)])
    : W.concat([parent, replacement]);
  return W.patch(bytes, parentPath, next);
}
// Explicit paths are backed by the local schema and exported reference files.
export function properties(record, bytes) {
  const result = [];
  const add = (group, label, path, kind = 'text', fallback = '', limits = {}) => {
    try {
      result.push({
        group,
        label,
        path,
        kind,
        value: valueAt(bytes, path, kind, fallback),
        allowMissing: true,
        ...limits,
      });
    } catch {
      /* Other encodings stay in Advanced fields. */
    }
  };
  if (record.kind === 'ui') {
    for (const p of W.all(bytes, 505, 2)) {
      const type = Number(W.integer(p.value, 502)),
        path = [seg(p)];
      if (type === 15) add('Control', 'Name', [...path, [12, 0], [501, 0]]);
      if (type === 25) {
        const base = [...path, [503, 0], [19, 0]];
        add('Text', 'Font size', [...base, [502, 0]], 'uint', '0', { min: 1, max: 1000 });
        add('Text', 'Text', [...base, [505, 0], [501, 0]]);
      }
      if ([11, 12].includes(type)) {
        const transform = W.message(W.message(p.value, 503), 13),
          multi = W.one(transform, 12, 2);
        if (!multi) continue;
        for (const platform of W.all(multi.value, 501, 2)) {
          const group =
            ['Keyboard', 'Touchscreen', 'Console controller', 'Mobile controller'][
              Number(W.integer(platform.value, 501))
            ] || 'Platform';
          const base = [...path, [503, 0], [13, 0], [12, 0], seg(platform), [502, 0]];
          for (const [n, label] of [
            [502, 'Anchor min'],
            [503, 'Anchor max'],
            [504, 'Offset'],
            [505, 'Size'],
            [506, 'Pivot'],
          ])
            for (const [axis, suffix] of [
              [501, 'X'],
              [502, 'Y'],
            ])
              add(group, `${label} ${suffix}`, [...base, [n, 0], [axis, 0]], 'float', 0);
        }
      }
    }
  } else if (['scene', 'prefab', 'decoration'].includes(record.kind)) {
    const field = record.kind === 'scene' ? 5 : record.kind === 'prefab' ? 6 : 4;
    for (const p of W.all(bytes, field, 2))
      if (W.integer(p.value, 1) === 1n) add('Object', 'Name', [seg(p), [11, 0], [1, 0]]);
    if (record.kind !== 'decoration') {
      for (const p of W.all(bytes, record.kind === 'scene' ? 6 : 7, 2))
        if (W.integer(p.value, 1) === 1n) {
          for (const [n, label] of [
            [1, 'Position'],
            [2, 'Rotation'],
            [3, 'Scale'],
          ])
            for (const [axis, suffix] of [
              [1, 'X'],
              [2, 'Y'],
              [3, 'Z'],
            ])
              add(
                'Transform',
                `${label} ${suffix}`,
                [seg(p), [11, 0], [n, 0], [axis, 0]],
                'float',
                label === 'Scale' ? 1 : 0,
              );
        }
      for (const c of W.all(bytes, record.variableField, 2)) {
        if (W.integer(c.value, 1) !== 28n) continue;
        const data = W.one(c.value, 39, 2);
        if (!data) continue;
        for (const bubble of W.all(data.value, 501, 2)) {
          const id = String(W.integer(bubble.value, 501)),
            group = `Text bubble ${id}`,
            base = [seg(c), seg(data), seg(bubble)];
          add(group, 'Configuration name', [...base, [601, 0]]);
          add(group, 'Attachment point', [...base, [503, 0]]);
          add(group, 'Font size', [...base, [511, 0]], 'uint', '30', { min: 1, max: 1000 });
          for (const line of W.all(bubble.value, 509, 2)) {
            const lineNumber = String(W.integer(line.value, 601, BigInt(line.occurrence + 1))),
              linePath = [...base, seg(line)];
            // Only literal text bubbles (kind 18), never variable/reference payloads.
            if (W.integer(line.value, 502) !== 18n) continue;
            add(group, `Text ${lineNumber}`, [...linePath, [503, 0], [501, 0]]);
            add(group, `Duration ${lineNumber}`, [...linePath, [504, 0]], 'float', 0, { min: 0 });
          }
        }
      }
    }
  }
  return result;
}
// Advanced editing retains the existing field's wire type and occurrence.
// Message/string ambiguity is resolved in favor of preserving the message.
export function storedFields(bytes) {
  const result = [];
  let truncated = false;
  const walk = (bytes, path, depth) => {
    if (depth > 24) {
      truncated = true;
      return;
    }
    for (const f of W.parse(bytes)) {
      if (result.length >= 20000) {
        truncated = true;
        return;
      }
      const next = [...path, seg(f)];
      let kind;
      if (f.wire === 0) kind = 'uint';
      else if (f.wire === 5) kind = 'fixed32';
      else if (f.wire === 1) kind = 'fixed64';
      else if (f.value.length) {
        let message = false;
        try {
          W.parse(f.value);
          message = true;
        } catch {}
        if (message) {
          walk(f.value, next, depth + 1);
          continue;
        }
        try {
          const text = W.string(f.value);
          if (!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) kind = 'text';
        } catch {}
      }
      if (kind)
        result.push({
          path: next,
          kind,
          value: valueAt(bytesRoot, next, kind),
          label: `Field ${f.number}`,
          allowMissing: false,
        });
    }
  };
  const bytesRoot = bytes;
  walk(bytes, [], 0);
  return { fields: result, truncated };
}
