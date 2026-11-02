import { el } from './ui.js';
import { loadCatalog } from './repository.js';
import { createParticleText } from './effects/particle-text.js';

const QUOTE_LINES = [
  '기록은 우리가 어디서 왔는지, 어디에 가고 있는지를 알게 해준다.',
  '그것은 우리의 과거, 현재 및 미래에 대한 지도이다.'
];
const CAMERA_SPECS = ['24 FPS', '180°', 'ISO 800', '5600K'];
const CORNERS = ['tl', 'tr', 'bl', 'br'];
const WALL_ROWS = 8;
const MIN_POSTERS_PER_ROW = 14;

const SETTINGS = {
  scrollDistance: 1.1,
  holdDistance: 0.3,
  smoothing: 0.1,
  mediaZoom: 1.2,
  startRadius: 2,
  wideRatio: 2.39,
  tallRatio: 4 / 5,
  blurStart: 4,
  grayEnd: 0.4,
  scrimStart: 0.74,
  scrimEnd: 0.42
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function logoStep(fontPx) {
  return clamp(fontPx / 48, 1.5, 3);
}

function logoDot(fontPx) {
  return logoStep(fontPx) * 2 / 3;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatTimecode(ms) {
  const frames = Math.floor(ms * 24 / 1000);
  const seconds = Math.floor(frames / 24);
  const hours = Math.floor(seconds / 3600) % 100;
  const minutes = Math.floor(seconds / 60) % 60;
  return pad2(hours) + ':' + pad2(minutes) + ':' + pad2(seconds % 60) + ':' + pad2(frames % 24);
}

function cameFromThisSite() {
  let type = 'navigate';
  const entries = performance.getEntriesByType('navigation');
  if (entries.length > 0) {
    type = entries[0].type;
  }
  if (type === 'back_forward') {
    return true;
  }
  if (type === 'reload' || document.referrer === '') {
    return false;
  }
  try {
    return new URL(document.referrer).origin === location.origin;
  } catch (error) {
    return false;
  }
}

function frameSize(width, height) {
  let frameWidth = width * 0.88;
  let frameHeight = frameWidth / SETTINGS.tallRatio;
  if (width >= 768) {
    frameWidth = Math.max(width * 0.7, Math.min(width * 0.9, 300 * SETTINGS.wideRatio));
    frameHeight = frameWidth / SETTINGS.wideRatio;
    if (frameHeight > height * 0.62) {
      frameHeight = height * 0.62;
      frameWidth = frameHeight * SETTINGS.wideRatio;
    }
  } else if (frameHeight > height * 0.7) {
    frameHeight = height * 0.7;
  }
  return { width: frameWidth, height: frameHeight };
}

function posterUrls(catalog) {
  const urls = [];
  for (const movie of catalog.Movie) {
    if (typeof movie.poster_url === 'string' && movie.poster_url !== '') {
      urls.push(movie.poster_url);
    }
  }
  return urls;
}

async function fillWall(wall) {
  let urls = [];
  try {
    urls = posterUrls(await loadCatalog());
  } catch (error) {
    urls = [];
  }
  let perRow = MIN_POSTERS_PER_ROW;
  if (urls.length > 0 && urls.length < perRow) {
    perRow = urls.length * Math.ceil(perRow / urls.length);
  }
  for (let row = 0; row < WALL_ROWS; row++) {
    const strip = el('div', { className: 'intro-wall-row' });
    for (let i = 0; i < perRow * 2; i++) {
      const poster = el('span', { className: 'intro-wall-poster' });
      if (urls.length > 0) {
        poster.style.backgroundImage = 'url("' + urls[(i % perRow + row * 3) % urls.length] + '")';
      }
      strip.append(poster);
    }
    wall.append(strip);
  }
}

function mountLogo(word, layer) {
  const style = getComputedStyle(word);
  const size = parseFloat(style.fontSize);

  function readFontSize() {
    return parseFloat(getComputedStyle(word).fontSize);
  }

  function showParticles() {
    word.classList.add('intro-logo-ready');
  }

  createParticleText(layer, {
    segments: [{ text: 'FILM', color: '#FFFFFF' }, { text: 'LOG', color: '#FF5A00' }],
    fontFamily: style.fontFamily,
    fontWeight: 400,
    fontSize: readFontSize,
    letterSpacing: parseFloat(style.letterSpacing) || 0,
    step: logoStep,
    particleSize: logoDot,
    intro: 'gather',
    scatter: size * 0.75,
    gatherDuration: 1600,
    stagger: 700,
    pointerRepel: size * 0.22,
    repelRadius: size * 0.65,
    clickBurst: true,
    highlightColor: '#FF5A00',
    onReady: showParticles
  });
}

function buildIntro() {
  const parts = {};
  parts.section = el('section', { className: 'intro', 'aria-label': '소개 화면' });
  parts.stage = el('div', { className: 'intro-stage' });
  parts.skip = el('button', { className: 'intro-skip', type: 'button' }, '건너뛰기');
  parts.wall = el('div', { className: 'intro-wall' });
  parts.scrim = el('div', { className: 'intro-scrim' });
  parts.frame = el('div', { className: 'intro-frame', 'aria-hidden': 'true' }, parts.wall, parts.scrim);

  parts.timecode = el('span', { className: 'intro-timecode' }, '00:00:00:00');
  const specs = el('span', { className: 'intro-specs' });
  for (const spec of CAMERA_SPECS) {
    specs.append(el('span', {}, spec));
  }
  parts.hud = el('div', { className: 'intro-hud', 'aria-hidden': 'true' });
  for (const corner of CORNERS) {
    parts.hud.append(el('span', { className: 'intro-corner intro-corner-' + corner }));
  }
  const rec = el('span', { className: 'intro-rec' }, el('span', { className: 'intro-rec-dot' }), 'REC');
  const power = el('span', { className: 'intro-power' }, el('span', { className: 'intro-battery' }), '4K');
  parts.hud.append(
    el('p', { className: 'intro-hud-row intro-hud-top' }, rec, parts.timecode),
    el('p', { className: 'intro-hud-row intro-hud-bottom' }, specs, power)
  );

  parts.layer = el('span', { className: 'intro-logo-layer' });
  parts.word = el('span', { className: 'intro-logo-word' }, 'FILM', el('span', { className: 'intro-logo-accent' }, 'LOG'), parts.layer);
  const quote = el('p', { className: 'intro-quote' },
    el('span', { className: 'intro-quote-line' }, QUOTE_LINES[0]), ' ',
    el('span', { className: 'intro-quote-line' }, QUOTE_LINES[1])
  );
  parts.copy = el('div', { className: 'intro-copy' }, el('p', { className: 'intro-logo' }, parts.word), quote);
  parts.hint = el('p', { className: 'intro-hint', 'aria-hidden': 'true' }, el('span', {}, '아래로 스크롤'), el('span', { className: 'intro-hint-arrow' }));

  const grain = el('div', { className: 'intro-grain', 'aria-hidden': 'true' });
  parts.stage.append(parts.skip, grain, parts.frame, parts.hud, parts.copy, parts.hint);
  parts.section.append(parts.stage);
  return parts;
}

function mountIntro() {
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  const sidebar = document.querySelector('#sidebar');
  if (sidebar === null || location.hash !== '' || cameFromThisSite()) {
    return;
  }

  const parts = buildIntro();
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const touchQuery = window.matchMedia('(pointer: coarse)');
  let stageWidth = 0;
  let stageHeight = 0;
  let lastWidth = 0;
  let frame = { width: 0, height: 0 };
  let current = 0;
  let target = 0;
  let raf = 0;
  let lastTime = 0;
  let clock = 0;
  let onScreen = true;

  function measure() {
    stageWidth = parts.section.clientWidth;
    stageHeight = window.innerHeight;
    lastWidth = window.innerWidth;
    frame = frameSize(stageWidth, stageHeight);
    parts.stage.style.height = stageHeight + 'px';
    parts.section.style.height = stageHeight * (1 + SETTINGS.scrollDistance + SETTINGS.holdDistance) + 'px';
    parts.stage.style.setProperty('--intro-frame-width', frame.width + 'px');
  }

  function readProgress() {
    const top = parts.section.getBoundingClientRect().top;
    return clamp(-top / (stageHeight * SETTINGS.scrollDistance), 0, 1);
  }

  function applyProgress(p) {
    const e = smoothstep(0, 1, p);
    const insetX = (stageWidth - frame.width) / 2 * (1 - e);
    const insetY = (stageHeight - frame.height) / 2 * (1 - e);
    const radius = SETTINGS.startRadius * (1 - e);
    parts.frame.style.clipPath = 'inset(' + insetY + 'px ' + insetX + 'px round ' + radius + 'px)';
    parts.hud.style.inset = insetY + 'px ' + insetX + 'px';
    parts.hud.style.opacity = 1 - smoothstep(0.3, 0.6, p);

    let zoom = SETTINGS.mediaZoom;
    const blur = SETTINGS.blurStart * (1 - smoothstep(0.2, 0.9, p));
    if (motionQuery.matches) {
      zoom = 1;
    }
    let filter = 'grayscale(' + (1 - (1 - SETTINGS.grayEnd) * smoothstep(0.15, 1, p)) + ')';
    if (blur > 0.05) {
      filter += ' blur(' + blur.toFixed(2) + 'px)';
    }
    parts.wall.style.filter = filter;
    parts.wall.style.transform = 'scale(' + (zoom + (1 - zoom) * e) + ')';
    parts.scrim.style.opacity = SETTINGS.scrimStart + (SETTINGS.scrimEnd - SETTINGS.scrimStart) * smoothstep(0.55, 1, p);

    const out = smoothstep(0.35, 0.7, p);
    parts.copy.style.opacity = 1 - out;
    parts.copy.style.transform = 'translate3d(0, ' + Math.round(-28 * out) + 'px, 0)';
    if (out > 0.98) {
      parts.copy.style.pointerEvents = 'none';
    } else {
      parts.copy.style.pointerEvents = '';
    }

    const gone = smoothstep(0, 0.12, p);
    parts.hint.style.opacity = 1 - gone;
    parts.hint.style.transform = 'translate3d(0, ' + 8 * gone + 'px, 0)';
  }

  function tick(now) {
    let dt = 1 / 60;
    if (lastTime > 0) {
      dt = clamp((now - lastTime) / 1000, 0, 0.05);
    }
    lastTime = now;
    current += (target - current) * (1 - Math.exp(-dt / SETTINGS.smoothing));
    raf = 0;
    if (Math.abs(target - current) < 0.0004) {
      current = target;
      lastTime = 0;
    } else {
      raf = requestAnimationFrame(tick);
    }
    applyProgress(current);
  }

  function handleScroll() {
    target = readProgress();
    if (target === current) {
      return;
    }
    if (motionQuery.matches) {
      current = target;
      applyProgress(current);
    } else if (raf === 0) {
      raf = requestAnimationFrame(tick);
    }
  }

  function remeasure() {
    measure();
    target = readProgress();
    current = target;
    applyProgress(current);
  }

  function handleResize() {
    const toolbarOnly = touchQuery.matches && window.innerWidth === lastWidth && Math.abs(window.innerHeight - stageHeight) < 160;
    if (!toolbarOnly) {
      remeasure();
    }
  }

  function showTimecode() {
    parts.timecode.textContent = formatTimecode(performance.now());
  }

  function updateRunning() {
    const running = onScreen && !document.hidden;
    parts.section.classList.toggle('intro-paused', !running);
    clearInterval(clock);
    clock = 0;
    if (running && !motionQuery.matches) {
      showTimecode();
      clock = setInterval(showTimecode, 1000 / 24);
    }
  }

  function handleIntersect(entries) {
    for (const entry of entries) {
      onScreen = entry.isIntersecting;
    }
    updateRunning();
  }

  function handleMotionChange() {
    updateRunning();
    remeasure();
  }

  function handleSkip() {
    sidebar.scrollIntoView({ block: 'start' });
    const app = document.querySelector('#app');
    if (app !== null) {
      app.focus({ preventScroll: true });
    }
  }

  sidebar.before(parts.section);
  remeasure();
  updateRunning();
  fillWall(parts.wall);
  mountLogo(parts.word, parts.layer);

  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', handleResize);
  document.addEventListener('visibilitychange', updateRunning);
  motionQuery.addEventListener('change', handleMotionChange);
  parts.skip.addEventListener('click', handleSkip);
  new IntersectionObserver(handleIntersect, { rootMargin: '-1px 0px' }).observe(parts.section);
}

mountIntro();
