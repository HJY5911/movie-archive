import { apiRequest, notifySessionChange, safeReturnPath } from './server-session.js';

const next = safeReturnPath(new URLSearchParams(location.search).get('next'));
const forms = document.querySelector('#auth-forms');
const loginForm = document.querySelector('#login-form');
const registerForm = document.querySelector('#register-form');
const loginTab = document.querySelector('#login-tab');
const registerTab = document.querySelector('#register-tab');
const signedIn = document.querySelector('#signed-in');
const switchButton = document.querySelector('#switch-account');
const status = document.querySelector('#account-status');
const errorBox = document.querySelector('#account-error');
const retry = document.querySelector('#retry-session');
let session;
let busy = false;

document.querySelector('#continue-link').href = next;

function setBusy(value, message = '') {
  busy = value;
  forms.setAttribute('aria-busy', String(value));
  for (const fieldset of forms.querySelectorAll('fieldset')) fieldset.disabled = value || !session;
  loginTab.disabled = value;
  registerTab.disabled = value;
  switchButton.disabled = value;
  retry.disabled = value;
  status.textContent = message;
}

function showError(message = '') {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function showMode(register) {
  if (busy) return;
  loginForm.hidden = register;
  registerForm.hidden = !register;
  loginTab.setAttribute('aria-pressed', String(!register));
  registerTab.setAttribute('aria-pressed', String(register));
  document.querySelector('#account-title').textContent = register ? '나만의 영화 서랍 만들기' : '다시 만나 반가워요';
  document.querySelector('#account-subtitle').textContent = register ? '계정을 만들고 첫 감상 기록을 남겨 보세요.' : '내 계정으로 감상 기록을 이어가세요.';
  showError();
  document.querySelector(register ? '#register-username' : '#login-username').focus();
}

function renderSession() {
  const loggedIn = Boolean(session?.profile);
  forms.hidden = loggedIn;
  signedIn.hidden = !loggedIn;
  if (loggedIn) document.querySelector('#signed-in-name').textContent = session.profile.display_name + '님의 계정입니다.';
}

async function loadSession({ focus = true } = {}) {
  showError();
  retry.hidden = true;
  setBusy(true, '로그인 상태를 확인하는 중입니다.');
  try {
    session = await apiRequest('/api/session');
    renderSession();
    setBusy(false);
    if (focus && !session.profile) document.querySelector(loginForm.hidden ? '#register-username' : '#login-username').focus();
  } catch (error) {
    session = undefined;
    setBusy(false);
    showError(error.message);
    retry.hidden = false;
  }
}

async function submit(event, register) {
  event.preventDefault();
  if (busy || !session) return;
  const form = event.currentTarget;
  const values = new FormData(form);
  const payload = { username: String(values.get('username')).trim(), password: String(values.get('password')) };
  if (register) {
    payload.display_name = String(values.get('display_name')).trim();
    if (!payload.display_name) { showError('닉네임을 입력해 주세요.'); document.querySelector('#register-name').focus(); return; }
    if (payload.password !== values.get('password_confirm')) {
      showError('비밀번호 확인이 일치하지 않습니다.');
      document.querySelector('#register-confirm').focus();
      return;
    }
  }
  showError();
  setBusy(true, register ? '계정을 만드는 중입니다.' : '로그인하는 중입니다.');
  try {
    const result = await apiRequest(register ? '/api/register' : '/api/login', {
      method: 'POST', body: payload, csrfToken: session.csrf_token
    });
    notifySessionChange(result.profile.profile_id);
    location.replace(next);
  } catch (error) {
    let message = error.message;
    // 로그인 상태가 바뀌었을 때 토큰만 새로 읽고, 제출은 사용자가 다시 하도록 합니다.
    if (error.status === 403 || error.code === 'account_changed') {
      try {
        session = await apiRequest('/api/session');
        renderSession();
        message += ' 로그인 상태를 확인한 뒤 다시 시도해 주세요.';
      } catch { session = undefined; retry.hidden = false; }
    }
    setBusy(false);
    showError(message);
  }
}

loginTab.addEventListener('click', () => showMode(false));
registerTab.addEventListener('click', () => showMode(true));
loginForm.addEventListener('submit', event => submit(event, false));
registerForm.addEventListener('submit', event => submit(event, true));
retry.addEventListener('click', () => loadSession());
switchButton.addEventListener('click', async () => {
  if (busy || !session?.profile) return;
  showError();
  setBusy(true, '로그아웃하는 중입니다.');
  try {
    await apiRequest('/api/logout', {
      method: 'POST', body: {}, csrfToken: session.csrf_token, profileId: session.profile.profile_id
    });
    notifySessionChange(null);
    await loadSession();
  } catch (error) {
    if (error.status === 401 || error.status === 403 || error.code === 'account_changed') {
      await loadSession();
      showError('로그인 상태가 바뀌었습니다. 현재 계정을 확인해 주세요.');
    } else { setBusy(false); showError(error.message); }
  }
});

loadSession();
