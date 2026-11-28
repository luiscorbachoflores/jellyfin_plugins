'use strict';
// Depuracion rapida: abre una ruta como un usuario y vuelca consola, errores y el contenido de la raiz.
const { chromium } = require('playwright');
const { BASE, uiLogin } = require('./lib');
(async () => {
    const hash = process.argv[2] || '#/diary';
    const user = process.argv[3] || 'tito';
    const sel = process.argv[4] || '[data-diary-root]';
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 200)));
    page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
    await uiLogin(page, user, user);
    await page.goto(BASE + '/web/' + hash);
    await page.waitForTimeout(15000);
    console.log('hash', await page.evaluate(() => location.hash));
    console.log('script inyectado', await page.evaluate(() => !!window.__diaryLoaded), 'watchlist', await page.evaluate(() => !!window.__watchlistLoaded));
    console.log('fallbackPage', await page.evaluate(() => !!document.getElementById('fallbackPage')));
    console.log('filas', await page.evaluate(() => document.querySelectorAll('[data-diary-root] .dRow').length), 'estrellas', await page.evaluate(() => document.querySelectorAll('[data-diary-root] .dStars').length));
    await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
