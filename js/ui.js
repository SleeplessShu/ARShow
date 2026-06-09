// js/ui.js — UI утилиты: дропдаун, тосты, оверлей загрузки
import * as State from './state.js';

const $ = id => document.getElementById(id);

// ── Статус-бар ───────────────────────────────────────────
export function setStatus(text) {
  $('status-bar').textContent = text;
}

// ── Тост с ошибкой ───────────────────────────────────────
export function showError(msg) {
  const t = $('error-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Оверлей загрузки ─────────────────────────────────────
export function showLoadingOverlay(text) {
  const l = $('loading-label');
  const o = $('loading-overlay');
  if (l) l.textContent = text;
  if (o) o.classList.add('show');
}
export function hideLoadingOverlay() {
  const o = $('loading-overlay');
  if (o) o.classList.remove('show');
}

// ── AR Dropdown ──────────────────────────────────────────
export function buildDropdown() {
  const dd = $('model-dropdown');
  if (!dd) return;
  dd.innerHTML = '';
  State.modelList.forEach((m, i) => {
    const item = document.createElement('div');
    item.className = 'dropdown-item' + (i === State.currentModelIdx ? ' active' : '');
    item.innerHTML = `
      <div class="item-icon">📦</div>
      <div class="item-info">
        <span class="item-name">${m.label || m.id}</span>
        <span class="item-file">${m.file}</span>
      </div>
      <svg class="item-check" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 8l3.5 3.5L13 4.5" stroke="#d0d0d0" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    item.addEventListener('click', () => onDropdownSelect(i));
    dd.appendChild(item);
  });
}

export function showDropdownError(msg) {
  const dd = $('model-dropdown');
  if (!dd) return;
  dd.innerHTML = `
    <div class="dropdown-loading" style="flex-direction:column;gap:6px;color:#ff8877;padding:18px;">
      <span>⚠️</span><span style="font-size:0.75rem;">${msg}</span>
    </div>`;
}

async function onDropdownSelect(idx) {
  State.setCurrentModelIdx(idx);
  document.querySelectorAll('.dropdown-item').forEach((el, i) =>
    el.classList.toggle('active', i === idx)
  );
  const ddWrap = $('model-dropdown-wrap');
  if (ddWrap) ddWrap.classList.remove('visible');

  if (State.placedObject) {
    const { swapPlacedModel } = await import('./ar.js');
    await swapPlacedModel();
  }
}

export function enablePlacedButtons() {
  document.querySelectorAll('.placed-only').forEach(b => b.classList.add('enabled'));
}
export function disablePlacedButtons() {
  document.querySelectorAll('.placed-only').forEach(b => b.classList.remove('enabled'));
}
