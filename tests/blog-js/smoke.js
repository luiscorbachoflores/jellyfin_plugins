'use strict';
// Smoke test de src/Blog/wwwroot/blog.js con Playwright + Chromium.
//
// AVISO: los fixtures HTML de abajo estan escritos a mano y son APROXIMACIONES de los anclajes
// documentados en la spec 0001 (#fallbackPage de FallbackRoute, cajon legacy con .customMenuOptions,
// cajon moderno MUI) y el backend es un fetch simulado. Prueban la logica del script (montaje,
// repintado, reinsercion, titulo, interceptacion del menu, renderizado seguro, spoilers, editor),
// pero NO prueban que el DOM real de jellyfin-web sea asi ni que el router real se comporte igual.
// La validacion real se hace en el contenedor POC con un Jellyfin de verdad.
//
// Uso: node tests/blog-js/smoke.js   (requiere `playwright` resoluble desde Node)

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'Blog', 'wwwroot', 'blog.js'), 'utf8');
const ORIGIN = 'http://localhost:8096';
const ITEM_A = '0123456789abcdef0123456789abcdef';
const ITEM_B = 'fedcba9876543210fedcba9876543210';

// ---------------------------------------------------------------- fixtures

const FALLBACK_HTML = `
<div id="fallbackPage" class="page mainAnimatedPage libraryPage" data-role="page" data-title="Pagina no encontrada">
  <div class="padded-left padded-right" id="reactChild">
    <h1>Pagina no encontrada</h1>
    <p>Esta pagina no existe.</p>
    <a href="#/home" id="reactLink">Ir al inicio</a>
  </div>
</div>`;

// Aproxima el router: #/home y cualquier otra ruta (fallback). Solo remonta al cambiar de tipo de ruta,
// como React: dentro de /blog los cambios de hash no remontan #fallbackPage.
const ROUTER = `
<script>
function renderRoute() {
  var path = (location.hash || '').replace(/^#!?/, '').split('?')[0];
  var want = path === '/home' ? 'home' : 'fallback';
  var app = document.getElementById('app');
  if (app.getAttribute('data-route') === want) { return; }
  app.setAttribute('data-route', want);
  app.innerHTML = want === 'home' ? '<div id="homePage" class="page">Inicio</div>' : ${JSON.stringify(FALLBACK_HTML)};
}
window.addEventListener('hashchange', renderRoute);
renderRoute();
</script>`;

const LEGACY_DRAWER = `
<div class="mainDrawer" id="legacyDrawer"><div class="customMenuOptions">
  <a class="navMenuOption lnkMediaFolder" target="_blank" rel="noopener noreferrer" href="#/blog">
    <span class="material-icons navMenuOptionIcon article"></span><span class="navMenuOptionText">Blog</span>
  </a>
</div></div>`;

const MODERN_DRAWER = `
<div class="MuiDrawer-root" id="modernDrawer">
  <a class="MuiButtonBase-root MuiListItemButton-root" target="_blank" href="#/blog" id="modernBlogLink">Blog</a>
</div>
<script>
window.__drawerKeys = [];
document.getElementById('modernDrawer').addEventListener('keydown', function (e) { window.__drawerKeys.push(e.key); });
</script>`;

function pageHtml(extra) {
  return `<!doctype html><html><body style="background:rgb(20,30,40);color:#eee">
<header class="skinHeader"><span class="pageTitle">Jellyfin</span></header>
${extra || ''}
<div id="app"></div>
${ROUTER}
</body></html>`;
}

// ---------------------------------------------------------------- backend simulado

const XSS_TITLE = '<script>window.__xss=1;alert(1)</script>';
const XSS_IMG = '<img src=x onerror="window.__xss=1;alert(2)">';
const XSS_SVG = '"><svg onload="window.__xss=1;alert(3)">';

function mkPost(i, over) {
  const day = String(1 + Math.floor(i / 2)).padStart(2, '0');
  return Object.assign({
    Id: '00000000-0000-0000-0000-' + String(i).padStart(12, '0'),
    Title: 'Entrada ' + i,
    Body: 'Cuerpo de la entrada ' + i,
    HasSpoilers: false,
    Author: { UserId: 'u' + (i % 2 === 0 ? 1 : 2), Name: i % 2 === 0 ? 'luis' : 'ana' },
    CreatedUtc: '2026-11-' + day + 'T' + (i % 2 === 0 ? '21:30' : '10:15') + ':00.000Z',
    UpdatedUtc: null,
    Labels: [],
    Mentions: [],
  }, over || {});
}

function makeBackend(opts) {
  opts = opts || {};
  const state = {
    me: opts.me || 'u1',
    admin: !!opts.admin,
    posts: opts.posts || [],           // mas recientes primero
    comments: opts.comments || {},     // postId -> [comment]
    calls: [],
    nextId: 5000,
  };
  const canEdit = (uid) => uid === state.me;
  const canDelete = (uid) => state.admin || uid === state.me;
  const summary = (p) => ({
    Id: p.Id, Title: p.Title, Excerpt: p.Body.slice(0, 300), IsTruncated: p.Body.length > 300,
    HasSpoilers: p.HasSpoilers, Author: p.Author, CreatedUtc: p.CreatedUtc, UpdatedUtc: p.UpdatedUtc,
    Labels: p.Labels, Mentions: p.Mentions, CommentCount: (state.comments[p.Id] || []).length,
    CanEdit: canEdit(p.Author.UserId), CanDelete: canDelete(p.Author.UserId),
  });
  const commentDto = (c) => Object.assign({}, c, { CanEdit: canEdit(c.Author.UserId), CanDelete: canDelete(c.Author.UserId) });
  const detail = (p) => {
    const i = state.posts.indexOf(p);
    const ref = (x) => x ? { Id: x.Id, Title: x.Title } : null;
    return Object.assign(summary(p), {
      Body: p.Body, Excerpt: undefined, IsTruncated: undefined,
      Comments: (state.comments[p.Id] || []).map(commentDto),
      Newer: ref(state.posts[i - 1]), Older: ref(state.posts[i + 1]),
    });
  };
  const sidebar = () => {
    const years = {};
    state.posts.forEach((p) => {
      const y = p.CreatedUtc.slice(0, 4), m = p.CreatedUtc.slice(5, 7);
      years[y] = years[y] || {};
      (years[y][m] = years[y][m] || []).push({ Id: p.Id, Title: p.Title });
    });
    const labels = {};
    state.posts.forEach((p) => p.Labels.forEach((l) => { labels[l] = (labels[l] || 0) + 1; }));
    const authors = {};
    state.posts.forEach((p) => { const a = authors[p.Author.UserId] = authors[p.Author.UserId] || { UserId: p.Author.UserId, Name: p.Author.Name, PostCount: 0 }; a.PostCount++; });
    const recent = [];
    state.posts.forEach((p) => (state.comments[p.Id] || []).forEach((c) => recent.push({ PostId: p.Id, PostTitle: p.Title, AuthorName: c.Author.Name, Excerpt: c.Body.slice(0, 120), CreatedUtc: c.CreatedUtc })));
    return {
      Archive: Object.keys(years).sort().reverse().map((y) => ({
        Year: Number(y),
        Count: Object.values(years[y]).reduce((n, a) => n + a.length, 0),
        Months: Object.keys(years[y]).sort().reverse().map((m) => ({ Month: Number(m), Count: years[y][m].length, Posts: years[y][m] })),
      })),
      Labels: Object.keys(labels).sort().map((n) => ({ Name: n, Count: labels[n] })),
      Authors: Object.values(authors),
      RecentComments: recent.slice(0, 5),
    };
  };

  async function handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (body, status) => route.fulfill({ status: status || 200, contentType: 'application/json', body: JSON.stringify(body) });
    const text = (status, body) => route.fulfill({ status, contentType: 'text/plain', body: body || '' });
    if (p === '/') {
      return route.fulfill({ contentType: 'text/html', body: pageHtml(opts.drawer) });
    }
    if (p.indexOf('/Blog') === 0 || p === '/Items') {
      state.calls.push({ method: req.method(), path: p, query: url.search, auth: req.headers()['authorization'] || '', body: req.postData() ? JSON.parse(req.postData()) : null });
    }
    if (p === '/Items') {
      const term = (url.searchParams.get('searchTerm') || '').toLowerCase();
      const all = [{ Id: ITEM_A, Name: 'Alien', ProductionYear: 1979 }, { Id: ITEM_B, Name: 'Blade Runner', ProductionYear: 1982 }];
      return json({ Items: all.filter((i) => i.Name.toLowerCase().indexOf(term) >= 0) });
    }
    if (opts.noSession && p.indexOf('/Blog') === 0) { return text(401); }
    if (p === '/Blog/Info') {
      return json({ Title: opts.title || 'Blog de cine', Description: 'Lo que vemos, lo que nos gusta y lo que no.' });
    }
    if (p === '/Blog/Sidebar') { return json(sidebar()); }
    if (p === '/Blog/Posts' && req.method() === 'GET') {
      const q = url.searchParams;
      let list = state.posts.slice();
      if (q.get('label')) { list = list.filter((x) => x.Labels.indexOf(q.get('label')) >= 0); }
      if (q.get('archive')) { list = list.filter((x) => x.CreatedUtc.slice(0, 7) === q.get('archive')); }
      if (q.get('author')) { list = list.filter((x) => x.Author.UserId === q.get('author')); }
      if (q.get('item')) { list = list.filter((x) => x.Mentions.some((m) => m.ItemId === q.get('item'))); }
      if (q.get('q')) { list = list.filter((x) => (x.Title + ' ' + x.Body).toLowerCase().indexOf(q.get('q').toLowerCase()) >= 0); }
      const page = Math.max(1, Number(q.get('page') || 1));
      const slice = list.slice((page - 1) * 10, page * 10);
      return json({ Posts: slice.map(summary), Page: page, HasNewer: page > 1, HasOlder: list.length > page * 10 });
    }
    if (p === '/Blog/Posts' && req.method() === 'POST') {
      const b = JSON.parse(req.postData());
      if (opts.failCreate) { return text(400, opts.failCreate); }
      const post = mkPost(state.nextId++, { Title: b.Title, Body: b.Body, Labels: b.Labels, HasSpoilers: b.HasSpoilers, Author: { UserId: state.me, Name: 'yo' }, CreatedUtc: '2026-12-01T09:00:00.000Z' });
      state.posts.unshift(post);
      return json(detail(post));
    }
    let m = /^\/Blog\/Posts\/([^/]+)$/.exec(p);
    if (m) {
      const post = state.posts.find((x) => x.Id === m[1]);
      if (!post) { return text(404); }
      if (req.method() === 'GET') { return json(detail(post)); }
      if (req.method() === 'PUT') {
        const b = JSON.parse(req.postData());
        Object.assign(post, { Title: b.Title, Body: b.Body, Labels: b.Labels, HasSpoilers: b.HasSpoilers, UpdatedUtc: '2026-12-02T10:00:00.000Z' });
        return json(detail(post));
      }
      if (req.method() === 'DELETE') {
        if (opts.denyDelete) { return text(403); }
        state.posts = state.posts.filter((x) => x !== post);
        return text(204);
      }
    }
    m = /^\/Blog\/Posts\/([^/]+)\/Comments$/.exec(p);
    if (m && req.method() === 'POST') {
      const b = JSON.parse(req.postData());
      const c = { Id: 'c' + state.nextId++, Author: { UserId: state.me, Name: 'yo' }, Body: b.Body, CreatedUtc: '2026-12-01T09:30:00.000Z', UpdatedUtc: null };
      (state.comments[m[1]] = state.comments[m[1]] || []).push(c);
      return json(commentDto(c));
    }
    m = /^\/Blog\/Comments\/([^/]+)$/.exec(p);
    if (m) {
      for (const pid of Object.keys(state.comments)) {
        const c = state.comments[pid].find((x) => x.Id === m[1]);
        if (!c) { continue; }
        if (req.method() === 'PUT') { c.Body = JSON.parse(req.postData()).Body; c.UpdatedUtc = '2026-12-02T10:00:00.000Z'; return json(commentDto(c)); }
        if (req.method() === 'DELETE') { state.comments[pid] = state.comments[pid].filter((x) => x !== c); return text(204); }
      }
      return text(404);
    }
    return text(404);
  }
  return { state, handle };
}

async function newPage(browser, opts, hash) {
  opts = opts || {};
  const ctx = await browser.newContext();
  ctx.setDefaultTimeout(8000);
  const page = await ctx.newPage();
  const backend = makeBackend(opts);
  const errors = [];
  const dialogs = [];
  const popups = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => { dialogs.push(d.type() + ':' + d.message()); d.dismiss().catch(() => {}); });
  ctx.on('page', (p) => { if (p !== page) { popups.push(p.url()); } });
  await page.route('**/*', backend.handle);
  const token = opts.noToken ? '' : 'tok123';
  await page.addInitScript((t) => {
    window.ApiClient = { accessToken: () => t, serverAddress: () => '' };
  }, token);
  await page.goto(ORIGIN + '/' + (hash === undefined ? '#/blog' : hash));
  await page.addScriptTag({ content: SCRIPT });
  return { page, ctx, errors, dialogs, popups, backend, state: backend.state };
}

const results = [];
async function test(name, fn) {
  try { await fn(); results.push([name, true]); console.log('ok   - ' + name); }
  catch (e) { results.push([name, false]); console.log('FAIL - ' + name + '\n' + (e && e.stack || e)); }
}

const ROOT = '#fallbackPage > [data-blog-root]';
const tx = async (page, sel) => (await page.locator(sel).first().textContent()) || '';

(async () => {
  const browser = await chromium.launch();

  await test('/blog: root is appended as last child of #fallbackPage, React child hidden but untouched, title applied', async () => {
    const { page, errors, ctx } = await newPage(browser, { posts: [mkPost(1)], title: 'Mi blog' });
    await page.waitForSelector(ROOT + ' .blogPost');
    assert.strictEqual(await page.locator(ROOT).count(), 1);
    const isLast = await page.evaluate(() => document.getElementById('fallbackPage').lastElementChild.hasAttribute('data-blog-root'));
    assert.ok(isLast, 'data-blog-root must be last child');
    assert.strictEqual(await page.evaluate(() => document.documentElement.classList.contains('blogRoute')), true);
    // El texto de "no encontrada" sigue en el DOM (nodos de React intactos) pero oculto por CSS.
    assert.strictEqual(await page.locator('#reactChild h1').count(), 1);
    assert.strictEqual(await page.locator('#reactChild h1').isVisible(), false);
    assert.strictEqual(await page.evaluate(() => document.getElementById('reactChild').outerHTML.length > 0 && document.getElementById('reactLink').textContent), 'Ir al inicio');
    assert.ok(await page.locator(ROOT).evaluate((n) => n.classList.contains('padded-left') && n.classList.contains('padded-right')));
    await page.waitForFunction(() => document.title === 'Mi blog');
    assert.strictEqual(await page.getAttribute('#fallbackPage', 'data-title'), 'Mi blog');
    assert.strictEqual((await tx(page, '.pageTitle')).trim(), 'Mi blog');
    assert.strictEqual((await tx(page, ROOT + ' .blogTitle')).trim(), 'Mi blog');
    assert.ok((await tx(page, ROOT + ' .blogDescription')).indexOf('Lo que vemos') === 0);
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  await test('sends the Authorization header with the ApiClient token', async () => {
    const { page, state, ctx } = await newPage(browser, { posts: [mkPost(1)] });
    await page.waitForSelector(ROOT + ' .blogPost');
    assert.ok(state.calls.length > 0);
    state.calls.filter((c) => c.path.indexOf('/Blog') === 0).forEach((c) => assert.strictEqual(c.auth, 'MediaBrowser Token="tok123"'));
    await ctx.close();
  });

  await test('list: date headers group posts by day, footer, comment counts, labels and (editado)', async () => {
    const posts = [
      mkPost(3, { Labels: ['terror', 'sci-fi'], UpdatedUtc: '2026-11-03T12:00:00.000Z' }),
      mkPost(2),
      mkPost(1),
    ];
    const { page, ctx } = await newPage(browser, { posts, comments: { [posts[1].Id]: [{ Id: 'c1', Author: { UserId: 'u2', Name: 'ana' }, Body: 'hola', CreatedUtc: '2026-11-02T11:00:00.000Z', UpdatedUtc: null }] } });
    await page.waitForSelector(ROOT + ' .blogPost');
    // posts 3 y 2 caen el 2026-11-02 y 2026-11-02 / 2026-11-03: 3 -> dia 02, 2 -> dia 02, 1 -> dia 01
    const headers = await page.locator(ROOT + ' .blogDateHeader').allTextContents();
    assert.strictEqual(headers.length, 2, headers.join('|'));
    headers.forEach((h) => assert.ok(/^[a-záéíóú]+, \d{1,2} de [a-z]+ de 2026$/.test(h), h));
    assert.strictEqual(await page.locator(ROOT + ' .blogPost').count(), 3);
    const first = page.locator(ROOT + ' .blogPost').first();
    const footer = await first.locator('.blogPostFooter').textContent();
    assert.ok(/Publicado por ana a las \d{2}:\d{2}/.test(footer), footer);
    assert.ok(footer.indexOf('Sin comentarios') >= 0);
    assert.ok(footer.indexOf('(editado)') >= 0);
    assert.ok(footer.indexOf('Etiquetas: terror, sci-fi') >= 0, footer);
    assert.strictEqual(await first.locator('a[href="#/blog?label=terror"]').count(), 1);
    assert.strictEqual(await first.locator('a[href="#/blog?author=u2"], a[href="#/blog?author=u1"]').count(), 1);
    const second = await page.locator(ROOT + ' .blogPost').nth(1).locator('.blogPostFooter').textContent();
    assert.ok(second.indexOf('1 comentario') >= 0 && second.indexOf('1 comentarios') < 0, second);
    assert.strictEqual(await page.locator(ROOT + ' .blogPost h2 a').first().getAttribute('href'), '#/blog?post=' + posts[0].Id);
    await ctx.close();
  });

  await test('list: long posts show the excerpt and a "Leer mas" link; short ones do not', async () => {
    const long = mkPost(2, { Body: 'palabra '.repeat(100) });
    const { page, ctx } = await newPage(browser, { posts: [long, mkPost(1)] });
    await page.waitForSelector(ROOT + ' .blogPost');
    const links = page.locator(ROOT + ' .blogReadMore a');
    assert.strictEqual(await links.count(), 1);
    assert.strictEqual((await links.first().textContent()).trim(), 'Leer más »');
    assert.strictEqual(await links.first().getAttribute('href'), '#/blog?post=' + long.Id);
    await ctx.close();
  });

  await test('list: Blogspot pagination links, page param sent, filters preserved', async () => {
    const posts = [];
    for (let i = 25; i >= 1; i--) { posts.push(mkPost(i, { Labels: ['x'] })); }
    const { page, state, ctx } = await newPage(browser, { posts }, '#/blog?label=x&page=2');
    await page.waitForSelector(ROOT + ' .blogPager');
    const call = state.calls.filter((c) => c.path === '/Blog/Posts').pop();
    assert.ok(call.query.indexOf('page=2') >= 0 && call.query.indexOf('label=x') >= 0, call.query);
    const pager = ROOT + ' .blogPager';
    assert.strictEqual(await page.locator(pager + ' a').count(), 3);
    assert.strictEqual(await page.getAttribute(pager + ' a:has-text("Entradas más recientes")', 'href'), '#/blog?label=x');
    assert.strictEqual(await page.getAttribute(pager + ' a:has-text("Entradas antiguas")', 'href'), '#/blog?label=x&page=3');
    assert.strictEqual(await page.getAttribute(pager + ' a:has-text("Página principal")', 'href'), '#/blog');
    await ctx.close();
  });

  await test('filters: notice with "Mostrar todas las entradas" for label, archive, author, item and search', async () => {
    const posts = [mkPost(2, { Labels: ['terror'], Mentions: [{ ItemId: ITEM_A, Name: 'Alien', Type: 'Movie', ProductionYear: 1979, HasPrimaryImage: true }] }), mkPost(1)];
    const cases = [
      ['#/blog?label=terror', 'con la etiqueta terror'],
      ['#/blog?archive=2026-11', 'de noviembre de 2026'],
      ['#/blog?author=u1', 'de luis'],
      ['#/blog?item=' + ITEM_A, 'que mencionan Alien'],
      ['#/blog?q=entrada', 'que contienen «entrada»'],
    ];
    for (const [hash, expected] of cases) {
      const { page, ctx } = await newPage(browser, { posts }, hash);
      await page.waitForSelector(ROOT + ' .blogNotice');
      const t = await tx(page, ROOT + ' .blogNotice');
      assert.ok(t.indexOf('Mostrando las entradas ' + expected) === 0, hash + ' -> ' + t);
      assert.strictEqual(await page.getAttribute(ROOT + ' .blogNotice a', 'href'), '#/blog');
      assert.ok((await page.locator(ROOT + ' .blogNotice a').textContent()).indexOf('Mostrar todas las entradas') === 0);
      await ctx.close();
    }
  });

  await test('sidebar: search, archive tree with counters, labels, contributors and recent comments', async () => {
    const posts = [mkPost(3, { Labels: ['terror'] }), mkPost(2, { Labels: ['terror', 'drama'] }), mkPost(1)];
    const { page, ctx } = await newPage(browser, { posts, comments: { [posts[0].Id]: [{ Id: 'c1', Author: { UserId: 'u2', Name: 'ana' }, Body: 'gran entrada', CreatedUtc: '2026-11-03T11:00:00.000Z', UpdatedUtc: null }] } });
    await page.waitForSelector(ROOT + ' .blogWidget a[href="#/blog?label=terror"]');
    const side = ROOT + ' .blogSide';
    const headings = await page.locator(side + ' .blogWidget h3').allTextContents();
    assert.deepStrictEqual(headings, ['Buscar en este blog', 'Archivo del blog', 'Etiquetas', 'Colaboradores', 'Comentarios recientes']);
    assert.strictEqual((await page.locator(side + ' details[data-blog-year="2026"] > summary').textContent()).trim(), '2026 (3)');
    const month = side + ' details[data-blog-month="2026-11"]';
    assert.ok((await page.locator(month + ' > summary').textContent()).indexOf('(3)') > 0);
    // Como en Blogspot: el ano y el mes mas recientes salen desplegados, con sus titulos visibles.
    assert.strictEqual(await page.locator(month + ' a[href^="#/blog?post="]').first().isVisible(), true);
    await page.locator(month + ' > summary').click();
    assert.strictEqual(await page.locator(month + ' a[href^="#/blog?post="]').first().isVisible(), false);
    assert.strictEqual(await page.locator(month + ' a[href="#/blog?post=' + posts[0].Id + '"]').count(), 1);
    assert.strictEqual(await page.locator(month + ' a[href="#/blog?archive=2026-11"]').count(), 1);
    assert.strictEqual((await page.locator(side + ' li:has(a[href="#/blog?label=terror"])').textContent()).trim(), 'terror (2)');
    assert.strictEqual((await page.locator(side + ' li:has(a[href="#/blog?label=drama"])').textContent()).trim(), 'drama (1)');
    assert.ok((await page.locator(side + ' li:has(a[href="#/blog?author=u1"])').textContent()).indexOf('luis (1)') >= 0);
    const recent = await page.locator(side + ' .blogWidget:has(h3:text("Comentarios recientes")) li').first().textContent();
    assert.ok(recent.indexOf('ana en Entrada 3') >= 0 && recent.indexOf('gran entrada') > 0, recent);
    await page.fill(side + ' input[type=search]', 'hola mundo');
    await page.click(side + ' button:has-text("Buscar")');
    await page.waitForFunction(() => location.hash === '#/blog?q=hola%20mundo');
    await ctx.close();
  });

  await test('sidebar: open/closed state of the archive survives a repaint', async () => {
    const posts = [mkPost(3), mkPost(2)];
    const { page, ctx } = await newPage(browser, { posts });
    const month = ROOT + ' details[data-blog-month="2026-11"]';
    await page.waitForSelector(month);
    assert.strictEqual(await page.locator(month).evaluate((d) => d.open), true, 'el mes mas reciente sale desplegado');
    await page.locator(month + ' > summary').click();
    await page.evaluate(() => { location.hash = '#/blog?label=nada'; });
    await page.waitForSelector(ROOT + ' .blogNotice');
    await page.waitForSelector(month);
    assert.strictEqual(await page.locator(month).evaluate((d) => d.open), false, 'se respeta que el usuario lo plego');
    await ctx.close();
  });

  await test('view change repaints inside the same #fallbackPage and root (no remount); back button works', async () => {
    const posts = [mkPost(2), mkPost(1)];
    const { page, ctx, errors } = await newPage(browser, { posts });
    await page.waitForSelector(ROOT + ' .blogPost');
    await page.evaluate(() => { window.__pg = document.getElementById('fallbackPage'); window.__root = document.querySelector('[data-blog-root]'); });
    await page.click(ROOT + ' .blogPost h2 a');
    await page.waitForSelector(ROOT + ' .blogCommentForm');
    assert.strictEqual(await page.evaluate(() => window.__pg === document.getElementById('fallbackPage') && window.__root === document.querySelector('[data-blog-root]')), true);
    assert.strictEqual(await page.locator(ROOT + ' .blogPost').count(), 1);
    assert.strictEqual((await tx(page, ROOT + ' .blogPostTitle')).trim(), 'Entrada 2');
    assert.strictEqual(await page.locator('[data-blog-root]').count(), 1);
    await page.goBack();
    await page.waitForFunction(() => document.querySelectorAll('[data-blog-root] .blogPost').length === 2);
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  await test('post view: full body, comments, comment form, newer/older navigation, edit/delete only when allowed', async () => {
    const posts = [mkPost(3), mkPost(2), mkPost(1)];
    const comments = { [posts[1].Id]: [
      { Id: 'c1', Author: { UserId: 'u1', Name: 'luis' }, Body: 'mio', CreatedUtc: '2026-11-02T11:00:00.000Z', UpdatedUtc: null },
      { Id: 'c2', Author: { UserId: 'u2', Name: 'ana' }, Body: 'ajeno', CreatedUtc: '2026-11-02T12:00:00.000Z', UpdatedUtc: '2026-11-02T13:00:00.000Z' },
    ] };
    const { page, ctx } = await newPage(browser, { posts, comments, me: 'u1' }, '#/blog?post=' + posts[1].Id);
    await page.waitForSelector(ROOT + ' .blogCommentForm');
    assert.strictEqual((await tx(page, ROOT + ' .blogPostBody')).trim(), 'Cuerpo de la entrada 2');
    assert.strictEqual((await tx(page, ROOT + ' .blogComments h3')).trim(), '2 comentarios');
    assert.strictEqual(await page.locator(ROOT + ' .blogComment').count(), 2);
    assert.ok((await tx(page, ROOT + ' .blogComment:nth-child(2) .blogCommentMeta')).indexOf('luis') >= 0);
    assert.ok((await page.locator(ROOT + ' .blogComment').nth(1).locator('.blogCommentMeta').textContent()).indexOf('(editado)') >= 0);
    assert.ok((await tx(page, ROOT + ' .blogCommentForm h3')).indexOf('Publicar un comentario') === 0);
    // Comentario propio: Editar + Eliminar; ajeno (no admin): ninguno.
    assert.strictEqual(await page.locator(ROOT + ' .blogComment').first().locator('button:has-text("Editar")').count(), 1);
    assert.strictEqual(await page.locator(ROOT + ' .blogComment').nth(1).locator('button').count(), 0);
    // Entrada 2 es de luis (u1 = yo): Editar y Eliminar.
    assert.strictEqual(await page.locator(ROOT + ' .blogPostActions a:has-text("Editar")').getAttribute('href'), '#/blog?edit=' + posts[1].Id);
    assert.strictEqual(await page.locator(ROOT + ' .blogPostActions button:has-text("Eliminar")').count(), 1);
    assert.strictEqual(await page.getAttribute(ROOT + ' .blogPager a:has-text("Entrada más reciente")', 'href'), '#/blog?post=' + posts[0].Id);
    assert.strictEqual(await page.getAttribute(ROOT + ' .blogPager a:has-text("Entrada antigua")', 'href'), '#/blog?post=' + posts[2].Id);
    await ctx.close();
  });

  await test('post view: another user\'s post has no Editar/Eliminar; admin sees Eliminar but not Editar', async () => {
    const posts = [mkPost(1)]; // de ana (u2)
    let r = await newPage(browser, { posts, me: 'u1' }, '#/blog?post=' + posts[0].Id);
    await r.page.waitForSelector(ROOT + ' .blogCommentForm');
    assert.strictEqual(await r.page.locator(ROOT + ' .blogPostActions').count(), 0);
    await r.ctx.close();
    r = await newPage(browser, { posts: [mkPost(1)], me: 'u1', admin: true }, '#/blog?post=' + posts[0].Id);
    await r.page.waitForSelector(ROOT + ' .blogCommentForm');
    // El mock marca CanEdit solo para el autor; con admin CanDelete = true.
    assert.strictEqual(await r.page.locator(ROOT + ' .blogPostActions a:has-text("Editar")').count(), 0);
    assert.strictEqual(await r.page.locator(ROOT + ' .blogPostActions button:has-text("Eliminar")').count(), 1);
    await r.ctx.close();
  });

  await test('post view: 404 shows a message, not a crash', async () => {
    const { page, ctx, errors } = await newPage(browser, { posts: [mkPost(1)] }, '#/blog?post=00000000-0000-0000-0000-00000000ffff');
    await page.waitForSelector(ROOT + ' .blogError');
    assert.ok((await tx(page, ROOT + ' .blogError')).indexOf('No se encuentra la entrada') === 0);
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  await test('comments: publish posts the body and repaints with the new comment; edit and delete work', async () => {
    const posts = [mkPost(2)];
    const { page, state, ctx } = await newPage(browser, { posts, me: 'u1' }, '#/blog?post=' + posts[0].Id);
    await page.waitForSelector(ROOT + ' .blogCommentForm');
    await page.fill(ROOT + ' .blogCommentForm textarea', 'Mi comentario');
    await page.click(ROOT + ' .blogCommentForm button[type=submit]');
    await page.waitForSelector(ROOT + ' .blogComment');
    const post = state.calls.find((c) => c.method === 'POST' && /Comments$/.test(c.path));
    assert.deepStrictEqual(post.body, { Body: 'Mi comentario' });
    assert.strictEqual((await tx(page, ROOT + ' .blogCommentBody')).trim(), 'Mi comentario');
    // editar
    await page.click(ROOT + ' .blogComment button:has-text("Editar")');
    await page.fill(ROOT + ' .blogComment textarea', 'Cambiado');
    await page.click(ROOT + ' .blogComment button:has-text("Guardar")');
    await page.waitForFunction(() => /Cambiado/.test((document.querySelector('[data-blog-root] .blogCommentBody') || {}).textContent || ''));
    assert.ok((await tx(page, ROOT + ' .blogCommentMeta')).indexOf('(editado)') >= 0);
    assert.ok(state.calls.some((c) => c.method === 'PUT' && /\/Blog\/Comments\//.test(c.path)));
    // borrar con confirmacion en linea
    await page.click(ROOT + ' .blogComment button:has-text("Eliminar")');
    await page.click(ROOT + ' .blogComment button:has-text("Sí, eliminar")');
    await page.waitForFunction(() => document.querySelectorAll('[data-blog-root] .blogComment').length === 0);
    assert.ok(state.calls.some((c) => c.method === 'DELETE' && /\/Blog\/Comments\//.test(c.path)));
    await ctx.close();
  });

  await test('delete post: asks for confirmation (cancel keeps it), confirm deletes and returns to the front page', async () => {
    const posts = [mkPost(2), mkPost(4)];
    const { page, state, ctx, dialogs } = await newPage(browser, { posts, me: 'u1' }, '#/blog?post=' + posts[0].Id);
    await page.waitForSelector(ROOT + ' .blogPostActions');
    await page.click(ROOT + ' .blogPostActions button:has-text("Eliminar")');
    assert.strictEqual(state.calls.filter((c) => c.method === 'DELETE').length, 0);
    await page.click(ROOT + ' .blogPostActions button:has-text("Cancelar")');
    assert.strictEqual(await page.locator(ROOT + ' .blogPostActions button:has-text("Eliminar")').count(), 1);
    assert.strictEqual(state.calls.filter((c) => c.method === 'DELETE').length, 0);
    await page.click(ROOT + ' .blogPostActions button:has-text("Eliminar")');
    await page.click(ROOT + ' .blogPostActions button:has-text("Sí, eliminar entrada")');
    await page.waitForFunction(() => location.hash === '#/blog');
    await page.waitForSelector(ROOT + ' .blogPost');
    assert.strictEqual(await page.locator(ROOT + ' .blogPost').count(), 1);
    assert.deepStrictEqual(dialogs, []);
    await ctx.close();
  });

  await test('delete post: a server 403 is shown as an error and the post stays', async () => {
    const posts = [mkPost(2)];
    const { page, ctx } = await newPage(browser, { posts, me: 'u1', denyDelete: true }, '#/blog?post=' + posts[0].Id);
    await page.waitForSelector(ROOT + ' .blogPostActions');
    await page.click(ROOT + ' .blogPostActions button:has-text("Eliminar")');
    await page.click(ROOT + ' .blogPostActions button:has-text("Sí, eliminar entrada")');
    await page.waitForFunction(() => /permiso/.test((document.querySelector('[data-blog-root] .blogPostActions + .blogError') || {}).textContent || ''));
    assert.strictEqual(await page.evaluate(() => location.hash.indexOf('post=') > 0), true);
    await ctx.close();
  });

  await test('spoilers: body hidden behind a button in list and post view; click reveals it', async () => {
    const posts = [mkPost(2, { HasSpoilers: true, Body: 'El mayordomo es el asesino' })];
    for (const hash of ['#/blog', '#/blog?post=' + posts[0].Id]) {
      const { page, ctx } = await newPage(browser, { posts }, hash);
      await page.waitForSelector(ROOT + ' .blogSpoiler button');
      assert.ok((await page.locator(ROOT).textContent()).indexOf('mayordomo') < 0, hash + ': text must not be in the DOM');
      assert.ok((await tx(page, ROOT + ' .blogSpoiler button')).indexOf('Contiene spoilers — mostrar') === 0);
      await page.click(ROOT + ' .blogSpoiler button');
      assert.ok((await page.locator(ROOT).textContent()).indexOf('El mayordomo es el asesino') >= 0);
      assert.strictEqual(await page.locator(ROOT + ' .blogSpoiler button').count(), 0);
      await ctx.close();
    }
  });

  await test('mentions: poster with image URL, link to details, "Mas entradas" link, name box when no image', async () => {
    const posts = [mkPost(2, { Mentions: [
      { ItemId: ITEM_A, Name: 'Alien', Type: 'Movie', ProductionYear: 1979, HasPrimaryImage: true },
      { ItemId: ITEM_B, Name: 'Sin imagen', Type: 'Series', ProductionYear: null, HasPrimaryImage: false },
    ] })];
    const { page, ctx } = await newPage(browser, { posts });
    await page.waitForSelector(ROOT + ' .blogMention');
    const first = page.locator(ROOT + ' .blogMention').first();
    assert.strictEqual(await first.locator('img').getAttribute('src'), '/Items/' + ITEM_A + '/Images/Primary?fillHeight=180&quality=90');
    assert.strictEqual(await first.locator('a').first().getAttribute('href'), '#/details?id=' + ITEM_A);
    assert.strictEqual(await first.locator('a.blogMentionMore').getAttribute('href'), '#/blog?item=' + ITEM_A);
    const second = page.locator(ROOT + ' .blogMention').nth(1);
    assert.strictEqual(await second.locator('img').count(), 0);
    assert.strictEqual((await second.locator('.blogPosterBox').textContent()).trim(), 'Sin imagen');
    assert.strictEqual(await second.locator('a').first().getAttribute('href'), '#/details?id=' + ITEM_B);
    await ctx.close();
  });

  await test('XSS: <script>, <img onerror> and "><svg onload> in titles, bodies, labels, names, mentions and comments are literal text', async () => {
    const evilPost = mkPost(2, {
      Title: XSS_TITLE + ' ' + XSS_IMG,
      Body: XSS_IMG + '\n' + XSS_SVG + '\n' + XSS_TITLE,
      Labels: [XSS_IMG, XSS_SVG],
      Author: { UserId: 'u1', Name: '<b>' + XSS_IMG + '</b>' },
      Mentions: [{ ItemId: ITEM_A, Name: XSS_SVG, Type: 'Movie', ProductionYear: 1999, HasPrimaryImage: true }],
    });
    const evilComment = { Id: 'c1', Author: { UserId: 'u2', Name: XSS_SVG }, Body: XSS_TITLE + XSS_IMG + XSS_SVG, CreatedUtc: '2026-11-02T11:00:00.000Z', UpdatedUtc: null };
    for (const hash of ['#/blog', '#/blog?post=' + evilPost.Id, '#/blog?label=' + encodeURIComponent(XSS_IMG), '#/blog?q=' + encodeURIComponent(XSS_TITLE)]) {
      const r = await newPage(browser, { posts: [JSON.parse(JSON.stringify(evilPost))], comments: { [evilPost.Id]: [evilComment] } }, hash);
      await r.page.waitForSelector(ROOT + ' .blogWidget:has(h3:text("Etiquetas")) a');
      await r.page.waitForTimeout(150);
      const rootText = await r.page.locator(ROOT).textContent();
      assert.ok(rootText.indexOf('<script>window.__xss=1;alert(1)</script>') >= 0 || hash.indexOf('label') >= 0 || hash.indexOf('q=') >= 0, hash + ': literal <script> text');
      assert.ok(rootText.indexOf('<img src=x onerror=') >= 0, hash + ': literal <img> text');
      assert.strictEqual(await r.page.locator(ROOT + ' script').count(), 0, hash);
      assert.strictEqual(await r.page.locator(ROOT + ' svg').count(), 0, hash);
      assert.strictEqual(await r.page.locator(ROOT + ' img[src="x"]').count(), 0, hash);
      assert.strictEqual(await r.page.locator(ROOT + ' b').count(), 0, hash + ': no <b> from the author name');
      assert.strictEqual(await r.page.evaluate(() => typeof window.__xss), 'undefined', hash);
      assert.deepStrictEqual(r.dialogs, [], hash);
      assert.deepStrictEqual(r.errors, [], hash);
      // Ningun elemento con atributos on* dentro del blog.
      const handlers = await r.page.evaluate(() => Array.from(document.querySelectorAll('[data-blog-root] *')).filter((n) => Array.from(n.attributes).some((a) => /^on/i.test(a.name))).length);
      assert.strictEqual(handlers, 0, hash);
      await r.ctx.close();
    }
  });

  await test('XSS: hostile text in the editor values and in server error messages stays text', async () => {
    const { page, ctx, dialogs, errors } = await newPage(browser, { posts: [], failCreate: 'Error <img src=x onerror="window.__xss=1"> <script>alert(1)</script>' }, '#/blog?new');
    await page.waitForSelector(ROOT + ' form.blogEditor');
    await page.fill('#blogTitleInput', XSS_TITLE);
    await page.fill('#blogBodyInput', XSS_IMG);
    await page.fill('#blogLabelsInput', XSS_SVG);
    await page.click(ROOT + ' button:has-text("Publicar")');
    await page.waitForFunction(() => /Error/.test((document.querySelector('[data-blog-root] .blogError') || {}).textContent || ''));
    assert.ok((await tx(page, ROOT + ' form .blogError')).indexOf('<img src=x onerror="window.__xss=1"> <script>alert(1)</script>') >= 0);
    assert.strictEqual(await page.locator(ROOT + ' script, ' + ROOT + ' form img').count(), 0);
    assert.strictEqual(await page.evaluate(() => typeof window.__xss), 'undefined');
    assert.deepStrictEqual(dialogs, []);
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });

  await test('linkify: http(s) URLs become safe links; javascript: and HTML are not linkified', async () => {
    const body = 'Mira https://example.com/a?b=1, y http://foo.org/x). javascript:alert(1) <a href="javascript:alert(1)">x</a> JAVASCRIPT:alert(2) data:text/html,hola\nlinea https://sub.example.com.';
    const posts = [mkPost(2, { Body: body })];
    const { page, ctx, dialogs } = await newPage(browser, { posts }, '#/blog?post=' + posts[0].Id);
    await page.waitForSelector(ROOT + ' .blogPostBody');
    const links = page.locator(ROOT + ' .blogPostBody a');
    assert.strictEqual(await links.count(), 3);
    assert.deepStrictEqual(await links.evaluateAll((as) => as.map((a) => a.getAttribute('href'))), ['https://example.com/a?b=1', 'http://foo.org/x', 'https://sub.example.com']);
    assert.deepStrictEqual(await links.evaluateAll((as) => as.map((a) => a.getAttribute('target') + '|' + a.getAttribute('rel'))), Array(3).fill('_blank|noopener noreferrer'));
    const text = await tx(page, ROOT + ' .blogPostBody');
    assert.ok(text.indexOf('javascript:alert(1) <a href="javascript:alert(1)">x</a> JAVASCRIPT:alert(2) data:text/html,hola') >= 0, text);
    assert.strictEqual(await page.locator(ROOT + ' a[href^="javascript" i], ' + ROOT + ' a[href^="data" i]').count(), 0);
    assert.strictEqual(await page.locator(ROOT + ' .blogPostBody').evaluate((n) => getComputedStyle(n).whiteSpace), 'pre-wrap');
    // Los enlaces tambien se crean en la lista y en los comentarios.
    assert.deepStrictEqual(dialogs, []);
    await ctx.close();
  });

  await test('linkify: comments get links too and javascript: URLs there stay text', async () => {
    const posts = [mkPost(2)];
    const comments = { [posts[0].Id]: [{ Id: 'c1', Author: { UserId: 'u2', Name: 'ana' }, Body: 'ver https://example.org y javascript:alert(1)', CreatedUtc: '2026-11-02T11:00:00.000Z', UpdatedUtc: null }] };
    const { page, ctx } = await newPage(browser, { posts, comments }, '#/blog?post=' + posts[0].Id);
    await page.waitForSelector(ROOT + ' .blogCommentBody');
    assert.strictEqual(await page.locator(ROOT + ' .blogCommentBody a').count(), 1);
    assert.strictEqual(await page.getAttribute(ROOT + ' .blogCommentBody a', 'href'), 'https://example.org');
    assert.ok((await tx(page, ROOT + ' .blogCommentBody')).indexOf('javascript:alert(1)') > 0);
    await ctx.close();
  });

  await test('editor (new): fields, mention search against the native API, chips, publish payload, then opens the post', async () => {
    const { page, state, ctx } = await newPage(browser, { posts: [] }, '#/blog?new');
    await page.waitForSelector(ROOT + ' form.blogEditor');
    assert.ok((await page.locator(ROOT + ' form label').allTextContents()).some((t) => t.indexOf('Contiene spoilers') >= 0));
    await page.fill('#blogTitleInput', '  Mi título ');
    await page.fill('#blogBodyInput', 'Texto largo\ncon salto');
    await page.fill('#blogLabelsInput', 'terror, Sci-Fi ,, drama');
    await page.check('#blogSpoilersInput');
    await page.fill('#blogMentionSearch', 'ali');
    await page.waitForSelector(ROOT + ' .blogHit');
    const call = state.calls.filter((c) => c.path === '/Items').pop();
    assert.ok(/searchTerm=ali/.test(call.query) && /IncludeItemTypes=Movie,Series/.test(call.query) && /Recursive=true/.test(call.query) && /Limit=8/.test(call.query) && /Fields=ProductionYear/.test(call.query), call.query);
    assert.strictEqual(call.auth, 'MediaBrowser Token="tok123"');
    assert.strictEqual((await tx(page, ROOT + ' .blogHit')).trim(), 'Alien (1979)');
    await page.click(ROOT + ' .blogHit');
    assert.strictEqual(await page.locator(ROOT + ' .blogChip').count(), 1);
    // Anadir el mismo titulo dos veces no duplica.
    await page.fill('#blogMentionSearch', 'ali');
    await page.waitForSelector(ROOT + ' .blogHit');
    await page.click(ROOT + ' .blogHit');
    assert.strictEqual(await page.locator(ROOT + ' .blogChip').count(), 1);
    await page.fill('#blogMentionSearch', 'blade');
    await page.waitForSelector(ROOT + ' .blogHit:has-text("Blade Runner")');
    await page.click(ROOT + ' .blogHit');
    assert.strictEqual(await page.locator(ROOT + ' .blogChip').count(), 2);
    // Quitar chip
    await page.click(ROOT + ' .blogChip:has-text("Blade") .blogChipRemove');
    assert.strictEqual(await page.locator(ROOT + ' .blogChip').count(), 1);

    await page.click(ROOT + ' form.blogEditor button[type=submit]');
    await page.waitForFunction(() => /[?&]post=/.test(location.hash));
    const posted = state.calls.find((c) => c.method === 'POST' && c.path === '/Blog/Posts');
    assert.deepStrictEqual(posted.body, { Title: '  Mi título ', Body: 'Texto largo\ncon salto', Labels: ['terror', 'Sci-Fi', 'drama'], MentionItemIds: [ITEM_A], HasSpoilers: true });
    await page.waitForSelector(ROOT + ' .blogCommentForm');
    assert.strictEqual((await tx(page, ROOT + ' .blogPostTitle')).trim(), '  Mi título '.trim());
    await ctx.close();
  });

  await test('editor: server validation errors are shown as-is, the form stays usable and maxlength attributes are set', async () => {
    const { page, ctx } = await newPage(browser, { posts: [], failCreate: 'El título debe tener entre 1 y 150 caracteres.' }, '#/blog?new');
    await page.waitForSelector(ROOT + ' form.blogEditor');
    await page.fill('#blogTitleInput', 'x');
    await page.fill('#blogBodyInput', 'y');
    await page.click(ROOT + ' form.blogEditor button[type=submit]');
    await page.waitForFunction(() => /150 caracteres/.test((document.querySelector('[data-blog-root] form .blogError') || {}).textContent || ''));
    assert.strictEqual(await page.locator(ROOT + ' form.blogEditor button[type=submit]').isDisabled(), false);
    assert.ok(/#\/blog\?new$/.test(await page.evaluate(() => location.hash)));
    assert.strictEqual(await page.locator(ROOT + ' form input[maxlength="150"]').count(), 1);
    assert.strictEqual(await page.locator(ROOT + ' form textarea[maxlength="20000"]').count(), 1);
    await ctx.close();
  });

  await test('editor (edit): prefilled, saves with PUT and returns to the post; non-authors get a message', async () => {
    const posts = [mkPost(2, { Title: 'Original', Body: 'cuerpo orig', Labels: ['a', 'b'], HasSpoilers: true, Mentions: [{ ItemId: ITEM_A, Name: 'Alien', Type: 'Movie', ProductionYear: 1979, HasPrimaryImage: false }] })];
    let r = await newPage(browser, { posts, me: 'u1' }, '#/blog?edit=' + posts[0].Id);
    await r.page.waitForSelector(ROOT + ' form.blogEditor');
    assert.strictEqual(await r.page.inputValue('#blogTitleInput'), 'Original');
    assert.strictEqual(await r.page.inputValue('#blogBodyInput'), 'cuerpo orig');
    assert.strictEqual(await r.page.inputValue('#blogLabelsInput'), 'a, b');
    assert.strictEqual(await r.page.isChecked('#blogSpoilersInput'), true);
    assert.strictEqual(await r.page.locator(ROOT + ' .blogChip').count(), 1);
    assert.strictEqual(await r.page.getAttribute(ROOT + ' form a:has-text("Cancelar")', 'href'), '#/blog?post=' + posts[0].Id);
    await r.page.fill('#blogTitleInput', 'Editado');
    await r.page.click(ROOT + ' form.blogEditor button[type=submit]');
    await r.page.waitForFunction(() => /[?&]post=/.test(location.hash));
    await r.page.waitForSelector(ROOT + ' .blogCommentForm');
    const put = r.state.calls.find((c) => c.method === 'PUT');
    assert.strictEqual(put.body.Title, 'Editado');
    assert.deepStrictEqual(put.body.MentionItemIds, [ITEM_A]);
    assert.ok((await tx(page_(r), ROOT + ' .blogPostFooter')).indexOf('(editado)') >= 0);
    await r.ctx.close();

    r = await newPage(browser, { posts: [mkPost(1)], me: 'u1' }, '#/blog?edit=' + mkPost(1).Id);
    await r.page.waitForSelector(ROOT + ' .blogError');
    assert.ok((await tx(r.page, ROOT + ' .blogError')).indexOf('Solo el autor') === 0);
    assert.strictEqual(await r.page.locator(ROOT + ' form.blogEditor').count(), 0);
    await r.ctx.close();
  });

  await test('not logged in: shows the login notice with a #/login link and makes no /Blog calls', async () => {
    const { page, state, ctx } = await newPage(browser, { posts: [mkPost(1)], noToken: true });
    await page.waitForSelector(ROOT + ' a[href="#/login"]');
    assert.ok((await tx(page, ROOT)).indexOf('Inicia sesión para leer el blog') >= 0);
    await page.waitForTimeout(200);
    assert.strictEqual(state.calls.filter((c) => c.path.indexOf('/Blog') === 0).length, 0);
    await ctx.close();
  });

  await test('session expires mid-use (401): shows the login notice', async () => {
    const { page, ctx } = await newPage(browser, { posts: [mkPost(1)], noSession: true });
    await page.waitForSelector(ROOT + ' a[href="#/login"]');
    await ctx.close();
  });

  await test('outside /blog nothing is touched: unknown route keeps its own text, no class, no root, no /Blog calls', async () => {
    const { page, state, ctx } = await newPage(browser, { posts: [mkPost(1)] }, '#/algo-que-no-existe');
    await page.waitForSelector('#fallbackPage');
    await page.waitForTimeout(250);
    assert.strictEqual(await page.locator('[data-blog-root]').count(), 0);
    assert.strictEqual(await page.evaluate(() => document.documentElement.classList.contains('blogRoute')), false);
    assert.strictEqual(await page.locator('#reactChild h1').isVisible(), true);
    assert.strictEqual(await page.getAttribute('#fallbackPage', 'data-title'), 'Pagina no encontrada');
    assert.strictEqual(await page.evaluate(() => document.title), '');
    assert.strictEqual((await tx(page, '.pageTitle')).trim(), 'Jellyfin');
    assert.strictEqual(state.calls.length, 0);
    // Prefijos parecidos no cuentan como /blog.
    for (const h of ['#/blogs', '#/blog/extra', '#/myblog']) {
      await page.evaluate((x) => { location.hash = x; }, h);
      await page.waitForTimeout(80);
      assert.strictEqual(await page.locator('[data-blog-root]').count(), 0, h);
      assert.strictEqual(await page.evaluate(() => document.documentElement.classList.contains('blogRoute')), false, h);
    }
    await ctx.close();
  });

  await test('navigating away from /blog drops the class and the blog; coming back repaints it', async () => {
    const { page, ctx } = await newPage(browser, { posts: [mkPost(1)] });
    await page.waitForSelector(ROOT + ' .blogPost');
    await page.evaluate(() => { location.hash = '#/home'; });
    await page.waitForSelector('#homePage');
    assert.strictEqual(await page.evaluate(() => document.documentElement.classList.contains('blogRoute')), false);
    assert.strictEqual(await page.locator('[data-blog-root]').count(), 0);
    await page.evaluate(() => { location.hash = '#/blog'; });
    await page.waitForSelector(ROOT + ' .blogPost');
    assert.strictEqual(await page.locator('[data-blog-root]').count(), 1);
    assert.strictEqual(await page.evaluate(() => document.documentElement.classList.contains('blogRoute')), true);
    await ctx.close();
  });

  await test('route class is set synchronously on hashchange (before any frame)', async () => {
    const { page, ctx } = await newPage(browser, { posts: [mkPost(1)] }, '#/home');
    await page.waitForSelector('#homePage');
    const sync = await page.evaluate(() => new Promise((resolve) => {
      window.addEventListener('hashchange', () => resolve(document.documentElement.classList.contains('blogRoute')));
      location.hash = '#/blog';
    }));
    assert.strictEqual(sync, true);
    await ctx.close();
  });

  await test('route class is set at load time when the page starts on /blog', async () => {
    const { page, ctx } = await newPage(browser, { posts: [mkPost(1)] }, '#/blog?q=x');
    assert.strictEqual(await page.evaluate(() => document.documentElement.classList.contains('blogRoute')), true);
    await ctx.close();
  });

  await test('re-inserts the root if it is removed', async () => {
    const { page, ctx } = await newPage(browser, { posts: [mkPost(1)] });
    await page.waitForSelector(ROOT + ' .blogPost');
    await page.evaluate(() => { document.querySelector('[data-blog-root]').remove(); });
    await page.waitForSelector(ROOT + ' .blogPost');
    assert.strictEqual(await page.locator('[data-blog-root]').count(), 1);
    await ctx.close();
  });

  await test('re-mounts into a brand new #fallbackPage (React remount) while staying on /blog', async () => {
    const { page, ctx } = await newPage(browser, { posts: [mkPost(1)] });
    await page.waitForSelector(ROOT + ' .blogPost');
    await page.evaluate(() => {
      const app = document.getElementById('app');
      app.innerHTML = '';
      const d = document.createElement('div');
      d.innerHTML = '<div id="fallbackPage" class="page" data-title="x"><div class="padded-left padded-right"><h1>otra vez</h1></div></div>';
      app.appendChild(d.firstChild);
    });
    await page.waitForSelector(ROOT + ' .blogPost');
    assert.strictEqual(await page.locator('[data-blog-root]').count(), 1);
    await ctx.close();
  });

  await test('menu click (legacy drawer): intercepted in capture phase, navigates in the same tab, no popup', async () => {
    const { page, ctx, popups } = await newPage(browser, { posts: [mkPost(1)], drawer: LEGACY_DRAWER }, '#/home');
    await page.waitForSelector('#homePage');
    const info = await page.evaluate(() => {
      const a = document.querySelector('.customMenuOptions a[href="#/blog"]');
      const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      let reached = false;
      document.body.addEventListener('click', () => { reached = true; });
      a.dispatchEvent(e);
      return { prevented: e.defaultPrevented, reached, hash: location.hash };
    });
    assert.strictEqual(info.prevented, true);
    assert.strictEqual(info.reached, false, 'stopPropagation must prevent later handlers');
    assert.strictEqual(info.hash, '#/blog');
    await page.waitForSelector(ROOT + ' .blogPost');
    await page.waitForTimeout(150);
    assert.deepStrictEqual(popups, []);
    await ctx.close();
  });

  await test('menu click (real mouse click on target=_blank link) opens no new tab', async () => {
    const { page, ctx, popups } = await newPage(browser, { posts: [mkPost(1)], drawer: LEGACY_DRAWER }, '#/home');
    await page.waitForSelector('#homePage');
    await page.click('.customMenuOptions a');
    await page.waitForSelector(ROOT + ' .blogPost');
    await page.waitForTimeout(150);
    assert.deepStrictEqual(popups, []);
    assert.strictEqual(await page.evaluate(() => location.hash), '#/blog');
    await ctx.close();
  });

  await test('menu click (modern drawer): intercepted and the drawer receives Escape', async () => {
    const { page, ctx, popups } = await newPage(browser, { posts: [mkPost(1)], drawer: MODERN_DRAWER }, '#/home');
    await page.waitForSelector('#homePage');
    await page.click('#modernBlogLink');
    await page.waitForSelector(ROOT + ' .blogPost');
    assert.deepStrictEqual(await page.evaluate(() => window.__drawerKeys), ['Escape']);
    assert.deepStrictEqual(popups, []);
    await ctx.close();
  });

  await test('menu click: links inside the blog and other links are not intercepted', async () => {
    const { page, ctx } = await newPage(browser, { posts: [mkPost(1)], drawer: '<a id="other" href="#/home">inicio</a>' });
    await page.waitForSelector(ROOT + ' .blogPost');
    const prevented = await page.evaluate(() => {
      const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      document.getElementById('other').dispatchEvent(e);
      const home = document.querySelector('[data-blog-root] .blogPager a[href="#/blog"]');
      const e2 = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      home.dispatchEvent(e2);
      return [e.defaultPrevented, e2.defaultPrevented];
    });
    assert.deepStrictEqual(prevented, [false, false]);
    await ctx.close();
  });

  await test('double load guard: loading the script twice keeps one root and one style', async () => {
    const { page, ctx } = await newPage(browser, { posts: [mkPost(1)] });
    await page.waitForSelector(ROOT + ' .blogPost');
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('[data-blog-root]').count(), 1);
    assert.strictEqual(await page.locator('#blogStyle').count(), 1);
    await ctx.close();
  });

  await test('theme: CSS uses --jf-palette-* variables with fallbacks, scoped to [data-blog-root]/html.blogRoute', async () => {
    const { page, ctx } = await newPage(browser, { posts: [mkPost(1)] });
    await page.waitForSelector(ROOT + ' .blogPost');
    const css = await page.locator('#blogStyle').textContent();
    ['--jf-palette-primary-main, #00a4dc', '--jf-palette-background-paper, rgba(255,255,255,.05)', '--jf-palette-text-primary, inherit', '--jf-palette-divider, rgba(128,128,128,.3)'].forEach((v) => assert.ok(css.indexOf('var(' + v + ')') >= 0, v));
    assert.ok(css.indexOf('--jf-palette-text-secondary,') >= 0);
    assert.ok(!/\.Mui/.test(css), 'no MUI classes');
    css.split('}').forEach((rule) => {
      const sel = rule.split('{')[0].replace(/@media[^{]*$/, '').trim();
      if (!sel || sel.charAt(0) === '@') { return; }
      assert.ok(sel.split(',').every((s) => /\[data-blog-root\]|html\.blogRoute/.test(s)), 'unscoped selector: ' + sel);
    });
    // Un tema que define la variable cambia el color de los enlaces.
    await page.evaluate(() => { document.documentElement.style.setProperty('--jf-palette-primary-main', 'rgb(255, 0, 0)'); });
    assert.strictEqual(await page.locator(ROOT + ' .blogBtnPrimary').first().evaluate((n) => getComputedStyle(n).backgroundColor), 'rgb(255, 0, 0)');
    await ctx.close();
  });

  await test('layout: two columns on wide screens, one column below 800px', async () => {
    const { page, ctx } = await newPage(browser, { posts: [mkPost(1)] });
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForSelector(ROOT + ' .blogPost');
    const cols = () => page.locator(ROOT + ' .blogLayout').evaluate((n) => getComputedStyle(n).gridTemplateColumns.split(' ').length);
    assert.strictEqual(await cols(), 2);
    const [mainW, sideW] = await page.evaluate(() => [document.querySelector('.blogMain').getBoundingClientRect().width, document.querySelector('.blogSide').getBoundingClientRect().width]);
    assert.ok(mainW > sideW * 1.6, mainW + ' vs ' + sideW);
    await page.setViewportSize({ width: 600, height: 800 });
    assert.strictEqual(await cols(), 1);
    await ctx.close();
  });

  await test('keyboard/TV: interactive elements are native (a, button, input, textarea, summary), no clickable divs', async () => {
    const posts = [mkPost(2, { HasSpoilers: true, Mentions: [{ ItemId: ITEM_A, Name: 'Alien', Type: 'Movie', ProductionYear: 1979, HasPrimaryImage: false }] })];
    const { page, ctx } = await newPage(browser, { posts, me: 'u1' }, '#/blog?post=' + posts[0].Id);
    await page.waitForSelector(ROOT + ' .blogCommentForm');
    const bad = await page.evaluate(() => Array.from(document.querySelectorAll('[data-blog-root] *')).filter((n) => {
      const tag = n.tagName.toLowerCase();
      return ['div', 'span', 'li', 'p'].indexOf(tag) >= 0 && (n.hasAttribute('tabindex') || n.hasAttribute('onclick') || n.getAttribute('role') === 'button');
    }).length);
    assert.strictEqual(bad, 0);
    await ctx.close();
  });

  await test('debug: localStorage blog.debug=1 logs the mount', async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => logs.push(m.text()));
    const backend = makeBackend({ posts: [mkPost(1)] });
    await page.route('**/*', backend.handle);
    await page.addInitScript(() => { window.ApiClient = { accessToken: () => 't', serverAddress: () => '' }; localStorage.setItem('blog.debug', '1'); });
    await page.goto(ORIGIN + '/#/blog');
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForSelector(ROOT + ' .blogPost');
    assert.ok(logs.some((l) => l === '[Blog] mount: fallbackPage'), logs.join('|'));
    await ctx.close();
  });

  await test('late ApiClient: the login notice is replaced by the blog once the token appears', async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const backend = makeBackend({ posts: [mkPost(1)] });
    await page.route('**/*', backend.handle);
    await page.addInitScript(() => { window.__tok = ''; window.ApiClient = { accessToken: () => window.__tok, serverAddress: () => '' }; });
    await page.goto(ORIGIN + '/#/blog');
    await page.addScriptTag({ content: SCRIPT });
    await page.waitForSelector(ROOT + ' a[href="#/login"]');
    await page.evaluate(() => { window.__tok = 'late'; });
    await page.waitForSelector(ROOT + ' .blogPost', { timeout: 4000 });
    await ctx.close();
  });

  await browser.close();
  const failed = results.filter((r) => !r[1]).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();

function page_(r) { return r.page; }
