// Requires Playwright: NODE_PATH=<directory containing node_modules> node --test tests/tracker.spec.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

test('standalone tracker: persistence, dates, records, backup and failure recovery', async () => {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', offline: true });
  const page = await context.newPage();
  const errors = [];
  const network = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
  const url = pathToFileURL(resolve(__dirname, '../gunpla_spend_tracker_editable_price.html')).href;
  const item = (id, overrides = {}) => ({ id, date: '2026-11-18', title: `건담 ${id}`, price: 50000, grade: 'HG', seller: '', memo: '', ...overrides });
  const readState = () => page.evaluate(() => JSON.parse(localStorage.getItem('gunpla_state_v1')));
  const importFile = async data => {
    await page.locator('#importFileInput').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)) });
  };
  try {
    await page.goto(url);
    await page.waitForFunction(() => ready);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => ready);
    // The 31st previously skipped February; local Korean time previously showed yesterday.
    await page.clock.install({ time: new Date('2026-01-30T23:30:00Z') });
    await page.evaluate(() => { currentDate = new Date(2026, 0, 31); changeMonth(1); });
    assert.equal(await page.locator('#calendar-month-year').innerText(), '2026년 2월');
    await page.getByRole('button', { name: '구매 기록 추가', exact: true }).click();
    assert.equal(await page.locator('#input-date').inputValue(), '2026-01-31');
    await page.locator('#input-date').fill('2026-02-01');
    await page.locator('#input-title').fill('PG <퍼스트>');
    await page.locator('#input-original-price').fill('100000');
    await page.locator('#input-discount-rate').fill('20');
    assert.equal(await page.locator('#input-price').inputValue(), '80000');
    await page.locator('#input-price').fill('75000');
    await page.getByRole('button', { name: '저장하기' }).click();
    assert.equal((await readState()).items[0].price, 75000);
    await page.reload();
    await page.waitForFunction(() => ready);
    assert.match(await page.locator('#recent-list').innerText(), /PG <퍼스트>/);
    await page.locator('#recent-list').getByRole('button', { name: '구매 기록 수정' }).click();
    assert.equal(await page.locator('#input-price').inputValue(), '75000');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#modal-item').isVisible(), false);

    let accept = true;
    page.on('dialog', dialog => accept && dialog.type() === 'confirm' ? dialog.accept() : dialog.dismiss());
    // Legacy backups, zero budget, pagination, and old record editing.
    const records = Array.from({ length: 25 }, (_, i) => item(String(i), { date: `2026-11-${String(i + 1).padStart(2, '0')}` }));
    await importFile({ items: records, budget: 0 });
    await page.waitForFunction(() => items.length === 25);
    assert.equal((await readState()).budget, 0);
    assert.equal(await page.locator('#recent-list > div').count(), 20);
    await page.locator('#load-more').click();
    assert.equal(await page.locator('#recent-list > div').count(), 25);
    await page.evaluate(() => { currentDate = new Date(2026, 10, 1); selectCalendarDate('2026-11-01'); renderDashboard(); });
    await page.locator('#calendar-detail-list').getByRole('button', { name: '구매 기록 수정' }).click();
    await page.locator('#input-title').fill('오래된 기록 수정');
    await page.getByRole('button', { name: '저장하기' }).click();
    assert.equal((await readState()).items.find(record => record.id === '0').title, '오래된 기록 수정');

    // Invalid imports and cancellation never mutate the saved state.
    const before = await readState();
    for (const data of [ '{broken', { items: [item('bad', { date: '2026-02-30' })], budget: 0 },
      { items: [item("x');alert(1);//")], budget: 0 }, { items: [item('a'), item('a')], budget: 0 },
      { items: [item('bad', { price: -1 })], budget: 0 }, { version: 2, items: [], budget: 0 } ]) {
      await importFile(data);
      await page.waitForFunction(() => !document.getElementById('importFileInput').value);
      assert.deepEqual(await readState(), before);
    }
    accept = false;
    await importFile({ items: [], budget: 200000 });
    await page.waitForFunction(() => !document.getElementById('importFileInput').value);
    assert.deepEqual(await readState(), before);
    accept = true;
    const downloadPromise = page.waitForEvent('download');
    await page.getByTitle('데이터 내보내기').click();
    const download = await downloadPromise;
    const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.deepEqual(exported, before);

    // All-period stats, actual over-budget percentage, mobile layout.
    await page.evaluate(async () => { await commitState(items, 100000); renderAll(); });
    assert.match(await page.locator('#budget-text').innerText(), /1250%/);
    assert.equal(await page.locator('#budget-warning').isVisible(), true);
    await page.locator('#tab-btn-stats').click();
    assert.equal(await page.locator('#top-kits-list > div').count(), 3);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

    // Quota errors retain both the form and the prior data, with no false success.
    await page.getByRole('button', { name: '구매 기록 추가', exact: true }).click();
    await page.locator('#input-title').fill('실패해야 하는 저장');
    await page.locator('#input-original-price').fill('10000');
    const beforeFailure = await readState();
    await page.evaluate(() => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
    await page.getByRole('button', { name: '저장하기' }).click();
    assert.equal(await page.locator('#modal-item').isVisible(), true);
    assert.deepEqual(await readState(), beforeFailure);
    assert.match(await page.locator('#toast-msg').innerText(), /저장하지 못했습니다/);
    await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
    await page.keyboard.press('Escape');

    // Existing localStorage keys migrate without losing manual prices.
    await page.evaluate(records => { localStorage.clear(); localStorage.setItem('gunpla_items', JSON.stringify(records)); localStorage.setItem('gunpla_budget', '0'); }, [item('legacy')]);
    await page.reload();
    await page.waitForFunction(() => ready);
    assert.match(await page.locator('#recent-list').innerText(), /건담 legacy/);
    await page.evaluate(() => commitState(items, monthlyBudget));
    assert.equal((await readState()).budget, 0);

    // Corrupt storage is preserved, normal writes blocked, valid backup repairs it.
    await page.evaluate(() => localStorage.setItem('gunpla_state_v1', '{corrupt'));
    await page.reload();
    await page.waitForFunction(() => ready);
    assert.equal(await page.locator('#storage-warning').isVisible(), true);
    assert.equal(await page.evaluate(() => commitState([], 0)), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('gunpla_state_v1')), '{corrupt');
    await importFile(exported);
    await page.waitForFunction(() => !document.getElementById('storage-warning').textContent);
    assert.deepEqual(await readState(), exported);
    // Cross-window changes synchronize and prevent stale edits.
    const second = await context.newPage();
    await second.goto(url);
    await second.evaluate(() => commitState(items, 12345));
    await page.waitForFunction(() => monthlyBudget === 12345);
    await second.close();
    // Deleting and clearing all records leaves charts in a healthy empty state.
    await page.locator('#recent-list').getByRole('button', { name: '구매 기록 삭제' }).first().click();
    assert.equal((await readState()).items.length, 24);
    await importFile({ items: [], budget: 0 });
    await page.waitForFunction(() => items.length === 0);
    await page.locator('#tab-btn-stats').click();
    assert.match(await page.locator('#top-kits-list').innerText(), /지출 내역이 없습니다/);
    assert.deepEqual(network, []);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await browser.close();
  }
});
