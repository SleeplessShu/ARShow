// js/interaction.js — AR режим: тап, свайп, pinch
import * as State from './state.js';
import { placeModel } from './ar.js';

export function setupARInteraction() {
  // DOM события в WebXR dom-overlay могут не работать —
  // используем document level listeners которые работают всегда
  let touches = {};
  let tapStartX = 0, tapStartY = 0;
  let tapStartTime = 0;
  const TAP_MAX_MOVE = 10; // px
  const TAP_MAX_TIME = 300; // ms

  document.addEventListener('touchstart', e => {
    for (const t of e.changedTouches)
      touches[t.identifier] = { x: t.clientX, y: t.clientY, time: Date.now() };

    if (e.touches.length === 1) {
      tapStartX = e.touches[0].clientX;
      tapStartY = e.touches[0].clientY;
      tapStartTime = Date.now();
    }
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!State.placedObject) return;

    if (e.touches.length === 1) {
      // Один палец — вращение по горизонтали
      const t    = e.touches[0];
      const prev = touches[t.identifier];
      if (!prev) return;
      const dx = t.clientX - prev.x;
      State.placedObject.rotation.y += dx * 0.012;
      State.setLastYaw(State.placedObject.rotation.y);
      touches[t.identifier] = { x: t.clientX, y: t.clientY, time: Date.now() };

    } else if (e.touches.length === 2) {
      // Два пальца — pinch масштаб
      const t0 = e.touches[0], t1 = e.touches[1];
      const p0 = touches[t0.identifier];
      const p1 = touches[t1.identifier];
      if (!p0 || !p1) return;

      const dist     = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const prevDist = Math.hypot(p0.x - p1.x, p0.y - p1.y);

      if (prevDist > 0) {
        const cur      = State.placedObject.scale.x;
        const newScale = Math.max(0.01, Math.min(2.0, cur * (dist / prevDist)));
        State.placedObject.scale.setScalar(newScale);
        State.setScaleVal(newScale);
      }

      touches[t0.identifier] = { x: t0.clientX, y: t0.clientY, time: Date.now() };
      touches[t1.identifier] = { x: t1.clientX, y: t1.clientY, time: Date.now() };
    }
  }, { passive: true });

  document.addEventListener('touchend', e => {
    for (const t of e.changedTouches) delete touches[t.identifier];
  }, { passive: true });

  // Кнопка Выйти
  const exitBtn = document.getElementById('ar-btn-exit');
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      if (State.xrSession) State.xrSession.end();
    });
    exitBtn.addEventListener('touchend', e => {
      e.stopPropagation();
      if (State.xrSession) State.xrSession.end();
    }, { passive: true });
  }
}
