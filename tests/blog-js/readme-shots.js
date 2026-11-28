'use strict';
// Capturas para el README con los datos de demostracion anonimos (usuarios ficticios marta, pablo y carmen).
// Uso: NODE_PATH=<carpeta con playwright>/node_modules BLOG_SHOTS=<salida> node tests/blog-js/readme-shots.js
const { chromium } = require('playwright');
const { BASE, SHOTS, api, login, uiLogin } = require('./lib');

(async () => {
    const browser = await chromium.launch();
    const marta = await login('marta', 'marta');
    const drafts = await api('GET', '/Blog/Posts?view=drafts', { token: marta.token });
    const draftId = drafts.body.Posts[0].Id;
    const pub = await api('GET', '/Blog/Posts', { token: marta.token });
    const postId = pub.body.Posts.find((p) => /maratón/.test(p.Title)).Id;

    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await uiLogin(page, 'marta', 'marta');

    async function shot(hash, selector, name, opts = {}) {
        await page.goto(BASE + '/web/' + hash);
        await page.waitForSelector(selector, { timeout: 90000 });
        await page.waitForTimeout(opts.wait || 3500);
        await page.screenshot({ path: SHOTS + '/' + name + '.png', fullPage: !!opts.full, clip: opts.clip });
        console.log('ok', name);
    }

    await shot('#/diary', '[data-diary-root] .dRow .dStars', 'diario');
    await shot('#/diary/year/2026', '[data-diary-root] .wHero', 'diario-anio', { full: true, wait: 5000, clip: undefined });
    await shot('#/watchlist', '[data-watchlist-root] .wlGrid', 'mi-lista');
    await shot('#/blog', '[data-blog-root] article, [data-blog-root] .blogPost', 'blog');
    await shot('#/blog?post=' + postId, '[data-blog-root] .blogShelf, [data-blog-root] .blogShelfCard, [data-blog-root] article', 'blog-entrada', { full: true, wait: 4500 });
    await shot('#/blog?edit=' + draftId, '[data-blog-root] .blogEditorBar, [data-blog-root] textarea', 'blog-editor');

    // movil
    await page.setViewportSize({ width: 390, height: 844 });
    await shot('#/diary', '[data-diary-root] .dRow .dStars', 'diario-movil');
    await page.setViewportSize({ width: 1280, height: 860 });

    // panel de administracion
    const adm = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await uiLogin(adm, 'admin', 'admin');
    await adm.goto(BASE + '/web/#/dashboard/plugins');
    await adm.waitForTimeout(12000);
    await adm.screenshot({ path: SHOTS + '/panel-plugins.png' });
    await adm.goto(BASE + '/web/#/configurationpage?name=Blog');
    await adm.waitForSelector('#BlogRestrict', { timeout: 60000 });
    await adm.waitForTimeout(2000);
    await adm.screenshot({ path: SHOTS + '/panel-blog.png' });
    console.log('FIN');
    await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
