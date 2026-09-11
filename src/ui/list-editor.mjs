import { el, button, control, field, modal, download, checkInputs } from './dom.mjs';
import { scalar } from '../models/json.mjs';
import { readCSV, writeCSV } from '../core/csv.mjs';
// One table implementation for component rows, variable lists and JSON lists.
export function listEditor({
  title,
  columns,
  rows: initial,
  onSave,
  notify,
  minRows = 0,
  editable = true,
  defaultRow,
  view = {},
}) {
  const host = el('div', 'list-editor');
  let rows = initial.map((r) => ({ ...r, values: { ...r.values } })),
    page = view.page || 0;
  const pageSize = 40;
  const run = (action) => {
    try {
      checkInputs();
      action();
    } catch (e) {
      notify(e.message, true);
    }
  };
  const normalize = (next) => {
    if (next.length < minRows || next.length > 10000)
      throw new Error(`Keep ${minRows}–10,000 rows.`);
    return next.map((row) => ({
      ...row,
      values: Object.fromEntries(
        Object.entries(row.values).map(([id, v]) => {
          const column = columns.find((c) => c.id === id);
          return [id, column ? scalar(column.type, v) : v];
        }),
      ),
    }));
  };
  const save = (next) => {
    const values = normalize(next);
    onSave(values);
    rows = values;
    notify(`Updated ${title.toLowerCase()}. Export the file to keep your changes.`);
  };
  const clone = (row) => ({ ...row, values: structuredClone(row.values) });
  const exportData = (format) => {
    const values = rows.map((r) => r.values);
    if (format === 'json')
      download(
        title + '.json',
        JSON.stringify(
          columns.length === 1 ? values.map((v) => v[columns[0].id]) : values,
          null,
          2,
        ),
        'application/json',
      );
    else
      download(
        title + '.csv',
        writeCSV([
          columns.map((c) => c.id),
          ...values.map((v) =>
            columns.map((c) => (Array.isArray(v[c.id]) ? v[c.id].join(',') : v[c.id])),
          ),
        ]),
        'text/csv',
      );
    notify(`Downloaded ${title} as ${format.toUpperCase()}.`);
  };
  const bulk = () =>
    modal('Edit list data', ({ body, footer, error, close }) => {
      const format = el('select');
      for (const name of ['JSON', 'CSV', 'Lines']) {
        const option = el('option', '', name);
        option.value = name;
        format.append(option);
      }
      if (columns.length > 1) format.lastElementChild.disabled = true;
      const text = el('textarea', 'code-input');
      text.rows = 14;
      text.setAttribute('aria-label', 'Bulk list data');
      const fill = () => {
        text.value =
          format.value === 'JSON'
            ? JSON.stringify(
                columns.length === 1
                  ? rows.map((r) => r.values[columns[0].id])
                  : rows.map((r) => r.values),
                null,
                2,
              )
            : format.value === 'CSV'
              ? writeCSV([
                  columns.map((c) => c.id),
                  ...rows.map((r) => columns.map((c) => r.values[c.id])),
                ])
              : rows.map((r) => r.values[columns[0].id]).join('\n');
      };
      fill();
      let previousFormat = format.value;
      const drafts = new Map();
      format.onchange = () => {
        drafts.set(previousFormat, text.value);
        if (drafts.has(format.value)) text.value = drafts.get(format.value);
        else fill();
        previousFormat = format.value;
        error.textContent = '';
      };
      const upload = el('input');
      upload.type = 'file';
      upload.accept = '.json,.csv,.txt';
      upload.onchange = async () => {
        const file = upload.files[0];
        if (file) {
          try {
            const extension = file.name.toLowerCase().split('.').at(-1);
            if (!['csv', 'txt', 'json'].includes(extension))
              throw new Error('Choose a JSON, CSV, or text file.');
            if (extension === 'txt' && columns.length > 1)
              throw new Error('Use JSON or CSV for a list with multiple columns.');
            if (file.size > 8 * 1024 * 1024)
              throw new Error('List data files must be smaller than 8 MB.');
            const value = await file.text();
            drafts.set(format.value, text.value);
            format.value = extension === 'csv' ? 'CSV' : extension === 'txt' ? 'Lines' : 'JSON';
            previousFormat = format.value;
            text.value = value;
            error.textContent = '';
          } catch (e) {
            error.textContent = e.message;
          }
        }
      };
      body.append(
        el(
          'p',
          'muted',
          columns.length > 1
            ? 'Use JSON objects or CSV with column headers. Rows copy the corresponding existing row; additional rows use the last row as a template.'
            : 'Paste a JSON array, CSV with a value header, or one value per line.',
        ),
        field('Format', format),
        text,
        field('Import data file', upload),
        el(
          'p',
          'muted',
          `Applying replaces this list's ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}. Each format keeps its own draft until this dialog closes.`,
        ),
      );
      footer.append(
        button('Cancel', close),
        button(
          'Replace list',
          () => {
            try {
              let values;
              if (format.value === 'JSON') {
                values = JSON.parse(text.value);
                if (!Array.isArray(values)) throw new Error('Expected a JSON array.');
                if (columns.length === 1) values = values.map((v) => ({ [columns[0].id]: v }));
              } else if (format.value === 'Lines')
                values =
                  text.value === ''
                    ? []
                    : text.value
                        .replace(/\r\n/g, '\n')
                        .split('\n')
                        .map((v) => ({ [columns[0].id]: v }));
              else {
                const csv = readCSV(text.value),
                  header = csv.shift() || [];
                if (header.length !== columns.length || columns.some((c) => !header.includes(c.id)))
                  throw new Error('CSV headers must be: ' + columns.map((c) => c.id).join(', '));
                values = csv.map((row) => {
                  if (row.length !== header.length)
                    throw new Error('CSV row has the wrong number of columns.');
                  return Object.fromEntries(header.map((key, i) => [key, row[i]]));
                });
              }
              const next = values.map((values, i) => {
                if (!values || typeof values !== 'object' || Array.isArray(values))
                  throw new Error('Expected an object for each row.');
                const base = rows[Math.min(i, rows.length - 1)] || defaultRow?.();
                if (!base) throw new Error('Add a template row first.');
                for (const key of Object.keys(values))
                  if (!columns.some((c) => c.id === key)) throw new Error('Unknown column: ' + key);
                return { ...clone(base), values: { ...base.values, ...values } };
              });
              save(next);
              page = 0;
              draw();
              close();
            } catch (e) {
              error.textContent = e.message;
            }
          },
          'primary',
        ),
      );
    });
  const generate = () =>
    modal('Generate rows', ({ body, footer, error, close }) => {
      const template = el('select');
      rows.forEach((row, i) => {
        const o = el('option', '', `${i + 1}. ${Object.values(row.values)[0]}`);
        o.value = String(i);
        template.append(o);
      });
      const column = columns[0];
      const pattern = el('input');
      pattern.value = 'Item {n}';
      const count = el('input');
      count.value = '10';
      count.inputMode = 'numeric';
      const start = el('input');
      start.value = '1';
      start.inputMode = 'numeric';
      const sequence = !['String', 'Bool', 'Vector3'].includes(column.type);
      if (!rows.length) template.append(el('option', '', 'Default values'));
      body.append(
        el(
          'p',
          'muted',
          column.type === 'String'
            ? `Append rows and fill “${column.label}” using the pattern. Other values are copied from the template row.`
            : sequence
              ? `Append a number sequence in “${column.label}”. Other values are copied from the template row.`
              : 'Append copies of the template row.',
        ),
        field('Template row', template),
      );
      if (column.type === 'String')
        body.append(field('Name pattern · {n} is the row number', pattern));
      body.append(field('Count', count));
      if (column.type === 'String' || sequence) body.append(field('Start at', start));
      footer.append(
        button('Cancel', close),
        button(
          'Append rows',
          () => {
            try {
              const amount = Number(count.value),
                first = Number(start.value);
              if (
                !Number.isInteger(amount) ||
                amount < 1 ||
                amount > 10000 ||
                !Number.isSafeInteger(first) ||
                !start.value.trim() ||
                !Number.isSafeInteger(first + amount - 1)
              )
                throw new Error('Enter a count of 1–10,000 and a whole start number.');
              const source = rows[Number(template.value)] || defaultRow?.();
              if (!source) throw new Error('Add a template row first.');
              const generated = Array.from({ length: amount }, (_, i) => {
                const row = clone(source);
                row.values[column.id] =
                  column.type === 'String'
                    ? pattern.value.replaceAll('{n}', String(first + i))
                    : column.type === 'Bool'
                      ? source.values[column.id]
                      : column.type === 'Vector3'
                        ? source.values[column.id]
                        : first + i;
                return row;
              });
              save([...rows, ...generated]);
              page = Math.floor((rows.length - 1) / pageSize);
              draw();
              close();
            } catch (e) {
              error.textContent = e.message;
            }
          },
          'primary',
        ),
      );
    });
  function draw() {
    host.replaceChildren();
    const toolbar = el('div', 'table-toolbar');
    const add = button('Add row', () =>
      run(() => {
        const source = defaultRow?.() || rows.at(-1);
        if (!source) throw new Error('No template row available.');
        const fresh = clone(source);
        if (!defaultRow)
          for (const c of columns) {
            if (c.preserveOnAdd || !(c.id in fresh.values)) continue;
            fresh.values[c.id] =
              c.type === 'String'
                ? ''
                : c.type === 'Bool'
                  ? false
                  : c.type === 'Vector3'
                    ? [0, 0, 0]
                    : 0;
          }
        save([...rows, fresh]);
        page = Math.floor((rows.length - 1) / pageSize);
        draw();
      }),
    );
    const generateButton = button('Generate', () => run(generate)),
      bulkButton = button('Bulk edit / import', () => run(bulk));
    [add, generateButton, bulkButton].forEach((b) => (b.disabled = !editable));
    toolbar.append(
      add,
      generateButton,
      bulkButton,
      el('span', 'toolbar-spacer'),
      button('JSON ↓', () => run(() => exportData('json'))),
      button('CSV ↓', () => run(() => exportData('csv'))),
      el('span', 'count', `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`),
    );
    host.append(toolbar);
    if (!editable)
      host.append(
        el(
          'p',
          'muted',
          'This list can be viewed and downloaded. Editing this format is not supported yet.',
        ),
      );
    else if (minRows)
      host.append(
        el(
          'p',
          'node-caption',
          'Keep at least one row. Duplicate copies a row; Add row starts new values using the same component settings.',
        ),
      );
    if (!rows.length) {
      host.append(el('p', 'empty-note', 'No rows. Add a row or import data.'));
      return;
    }
    page = Math.max(0, Math.min(page, Math.ceil(rows.length / pageSize) - 1));
    view.page = page;
    const wrap = el('div', 'table-scroll'),
      table = el('table', 'data-table'),
      thead = el('thead'),
      tr = el('tr');
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', title + ' rows');
    wrap.tabIndex = 0;
    tr.append(el('th', 'row-number', '#'));
    columns.forEach((c) => tr.append(el('th', '', c.label)));
    tr.append(el('th', 'row-actions', 'Actions'));
    thead.append(tr);
    table.append(thead);
    const tbody = el('tbody');
    rows.slice(page * pageSize, (page + 1) * pageSize).forEach((row, local) => {
      const i = page * pageSize + local,
        tr = el('tr');
      tr.append(el('td', 'row-number', i + 1));
      for (const column of columns) {
        const td = el('td');
        if (column.id in row.values)
          td.append(
            control(
              column.type,
              row.values[column.id],
              (value) => {
                const next = rows.map((r, j) =>
                  j === i ? { ...r, values: { ...r.values, [column.id]: value } } : r,
                );
                save(next);
              },
              { label: `${column.label}, row ${i + 1}`, disabled: !editable },
            ),
          );
        else td.append(el('span', 'muted', '—'));
        tr.append(td);
      }
      const actions = el('td', 'row-actions');
      for (const [action, text, label] of [
        ['up', '↑', 'Move up'],
        ['down', '↓', 'Move down'],
        ['duplicate', '⧉', 'Duplicate'],
        ['remove', '×', 'Remove'],
      ]) {
        const b = button(
          text,
          () =>
            run(() => {
              const next = [...rows];
              if (action === 'up') [next[i - 1], next[i]] = [next[i], next[i - 1]];
              if (action === 'down') [next[i + 1], next[i]] = [next[i], next[i + 1]];
              if (action === 'duplicate') next.splice(i + 1, 0, clone(next[i]));
              if (action === 'remove') next.splice(i, 1);
              save(next);
              if (action === 'up' || action === 'down')
                page = Math.floor((i + (action === 'up' ? -1 : 1)) / pageSize);
              if (action === 'duplicate') page = Math.floor((i + 1) / pageSize);
              draw();
            }),
          'icon-button',
        );
        b.title = label;
        b.setAttribute('aria-label', `${label} row ${i + 1}`);
        b.disabled =
          !editable ||
          (action === 'up' && i === 0) ||
          (action === 'down' && i === rows.length - 1) ||
          (action === 'remove' && rows.length <= minRows);
        actions.append(b);
      }
      tr.append(actions);
      tbody.append(tr);
    });
    table.append(tbody);
    wrap.append(table);
    host.append(wrap);
    wrap.scrollLeft = view.scrollLeft || 0;
    wrap.onscroll = () => (view.scrollLeft = wrap.scrollLeft);
    if (rows.length > pageSize) {
      const pager = el('div', 'pager'),
        prev = button('Previous', () =>
          run(() => {
            page--;
            draw();
          }),
        ),
        next = button('Next', () =>
          run(() => {
            page++;
            draw();
          }),
        );
      prev.disabled = page === 0;
      next.disabled = (page + 1) * pageSize >= rows.length;
      pager.append(
        prev,
        el(
          'span',
          'muted',
          `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, rows.length)} of ${rows.length}`,
        ),
        next,
      );
      host.append(pager);
    }
  }
  draw();
  return host;
}
