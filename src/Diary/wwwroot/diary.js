(function () {
    'use strict';

    if (window.__diaryLoaded) {
        return;
    }
    window.__diaryLoaded = true;

    // Diario de cine. Pantalla propia en #/diary (lista) y #/diary/year/AAAA (resumen del
    // año) pintada dentro de la ruta comodín de jellyfin-web (#fallbackPage). Mismos principios que el
    // Blog: no se tocan los nodos de React (solo se añade un <div data-diary-root> como último hijo), un
    // único MutationObserver agrupado en requestAnimationFrame, CSS acotado a [data-diary-root] y a
    // html.diaryRoute, y todo texto de usuario con textContent (nunca innerHTML). Solo usa APIs públicas
    // y estables del cliente web: window.ApiClient, el hash de la URL y los ids/clases del menú de usuario.

    var ROOT_ATTR = 'data-diary-root';
    var MENU_ATTR = 'data-diary';
    var LABEL = 'Mi diario';
    var BOOK_PATH = 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z';
    var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    var WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
    var SOURCES = { played: 'Vista aquí', marked: 'Marcada a mano', imported: 'Importada', manual: 'Añadida a mano' };
    var LOGIN_RETRIES = 20;

    var R = '[data-diary-root]';
    var VARS = [
        '--d-ink:var(--tt-ink,var(--jf-palette-text-primary,#ebebeb))',
        '--d-muted:var(--tt-muted,var(--jf-palette-text-secondary,rgba(170,170,170,.95)))',
        '--d-accent:var(--tt-coral,var(--jf-palette-primary-main,#00a4dc))',
        '--d-accent-deep:var(--tt-coral-deep,var(--jf-palette-primary-dark,#0086b3))',
        '--d-gold:var(--tt-gold,#e6c75b)',
        '--d-surface:var(--tt-surface,var(--jf-palette-background-paper,rgba(255,255,255,.05)))',
        '--d-surface2:var(--tt-surface-2,rgba(255,255,255,.08))',
        '--d-field:var(--tt-bg,var(--jf-palette-background-default,rgba(0,0,0,.25)))',
        '--d-line:var(--tt-line,var(--jf-palette-divider,rgba(128,128,128,.3)))',
        '--d-serif:var(--tt-serif,Georgia,"Times New Roman",serif)',
        '--d-danger:#e57373'
    ].join(';');

    function S(sel, css) { return R + (sel ? ' ' + sel : '') + '{' + css + '}'; }

    var STYLE = [
        'html.diaryRoute #fallbackPage > :not([data-diary-root]){display:none !important;}',
        R + '{' + VARS + ';color:var(--d-ink);padding-top:1.2em;padding-bottom:4em;box-sizing:border-box;max-width:1100px;margin:0 auto;}',
        S('*', 'box-sizing:border-box;'),
        S('a,a:visited', 'color:var(--d-accent);text-decoration:none;'),
        S('a:hover', 'text-decoration:underline;'),
        S('button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,.dStars:focus-visible', 'outline:2px solid var(--d-gold);outline-offset:2px;'),
        S('.dHead', 'display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:1em 2em;margin-bottom:1.2em;'),
        S('.dTitle', 'font-family:var(--d-serif);font-weight:500;font-size:2.4em;line-height:1.1;margin:0;'),
        S('.dSub', 'color:var(--d-muted);margin:.35em 0 0;max-width:38em;'),
        S('.dActions', 'display:flex;flex-wrap:wrap;gap:.6em;'),
        S('.dBtn', 'font:inherit;color:var(--d-ink);background:var(--d-surface2);border:1px solid var(--d-line);border-radius:6px;padding:.55em 1em;cursor:pointer;min-height:44px;'),
        S('.dBtn:hover', 'border-color:var(--d-accent);'),
        S('.dBtnMain', 'background:var(--d-accent);border-color:var(--d-accent);color:#fff;font-weight:600;'),
        S('.dBtnMain:hover', 'background:var(--d-accent-deep);border-color:var(--d-accent-deep);'),
        S('.dBtnDanger', 'color:var(--d-danger);'),
        S('.dBtn[disabled]', 'opacity:.5;cursor:default;'),
        S('.dYears', 'display:flex;flex-wrap:wrap;gap:.5em;margin:0 0 1.4em;'),
        S('.dChip', 'font:inherit;color:var(--d-muted);background:transparent;border:1px solid var(--d-line);border-radius:999px;padding:.3em .95em;cursor:pointer;min-height:36px;'),
        S('.dChip[aria-current="true"]', 'color:var(--d-ink);border-color:var(--d-gold);background:var(--d-surface);'),
        S('.dMonth', 'font-family:var(--d-serif);font-weight:500;font-size:1.35em;margin:1.8em 0 .4em;padding-bottom:.35em;border-bottom:1px solid var(--d-line);display:flex;justify-content:space-between;align-items:baseline;'),
        S('.dMonth small', 'font-family:inherit;font-size:.6em;color:var(--d-muted);font-weight:400;'),
        S('.dRow', 'display:grid;grid-template-columns:3em 3.6em minmax(0,1fr) auto;gap:.2em 1em;align-items:center;padding:.8em .2em;border-bottom:1px solid var(--d-line);'),
        S('.dDay', 'font-family:var(--d-serif);font-size:1.7em;color:var(--d-gold);text-align:center;line-height:1;'),
        S('.dDay small', 'display:block;font-family:inherit;font-size:.4em;color:var(--d-muted);text-transform:uppercase;letter-spacing:.06em;margin-top:.3em;'),
        S('.dPoster', 'width:3.6em;aspect-ratio:2/3;object-fit:cover;border-radius:3px;background:var(--d-surface2);display:block;'),
        S('.dName', 'font-size:1.08em;margin:0;overflow:hidden;text-overflow:ellipsis;'),
        S('.dName a', 'color:var(--d-ink);'),
        S('.dYear', 'color:var(--d-muted);font-weight:400;margin-left:.4em;'),
        S('.dMeta', 'color:var(--d-muted);font-size:.85em;margin-top:.2em;display:flex;flex-wrap:wrap;gap:.2em .9em;'),
        S('.dTag', 'color:var(--d-gold);'),
        S('.dNote', 'margin:.5em 0 0;font-family:var(--d-serif);font-size:.98em;line-height:1.5;white-space:pre-wrap;color:var(--d-ink);opacity:.9;'),
        S('.dRowEnd', 'display:flex;align-items:center;gap:.8em;'),
        S('.dStars', 'position:relative;display:inline-block;font-size:1.35em;line-height:1;letter-spacing:.06em;cursor:pointer;user-select:none;white-space:nowrap;touch-action:manipulation;padding:.25em 0;'),
        S('.dStars .base', 'color:var(--d-line);'),
        S('.dStars .fill', 'position:absolute;left:0;top:.25em;overflow:hidden;color:var(--d-gold);white-space:nowrap;'),
        S('.dStars.ro', 'cursor:default;'),
        S('.dIconBtn', 'font:inherit;background:transparent;border:none;color:var(--d-muted);cursor:pointer;padding:.5em;min-width:44px;min-height:44px;border-radius:6px;'),
        S('.dIconBtn:hover', 'color:var(--d-ink);background:var(--d-surface);'),
        S('.dEdit', 'grid-column:1 / -1;background:var(--d-surface);border:1px solid var(--d-line);border-radius:8px;padding:1em;margin:.6em 0 .2em;display:grid;gap:.9em;'),
        S('.dConfirm', 'border:1px solid var(--d-danger);border-radius:8px;padding:.9em 1em;display:grid;gap:.6em;'),
        S('.dConfirm[hidden]', 'display:none;'),
        S('.dConfirmText', 'margin:0;'),
        S('.dConfirmErr', 'margin:0;color:var(--d-danger);'),
        S('.dField label', 'display:block;color:var(--d-muted);font-size:.85em;margin-bottom:.3em;'),
        S('.dField input,.dField textarea', 'width:100%;font:inherit;color:var(--d-ink);background:var(--d-field);border:1px solid var(--d-line);border-radius:6px;padding:.55em .7em;'),
        S('.dField textarea', 'min-height:6em;resize:vertical;font-family:var(--d-serif);font-size:1.02em;line-height:1.5;'),
        S('.dBar', 'display:flex;flex-wrap:wrap;gap:.6em;align-items:center;'),
        S('.dPanel', 'background:var(--d-surface);border:1px solid var(--d-line);border-radius:8px;padding:1.2em;margin-bottom:1.6em;display:grid;gap:1em;'),
        S('.dForm', 'display:grid;gap:.9em;'),
        S('.dResults', 'display:grid;gap:.3em;'),
        S('.dResult', 'display:flex;align-items:center;gap:.8em;text-align:left;font:inherit;color:var(--d-ink);background:transparent;border:1px solid transparent;border-radius:6px;padding:.4em;cursor:pointer;min-height:44px;'),
        S('.dResult:hover,.dResult[aria-pressed="true"]', 'border-color:var(--d-accent);background:var(--d-surface2);'),
        S('.dResult img', 'width:2.2em;aspect-ratio:2/3;object-fit:cover;border-radius:2px;background:var(--d-surface2);'),
        S('.dMuted', 'color:var(--d-muted);'),
        S('.dEmpty', 'background:var(--d-surface);border:1px solid var(--d-line);border-radius:8px;padding:2em 1.4em;'),
        S('.dEmpty h2', 'font-family:var(--d-serif);font-weight:500;margin:0 0 .4em;font-size:1.5em;'),
        S('.dToast', 'position:fixed;left:50%;bottom:2em;transform:translateX(-50%);background:#333;color:#fff;padding:.7em 1.2em;border-radius:6px;z-index:10001;max-width:90vw;'),
        '@media (max-width:640px){' +
            S('.dTitle', 'font-size:1.9em;') +
            S('.dRow', 'grid-template-columns:2.4em 3em minmax(0,1fr);') +
            S('.dPoster', 'width:3em;') +
            S('.dRowEnd', 'grid-column:3;') +
        '}',
        // resumen del año
        S('.wHero', 'padding:2.4em 1.4em;border:1px solid var(--d-line);border-radius:10px;background:var(--d-surface);margin-bottom:1.2em;'),
        S('.wEyebrow', 'color:var(--d-accent);text-transform:uppercase;letter-spacing:.14em;font-size:.8em;margin:0 0 .6em;'),
        S('.wBig', 'font-family:var(--d-serif);font-weight:500;font-size:6em;line-height:.95;margin:0;color:var(--d-ink);'),
        S('.wBig small', 'font-size:.28em;color:var(--d-gold);margin-left:.25em;'),
        S('.wLead', 'font-family:var(--d-serif);font-size:1.3em;line-height:1.45;margin:.8em 0 0;max-width:30em;'),
        S('.wMosaic', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:4px;margin-bottom:1.2em;'),
        S('.wMosaic a', 'display:block;'),
        S('.wMosaic img', 'width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:3px;display:block;background:var(--d-surface2);'),
        S('.wCard', 'border:1px solid var(--d-line);border-radius:10px;padding:1.6em 1.4em;margin-bottom:1.2em;background:var(--d-surface);'),
        S('.wCard h2', 'font-family:var(--d-serif);font-weight:500;font-size:1.6em;margin:0 0 .2em;'),
        S('.wCard .wSub', 'color:var(--d-muted);margin:0 0 1.2em;'),
        S('.wCols', 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1.2em;'),
        S('.wMonths', 'display:grid;grid-template-columns:repeat(12,1fr);gap:.4em;align-items:end;height:10em;'),
        S('.wMonth', 'display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;font-size:.78em;color:var(--d-muted);'),
        S('.wMonth i', 'display:block;width:100%;background:var(--d-line);border-radius:3px 3px 0 0;min-height:2px;'),
        S('.wMonth.top i', 'background:var(--d-accent);'),
        S('.wMonth b', 'font-weight:500;color:var(--d-ink);margin-bottom:.2em;'),
        S('.wBars', 'display:grid;gap:.55em;'),
        S('.wBarRow', 'display:grid;grid-template-columns:9em minmax(0,1fr) 2.5em;gap:.7em;align-items:center;'),
        S('.wBarRow span:first-child', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'),
        S('.wBarRow i', 'display:block;height:.9em;background:var(--d-accent);border-radius:2px;'),
        S('.wBarRow.top i', 'background:var(--d-gold);'),
        S('.wBarRow em', 'font-style:normal;color:var(--d-muted);text-align:right;'),
        S('.wFacts', 'display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:1px;background:var(--d-line);border:1px solid var(--d-line);border-radius:10px;overflow:hidden;margin-bottom:1.2em;'),
        S('.wFact', 'background:var(--d-surface);padding:1.1em 1.2em;'),
        S('.wFact small', 'display:block;color:var(--d-muted);text-transform:uppercase;letter-spacing:.08em;font-size:.72em;margin-bottom:.4em;'),
        S('.wFact strong', 'display:block;font-family:var(--d-serif);font-weight:500;font-size:1.25em;line-height:1.25;'),
        S('.wFact span', 'color:var(--d-muted);font-size:.9em;'),
        S('.wShelf', 'display:flex;gap:.8em;overflow-x:auto;padding-bottom:.4em;'),
        S('.wShelf a', 'flex:0 0 7.5em;color:var(--d-ink);font-size:.88em;'),
        S('.wShelf img', 'width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:4px;display:block;background:var(--d-surface2);margin-bottom:.35em;'),
        S('.wAvg', 'font-family:var(--d-serif);font-size:3.4em;line-height:1;margin:0;'),
        S('.wDist', 'display:flex;gap:3px;align-items:flex-end;height:5em;margin-top:.8em;'),
        S('.wDist i', 'flex:1;background:var(--d-gold);border-radius:2px 2px 0 0;min-height:2px;display:block;'),
        '@media (max-width:640px){' +
            S('.wBig', 'font-size:4.2em;') +
            S('.wBarRow', 'grid-template-columns:6.5em minmax(0,1fr) 2em;') +
        '}',
        '@media (prefers-reduced-motion:no-preference){' +
            S('.dRow,.wCard,.wHero', 'animation:dIn .35s ease both;') +
        '}',
        '@keyframes dIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}'
    ].join('');

    // ---------------------------------------------------------------- utilidades

    function el(tag, attrs, children) {
        var n = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (k) {
                var v = attrs[k];
                if (v === null || v === undefined || v === false) { return; }
                if (k === 'text') { n.textContent = v; }
                else if (k === 'class') { n.className = v; }
                else { n.setAttribute(k, v === true ? '' : v); }
            });
        }
        (children || []).forEach(function (c) {
            if (c === null || c === undefined || c === false) { return; }
            n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        });
        return n;
    }

    function clear(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }

    function apiClient() { return window.ApiClient || null; }
    function token() { var c = apiClient(); return c && typeof c.accessToken === 'function' ? c.accessToken() : null; }
    function isLoggedIn() { return !!token(); }
    function serverAddress() {
        var c = apiClient();
        try { var a = c && typeof c.serverAddress === 'function' ? c.serverAddress() : ''; return a ? String(a).replace(/\/+$/, '') : ''; } catch (e) { return ''; }
    }
    function userId() { var c = apiClient(); try { return c && c.getCurrentUserId ? c.getCurrentUserId() : null; } catch (e) { return null; } }

    function request(method, path, body) {
        var headers = { Authorization: 'MediaBrowser Token="' + token() + '"' };
        var init = { method: method, headers: headers };
        if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
        return fetch(serverAddress() + path, init).then(function (r) {
            if (!r.ok) {
                return r.text().then(function (t) { var e = new Error('HTTP ' + r.status); e.status = r.status; e.detail = t; throw e; }, function () { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; });
            }
            return r.status === 204 ? null : r.json();
        });
    }

    function posterUrl(id) { return serverAddress() + '/Items/' + encodeURIComponent(id) + '/Images/Primary?fillHeight=360&quality=88'; }
    function detailsHref(id) { return '#/details?id=' + encodeURIComponent(id); }

    function toast(msg) {
        var t = el('div', { class: 'dToast', role: 'status', text: msg });
        document.body.appendChild(t);
        setTimeout(function () { if (t.parentNode) { t.parentNode.removeChild(t); } }, 4000);
    }

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function todayIso() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function parseIso(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
    function longDate(s) { var p = parseIso(s); return p ? p.d + ' de ' + MONTHS[p.m - 1] + ' de ' + p.y : ''; }
    function dayNum(s) { var p = parseIso(s); return p ? String(p.d) : ''; }
    function weekdayShort(s) {
        var p = parseIso(s);
        if (!p) { return ''; }
        var wd = (new Date(p.y, p.m - 1, p.d).getDay() + 6) % 7;
        return WEEKDAYS[wd].slice(0, 3);
    }
    function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
    function num(n) { return String(n).replace('.', ','); }
    function duration(min) {
        var h = Math.floor(min / 60), m = min % 60;
        return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min';
    }

    // ---------------------------------------------------------------- ruta

    function safeDecode(t) { try { return decodeURIComponent(t); } catch (e) { return t; } }

    function currentRoute() {
        var h = window.location.hash || '';
        var m = /^#!?\/diary(\/year(?:\/(\d{4}))?)?(?:\?(.*))?$/i.exec(h);
        if (!m) { return null; }
        var q = {};
        (m[3] || '').split('&').forEach(function (kv) {
            if (!kv) { return; }
            var i = kv.indexOf('=');
            q[safeDecode(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '' : safeDecode(kv.slice(i + 1));
        });
        if (m[1]) { return { kind: 'year', year: m[2] ? +m[2] : null, key: 'year/' + (m[2] || '') }; }
        return { kind: 'list', year: q.year && /^\d{4}$/.test(q.year) ? +q.year : null, key: 'list/' + (q.year || '') };
    }

    function syncRouteClass() {
        var on = !!currentRoute();
        var cl = document.documentElement.classList;
        if (cl.contains('diaryRoute') !== on) { if (on) { cl.add('diaryRoute'); } else { cl.remove('diaryRoute'); } }
    }

    function injectStyle() {
        var s = document.getElementById('diaryStyle');
        if (!s) { s = document.createElement('style'); s.id = 'diaryStyle'; document.head.appendChild(s); }
        if (s.textContent !== STYLE) { s.textContent = STYLE; }
    }

    function applyTitle(page) {
        var t = LABEL;
        if (page && page.getAttribute('data-title') !== t) { page.setAttribute('data-title', t); }
        if (document.title !== t) { document.title = t; }
        var nodes = document.querySelectorAll('.pageTitle');
        for (var i = 0; i < nodes.length; i++) { if (nodes[i].textContent !== t) { nodes[i].textContent = t; } }
    }

    // ---------------------------------------------------------------- estrellas (1 a 10 = medias estrellas)

    function starsEl(rating, onChange) {
        var wrap = el('span', { class: 'dStars' + (onChange ? '' : ' ro') });
        var base = el('span', { class: 'base', 'aria-hidden': 'true', text: '★★★★★' });
        var fill = el('span', { class: 'fill', 'aria-hidden': 'true', text: '★★★★★' });
        wrap.appendChild(base);
        wrap.appendChild(fill);
        var value = rating || 0;
        function paint() {
            fill.style.width = (value * 10) + '%';
            wrap.setAttribute('aria-label', value ? 'Nota ' + num(value / 2) + ' de 5' : 'Sin nota');
        }
        paint();
        if (onChange) {
            wrap.setAttribute('role', 'slider');
            wrap.setAttribute('tabindex', '0');
            wrap.setAttribute('aria-valuemin', '0');
            wrap.setAttribute('aria-valuemax', '10');
            wrap.setAttribute('title', 'Pulsa para puntuar. Pulsa en la nota actual para quitarla.');
            var set = function (v) {
                v = Math.max(0, Math.min(10, v));
                if (v === value) { return; }
                value = v;
                paint();
                wrap.setAttribute('aria-valuenow', String(value));
                onChange(value);
            };
            wrap.setAttribute('aria-valuenow', String(value));
            wrap.addEventListener('click', function (e) {
                var rect = base.getBoundingClientRect();
                var ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
                var v = Math.max(1, Math.min(10, Math.ceil(ratio * 10)));
                set(v === value ? 0 : v);
            });
            wrap.addEventListener('keydown', function (e) {
                if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); set(value + 1); }
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); set(value - 1); }
                else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === '0') { e.preventDefault(); set(0); }
            });
        }
        return wrap;
    }

    // ---------------------------------------------------------------- vista lista

    var root = null;
    var paintedKey = null;
    var token0 = 0;
    var loginRetryCount = 0;
    var scheduled = false;

    function yearChips(years, current, hrefFor) {
        var box = el('div', { class: 'dYears', role: 'navigation', 'aria-label': 'Años' });
        years.forEach(function (y) {
            box.appendChild(el('a', { class: 'dChip', href: hrefFor(y), 'aria-current': y === current ? 'true' : null, text: String(y) }));
        });
        return box;
    }

    function header(title, sub, actions) {
        return el('div', { class: 'dHead' }, [
            el('div', null, [el('h1', { class: 'dTitle', text: title }), sub ? el('p', { class: 'dSub', text: sub }) : null]),
            el('div', { class: 'dActions' }, actions || [])
        ]);
    }

    function button(text, cls, fn) {
        var b = el('button', { type: 'button', class: 'dBtn' + (cls ? ' ' + cls : ''), text: text });
        if (fn) { b.addEventListener('click', fn); }
        return b;
    }

    function viewList(host, route, tk) {
        clear(host);
        host.appendChild(el('p', { class: 'dMuted', text: 'Cargando…' }));
        request('GET', '/Diary/Entries' + (route.year ? '?year=' + route.year : '')).then(function (data) {
            if (tk !== token0) { return; }
            drawList(host, data, route);
        }, function (err) {
            if (tk !== token0) { return; }
            clear(host);
            host.appendChild(el('p', { class: 'dMuted', text: err && err.status === 401 ? 'Inicia sesión para ver tu diario.' : 'No se pudo cargar tu diario.' }));
        });
    }

    function reload() { paintedKey = null; scheduleRun(); }

    function drawList(host, data, route) {
        clear(host);
        var years = data.Years || [];
        var entries = data.Entries || [];
        var adder = el('div');
        var actions = [button('Añadir película', 'dBtnMain', function () { toggleAdder(adder); })];
        if (data.Year) { actions.push(el('a', { class: 'dBtn', href: '#/diary/year/' + data.Year, text: 'Tu año ' + data.Year })); }
        host.appendChild(header('Mi diario', 'Lo que has visto, con fecha y nota. Solo lo ves tú.', actions));
        host.appendChild(adder);

        if (!entries.length && !years.length) {
            drawEmpty(host);
            return;
        }
        if (years.length > 0) {
            host.appendChild(yearChips(years, data.Year, function (y) { return '#/diary?year=' + y; }));
        }

        var month = null, group = null, count = 0, heading = null;
        var closeGroup = function () { if (heading) { heading.querySelector('small').textContent = plural(count, 'película', 'películas'); } };
        entries.forEach(function (e) {
            var p = parseIso(e.Date);
            var key = p ? p.y + '-' + p.m : '';
            if (key !== month) {
                closeGroup();
                month = key; count = 0;
                heading = el('h2', { class: 'dMonth' }, [cap(p ? MONTHS[p.m - 1] : ''), el('small')]);
                host.appendChild(heading);
                group = el('div');
                host.appendChild(group);
            }
            count++;
            group.appendChild(entryRow(e, host));
        });
        closeGroup();
    }

    function drawEmpty(host) {
        var msg = el('p', { class: 'dMuted' });
        var imp = button('Traer lo que ya he visto', 'dBtnMain', function () {
            imp.disabled = true;
            request('POST', '/Diary/Import').then(function (r) {
                if (r.Added > 0) { toast(r.Added === 1 ? 'Se ha añadido 1 película.' : 'Se han añadido ' + r.Added + ' películas.'); reload(); }
                else { msg.textContent = 'No había películas vistas que traer.'; imp.disabled = false; }
            }, function () { msg.textContent = 'No se pudo importar.'; imp.disabled = false; });
        });
        host.appendChild(el('div', { class: 'dEmpty' }, [
            el('h2', { text: 'Tu diario está vacío' }),
            el('p', { class: 'dMuted', text: 'A partir de ahora se apunta solo cada película que termines de ver, o que marques como vista. También puedes añadir las que viste fuera de aquí, o traer las que Jellyfin ya tenía como vistas.' }),
            el('p', { class: 'dMuted', text: 'Jellyfin solo guarda la última fecha en que viste cada película, así que las repeticiones antiguas no se pueden recuperar.' }),
            el('div', { class: 'dBar' }, [imp]), msg
        ]));
    }

    function entryRow(e, host) {
        var row = el('div', { class: 'dRow', 'data-id': e.Id });
        var note = el('div');
        var stars = starsEl(e.Rating, function (v) {
            request('PUT', '/Diary/Entries/' + e.Id, v ? { Rating: v } : { ClearRating: true }).then(function (u) { e.Rating = u.Rating; }, function () { toast('No se pudo guardar la nota.'); });
        });

        row.appendChild(el('div', { class: 'dDay' }, [dayNum(e.Date), el('small', { text: weekdayShort(e.Date) })]));
        row.appendChild(e.HasPrimaryImage ? el('img', { class: 'dPoster', loading: 'lazy', alt: '', src: posterUrl(e.ItemId) }) : el('div', { class: 'dPoster' }));

        var meta = el('div', { class: 'dMeta' }, [
            el('span', { text: SOURCES[e.Source] || '' }),
            e.Rewatch ? el('span', { class: 'dTag', text: 'Repetición' }) : null,
            e.Minutes ? el('span', { text: duration(e.Minutes) }) : null
        ]);
        row.appendChild(el('div', null, [
            el('h3', { class: 'dName' }, [el('a', { href: detailsHref(e.ItemId), text: e.Name }), e.Year ? el('span', { class: 'dYear', text: String(e.Year) }) : null]),
            meta,
            note
        ]));
        var edit = el('button', { type: 'button', class: 'dIconBtn', title: 'Editar', 'aria-label': 'Editar ' + e.Name, text: '✎' });
        row.appendChild(el('div', { class: 'dRowEnd' }, [stars, edit]));

        function paintNote() {
            clear(note);
            if (e.Note) { note.appendChild(el('p', { class: 'dNote', text: e.Note })); }
        }
        paintNote();
        edit.addEventListener('click', function () { openEdit(row, e, paintNote, host); });
        return row;
    }

    function openEdit(row, e, paintNote, host) {
        var existing = row.querySelector('.dEdit');
        if (existing) { row.removeChild(existing); return; }
        var date = el('input', { type: 'date', id: 'dDate' + e.Id, max: todayIso(), value: e.Date });
        var text = el('textarea', { id: 'dText' + e.Id, maxlength: '1000', placeholder: 'Qué te pareció, con quién la viste, lo que quieras recordar…' });
        text.value = e.Note || '';
        var rating = e.Rating || 0;
        var stars = starsEl(rating, function (v) { rating = v; });
        var confirmBox = el('div', { class: 'dConfirm', role: 'alertdialog', 'aria-label': 'Confirmar borrado', hidden: true });
        var del = button('Borrar del diario', 'dBtnDanger', function () {
            clear(confirmBox);
            var msg = el('p', { class: 'dConfirmText', text: '¿Borrar «' + e.Name + '» de tu diario? No se puede deshacer.' });
            var err = el('p', { class: 'dConfirmErr', role: 'alert' });
            var yes = button('Sí, borrar', 'dBtnDanger');
            var no = button('No', '', function () { confirmBox.hidden = true; del.hidden = false; del.focus(); });
            yes.addEventListener('click', function () {
                yes.disabled = true; no.disabled = true; yes.textContent = 'Borrando…'; err.textContent = '';
                request('DELETE', '/Diary/Entries/' + e.Id).then(function () {
                    if (row.parentNode) { row.parentNode.removeChild(row); }
                    toast('Entrada borrada de tu diario.');
                    reload();
                }, function (ex) {
                    yes.disabled = false; no.disabled = false; yes.textContent = 'Sí, borrar';
                    err.textContent = 'No se pudo borrar' + (ex && ex.status ? ' (error ' + ex.status + ')' : '') + '. Prueba otra vez.';
                });
            });
            confirmBox.appendChild(msg);
            confirmBox.appendChild(err);
            confirmBox.appendChild(el('div', { class: 'dBar' }, [yes, no]));
            confirmBox.hidden = false;
            del.hidden = true;
            no.focus();
        });
        var save = button('Guardar', 'dBtnMain', function () {
            var body = { Date: date.value || e.Date, SetNote: true, Note: text.value };
            if (rating) { body.Rating = rating; } else { body.ClearRating = true; }
            save.disabled = true;
            request('PUT', '/Diary/Entries/' + e.Id, body).then(function () { reload(); }, function (err) {
                save.disabled = false;
                toast(err && err.status === 400 && err.detail ? String(err.detail).replace(/^"|"$/g, '') : 'No se pudo guardar.');
            });
        });
        var cancel = button('Cancelar', '', function () { if (panel.parentNode) { panel.parentNode.removeChild(panel); } });
        var panel = el('div', { class: 'dEdit' }, [
            el('div', { class: 'dField' }, [el('label', { for: 'dDate' + e.Id, text: 'Fecha en que la viste' }), date]),
            el('div', { class: 'dField' }, [el('label', { text: 'Nota' }), stars]),
            el('div', { class: 'dField' }, [el('label', { for: 'dText' + e.Id, text: 'Comentario' }), text]),
            el('div', { class: 'dBar' }, [save, cancel, del]),
            confirmBox
        ]);
        row.appendChild(panel);
        date.focus();
    }

    // ---------------------------------------------------------------- añadir película

    function toggleAdder(box) {
        if (box.firstChild) { clear(box); return; }
        var chosen = null;
        var q = el('input', { type: 'search', id: 'dSearch', placeholder: 'Busca una película de tu biblioteca', autocomplete: 'off' });
        var results = el('div', { class: 'dResults' });
        var form = el('div', { class: 'dForm' });
        var timer = null;

        function showForm(item) {
            chosen = item;
            clear(form);
            var date = el('input', { type: 'date', id: 'dAddDate', max: todayIso(), value: todayIso() });
            var text = el('textarea', { id: 'dAddText', maxlength: '1000', placeholder: 'Comentario (opcional)' });
            var rating = 0;
            var stars = starsEl(0, function (v) { rating = v; });
            var add = button('Añadir al diario', 'dBtnMain', function () {
                var body = { ItemId: chosen.Id, Date: date.value || todayIso(), Note: text.value };
                if (rating) { body.Rating = rating; }
                add.disabled = true;
                request('POST', '/Diary/Entries', body).then(function () { toast('Añadida a tu diario.'); reload(); }, function (err) {
                    add.disabled = false;
                    toast(err && err.status === 400 && err.detail ? String(err.detail).replace(/^"|"$/g, '') : 'No se pudo añadir.');
                });
            });
            form.appendChild(el('div', { class: 'dBar' }, [el('strong', { text: item.Name + (item.ProductionYear ? ' (' + item.ProductionYear + ')' : '') })]));
            form.appendChild(el('div', { class: 'dField' }, [el('label', { for: 'dAddDate', text: 'Fecha en que la viste' }), date]));
            form.appendChild(el('div', { class: 'dField' }, [el('label', { text: 'Nota' }), stars]));
            form.appendChild(el('div', { class: 'dField' }, [el('label', { for: 'dAddText', text: 'Comentario' }), text]));
            form.appendChild(el('div', { class: 'dBar' }, [add]));
        }

        function search() {
            var term = q.value.trim();
            clear(results);
            if (term.length < 2) { return; }
            var uid = userId();
            var url = '/Items?includeItemTypes=Movie&recursive=true&limit=8&fields=ProductionYear&searchTerm=' + encodeURIComponent(term) + (uid ? '&userId=' + uid : '');
            request('GET', url).then(function (r) {
                clear(results);
                var items = (r && r.Items) || [];
                if (!items.length) { results.appendChild(el('p', { class: 'dMuted', text: 'No hay ninguna película con ese nombre.' })); return; }
                items.forEach(function (it) {
                    var b = el('button', { type: 'button', class: 'dResult' }, [
                        el('img', { alt: '', src: posterUrl(it.Id) }),
                        el('span', { text: it.Name + (it.ProductionYear ? ' (' + it.ProductionYear + ')' : '') })
                    ]);
                    b.addEventListener('click', function () {
                        Array.prototype.forEach.call(results.children, function (c) { c.setAttribute('aria-pressed', 'false'); });
                        b.setAttribute('aria-pressed', 'true');
                        showForm(it);
                    });
                    results.appendChild(b);
                });
            }, function () { results.appendChild(el('p', { class: 'dMuted', text: 'No se pudo buscar.' })); });
        }
        q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(search, 250); });
        box.appendChild(el('div', { class: 'dPanel' }, [
            el('div', { class: 'dField' }, [el('label', { for: 'dSearch', text: 'Película' }), q]),
            results, form
        ]));
        q.focus();
    }

    // ---------------------------------------------------------------- vista resumen del año

    function viewYear(host, route, tk) {
        clear(host);
        host.appendChild(el('p', { class: 'dMuted', text: 'Cargando…' }));
        request('GET', '/Diary/Entries').then(function (all) {
            if (tk !== token0) { return; }
            var years = all.Years || [];
            var year = route.year || (years.length ? years[0] : new Date().getFullYear());
            return Promise.all([request('GET', '/Diary/Year/' + year), request('GET', '/Diary/Entries?year=' + year)]).then(function (res) {
                if (tk !== token0) { return; }
                drawYear(host, year, years, res[0], res[1].Entries || []);
            });
        }).catch(function (err) {
            if (tk !== token0) { return; }
            clear(host);
            host.appendChild(el('p', { class: 'dMuted', text: err && err.status === 401 ? 'Inicia sesión para ver tu resumen.' : 'No se pudo cargar el resumen.' }));
        });
    }

    function filmRef(f) { return f ? f.Name + (f.Year ? ' (' + f.Year + ')' : '') : ''; }

    function fact(label, strong, sub, href) {
        var s = href ? el('strong', null, [el('a', { href: href, text: strong })]) : el('strong', { text: strong });
        return el('div', { class: 'wFact' }, [el('small', { text: label }), s, sub ? el('span', { text: sub }) : null]);
    }

    function barRows(list, max) {
        var box = el('div', { class: 'wBars' });
        list.forEach(function (it) {
            var i = el('i');
            i.style.width = Math.max(2, Math.round(100 * it.value / max)) + '%';
            box.appendChild(el('div', { class: 'wBarRow' + (it.value === max ? ' top' : '') }, [el('span', { text: it.label }), el('span', null, [i]), el('em', { text: String(it.value) })]));
        });
        return box;
    }

    function summaryText(year, s) {
        var lines = ['Mi año de cine ' + year, plural(s.Total, 'película', 'películas') + ' (' + s.Unique + ' distintas), ' + duration(s.Minutes)];
        if (s.TopGenres.length) { lines.push('Género favorito ' + s.TopGenres[0].Key); }
        if (s.AverageRating) { lines.push('Nota media ' + num(s.AverageRating) + ' de 5'); }
        if (s.TopRated.length) { lines.push('Lo mejor ' + filmRef(s.TopRated[0])); }
        return lines.join('\n');
    }

    function drawYear(host, year, years, s, entries) {
        clear(host);
        var copy = button('Copiar resumen', '', function () {
            var text = summaryText(year, s);
            if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function () { toast('Resumen copiado.'); }, function () { toast('No se pudo copiar.'); }); }
            else { toast('Tu navegador no permite copiar.'); }
        });
        host.appendChild(header('Tu año de cine', null, [el('a', { class: 'dBtn', href: '#/diary?year=' + year, text: 'Volver al diario' }), s.Total ? copy : null]));
        if (years.length > 1) { host.appendChild(yearChips(years, year, function (y) { return '#/diary/year/' + y; })); }

        if (!s.Total) {
            host.appendChild(el('div', { class: 'dEmpty' }, [el('h2', { text: 'Aún no hay nada de ' + year }), el('p', { class: 'dMuted', text: 'Cuando veas películas aparecerán aquí, con tus números del año.' })]));
            return;
        }

        var days = s.Minutes / 1440;
        var hero = el('div', { class: 'wHero' }, [
            el('p', { class: 'wEyebrow', text: 'Tu ' + year }),
            el('p', { class: 'wBig' }, [String(s.Total), el('small', { text: s.Total === 1 ? 'película' : 'películas' })]),
            el('p', { class: 'wLead', text: (s.Unique === s.Total ? 'Todas distintas. ' : s.Unique + ' distintas y ' + plural(s.Rewatches, 'repetición', 'repeticiones') + '. ') +
                (s.Minutes ? 'En total ' + duration(s.Minutes) + (days >= 1 ? ', casi ' + (days < 2 ? 'un día' : Math.round(days) + ' días') + ' seguidos de cine.' : '.') : '') })
        ]);
        host.appendChild(hero);

        // mosaico de carátulas (una por película distinta)
        var seen = {}, posters = [];
        entries.forEach(function (e) { if (e.HasPrimaryImage && !seen[e.ItemId]) { seen[e.ItemId] = 1; posters.push(e); } });
        if (posters.length) {
            var mosaic = el('div', { class: 'wMosaic' });
            posters.slice(0, 36).forEach(function (e) {
                mosaic.appendChild(el('a', { href: detailsHref(e.ItemId), title: e.Name }, [el('img', { loading: 'lazy', alt: e.Name, src: posterUrl(e.ItemId) })]));
            });
            host.appendChild(mosaic);
        }

        // meses y días de la semana
        var maxM = Math.max.apply(null, s.ByMonth);
        var topM = s.ByMonth.indexOf(maxM);
        var months = el('div', { class: 'wMonths', role: 'img', 'aria-label': 'Películas por mes' });
        s.ByMonth.forEach(function (n, i) {
            var bar = el('i');
            bar.style.height = Math.round(100 * n / Math.max(1, maxM) * 0.78) + '%';
            months.appendChild(el('div', { class: 'wMonth' + (i === topM ? ' top' : '') }, [n ? el('b', { text: String(n) }) : null, bar, MONTHS[i].slice(0, 3)]));
        });
        var maxW = Math.max.apply(null, s.ByWeekday);
        var topW = s.ByWeekday.indexOf(maxW);
        var wdays = barRows(s.ByWeekday.map(function (n, i) { return { label: cap(WEEKDAYS[i]), value: n }; }), Math.max(1, maxW));
        host.appendChild(el('div', { class: 'wCard' }, [
            el('h2', { text: 'Tu mes grande fue ' + MONTHS[topM] }),
            el('p', { class: 'wSub', text: plural(maxM, 'película', 'películas') + ' ese mes. ' + 'Los ' + WEEKDAYS[topW] + ' es cuando más cine ves.' }),
            el('div', { class: 'wCols' }, [months, wdays])
        ]));

        // géneros y épocas
        if (s.TopGenres.length || s.Decades.length) {
            var cols = el('div', { class: 'wCols' });
            if (s.TopGenres.length) {
                cols.appendChild(el('div', null, [el('h2', { text: 'Tus géneros' }), el('p', { class: 'wSub', text: 'Mandó el ' + s.TopGenres[0].Key.toLowerCase() + '.' }),
                    barRows(s.TopGenres.map(function (g) { return { label: g.Key, value: g.Count }; }), s.TopGenres[0].Count)]));
            }
            if (s.Decades.length) {
                cols.appendChild(el('div', null, [el('h2', { text: 'De qué época vienes' }), el('p', { class: 'wSub', text: 'Años ' + s.Decades[0].Key + ' en cabeza.' }),
                    barRows(s.Decades.map(function (d) { return { label: d.Key + 's', value: d.Count }; }), s.Decades[0].Count)]));
            }
            host.appendChild(el('div', { class: 'wCard' }, [cols]));
        }

        // notas
        if (s.RatedCount) {
            var dist = el('div', { class: 'wDist', role: 'img', 'aria-label': 'Reparto de notas' });
            var maxD = Math.max.apply(null, s.RatingDistribution);
            s.RatingDistribution.forEach(function (n) { var b = el('i'); b.style.height = Math.round(100 * n / Math.max(1, maxD)) + '%'; dist.appendChild(b); });
            var shelf = el('div', { class: 'wShelf' });
            s.TopRated.forEach(function (f) {
                shelf.appendChild(el('a', { href: detailsHref(f.ItemId) }, [el('img', { loading: 'lazy', alt: '', src: posterUrl(f.ItemId) }), el('span', { text: f.Name }), el('br'), starsEl(f.Rating)]));
            });
            host.appendChild(el('div', { class: 'wCard' }, [
                el('h2', { text: 'Lo que puntuaste' }),
                el('p', { class: 'wSub', text: 'Nota media sobre ' + plural(s.RatedCount, 'película valorada', 'películas valoradas') + '.' }),
                el('div', { class: 'wCols' }, [
                    el('div', null, [el('p', { class: 'wAvg', text: num(s.AverageRating) + ' / 5' }), dist]),
                    el('div', null, [el('p', { class: 'wSub', text: 'Lo mejor del año' }), shelf])
                ])
            ]));
        }

        // datos sueltos
        var facts = el('div', { class: 'wFacts' });
        if (s.First) { facts.appendChild(fact('La primera del año', filmRef(s.First), longDate(s.First.Date), detailsHref(s.First.ItemId))); }
        if (s.Last && s.Total > 1) { facts.appendChild(fact('La última hasta ahora', filmRef(s.Last), longDate(s.Last.Date), detailsHref(s.Last.ItemId))); }
        if (s.Longest) { facts.appendChild(fact('La más larga', filmRef(s.Longest), 'Dura ' + duration(s.Longest.Minutes || 0), detailsHref(s.Longest.ItemId))); }
        if (s.Shortest && s.Shortest.ItemId !== (s.Longest && s.Longest.ItemId)) { facts.appendChild(fact('La más corta', filmRef(s.Shortest), null, detailsHref(s.Shortest.ItemId))); }
        if (s.Oldest) { facts.appendChild(fact('La más antigua', filmRef(s.Oldest), null, detailsHref(s.Oldest.ItemId))); }
        if (s.MostRewatched) { facts.appendChild(fact('La que repetiste', filmRef(s.MostRewatched), s.MostRewatchedTimes + ' veces este año', detailsHref(s.MostRewatched.ItemId))); }
        if (s.LongestStreak && s.LongestStreak.Days > 1) { facts.appendChild(fact('Mejor racha', plural(s.LongestStreak.Days, 'día seguido', 'días seguidos'), 'Del ' + longDate(s.LongestStreak.From) + ' al ' + longDate(s.LongestStreak.To))); }
        if (s.BusiestDay && s.BusiestDay.Count > 1) { facts.appendChild(fact('Día más intenso', plural(s.BusiestDay.Count, 'película', 'películas'), longDate(s.BusiestDay.Key))); }
        if (s.NightShare >= 20) { facts.appendChild(fact('Sesión de noche', s.NightShare + ' %', 'de lo que ves empieza pasadas las diez')); }
        if (facts.children.length) { host.appendChild(facts); }

        // comunidad
        if (s.Community && s.Community.length) {
            var shelf2 = el('div', { class: 'wShelf' });
            s.Community.forEach(function (c) {
                shelf2.appendChild(el('a', { href: detailsHref(c.ItemId) }, [el('img', { loading: 'lazy', alt: '', src: posterUrl(c.ItemId) }), el('span', { text: c.Name }), el('br'), el('span', { class: 'dMuted', text: plural(c.Viewers, 'persona', 'personas') })]));
            });
            host.appendChild(el('div', { class: 'wCard' }, [el('h2', { text: 'Lo más visto en el servidor' }), el('p', { class: 'wSub', text: 'Las películas que más gente ha visto este año.' }), shelf2]));
        }
    }

    // ---------------------------------------------------------------- montaje en la ruta comodín

    function paint() {
        var route = currentRoute();
        if (!route) { return; }
        root.setAttribute('data-route', route.key);
        token0++;
        if (!isLoggedIn()) {
            clear(root);
            root.appendChild(el('p', { class: 'dMuted' }, ['Inicia sesión para ver tu diario. ', el('a', { href: '#/login', text: 'Ir a iniciar sesión' })]));
            scheduleLoginRetry();
            return;
        }
        loginRetryCount = 0;
        if (route.kind === 'year') { viewYear(root, route, token0); } else { viewList(root, route, token0); }
        if (scrolledFor !== route.key) { scrolledFor = route.key; try { window.scrollTo(0, 0); } catch (e) { /* noop */ } }
    }

    var scrolledFor = null;
    var lastToken;
    function run() {
        scheduled = false;
        syncRouteClass();
        var t = token();
        if (t !== lastToken) { lastToken = t; paintedKey = null; }
        var route = currentRoute();
        if (!route) { root = null; paintedKey = null; return; }
        var page = document.getElementById('fallbackPage');
        if (!page) { return; }
        var existing = null;
        for (var i = 0; i < page.children.length; i++) { if (page.children[i].hasAttribute(ROOT_ATTR)) { existing = page.children[i]; } }
        var fresh = false;
        if (!existing) {
            existing = el('div', { class: 'padded-left padded-right' });
            existing.setAttribute(ROOT_ATTR, '');
            page.appendChild(existing);
            fresh = true;
        }
        if (existing !== root) { fresh = true; }
        root = existing;
        if (page.lastElementChild !== root) { page.appendChild(root); }
        applyTitle(page);
        var key = route.key + '|' + (isLoggedIn() ? '1' : '0');
        if (fresh || paintedKey !== key) { paintedKey = key; paint(); }
    }

    function scheduleRun() {
        if (scheduled) { return; }
        scheduled = true;
        window.requestAnimationFrame(tick);
    }

    function scheduleLoginRetry() {
        if (loginRetryCount >= LOGIN_RETRIES) { return; }
        loginRetryCount++;
        setTimeout(function () { if (currentRoute()) { paintedKey = null; scheduleRun(); } }, 500);
    }

    // ---------------------------------------------------------------- entrada «Mi diario» en el menú de usuario

    function closeModernMenu() {
        var menuRoot = document.getElementById('app-user-menu');
        if (!menuRoot) { return; }
        var menu = menuRoot.querySelector('[role="menu"]');
        try { (menu || menuRoot).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true })); } catch (e) { /* noop */ }
        setTimeout(function () {
            try {
                if (window.getComputedStyle(menuRoot).visibility === 'hidden') { return; }
                var backdrop = menuRoot.querySelector('[aria-hidden="true"]');
                if (backdrop) { backdrop.click(); }
            } catch (e) { /* noop */ }
        }, 150);
    }

    function setMenuLabel(node) {
        var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
        var nodes = [], done = false;
        while (walker.nextNode()) { nodes.push(walker.currentNode); }
        nodes.forEach(function (n) {
            if (!n.nodeValue.trim() || (n.parentNode && n.parentNode.closest && n.parentNode.closest('.material-icons,svg'))) { return; }
            if (!done) { n.nodeValue = LABEL; done = true; } else { n.nodeValue = ''; }
        });
        return done;
    }

    function buildMenuEntry(anchor, iconKind) {
        var node = document.createElement(anchor.tagName);
        node.className = anchor.className;
        node.innerHTML = anchor.innerHTML;
        Array.prototype.forEach.call(node.querySelectorAll('[id]'), function (n) { n.removeAttribute('id'); });
        node.setAttribute(MENU_ATTR, 'menu');
        node.removeAttribute('data-watchlist');
        node.setAttribute('href', '#/diary');
        ['role', 'tabindex'].forEach(function (a) { if (anchor.hasAttribute(a)) { node.setAttribute(a, anchor.getAttribute(a)); } });
        if (iconKind === 'svg') {
            var svg = node.querySelector('svg');
            if (svg) { svg.removeAttribute('data-testid'); svg.setAttribute('viewBox', '0 0 24 24'); svg.innerHTML = '<path d="' + BOOK_PATH + '"></path>'; }
        } else {
            var icon = node.querySelector('.material-icons');
            if (icon) {
                var keep = [];
                Array.prototype.forEach.call(icon.classList, function (c) { if (c === 'material-icons' || c.indexOf('listItemIcon') === 0) { keep.push(c); } });
                keep.push('menu_book');
                icon.className = keep.join(' ');
                if (icon.textContent.trim()) { icon.textContent = 'menu_book'; }
            }
        }
        if (!setMenuLabel(node)) { return null; }
        node.addEventListener('click', function (evt) {
            evt.preventDefault();
            evt.stopPropagation();
            closeModernMenu();
            window.location.hash = '#/diary';
        });
        return node;
    }

    // Se coloca tras el enlace de preferencias y tras la entrada «Mi lista» si existe, para que ambos
    // plugins se lleven bien sin pelearse por la misma posición.
    function slotAfter(anchor) {
        var s = anchor;
        while (s.nextElementSibling && s.nextElementSibling.getAttribute('data-watchlist') === 'menu') { s = s.nextElementSibling; }
        return s;
    }

    function ensureMenuEntry(anchor, iconKind) {
        var slot = slotAfter(anchor);
        var next = slot.nextElementSibling;
        if (next && next.getAttribute(MENU_ATTR) === 'menu') { return; }
        Array.prototype.forEach.call(anchor.parentNode.querySelectorAll(':scope > [' + MENU_ATTR + '="menu"]'), function (n) { n.parentNode.removeChild(n); });
        var node = buildMenuEntry(anchor, iconKind);
        if (node) { slot.parentNode.insertBefore(node, slot.nextSibling); }
    }

    function injectMenu() {
        var modern = document.querySelector('#app-user-menu a[href*="mypreferencesmenu"]');
        if (modern && modern.parentNode) { ensureMenuEntry(modern, 'svg'); return; }
        var anchors = document.querySelectorAll('a.lnkUserProfile');
        for (var i = 0; i < anchors.length; i++) {
            var a = anchors[i];
            if (a.closest('.hide') || a.hasAttribute(MENU_ATTR) || !a.parentNode) { continue; }
            ensureMenuEntry(a, 'font');
            return;
        }
    }

    // ---------------------------------------------------------------- arranque

    function onMutations(records) {
        for (var i = 0; i < records.length; i++) {
            var tgt = records[i].target;
            if (tgt && tgt.closest && tgt.closest('[' + ROOT_ATTR + ']')) { continue; }
            scheduleRun();
            return;
        }
    }

    function tick() {
        try { if (isLoggedIn()) { injectMenu(); } } catch (e) { /* el menu es opcional */ }
        run();
    }

    function init() {
        injectStyle();
        var observer = new MutationObserver(onMutations);
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('hashchange', function () { syncRouteClass(); paintedKey = null; scheduleRun(); });
        scheduleRun();
    }

    syncRouteClass();
    if (document.body) { init(); } else { document.addEventListener('DOMContentLoaded', init); }
})();
