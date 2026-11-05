(function () {
    'use strict';

    if (window.__blogLoaded) {
        return;
    }
    window.__blogLoaded = true;

    // Blog (spec 0001). Pantalla propia en #/blog que se pinta dentro de la ruta comodin de
    // jellyfin-web (#fallbackPage / FallbackRoute). Principios: nunca tocar ni borrar los nodos de
    // React (solo se anade un <div data-blog-root> como ultimo hijo), un unico MutationObserver
    // agrupado en requestAnimationFrame, CSS acotado a [data-blog-root] y a html.blogRoute,
    // y TODO el texto de usuarios se inserta con textContent / createTextNode (nunca innerHTML).

    var ROOT_ATTR = 'data-blog-root';
    var DEFAULT_TITLE = 'Blog de cine';
    var SIDEBAR_TTL = 60000;
    var MAX_MENTIONS = 10;
    var LOGIN_RETRIES = 20;

    var C = {
        primary: 'var(--jf-palette-primary-main, #00a4dc)',
        paper: 'var(--jf-palette-background-paper, rgba(255,255,255,.05))',
        base: 'var(--jf-palette-background-default, rgba(0,0,0,.25))',
        text: 'var(--jf-palette-text-primary, inherit)',
        muted: 'var(--jf-palette-text-secondary, rgba(160,160,160,.95))',
        divider: 'var(--jf-palette-divider, rgba(128,128,128,.3))'
    };

    var R = '[data-blog-root]';
    var STYLE = [
        'html.blogRoute #fallbackPage > :not([data-blog-root]){display:none !important;}',
        R + '{color:' + C.text + ';padding-top:1em;padding-bottom:3em;box-sizing:border-box;}',
        R + ' *{box-sizing:border-box;}',
        R + ' a{color:' + C.primary + ';text-decoration:none;}',
        R + ' a:hover{text-decoration:underline;}',
        R + ' a:focus-visible,' + R + ' button:focus-visible,' + R + ' input:focus-visible,' + R + ' textarea:focus-visible,' + R + ' summary:focus-visible{outline:2px solid ' + C.primary + ';outline-offset:2px;}',
        R + ' .blogHeader{margin-bottom:1.5em;padding-bottom:1em;border-bottom:1px solid ' + C.divider + ';display:flex;flex-wrap:wrap;gap:1em;align-items:flex-end;justify-content:space-between;}',
        R + ' .blogHeaderText{min-width:0;}',
        R + ' .blogTitle{margin:0;font-size:2em;font-weight:500;}',
        R + ' .blogTitle a{color:inherit;}',
        R + ' .blogDescription{margin:.3em 0 0;color:' + C.muted + ';}',
        R + ' .blogLayout{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:2em;align-items:start;}',
        '@media (max-width:800px){' + R + ' .blogLayout{grid-template-columns:minmax(0,1fr);}}',
        R + ' .blogBtn{display:inline-block;font:inherit;font-size:.95em;color:' + C.primary + ';background:transparent;border:1px solid ' + C.primary + ';border-radius:4px;padding:.45em 1em;cursor:pointer;text-decoration:none;}',
        R + ' .blogBtn:hover{text-decoration:none;background:' + C.paper + ';}',
        R + ' .blogBtn[disabled]{opacity:.55;cursor:default;}',
        R + ' .blogBtnPrimary{background:' + C.primary + ';color:#fff;}',
        R + ' .blogBtnPrimary:hover{background:' + C.primary + ';opacity:.9;}',
        R + ' .blogBtnDanger{color:#e57373;border-color:#e57373;}',
        R + ' .blogNotice{margin:0 0 1.2em;padding:.7em 1em;border-left:3px solid ' + C.primary + ';background:' + C.paper + ';}',
        R + ' .blogDateHeader{margin:1.6em 0 .8em;font-size:1em;font-weight:500;color:' + C.muted + ';border-bottom:1px solid ' + C.divider + ';padding-bottom:.3em;}',
        R + ' .blogDateHeader:first-child{margin-top:0;}',
        R + ' .blogPost{background:' + C.paper + ';border-radius:6px;padding:1em 1.2em;margin-bottom:1.2em;}',
        R + ' .blogPostTitle{margin:0 0 .5em;font-size:1.5em;font-weight:500;overflow-wrap:anywhere;}',
        R + ' .blogPostTitle a{color:inherit;}',
        R + ' .blogPostBody,' + R + ' .blogCommentBody{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5;}',
        R + ' .blogReadMore{margin:.6em 0 0;}',
        R + ' .blogMentions{display:flex;flex-wrap:wrap;gap:.9em;margin:1em 0 .2em;}',
        R + ' .blogMention{width:90px;font-size:.8em;}',
        R + ' .blogMention a{display:block;}',
        R + ' .blogPoster{display:block;width:90px;height:135px;object-fit:cover;border-radius:4px;background:rgba(128,128,128,.25);}',
        R + ' .blogPosterBox{display:flex;align-items:center;justify-content:center;width:90px;height:135px;padding:.4em;border-radius:4px;background:rgba(128,128,128,.25);text-align:center;overflow:hidden;overflow-wrap:anywhere;color:' + C.text + ';}',
        R + ' .blogPostImage{display:block;width:100%;max-height:420px;object-fit:cover;border-radius:4px;margin-bottom:.8em;background:rgba(128,128,128,.15);}',
        R + ' .blogEditorImagePreview{display:block;max-width:220px;max-height:220px;object-fit:cover;border-radius:4px;margin-bottom:.5em;}',
        R + ' .blogMentionMore{display:block;margin-top:.3em;line-height:1.2;}',
        R + ' .blogMentionYear{display:block;color:' + C.muted + ';}',
        R + ' .blogPostFooter{margin-top:1em;padding-top:.6em;border-top:1px solid ' + C.divider + ';font-size:.85em;color:' + C.muted + ';}',
        R + ' .blogPostActions{margin:0 0 1.2em;display:flex;flex-wrap:wrap;gap:.6em;align-items:center;}',
        R + ' .blogPager{display:flex;flex-wrap:wrap;gap:1em;justify-content:space-between;margin:1.5em 0;}',
        R + ' .blogComments h3{margin:1.5em 0 .8em;font-size:1.2em;font-weight:500;}',
        R + ' .blogComment{padding:.8em 0;border-bottom:1px solid ' + C.divider + ';}',
        R + ' .blogCommentMeta{font-size:.85em;color:' + C.muted + ';margin-bottom:.3em;}',
        R + ' .blogCommentMeta strong{color:' + C.text + ';}',
        R + ' .blogCommentActions{margin-top:.4em;display:flex;gap:.5em;flex-wrap:wrap;}',
        R + ' .blogField{margin-bottom:1em;}',
        R + ' .blogField label,' + R + ' .blogLabelText{display:block;margin-bottom:.3em;color:' + C.muted + ';font-size:.9em;}',
        R + ' .blogInput,' + R + ' .blogTextarea{display:block;width:100%;font:inherit;color:' + C.text + ';background:' + C.base + ';border:1px solid ' + C.divider + ';border-radius:4px;padding:.6em .7em;}',
        R + ' .blogTextarea{min-height:8em;resize:vertical;}',
        R + ' .blogCheck{display:flex;align-items:center;gap:.5em;}',
        R + ' .blogChips{display:flex;flex-wrap:wrap;gap:.4em;margin:.5em 0;}',
        R + ' .blogChip{display:inline-flex;align-items:center;gap:.3em;padding:.15em .3em .15em .8em;border:1px solid ' + C.divider + ';border-radius:1em;background:' + C.paper + ';}',
        R + ' .blogChipRemove{font:inherit;color:inherit;background:transparent;border:none;cursor:pointer;padding:.1em .5em;border-radius:50%;}',
        R + ' .blogHits{display:flex;flex-direction:column;align-items:stretch;margin-top:.3em;border:1px solid ' + C.divider + ';border-radius:4px;}',
        R + ' .blogHits:empty{display:none;}',
        R + ' .blogHit{font:inherit;text-align:left;color:inherit;background:transparent;border:none;border-bottom:1px solid ' + C.divider + ';padding:.5em .7em;cursor:pointer;}',
        R + ' .blogHit:last-child{border-bottom:none;}',
        R + ' .blogHit:hover{background:' + C.paper + ';}',
        R + ' .blogError{color:#e57373;margin:.5em 0;white-space:pre-wrap;}',
        R + ' .blogMuted{color:' + C.muted + ';}',
        R + ' .blogFormButtons{display:flex;gap:.6em;flex-wrap:wrap;align-items:center;}',
        R + ' .blogWidget{background:' + C.paper + ';border-radius:6px;padding:.8em 1em;margin-bottom:1.2em;}',
        R + ' .blogWidget h3{margin:0 0 .6em;font-size:1.05em;font-weight:500;}',
        R + ' .blogWidget ul{list-style:none;margin:0;padding:0;}',
        R + ' .blogWidget li{margin:.25em 0;overflow-wrap:anywhere;}',
        R + ' .blogSearch{display:flex;gap:.4em;}',
        R + ' .blogSearch .blogInput{flex:1;min-width:0;}',
        R + ' .blogWidget details{margin:.2em 0;}',
        R + ' .blogWidget details details{margin-left:1em;}',
        R + ' .blogWidget summary{cursor:pointer;padding:.15em 0;}',
        R + ' .blogWidget details ul{margin-left:1em;}',
        R + ' .blogRecentExcerpt{display:block;color:' + C.muted + ';font-size:.9em;}'
    ].join('');

    // ---------------------------------------------------------------- debug / api

    var debugOn = false;
    try { debugOn = window.localStorage.getItem('blog.debug') === '1'; } catch (e) { debugOn = false; }
    var lastLogged = {};

    function log(point, detail) {
        if (!debugOn || lastLogged[point] === detail) { return; }
        lastLogged[point] = detail;
        try { console.log('[Blog] ' + point + ': ' + detail); } catch (e) { /* noop */ }
    }

    function apiClient() { return window.ApiClient || null; }

    function token() {
        var c = apiClient();
        try { return c && typeof c.accessToken === 'function' ? c.accessToken() : null; } catch (e) { return null; }
    }

    function isLoggedIn() { return !!token(); }

    function authHeaders() {
        var headers = {};
        var t = token();
        if (t) { headers['Authorization'] = 'MediaBrowser Token="' + t + '"'; }
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

    function currentUserId() {
        var c = apiClient();
        try { return c && typeof c.getCurrentUserId === 'function' ? c.getCurrentUserId() : null; } catch (e) { return null; }
    }

    function parseErrorText(t) {
        t = String(t || '').trim();
        if (!t) { return ''; }
        if (t.charAt(0) === '"' || t.charAt(0) === '{') {
            try {
                var j = JSON.parse(t);
                if (typeof j === 'string') { return j; }
                if (j && j.title) { return String(j.title); }
                return '';
            } catch (e) { /* texto tal cual */ }
        }
        // Un volcado HTML no es un mensaje de validacion.
        return t.length > 300 || t.charAt(0) === '<' ? '' : t;
    }

    function makeError(status, text) {
        var err = new Error('HTTP ' + status);
        err.status = status;
        err.detail = parseErrorText(text);
        return err;
    }

    function request(method, path, body) {
        var headers = authHeaders();
        var opts = { method: method, headers: headers };
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        return fetch(serverAddress() + path, opts).then(function (r) {
            if (!r.ok) {
                return r.text().then(function (t) { throw makeError(r.status, t); }, function () { throw makeError(r.status, ''); });
            }
            return r.status === 204 ? null : r.json();
        });
    }

    function errorMessage(err, fallback) {
        if (err && err.status === 401) { return 'Inicia sesión para usar el blog.'; }
        if (err && err.status === 403) { return err.detail || 'No tienes permiso para hacer eso.'; }
        return (err && err.detail) || fallback;
    }

    // ---------------------------------------------------------------- dom helpers

    function appendChildren(node, children) {
        if (children === null || children === undefined || children === false) { return node; }
        if (!Array.isArray(children)) { children = [children]; }
        children.forEach(function (c) {
            if (c === null || c === undefined || c === false) { return; }
            if (Array.isArray(c)) { appendChildren(node, c); return; }
            node.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
        });
        return node;
    }

    // Unico punto de creacion de elementos. El texto solo entra por textContent/createTextNode.
    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (k) {
                var v = attrs[k];
                if (v === null || v === undefined || v === false) { return; }
                if (k === 'class') { node.className = v; }
                else if (k === 'text') { node.textContent = String(v); }
                else if (k === 'value') { node.value = String(v); }
                else if (k === 'checked') { node.checked = true; }
                else if (k === 'disabled') { node.disabled = true; }
                else if (k.indexOf('on') === 0 && typeof v === 'function') { node.addEventListener(k.slice(2), v); }
                else { node.setAttribute(k, v === true ? '' : String(v)); }
            });
        }
        return appendChildren(node, children);
    }

    function clear(node) {
        while (node.firstChild) { node.removeChild(node.firstChild); }
    }

    function isHttpUrl(s) {
        try {
            var u = new URL(s);
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch (e) {
            return false;
        }
    }

    var URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

    // Texto plano -> fragmento. Solo las URLs http(s) se convierten en enlaces, creando el <a> por DOM.
    function linkify(text) {
        var frag = document.createDocumentFragment();
        text = String(text === null || text === undefined ? '' : text);
        var last = 0;
        var m;
        URL_RE.lastIndex = 0;
        while ((m = URL_RE.exec(text)) !== null) {
            var url = m[0].replace(/[.,;:!?)\]}]+$/, '');
            var end = m.index + url.length;
            if (end <= m.index) { break; }
            if (m.index > last) { frag.appendChild(document.createTextNode(text.slice(last, m.index))); }
            if (isHttpUrl(url)) {
                frag.appendChild(el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: url }));
            } else {
                frag.appendChild(document.createTextNode(url));
            }
            last = end;
            URL_RE.lastIndex = end;
        }
        if (last < text.length) { frag.appendChild(document.createTextNode(text.slice(last))); }
        return frag;
    }

    function normId(id) { return String(id || '').replace(/-/g, '').toLowerCase(); }

    function plural(n, one, many) { return n === 1 ? '1 ' + one : n + ' ' + many; }

    // ---------------------------------------------------------------- dates

    function parseUtc(s) {
        var d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }

    function dateHeaderText(d) {
        try { return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return d.toDateString(); }
    }

    function timeText(d) {
        try { return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return d.toTimeString().slice(0, 5); }
    }

    function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }

    function monthName(year, month) {
        try { return new Date(year, month - 1, 1).toLocaleDateString('es-ES', { month: 'long' }); } catch (e) { return String(month); }
    }

    function dateTimeText(s) {
        var d = parseUtc(s);
        return d ? dateHeaderText(d) + ', ' + timeText(d) : '';
    }

    // ---------------------------------------------------------------- route

    function parseQuery(q) {
        var out = {};
        if (!q) { return out; }
        q.split('&').forEach(function (part) {
            if (!part) { return; }
            var i = part.indexOf('=');
            var k = i >= 0 ? part.slice(0, i) : part;
            var v = i >= 0 ? part.slice(i + 1) : '';
            try { k = decodeURIComponent(k.replace(/\+/g, ' ')); } catch (e) { /* tal cual */ }
            try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { /* tal cual */ }
            out[k] = v;
        });
        return out;
    }

    function currentRoute() {
        var h = window.location.hash || '';
        if (h.charAt(0) === '#') { h = h.slice(1); }
        if (h.charAt(0) === '!') { h = h.slice(1); }
        var qi = h.indexOf('?');
        var path = (qi >= 0 ? h.slice(0, qi) : h).replace(/\/+$/, '').toLowerCase();
        return { path: path, params: parseQuery(qi >= 0 ? h.slice(qi + 1) : ''), key: window.location.hash || '' };
    }

    function isBlogRoute() { return currentRoute().path === '/blog'; }

    // Sincrono: oculta el texto de "pagina no encontrada" desde el primer instante.
    function syncRouteClass() {
        var on = isBlogRoute();
        var cl = document.documentElement.classList;
        if (cl.contains('blogRoute') !== on) {
            if (on) { cl.add('blogRoute'); } else { cl.remove('blogRoute'); }
        }
    }

    function has(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }

    function blogUrl(params) {
        var parts = [];
        Object.keys(params || {}).forEach(function (k) {
            var v = params[k];
            if (v === null || v === undefined || v === '' || v === false) { return; }
            parts.push(v === true ? encodeURIComponent(k) : encodeURIComponent(k) + '=' + encodeURIComponent(v));
        });
        return '#/blog' + (parts.length ? '?' + parts.join('&') : '');
    }

    // ---------------------------------------------------------------- state

    var root = null;
    var paintToken = 0;
    var paintedKey = null;
    var resetScrollNext = false;
    var scheduled = false;
    var loginRetryCount = 0;
    var infoPromise = null;
    var infoCache = null;
    var sidebarCache = null;
    var openState = {};

    function currentTitle() { return infoCache && infoCache.Title ? infoCache.Title : DEFAULT_TITLE; }

    function getInfo() {
        if (!infoPromise) {
            infoPromise = request('GET', '/Blog/Info').then(function (i) {
                infoCache = { Title: (i && i.Title) || DEFAULT_TITLE, Description: (i && i.Description) || '' };
                return infoCache;
            }, function (err) {
                infoPromise = null;
                if (err && err.status === 401) { throw err; }
                return { Title: DEFAULT_TITLE, Description: '' };
            });
        }
        return infoPromise;
    }

    function getSidebar() {
        if (sidebarCache && (Date.now() - sidebarCache.at) < SIDEBAR_TTL) {
            return Promise.resolve(sidebarCache.data);
        }
        return request('GET', '/Blog/Sidebar').then(function (d) {
            sidebarCache = { data: d, at: Date.now() };
            return d;
        });
    }

    function invalidateSidebar() { sidebarCache = null; }

    // Si cambia el token (cambio de usuario en la misma pestaña, sin recargar la pagina) se
    // limpia todo lo cacheado: si no, el sidebar o el titulo de un usuario podrian colarse en
    // la sesion del siguiente.
    var lastSeenToken;
    function clearCachesOnUserChange() {
        var t = token();
        if (t === lastSeenToken) { return; }
        lastSeenToken = t;
        infoPromise = null;
        infoCache = null;
        sidebarCache = null;
    }

    function injectStyle() {
        if (document.getElementById('blogStyle')) { return; }
        var s = document.createElement('style');
        s.id = 'blogStyle';
        s.textContent = STYLE;
        document.head.appendChild(s);
    }

    // ---------------------------------------------------------------- title

    // data-title lo lee libraryMenu en pageshow; ademas se fija document.title y .pageTitle.
    function applyTitle(page) {
        var t = currentTitle();
        if (page && page.getAttribute('data-title') !== t) { page.setAttribute('data-title', t); }
        if (document.title !== t) { document.title = t; }
        var nodes = document.querySelectorAll('.pageTitle');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].textContent !== t) { nodes[i].textContent = t; }
        }
    }

    // ---------------------------------------------------------------- shared widgets

    function showMessage(node, text, isError) {
        clear(node);
        node.appendChild(el('p', { class: isError ? 'blogError' : 'blogMuted', role: isError ? 'alert' : 'status', text: text }));
    }

    function loginNotice() {
        return el('p', { class: 'blogNotice' }, [
            'Inicia sesión para leer el blog. ',
            el('a', { href: '#/login', text: 'Ir a iniciar sesión' })
        ]);
    }

    function viewError(main, err) {
        clear(main);
        if (err && err.status === 401) {
            main.appendChild(loginNotice());
            return;
        }
        main.appendChild(el('p', { class: 'blogError', role: 'alert', text: errorMessage(err, 'No se pudo cargar el blog.') }));
        main.appendChild(el('p', {}, el('a', { href: '#/blog', text: 'Página principal' })));
    }

    // Boton que pide confirmacion en el mismo sitio: sin dialogos nativos ni divs clicables.
    function confirmButton(label, confirmLabel, onConfirm) {
        var wrap = el('span', { class: 'blogConfirm' });
        function reset() {
            clear(wrap);
            wrap.appendChild(el('button', { type: 'button', class: 'blogBtn blogBtnDanger', text: label, onclick: ask }));
        }
        function ask() {
            clear(wrap);
            var yes = el('button', { type: 'button', class: 'blogBtn blogBtnDanger', text: confirmLabel, onclick: function () {
                yes.disabled = true;
                onConfirm(reset);
            } });
            wrap.appendChild(yes);
            wrap.appendChild(document.createTextNode(' '));
            wrap.appendChild(el('button', { type: 'button', class: 'blogBtn', text: 'Cancelar', onclick: reset }));
            yes.focus();
        }
        reset();
        return wrap;
    }

    // La imagen de portada va protegida igual que el resto de la API (requiere el header
    // Authorization), asi que no puede ir como src= directo: se pide con fetch y se vuelca a
    // un object URL. Si falla (borrada, sin acceso...) se quita el <img> sin romper la pagina.
    function imageUrl(postId) { return serverAddress() + '/Blog/Posts/' + encodeURIComponent(postId) + '/Image'; }

    function loadImageInto(imgEl, postId) {
        fetch(imageUrl(postId), { headers: authHeaders() }).then(function (r) {
            if (!r.ok) { throw new Error('HTTP ' + r.status); }
            return r.blob();
        }).then(function (blob) {
            imgEl.src = URL.createObjectURL(blob);
        }).catch(function () {
            if (imgEl.parentNode) { imgEl.parentNode.removeChild(imgEl); }
        });
    }

    function postImageEl(post) {
        if (!post.HasImage) { return null; }
        var img = el('img', { class: 'blogPostImage', alt: '' });
        loadImageInto(img, post.Id);
        return img;
    }

    function uploadImage(postId, file) {
        return fetch(imageUrl(postId), { method: 'POST', headers: authHeaders(), body: (function () {
            var fd = new FormData();
            fd.append('file', file);
            return fd;
        }()) }).then(function (r) {
            if (!r.ok) { throw new Error('HTTP ' + r.status); }
        });
    }

    function mentionsRow(mentions) {
        if (!mentions || !mentions.length) { return null; }
        var row = el('div', { class: 'blogMentions' });
        mentions.forEach(function (m) {
            var label = m.Name + (m.ProductionYear ? ' (' + m.ProductionYear + ')' : '');
            var poster = m.HasPrimaryImage
                ? el('img', { class: 'blogPoster', loading: 'lazy', alt: m.Name, src: serverAddress() + '/Items/' + encodeURIComponent(m.ItemId) + '/Images/Primary?fillHeight=180&quality=90' })
                : el('span', { class: 'blogPosterBox', text: m.Name });
            row.appendChild(el('div', { class: 'blogMention' }, [
                el('a', { href: '#/details?id=' + encodeURIComponent(m.ItemId), title: label }, poster),
                m.ProductionYear ? el('span', { class: 'blogMentionYear', text: String(m.ProductionYear) }) : null,
                el('a', { class: 'blogMentionMore', href: blogUrl({ item: m.ItemId }), text: 'Más entradas', title: 'Más entradas sobre este título' })
            ]));
        });
        return row;
    }

    function spoilerWrap(bodyEl) {
        var wrap = el('div', { class: 'blogSpoiler' });
        var btn = el('button', { type: 'button', class: 'blogBtn', text: 'Contiene spoilers — mostrar' });
        btn.addEventListener('click', function () {
            if (btn.parentNode === wrap) { wrap.replaceChild(bodyEl, btn); }
        });
        wrap.appendChild(btn);
        return wrap;
    }

    function postFooter(post, full) {
        var d = parseUtc(post.CreatedUtc);
        var parts = ['Publicado por ', el('a', { href: blogUrl({ author: post.Author.UserId }), text: post.Author.Name })];
        if (d) { parts.push(' a las ' + timeText(d)); }
        parts.push(' · ');
        var n = post.CommentCount || 0;
        var ctext = n === 0 ? 'Sin comentarios' : plural(n, 'comentario', 'comentarios');
        parts.push(full ? document.createTextNode(ctext) : el('a', { href: blogUrl({ post: post.Id }), text: ctext }));
        if (post.UpdatedUtc) { parts.push(' · (editado)'); }
        if (post.Labels && post.Labels.length) {
            parts.push(' · Etiquetas: ');
            post.Labels.forEach(function (l, i) {
                if (i) { parts.push(', '); }
                parts.push(el('a', { href: blogUrl({ label: l }), text: l }));
            });
        }
        return el('div', { class: 'blogPostFooter' }, parts);
    }

    function postArticle(post, full) {
        var article = el('article', { class: 'blogPost', 'data-blog-post': post.Id });
        article.appendChild(full
            ? el('h2', { class: 'blogPostTitle', text: post.Title })
            : el('h2', { class: 'blogPostTitle' }, el('a', { href: blogUrl({ post: post.Id }), text: post.Title })));
        appendChildren(article, postImageEl(post));
        var bodyEl = el('div', { class: 'blogPostBody' }, linkify(full ? post.Body : post.Excerpt));
        article.appendChild(post.HasSpoilers ? spoilerWrap(bodyEl) : bodyEl);
        if (!full && post.IsTruncated) {
            article.appendChild(el('p', { class: 'blogReadMore' }, el('a', { href: blogUrl({ post: post.Id }), text: 'Leer más »' })));
        }
        appendChildren(article, mentionsRow(post.Mentions));
        article.appendChild(postFooter(post, full));
        return article;
    }

    // ---------------------------------------------------------------- list view

    var FILTER_KEYS = ['label', 'archive', 'author', 'item', 'q'];

    function filterNotice(params, posts) {
        var parts = [];
        function strong(t) { return el('strong', { text: t }); }
        if (params.label) { parts.push(['con la etiqueta ', strong(params.label)]); }
        if (params.archive) {
            var m = /^(\d{4})-(\d{2})$/.exec(params.archive);
            parts.push(['de ', strong(m ? monthName(parseInt(m[1], 10), parseInt(m[2], 10)) + ' de ' + m[1] : params.archive)]);
        }
        if (params.author) {
            var name = null;
            posts.forEach(function (p) { if (!name && normId(p.Author.UserId) === normId(params.author)) { name = p.Author.Name; } });
            if (!name && sidebarCache) {
                (sidebarCache.data.Authors || []).forEach(function (a) { if (!name && normId(a.UserId) === normId(params.author)) { name = a.Name; } });
            }
            parts.push(['de ', strong(name || 'este autor')]);
        }
        if (params.item) {
            var title = null;
            posts.forEach(function (p) {
                (p.Mentions || []).forEach(function (mm) { if (!title && normId(mm.ItemId) === normId(params.item)) { title = mm.Name; } });
            });
            parts.push(['que mencionan ', strong(title || 'este título')]);
        }
        if (params.q) { parts.push(['que contienen ', strong('«' + params.q + '»')]); }
        if (!parts.length) { return null; }

        var kids = ['Mostrando las entradas '];
        parts.forEach(function (p, i) {
            if (i) { kids.push(' y '); }
            kids.push(p);
        });
        kids.push('. ');
        kids.push(el('a', { href: '#/blog', text: 'Mostrar todas las entradas' }));
        return el('p', { class: 'blogNotice' }, kids);
    }

    function pager(params, data) {
        var base = {};
        FILTER_KEYS.forEach(function (k) { if (params[k]) { base[k] = params[k]; } });
        function pageUrl(n) {
            var o = {};
            Object.keys(base).forEach(function (k) { o[k] = base[k]; });
            if (n > 1) { o.page = n; }
            return blogUrl(o);
        }
        var nav = el('nav', { class: 'blogPager', 'aria-label': 'Paginación' });
        nav.appendChild(data.HasNewer ? el('a', { href: pageUrl(data.Page - 1), text: '« Entradas más recientes' }) : el('span'));
        nav.appendChild(el('a', { href: '#/blog', text: 'Página principal' }));
        nav.appendChild(data.HasOlder ? el('a', { href: pageUrl(data.Page + 1), text: 'Entradas antiguas »' }) : el('span'));
        return nav;
    }

    function viewList(main, route, tk) {
        showMessage(main, 'Cargando…', false);
        var params = route.params;
        var qs = [];
        ['page', 'label', 'archive', 'author', 'item', 'q'].forEach(function (k) {
            if (params[k]) { qs.push(k + '=' + encodeURIComponent(params[k])); }
        });
        request('GET', '/Blog/Posts' + (qs.length ? '?' + qs.join('&') : '')).then(function (data) {
            if (tk !== paintToken) { return; }
            clear(main);
            var posts = data.Posts || [];
            appendChildren(main, filterNotice(params, posts));
            if (!posts.length) {
                main.appendChild(el('p', { class: 'blogMuted', text: 'No hay entradas.' }));
            }
            var lastDay = null;
            posts.forEach(function (p) {
                var d = parseUtc(p.CreatedUtc);
                if (d && dayKey(d) !== lastDay) {
                    lastDay = dayKey(d);
                    main.appendChild(el('h3', { class: 'blogDateHeader', text: dateHeaderText(d) }));
                }
                main.appendChild(postArticle(p, false));
            });
            if (posts.length || data.HasNewer || data.HasOlder) { main.appendChild(pager(params, data)); }
        }, function (err) {
            if (tk === paintToken) { viewError(main, err); }
        });
    }

    // ---------------------------------------------------------------- post view

    function commentView(c, onChanged) {
        var box = el('div', { class: 'blogComment', 'data-blog-comment': c.Id });
        var meta = el('div', { class: 'blogCommentMeta' }, [
            el('strong', { text: c.Author.Name }),
            ' · ' + dateTimeText(c.CreatedUtc) + (c.UpdatedUtc ? ' (editado)' : '')
        ]);
        var body = el('div', { class: 'blogCommentBody' }, linkify(c.Body));
        var actions = el('div', { class: 'blogCommentActions' });
        var errorBox = el('div', { class: 'blogError', role: 'alert' });

        if (c.CanEdit) {
            actions.appendChild(el('button', { type: 'button', class: 'blogBtn', text: 'Editar', onclick: function () { startEdit(); } }));
        }
        if (c.CanDelete) {
            actions.appendChild(confirmButton('Eliminar', 'Sí, eliminar', function (reset) {
                request('DELETE', '/Blog/Comments/' + encodeURIComponent(c.Id)).then(function () {
                    onChanged();
                }, function (err) {
                    reset();
                    errorBox.textContent = errorMessage(err, 'No se pudo eliminar el comentario.');
                });
            }));
        }

        function startEdit() {
            var ta = el('textarea', { class: 'blogTextarea', maxlength: 4000, 'aria-label': 'Editar comentario', value: c.Body });
            var form = el('form', {}, [
                ta,
                el('div', { class: 'blogFormButtons' }, [
                    el('button', { type: 'submit', class: 'blogBtn blogBtnPrimary', text: 'Guardar' }),
                    el('button', { type: 'button', class: 'blogBtn', text: 'Cancelar', onclick: function () { onChanged(); } })
                ])
            ]);
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                request('PUT', '/Blog/Comments/' + encodeURIComponent(c.Id), { Body: ta.value }).then(function () {
                    onChanged();
                }, function (err) {
                    errorBox.textContent = errorMessage(err, 'No se pudo guardar el comentario.');
                });
            });
            box.replaceChild(form, body);
            box.removeChild(actions);
            ta.focus();
        }

        box.appendChild(meta);
        box.appendChild(body);
        box.appendChild(actions);
        box.appendChild(errorBox);
        return box;
    }

    function commentsSection(post, onChanged) {
        var section = el('section', { class: 'blogComments' });
        var list = post.Comments || [];
        section.appendChild(el('h3', { text: list.length ? plural(list.length, 'comentario', 'comentarios') : 'Sin comentarios todavía' }));
        list.forEach(function (c) { section.appendChild(commentView(c, onChanged)); });

        var ta = el('textarea', { class: 'blogTextarea', maxlength: 4000, 'aria-label': 'Comentario', placeholder: 'Escribe tu comentario…' });
        var errorBox = el('div', { class: 'blogError', role: 'alert' });
        var submit = el('button', { type: 'submit', class: 'blogBtn blogBtnPrimary', text: 'Publicar comentario' });
        var form = el('form', { class: 'blogCommentForm' }, [
            el('h3', { text: 'Publicar un comentario' }),
            ta,
            errorBox,
            el('div', { class: 'blogFormButtons' }, submit)
        ]);
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            errorBox.textContent = '';
            submit.disabled = true;
            request('POST', '/Blog/Posts/' + encodeURIComponent(post.Id) + '/Comments', { Body: ta.value }).then(function () {
                invalidateSidebar();
                onChanged();
            }, function (err) {
                submit.disabled = false;
                errorBox.textContent = errorMessage(err, 'No se pudo publicar el comentario.');
            });
        });
        section.appendChild(form);
        return section;
    }

    function postNav(post) {
        var nav = el('nav', { class: 'blogPager', 'aria-label': 'Navegación entre entradas' });
        nav.appendChild(post.Newer
            ? el('a', { href: blogUrl({ post: post.Newer.Id }), title: post.Newer.Title, text: '« Entrada más reciente' })
            : el('span'));
        nav.appendChild(el('a', { href: '#/blog', text: 'Página principal' }));
        nav.appendChild(post.Older
            ? el('a', { href: blogUrl({ post: post.Older.Id }), title: post.Older.Title, text: 'Entrada antigua »' })
            : el('span'));
        return nav;
    }

    function viewPost(main, id, tk) {
        showMessage(main, 'Cargando…', false);
        request('GET', '/Blog/Posts/' + encodeURIComponent(id)).then(function (post) {
            if (tk !== paintToken) { return; }
            clear(main);
            function reload() { paintedKey = null; paint(false); }
            main.appendChild(postArticle(post, true));

            if (post.CanEdit || post.CanDelete) {
                var actions = el('div', { class: 'blogPostActions' });
                var errorBox = el('div', { class: 'blogError', role: 'alert' });
                if (post.CanEdit) {
                    actions.appendChild(el('a', { class: 'blogBtn', href: blogUrl({ edit: post.Id }), text: 'Editar' }));
                }
                if (post.CanDelete) {
                    actions.appendChild(confirmButton('Eliminar', 'Sí, eliminar entrada', function (reset) {
                        request('DELETE', '/Blog/Posts/' + encodeURIComponent(post.Id)).then(function () {
                            invalidateSidebar();
                            window.location.hash = '#/blog';
                        }, function (err) {
                            reset();
                            errorBox.textContent = errorMessage(err, 'No se pudo eliminar la entrada.');
                        });
                    }));
                }
                main.appendChild(actions);
                main.appendChild(errorBox);
            }

            main.appendChild(commentsSection(post, function () { invalidateSidebar(); reload(); }));
            main.appendChild(postNav(post));
        }, function (err) {
            if (tk !== paintToken) { return; }
            if (err && err.status === 404) {
                showMessage(main, 'No se encuentra la entrada. Puede que se haya eliminado.', true);
                main.appendChild(el('p', {}, el('a', { href: '#/blog', text: 'Página principal' })));
            } else {
                viewError(main, err);
            }
        });
    }

    // ---------------------------------------------------------------- editor

    function splitLabels(text) {
        return String(text || '').split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
    }

    function buildEditor(main, post) {
        clear(main);
        var mentions = ((post && post.Mentions) || []).map(function (m) {
            return { ItemId: m.ItemId, Name: m.Name, ProductionYear: m.ProductionYear };
        });

        var titleInput = el('input', { class: 'blogInput', type: 'text', id: 'blogTitleInput', maxlength: 150, value: post ? post.Title : '' });
        var bodyInput = el('textarea', { class: 'blogTextarea', id: 'blogBodyInput', maxlength: 20000, rows: 14, value: post ? post.Body : '' });
        var labelsInput = el('input', { class: 'blogInput', type: 'text', id: 'blogLabelsInput', value: post ? (post.Labels || []).join(', ') : '' });
        var spoilersInput = el('input', { type: 'checkbox', id: 'blogSpoilersInput', checked: post ? post.HasSpoilers : false });
        var imageInput = el('input', { type: 'file', id: 'blogImageInput', accept: 'image/jpeg,image/png,image/webp' });
        var removeImageInput = post && post.HasImage ? el('input', { type: 'checkbox', id: 'blogRemoveImageInput' }) : null;
        var imagePreview = post && post.HasImage ? el('img', { class: 'blogEditorImagePreview', alt: '' }) : null;
        if (imagePreview) { loadImageInto(imagePreview, post.Id); }
        imageInput.addEventListener('change', function () {
            var f = imageInput.files && imageInput.files[0];
            if (f && f.size > 5 * 1024 * 1024) {
                errorBox.textContent = 'La imagen no puede superar 5 MB.';
                imageInput.value = '';
            } else {
                errorBox.textContent = '';
            }
        });
        var searchInput = el('input', { class: 'blogInput', type: 'search', id: 'blogMentionSearch', autocomplete: 'off', placeholder: 'Buscar película o serie…' });
        var chips = el('div', { class: 'blogChips' });
        var hits = el('div', { class: 'blogHits' });
        var hint = el('div', { class: 'blogMuted' });
        var errorBox = el('div', { class: 'blogError', role: 'alert' });
        var submit = el('button', { type: 'submit', class: 'blogBtn blogBtnPrimary', text: post ? 'Guardar' : 'Publicar' });

        function renderChips() {
            clear(chips);
            mentions.forEach(function (m, i) {
                chips.appendChild(el('span', { class: 'blogChip', 'data-item-id': m.ItemId }, [
                    m.Name + (m.ProductionYear ? ' (' + m.ProductionYear + ')' : ''),
                    el('button', { type: 'button', class: 'blogChipRemove', 'aria-label': 'Quitar ' + m.Name, title: 'Quitar', text: '✕', onclick: function () {
                        mentions.splice(i, 1);
                        hint.textContent = '';
                        renderChips();
                    } })
                ]));
            });
        }

        function addMention(item) {
            hint.textContent = '';
            if (mentions.some(function (m) { return normId(m.ItemId) === normId(item.Id); })) { return; }
            if (mentions.length >= MAX_MENTIONS) {
                hint.textContent = 'Máximo ' + MAX_MENTIONS + ' títulos mencionados.';
                return;
            }
            mentions.push({ ItemId: item.Id, Name: item.Name, ProductionYear: item.ProductionYear });
            renderChips();
        }

        var searchSeq = 0;
        var searchTimer = null;
        function runSearch() {
            var term = searchInput.value.trim();
            var seq = ++searchSeq;
            if (!term) { clear(hits); return; }
            // API nativa de Jellyfin con el token del usuario: ya respeta sus permisos.
            var uid = currentUserId();
            var url = '/Items?searchTerm=' + encodeURIComponent(term) + '&IncludeItemTypes=Movie,Series&Recursive=true&Limit=8&Fields=ProductionYear' + (uid ? '&userId=' + encodeURIComponent(uid) : '');
            request('GET', url).then(function (res) {
                if (seq !== searchSeq) { return; }
                clear(hits);
                ((res && res.Items) || []).forEach(function (it) {
                    hits.appendChild(el('button', { type: 'button', class: 'blogHit', 'data-item-id': it.Id, text: it.Name + (it.ProductionYear ? ' (' + it.ProductionYear + ')' : ''), onclick: function () {
                        addMention(it);
                        searchInput.value = '';
                        clear(hits);
                        searchInput.focus();
                    } }));
                });
            }, function () {
                if (seq === searchSeq) { clear(hits); }
            });
        }
        searchInput.addEventListener('input', function () {
            if (searchTimer) { clearTimeout(searchTimer); }
            searchTimer = setTimeout(runSearch, 300);
        });
        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
        });

        var form = el('form', { class: 'blogEditor', novalidate: true }, [
            el('h2', { class: 'blogPostTitle', text: post ? 'Editar entrada' : 'Nueva entrada' }),
            el('div', { class: 'blogField' }, [el('label', { for: 'blogTitleInput', text: 'Título' }), titleInput]),
            el('div', { class: 'blogField' }, [el('label', { for: 'blogBodyInput', text: 'Texto' }), bodyInput]),
            el('div', { class: 'blogField' }, [el('label', { for: 'blogLabelsInput', text: 'Etiquetas (separadas por comas, máximo 5)' }), labelsInput]),
            el('div', { class: 'blogField' }, el('label', { class: 'blogCheck', for: 'blogSpoilersInput' }, [spoilersInput, 'Contiene spoilers'])),
            el('div', { class: 'blogField' }, [
                el('label', { for: 'blogImageInput', text: 'Imagen (opcional, JPG/PNG/WebP, máx. 5 MB)' }),
                imagePreview,
                imageInput,
                removeImageInput ? el('label', { class: 'blogCheck' }, [removeImageInput, 'Quitar la imagen actual']) : null
            ]),
            el('div', { class: 'blogField' }, [
                el('label', { for: 'blogMentionSearch', text: 'Títulos mencionados (máximo ' + MAX_MENTIONS + ')' }),
                searchInput, hits, chips, hint
            ]),
            errorBox,
            el('div', { class: 'blogFormButtons' }, [
                submit,
                el('a', { class: 'blogBtn', href: post ? blogUrl({ post: post.Id }) : '#/blog', text: 'Cancelar' })
            ])
        ]);

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            errorBox.textContent = '';
            submit.disabled = true;
            var payload = {
                Title: titleInput.value,
                Body: bodyInput.value,
                Labels: splitLabels(labelsInput.value),
                MentionItemIds: mentions.map(function (m) { return m.ItemId; }),
                HasSpoilers: !!spoilersInput.checked
            };
            var req = post
                ? request('PUT', '/Blog/Posts/' + encodeURIComponent(post.Id), payload)
                : request('POST', '/Blog/Posts', payload);
            req.then(function (saved) {
                var id = saved && saved.Id ? saved.Id : (post && post.Id);
                var file = imageInput.files && imageInput.files[0];
                var imageOp = file
                    ? uploadImage(id, file)
                    : (removeImageInput && removeImageInput.checked ? request('DELETE', '/Blog/Posts/' + encodeURIComponent(id) + '/Image') : Promise.resolve());
                // El texto ya se guardó; si falla solo la imagen no bloqueamos la navegación.
                imageOp.then(function () {
                    invalidateSidebar();
                    window.location.hash = blogUrl({ post: id });
                }, function () {
                    invalidateSidebar();
                    window.location.hash = blogUrl({ post: id });
                });
            }, function (err) {
                submit.disabled = false;
                errorBox.textContent = errorMessage(err, 'No se pudo guardar la entrada.');
            });
        });

        main.appendChild(form);
        renderChips();
        titleInput.focus();
    }

    function viewEditor(main, editId, tk) {
        if (!editId) { buildEditor(main, null); return; }
        showMessage(main, 'Cargando…', false);
        request('GET', '/Blog/Posts/' + encodeURIComponent(editId)).then(function (post) {
            if (tk !== paintToken) { return; }
            if (!post.CanEdit) {
                showMessage(main, 'Solo el autor puede editar esta entrada.', true);
                main.appendChild(el('p', {}, el('a', { href: blogUrl({ post: post.Id }), text: 'Volver a la entrada' })));
                return;
            }
            buildEditor(main, post);
        }, function (err) {
            if (tk !== paintToken) { return; }
            if (err && err.status === 404) {
                showMessage(main, 'No se encuentra la entrada.', true);
            } else {
                viewError(main, err);
            }
        });
    }

    // ---------------------------------------------------------------- sidebar

    function widget(title, content) {
        return el('section', { class: 'blogWidget' }, [el('h3', { text: title }), content]);
    }

    function archiveWidget(archive, params) {
        var wrap = el('div', { class: 'blogArchive' });
        if (!archive.length) { wrap.appendChild(el('span', { class: 'blogMuted', text: 'Todavía no hay entradas.' })); }
        archive.forEach(function (y, yi) {
            var yKey = 'y' + y.Year;
            var mm = /^(\d{4})-(\d{2})$/.exec(params.archive || '');
            var yOpen = has(openState, yKey) ? openState[yKey] : (yi === 0 || (mm && parseInt(mm[1], 10) === y.Year));
            var yDet = el('details', { 'data-blog-year': y.Year }, el('summary', { text: y.Year + ' (' + y.Count + ')' }));
            if (yOpen) { yDet.open = true; }
            yDet.addEventListener('toggle', function () { openState[yKey] = yDet.open; });
            (y.Months || []).forEach(function (mo, mi) {
                var mKey = 'm' + y.Year + '-' + mo.Month;
                var padded = (mo.Month < 10 ? '0' : '') + mo.Month;
                var archiveKey = y.Year + '-' + padded;
                var mOpen = has(openState, mKey) ? openState[mKey] : (params.archive ? params.archive === archiveKey : (yi === 0 && mi === 0));
                var mDet = el('details', { 'data-blog-month': archiveKey }, el('summary', { text: monthName(y.Year, mo.Month) + ' (' + mo.Count + ')' }));
                if (mOpen) { mDet.open = true; }
                mDet.addEventListener('toggle', function () { openState[mKey] = mDet.open; });
                var ul = el('ul');
                ul.appendChild(el('li', {}, el('a', { href: blogUrl({ archive: archiveKey }), text: 'Ver todo el mes' })));
                (mo.Posts || []).forEach(function (p) {
                    ul.appendChild(el('li', {}, el('a', { href: blogUrl({ post: p.Id }), text: p.Title })));
                });
                mDet.appendChild(ul);
                yDet.appendChild(mDet);
            });
            wrap.appendChild(yDet);
        });
        return wrap;
    }

    function listWidget(items, build, emptyText) {
        if (!items.length) { return el('span', { class: 'blogMuted', text: emptyText }); }
        var ul = el('ul');
        items.forEach(function (it) { ul.appendChild(el('li', {}, build(it))); });
        return ul;
    }

    function renderSidebarData(side, data, params) {
        clear(side);
        var searchInput = el('input', { class: 'blogInput', type: 'search', 'aria-label': 'Buscar en este blog', placeholder: 'Buscar…', value: params.q || '' });
        var searchForm = el('form', { class: 'blogSearch', role: 'search' }, [
            searchInput,
            el('button', { type: 'submit', class: 'blogBtn', text: 'Buscar' })
        ]);
        searchForm.addEventListener('submit', function (e) {
            e.preventDefault();
            window.location.hash = blogUrl({ q: searchInput.value.trim() });
        });

        side.appendChild(widget('Buscar en este blog', searchForm));
        side.appendChild(widget('Archivo del blog', archiveWidget(data.Archive || [], params)));
        side.appendChild(widget('Etiquetas', listWidget(data.Labels || [], function (l) {
            return [el('a', { href: blogUrl({ label: l.Name }), text: l.Name }), ' (' + l.Count + ')'];
        }, 'Sin etiquetas.')));
        side.appendChild(widget('Colaboradores', listWidget(data.Authors || [], function (a) {
            return [el('a', { href: blogUrl({ author: a.UserId }), text: a.Name }), ' (' + a.PostCount + ')'];
        }, 'Sin colaboradores.')));
        side.appendChild(widget('Comentarios recientes', listWidget(data.RecentComments || [], function (c) {
            return [
                c.AuthorName + ' en ',
                el('a', { href: blogUrl({ post: c.PostId }), text: c.PostTitle }),
                el('span', { class: 'blogRecentExcerpt', text: c.Excerpt })
            ];
        }, 'Sin comentarios.')));
    }

    function renderSidebar(side, route, tk) {
        // Buscador siempre disponible, aunque falle la carga del resto.
        renderSidebarData(side, { Archive: [], Labels: [], Authors: [], RecentComments: [] }, route.params);
        getSidebar().then(function (data) {
            if (tk === paintToken) { renderSidebarData(side, data, route.params); }
        }, function () {
            if (tk === paintToken) {
                side.appendChild(el('p', { class: 'blogMuted', text: 'No se pudo cargar la barra lateral.' }));
            }
        });
    }

    // ---------------------------------------------------------------- paint

    function fillHeader(header, info) {
        clear(header);
        header.appendChild(el('div', { class: 'blogHeaderText' }, [
            el('h1', { class: 'blogTitle' }, el('a', { href: '#/blog', text: info.Title })),
            info.Description ? el('p', { class: 'blogDescription', text: info.Description }) : null
        ]));
        header.appendChild(el('a', { class: 'blogBtn blogBtnPrimary', href: '#/blog?new', text: 'Nueva entrada' }));
    }

    function paint(resetScroll) {
        if (!root) { return; }
        var route = currentRoute();
        var tk = ++paintToken;
        paintedKey = route.key + '|' + (isLoggedIn() ? '1' : '0');
        clear(root);

        if (!isLoggedIn()) {
            root.appendChild(loginNotice());
            scheduleLoginRetry();
            return;
        }

        loginRetryCount = 0;
        var header = el('header', { class: 'blogHeader' });
        var main = el('div', { class: 'blogMain' });
        var side = el('aside', { class: 'blogSide' });
        root.appendChild(header);
        root.appendChild(el('div', { class: 'blogLayout' }, [main, side]));

        fillHeader(header, { Title: currentTitle(), Description: infoCache ? infoCache.Description : '' });
        getInfo().then(function (info) {
            if (tk !== paintToken) { return; }
            fillHeader(header, info);
            if (root && root.parentNode) { applyTitle(root.parentNode); }
        }, function () { /* sin cabecera personalizada */ });

        renderSidebar(side, route, tk);

        var p = route.params;
        if (has(p, 'new')) { viewEditor(main, null, tk); }
        else if (p.edit) { viewEditor(main, p.edit, tk); }
        else if (p.post) { viewPost(main, p.post, tk); }
        else { viewList(main, route, tk); }

        if (resetScroll) {
            try { window.scrollTo(0, 0); } catch (e) { /* noop */ }
        }
        log('view', route.key);
    }

    function findRoot(page) {
        for (var i = 0; i < page.children.length; i++) {
            if (page.children[i].hasAttribute(ROOT_ATTR)) { return page.children[i]; }
        }
        return null;
    }

    function run() {
        scheduled = false;
        clearCachesOnUserChange();
        syncRouteClass();
        if (!isBlogRoute()) {
            // Fuera de /blog no se toca nada; React desmonta #fallbackPage y el blog desaparece con ella.
            root = null;
            paintedKey = null;
            return;
        }
        var page = document.getElementById('fallbackPage');
        if (!page) { return; }

        var existing = findRoot(page);
        var fresh = false;
        if (!existing) {
            existing = el('div', { class: 'padded-left padded-right' });
            existing.setAttribute(ROOT_ATTR, '');
            page.appendChild(existing);
            fresh = true;
            log('mount', 'fallbackPage');
        }
        if (existing !== root) { fresh = true; }
        root = existing;
        if (page.lastElementChild !== root) { page.appendChild(root); }

        applyTitle(page);

        var key = currentRoute().key + '|' + (isLoggedIn() ? '1' : '0');
        if (fresh || paintedKey !== key) {
            var reset = resetScrollNext;
            resetScrollNext = false;
            paint(reset);
        }
    }

    function scheduleRun() {
        if (scheduled) { return; }
        scheduled = true;
        window.requestAnimationFrame(run);
    }

    function scheduleLoginRetry() {
        // ApiClient puede no estar listo cuando carga el script: reintenta unos segundos.
        if (loginRetryCount >= LOGIN_RETRIES) { return; }
        loginRetryCount++;
        setTimeout(function () { if (isBlogRoute()) { scheduleRun(); } }, 500);
    }

    // ---------------------------------------------------------------- menu click

    function closeDrawerFor(a) {
        var drawer = a.closest ? a.closest('.MuiDrawer-root, .mainDrawer') : null;
        if (!drawer) { return; }
        try {
            drawer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
        } catch (e) { /* noop */ }
    }

    // Los dos layouts ponen target=_blank a los menuLinks: se intercepta en captura y se navega en la misma pestana.
    function onDocumentClick(evt) {
        if (evt.button !== 0 || evt.ctrlKey || evt.metaKey || evt.shiftKey || evt.altKey) { return; }
        var t = evt.target;
        var a = t && t.closest ? t.closest('a') : null;
        if (!a || (a.closest && a.closest('[' + ROOT_ATTR + ']'))) { return; }
        var href = a.getAttribute('href') || '';
        if (!/#\/blog$/i.test(href)) { return; }
        evt.preventDefault();
        evt.stopPropagation();
        log('menu', 'click intercepted');
        window.location.hash = '#/blog';
        closeDrawerFor(a);
    }

    // ---------------------------------------------------------------- init

    function onMutations(records) {
        for (var i = 0; i < records.length; i++) {
            var tgt = records[i].target;
            // Los cambios dentro del propio blog no necesitan reevaluar nada.
            if (tgt && tgt.closest && tgt.closest('[' + ROOT_ATTR + ']')) { continue; }
            scheduleRun();
            return;
        }
    }

    function init() {
        injectStyle();
        var observer = new MutationObserver(onMutations);
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('hashchange', function () {
            syncRouteClass();
            resetScrollNext = true;
            scheduleRun();
        });
        document.addEventListener('click', onDocumentClick, true);
        scheduleRun();
    }

    syncRouteClass();
    if (document.body) {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})();
