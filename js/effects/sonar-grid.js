const TAU = Math.PI * 2;
const COLOR_STEPS = 32;
const SEED_AGE_MS = 500;
const TAP_SLOP = 10;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readOption(options, name, fallback) {
  if (options === undefined || options === null || options[name] === undefined) {
    return fallback;
  }
  return options[name];
}

function currentDpr() {
  return Math.min(window.devicePixelRatio || 1, 2);
}

function destroyNothing() {
  return null;
}

function toRgb(ctx, color) {
  ctx.fillStyle = '#000000';
  ctx.fillStyle = color;
  const value = String(ctx.fillStyle);
  if (value.charAt(0) === '#') {
    return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];
  }
  const parts = value.slice(value.indexOf('(') + 1, value.indexOf(')')).split(',');
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

function blendSteps(from, to) {
  const steps = [];
  for (let i = 0; i < COLOR_STEPS; i++) {
    const t = i / (COLOR_STEPS - 1);
    const r = Math.round(from[0] + (to[0] - from[0]) * t);
    const g = Math.round(from[1] + (to[1] - from[1]) * t);
    const b = Math.round(from[2] + (to[2] - from[2]) * t);
    steps.push('rgb(' + r + ', ' + g + ', ' + b + ')');
  }
  return steps;
}

export function createSonarGrid(container, options) {
  const settings = {
    spacing: Math.max(4, readOption(options, 'spacing', 26)),
    dotRadius: Math.max(0.2, readOption(options, 'dotRadius', 1.4)),
    baseOpacity: clamp(readOption(options, 'baseOpacity', 0.28), 0, 1),
    peakOpacity: clamp(readOption(options, 'peakOpacity', 1), 0, 1),
    color: readOption(options, 'color', null),
    ringColor: readOption(options, 'ringColor', null),
    pingEvery: Math.max(0, readOption(options, 'pingEvery', 2.4)),
    pingRest: readOption(options, 'pingRest', null),
    speed: Math.max(1, readOption(options, 'speed', 260)),
    ringWidth: Math.max(1, readOption(options, 'ringWidth', 90)),
    amplitude: Math.max(0, readOption(options, 'amplitude', 2.2)),
    maxRings: Math.max(1, readOption(options, 'maxRings', 6)),
    seedPing: readOption(options, 'seedPing', true),
    pingArea: readOption(options, 'pingArea', [0.15, 0.2, 0.85, 0.8]),
    interactive: readOption(options, 'interactive', true),
    pingSource: readOption(options, 'pingSource', container),
    ignoreSelector: readOption(options, 'ignoreSelector', null),
    watch: readOption(options, 'watch', null),
    className: readOption(options, 'className', 'sonar-grid')
  };
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    return { destroy: destroyNothing };
  }
  canvas.className = settings.className;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position: absolute; inset: 0; display: block; width: 100%; height: 100%; pointer-events: none;';
  container.prepend(canvas);

  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const size = { w: 1, h: 1 };
  let rings = [];
  let steps = [];
  let raf = 0;
  let timer = 0;
  let alive = true;
  let seeded = false;
  let canvasShown = true;
  let watchShown = settings.watch === null;
  let nextPing = performance.now() + settings.pingEvery * 1000;
  let press = null;

  function readColors() {
    let color = settings.color;
    if (color === null || color === '') {
      color = getComputedStyle(canvas).color;
    }
    let ringColor = settings.ringColor;
    if (ringColor === null || ringColor === '') {
      ringColor = color;
    }
    steps = blendSteps(toRgb(ctx, color), toRgb(ctx, ringColor));
  }

  function pointIn(u, v) {
    const area = settings.pingArea;
    return { x: size.w * (area[0] + (area[2] - area[0]) * u), y: size.h * (area[1] + (area[3] - area[1]) * v) };
  }

  function ringLife() {
    return (Math.hypot(size.w, size.h) + settings.ringWidth) / settings.speed;
  }

  function planPing(now, born) {
    let wait = settings.pingEvery * 1000;
    if (settings.pingRest !== null) {
      wait = Math.max(wait, born - now + (ringLife() + settings.pingRest) * 1000);
    }
    nextPing = now + wait;
  }

  function addRing(x, y, born) {
    readColors();
    rings.push({ x: x, y: y, born: born });
    while (rings.length > settings.maxRings) {
      rings.shift();
    }
  }

  function strengthAt(x, y, waves) {
    let best = 0;
    for (const wave of waves) {
      if (Math.abs(x - wave.x) > wave.reach || Math.abs(y - wave.y) > wave.reach) {
        continue;
      }
      const gap = Math.abs(Math.hypot(x - wave.x, y - wave.y) - wave.radius);
      if (gap >= settings.ringWidth) {
        continue;
      }
      const t = 1 - gap / settings.ringWidth;
      const strength = t * t * (3 - 2 * t) * wave.fade;
      if (strength > best) {
        best = strength;
      }
    }
    return best;
  }

  function draw(now) {
    const life = ringLife();
    const kept = [];
    const waves = [];
    for (const ring of rings) {
      const age = (now - ring.born) / 1000;
      if (age < life) {
        const radius = age * settings.speed;
        kept.push(ring);
        waves.push({ x: ring.x, y: ring.y, radius: radius, reach: radius + settings.ringWidth, fade: Math.min(1, 1 - age / life) });
      }
    }
    rings = kept;

    ctx.clearRect(0, 0, size.w, size.h);
    const gap = settings.spacing;
    const cols = Math.ceil(size.w / gap) + 1;
    const rows = Math.ceil(size.h / gap) + 1;
    const left = (size.w - (cols - 1) * gap) / 2;
    const top = (size.h - (rows - 1) * gap) / 2;
    const lit = [];
    ctx.globalAlpha = settings.baseOpacity;
    ctx.fillStyle = steps[0];
    ctx.beginPath();
    for (let col = 0; col < cols; col++) {
      const x = left + col * gap;
      for (let row = 0; row < rows; row++) {
        const y = top + row * gap;
        const strength = strengthAt(x, y, waves);
        if (strength < 0.01) {
          ctx.moveTo(x + settings.dotRadius, y);
          ctx.arc(x, y, settings.dotRadius, 0, TAU);
        } else {
          lit.push(x, y, strength);
        }
      }
    }
    ctx.fill();

    for (let i = 0; i < lit.length; i += 3) {
      const strength = lit[i + 2];
      ctx.globalAlpha = settings.baseOpacity + (settings.peakOpacity - settings.baseOpacity) * strength;
      ctx.fillStyle = steps[Math.round(strength * (COLOR_STEPS - 1))];
      ctx.beginPath();
      ctx.arc(lit[i], lit[i + 1], settings.dotRadius * (1 + settings.amplitude * strength), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    const dpr = currentDpr();
    size.w = Math.max(1, Math.round(rect.width));
    size.h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  }

  function seed(now) {
    seeded = true;
    if (settings.seedPing) {
      const point = pointIn(0.68, 0.34);
      addRing(point.x, point.y, now - SEED_AGE_MS);
      planPing(now, now - SEED_AGE_MS);
    } else {
      nextPing = now + settings.pingEvery * 1000;
    }
  }

  function handleIdle() {
    timer = 0;
    tick(performance.now());
  }

  function scheduleIdle(delay) {
    clearTimeout(timer);
    timer = setTimeout(handleIdle, Math.max(16, delay));
  }

  function tick(now) {
    raf = 0;
    if (!alive || !canvasShown || !watchShown || document.hidden) {
      return;
    }
    if (reduceQuery.matches) {
      rings = [];
      draw(now);
      return;
    }
    if (!seeded) {
      seed(now);
    }
    if (settings.pingEvery > 0 && now >= nextPing) {
      const point = pointIn(Math.random(), Math.random());
      addRing(point.x, point.y, now);
      planPing(now, now);
    }
    draw(now);
    if (rings.length > 0) {
      raf = requestAnimationFrame(tick);
    } else if (settings.pingEvery > 0) {
      scheduleIdle(nextPing - now);
    }
  }

  function wake() {
    if (raf !== 0 || !alive) {
      return;
    }
    clearTimeout(timer);
    timer = 0;
    raf = requestAnimationFrame(tick);
  }

  function handleResize() {
    resize();
  }

  function pingAt(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    addRing(clientX - rect.left, clientY - rect.top, performance.now());
    wake();
  }

  function handlePointerDown(event) {
    press = null;
    if (!settings.interactive || reduceQuery.matches || !event.isPrimary || event.button !== 0) {
      return;
    }
    if (settings.ignoreSelector !== null && event.target instanceof Element && event.target.closest(settings.ignoreSelector) !== null) {
      return;
    }
    if (event.pointerType === 'mouse') {
      pingAt(event.clientX, event.clientY);
      return;
    }
    press = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event) {
    if (press === null || event.pointerId !== press.id) {
      return;
    }
    const start = press;
    press = null;
    if (reduceQuery.matches || Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP) {
      return;
    }
    pingAt(start.x, start.y);
  }

  function handlePointerCancel(event) {
    if (press !== null && event.pointerId === press.id) {
      press = null;
    }
  }

  function handleIntersect(entries) {
    for (const entry of entries) {
      if (entry.target === canvas) {
        canvasShown = entry.isIntersecting;
      } else {
        watchShown = entry.isIntersecting;
      }
    }
    if (canvasShown && watchShown) {
      wake();
    }
  }

  function handleVisibility() {
    if (!document.hidden) {
      wake();
    }
  }

  function handleMotionChange() {
    wake();
  }

  function destroy() {
    alive = false;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    settings.pingSource.removeEventListener('pointerdown', handlePointerDown);
    settings.pingSource.removeEventListener('pointerup', handlePointerUp);
    settings.pingSource.removeEventListener('pointercancel', handlePointerCancel);
    document.removeEventListener('visibilitychange', handleVisibility);
    reduceQuery.removeEventListener('change', handleMotionChange);
    canvas.remove();
    return null;
  }

  const resizeObserver = new ResizeObserver(handleResize);
  const intersectionObserver = new IntersectionObserver(handleIntersect, { threshold: 0 });
  readColors();
  resize();
  resizeObserver.observe(container);
  intersectionObserver.observe(canvas);
  if (settings.watch !== null) {
    intersectionObserver.observe(settings.watch);
  }
  settings.pingSource.addEventListener('pointerdown', handlePointerDown, { passive: true });
  settings.pingSource.addEventListener('pointerup', handlePointerUp, { passive: true });
  settings.pingSource.addEventListener('pointercancel', handlePointerCancel, { passive: true });
  document.addEventListener('visibilitychange', handleVisibility);
  reduceQuery.addEventListener('change', handleMotionChange);
  wake();
  return { destroy: destroy };
}
