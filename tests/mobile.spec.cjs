const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

for (const platform of ['android', 'ios']) {
  test(`${platform}: packaged bridge, durable storage, export, import and save failures`, async () => {
    const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, offline: true });
    const calls = [];
    const errors = [];
    const stored = new Map();
    let failWrites = false;
    let failShare = false;
    await context.exposeBinding('nativeCall', async (_, plugin, method, options) => {
      calls.push({ plugin, method, options });
      if (plugin === 'Preferences' && method === 'get') return { value: stored.get(options.key) ?? null };
      if (plugin === 'Preferences' && method === 'set') {
        if (failWrites) throw new Error('Device storage unavailable');
        stored.set(options.key, options.value);
        return {};
      }
      if (plugin === 'Filesystem' && method === 'writeFile') return { uri: `file:///cache/${options.path}` };
      if (plugin === 'Share' && method === 'share' && failShare) throw new Error('Cancelled');
      return {};
    });
    await context.addInitScript(platform => {
      if (platform === 'android') window.androidBridge = {};
      else window.webkit = { messageHandlers: { bridge: {} } };
      window.Capacitor = {
        PluginHeaders: [
          { name: 'Preferences', methods: [{ name: 'get', rtype: 'promise' }, { name: 'set', rtype: 'promise' }] },
          { name: 'Filesystem', methods: [{ name: 'writeFile', rtype: 'promise' }] },
          { name: 'Share', methods: [{ name: 'share', rtype: 'promise' }] },
          { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'minimizeApp', rtype: 'promise' }] },
        ],
        nativePromise: (plugin, method, options) => window.nativeCall(plugin, method, options),
        nativeCallback: (plugin, method, options, callback) => {
          if (plugin === 'App' && method === 'addListener' && options.eventName === 'backButton') window.nativeBack = callback;
          return 'listener-1';
        },
      };
    }, platform);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.type() === 'confirm' ? dialog.accept() : dialog.dismiss());
    try {
      await page.goto(pathToFileURL(resolve(__dirname, '../www/index.html')).href);
      await page.waitForFunction(() => ready);
      assert.equal(await page.evaluate(() => !!window.GunplaNative), true);
      assert.match(await page.locator('#storage-description').innerText(), /이 기기에 자동 저장/);
      await page.getByRole('button', { name: '구매 기록 추가', exact: true }).click();
      await page.locator('#input-title').fill('앱에서 구매');
      await page.locator('#input-original-price').fill('50000');
      await page.getByRole('button', { name: '저장하기' }).click();
      await page.waitForFunction(() => !saving && items.length === 1);
      assert.equal(JSON.parse(stored.get('gunpla_state_v1')).items[0].price, 50000);
      assert.equal(await page.evaluate(() => localStorage.getItem('gunpla_state_v1')), null);
      await page.reload();
      await page.waitForFunction(() => ready);
      assert.match(await page.locator('#recent-list').innerText(), /앱에서 구매/);
      await page.getByTitle('데이터 내보내기').click();
      await page.waitForTimeout(100);
      const write = calls.find(call => call.plugin === 'Filesystem' && call.method === 'writeFile');
      assert.equal(write.options.directory, 'CACHE');
      assert.equal(write.options.encoding, 'utf8');
      assert.deepEqual(JSON.parse(write.options.data), JSON.parse(stored.get('gunpla_state_v1')));
      const share = calls.find(call => call.plugin === 'Share');
      assert.deepEqual(share.options.files, [`file:///cache/${write.options.path}`]);
      failShare = true;
      await page.getByTitle('데이터 내보내기').click();
      await page.waitForFunction(() => document.getElementById('toast-msg').textContent.includes('내보내기가 취소'));
      const backup = { items: [{ id: 'restored', date: '2026-11-18', title: '백업 복원', price: 10000, grade: 'RG' }], budget: 0 };
      await page.locator('#importFileInput').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
      await page.waitForFunction(() => items[0]?.id === 'restored' && !saving);
      assert.equal(JSON.parse(stored.get('gunpla_state_v1')).budget, 0);
      const before = stored.get('gunpla_state_v1');
      failWrites = true;
      await page.locator('#recent-list').getByRole('button', { name: '구매 기록 수정' }).click();
      await page.locator('#input-title').fill('저장 실패');
      await page.getByRole('button', { name: '저장하기' }).click();
      await page.waitForFunction(() => !saving);
      assert.equal(await page.locator('#modal-item').isVisible(), true);
      assert.equal(stored.get('gunpla_state_v1'), before);
      assert.match(await page.locator('#toast-msg').innerText(), /저장하지 못했습니다/);
      if (platform === 'android') {
        await page.evaluate(() => window.nativeBack({}));
        assert.equal(await page.locator('#modal-item').isVisible(), false);
        await page.locator('#tab-btn-stats').click();
        await page.evaluate(() => window.nativeBack({}));
        assert.equal(await page.locator('#view-dashboard').isVisible(), true);
        await page.evaluate(() => window.nativeBack({}));
        assert.equal(calls.some(call => call.method === 'minimizeApp'), true);
      } else {
        await page.keyboard.press('Escape');
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
      await browser.close();
    }
  });
}
