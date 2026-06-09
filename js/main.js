// js/main.js — точка входа
import { loadModelList }          from './models.js';
import { startAR }                from './ar.js';
import { startFallback }          from './viewer.js';
import * as State                 from './state.js';
import { buildDropdown }          from './ui.js';

const $ = id => document.getElementById(id);

// ── Вкладки ───────────────────────────────────────────────
const tabs = document.querySelectorAll('.tab');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    $(`tab-${tab.dataset.tab}`).classList.remove('hidden');

    // Загружаем заглушки лениво
    const stub = tab.dataset.tab;
    if (stub !== 'models') {
      import(`../pages/${stub}.js`).then(m => m.init($(`page-${stub}`))).catch(() => {});
    }
  });
});

// ── Models grid ───────────────────────────────────────────
// Переиспользуем prevewRenderers из library, но рендерим в models-grid
const previewRenderers = [];
let selectedCardIdx = -1;
let arBtnEl = null; // кнопка AR в ui-overlay вьювера

export function buildModelsGrid() {
  const grid = $('models-grid');
  if (!grid) return;

  if (State.modelList.length === 0) {
    grid.innerHTML = '<div class="models-loading"><span>Нет моделей в Storage.</span></div>';
    return;
  }

  // Dispose old preview renderers
  previewRenderers.forEach(r => { try { r.dispose(); } catch(e){} });
  previewRenderers.length = 0;
  selectedCardIdx = -1;
  grid.innerHTML = '';

  State.modelList.forEach((m, i) => {
    const card = document.createElement('div');
    card.className   = 'model-card';
    card.dataset.idx = i;
    card.innerHTML = `
      <div class="model-card-preview" id="mg-wrap-${i}">
        <div class="prev-spinner" id="mg-spin-${i}">📦</div>
      </div>
      <div class="model-card-info">
        <div class="model-card-name">${m.label || m.id}</div>
        <div class="model-card-file">${m.file}</div>
      </div>`;
    card.addEventListener('click', () => selectModelCard(i));
    grid.appendChild(card);
    requestAnimationFrame(() => renderGridPreview(i, m));
  });

  // Синхронизируем AR dropdown тоже
  buildDropdown();
}

function selectModelCard(idx) {
  document.querySelectorAll('.model-card').forEach((c, i) =>
    c.classList.toggle('selected', i === idx)
  );
  selectedCardIdx = idx;
  State.setCurrentModelIdx(idx);

  // Открываем вьювер сразу
  startFallback();
}

// ── Mini preview в grid ───────────────────────────────────
async function renderGridPreview(idx, modelEntry) {
  // Импортируем нужное
  const [THREE_mod, { RoomEnvironment }, { loader, resolveUrl, normalizeModel, fileEmoji }] = await Promise.all([
    import('three'),
    import('three/addons/environments/RoomEnvironment.js'),
    import('./models.js'),
  ]);
  const THREE = THREE_mod;

  const wrap = document.getElementById(`mg-wrap-${idx}`);
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
  const d1 = new THREE.DirectionalLight(0xffffff, 1.2); d1.position.set(1,2,2); miniScene.add(d1);
  const d2 = new THREE.DirectionalLight(0x8888ff, 0.4); d2.position.set(-1,-1,-1); miniScene.add(d2);

  const pmrem = new THREE.PMREMGenerator(miniRenderer);
  pmrem.compileEquirectangularShader();
  miniScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const doRender = root => {
    const clone = root.clone();
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(clone);
    const ctr = box.getCenter(new THREE.Vector3());
    const sz  = box.getSize(new THREE.Vector3());
    clone.position.set(-ctr.x, -ctr.y, -ctr.z);
    miniScene.add(clone);

    const maxD = Math.max(sz.x, sz.y, sz.z);
    miniCam.position.set(maxD*0.8, maxD*0.6, maxD*1.1);
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
    const orig = miniRenderer.dispose.bind(miniRenderer);
    miniRenderer.dispose = () => { cancelAnimationFrame(animId); orig(); };
  };

  if (State.modelCache[modelEntry.file]) {
    doRender(State.modelCache[modelEntry.file]); return;
  }

  resolveUrl(modelEntry).then(url => {
    loader.load(url, gltf => {
      const root = normalizeModel(gltf.scene, miniScene.environment);
      State.modelCache[modelEntry.file] = root;
      doRender(root);
    }, undefined, err => {
      const spin = document.getElementById(`mg-spin-${idx}`);
      if (spin) spin.textContent = '⚠️';
    });
  }).catch(() => {
    const spin = document.getElementById(`mg-spin-${idx}`);
    if (spin) spin.textContent = '⚠️';
  });
}

// ── AR кнопка в overlay вьювера ───────────────────────────
export function showViewerARButton() {
  if (!arBtnEl) {
    arBtnEl = document.createElement('button');
    arBtnEl.className = 'viewer-ar-btn';
    arBtnEl.textContent = 'Запустить AR';
    arBtnEl.addEventListener('click', () => {
      const { exitFallback } = import('./viewer.js').then(m => {
        m.exitFallback();
        startAR();
      });
    });
    $('ui-overlay').appendChild(arBtnEl);
  }
  arBtnEl.classList.add('show');
}

export function hideViewerARButton() {
  if (arBtnEl) arBtnEl.classList.remove('show');
}

// ── Resize ────────────────────────────────────────────────
window.addEventListener('resize', () => {
  if (!State.renderer) return;
  State.camera.aspect = innerWidth / innerHeight;
  State.camera.updateProjectionMatrix();
  State.renderer.setSize(innerWidth, innerHeight);
});

// ── Fallback (no-WebXR screen) ────────────────────────────
$('btn-fallback').addEventListener('click', startFallback);

// ── Init ─────────────────────────────────────────────────
$('lib-btn-ar').disabled   = true;
$('lib-btn-view').disabled = true;

loadModelList()
  .then(list => {
    if (!list || list.length === 0) {
      $('models-grid').innerHTML = '<div class="models-loading"><span>Нет моделей в Storage.</span></div>';
      return;
    }
    buildModelsGrid();
    buildDropdown();
  })
  .catch(err => {
    console.error('loadModelList failed:', err);
    $('models-grid').innerHTML = `<div class="models-loading"><span style="color:#ff6655;">Ошибка: ${err.message}</span></div>`;
  });
