'use strict';
// Prueba de borrar una entrada desde la interfaz: confirmacion en linea, error simulado del servidor y borrado real.
const { chromium } = require('playwright');
const { BASE, SHOTS, api, login, uiLogin } = require('./lib');
let fails = 0;
function check(n, ok, x) { console.log((ok ? 'OK   ' : 'FALLA') + ' ' + n + (ok ? '' : '  ' + (x || ''))); if (!ok) { fails++; } }
(async () => {
    const user = process.argv[2] || 'marta';
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
    await uiLogin(page, user, user);
    const t = await login(user, user);
    const total0 = (await api('GET', '/Diary/Entries', { token: t.token })).body.Total;
    await page.goto(BASE + '/web/#/diary');
    await page.waitForSelector('[data-diary-root] .dRow .dStars', { timeout: 90000 });
    await page.waitForTimeout(3000);
    const rows0 = (await page.$$('[data-diary-root] .dRow')).length;

    await page.click('[data-diary-root] .dRow .dIconBtn');
    await page.waitForSelector('[data-diary-root] .dEdit');
    await page.getByRole('button', { name: 'Borrar del diario' }).click();
    check('aparece la confirmacion', await page.isVisible('[data-diary-root] .dConfirm'));
    await page.screenshot({ path: SHOTS + '/del-confirm.png' });

    // "No" cancela sin borrar
    await page.getByRole('button', { name: 'No', exact: true }).click();
    check('"No" cierra la confirmacion', !(await page.isVisible('[data-diary-root] .dConfirm')));
    check('no se ha borrado nada', (await page.$$('[data-diary-root] .dRow')).length === rows0);

    // error del servidor simulado
    await page.route('**/Diary/Entries/*', (route) => (route.request().method() === 'DELETE' ? route.fulfill({ status: 500, body: 'x' }) : route.continue()));
    await page.getByRole('button', { name: 'Borrar del diario' }).click();
    await page.getByRole('button', { name: 'Sí, borrar' }).click();
    await page.waitForSelector('[data-diary-root] .dConfirmErr:not(:empty)', { timeout: 10000 });
    check('un error del servidor se muestra', /error 500/.test(await page.textContent('[data-diary-root] .dConfirmErr')));
    await page.screenshot({ path: SHOTS + '/del-error.png' });
    await page.unroute('**/Diary/Entries/*');

    // borrado real
    await page.getByRole('button', { name: 'Sí, borrar' }).click();
    await page.waitForTimeout(3500);
    const rows1 = (await page.$$('[data-diary-root] .dRow')).length;
    const total1 = (await api('GET', '/Diary/Entries', { token: (await login(user, user)).token })).body.Total;
    check('la fila desaparece', rows1 === rows0 - 1, rows0 + ' -> ' + rows1);
    check('y la entrada se borra en el servidor', total1 === total0 - 1, total0 + ' -> ' + total1);
    await browser.close();
    console.log(fails ? 'HAY FALLOS: ' + fails : 'TODO OK');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
