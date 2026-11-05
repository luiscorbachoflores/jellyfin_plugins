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

    var STYLE = [
        '.watchlistOverlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:3vh 3vw;box-sizing:border-box;}',
        '.watchlistPanel{width:70vw;height:70vh;max-width:1100px;max-height:820px;min-width:320px;min-height:320px;color:inherit;font-family:inherit;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden;}',
        '@media (max-width:700px){.watchlistPanel{width:94vw;height:88vh;}}',
        '.watchlistHeader{display:flex;align-items:center;justify-content:space-between;padding:1em 1.3em;border-bottom:1px solid rgba(128,128,128,.25);flex:0 0 auto;}',
        '.watchlistHeader h2{margin:0;font-size:1.4em;font-weight:500;}',
        '.watchlistClose{background:transparent;border:none;color:inherit;font-size:1.6em;cursor:pointer;padding:.2em .5em;border-radius:4px;}',
        '.watchlistClose:focus,.watchlistCardOpen:focus,.watchlistCardRemove:focus{outline:2px solid #00a4dc;}',
        '.watchlistBody{flex:1 1 auto;overflow-y:auto;padding:1.3em;}',
        '.watchlistGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:1em;}',
        '.watchlistCard{position:relative;}',
        '.watchlistCardOpen{display:block;width:100%;text-align:left;background:transparent;border:none;color:inherit;font:inherit;cursor:pointer;padding:0;}',
        '.watchlistPoster{width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:4px;background:rgba(128,128,128,.25);display:flex;align-items:center;justify-content:center;text-align:center;padding:.5em;box-sizing:border-box;}',
        '.watchlistCardTitle{display:block;margin-top:.4em;font-size:.95em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '.watchlistCardYear{display:block;font-size:.8em;opacity:.7;}',
        '.watchlistCardRemove{position:absolute;top:.3em;right:.3em;width:2em;height:2em;border-radius:50%;border:none;background:rgba(0,0,0,.7);color:#fff;cursor:pointer;}',
        '.watchlistEmpty{opacity:.8;}',
        '.watchlistEmptyIcon{font-size:1.1em;vertical-align:text-bottom;}',
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
            openView(el);
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

    // ---------------------------------------------------------------- watchlist view

    var overlay = null;
    var opener = null;

    function closeView() {
        if (!overlay) { return; }
        var o = overlay;
        overlay = null;
        if (o.parentNode) { o.parentNode.removeChild(o); }
        document.removeEventListener('keydown', onOverlayKey, true);
        try {
            if (opener && document.contains(opener) && opener.focus) { opener.focus(); }
        } catch (e) { /* noop */ }
        opener = null;
    }

    function onOverlayKey(evt) {
        if (!overlay) { return; }
        if (evt.key === 'Escape') {
            evt.preventDefault();
            evt.stopPropagation();
            closeView();
        } else if (evt.key === 'Tab') {
            var f = overlay.querySelectorAll('button');
            if (!f.length) { return; }
            var first = f[0];
            var last = f[f.length - 1];
            if (evt.shiftKey && document.activeElement === first) { evt.preventDefault(); last.focus(); }
            else if (!evt.shiftKey && document.activeElement === last) { evt.preventDefault(); first.focus(); }
        }
    }

    function posterUrl(id) {
        return serverAddress() + '/Items/' + encodeURIComponent(id) + '/Images/Primary?fillHeight=300&quality=90';
    }

    function renderList(body, items) {
        if (!items.length) {
            body.innerHTML = '<p class="watchlistEmpty">Tu lista está vacía. Para añadir una película o serie, abre su menú' +
                ' <span class="material-icons watchlistEmptyIcon" aria-hidden="true">more_vert</span>' +
                ' (en su carátula o en su ficha) y elige «' + ADD_TEXT + '».</p>';
            return;
        }
        var html = '<div class="watchlistGrid">';
        items.forEach(function (it) {
            var name = escapeHtml(it.Name);
            var poster = it.HasPrimaryImage
                ? '<img class="watchlistPoster" loading="lazy" alt="" src="' + escapeHtml(posterUrl(it.ItemId)) + '">'
                : '<div class="watchlistPoster">' + name + '</div>';
            html += '<div class="watchlistCard" data-item-id="' + escapeHtml(it.ItemId) + '">' +
                '<button type="button" class="watchlistCardOpen" aria-label="Abrir ' + name + '">' + poster +
                '<span class="watchlistCardTitle">' + name + '</span>' +
                (it.ProductionYear ? '<span class="watchlistCardYear">' + escapeHtml(it.ProductionYear) + '</span>' : '') +
                '</button>' +
                '<button type="button" class="watchlistCardRemove" title="' + REMOVE_TEXT + '" aria-label="Quitar ' + name + ' de mi lista">✕</button>' +
                '</div>';
        });
        body.innerHTML = html + '</div>';
    }

    function openView(from) {
        if (overlay) { return; }
        injectStyle();
        opener = from || document.activeElement;
        var bg = window.getComputedStyle(document.body).backgroundColor;
        if (!bg || bg === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg)) { bg = '#101010'; }

        overlay = document.createElement('div');
        overlay.className = 'watchlistOverlay';
        overlay.setAttribute('data-watchlist', 'view');
        overlay.addEventListener('mousedown', function (evt) {
            if (evt.target === overlay) { closeView(); }
        });

        var panel = document.createElement('div');
        panel.className = 'watchlistPanel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', LABEL);
        panel.style.backgroundColor = bg;
        panel.innerHTML = '<div class="watchlistHeader"><h2>' + LABEL + '</h2>' +
            '<button type="button" class="watchlistClose" aria-label="Cerrar" title="Cerrar">✕</button></div>' +
            '<div class="watchlistBody"><p class="watchlistEmpty">Cargando…</p></div>';
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        document.addEventListener('keydown', onOverlayKey, true);

        var mine = overlay;
        var body = panel.querySelector('.watchlistBody');
        var closeBtn = panel.querySelector('.watchlistClose');
        closeBtn.addEventListener('click', closeView);
        closeBtn.focus();

        body.addEventListener('click', function (evt) {
            var card = evt.target.closest ? evt.target.closest('.watchlistCard') : null;
            if (!card) { return; }
            var id = card.getAttribute('data-item-id');
            if (evt.target.closest('.watchlistCardRemove')) {
                request('DELETE', '/Watchlist/Items/' + encodeURIComponent(id)).then(function () {
                    delete statusCache[normId(id)];
                    if (card.parentNode) { card.parentNode.removeChild(card); }
                    if (!body.querySelector('.watchlistCard')) { renderList(body, []); }
                }, function () { toast('No se pudo quitar el título.'); });
            } else if (evt.target.closest('.watchlistCardOpen')) {
                closeView();
                window.location.hash = '#/details?id=' + encodeURIComponent(id);
            }
        });

        request('GET', '/Watchlist').then(function (items) {
            if (overlay === mine) { renderList(body, items || []); }
        }, function (err) {
            if (overlay === mine) {
                body.innerHTML = '<p class="watchlistEmpty">' + (err && err.status === 401 ? 'Inicia sesión para ver tu lista.' : 'No se pudo cargar tu lista.') + '</p>';
            }
        });
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
        if (!isLoggedIn()) { return; }
        safe('menu-modern', injectMenuModern);
        safe('menu-legacy', injectMenuLegacy);
        safe('actionsheet', injectActionSheetItem);
        if (pendingOpen) {
            pendingOpen = false;
            safe('open', function () { openView(document.activeElement); });
        }
    }

    function scheduleRun() {
        if (scheduled) { return; }
        scheduled = true;
        window.requestAnimationFrame(run);
    }

    function init() {
        safe('style', injectStyle);
        var observer = new MutationObserver(scheduleRun);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        document.addEventListener('click', captureActionSheetContext, true);
        window.addEventListener('hashchange', function () {
            closeView();
            if (/[?&]watchlist=open\b/.test(window.location.hash || '')) { pendingOpen = true; }
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
