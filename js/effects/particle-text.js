const TONES = 6;
const FADES = 6;
const SAMPLE_SCALE = 2;
const MAX_PARTICLES = 6000;

const DEFAULTS = {
  segments: [{ text: 'FILM', color: '#FFFFFF' }, { text: 'LOG', color: '#FF5A00' }],
  fontFamily: 'Anton', fontWeight: 400, fontSize: 64, letterSpacing: 0,
  step: 3, particleSize: 2, highlightColor: '#FF5A00',
  intro: 'gather', scatter: 120, gatherDuration: 1400, stagger: 400,
  pointerRepel: 30, repelRadius: 90, clickBurst: true,
  onReady: null
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function doNothing() {
}

function readOptions(options) {
  const settings = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (options && options[key] !== undefined) {
      settings[key] = options[key];
    } else {
      settings[key] = DEFAULTS[key];
    }
  }
  return settings;
}

async function loadFont(font, text) {
  try {
    await document.fonts.load(font, text);
  } catch (error) {
    console.warn(error);
  }
}

function resolve(value, input) {
  if (typeof value === 'function') {
    return value(input);
  }
  return value;
}

function firstGridLine(anchor, edge, step) {
  return anchor - Math.floor((anchor - edge) / step) * step;
}

function pushAway(p, x, y, radius, strength) {
  const dx = p.baseX - x;
  const dy = p.baseY - y;
  const distance = Math.hypot(dx, dy);
  if (distance > 0 && distance < radius) {
    const force = Math.pow(1 - distance / radius, 2) * strength;
    p.baseX += dx / distance * force;
    p.baseY += dy / distance * force;
  }
}

export function createParticleText(container, options) {
  const settings = readOptions(options);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const sampler = document.createElement('canvas');
  const sctx = sampler.getContext('2d', { willReadFrequently: true });
  if (!ctx || !sctx || !document.fonts) {
    return { destroy: doNothing };
  }

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { active: false, x: 0, y: 0, smoothX: 0, smoothY: 0 };
  const burst = { x: 0, y: 0, power: 0 };
  let allText = '';
  for (const segment of settings.segments) {
    allText += segment.text;
  }
  let reducedMotion = motionQuery.matches;
  let introPending = settings.intro === 'gather';
  let particles = [];
  let buckets = [];
  let dpr = 1;
  let fontPx = 16;
  let dotSize = 1;
  let pitch = 2;
  let raf = 0;
  let last = 0;
  let buildId = 0;
  let gathering = false;
  let gatherStart = 0;
  let onScreen = true;
  let alive = true;

  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position: absolute; left: 0; top: 0; display: block; touch-action: pan-y pinch-zoom;';
  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }
  container.append(canvas);

  function applyFont(font) {
    sctx.font = font;
    if ('letterSpacing' in sctx) {
      sctx.letterSpacing = settings.letterSpacing + 'px';
    }
  }

  function snapStep(step) {
    pitch = Math.max(2, Math.round(step * dpr));
    return pitch / dpr;
  }

  function offPixelEdge(value) {
    return (Math.floor(value * dpr) + 0.25) / dpr;
  }

  function collectTargets(layers, box, step) {
    const targets = [];
    const startX = offPixelEdge(firstGridLine(box.originX + step / 2, box.left, step));
    const startY = offPixelEdge(firstGridLine(box.baseline - step / 2, box.top, step));
    for (let i = 0; i < layers.length; i++) {
      for (let y = startY; y < box.bottom; y += step) {
        const row = Math.floor((y - box.top) * SAMPLE_SCALE) * sampler.width;
        for (let x = startX; x < box.right; x += step) {
          const column = Math.floor((x - box.left) * SAMPLE_SCALE);
          if (layers[i][(row + column) * 4 + 3] > 110) {
            targets.push({ x: x, y: y, segment: i });
          }
        }
      }
    }
    return targets;
  }

  async function sampleText() {
    buildId += 1;
    const myBuild = buildId;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const size = resolve(settings.fontSize, rect.width);
    const font = settings.fontWeight + ' ' + size + 'px ' + settings.fontFamily;
    await loadFont(font, allText);
    if (myBuild !== buildId || !alive) {
      return;
    }

    applyFont(font);
    const widths = [];
    let total = 0;
    for (const segment of settings.segments) {
      widths.push(sctx.measureText(segment.text).width);
      total += widths[widths.length - 1];
    }
    const metrics = sctx.measureText(allText);
    const ascent = metrics.fontBoundingBoxAscent || size * 0.8;
    const descent = metrics.fontBoundingBoxDescent || size * 0.2;
    const box = { originX: (rect.width - total) / 2, baseline: rect.height / 2 + (ascent - descent) / 2 };
    box.left = Math.floor(box.originX - 4);
    box.right = Math.ceil(box.originX + total + 4);
    box.top = Math.floor(box.baseline - (metrics.actualBoundingBoxAscent || size) - 4);
    box.bottom = Math.ceil(box.baseline + (metrics.actualBoundingBoxDescent || size * 0.3) + 4);
    sampler.width = (box.right - box.left) * SAMPLE_SCALE;
    sampler.height = (box.bottom - box.top) * SAMPLE_SCALE;
    applyFont(font);
    sctx.setTransform(SAMPLE_SCALE, 0, 0, SAMPLE_SCALE, -box.left * SAMPLE_SCALE, -box.top * SAMPLE_SCALE);
    sctx.fillStyle = '#ffffff';

    const layers = [];
    let textX = box.originX;
    for (let i = 0; i < settings.segments.length; i++) {
      sctx.clearRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
      sctx.fillText(settings.segments[i].text, textX, box.baseline);
      textX += widths[i];
      layers.push(sctx.getImageData(0, 0, sampler.width, sampler.height).data);
    }
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    let step = snapStep(resolve(settings.step, size));
    let targets = collectTargets(layers, box, step);
    while (targets.length > MAX_PARTICLES) {
      step = snapStep(step + 1 / dpr);
      targets = collectTargets(layers, box, step);
    }
    dotSize = resolve(settings.particleSize, size);

    particles = [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const seed = ((i * 9301 + 49297) % 233280) / 233280;
      const depth = 0.45 + (((i * 233 + 97) % 1000) / 1000) * 0.9;
      particles.push({ x: t.x, y: t.y, targetX: t.x, targetY: t.y, startX: t.x, startY: t.y, baseX: t.x, baseY: t.y, segment: t.segment, seed: seed, depth: depth, delay: 0 });
    }
    buckets = [];
    for (let i = 0; i < settings.segments.length * FADES * TONES; i++) {
      buckets.push([]);
    }

    fontPx = size;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = canvas.width / dpr + 'px';
    canvas.style.height = canvas.height / dpr + 'px';
    burst.power = 0;
    gathering = false;
    if (introPending && !reducedMotion) {
      startGather();
    }
    introPending = false;
    update(performance.now());
    if (typeof settings.onReady === 'function') {
      settings.onReady();
      settings.onReady = null;
    }
    wake();
  }

  function startGather() {
    const spread = settings.scatter;
    for (const p of particles) {
      const angle = p.seed * Math.PI * 2;
      const distance = spread * (0.35 + p.depth * 0.75);
      p.startX = p.targetX + Math.cos(angle) * distance + (p.seed - 0.5) * spread * 0.45;
      p.startY = p.targetY + Math.sin(angle) * distance + (p.depth - 0.9) * spread * 0.45;
      p.x = p.startX;
      p.y = p.startY;
      p.delay = p.seed * settings.stagger;
    }
    gatherStart = performance.now();
    gathering = true;
    wake();
  }

  function update(now) {
    let dt = 1 / 60;
    if (last) {
      dt = clamp((now - last) / 1000, 0, 0.05);
    }
    last = now;
    const frames = Math.max(dt * 60, 0.001);
    let follow = 1 - Math.pow(0.78, frames);
    if (reducedMotion) {
      follow = 1;
    }
    const chase = 1 - Math.pow(0.82, frames);
    pointer.smoothX += (pointer.x - pointer.smoothX) * chase;
    pointer.smoothY += (pointer.y - pointer.smoothY) * chase;
    burst.power *= Math.pow(0.86, frames);
    const repel = pointer.active && !reducedMotion && settings.pointerRepel > 0;
    const heatStart = fontPx * 0.03;
    const heatRange = Math.max(4, fontPx * 0.3);
    let moving = false;
    let complete = true;
    for (const bucket of buckets) {
      bucket.length = 0;
    }

    for (const p of particles) {
      let progress = 1;
      p.baseX = p.targetX;
      p.baseY = p.targetY;
      if (gathering) {
        progress = clamp((now - gatherStart - p.delay) / settings.gatherDuration, 0, 1);
        p.baseX = p.startX + (p.targetX - p.startX) * easeOutCubic(progress);
        p.baseY = p.startY + (p.targetY - p.startY) * easeOutCubic(progress);
        if (progress < 1) {
          complete = false;
        }
      }
      if (burst.power > 0.1) {
        pushAway(p, burst.x, burst.y, fontPx * 1.3, burst.power * (0.65 + p.depth * 0.45));
      }
      if (repel) {
        pushAway(p, pointer.smoothX, pointer.smoothY, settings.repelRadius, settings.pointerRepel);
      }

      p.x += (p.baseX - p.x) * follow;
      p.y += (p.baseY - p.y) * follow;
      if (Math.abs(p.baseX - p.x) + Math.abs(p.baseY - p.y) > 0.05) {
        moving = true;
      } else {
        p.x = p.baseX;
        p.y = p.baseY;
      }
      let heat = 0;
      if (!reducedMotion) {
        heat = clamp((Math.hypot(p.x - p.targetX, p.y - p.targetY) - heatStart) / heatRange, 0, 1);
      }
      const tone = Math.round(heat * (TONES - 1));
      const fade = Math.round(progress * (FADES - 1));
      buckets[(p.segment * FADES + fade) * TONES + tone].push(p);
    }

    if (complete) {
      gathering = false;
    }
    draw();
    const pointerMoving = Math.abs(pointer.x - pointer.smoothX) + Math.abs(pointer.y - pointer.smoothY) > 0.1;
    return gathering || moving || burst.power > 0.1 || (repel && pointerMoving);
  }

  function drawGroup(group) {
    const square = Math.max(1, Math.min(Math.round(dotSize * dpr), pitch - 1));
    ctx.beginPath();
    for (const p of group) {
      ctx.rect(Math.round(p.x * dpr - square / 2), Math.round(p.y * dpr - square / 2), square, square);
    }
    ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].length === 0) {
        continue;
      }
      const tone = i % TONES;
      const alpha = 0.35 + 0.65 * (Math.floor(i / TONES) % FADES) / (FADES - 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = settings.segments[Math.floor(i / (TONES * FADES))].color;
      drawGroup(buckets[i]);
      if (tone > 0) {
        ctx.globalAlpha = alpha * tone / (TONES - 1);
        ctx.fillStyle = settings.highlightColor;
        ctx.shadowColor = settings.highlightColor;
        ctx.shadowBlur = (3 + dotSize * 1.5) * dpr;
        drawGroup(buckets[i]);
        ctx.shadowBlur = 0;
      }
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    raf = 0;
    if (alive && update(now) && onScreen && !document.hidden) {
      raf = requestAnimationFrame(frame);
    }
  }

  function wake() {
    if (raf === 0 && alive && onScreen && !document.hidden && particles.length > 0) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  function sleep() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function locate(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
  }

  function handlePointerMove(event) {
    locate(event);
    if (!pointer.active) {
      pointer.smoothX = pointer.x;
      pointer.smoothY = pointer.y;
    }
    pointer.active = true;
    wake();
  }

  function handlePointerLeave() {
    pointer.active = false;
    wake();
  }

  function handleClick(event) {
    if (settings.clickBurst && !reducedMotion) {
      locate(event);
      burst.x = pointer.x;
      burst.y = pointer.y;
      burst.power = fontPx * 0.9;
      wake();
    }
  }

  function handleMotionChange(event) {
    reducedMotion = event.matches;
    sampleText();
  }

  function handleVisibility() {
    if (onScreen && !document.hidden) {
      wake();
    } else {
      sleep();
    }
  }

  function handleWindowResize() {
    if (Math.min(window.devicePixelRatio || 1, 2) !== dpr) {
      sampleText();
    }
  }

  function handleIntersect(entries) {
    for (const entry of entries) {
      onScreen = entry.isIntersecting;
    }
    handleVisibility();
  }

  function destroy() {
    alive = false;
    sleep();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    motionQuery.removeEventListener('change', handleMotionChange);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('resize', handleWindowResize);
    canvas.removeEventListener('pointermove', handlePointerMove);
    canvas.removeEventListener('pointerleave', handlePointerLeave);
    canvas.removeEventListener('click', handleClick);
    canvas.remove();
  }

  const resizeObserver = new ResizeObserver(sampleText);
  const intersectionObserver = new IntersectionObserver(handleIntersect);
  resizeObserver.observe(container);
  intersectionObserver.observe(container);
  motionQuery.addEventListener('change', handleMotionChange);
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('resize', handleWindowResize);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerleave', handlePointerLeave);
  canvas.addEventListener('click', handleClick);

  return { destroy: destroy };
}
