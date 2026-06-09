// pages/reels.js
import { storage, ref, listAll, getDownloadURL } from '../js/firebase.js';

let initialized = false;

export async function init(container) {
  if (initialized) return;
  initialized = true;

  container.innerHTML = `
    <div id="reels-wrap">
      <div id="reels-track"></div>
      <div id="reels-dots"></div>
      <div id="reels-loading">
        <div class="mini-spin"></div>
        <span>Загрузка...</span>
      </div>
    </div>`;

  const track   = container.querySelector('#reels-track');
  const dots    = container.querySelector('#reels-dots');
  const loading = container.querySelector('#reels-loading');

  // Стили вставляем один раз
  if (!document.getElementById('reels-style')) {
    const style = document.createElement('style');
    style.id = 'reels-style';
    style.textContent = `
      #tab-reels {
        padding: 0;
        overflow: hidden;
        position: relative;
      }
      #reels-wrap {
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      #reels-track {
        flex: 1;
        display: flex;
        transition: transform 0.35s cubic-bezier(0.4,0,0.2,1);
        will-change: transform;
        min-height: 0;
      }
      .reel-slide {
        flex-shrink: 0;
        width: 100%;
        height: 100%;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #000;
      }
      .reel-slide video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      #reels-dots {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 6px;
        z-index: 2;
        pointer-events: none;
      }
      .reel-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: rgba(255,255,255,0.3);
        transition: background 0.2s, transform 0.2s;
        flex-shrink: 0;
      }
      .reel-dot.active {
        background: #d0d0d0;
        transform: scale(1.3);
      }
      #reels-loading {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        gap: 10px; color: #555; font-size: 0.88rem;
        background: #171717;
        z-index: 3;
      }
      #reels-loading.hidden { display: none; }
    `;
    document.head.appendChild(style);
  }

  // Загрузить список видео из Storage
  let urls = [];
  try {
    const reelsRef = ref(storage, 'reels');
    const result   = await listAll(reelsRef);
    const items    = result.items.filter(item =>
      /\.(mp4|mov|webm)$/i.test(item.name)
    );
    if (items.length === 0) {
      loading.innerHTML = '<span style="color:#444;">Нет видео в папке reels/</span>';
      return;
    }
    urls = await Promise.all(items.map(item => getDownloadURL(item)));
  } catch (e) {
    loading.innerHTML = `<span style="color:#ff6655;font-size:0.75rem;">Ошибка: ${e.message}</span>`;
    return;
  }

  // Создать слайды — дублируем для бесконечной прокрутки
  // Порядок: [last, ...all, first] — клонируем крайние
  const allUrls  = [...urls];
  const extended = [allUrls[allUrls.length - 1], ...allUrls, allUrls[0]];
  let current    = 1; // начинаем с первого реального слайда
  let isTransitioning = false;

  extended.forEach((url, i) => {
    const slide = document.createElement('div');
    slide.className = 'reel-slide';
    const video = document.createElement('video');
    video.src      = url;
    video.loop     = true;
    video.muted    = false;
    video.playsInline = true;
    video.preload  = 'metadata';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    slide.appendChild(video);
    track.appendChild(slide);
  });

  // Точки (только для реальных слайдов)
  allUrls.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'reel-dot' + (i === 0 ? ' active' : '');
    dots.appendChild(dot);
  });

  const slides    = track.querySelectorAll('.reel-slide');
  const dotEls    = dots.querySelectorAll('.reel-dot');
  const realCount = allUrls.length;

  // Установить позицию без анимации
  const goTo = (idx, animate) => {
    track.style.transition = animate
      ? 'transform 0.35s cubic-bezier(0.4,0,0.2,1)'
      : 'none';
    track.style.transform = `translateX(-${idx * 100}%)`;
  };

  // Обновить точки
  const updateDots = () => {
    const realIdx = ((current - 1) % realCount + realCount) % realCount;
    dotEls.forEach((d, i) => d.classList.toggle('active', i === realIdx));
  };

  // Воспроизведение текущего, пауза остальных
  const syncVideo = () => {
    slides.forEach((slide, i) => {
      const v = slide.querySelector('video');
      if (i === current) {
        v.play().catch(() => {
          // Автовоспроизведение со звуком заблокировано — пробуем muted
          v.muted = true;
          v.play();
        });
      } else {
        v.pause();
      }
    });
  };

  // Инициализация — позиция без анимации
  goTo(current, false);
  loading.classList.add('hidden');
  updateDots();
  syncVideo();

  // После анимации — прыжок для бесконечности
  track.addEventListener('transitionend', () => {
    isTransitioning = false;
    if (current === 0) {
      current = realCount;
      goTo(current, false);
      syncVideo();
    } else if (current === realCount + 1) {
      current = 1;
      goTo(current, false);
      syncVideo();
    }
    updateDots();
  });

  // ── Touch / swipe ─────────────────────────────────────
  let touchX = 0, touchY = 0, dragging = false;

  track.addEventListener('touchstart', e => {
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
    dragging = true;
  }, { passive: true });

  track.addEventListener('touchend', e => {
    if (!dragging) return;
    dragging = false;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    // Только горизонтальный свайп
    if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
    if (isTransitioning) return;
    isTransitioning = true;
    current += dx < 0 ? 1 : -1;
    goTo(current, true);
    syncVideo();
  }, { passive: true });
}