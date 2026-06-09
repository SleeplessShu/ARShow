// js/main.js — точка входа, привязка кнопок
import { loadModelList } from './models.js';
import { startAR } from './ar.js';
import { startFallback } from './viewer.js';
import { openLibrary, closeLibrary } from './library.js';
import * as State from './state.js';

const $ = id => document.getElementById(id);

// Инициализация
$('lib-btn-ar').disabled   = true;
$('lib-btn-view').disabled = true;

loadModelList();

// Splash
$('btn-start').addEventListener('click', startAR);
$('btn-fallback').addEventListener('click', startFallback);
$('btn-open-library').addEventListener('click', openLibrary);

// Библиотека — глобальный fallback для inline onclick
window._openLibrary  = openLibrary;
window._closeLibrary = closeLibrary;

$('lib-close').addEventListener('click', closeLibrary);

// Кнопки библиотеки — дефолтное поведение (из splash)
// Вьювер/AR переопределяют .onclick сами
$('lib-btn-ar').addEventListener('click', async () => {
  const { librarySelectedIdx } = await import('./library.js');
  if (librarySelectedIdx < 0) return;
  State.setCurrentModelIdx(librarySelectedIdx);
  closeLibrary();
  startAR();
});

$('lib-btn-view').addEventListener('click', async () => {
  const { librarySelectedIdx } = await import('./library.js');
  if (librarySelectedIdx < 0) return;
  State.setCurrentModelIdx(librarySelectedIdx);
  closeLibrary();
  startFallback();
});

// Escape закрывает библиотеку
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLibrary();
});

// Resize
window.addEventListener('resize', () => {
  if (!State.renderer) return;
  State.camera.aspect = innerWidth / innerHeight;
  State.camera.updateProjectionMatrix();
  State.renderer.setSize(innerWidth, innerHeight);
});
