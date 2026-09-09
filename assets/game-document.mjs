import * as W from './game-wire.mjs';
import { readValue, flattenValues, writeValue, TYPES, valueJSON } from './game-values.mjs';
export const SECTIONS = {
  2: 'Level name',
  3: 'Export metadata',
  4: 'Prefabs',
  5: 'Scene entities',
  6: 'Categories',
  7: 'Terrain',
  8: 'Component data',
  9: 'UI controls',
  10: 'Node graphs',
  11: 'Level settings',
  15: 'Gameplay configuration',
  16: 'Animation & event data',
  18: 'Cameras',
  22: 'Feature flags',
  25: 'Peripheral systems',
  27: 'Decorations',
  29: 'Editor data',
  36: 'Localization',
  43: 'Game version',
};
const seg = (f) => [f.number, f.occurrence];
function objectName(bytes, propertyNumber) {
  for (const f of W.all(bytes, propertyNumber, 2)) {
    if (W.integer(f.value, 1) === 1n) return W.text(W.message(f.value, 11), 1);
  }
  return '';
}
export function uiName(bytes) {
  for (const f of W.all(bytes, 505, 2))
    if (W.integer(f.value, 502) === 15n) return W.text(W.message(f.value, 12), 501);
  return '';
}
export function uiLists(bytes) {
  const results = [];
  // Verified List property 47 -> details 503 -> value 40 -> repeated rows 501.
  for (const property of W.all(bytes, 505, 2)) {
    if (W.integer(property.value, 502) !== 47n) continue;
    const details = W.one(property.value, 503, 2),
      container = details && W.one(details.value, 40, 2);
    if (!container) continue;
    const path = [seg(property), seg(details), seg(container)];
    const rows = W.all(container.value, 501, 2)
      .map((f) => ({
        raw: f.value,
        name: W.text(W.message(f.value, 501), 501),
        order: Number(W.integer(f.value, 505)),
        fields: uiRowFields(f.value),
      }))
      .sort((a, b) => a.order - b.order);
    if (rows.some((r) => !r.order)) continue;
    results.push({ path, raw: container.value, rows });
  }
  return results;
}
function uiRowFields(bytes) {
  const data = W.message(bytes, 502),
    result = [];
  for (const pair of W.all(data, 501, 2)) {
    const wrapper = W.message(pair.value, 502),
      type = Number(W.integer(wrapper, 501));
    const typed = W.one(wrapper, type + 10, 2);
    if (!typed || ![1, 2, 3, 4].includes(type)) continue;
    try {
      const f = W.one(typed.value, 501);
      let value =
        type === 3
          ? W.text(typed.value, 501)
          : type === 4
            ? W.text(W.message(typed.value, 501), 501)
            : type === 2
              ? f
                ? W.float(f.value)
                : 0
              : Number(BigInt.asIntN(32, f?.value || 0n));
      result.push({
        id: String(W.integer(pair.value, 501)),
        type,
        value,
        path: [[502, 0], seg(pair), [502, 0], [type + 10, 0]],
        raw: typed.value,
      });
    } catch {
      /* Preserve nonliteral/dynamic references. */
    }
  }
  return result;
}
export function editUIRow(row, name, values) {
  let bytes = W.set(row.raw, 501, 2, W.set(W.message(row.raw, 501), 501, 2, W.utf8(name)));
  for (const item of row.fields) {
    if (!(item.id in values) || values[item.id] === item.value) continue;
    const value = values[item.id];
    let typed;
    if (item.type === 3) typed = W.set(item.raw, 501, 2, W.utf8(value));
    else if (item.type === 4)
      typed = W.set(item.raw, 501, 2, W.set(W.message(item.raw, 501), 501, 2, W.utf8(value)));
    else if (item.type === 2) typed = W.set(item.raw, 501, 5, W.floatBytes(value));
    else {
      if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)
        throw new Error('Enter an Int32 value.');
      typed = W.set(item.raw, 501, 0, BigInt.asUintN(64, BigInt(value)));
    }
    bytes = W.patch(bytes, item.path, typed);
  }
  return bytes;
}
export function writeUIRows(list, rows) {
  if (!rows.length || rows.length > 10000) throw new Error('UI lists must have 1–10,000 rows.');
  return W.replaceRepeated(
    list.raw,
    501,
    rows.map((r, i) => W.field(501, 2, W.set(r, 505, 0, i + 1))).reverse(),
  );
}
export class GameDocument {
  constructor(name, bytes) {
    this.name = name;
    this.container = W.unpack(bytes);
    this.payload = this.container.payload;
    this.records = [];
    this.warnings = [];
    this.changes = new Map();
    this.history = [];
    this.future = [];
    this.index();
  }
  index() {
    const root = W.parse(this.payload);
    const names =
      this.container.type === 3
        ? { 1: 'Primary asset', 2: 'Referenced asset', 3: 'Export metadata', 5: 'Version' }
        : SECTIONS;
    this.sections = root.map((f) => ({
      number: f.number,
      occurrence: f.occurrence,
      name: names[f.number] || `Section ${f.number}`,
      size: f.end - f.start,
      wire: f.wire,
    }));
    this.levelName = this.container.type === 2 ? W.text(this.payload, 2, this.name) : this.name;
    if (this.container.version !== 1)
      this.warnings.push(
        `Container version ${this.container.version} is read-only; only version 1 edits are enabled.`,
      );
    for (const section of root) {
      if (section.wire !== 2) continue;
      if (this.container.type === 2 && [4, 5, 27].includes(section.number)) {
        const type =
          section.number === 4 ? 'prefab' : section.number === 5 ? 'scene' : 'decoration';
        for (const item of W.all(section.value, 1, 2)) {
          try {
            const record = {
              key: `${section.number}:${section.occurrence}:${item.occurrence}`,
              kind: type,
              path: [seg(section), seg(item)],
              original: item.value,
            };
            record.id = String(W.integer(item.value, 1));
            record.name =
              objectName(item.value, type === 'prefab' ? 6 : type === 'scene' ? 5 : 4) ||
              `${type} ${record.id}`;
            record.templateId = String(
              type === 'prefab'
                ? W.integer(item.value, 2)
                : type === 'scene'
                  ? W.integer(item.value, 8, W.integer(W.message(item.value, 2), 1))
                  : W.integer(item.value, 2),
            );
            record.variableField = type === 'prefab' ? 8 : type === 'scene' ? 7 : null;
            this.records.push(record);
          } catch (error) {
            this.warnings.push(`Could not index ${type} ${item.occurrence + 1}: ${error.message}`);
          }
        }
      } else if (this.container.type === 2 && section.number === 9) {
        for (const item of W.all(section.value, 502, 2)) {
          try {
            this.records.push({
              key: `9:${section.occurrence}:${item.occurrence}`,
              kind: 'ui',
              id: String(W.integer(item.value, 501)),
              name: uiName(item.value) || 'Unnamed UI control',
              parentId: String(W.integer(item.value, 504)),
              path: [seg(section), seg(item)],
              original: item.value,
            });
          } catch (error) {
            this.warnings.push(`Could not index UI control: ${error.message}`);
          }
        }
      } else if (this.container.type === 3 && [1, 2].includes(section.number)) {
        const content = W.one(section.value, 19, 2),
          scene = W.one(section.value, 12, 2),
          prefab = W.one(section.value, 11, 2),
          structure = W.one(section.value, 22, 2);
        const record = {
          key: `asset:${section.number}:${section.occurrence}`,
          kind: content ? 'ui' : 'asset',
          id: String(W.integer(W.message(section.value, 1), 4)),
          name: W.text(section.value, 3, 'Unnamed asset'),
          path: [seg(section)],
          original: section.value,
        };
        if (content) {
          const body = W.one(content.value, 1, 2);
          if (body) {
            record.path.push(seg(content), seg(body));
            record.original = body.value;
            record.id = String(W.integer(body.value, 501));
            record.parentId = String(W.integer(body.value, 504));
            record.name = uiName(body.value) || record.name;
          }
        } else if (scene || prefab) {
          const entity = scene || prefab,
            body = W.one(entity.value, 1, 2);
          if (body) {
            record.path.push(seg(entity), seg(body));
            record.original = body.value;
            record.kind = scene ? 'scene' : 'prefab';
            record.variableField = scene ? 7 : 8;
            record.name = objectName(body.value, scene ? 5 : 6) || record.name;
            record.templateId = String(
              scene ? W.integer(W.message(body.value, 2), 1) : W.integer(body.value, 2),
            );
          }
        } else if (structure) {
          record.kind = 'structure';
          record.structurePath = [
            [22, 0],
            [1, 0],
            [1, 0],
          ];
          record.name = W.text(W.at(section.value, record.structurePath), 501) || record.name;
        }
        this.records.push(record);
      }
    }
    if (this.container.type === 2)
      for (const section of root) {
        if (section.wire !== 2 || [2, 3, 4, 5, 9, 27].includes(section.number)) continue;
        try {
          W.parse(section.value);
          this.records.push({
            key: `section:${section.number}:${section.occurrence}`,
            kind: 'section',
            id: String(section.number),
            name: SECTIONS[section.number] || `Section ${section.number}`,
            path: [seg(section)],
            original: section.value,
          });
        } catch {}
      }
    for (const record of this.records) {
      try {
        record.variables = this.variables(record);
        record.listCount =
          record.kind === 'ui'
            ? uiLists(record.original).length
            : record.variables.reduce(
                (n, v) =>
                  n +
                  (v.model
                    ? flattenValues(v.model).filter(
                        (x) => Array.isArray(x.model.value) || x.model.type === 26,
                      ).length
                    : 0),
                0,
              );
      } catch (error) {
        record.variables = [];
        record.listCount = 0;
        record.warning = error.message;
      }
    }
  }
  bytes(record) {
    return this.changes.get(record.key)?.bytes || record.original;
  }
  variables(record) {
    if (record.kind === 'structure') {
      const definition = W.at(this.bytes(record), record.structurePath);
      return W.all(definition, 3, 2).map((f) => {
        const name = W.text(f.value, 501, W.text(f.value, 5, 'Unnamed field')),
          type = Number(W.integer(f.value, 502));
        const entry = { name, type, path: [...record.structurePath, seg(f), [3, 0]] };
        try {
          entry.model = readValue(W.message(f.value, 3));
        } catch (e) {
          entry.warning = e.message;
          entry.model = null;
        }
        return entry;
      });
    }
    if (!record.variableField) return [];
    const output = [];
    for (const component of W.all(this.bytes(record), record.variableField, 2)) {
      if (W.integer(component.value, 1) !== 1n) continue;
      const list = W.one(component.value, 11, 2);
      if (!list) continue;
      for (const variable of W.all(list.value, 1, 2)) {
        const name = W.text(variable.value, 2, 'Unnamed variable'),
          type = Number(W.integer(variable.value, 3)),
          value = W.one(variable.value, 4, 2);
        const entry = { name, type, path: [seg(component), seg(list), seg(variable), [4, 0]] };
        try {
          if (!value) throw new Error('No value payload.');
          entry.model = readValue(value.value);
          if (entry.model.type !== type) throw new Error('Variable type disagrees with its value.');
        } catch (error) {
          entry.model = null;
          entry.warning = error.message;
        }
        output.push(entry);
      }
    }
    return output;
  }
  change(record, bytes, label) {
    if (this.container.version !== 1) throw new Error('This container version is read-only.');
    W.parse(bytes);
    if (W.same(bytes, this.bytes(record))) return false;
    this.history.push({
      key: record.key,
      before: this.changes.get(record.key),
      after: W.same(bytes, record.original) ? undefined : { bytes, label },
    });
    if (this.history.length > 100) this.history.shift();
    this.future = [];
    const item = this.history.at(-1);
    if (item.after) this.changes.set(record.key, item.after);
    else this.changes.delete(record.key);
    return true;
  }
  editValue(record, variablePath, nestedPath, value, label) {
    const path = [...variablePath, ...nestedPath],
      raw = W.at(this.bytes(record), path),
      model = readValue(raw);
    return this.change(record, W.patch(this.bytes(record), path, writeValue(model, value)), label);
  }
  changeMany(edits, label) {
    if (this.container.version !== 1) throw new Error('This container version is read-only.');
    const batch = [];
    for (const [record, bytes] of edits) {
      W.parse(bytes);
      if (!W.same(bytes, this.bytes(record)))
        batch.push({
          key: record.key,
          before: this.changes.get(record.key),
          after: W.same(bytes, record.original) ? undefined : { bytes, label },
        });
    }
    if (!batch.length) return;
    this.history.push({ batch, label });
    if (this.history.length > 100) this.history.shift();
    this.future = [];
    for (const item of batch) {
      if (item.after) this.changes.set(item.key, item.after);
      else this.changes.delete(item.key);
    }
  }
  undo() {
    const step = this.history.pop();
    if (!step) return;
    this.future.push(step);
    for (const item of step.batch || [step]) {
      if (item.before) this.changes.set(item.key, item.before);
      else this.changes.delete(item.key);
    }
  }
  redo() {
    const step = this.future.pop();
    if (!step) return;
    this.history.push(step);
    for (const item of step.batch || [step]) {
      if (item.after) this.changes.set(item.key, item.after);
      else this.changes.delete(item.key);
    }
  }
  export() {
    if (!this.changes.size) return this.container.original.slice();
    // Group replacements per top-level section: never rewrite a 23 MB payload per cell.
    const sections = new Map();
    for (const record of this.records)
      if (this.changes.has(record.key)) {
        const first = record.path[0],
          key = first.join(':');
        const base = sections.get(key)?.bytes || W.at(this.payload, [first]);
        sections.set(key, {
          path: [first],
          bytes: W.patch(base, record.path.slice(1), this.bytes(record)),
        });
      }
    let payload = this.payload;
    for (const item of sections.values()) payload = W.patch(payload, item.path, item.bytes);
    const bytes = W.pack(payload, this.container.type, this.container.version);
    W.unpack(bytes);
    return bytes;
  }
  report() {
    return {
      file: this.name,
      level: this.levelName,
      format: this.container.type === 2 ? 'GIL' : 'GIA',
      version: this.container.version,
      sections: this.sections,
      warnings: this.warnings,
      records: this.records.map((r) => ({
        kind: r.kind,
        id: r.id,
        name: r.name,
        parentId: r.parentId,
        templateId: r.templateId,
        changed: this.changes.has(r.key),
        variables: this.variables(r).map((v) => ({
          name: v.name,
          type: TYPES[v.type] || v.type,
          value: v.model ? valueJSON(v.model) : null,
          warning: v.warning,
        })),
      })),
    };
  }
}
