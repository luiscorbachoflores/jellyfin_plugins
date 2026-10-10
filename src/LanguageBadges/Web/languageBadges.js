/*
 * Language Badges - client side (injected into jellyfin-web's index.html by the plugin).
 *
 * Finds poster cards / list rows / the detail page for playable items, asks the server
 * (GET /LanguageBadges/Items?ids=...) which audio + subtitle languages each item has and
 * paints small badges: solid = audio, outlined "sub" = subtitles only.
 * Pure DOM, no framework; safe to load twice (guarded).
 */
(function () {
    'use strict';
    if (window.__languageBadgesLoaded) { return; }
    window.__languageBadgesLoaded = true;

    var TYPES = { Movie: 1, Episode: 1, Series: 1, Season: 1, Video: 1, MusicVideo: 1 };
    var BATCH = 100;
    var CACHE_MS = 5 * 60 * 1000;

    var cfg = null;          // server options (ClientConfig)
    var cfgToken = null;     // token cfg was loaded with (reload after user switch)
    var cache = new Map();   // id -> { t: timestamp, v: {Audio:[], Subtitles:[]} | null }
    var pending = new Set();
    var inflight = new Set();
    var scanTimer = null;

    function api() {
        var c = window.ApiClient;
        return c && typeof c.accessToken === 'function' && c.accessToken() ? c : null;
    }

    function request(path) {
        var c = api();
        return fetch(c.getUrl(path), {
            headers: { 'Authorization': 'MediaBrowser Token="' + c.accessToken() + '"', 'Accept': 'application/json' }
        }).then(function (r) {
            if (!r.ok) { throw new Error('LanguageBadges HTTP ' + r.status); }
            return r.json();
        });
    }

    function ensureConfig() {
        var c = api();
        if (!c) { return Promise.resolve(null); }
        if (cfg && cfgToken === c.accessToken()) { return Promise.resolve(cfg); }
        cfgToken = c.accessToken();
        return request('LanguageBadges/ClientConfig').then(function (x) {
            cfg = {
                cards: x.ShowOnCards !== false,
                detail: x.ShowOnDetailPage !== false,
                subs: x.ShowSubtitles !== false,
                max: x.MaxCardLanguages || 3,
                hl: new Set(x.Highlight || [])
            };
            return cfg;
        }).catch(function () { cfgToken = null; return null; });
    }

    // ---------- styles ----------
    function injectStyles() {
        if (document.getElementById('lb-styles')) { return; }
        var s = document.createElement('style');
        s.id = 'lb-styles';
        s.textContent = [
            '.lb-badges{position:absolute;left:.35em;bottom:.35em;z-index:3;display:flex;flex-wrap:wrap;gap:.2em;max-width:calc(100% - .7em);pointer-events:none}',
            '.lb-chip{font:700 .72em/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:.03em;padding:.05em .4em;border-radius:.3em;',
            '  background:rgba(12,12,12,.86);color:#fff;border:1px solid rgba(255,255,255,.35);white-space:nowrap;text-shadow:none}',
            '.lb-chip.lb-hl{background:#ffb300;color:#111;border-color:#ffb300}',
            '.lb-chip.lb-sub{background:rgba(12,12,12,.72);color:#e8e8e8;border-style:dashed;font-weight:600}',
            '.lb-chip.lb-sub.lb-hl{background:rgba(12,12,12,.72);color:#ffca4a;border-color:#ffb300}',
            '.lb-chip.lb-more{background:rgba(12,12,12,.86)}',
            '.lb-inline{display:inline-flex;gap:.25em;margin-left:.5em;vertical-align:middle;position:static}',
            '.lb-detail{display:flex;flex-wrap:wrap;align-items:center;gap:.35em;margin:.5em 0 .2em}',
            '.lb-detail .lb-chip{font-size:.85em}',
            '.lb-detail .lb-label{opacity:.75;font-size:.9em;margin-right:.1em}',
            '.lb-detail .lb-sep{width:.8em}'
        ].join('\n');
        document.head.appendChild(s);
    }

    // ---------- rendering ----------
    function sortCodes(codes) {
        var hl = cfg.hl;
        return codes.slice().sort(function (a, b) { return (hl.has(b) ? 1 : 0) - (hl.has(a) ? 1 : 0); });
    }

    function chip(code, cls) {
        var el = document.createElement('span');
        el.className = 'lb-chip' + (cls ? ' ' + cls : '') + (cfg.hl.has(code) ? ' lb-hl' : '');
        el.textContent = code;
        return el;
    }

    function buildCompact(langs, box) {
        var audio = sortCodes(langs.Audio || []);
        var shown = audio.slice(0, cfg.max);
        shown.forEach(function (c) { box.appendChild(chip(c)); });
        if (audio.length > shown.length) {
            var more = chip('+' + (audio.length - shown.length), 'lb-more');
            more.title = audio.slice(cfg.max).join(', ');
            box.appendChild(more);
        }
        if (cfg.subs) {
            // Only subtitles that add something (a language not already available as audio), max 2.
            sortCodes((langs.Subtitles || []).filter(function (c) { return audio.indexOf(c) < 0 && c !== '?'; }))
                .slice(0, 2)
                .forEach(function (c) { box.appendChild(chip('sub ' + c, 'lb-sub')); });
        }
        box.title = 'Audio: ' + (audio.join(', ') || '-') +
            (langs.Subtitles && langs.Subtitles.length ? ' | Subtitulos: ' + langs.Subtitles.join(', ') : '');
        return box.childNodes.length > 0;
    }

    function paintCard(el, id, langs) {
        var old = el.querySelector(':scope .lb-badges');
        if (old) { old.remove(); }
        if (!langs) { return; }
        var isList = el.classList.contains('listItem');
        var host = isList
            ? el.querySelector('.listItemBody .listItemBodyText') || el.querySelector('.listItemBody')
            : el.querySelector('.cardScalable') || el.querySelector('.cardImageContainer');
        if (!host) { return; }
        var box = document.createElement(isList ? 'span' : 'div');
        box.className = 'lb-badges' + (isList ? ' lb-inline' : '');
        if (buildCompact(langs, box)) { host.appendChild(box); }
    }

    function paintDetail(page, id, langs) {
        var old = page.querySelector('.lb-detail');
        if (old && old.getAttribute('data-lb-id') === id) { return; }
        if (old) { old.remove(); }
        if (!langs || (!(langs.Audio || []).length && !(langs.Subtitles || []).length)) { return; }
        var anchor = page.querySelector('.itemMiscInfo-primary') ||
            page.querySelector('.itemMiscInfo') ||
            page.querySelector('.nameContainer');
        if (!anchor) { return; }
        var row = document.createElement('div');
        row.className = 'lb-detail';
        row.setAttribute('data-lb-id', id);
        var lbl = document.createElement('span');
        lbl.className = 'lb-label';
        lbl.textContent = 'Audio:';
        row.appendChild(lbl);
        var audio = sortCodes(langs.Audio || []);
        if (!audio.length) { row.appendChild(chip('?')); }
        audio.forEach(function (c) { row.appendChild(chip(c)); });
        if (cfg.subs && (langs.Subtitles || []).length) {
            var sep = document.createElement('span'); sep.className = 'lb-sep'; row.appendChild(sep);
            var l2 = document.createElement('span'); l2.className = 'lb-label'; l2.textContent = 'Subtitulos:';
            row.appendChild(l2);
            sortCodes(langs.Subtitles).forEach(function (c) { row.appendChild(chip(c, 'lb-sub')); });
        }
        anchor.parentNode.insertBefore(row, anchor.nextSibling);
    }

    // ---------- data ----------
    function cached(id) {
        var e = cache.get(id);
        return e && (Date.now() - e.t) < CACHE_MS ? e : null;
    }

    function fetchPending() {
        var ids = Array.from(pending).filter(function (id) { return !inflight.has(id); });
        pending.clear();
        for (var i = 0; i < ids.length; i += BATCH) {
            (function (chunk) {
                chunk.forEach(function (id) { inflight.add(id); });
                request('LanguageBadges/Items?ids=' + chunk.join(',')).then(function (res) {
                    var now = Date.now();
                    chunk.forEach(function (id) { cache.set(id, { t: now, v: res[id] || null }); });
                }).catch(function (e) {
                    console.warn(e);
                }).then(function () {
                    chunk.forEach(function (id) { inflight.delete(id); });
                    scan(true);
                });
            })(ids.slice(i, i + BATCH));
        }
    }

    // ---------- scanning ----------
    function detailContext() {
        var m = /[?&]id=([0-9a-fA-F-]{32,36})/.exec(location.hash || location.search || '');
        if (!m || !/details/i.test(location.hash + location.pathname)) { return null; }
        var page = document.querySelector('#itemDetailPage:not(.hide)') ||
            document.querySelector('.itemDetailPage:not(.hide)');
        return page ? { id: m[1].replace(/-/g, '').toLowerCase(), page: page } : null;
    }

    function scan(fromFetch) {
        if (!cfg) { return; }
        var want = [];

        if (cfg.cards) {
            var els = document.querySelectorAll('.card[data-id][data-type], .listItem[data-id][data-type]');
            for (var i = 0; i < els.length; i++) {
                var el = els[i];
                if (!TYPES[el.getAttribute('data-type')]) { continue; }
                var id = el.getAttribute('data-id');
                // Cards get recycled by virtual scrolling: repaint when the id changed.
                if (el.getAttribute('data-lb-id') === id) { continue; }
                var e = cached(id);
                if (e) {
                    paintCard(el, id, e.v);
                    el.setAttribute('data-lb-id', id);
                } else {
                    want.push(id);
                }
            }
        }

        if (cfg.detail) {
            var d = detailContext();
            if (d) {
                var de = cached(d.id);
                if (de) { paintDetail(d.page, d.id, de.v); } else { want.push(d.id); }
            }
        }

        want.forEach(function (id) { if (!inflight.has(id)) { pending.add(id); } });
        if (pending.size && !fromFetch) { fetchPending(); } else if (pending.size) { setTimeout(fetchPending, 50); }
    }

    function scheduleScan() {
        if (scanTimer) { return; }
        scanTimer = setTimeout(function () {
            scanTimer = null;
            if (!api()) { return; }
            ensureConfig().then(function (c) { if (c) { injectStyles(); scan(false); } });
        }, 250);
    }

    function start() {
        new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
        window.addEventListener('hashchange', scheduleScan);
        window.addEventListener('popstate', scheduleScan);
        scheduleScan();
    }

    if (document.body) { start(); } else { document.addEventListener('DOMContentLoaded', start); }
})();
