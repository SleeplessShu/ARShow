// js/ar.js — WebXR AR сессия, hit-testing, размещение модели
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as State from './state.js';
import { loadModel } from './models.js';
import { setStatus, showError } from './ui.js';
import { setupARInteraction } from './interaction.js';

const $ = id => document.getElementById(id);

// ── Отладочный лог на экране ─────────────────────────────
function initDebugLog() {
  let el = document.getElementById('ar-debug');
  if (el) { el.innerHTML = ''; return el; }
  el = document.createElement('div');
  el.id = 'ar-debug';
  el.style.cssText = `
    position:fixed; top:60px; left:8px; right:8px; z-index:9999;
    background:rgba(0,0,0,0.75); color:#0f0; font-size:11px;
    font-family:monospace; padding:8px; border-radius:8px;
    pointer-events:none; max-height:40vh; overflow-y:auto;
    line-height:1.5;
  `;
  document.body.appendChild(el);
  return el;
}

let _dbg = null;
function log(...args) {
  const msg = args.join(' ');
  console.log('[AR]', msg);
  if (!_dbg) return;
  const line = document.createElement('div');
  line.textContent = `${new Date().toISOString().slice(11,23)} ${msg}`;
  _dbg.appendChild(line);
  // Оставляем последние 20 строк
  while (_dbg.children.length > 20) _dbg.removeChild(_dbg.firstChild);
  _dbg.scrollTop = _dbg.scrollHeight;
}

export async function startAR() {
  _dbg = initDebugLog();
  log('startAR called');
  $('splash').style.display = 'none';

  // Останавливаем все превью-рендереры перед запуском AR
  try {
    const main = await import('./main.js');
    main.stopAllPreviews();
    log('previews stopped');
  } catch(e) { log('stopAllPreviews error:', e.message); }

  if (!navigator.xr) { log('ERROR: navigator.xr undefined'); showNoXR(); return; }
  log('navigator.xr OK');

  const supported = await navigator.xr.isSessionSupported('immersive-ar').catch(e => {
    log('isSessionSupported error:', e.message); return false;
  });
  log('immersive-ar supported:', supported);
  if (!supported) { showNoXR(); return; }

  const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: false, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // не более 1.5 на мобильном
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  renderer.shadowMap.enabled = false; // тени отключены — дорого в AR
  State.setRenderer(renderer);

  const scene = new THREE.Scene();
  State.setScene(scene);
  State.setClock(new THREE.Clock());
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 20);
  State.setCamera(camera);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(2, 4, 2);
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0xffffff, 0.3);
  fill.position.set(-2, 1, -2); scene.add(fill);

  const reticle = makeReticle();
  reticle.visible = false;
  scene.add(reticle);
  State.setReticle(reticle);

  $('canvas-wrap').classList.add('active');
  // ui-overlay должен быть виден ДО requestSession для dom-overlay
  $('ui-overlay').classList.add('active');
  $('toolbar').style.display    = 'none';
  $('scale-slider').classList.remove('visible');
  $('ar-toolbar').style.display = 'flex';
  setStatus('Наводите на пол или стол...');
  $('reticle-hint').style.display = 'flex';

  log('requesting XR session...');
  const xrSession = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.getElementById('ui-overlay') },
  }).catch(e => { log('requestSession error:', e.message); return null; });

  if (!xrSession) { log('ERROR: no xrSession'); showNoXR(); return; }
  log('XR session created, domOverlayState:', JSON.stringify(xrSession.domOverlayState));
  State.setXrSession(xrSession);

  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(xrSession);
  log('renderer XR session set');

  const viewerSpace = await xrSession.requestReferenceSpace('viewer')
    .catch(e => { log('viewer refspace error:', e.message); return null; });
  log('viewer refspace:', viewerSpace ? 'OK' : 'FAIL');

  const hitSource = await xrSession.requestHitTestSource({ space: viewerSpace })
    .catch(e => { log('hitTestSource error:', e.message); return null; });
  log('hitTestSource:', hitSource ? 'OK' : 'FAIL');
  State.setHitTestSource(hitSource);

  xrSession.addEventListener('end', onAREnd);

  // XR select — нативное событие тапа, работает даже без dom-overlay
  xrSession.addEventListener('select', () => {
    log('XR select event fired');
    placeModel();
  });

  renderer.setAnimationLoop(onFrame);
  log('animation loop started');
  setupARInteraction();

  // Убрать дебаг-оверлей через 5 секунд
  setTimeout(() => {
    const dbg = document.getElementById('ar-debug');
    if (dbg) dbg.remove();
    _dbg = null;
  }, 8000);
}

function makeReticle() {
  const g = new THREE.Group();
  // Отключаем автообновление матрицы — управляем вручную через hit-test
  g.matrixAutoUpdate = false;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.075, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2; g.add(ring);
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.01, 16),
    new THREE.MeshBasicMaterial({ color: 0xd0d0d0, side: THREE.DoubleSide })
  );
  dot.rotation.x = -Math.PI / 2; dot.position.y = 0.001; g.add(dot);
  return g;
}

// Переиспользуемые объекты — не создаём в каждом кадре
const _pos  = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl  = new THREE.Vector3();

// Кэш состояния чтобы не трогать DOM каждый кадр
let _lastHadHit    = null;
let _frameCount    = 0;

function onFrame(time, frame) {
  if (!frame) { State.renderer.render(State.scene, State.camera); return; }

  _frameCount++;

  // Логируем только первые несколько секунд потом выключаем
  if (_frameCount === 60) log(`60 frames OK, hits working`);

  const refSpace = State.renderer.xr.getReferenceSpace();
  const hits     = State.hitTestSource
    ? frame.getHitTestResults(State.hitTestSource)
    : _emptyArr;

  const hasHit = hits.length > 0;

  if (hasHit) {
    const pose = hits[0].getPose(refSpace);
    State.reticle.visible = true;
    State.reticle.matrix.fromArray(pose.transform.matrix);
    // Переиспользуем объекты — нет аллокаций
    State.reticle.matrix.decompose(_pos, _quat, _scl);
    State.reticle.position.copy(_pos);
    State.reticle.quaternion.copy(_quat);
  } else {
    State.reticle.visible = false;
  }

  // DOM трогаем только при смене состояния — не каждый кадр
  if (!State.isPlaced && hasHit !== _lastHadHit) {
    _lastHadHit = hasHit;
    const hint = document.getElementById('reticle-hint');
    if (hasHit) {
      if (hint) hint.style.display = 'none';
      setStatus('Нажмите чтобы разместить модель');
    } else {
      if (hint) hint.style.display = 'flex';
      setStatus('Наводите на пол или стол...');
    }
  }

  State.renderer.render(State.scene, State.camera);
}

const _emptyArr = [];

function onAREnd() {
  // Освобождаем AR сцену и все Three.js ресурсы
  if (State.scene) {
    State.scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          if (m.map) m.map.dispose();
          if (m.envMap) m.envMap.dispose();
          m.dispose();
        });
      }
    });
    if (State.scene.environment) {
      State.scene.environment.dispose();
      State.scene.environment = null;
    }
  }
  if (State.renderer) {
    State.renderer.setAnimationLoop(null);
    State.renderer.dispose();
    State.setRenderer(null);
  }

  $('canvas-wrap').classList.remove('active');
  $('ui-overlay').classList.remove('active');
  $('ar-toolbar').style.display = 'none';
  $('toolbar').style.display    = '';
  $('scale-slider').classList.add('visible');
  $('splash').style.display = 'flex';
  State.setIsPlaced(false);
  State.setScene(null);
  State.setPlacedObject(null);
  State.setReticle(null);
  State.setHitTestSource(null);
  State.setLastYaw(0);
  State.setAutoRotate(false);
  _lastHadHit = null;
  _frameCount = 0;
}

export async function placeModel() {
  if (State.modelList.length === 0) { showError('Список моделей не загружен'); return; }
  if (!State.reticle?.visible) return;

  if (State.placedObject) {
    State.scene.remove(State.placedObject);
    State.setPlacedObject(null);
  }

  let obj;
  try { obj = await loadModel(State.currentModelIdx); } catch (e) { log('loadModel error:', e.message); return; }
  if (!obj) { log('obj is null'); return; }

  // Сбрасываем смещение которое добавил normalizeModel (bottom at Y=0)
  // В AR позиционируем относительно hit-test точки
  obj.position.set(0, 0, 0);
  obj.rotation.set(0, 0, 0);

  // Вписываем в 0.3м для AR (реальный масштаб)
  const box    = new THREE.Box3().setFromObject(obj);
  const size   = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const arScale = maxDim > 0 ? (0.3 / maxDim) * State.scaleVal : State.scaleVal;
  obj.scale.setScalar(arScale);

  // Размещаем на поверхности — берём позицию и ориентацию от прицела
  obj.position.copy(State.reticle.position);
  obj.quaternion.copy(State.reticle.quaternion);
  obj.rotation.y += State.lastYaw;

  State.scene.add(obj);
  State.setPlacedObject(obj);
  State.setIsPlaced(true);
  _lastHadHit = null; // сбросить кэш статуса

  $('reticle-hint').style.display = 'none';
  setStatus('Модель размещена · свайп для вращения');

  // Bounce анимация
  let t = 0;
  const base = arScale;
  const bounce = () => {
    t += 0.08;
    if (t >= 1) { if (State.placedObject) State.placedObject.scale.setScalar(base); return; }
    if (State.placedObject) State.placedObject.scale.setScalar(base * (1 + Math.sin(t * Math.PI) * 0.3));
    requestAnimationFrame(bounce);
  };
  bounce();
}

export async function swapPlacedModel() {
  if (!State.placedObject) return;
  const pos  = State.placedObject.position.clone();
  const rotY = State.placedObject.rotation.y;
  State.scene.remove(State.placedObject);
  State.setPlacedObject(null);
  try {
    const newObj = await loadModel(State.currentModelIdx);
    if (!newObj) return;
    newObj.position.copy(pos);
    newObj.rotation.y = rotY;
    newObj.scale.setScalar(State.scaleVal);
    State.scene.add(newObj);
    State.setPlacedObject(newObj);
  } catch (e) {}
}

function showNoXR() { $('no-webxr').classList.add('show'); }
