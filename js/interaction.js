// js/interaction.js — AR режим: касания, pinch-масштаб, тулбар
import * as State from './state.js';
import { setStatus, disablePlacedButtons } from './ui.js';
import { placeModel } from './ar.js';

const $ = id => document.getElementById(id);

export function setupARInteraction() {
  const overlay = $('ui-overlay');

  // Тап по сцене — разместить / переместить модель
  overlay.addEventListener('click', e => {
    if (e.target.closest('#ar-toolbar')) return;
    placeModel();
  });

  // ── Pinch-to-zoom + rotate (1 палец = вращение, 2 = масштаб) ──
  const touches = {};

  overlay.addEventListener('touchstart', e => {
    if (e.target.closest('#ar-toolbar')) return;
    for (const t of e.changedTouches)
      touches[t.identifier] = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  overlay.addEventListener('touchmove', e => {
    if (e.target.closest('#ar-toolbar')) return;
    if (!State.placedObject) return;

    if (e.touches.length === 1) {
      const t    = e.touches[0];
      const prev = touches[t.identifier];
      if (!prev) return;
      const dx = t.clientX - prev.x;
      State.placedObject.rotation.y += dx * 0.012;
      State.setLastYaw(State.placedObject.rotation.y);
      touches[t.identifier] = { x: t.clientX, y: t.clientY };

    } else if (e.touches.length === 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      const p0 = touches[t0.identifier] || { x: t0.clientX, y: t0.clientY };
      const p1 = touches[t1.identifier] || { x: t1.clientX, y: t1.clientY };

      const dist     = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const prevDist = Math.hypot(p0.x - p1.x, p0.y - p1.y);
      if (prevDist > 0) {
        const factor   = dist / prevDist;
        const curScale = State.placedObject.scale.x; // берём текущий реальный масштаб
        const newScale = Math.max(0.01, Math.min(2, curScale * factor));
        State.placedObject.scale.setScalar(newScale);
        State.setScaleVal(newScale);
      }

      touches[t0.identifier] = { x: t0.clientX, y: t0.clientY };
      touches[t1.identifier] = { x: t1.clientX, y: t1.clientY };
    }
  }, { passive: true });

  overlay.addEventListener('touchend', e => {
    for (const t of e.changedTouches) delete touches[t.identifier];
  }, { passive: true });

  // Кнопка Выйти
  $('ar-btn-exit').addEventListener('click', () => {
    if (State.xrSession) State.xrSession.end();
  });
}
