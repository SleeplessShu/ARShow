// pages/reels.js
import { storage, ref, listAll, getDownloadURL } from '../js/firebase.js';

let initialized = false;
let _activeVideo = null;

export function pause() {
  if (_activeVideo && !_activeVideo.paused) _activeVideo.pause();
}

export async function init(container) {
  if (initialized) return;
  initialized = true;

  // Вставляем стили один раз
  if (!document.getElementById('reels-style')) {
    const s = document.createElement('style');
    s.id = 'reels-style';
    s.textContent = `
      #tab-reels {
        padding: 0 !important;
        overflow: hidden !important;
        background: #000;
        position: relative !important;
      }
      #reels-root {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        background: #000;
        overflow: hidden;
      }
      #reels-viewport {
        flex: 1;
        overflow: hidden;
        position: relative;
        min-height: 0;
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
        display: flex;
        align-items: center;
        justify-content: center;
        background: #000;
        position: relative;
        overflow: hidden;
      }
      .reel-slide video {
        height: 100%;
        width: auto;
        max-width: 100%;
        object-fit: contain;
        display: block;
      }
      .reel-buf {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.4);
        opacity: 0; pointer-events: none;
        transition: opacity 0.2s; z-index: 2;
      }
      .reel-buf.show { opacity: 1; }
      .reel-buf-ring {
        width: 44px; height: 44px;
        border: 3px solid rgba(255,255,255,0.2);
        border-top-color: #fff; border-radius: 50%;
        animation: rs 0.9s linear infinite;
      }
      @keyframes rs { to { transform: rotate(360deg); } }
      .reel-tap-icon {
        position: absolute; inset: 0; z-index: 3;
        display: flex; align-items: center; justify-content: center;
        pointer-events: none; opacity: 0; transition: opacity 0.15s;
      }
      .reel-tap-icon.flash { opacity: 1; }
      #reels-mute {
        position: absolute; top: 14px; right: 14px;
        width: 38px; height: 38px; z-index: 10;
        background: rgba(0,0,0,0.5); backdrop-filter: blur(6px);
        border: none; border-radius: 50%; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        -webkit-tap-highlight-color: transparent;
      }
      #reels-mute svg { width: 18px; height: 18px; }
      .reels-arrow {
        position: absolute; top: 50%; transform: translateY(-50%);
        width: 42px; height: 42px; z-index: 10;
        background: rgba(0,0,0,0.45); backdrop-filter: blur(6px);
        border-radius: 50%; display: none;
        align-items: center; justify-content: center;
        font-size: 26px; color: rgba(255,255,255,0.8);
        cursor: pointer; user-select: none;
        transition: background 0.15s;
        -webkit-tap-highlight-color: transparent;
      }
      .reels-arrow:hover { background: rgba(0,0,0,0.7); }
      #reels-prev { left: 12px; }
      #reels-next { right: 12px; }
      @media (pointer: fine) { .reels-arrow { display: flex; } }
      #reels-dots {
        position: absolute; bottom: 10px; left: 50%;
        transform: translateX(-50%);
        display: flex; gap: 5px; z-index: 10; pointer-events: none;
      }
      .reel-dot {
        width: 5px; height: 5px; border-radius: 50%;
        background: rgba(255,255,255,0.3);
        transition: background 0.2s, transform 0.2s;
      }
      .reel-dot.active { background: #ccc; transform: scale(1.4); }
      #reels-loading {
        position: absolute; inset: 0; z-index: 20;
        display: flex; align-items: center; justify-content: center;
        gap: 10px; color: #555; font-size: 0.85rem;
        background: #000;
      }
      #reels-loading.hidden { display: none; }
    `;
    document.head.appendChild(s);
  }

  container.innerHTML = `
    <div id="reels-root">
      <div id="reels-viewport">
        <div id="reels-track"></div>
        <div id="reels-dots"></div>
        <div id="reels-prev" class="reels-arrow">&#8249;</div>
        <div id="reels-next" class="reels-arrow">&#8250;</div>
        <button id="reels-mute"></button>
      </div>
      <div id="reels-loading">
        <div class="mini-spin"></div><span>Загрузка...</span>
      </div>
    </div>`;

  const track   = container.querySelector('#reels-track');
  const dots    = container.querySelector('#reels-dots');
  const loading = container.querySelector('#reels-loading');
  const btnPrev = container.querySelector('#reels-prev');
  const btnNext = container.querySelector('#reels-next');
  const muteBtn = container.querySelector('#reels-mute');
  const viewport = container.querySelector('#reels-viewport');

  // ── Загрузка ─────────────────────────────────────────
  let urls = [];
  try {
    const result = await listAll(ref(storage, 'reels'));
    const items  = result.items.filter(i => /\.(mp4|mov|webm)$/i.test(i.name));
    if (!items.length) {
      loading.innerHTML = '<span style="color:#555">Нет видео в reels/</span>';
      return;
    }
    urls = await Promise.all(items.map(i => getDownloadURL(i)));
  } catch(e) {
    loading.innerHTML = `<span style="color:#f66;font-size:0.75rem">Ошибка: ${e.message}</span>`;
    return;
  }

  // ── Карусель [last, ...all, first] ───────────────────
  const all      = [...urls];
  const ext      = [all[all.length-1], ...all, all[0]];
  let cur        = 1;
  let muted      = false;
  let transitioning = false;

  const W = () => viewport.clientWidth || window.innerWidth;

  // Создаём слайды
  const slides = ext.map(url => {
    const slide = document.createElement('div');
    slide.className = 'reel-slide';

    const video = document.createElement('video');
    video.src          = url;
    video.loop         = true;
    video.muted        = false;
    video.playsInline  = true;
    video.preload      = 'auto';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    const buf = document.createElement('div');
    buf.className = 'reel-buf';
    buf.innerHTML = '<div class="reel-buf-ring"></div>';

    const icon = document.createElement('div');
    icon.className = 'reel-tap-icon';

    video.addEventListener('waiting', () => buf.classList.add('show'));
    video.addEventListener('playing', () => buf.classList.remove('show'));
    video.addEventListener('canplay', () => buf.classList.remove('show'));

    slide.append(video, buf, icon);
    track.appendChild(slide);
    return slide;
  });

  // Точки
  all.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'reel-dot' + (i===0?' active':'');
    dots.appendChild(d);
  });
  const dotEls = dots.querySelectorAll('.reel-dot');

  muteBtn.innerHTML = svgSound(false);

  // ── Навигация ─────────────────────────────────────────
  const setWidths = () => {
    const w = W();
    slides.forEach(s => { s.style.width = w + 'px'; });
  };

  const goTo = (idx, animate) => {
    track.style.transition = animate
      ? 'transform 0.35s cubic-bezier(0.4,0,0.2,1)'
      : 'none';
    track.style.transform = `translateX(-${idx * W()}px)`;
  };

  const updateDots = () => {
    const ri = ((cur-1) % all.length + all.length) % all.length;
    dotEls.forEach((d,i) => d.classList.toggle('active', i===ri));
  };

  const syncVideo = () => {
    slides.forEach((slide, i) => {
      const v = slide.querySelector('video');
      v.muted = muted;
      if (i === cur) {
        _activeVideo = v;
        const p = v.play();
        if (p) p.catch(() => {
          // Автовоспроизведение со звуком заблокировано
          muted = true; v.muted = true;
          muteBtn.innerHTML = svgSound(true);
          v.play().catch(()=>{});
        });
      } else {
        v.pause();
      }
    });
  };

  const navigate = dir => {
    if (transitioning) return;
    transitioning = true;
    cur += dir;
    goTo(cur, true);
    syncVideo();
  };

  track.addEventListener('transitionend', () => {
    transitioning = false;
    if (cur === 0)             { cur = all.length;   goTo(cur, false); syncVideo(); }
    else if (cur === all.length+1) { cur = 1;        goTo(cur, false); syncVideo(); }
    updateDots();
  });

  // ── Тап play/pause ────────────────────────────────────
  const flash = (slide, paused) => {
    const ic = slide.querySelector('.reel-tap-icon');
    ic.innerHTML = paused
      ? `<svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="30" fill="rgba(0,0,0,0.4)"/><path d="M24 18L48 32 24 46Z" fill="white"/></svg>`
      : `<svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="30" fill="rgba(0,0,0,0.4)"/><rect x="22" y="18" width="8" height="28" rx="2" fill="white"/><rect x="34" y="18" width="8" height="28" rx="2" fill="white"/></svg>`;
    ic.classList.add('flash');
    setTimeout(() => ic.classList.remove('flash'), 400);
  };

  viewport.addEventListener('click', e => {
    if (e.target.closest('#reels-mute, .reels-arrow')) return;
    if (transitioning) return;
    const v = slides[cur].querySelector('video');
    v.paused ? (v.play(), flash(slides[cur], false))
             : (v.pause(), flash(slides[cur], true));
  });

  // ── Звук ──────────────────────────────────────────────
  muteBtn.addEventListener('click', e => {
    e.stopPropagation();
    muted = !muted;
    muteBtn.innerHTML = svgSound(muted);
    slides.forEach(s => { s.querySelector('video').muted = muted; });
  });

  // ── Стрелки ───────────────────────────────────────────
  btnPrev.addEventListener('click', e => { e.stopPropagation(); navigate(-1); });
  btnNext.addEventListener('click', e => { e.stopPropagation(); navigate(1);  });

  // ── Свайп ─────────────────────────────────────────────
  let tx=0, ty=0;
  viewport.addEventListener('touchstart', e => { tx=e.touches[0].clientX; ty=e.touches[0].clientY; }, {passive:true});
  viewport.addEventListener('touchend',   e => {
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx)<40 || Math.abs(dy)>Math.abs(dx)) return;
    navigate(dx<0 ? 1 : -1);
  }, {passive:true});

  // ── Клавиши ───────────────────────────────────────────
  const onKey = e => {
    if (e.key==='ArrowRight') navigate(1);
    if (e.key==='ArrowLeft')  navigate(-1);
  };
  document.addEventListener('keydown', onKey);
  container._reelsKeyHandler = onKey;

  // ── Resize ────────────────────────────────────────────
  const onResize = () => { setWidths(); goTo(cur, false); };
  window.addEventListener('resize', onResize);
  container._reelsResizeHandler = onResize;

  // ── Старт: ждём два кадра чтобы layout был готов ─────
  requestAnimationFrame(() => requestAnimationFrame(() => {
    setWidths();
    goTo(cur, false);
    loading.classList.add('hidden');
    updateDots();
    syncVideo();
  }));
}

function svgSound(muted) {
  return muted
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
}
