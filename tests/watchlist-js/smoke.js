'use strict';
// Smoke test de src/Watchlist/wwwroot/watchlist.js con Playwright + Chromium.
//
// AVISO: los fixtures HTML de abajo estan escritos a mano y son APROXIMACIONES de los anclajes
// documentados en la spec 0004 (menu moderno MUI, pagina legacy, ficha). Prueban la logica de
// inyeccion, la idempotencia y el re-inyectado, pero NO prueban que el DOM real de jellyfin-web
// 12.2 sea asi. La validacion real se hace en el contenedor POC con un Jellyfin de verdad.
//
// Uso: node tests/watchlist-js/smoke.js   (requiere `playwright` resoluble desde Node)

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'Watchlist', 'wwwroot', 'watchlist.js'), 'utf8');
const ORIGIN = 'http://localhost:8096';
const MOVIE = '0123456789abcdef0123456789abcdef';
const EPISODE = 'fedcba9876543210fedcba9876543210';

const MODERN_MENU = `
<div id="app-user-menu" role="presentation" class="MuiPopover-root MuiMenu-root">
  <div aria-hidden="true" class="MuiBackdrop-root" style="position:fixed;inset:0"></div>
  <div class="MuiPaper-root" style="position:fixed;top:40px;left:40px;z-index:2"><ul role="menu" class="MuiList-root MuiMenu-list">
    <a role="menuitem" tabindex="-1" class="MuiButtonBase-root MuiMenuItem-root css-abc" href="#/userprofile?userId=u1">
      <div class="MuiListItemIcon-root"><svg class="MuiSvgIcon-root" data-testid="PersonIcon" viewBox="0 0 24 24"><path d="M12 12z"/></svg></div>
      <div class="MuiListItemText-root"><span class="MuiTypography-root">Perfil</span></div>
      <span class="MuiTouchRipple-root"></span>
    </a>
    <a role="menuitem" tabindex="-1" class="MuiButtonBase-root MuiMenuItem-root css-abc" href="#/mypreferencesmenu">
      <div class="MuiListItemIcon-root"><svg class="MuiSvgIcon-root" data-testid="SettingsIcon" viewBox="0 0 24 24"><path d="M1 1z"/></svg></div>
      <div class="MuiListItemText-root"><span class="MuiTypography-root">Ajustes</span></div>
      <span class="MuiTouchRipple-root"></span>
    </a>
    <a role="menuitem" tabindex="-1" class="MuiButtonBase-root MuiMenuItem-root css-abc" href="#/quickconnect"><div class="MuiListItemText-root"><span>Quick Connect</span></div></a>
  </ul></div>
</div>
<button id="avatar">avatar</button>
<script>
// Aproxima el cierre de MUI: Escape sobre el menu lo oculta (visibility:hidden, keepMounted).
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && e.target.closest && e.target.closest('#app-user-menu')) {
    document.getElementById('app-user-menu').style.visibility = 'hidden';
  }
}, true);
</script>`;

const LEGACY_PAGE = `
<div class="page">
  <a is="emby-linkbutton" class="lnkUserProfile listItem-border" href="#/userprofile?userId=u1" tabindex="0" data-legacy="1">
    <div class="listItem"><span class="material-icons listItemIcon listItemIcon-transparent person" aria-hidden="true"></span>
    <div class="listItemBody"><div class="listItemBodyText">Perfil</div></div></div>
  </a>
  <a class="lnkDisplay listItem-border" href="#/mypreferencesdisplay"><div class="listItem">Pantalla</div></a>
</div>`;

const DETAILS = `
<div id="detailsRoot">
  <div class="page itemDetailPage hide" id="oldView"><div class="mainDetailButtons" id="oldButtons">
    <button class="button-flat detailButton btnUserRating"><div class="detailButton-content"><span class="material-icons detailButton-icon favorite"></span></div></button>
  </div></div>
  <div class="page itemDetailPage" id="newView"><div class="mainDetailButtons" id="newButtons">
    <button class="button-flat detailButton btnPlay"><div class="detailButton-content"><span class="material-icons detailButton-icon play_arrow"></span></div></button>
    <button class="button-flat detailButton btnUserRating"><div class="detailButton-content"><span class="material-icons detailButton-icon favorite"></span></div></button>
    <button class="button-flat detailButton btnMore"><div class="detailButton-content"><span class="material-icons detailButton-icon more_vert"></span></div></button>
  </div></div>
</div>`;

async function newPage(browser, body, hash, opts) {
  opts = opts || {};
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  const calls = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const db = { inList: new Set(opts.inList || []), items: opts.items || [] };
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === '/') {
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body style="background:rgb(20,30,40);color:#eee">${body}</body></html>` });
    }
    if (url.pathname.indexOf('/Watchlist') === 0) {
      calls.push(req.method() + ' ' + url.pathname + ' auth=' + (req.headers()['authorization'] || ''));
      const m = /^\/Watchlist\/Items\/([^/]+)$/.exec(url.pathname);
      if (m && req.method() === 'GET') {
        const eligible = m[1] !== EPISODE;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ Eligible: eligible, InWatchlist: eligible && db.inList.has(m[1]) }) });
      }
      if (m && req.method() === 'POST') {
        if (opts.failPost) { return route.fulfill({ status: 400, body: 'Tu lista está llena' }); }
        db.inList.add(m[1]);
        return route.fulfill({ status: 204 });
      }
      if (m && req.method() === 'DELETE') { db.inList.delete(m[1]); return route.fulfill({ status: 204 }); }
      if (url.pathname === '/Watchlist') { return route.fulfill({ contentType: 'application/json', body: JSON.stringify(db.items) }); }
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => {
    window.ApiClient = { accessToken: () => 'tok123', serverAddress: () => '' };
  });
  await page.goto(ORIGIN + '/' + (hash || ''));
  await page.addScriptTag({ content: SCRIPT });
  return { page, errors, calls, db, ctx };
}

const results = [];
async function test(name, fn) {
  try { await fn(); results.push([name, true]); console.log('ok   - ' + name); }
  catch (e) { results.push([name, false]); console.log('FAIL - ' + name + '\n' + (e && e.stack || e)); }
}

(async () => {
  const browser = await chromium.launch();

  await test('modern menu: entry injected once after Settings, copied classes, click opens dialog and closes menu', async () => {
    const { page, errors, ctx } = await newPage(browser, MODERN_MENU);
    const sel = '#app-user-menu [data-watchlist="menu"]';
    await page.waitForSelector(sel);
    // Lanzar muchas mutaciones: nunca debe duplicarse.
    await page.evaluate(() => { for (let i = 0; i < 20; i++) { document.body.appendChild(document.createElement('i')); } });
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator(sel).count(), 1);
    const info = await page.evaluate(() => {
      const e = document.querySelector('#app-user-menu [data-watchlist="menu"]');
      const settings = document.querySelector('#app-user-menu a[href*="mypreferencesmenu"]');
      return {
        prevIsSettings: e.previousElementSibling === settings,
        sameClass: e.className === settings.className,
        tag: e.tagName, role: e.getAttribute('role'), tabindex: e.getAttribute('tabindex'),
        text: e.textContent.replace(/\s+/g, ' ').trim(),
        path: e.querySelector('svg path').getAttribute('d'),
        settingsPath: settings.querySelector('svg path').getAttribute('d'),
        settingsText: settings.textContent.replace(/\s+/g, ' ').trim(),
      };
    });
    assert.ok(info.prevIsSettings); assert.ok(info.sameClass);
    assert.strictEqual(info.tag, 'A'); assert.strictEqual(info.role, 'menuitem'); assert.strictEqual(info.tabindex, '-1');
    assert.strictEqual(info.text, 'Mi lista');
    assert.ok(info.path.startsWith('M17 3H7'));
    assert.strictEqual(info.settingsPath, 'M1 1z', 'Settings icon must stay untouched');
    assert.strictEqual(info.settingsText, 'Ajustes');
    await page.click(sel);
    await page.waitForSelector('[role="dialog"][aria-modal="true"]');
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.getElementById('app-user-menu')).visibility), 'hidden');
    assert.ok((await page.textContent('.watchlistEmpty')).indexOf('Tu lista está vacía') === 0);
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  await test('modern menu: entry is re-injected after the node is removed', async () => {
    const { page, errors, ctx } = await newPage(browser, MODERN_MENU);
    const sel = '#app-user-menu [data-watchlist="menu"]';
    await page.waitForSelector(sel);
    await page.evaluate(() => document.querySelector('[data-watchlist="menu"]').remove());
    await page.waitForSelector(sel);
    assert.strictEqual(await page.locator(sel).count(), 1);
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  await test('legacy page: entry after a.lnkUserProfile with copied classes, plain <a>, href "#", bookmark icon', async () => {
    const { page, errors, ctx } = await newPage(browser, LEGACY_PAGE);
    const sel = 'a[data-watchlist="menu"]';
    await page.waitForSelector(sel);
    const info = await page.evaluate(() => {
      const e = document.querySelector('[data-watchlist="menu"]');
      const p = document.querySelector('a.lnkUserProfile');
      return {
        prev: e.previousElementSibling === p, cls: e.className === p.className, is: e.getAttribute('is'),
        href: e.getAttribute('href'), tabindex: e.getAttribute('tabindex'),
        icon: e.querySelector('.material-icons').className,
        text: e.querySelector('.listItemBodyText').textContent,
        origIcon: p.querySelector('.material-icons').className, origText: p.querySelector('.listItemBodyText').textContent,
      };
    });
    assert.ok(info.prev); assert.ok(info.cls);
    assert.strictEqual(info.is, null, 'must not copy the customized built-in');
    assert.strictEqual(info.href, '#'); assert.strictEqual(info.tabindex, '0');
    assert.ok(/\bbookmark\b/.test(info.icon) && !/\bperson\b/.test(info.icon));
    assert.strictEqual(info.text, 'Mi lista');
    assert.ok(/\bperson\b/.test(info.origIcon)); assert.strictEqual(info.origText, 'Perfil');
    assert.strictEqual(await page.locator(sel).count(), 1);
    await page.click(sel);
    await page.waitForSelector('[role="dialog"]');
    assert.strictEqual(await page.evaluate(() => location.hash), '', 'click must not navigate');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="dialog"]', { state: 'detached' });
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  await test('detail: button only in the visible view, after btnUserRating, toggles with POST/DELETE', async () => {
    const { page, errors, calls, db, ctx } = await newPage(browser, DETAILS, '#/details?id=' + MOVIE);
    await page.waitForSelector('#newButtons [data-watchlist="detail"]');
    assert.strictEqual(await page.locator('[data-watchlist="detail"]').count(), 1);
    assert.strictEqual(await page.locator('#oldButtons [data-watchlist="detail"]').count(), 0);
    assert.ok(await page.evaluate(() => document.querySelector('[data-watchlist="detail"]').previousElementSibling.classList.contains('btnUserRating')));
    const btn = page.locator('[data-watchlist="detail"]');
    assert.strictEqual(await btn.getAttribute('aria-pressed'), 'false');
    assert.strictEqual(await btn.getAttribute('aria-label'), 'Añadir a mi lista');
    assert.strictEqual(await btn.getAttribute('class'), 'button-flat detailButton');
    await btn.click();
    await page.waitForFunction(() => document.querySelector('[data-watchlist="detail"]').getAttribute('aria-pressed') === 'true');
    assert.ok(await page.locator('[data-watchlist="detail"] .bookmark').count() === 1);
    assert.ok(db.inList.has(MOVIE));
    assert.ok(calls.some((c) => c === 'POST /Watchlist/Items/' + MOVIE + ' auth=MediaBrowser Token="tok123"'), calls.join('|'));
    await btn.click();
    await page.waitForFunction(() => document.querySelector('[data-watchlist="detail"]').getAttribute('aria-pressed') === 'false');
    assert.ok(!db.inList.has(MOVIE));
    assert.ok(calls.some((c) => c.indexOf('DELETE /Watchlist/Items/' + MOVIE) === 0));
    // Re-inyeccion tras borrar el nodo y sin duplicados tras muchas mutaciones.
    await page.evaluate(() => document.querySelector('[data-watchlist="detail"]').remove());
    await page.waitForSelector('[data-watchlist="detail"]');
    await page.evaluate(() => { for (let i = 0; i < 20; i++) { document.body.appendChild(document.createElement('i')); } });
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('[data-watchlist="detail"]').count(), 1);
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  await test('detail: initial state reflects InWatchlist; failed POST reverts the toggle', async () => {
    const { page, errors, ctx } = await newPage(browser, DETAILS, '#/details?id=' + MOVIE, { inList: [MOVIE] });
    await page.waitForSelector('[data-watchlist="detail"][aria-pressed="true"]');
    await ctx.close();
    const t = await newPage(browser, DETAILS, '#/details?id=' + MOVIE, { failPost: true });
    await t.page.waitForSelector('[data-watchlist="detail"]');
    await t.page.click('[data-watchlist="detail"]');
    await t.page.waitForSelector('.watchlistToast');
    await t.page.waitForFunction(() => document.querySelector('[data-watchlist="detail"]').getAttribute('aria-pressed') === 'false');
    assert.deepStrictEqual(t.errors.concat(errors), []);
    await t.ctx.close();
  });

  await test('detail: no button when Eligible is false (episode)', async () => {
    const { page, errors, calls, ctx } = await newPage(browser, DETAILS, '#/details?id=' + EPISODE);
    await page.waitForTimeout(500);
    assert.ok(calls.some((c) => c.indexOf('GET /Watchlist/Items/' + EPISODE) === 0));
    assert.strictEqual(await page.locator('[data-watchlist="detail"]').count(), 0);
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  await test('detail: no request or button when the hash is not a details route', async () => {
    const { page, calls, ctx } = await newPage(browser, DETAILS, '#/home');
    await page.waitForTimeout(300);
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(await page.locator('[data-watchlist="detail"]').count(), 0);
    await ctx.close();
  });

  await test('detail: re-evaluates when the id in the hash changes', async () => {
    const { page, ctx } = await newPage(browser, DETAILS, '#/details?id=' + MOVIE);
    await page.waitForSelector('[data-watchlist="detail"]');
    await page.evaluate((id) => { location.hash = '#/details?id=' + id; }, EPISODE);
    await page.waitForFunction(() => !document.querySelector('[data-watchlist="detail"]'));
    await ctx.close();
  });

  await test('view: lists items escaped, remove button, card click navigates and closes, hashchange closes', async () => {
    const items = [
      { ItemId: '0123456789abcdef0123456789abcdef', Name: '<img src=x onerror=window.__pwned=1>', Type: 'Movie', ProductionYear: 1999, HasPrimaryImage: false, AddedUtc: 'x' },
      { ItemId: 'aaaaaaaabbbbccccddddeeeeeeeeeeee', Name: 'Serie', Type: 'Series', ProductionYear: null, HasPrimaryImage: true, AddedUtc: 'y' },
    ];
    const { page, errors, calls, ctx } = await newPage(browser, MODERN_MENU, '#/home?watchlist=open', { items });
    await page.waitForSelector('.watchlistCard');
    assert.strictEqual(await page.locator('.watchlistCard').count(), 2);
    assert.strictEqual(await page.evaluate(() => window.__pwned), undefined);
    assert.strictEqual(await page.locator('.watchlistCard img.watchlistPoster').count(), 1);
    assert.ok(await page.evaluate(() => document.querySelector('.watchlistOverlay').style.backgroundColor) === 'rgb(20, 30, 40)');
    await page.click('.watchlistCard:nth-child(2) .watchlistCardRemove');
    await page.waitForFunction(() => document.querySelectorAll('.watchlistCard').length === 1);
    assert.ok(calls.some((c) => c.indexOf('DELETE /Watchlist/Items/aaaaaaaabbbbccccddddeeeeeeeeeeee') === 0));
    await page.click('.watchlistCardOpen');
    await page.waitForSelector('[role="dialog"]', { state: 'detached' });
    assert.ok((await page.evaluate(() => location.hash)).indexOf('#/details?id=0123456789abcdef') === 0);
    await page.evaluate(() => { location.hash = '#/home?watchlist=open'; });
    await page.waitForSelector('[role="dialog"]');
    await page.evaluate(() => { location.hash = '#/home'; });
    await page.waitForSelector('[role="dialog"]', { state: 'detached' });
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  await test('guard: loading the script twice does not duplicate anything; debug log only when enabled', async () => {
    const { page, errors, ctx } = await newPage(browser, MODERN_MENU);
    await page.waitForSelector('[data-watchlist="menu"]');
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('[data-watchlist="menu"]').count(), 1);
    assert.deepStrictEqual(errors, []);
    await ctx.close();

    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    const logs = [];
    p2.on('console', (m) => logs.push(m.text()));
    await p2.route('**/*', (r) => new URL(r.request().url()).pathname === '/'
      ? r.fulfill({ contentType: 'text/html', body: '<!doctype html><body>' + MODERN_MENU + '</body>' })
      : r.fulfill({ status: 404, body: '' }));
    await p2.addInitScript(() => { window.ApiClient = { accessToken: () => 't' }; localStorage.setItem('watchlist.debug', '1'); });
    await p2.goto(ORIGIN + '/');
    await p2.addScriptTag({ content: SCRIPT });
    await p2.waitForSelector('[data-watchlist="menu"]');
    assert.ok(logs.some((l) => l === '[Watchlist] menu: modern-app-user-menu'), logs.join('|'));
    await ctx2.close();
  });

  await test('not logged in: nothing is injected', async () => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.route('**/*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><body>' + MODERN_MENU + '</body>' }));
    await p.goto(ORIGIN + '/');
    await p.addScriptTag({ content: SCRIPT });
    await p.waitForTimeout(300);
    assert.strictEqual(await p.locator('[data-watchlist]').count(), 0);
    await ctx.close();
  });

  await browser.close();
  const failed = results.filter((r) => !r[1]).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
