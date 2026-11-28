'use strict';
// Capturas del panel de plugins y de la configuracion del Blog (instancia de pruebas).
// Uso: NODE_PATH=<carpeta con playwright>/node_modules node tests/blog-js/config-shots.js
const { chromium } = require('playwright');
const { BASE, SHOTS, uiLogin, api, login } = require('./lib');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await uiLogin(page, 'admin', 'admin');
    const { token } = await login('admin', 'admin');
    const id = '1660e20b-ec3d-4424-91b0-4253e12de3c2';
    const img = await api('GET', `/Plugins/${id}/1.1.0.0/Image`, { token });
    console.log('imagen del plugin HTTP', img.status);

    await page.goto(BASE + '/web/#/dashboard/plugins');
    await page.waitForTimeout(15000);
    await page.screenshot({ path: SHOTS + '/cfg-plugins.png' });

    await page.goto(BASE + '/web/#/configurationpage?name=Blog');
    await page.waitForSelector('#BlogRestrict', { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: SHOTS + '/cfg-1-abierto.png', fullPage: true });

    await page.evaluate(() => document.querySelector('#BlogRestrict').click());
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector('#BlogAddUserBtn').click());
    await page.waitForTimeout(500);
    await page.screenshot({ path: SHOTS + '/cfg-2-limitado.png', fullPage: true });
    const rows = await page.$$eval('.blogRemove', (b) => b.length);
    console.log('usuarios en la lista tras anadir uno', rows);

    // el menu lateral del panel
    const menu = await page.$$eval('a, .MuiListItemText-root', (els) => els.map((e) => e.textContent.trim()).filter((t) => t === 'Blog').length);
    console.log('entradas "Blog" visibles en el panel', menu);
    await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
