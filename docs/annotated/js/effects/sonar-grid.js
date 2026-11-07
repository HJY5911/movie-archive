/*
 * sonar-grid.js — 화면 전체에 옅은 점 격자를 깔고, 그 위로 수중 음파 탐지기(소나)처럼 둥근 파동이 퍼지게 canvas로 그리는 배경 효과 모듈임.
 *
 * 원본: 21st.dev에 공개된 NIMA MZ(@n1m4mz)의 Sonar Grid 컴포넌트(https://21st.dev/@n1m4mz/components/sonar-grid)임.
 * 원본은 React 컴포넌트이므로, 같은 계산을 React 없이 순수 JavaScript와 canvas로 옮김.
 * 옮긴 동작: 가운데 맞춘 점 격자, 시간이 지날수록 커지는 파동 고리(반지름 = 지난 시간 × 속도),
 * 화면 대각선을 다 지나면 사라지는 고리 수명과 서서히 옅어지는 정도(fade), 고리 근처 점일수록 진하고 커지는 계산(smoothstep),
 * 조용한 점은 한 번에 모아 그리고 고리에 걸린 점만 하나씩 그리는 방식, 첫 화면부터 이미 퍼지고 있는 고리(seed ping),
 * 일정 시간마다 저절로 생기는 고리(ambient ping), 누른 자리에서 생기는 고리, 움직일 고리가 없으면 다음 고리 때까지 쉬는 방식,
 * 감싸는 요소(container)의 크기를 재고 그 크기 변화를 지켜보는 방식(ResizeObserver), 화면 밖·다른 탭에서 멈추기, 동작 줄이기 설정이면 움직임 없는 격자만 그리기임.
 * 바꾼 점: 원본은 점과 고리가 한 가지 색임. 이 사이트에서는 조용한 점은 먹색(--color-ink), 고리가 지나가는 점은 세기에 따라 주황(--color-orange)으로 물들게 ringColor 옵션을 더함.
 * 고리 위 점의 가장 진한 불투명도를 정하는 peakOpacity 옵션을 더함. 원본은 1로 고정이지만 이 사이트는 본문 글자 뒤에 깔리므로 낮춰 씀.
 * 원본은 컴포넌트 영역 안을 눌렀을 때만 고리를 만듦. 이 사이트는 화면 전체가 배경이므로 문서 전체에서 누른 자리를 받고(pingSource), 링크·버튼 같은 조작 요소 위는 건너뜀(ignoreSelector).
 * 원본은 누르는 순간(pointerdown) 바로 고리를 만듦. 휴대폰에서는 손가락을 대는 순간에는 탭인지 스크롤인지 알 수 없어 스크롤만 해도 고리가 생김.
 * 그래서 마우스는 원본처럼 누르는 순간 고리를 만들고, 손가락·펜은 뗄 때(pointerup) 처음 누른 자리에서 10px 안이면 그 자리에 고리를 만듦.
 * 브라우저가 스크롤로 판단하면 pointercancel을 보내므로, 이때는 기억해 둔 자리를 버려 고리를 만들지 않음.
 * 저절로 생기는 고리 사이에 쉬는 시간을 두는 pingRest 옵션을 더함. 원본은 pingEvery초마다 고리를 만듦.
 * 고리 수명(넓은 화면에서 약 7초)보다 간격이 짧으면 앞 고리가 사라지기 전에 다음 고리가 생겨 화면이 한 번도 쉬지 않고 움직이고, 다시 그리기도 멈추지 않음.
 * pingRest를 정하면 다음 고리는 앞 고리가 화면을 다 지나간 뒤 pingRest초를 더 기다렸다가 생김. 그동안은 고리가 없어 다시 그리기도 쉼.
 * 원본의 첫 고리는 처음 크기를 잴 때 생김. 여기서는 격자가 실제로 보이기 시작하는 첫 그림에서 생기게 바꿈. 메인 페이지 소개 화면이 덮고 있는 동안 고리가 보이지 않은 채 지나가 버리지 않게 하기 위함임.
 * 다른 요소(watch)가 화면에 보이는지도 함께 살펴 멈추는 기능을 더함. 메인 페이지의 검은 소개 화면이 격자를 다 덮는 동안 그리기를 쉼.
 * 원본의 테마 전환 감지(MutationObserver)와 마우스 커서 모양 바꾸기(crosshair 커서)는 이 사이트에 테마 전환이 없고 배경 전체의 커서를 바꾸면 안 되므로 뺌.
 * 저작권: Copyright (c) 2026 NIMA MZ, MIT 라이선스임.
 * 라이선스 조건에 따라 저작권·허가 고지 전문을 THIRD_PARTY_NOTICES.md에 포함함.
 *
 * 사용하는 곳: js/ui.js의 mountSonarGrid()가 모든 페이지 body 맨 앞에 배경 층(div.site-sonar)을 만들고 그 층을 container로 넘김.
 * 배경 층의 위치와 층 순서는 css/common.css의 .site-sonar가 정함.
 * createSonarGrid(container, options)를 호출하면 container 맨 앞에 canvas를 하나 붙이고 { destroy } 객체를 반환함.
 * destroy()를 호출하면 canvas와 이벤트 연결, 감시자(Observer), 예약된 다시 그리기를 모두 지움.
 * canvas는 position: absolute로 container를 꽉 채움. 원본처럼 container의 크기를 재서 그 크기에 맞춰 그림.
 * 그래서 container는 position이 static이 아니어야 하고, 너비와 높이가 CSS로 정해져 있어야 함.
 *
 * 접근성: canvas에는 aria-hidden="true"와 pointer-events: none을 지정해 보조 기술과 클릭에 영향을 주지 않음. 장식일 뿐 정보는 없음.
 * 누른 자리를 받을 때는 passive 이벤트로 받아 스크롤을 막지 않음. 누른 요소의 원래 동작(링크 이동, 버튼, 글자 선택)도 그대로임.
 * 휴대폰에서는 짧게 톡 친 경우에만 고리가 생기고, 글을 읽으며 스크롤할 때는 생기지 않음.
 * 사용자가 운영체제에서 동작 줄이기(prefers-reduced-motion)를 켰으면 고리 없이 멈춘 점 격자만 그림. 누르기에도 반응하지 않음. 설정을 바꾸면 바로 따라감.
 * 고대비(강제 색상) 모드와 인쇄에서는 common.css가 canvas를 숨김.
 * 움직이는 고리가 있는 동안에만 requestAnimationFrame으로 다시 그리고, 없으면 다음 고리 시각까지 setTimeout으로 쉼.
 * 다른 탭으로 가거나, canvas가 숨겨지거나, watch 요소가 화면 밖에 있으면 그리기를 멈춤.
 */

// TAU는 원 한 바퀴의 각도(라디안)임. 2π와 같음. arc()로 점(작은 원)을 그릴 때 씀.
const TAU = Math.PI * 2;
// 먹색에서 주황까지 섞은 색을 몇 단계로 미리 만들어 둘지 정함. 32단계면 눈으로 단계가 보이지 않음.
// 점마다 색 문자열을 새로 만들지 않고 미리 만든 목록에서 골라 써서 매 장면의 계산을 줄임.
const COLOR_STEPS = 32;
// 첫 고리를 몇 밀리초 전에 생긴 것으로 칠지 정함. 원본과 같은 값임.
// 0.5초 전에 생긴 것으로 치면 첫 화면부터 반지름 약 130px짜리 고리가 이미 퍼지고 있음.
const SEED_AGE_MS = 500;
// 손가락·펜으로 누른 뒤 이 거리(px) 안에서 떼야 탭으로 봄. 더 움직였으면 스크롤이나 끌기로 보고 고리를 만들지 않음.
const TAP_SLOP = 10;


// clamp(value, min, max): value를 min 이상 max 이하로 잘라서 반환함.
// 예: clamp(1.4, 0, 1) → 1, clamp(-0.2, 0, 1) → 0
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
// 3배 화면에서도 2까지만 사용해 화면 전체 크기의 canvas가 너무 커지지 않게 함. 원본과 같은 상한임.
function currentDpr() {
  return Math.min(window.devicePixelRatio || 1, 2);
}


// destroyNothing(): canvas를 쓸 수 없어 아무것도 만들지 않았을 때 돌려주는 빈 destroy 함수임.
// 호출하는 쪽이 결과와 상관없이 destroy()를 부를 수 있게 함.
function destroyNothing() {
  return null;
}


/*
 * toRgb(ctx, color): CSS 색 글자('#ff5a00', 'rgb(11, 11, 11)', 'orange' 등)를 [빨강, 초록, 파랑] 숫자 배열로 바꿈.
 * canvas에 fillStyle로 색을 넣으면 브라우저가 '#rrggbb' 또는 'rgba(r, g, b, a)' 꼴로 정리해 돌려주는 점을 이용함.
 * 색 이름이나 다른 형식도 브라우저가 대신 해석해 주므로 직접 해석 규칙을 만들 필요가 없음.
 * 먼저 검정을 넣어 두므로, 잘못된 색 글자가 들어오면 무시되고 검정으로 처리됨.
 * 투명도(a)는 버림. 점의 투명도는 globalAlpha로 따로 정하기 때문임.
 * 예: toRgb(ctx, '#ff5a00') → [255, 90, 0]
 */
function toRgb(ctx, color) {
  ctx.fillStyle = '#000000';
  ctx.fillStyle = color;
  const value = String(ctx.fillStyle);
  if (value.charAt(0) === '#') {
    // '#rrggbb'에서 두 글자씩 잘라 16진수를 10진수로 바꿈. 예: 'ff' → 255
    return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];
  }
  // 'rgba(11, 11, 11, 0.5)'처럼 괄호 안 숫자를 쉼표로 나눠 앞의 세 개만 씀.
  const parts = value.slice(value.indexOf('(') + 1, value.indexOf(')')).split(',');
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}


/*
 * blendSteps(from, to): 색 from에서 색 to까지 COLOR_STEPS(32)단계로 고르게 섞은 색 글자 목록을 만듦.
 * 0번은 from 그대로, 마지막(31번)은 to 그대로임. 가운데는 두 색을 비율대로 섞은 색임.
 * 예: from이 먹색 [11, 11, 11], to가 주황 [255, 90, 0]이면 16번 근처는 갈색 'rgb(137, 52, 5)' 정도임.
 */
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


/*
 * createSonarGrid(container, options): container 맨 앞에 점 격자 canvas를 붙이고 { destroy }를 반환함.
 * options의 항목(모두 생략 가능, 괄호 안은 기본값이며 원본 컴포넌트의 기본값과 같음):
 *   spacing(26): 점과 점 사이 간격(px)임.
 *   dotRadius(1.4): 조용한 점의 반지름(px)임.
 *   baseOpacity(0.28): 조용한 점의 불투명도(0~1)임.
 *   peakOpacity(1): 고리 한가운데 점의 가장 진한 불투명도(0~1)임. 이 사이트에서 더한 항목임.
 *   color(null): 점의 기본 색임. null이면 canvas의 CSS color 값을 읽음(원본과 같음).
 *   ringColor(null): 고리가 지나갈 때 점이 물드는 색임. null이면 color와 같아 원본처럼 한 가지 색이 됨. 이 사이트에서 더한 항목임.
 *   pingEvery(2.4): 저절로 생기는 고리의 간격(초)임. 0이면 저절로 생기지 않음.
 *   pingRest(null): 저절로 생긴 고리가 화면을 다 지나간 뒤 다음 고리까지 더 쉬는 시간(초)임. null이면 원본처럼 pingEvery초마다 생김. 이 사이트에서 더한 항목임.
 *   speed(260): 고리가 퍼지는 빠르기(px/초)임.
 *   ringWidth(90): 고리의 두께(px)임. 고리 중심선에서 이 거리 안의 점이 영향을 받음.
 *   amplitude(2.2): 고리 한가운데 점이 커지는 정도임. 2.2면 반지름이 최대 1 + 2.2 = 3.2배가 됨.
 *   maxRings(6): 한 번에 남겨 둘 수 있는 고리 수임. 넘치면 가장 오래된 고리부터 지움.
 *   seedPing(true): 첫 화면부터 이미 퍼지고 있는 고리를 하나 만들지 정함.
 *   pingArea([0.15, 0.2, 0.85, 0.8]): 저절로 생기는 고리가 나타날 범위임. [왼쪽, 위, 오른쪽, 아래]를 canvas 크기에 대한 비율로 적음.
 *   interactive(true): 누른 자리에서 고리가 생기게 할지 정함.
 *   pingSource(container): 누르기(pointerdown)를 받을 요소임. 이 사이트에서 더한 항목이며, 원본은 컴포넌트 영역만 받음.
 *   ignoreSelector(null): 이 CSS 선택자에 맞는 요소(와 그 안쪽)를 누르면 고리를 만들지 않음. 이 사이트에서 더한 항목임.
 *   watch(null): 이 요소가 화면에 하나도 안 보이면 그리기를 멈춤. 이 사이트에서 더한 항목임.
 *   className('sonar-grid'): canvas에 붙일 클래스 이름임. canvas의 위치·크기는 이 모듈이 container에 맞춰 정함.
 */
export function createSonarGrid(container, options) {
  // 들어온 값이 지나치게 작거나 범위를 벗어나도 그림이 깨지지 않게 아래·위 한계를 둠.
  // 예: spacing이 0이면 점이 무한히 많아지므로 4px 아래로는 내려가지 않게 함.
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
  // getContext('2d')는 canvas에 그림을 그리는 도구 묶음(ctx)을 돌려줌. 지원하지 않는 환경에서는 null임.
  // null이면 canvas를 붙이지 않고 빈 destroy만 돌려줌. 이때 페이지는 원래의 흰 바탕 그대로임.
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    return { destroy: destroyNothing };
  }
  canvas.className = settings.className;
  canvas.setAttribute('aria-hidden', 'true');
  // 원본처럼 canvas가 container를 꽉 채우게 함. CSS 크기를 여기서 정해 두므로 canvas.width를 바꿔도 화면에 보이는 크기는 그대로임.
  // 크기를 정하지 않으면 canvas의 화면 크기가 canvas.width를 따라가, 레티나 화면에서 크기를 잴 때마다 두 배씩 커지는 문제가 생김.
  // pointer-events: none은 canvas가 클릭을 가로채지 않게 함.
  canvas.style.cssText = 'position: absolute; inset: 0; display: block; width: 100%; height: 100%; pointer-events: none;';
  // prepend는 container의 맨 앞에 붙임. 원본처럼 canvas가 다른 내용보다 먼저(뒤쪽에) 놓이게 함.
  container.prepend(canvas);

  // matchMedia는 CSS 미디어 조건을 JavaScript에서 확인하는 기능임. matches가 true면 동작 줄이기가 켜진 상태임.
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  // size는 canvas의 CSS 픽셀 크기임. 실제 그리기 픽셀은 여기에 기기 픽셀 비율을 곱한 크기임.
  const size = { w: 1, h: 1 };
  // rings는 살아 있는 고리 목록임. 각 고리는 { x, y, born }으로 중심 위치와 생긴 시각(밀리초)만 기억함.
  let rings = [];
  // steps는 blendSteps()로 만든 32단계 색 목록임. 0번이 조용한 점의 색임.
  let steps = [];
  // raf는 예약한 requestAnimationFrame 번호, timer는 예약한 setTimeout 번호임. 0이면 예약이 없다는 뜻임.
  let raf = 0;
  let timer = 0;
  let alive = true;
  let seeded = false;
  // canvasShown은 canvas 자체가 화면에 보이는지, watchShown은 watch 요소가 화면에 보이는지임.
  // watch가 있으면 처음에는 false로 두고 IntersectionObserver의 첫 보고를 기다림. 소개 화면 뒤에서 첫 고리를 써 버리지 않게 하기 위함임.
  let canvasShown = true;
  let watchShown = settings.watch === null;
  // nextPing은 다음 고리가 저절로 생길 시각(밀리초)임. performance.now()는 페이지를 연 뒤 흐른 시간임.
  let nextPing = performance.now() + settings.pingEvery * 1000;
  // press는 손가락·펜으로 누른 뒤 아직 떼지 않은 누르기의 { id, x, y }임. 떼는 순간 탭인지 확인하려고 기억함. 없으면 null임.
  let press = null;

  // readColors(): 기본 색과 고리 색을 읽어 32단계 색 목록을 새로 만듦.
  // 원본처럼 고리가 생길 때마다 다시 읽어서, CSS 색이 바뀌어도 다음 고리부터 따라감.
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

  // pointIn(u, v): pingArea 범위 안에서 가로 u, 세로 v 비율(0~1) 위치의 실제 좌표(px)를 돌려줌.
  // 예: pingArea가 [0.1, 0.15, 0.9, 0.85]이고 canvas가 1440×900이면 pointIn(0.5, 0.5) → { x: 720, y: 450 }
  function pointIn(u, v) {
    const area = settings.pingArea;
    return { x: size.w * (area[0] + (area[2] - area[0]) * u), y: size.h * (area[1] + (area[3] - area[1]) * v) };
  }

  // ringLife(): 고리 하나의 수명(초)임. 고리가 화면 대각선 끝까지 다 지나가는 데 걸리는 시간이며 원본과 같은 식임.
  // 예: 1440×900 화면, ringWidth 90, speed 260이면 (1698 + 90) / 260 ≈ 6.9초임.
  function ringLife() {
    return (Math.hypot(size.w, size.h) + settings.ringWidth) / settings.speed;
  }

  /*
   * planPing(now, born): born 시각에 생긴 고리를 보고 다음 고리가 저절로 생길 시각(nextPing)을 정함.
   * 기본은 원본처럼 지금부터 pingEvery초 뒤임.
   * pingRest가 있으면 그 고리가 사라지는 시각(born + 수명)에서 pingRest초를 더 기다린 시각과 비교해 더 늦은 쪽을 고름.
   * 예: 1440×900 화면, pingEvery 6, pingRest 3이면 수명 6.9초 + 3초 = 9.9초 뒤에 다음 고리가 생김.
   */
  function planPing(now, born) {
    let wait = settings.pingEvery * 1000;
    if (settings.pingRest !== null) {
      wait = Math.max(wait, born - now + (ringLife() + settings.pingRest) * 1000);
    }
    nextPing = now + wait;
  }

  // addRing(x, y, born): (x, y)를 중심으로 born 시각에 생긴 고리를 더함.
  // maxRings를 넘으면 shift()로 가장 오래된(목록 맨 앞) 고리부터 지움.
  function addRing(x, y, born) {
    readColors();
    rings.push({ x: x, y: y, born: born });
    while (rings.length > settings.maxRings) {
      rings.shift();
    }
  }

  /*
   * strengthAt(x, y, waves): 점 (x, y)가 고리에 얼마나 걸렸는지를 0~1 세기로 돌려줌. 원본과 같은 계산임.
   * 1. 점과 고리 중심 사이 거리에서 고리 반지름을 뺀 차이(gap)를 구함. 고리 중심선 위의 점이면 gap이 0임.
   * 2. gap이 ringWidth 이상이면 영향이 없음(0). 그 안이면 t = 1 - gap / ringWidth로 0~1 값을 만듦.
   * 3. t를 smoothstep(t × t × (3 - 2t))으로 바꿔 고리 가장자리는 부드럽게, 가운데는 또렷하게 함.
   * 4. 오래된 고리일수록 옅어지도록 fade(1 → 0)를 곱함.
   * 고리가 여러 개면 가장 센 값 하나만 씀. 겹친 자리가 지나치게 진해지지 않게 하기 위함임.
   * 먼저 가로·세로 거리만 비교해 확실히 먼 고리는 건너뜀. 제곱근이 드는 Math.hypot 계산을 줄이기 위함임.
   */
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

  // draw(now): now 시각의 모습으로 canvas 전체를 다시 그림. 수명(life)이 다한 고리는 이때 목록에서 빠짐.
  function draw(now) {
    const life = ringLife();
    const kept = [];
    const waves = [];
    for (const ring of rings) {
      const age = (now - ring.born) / 1000;
      if (age < life) {
        // 반지름 = 지난 시간(초) × 속도(px/초)임. reach는 이 고리가 영향을 줄 수 있는 가장 먼 거리임.
        // fade는 갓 생긴 고리에서 1, 수명이 다할 때 0임. 시각 오차로 1을 넘지 않게 Math.min으로 막음.
        const radius = age * settings.speed;
        kept.push(ring);
        waves.push({ x: ring.x, y: ring.y, radius: radius, reach: radius + settings.ringWidth, fade: Math.min(1, 1 - age / life) });
      }
    }
    // 수명이 다한 고리는 목록에서 빠짐.
    rings = kept;

    ctx.clearRect(0, 0, size.w, size.h);
    // 화면을 덮을 만큼 열(cols)과 행(rows) 수를 정하고, 남는 여백을 양쪽에 똑같이 나눠 격자를 가운데에 맞춤.
    const gap = settings.spacing;
    const cols = Math.ceil(size.w / gap) + 1;
    const rows = Math.ceil(size.h / gap) + 1;
    const left = (size.w - (cols - 1) * gap) / 2;
    const top = (size.h - (rows - 1) * gap) / 2;
    // lit은 고리에 걸린 점을 [x, y, 세기, x, y, 세기, ...] 순서로 모아 두는 배열임. 원본과 같은 방식임.
    const lit = [];
    // 조용한 점은 모두 같은 색·같은 크기라 한 경로(path)에 모았다가 fill() 한 번으로 그림. 점이 수천 개여도 빠름.
    // moveTo로 펜을 원의 오른쪽 끝으로 옮긴 뒤 arc를 그려야 점과 점 사이에 선이 이어지지 않음.
    ctx.globalAlpha = settings.baseOpacity;
    ctx.fillStyle = steps[0];
    ctx.beginPath();
    for (let col = 0; col < cols; col++) {
      const x = left + col * gap;
      for (let row = 0; row < rows; row++) {
        const y = top + row * gap;
        const strength = strengthAt(x, y, waves);
        // 세기가 0.01보다 작으면 눈에 띄지 않으므로 조용한 점으로 침.
        if (strength < 0.01) {
          ctx.moveTo(x + settings.dotRadius, y);
          ctx.arc(x, y, settings.dotRadius, 0, TAU);
        } else {
          lit.push(x, y, strength);
        }
      }
    }
    ctx.fill();

    // 고리에 걸린 점은 세기마다 진하기·색·크기가 달라 하나씩 그림.
    // 불투명도는 baseOpacity에서 peakOpacity까지, 반지름은 dotRadius에서 dotRadius × (1 + amplitude)까지 세기에 비례해 커짐.
    // 색은 세기에 맞는 단계를 골라, 약하게 걸린 점은 먹색에 가깝고 고리 한가운데 점은 주황이 됨.
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

  /*
   * resize(): container의 크기를 다시 재고, canvas의 그리기 픽셀 크기를 맞춘 뒤 바로 다시 그림. 원본처럼 canvas가 아닌 container를 잼.
   * canvas.width/height는 실제 그리기 픽셀 수라 CSS 크기 × 기기 픽셀 비율로 정함. 레티나 화면에서도 점이 흐리지 않음.
   * setTransform(dpr, ...)으로 좌표를 늘려 두면 이후에는 CSS 픽셀 기준 좌표로 그려도 됨.
   * canvas.width에 값을 넣으면 그려 둔 내용이 지워지므로 같은 함수 안에서 바로 draw()를 부름.
   */
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

  // seed(now): 처음 보이는 순간에 0.5초 전에 생긴 고리 하나를 더함. 첫 화면부터 고리가 퍼지고 있는 모습이 됨.
  // 위치는 원본과 같이 pingArea의 가로 68%, 세로 34% 지점임. 다음 저절로 생기는 고리 시각은 planPing()이 이 고리를 기준으로 정함.
  // 첫 고리를 만들지 않는 설정(seedPing: false)이면 기다릴 고리가 없으므로 pingEvery초 뒤로 정함.
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

  // handleIdle(): 쉬는 동안 걸어 둔 setTimeout이 끝나면 불림. 예약 번호를 비우고 tick()을 한 번 실행함.
  function handleIdle() {
    timer = 0;
    tick(performance.now());
  }

  // scheduleIdle(delay): 움직일 고리가 없을 때 delay 밀리초 뒤에 다시 깨어나도록 예약함. 최소 16ms(약 한 장면)임.
  // 고리가 없는 동안 매 장면 다시 그리지 않아 배터리와 CPU를 아낌. 원본과 같은 방식임.
  // 이 사이트는 pingRest로 고리 사이에 쉬는 시간을 두므로, 저절로 생긴 고리가 사라진 뒤 다음 고리까지 실제로 이 쉬기가 일어남.
  function scheduleIdle(delay) {
    clearTimeout(timer);
    timer = setTimeout(handleIdle, Math.max(16, delay));
  }

  /*
   * tick(now): 한 장면을 처리함. requestAnimationFrame 또는 쉬기 예약(handleIdle)에서 불림.
   * 1. 사라진 뒤이거나, 보이지 않거나, 다른 탭이면 아무것도 예약하지 않고 멈춤. 다시 보이면 wake()가 깨움.
   * 2. 동작 줄이기가 켜져 있으면 고리를 모두 지우고 멈춘 격자만 그린 뒤 멈춤.
   * 3. 아직 첫 고리를 만들지 않았으면 만듦. 저절로 생길 시각이 지났으면 pingArea 안의 무작위 위치에 고리를 더하고 다음 시각을 정함.
   * 4. 다시 그린 뒤, 남은 고리가 있으면 다음 장면을 예약하고 없으면 다음 고리 시각까지 쉼.
   */
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

  // wake(): 멈춰 있거나 쉬는 중이면 쉬기 예약을 취소하고 다음 장면을 예약함. 이미 장면이 예약되어 있으면 그대로 둠.
  function wake() {
    if (raf !== 0 || !alive) {
      return;
    }
    clearTimeout(timer);
    timer = 0;
    raf = requestAnimationFrame(tick);
  }

  // handleResize(): ResizeObserver가 container 크기 변화를 알려 주면 불림. 창 크기를 바꾸면 격자를 다시 가운데에 맞춤.
  function handleResize() {
    resize();
  }

  // pingAt(clientX, clientY): 화면 좌표 (clientX, clientY)에 고리를 더하고 다시 그리기를 깨움.
  // 화면 좌표에서 container 왼쪽 위 좌표를 빼 canvas 안의 좌표로 바꿈. 이 사이트의 배경 층은 화면 왼쪽 위에 고정되어 있어 두 좌표가 같음.
  function pingAt(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    addRing(clientX - rect.left, clientY - rect.top, performance.now());
    wake();
  }

  /*
   * handlePointerDown(event): pingSource에서 누르기(pointerdown)가 일어나면 불림.
   * 마우스 왼쪽 버튼, 손가락 터치, 펜의 첫 번째 접촉만 받음(button 0, isPrimary). 오른쪽 버튼이나 두 번째 손가락은 무시함.
   * 누른 요소가 ignoreSelector에 맞으면(링크·버튼·입력칸 등) 고리를 만들지 않음. closest()는 자신과 바깥 요소를 차례로 살펴 맞는 요소를 찾음.
   * 마우스(pointerType이 'mouse')면 원본처럼 바로 고리를 만듦.
   * 손가락·펜은 이 순간에는 탭인지 스크롤인지 모르므로 누른 자리와 pointerId만 press에 기억하고, 떼는 순간 handlePointerUp()이 판단함.
   * 원래 동작을 막는 preventDefault()는 부르지 않음.
   */
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

  /*
   * handlePointerUp(event): 손가락·펜을 떼면(pointerup) 불림.
   * 기억해 둔 누르기와 같은 손가락(pointerId)이고, 누른 자리에서 TAP_SLOP(10px) 안에서 뗐으면 탭으로 보고 처음 누른 자리에 고리를 만듦.
   * 그 사이에 동작 줄이기가 켜졌으면 만들지 않음. 어느 경우든 기억해 둔 누르기는 지움.
   */
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

  // handlePointerCancel(event): 브라우저가 누르기를 스크롤·확대 같은 자체 동작으로 넘기면(pointercancel) 불림.
  // 이때는 탭이 아니므로 기억해 둔 누르기를 지워 고리를 만들지 않음.
  function handlePointerCancel(event) {
    if (press !== null && event.pointerId === press.id) {
      press = null;
    }
  }

  // handleIntersect(entries): IntersectionObserver가 canvas나 watch 요소가 화면에 들어오고 나간 것을 알려 주면 불림.
  // 둘 다 보이면 다시 그리기를 깨움. 하나라도 안 보이면 다음 tick()에서 멈춤.
  // display: none이 된 canvas(인쇄·고대비 모드)도 안 보이는 것으로 보고됨.
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

  // handleVisibility(): 다른 탭으로 갔다가 돌아오면(document.hidden이 false가 되면) 다시 그리기를 깨움.
  function handleVisibility() {
    if (!document.hidden) {
      wake();
    }
  }

  // handleMotionChange(): 동작 줄이기 설정이 바뀌면 불림. 깨운 뒤 tick()이 새 설정에 맞춰 고리를 지우거나 다시 시작함.
  function handleMotionChange() {
    wake();
  }

  // destroy(): 예약한 장면·쉬기, 감시자, 이벤트 연결을 모두 풀고 canvas를 지움.
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

  // ResizeObserver는 요소 크기가 바뀔 때, IntersectionObserver는 요소가 화면에 들어오고 나갈 때 함수를 불러 주는 브라우저 기능임.
  // threshold: 0은 1픽셀이라도 보이면 보이는 것으로 친다는 뜻임.
  const resizeObserver = new ResizeObserver(handleResize);
  const intersectionObserver = new IntersectionObserver(handleIntersect, { threshold: 0 });
  readColors();
  resize();
  // 크기는 원본처럼 container를 지켜봄. 화면에 보이는지는 canvas로 확인함. container가 display: none이면 canvas도 안 보이는 것으로 보고됨.
  resizeObserver.observe(container);
  intersectionObserver.observe(canvas);
  if (settings.watch !== null) {
    intersectionObserver.observe(settings.watch);
  }
  // passive: true는 이 함수들이 스크롤을 막지 않는다고 브라우저에 미리 알림. 휴대폰에서 스크롤이 늦어지지 않음.
  settings.pingSource.addEventListener('pointerdown', handlePointerDown, { passive: true });
  settings.pingSource.addEventListener('pointerup', handlePointerUp, { passive: true });
  settings.pingSource.addEventListener('pointercancel', handlePointerCancel, { passive: true });
  document.addEventListener('visibilitychange', handleVisibility);
  reduceQuery.addEventListener('change', handleMotionChange);
  wake();
  return { destroy: destroy };
}
