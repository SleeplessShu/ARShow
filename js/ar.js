// js/ar.js — WebXR AR сессия, hit-testing, размещение модели
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as State from './state.js';
import { loadModel } from './models.js';
import { setStatus, showError } from './ui.js';
import { setupARInteraction } from './interaction.js';

const $ = id => document.getElementById(id);

export async function startAR() {
  $('splash').style.display = 'none';

  if (!navigator.xr) { showNoXR(); return; }
  const supported = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
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
  });
  State.setXrSession(xrSession);

  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(xrSession);

  const viewerSpace = await xrSession.requestReferenceSpace('viewer');
  const hitSource   = await xrSession.requestHitTestSource({ space: viewerSpace });
  State.setHitTestSource(hitSource);

  xrSession.addEventListener('end', onAREnd);
  renderer.setAnimationLoop(onFrame);
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

function onFrame(time, frame) {
  if (!frame) { State.renderer.render(State.scene, State.camera); return; }

  const refSpace = State.renderer.xr.getReferenceSpace();
  const hits     = State.hitTestSource ? frame.getHitTestResults(State.hitTestSource) : [];

  if (hits.length) {
    const pose = hits[0].getPose(refSpace);
    State.reticle.visible = true;
    State.reticle.matrix.fromArray(pose.transform.matrix);
    State.reticle.matrix.decompose(
      State.reticle.position, State.reticle.quaternion, State.reticle.scale
    );
    if (!State.isPlaced) {
      // Поверхность найдена — скрываем индикатор сканирования
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
  if (State.modelList.length === 0) { showError('Список моделей не загружен'); return; }
  if (!State.reticle?.visible) return;

  if (State.placedObject) {
    State.scene.remove(State.placedObject);
    State.setPlacedObject(null);
  }

  let obj;
  try { obj = await loadModel(State.currentModelIdx); } catch (e) { return; }
  if (!obj) return;

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
