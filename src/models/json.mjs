export const JSON_TYPES = [
  'String',
  'Int32',
  'Float',
  'Bool',
  'Vector3',
  'Entity',
  'Guid',
  'ConfigReference',
  'EntityReference',
  'Army',
  'StringList',
  'Int32List',
  'FloatList',
  'BoolList',
  'Vector3List',
  'EntityList',
  'GuidList',
  'ConfigReferenceList',
  'EntityReferenceList',
  'ArmyList',
  'Struct',
  'StructList',
  'Dict',
];
export const at = (root, path) => path.reduce((v, k) => v[k], root);
const replace = (root, path, value) => {
  if (!path.length) return value;
  const result = Array.isArray(root) ? [...root] : { ...root };
  result[path[0]] = replace(root[path[0]], path.slice(1), value);
  return result;
};
const idTypes = new Set(['Entity', 'Guid', 'ConfigReference', 'EntityReference', 'Army']);
export function scalar(type, value) {
  if (type === 'String') {
    if (typeof value !== 'string') throw new Error('Expected text.');
    return value;
  }
  if (type === 'Bool') {
    if ([true, 'True', 'true'].includes(value)) return true;
    if ([false, 'False', 'false'].includes(value)) return false;
    throw new Error('Choose true or false.');
  }
  if (type === 'Int32') {
    if (!['number', 'string'].includes(typeof value)) throw new Error('Expected a number.');
    const v = Number(value);
    if (String(value).trim() === '' || !Number.isInteger(v) || v < -2147483648 || v > 2147483647)
      throw new Error('Integer must be between −2147483648 and 2147483647.');
    return v;
  }
  if (type === 'Float') {
    if (!['number', 'string'].includes(typeof value)) throw new Error('Expected a number.');
    const v = Number(value);
    if (String(value).trim() === '' || !Number.isFinite(v) || !Number.isFinite(Math.fround(v)))
      throw new Error('Enter a finite Float32 number.');
    return v;
  }
  if (type === 'Vector3') {
    const list = Array.isArray(value) ? value : String(value).split(',');
    if (list.length !== 3) throw new Error('Enter X, Y, Z separated by commas.');
    return list.map((v) => scalar('Float', v));
  }
  if (idTypes.has(type)) {
    if (typeof value === 'number' && !Number.isSafeInteger(value))
      throw new Error('Large IDs must be decimal strings to preserve precision.');
    if (!/^\d+$/.test(String(value)) || BigInt(value) > 0xffffffffffffffffn)
      throw new Error('Enter an unsigned decimal ID, up to 64 bits.');
    return String(value);
  }
  return value;
}
function encode(type, value, original) {
  const checked = scalar(type, value);
  if (type === 'Vector3') return Array.isArray(original) ? checked : checked.join(',');
  if (typeof original === 'string' || original === undefined)
    return type === 'Bool' ? (checked ? 'True' : 'False') : String(checked);
  return checked;
}
export function newWrapper(type) {
  if (type === 'Struct')
    return { param_type: type, value: { structId: '0', type: 'Struct', value: [] } };
  if (type === 'StructList') return { param_type: type, value: { structId: '0', value: [] } };
  if (type === 'Dict')
    return {
      param_type: type,
      value: { type: 'Dict', key_type: 'String', value_type: 'String', value: [] },
    };
  return {
    param_type: type,
    value: type.endsWith('List')
      ? []
      : type === 'String'
        ? ''
        : type === 'Bool'
          ? 'False'
          : type === 'Vector3'
            ? '0,0,0'
            : '0',
  };
}
export class JsonSession {
  constructor(name, text) {
    this.name = name;
    this.originalText = text;
    this.original = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (!this.original || typeof this.original !== 'object')
      throw new Error('Open a JSON object or array.');
    this.root = this.original;
    this.history = [];
    this.future = [];
    this.saved = this.root;
    this.format = 'JSON';
    this.records = [
      { key: 'json', kind: 'json', name: this.root.name || name, id: 'JSON', listCount: 0 },
    ];
  }
  get dirty() {
    return this.root !== this.saved;
  }
  change(path, value, label = 'Edit JSON') {
    if (JSON.stringify(at(this.root, path)) === JSON.stringify(value)) return;
    const next = replace(this.root, path, value);
    this.history.push({ before: this.root, after: next, label });
    if (this.history.length > 100) this.history.shift();
    this.future = [];
    this.root = next;
  }
  undo() {
    const step = this.history.pop();
    if (step) {
      this.future.push(step);
      this.root = step.before;
    }
  }
  redo() {
    const step = this.future.pop();
    if (step) {
      this.history.push(step);
      this.root = step.after;
    }
  }
  export() {
    this.validate();
    return this.root === this.original
      ? this.originalText
      : JSON.stringify(this.root, null, 2) + '\n';
  }
  markSaved() {
    this.saved = this.root;
  }
  nodes() {
    return [this.node(this.root, [], this.root.name || 'Variables')];
  }
  node(data, path, label, typeHint) {
    if (path.length > 160) throw new Error('JSON nesting is too deep.');
    const type = data?.param_type || data?.type || typeHint;
    const base = { label, path, key: JSON.stringify(path), type: type || 'JSON', editable: true };
    if (data && typeof data === 'object') {
      const nameKey =
        typeof data.key === 'string' ? 'key' : typeof data.name === 'string' ? 'name' : null;
      if (nameKey)
        base.rename = (value) => {
          if (!value.trim()) throw new Error('Enter a name.');
          const siblings = path.length ? at(this.root, path.slice(0, -1)) : null;
          if (
            Array.isArray(siblings) &&
            siblings.some((sibling, i) => i !== path.at(-1) && sibling?.[nameKey] === value)
          )
            throw new Error('Field names must be unique.');
          this.change([...path, nameKey], value, 'Rename field');
        };
      if ('structId' in data)
        base.metadata = [
          {
            label: 'Structure ID',
            type: 'Guid',
            value: data.structId,
            set: (value) =>
              this.change([...path, 'structId'], scalar('Guid', value), 'Edit Structure ID'),
          },
        ];
    }
    if (data && typeof data === 'object' && !Array.isArray(data) && 'value' in data && type) {
      const value = data.value,
        p = [...path, 'value'];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nested = this.node(value, p, label, type);
        return { ...nested, rename: base.rename || nested.rename, wrapperPath: path };
      }
      if (type === 'Struct' && Array.isArray(value))
        return {
          ...base,
          kind: 'struct',
          arrayPath: p,
          children: value.map((v, i) => this.node(v, [...p, i], v.key || `Field ${i + 1}`)),
          add: (fieldType, fieldName) => {
            const current = at(this.root, p),
              named = data.struct_ype === 'basic' || value.some((v) => v && 'key' in v),
              name = fieldName || `Field ${current.length + 1}`;
            if (named && current.some((v) => v.key === name))
              throw new Error('Field names must be unique.');
            const item = named
              ? { key: name, param_type: fieldType, value: newWrapper(fieldType) }
              : newWrapper(fieldType);
            this.change(p, [...current, item], 'Add Structure field');
          },
        };
      if (type === 'StructList' && Array.isArray(value))
        return {
          ...base,
          kind: 'rows',
          arrayPath: p,
          addRow: () =>
            this.change(
              p,
              [
                ...at(this.root, p),
                value.length
                  ? structuredClone(value.at(-1))
                  : {
                      param_type: 'Struct',
                      value: { structId: data.structId || '0', type: 'Struct', value: [] },
                    },
              ],
              'Add Structure row',
            ),
          children: value.map((v, i) => this.node(v, [...p, i], `Item ${i + 1}`)),
        };
      if (type === 'Dict' && Array.isArray(value))
        return {
          ...base,
          kind: 'dictionary',
          arrayPath: p,
          metadata: [
            {
              label: 'Key type',
              options: [
                'String',
                'Int32',
                'Entity',
                'Guid',
                'ConfigReference',
                'EntityReference',
                'Army',
              ],
              value: data.key_type,
              disabled: value.length > 0,
              set: (type) => this.change([...path, 'key_type'], type, 'Edit key type'),
            },
            {
              label: 'Value type',
              options: JSON_TYPES.filter((t) => t !== 'Dict'),
              value: data.value_type,
              disabled: value.length > 0,
              set: (type) => this.change([...path, 'value_type'], type, 'Edit value type'),
            },
          ],
          keyType: data.key_type,
          valueType: data.value_type,
          entries: value.map((entry, i) => ({
            key: this.node(entry.key, [...p, i, 'key'], `Key ${i + 1}`, data.key_type),
            value: this.node(entry.value, [...p, i, 'value'], `Value ${i + 1}`, data.value_type),
          })),
          add: () => {
            const entries = at(this.root, p),
              keyType = data.key_type || 'String';
            let k = 1;
            const keys = new Set(entries.map((e) => String(e.key?.value)));
            while (keys.has(keyType === 'String' ? `Key ${k}` : String(k))) k++;
            const key = newWrapper(keyType);
            key.value = keyType === 'String' ? `Key ${k}` : String(k);
            this.change(
              p,
              [...entries, { key, value: newWrapper(data.value_type || 'String') }],
              'Add dictionary entry',
            );
          },
        };
      if (type.endsWith('List') && Array.isArray(value)) {
        const element = type.slice(0, -4);
        return {
          ...base,
          kind: 'list',
          element,
          value: value.map((v) => scalar(element, v)),
          set: (values) => {
            if (values.length > 10000) throw new Error('A list can contain at most 10,000 rows.');
            const current = at(this.root, p);
            this.change(
              p,
              values.map((v, i) => encode(element, v, current[i])),
              'Edit ' + label,
            );
          },
        };
      }
      return {
        ...base,
        kind: 'scalar',
        value: scalar(type, value),
        set: (v) => {
          const encoded = encode(type, v, at(this.root, p));
          // Check dictionary keys before committing so errors stay beside the edited key.
          const keyIndex = path.lastIndexOf('key');
          if (keyIndex >= 2 && typeof path[keyIndex - 1] === 'number') {
            const entries = at(this.root, path.slice(0, keyIndex - 1));
            if (
              Array.isArray(entries) &&
              entries.some(
                (entry, i) =>
                  i !== path[keyIndex - 1] &&
                  JSON.stringify(scalar(type, entry.key?.value ?? entry.key)) ===
                    JSON.stringify(scalar(type, encoded)),
              )
            )
              throw new Error('Dictionary keys must be unique.');
          }
          this.change(p, encoded, 'Edit ' + label);
        },
      };
    }
    if (Array.isArray(data))
      return {
        ...base,
        kind: 'rows',
        arrayPath: path,
        children: data.map((v, i) => this.node(v, [...path, i], `Item ${i + 1}`)),
      };
    if (data && typeof data === 'object')
      return {
        ...base,
        kind: 'struct',
        children: Object.entries(data).map(([k, v]) => this.node(v, [...path, k], k)),
      };
    if (data === null)
      return { ...base, kind: 'readonly', type: 'Empty', value: 'No value (null)' };
    const primitiveType =
      typeof data === 'boolean' ? 'Bool' : typeof data === 'number' ? 'Float' : 'String';
    return {
      ...base,
      type: primitiveType,
      kind: 'scalar',
      value: data ?? '',
      set: (v) =>
        this.change(
          path,
          typeof data === 'number'
            ? scalar('Float', v)
            : typeof data === 'boolean'
              ? scalar('Bool', v)
              : String(v),
          'Edit ' + label,
        ),
    };
  }
  editArray(path, index, action) {
    const values = [...at(this.root, path)];
    if (action === 'duplicate') {
      const copy = structuredClone(values[index]);
      if (typeof copy?.key === 'string') {
        const base = copy.key + ' copy';
        let name = base,
          n = 2;
        while (values.some((v) => v.key === name)) name = base + ' ' + n++;
        copy.key = name;
      }
      values.splice(index + 1, 0, copy);
    }
    if (action === 'remove') values.splice(index, 1);
    if (action === 'up' && index > 0)
      [values[index - 1], values[index]] = [values[index], values[index - 1]];
    if (action === 'down' && index < values.length - 1)
      [values[index + 1], values[index]] = [values[index], values[index + 1]];
    this.change(path, values, action + ' row');
  }
  validate() {
    let count = 0;
    const visit = (node) => {
      if (++count > 100000) throw new Error('JSON has too many editable values.');
      if (node.kind === 'dictionary') {
        const keys = new Set();
        for (const entry of node.entries) {
          const key = JSON.stringify(entry.key.value);
          if (keys.has(key)) throw new Error(`${node.label}: dictionary keys must be unique.`);
          keys.add(key);
          visit(entry.key);
          visit(entry.value);
        }
      }
      for (const child of node.children || []) visit(child);
    };
    this.nodes().forEach(visit);
    return true;
  }
}
