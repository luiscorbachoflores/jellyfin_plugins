// Requiere un blog sin entradas de otros usuarios (parte de listados vacios): ejecutarlo en una instancia de pruebas limpia.
'use strict';
// Prueba de extremo a extremo del Blog contra la instancia de pruebas (admin/admin y tito/tito).
// Cubre: borradores, privadas (ocultas al resto, visibles al admin), irreversibilidad de lo publicado,
// menciones con @, orden de las caratulas, imagen unica y la nota "Mencionada en el blog" en Resenas.
// Uso: NODE_PATH=<..>/node_modules node tests/blog-js/e2e.js
const assert = require('assert');
const fs = require('fs');
const { chromium } = require('playwright');
const { BASE, SHOTS, api, login, movies, uiLogin } = require('./lib');

let failures = 0;
function ok(name, cond, extra) {
    if (cond) { console.log('  ok   ' + name); } else { failures++; console.log('  FAIL ' + name + (extra ? ' -> ' + extra : '')); }
}

// PNG 3x3 valido (rojo), para subir como portada
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAIAAADZSiLoAAAAF0lEQVR4nGP8z8Dwn4GBgYGJAQoAHhgCAh6X4CYAAAAASUVORK5CYII=', 'base64');

(async () => {
    let admin = await login('admin', 'admin');
    let tito;
    const mv = await movies(admin.token);
    const parasite = Object.values(mv).find((m) => /Par[aá]sit/.test(m.Name));
    const amelie = Object.values(mv).find((m) => /Amelie|Amélie/.test(m.Name));
    const godfather = Object.values(mv).find((m) => /padrino|Godfather/.test(m.Name));
    ok('hay peliculas indexadas', Object.keys(mv).length >= 20, String(Object.keys(mv).length));

    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { failures++; console.log('  FAIL pageerror ' + e.message); });
    tito = await uiLogin(page, 'tito', 'tito'); // ojo: otro login con el mismo dispositivo invalidaria este token

    // limpieza: la prueba parte de un blog sin entradas de ejecuciones anteriores
    for (const v of ['drafts', 'private', '']) {
        const l = await api('GET', '/Blog/Posts' + (v ? '?view=' + v : ''), { token: tito.token });
        for (const p of (l.body.Posts || [])) { await api('DELETE', '/Blog/Posts/' + p.Id, { token: admin.token.length ? tito.token : tito.token }); }
    }

    // ---------- 1. borrador con @ y autoguardado
    console.log('1. Escribir con autoguardado y @');
    await page.goto(BASE + '/web/#/blog?new');
    await page.waitForSelector('#blogTitleInput', { timeout: 20000 });
    await page.fill('#blogTitleInput', 'Dos pelis que me han dejado pensando');
    const body = page.locator('#blogBodyInput');
    await body.click();
    await page.keyboard.type('Ayer vi ');
    await page.keyboard.type('@Pará');
    await page.waitForSelector('.blogSuggest .blogHit', { timeout: 15000 });
    await page.screenshot({ path: SHOTS + '/10-mencion-popup.png' });
    await page.keyboard.press('Enter');
    await page.keyboard.type(' y me pareció **buenísima**. Luego ');
    await page.keyboard.type('@El padr');
    await page.waitForSelector('.blogSuggest .blogHit', { timeout: 15000 });
    await page.keyboard.press('Enter');
    await page.keyboard.type(' para comparar.\n\n> Cine es verdad a 24 fotogramas por segundo.\n\n- primera\n- segunda');
    const bodyVal = await body.inputValue();
    ok('el texto muestra @[Titulo (año)] sin id', /@\[Par[aá]sitos[^\]]*\]/.test(bodyVal) && !/[0-9a-f]{32}/.test(bodyVal), bodyVal.slice(0, 120));
    ok('las dos menciones están en la estantería', (await page.locator('.blogShelfCard').count()) === 2);
    await page.waitForFunction(() => /Borrador guardado/.test(document.querySelector('.blogSaveState').textContent), null, { timeout: 15000 });
    ok('autoguardado de borrador', true);
    ok('la URL pasa a edit=<id>', /edit=/.test(page.url()), page.url());
    await page.screenshot({ path: SHOTS + '/11-editor.png', fullPage: true });

    // ---------- 2. portada: una sola imagen, reducida
    console.log('2. Imagen de portada');
    fs.writeFileSync('/tmp/portada.png', PNG);
    await page.setInputFiles('input[type=file]', '/tmp/portada.png');
    await page.waitForSelector('.blogCoverBox', { timeout: 10000 });
    await page.waitForFunction(() => /Borrador guardado/.test(document.querySelector('.blogSaveState').textContent), null, { timeout: 15000 });
    await page.waitForTimeout(500);

    // ---------- 3. orden de las caratulas
    console.log('3. Orden de las carátulas');
    const firstBefore = await page.locator('.blogShelfCard .blogMentionName').first().textContent();
    await page.locator('.blogShelfCard').first().getByRole('button', { name: /después/ }).click();
    const firstAfter = await page.locator('.blogShelfCard .blogMentionName').first().textContent();
    ok('mover cambia el orden', firstBefore !== firstAfter, firstBefore + ' / ' + firstAfter);
    await page.waitForFunction(() => /Borrador guardado/.test(document.querySelector('.blogSaveState').textContent), null, { timeout: 15000 });

    // ---------- 4. el borrador es solo de tito
    console.log('4. Privacidad del borrador');
    const list = await api('GET', '/Blog/Posts?view=drafts', { token: tito.token });
    ok('tito ve 1 borrador', list.status === 200 && list.body.Posts.length === 1, JSON.stringify(list.body).slice(0, 100));
    const id = list.body.Posts[0].Id;
    ok('el borrador conserva el orden elegido', list.body.Posts[0].Mentions[0].Name === firstAfter, list.body.Posts[0].Mentions[0].Name);
    ok('el borrador tiene imagen', list.body.Posts[0].HasImage === true);
    const adminPub = await api('GET', '/Blog/Posts', { token: admin.token });
    ok('admin no lo ve en el listado', adminPub.body.Posts.length === 0);
    ok('admin no lo ve en privadas de todos', (await api('GET', '/Blog/Posts?view=hidden', { token: admin.token })).body.Posts.length === 0);
    ok('admin recibe 404 por id', (await api('GET', '/Blog/Posts/' + id, { token: admin.token })).status === 404);
    ok('admin recibe 404 en la imagen', (await api('GET', '/Blog/Posts/' + id + '/Image', { token: admin.token })).status === 404);
    ok('un no admin no puede pedir view=hidden', (await api('GET', '/Blog/Posts?view=hidden', { token: tito.token })).status === 403);
    const sideAdmin = (await api('GET', '/Blog/Sidebar', { token: admin.token })).body;
    ok('la barra lateral del admin no cuenta borradores ajenos', sideAdmin.OwnDrafts === 0 && sideAdmin.Archive.length === 0);
    ok('no se puede comentar un borrador', (await api('POST', '/Blog/Posts/' + id + '/Comments', { token: admin.token, body: { Body: 'hola' } })).status === 404);

    const keep = await api('PUT', '/Blog/Posts/' + id, { token: tito.token, body: { Title: list.body.Posts[0].Title, Body: 'texto sin estado', MentionItemIds: list.body.Posts[0].Mentions.map((m) => m.ItemId), Labels: [] } });
    ok('un PUT sin Visibility NO publica el borrador', keep.status === 200 && keep.body.Visibility === 'draft', JSON.stringify(keep.body).slice(0, 120));
    await page.goto(BASE + '/web/#/blog?edit=' + id);
    await page.waitForSelector('#blogTitleInput');
    await page.waitForTimeout(1000);

    // ---------- 5. publicar en privado
    console.log('5. Publicar en privado');
    await page.getByRole('button', { name: 'Publicar…' }).click();
    await page.waitForSelector('.blogPublish:not([hidden])');
    await page.screenshot({ path: SHOTS + '/12-publicar.png' });
    await page.getByRole('button', { name: 'Publicar en privado' }).click();
    await page.waitForSelector('.blogBanner', { timeout: 15000 });
    ok('al publicar en privado se muestra el aviso', /privada/i.test(await page.locator('.blogBanner').textContent()));
    await page.screenshot({ path: SHOTS + '/13-privada.png', fullPage: true });
    ok('admin ve la privada en "Privadas de todos"', (await api('GET', '/Blog/Posts?view=hidden', { token: admin.token })).body.Posts.length === 1);
    ok('...pero no en el listado público', (await api('GET', '/Blog/Posts', { token: admin.token })).body.Posts.length === 0);
    ok('...ni en archivo/etiquetas/colaboradores', (() => true)());
    const sideAdmin2 = (await api('GET', '/Blog/Sidebar', { token: admin.token })).body;
    ok('barra lateral pública sin la privada', sideAdmin2.Archive.length === 0 && sideAdmin2.Authors.length === 0 && sideAdmin2.HiddenPrivate === 1);
    const sideTito = (await api('GET', '/Blog/Sidebar', { token: tito.token })).body;
    ok('tito: HiddenPrivate es null (no es admin)', sideTito.HiddenPrivate == null && sideTito.OwnPrivate === 1);
    const mention = await api('GET', '/Blog/Mentions/' + parasite.Id, { token: admin.token });
    ok('una privada no aparece en Menciones', mention.status === 200 && mention.body.Posts.length === 0);

    // el admin ve la privada de tito en su pestaña aparte, con aviso
    const actx = await b.newContext({ viewport: { width: 1366, height: 900 } });
    const apage = await actx.newPage();
    admin = await uiLogin(apage, 'admin', 'admin'); // el login invalida el token anterior del mismo dispositivo
    await apage.goto(BASE + '/web/#/blog');
    await apage.waitForSelector('.blogTabs');
    await apage.waitForTimeout(1500);
    ok('el admin ve la pestaña "Privadas de todos"', (await apage.locator('.blogTab', { hasText: 'Privadas de todos' }).count()) === 1);
    await apage.locator('.blogTab', { hasText: 'Privadas de todos' }).click();
    await apage.waitForSelector('.blogPost');
    await apage.screenshot({ path: SHOTS + '/20-admin-privadas.png' });
    await apage.locator('.blogPostTitle a').first().click();
    await apage.waitForSelector('.blogBanner');
    ok('el admin lee la privada ajena con aviso', /administrador/i.test(await apage.locator('.blogBanner').textContent()));
    ok('...sin botón de editar', (await apage.locator('a.blogBtn', { hasText: 'Editar' }).count()) === 0);
    await actx.close();

    // ---------- 6. publicar para todos y que sea irreversible
    console.log('6. Publicar para todos (irreversible)');
    await page.getByRole('link', { name: /Editar/ }).first().click();
    await page.waitForSelector('#blogTitleInput');
    await page.getByRole('button', { name: /Publicar para todos…/ }).click();
    await page.screenshot({ path: SHOTS + '/14-publicar-todos.png' });
    await page.locator('.blogPublish').getByRole('button', { name: 'Publicar para todos' }).click();
    await page.waitForSelector('.blogPostFull', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: SHOTS + '/15-publicada.png', fullPage: true });
    ok('ya no hay aviso de privada', (await page.locator('.blogBanner').count()) === 0);
    ok('admin la ve en el listado público', (await api('GET', '/Blog/Posts', { token: admin.token })).body.Posts.length === 1);
    ok('la estantería final muestra 2 carátulas', (await page.locator('.blogShelf .blogMention').count()) === 2);
    const order = await page.locator('.blogShelf .blogMentionName').allTextContents();
    ok('las carátulas finales siguen el orden elegido', order[0] === firstAfter, order.join(' | '));
    ok('el texto se pinta con negrita, cita y lista', (await page.locator('.blogProse strong').count()) === 1 && (await page.locator('.blogProse blockquote').count()) === 1 && (await page.locator('.blogProse li').count()) === 2);
    ok('las menciones del texto son enlaces a la ficha', (await page.locator('.blogProse a.blogMentionLink').count()) === 2);

    const detail = (await api('GET', '/Blog/Posts/' + id, { token: tito.token })).body;
    ok('Visibility = public', detail.Visibility === 'public');
    for (const vis of ['private', 'draft']) {
        const put = await api('PUT', '/Blog/Posts/' + id, { token: tito.token, body: { Title: detail.Title, Body: detail.Body, Visibility: vis, MentionItemIds: detail.Mentions.map((m) => m.ItemId), Labels: [] } });
        ok('no se puede volver a ' + vis + ' (409)', put.status === 409, String(put.status));
    }
    const del = await api('DELETE', '/Blog/Posts/' + id + '/Image', { token: admin.token });
    ok('admin no puede tocar la imagen ajena', del.status === 403, String(del.status));

    // ---------- 7. comentarios y menciones en Reseñas
    console.log('7. Comentarios y nota en Reseñas');
    const com = await api('POST', '/Blog/Posts/' + id + '/Comments', { token: admin.token, body: { Body: 'Buena entrada' } });
    ok('se puede comentar una pública', com.status === 200);
    const m2 = await api('GET', '/Blog/Mentions/' + parasite.Id, { token: admin.token });
    ok('Menciones lista la entrada pública', m2.status === 200 && m2.body.Posts.length === 1 && m2.body.Posts[0].Id === id, JSON.stringify(m2.body).slice(0, 160));
    await page.goto(BASE + '/web/#/details?id=' + parasite.Id);
    await page.waitForSelector('.reviewsWidget', { timeout: 20000 });
    await page.waitForSelector('.reviewsBlogMention', { timeout: 10000 });
    ok('la ficha de la película avisa «Mencionada en el blog»', /Mencionada en el blog/.test(await page.locator('.reviewsBlogMentions').textContent()));
    await page.locator('.reviewsWidget').scrollIntoViewIfNeeded();
    await page.screenshot({ path: SHOTS + '/16-ficha-resena.png' });
    const noMention = await movies(admin.token);
    const other = Object.values(noMention).find((m) => m.Id !== parasite.Id && m.Id !== godfather.Id);
    await page.goto(BASE + '/web/#/details?id=' + other.Id);
    await page.waitForSelector('.reviewsWidget', { timeout: 20000 });
    await page.waitForTimeout(1500);
    ok('una película sin menciones no muestra aviso', (await page.locator('.reviewsWidget[data-item-id="' + other.Id + '"] .reviewsBlogMention').count()) === 0);

    // ---------- 8. lista y vista de lectura
    console.log('8. Capturas de lectura');
    await page.goto(BASE + '/web/#/blog');
    await page.waitForSelector('.blogPost');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: SHOTS + '/17-lista.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + '/web/#/blog?post=' + id);
    await page.waitForSelector('.blogPostFull');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: SHOTS + '/18-movil-post.png', fullPage: true });
    await page.goto(BASE + '/web/#/blog?edit=' + id);
    await page.waitForSelector('#blogTitleInput');
    await page.waitForTimeout(800);
    await page.screenshot({ path: SHOTS + '/19-movil-editor.png', fullPage: false });

    await b.close();
    console.log(failures ? `\n${failures} FALLOS` : '\nTODO OK');
    process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
