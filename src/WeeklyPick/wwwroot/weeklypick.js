/*
 * WeeklyPick - client side (injected into jellyfin-web's index.html by the plugin).
 *
 * Shows the owner's "recomendación de la semana" once per user and week, as an accessible dialog.
 *  - Auth: "Authorization: MediaBrowser Token=..." (X-Emby-Token is rejected for user tokens on 12.x).
 *  - It waits for a login (also when the user logs in without a page reload), never while the video player
 *    is open, and tells the server it was shown (POST Seen) only after it is on screen.
 *  - Look: inherits fonts/colours from the page; accent copied from the native primary button.
 *  - Text is inserted with textContent. ESC / backdrop / buttons close it; focus is trapped and restored.
 */
(function () {
    'use strict';
    if (window.__weeklyPickLoaded) {
        return;
    }
    window.__weeklyPickLoaded = true;

    var Z = 10000; // our dialogs: above the FAB dock (1000), the now-playing bar (1201) and MUI menus (1300); below native dialogs (999998)
    var modal = null;
    var opener = null;
    var checkedToken = null;
    var checking = false;

    function apiClient() { return window.ApiClient || null; }
    function accessToken() {
        var c = apiClient();
        return c && typeof c.accessToken === 'function' ? c.accessToken() : null;
    }
    function apiUrl(path) {
        var c = apiClient();
        return c && typeof c.getUrl === 'function' ? c.getUrl(path) : '/' + path;
    }

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

    function nativeSurface() {
        var els = [document.querySelector('.skinBody'), document.body, document.documentElement];
        for (var i = 0; i < els.length; i++) {
            if (!els[i]) { continue; }
            var c = window.getComputedStyle(els[i]).backgroundColor;
            if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { return c; }
        }
        return 'var(--jf-palette-background-paper, #202020)';
    }

    function injectStyle() {
        if (document.getElementById('weeklyPickStyle')) {
            return;
        }
        var css = [
            '@media (prefers-reduced-motion:no-preference){.wpBackdrop{animation:wpFade .12s ease-out}@keyframes wpFade{from{opacity:0}to{opacity:1}}}',
            '.wpBackdrop{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:' + Z + ';display:flex;align-items:center;justify-content:center;',
            'padding:max(1rem,env(safe-area-inset-top)) max(1rem,env(safe-area-inset-right)) max(1rem,env(safe-area-inset-bottom)) max(1rem,env(safe-area-inset-left));box-sizing:border-box}',
            '.wpModal{background:var(--wp-surface,#101010);color:inherit;font:inherit;border-radius:.4em;padding:1.4em;max-width:32em;width:100%;max-height:100%;overflow:auto;box-sizing:border-box;box-shadow:var(--jf-shadows-24,0 8px 32px rgba(0,0,0,.5))}',
            '.wpModal h2{margin:0 0 .5em;font-size:1.3em;font-weight:500}',
            '.wpText{white-space:pre-wrap;overflow-wrap:anywhere;opacity:.92;margin:0 0 1.2em;line-height:1.5}',
            '.wpActions{display:flex;justify-content:flex-end;gap:.7em;flex-wrap:wrap}',
            '.wpActions button{min-height:44px;min-width:44px;padding:.5em 1.3em;border-radius:.3em;border:1px solid transparent;cursor:pointer;font:inherit;font-weight:500}',
            '.wpClose{background:transparent;color:inherit;border-color:rgba(128,128,128,.6)!important}',
            '.wpClose:hover{background:rgba(128,128,128,.2)}',
            '.wpView{background:var(--wp-accent,#00a4dc);color:var(--wp-accent-fg,rgba(0,0,0,.87))}',
            '.wpView:hover{filter:brightness(1.1)}',
            '.wpModal button:focus-visible{outline:3px solid currentColor;outline-offset:2px}'
        ].join('');
        var el = document.createElement('style');
        el.id = 'weeklyPickStyle';
        el.textContent = css;
        document.head.appendChild(el);
    }

    function focusables(root) {
        return Array.prototype.filter.call(root.querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'),
            function (el) { return el.offsetParent !== null || el === document.activeElement; });
    }

    function close() {
        if (!modal) { return; }
        document.removeEventListener('keydown', onKeydown, true);
        modal.remove();
        modal = null;
        if (opener && document.contains(opener)) {
            try { opener.focus(); } catch (e) { /* ignore */ }
        }
        opener = null;
    }

    function onKeydown(evt) {
        if (!modal) { return; }
        if (evt.key === 'Escape' || evt.key === 'Esc') {
            evt.preventDefault();
            evt.stopPropagation();
            close();
        } else if (evt.key === 'Tab') {
            var list = focusables(modal);
            if (!list.length) { evt.preventDefault(); return; }
            var first = list[0], last = list[list.length - 1], active = document.activeElement;
            if (!modal.contains(active)) { evt.preventDefault(); first.focus(); }
            else if (evt.shiftKey && active === first) { evt.preventDefault(); last.focus(); }
            else if (!evt.shiftKey && active === last) { evt.preventDefault(); first.focus(); }
        }
    }

    function showModal(text, itemId) {
        if (modal) { return; }
        injectStyle();
        opener = document.activeElement;
        var accent = nativeAccent();
        var backdrop = document.createElement('div');
        backdrop.className = 'wpBackdrop';
        backdrop.style.setProperty('--wp-accent', accent.bg);
        backdrop.style.setProperty('--wp-accent-fg', accent.fg);
        backdrop.style.setProperty('--wp-surface', nativeSurface());
        backdrop.innerHTML = '' +
            '<div class="wpModal focuscontainer" role="dialog" aria-modal="true" aria-labelledby="wpTitle" aria-describedby="wpText">' +
            '  <h2 id="wpTitle">Recomendación de la semana</h2>' +
            '  <p class="wpText" id="wpText"></p>' +
            '  <div class="wpActions"></div>' +
            '</div>';
        backdrop.querySelector('.wpText').textContent = text;
        var actions = backdrop.querySelector('.wpActions');
        var viewBtn = null;
        if (itemId && /^[0-9a-fA-F-]{32,36}$/.test(itemId)) {
            viewBtn = document.createElement('button');
            viewBtn.type = 'button';
            viewBtn.className = 'wpView';
            viewBtn.textContent = 'Ver ficha';
            actions.appendChild(viewBtn);
        }
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'wpClose';
        closeBtn.textContent = 'Cerrar';
        actions.appendChild(closeBtn);

        backdrop.addEventListener('mousedown', function (evt) { if (evt.target === backdrop) { close(); } });
        closeBtn.addEventListener('click', close);
        if (viewBtn) {
            viewBtn.addEventListener('click', function () {
                opener = null;
                close();
                window.location.hash = '#/details?id=' + itemId.replace(/-/g, '');
            });
        }

        document.body.appendChild(backdrop);
        modal = backdrop;
        document.addEventListener('keydown', onKeydown, true);
        var target = viewBtn || closeBtn;
        target.focus();
        // jellyfin-web may move focus to the page it is still loading behind us (TV autofocus): take it back once.
        setTimeout(function () {
            if (modal === backdrop && !backdrop.contains(document.activeElement)) { target.focus(); }
        }, 500);
    }

    function markSeen(t) {
        return fetch(apiUrl('WeeklyPick/Seen'), { method: 'POST', headers: { 'Authorization': 'MediaBrowser Token="' + t + '"' } })
            .catch(function () { /* worst case the user sees it once more */ });
    }

    function check() {
        var t = accessToken();
        if (!t || checking || checkedToken === t || /^#!?\/(video|login|selectserver|startup)/i.test(window.location.hash || '')) {
            return;
        }
        checking = true;
        fetch(apiUrl('WeeklyPick/Current'), { headers: { 'Authorization': 'MediaBrowser Token="' + t + '"' } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                checkedToken = t;
                if (data && data.Show && data.Text) {
                    showModal(data.Text, data.ItemId);
                    return markSeen(t);
                }
                return null;
            })
            .catch(function () { /* try again on the next route change */ })
            .then(function () { checking = false; });
    }

    function start() {
        // Logins without page reload (and the first load) are caught by route changes and a slow timer.
        window.addEventListener('hashchange', check);
        document.addEventListener('viewshow', check);
        setInterval(check, 4000);
        check();
    }

    if (document.body) {
        start();
    } else {
        document.addEventListener('DOMContentLoaded', start);
    }
})();
