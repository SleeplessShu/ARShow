// pages/reels.js
import { storage, ref, listAll, getDownloadURL } from '../js/firebase.js';

let initialized = false;

export function pause() {
  if (_activeVideo && !_activeVideo.paused) _activeVideo.pause();
}

let _activeVideo = null;

export async function init(container) {
  if (initialized) return;
  initialized = true;

  container.innerHTML = `
    <div id="reels-wrap">
      <div id="reels-track"></div>
      <div id="reels-dots"></div>
      <div id="reels-prev" class="reels-arrow">&#8249;</div>
      <div id="reels-next" class="reels-arrow">&#8250;</div>
      <div id="reels-loading">
        <div class="mini-spin"></div>
        <span>Загрузка...</span>
      </div>
    </div>`;

  const track   = container.querySelector('#reels-track');
  const dots    = container.querySelector('#reels-dots');
  const loading = container.querySelector('#reels-loading');
  const btnPrev = container.querySelector('#reels-prev');
  const btnNext = container.querySelector('#reels-next');

  if (!document.getElementById('reels-style')) {
    const style = document.createElement('style');
    style.id = 'reels-style';
    style.textContent = `
      #tab-reels {
        padding: 0;
        overflow: hidden;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0e0e0e;
      }

      #reels-wrap {
        /* Занимаем всю высоту вкладки, центрируем слайды */
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      #reels-track {
        display: flex;
        height: 100%;
        transition: transform 0.35s cubic-bezier(0.4,0,0.2,1);
        will-change: transform;
      }

      .reel-slide {
        flex-shrink: 0;
        height: 100%;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #000;
      }

      .reel-slide video {
        /* Вписываем по высоте — весь ролик виден */
        width: auto;
        height: 100%;
        max-width: 100%;
        object-fit: contain;
        display: block;
        background: #000;
      }

      /* Буферизация */
      .reel-buf {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.35);
        opacity: 0; pointer-events: none;
        transition: opacity 0.2s;
      }
      .reel-buf.show { opacity: 1; }
      .reel-buf-ring {
        width: 44px; height: 44px;
        border: 3px solid rgba(255,255,255,0.2);
        border-top-color: #fff;
        border-radius: 50%;
        animation: reel-spin 0.9s linear infinite;
      }
      @keyframes reel-spin { to { transform: rotate(360deg); } }

      /* Иконка play/pause */
      .reel-tap-icon {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        pointer-events: none; opacity: 0;
        transition: opacity 0.15s;
      }
      .reel-tap-icon svg { width: 64px; height: 64px; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.6)); }
      .reel-tap-icon.flash { opacity: 1; }

      /* Кнопка звука */
      #reels-mute {
        position: absolute; top: 16px; right: 16px;
        width: 40px; height: 40px;
        background: rgba(0,0,0,0.5);
        backdrop-filter: blur(8px);
        border: none; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; z-index: 4;
        -webkit-tap-highlight-color: transparent;
      }
      #reels-mute svg { width: 20px; height: 20px; }

      /* Стрелки (только десктоп) */
      .reels-arrow {
        position: absolute;
        top: 50%; transform: translateY(-50%);
        width: 44px; height: 44px;
        background: rgba(0,0,0,0.45);
        backdrop-filter: blur(8px);
        border-radius: 50%;
        display: none;           /* скрыты по умолчанию */
        align-items: center; justify-content: center;
        font-size: 28px; line-height: 1;
        color: rgba(255,255,255,0.8);
        cursor: pointer;
        user-select: none;
        z-index: 4;
        transition: background 0.15s;
        -webkit-tap-highlight-color: transparent;
      }
      .reels-arrow:hover { background: rgba(0,0,0,0.7); }
      #reels-prev { left: 12px; }
      #reels-next { right: 12px; }

      /* Показываем стрелки на десктопе */
      @media (pointer: fine) {
        .reels-arrow { display: flex; }
      }

      /* Точки */
      #reels-dots {
        position: absolute; bottom: 12px; left: 50%;
        transform: translateX(-50%);
        display: flex; gap: 6px; z-index: 2; pointer-events: none;
      }
      .reel-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: rgba(255,255,255,0.3);
        transition: background 0.2s, transform 0.2s;
      }
      .reel-dot.active { background: #d0d0d0; transform: scale(1.3); }

      /* Начальный оверлей */
      #reels-loading {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        gap: 10px; color: #555; font-size: 0.88rem;
        background: #0e0e0e; z-index: 3;
      }
      #reels-loading.hidden { display: none; }
    `;
    document.head.appendChild(style);
  }

  // ── Загрузка списка ───────────────────────────────────
  let urls = [];
  try {
    const reelsRef = ref(storage, 'reels');
    const result   = await listAll(reelsRef);
    const items    = result.items.filter(i => /\.(mp4|mov|webm)$/i.test(i.name));
    if (!items.length) {
      loading.innerHTML = '<span style="color:#444;">Нет видео в папке reels/</span>';
      return;
    }
    urls = await Promise.all(items.map(i => getDownloadURL(i)));
  } catch (e) {
    loading.innerHTML = `<span style="color:#ff6655;font-size:0.75rem;">Ошибка: ${e.message}</span>`;
    return;
  }

  // ── Бесконечная карусель [last, ...all, first] ────────
  const allUrls  = [...urls];
  const extended = [allUrls[allUrls.length - 1], ...allUrls, allUrls[0]];
  let current = 1;
  let isMuted = false;
  let isTransitioning = false;

  // Ширина одного слайда = ширина контейнера
  const slideW = () => track.parentElement.clientWidth;

  // Создать слайды
  const slides = extended.map(url => {
    const slide = document.createElement('div');
    slide.className = 'reel-slide';
    slide.style.width = slideW() + 'px';

    const video = document.createElement('video');
    video.src         = url;
    video.loop        = true;
    video.muted       = false;
    video.playsInline = true;
    video.preload     = 'metadata';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    const buf = document.createElement('div');
    buf.className = 'reel-buf';
    buf.innerHTML = '<div class="reel-buf-ring"></div>';

    const tapIcon = document.createElement('div');
    tapIcon.className = 'reel-tap-icon';

    video.addEventListener('waiting', () => buf.classList.add('show'));
    video.addEventListener('playing', () => buf.classList.remove('show'));
    video.addEventListener('canplay', () => buf.classList.remove('show'));

    slide.appendChild(video);
    slide.appendChild(buf);
    slide.appendChild(tapIcon);
    track.appendChild(slide);
    return slide;
  });

  // Кнопка звука
  const muteBtn = document.createElement('button');
  muteBtn.id = 'reels-mute';
  muteBtn.innerHTML = iconSound(false);
  container.querySelector('#reels-wrap').appendChild(muteBtn);

  // Точки
  allUrls.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'reel-dot' + (i === 0 ? ' active' : '');
    dots.appendChild(dot);
  });

  const dotEls    = dots.querySelectorAll('.reel-dot');
  const realCount = allUrls.length;

  // ── Навигация ──────────────────────────────────────────
  const goTo = (idx, animate) => {
    track.style.transition = animate
      ? 'transform 0.35s cubic-bezier(0.4,0,0.2,1)'
      : 'none';
    track.style.transform = `translateX(-${idx * slideW()}px)`;
  };

  const updateDots = () => {
    const ri = ((current - 1) % realCount + realCount) % realCount;
    dotEls.forEach((d, i) => d.classList.toggle('active', i === ri));
  };

  const syncVideo = () => {
    slides.forEach((slide, i) => {
      const v = slide.querySelector('video');
      v.muted = isMuted;
      if (i === current) {
        _activeVideo = v;
        v.play().catch(() => {
          isMuted = true; v.muted = true;
          muteBtn.innerHTML = iconSound(true);
          v.play();
        });
      } else {
        v.pause();
      }
    });
  };

  const navigate = (dir) => {
    if (isTransitioning) return;
    isTransitioning = true;
    current += dir;
    goTo(current, true);
    syncVideo();
  };

  track.addEventListener('transitionend', () => {
    isTransitioning = false;
    if (current === 0) {
      current = realCount; goTo(current, false); syncVideo();
    } else if (current === realCount + 1) {
      current = 1; goTo(current, false); syncVideo();
    }
    updateDots();
  });

  // ── Тап — play/pause ──────────────────────────────────
  const flashIcon = (slide, isPaused) => {
    const icon = slide.querySelector('.reel-tap-icon');
    icon.innerHTML = isPaused
      ? `<svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="30" fill="rgba(0,0,0,0.4)"/><path d="M24 18 L48 32 L24 46 Z" fill="white"/></svg>`
      : `<svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="30" fill="rgba(0,0,0,0.4)"/><rect x="22" y="18" width="8" height="28" rx="2" fill="white"/><rect x="34" y="18" width="8" height="28" rx="2" fill="white"/></svg>`;
    icon.classList.add('flash');
    setTimeout(() => icon.classList.remove('flash'), 400);
  };

  track.addEventListener('click', e => {
    if (isTransitioning) return;
    const slide = slides[current];
    const v = slide.querySelector('video');
    if (v.paused) { v.play(); flashIcon(slide, false); }
    else          { v.pause(); flashIcon(slide, true); }
  });

  // ── Кнопка звука ──────────────────────────────────────
  muteBtn.addEventListener('click', e => {
    e.stopPropagation();
    isMuted = !isMuted;
    muteBtn.innerHTML = iconSound(isMuted);
    slides.forEach(s => { s.querySelector('video').muted = isMuted; });
  });

  // ── Стрелки (десктоп) ─────────────────────────────────
  btnPrev.addEventListener('click', e => { e.stopPropagation(); navigate(-1); });
  btnNext.addEventListener('click', e => { e.stopPropagation(); navigate(1);  });

  // ── Свайп (мобайл) ────────────────────────────────────
  let tx = 0, ty = 0;
  track.addEventListener('touchstart', e => {
    tx = e.touches[0].clientX;
    ty = e.touches[0].clientY;
  }, { passive: true });
  track.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
    navigate(dx < 0 ? 1 : -1);
  }, { passive: true });

  // ── Клавиши (десктоп) ─────────────────────────────────
  const onKey = e => {
    if (e.key === 'ArrowRight') navigate(1);
    if (e.key === 'ArrowLeft')  navigate(-1);
  };
  document.addEventListener('keydown', onKey);
  // Сохраняем для удаления при смене вкладки
  container._reelsKeyHandler = onKey;

  // ── Resize — пересчитать ширину слайдов ───────────────
  const onResize = () => {
    const w = slideW();
    slides.forEach(s => { s.style.width = w + 'px'; });
    goTo(current, false);
  };
  window.addEventListener('resize', onResize);
  container._reelsResizeHandler = onResize;

  // ── Старт ─────────────────────────────────────────────
  goTo(current, false);
  loading.classList.add('hidden');
  updateDots();
  syncVideo();
}

function iconSound(muted) {
  return muted
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
       </svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
       </svg>`;
}
