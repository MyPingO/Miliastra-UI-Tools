import * as W from '../../assets/game-wire.mjs';
import {
  properties,
  storedFields,
  writeProperty,
  fieldPath,
} from '../../assets/game-properties.mjs';
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
    el('div', 'eyebrow', record.kind === 'json' ? 'JSON document' : record.kind),
    el('h1', '', record.name),
  );
  const meta = el('div', 'object-meta');
  meta.append(el('span', '', record.id));
  if (session.doc) meta.append(el('span', '', numberFormat(session.doc.bytes(record).length)));
  titles.append(meta);
  header.append(titles);
  host.append(header);
  const tabs = el('div', 'inspector-tabs'),
    body = el('div', 'inspector-body');
  host.append(tabs, body);
  let selected = context.tab || 'data';
  if (session.format === 'JSON') selected = 'data';
  for (const [key, label] of [
    ['data', 'Lists & variables'],
    ['properties', 'Properties'],
    ['advanced', 'Advanced fields'],
  ]) {
    if (session.format === 'JSON' && key !== 'data') continue;
    const b = button(label, () =>
      context.run(() => {
        context.setTab(key);
        draw(key);
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
    else advanced();
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
        if (list.kind === 'choice' && formalConfig(session.doc, record))
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
        button(
          'Edit properties',
          () => {
            context.setTab('properties');
            draw('properties');
          },
          'primary',
        ),
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
        el('div', 'empty-state', 'No mapped properties for this object.'),
        button('Inspect stored fields', () => {
          context.setTab('advanced');
          draw('advanced');
        }),
      );
    else body.append(el('p', 'muted', 'Other stored properties are available in Advanced fields.'));
  }
  function advanced() {
    const note = el(
      'p',
      'advanced-note',
      'Edit existing stored values by field path. Field numbers do not establish their meaning; ID references and enum values must remain consistent with the game. Unknown byte blocks are preserved.',
    );
    body.append(note);
    const result = storedFields(session.doc.bytes(record)),
      search = el('input');
    search.type = 'search';
    search.placeholder = 'Filter field paths or values';
    search.setAttribute('aria-label', 'Filter stored fields');
    body.append(search);
    const fieldsHost = el('div');
    body.append(fieldsHost);
    let page = 0;
    const render = () => {
      fieldsHost.replaceChildren();
      const query = search.value.toLowerCase(),
        fields = result.fields.filter(
          (f) => !query || `${fieldPath(f.path)} ${f.value}`.toLowerCase().includes(query),
        );
      fieldsHost.append(
        el(
          'p',
          'node-caption',
          `${fields.length} stored values${result.truncated ? ' · Large branches truncated' : ''}`,
        ),
      );
      for (const item of fields.slice(page * 60, (page + 1) * 60)) {
        const row = el('div', 'advanced-row'),
          label = el('div');
        label.append(el('code', '', fieldPath(item.path)));
        const kind = el('select');
        const choices = item.kind === 'fixed32' ? ['fixed32', 'float'] : [item.kind];
        choices.forEach((k) => {
          const option = el(
            'option',
            '',
            {
              fixed32: 'UInt32 bits',
              fixed64: 'UInt64 bits',
              uint: 'Varint',
              text: 'Text',
              float: 'Float32',
            }[k],
          );
          option.value = k;
          kind.append(option);
        });
        label.append(kind);
        row.append(label);
        let value = item.value;
        const make = () =>
          control(
            kind.value === 'text' ? 'String' : kind.value === 'float' ? 'Float' : 'ConfigReference',
            value,
            (v) => {
              session.doc.change(
                record,
                writeProperty(session.doc.bytes(record), { ...item, kind: kind.value }, v),
                'Edit stored field',
              );
              context.changed('Updated stored field.');
            },
            { label: fieldPath(item.path), disabled: session.doc.container.version !== 1 },
          );
        let input = make();
        row.append(input);
        kind.onchange = () => {
          const raw = W.at(session.doc.bytes(record), item.path.slice(0, -1)),
            [n, i] = item.path.at(-1),
            f = W.parse(raw).find((f) => f.number === n && f.occurrence === i);
          value =
            kind.value === 'float'
              ? W.float(f.value)
              : String(new DataView(f.value.buffer, f.value.byteOffset, 4).getUint32(0, true));
          const next = make();
          input.replaceWith(next);
          input = next;
        };
        fieldsHost.append(row);
      }
      if (fields.length > 60) {
        const pager = el('div', 'pager'),
          prev = button('Previous', () => {
            page--;
            render();
          }),
          next = button('Next', () => {
            page++;
            render();
          });
        prev.disabled = page === 0;
        next.disabled = (page + 1) * 60 >= fields.length;
        pager.append(prev, el('span', 'muted', `Page ${page + 1}`), next);
        fieldsHost.append(pager);
      }
    };
    search.oninput = () => {
      page = 0;
      render();
    };
    render();
  }
  draw(selected);
}
