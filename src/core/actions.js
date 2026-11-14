import { esc } from './util.js';

// ===== Действия кнопок: data-action вместо onclick =====
// В разметке: <button ${act('go', 'ball')}> -> data-action="go" data-args='["ball"]'.
// Один обработчик на всё приложение ищет действие в реестре (registerActions) и вызывает его с аргументами.
// Вызвать с кнопки можно только зарегистрированное действие. Для полей ввода (data-change / data-input)
// первым аргументом приходит значение поля (checked для галочек).

export const ACTIONS = Object.create(null);
export function registerActions(map) { for (const k of Object.keys(map)) ACTIONS[k] = map[k]; }

export const attr = (kind, name, args) => ` data-${kind}="${esc(name)}"${args.length ? ` data-args="${esc(JSON.stringify(args))}"` : ''}`;
// атрибуты для кнопки/ссылки/клавиши SVG
export const act = (name, ...args) => attr('action', name, args);
// поле ввода: действие получает (значение, ...args) при change
export const onChange = (name, ...args) => attr('change', name, args);
// поле ввода: действие получает (значение, ...args) на каждом вводе
export const onInput = (name, ...args) => attr('input', name, args);

export function runAction(el, kind, withValue) {
  const name = el.getAttribute('data-' + kind), fn = ACTIONS[name];
  if (!fn) { console.warn('нет действия', name); return; }
  let args = [];
  try { args = JSON.parse(el.getAttribute('data-args') || '[]'); } catch (err) { console.warn('плохие data-args', name); return; }
  if (withValue) args.unshift(el.type === 'checkbox' ? el.checked : el.value);
  fn(...args);
}
export function initActions(root = document) {
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-action]'); if (!el) return;
    if (el.tagName === 'A') e.preventDefault();
    runAction(el, 'action', false);
  });
  root.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el) runAction(el, 'change', true); });
  root.addEventListener('input', e => { const el = e.target.closest('[data-input]'); if (el) runAction(el, 'input', true); });
}
