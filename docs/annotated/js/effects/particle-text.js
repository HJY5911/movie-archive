/*
 * particle-text.js: 글자를 작은 점(입자) 수백~수천 개로 바꿔 canvas에 그리는 효과 모듈임.
 * React Bits의 ParticleText(TextAnimations/ParticleText)를 React 없이 순수 JavaScript로 옮긴 것임.
 * 원본 저작권: Copyright (c) 2026 David Haz. 라이선스는 MIT + Commons Clause임.
 * 라이선스 조건에 따라 저작권 고지와 허가 고지 원문을 THIRD_PARTY_NOTICES.md에 포함함.
 * 원본의 핵심 계산(격자 샘플링, easeOutCubic으로 모이기, 부드럽게 따라가는 마우스 밀어내기,
 * 움직이는 입자 강조색)은 그대로 두고, 이 사이트에서 쓰지 않는 기능은 뺐음.
 * 뺀 기능: rain·spiral·scan 등장 효과, 선·사각형·원 입자 모양, 마우스 올림·클릭으로 시작, 색 테마 감시,
 * 왼쪽 정렬, 가만히 있을 때 흔들림(idleDrift), 등장 효과 다시 재생(replay) 등임.
 *
 * 동작 순서
 * 1. 화면에 보이지 않는 canvas(sampler)에 글자를 그림.
 * 2. 일정한 간격(step)의 격자 점마다 그 자리에 글자가 칠해졌는지 검사하여 입자의 목표 위치를 정함.
 *    간격은 실제 화면 픽셀의 정수 칸에 맞춰 반올림하여, 어느 화면에서도 점 사이 틈이 고르게 보이게 함.
 * 3. 매 프레임 입자를 목표 위치 쪽으로 조금씩 옮기고, 보이는 canvas에 점으로 그림.
 * 4. 마우스가 가까이 오면 입자를 밀어내고, 마우스가 떠나면 다시 제자리로 돌아오게 함.
 * 5. 움직일 입자가 없으면 requestAnimationFrame 반복을 멈춰 CPU를 쓰지 않게 함.
 *
 * 사용법: const effect = createParticleText(container, options);
 *   container: canvas를 넣을 요소임. canvas는 이 요소의 왼쪽 위에 절대 위치로 놓여 요소를 덮음.
 *   effect.destroy(): 애니메이션을 멈추고 이벤트 연결을 모두 끊은 뒤 canvas를 지움.
 * 화면 읽기 프로그램용 진짜 글자는 이 모듈이 만들지 않음. 부르는 쪽이 DOM에 글자를 남겨 두어야 함.
 * 이 파일은 page JS와 같은 규칙(화살표 함수·map·삼항 연산자 없이 for...of와 if/else)으로 작성됨.
 */

// TONES: 입자 색을 기본색에서 강조색까지 6단계로 나눔. 같은 단계끼리 모아 한 번에 그려야 빠름.
const TONES = 6;
// FADES: 등장 효과 중 투명도를 6단계로 나눔. 단계마다 한 번씩만 globalAlpha를 바꾸면 됨.
const FADES = 6;
// SAMPLE_SCALE: 검사용 canvas에 글자를 2배 해상도로 그림. 26px처럼 작은 글자도 모양을 정확히 읽게 됨.
const SAMPLE_SCALE = 2;
// MAX_PARTICLES: 입자가 이보다 많으면 간격을 넓혀 다시 뽑음. 큰 화면에서 느려지지 않게 함.
const MAX_PARTICLES = 6000;

/*
 * options에서 빠진 항목은 아래 기본값을 씀. 각 항목의 뜻은 다음과 같음.
 * segments: 한 줄에 이어 그릴 글자 조각 목록임. 조각마다 색을 따로 정함. 예: FILM은 흰색, LOG는 주황임.
 * fontFamily, fontWeight: 글꼴 이름과 굵기임.
 * fontSize: 글자 크기(px)임. 숫자 대신 함수를 주면 container 너비를 인수로 불러 크기를 계산함.
 * letterSpacing: 글자 사이 간격(px)임. CSS letter-spacing과 같은 뜻임.
 * 글자는 항상 container의 가로·세로 가운데에 놓임.
 * step: 입자 사이 간격(px)임. 값이 작을수록 입자가 촘촘하게 배치됨.
 *   숫자 대신 함수를 주면 글자 크기(px)를 인수로 불러 간격을 계산함. 화면 크기가 바뀌어 다시 뽑을 때도 다시 부름.
 *   실제 간격은 화면 픽셀 정수 칸(최소 2칸)으로 반올림됨. 예: 배율 1 화면에서 1.5px는 2px가 됨.
 * particleSize: 입자 한 개의 크기(px)임. step처럼 함수로 줄 수 있음.
 *   화면 픽셀 칸에 맞춘 정사각형으로 그리며, 간격보다 최소 1픽셀 작게 하여 점 사이 틈을 남김.
 * highlightColor: 제자리에서 멀어진 입자를 이 색으로 물들이고 빛 번짐(shadowBlur)을 더함.
 * intro: 'gather'면 처음 그릴 때 흩어진 입자가 모여 글자가 됨. 'none'이면 완성된 글자를 바로 그림.
 * scatter: 등장 효과에서 입자가 흩어져 출발하는 거리(px)임.
 * gatherDuration: 입자 하나가 제자리까지 오는 시간(ms)임.
 * stagger: 입자마다 출발을 최대 이 시간(ms)만큼 늦춰 차례로 모이게 함.
 * pointerRepel: 마우스가 입자를 밀어내는 최대 거리(px)임. 0이면 밀어내지 않음.
 * repelRadius: 마우스에서 이 거리(px) 안에 있는 입자만 밀려남. 가까울수록 더 세게 밀림.
 * clickBurst: true면 클릭(또는 탭)한 자리의 입자가 튀어 나갔다가 다시 돌아오게 함.
 * onReady: canvas에 처음 그린 직후 한 번 부르는 함수임. 진짜 글자를 숨기는 시점을 알릴 때 씀.
 */
const DEFAULTS = {
  segments: [{ text: 'FILM', color: '#FFFFFF' }, { text: 'LOG', color: '#FF5A00' }],
  fontFamily: 'Anton', fontWeight: 400, fontSize: 64, letterSpacing: 0,
  step: 3, particleSize: 2, highlightColor: '#FF5A00',
  intro: 'gather', scatter: 120, gatherDuration: 1400, stagger: 400,
  pointerRepel: 30, repelRadius: 90, clickBurst: true,
  onReady: null
};

// clamp: value가 min보다 작으면 min, max보다 크면 max로 맞춘 값을 돌려줌.
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// easeOutCubic: 진행률 t(0~1)를 처음엔 빠르고 끝에서 천천히 멈추는 곡선 값으로 바꿈. 원본과 같은 식임.
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// doNothing: canvas를 쓸 수 없을 때 destroy 자리에 넣는 빈 함수임.
function doNothing() {
}

// readOptions: DEFAULTS의 항목마다 options에 값이 있으면 그 값을, 없으면 기본값을 골라 새 객체에 담음.
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

/*
 * loadFont: '400 26px Anton' 같은 글꼴이 다 내려받아질 때까지 기다림.
 * 글꼴이 오기 전에 그리면 기본 글꼴 모양으로 입자가 만들어지므로 먼저 기다려야 함.
 * text를 함께 넘겨 그 글자가 들어 있는 글꼴 파일 조각을 정확히 불러오게 함.
 * 실패해도 효과 전체가 멈추지 않도록 경고만 남기고 대체 글꼴로 계속 진행함.
 */
async function loadFont(font, text) {
  try {
    await document.fonts.load(font, text);
  } catch (error) {
    console.warn(error);
  }
}

// resolve: value가 함수면 input을 넣어 부른 결과를, 함수가 아니면 value를 그대로 돌려줌.
// fontSize·step·particleSize를 숫자로도, 크기에 따라 계산하는 함수로도 받을 수 있게 함.
function resolve(value, input) {
  if (typeof value === 'function') {
    return value(input);
  }
  return value;
}

// firstGridLine: anchor에서 step 간격으로 늘어선 격자선 중 edge 이상인 첫 위치를 구함.
// 격자를 글자 시작점과 기준선(baseline)에 맞춰 두어 글자 아래 끝 줄이 가지런하게 됨.
function firstGridLine(anchor, edge, step) {
  return anchor - Math.floor((anchor - edge) / step) * step;
}

/*
 * pushAway: (x, y)에서 radius 안에 있는 입자의 목표 위치(baseX, baseY)를 바깥쪽으로 밀어냄.
 * 미는 힘은 (1 - 거리 / radius)의 제곱이라 중심에 가까울수록 세고 경계에서는 0이 됨.
 * 마우스 밀어내기와 클릭 폭발이 모두 이 함수를 같이 씀.
 */
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

/*
 * createParticleText(container, options)
 * container 안에 canvas를 만들고 입자 글자 효과를 시작함. 반환값은 { destroy } 객체임.
 * 아래의 안쪽 함수들은 모두 이 함수의 변수(particles, pointer 등)를 함께 씀.
 */
export function createParticleText(container, options) {
  const settings = readOptions(options);
  // canvas는 화면에 보이는 그림판이고, sampler는 글자 모양을 검사할 때만 쓰는 보이지 않는 그림판임.
  // willReadFrequently: true는 getImageData로 픽셀을 자주 읽는다고 브라우저에 알려 읽기를 빠르게 함.
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const sampler = document.createElement('canvas');
  const sctx = sampler.getContext('2d', { willReadFrequently: true });
  // canvas나 글꼴 기능을 쓸 수 없는 브라우저면 아무것도 하지 않음. 부르는 쪽의 진짜 글자가 그대로 보임.
  if (!ctx || !sctx || !document.fonts) {
    return { destroy: doNothing };
  }

  // 사용자가 운영체제에서 동작 줄이기를 켰는지 알려 주는 미디어 쿼리임. 켜져 있으면 움직임 없이 완성된 글자만 그림.
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  // pointer: 실제 마우스 위치(x, y)와 그 위치를 천천히 따라가는 위치(smoothX, smoothY)임.
  // 입자는 smooth 위치를 기준으로 밀려나서 마우스를 빨리 움직여도 부드럽게 반응하게 됨.
  const pointer = { active: false, x: 0, y: 0, smoothX: 0, smoothY: 0 };
  // burst: 클릭 폭발의 중심과 세기임. 세기는 매 프레임 줄어들어 입자가 제자리로 돌아오게 됨.
  const burst = { x: 0, y: 0, power: 0 };
  // allText: 조각들을 이어 붙인 전체 글자임. 예: 'FILM' + 'LOG' = 'FILMLOG'임.
  let allText = '';
  for (const segment of settings.segments) {
    allText += segment.text;
  }
  // 아래는 효과가 동작하는 동안 바뀌는 상태 값들임.
  // introPending: 다음에 입자를 만들 때 등장 효과를 재생할지 여부임. intro가 'gather'일 때만 처음에 true임.
  // buckets: 같은 색·같은 투명도로 그릴 입자끼리 모아 두는 배열들임.
  // raf: 예약된 requestAnimationFrame 번호임. 0이면 반복이 멈춰 있다는 뜻임.
  // buildId: 글자를 다시 뽑을 때마다 1씩 늘림. 글꼴을 기다리는 사이 더 새로운 요청이 오면 옛 요청은 버림.
  // onScreen: container가 화면 안에 보이는지 여부임. 안 보이면 그리기를 멈춤.
  // dotSize: 이번에 정해진 입자 크기(px)임. pitch: 실제 화면 픽셀 칸 수로 센 입자 간격(정수)임.
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

  // canvas는 그림일 뿐이므로 화면 읽기 프로그램이 건너뛰게 함.
  // touch-action: pan-y pinch-zoom은 세로 스크롤과 두 손가락 확대는 브라우저에 맡기고, 가로로 문지를 때만 입자가 반응하게 함.
  // pinch-zoom을 빼면 로고 위에서 시작한 확대 동작이 막혀, 화면을 키워 보는 사용자가 첫 화면을 확대하기 어려워짐.
  // container가 position: static이면 canvas가 엉뚱한 곳을 기준으로 놓이므로 relative로 바꿈.
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position: absolute; left: 0; top: 0; display: block; touch-action: pan-y pinch-zoom;';
  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }
  container.append(canvas);

  // applyFont: 검사용 그림판에 글꼴과 글자 간격을 지정함. letterSpacing을 모르는 옛 브라우저는 간격 없이 그림.
  function applyFont(font) {
    sctx.font = font;
    if ('letterSpacing' in sctx) {
      sctx.letterSpacing = settings.letterSpacing + 'px';
    }
  }

  // snapStep: 입자 간격을 실제 화면 픽셀의 정수 칸(pitch)에 맞춤. 최소 2칸이라 점 사이에 1칸 이상 틈이 남음.
  // 예: 배율 1에서 1.5px는 2칸(2px)이 되고, 배율 2에서 1.5px는 3칸(1.5px)이라 그대로임.
  // 간격이 1.5칸처럼 소수면 점 사이 틈이 0칸·1칸으로 번갈아 생겨 글자가 덩어리져 보임.
  function snapStep(step) {
    pitch = Math.max(2, Math.round(step * dpr));
    return pitch / dpr;
  }

  // offPixelEdge: 격자 시작 위치를 화면 픽셀 경계에서 1/4칸 떨어진 곳으로 옮김.
  // 반올림 경계(0.5칸)에 딱 걸친 점은 아주 작은 오차에도 한 칸씩 어긋나 두 점이 붙어 보이므로 경계에서 멀리 둠.
  function offPixelEdge(value) {
    return (Math.floor(value * dpr) + 0.25) / dpr;
  }

  /*
   * collectTargets: 검사용 그림의 픽셀을 step 간격 격자로 훑어 입자 목표 위치 목록을 만듦.
   * layers[i]는 i번째 조각만 그린 그림의 픽셀 배열이라, 찾은 점이 어느 조각(색)인지 알 수 있음.
   * 픽셀 배열은 [빨강, 초록, 파랑, 투명도]가 4칸씩 이어진 구조라 (행 + 열) * 4 + 3이 투명도 칸임.
   * 투명도가 110(최대 255)보다 크면 글자 안쪽으로 봄. 가장자리의 흐린 픽셀은 빼서 점 글자가 또렷해짐.
   */
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

  /*
   * sampleText: container 크기에 맞춰 글자를 다시 그려 보고 입자를 새로 만듦.
   * 처음 시작할 때, 크기가 바뀔 때(ResizeObserver), 화면 배율이나 동작 줄이기 설정이 바뀔 때 불림.
   * async 함수라 글꼴을 기다리는 동안(await) 다른 코드가 먼저 실행될 수 있음.
   */
  async function sampleText() {
    buildId += 1;
    const myBuild = buildId;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const size = resolve(settings.fontSize, rect.width);
    // CSS font 속성과 같은 형식의 문자열을 만듦. 예: '400 26px Anton'임.
    const font = settings.fontWeight + ' ' + size + 'px ' + settings.fontFamily;
    await loadFont(font, allText);
    // 기다리는 사이 sampleText가 또 불렸거나 destroy되었으면 이번 작업은 버림.
    if (myBuild !== buildId || !alive) {
      return;
    }

    // 조각마다 너비를 재고 모두 더해 전체 글자 너비(total)를 구함.
    applyFont(font);
    const widths = [];
    let total = 0;
    for (const segment of settings.segments) {
      widths.push(sctx.measureText(segment.text).width);
      total += widths[widths.length - 1];
    }
    // fontBoundingBox는 글꼴이 정한 줄 높이 안의 위·아래 여백이고, actualBoundingBox는 실제 잉크가 칠해진 범위임.
    // 기준선(baseline)을 container 세로 가운데에 CSS 한 줄 글자와 같은 위치로 놓음.
    // 그래서 container를 진짜 글자 줄과 같은 중심에 두면 canvas 글자와 진짜 글자가 정확히 겹침.
    const metrics = sctx.measureText(allText);
    const ascent = metrics.fontBoundingBoxAscent || size * 0.8;
    const descent = metrics.fontBoundingBoxDescent || size * 0.2;
    const box = { originX: (rect.width - total) / 2, baseline: rect.height / 2 + (ascent - descent) / 2 };
    // box: 글자가 차지하는 범위에 4px 여유를 더한 사각형임. 검사용 그림판은 이 범위만큼만 만듦.
    box.left = Math.floor(box.originX - 4);
    box.right = Math.ceil(box.originX + total + 4);
    box.top = Math.floor(box.baseline - (metrics.actualBoundingBoxAscent || size) - 4);
    box.bottom = Math.ceil(box.baseline + (metrics.actualBoundingBoxDescent || size * 0.3) + 4);
    sampler.width = (box.right - box.left) * SAMPLE_SCALE;
    sampler.height = (box.bottom - box.top) * SAMPLE_SCALE;
    applyFont(font);
    // 그림판 크기를 바꾸면 글꼴 설정이 초기화되므로 applyFont를 다시 부름.
    // setTransform으로 2배 확대와 box 위치 이동을 걸어 두면 container 기준 좌표 그대로 그릴 수 있음.
    sctx.setTransform(SAMPLE_SCALE, 0, 0, SAMPLE_SCALE, -box.left * SAMPLE_SCALE, -box.top * SAMPLE_SCALE);
    sctx.fillStyle = '#ffffff';

    // 조각 하나씩 지우고 그린 뒤 픽셀을 읽어 layers에 모음. textX는 다음 조각이 시작할 x 위치임.
    const layers = [];
    let textX = box.originX;
    for (let i = 0; i < settings.segments.length; i++) {
      sctx.clearRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
      sctx.fillText(settings.segments[i].text, textX, box.baseline);
      textX += widths[i];
      layers.push(sctx.getImageData(0, 0, sampler.width, sampler.height).data);
    }
    // 화면 배율(dpr)을 먼저 읽어 간격을 화면 픽셀에 맞춤. step이 함수면 글자 크기로 간격을 계산함.
    // 입자가 MAX_PARTICLES보다 많으면 간격을 화면 픽셀 1칸씩 넓혀 다시 뽑음.
    // 입자 크기(dotSize)도 step처럼 글자 크기에 맞춰 다시 정함.
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    let step = snapStep(resolve(settings.step, size));
    let targets = collectTargets(layers, box, step);
    while (targets.length > MAX_PARTICLES) {
      step = snapStep(step + 1 / dpr);
      targets = collectTargets(layers, box, step);
    }
    dotSize = resolve(settings.particleSize, size);

    /*
     * 목표 위치마다 입자 객체를 만듦.
     * x, y: 지금 그려지는 위치임. targetX, targetY: 글자 안의 제자리임.
     * startX, startY: 등장 효과의 출발 위치임. baseX, baseY: 이번 프레임에 가려는 위치임.
     * seed, depth: 입자마다 조금씩 다른 움직임을 주는 0~1 근처의 값임.
     * Math.random 대신 번호로 계산한 값이라 새로 그려도 같은 모양으로 흩어짐.
     */
    particles = [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const seed = ((i * 9301 + 49297) % 233280) / 233280;
      const depth = 0.45 + (((i * 233 + 97) % 1000) / 1000) * 0.9;
      particles.push({ x: t.x, y: t.y, targetX: t.x, targetY: t.y, startX: t.x, startY: t.y, baseX: t.x, baseY: t.y, segment: t.segment, seed: seed, depth: depth, delay: 0 });
    }
    // 조각 수 × 투명도 단계 × 색 단계만큼 빈 묶음을 만듦.
    buckets = [];
    for (let i = 0; i < settings.segments.length * FADES * TONES; i++) {
      buckets.push([]);
    }

    /*
     * devicePixelRatio는 CSS 1px에 실제 화면 점이 몇 개 들어가는지임. 레티나 화면은 2임.
     * 위에서 읽은 배율(dpr)만큼 canvas를 크게 만들어야 점이 흐리지 않게 됨. 3배 화면도 2배까지만 써서 부담을 줄임.
     * canvas의 CSS 크기를 실제 픽셀 수 / 배율로 맞춰 브라우저가 그림을 늘이거나 줄이지 않게 함.
     */
    fontPx = size;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = canvas.width / dpr + 'px';
    canvas.style.height = canvas.height / dpr + 'px';
    burst.power = 0;
    gathering = false;
    // 등장 효과는 처음 한 번만 재생함. 크기가 바뀌어 다시 뽑을 때는 완성된 글자를 바로 그림.
    if (introPending && !reducedMotion) {
      startGather();
    }
    introPending = false;
    update(performance.now());
    // 첫 그림을 그린 직후 onReady를 한 번만 부름. 부른 뒤 null로 바꿔 다시 부르지 않게 함.
    if (typeof settings.onReady === 'function') {
      settings.onReady();
      settings.onReady = null;
    }
    wake();
  }

  /*
   * startGather: 입자를 글자 주변 여기저기로 흩어 놓고 모이는 애니메이션을 시작함.
   * 출발 방향(angle)과 거리는 seed, depth로 정하고, 출발 시각은 seed * stagger만큼 늦춤.
   */
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

  /*
   * update(now): 한 프레임 동안 입자 위치를 계산하고 draw()로 그림.
   * 반환값은 다음 프레임도 필요한지 여부임. false면 반복을 멈춤.
   */
  // dt: 지난 프레임과의 시간 차(초)임. 탭 전환 등으로 크게 벌어져도 0.05초까지만 인정함.
  // frames: 60fps 기준 몇 프레임이 지났는지임. 화면 주사율이 달라도 같은 속도로 움직이게 함.
  function update(now) {
    let dt = 1 / 60;
    if (last) {
      dt = clamp((now - last) / 1000, 0, 0.05);
    }
    last = now;
    const frames = Math.max(dt * 60, 0.001);
    // follow: 입자가 한 프레임에 목표까지 남은 거리의 몇 %를 따라갈지임. 60fps면 22%씩 다가감.
    // 동작 줄이기가 켜져 있으면 1이라 곧바로 제자리에 놓임.
    let follow = 1 - Math.pow(0.78, frames);
    if (reducedMotion) {
      follow = 1;
    }
    // chase: smooth 마우스 위치가 실제 마우스를 따라가는 비율임. 클릭 폭발 세기도 같은 방식으로 줄어듦.
    const chase = 1 - Math.pow(0.82, frames);
    pointer.smoothX += (pointer.x - pointer.smoothX) * chase;
    pointer.smoothY += (pointer.y - pointer.smoothY) * chase;
    burst.power *= Math.pow(0.86, frames);
    const repel = pointer.active && !reducedMotion && settings.pointerRepel > 0;
    // heat 계산용 값임. 제자리에서 heatStart보다 멀어지면 강조색이 섞이기 시작하고,
    // heatStart + heatRange만큼 멀어지면 강조색이 가장 진하게 됨. 글자 크기에 비례하게 함.
    const heatStart = fontPx * 0.03;
    const heatRange = Math.max(4, fontPx * 0.3);
    let moving = false;
    let complete = true;
    for (const bucket of buckets) {
      bucket.length = 0;
    }

    // 입자마다 이번 프레임에 가려는 위치(baseX, baseY)를 정함. 기본은 제자리임.
    for (const p of particles) {
      let progress = 1;
      p.baseX = p.targetX;
      p.baseY = p.targetY;
      // 등장 중이면 출발 위치에서 제자리까지 easeOutCubic 곡선을 따라 이동시킴.
      // progress가 0보다 작으면 아직 출발 전이고, 1이면 도착한 것임.
      if (gathering) {
        progress = clamp((now - gatherStart - p.delay) / settings.gatherDuration, 0, 1);
        p.baseX = p.startX + (p.targetX - p.startX) * easeOutCubic(progress);
        p.baseY = p.startY + (p.targetY - p.startY) * easeOutCubic(progress);
        if (progress < 1) {
          complete = false;
        }
      }
      // 클릭 폭발과 마우스 밀어내기를 목표 위치에 더함.
      if (burst.power > 0.1) {
        pushAway(p, burst.x, burst.y, fontPx * 1.3, burst.power * (0.65 + p.depth * 0.45));
      }
      if (repel) {
        pushAway(p, pointer.smoothX, pointer.smoothY, settings.repelRadius, settings.pointerRepel);
      }

      // 실제 위치는 목표 위치 쪽으로 follow 비율만큼만 다가감. 그래서 밀려났다가 부드럽게 돌아오게 됨.
      // 남은 거리가 0.05px 이하면 목표 위치에 딱 맞춰 놓음. 작은 오차가 남으면 점마다 반올림 결과가 달라져
      // 점이 두 개씩 붙어 보이므로, 다 모인 뒤에는 처음부터 제자리에 그린 것과 똑같은 모양이 되게 함.
      p.x += (p.baseX - p.x) * follow;
      p.y += (p.baseY - p.y) * follow;
      if (Math.abs(p.baseX - p.x) + Math.abs(p.baseY - p.y) > 0.05) {
        moving = true;
      } else {
        p.x = p.baseX;
        p.y = p.baseY;
      }
      // heat(0~1)로 색 단계(tone)를, 등장 진행률로 투명도 단계(fade)를 정하고 맞는 묶음에 넣음.
      let heat = 0;
      if (!reducedMotion) {
        heat = clamp((Math.hypot(p.x - p.targetX, p.y - p.targetY) - heatStart) / heatRange, 0, 1);
      }
      const tone = Math.round(heat * (TONES - 1));
      const fade = Math.round(progress * (FADES - 1));
      buckets[(p.segment * FADES + fade) * TONES + tone].push(p);
    }

    // 등장 효과는 모든 입자가 도착하면 끝남.
    if (complete) {
      gathering = false;
    }
    draw();
    // 움직이는 입자도, 따라잡을 마우스도 없으면 false를 돌려 반복을 멈추게 함.
    const pointerMoving = Math.abs(pointer.x - pointer.smoothX) + Math.abs(pointer.y - pointer.smoothY) > 0.1;
    return gathering || moving || burst.power > 0.1 || (repel && pointerMoving);
  }

  /*
   * drawGroup: 같은 묶음의 입자를 경로 하나에 모아 fill()을 한 번만 부름.
   * 입자는 실제 화면 픽셀 칸에 맞춰 반올림한 정사각형으로 그려 LED 전광판처럼 또렷하게 함.
   * 크기는 간격(pitch)보다 최소 1픽셀 작게 하여 점 사이 틈이 항상 남게 함. 좌표에 dpr을 곱해 실제 픽셀 단위로 그림.
   */
  function drawGroup(group) {
    const square = Math.max(1, Math.min(Math.round(dotSize * dpr), pitch - 1));
    ctx.beginPath();
    for (const p of group) {
      ctx.rect(Math.round(p.x * dpr - square / 2), Math.round(p.y * dpr - square / 2), square, square);
    }
    ctx.fill();
  }

  /*
   * draw: 그림판을 지우고 묶음마다 입자를 그림.
   * 묶음 번호 i에서 색 단계, 투명도 단계, 조각 번호를 거꾸로 계산함.
   * 먼저 조각 색으로 그리고, 제자리에서 벗어난 입자면 강조색을 heat만큼 겹쳐 칠함.
   * 강조색을 칠할 때는 shadowBlur로 빛 번짐을 더함.
   */
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

  // frame: requestAnimationFrame이 부르는 함수임. update가 true를 돌려주고 화면에 보일 때만 다음 프레임을 예약함.
  function frame(now) {
    raf = 0;
    if (alive && update(now) && onScreen && !document.hidden) {
      raf = requestAnimationFrame(frame);
    }
  }

  // wake: 반복이 멈춰 있으면 다시 시작함. 이미 돌고 있거나, 안 보이거나, 입자가 없으면 아무것도 하지 않음.
  function wake() {
    if (raf === 0 && alive && onScreen && !document.hidden && particles.length > 0) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  // sleep: 예약된 다음 프레임을 취소해 반복을 멈춤.
  function sleep() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  // locate: 마우스 좌표(화면 기준)를 canvas 왼쪽 위 기준 좌표로 바꿔 pointer에 저장함.
  function locate(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
  }

  // 마우스가 처음 들어온 순간에는 smooth 위치도 같은 곳에 두어 입자가 엉뚱한 방향으로 밀리지 않게 함.
  function handlePointerMove(event) {
    locate(event);
    if (!pointer.active) {
      pointer.smoothX = pointer.x;
      pointer.smoothY = pointer.y;
    }
    pointer.active = true;
    wake();
  }

  // 마우스가 나가면 밀어내기를 끔. 반복을 깨워 입자가 제자리로 돌아오게 함.
  function handlePointerLeave() {
    pointer.active = false;
    wake();
  }

  // 클릭(또는 탭)한 자리를 폭발 중심으로 정함. 세기는 글자 크기에 비례함.
  // pointerdown 대신 click을 쓰는 이유: 휴대폰에서 로고 위에 손가락을 대고 스크롤하면 pointerdown은 생기지만
  // click은 생기지 않음. 그래서 스크롤할 때마다 로고가 흩어지는 일이 없음.
  function handleClick(event) {
    if (settings.clickBurst && !reducedMotion) {
      locate(event);
      burst.x = pointer.x;
      burst.y = pointer.y;
      burst.power = fontPx * 0.9;
      wake();
    }
  }

  // 동작 줄이기 설정이 바뀌면 입자를 다시 만들어 정지 상태나 움직이는 상태로 바꿈.
  function handleMotionChange(event) {
    reducedMotion = event.matches;
    sampleText();
  }

  // 다른 탭으로 가거나 container가 화면 밖으로 나가면 반복을 멈추고, 다시 보이면 이어서 돌림.
  function handleVisibility() {
    if (onScreen && !document.hidden) {
      wake();
    } else {
      sleep();
    }
  }

  // 브라우저 확대·축소나 모니터 이동으로 devicePixelRatio가 바뀌면 canvas를 새 배율로 다시 만듦.
  function handleWindowResize() {
    if (Math.min(window.devicePixelRatio || 1, 2) !== dpr) {
      sampleText();
    }
  }

  // IntersectionObserver가 container가 화면에 들어왔는지 나갔는지 알려 줄 때 불림.
  function handleIntersect(entries) {
    for (const entry of entries) {
      onScreen = entry.isIntersecting;
    }
    handleVisibility();
  }

  // destroy: 반복을 멈추고, 감시자와 이벤트 연결을 모두 끊고, canvas를 지움.
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

  // ResizeObserver는 container 크기가 바뀔 때마다 sampleText를 부름. 감시를 시작하는 순간에도 한 번 불러 첫 그림이 됨.
  // IntersectionObserver는 container가 화면에 보이는지 감시함.
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

  // 밖에서 쓸 수 있는 destroy 함수만 객체로 묶어 돌려줌.
  return { destroy: destroy };
}
