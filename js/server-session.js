// 서버 연결과 계정 UI는 새 모듈에 모아 기존 페이지 파일을 그대로 사용합니다.
const SESSION_CHANNEL = 'filmlog-server-session';
const SESSION_EVENT_KEY = 'filmlog-server-session-event';
const RETURN_PAGES = new Set(['/', '/index.html', '/movies.html', '/movie.html', '/calendar.html', '/map.html', '/series.html', '/stats.html', '/achievements.html', '/archive.html']);
let watchedProfileId;
let watcherStarted = false;
let navigationStarted = false;
let sessionChannel;

export function safeReturnPath(value) {
  try {
    const url = new URL(value || '/index.html', location.origin);
    if (url.origin === location.origin && RETURN_PAGES.has(url.pathname)) {
      return url.pathname + url.search + url.hash;
    }
  } catch { /* 잘못된 주소는 메인 화면으로 돌려보냅니다. */ }
  return '/index.html';
}

export async function apiRequest(path, { method = 'GET', body, csrfToken, profileId } = {}) {
  if (typeof path !== 'string' || !path.startsWith('/api/')) throw new Error('서버 요청 주소를 확인해 주세요.');
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin) throw new Error('같은 사이트의 서버에만 요청할 수 있습니다.');
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  if (profileId) headers['X-Profile-Id'] = profileId;
  let response;
  try {
    response = await fetch(url, {
      method, headers, credentials: 'same-origin', cache: 'no-store',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  } catch {
    throw new Error('서버에 연결하지 못했습니다. 인터넷 연결과 서버 실행 상태를 확인해 주세요.');
  }
  let data;
  try { data = await response.json(); }
  catch {
    const error = new Error('서버 응답을 읽지 못했습니다. 실행 안내의 서버 주소로 접속했는지 확인해 주세요.');
    error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(data.error || '요청을 처리하지 못했습니다. 다시 시도해 주세요.');
    error.status = response.status;
    error.code = data.code;
    error.fields = data.fields;
    throw error;
  }
  return data;
}

export function clearPrivateScreen() {
  const app = document.querySelector('#app');
  if (app) {
    // 진행 중인 기존 페이지의 비동기 렌더가 뒤늦게 내용을 다시 붙여도 감춥니다.
    // 계정 무효화 후에는 새 문서를 열 때만 이 잠금이 해제됩니다.
    app.hidden = true;
    app.inert = true;
    app.style.setProperty('display', 'none', 'important');
    app.replaceChildren();
    app.setAttribute('aria-busy', 'true');
  }
  document.querySelector('#account-controls')?.remove();
}

export function requireLogin(next = location.pathname + location.search) {
  if (navigationStarted) return;
  navigationStarted = true;
  clearPrivateScreen();
  location.replace('/login.html?next=' + encodeURIComponent(safeReturnPath(next)));
}

export function notifySessionChange(profileId) {
  const event = { type: 'session-changed', profile_id: profileId || null, time: Date.now() };
  try {
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.postMessage(event);
    channel.close();
  } catch { /* 지원하지 않는 브라우저는 storage 이벤트를 사용합니다. */ }
  try { localStorage.setItem(SESSION_EVENT_KEY, JSON.stringify(event)); }
  catch { /* 저장소가 차단되어도 서버의 계정 검증은 계속 적용됩니다. */ }
}

export function watchSession(profileId) {
  watchedProfileId = profileId;
  if (watcherStarted) return;
  watcherStarted = true;
  const receive = event => {
    if (navigationStarted || event?.type !== 'session-changed') return;
    // 같은 계정으로 다시 로그인해도 CSRF 토큰이 교체되므로 화면을 다시 읽습니다.
    clearPrivateScreen();
    if (!event.profile_id) requireLogin();
    else {
      navigationStarted = true;
      location.reload();
    }
  };
  try {
    sessionChannel = new BroadcastChannel(SESSION_CHANNEL);
    sessionChannel.addEventListener('message', event => receive(event.data));
  } catch { /* storage 이벤트와 서버 검증으로 보완합니다. */ }
  addEventListener('storage', event => {
    if (event.key !== SESSION_EVENT_KEY || !event.newValue) return;
    try { receive(JSON.parse(event.newValue)); } catch { /* 다른 값은 무시합니다. */ }
  });
  // 브라우저 뒤로 가기 캐시에 남은 다른 계정의 화면이 다시 표시되지 않게 확인합니다.
  addEventListener('pageshow', async event => {
    if (!event.persisted || navigationStarted) return;
    clearPrivateScreen();
    try {
      const session = await apiRequest('/api/session');
      if (!session.profile || session.profile.profile_id !== watchedProfileId) requireLogin();
      else { navigationStarted = true; location.reload(); }
    } catch { requireLogin(); }
  });
}

function loadAccountStyles() {
  if (document.querySelector('link[data-account-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/account.css';
  link.dataset.accountStyles = '';
  document.head.append(link);
}

export function mountAccountBar(session) {
  if (!session?.profile) return;
  const topbar = document.querySelector('#topbar');
  if (!topbar) return;
  loadAccountStyles();
  const storageLabel = topbar.querySelector(':scope > p');
  if (storageLabel) storageLabel.textContent = '감상 기록: 계정에 저장 · 사진: 현재 브라우저에 저장';
  document.querySelector('#account-controls')?.remove();
  const controls = document.createElement('div');
  controls.id = 'account-controls';
  controls.className = 'account-controls';
  const name = document.createElement('span');
  name.className = 'account-name';
  name.textContent = session.profile.display_name + '님';
  const logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'btn btn-link';
  logout.textContent = '로그아웃 / 계정 변경';
  const status = document.createElement('span');
  status.className = 'account-bar-status';
  status.setAttribute('role', 'alert');
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    status.textContent = '';
    try {
      await apiRequest('/api/logout', {
        method: 'POST', body: {}, csrfToken: session.csrf_token, profileId: session.profile.profile_id
      });
      notifySessionChange(null);
      requireLogin();
    } catch (error) {
      if (error.status === 401) { notifySessionChange(null); requireLogin(); return; }
      if (error.code === 'account_changed') { clearPrivateScreen(); location.reload(); return; }
      status.textContent = error.message;
      logout.disabled = false;
    }
  });
  controls.append(name, logout, status);
  topbar.append(controls);
}
