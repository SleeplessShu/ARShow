// js/viewer.js — 3D просмотр без AR
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as State from './state.js';
import { loadModel } from './models.js';
import { setStatus } from './ui.js';
import { startAR } from './ar.js';

const $ = id => document.getElementById(id);
let _obj = null;

export async function startFallback() {
  $('splash').style.display = 'none';
  $('no-webxr').classList.remove('show');

  // Останавливаем превью перед запуском вьювера
  try {
    const main = await import('./main.js');
    main.stopAllPreviews();
  } catch(e) {}

  const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  State.setRenderer(renderer);

  const scene = new THREE.Scene();
  // Градиентный фон через canvas-текстуру
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = 2; bgCanvas.height = 512;
  const bgCtx = bgCanvas.getContext('2d');
  const grad = bgCtx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0,   '#848383'); // сверху — холодный светло-лавандовый
  grad.addColorStop(0.5, '#585858'); // середина — тёплый нейтральный
  grad.addColorStop(1,   '#1a1b1b'); // снизу — тёплый бежевый
  bgCtx.fillStyle = grad;
  bgCtx.fillRect(0, 0, 2, 512);
  const bgTexture = new THREE.CanvasTexture(bgCanvas);
  scene.background = bgTexture;
  State.setScene(scene);

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 50);
  camera.position.set(0, 0.25, 1.0);
  camera.lookAt(0, 0, 0);
  State.setCamera(camera);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.1).texture;
  pmrem.dispose();

  // Светлое студийное освещение
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const key = new THREE.DirectionalLight(0xfff5e0, 1.4);
  key.position.set(3, 5, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far  = 20;
  key.shadow.camera.left = key.shadow.camera.bottom = -1;
  key.shadow.camera.right = key.shadow.camera.top   =  1;
  key.shadow.bias = -0.001;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xe0eeff, 0.8);
  rim.position.set(-2, 2, -3); scene.add(rim);

  // Плоскость для тени
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.ShadowMaterial({ opacity: 0.18 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -0.001;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  $('canvas-wrap').classList.add('active');
  $('ui-overlay').classList.add('active');

  // Скрываем AR-элементы, показываем кнопки вьювера
  $('reticle-hint').style.display  = 'none';
  $('scale-slider').classList.remove('visible');
  $('toolbar').style.display       = 'none';
  $('viewer-toolbar').style.display = 'flex';
  setStatus('1 палец — вращение · 2 пальца — масштаб / перемещение');

  // Кнопка AR
  $('viewer-btn-ar').onclick = () => {
    exitFallback();
    startAR();
  };
  // Кнопка Выйти
  $('viewer-btn-exit').onclick = exitFallback;

  // Загрузить модель
  try { _obj = await loadModel(State.currentModelIdx); } catch (e) { _obj = null; }
  if (!_obj) {
    _obj = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x555555 })
    );
  }
  scene.add(_obj);
  State.setPlacedObject(_obj);

  setupViewerTouches();
  renderer.setAnimationLoop(() => renderer.render(scene, camera));
}

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

export function exitFallback() {
  if (State.scene) {
    State.scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
    if (State.scene.background?.isTexture) State.scene.background.dispose();
    if (State.scene.environment) {
      State.scene.environment.dispose();
      State.scene.environment = null;
    }
  }
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
  $('viewer-toolbar').style.display = 'none';
  $('toolbar').style.display        = '';
  $('scale-slider').classList.add('visible');
  $('viewer-btn-ar').onclick   = null;
  $('viewer-btn-exit').onclick = null;
  $('splash').style.display = 'flex';
}

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
      _obj.rotation.y += (t.clientX - prev.x) * 0.012;
      _obj.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2,
        _obj.rotation.x + (t.clientY - prev.y) * 0.012));
      touches[t.identifier] = { x: t.clientX, y: t.clientY };

    } else if (e.touches.length === 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      const p0 = touches[t0.identifier] || { x: t0.clientX, y: t0.clientY };
      const p1 = touches[t1.identifier] || { x: t1.clientX, y: t1.clientY };

      const dist     = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const prevDist = Math.hypot(p0.x - p1.x, p0.y - p1.y);
      if (prevDist > 0 && _obj) {
        const s = Math.max(0.05, Math.min(5, State.scaleVal * (dist / prevDist)));
        State.setScaleVal(s);
        _obj.scale.setScalar(s);
      }
      if (_obj) {
        _obj.position.x += ((t0.clientX+t1.clientX)/2 - (p0.x+p1.x)/2) * 0.002;
        _obj.position.y -= ((t0.clientY+t1.clientY)/2 - (p0.y+p1.y)/2) * 0.002;
      }
      touches[t0.identifier] = { x: t0.clientX, y: t0.clientY };
      touches[t1.identifier] = { x: t1.clientX, y: t1.clientY };
    }
  }, { passive: false });

  cvs.addEventListener('touchend', e => {
    for (const t of e.changedTouches) delete touches[t.identifier];
  }, { passive: true });
}
