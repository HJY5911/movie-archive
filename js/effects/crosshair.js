const FONT = '500 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const TAG_HEIGHT = 18;
const PULSE_SECONDS = 0.55;
const RESUME_MS = 1000;
const CORNERS = [[0, 0, 1, 1], [1, 0, -1, 1], [1, 1, -1, -1], [0, 1, 1, -1]];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ease(dt, seconds) {
  return 1 - Math.exp(-dt / seconds);
}

function approach(value, goal, amount) {
  const next = value + (goal - value) * amount;
  if (Math.abs(goal - next) < 0.01) {
    return goal;
  }
  return next;
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

export function createCrosshair(container, options) {
  const settings = {
    color: readOption(options, 'color', '#0b0b0b'),
    lockColor: readOption(options, 'lockColor', '#ff5a00'),
    thickness: clamp(readOption(options, 'thickness', 1), 0.5, 8),
    opacity: clamp(readOption(options, 'opacity', 0.85), 0, 1),
    gap: Math.max(0, readOption(options, 'gap', 0)),
    smoothing: clamp(readOption(options, 'smoothing', 0.35), 0, 1),
    targetSelector: readOption(options, 'targetSelector', 'a, button'),
    readout: readOption(options, 'readout', null),
    clickPulse: readOption(options, 'clickPulse', true),
    className: readOption(options, 'className', 'map-crosshair'),
    resume: readOption(options, 'resume', null)
  };
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    return { destroy: destroyNothing };
  }
  canvas.className = settings.className;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;';
  container.append(canvas);
  container.classList.add(settings.className + '-on');

  const labelFont = '600 12px ' + getComputedStyle(container).fontFamily;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const size = { w: 0, h: 0, dpr: 1 };
  const state = {
    x: 0, y: 0, px: 0, py: 0, clientX: 0, clientY: 0,
    seen: false, inside: false, presence: 0, target: null,
    lock: { x: 0, y: 0, w: 0, h: 0, alpha: 0 },
    pulses: []
  };
  let raf = 0;
  let last = 0;
  let alive = true;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    size.dpr = currentDpr();
    size.w = rect.width;
    size.h = rect.height;
    canvas.width = Math.max(1, Math.round(rect.width * size.dpr));
    canvas.height = Math.max(1, Math.round(rect.height * size.dpr));
  }

  function crisp(value) {
    let offset = 0;
    if (Math.round(settings.thickness * size.dpr) % 2 === 1) {
      offset = 0.5;
    }
    return (Math.round(value * size.dpr) + offset) / size.dpr;
  }

  function pick(element) {
    if (!(element instanceof Element)) {
      return null;
    }
    const found = element.closest(settings.targetSelector);
    if (found === null || !container.contains(found)) {
      return null;
    }
    return found;
  }

  function boxOf(target, rect) {
    const box = target.getBoundingClientRect();
    return { x: box.left - rect.left - 6, y: box.top - rect.top - 6, w: box.width + 12, h: box.height + 12 };
  }

  function drawLines() {
    const x = crisp(state.x);
    const y = crisp(state.y);
    let gapX = settings.gap;
    let gapY = settings.gap;
    if (state.target !== null) {
      gapX = Math.max(gapX, state.lock.w / 2);
      gapY = Math.max(gapY, state.lock.h / 2);
    }
    ctx.globalAlpha = state.presence * settings.opacity * (1 - 0.4 * state.lock.alpha);
    ctx.strokeStyle = settings.color;
    ctx.lineWidth = settings.thickness;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(Math.max(0, x - gapX), y);
    ctx.moveTo(Math.min(size.w, x + gapX), y);
    ctx.lineTo(size.w, y);
    ctx.moveTo(x, 0);
    ctx.lineTo(x, Math.max(0, y - gapY));
    ctx.moveTo(x, Math.min(size.h, y + gapY));
    ctx.lineTo(x, size.h);
    ctx.stroke();
  }

  function drawBrackets() {
    const lock = state.lock;
    const arm = Math.min(12, lock.w / 3, lock.h / 3);
    ctx.globalAlpha = lock.alpha;
    ctx.strokeStyle = settings.lockColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const corner of CORNERS) {
      const x = lock.x + lock.w * corner[0];
      const y = lock.y + lock.h * corner[1];
      ctx.moveTo(x, y + arm * corner[3]);
      ctx.lineTo(x, y);
      ctx.lineTo(x + arm * corner[2], y);
    }
    ctx.stroke();
  }

  function drawTag(text, left, top, width, fill, ink, alpha) {
    const x = clamp(left, 2, size.w - width - 2);
    const y = clamp(top, 2, size.h - TAG_HEIGHT - 2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, width, TAG_HEIGHT);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + width / 2, y + TAG_HEIGHT / 2 + 0.5);
  }

  function drawReadout() {
    const text = settings.readout(state.x / size.w, state.y / size.h, state.target);
    if (typeof text !== 'string' || text === '') {
      return;
    }
    ctx.font = FONT;
    if (state.target !== null) {
      ctx.font = labelFont;
    }
    const width = Math.ceil(ctx.measureText(text).width) + 12;
    const lock = state.lock;
    if (state.target !== null) {
      let below = lock.y + lock.h + 6;
      if (below + TAG_HEIGHT > size.h - 2) {
        below = lock.y - TAG_HEIGHT - 6;
      }
      drawTag(text, lock.x + lock.w / 2 - width / 2, below, width, settings.lockColor, settings.color, state.presence * lock.alpha);
      return;
    }
    let left = state.x + 14;
    if (left + width > size.w - 2) {
      left = state.x - 14 - width;
    }
    let top = state.y + 14;
    if (top + TAG_HEIGHT > size.h - 2) {
      top = state.y - 14 - TAG_HEIGHT;
    }
    drawTag(text, left, top, width, settings.color, '#ffffff', state.presence);
  }

  function drawPulses() {
    for (const pulse of state.pulses) {
      const t = pulse.age / PULSE_SECONDS;
      ctx.globalAlpha = Math.pow(1 - t, 2);
      ctx.strokeStyle = pulse.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, 3 + 30 * (1 - Math.pow(1 - t, 3)), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function draw() {
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    if (state.presence > 0) {
      drawLines();
    }
    if (state.lock.alpha > 0) {
      drawBrackets();
    }
    if (state.presence > 0 && settings.readout !== null && size.w > 0 && size.h > 0) {
      drawReadout();
    }
    drawPulses();
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    raf = 0;
    if (!alive) {
      return;
    }
    const dt = clamp((now - last) / 1000, 0.001, 0.05);
    last = now;
    if (currentDpr() !== size.dpr) {
      resize();
    }
    const rect = canvas.getBoundingClientRect();
    state.px = state.clientX - rect.left;
    state.py = state.clientY - rect.top;
    const hovering = state.inside && state.target !== null;
    let goal = { x: state.px - 10, y: state.py - 10, w: 20, h: 20 };
    if (hovering) {
      goal = boxOf(state.target, rect);
    }
    let aimX = state.px;
    let aimY = state.py;
    if (hovering) {
      aimX = goal.x + goal.w / 2;
      aimY = goal.y + goal.h / 2;
    }
    let follow = 1;
    if (!reduce && settings.smoothing > 0) {
      follow = ease(dt, 0.008 + settings.smoothing * 0.16);
    }
    let snap = 1;
    if (!reduce) {
      snap = ease(dt, 0.085);
    }
    const wanted = Number(state.inside);
    const shown = Number(hovering);
    const lock = state.lock;
    state.x = approach(state.x, aimX, follow);
    state.y = approach(state.y, aimY, follow);
    state.presence = approach(state.presence, wanted, snap);
    lock.alpha = approach(lock.alpha, shown, snap);
    lock.x = approach(lock.x, goal.x, snap);
    lock.y = approach(lock.y, goal.y, snap);
    lock.w = approach(lock.w, goal.w, snap);
    lock.h = approach(lock.h, goal.h, snap);
    const running = [];
    for (const pulse of state.pulses) {
      pulse.age += dt;
      if (pulse.age < PULSE_SECONDS) {
        running.push(pulse);
      }
    }
    state.pulses = running;
    draw();

    let settling = state.x !== aimX || state.y !== aimY || state.presence !== wanted || lock.alpha !== shown;
    if (hovering && (lock.x !== goal.x || lock.y !== goal.y || lock.w !== goal.w || lock.h !== goal.h)) {
      settling = true;
    }
    if (settling || state.pulses.length > 0) {
      raf = requestAnimationFrame(tick);
    }
  }

  function wake() {
    if (raf !== 0 || !alive) {
      return;
    }
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function setInside(inside) {
    state.inside = inside;
    if (!inside) {
      state.target = null;
    }
  }

  function handleResize() {
    resize();
    wake();
  }

  function handlePointerMove(event) {
    if (event.pointerType === 'touch') {
      return;
    }
    state.clientX = event.clientX;
    state.clientY = event.clientY;
    if (!state.seen) {
      const rect = canvas.getBoundingClientRect();
      state.seen = true;
      state.x = event.clientX - rect.left;
      state.y = event.clientY - rect.top;
      state.lock = { x: state.x - 10, y: state.y - 10, w: 20, h: 20, alpha: 0 };
    }
    setInside(true);
    state.target = pick(event.target);
    wake();
  }

  function handlePointerDown(event) {
    handlePointerMove(event);
    if (!settings.clickPulse || reduce || event.pointerType === 'touch') {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    let color = settings.color;
    if (state.target !== null) {
      color = settings.lockColor;
    }
    state.pulses.push({ x: event.clientX - rect.left, y: event.clientY - rect.top, age: 0, color: color });
    wake();
  }

  function handlePointerLeave() {
    setInside(false);
    wake();
  }

  function handleScroll() {
    if (state.inside) {
      state.target = pick(document.elementFromPoint(state.clientX, state.clientY));
      wake();
    }
  }

  function restore(saved) {
    if (saved === null || performance.now() - saved.time > RESUME_MS || !saved.state.inside) {
      return;
    }
    const under = document.elementFromPoint(saved.state.clientX, saved.state.clientY);
    if (under !== null && container.contains(under)) {
      Object.assign(state, saved.state);
      setInside(true);
      state.target = pick(under);
    }
  }

  function destroy() {
    alive = false;
    cancelAnimationFrame(raf);
    observer.disconnect();
    container.removeEventListener('pointermove', handlePointerMove);
    container.removeEventListener('pointerdown', handlePointerDown);
    container.removeEventListener('pointerleave', handlePointerLeave);
    window.removeEventListener('scroll', handleScroll, { capture: true });
    window.removeEventListener('blur', handlePointerLeave);
    container.classList.remove(settings.className + '-on');
    canvas.remove();
    return { time: performance.now(), state: state };
  }

  const observer = new ResizeObserver(handleResize);
  observer.observe(canvas);
  container.addEventListener('pointermove', handlePointerMove);
  container.addEventListener('pointerdown', handlePointerDown);
  container.addEventListener('pointerleave', handlePointerLeave);
  window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
  window.addEventListener('blur', handlePointerLeave);
  resize();
  restore(settings.resume);
  wake();
  return { destroy: destroy };
}
