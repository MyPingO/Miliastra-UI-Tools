import * as W from '../../assets/game-wire.mjs';
import { GameDocument } from '../../assets/game-document.mjs';
import { TYPES, readValue, editNested, valueJSON } from '../../assets/game-values.mjs';
const types = {
  1: 'Entity',
  2: 'Guid',
  3: 'Int32',
  4: 'Bool',
  5: 'Float',
  6: 'String',
  12: 'Vector3',
  17: 'Army',
  20: 'ConfigReference',
  21: 'EntityReference',
};
export class BinarySession {
  constructor(name, bytes) {
    this.doc = new GameDocument(name, bytes);
    this.name = name;
    this.format = this.doc.container.type === 2 ? 'GIL' : 'GIA';
    this.records = this.doc.records;
    this.saved = new Map();
  }
  get history() {
    return this.doc.history;
  }
  get future() {
    return this.doc.future;
  }
  get dirty() {
    const changes = this.doc.changes;
    return (
      changes.size !== this.saved.size ||
      [...changes].some(([k, v]) => this.saved.get(k) !== v.bytes)
    );
  }
  markSaved() {
    this.saved = new Map([...this.doc.changes].map(([k, v]) => [k, v.bytes]));
  }
  undo() {
    this.doc.undo();
  }
  redo() {
    this.doc.redo();
  }
  export() {
    return this.doc.export();
  }
  nodes(record) {
    return this.doc.variables(record).map((variable) => {
      if (!variable.model)
        return {
          key: JSON.stringify(variable.path),
          kind: 'readonly',
          label: variable.name,
          type: TYPES[variable.type],
          value: variable.warning,
        };
      const read = () => readValue(W.at(this.doc.bytes(record), variable.path));
      const write = (path, value) => {
        const next = editNested(read(), path, value);
        this.doc.change(
          record,
          W.patch(this.doc.bytes(record), variable.path, next),
          `Edit ${variable.name}`,
        );
      };
      const node = (model, path, label, allowed = true) => {
        const base = {
          key: JSON.stringify([variable.path, path]),
          label,
          type: types[model.type] || TYPES[model.type] || `Type ${model.type}`,
          editable: allowed && this.doc.container.version === 1 && model.editable,
        };
        if (model.children)
          return {
            ...base,
            kind: model.type === 26 ? 'rows' : 'struct',
            children: model.children.map((c, i) =>
              node(c, [...path, ['children', i]], c.name || `Field ${i + 1}`, allowed),
            ),
          };
        if (model.keys)
          return {
            ...base,
            kind: 'dictionary',
            keyType: TYPES[model.keyType],
            valueType: TYPES[model.valueType],
            entries: model.keys.map((k, i) => ({
              key: node(k, [...path, ['keys', i]], `Key ${i + 1}`, allowed && model.editable),
              value: node(
                model.values[i],
                [...path, ['values', i]],
                `Value ${i + 1}`,
                allowed && model.editable,
              ),
            })),
          };
        if (model.element)
          return {
            ...base,
            kind: 'list',
            element: types[model.element],
            value: model.value,
            set: (v) => write(path, v),
          };
        if (!model.editable) return { ...base, kind: 'readonly', value: valueJSON(model) };
        return { ...base, kind: 'scalar', value: model.value, set: (v) => write(path, v) };
      };
      return node(variable.model, [], variable.name);
    });
  }
}
