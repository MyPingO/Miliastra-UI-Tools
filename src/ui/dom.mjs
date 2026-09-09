export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function button(text, action, cls = '') {
  const node = el('button', cls, text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}
export function download(name, data, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type })),
    a = el('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function field(label, input) {
  const node = el('label', 'field');
  node.append(el('span', 'field-label', label), input);
  return node;
}
export function control(type, value, onChange, { label = '', disabled = false } = {}) {
  const shortFloat = (n) => {
    for (let p = 1; p <= 9; p++) {
      const v = Number(n.toPrecision(p));
      if (Math.fround(v) === n) return String(v);
    }
    return String(n);
  };
  let input;
  if (type === 'Bool') {
    input = el('select');
    for (const value of ['true', 'false']) {
      const o = el('option', '', value);
      o.value = value;
      input.append(o);
    }
    input.value = String(value);
  } else {
    input = el(type === 'String' ? 'textarea' : 'input');
    if (input.tagName === 'TEXTAREA')
      input.rows = Math.min(
        5,
        Math.max(
          1,
          String(value ?? '').split('\n').length,
          Math.ceil(String(value ?? '').length / 95),
        ),
      );
    else input.type = 'text';
    input.value = Array.isArray(value)
      ? value.map((v) => (typeof v === 'number' ? shortFloat(v) : v)).join(', ')
      : type === 'Float' && typeof value === 'number'
        ? shortFloat(value)
        : String(value ?? '');
    if (['Int32', 'Float'].includes(type)) input.inputMode = 'decimal';
  }
  input.setAttribute('aria-label', label);
  input.disabled = disabled;
  input.spellcheck = false;
  let pending = false;
  input.addEventListener('input', () => {
    pending = true;
    input.dataset.pending = 'true';
  });
  const commit = () => {
    try {
      input.removeAttribute('aria-invalid');
      input.setCustomValidity('');
      onChange(type === 'Bool' ? input.value === 'true' : input.value);
      pending = false;
      delete input.dataset.pending;
    } catch (error) {
      input.setAttribute('aria-invalid', 'true');
      input.setCustomValidity(error.message);
      input.title = error.message;
      input.dispatchEvent(
        new CustomEvent('editor-error', { bubbles: true, detail: error.message }),
      );
    }
  };
  input.addEventListener('change', commit);
  input.addEventListener('blur', () => {
    if (pending) commit();
  });
  return input;
}
export function checkInputs() {
  const invalid = document.querySelector('[aria-invalid="true"]');
  if (invalid) {
    invalid.focus();
    throw new Error(invalid.validationMessage || 'Fix the highlighted value before continuing.');
  }
}
export function modal(title, build) {
  const dialog = el('dialog', 'modal'),
    header = el('div', 'modal-header'),
    body = el('div', 'modal-body'),
    footer = el('div', 'modal-footer'),
    error = el('p', 'error');
  error.setAttribute('role', 'alert');
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  header.append(el('h2', '', title), button('×', close, 'icon-button'));
  dialog.append(header, body, error, footer);
  dialog.addEventListener('cancel', () => dialog.remove());
  document.body.append(dialog);
  build({ body, footer, close, error });
  dialog.showModal();
  return dialog;
}
export const numberFormat = (n) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
