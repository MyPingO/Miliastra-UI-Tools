// Lossless, bounded protobuf surgery. Unknown fields are opaque byte slices.
export const EMPTY = new Uint8Array();
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export const utf8 = value => encoder.encode(String(value));
export const string = bytes => decoder.decode(bytes);
export function concat(parts) {
  const output = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let offset = 0;
  for (const bytes of parts) { output.set(bytes, offset); offset += bytes.length; }
  return output;
}
export function readVarint(bytes, offset = 0) {
  let value = 0n;
  for (let i = 0; i < 10; i++) {
    if (offset >= bytes.length) throw new Error('Truncated varint.');
    const b = bytes[offset++];
    if (i === 9 && b > 1) throw new Error('Varint exceeds 64 bits.');
    value |= BigInt(b & 127) << BigInt(i * 7);
    if (b < 128) return { value, offset };
  }
  throw new Error('Invalid varint.');
}
export function varint(value) {
  let n = BigInt(value);
  if (n < 0n || n > 0xffffffffffffffffn) throw new Error('Unsigned value exceeds 64 bits.');
  const bytes = [];
  do { const b = Number(n & 127n); n >>= 7n; bytes.push(b | (n ? 128 : 0)); } while (n);
  return Uint8Array.from(bytes);
}
export function parse(bytes) {
  const fields = [];
  const occurrences = new Map();
  let p = 0;
  while (p < bytes.length) {
    if (fields.length >= 1000000) throw new Error('Message has too many fields.');
    const start = p, tag = readVarint(bytes, p); p = tag.offset;
    const number = Number(tag.value >> 3n), wire = Number(tag.value & 7n);
    if (!number || number > 0x1fffffff) throw new Error('Invalid protobuf field number.');
    let value, valueStart = p;
    if (wire === 0) { const v = readVarint(bytes, p); value = v.value; p = v.offset; }
    else if (wire === 1 || wire === 5) { p += wire === 1 ? 8 : 4; value = bytes.subarray(valueStart, p); }
    else if (wire === 2) {
      const size = readVarint(bytes, p);
      if (size.value > BigInt(bytes.length - size.offset)) throw new Error('Field extends beyond its message.');
      valueStart = size.offset; p = valueStart + Number(size.value); value = bytes.subarray(valueStart, p);
    } else throw new Error(`Unsupported wire type ${wire}; file left unchanged.`);
    if (p > bytes.length) throw new Error('Truncated fixed-width field.');
    const occurrence = occurrences.get(number) || 0; occurrences.set(number, occurrence + 1);
    fields.push({ number, wire, value, start, valueStart, end: p, occurrence, raw: bytes.subarray(start, p) });
  }
  return fields;
}
export const all = (bytes, n, wire) => parse(bytes).filter(f => f.number === n && (wire === undefined || f.wire === wire));
export function one(bytes, n, wire) {
  const fields = all(bytes, n, wire);
  if (fields.length > 1) throw new Error(`Ambiguous singular field ${n}.`);
  return fields[0];
}
export const message = (bytes, n) => one(bytes, n, 2)?.value || EMPTY;
export const integer = (bytes, n, fallback = 0n) => one(bytes, n, 0)?.value ?? fallback;
export const text = (bytes, n, fallback = '') => { const f = one(bytes, n, 2); return f ? string(f.value) : fallback; };
export function field(n, wire, value) {
  const key = varint(BigInt(n) * 8n + BigInt(wire));
  if (wire === 0) return concat([key, varint(value)]);
  if (!(value instanceof Uint8Array)) throw new Error('Byte field requires Uint8Array.');
  if ((wire === 1 && value.length !== 8) || (wire === 5 && value.length !== 4)) throw new Error('Wrong fixed-width size.');
  return concat(wire === 2 ? [key, varint(value.length), value] : [key, value]);
}
export function set(bytes, n, wire, value) {
  const target = one(bytes, n);
  if (target && target.wire !== wire) throw new Error(`Unexpected wire type for field ${n}.`);
  const replacement = field(n, wire, value);
  return target ? concat([bytes.subarray(0, target.start), replacement, bytes.subarray(target.end)]) : concat([bytes, replacement]);
}
export function replaceRepeated(bytes, n, replacements) {
  let inserted = false;
  const parts = [];
  for (const f of parse(bytes)) {
    if (f.number === n) {
      if (!inserted) { parts.push(...replacements); inserted = true; }
    } else parts.push(f.raw);
  }
  if (!inserted) parts.push(...replacements);
  return concat(parts);
}
export function at(bytes, path) {
  for (const [n, occurrence] of path) {
    const f = parse(bytes).find(f => f.number === n && f.occurrence === occurrence);
    if (!f || f.wire !== 2) throw new Error('Stored path no longer matches the file.');
    bytes = f.value;
  }
  return bytes;
}
export function patch(bytes, path, replacement) {
  if (!path.length) return replacement;
  const [n, occurrence] = path[0];
  const f = parse(bytes).find(f => f.number === n && f.occurrence === occurrence);
  if (!f || f.wire !== 2) throw new Error('Stored path no longer matches the file.');
  return concat([bytes.subarray(0, f.start), field(n, 2, patch(f.value, path.slice(1), replacement)), bytes.subarray(f.end)]);
}
export const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
export function unpack(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 24) throw new Error('A GIL/GIA file needs a 20-byte header and 4-byte footer.');
  if (bytes.length > 256 * 1024 * 1024) throw new Error('Files larger than 256 MB are not supported.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = view.getUint32(0), version = view.getUint32(4), magic = view.getUint32(8), type = view.getUint32(12), length = view.getUint32(16);
  if (magic !== 0x326 || view.getUint32(bytes.length - 4) !== 0x679) throw new Error('Invalid Miliastra header or footer magic.');
  if (size !== bytes.length - 4 || length !== bytes.length - 24) throw new Error('Header lengths do not match this file.');
  if (type !== 2 && type !== 3) throw new Error('Open a .gil level or .gia asset file.');
  const payload = bytes.subarray(20, bytes.length - 4);
  parse(payload);
  return { version, type, length, payload, original: bytes };
}
export function pack(payload, type = 2, version = 1) {
  const header = new Uint8Array(20), footer = new Uint8Array(4), view = new DataView(header.buffer);
  [payload.length + 20, version, 0x326, type, payload.length].forEach((v, i) => view.setUint32(i * 4, v));
  new DataView(footer.buffer).setUint32(0, 0x679);
  return concat([header, payload, footer]);
}
export function floatBytes(value) {
  const n = Number(value), bytes = new Uint8Array(4), view = new DataView(bytes.buffer);
  if (!Number.isFinite(n)) throw new Error('Enter a finite number.');
  view.setFloat32(0, n, true);
  if (!Number.isFinite(view.getFloat32(0, true))) throw new Error('Value exceeds the Float32 range.');
  return bytes;
}
export const float = bytes => new DataView(bytes.buffer, bytes.byteOffset, 4).getFloat32(0, true);
