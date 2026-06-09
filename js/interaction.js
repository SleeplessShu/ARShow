// js/interaction.js — обработка касаний и тулбара в AR режиме
import * as State from './state.js';
import { setStatus, enablePlacedButtons, disablePlacedButtons } from './ui.js';
import { placeModel, swapPlacedModel } from './ar.js';

const $ = id => document.getElementById(id);

export function setupARInteraction() {
  const overlay = $('ui-overlay');

  // Тап по сцене — разместить модель
  overlay.addEventListener('click', e => {
    if (e.target.closest('#toolbar'))             return;
    if (e.target.closest('#model-dropdown-wrap')) return;
    if (e.target.closest('#scale-slider'))        return;
    if ($('model-dropdown-wrap').classList.contains('visible')) {
      $('model-dropdown-wrap').classList.remove('visible');
      return;
    }
    placeModel();
  });

  // Свайп для вращения стоящей модели
  overlay.addEventListener('touchstart', e => {
    if (e.target.closest('#toolbar'))             return;
    if (e.target.closest('#model-dropdown-wrap')) return;
    if (e.target.closest('#scale-slider'))        return;
    State.setTouchStartX(e.touches[0].clientX);
  }, { passive: true });

  overlay.addEventListener('touchmove', e => {
    if (!State.isPlaced || !State.placedObject) return;
    if (e.target.closest('#toolbar'))             return;
    if (e.target.closest('#model-dropdown-wrap')) return;
    if (e.target.closest('#scale-slider'))        return;
    const dx = e.touches[0].clientX - State.touchStartX;
    State.placedObject.rotation.y = State.lastYaw + dx * 0.01;
  }, { passive: true });

  overlay.addEventListener('touchend', () => {
    if (State.placedObject) State.setLastYaw(State.placedObject.rotation.y);
  }, { passive: true });

  // Ползунок масштаба
  $('scaleInput').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    State.setScaleVal(v);
    $('scale-val').textContent = v.toFixed(1) + '×';
    if (State.placedObject) State.placedObject.scale.setScalar(v);
  });

  // Кнопка Модель — дропдаун
  $('btn-pick').addEventListener('click', e => {
    e.stopPropagation();
    $('model-dropdown-wrap').classList.toggle('visible');
  });

  // Кнопка Авторотация
  $('btn-rotate').addEventListener('click', () => {
    State.setAutoRotate(!State.autoRotate);
    $('btn-rotate').style.color = State.autoRotate ? '#6c47ff' : '';
  });

  // Кнопка Убрать модель
  $('btn-reset').addEventListener('click', () => {
    if (!State.placedObject) return;
    State.scene.remove(State.placedObject);
    State.setPlacedObject(null);
    State.setIsPlaced(false);
    State.setLastYaw(0);
    State.setAutoRotate(false);
    $('reticle-hint').style.display = 'flex';
    $('btn-rotate').style.color = '';
    setStatus('Наводите на пол или стол...');
    disablePlacedButtons();
  });

  // Кнопка Выйти
  $('btn-exit').addEventListener('click', () => {
    if (State.xrSession) State.xrSession.end();
  });
}
