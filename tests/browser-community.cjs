// 격리된 로컬 테스트 서버에서 공개 범위와 영화 상세 화면을 확인하는 검사입니다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:58803';
if (!['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('로컬 테스트 서버만 허용합니다.');
const output = path.resolve(__dirname, '..', 'test-results');
fs.mkdirSync(output, { recursive: true });
const report = { checks: [], errors: [] };
let browser;
async function check(name, run) {
  await run();
  report.checks.push(name);
  console.log('PASS ' + name);
}
async function api(context, route, method = 'GET', data) {
  const headers = {};
  if (method !== 'GET') {
    const session = await context.request.get(baseURL + '/api/session');
    headers['X-CSRF-Token'] = (await session.json()).csrf_token;
  }
  const response = await context.request.fetch(baseURL + route, { method, data, headers });
  assert.ok(response.ok(), `${route}: ${response.status()} ${await response.text()}`);
  return response.json();
}
async function visit(page, route = 'movie.html?id=m001') {
  await page.goto(baseURL + '/' + route);
  await page.locator('#app h1').first().waitFor();
  if (route.startsWith('movie.html')) await page.waitForFunction(() => !document.querySelector('#community-summary')?.textContent.includes('불러오는 중'));
}
async function waitOwn(page, text) {
  await page.locator('.log-card').filter({ hasText: text }).waitFor();
  await page.waitForFunction(() => !document.querySelector('#watch-submit')?.disabled);
}
(async () => {
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const a = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR' });
    const b = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR' });
    const pa = await a.newPage();
    const pb = await b.newPage();
    for (const page of [pa, pb]) page.on('pageerror', error => report.errors.push(error.message));
    const suffix = Date.now().toString(36);
    for (const [context, name] of [[a, 'a'], [b, 'b']]) await api(context, '/api/register', 'POST', {
      username: `community_${name}_${suffix}`, display_name: name === 'a' ? '공개 작성자' : '열람 사용자', password: 'community-test-pass-2026'
    });
    const privateText = '나만 보는 감상평_' + suffix;
    const publicText = '<img src=x onerror="window.communityXSS=1"> 함께 보는 관람평_' + suffix;
    await check('기본 비공개 저장과 타인의 개인 기록 분리', async () => {
      await visit(pa);
      assert.equal(await pa.locator('#review-public').isChecked(), false);
      await pa.locator('#rating').selectOption('2');
      await pa.locator('#review-text').fill(privateText);
      await pa.locator('#watch-submit').click();
      await waitOwn(pa, privateText);
      const own = (await api(a, '/api/snapshot')).logs;
      assert.equal(own[0].is_public, false);
      await visit(pb);
      assert.equal(await pb.locator('.community-review').count(), 0);
      assert.ok(!(await pb.locator('#app').innerText()).includes(privateText));
      assert.equal((await api(b, '/api/snapshot')).logs.length, 0);
      assert.match(await pb.locator('#community-summary').innerText(), /2\.0/);
    });
    await check('공개 선택 글과 사용자당 최근 별점 하나만 공유', async () => {
      await pa.locator('#rating').selectOption('4');
      await pa.locator('#review-text').fill(publicText);
      await pa.locator('#review-public').check();
      await pa.locator('#watch-submit').click();
      await waitOwn(pa, publicText);
      assert.equal(await pa.locator('#review-public').isChecked(), false);
      assert.equal(await pa.locator('.community-review').count(), 0);
      await visit(pb);
      assert.equal(await pb.locator('.community-review').count(), 1);
      assert.match(await pb.locator('#community-summary').innerText(), /4\.0[\s\S]*1명/);
      assert.equal(await pb.locator('.community-review img').count(), 0);
      assert.equal(await pb.evaluate(() => window.communityXSS), undefined);
      assert.ok((await pb.locator('.community-review').innerText()).includes(publicText));
      await pb.locator('#rating').selectOption('2');
      await pb.locator('#review-text').fill('열람 사용자의 개인 기록');
      await pb.locator('#watch-submit').click();
      await waitOwn(pb, '열람 사용자의 개인 기록');
      await pb.waitForFunction(() => /3\.0[\s\S]*2명/.test(document.querySelector('#community-summary')?.textContent));
    });
    await check('공개 해제와 재공개 후 삭제가 타인 화면에 반영', async () => {
      const card = pa.locator('.log-card').filter({ hasText: publicText });
      await card.getByRole('button', { name: '수정', exact: true }).click();
      await pa.getByRole('button', { name: '수정 취소', exact: true }).waitFor();
      assert.equal(await pa.locator('#review-public').isChecked(), true);
      await pa.locator('#review-public').uncheck();
      await pa.locator('#watch-submit').click();
      await waitOwn(pa, publicText);
      await visit(pb);
      assert.equal(await pb.locator('.community-review').count(), 0);
      await card.getByRole('button', { name: '수정', exact: true }).click();
      await pa.getByRole('button', { name: '수정 취소', exact: true }).waitFor();
      await pa.locator('#review-public').check();
      await pa.locator('#watch-submit').click();
      await waitOwn(pa, publicText);
      await visit(pb);
      assert.equal(await pb.locator('.community-review').count(), 1);
      pa.once('dialog', dialog => dialog.accept());
      await card.getByRole('button', { name: '삭제', exact: true }).click();
      await card.waitFor({ state: 'detached' });
      await visit(pb);
      assert.equal(await pb.locator('.community-review').count(), 0);
      assert.match(await pb.locator('#community-summary').innerText(), /2\.0[\s\S]*2명/);
    });
    await check('관람평 추가 전후 캘린더·통계·업적·사진 내용 동일', async () => {
      const pages = ['calendar.html', 'stats.html', 'achievements.html', 'archive.html'];
      const before = {};
      for (const route of pages) { await visit(pb, route); before[route] = await pb.locator('#app').innerText(); }
      for (let i = 0; i < 21; i++) await api(a, '/api/watch-logs', 'POST', {
        movie_id: 'm001', watched_on: '2026-11-13', rating: 4.5, review_text: `공개 관람평 ${i}`, is_public: true
      });
      for (const route of pages) { await visit(pb, route); assert.equal(await pb.locator('#app').innerText(), before[route]); }
      assert.equal((await api(b, '/api/snapshot')).logs.length, 1);
    });
    await check('20개씩 더 보기와 휴대폰 레이아웃', async () => {
      await visit(pb);
      assert.equal(await pb.locator('.community-review').count(), 20);
      await pb.getByRole('button', { name: '관람평 더 보기' }).click();
      await pb.waitForFunction(() => document.querySelectorAll('.community-review').length === 21);
      await pb.getByRole('button', { name: '관람평 더 보기' }).waitFor({ state: 'hidden' });
      await pb.evaluate(() => window.scrollTo(0, 0));
      await pb.screenshot({ path: path.join(output, 'community-desktop.png'), fullPage: false });
      await pb.setViewportSize({ width: 375, height: 812 });
      await visit(pb);
      assert.equal(await pb.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
      await pb.evaluate(() => window.scrollTo(0, 0));
      await pb.screenshot({ path: path.join(output, 'community-mobile.png') });
      await pb.locator('.review-visibility').screenshot({ path: path.join(output, 'community-visibility-mobile.png') });
    });
    await check('공유 영역 통신 실패 중 개인 기록 사용과 다시 불러오기', async () => {
      await pb.route('**/api/movies/m001/community*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '검사용 일시 오류입니다.' }) }));
      await visit(pb);
      await pb.getByRole('button', { name: '다시 불러오기' }).waitFor();
      assert.equal(await pb.locator('#watch-submit').isEnabled(), true);
      assert.equal(await pb.locator('.log-card').count(), 1);
      await pb.unroute('**/api/movies/m001/community*');
      await pb.getByRole('button', { name: '다시 불러오기' }).click();
      await pb.waitForFunction(() => document.querySelectorAll('.community-review').length === 20);
    });
    assert.deepEqual(report.errors, []);
  } catch (error) {
    report.failure = error.stack;
    console.error(error);
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(output, 'community-browser.json'), JSON.stringify(report, null, 2));
    if (browser) await browser.close();
  }
})();
