// pages/reels.js
import { storage, ref, listAll, getDownloadURL } from '../js/firebase.js';

let initialized = false;
let activeVideo = null; // для остановки при смене вкладки

export function pause() {
  if (activeVideo && !activeVideo.paused) activeVideo.pause();
}

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

  if (!document.getElementById('reels-style')) {
    const style = document.createElement('style');
    style.id = 'reels-style';
    style.textContent = `
      #tab-reels { padding: 0; overflow: hidden; position: relative; }

      #reels-wrap {
        width: 100%; height: 100%;
        position: relative; overflow: hidden;
        display: flex; flex-direction: column;
      }
      #reels-track {
        flex: 1; display: flex;
        transition: transform 0.35s cubic-bezier(0.4,0,0.2,1);
        will-change: transform; min-height: 0;
      }
      .reel-slide {
        flex-shrink: 0; width: 100%; height: 100%;
        position: relative; background: #000;
        display: flex; align-items: center; justify-content: center;
      }
      .reel-slide video {
        width: 100%; height: 100%;
        object-fit: cover; display: block;
      }

      /* Буферизация — спиннер поверх видео */
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

      /* Иконка play/pause в центре — мигает при тапе */
      .reel-tap-icon {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        pointer-events: none; opacity: 0;
        transition: opacity 0.15s;
      }
      .reel-tap-icon svg {
        width: 64px; height: 64px;
        filter: drop-shadow(0 2px 8px rgba(0,0,0,0.6));
      }
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

      /* Начальный оверлей загрузки */
      #reels-loading {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        gap: 10px; color: #555; font-size: 0.88rem;
        background: #171717; z-index: 3;
      }
      #reels-loading.hidden { display: none; }
    `;
    document.head.appendChild(style);
  }

  // Загрузить список
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

  // Клоны для бесконечности: [last, ...all, first]
  const allUrls  = [...urls];
  const extended = [allUrls[allUrls.length - 1], ...allUrls, allUrls[0]];
  let current = 1;
  let isMuted = false;
  let isTransitioning = false;

  // Создать слайды
  extended.forEach(url => {
    const slide = document.createElement('div');
    slide.className = 'reel-slide';

    const video = document.createElement('video');
    video.src         = url;
    video.loop        = true;
    video.muted       = false;
    video.playsInline = true;
    video.preload     = 'metadata';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    // Буфер-спиннер
    const buf = document.createElement('div');
    buf.className = 'reel-buf';
    buf.innerHTML = '<div class="reel-buf-ring"></div>';

    // Иконка тапа
    const tapIcon = document.createElement('div');
    tapIcon.className = 'reel-tap-icon';

    // Показать спиннер пока грузится
    video.addEventListener('waiting',  () => buf.classList.add('show'));
    video.addEventListener('playing',  () => buf.classList.remove('show'));
    video.addEventListener('canplay',  () => buf.classList.remove('show'));

    slide.appendChild(video);
    slide.appendChild(buf);
    slide.appendChild(tapIcon);
    track.appendChild(slide);
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

  const slides    = track.querySelectorAll('.reel-slide');
  const dotEls    = dots.querySelectorAll('.reel-dot');
  const realCount = allUrls.length;

  const goTo = (idx, animate) => {
    track.style.transition = animate
      ? 'transform 0.35s cubic-bezier(0.4,0,0.2,1)'
      : 'none';
    track.style.transform = `translateX(-${idx * 100}%)`;
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
        activeVideo = v;
        buf_show(slide, true);
        v.play().catch(() => {
          isMuted = true;
          v.muted = true;
          muteBtn.innerHTML = iconSound(true);
          v.play();
        });
      } else {
        v.pause();
      }
    });
  };

  const buf_show = (slide, loading) => {
    const v = slide.querySelector('video');
    const b = slide.querySelector('.reel-buf');
    if (loading && v.readyState < 3) b.classList.add('show');
  };

  // Иконка play/pause анимация
  const flashIcon = (slide, playing) => {
    const icon = slide.querySelector('.reel-tap-icon');
    icon.innerHTML = playing
      ? `<svg viewBox="0 0 64 64" fill="none">
           <circle cx="32" cy="32" r="30" fill="rgba(0,0,0,0.4)"/>
           <rect x="22" y="18" width="8" height="28" rx="2" fill="white"/>
           <rect x="34" y="18" width="8" height="28" rx="2" fill="white"/>
         </svg>`
      : `<svg viewBox="0 0 64 64" fill="none">
           <circle cx="32" cy="32" r="30" fill="rgba(0,0,0,0.4)"/>
           <path d="M24 18 L48 32 L24 46 Z" fill="white"/>
         </svg>`;
    icon.classList.add('flash');
    setTimeout(() => icon.classList.remove('flash'), 400);
  };

  // Тап — play/pause
  track.addEventListener('click', e => {
    if (isTransitioning) return;
    const slide = slides[current];
    const v     = slide.querySelector('video');
    if (v.paused) {
      v.play();
      flashIcon(slide, false); // показываем play (было пауза, теперь играет)
    } else {
      v.pause();
      flashIcon(slide, true);  // показываем паузу
    }
  });

  // Кнопка звука
  muteBtn.addEventListener('click', e => {
    e.stopPropagation();
    isMuted = !isMuted;
    muteBtn.innerHTML = iconSound(isMuted);
    slides.forEach(s => { s.querySelector('video').muted = isMuted; });
  });

  // Бесконечный loop после transition
  track.addEventListener('transitionend', () => {
    isTransitioning = false;
    if (current === 0) {
      current = realCount; goTo(current, false); syncVideo();
    } else if (current === realCount + 1) {
      current = 1; goTo(current, false); syncVideo();
    }
    updateDots();
  });

  // Свайп
  let tx = 0, ty = 0;
  track.addEventListener('touchstart', e => {
    tx = e.touches[0].clientX;
    ty = e.touches[0].clientY;
  }, { passive: true });

  track.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
    if (isTransitioning) return;
    isTransitioning = true;
    current += dx < 0 ? 1 : -1;
    goTo(current, true);
    syncVideo();
  }, { passive: true });

  // Старт
  goTo(current, false);
  loading.classList.add('hidden');
  updateDots();
  syncVideo();
}

function iconSound(muted) {
  return muted
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <line x1="23" y1="9" x2="17" y2="15"/>
        <line x1="17" y1="9" x2="23" y2="15"/>
       </svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
       </svg>`;
}
