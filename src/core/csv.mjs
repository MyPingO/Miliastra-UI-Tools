export function readCSV(text) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell || closed) throw new Error('Unexpected quote in CSV.');
      quoted = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
      closed = false;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      closed = false;
    } else {
      if (closed) throw new Error('Unexpected text after a CSV quote.');
      cell += c;
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (cell || closed || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
export function writeCSV(rows) {
  return rows
    .map((row) =>
      row
        .map((v) => {
          const text = String(v ?? '');
          return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
        })
        .join(','),
    )
    .join('\r\n');
}
