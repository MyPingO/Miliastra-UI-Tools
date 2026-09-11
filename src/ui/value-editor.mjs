import { el, button, control, field, modal } from './dom.mjs';
import { listEditor } from './list-editor.mjs';
import { scalar, JSON_TYPES } from '../models/json.mjs';
export function valueEditor(node, context, depth = 0) {
  const host = el('div', 'value-node');
  if (node.rename) {
    const name = control(
      'String',
      node.label,
      (v) => {
        node.rename(v);
        const heading =
          host.closest('.nested-node')?.querySelector('summary span') ||
          host.closest('.editor-section')?.querySelector('h2');
        if (heading) heading.textContent = v;
        context.changed('Renamed field.');
      },
      { label: 'Name' },
    );
    host.append(field('Name', name));
  }
  for (const item of node.metadata || []) {
    let input;
    if (item.options) {
      input = el('select');
      item.options.forEach((v) => {
        const option = el('option', '', v);
        option.value = v;
        input.append(option);
      });
      input.value = item.value;
      input.disabled = !!item.disabled;
      input.onchange = () =>
        context.run(() => {
          item.set(input.value);
          context.refresh();
          context.changed('Updated ' + item.label);
        });
    } else
      input = control(
        item.type,
        item.value,
        (v) => {
          item.set(v);
          context.changed('Updated ' + item.label);
        },
        { label: item.label },
      );
    host.append(field(item.label, input));
  }
  if (node.addRow)
    host.append(
      button('Add row', () =>
        context.run(() => {
          node.addRow();
          context.refresh();
          context.changed('Added row.');
        }),
      ),
    );
  if (depth > 24) {
    host.append(el('p', 'muted', 'Maximum nesting depth reached.'));
    return host;
  }
  if (node.kind === 'readonly') {
    host.append(
      el(
        'pre',
        'readonly',
        typeof node.value === 'string' ? node.value : JSON.stringify(node.value, null, 2),
      ),
    );
    return host;
  }
  if (node.kind === 'scalar') {
    const input = control(
      node.type,
      node.value,
      (value) => {
        node.set(scalar(node.type, value));
        context.changed('Updated ' + node.label);
      },
      { label: node.label, disabled: !node.editable },
    );
    host.append(field(node.label, input));
    return host;
  }
  if (node.kind === 'list') {
    const defaultValue =
      node.element === 'String'
        ? ''
        : node.element === 'Bool'
          ? false
          : node.element === 'Vector3'
            ? [0, 0, 0]
            : 0;
    host.append(
      listEditor({
        title: node.label,
        view: context.view?.(node.key) || {},
        columns: [{ id: 'value', label: node.element, type: node.element }],
        rows: node.value.map((value) => ({ values: { value } })),
        defaultRow: () => ({ values: { value: defaultValue } }),
        editable: node.editable,
        onSave: (rows) => node.set(rows.map((r) => r.values.value)),
        notify: context.changed,
      }),
    );
    return host;
  }
  const children =
    node.kind === 'dictionary'
      ? node.entries.map((entry, i) => ({
          label: `${entry.key.value ?? 'Entry ' + (i + 1)}`,
          entry,
          index: i,
        }))
      : node.children.map((child, i) => ({ label: child.label, child, index: i }));
  if (node.kind === 'dictionary')
    host.append(
      el(
        'p',
        'node-caption',
        `${node.keyType || ''} → ${node.valueType || ''} · ${children.length} ${children.length === 1 ? 'entry' : 'entries'}${node.editable ? '' : ' · Editing this dictionary is not supported yet'}`,
      ),
    );
  if (node.add) {
    const b = button(node.kind === 'dictionary' ? 'Add entry' : 'Add field', () =>
      context.run(() => {
        if (node.kind === 'dictionary') {
          context.run(() => {
            node.add();
            context.refresh();
            context.changed('Added entry.');
          });
          return;
        }
        modal('Add Structure field', ({ body, footer, close, error }) => {
          const name = el('input');
          name.placeholder = 'Field name';
          const type = el('select');
          JSON_TYPES.forEach((t) => {
            const o = el('option', '', t);
            o.value = t;
            type.append(o);
          });
          body.append(field('Name', name), field('Type', type));
          footer.append(
            button('Cancel', close),
            button(
              'Add',
              () => {
                try {
                  node.add(type.value, name.value.trim() || undefined);
                  context.refresh();
                  context.changed('Added field.');
                  close();
                } catch (e) {
                  error.textContent = e.message;
                }
              },
              'primary',
            ),
          );
        });
      }),
    );
    host.append(b);
  }
  if (!children.length) {
    host.append(el('p', 'empty-note', node.kind === 'rows' ? 'This list is empty.' : 'No fields.'));
    return host;
  }
  const view = context.view?.(node.key) || {};
  let page = view.page || 0;
  const body = el('div');
  host.append(body);
  function draw() {
    body.replaceChildren();
    const count = 20;
    page = Math.min(page, Math.max(0, Math.ceil(children.length / count) - 1));
    view.page = page;
    for (const item of children.slice(page * count, (page + 1) * count)) {
      const detail = el('details', 'nested-node'),
        summary = el('summary');
      detail.dataset.nodeKey = node.key + '/' + item.index;
      const detailView = context.view?.(detail.dataset.nodeKey) || {};
      summary.append(
        el('span', '', item.label),
        el('span', 'type-label', item.child?.type || 'Entry'),
      );
      detail.append(summary);
      let loaded = false;
      detail.addEventListener('toggle', () => {
        detailView.open = detail.open;
        if (!detail.open || loaded) return;
        loaded = true;
        const inner = el('div', 'nested-body');
        if (item.entry)
          inner.append(
            valueEditor(item.entry.key, context, depth + 1),
            valueEditor(item.entry.value, context, depth + 1),
          );
        else inner.append(valueEditor(item.child, context, depth + 1));
        if (node.arrayPath && context.session.format === 'JSON') {
          const tools = el('div', 'nested-actions');
          for (const action of ['up', 'down', 'duplicate', 'remove']) {
            const b = button(
              { up: 'Move up', down: 'Move down', duplicate: 'Duplicate', remove: 'Remove' }[
                action
              ],
              () =>
                context.run(() => {
                  context.session.editArray(node.arrayPath, item.index, action);
                  context.refresh();
                  context.changed('Updated ' + node.label);
                }),
            );
            b.disabled =
              (action === 'up' && item.index === 0) ||
              (action === 'down' && item.index === children.length - 1) ||
              (node.kind === 'dictionary' && action === 'duplicate');
            tools.append(b);
          }
          inner.append(tools);
        }
        detail.append(inner);
      });
      body.append(detail);
      detail.open = detailView.open ?? (depth === 0 && children.length <= 3);
    }
    if (children.length > count) {
      const pager = el('div', 'pager'),
        prev = button('Previous', () =>
          context.run(() => {
            page--;
            draw();
          }),
        ),
        next = button('Next', () =>
          context.run(() => {
            page++;
            draw();
          }),
        );
      prev.disabled = page === 0;
      next.disabled = (page + 1) * count >= children.length;
      pager.append(
        prev,
        el(
          'span',
          'muted',
          `${page * count + 1}–${Math.min((page + 1) * count, children.length)} of ${children.length}`,
        ),
        next,
      );
      body.append(pager);
    }
  }
  draw();
  return host;
}
