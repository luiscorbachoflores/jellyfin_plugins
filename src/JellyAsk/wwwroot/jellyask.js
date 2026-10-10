/*
 * JellyAsk - client side (injected into jellyfin-web's index.html by the plugin).
 *
 * Floating "pedir película o serie" button + request dialog.
 *
 * Shared conventions (see docs/auditoria-12.2.md, "Convencion de apilado"):
 *  - every floating button of Luis' plugins lives in ONE dock, #jfp-fab-dock (bottom-right, safe-area aware),
 *    created by whichever plugin loads first; each button sets its own order with --jfp-order
 *    (JellyAsk 10 = lowest, then Reviews 20, WeeklyPick 30, ReportProblem 40) and the dock stacks them upwards;
 *  - the dock hides on the player (#/video), the dashboard, login/startup pages and TV layouts;
 *  - colours/typography are inherited from the page; the accent comes from a probe of the native
 *    ".raised.button-submit" so admin branding CSS is followed. No hard-coded palette except fallbacks.
 */
(function () {
    'use strict';
    if (window.__jellyAskLoaded) {
        return;
    }
    window.__jellyAskLoaded = true;

    var LIMIT = 1000;
    var Z = 1000;        // FAB dock: above page content and the header (999), below the now-playing bar (1201), MUI menus (1300) and native dialogs (999998)
    var Z_MODAL = 10000; // our own dialogs: above the now-playing bar and MUI menus, below native dialogs

    // ---------------------------------------------------------------- helpers
    function apiClient() {
        return window.ApiClient || null;
    }

    function accessToken() {
        var c = apiClient();
        return c && typeof c.accessToken === 'function' ? c.accessToken() : null;
    }

    function isTv() {
        return document.documentElement.classList.contains('layout-tv');
    }

    var HIDDEN_ROUTE = /^#!?\/(video|queue|dashboard|configurationpage|login|selectserver|startup|forgotpassword|addserver|quickconnect|wizard)/i;

    function routeHidden() {
        return HIDDEN_ROUTE.test(window.location.hash || '');
    }

    /** Colours of the native primary button (follows themes and admin branding CSS). */
    function nativeAccent() {
        var out = { bg: 'var(--jf-palette-primary-main, #00a4dc)', fg: 'var(--jf-palette-primary-contrastText, rgba(0,0,0,.87))' };
        try {
            var probe = document.createElement('button');
            probe.className = 'emby-button raised button-submit';
            probe.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none;';
            probe.tabIndex = -1;
            document.body.appendChild(probe);
            var cs = window.getComputedStyle(probe);
            if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') {
                out.bg = cs.backgroundColor;
                out.fg = cs.color;
            }
            probe.remove();
        } catch (e) { /* keep fallbacks */ }
        return out;
    }

    /** Background of the page (what native dialogs use), so the dialog matches light and dark themes. */
    function nativeSurface() {
        var els = [document.querySelector('.skinBody'), document.body, document.documentElement];
        for (var i = 0; i < els.length; i++) {
            if (!els[i]) { continue; }
            var c = window.getComputedStyle(els[i]).backgroundColor;
            if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
                return c;
            }
        }
        return 'var(--jf-palette-background-paper, #202020)';
    }

    function injectStyle() {
        if (document.getElementById('jellyAskStyle')) {
            return;
        }
        var css = [
            '@media (prefers-reduced-motion:no-preference){.jellyAskBackdrop{animation:jellyAskFade .12s ease-out}@keyframes jellyAskFade{from{opacity:0}to{opacity:1}}}',
            '#jfp-fab-dock{position:fixed;right:max(1rem,env(safe-area-inset-right));bottom:calc(max(1rem,env(safe-area-inset-bottom)) + var(--jfp-dock-lift,0px));z-index:' + Z + ';display:flex;flex-direction:column-reverse;align-items:flex-end;gap:.7rem;pointer-events:none}',
            '#jfp-fab-dock[hidden]{display:none}',
            '#jfp-fab-dock>*{pointer-events:auto;order:var(--jfp-order,50)}',
            '.jellyAskFab{--jfp-order:10;width:3.4rem;height:3.4rem;min-width:44px;min-height:44px;border-radius:50%;border:0;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;',
            'background:var(--jfp-accent,#00a4dc);color:var(--jfp-accent-fg,rgba(0,0,0,.87));box-shadow:var(--jf-shadows-6,0 2px 10px rgba(0,0,0,.4));font:inherit}',
            '.jellyAskFab svg{width:1.7rem;height:1.7rem;fill:currentColor;pointer-events:none}',
            '.jellyAskFab:hover{filter:brightness(1.1)}',
            '.jellyAskFab:focus-visible,.jellyAskModal button:focus-visible,.jellyAskModal textarea:focus-visible{outline:3px solid currentColor;outline-offset:2px}',
            '.jellyAskFab:focus-visible{outline-color:var(--jfp-accent,#00a4dc);outline-offset:3px;box-shadow:0 0 0 2px var(--jfp-surface,#101010)}',
            '.jellyAskBackdrop{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:' + Z_MODAL + ';display:flex;align-items:center;justify-content:center;',
            'padding:max(1rem,env(safe-area-inset-top)) max(1rem,env(safe-area-inset-right)) max(1rem,env(safe-area-inset-bottom)) max(1rem,env(safe-area-inset-left));box-sizing:border-box}',
            '.jellyAskModal{background:var(--jfp-surface,#101010);color:inherit;font:inherit;border-radius:.4em;padding:1.4em;max-width:32em;width:100%;max-height:100%;overflow:auto;box-sizing:border-box;box-shadow:var(--jf-shadows-24,0 8px 32px rgba(0,0,0,.5))}',
            '.jellyAskModal h2{margin:0 0 .3em;font-size:1.3em;font-weight:500}',
            '.jellyAskModal p.hint{opacity:.8;font-size:.92em;margin:0 0 1em}',
            '.jellyAskModal textarea{display:block;width:100%;min-height:7.5em;resize:vertical;font:inherit;padding:.7em;border-radius:.3em;box-sizing:border-box;',
            'border:1px solid rgba(128,128,128,.55);background:rgba(128,128,128,.14);color:inherit}',
            '.jellyAskModal textarea::placeholder{color:inherit;opacity:.55}',
            '.jellyAskMeta{display:flex;justify-content:space-between;gap:1em;font-size:.85em;margin-top:.5em;min-height:1.3em}',
            '.jellyAskStatus{opacity:.95}.jellyAskStatus.err{color:var(--jf-palette-error-light,#e57373)}',
            '.jellyAskCount{opacity:.65;white-space:nowrap}',
            '.jellyAskActions{display:flex;justify-content:flex-end;gap:.7em;margin-top:1em;flex-wrap:wrap}',
            '.jellyAskActions button{min-height:44px;min-width:44px;padding:.5em 1.3em;border-radius:.3em;border:1px solid transparent;cursor:pointer;font:inherit;font-weight:500}',
            '.jellyAskCancel{background:transparent;color:inherit;border-color:rgba(128,128,128,.6)!important}',
            '.jellyAskCancel:hover{background:rgba(128,128,128,.2)}',
            '.jellyAskSubmit{background:var(--jfp-accent,#00a4dc);color:var(--jfp-accent-fg,rgba(0,0,0,.87))}',
            '.jellyAskSubmit:hover:not(:disabled){filter:brightness(1.1)}',
            '.jellyAskSubmit:disabled{opacity:.5;cursor:default}',
            '.jfpSr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}'
        ].join('');
        var el = document.createElement('style');
        el.id = 'jellyAskStyle';
        el.textContent = css;
        document.head.appendChild(el);
    }

    var themeCache = null;

    function applyTheme(el, force) {
        var now = Date.now();
        if (force || !themeCache || now - themeCache.t > 4000) {
            var a = nativeAccent();
            themeCache = { t: now, bg: a.bg, fg: a.fg, surface: nativeSurface() };
        }
        el.style.setProperty('--jfp-accent', themeCache.bg);
        el.style.setProperty('--jfp-accent-fg', themeCache.fg);
        el.style.setProperty('--jfp-surface', themeCache.surface);
    }

    // ---------------------------------------------------------------- dock + FAB
    var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 4l2 3h-3l-2-3h-2l2 3h-3l-2-3H8l2 3H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>';

    function getDock() {
        var dock = document.getElementById('jfp-fab-dock');
        if (!dock) {
            dock = document.createElement('div');
            dock.id = 'jfp-fab-dock';
            document.body.appendChild(dock);
        }
        return dock;
    }

    var fab = null;

    function ensureFab() {
        if (!document.body) {
            return;
        }
        injectStyle();
        var dock = getDock();
        var show = !!accessToken() && !routeHidden() && !isTv();
        if (!fab || !dock.contains(fab)) {
            fab = document.createElement('button');
            fab.type = 'button';
            fab.className = 'jellyAskFab';
            fab.setAttribute('aria-label', 'Pedir película o serie');
            fab.setAttribute('aria-haspopup', 'dialog');
            fab.title = 'Pedir película o serie';
            fab.innerHTML = ICON;
            fab.addEventListener('click', function (evt) {
                evt.preventDefault();
                evt.stopPropagation();
                openModal(fab);
            });
            dock.appendChild(fab);
        }
        applyTheme(dock);
        // Keep clear of the native "now playing" bar when it is visible.
        var bar = document.querySelector('.nowPlayingBar:not(.hide)');
        var lift = bar && bar.offsetHeight ? bar.offsetHeight + 8 : 0;
        dock.style.setProperty('--jfp-dock-lift', lift + 'px');
        dock.hidden = !show;
    }

    // ---------------------------------------------------------------- dialog
    var modal = null;
    var opener = null;

    function focusables(root) {
        return Array.prototype.filter.call(
            root.querySelectorAll('button:not([disabled]),textarea:not([disabled]),input:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'),
            function (el) { return el.offsetParent !== null || el === document.activeElement; });
    }

    function closeModal() {
        if (!modal) {
            return;
        }
        document.removeEventListener('keydown', onKeydown, true);
        modal.remove();
        modal = null;
        if (opener && document.contains(opener)) {
            try { opener.focus(); } catch (e) { /* ignore */ }
        }
        opener = null;
    }

    function onKeydown(evt) {
        if (!modal) {
            return;
        }
        if (evt.key === 'Escape' || evt.key === 'Esc') {
            evt.preventDefault();
            evt.stopPropagation();
            closeModal();
            return;
        }
        if (evt.key === 'Tab') {
            var list = focusables(modal);
            if (!list.length) {
                evt.preventDefault();
                return;
            }
            var first = list[0];
            var last = list[list.length - 1];
            var active = document.activeElement;
            if (!modal.contains(active)) {
                evt.preventDefault();
                first.focus();
            } else if (evt.shiftKey && active === first) {
                evt.preventDefault();
                last.focus();
            } else if (!evt.shiftKey && active === last) {
                evt.preventDefault();
                first.focus();
            }
        }
    }

    function openModal(from) {
        if (modal) {
            return;
        }
        injectStyle();
        opener = from || document.activeElement;
        var backdrop = document.createElement('div');
        backdrop.className = 'jellyAskBackdrop';
        applyTheme(backdrop, true);
        backdrop.innerHTML = '' +
            '<div class="jellyAskModal" role="dialog" aria-modal="true" aria-labelledby="jellyAskTitle" aria-describedby="jellyAskHint">' +
            '  <h2 id="jellyAskTitle">Pedir película o serie</h2>' +
            '  <p class="hint" id="jellyAskHint">Incluye todos los detalles posibles para que podamos encontrar la película.</p>' +
            '  <label class="jfpSr" for="jellyAskText">Detalles de tu petición</label>' +
            '  <textarea id="jellyAskText" maxlength="' + LIMIT + '" placeholder="Título, año, temporada, idioma…"></textarea>' +
            '  <div class="jellyAskMeta"><div class="jellyAskStatus" role="status" aria-live="polite"></div><div class="jellyAskCount" aria-hidden="true"></div></div>' +
            '  <div class="jellyAskActions">' +
            '    <button type="button" class="jellyAskCancel">Cancelar</button>' +
            '    <button type="button" class="jellyAskSubmit">Enviar petición</button>' +
            '  </div>' +
            '</div>';

        var textarea = backdrop.querySelector('textarea');
        var statusEl = backdrop.querySelector('.jellyAskStatus');
        var countEl = backdrop.querySelector('.jellyAskCount');
        var submitBtn = backdrop.querySelector('.jellyAskSubmit');
        var cancelBtn = backdrop.querySelector('.jellyAskCancel');
        var sending = false;
        var closeTimer = null;

        function setStatus(text, isError) {
            statusEl.textContent = text;
            statusEl.classList.toggle('err', !!isError);
        }
        function updateCount() {
            countEl.textContent = textarea.value.length + ' / ' + LIMIT;
        }
        textarea.addEventListener('input', updateCount);
        updateCount();

        backdrop.addEventListener('mousedown', function (evt) {
            if (evt.target === backdrop && !sending) {
                closeModal();
            }
        });
        cancelBtn.addEventListener('click', function () {
            if (closeTimer) { clearTimeout(closeTimer); }
            closeModal();
        });

        submitBtn.addEventListener('click', function () {
            if (sending) {
                return;
            }
            var text = textarea.value.trim();
            if (!text) {
                setStatus('Escribe los detalles de tu petición.', true);
                textarea.focus();
                return;
            }
            var client = apiClient();
            var token = accessToken();
            if (!client || !token) {
                setStatus('Necesitas iniciar sesión para enviar una petición.', true);
                return;
            }
            sending = true;
            submitBtn.disabled = true;
            setStatus('Enviando…', false);
            var url = typeof client.getUrl === 'function' ? client.getUrl('JellyAsk/Request') : '/JellyAsk/Request';
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'MediaBrowser Token="' + token + '"' },
                body: JSON.stringify({ Text: text })
            }).then(function (r) {
                if (r.ok) {
                    setStatus('¡Petición enviada! Gracias.', false);
                    textarea.value = '';
                    updateCount();
                    closeTimer = setTimeout(closeModal, 1500);
                    return null;
                }
                return r.text().then(function (t) {
                    var msg = r.status === 429 ? 'Demasiadas peticiones seguidas. Espera un minuto.'
                        : r.status === 401 ? 'Tu sesión ha caducado: vuelve a iniciar sesión.'
                        : (t && t.length < 200 ? t.replace(/^"|"$/g, '') : 'Error del servidor (' + r.status + ').');
                    setStatus(msg, true);
                });
            }).catch(function () {
                setStatus('No se pudo contactar con el servidor.', true);
            }).then(function () {
                sending = false;
                submitBtn.disabled = false;
            });
        });

        document.body.appendChild(backdrop);
        modal = backdrop;
        document.addEventListener('keydown', onKeydown, true);
        textarea.focus();
    }

    // ---------------------------------------------------------------- lifecycle
    var scheduled = null;
    var observer = null;
    function schedule() {
        if (scheduled) {
            return;
        }
        scheduled = setTimeout(function () {
            scheduled = null;
            try { ensureFab(); } catch (e) { /* never break the host page */ }
            // Our own DOM changes (dock, colour probe) must not re-trigger us.
            if (observer) { observer.takeRecords(); }
        }, 120);
    }

    function start() {
        ensureFab();
        window.addEventListener('hashchange', schedule);
        window.addEventListener('popstate', schedule);
        document.addEventListener('viewshow', schedule);
        document.addEventListener('visibilitychange', schedule);
        // Login/logout and the body being re-rendered: cheap, direct children of <body> only.
        observer = new MutationObserver(schedule);
        observer.observe(document.body, { childList: true });
        // The token appears after login without a route change in some flows; the now-playing bar toggles too.
        setInterval(schedule, 3000);
    }

    if (document.body) {
        start();
    } else {
        document.addEventListener('DOMContentLoaded', start);
    }
})();
