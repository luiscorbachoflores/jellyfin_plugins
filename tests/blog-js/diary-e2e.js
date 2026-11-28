'use strict';
// Prueba de extremo a extremo del Diario y de la pantalla de Mi lista contra la instancia de pruebas.
// Uso: NODE_PATH=<carpeta con playwright>/node_modules node tests/blog-js/diary-e2e.js
const { chromium } = require('playwright');
const { BASE, SHOTS, api, login, uiLogin } = require('./lib');

let failures = 0;
function check(name, ok, extra) {
    console.log((ok ? 'OK   ' : 'FALLA') + ' ' + name + (ok ? '' : '  ' + (extra || '')));
    if (!ok) { failures++; }
}

(async () => {
    const tito = await login('tito', 'tito');
    const admin = await login('admin', 'admin');

    // --- API
    let r = await api('GET', '/Diary/Entries', { token: tito.token });
    check('lista de tito responde 200', r.status === 200, r.status);
    const total = r.body.Total;
    check('tito tiene entradas importadas', total > 0, total);
    const year = r.body.Year;

    r = await api('GET', '/Diary/Entries', { token: admin.token });
    check('el admin solo ve su propio diario (vacio)', r.status === 200 && r.body.Total === 0, JSON.stringify(r.body).slice(0, 100));

    const first = (await api('GET', '/Diary/Entries?year=' + year, { token: tito.token })).body.Entries[0];
    r = await api('PUT', '/Diary/Entries/' + first.Id, { token: admin.token, body: { Rating: 8 } });
    check('el admin no puede tocar entradas de otro (404)', r.status === 404, r.status);
    r = await api('DELETE', '/Diary/Entries/' + first.Id, { token: admin.token });
    check('el admin no puede borrar entradas de otro (404)', r.status === 404, r.status);
    r = await api('GET', '/Diary/Entries', {});
    check('sin sesion 401', r.status === 401, r.status);

    // anadir a mano, puntuar, comentar, borrar
    const movies = (await api('GET', '/Items?Recursive=true&IncludeItemTypes=Movie&Limit=5&Fields=ProductionYear', { token: tito.token })).body.Items;
    const m = movies[0];
    r = await api('POST', '/Diary/Entries', { token: tito.token, body: { ItemId: m.Id, Date: '2099-01-01' } });
    check('fecha futura rechazada', r.status === 400, r.status);
    r = await api('POST', '/Diary/Entries', { token: tito.token, body: { ItemId: m.Id, Date: '2026-02-14', Rating: 9, Note: 'Prueba e2e' } });
    check('anadir a mano', r.status === 200 && r.body.Source === 'manual' && r.body.Rating === 9, JSON.stringify(r.body));
    const mid = r.body.Id;
    r = await api('PUT', '/Diary/Entries/' + mid, { token: tito.token, body: { Rating: 7, SetNote: true, Note: 'Cambiado' } });
    check('editar nota y comentario', r.status === 200 && r.body.Rating === 7 && r.body.Note === 'Cambiado', JSON.stringify(r.body));
    r = await api('PUT', '/Diary/Entries/' + mid, { token: tito.token, body: { ClearRating: true } });
    check('quitar nota', r.status === 200 && r.body.Rating == null, JSON.stringify(r.body));
    r = await api('DELETE', '/Diary/Entries/' + mid, { token: tito.token });
    check('borrar', r.status === 204, r.status);

    // marcar como vista apunta solo; desmarcar lo deshace
    const target = movies[1];
    await api('DELETE', `/Users/${tito.id}/PlayedItems/${target.Id}`, { token: tito.token });
    const before = (await api('GET', '/Diary/Entries', { token: tito.token })).body.Total;
    await api('POST', `/Users/${tito.id}/PlayedItems/${target.Id}`, { token: tito.token });
    await new Promise((res) => setTimeout(res, 1500));
    const after = (await api('GET', '/Diary/Entries', { token: tito.token })).body;
    const added = after.Entries.find((e) => e.ItemId === target.Id && e.Source === 'marked');
    check('marcar como visto crea una entrada "marcada a mano"', !!added || after.Total > before, JSON.stringify(after.Entries.slice(0, 1)));
    await api('DELETE', `/Users/${tito.id}/PlayedItems/${target.Id}`, { token: tito.token });
    await new Promise((res) => setTimeout(res, 1500));
    const undone = (await api('GET', '/Diary/Entries', { token: tito.token })).body.Entries.find((e) => e.ItemId === target.Id && e.Source === 'marked' && e.Date === (added && added.Date));
    check('desmarcar la deshace', !undone);

    // importar es idempotente
    r = await api('POST', '/Diary/Import', { token: tito.token });
    check('importar no duplica', r.status === 200 && r.body.Added === 0, JSON.stringify(r.body));
    r = await api('POST', '/Diary/Admin/ImportAll', { token: tito.token });
    check('ImportAll solo admin (403)', r.status === 403, r.status);
    r = await api('GET', '/Diary/Admin/Summary', { token: admin.token });
    check('resumen admin con recuentos', r.status === 200 && r.body.length > 0 && !('Entries' in (r.body[0].Items || {})), r.status);

    r = await api('GET', '/Diary/Year/' + year, { token: tito.token });
    check('estadisticas del anio', r.status === 200 && r.body.Total > 0 && r.body.ByMonth.length === 12, r.status);
    console.log('   total', r.body.Total, 'distintas', r.body.Unique, 'min', r.body.Minutes, 'generos', JSON.stringify(r.body.TopGenres.slice(0, 3)), 'comunidad', r.body.Community.length);

    // --- Mi lista
    r = await api('GET', '/Watchlist', { token: tito.token });
    check('Mi lista responde', r.status === 200 && Array.isArray(r.body), r.status);
    if (r.body.length) { check('Mi lista trae duracion', typeof r.body[0].Minutes === 'number'); }

    // --- interfaz
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await uiLogin(page, 'tito', 'tito');
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(BASE + '/web/#/diary');
    await page.waitForSelector('[data-diary-root] .dRow', { timeout: 90000 });
    await page.waitForTimeout(4000);
    await page.waitForSelector('[data-diary-root] .dRow .dStars', { timeout: 60000 });
    await page.screenshot({ path: SHOTS + '/diary-1-lista.png' });
    check('el diario pinta filas', (await page.$$('[data-diary-root] .dRow')).length > 3);

    // puntuar desde la fila
    const stars = await page.$('[data-diary-root] .dRow .dStars');
    const box = await stars.boundingBox();
    const beforeVal = await page.$eval('[data-diary-root] .dRow .dStars', (e) => e.getAttribute('aria-valuenow'));
    await page.mouse.click(box.x + box.width * (beforeVal === '6' ? 0.9 : 0.58), box.y + box.height / 2);
    await page.waitForTimeout(800);
    check('puntuar pulsando estrellas', (await page.$eval('[data-diary-root] .dRow .dStars', (e) => e.getAttribute('aria-valuenow'))) !== beforeVal);

    // abrir editor
    await page.click('[data-diary-root] .dRow .dIconBtn');
    await page.waitForSelector('[data-diary-root] .dEdit');
    await page.screenshot({ path: SHOTS + '/diary-2-editar.png' });

    // anadir pelicula
    await page.click('[data-diary-root] .dBtnMain');
    await page.fill('#dSearch', movies[2].Name.slice(0, 4));
    await page.waitForSelector('[data-diary-root] .dResult', { timeout: 30000 });
    await page.click('[data-diary-root] .dResult');
    await page.waitForSelector('#dAddDate');
    await page.screenshot({ path: SHOTS + '/diary-3-anadir.png' });

    // resumen del anio
    await page.goto(BASE + '/web/#/diary/year/' + year);
    await page.waitForSelector('[data-diary-root] .wHero', { timeout: 90000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: SHOTS + '/diary-4-anio.png', fullPage: true });
    check('el resumen del anio pinta', (await page.$$('[data-diary-root] .wCard')).length >= 2);

    // menu de usuario con Mi lista y Mi diario
    await page.goto(BASE + '/web/#/home');
    await page.waitForTimeout(4000);
    try { await page.click('button:has(.MuiAvatar-root), .headerUserButton', { timeout: 8000 }); await page.waitForTimeout(1500); } catch (e) { console.log('   no se pudo abrir el menu de usuario'); }
    const labels = await page.$$eval('[data-diary="menu"], [data-watchlist="menu"]', (els) => els.map((e) => e.textContent.trim()));
    console.log('   entradas de menu', JSON.stringify(labels));
    await page.screenshot({ path: SHOTS + '/diary-5-menu.png' });
    check('el menu tiene Mi lista y Mi diario', labels.some((l) => /diario/i.test(l)) && labels.some((l) => /lista/i.test(l)));

    // pantalla de Mi lista
    await page.goto(BASE + '/web/#/watchlist');
    await page.waitForSelector('[data-watchlist-root] .wlTitle, [data-watchlist-root] .wlEmpty', { timeout: 90000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: SHOTS + '/watchlist-1.png' });
    check('Mi lista es una pantalla (#/watchlist)', (await page.$('[data-watchlist-root]')) !== null);

    // movil
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + '/web/#/diary');
    await page.waitForSelector('[data-diary-root] .dRow', { timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: SHOTS + '/diary-6-movil.png' });
    await page.goto(BASE + '/web/#/diary/year/' + year);
    await page.waitForSelector('[data-diary-root] .wHero', { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: SHOTS + '/diary-7-anio-movil.png' });

    check('sin errores de JavaScript en la pagina', errors.length === 0, errors.join(' | '));
    await browser.close();
    console.log(failures ? 'HAY FALLOS: ' + failures : 'TODO OK');
    process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
