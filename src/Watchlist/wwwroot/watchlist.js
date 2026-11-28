(function () {
    if (window.__watchlistLoaded) {
        return;
    }
    window.__watchlistLoaded = true;

    // Watchlist (spec 0004). Principios: anclar por contrato de DOM estable (ids, href, roles),
    // copiar clases del hermano (nunca cloneNode del ancla raiz), un unico MutationObserver
    // agrupado en requestAnimationFrame, inyecciones idempotentes marcadas con data-watchlist,
    // cada estrategia en try/catch y sin FAB de emergencia.

    var BOOKMARK_PATH = 'M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z';
    var LABEL = 'Mi lista';
    var ADD_TEXT = 'Añadir a mi lista';
    var REMOVE_TEXT = 'Quitar de mi lista';

    var ROUTE_RE = /^#!?\/watchlist(\?.*)?$/i;
    var ROOT_ATTR = 'data-watchlist-root';
    var R = '[data-watchlist-root]';
    var VARS = [
        '--w-ink:var(--tt-ink,var(--jf-palette-text-primary,#ebebeb))',
        '--w-muted:var(--tt-muted,var(--jf-palette-text-secondary,rgba(170,170,170,.95)))',
        '--w-accent:var(--tt-coral,var(--jf-palette-primary-main,#00a4dc))',
        '--w-accent-deep:var(--tt-coral-deep,var(--jf-palette-primary-dark,#0086b3))',
        '--w-gold:var(--tt-gold,#e6c75b)',
        '--w-surface:var(--tt-surface,var(--jf-palette-background-paper,rgba(255,255,255,.05)))',
        '--w-surface2:var(--tt-surface-2,rgba(255,255,255,.08))',
        '--w-line:var(--tt-line,var(--jf-palette-divider,rgba(128,128,128,.3)))',
        '--w-serif:var(--tt-serif,Georgia,"Times New Roman",serif)'
    ].join(';');

    function S(sel, css) { return R + (sel ? ' ' + sel : '') + '{' + css + '}'; }

    var STYLE = [
        'html.watchlistRoute #fallbackPage > :not([data-watchlist-root]){display:none !important;}',
        R + '{' + VARS + ';color:var(--w-ink);padding-top:1.2em;padding-bottom:4em;box-sizing:border-box;max-width:1180px;margin:0 auto;}',
        S('*', 'box-sizing:border-box;'),
        S('a,a:visited', 'color:var(--w-accent);text-decoration:none;'),
        S('button:focus-visible,a:focus-visible,select:focus-visible', 'outline:2px solid var(--w-gold);outline-offset:2px;'),
        S('.wlHead', 'display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:1em 2em;margin-bottom:1.2em;'),
        S('.wlTitle', 'font-family:var(--w-serif);font-weight:500;font-size:2.4em;line-height:1.1;margin:0;'),
        S('.wlSub', 'color:var(--w-muted);margin:.35em 0 0;'),
        S('.wlBar', 'display:flex;flex-wrap:wrap;gap:.6em;align-items:center;margin-bottom:1.4em;'),
        S('.wlBtn', 'font:inherit;color:var(--w-ink);background:var(--w-surface2);border:1px solid var(--w-line);border-radius:6px;padding:.55em 1em;cursor:pointer;min-height:44px;'),
        S('.wlBtn:hover', 'border-color:var(--w-accent);'),
        S('.wlBtnMain', 'background:var(--w-accent);border-color:var(--w-accent);color:#fff;font-weight:600;'),
        S('.wlChip', 'font:inherit;color:var(--w-muted);background:transparent;border:1px solid var(--w-line);border-radius:999px;padding:.3em .95em;cursor:pointer;min-height:36px;'),
        S('.wlChip[aria-pressed="true"]', 'color:var(--w-ink);border-color:var(--w-gold);background:var(--w-surface);'),
        S('.wlSelect', 'font:inherit;color:var(--w-ink);background:var(--w-surface2);border:1px solid var(--w-line);border-radius:6px;padding:.5em .7em;min-height:44px;margin-left:auto;'),
        S('.wlGrid', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1.4em 1em;'),
        S('.wlCard', 'position:relative;'),
        S('.wlOpen', 'display:block;width:100%;text-align:left;background:transparent;border:none;color:inherit;font:inherit;cursor:pointer;padding:0;'),
        S('.wlPoster', 'width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:4px;background:var(--w-surface2);display:flex;align-items:center;justify-content:center;text-align:center;padding:.5em;box-sizing:border-box;'),
        S('.wlName', 'display:block;margin-top:.5em;font-size:.98em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'),
        S('.wlMeta', 'display:block;font-size:.82em;color:var(--w-muted);'),
        S('.wlRemove', 'position:absolute;top:.4em;right:.4em;width:2.4em;height:2.4em;border-radius:50%;border:none;background:rgba(0,0,0,.72);color:#fff;cursor:pointer;opacity:.0;transition:opacity .15s;'),
        S('.wlCard:hover .wlRemove,.wlRemove:focus-visible', 'opacity:1;'),
        '@media (hover:none){' + S('.wlRemove', 'opacity:1;') + '}',
        S('.wlEmpty', 'background:var(--w-surface);border:1px solid var(--w-line);border-radius:8px;padding:2em 1.4em;color:var(--w-muted);'),
        S('.wlEmpty h2', 'font-family:var(--w-serif);font-weight:500;color:var(--w-ink);margin:0 0 .4em;font-size:1.5em;'),
        '@media (max-width:640px){' + S('.wlTitle', 'font-size:1.9em;') + S('.wlGrid', 'grid-template-columns:repeat(auto-fill,minmax(130px,1fr));') + '}',
        '.watchlistToast{position:fixed;left:50%;bottom:2em;transform:translateX(-50%);background:#333;color:#fff;padding:.7em 1.2em;border-radius:6px;z-index:10001;max-width:90vw;}'
    ].join('');

    var debugOn = false;
    try { debugOn = window.localStorage.getItem('watchlist.debug') === '1'; } catch (e) { debugOn = false; }
    var lastLogged = {};

    function log(point, strategy) {
        if (!debugOn || lastLogged[point] === strategy) {
            return;
        }
        lastLogged[point] = strategy;
        try { console.log('[Watchlist] ' + point + ': ' + strategy); } catch (e) { /* noop */ }
    }

    function apiClient() { return window.ApiClient || null; }

    function token() {
        var c = apiClient();
        return c && typeof c.accessToken === 'function' ? c.accessToken() : null;
    }

    function isLoggedIn() { return !!token(); }

    function authHeaders() {
        var headers = {};
        var t = token();
        if (t) {
            headers['Authorization'] = 'MediaBrowser Token="' + t + '"';
        }
        return headers;
    }

    function serverAddress() {
        var c = apiClient();
        try {
            var a = c && typeof c.serverAddress === 'function' ? c.serverAddress() : '';
            return a ? String(a).replace(/\/+$/, '') : '';
        } catch (e) {
            return '';
        }
    }

    function request(method, path) {
        return fetch(serverAddress() + path, { method: method, headers: authHeaders() }).then(function (r) {
            if (!r.ok) {
                return r.text().then(function (t) {
                    var err = new Error('HTTP ' + r.status);
                    err.status = r.status;
                    err.detail = t;
                    throw err;
                }, function () {
                    var err = new Error('HTTP ' + r.status);
                    err.status = r.status;
                    throw err;
                });
            }
            return r.status === 204 ? null : r.json();
        });
    }

    // Tambien escapa comillas: el resultado se usa dentro de atributos (src, data-item-id).
    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normId(id) { return String(id || '').replace(/-/g, '').toLowerCase(); }

    // Solo escribe si cambia: evita mutaciones propias que reactivarian el observer en bucle.
    function setAttr(el, name, value) {
        if (el.getAttribute(name) !== value) { el.setAttribute(name, value); }
    }

    function setClass(el, value) {
        if (el.className !== value) { el.className = value; }
    }

    function injectStyle() {
        if (document.getElementById('watchlistStyle')) { return; }
        var s = document.createElement('style');
        s.id = 'watchlistStyle';
        s.textContent = STYLE;
        document.head.appendChild(s);
    }

    function toast(msg) {
        var t = document.createElement('div');
        t.className = 'watchlistToast';
        t.setAttribute('data-watchlist', 'toast');
        t.setAttribute('role', 'status');
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(function () { if (t.parentNode) { t.parentNode.removeChild(t); } }, 4000);
    }

    // ---------------------------------------------------------------- menu entries

    function setMenuLabel(root) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        var done = false;
        var nodes = [];
        while (walker.nextNode()) { nodes.push(walker.currentNode); }
        nodes.forEach(function (n) {
            if (!n.nodeValue.trim() || (n.parentNode && n.parentNode.closest && n.parentNode.closest('.material-icons,svg'))) {
                return;
            }
            if (!done) {
                n.nodeValue = LABEL;
                done = true;
            } else {
                n.nodeValue = '';
            }
        });
        return done;
    }

    // Elemento nuevo del mismo tag con las clases e innerHTML del hermano. Nada de cloneNode:
    // los anclajes legacy son customized built-ins (is="emby-linkbutton").
    function buildMenuEntry(anchor, iconKind) {
        var el = document.createElement(anchor.tagName);
        el.className = anchor.className;
        el.innerHTML = anchor.innerHTML;
        Array.prototype.forEach.call(el.querySelectorAll('[id]'), function (n) { n.removeAttribute('id'); });
        el.setAttribute('data-watchlist', 'menu');
        el.setAttribute('href', '#');
        ['role', 'tabindex'].forEach(function (a) {
            if (anchor.hasAttribute(a)) { el.setAttribute(a, anchor.getAttribute(a)); }
        });

        if (iconKind === 'svg') {
            var svg = el.querySelector('svg');
            if (svg) {
                svg.removeAttribute('data-testid');
                svg.setAttribute('viewBox', '0 0 24 24');
                svg.innerHTML = '<path d="' + BOOKMARK_PATH + '"></path>';
            }
        } else {
            var icon = el.querySelector('.material-icons');
            if (icon) {
                var keep = [];
                Array.prototype.forEach.call(icon.classList, function (c) {
                    if (c === 'material-icons' || c.indexOf('listItemIcon') === 0) { keep.push(c); }
                });
                keep.push('bookmark');
                icon.className = keep.join(' ');
                if (icon.textContent.trim()) { icon.textContent = 'bookmark'; }
            }
        }

        if (!setMenuLabel(el)) { return null; }

        el.addEventListener('click', function (evt) {
            evt.preventDefault();
            evt.stopPropagation();
            closeModernMenu();
            openView();
        });
        return el;
    }

    function closeModernMenu() {
        var root = document.getElementById('app-user-menu');
        if (!root) { return; }
        var menu = root.querySelector('[role="menu"]');
        try {
            (menu || root).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
        } catch (e) { /* noop */ }
        setTimeout(function () {
            try {
                if (window.getComputedStyle(root).visibility === 'hidden') { return; }
                var backdrop = root.querySelector('[aria-hidden="true"]');
                if (backdrop) { backdrop.click(); }
            } catch (e) { /* noop */ }
        }, 150);
    }

    function ensureMenuEntry(anchor, iconKind) {
        var next = anchor.nextElementSibling;
        if (next && next.getAttribute('data-watchlist') === 'menu') { return; }
        // Cualquier entrada huerfana en el mismo padre (React reordeno) se retira antes de reponer.
        Array.prototype.forEach.call(anchor.parentNode.querySelectorAll(':scope > [data-watchlist="menu"]'), function (n) {
            n.parentNode.removeChild(n);
        });
        var el = buildMenuEntry(anchor, iconKind);
        if (el) { anchor.parentNode.insertBefore(el, anchor.nextSibling); }
    }

    function injectMenuModern() {
        var anchor = document.querySelector('#app-user-menu a[href*="mypreferencesmenu"]');
        if (!anchor || !anchor.parentNode) { return false; }
        ensureMenuEntry(anchor, 'svg');
        log('menu', 'modern-app-user-menu');
        return true;
    }

    function injectMenuLegacy() {
        var anchors = document.querySelectorAll('a.lnkUserProfile');
        for (var i = 0; i < anchors.length; i++) {
            var a = anchors[i];
            if (a.closest('.hide') || a.hasAttribute('data-watchlist') || !a.parentNode) { continue; }
            ensureMenuEntry(a, 'font');
            log('menu', 'legacy-lnkUserProfile');
            return true;
        }
        return false;
    }

    // ---------------------------------------------------------------- estado compartido

    var statusCache = {};
    var statusPending = {};

    function currentDetailId() {
        var h = window.location.hash || '';
        if (!/^#!?\/details(\?|$)/i.test(h)) { return null; }
        var m = /[?&]id=([0-9a-fA-F-]{32,36})/.exec(h);
        return m ? normId(m[1]) : null;
    }

    function toggle(id) {
        var st = statusCache[id];
        if (!st || st.busy) { return; }
        var wasIn = st.inList;
        st.busy = true;
        st.inList = !wasIn;
        scheduleRun();
        request(wasIn ? 'DELETE' : 'POST', '/Watchlist/Items/' + encodeURIComponent(id)).then(function () {
            st.busy = false;
        }, function (err) {
            st.busy = false;
            st.inList = wasIn;
            toast(err && err.detail && err.status === 400 ? String(err.detail).replace(/^"|"$/g, '') : 'No se pudo actualizar tu lista.');
            scheduleRun();
        });
    }

    // ---------------------------------------------------------------- actionsheet item (tres puntos)

    // Capturado en captura (antes de que el propio actionsheet.js abra el menu), para saber a
    // que item pertenece el "Mas" que se acaba de pulsar: tarjeta de rejilla o la ficha misma.
    var pendingActionSheetItem = null;

    function captureActionSheetContext(evt) {
        // El boton "Mas" usa clases distintas en la rejilla (.itemAction, carta) y en la ficha
        // (.btnMoreCommands): se detecta por el icono more_vert, comun a los dos sitios.
        var btn = evt.target && evt.target.closest ? evt.target.closest('button, a') : null;
        if (!btn || !btn.querySelector('.more_vert')) { return; }
        var card = btn.closest('.card[data-id]');
        if (card) {
            pendingActionSheetItem = normId(card.getAttribute('data-id'));
            return;
        }
        var id = currentDetailId();
        pendingActionSheetItem = id || null;
    }

    function injectActionSheetItem() {
        var scroller = document.querySelector('.actionSheet.opened .actionSheetScroller');
        if (!scroller || scroller.querySelector('[data-watchlist="actionsheet"]')) { return false; }
        var id = pendingActionSheetItem;
        if (!id) { return false; }

        var st = statusCache[id];
        if (!st) {
            if (!statusPending[id]) {
                statusPending[id] = true;
                request('GET', '/Watchlist/Items/' + encodeURIComponent(id)).then(function (r) {
                    statusCache[id] = { eligible: !!(r && r.Eligible), inList: !!(r && r.InWatchlist), busy: false };
                }, function () {
                    statusCache[id] = { eligible: false, inList: false, busy: false };
                }).then(function () {
                    delete statusPending[id];
                    scheduleRun();
                });
            }
            return true; // el menu sigue abierto; se reintenta en cuanto resuelva el estado
        }
        if (!st.eligible) { return true; }

        var sample = scroller.querySelector('.actionSheetMenuItem');
        if (!sample) { return true; }

        var item = document.createElement(sample.tagName);
        item.className = sample.className;
        if (sample.hasAttribute('is')) { item.setAttribute('is', sample.getAttribute('is')); }
        if (sample.hasAttribute('type')) { item.setAttribute('type', sample.getAttribute('type')); }
        item.setAttribute('data-watchlist', 'actionsheet');
        item.setAttribute('data-item-id', id);

        var inList = st.inList;
        var iconClass = 'actionsheetMenuItemIcon listItemIcon listItemIcon-transparent material-icons ' +
            (inList ? 'bookmark' : 'bookmark_border');
        item.innerHTML = '<span class="' + iconClass + '" aria-hidden="true"></span>' +
            '<div class="listItemBody actionsheetListItemBody"><div class="listItemBodyText actionSheetItemText">' +
            escapeHtml(inList ? REMOVE_TEXT : ADD_TEXT) + '</div></div>';

        // No stopPropagation: el propio actionsheet.js cierra el menu al pulsar cualquier item
        // nativo (verificado en vivo), y un data-id que no reconoce su propio switch no hace nada.
        item.addEventListener('click', function () { toggle(id); });

        scroller.appendChild(item);
        log('actionsheet', 'appended');
        return true;
    }

    // ---------------------------------------------------------------- pantalla #/watchlist

    var root = null;
    var paintedKey = null;
    var viewToken = 0;
    var listState = { kind: 'all', sort: 'added' };

    function isWatchlistRoute() { return ROUTE_RE.test(window.location.hash || ''); }

    function syncRouteClass() {
        var on = isWatchlistRoute();
        var cl = document.documentElement.classList;
        if (cl.contains('watchlistRoute') !== on) { if (on) { cl.add('watchlistRoute'); } else { cl.remove('watchlistRoute'); } }
    }

    function posterUrl(id) {
        return serverAddress() + '/Items/' + encodeURIComponent(id) + '/Images/Primary?fillHeight=360&quality=90';
    }

    function node(tag, attrs, children) {
        var n = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            var v = attrs[k];
            if (v === null || v === undefined || v === false) { return; }
            if (k === 'text') { n.textContent = v; } else if (k === 'class') { n.className = v; } else { n.setAttribute(k, v === true ? '' : v); }
        });
        (children || []).forEach(function (c) { if (c) { n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); } });
        return n;
    }

    function clearNode(n) { while (n.firstChild) { n.removeChild(n.firstChild); } }

    function addedAgo(iso) {
        var t = Date.parse(iso);
        if (isNaN(t)) { return ''; }
        var days = Math.floor((Date.now() - t) / 86400000);
        if (days < 1) { return 'Añadida hoy'; }
        if (days === 1) { return 'Añadida ayer'; }
        if (days < 30) { return 'Añadida hace ' + days + ' días'; }
        var months = Math.floor(days / 30);
        return months < 12 ? 'Añadida hace ' + (months === 1 ? '1 mes' : months + ' meses') : 'Añadida hace más de un año';
    }

    function sortItems(items) {
        var out = items.slice();
        if (listState.sort === 'title') { out.sort(function (a, b) { return String(a.Name).localeCompare(String(b.Name), 'es'); }); }
        else if (listState.sort === 'year') { out.sort(function (a, b) { return (b.ProductionYear || 0) - (a.ProductionYear || 0); }); }
        else if (listState.sort === 'short') { out.sort(function (a, b) { return (a.Minutes || 9999) - (b.Minutes || 9999); }); }
        return out;
    }

    function drawWatchlist(host, items) {
        clearNode(host);
        var shown = items.filter(function (it) { return listState.kind === 'all' || it.Type === listState.kind; });
        var movies = items.filter(function (it) { return it.Type === 'Movie'; }).length;
        var series = items.length - movies;

        var random = node('button', { type: 'button', class: 'wlBtn wlBtnMain', text: 'Sorpréndeme' });
        random.addEventListener('click', function () {
            var pool = shown.length ? shown : items;
            if (!pool.length) { return; }
            window.location.hash = '#/details?id=' + encodeURIComponent(pool[Math.floor(Math.random() * pool.length)].ItemId);
        });
        host.appendChild(node('div', { class: 'wlHead' }, [
            node('div', null, [node('h1', { class: 'wlTitle', text: LABEL }),
                node('p', { class: 'wlSub', text: items.length ? items.length + (items.length === 1 ? ' título pendiente' : ' títulos pendientes') + ' para ver cuando quieras.' : 'Lo que quieres ver más adelante.' })]),
            items.length ? random : null
        ]));

        if (!items.length) {
            host.appendChild(node('div', { class: 'wlEmpty' }, [
                node('h2', { text: 'Tu lista está vacía' }),
                node('p', { text: 'Para añadir una película o serie, abre su menú de tres puntos (en su carátula o en su ficha) y elige «' + ADD_TEXT + '».' })
            ]));
            return;
        }

        var bar = node('div', { class: 'wlBar' });
        [['all', 'Todo (' + items.length + ')'], ['Movie', 'Películas (' + movies + ')'], ['Series', 'Series (' + series + ')']].forEach(function (c) {
            if (c[0] !== 'all' && !((c[0] === 'Movie' ? movies : series))) { return; }
            var b = node('button', { type: 'button', class: 'wlChip', 'aria-pressed': listState.kind === c[0] ? 'true' : 'false', text: c[1] });
            b.addEventListener('click', function () { listState.kind = c[0]; drawWatchlist(host, items); });
            bar.appendChild(b);
        });
        var sel = node('select', { class: 'wlSelect', 'aria-label': 'Ordenar' });
        [['added', 'Más recientes primero'], ['title', 'Por título'], ['year', 'Más nuevas primero'], ['short', 'Más cortas primero']].forEach(function (o) {
            var op = node('option', { value: o[0], text: o[1] });
            if (listState.sort === o[0]) { op.selected = true; }
            sel.appendChild(op);
        });
        sel.addEventListener('change', function () { listState.sort = sel.value; drawWatchlist(host, items); });
        bar.appendChild(sel);
        host.appendChild(bar);

        var grid = node('div', { class: 'wlGrid' });
        sortItems(shown).forEach(function (it) {
            var poster = it.HasPrimaryImage
                ? node('img', { class: 'wlPoster', loading: 'lazy', alt: '', src: posterUrl(it.ItemId) })
                : node('div', { class: 'wlPoster', text: it.Name });
            var open = node('button', { type: 'button', class: 'wlOpen', 'aria-label': 'Abrir ' + it.Name }, [
                poster,
                node('span', { class: 'wlName', text: it.Name }),
                node('span', { class: 'wlMeta', text: [it.ProductionYear, it.Minutes ? Math.floor(it.Minutes / 60) + ' h ' + (it.Minutes % 60) + ' min' : ''].filter(Boolean).join(' · ') }),
                node('span', { class: 'wlMeta', text: addedAgo(it.AddedUtc) })
            ]);
            var rm = node('button', { type: 'button', class: 'wlRemove', title: REMOVE_TEXT, 'aria-label': 'Quitar ' + it.Name + ' de mi lista', text: '✕' });
            open.addEventListener('click', function () { window.location.hash = '#/details?id=' + encodeURIComponent(it.ItemId); });
            rm.addEventListener('click', function () {
                request('DELETE', '/Watchlist/Items/' + encodeURIComponent(it.ItemId)).then(function () {
                    delete statusCache[normId(it.ItemId)];
                    var idx = items.indexOf(it);
                    if (idx >= 0) { items.splice(idx, 1); }
                    if (listState.kind !== 'all' && !items.some(function (x) { return x.Type === listState.kind; })) { listState.kind = 'all'; }
                    drawWatchlist(host, items);
                }, function () { toast('No se pudo quitar el título.'); });
            });
            grid.appendChild(node('div', { class: 'wlCard' }, [open, rm]));
        });
        host.appendChild(grid);
    }

    function paintView() {
        var tk = ++viewToken;
        clearNode(root);
        root.appendChild(node('p', { class: 'wlSub', text: 'Cargando…' }));
        request('GET', '/Watchlist').then(function (items) {
            if (tk === viewToken && root) { drawWatchlist(root, items || []); try { window.scrollTo(0, 0); } catch (e) { /* noop */ } }
        }, function (err) {
            if (tk !== viewToken || !root) { return; }
            clearNode(root);
            root.appendChild(node('p', { class: 'wlSub', text: err && err.status === 401 ? 'Inicia sesión para ver tu lista.' : 'No se pudo cargar tu lista.' }));
        });
    }

    function applyTitle(page) {
        if (page && page.getAttribute('data-title') !== LABEL) { page.setAttribute('data-title', LABEL); }
        if (document.title !== LABEL) { document.title = LABEL; }
        var nodes = document.querySelectorAll('.pageTitle');
        for (var i = 0; i < nodes.length; i++) { if (nodes[i].textContent !== LABEL) { nodes[i].textContent = LABEL; } }
    }

    function mountView() {
        syncRouteClass();
        if (!isWatchlistRoute()) { root = null; paintedKey = null; return; }
        var page = document.getElementById('fallbackPage');
        if (!page || !isLoggedIn()) { return; }
        var existing = null;
        for (var i = 0; i < page.children.length; i++) { if (page.children[i].hasAttribute(ROOT_ATTR)) { existing = page.children[i]; } }
        var fresh = false;
        if (!existing) {
            existing = node('div', { class: 'padded-left padded-right' });
            existing.setAttribute(ROOT_ATTR, '');
            page.appendChild(existing);
            fresh = true;
        }
        if (existing !== root) { fresh = true; }
        root = existing;
        if (page.lastElementChild !== root) { page.appendChild(root); }
        applyTitle(page);
        if (fresh || paintedKey !== 'on') { paintedKey = 'on'; paintView(); }
    }

    function openView() {
        if (isWatchlistRoute()) { paintedKey = null; scheduleRun(); } else { window.location.hash = '#/watchlist'; }
    }

    // ---------------------------------------------------------------- orchestration

    var pendingOpen = /[?&]watchlist=open\b/.test(window.location.hash || '');
    var scheduled = false;

    function safe(name, fn) {
        try { return fn(); } catch (e) {
            if (debugOn) { try { console.log('[Watchlist] ' + name + ' failed', e); } catch (e2) { /* noop */ } }
            return false;
        }
    }

    function run() {
        scheduled = false;
        safe('view', mountView);
        if (!isLoggedIn()) { return; }
        safe('menu-modern', injectMenuModern);
        safe('menu-legacy', injectMenuLegacy);
        safe('actionsheet', injectActionSheetItem);
        if (pendingOpen) {
            pendingOpen = false;
            window.location.hash = '#/watchlist';
        }
    }

    function scheduleRun() {
        if (scheduled) { return; }
        scheduled = true;
        window.requestAnimationFrame(run);
    }

    function init() {
        safe('style', injectStyle);
        var observer = new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
                var t = records[i].target;
                if (t && t.closest && t.closest('[' + ROOT_ATTR + ']')) { continue; }
                scheduleRun();
                return;
            }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        document.addEventListener('click', captureActionSheetContext, true);
        window.addEventListener('hashchange', function () {
            if (/[?&]watchlist=open\b/.test(window.location.hash || '')) { pendingOpen = true; }
            paintedKey = null;
            scheduleRun();
        });
        document.addEventListener('viewshow', function () {
            var id = currentDetailId();
            if (id && !statusPending[id]) { delete statusCache[id]; }
            scheduleRun();
        });
        scheduleRun();
    }

    if (document.body) {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})();
