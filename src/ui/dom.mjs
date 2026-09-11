const commits = new WeakMap();
let nextId = 0;
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
  if (!input.getAttribute('aria-label')) input.setAttribute('aria-label', label);
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
  const feedback = el('span', 'input-error');
  feedback.id = `input-error-${++nextId}`;
  feedback.setAttribute('role', 'alert');
  let pending = false,
    accepted = input.value;
  const clearError = () => {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    input.setCustomValidity('');
    input.removeAttribute('title');
    feedback.remove();
  };
  input.addEventListener('input', () => {
    pending = true;
    input.dataset.pending = 'true';
  });
  const commit = () => {
    if (input.value === accepted) {
      pending = false;
      delete input.dataset.pending;
      clearError();
      return;
    }
    try {
      onChange(type === 'Bool' ? input.value === 'true' : input.value);
      accepted = input.value;
      pending = false;
      delete input.dataset.pending;
      clearError();
    } catch (error) {
      input.setAttribute('aria-invalid', 'true');
      input.setCustomValidity(error.message);
      input.title = error.message;
      input.setAttribute('aria-describedby', feedback.id);
      feedback.textContent = error.message + ' Press Escape to restore the previous value.';
      input.after(feedback);
      input.dispatchEvent(
        new CustomEvent('editor-error', { bubbles: true, detail: error.message }),
      );
    }
  };
  commits.set(input, commit);
  input.addEventListener('change', commit);
  input.addEventListener('blur', () => {
    if (pending) commit();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (pending || input.hasAttribute('aria-invalid'))) {
      event.preventDefault();
      event.stopPropagation();
      input.value = accepted;
      pending = false;
      delete input.dataset.pending;
      clearError();
      input.dispatchEvent(new CustomEvent('editor-restored', { bubbles: true }));
    } else if (event.key === 'Enter' && input.tagName === 'INPUT') {
      event.preventDefault();
      commit();
    }
  });
  return input;
}
export function checkInputs(root = document) {
  // Flush drafts before commands, including keyboard-triggered downloads.
  for (const input of root.querySelectorAll('[data-pending="true"]')) commits.get(input)?.();
  const invalid = root.querySelector('[aria-invalid="true"]');
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
  const origin = document.activeElement;
  const close = () => {
    dialog.close();
    dialog.remove();
    if (origin?.isConnected) origin.focus();
  };
  const heading = el('h2', '', title),
    dismiss = button('×', close, 'icon-button');
  heading.id = `dialog-title-${++nextId}`;
  dialog.setAttribute('aria-labelledby', heading.id);
  dismiss.setAttribute('aria-label', 'Close dialog');
  header.append(heading, dismiss);
  dialog.append(header, body, error, footer);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  document.body.append(dialog);
  try {
    build({ body, footer, close, error });
    dialog.showModal();
    body
      .querySelector(
        'input:not([disabled]):not([type="file"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])',
      )
      ?.focus();
  } catch (cause) {
    dialog.remove();
    throw cause;
  }
  return dialog;
}
export const numberFormat = (n) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
