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

  if (!navigator.xr) { log('ERROR: navigator.xr undefined'); showNoXR(); return; }
  log('navigator.xr OK');

  const supported = await navigator.xr.isSessionSupported('immersive-ar').catch(e => {
    log('isSessionSupported error:', e.message); return false;
  });
  log('immersive-ar supported:', supported);
  if (!supported) { showNoXR(); return; }

  const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(2, 4, 2); dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024); scene.add(dir);
  const fill = new THREE.DirectionalLight(0xffffff, 0.4);
  fill.position.set(-2, 1, -2); scene.add(fill);

  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 5),
    new THREE.ShadowMaterial({ opacity: 0.3 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  const reticle = makeReticle();
  reticle.visible = false;
  scene.add(reticle);
  State.setReticle(reticle);

  $('canvas-wrap').classList.add('active');
  $('ui-overlay').classList.add('active');
  // Скрываем старый тулбар и ползунок
  $('toolbar').style.display    = 'none';
  $('scale-slider').classList.remove('visible');
  // Показываем AR тулбар
  $('ar-toolbar').style.display = 'flex';
  // Сброс статуса
  setStatus('Наводите на пол или стол...');
  $('reticle-hint').style.display = 'flex';

  const xrSession = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: $('ui-overlay') },
  }).catch(e => { log('requestSession error:', e.message); return null; });

  if (!xrSession) { log('ERROR: no xrSession'); showNoXR(); return; }
  log('XR session created');
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
  renderer.setAnimationLoop(onFrame);
  log('animation loop started');
  setupARInteraction();
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

let _frameCount = 0;
let _hitCount = 0;

function onFrame(time, frame) {
  if (!frame) { State.renderer.render(State.scene, State.camera); return; }
  _frameCount++;

  const refSpace = State.renderer.xr.getReferenceSpace();
  const hits     = State.hitTestSource ? frame.getHitTestResults(State.hitTestSource) : [];

  // Логируем каждые 60 кадров
  if (_frameCount % 60 === 0) {
    log(`frame=${_frameCount} hits=${hits.length} placed=${State.isPlaced} refspace=${refSpace ? 'OK' : 'NULL'} hitsrc=${State.hitTestSource ? 'OK' : 'NULL'}`);
  }

  if (hits.length) {
    _hitCount++;
    const pose = hits[0].getPose(refSpace);
    State.reticle.visible = true;
    State.reticle.matrix.fromArray(pose.transform.matrix);
    State.reticle.matrix.decompose(
      State.reticle.position, State.reticle.quaternion, State.reticle.scale
    );
    if (!State.isPlaced) {
      $('reticle-hint').style.display = 'none';
      setStatus('Нажмите чтобы разместить модель');
    }
  } else {
    State.reticle.visible = false;
    if (!State.isPlaced) {
      $('reticle-hint').style.display = 'flex';
      setStatus('Наводите на пол или стол...');
    }
  }

  State.renderer.render(State.scene, State.camera);
}

function onAREnd() {
  $('canvas-wrap').classList.remove('active');
  $('ui-overlay').classList.remove('active');
  $('ar-toolbar').style.display = 'none';
  $('toolbar').style.display    = '';
  $('scale-slider').classList.add('visible');
  $('splash').style.display = 'flex';
  State.setIsPlaced(false);
  State.setPlacedObject(null);
  State.setHitTestSource(null);
  State.setLastYaw(0);
  State.setAutoRotate(false);
}

export async function placeModel() {
  log(`placeModel called. models=${State.modelList.length} reticle=${State.reticle?.visible} idx=${State.currentModelIdx}`);
  if (State.modelList.length === 0) { showError('Список моделей не загружен'); return; }
  if (!State.reticle?.visible) { log('reticle not visible - skip'); return; }

  if (State.placedObject) {
    State.scene.remove(State.placedObject);
    State.setPlacedObject(null);
  }

  log('loading model...');
  let obj;
  try { obj = await loadModel(State.currentModelIdx); } catch (e) { log('loadModel error:', e.message); return; }
  if (!obj) { log('obj is null'); return; }
  log('model loaded OK');

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
  log(`placed at x=${obj.position.x.toFixed(3)} y=${obj.position.y.toFixed(3)} z=${obj.position.z.toFixed(3)} scale=${obj.scale.x.toFixed(4)}`);

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
