/*
 * crosshair.js — 지정한 영역(container) 위에 마우스를 따라다니는 조준선을 canvas로 그리는 효과 모듈임.
 *
 * 원본: React Bits의 Crosshair 컴포넌트(https://reactbits.dev/animations/crosshair)임.
 * 원본은 React 컴포넌트이므로, 같은 동작을 React 없이 순수 JavaScript와 canvas로 옮김.
 * 옮긴 동작: 마우스를 부드럽게 따라오는 가로·세로 선, 대상 위에서 나타나는 잠금 상자(모서리 꺾쇠), 좌표 표시, 클릭 파동임.
 * 원본의 점선·글리치 효과·흐림(fade)·화면 전체 모드·커서 숨기기처럼 이 사이트에서 쓰지 않는 기능은 뺌.
 * 좌표 표시 함수(readout), 다시 그릴 때 이어 그리기(resume)는 이 사이트에 맞게 더함.
 * 마우스 커서는 숨기지 않음. 운영체제에서 커서를 크게 키운 사용자도 지도 위에서 커서를 그대로 볼 수 있음.
 * 키보드 사용자는 핀의 주황 초점 테두리(map.css)로 위치를 알 수 있으므로 조준선은 마우스에만 반응함.
 * 저작권: Copyright (c) 2026 David Haz, MIT + Commons Clause 라이선스임.
 * 라이선스 조건에 따라 저작권·허가 고지 전문을 THIRD_PARTY_NOTICES.md에 포함함.
 *
 * 사용하는 곳: js/pages/map.js가 세계 지도(.map-canvas) 위에 핀을 고르는 조준선으로 사용함.
 * createCrosshair(container, options)를 호출하면 container 안에 canvas를 하나 붙이고 { destroy } 객체를 반환함.
 * destroy()를 호출하면 canvas와 이벤트 연결을 모두 지우고, 다음 조준선이 이어 그릴 수 있도록 마지막 상태를 반환함.
 * container는 position이 static이 아니어야 함. canvas가 container 크기에 맞춰 position: absolute로 겹쳐지기 때문임.
 *
 * 접근성: canvas에는 aria-hidden="true"와 pointer-events: none을 지정해 보조 기술과 클릭에 영향을 주지 않음.
 * 국가 이름·영화 수 같은 실제 정보는 DOM의 버튼과 글자에 그대로 남아 있음. 조준선은 눈으로 보는 보조 표시임.
 * 사용자가 운영체제에서 동작 줄이기(prefers-reduced-motion)를 켰으면 따라오는 움직임과 클릭 파동 없이 바로 그림.
 * 움직일 것이 남아 있는 동안에만 requestAnimationFrame으로 다시 그리고, 모두 멈추면 반복을 멈춤.
 */

// 좌표 표시 글자의 글꼴임. 숫자 폭이 같은 고정폭(monospace) 글꼴을 써서 숫자가 바뀌어도 글자 상자가 흔들리지 않음.
const FONT = '500 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
// 좌표 표시 글자 상자의 높이(px)임.
const TAG_HEIGHT = 18;
// 클릭 파동(퍼지는 원)이 사라질 때까지 걸리는 시간(초)임. 원본과 같은 값임.
const PULSE_SECONDS = 0.55;
// destroy() 뒤 이 시간(ms) 안에 다시 만들면 이전 상태를 이어 그림. 오래된 상태는 버림.
const RESUME_MS = 1000;
// 잠금 상자의 네 모서리 정보임. [가로 위치(0=왼쪽, 1=오른쪽), 세로 위치(0=위, 1=아래), 가로 꺾쇠 방향, 세로 꺾쇠 방향] 순서임.
// 예: [1, 0, -1, 1]은 오른쪽 위 모서리이며, 꺾쇠가 왼쪽(-1)과 아래쪽(1)으로 뻗음.
const CORNERS = [[0, 0, 1, 1], [1, 0, -1, 1], [1, 1, -1, -1], [0, 1, 1, -1]];


// clamp(value, min, max): value를 min 이상 max 이하로 잘라서 반환함.
// 예: clamp(12, 0, 10) → 10, clamp(-3, 0, 10) → 0
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}


/*
 * ease(dt, seconds): 이번 프레임에서 목표까지 남은 거리 중 몇 %를 움직일지 0~1 사이 비율로 반환함.
 * dt는 지난 프레임부터 흐른 시간(초), seconds는 반응 속도임. seconds가 작을수록 빨리 따라감.
 * 1 - e^(-dt/seconds) 식을 쓰면 화면 갱신 속도(60Hz, 120Hz)가 달라도 같은 빠르기로 움직임.
 */
function ease(dt, seconds) {
  return 1 - Math.exp(-dt / seconds);
}


/*
 * approach(value, goal, amount): value를 goal 쪽으로 amount 비율만큼 옮긴 값을 반환함.
 * 남은 차이가 0.01보다 작으면 goal을 그대로 반환해 움직임이 끝났다는 것을 알 수 있게 함.
 * 예: approach(0, 100, 0.25) → 25, approach(99.995, 100, 0.5) → 100
 */
function approach(value, goal, amount) {
  const next = value + (goal - value) * amount;
  if (Math.abs(goal - next) < 0.01) {
    return goal;
  }
  return next;
}


// readOption(options, name, fallback): options에 name 항목이 있으면 그 값을, 없으면 기본값 fallback을 반환함.
function readOption(options, name, fallback) {
  // options 객체 자체를 생략한 경우와 항목 하나만 생략한 경우를 모두 기본값으로 처리함.
  if (options === undefined || options === null || options[name] === undefined) {
    return fallback;
  }
  return options[name];
}


// currentDpr(): 화면의 기기 픽셀 비율(devicePixelRatio)을 반환함. 레티나 화면은 2, 일반 화면은 1임.
// 3배 화면에서도 2까지만 사용해 canvas가 너무 커지지 않게 함.
function currentDpr() {
  return Math.min(window.devicePixelRatio || 1, 2);
}


// canvas를 쓸 수 없는 브라우저에서 반환할 빈 destroy 함수임. 호출해도 아무 일도 하지 않음.
function destroyNothing() {
  return null;
}


/*
 * createCrosshair(container, options): container 위에 조준선 canvas를 만들고 { destroy } 객체를 반환함.
 * options의 항목은 모두 생략할 수 있으며 내용은 다음과 같음.
 * - color: 선·좌표 표시 상자의 색임.
 * - lockColor: 잠금 상자·잠금 이름표의 색임.
 * - thickness: 선 두께(px)임. 0.5~8 사이로 제한함.
 * - opacity: 선의 불투명도(0~1)임.
 * - gap: 선의 교차점 둘레에 비워 둘 구멍의 크기(px)임.
 * - smoothing: 선이 마우스를 따라오는 부드러움(0~1)임. 0이면 지연 없이 바로 따라옴.
 * - targetSelector: 잠금 대상의 CSS 선택자임. 마우스가 올라가면 그 요소의 화면 위 상자 둘레에 잠금 상자를 그림.
 * - readout: 표시할 글자를 만드는 함수임. (가로 비율, 세로 비율, 잠금 대상 또는 null)을 받아 문자열을 반환함.
 *   빈 문자열을 반환하면 아무것도 표시하지 않음.
 * - clickPulse: true이면 클릭한 자리에 퍼지는 원을 그림.
 * - className: canvas에 붙일 클래스임. container에는 이 이름 뒤에 -on을 붙인 클래스를 붙였다 뗌.
 *   기본값도 기능 이름을 앞에 붙인 'map-crosshair'로 두어, 생략해도 다른 페이지의 클래스와 겹치지 않게 함.
 * - resume: 이전 destroy()가 반환한 값임. 1초 안에 다시 만들면 선·잠금 상자·클릭 파동을 이어서 그림.
 * 예: createCrosshair(stage, { color: '#0b0b0b', targetSelector: '.map-pin-head' })
 */
export function createCrosshair(container, options) {
  // 넘겨받은 options와 기본값을 합쳐 이 조준선이 쓸 설정 객체를 만듦. 기본값은 원본 React Bits와 같음.
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
  // 그림을 그릴 canvas 요소를 새로 만듦. 아직 화면에 붙이지 않은 상태임.
  const canvas = document.createElement('canvas');
  // getContext('2d')는 선·원·글자를 그리는 2D 그리기 도구를 반환함. 지원하지 않으면 null임.
  const ctx = canvas.getContext('2d');
  // canvas를 쓸 수 없으면 아무것도 붙이지 않고 끝냄. 지도와 핀은 조준선 없이 그대로 동작함.
  if (ctx === null) {
    return { destroy: destroyNothing };
  }
  // 페이지 CSS가 z-index 등을 정할 수 있도록 클래스를 붙임.
  canvas.className = settings.className;
  // 꾸밈용 그림이므로 화면 낭독기가 읽지 않게 함.
  canvas.setAttribute('aria-hidden', 'true');
  // container를 꽉 채우게 겹치고, pointer-events: none으로 클릭·마우스 이벤트가 canvas 아래 요소(핀)로 그대로 가게 함.
  // 어느 페이지에서 써도 같은 배치가 필요하므로 이 네 가지는 CSS 파일 대신 여기서 직접 지정함.
  canvas.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;';
  // container의 마지막 자식으로 붙임. 이 순간부터 화면에 canvas가 생김.
  // 지도에서는 map.css가 핀에 z-index를 주어 핀이 canvas보다 위에 그려짐. 선과 좌표 글자는 핀 아래로 지나감.
  container.append(canvas);
  // 조준선이 실제로 켜졌다는 표시 클래스임. 예: map-crosshair-on. CSS는 이 클래스가 있을 때만 핀 이름표 처리를 바꿈.
  container.classList.add(settings.className + '-on');

  // 잠금 이름표에 쓸 글꼴임. container의 글꼴(사이트 본문 글꼴 Pretendard)을 그대로 읽어 굵게 씀.
  // 핀 이름표는 '일본 · 2편'처럼 한글이라, 고정폭 글꼴을 쓰면 다른 글꼴로 바뀌고 '·' 둘레가 넓게 벌어짐.
  const labelFont = '600 12px ' + getComputedStyle(container).fontFamily;
  // 사용자가 동작 줄이기를 켰는지 확인함. true이면 아래에서 모든 움직임을 바로 목표 위치로 옮김.
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // canvas의 CSS 크기(w, h)와 기기 픽셀 비율(dpr)임. resize()가 채움.
  const size = { w: 0, h: 0, dpr: 1 };
  // 그리기에 필요한 현재 상태를 한 객체에 모아 둠.
  // x, y는 선이 교차하는 위치(부드럽게 따라옴), px, py는 실제 마우스 위치임. 둘 다 container 왼쪽 위 기준 px임.
  // clientX, clientY는 브라우저 창 기준 마우스 위치임. seen은 마우스를 한 번이라도 봤는지, inside는 지금 container 안에 있는지를 기록함.
  // presence는 선이 보이는 정도(0~1)임. target은 마우스 아래 잠금 대상임.
  // lock은 잠금 상자의 위치·크기·보이는 정도이고, pulses는 진행 중인 클릭 파동 목록임.
  const state = {
    x: 0, y: 0, px: 0, py: 0, clientX: 0, clientY: 0,
    seen: false, inside: false, presence: 0, target: null,
    lock: { x: 0, y: 0, w: 0, h: 0, alpha: 0 },
    pulses: []
  };
  // raf: 예약된 requestAnimationFrame 번호임. 0이면 예약된 그리기가 없다는 뜻임.
  let raf = 0;
  // last: 지난 프레임의 시각(ms)임. 프레임 사이 시간(dt)을 구할 때 씀.
  let last = 0;
  // alive: destroy() 뒤에는 false가 되어 남은 예약 그리기가 실행되지 않게 막음.
  let alive = true;


  // resize(): canvas의 실제 픽셀 수를 화면 크기 × 기기 픽셀 비율에 맞춤. 맞추지 않으면 레티나 화면에서 선이 흐려짐.
  function resize() {
    const rect = canvas.getBoundingClientRect();
    size.dpr = currentDpr();
    size.w = rect.width;
    size.h = rect.height;
    // width, height 속성에 값을 넣으면 그려 둔 그림이 지워지므로, 다음 프레임에 다시 그려야 함.
    canvas.width = Math.max(1, Math.round(rect.width * size.dpr));
    canvas.height = Math.max(1, Math.round(rect.height * size.dpr));
  }


  // crisp(value): 1px 선이 두 픽셀에 걸쳐 흐리게 그려지지 않도록 위치를 기기 픽셀 칸에 맞춰 반환함.
  // 선 두께가 홀수 픽셀이면 칸의 가운데(0.5)에 놓아야 한 칸만 칠해짐.
  function crisp(value) {
    let offset = 0;
    if (Math.round(settings.thickness * size.dpr) % 2 === 1) {
      offset = 0.5;
    }
    return (Math.round(value * size.dpr) + offset) / size.dpr;
  }


  // pick(element): element 자신이나 조상 중 targetSelector에 맞는 잠금 대상을 찾아 반환함. 없으면 null임.
  // 예: 지도에서 핀의 물방울 모양(::before) 위에 마우스가 있으면 element는 span.map-pin-head이고, closest()가 그 span 자신을 반환함.
  function pick(element) {
    // elementFromPoint가 null을 반환하는 경우 등 요소가 아니면 대상이 없는 것으로 처리함.
    if (!(element instanceof Element)) {
      return null;
    }
    // closest()는 자신부터 위쪽 조상 방향으로 선택자에 맞는 첫 요소를 찾음.
    const found = element.closest(settings.targetSelector);
    // container 밖의 버튼은 잠금 대상이 아님.
    if (found === null || !container.contains(found)) {
      return null;
    }
    return found;
  }


  // boxOf(target, rect): 잠금 대상 둘레에 그릴 상자를 container 기준 좌표로 반환함. 대상보다 사방 6px 크게 잡음.
  function boxOf(target, rect) {
    // 지도에서는 대상이 실제로 보이는 핀 머리(.map-pin-head)라서 그 크기를 그대로 잼.
    // getBoundingClientRect()는 CSS transform(회전·확대)까지 반영한 화면 위 상자를 반환함.
    const box = target.getBoundingClientRect();
    return { x: box.left - rect.left - 6, y: box.top - rect.top - 6, w: box.width + 12, h: box.height + 12 };
  }


  // drawLines(): container 끝에서 끝까지 가로선과 세로선을 그림. 교차점 둘레는 gap만큼 비움.
  function drawLines() {
    const x = crisp(state.x);
    const y = crisp(state.y);
    let gapX = settings.gap;
    let gapY = settings.gap;
    // 마우스로 대상을 잠그면 선이 잠금 상자 가장자리에서 멈추도록 구멍을 상자 크기만큼 넓힘.
    if (state.target !== null) {
      gapX = Math.max(gapX, state.lock.w / 2);
      gapY = Math.max(gapY, state.lock.h / 2);
    }
    // globalAlpha는 이후 그리는 모든 것의 불투명도임. 잠금 중에는 선을 조금 흐리게 해 잠금 상자가 눈에 띄게 함.
    ctx.globalAlpha = state.presence * settings.opacity * (1 - 0.4 * state.lock.alpha);
    ctx.strokeStyle = settings.color;
    ctx.lineWidth = settings.thickness;
    // beginPath()로 새 경로를 시작하고 moveTo(펜 들기)·lineTo(선 긋기)로 네 토막을 이은 뒤 stroke()로 한 번에 그림.
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


  // drawBrackets(): 잠금 상자의 네 모서리에 ㄱ자 꺾쇠를 그림. 꺾쇠 길이는 최대 12px이며 작은 상자에서는 짧아짐.
  function drawBrackets() {
    const lock = state.lock;
    const arm = Math.min(12, lock.w / 3, lock.h / 3);
    ctx.globalAlpha = lock.alpha;
    ctx.strokeStyle = settings.lockColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    // 모서리마다 세로 꺾쇠 끝 → 모서리 → 가로 꺾쇠 끝 순서로 선을 그음.
    for (const corner of CORNERS) {
      const x = lock.x + lock.w * corner[0];
      const y = lock.y + lock.h * corner[1];
      ctx.moveTo(x, y + arm * corner[3]);
      ctx.lineTo(x, y);
      ctx.lineTo(x + arm * corner[2], y);
    }
    ctx.stroke();
  }


  // drawTag(): 색 상자(fill) 위에 글자(ink)를 가운데 정렬해 그림. 상자가 container 밖으로 나가지 않게 위치를 자름.
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


  /*
   * drawReadout(): options.readout 함수가 만든 글자를 그림.
   * 잠금 중이면 잠금 상자 바로 아래에 주황 상자로, 아니면 교차점 오른쪽 아래에 검은 상자로 그림.
   * 오른쪽이나 아래 공간이 모자라면 반대쪽으로 옮겨 그림.
   */
  function drawReadout() {
    // 교차점 위치를 0~1 비율로 바꿔 넘김. 예: 가운데이면 (0.5, 0.5). 비율로 넘기면 지도 크기가 바뀌어도 계산이 같음.
    const text = settings.readout(state.x / size.w, state.y / size.h, state.target);
    if (typeof text !== 'string' || text === '') {
      return;
    }
    // 좌표는 고정폭 글꼴(FONT)로, 잠금 대상의 이름표는 사이트 본문 글꼴(labelFont)로 그림.
    ctx.font = FONT;
    if (state.target !== null) {
      ctx.font = labelFont;
    }
    // measureText()로 글자 폭을 재고 양옆 여백 6px씩을 더해 상자 폭을 정함.
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


  // drawPulses(): 클릭 파동마다 반지름이 3px에서 33px로 커지며 점점 투명해지는 원을 그림.
  function drawPulses() {
    for (const pulse of state.pulses) {
      // t는 0(방금 클릭)에서 1(끝) 사이의 진행률임. 처음에 빨리 커지고 끝에서 느려지도록 세제곱 곡선을 씀.
      const t = pulse.age / PULSE_SECONDS;
      ctx.globalAlpha = Math.pow(1 - t, 2);
      ctx.strokeStyle = pulse.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, 3 + 30 * (1 - Math.pow(1 - t, 3)), 0, Math.PI * 2);
      ctx.stroke();
    }
  }


  // draw(): canvas를 지우고 선 → 잠금 상자 → 글자 → 클릭 파동 순서로 다시 그림.
  function draw() {
    // 기기 픽셀 비율만큼 확대해 두면 아래 코드는 CSS px 단위 좌표로만 그리면 됨.
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


  /*
   * tick(now): requestAnimationFrame이 다음 화면 갱신 직전에 호출하는 한 프레임 처리 함수임.
   * 목표 위치를 정하고, 현재 값을 목표 쪽으로 조금 옮긴 뒤 그림. 아직 움직일 것이 남았으면 다음 프레임을 다시 예약함.
   * 모두 목표에 도착하면 예약하지 않으므로, 마우스가 멈춰 있는 동안에는 아무 계산도 하지 않음.
   */
  function tick(now) {
    raf = 0;
    if (!alive) {
      return;
    }
    // 지난 프레임부터 흐른 시간(초)임. 탭을 오래 비웠다 돌아와도 한 번에 크게 튀지 않도록 0.05초로 제한함.
    const dt = clamp((now - last) / 1000, 0.001, 0.05);
    last = now;
    // 창을 다른 해상도의 모니터로 옮기면 기기 픽셀 비율이 바뀌므로 canvas 크기를 다시 맞춤.
    if (currentDpr() !== size.dpr) {
      resize();
    }
    // 페이지를 스크롤하면 container의 화면 위치가 바뀌므로 매 프레임 다시 읽음.
    const rect = canvas.getBoundingClientRect();
    state.px = state.clientX - rect.left;
    state.py = state.clientY - rect.top;
    // hovering: 마우스가 container 안에 있고 그 아래에 잠금 대상이 있는지 여부임.
    // 잠금 대상이 없을 때 잠금 상자는 보이지 않은 채 마우스 둘레 20px 상자를 따라다님. 잠그면 그 자리에서 대상 크기로 커짐.
    const hovering = state.inside && state.target !== null;
    let goal = { x: state.px - 10, y: state.py - 10, w: 20, h: 20 };
    if (hovering) {
      goal = boxOf(state.target, rect);
    }
    // 선의 목표 위치임. 평소에는 마우스 위치이고, 대상을 잠그면 잠금 상자의 가운데로 옮겨 조준이 붙는 느낌을 줌.
    let aimX = state.px;
    let aimY = state.py;
    if (hovering) {
      aimX = goal.x + goal.w / 2;
      aimY = goal.y + goal.h / 2;
    }
    // follow는 선, snap은 잠금 상자·보이는 정도가 이번 프레임에 목표 쪽으로 움직일 비율임. 동작 줄이기이면 1(바로 도착)임.
    let follow = 1;
    if (!reduce && settings.smoothing > 0) {
      follow = ease(dt, 0.008 + settings.smoothing * 0.16);
    }
    let snap = 1;
    if (!reduce) {
      snap = ease(dt, 0.085);
    }
    // Number(true)는 1, Number(false)는 0임. 선은 마우스가 안에 있을 때 1, 밖이면 0을 목표로 서서히 나타나고 사라짐.
    const wanted = Number(state.inside);
    // 잠금 상자는 마우스 아래에 잠금 대상이 있을 때 1, 없을 때 0을 목표로 함.
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
    // 클릭 파동의 나이를 늘리고, 아직 끝나지 않은 것만 새 배열에 남김.
    const running = [];
    for (const pulse of state.pulses) {
      pulse.age += dt;
      if (pulse.age < PULSE_SECONDS) {
        running.push(pulse);
      }
    }
    state.pulses = running;
    draw();

    // 아직 목표에 도착하지 않은 값이 하나라도 있거나 파동이 남아 있으면 다음 프레임을 예약함.
    let settling = state.x !== aimX || state.y !== aimY || state.presence !== wanted || lock.alpha !== shown;
    if (hovering && (lock.x !== goal.x || lock.y !== goal.y || lock.w !== goal.w || lock.h !== goal.h)) {
      settling = true;
    }
    if (settling || state.pulses.length > 0) {
      raf = requestAnimationFrame(tick);
    }
  }


  // wake(): 그리기가 멈춰 있으면 다음 프레임을 예약함. 이미 예약되어 있으면 두 번 예약하지 않음.
  function wake() {
    if (raf !== 0 || !alive) {
      return;
    }
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }


  // setInside(inside): 마우스가 container 안에 있는지 기록함. 밖으로 나가면 잠금 대상도 비움.
  function setInside(inside) {
    state.inside = inside;
    if (!inside) {
      state.target = null;
    }
  }


  // handleResize(): container 크기가 바뀌면(창 크기 변경, 지도 이미지 로딩 완료 등) canvas 크기를 맞추고 다시 그림.
  function handleResize() {
    resize();
    wake();
  }


  // handlePointerMove(event): container 안에서 마우스가 움직일 때마다 위치와 마우스 아래의 잠금 대상을 기록함.
  function handlePointerMove(event) {
    // 손가락 터치는 무시함. 조준선은 마우스처럼 화면 위에 떠 있는 포인터에서만 의미가 있음.
    if (event.pointerType === 'touch') {
      return;
    }
    state.clientX = event.clientX;
    state.clientY = event.clientY;
    // 처음 들어온 순간에는 선과 잠금 상자를 마우스 위치에서 바로 시작하게 함. 왼쪽 위 구석에서 날아오지 않게 하려는 것임.
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


  // handlePointerDown(event): 누른 자리에 클릭 파동을 추가함. 잠금 대상 위이면 주황, 아니면 검은 원임.
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


  // handlePointerLeave(): 마우스가 container 밖으로 나가거나 창이 초점을 잃으면 선을 서서히 숨김.
  function handlePointerLeave() {
    setInside(false);
    wake();
  }


  // handleScroll(): 마우스를 움직이지 않고 스크롤만 해도 마우스 아래 요소가 바뀌므로 잠금 대상을 다시 찾음.
  function handleScroll() {
    if (state.inside) {
      state.target = pick(document.elementFromPoint(state.clientX, state.clientY));
      wake();
    }
  }


  /*
   * restore(saved): 이전 조준선의 destroy() 값으로 상태를 이어받음.
   * map.js는 핀을 누를 때마다 지도를 새로 만들기 때문에, 이어받지 않으면 클릭 파동과 선이 사라졌다가 마우스를 움직여야 다시 나타남.
   * 저장한 지 1초가 넘었거나, 그때 마우스가 밖에 있었거나, 지금 그 자리가 container 밖이면 이어받지 않음.
   */
  function restore(saved) {
    if (saved === null || performance.now() - saved.time > RESUME_MS || !saved.state.inside) {
      return;
    }
    const under = document.elementFromPoint(saved.state.clientX, saved.state.clientY);
    if (under !== null && container.contains(under)) {
      // Object.assign은 saved.state의 항목을 state에 복사함. 예전 DOM의 대상은 쓸 수 없으므로 아래에서 다시 찾음.
      Object.assign(state, saved.state);
      setInside(true);
      state.target = pick(under);
    }
  }


  // destroy(): 예약된 그리기·크기 감시·이벤트 연결·클래스·canvas를 모두 지움. 마지막 상태를 { time, state }로 반환함.
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


  // ResizeObserver는 요소의 크기가 바뀔 때마다 handleResize를 호출함. 처음 연결할 때도 한 번 호출함.
  const observer = new ResizeObserver(handleResize);
  observer.observe(canvas);
  // 마우스 이벤트는 container에만 연결해 지도 밖에서는 아무 일도 하지 않게 함.
  container.addEventListener('pointermove', handlePointerMove);
  container.addEventListener('pointerdown', handlePointerDown);
  container.addEventListener('pointerleave', handlePointerLeave);
  // capture: true는 페이지뿐 아니라 안쪽 스크롤 영역의 스크롤도 받기 위함임. passive: true는 스크롤을 막지 않는다는 약속임.
  window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
  // 다른 탭이나 창으로 옮겨 가면 마우스가 나간 것으로 처리해 돌아왔을 때 멈춘 선이 남지 않게 함.
  window.addEventListener('blur', handlePointerLeave);
  // 처음 크기를 맞추고, 이어받을 상태가 있으면 복원한 뒤 첫 그리기를 예약함.
  resize();
  restore(settings.resume);
  wake();
  // 바깥에서는 destroy만 쓸 수 있게 반환함. map.js가 지도를 다시 그리기 전에 호출함.
  return { destroy: destroy };
}
