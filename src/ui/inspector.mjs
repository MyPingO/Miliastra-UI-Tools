import { properties, writeProperty } from '../../assets/game-properties.mjs';
import {
  componentLists,
  saveRows,
  updateRow,
  formalConfig,
  addFormalColumn,
} from '../models/ui-lists.mjs';
import { el, button, control, field, numberFormat, modal } from './dom.mjs';
import { valueEditor } from './value-editor.mjs';
import { listEditor } from './list-editor.mjs';
export function renderInspector(host, session, record, context) {
  host.replaceChildren();
  if (!record) {
    host.append(el('div', 'empty-state', 'Select an object or Structure.'));
    return;
  }
  const header = el('header', 'inspector-header'),
    titles = el('div');
  titles.append(
    el(
      'div',
      'eyebrow',
      {
        json: 'JSON document',
        ui: 'UI element',
        scene: 'Scene object',
        prefab: 'Prefab',
        structure: 'Structure',
        decoration: 'Decoration',
      }[record.kind] || 'Object',
    ),
    el('h1', '', record.name),
  );
  const meta = el('div', 'object-meta');
  if (session.doc)
    meta.append(
      el('span', '', 'ID ' + record.id),
      el('span', '', numberFormat(session.doc.bytes(record).length)),
    );
  titles.append(meta);
  header.append(titles);
  host.append(header);
  const tabs = el('div', 'inspector-tabs'),
    body = el('div', 'inspector-body');
  host.append(tabs, body);
  tabs.hidden = session.format === 'JSON';
  let selected = context.tab || 'data';
  if (session.format === 'JSON' || !['data', 'properties'].includes(selected)) selected = 'data';
  if (session.doc && session.doc.container.version !== 1)
    host.append(
      el(
        'p',
        'read-only-notice',
        'This file version is read-only. You can view its data and export the original file.',
      ),
    );
  for (const [key, label] of [
    ['data', 'Lists & variables'],
    ['properties', 'Properties'],
  ]) {
    if (session.format === 'JSON' && key !== 'data') continue;
    const b = button(label, () =>
      context.run(() => {
        context.setTab(key);
        context.refresh();
      }),
    );
    b.dataset.tab = key;
    tabs.append(b);
  }
  function draw(key) {
    selected = key;
    tabs.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === key);
      b.setAttribute('aria-pressed', String(b.dataset.tab === key));
    });
    body.replaceChildren();
    if (key === 'data') data();
    else if (key === 'properties') props();
  }
  function data() {
    if (session.doc && record.kind === 'ui') {
      const lists = componentLists(session.doc, record);
      for (const list of lists) {
        const section = el('section', 'editor-section');
        section.append(el('h2', '', list.label));
        section.append(
          listEditor({
            title: list.label,
            view: context.view?.('list/' + JSON.stringify(list.path)) || {},
            columns: list.columns,
            rows: list.rows.map((row) => ({ source: row, values: row.values })),
            onSave: (rows) =>
              saveRows(
                session.doc,
                record,
                list,
                rows.map((row) => updateRow(list, row.source, row.values)),
              ),
            notify: context.changed,
            minRows: 1,
            editable: session.doc.container.version === 1,
          }),
        );
        body.append(section);
        if (
          session.doc.container.version === 1 &&
          list.kind === 'choice' &&
          formalConfig(session.doc, record)
        )
          section.append(
            button('+ Formal Variable', () =>
              context.run(() =>
                modal('Add a list field', ({ body, footer, error, close }) => {
                  const name = el('input'),
                    type = el('select');
                  name.placeholder = 'Field name';
                  name.setAttribute('aria-label', 'Formal Variable name');
                  for (const t of ['String', 'Int32', 'Float']) {
                    const option = el('option', '', t);
                    option.value = t;
                    type.append(option);
                  }
                  body.append(
                    field('Name', name),
                    field('Type', type),
                    el(
                      'p',
                      'muted',
                      'The field is added to the page definition and every list that uses it.',
                    ),
                  );
                  footer.append(
                    button('Cancel', close),
                    button(
                      'Add field',
                      () => {
                        try {
                          addFormalColumn(session.doc, record, name.value, type.value);
                          context.refresh();
                          context.changed('Added Formal Variable.');
                          close();
                        } catch (e) {
                          error.textContent = e.message;
                        }
                      },
                      'primary',
                    ),
                  );
                }),
              ),
            ),
          );
      }
    }
    const nodes = session.nodes(record);
    if (!nodes.length && !body.children.length) {
      body.append(
        el('div', 'empty-state', 'No list or custom-variable data on this object.'),
        session.doc && properties(record, session.doc.bytes(record)).length
          ? button(
              'Edit properties',
              () => {
                context.setTab('properties');
                context.refresh();
              },
              'primary',
            )
          : el('p', 'muted', 'Other data on this object is preserved when you export.'),
      );
      return;
    }
    for (const node of nodes) {
      const card = el('section', 'editor-section'),
        heading = el('div', 'section-heading');
      heading.append(el('h2', '', node.label), el('span', 'type-label', node.type));
      card.append(heading, valueEditor(node, { ...context, session }));
      body.append(card);
    }
  }
  function props() {
    const items = properties(record, session.doc.bytes(record)).sort(
        (a, b) => (a.group === 'Transform' ? 1 : 0) - (b.group === 'Transform' ? 1 : 0),
      ),
      groups = new Map();
    for (const item of items) {
      if (!groups.has(item.group)) {
        const group = el('section', 'editor-section property-group');
        group.append(el('h2', '', item.group));
        groups.set(item.group, group);
        body.append(group);
      }
      const input = control(
        item.kind === 'text' ? 'String' : item.kind === 'float' ? 'Float' : 'ConfigReference',
        item.value,
        (value) => {
          session.doc.change(
            record,
            writeProperty(session.doc.bytes(record), item, value),
            'Edit ' + item.label,
          );
          if (item.label === 'Name') record.name = String(value);
          context.changed('Updated ' + item.label);
        },
        { label: item.group + ' / ' + item.label, disabled: session.doc.container.version !== 1 },
      );
      groups.get(item.group).append(field(item.label, input));
    }
    if (!items.length)
      body.append(
        el('div', 'empty-state', 'There are no supported properties to edit on this object yet.'),
        el('p', 'muted', 'This data is preserved when you export the file.'),
      );
  }
  draw(selected);
}
