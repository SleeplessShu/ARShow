// js/models.js — загрузка GLB, кэш, Firebase Storage листинг
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { storage, ref, listAll, getDownloadURL } from './firebase.js';
import * as State from './state.js';
import { showLoadingOverlay, hideLoadingOverlay, showError, showDropdownError, buildDropdown } from './ui.js';

const loader = new GLTFLoader();
const draco  = new DRACOLoader();
draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/');
loader.setDRACOLoader(draco);

export { loader };

// ── Список моделей из Firebase Storage ───────────────────
export async function loadModelList() {
  try {
    const modelsRef = ref(storage, 'models');
    const result    = await listAll(modelsRef);

    if (result.items.length === 0) {
      showDropdownError('Папка models/ в Storage пуста.');
      return;
    }

    const list = result.items
      .filter(item => item.name.toLowerCase().endsWith('.glb'))
      .map(item => {
        const label = item.name.replace(/\.glb$/i, '').replace(/[-_]/g, ' ');
        return {
          id:    item.name,
          label: label.charAt(0).toUpperCase() + label.slice(1),
          file:  item.name,
          _ref:  item,   // StorageReference — для getDownloadURL
          _url:  null,   // кэш URL
        };
      });

    if (list.length === 0) {
      showDropdownError('Нет GLB файлов в папке models/.');
      return;
    }

    State.setModelList(list);
    buildDropdown();
  } catch (e) {
    showDropdownError(`Ошибка Storage: ${e.message}`);
  }
}

// ── Получить download URL (с кэшем) ──────────────────────
export async function resolveUrl(entry) {
  if (entry._url) return entry._url;
  const url = await getDownloadURL(entry._ref);
  entry._url = url;
  return url;
}

// ── Нормализация модели после загрузки ───────────────────
export function normalizeModel(root, envMap = null) {
  // Вписать в 0.5 м по максимальной оси
  const rawBox  = new THREE.Box3().setFromObject(root);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const maxDim  = Math.max(rawSize.x, rawSize.y, rawSize.z);
  if (maxDim > 0) root.scale.setScalar(0.5 / maxDim);

  // Сдвинуть: нижняя грань на Y=0, центр по X/Z
  const box2   = new THREE.Box3().setFromObject(root);
  const center = box2.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box2.min.y;

  // Тени и материалы
  root.traverse(m => {
    if (!m.isMesh) return;
    m.castShadow    = true;
    m.receiveShadow = true;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach(mat => {
      if (mat.metalness > 0.8) {
        mat.metalness = Math.min(mat.metalness, 0.7);
        mat.roughness = Math.max(mat.roughness, 0.25);
      }
      if (envMap) mat.envMap = envMap;
      mat.needsUpdate = true;
    });
  });

  return root;
}

// ── Загрузить модель по индексу (с кэшем) ────────────────
export async function loadModel(idx) {
  const entry = State.modelList[idx];
  if (!entry) return null;

  if (State.modelCache[entry.file]) {
    return State.modelCache[entry.file].clone();
  }

  showLoadingOverlay(`Загрузка: ${entry.label || entry.file}`);
  const url = await resolveUrl(entry);

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      gltf => {
        hideLoadingOverlay();
        const root = normalizeModel(gltf.scene, State.scene?.environment ?? null);
        State.modelCache[entry.file] = root;
        resolve(root.clone());
      },
      undefined,
      err => {
        hideLoadingOverlay();
        showError(`Ошибка загрузки: ${entry.file}`);
        reject(err);
      }
    );
  });
}

// ── Emoji-иконка по имени файла ───────────────────────────
export function fileEmoji(filename) {
  const n = filename.toLowerCase();
  if (n.includes('chair')  || n.includes('стул'))   return '🪑';
  if (n.includes('table')  || n.includes('стол'))   return '🪞';
  if (n.includes('lamp')   || n.includes('лампа'))  return '💡';
  if (n.includes('car')    || n.includes('машина')) return '🚗';
  if (n.includes('tree')   || n.includes('дерево')) return '🌿';
  if (n.includes('box')    || n.includes('cube'))   return '📦';
  return '📦';
}
