// js/viewer.js — 3D просмотр без AR (fallback)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as State from './state.js';
import { loadModel } from './models.js';
import { setStatus } from './ui.js';
import { openLibrary, closeLibrary } from './library.js';
import { startAR } from './ar.js';

const $ = id => document.getElementById(id);

let _obj = null; // локальная ссылка на текущую модель в вьювере

// ── Запуск 3D просмотра ──────────────────────────────────
export async function startFallback() {
  $('splash').style.display    = 'none';
  $('no-webxr').classList.remove('show');

  const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x111118);
  renderer.shadowMap.enabled = true;
  State.setRenderer(renderer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111118);
  State.setScene(scene);

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 50);
  camera.position.set(0, 0.4, 1.2);
  camera.lookAt(0, 0.2, 0);
  State.setCamera(camera);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dir = new THREE.DirectionalLight(0xffffff, 1.5);
  dir.position.set(2, 4, 2);
  scene.add(dir);
  scene.add(new THREE.GridHelper(2, 20, 0x333355, 0x222233));

  $('canvas-wrap').classList.add('active');
  $('ui-overlay').classList.add('active');

  // Скрыть AR-элементы
  $('reticle-hint').style.display = 'none';
  $('scale-slider').classList.remove('visible');
  $('btn-reset').style.display  = 'none';
  $('btn-rotate').style.display = 'none';
  setStatus('1 палец — вращение · 2 пальца — перемещение / масштаб');

  // Кнопки
  $('btn-exit').onclick  = exitFallback;
  $('btn-pick').onclick  = e => { e.stopPropagation(); openLibrary(); };

  // Кнопки библиотеки переопределяем для вьювера
  $('lib-btn-view').onclick = async () => {
    const { librarySelectedIdx } = await import('./library.js');
    if (librarySelectedIdx < 0) return;
    State.setCurrentModelIdx(librarySelectedIdx);
    closeLibrary();
    await swapViewerModel();
  };

  $('lib-btn-ar').onclick = async () => {
    const { librarySelectedIdx } = await import('./library.js');
    if (librarySelectedIdx < 0) return;
    State.setCurrentModelIdx(librarySelectedIdx);
    closeLibrary();
    exitFallback();
    startAR();
  };

  // Загрузить выбранную модель
  try { _obj = await loadModel(State.currentModelIdx); } catch (e) { _obj = null; }
  if (!_obj) {
    _obj = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x6c47ff })
    );
  }
  scene.add(_obj);
  State.setPlacedObject(_obj);

  setupViewerTouches();
  renderer.setAnimationLoop(() => renderer.render(scene, camera));
}

// ── Заменить модель внутри вьювера ───────────────────────
async function swapViewerModel() {
  if (!State.scene) return;
  let newObj = null;
  try { newObj = await loadModel(State.currentModelIdx); } catch (e) {}
  if (!newObj) return;
  if (_obj) {
    newObj.position.copy(_obj.position);
    newObj.rotation.copy(_obj.rotation);
    State.scene.remove(_obj);
  }
  newObj.scale.setScalar(State.scaleVal);
  State.scene.add(newObj);
  State.setPlacedObject(newObj);
  _obj = newObj;
}

// ── Выход из вьювера ─────────────────────────────────────
export function exitFallback() {
  if (State.renderer) {
    State.renderer.setAnimationLoop(null);
    State.renderer.dispose();
  }
  State.setRenderer(null);
  State.setScene(null);
  State.setPlacedObject(null);
  _obj = null;

  $('canvas-wrap').classList.remove('active');
  $('ui-overlay').classList.remove('active');
  $('scale-slider').classList.add('visible');
  $('btn-reset').style.display  = '';
  $('btn-rotate').style.display = '';
  $('btn-pick').onclick  = null;
  $('btn-exit').onclick  = null;
  $('lib-btn-view').onclick = null;
  $('lib-btn-ar').onclick   = null;
  $('splash').style.display = 'flex';
}

// ── Touch управление (вьювер) ─────────────────────────────
function setupViewerTouches() {
  const cvs     = $('c');
  const touches = {};

  cvs.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) touches[t.identifier] = { x: t.clientX, y: t.clientY };
  }, { passive: false });

  cvs.addEventListener('touchmove', e => {
    e.preventDefault();

    if (e.touches.length === 1) {
      const t    = e.touches[0];
      const prev = touches[t.identifier];
      if (!prev || !_obj) { touches[t.identifier] = { x: t.clientX, y: t.clientY }; return; }
      const dx = t.clientX - prev.x;
      const dy = t.clientY - prev.y;
      _obj.rotation.y += dx * 0.012;
      _obj.rotation.x  = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, _obj.rotation.x + dy * 0.012));
      touches[t.identifier] = { x: t.clientX, y: t.clientY };

    } else if (e.touches.length === 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      const p0 = touches[t0.identifier] || { x: t0.clientX, y: t0.clientY };
      const p1 = touches[t1.identifier] || { x: t1.clientX, y: t1.clientY };

      // Pinch — масштаб
      const dist     = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const prevDist = Math.hypot(p0.x - p1.x, p0.y - p1.y);
      if (prevDist > 0 && _obj) {
        const newScale = Math.max(0.05, Math.min(5, State.scaleVal * (dist / prevDist)));
        State.setScaleVal(newScale);
        _obj.scale.setScalar(newScale);
      }

      // Midpoint drag — перемещение
      const midX = (t0.clientX + t1.clientX) / 2;
      const midY = (t0.clientY + t1.clientY) / 2;
      if (_obj) {
        _obj.position.x += (midX - (p0.x + p1.x) / 2) * 0.002;
        _obj.position.y -= (midY - (p0.y + p1.y) / 2) * 0.002;
      }

      touches[t0.identifier] = { x: t0.clientX, y: t0.clientY };
      touches[t1.identifier] = { x: t1.clientX, y: t1.clientY };
    }
  }, { passive: false });

  cvs.addEventListener('touchend', e => {
    for (const t of e.changedTouches) delete touches[t.identifier];
  }, { passive: true });
}
