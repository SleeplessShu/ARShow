// js/ui.js — UI утилиты: дропдаун, тосты, оверлей загрузки
import * as State from './state.js';
import { fileEmoji } from './models.js';

const $ = id => document.getElementById(id);

// ── Статус-бар ───────────────────────────────────────────
export function setStatus(text) {
  $('status-bar').textContent = text;
}

// ── Тост с ошибкой ───────────────────────────────────────
export function showError(msg) {
  const t = $('error-toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Оверлей загрузки ─────────────────────────────────────
export function showLoadingOverlay(text) {
  $('loading-label').textContent = text;
  $('loading-overlay').classList.add('show');
}
export function hideLoadingOverlay() {
  $('loading-overlay').classList.remove('show');
}

// ── AR Dropdown ──────────────────────────────────────────
export function buildDropdown() {
  const dd = $('model-dropdown');
  dd.innerHTML = '';
  State.modelList.forEach((m, i) => {
    const item = document.createElement('div');
    item.className = 'dropdown-item' + (i === State.currentModelIdx ? ' active' : '');
    item.dataset.idx = i;
    item.innerHTML = `
      <div class="item-icon">${fileEmoji(m.file)}</div>
      <div class="item-info">
        <span class="item-name">${m.label || m.id}</span>
        <span class="item-file">${m.file}</span>
      </div>
      <svg class="item-check" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 8l3.5 3.5L13 4.5" stroke="#6c47ff" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    item.addEventListener('click', () => onDropdownSelect(i));
    dd.appendChild(item);
  });
}

export function showDropdownError(msg) {
  $('model-dropdown').innerHTML = `
    <div class="dropdown-loading" style="flex-direction:column;gap:6px;color:#ff8877;padding:18px;">
      <span>⚠️</span><span style="font-size:0.75rem;">${msg}</span>
    </div>`;
}

// Вызывается при выборе модели в дропдауне (AR режим)
async function onDropdownSelect(idx) {
  State.setCurrentModelIdx(idx);
  document.querySelectorAll('.dropdown-item').forEach((el, i) =>
    el.classList.toggle('active', i === idx)
  );
  $('model-dropdown-wrap').classList.remove('visible');

  // Если уже стоит — заменить
  if (State.placedObject) {
    const { swapPlacedModel } = await import('./ar.js');
    await swapPlacedModel();
  }
}

// ── placed-only кнопки ───────────────────────────────────
export function enablePlacedButtons() {
  document.querySelectorAll('.placed-only').forEach(b => b.classList.add('enabled'));
}
export function disablePlacedButtons() {
  document.querySelectorAll('.placed-only').forEach(b => b.classList.remove('enabled'));
}
