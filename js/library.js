// js/library.js — модальное окно библиотеки моделей
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as State from './state.js';
import { loader, resolveUrl, normalizeModel, fileEmoji } from './models.js';

const $ = id => document.getElementById(id);

export let librarySelectedIdx = -1;
const previewRenderers = [];

// ── Открыть библиотеку ───────────────────────────────────
export function openLibrary() {
  librarySelectedIdx = -1;
  $('lib-btn-ar').disabled   = true;
  $('lib-btn-view').disabled = true;
  $('library-modal').classList.add('show');
  buildLibraryCards();
}

// ── Закрыть библиотеку ───────────────────────────────────
export function closeLibrary() {
  $('library-modal').classList.remove('show');
  previewRenderers.forEach(r => { try { r.dispose(); } catch (e) {} });
  previewRenderers.length = 0;
}

// ── Построить карточки ───────────────────────────────────
function buildLibraryCards() {
  const body = $('lib-body');

  if (State.modelList.length === 0) {
    body.innerHTML = '<div class="lib-empty">Список моделей не загружен.</div>';
    return;
  }

  body.innerHTML = '';
  State.modelList.forEach((m, i) => {
    const card = document.createElement('div');
    card.className   = 'lib-card';
    card.dataset.idx = i;
    card.innerHTML   = `
      <div class="lib-card-preview" id="prev-wrap-${i}">
        <div class="prev-spinner" id="prev-spin-${i}">${fileEmoji(m.file)}</div>
      </div>
      <div class="lib-card-info">
        <div class="lib-card-name">${m.label || m.id}</div>
        <div class="lib-card-file">${m.file}</div>
      </div>`;
    card.addEventListener('click', () => selectCard(i));
    body.appendChild(card);
    requestAnimationFrame(() => renderMiniPreview(i, m));
  });
}

// ── Выбор карточки ───────────────────────────────────────
function selectCard(idx) {
  document.querySelectorAll('.lib-card').forEach((c, i) =>
    c.classList.toggle('selected', i === idx)
  );
  librarySelectedIdx         = idx;
  $('lib-btn-ar').disabled   = false;
  $('lib-btn-view').disabled = false;
}

// ── Mini 3D превью ────────────────────────────────────────
function renderMiniPreview(idx, modelEntry) {
  const wrap = document.getElementById(`prev-wrap-${idx}`);
  if (!wrap) return;

  const size = wrap.clientWidth || 150;
  const cvs  = document.createElement('canvas');
  cvs.width  = size * devicePixelRatio;
  cvs.height = size * devicePixelRatio;
  cvs.style.width  = size + 'px';
  cvs.style.height = size + 'px';

  const miniRenderer = new THREE.WebGLRenderer({ canvas: cvs, antialias: true, alpha: true });
  miniRenderer.setPixelRatio(devicePixelRatio);
  miniRenderer.setSize(size, size);
  previewRenderers.push(miniRenderer);

  const miniScene = new THREE.Scene();
  const miniCam   = new THREE.PerspectiveCamera(45, 1, 0.01, 100);

  miniScene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const d1 = new THREE.DirectionalLight(0xffffff, 1.2); d1.position.set(1, 2, 2); miniScene.add(d1);
  const d2 = new THREE.DirectionalLight(0x8888ff, 0.4); d2.position.set(-1,-1,-1); miniScene.add(d2);

  const pmrem = new THREE.PMREMGenerator(miniRenderer);
  pmrem.compileEquirectangularShader();
  miniScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const doRender = root => {
    const clone = root.clone();

    // Сбрасываем позицию, которую добавил normalizeModel (bottom at Y=0),
    // и центрируем по всем трём осям для превью
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);

    // Вычисляем bbox после сброса
    const box = new THREE.Box3().setFromObject(clone);
    const ctr = box.getCenter(new THREE.Vector3());
    const sz  = box.getSize(new THREE.Vector3());

    // Сдвигаем к центру сцены
    clone.position.set(-ctr.x, -ctr.y, -ctr.z);
    miniScene.add(clone);

    // Камера — немного сверху-сбоку
    const maxD = Math.max(sz.x, sz.y, sz.z);
    miniCam.position.set(maxD * 0.8, maxD * 0.6, maxD * 1.1);
    miniCam.lookAt(0, 0, 0);

    wrap.querySelector('.prev-spinner').classList.add('hidden');
    wrap.appendChild(cvs);

    let yaw = 0, animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      yaw += 0.015;
      clone.rotation.y = yaw;
      miniRenderer.render(miniScene, miniCam);
    };
    animate();

    const origDispose = miniRenderer.dispose.bind(miniRenderer);
    miniRenderer.dispose = () => { cancelAnimationFrame(animId); origDispose(); };
  };

  if (State.modelCache[modelEntry.file]) {
    doRender(State.modelCache[modelEntry.file]);
    return;
  }

  resolveUrl(modelEntry).then(url => {
    loader.load(
      url,
      gltf => {
        const root = normalizeModel(gltf.scene, miniScene.environment);
        State.modelCache[modelEntry.file] = root;
        doRender(root);
      },
      undefined,
      err => {
        console.error('Preview load error:', modelEntry.file, err);
        const spin = document.getElementById(`prev-spin-${idx}`);
        if (spin) spin.textContent = '⚠️';
      }
    );
  }).catch(err => {
    console.error('Preview URL error:', modelEntry.file, err);
    const spin = document.getElementById(`prev-spin-${idx}`);
    if (spin) spin.textContent = '⚠️';
  });
}
