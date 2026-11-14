import { $ } from './util.js';

// ===== Общие элементы интерфейса: нижнее окно (sheet) и всплывающее сообщение (toast) =====
export function sheet(html) { closeSheet(); const d = document.createElement('div'); d.className = 'sheet-bg'; d.id = 'sheet'; d.innerHTML = `<div class="sheet stack">${html}</div>`; d.addEventListener('click', e => { if (e.target === d) closeSheet(); }); document.body.appendChild(d); }
export function closeSheet() { $('#sheet')?.remove(); }
export function toast(t) { $('.toast')?.remove(); const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3200); }
