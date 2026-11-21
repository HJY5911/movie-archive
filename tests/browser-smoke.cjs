/* Run against an isolated test database, never against the presentation data.
 * BASE_URL=http://127.0.0.1:58802 node tests/browser-smoke.cjs
 * PLAYWRIGHT_MODULE may point to an installed Playwright package.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:58802';
const output = path.resolve(__dirname, '..', 'test-results');
fs.mkdirSync(output, { recursive: true });
const suffix = Date.now().toString(36);
const userA = { username: `qa_a_${suffix}`, display_name: '검증 계정 A', password: `A_${suffix}_test_29!` };
const userB = { username: `qa_b_${suffix}`, display_name: '검증 계정 B', password: `B_${suffix}_test_73!` };
const report = { baseURL, startedAt: new Date().toISOString(), checks: [], pageErrors: [], localFailures: [], externalFailures: [] };
let browser;

async function check(name, operation) {
  const started = Date.now();
  try {
    const details = await operation();
    report.checks.push({ name, passed: true, elapsedMs: Date.now() - started, ...(details ? { details } : {}) });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, passed: false, elapsedMs: Date.now() - started, error: error.stack || String(error) });
    throw error;
  }
}

async function newContext(viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, locale: 'ko-KR', reducedMotion: 'reduce' });
  context.on('page', page => {
    page.on('pageerror', error => report.pageErrors.push({ url: page.url(), message: error.message }));
    page.on('response', response => {
      if (response.status() >= 500 && response.url().startsWith(baseURL)) {
        report.localFailures.push({ url: response.url(), status: response.status() });
      }
    });
    page.on('requestfailed', request => {
      const item = { url: request.url(), message: request.failure()?.errorText };
      if (item.message?.includes('ERR_ABORTED')) return;
      (request.url().startsWith(baseURL) ? report.localFailures : report.externalFailures).push(item);
    });
  });
  return context;
}

async function api(context, url, method = 'GET', body) {
  const headers = {};
  if (method !== 'GET') {
    const session = await context.request.get(`${baseURL}/api/session`);
    assert.equal(session.status(), 200);
    headers['X-CSRF-Token'] = (await session.json()).csrf_token;
  }
  const response = await context.request.fetch(`${baseURL}${url}`, { method, headers, data: body });
  assert.ok(response.ok(), `${method} ${url}: ${response.status()} ${await response.text()}`);
  return response.json();
}

async function snapshot(context) { return api(context, '/api/snapshot'); }

async function waitLogs(page, count) {
  await page.waitForFunction(async expected => {
    const result = await fetch('/api/snapshot', { cache: 'no-store' });
    return result.ok && (await result.json()).logs.length === expected;
  }, count, { timeout: 15000 });
}

async function visit(page, filename) {
  await page.goto(`${baseURL}/${filename}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#app h1').first().waitFor({ state: 'visible', timeout: 15000 });
  const title = await page.locator('#app h1').first().innerText();
  assert.notEqual(title, '페이지를 불러올 수 없습니다', await page.locator('#app').innerText());
  if (await page.locator('.intro-skip').isVisible().catch(() => false)) {
    await page.locator('.intro-skip').click();
  }
  return title;
}

async function loginUI(page, user) {
  await page.goto(`${baseURL}/login.html?next=%2Findex.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-form').waitFor();
  await page.locator('#login-form [name="username"]').fill(user.username);
  await page.locator('#login-form [name="password"]').fill(user.password);
  await page.locator('#login-form button[type="submit"]').click();
  await page.waitForURL('**/index.html', { timeout: 15000 });
  await page.locator('#app h1').first().waitFor();
}

async function capture(page, name) {
  if (name === 'home-desktop') {
    await page.locator('.main-wrap').screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
  } else {
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' });
  }
}

(async () => {
  try {
    try { browser = await chromium.launch({ headless: true }); }
    catch { browser = await chromium.launch({ channel: 'msedge', headless: true }); }
    const contextA = await newContext();
    const pageA = await contextA.newPage();

    await check('미로그인 사용자는 로그인 화면으로 이동', async () => {
      await pageA.goto(`${baseURL}/stats.html`, { waitUntil: 'domcontentloaded' });
      await pageA.waitForURL('**/login.html**', { timeout: 15000 });
      await pageA.locator('#login-form').waitFor();
      await capture(pageA, 'login-desktop');
    });

    await check('실제 회원가입 화면에서 A 계정 생성', async () => {
      const registration = pageA.locator('#register-form');
      if (!(await registration.isVisible())) await pageA.locator('#register-tab').click();
      await registration.locator('[name="username"]').fill(userA.username);
      await registration.locator('[name="display_name"]').fill(userA.display_name);
      await registration.locator('[name="password"]').fill(userA.password);
      const confirm = registration.locator('[name="password_confirm"]');
      if (await confirm.count()) await confirm.fill(userA.password);
      await registration.locator('button[type="submit"]').click();
      await pageA.waitForURL('**/stats.html', { timeout: 15000 });
      await pageA.getByRole('heading', { name: '감상 통계', exact: true }).waitFor();
      const current = await snapshot(contextA);
      assert.equal(current.profile.display_name, userA.display_name);
      assert.equal(current.logs.length, 0);
    });

    await check('기존 예시 기록 버튼이 서버에 6개를 저장하고 요약을 갱신', async () => {
      await visit(pageA, 'index.html');
      await pageA.getByRole('button', { name: '예시 감상 기록 6개 넣어보기', exact: true }).click();
      await waitLogs(pageA, 6);
      await pageA.locator('.index-shelf a[href="calendar.html"]').waitFor();
      await pageA.waitForFunction(() => document.querySelector('.stat-grid')?.textContent.includes('667'));
      assert.match(await pageA.locator('.stat-grid').innerText(), /667/);
      const current = await snapshot(contextA);
      assert.equal(new Set(current.logs.map(row => row.movie_id)).size, 5);
      assert.equal(current.logs.filter(row => row.rating === null).length, 1);
      await capture(pageA, 'home-desktop');
      return { logs: current.logs.length, movies: 5, runtimeMinutes: 667 };
    });

    await check('통계·업적을 포함한 기존 9개 페이지 렌더링', async () => {
      const rendered = {};
      for (const filename of ['index.html', 'movies.html', 'movie.html?id=m001', 'calendar.html', 'map.html', 'series.html', 'stats.html', 'achievements.html', 'archive.html']) {
        rendered[filename] = await visit(pageA, filename);
        if (filename === 'stats.html') {
          assert.match(await pageA.locator('.stats-summary').innerText(), /3\.5/);
          assert.match(await pageA.locator('.stats-summary').innerText(), /11\s*시간\s*7\s*분/);
          await capture(pageA, 'stats-desktop');
        }
        if (filename === 'achievements.html') {
          assert.match(await pageA.locator('.achievements-overview-count').innerText(), /7개 중\s*5개\s*달성/);
          await pageA.locator('#achievements-filter-achieved').click();
          assert.equal(await pageA.locator('.achievements-card').count(), 5);
          await pageA.locator('#achievements-filter-all').click();
          await capture(pageA, 'achievements-desktop');
        }
      }
      return rendered;
    });

    await check('기존 상세 화면에서 감상 기록 추가·수정·삭제', async () => {
      await visit(pageA, 'movie.html?id=m001');
      await pageA.locator('#watched-on').fill('2026-11-13');
      await pageA.locator('#rating').selectOption('');
      await pageA.locator('#review-text').fill(`브라우저 추가 ${suffix}`);
      await pageA.locator('#watch-submit').click();
      await waitLogs(pageA, 7);
      const added = pageA.locator('.log-card').filter({ hasText: `브라우저 추가 ${suffix}` });
      await added.waitFor();
      await added.getByRole('button', { name: '수정', exact: true }).click();
      await pageA.getByRole('button', { name: '수정 취소', exact: true }).waitFor();
      await pageA.locator('#watched-on').fill('2026-10-20');
      await pageA.locator('#rating').selectOption('2.5');
      await pageA.locator('#review-text').fill(`브라우저 수정 ${suffix}`);
      await pageA.locator('#watch-submit').click();
      const updated = pageA.locator('.log-card').filter({ hasText: `브라우저 수정 ${suffix}` });
      await updated.waitFor();
      assert.match(await updated.innerText(), /2026-10-20/);
      const row = (await snapshot(contextA)).logs.find(log => log.review_text === `브라우저 수정 ${suffix}`);
      assert.equal(row.rating, 2.5);
      assert.equal(row.version, 2);
      pageA.once('dialog', dialog => dialog.accept());
      await updated.getByRole('button', { name: '삭제', exact: true }).click();
      await waitLogs(pageA, 6);
      await updated.waitFor({ state: 'detached' });
    });

    const contextB = await newContext();
    await check('B 계정은 A 계정의 감상 기록을 볼 수 없음', async () => {
      await api(contextB, '/api/register', 'POST', userB);
      assert.equal((await snapshot(contextB)).logs.length, 0);
      assert.equal((await snapshot(contextA)).logs.length, 6);
      const foreignId = (await snapshot(contextA)).logs[0].log_id;
      const sessionB = await api(contextB, '/api/session');
      const response = await contextB.request.delete(`${baseURL}/api/watch-logs/${foreignId}`, {
        headers: { 'X-CSRF-Token': sessionB.csrf_token }, data: { expected_version: 1 }
      });
      assert.equal(response.status(), 404);
    });

    const contextA2 = await newContext();
    const pageA2 = await contextA2.newPage();
    await check('새 브라우저에서 로그인 UI를 통해 같은 계정 기록 조회', async () => {
      await loginUI(pageA2, userA);
      assert.equal((await snapshot(contextA2)).logs.length, 6);
    });

    let photoId;
    await check('사진은 원본 형식으로 저장·조회되며 서버로 전송되지 않음', async () => {
      await visit(pageA, 'archive.html');
      const mediaRequests = [];
      const listener = request => {
        if (['POST', 'PUT', 'PATCH'].includes(request.method()) && request.url().startsWith(baseURL)) mediaRequests.push(request.url());
      };
      pageA.on('request', listener);
      const photo = await pageA.evaluate(async () => {
        const repository = await import('/js/repository.js');
        const repo = await repository.openRepository();
        const catalog = await repository.loadCatalog();
        const canvas = document.createElement('canvas');
        canvas.width = 3; canvas.height = 3;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffbf00'; ctx.fillRect(0, 0, 3, 3);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const file = new File([blob], '검증용 티켓.png', { type: 'image/png' });
        const id = await repository.manageMedia(repo, catalog, 'add', { movie_id: 'm001', kind: 'ticket', file });
        const read = await repository.manageMedia(repo, catalog, 'read', { asset_id: id });
        const result = await repository.readSnapshot(repo);
        return { id, count: result.assets.length, type: read.type, bytes: read.size, sentBytes: file.size };
      });
      pageA.off('request', listener);
      photoId = photo.id;
      assert.equal(photo.count, 1);
      assert.equal(photo.type, 'image/png');
      assert.equal(photo.bytes, photo.sentBytes);
      assert.deepEqual(mediaRequests, []);
      await pageA.reload({ waitUntil: 'domcontentloaded' });
      await pageA.locator('#app h1').first().waitFor();
      assert.ok((await pageA.locator('#app').innerText()).includes('기생충'));
      return { localPhotoCount: photo.count, bytes: photo.bytes };
    });

    await check('같은 계정이어도 다른 브라우저에는 로컬 사진이 없음', async () => {
      await visit(pageA2, 'archive.html');
      const count = await pageA2.evaluate(async () => {
        const r = await import('/js/repository.js');
        return (await r.readSnapshot(await r.openRepository())).assets.length;
      });
      assert.equal(count, 0);
    });

    await check('휴대폰 폭에서 로그인·통계·업적 레이아웃 확인', async () => {
      const mobile = await newContext({ width: 390, height: 844 });
      const mobilePage = await mobile.newPage();
      await mobilePage.goto(`${baseURL}/login.html`);
      await mobilePage.locator('#login-form').waitFor();
      await capture(mobilePage, 'login-mobile');
      await api(mobile, '/api/login', 'POST', userA);
      for (const filename of ['stats.html', 'achievements.html']) {
        await visit(mobilePage, filename);
        const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
        assert.equal(overflow, false, `${filename} has horizontal overflow`);
        await capture(mobilePage, filename.replace('.html', '-mobile'));
      }
      await mobile.close();
    });

    await check('같은 브라우저의 로그아웃·계정 전환이 다른 탭에도 반영', async () => {
      await visit(pageA, 'stats.html');
      const otherTab = await contextA.newPage();
      await visit(otherTab, 'movie.html?id=m001');
      const stale = await api(contextA, '/api/session');
      await pageA.locator('#account-controls button').click();
      await pageA.waitForURL('**/login.html**');
      await otherTab.waitForURL('**/login.html**');
      assert.equal(await otherTab.locator('#review-text').count(), 0);
      await loginUI(pageA, userB);
      await visit(pageA, 'archive.html');
      const count = await pageA.evaluate(async () => {
        const r = await import('/js/repository.js');
        return (await r.readSnapshot(await r.openRepository())).assets.length;
      });
      assert.equal(count, 0, 'B must not see A local photos');
      assert.equal((await snapshot(contextA)).logs.length, 0);
      const staleWrite = await contextA.request.post(`${baseURL}/api/watch-logs`, {
        headers: { 'X-CSRF-Token': stale.csrf_token, 'X-Profile-Id': stale.profile.profile_id },
        data: { movie_id: 'm001', watched_on: '2026-11-13', rating: 5 }
      });
      assert.ok([403, 409].includes(staleWrite.status()));
      assert.equal((await snapshot(contextA)).logs.length, 0);
      await otherTab.close();
    });

    await check('A 계정 재로그인 후 사진을 삭제하고 감상 기록은 유지', async () => {
      await pageA.locator('#account-controls button').click();
      await pageA.waitForURL('**/login.html**');
      await loginUI(pageA, userA);
      const count = await pageA.evaluate(async id => {
        const r = await import('/js/repository.js');
        const repo = await r.openRepository();
        await r.manageMedia(repo, await r.loadCatalog(), 'delete', { asset_id: id });
        return (await r.readSnapshot(repo)).assets.length;
      }, photoId);
      assert.equal(count, 0);
      assert.equal((await snapshot(contextA)).logs.length, 6);
    });

    await check('계정 화면을 지운 뒤 늦게 끝난 렌더가 개인 정보를 다시 노출하지 않음', async () => {
      const racePage = await contextA2.newPage();
      await visit(racePage, 'stats.html');
      const state = await racePage.evaluate(async () => {
        const { clearPrivateScreen } = await import('/js/server-session.js');
        const app = document.querySelector('#app');
        // 화면을 지우는 순간 이미 진행 중이던 응답이 다음 작업에서 렌더되는 상황입니다.
        const lateRender = new Promise(resolve => setTimeout(() => {
          const button = document.createElement('button');
          button.id = 'late-private-record';
          button.textContent = '이전 계정의 개인 기록';
          app.replaceChildren(button);
          button.focus();
          resolve();
        }, 0));
        clearPrivateScreen();
        await lateRender;
        return {
          contentWasAppended: app.textContent.includes('이전 계정의 개인 기록'),
          visible: app.getClientRects().length > 0 && getComputedStyle(app).display !== 'none',
          oldRecordFocused: document.activeElement?.id === 'late-private-record',
          accountControlsRemain: Boolean(document.querySelector('#account-controls'))
        };
      });
      assert.equal(state.contentWasAppended, true, '늦은 렌더 자체가 실행되어야 합니다.');
      assert.equal(state.visible, false, '늦은 렌더 결과는 보이면 안 됩니다.');
      assert.equal(state.oldRecordFocused, false, '이전 계정의 컨트롤은 키보드 포커스를 받으면 안 됩니다.');
      assert.equal(state.accountControlsRemain, false);
      assert.equal(await racePage.locator('#late-private-record').isVisible(), false);
      await racePage.close();
      return state;
    });

    await check('로컬 자바스크립트 오류와 서버 오류 없음', async () => {
      assert.deepEqual(report.pageErrors, []);
      assert.deepEqual(report.localFailures, []);
      return { externalFailureCount: report.externalFailures.length };
    });
  } catch (error) {
    report.error = error.stack || String(error);
    process.exitCode = 1;
    console.error(report.error);
  } finally {
    if (browser) {
      if (report.error) {
        let i = 0;
        for (const context of browser.contexts()) for (const page of context.pages()) {
          await capture(page, `failure-${++i}`).catch(() => {});
        }
      }
      await browser.close();
    }
    report.finishedAt = new Date().toISOString();
    report.passed = !report.error;
    fs.writeFileSync(path.join(output, 'browser-smoke.json'), JSON.stringify(report, null, 2));
    console.log(`Report: ${path.join(output, 'browser-smoke.json')}`);
  }
})();
