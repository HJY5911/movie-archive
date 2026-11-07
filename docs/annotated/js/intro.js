/*
 * intro.js: 사이트에 처음 들어왔을 때 보이는 첫 화면(영화 촬영 카메라 뷰파인더)을 만드는 모듈임.
 * React Bits의 ScrollExpand(Animations/ScrollExpand)를 React 없이 순수 JavaScript로 옮긴 것임.
 * 원본 저작권: Copyright (c) 2026 David Haz. 라이선스는 MIT + Commons Clause임.
 * 라이선스 조건에 따라 저작권 고지와 허가 고지 원문을 THIRD_PARTY_NOTICES.md에 포함함.
 * 원본의 핵심 계산(긴 트랙 + sticky 무대, smoothstep으로 넓어지는 clip-path inset,
 * 배경 확대 줄이기, 지수 함수로 부드럽게 따라가기)은 그대로 두고, 쓰지 않는 기능은 뺐음.
 * 뺀 기능: 요소 안 스크롤 모드, 동영상 배경, 끝에서 나타나는 overlay, 제목 확대(scale) 등임.
 *
 * 동작 순서
 * 1. 다른 페이지에서 메뉴·로고를 눌러 온 경우가 아니면 #sidebar 바로 앞에 소개 화면(section)을 끼워 넣음.
 * 2. section의 높이를 화면 높이의 2.4배로 잡고, 그 안의 무대(stage)는 position: sticky로 화면에 붙여 둠.
 * 3. 스크롤한 거리를 0~1 사이의 진행도로 바꾸고, 진행도에 따라 촬영 영역(frame)을 화면 전체로 넓힘.
 * 4. 끝까지 넓어진 뒤 조금 더 내리면 무대가 위로 밀려 나가고 기존 메뉴와 메인 화면이 이어서 보임.
 *
 * 화면 읽기 프로그램을 위해 FILMLOG 글자와 인용문은 실제 텍스트로 DOM에 남겨 둠.
 * 장식 요소(포스터 벽, 뷰파인더 표시, 필름 입자, 스크롤 안내)는 aria-hidden="true"로 숨김.
 * 이 파일은 page JS와 같은 규칙(화살표 함수·map·삼항 연산자 없이 for...of와 if/else)으로 작성됨.
 */

// el(): ui.js의 요소 생성 도우미임. 태그 이름, 속성 객체, 자식 순서로 넘기면 요소를 만들어 돌려줌.
import { el } from './ui.js';
// loadCatalog(): data/catalog.json을 읽어 검사한 영화 자료를 돌려줌. 포스터 주소를 여기서 얻음.
import { loadCatalog } from './repository.js';
// createParticleText(): 글자를 작은 점(입자)으로 그리는 효과 모듈임. 메뉴의 로고와 같은 모듈을 씀.
import { createParticleText } from './effects/particle-text.js';

// QUOTE_LINES: 로고 아래에 띄울 인용문 두 문장임. 문장마다 한 줄씩 보이도록 따로 나눔.
const QUOTE_LINES = [
  '기록은 우리가 어디서 왔는지, 어디에 가고 있는지를 알게 해준다.',
  '그것은 우리의 과거, 현재 및 미래에 대한 지도이다.'
];
// CAMERA_SPECS: 뷰파인더 왼쪽 아래에 적는 촬영 설정값임(초당 24프레임, 셔터 180°, 감도, 색온도).
const CAMERA_SPECS = ['24 FPS', '180°', 'ISO 800', '5600K'];
// CORNERS: 촬영 영역 네 모서리에 그리는 ㄱ자 표시의 위치 이름임(tl=왼쪽 위, br=오른쪽 아래 등).
const CORNERS = ['tl', 'tr', 'bl', 'br'];
// WALL_ROWS: 포스터 벽의 줄 수임. 세로로 긴 태블릿 화면도 덮을 수 있게 8줄로 정함.
const WALL_ROWS = 8;
// MIN_POSTERS_PER_ROW: 한 줄에 놓을 최소 포스터 수임. 넓은 모니터에서도 끊긴 곳이 보이지 않게 함.
const MIN_POSTERS_PER_ROW = 14;

// SETTINGS: 원본 ScrollExpand의 설정값을 뷰파인더 느낌에 맞춰 조절한 값임.
// scrollDistance: 화면 높이의 몇 배만큼 스크롤하면 끝까지 넓어지는지 정함(1.1배).
// holdDistance: 다 넓어진 뒤 무대를 붙잡아 두는 추가 스크롤 거리임(화면 높이의 0.3배).
// smoothing: 진행도가 스크롤 위치를 따라가는 부드러움(초 단위에 가까운 값)임. 0이면 바로 따라감.
// mediaZoom: 처음에 포스터 벽을 1.2배로 확대해 두고 끝에서 1배가 되게 함.
// startRadius: 처음 촬영 영역 모서리의 둥글기(px)임. 뷰파인더처럼 거의 각지게 2px로 둠.
// wideRatio: 768px 이상 화면에서 쓰는 시네마스코프 비율(가로:세로 = 2.39:1)임.
// tallRatio: 좁은 화면에서 글자가 들어가도록 쓰는 세로형 4:5 비율임.
// blurStart: 처음 포스터 벽의 흐림 정도(px)임. 진행할수록 0이 되어 초점이 맞는 것처럼 보임.
// grayEnd: 끝에서 남는 흑백 정도임. 1이면 완전 흑백, 0.4는 색이 조금 빠진 상태임.
// scrimStart, scrimEnd: 포스터 위에 덮는 어두운 막의 처음·끝 불투명도임.
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

// clamp(): 값이 최솟값보다 작으면 최솟값, 최댓값보다 크면 최댓값으로 맞춤.
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// smoothstep(): x가 edge0~edge1 사이에서 0→1로 바뀌는 값을 돌려줌.
// 직선이 아니라 양 끝에서 천천히 바뀌는 곡선(t*t*(3-2t))이라 움직임이 부드럽게 시작하고 멈춤.
function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// logoStep(): 큰 로고의 입자 사이 간격(px)을 글자 크기로 정함.
// 글자가 클수록 넓게 하여 입자 수를 적당히 유지함(1.5~3px).
// 화면 크기가 바뀌어 글자 크기가 달라지면 particle-text.js가 이 함수를 다시 불러 간격도 함께 바뀜.
function logoStep(fontPx) {
  return clamp(fontPx / 48, 1.5, 3);
}

// logoDot(): 입자 한 개의 크기(px)임. 간격의 2/3로 두어 점 사이에 틈이 보이게 함(LED 전광판 느낌).
function logoDot(fontPx) {
  return logoStep(fontPx) * 2 / 3;
}

// pad2(): 숫자를 두 자리 글자로 만듦. 3은 "03"이 됨.
function pad2(value) {
  return String(value).padStart(2, '0');
}

// formatTimecode(): 페이지가 열린 뒤 지난 시간(ms)을 영화 타임코드 시:분:초:프레임으로 바꿈.
// 초당 24프레임이므로 프레임 자리는 00~23까지 올라감.
function formatTimecode(ms) {
  const frames = Math.floor(ms * 24 / 1000);
  const seconds = Math.floor(frames / 24);
  const hours = Math.floor(seconds / 3600) % 100;
  const minutes = Math.floor(seconds / 60) % 60;
  return pad2(hours) + ':' + pad2(minutes) + ':' + pad2(seconds % 60) + ':' + pad2(frames % 24);
}

// cameFromThisSite(): 이 사이트 안의 링크(메인 메뉴, 로고)를 눌러 들어왔거나 뒤로 가기로 돌아왔는지 검사함.
// performance의 navigation 기록으로 새로고침인지 확인하고, document.referrer로 이전 페이지 주소를 확인함.
// 새로고침이거나 이전 주소가 없으면(주소 직접 입력·즐겨찾기) 사이트에 새로 들어온 것으로 봄.
// 이전 주소의 origin(프로토콜+호스트+포트)이 지금 페이지와 같으면 사이트 안에서 이동한 것임.
function cameFromThisSite() {
  let type = 'navigate';
  const entries = performance.getEntriesByType('navigation');
  if (entries.length > 0) {
    type = entries[0].type;
  }
  // 뒤로·앞으로 가기로 돌아온 경우는 이미 소개 화면을 본 것이므로 다시 보여주지 않음.
  // 브라우저가 이전 화면을 저장해 두지 못한 경우(bfcache 없음)에도 소개 화면부터 다시 시작하지 않게 함.
  if (type === 'back_forward') {
    return true;
  }
  if (type === 'reload' || document.referrer === '') {
    return false;
  }
  // 이전 주소가 URL 형식이 아니면 new URL()이 오류를 던지므로 try/catch로 감쌈.
  try {
    return new URL(document.referrer).origin === location.origin;
  } catch (error) {
    return false;
  }
}

// frameSize(): 처음 촬영 영역의 가로·세로 크기(px)를 화면 크기에 맞춰 계산함.
// 좁은 화면: 화면 폭의 88%, 세로형 4:5 비율이며 화면 높이의 70%를 넘지 않게 함.
// 768px 이상: 2.39:1 비율로 화면 폭의 70%를 쓰되, 높이가 300px보다 낮아지지 않도록 폭을 90%까지 늘림.
// 화면이 낮아서(가로로 누운 휴대폰 등) 높이가 화면의 62%를 넘으면 높이에 맞춰 줄임.
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

// posterUrls(): 영화 자료에서 포스터 주소가 있는 것만 모음.
// 포스터 주소를 코드에 적지 않고 자료에서 읽으므로, 자료가 DB로 바뀌어도 그대로 동작함.
function posterUrls(catalog) {
  const urls = [];
  for (const movie of catalog.Movie) {
    if (typeof movie.poster_url === 'string' && movie.poster_url !== '') {
      urls.push(movie.poster_url);
    }
  }
  return urls;
}

// fillWall(): 포스터 벽을 만듦. 자료를 못 읽으면(오프라인 등) 빈 회색 칸만 만들어도 화면은 유지됨.
async function fillWall(wall) {
  let urls = [];
  try {
    urls = posterUrls(await loadCatalog());
  } catch (error) {
    urls = [];
  }
  // 영화 수가 적으면 한 줄에 같은 포스터 목록을 반복함.
  // 한 줄의 수를 영화 수의 배수로 맞춰야 아래의 두 번 반복한 줄이 이어 붙을 때 이음매가 생기지 않음.
  let perRow = MIN_POSTERS_PER_ROW;
  if (urls.length > 0 && urls.length < perRow) {
    perRow = urls.length * Math.ceil(perRow / urls.length);
  }
  // 줄마다 포스터를 같은 순서로 두 번 넣음. CSS에서 줄을 왼쪽으로 50%만큼 옮긴 뒤 처음으로 돌아가면
  // 두 번째 절반이 첫 번째 절반 자리에 정확히 겹치므로 끊김 없이 계속 흐르는 것처럼 보임.
  // row * 3만큼 시작 위치를 밀어 위아래 줄에 같은 포스터가 나란히 놓이지 않게 함.
  for (let row = 0; row < WALL_ROWS; row++) {
    const strip = el('div', { className: 'intro-wall-row' });
    for (let i = 0; i < perRow * 2; i++) {
      const poster = el('span', { className: 'intro-wall-poster' });
      if (urls.length > 0) {
        // 이미지는 background-image로 넣음. 불러오지 못해도 깨진 그림 표시 없이 회색 칸으로 남음.
        poster.style.backgroundImage = 'url("' + urls[(i % perRow + row * 3) % urls.length] + '")';
      }
      strip.append(poster);
    }
    wall.append(strip);
  }
}

// mountLogo(): FILMLOG 글자를 입자 효과로 바꿈.
// 글꼴(Anton)을 다 불러올 때까지 기다리는 일은 particle-text.js가 입자를 만들기 바로 전에 함.
// 그래서 여기서는 기다리지 않고 바로 canvas를 붙여, 입자가 모이는 장면이 늦게 시작되지 않게 함.
function mountLogo(word, layer) {
  // 글자 크기는 CSS의 clamp()가 화면 크기에 맞춰 정함.
  // 흩어지는 거리와 밀어내는 힘은 처음 글자 크기에 비례해서 정함.
  const style = getComputedStyle(word);
  const size = parseFloat(style.fontSize);

  // readFontSize(): 화면 크기가 바뀌어 입자를 다시 만들 때마다 현재 글자 크기를 다시 읽음.
  function readFontSize() {
    return parseFloat(getComputedStyle(word).fontSize);
  }

  // showParticles(): 입자를 처음 그린 직후 호출됨. 진짜 글자를 투명하게 바꿔 입자만 보이게 함.
  // 글자는 투명해질 뿐 DOM에 남아 있으므로 화면 읽기 프로그램은 FILMLOG를 그대로 읽음.
  function showParticles() {
    word.classList.add('intro-logo-ready');
  }

  // 설정값: 흩어진 입자가 1.6초 동안 모이고(gather), 마우스를 가까이 대면 밀려나며(pointerRepel),
  // 클릭하거나 탭하면 퍼졌다가 돌아옴(clickBurst). 움직이는 입자는 주황색으로 빛남(highlightColor).
  // fontFamily는 글꼴 이름 하나가 아니라 CSS에서 계산된 글꼴 목록 전체를 넘김.
  // Anton을 못 불러오면(글꼴 차단 등) DOM 글자와 같은 대체 글꼴로 입자를 만들어 글자 상자와 모양이 맞음.
  // step·particleSize는 함수로 넘겨, 화면 크기가 바뀌어 다시 만들 때 새 글자 크기에 맞는 간격을 씀.
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

// buildIntro(): 소개 화면의 요소를 모두 만들어 parts 객체에 담아 돌려줌.
// section(트랙) > stage(sticky 무대) > 건너뛰기 버튼, 필름 입자, 촬영 영역, 뷰파인더 표시, 로고·인용문, 스크롤 안내 순서임.
function buildIntro() {
  const parts = {};
  parts.section = el('section', { className: 'intro', 'aria-label': '소개 화면' });
  parts.stage = el('div', { className: 'intro-stage' });
  // 건너뛰기 버튼을 무대의 첫 요소로 두어 Tab 키로 가장 먼저 닿게 함.
  parts.skip = el('button', { className: 'intro-skip', type: 'button' }, '건너뛰기');
  // frame: clip-path로 가운데 일부만 보이는 촬영 영역임. 안에 포스터 벽(wall)과 어두운 막(scrim)이 들어감.
  parts.wall = el('div', { className: 'intro-wall' });
  parts.scrim = el('div', { className: 'intro-scrim' });
  parts.frame = el('div', { className: 'intro-frame', 'aria-hidden': 'true' }, parts.wall, parts.scrim);

  // 뷰파인더 표시(HUD): 모서리 ㄱ자, 위쪽 REC·타임코드, 아래쪽 촬영 설정·배터리임.
  // 가운데 십자 표시는 로고 글자 사이로 비쳐 보여서 넣지 않음.
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

  // 로고: 진짜 글자 FILM + 주황색 LOG를 남기고, 그 위에 입자 canvas가 들어갈 layer를 겹침.
  // layer는 글자보다 넓게 잡혀 있어(CSS) 흩어지거나 밀려난 입자가 잘리지 않음.
  parts.layer = el('span', { className: 'intro-logo-layer' });
  parts.word = el('span', { className: 'intro-logo-word' }, 'FILM', el('span', { className: 'intro-logo-accent' }, 'LOG'), parts.layer);
  // 인용문은 두 문장을 각각 span으로 나눔. 사이의 공백 덕분에 화면 읽기 프로그램이 두 문장을 붙여 읽지 않음.
  const quote = el('p', { className: 'intro-quote' },
    el('span', { className: 'intro-quote-line' }, QUOTE_LINES[0]), ' ',
    el('span', { className: 'intro-quote-line' }, QUOTE_LINES[1])
  );
  parts.copy = el('div', { className: 'intro-copy' }, el('p', { className: 'intro-logo' }, parts.word), quote);
  parts.hint = el('p', { className: 'intro-hint', 'aria-hidden': 'true' }, el('span', {}, '아래로 스크롤'), el('span', { className: 'intro-hint-arrow' }));

  // grain: 촬영 영역 바깥 검은 부분에 깔리는 필름 입자 무늬임.
  const grain = el('div', { className: 'intro-grain', 'aria-hidden': 'true' });
  parts.stage.append(parts.skip, grain, parts.frame, parts.hud, parts.copy, parts.hint);
  parts.section.append(parts.stage);
  return parts;
}

// mountIntro(): 소개 화면을 보여줄지 정하고, 보여준다면 화면에 넣고 스크롤 효과를 연결함.
function mountIntro() {
  // 새로고침하면 소개 화면부터 다시 보여야 하므로 브라우저의 스크롤 위치 복원을 끔.
  // 메뉴로 들어와 소개 화면을 건너뛴 경우에도 끄는 이유: 그 상태에서 새로고침하면 소개 화면이 나오는데,
  // 이때 브라우저가 예전 스크롤 위치를 되살리면 소개 화면 중간에서 시작하게 됨.
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  // 주소에 #app 같은 위치 표시가 있으면 그 위치로 바로 가야 하므로 소개 화면을 넣지 않음.
  const sidebar = document.querySelector('#sidebar');
  if (sidebar === null || location.hash !== '' || cameFromThisSite()) {
    return;
  }

  // stageWidth, stageHeight: 무대 크기(px)임. frame: 처음 촬영 영역 크기임.
  // target: 스크롤 위치로 계산한 목표 진행도, current: 화면에 실제로 적용 중인 진행도임.
  // raf: requestAnimationFrame 번호(0이면 멈춘 상태), clock: 타임코드 setInterval 번호임.
  // onScreen: 소개 화면이 화면 안에 보이는지 여부임.
  // touchQuery: 손가락으로 조작하는 화면(휴대폰·태블릿)인지 확인하는 미디어 쿼리임.
  // lastWidth: 마지막으로 잰 창 너비임. 휴대폰 주소창 때문에 높이만 바뀐 경우를 가려낼 때 씀.
  // lastTime: 직전 프레임 시각(ms)임. 0이면 부드럽게 따라가기가 멈춰 있는 상태임.
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

  // measure(): 화면 크기를 읽어 무대 높이와 트랙(section) 높이를 정함.
  // 트랙 높이 = 화면 높이 × (1 + 넓어지는 거리 1.1 + 붙잡아 두는 거리 0.3)임.
  // 처음 촬영 영역의 폭은 CSS 변수로 넘겨 인용문 최대 폭 계산에 씀. 잰 창 너비는 lastWidth에 적어 둠.
  function measure() {
    stageWidth = parts.section.clientWidth;
    stageHeight = window.innerHeight;
    lastWidth = window.innerWidth;
    frame = frameSize(stageWidth, stageHeight);
    parts.stage.style.height = stageHeight + 'px';
    parts.section.style.height = stageHeight * (1 + SETTINGS.scrollDistance + SETTINGS.holdDistance) + 'px';
    parts.stage.style.setProperty('--intro-frame-width', frame.width + 'px');
  }

  // readProgress(): 트랙의 위쪽 끝이 화면 위로 올라간 거리를 넓어지는 거리로 나눠 0~1 진행도로 바꿈.
  function readProgress() {
    const top = parts.section.getBoundingClientRect().top;
    return clamp(-top / (stageHeight * SETTINGS.scrollDistance), 0, 1);
  }

  // applyProgress(): 진행도 p를 받아 모든 요소의 모양을 한 번에 바꿈. 원본의 핵심 계산임.
  // e는 smoothstep으로 부드럽게 만든 진행도임. 처음과 끝에서 천천히 움직임.
  function applyProgress(p) {
    const e = smoothstep(0, 1, p);
    // inset: 무대 가장자리에서 촬영 영역까지의 거리임. e가 1이 되면 0이 되어 화면 전체가 보임.
    const insetX = (stageWidth - frame.width) / 2 * (1 - e);
    const insetY = (stageHeight - frame.height) / 2 * (1 - e);
    const radius = SETTINGS.startRadius * (1 - e);
    parts.frame.style.clipPath = 'inset(' + insetY + 'px ' + insetX + 'px round ' + radius + 'px)';
    // 뷰파인더 표시도 같은 inset을 써서 촬영 영역 가장자리에 붙은 채 바깥으로 밀려나고, 60% 즈음 사라짐.
    parts.hud.style.inset = insetY + 'px ' + insetX + 'px';
    parts.hud.style.opacity = 1 - smoothstep(0.3, 0.6, p);

    // 초점 맞추기: 흐림은 20%부터 90%까지 줄어 0이 되고, 흑백은 15%부터 조금씩 색이 돌아옴.
    // 글자가 먼저 빠진 뒤에 초점이 맞도록(카메라의 rack focus) 흐림을 글자보다 늦게 걷어 냄.
    // 움직임 줄이기 설정이면 화면 전체가 커졌다 작아지는 확대(zoom)를 끄고 1배로 고정함.
    // 흐림·흑백은 위치가 움직이는 변화가 아니므로 그대로 둠(글자 뒤 배경이 흐려야 인용문이 잘 읽힘).
    // 흐림이 거의 없으면 blur()를 빼서 브라우저가 불필요한 흐림 계산을 하지 않게 함.
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
    // 포스터 벽은 1.2배에서 1배로 줄어듦. 어두운 막은 글자가 거의 사라진 55% 이후에 밝아짐.
    parts.wall.style.transform = 'scale(' + (zoom + (1 - zoom) * e) + ')';
    parts.scrim.style.opacity = SETTINGS.scrimStart + (SETTINGS.scrimEnd - SETTINGS.scrimStart) * smoothstep(0.55, 1, p);

    // 로고와 인용문은 35%~70% 사이에 위로 28px 올라가며 사라짐. 포스터 초점이 맞기 전에 먼저 빠짐.
    // 반쯤 사라진 글자가 또렷한 포스터 위에 겹쳐 지저분해 보이는 구간을 줄이려는 순서임.
    // 이동 거리를 정수 px로 반올림해야 점으로 된 로고가 흐려지지 않음.
    // 거의 사라지면 pointer-events를 꺼서 보이지 않는 로고에 마우스가 반응하지 않게 함.
    const out = smoothstep(0.35, 0.7, p);
    parts.copy.style.opacity = 1 - out;
    parts.copy.style.transform = 'translate3d(0, ' + Math.round(-28 * out) + 'px, 0)';
    if (out > 0.98) {
      parts.copy.style.pointerEvents = 'none';
    } else {
      parts.copy.style.pointerEvents = '';
    }

    // 스크롤 안내는 가장 먼저(12%까지) 아래로 살짝 내려가며 사라짐.
    const gone = smoothstep(0, 0.12, p);
    parts.hint.style.opacity = 1 - gone;
    parts.hint.style.transform = 'translate3d(0, ' + 8 * gone + 'px, 0)';
  }

  // tick(): 프레임마다 current를 target 쪽으로 옮김(지수 함수 방식의 부드러운 따라가기).
  // 옮기는 비율은 지난 프레임부터 흐른 시간 dt(초)로 계산함: 1 - e^(-dt / smoothing).
  // 프레임 수가 아니라 시간 기준이라 120Hz 화면에서도 60Hz 화면과 같은 빠르기로 따라감.
  // dt는 0.05초를 넘지 않게 잘라, 오래 멈췄다가 다시 시작할 때 한 번에 크게 튀지 않게 함.
  // 차이가 0.0004보다 작아지면 같은 값으로 맞추고 더 이상 프레임을 요청하지 않음.
  // 이때 lastTime을 0으로 돌려, 다음에 다시 시작할 때 오래된 시각으로 dt를 계산하지 않게 함.
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

  // handleScroll(): 스크롤할 때마다 목표 진행도를 다시 계산함.
  // 움직임 줄이기 설정이면 부드럽게 따라가지 않고 바로 적용함.
  // 이미 목표와 같으면(소개 화면을 다 지나 아래 본문을 보는 중 등) 아무것도 하지 않음.
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

  // remeasure(): 크기를 다시 재고 현재 스크롤 위치에 맞춰 바로 다시 그림(부드럽게 따라가지 않음).
  // 처음 화면에 넣을 때와 움직임 줄이기 설정이 바뀔 때도 씀.
  function remeasure() {
    measure();
    target = readProgress();
    current = target;
    applyProgress(current);
  }

  // handleResize(): 화면 크기가 바뀌면 remeasure()를 부름.
  // 휴대폰에서 스크롤하면 주소창이 숨거나 나타나면서 창 높이만 조금 바뀌는데, 그때마다 다시 재면
  // 촬영 영역이 갑자기 수십 px 튐. 그래서 터치 화면에서 너비가 그대로이고 높이 차이가 160px 미만이면 무시함.
  // 화면을 돌리거나(너비가 바뀜) 데스크톱에서 창 크기를 바꾸면 그대로 다시 잼.
  function handleResize() {
    const toolbarOnly = touchQuery.matches && window.innerWidth === lastWidth && Math.abs(window.innerHeight - stageHeight) < 160;
    if (!toolbarOnly) {
      remeasure();
    }
  }

  // showTimecode(): 오른쪽 위 타임코드 글자를 페이지가 열린 뒤 지난 시간으로 바꿈.
  function showTimecode() {
    parts.timecode.textContent = formatTimecode(performance.now());
  }

  // updateRunning(): 소개 화면이 보이고 탭이 열려 있을 때만 움직임을 켬.
  // 안 보일 때는 intro-paused 클래스로 CSS 애니메이션(필름 입자, 포스터 흐름, REC 깜빡임)을 멈추고 타임코드도 멈춤.
  // 움직임 줄이기 설정이면 타임코드를 00:00:00:00에 멈춰 둠.
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

  // handleIntersect(): IntersectionObserver가 소개 화면이 보이기 시작하거나 사라질 때 호출함.
  function handleIntersect(entries) {
    for (const entry of entries) {
      onScreen = entry.isIntersecting;
    }
    updateRunning();
  }

  // handleMotionChange(): 사용자가 움직임 줄이기 설정을 바꾸면 바로 반영함.
  function handleMotionChange() {
    updateRunning();
    remeasure();
  }

  // handleSkip(): 건너뛰기 버튼을 누르면 메뉴(#sidebar)가 화면 맨 위에 오도록 스크롤함.
  // 키보드·화면 읽기 프로그램 사용자를 위해 본문(#app)으로 초점을 옮기되, 초점 이동 때문에 다시 스크롤되지 않게 함.
  function handleSkip() {
    sidebar.scrollIntoView({ block: 'start' });
    const app = document.querySelector('#app');
    if (app !== null) {
      app.focus({ preventScroll: true });
    }
  }

  // 소개 화면을 #sidebar 바로 앞(본문으로 바로가기 링크 다음)에 넣고 처음 상태를 그림.
  sidebar.before(parts.section);
  remeasure();
  updateRunning();
  fillWall(parts.wall);
  mountLogo(parts.word, parts.layer);

  // passive: true는 스크롤 이벤트에서 기본 동작을 막지 않는다는 약속임. 브라우저가 스크롤을 더 부드럽게 처리함.
  // rootMargin -1px: 소개 화면의 아래 끝이 화면 위 끝에 딱 닿은 상태도 안 보이는 것으로 처리함.
  // 소개 화면은 페이지가 열려 있는 동안 계속 남아 있으므로 이벤트 연결을 따로 끊지 않음.
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', handleResize);
  document.addEventListener('visibilitychange', updateRunning);
  motionQuery.addEventListener('change', handleMotionChange);
  parts.skip.addEventListener('click', handleSkip);
  new IntersectionObserver(handleIntersect, { rootMargin: '-1px 0px' }).observe(parts.section);
}

// 모듈이 실행되면 바로 소개 화면을 준비함.
mountIntro();
