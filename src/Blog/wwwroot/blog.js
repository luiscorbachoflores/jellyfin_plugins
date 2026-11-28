(function () {
    'use strict';

    if (window.__blogLoaded) {
        return;
    }
    window.__blogLoaded = true;

    // Blog de la Titoteca. Pantalla propia en #/blog que se pinta dentro de la ruta comodin de
    // jellyfin-web (#fallbackPage / FallbackRoute). Principios: nunca tocar ni borrar los nodos de
    // React (solo se anade un <div data-blog-root> como ultimo hijo), un unico MutationObserver
    // agrupado en requestAnimationFrame, CSS acotado a [data-blog-root] y a html.blogRoute,
    // y TODO el texto de usuarios se inserta con textContent / createTextNode (nunca innerHTML).
    // El texto de las entradas es un markdown minimo (negrita, cursiva, titulos, citas, listas,
    // enlaces y menciones @[Titulo](id)) que se convierte a DOM con un analizador propio.

    var ROOT_ATTR = 'data-blog-root';
    var DEFAULT_TITLE = 'Blog de cine';
    var SIDEBAR_TTL = 60000;
    var MAX_MENTIONS = 20;
    var LOGIN_RETRIES = 20;
    var AUTOSAVE_MS = 1600;
    var COVER_MAX_SIDE = 1600;

    // Hereda los colores de la Titoteca (--tt-*) si existen; si no, cae a los de Jellyfin.
    var R = '[data-blog-root]';
    var VARS = [
        '--b-ink:var(--tt-ink,var(--jf-palette-text-primary,#ebebeb))',
        '--b-muted:var(--tt-muted,var(--jf-palette-text-secondary,rgba(170,170,170,.95)))',
        '--b-accent:var(--tt-coral,var(--jf-palette-primary-main,#00a4dc))',
        '--b-accent-deep:var(--tt-coral-deep,var(--jf-palette-primary-dark,#0086b3))',
        '--b-gold:var(--tt-gold,#e6c75b)',
        '--b-surface:var(--tt-surface,var(--jf-palette-background-paper,rgba(255,255,255,.05)))',
        '--b-surface2:var(--tt-surface-2,rgba(255,255,255,.08))',
        '--b-field:var(--tt-bg,var(--jf-palette-background-default,rgba(0,0,0,.25)))',
        '--b-line:var(--tt-line,var(--jf-palette-divider,rgba(128,128,128,.3)))',
        '--b-serif:var(--tt-serif,Georgia,"Times New Roman",serif)',
        '--b-danger:#e57373'
    ].join(';');

    function S(sel, css) { return R + (sel ? ' ' + sel : '') + '{' + css + '}'; }

    var STYLE = [
        'html.blogRoute #fallbackPage > :not([data-blog-root]){display:none !important;}',
        R + '{' + VARS + ';color:var(--b-ink);padding-top:1.2em;padding-bottom:4em;box-sizing:border-box;max-width:1180px;margin:0 auto;}',
        S('*', 'box-sizing:border-box;'),
        S('a,a:visited', 'color:var(--b-accent);text-decoration:none;'),
        S('a:hover', 'text-decoration:underline;'),
        S('a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible,[tabindex]:focus-visible', 'outline:2px solid var(--b-gold);outline-offset:2px;'),

        // cabecera y pestanas
        S('.blogHeader', 'display:flex;flex-wrap:wrap;gap:1em 2em;align-items:flex-end;justify-content:space-between;margin-bottom:.6em;'),
        S('.blogHeaderText', 'min-width:0;'),
        S('.blogTitle', 'margin:0;font-family:var(--b-serif);font-size:2.4em;font-weight:500;letter-spacing:-.01em;line-height:1.1;'),
        S('.blogTitle a', 'color:inherit;'),
        S('.blogTitle a:hover', 'text-decoration:none;'),
        S('.blogDescription', 'margin:.45em 0 0;color:var(--b-muted);font-family:var(--b-serif);font-style:italic;font-size:1.1em;'),
        S('.blogTabs', 'display:flex;flex-wrap:wrap;gap:.2em 1.4em;margin:0 0 1.6em;border-bottom:1px solid var(--b-line);'),
        S('.blogTab', 'display:inline-flex;align-items:center;gap:.4em;min-height:44px;color:var(--b-muted);border-bottom:2px solid transparent;margin-bottom:-1px;'),
        S('.blogTab:hover', 'color:var(--b-ink);text-decoration:none;'),
        S('.blogTab[aria-current="page"]', 'color:var(--b-ink);border-bottom-color:var(--b-accent);'),
        S('.blogTabCount', 'font-size:.8em;color:var(--b-muted);background:var(--b-surface2);border-radius:1em;padding:.05em .55em;'),
        S('.blogLayout', 'display:grid;grid-template-columns:minmax(0,2.1fr) minmax(0,1fr);gap:2.4em;align-items:start;'),
        S('.blogLayoutSolo', 'grid-template-columns:minmax(0,1fr);max-width:780px;margin:0 auto;'),
        '@media (max-width:820px){' + R + ' .blogLayout{grid-template-columns:minmax(0,1fr);}' + R + ' .blogTitle{font-size:1.9em;}}',

        // botones
        S('.blogBtn', 'display:inline-flex;align-items:center;justify-content:center;gap:.4em;min-height:40px;font:inherit;font-size:.95em;color:var(--b-ink);background:transparent;border:1px solid var(--b-line);border-radius:3px;padding:.4em 1em;cursor:pointer;text-decoration:none;'),
        S('.blogBtn:hover', 'text-decoration:none;background:var(--b-surface2);'),
        S('.blogBtn[disabled]', 'opacity:.5;cursor:default;'),
        S('.blogBtnPrimary', 'background:var(--b-accent);border-color:var(--b-accent);color:#fff8f2;'),
        S('.blogBtnPrimary:hover', 'background:var(--b-accent-deep);border-color:var(--b-accent-deep);'),
        S('.blogBtnDanger', 'color:var(--b-danger);border-color:var(--b-danger);'),
        S('.blogBtnQuiet', 'border-color:transparent;color:var(--b-muted);'),
        S('.blogNotice', 'margin:0 0 1.4em;padding:.7em 1em;border:1px solid var(--b-line);background:var(--b-surface);border-radius:3px;'),
        S('.blogBanner', 'display:flex;flex-wrap:wrap;gap:.4em 1em;align-items:center;margin:0 0 1.2em;padding:.7em 1em;border:1px solid var(--b-gold);border-radius:3px;color:var(--b-ink);background:var(--b-surface);'),
        S('.blogBanner strong', 'color:var(--b-gold);font-weight:600;'),

        // lista y tarjetas
        S('.blogDateHeader', 'margin:2.2em 0 1em;font-size:.95em;font-weight:400;color:var(--b-muted);border-bottom:1px solid var(--b-line);padding-bottom:.4em;'),
        S('.blogDateHeader::first-letter', 'text-transform:uppercase;'),
        S('.blogDateHeader:first-child', 'margin-top:0;'),
        S('.blogPost', 'background:var(--b-surface);border:1px solid var(--b-line);border-radius:4px;padding:1.4em 1.6em;margin-bottom:1.4em;'),
        '@media (max-width:560px){' + R + ' .blogPost{padding:1.1em 1em;}}',
        S('.blogPostHead', 'display:flex;flex-wrap:wrap;align-items:center;gap:.3em .8em;margin-bottom:.5em;'),
        S('.blogPostTitle', 'margin:0 0 .35em;font-family:var(--b-serif);font-size:1.7em;font-weight:500;line-height:1.2;overflow-wrap:anywhere;'),
        S('.blogPostTitle a', 'color:inherit;'),
        S('.blogPostTitle a:hover', 'color:var(--b-accent);text-decoration:none;'),
        S('.blogPostFull .blogPostTitle', 'font-size:2.2em;'),
        S('.blogByline', 'margin:0 0 1.2em;color:var(--b-muted);font-size:.92em;'),
        S('.blogBadge', 'display:inline-flex;align-items:center;gap:.35em;font-size:.78em;padding:.15em .7em;border-radius:1em;border:1px solid var(--b-gold);color:var(--b-gold);line-height:1.5;'),
        S('.blogBadge svg', 'width:.95em;height:.95em;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;'),
        S('.blogCover', 'display:block;width:100%;max-height:300px;object-fit:cover;border-radius:3px;margin:.4em 0 1.1em;background:var(--b-surface2);min-height:120px;'),
        S('.blogPostFull .blogCover', 'max-height:380px;'),
        S('.blogReadMore', 'margin:.8em 0 0;'),

        // texto de la entrada
        S('.blogProse', 'font-family:var(--b-serif);font-size:1.12em;line-height:1.75;overflow-wrap:anywhere;max-width:68ch;'),
        S('.blogProse > :first-child', 'margin-top:0;'),
        S('.blogProse > :last-child', 'margin-bottom:0;'),
        S('.blogProse p', 'margin:0 0 1em;'),
        S('.blogProse h3,.blogProse h4,.blogProse h5', 'font-weight:600;line-height:1.3;margin:1.6em 0 .5em;'),
        S('.blogProse h3', 'font-size:1.4em;'),
        S('.blogProse h4', 'font-size:1.2em;'),
        S('.blogProse h5', 'font-size:1.05em;'),
        S('.blogProse blockquote', 'margin:1.2em 0;padding:.1em 0 .1em 1.1em;border-left:3px solid var(--b-gold);color:var(--b-muted);font-style:italic;'),
        S('.blogProse ul,.blogProse ol', 'margin:0 0 1em;padding-left:1.4em;'),
        S('.blogProse li', 'margin:.2em 0;'),
        S('.blogProse hr', 'border:0;border-top:1px solid var(--b-line);margin:1.8em 0;'),
        S('.blogProse a', 'text-decoration:underline;text-underline-offset:2px;'),
        S('.blogProse .blogMentionLink', 'color:inherit;text-decoration:underline;text-decoration-color:var(--b-accent);text-decoration-thickness:2px;text-underline-offset:3px;'),
        S('.blogProse .blogMentionLink:hover', 'color:var(--b-accent);'),
        S('.blogCommentBody', 'white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55;'),

        // estanteria de caratulas
        S('.blogShelf', 'margin:1.8em 0 .4em;padding-top:1.1em;border-top:1px solid var(--b-line);'),
        S('.blogShelfTitle', 'margin:0 0 .8em;font-size:.95em;font-weight:500;color:var(--b-muted);'),
        S('.blogShelfRow', 'display:flex;flex-wrap:wrap;gap:1em;'),
        S('.blogMention', 'width:112px;font-size:.85em;line-height:1.3;'),
        S('.blogShelfSmall .blogMention', 'width:76px;font-size:.78em;'),
        S('.blogMention a.blogPosterLink', 'display:block;border-radius:3px;overflow:hidden;box-shadow:0 0 0 1px var(--b-line);'),
        S('.blogMention a.blogPosterLink:hover', 'box-shadow:0 0 0 2px var(--b-accent);'),
        S('.blogPoster', 'display:block;width:100%;aspect-ratio:2/3;object-fit:cover;background:var(--b-surface2);'),
        S('.blogPosterBox', 'display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:2/3;padding:.4em;text-align:center;overflow:hidden;overflow-wrap:anywhere;background:var(--b-surface2);'),
        S('.blogMentionName', 'display:block;margin-top:.45em;color:var(--b-ink);font-weight:500;'),
        S('.blogMentionYear', 'display:block;color:var(--b-muted);'),
        S('.blogMentionMore', 'display:block;margin-top:.2em;'),

        // pie y paginacion
        S('.blogPostFooter', 'margin-top:1.3em;padding-top:.8em;border-top:1px solid var(--b-line);font-size:.88em;color:var(--b-muted);line-height:1.7;'),
        S('.blogPostActions', 'margin:0 0 1.2em;display:flex;flex-wrap:wrap;gap:.6em;align-items:center;'),
        S('.blogPager', 'display:flex;flex-wrap:wrap;gap:1em;justify-content:space-between;margin:2em 0;'),

        // comentarios
        S('.blogComments h3', 'margin:2em 0 .8em;font-family:var(--b-serif);font-size:1.35em;font-weight:500;'),
        S('.blogComment', 'padding:.9em 0;border-bottom:1px solid var(--b-line);'),
        S('.blogCommentMeta', 'font-size:.85em;color:var(--b-muted);margin-bottom:.3em;'),
        S('.blogCommentMeta strong', 'color:var(--b-ink);'),
        S('.blogCommentActions', 'margin-top:.4em;display:flex;gap:.5em;flex-wrap:wrap;'),

        // formularios
        S('.blogField', 'margin-bottom:1.2em;'),
        S('.blogField > label,.blogLabelText', 'display:block;margin-bottom:.35em;color:var(--b-muted);font-size:.9em;'),
        S('.blogInput,.blogTextarea', 'display:block;width:100%;font:inherit;color:var(--b-ink);background:var(--b-field);border:1px solid var(--b-line);border-radius:3px;padding:.6em .75em;min-height:44px;'),
        S('.blogInput:focus,.blogTextarea:focus', 'border-color:var(--b-gold);outline:none;'),
        S('.blogTextarea', 'min-height:8em;resize:vertical;'),
        S('.blogCheck', 'display:flex;align-items:flex-start;gap:.6em;cursor:pointer;line-height:1.4;'),
        S('.blogCheck input', 'margin-top:.25em;'),
        S('.blogError', 'color:var(--b-danger);margin:.5em 0;white-space:pre-wrap;'),
        S('.blogMuted', 'color:var(--b-muted);'),
        S('.blogFormButtons', 'display:flex;gap:.6em;flex-wrap:wrap;align-items:center;'),
        S('.blogHint', 'color:var(--b-muted);font-size:.88em;margin:.3em 0 0;'),

        // editor
        S('.blogEditor', 'display:block;'),
        S('.blogEditorBar', 'position:sticky;top:64px;z-index:5;display:flex;flex-wrap:wrap;gap:.6em 1em;align-items:center;justify-content:space-between;padding:.7em 0;margin-bottom:1em;background:var(--tt-bg,var(--jf-palette-background-default,#101010));border-bottom:1px solid var(--b-line);'),
        '@media (max-width:820px){' + R + ' .blogEditorBar{position:static;}}',
        S('.blogSaveState', 'font-size:.88em;color:var(--b-muted);min-width:9em;'),
        S('.blogSaveState[data-s="saving"]', 'color:var(--b-gold);'),
        S('.blogSaveState[data-s="error"]', 'color:var(--b-danger);'),
        S('.blogTitleInput', 'display:block;width:100%;font-family:var(--b-serif);font-size:2.1em;font-weight:500;line-height:1.2;color:var(--b-ink);background:transparent;border:0;border-bottom:1px solid var(--b-line);border-radius:0;padding:.3em 0;margin-bottom:.8em;'),
        S('.blogTitleInput:focus', 'outline:none;border-bottom-color:var(--b-gold);'),
        S('.blogTitleInput::placeholder,.blogBody::placeholder', 'color:var(--b-muted);opacity:.6;'),
        S('.blogCoverDrop', 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.4em;min-height:110px;border:1px dashed var(--b-line);border-radius:4px;color:var(--b-muted);text-align:center;padding:1em;cursor:pointer;margin-bottom:1.2em;'),
        S('.blogCoverDrop:hover,.blogCoverDrop.isOver', 'border-color:var(--b-gold);color:var(--b-ink);'),
        S('.blogCoverBox', 'position:relative;margin-bottom:1.2em;'),
        S('.blogCoverBox .blogCover', 'margin:0;'),
        S('.blogCoverBox .blogBtn', 'position:absolute;top:.6em;right:.6em;background:rgba(20,17,15,.85);'),
        S('.blogToolbar', 'display:flex;flex-wrap:wrap;gap:.3em;align-items:center;padding:.4em;border:1px solid var(--b-line);border-bottom:0;border-radius:3px 3px 0 0;background:var(--b-surface);'),
        S('.blogToolbar .blogBtn', 'min-height:36px;padding:.2em .75em;border-color:transparent;font-size:.9em;'),
        S('.blogToolbar .blogBtn:hover', 'border-color:var(--b-line);'),
        S('.blogToolbar .blogBtn[aria-pressed="true"]', 'background:var(--b-surface2);border-color:var(--b-gold);'),
        S('.blogToolbarSpacer', 'flex:1;'),
        S('.blogWrite', 'position:relative;'),
        S('.blogBody', 'display:block;width:100%;min-height:22em;font-family:var(--b-serif);font-size:1.15em;line-height:1.75;color:var(--b-ink);background:var(--b-field);border:1px solid var(--b-line);border-radius:0 0 3px 3px;padding:1em 1.1em;resize:none;overflow:hidden;'),
        S('.blogBody:focus', 'border-color:var(--b-gold);outline:none;'),
        S('.blogPreview', 'min-height:22em;border:1px solid var(--b-line);border-radius:0 0 3px 3px;padding:1em 1.1em;background:var(--b-field);'),
        S('.blogEditorMeta', 'display:flex;justify-content:space-between;gap:1em;margin-top:.4em;color:var(--b-muted);font-size:.85em;'),
        S('.blogSuggest', 'position:absolute;z-index:20;width:min(360px,100%);max-height:320px;overflow:auto;background:var(--b-surface2);border:1px solid var(--b-gold);border-radius:4px;box-shadow:0 8px 24px rgba(0,0,0,.45);'),
        S('.blogSuggest:empty', 'display:none;'),
        S('.blogSuggestHint', 'padding:.7em .9em;color:var(--b-muted);font-size:.9em;'),
        S('.blogHit', 'display:flex;align-items:center;gap:.7em;width:100%;font:inherit;text-align:left;color:var(--b-ink);background:transparent;border:0;border-bottom:1px solid var(--b-line);padding:.45em .7em;cursor:pointer;min-height:44px;'),
        S('.blogHit:last-child', 'border-bottom:0;'),
        S('.blogHit:hover,.blogHit[aria-selected="true"]', 'background:var(--b-surface);'),
        S('.blogHit img,.blogHit .blogHitNoImg', 'width:30px;height:45px;object-fit:cover;border-radius:2px;background:var(--b-surface);flex:none;'),
        S('.blogHitMeta', 'color:var(--b-muted);font-size:.85em;'),
        S('.blogEditorSection', 'margin-top:2.2em;padding-top:1.4em;border-top:1px solid var(--b-line);'),
        S('.blogEditorSection h3', 'margin:0 0 .3em;font-family:var(--b-serif);font-size:1.25em;font-weight:500;'),
        S('.blogShelfEdit', 'display:flex;flex-wrap:wrap;gap:1em;margin:1em 0;'),
        S('.blogShelfEdit:empty', 'display:none;'),
        S('.blogShelfCard', 'position:relative;width:112px;font-size:.82em;line-height:1.3;cursor:grab;'),
        S('.blogShelfCard.isDragging', 'opacity:.4;'),
        S('.blogShelfCard.isTarget .blogPoster,.blogShelfCard.isTarget .blogPosterBox', 'outline:2px solid var(--b-gold);'),
        S('.blogShelfNum', 'position:absolute;top:.35em;left:.35em;min-width:1.7em;height:1.7em;display:flex;align-items:center;justify-content:center;border-radius:1em;background:rgba(20,17,15,.88);color:var(--b-gold);font-size:.9em;font-weight:600;'),
        S('.blogShelfCtl', 'display:flex;gap:.2em;margin-top:.4em;'),
        S('.blogShelfCtl .blogBtn', 'min-height:34px;min-width:34px;padding:.1em .3em;font-size:.95em;flex:1;'),
        S('.blogChips', 'display:flex;flex-wrap:wrap;gap:.4em;margin:.5em 0;'),
        S('.blogChip', 'display:inline-flex;align-items:center;gap:.2em;padding:.1em .2em .1em .8em;border:1px solid var(--b-line);border-radius:1em;background:var(--b-surface);'),
        S('.blogChipRemove', 'font:inherit;color:inherit;background:transparent;border:0;cursor:pointer;min-width:28px;min-height:28px;border-radius:50%;'),
        S('.blogPublish', 'margin:1.4em 0;padding:1em 1.2em;border:1px solid var(--b-gold);border-radius:4px;background:var(--b-surface);'),
        S('.blogPublish[hidden]', 'display:none;'),
        S('.blogPublishOption', 'display:flex;flex-wrap:wrap;gap:.5em 1em;align-items:center;justify-content:space-between;padding:.6em 0;'),
        S('.blogPublishOption + .blogPublishOption', 'border-top:1px solid var(--b-line);'),
        S('.blogPublishOption p', 'margin:0;flex:1 1 260px;color:var(--b-muted);font-size:.92em;'),
        S('.blogPublishOption p strong', 'color:var(--b-ink);'),
        S('.blogLock', 'font-size:.9em;color:var(--b-muted);margin:.4em 0 0;'),

        // barra lateral
        S('.blogWidget', 'background:var(--b-surface);border:1px solid var(--b-line);border-radius:4px;padding:.9em 1.1em;margin-bottom:1.2em;'),
        S('.blogWidget h3', 'margin:0 0 .6em;font-family:var(--b-serif);font-size:1.1em;font-weight:500;'),
        S('.blogWidget ul', 'list-style:none;margin:0;padding:0;'),
        S('.blogWidget li', 'margin:.3em 0;overflow-wrap:anywhere;'),
        S('.blogSearch', 'display:flex;gap:.4em;'),
        S('.blogSearch .blogInput', 'flex:1;min-width:0;'),
        S('.blogWidget details', 'margin:.2em 0;'),
        S('.blogWidget details details', 'margin-left:1em;'),
        S('.blogWidget summary', 'cursor:pointer;padding:.25em 0;'),
        S('.blogWidget details ul', 'margin-left:1em;'),
        S('.blogRecentExcerpt', 'display:block;color:var(--b-muted);font-size:.9em;')
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

    var SVG_NS = 'http://www.w3.org/2000/svg';
    function svgIcon(paths) {
        var s = document.createElementNS(SVG_NS, 'svg');
        s.setAttribute('viewBox', '0 0 24 24');
        s.setAttribute('aria-hidden', 'true');
        paths.forEach(function (d) {
            var p = document.createElementNS(SVG_NS, 'path');
            p.setAttribute('d', d);
            s.appendChild(p);
        });
        return s;
    }
    function lockIcon() { return svgIcon(['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3']); }
    function pencilIcon() { return svgIcon(['M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z']); }

    function isHttpUrl(s) {
        try {
            var u = new URL(s);
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch (e) {
            return false;
        }
    }

    function normId(id) { return String(id || '').replace(/-/g, '').toLowerCase(); }

    function plural(n, one, many) { return n === 1 ? '1 ' + one : n + ' ' + many; }

    function countWords(t) {
        var m = String(t || '').replace(/@\[([^\]\n]*)\]/g, '$1').match(/\S+/g);
        return m ? m.length : 0;
    }

    // ---------------------------------------------------------------- texto de las entradas (markdown minimo -> DOM)

    // Menciones @[Titulo](id), enlaces [texto](https://...), **negrita**, *cursiva* y URLs sueltas.
    var INLINE_SRC = '@\\[([^\\]\\n]{1,200})\\]\\(([0-9a-fA-F-]{32,36})\\)'
        + '|\\[([^\\]\\n]{1,200})\\]\\((https?:\\/\\/[^\\s)]{1,500})\\)'
        + '|\\*\\*([^*\\n]+?)\\*\\*'
        + '|\\*([^*\\n]+?)\\*'
        + '|(https?:\\/\\/[^\\s<>"\'`]+)';

    function inlineFrag(text, depth) {
        var frag = document.createDocumentFragment();
        text = String(text === null || text === undefined ? '' : text);
        var re = new RegExp(INLINE_SRC, 'g');
        var last = 0;
        var m;
        function pushText(t) { if (t) { frag.appendChild(document.createTextNode(t)); } }
        while ((m = re.exec(text)) !== null) {
            if (m[0].length === 0) { re.lastIndex++; continue; }
            pushText(text.slice(last, m.index));
            last = m.index + m[0].length;
            if (m[1] !== undefined) {
                frag.appendChild(el('a', { class: 'blogMentionLink', href: '#/details?id=' + encodeURIComponent(normId(m[2])), title: 'Ir a la ficha', text: m[1] }));
            } else if (m[3] !== undefined) {
                if (isHttpUrl(m[4])) {
                    frag.appendChild(el('a', { href: m[4], target: '_blank', rel: 'noopener noreferrer', text: m[3] }));
                } else { pushText(m[0]); }
            } else if (m[5] !== undefined) {
                frag.appendChild(el('strong', {}, depth < 2 ? inlineFrag(m[5], depth + 1) : m[5]));
            } else if (m[6] !== undefined) {
                frag.appendChild(el('em', {}, depth < 2 ? inlineFrag(m[6], depth + 1) : m[6]));
            } else {
                var url = m[7].replace(/[.,;:!?)\]}]+$/, '');
                last = m.index + url.length;
                re.lastIndex = last;
                if (isHttpUrl(url)) {
                    frag.appendChild(el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: url }));
                } else { pushText(url); }
            }
        }
        pushText(text.slice(last));
        return frag;
    }

    function renderBody(text) {
        var root = el('div', { class: 'blogProse' });
        var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
        var i = 0;
        var para = [];
        function flush() {
            if (!para.length) { return; }
            var p = el('p');
            para.forEach(function (ln, k) {
                if (k) { p.appendChild(el('br')); }
                p.appendChild(inlineFrag(ln, 0));
            });
            root.appendChild(p);
            para = [];
        }
        while (i < lines.length) {
            var ln = lines[i];
            var h;
            if (!ln.trim()) { flush(); i++; continue; }
            if ((h = /^(#{1,3})\s+(.+)$/.exec(ln))) {
                flush();
                root.appendChild(el(h[1].length === 1 ? 'h3' : (h[1].length === 2 ? 'h4' : 'h5'), {}, inlineFrag(h[2], 0)));
                i++; continue;
            }
            if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(ln)) { flush(); root.appendChild(el('hr')); i++; continue; }
            if (/^>\s?/.test(ln)) {
                flush();
                var bq = el('blockquote');
                var first = true;
                while (i < lines.length && /^>\s?/.test(lines[i])) {
                    if (!first) { bq.appendChild(el('br')); }
                    first = false;
                    bq.appendChild(inlineFrag(lines[i].replace(/^>\s?/, ''), 0));
                    i++;
                }
                root.appendChild(bq);
                continue;
            }
            if (/^\s*[-*]\s+/.test(ln)) {
                flush();
                var ul = el('ul');
                while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
                    ul.appendChild(el('li', {}, inlineFrag(lines[i].replace(/^\s*[-*]\s+/, ''), 0)));
                    i++;
                }
                root.appendChild(ul);
                continue;
            }
            if (/^\s*\d+[.)]\s+/.test(ln)) {
                flush();
                var ol = el('ol');
                while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
                    ol.appendChild(el('li', {}, inlineFrag(lines[i].replace(/^\s*\d+[.)]\s+/, ''), 0)));
                    i++;
                }
                root.appendChild(ol);
                continue;
            }
            para.push(ln);
            i++;
        }
        flush();
        return root;
    }

    // Comentarios: texto plano con URLs enlazadas.
    function linkify(text) {
        var frag = document.createDocumentFragment();
        text = String(text === null || text === undefined ? '' : text);
        var re = /https?:\/\/[^\s<>"'`]+/gi;
        var last = 0;
        var m;
        while ((m = re.exec(text)) !== null) {
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
            re.lastIndex = end;
        }
        if (last < text.length) { frag.appendChild(document.createTextNode(text.slice(last))); }
        return frag;
    }

    // En el editor las menciones se ven como @[Titulo (2019)] y se guardan como @[Titulo (2019)](id).
    function toStored(text, labelToId) {
        return String(text || '').replace(/@\[([^\]\n]{1,200})\](?!\()/g, function (all, label) {
            return has(labelToId, label) ? '@[' + label + '](' + labelToId[label] + ')' : all;
        });
    }

    function toDisplay(text, registerFn) {
        return String(text || '').replace(/@\[([^\]\n]{1,200})\]\(([0-9a-fA-F-]{32,36})\)/g, function (all, label, id) {
            registerFn(label, id);
            return '@[' + label + ']';
        });
    }

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

    function postDate(p) { return p.PublishedUtc || p.UpdatedUtc || p.CreatedUtc; }

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
    var activeEditor = null;

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
        var s = document.getElementById('blogStyle');
        if (!s) {
            s = document.createElement('style');
            s.id = 'blogStyle';
            document.head.appendChild(s);
        }
        if (s.textContent !== STYLE) { s.textContent = STYLE; }
    }

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
        var img = el('img', { class: 'blogCover', alt: '' });
        loadImageInto(img, post.Id);
        return img;
    }

    function uploadImage(postId, blob) {
        var fd = new FormData();
        fd.append('file', blob, 'portada.jpg');
        return fetch(imageUrl(postId), { method: 'POST', headers: authHeaders(), body: fd }).then(function (r) {
            if (!r.ok) { throw new Error('HTTP ' + r.status); }
        });
    }

    // Reduce la portada antes de subirla: asi la base del servidor no se llena de fotos de 8 MB.
    function shrinkImage(file) {
        return new Promise(function (resolve) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () {
                URL.revokeObjectURL(url);
                var w = img.naturalWidth;
                var h = img.naturalHeight;
                var scale = Math.min(1, COVER_MAX_SIDE / Math.max(w, h));
                if (scale === 1 && file.size <= 700 * 1024 && file.type === 'image/jpeg') { resolve(file); return; }
                try {
                    var c = document.createElement('canvas');
                    c.width = Math.max(1, Math.round(w * scale));
                    c.height = Math.max(1, Math.round(h * scale));
                    var ctx = c.getContext('2d');
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, c.width, c.height);
                    ctx.drawImage(img, 0, 0, c.width, c.height);
                    c.toBlob(function (b) { resolve(b && b.size < file.size ? b : file); }, 'image/jpeg', 0.86);
                } catch (e) { resolve(file); }
            };
            img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
            img.src = url;
        });
    }

    function posterEl(m) {
        return m.HasPrimaryImage !== false && m.ItemId
            ? el('img', { class: 'blogPoster', loading: 'lazy', alt: m.Name, src: serverAddress() + '/Items/' + encodeURIComponent(m.ItemId) + '/Images/Primary?fillHeight=270&quality=90' })
            : el('span', { class: 'blogPosterBox', text: m.Name });
    }

    // "Peliculas de esta entrada": las caratulas al final, en el orden que eligio quien escribe.
    function shelf(mentions, small) {
        if (!mentions || !mentions.length) { return null; }
        var row = el('div', { class: 'blogShelfRow' });
        mentions.forEach(function (m) {
            var label = m.Name + (m.ProductionYear ? ' (' + m.ProductionYear + ')' : '');
            row.appendChild(el('div', { class: 'blogMention' }, [
                el('a', { class: 'blogPosterLink', href: '#/details?id=' + encodeURIComponent(normId(m.ItemId)), title: label }, posterEl(m)),
                el('span', { class: 'blogMentionName', text: m.Name }),
                m.ProductionYear ? el('span', { class: 'blogMentionYear', text: String(m.ProductionYear) }) : null,
                small ? null : el('a', { class: 'blogMentionMore', href: blogUrl({ item: m.ItemId }), text: 'Más entradas', title: 'Más entradas sobre este título' })
            ]));
        });
        return el('section', { class: 'blogShelf' + (small ? ' blogShelfSmall' : ''), 'aria-label': 'Títulos de esta entrada' }, [
            small ? null : el('h3', { class: 'blogShelfTitle', text: mentions.length === 1 ? 'Título de esta entrada' : 'Títulos de esta entrada' }),
            row
        ]);
    }

    function spoilerWrap(bodyEl) {
        var wrap = el('div', { class: 'blogSpoiler' });
        var btn = el('button', { type: 'button', class: 'blogBtn', text: 'Contiene spoilers — mostrar el texto' });
        btn.addEventListener('click', function () {
            if (btn.parentNode === wrap) { wrap.replaceChild(bodyEl, btn); }
        });
        wrap.appendChild(btn);
        return wrap;
    }

    function visibilityBadge(post) {
        if (!post.Visibility || post.Visibility === 'public') { return null; }
        if (post.Visibility === 'draft') {
            return el('span', { class: 'blogBadge', title: 'Solo la ves tú' }, [pencilIcon(), 'Borrador']);
        }
        return el('span', { class: 'blogBadge', title: 'Solo la ven su autor y el administrador' }, [lockIcon(), 'Privada']);
    }

    function postFooter(post, full) {
        var isPublic = !post.Visibility || post.Visibility === 'public';
        var d = parseUtc(postDate(post));
        var parts = [isPublic ? 'Publicado por ' : 'Escrito por ', el('a', { href: blogUrl({ author: post.Author.UserId }), text: post.Author.Name })];
        if (d) { parts.push(' · ' + (full ? dateTimeText(postDate(post)) : timeText(d))); }
        if (isPublic) {
            parts.push(' · ');
            var n = post.CommentCount || 0;
            var ctext = n === 0 ? 'Sin comentarios' : plural(n, 'comentario', 'comentarios');
            parts.push(full ? document.createTextNode(ctext) : el('a', { href: blogUrl({ post: post.Id }), text: ctext }));
            if (post.UpdatedUtc) { parts.push(' · (editado)'); }
        }
        if (full && post.Body) {
            var mins = Math.max(1, Math.round(countWords(post.Body) / 200));
            parts.push(' · ' + mins + ' min de lectura');
        }
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
        var isDraft = post.Visibility === 'draft';
        var titleText = post.Title || 'Sin título';
        var href = isDraft ? blogUrl({ edit: post.Id }) : blogUrl({ post: post.Id });
        var article = el('article', { class: 'blogPost' + (full ? ' blogPostFull' : ''), 'data-blog-post': post.Id, 'data-visibility': post.Visibility || 'public' });
        var badge = visibilityBadge(post);
        if (badge) { article.appendChild(el('div', { class: 'blogPostHead' }, badge)); }
        article.appendChild(full
            ? el('h2', { class: 'blogPostTitle', text: titleText })
            : el('h2', { class: 'blogPostTitle' }, el('a', { href: href, text: titleText })));
        appendChildren(article, postImageEl(post));
        var bodyEl = renderBody(full ? post.Body : post.Excerpt);
        article.appendChild(post.HasSpoilers ? spoilerWrap(bodyEl) : bodyEl);
        if (!full && post.IsTruncated) {
            article.appendChild(el('p', { class: 'blogReadMore' }, el('a', { href: href, text: 'Leer más »' })));
        }
        if (isDraft && !full) {
            article.appendChild(el('p', { class: 'blogReadMore' }, el('a', { class: 'blogBtn', href: href, text: 'Seguir escribiendo' })));
        }
        appendChildren(article, shelf(post.Mentions, !full));
        article.appendChild(postFooter(post, full));
        return article;
    }

    // ---------------------------------------------------------------- tabs

    var tabsNav = null;

    function tabLink(label, params, current, count) {
        var a = el('a', { class: 'blogTab', href: blogUrl(params) }, [label, count ? el('span', { class: 'blogTabCount', text: String(count) }) : null]);
        if (current) { a.setAttribute('aria-current', 'page'); }
        return a;
    }

    function renderTabs(nav, route, side) {
        clear(nav);
        var view = route.params.view || '';
        var onList = !has(route.params, 'new') && !route.params.edit && !route.params.post;
        var data = side || { OwnDrafts: 0, OwnPrivate: 0, HiddenPrivate: null };
        nav.appendChild(tabLink('Entradas', {}, onList && !view, 0));
        nav.appendChild(tabLink('Mis borradores', { view: 'drafts' }, onList && view === 'drafts', data.OwnDrafts));
        nav.appendChild(tabLink('Mis privadas', { view: 'private' }, onList && view === 'private', data.OwnPrivate));
        if (data.HiddenPrivate !== null && data.HiddenPrivate !== undefined) {
            nav.appendChild(tabLink('Privadas de todos', { view: 'hidden' }, onList && view === 'hidden', data.HiddenPrivate));
        }
    }

    // ---------------------------------------------------------------- list view

    var FILTER_KEYS = ['label', 'archive', 'author', 'item', 'q', 'view'];

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

    var EMPTY_TEXT = {
        '': 'Todavía no hay entradas. Cuando alguien publique la primera, aparecerá aquí.',
        drafts: 'No tienes borradores. Lo que empieces a escribir se guarda solo, y lo encontrarás aquí.',
        'private': 'No tienes entradas privadas. Una entrada privada solo la ves tú (y el administrador del servidor) hasta que decidas publicarla para todos.',
        hidden: 'No hay entradas privadas.'
    };

    function viewList(main, route, tk) {
        showMessage(main, 'Cargando…', false);
        var params = route.params;
        var view = params.view || '';
        var qs = [];
        ['page', 'label', 'archive', 'author', 'item', 'q', 'view'].forEach(function (k) {
            if (params[k]) { qs.push(k + '=' + encodeURIComponent(params[k])); }
        });
        request('GET', '/Blog/Posts' + (qs.length ? '?' + qs.join('&') : '')).then(function (data) {
            if (tk !== paintToken) { return; }
            clear(main);
            var posts = data.Posts || [];
            appendChildren(main, filterNotice(params, posts));
            if (view === 'hidden') {
                main.appendChild(el('p', { class: 'blogNotice', text: 'Vista de administración: entradas privadas de todos los usuarios.' }));
            }
            if (!posts.length) {
                main.appendChild(el('p', { class: 'blogMuted', text: has(EMPTY_TEXT, view) && !params.label && !params.q && !params.author && !params.item && !params.archive ? EMPTY_TEXT[view] : 'No hay entradas.' }));
                if (!view && !params.label && !params.q) {
                    main.appendChild(el('p', {}, el('a', { class: 'blogBtn blogBtnPrimary', href: '#/blog?new', text: 'Escribir la primera' })));
                }
            }
            var lastDay = null;
            posts.forEach(function (p) {
                var d = parseUtc(postDate(p));
                if (!view && d && dayKey(d) !== lastDay) {
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

    function visibilityBanner(post) {
        if (!post.Visibility || post.Visibility === 'public') { return null; }
        var mine = normId(post.Author.UserId) === normId(currentUserId());
        if (post.Visibility === 'draft') {
            return el('div', { class: 'blogBanner' }, [el('strong', { text: 'Borrador.' }), 'Solo lo ves tú. Los comentarios se activan al publicarla.']);
        }
        return el('div', { class: 'blogBanner' }, [
            el('strong', { text: 'Entrada privada.' }),
            mine ? 'La ves tú, y el administrador del servidor. Puedes publicarla para todos cuando quieras.' : 'La estás viendo como administrador. Su autor decide si algún día la publica.'
        ]);
    }

    function viewPost(main, id, tk) {
        showMessage(main, 'Cargando…', false);
        request('GET', '/Blog/Posts/' + encodeURIComponent(id)).then(function (post) {
            if (tk !== paintToken) { return; }
            clear(main);
            function reload() { paintedKey = null; paint(false); }
            var isPublic = !post.Visibility || post.Visibility === 'public';
            appendChildren(main, visibilityBanner(post));

            if (post.CanEdit || post.CanDelete) {
                var actions = el('div', { class: 'blogPostActions' });
                var errorBox = el('div', { class: 'blogError', role: 'alert' });
                if (post.CanEdit) {
                    actions.appendChild(el('a', { class: 'blogBtn' + (isPublic ? '' : ' blogBtnPrimary'), href: blogUrl({ edit: post.Id }), text: isPublic ? 'Editar' : 'Editar y publicar' }));
                }
                if (post.CanDelete) {
                    actions.appendChild(confirmButton('Eliminar', 'Sí, eliminar entrada', function (reset) {
                        request('DELETE', '/Blog/Posts/' + encodeURIComponent(post.Id)).then(function () {
                            invalidateSidebar();
                            window.location.hash = isPublic ? '#/blog' : blogUrl({ view: post.Visibility === 'draft' ? 'drafts' : 'private' });
                        }, function (err) {
                            reset();
                            errorBox.textContent = errorMessage(err, 'No se pudo eliminar la entrada.');
                        });
                    }));
                }
                main.appendChild(actions);
                main.appendChild(errorBox);
            }

            main.appendChild(postArticle(post, true));
            if (isPublic) {
                main.appendChild(commentsSection(post, function () { invalidateSidebar(); reload(); }));
                main.appendChild(postNav(post));
            }
        }, function (err) {
            if (tk !== paintToken) { return; }
            if (err && err.status === 404) {
                showMessage(main, 'No se encuentra la entrada. Puede que se haya eliminado, o que no tengas acceso a ella.', true);
                main.appendChild(el('p', {}, el('a', { href: '#/blog', text: 'Página principal' })));
            } else {
                viewError(main, err);
            }
        });
    }

    // ---------------------------------------------------------------- editor

    function mentionLabel(it) {
        return String(it.Name || '').replace(/[\[\]]/g, '') + (it.ProductionYear ? ' (' + it.ProductionYear + ')' : '');
    }

    function searchTitles(term) {
        var uid = currentUserId();
        var url = '/Items?searchTerm=' + encodeURIComponent(term) + '&IncludeItemTypes=Movie,Series&Recursive=true&Limit=8&Fields=ProductionYear&EnableImages=true' + (uid ? '&userId=' + encodeURIComponent(uid) : '');
        return request('GET', url).then(function (res) { return (res && res.Items) || []; });
    }

    function hitButton(it, onPick) {
        var thumb = it.ImageTags && it.ImageTags.Primary
            ? el('img', { alt: '', loading: 'lazy', src: serverAddress() + '/Items/' + encodeURIComponent(it.Id) + '/Images/Primary?fillHeight=90&quality=80' })
            : el('span', { class: 'blogHitNoImg' });
        var b = el('button', { type: 'button', class: 'blogHit', role: 'option', 'data-item-id': it.Id }, [
            thumb,
            el('span', {}, [
                it.Name,
                el('span', { class: 'blogHitMeta', text: ' ' + (it.ProductionYear ? '(' + it.ProductionYear + ') ' : '') + (it.Type === 'Series' ? '· serie' : '') })
            ])
        ]);
        b.addEventListener('mousedown', function (e) { e.preventDefault(); });
        b.addEventListener('click', function () { onPick(it); });
        return b;
    }

    // Posicion de un caracter dentro de un textarea (para colocar el desplegable junto al cursor).
    function caretXY(ta, pos) {
        var d = document.createElement('div');
        var cs = window.getComputedStyle(ta);
        ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth', 'borderRightWidth', 'borderBottomWidth', 'boxSizing', 'textIndent'].forEach(function (p) {
            d.style[p] = cs[p];
        });
        d.style.width = ta.clientWidth + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth) + 'px';
        d.style.position = 'absolute';
        d.style.visibility = 'hidden';
        d.style.whiteSpace = 'pre-wrap';
        d.style.wordWrap = 'break-word';
        d.style.top = '0';
        d.style.left = '-9999px';
        d.textContent = ta.value.substring(0, pos);
        var marker = document.createElement('span');
        marker.textContent = '.';
        d.appendChild(marker);
        document.body.appendChild(d);
        var out = { x: marker.offsetLeft, y: marker.offsetTop, h: marker.offsetHeight || 24 };
        document.body.removeChild(d);
        return out;
    }

    function splitLabels(text) {
        return String(text || '').split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
    }

    function buildEditor(main, post) {
        clear(main);
        var existingVis = post ? (post.Visibility || 'public') : 'draft';
        var st = {
            id: post ? post.Id : null,
            vis: existingVis,
            dirty: false,
            saving: false,
            timer: null,
            chain: Promise.resolve(),
            hasImage: !!(post && post.HasImage),
            pendingImage: null,
            removeImage: false,
            savedAt: null,
            destroyed: false
        };
        var mentions = ((post && post.Mentions) || []).map(function (m) {
            return { ItemId: m.ItemId, Name: m.Name, ProductionYear: m.ProductionYear, HasPrimaryImage: m.HasPrimaryImage };
        });
        var labels = ((post && post.Labels) || []).slice();
        var labelToId = {};
        mentions.forEach(function (m) { labelToId[mentionLabel(m)] = m.ItemId; });

        var statusEl = el('span', { class: 'blogSaveState', role: 'status', 'aria-live': 'polite' });
        var errorBox = el('div', { class: 'blogError', role: 'alert' });

        // ---- titulo
        var titleInput = el('input', { class: 'blogTitleInput', type: 'text', id: 'blogTitleInput', maxlength: 150, placeholder: 'Título de la entrada', 'aria-label': 'Título', value: post ? post.Title : '' });

        // ---- portada
        var coverSlot = el('div');
        var fileInput = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true, 'aria-label': 'Elegir imagen de portada' });
        function setCoverFile(file) {
            if (!file) { return; }
            shrinkImage(file).then(function (blob) {
                if (blob.size > 5 * 1024 * 1024) { errorBox.textContent = 'La imagen sigue pesando más de 5 MB. Prueba con otra.'; return; }
                errorBox.textContent = '';
                st.pendingImage = blob;
                st.removeImage = false;
                renderCover();
                touch();
            });
        }
        function renderCover() {
            clear(coverSlot);
            var showing = st.pendingImage || (st.hasImage && !st.removeImage);
            if (showing) {
                var img = el('img', { class: 'blogCover', alt: 'Portada de la entrada' });
                if (st.pendingImage) { img.src = URL.createObjectURL(st.pendingImage); } else { loadImageInto(img, st.id); }
                coverSlot.appendChild(el('div', { class: 'blogCoverBox' }, [
                    img,
                    el('button', { type: 'button', class: 'blogBtn', text: 'Quitar imagen', onclick: function () {
                        st.pendingImage = null;
                        if (st.hasImage) { st.removeImage = true; }
                        renderCover();
                        touch();
                    } })
                ]));
            } else {
                var drop = el('div', { class: 'blogCoverDrop', role: 'button', tabindex: '0', 'aria-label': 'Añadir imagen de portada' }, [
                    el('strong', { text: 'Añadir una imagen de portada' }),
                    el('span', { class: 'blogMuted', text: 'Opcional, solo una. Se reduce sola antes de subirla.' })
                ]);
                drop.addEventListener('click', function () { fileInput.click(); });
                drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
                drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('isOver'); });
                drop.addEventListener('dragleave', function () { drop.classList.remove('isOver'); });
                drop.addEventListener('drop', function (e) {
                    e.preventDefault();
                    drop.classList.remove('isOver');
                    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                    if (f && /^image\/(jpeg|png|webp)$/.test(f.type)) { setCoverFile(f); }
                });
                coverSlot.appendChild(drop);
            }
        }
        fileInput.addEventListener('change', function () {
            var f = fileInput.files && fileInput.files[0];
            fileInput.value = '';
            setCoverFile(f);
        });

        // ---- texto
        var bodyInput = el('textarea', { class: 'blogBody', id: 'blogBodyInput', maxlength: 20000, placeholder: 'Escribe aquí. Con @ mencionas una película o serie.', 'aria-label': 'Texto de la entrada' });
        bodyInput.value = toDisplay(post ? post.Body : '', function (label, id) { labelToId[label] = id; });
        var previewBox = el('div', { class: 'blogPreview blogPostFull', hidden: true });
        var suggest = el('div', { class: 'blogSuggest', role: 'listbox', 'aria-label': 'Películas y series' });
        var metaEl = el('span');
        var previewing = false;

        function autosize() {
            bodyInput.style.height = 'auto';
            bodyInput.style.height = Math.max(bodyInput.scrollHeight + 4, 22 * 16) + 'px';
        }

        function insertText(text, selectFrom, selectTo) {
            bodyInput.focus();
            var start = bodyInput.selectionStart;
            var done = false;
            try { done = document.execCommand('insertText', false, text); } catch (e) { done = false; }
            if (!done) {
                bodyInput.setRangeText(text, bodyInput.selectionStart, bodyInput.selectionEnd, 'end');
                bodyInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (selectFrom !== undefined) { bodyInput.setSelectionRange(start + selectFrom, start + selectTo); }
        }

        function wrapSel(before, after, placeholder) {
            var s = bodyInput.selectionStart;
            var e = bodyInput.selectionEnd;
            var sel = bodyInput.value.slice(s, e) || placeholder;
            insertText(before + sel + after, before.length, before.length + sel.length);
        }

        function prefixLines(prefixFn) {
            var v = bodyInput.value;
            var s = bodyInput.selectionStart;
            var e = bodyInput.selectionEnd;
            var from = v.lastIndexOf('\n', s - 1) + 1;
            var to = v.indexOf('\n', e);
            if (to < 0) { to = v.length; }
            var block = v.slice(from, to);
            var out = block.split('\n').map(function (ln, i) { return prefixFn(ln, i); }).join('\n');
            bodyInput.setSelectionRange(from, to);
            insertText(out, 0, out.length);
        }

        function addLink() {
            var s = bodyInput.selectionStart;
            var e = bodyInput.selectionEnd;
            var sel = bodyInput.value.slice(s, e) || 'texto del enlace';
            insertText('[' + sel + '](https://)', sel.length + 3, sel.length + 11);
        }

        function startMention() {
            bodyInput.focus();
            var s = bodyInput.selectionStart;
            var prev = s > 0 ? bodyInput.value.charAt(s - 1) : ' ';
            insertText((/\s/.test(prev) ? '' : ' ') + '@');
        }

        function tb(label, title, fn, extra) {
            var b = el('button', { type: 'button', class: 'blogBtn', text: label, title: title, 'aria-label': title, onclick: function () { if (!previewing) { fn(); } } });
            if (extra) { Object.keys(extra).forEach(function (k) { b.setAttribute(k, extra[k]); }); }
            b.addEventListener('mousedown', function (e) { e.preventDefault(); });
            return b;
        }
        var previewBtn = el('button', { type: 'button', class: 'blogBtn', text: 'Vista previa', 'aria-pressed': 'false', onclick: function () { setPreview(!previewing); } });
        var toolbar = el('div', { class: 'blogToolbar', role: 'toolbar', 'aria-label': 'Formato' }, [
            tb('Negrita', 'Negrita (Ctrl+B)', function () { wrapSel('**', '**', 'texto'); }),
            tb('Cursiva', 'Cursiva (Ctrl+I)', function () { wrapSel('*', '*', 'texto'); }),
            tb('Título', 'Subtítulo', function () { prefixLines(function (l) { return /^##\s/.test(l) ? l.replace(/^##\s/, '') : '## ' + l; }); }),
            tb('Cita', 'Cita', function () { prefixLines(function (l) { return /^>\s?/.test(l) ? l.replace(/^>\s?/, '') : '> ' + l; }); }),
            tb('Lista', 'Lista', function () { prefixLines(function (l) { return /^-\s/.test(l) ? l.replace(/^-\s/, '') : '- ' + l; }); }),
            tb('Enlace', 'Enlace (Ctrl+K)', addLink),
            tb('@ Película', 'Mencionar una película o serie', startMention),
            el('span', { class: 'blogToolbarSpacer' }),
            previewBtn
        ]);

        function setPreview(on) {
            previewing = on;
            previewBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
            previewBtn.textContent = on ? 'Seguir escribiendo' : 'Vista previa';
            bodyInput.hidden = on;
            previewBox.hidden = !on;
            closeSuggest();
            if (on) {
                clear(previewBox);
                var body = renderBody(toStored(bodyInput.value, labelToId));
                previewBox.appendChild(el('h2', { class: 'blogPostTitle', text: titleInput.value.trim() || 'Sin título' }));
                previewBox.appendChild(body);
                appendChildren(previewBox, shelf(mentions.map(function (m) { return { ItemId: m.ItemId, Name: m.Name, ProductionYear: m.ProductionYear, HasPrimaryImage: m.HasPrimaryImage }; }), false));
            } else {
                bodyInput.focus();
            }
        }

        // ---- menciones en el texto (@)
        var sugState = { open: false, items: [], index: 0, ctx: null, seq: 0, timer: null, dismissedAt: -1 };

        function closeSuggest() {
            sugState.open = false;
            sugState.items = [];
            clear(suggest);
        }

        function mentionContext() {
            var pos = bodyInput.selectionStart;
            if (bodyInput.selectionEnd !== pos) { return null; }
            var m = /(^|[\s(])@([^@\[\]\n]{0,40})$/.exec(bodyInput.value.slice(0, pos));
            if (!m) { return null; }
            return { start: pos - m[2].length - 1, query: m[2], pos: pos };
        }

        function placeSuggest(ctx) {
            var xy = caretXY(bodyInput, ctx.start);
            var wrapW = bodyInput.clientWidth;
            var left = Math.max(0, Math.min(xy.x, wrapW - Math.min(360, wrapW)));
            suggest.style.left = left + 'px';
            suggest.style.top = (bodyInput.offsetTop + xy.y - bodyInput.scrollTop + xy.h + 6) + 'px';
        }

        function renderSuggest() {
            clear(suggest);
            if (!sugState.open) { return; }
            if (!sugState.items.length) {
                suggest.appendChild(el('div', { class: 'blogSuggestHint', text: sugState.ctx && sugState.ctx.query ? 'Sin resultados.' : 'Escribe el título de una película o serie…' }));
                return;
            }
            sugState.items.forEach(function (it, i) {
                var b = hitButton(it, pickSuggestion);
                b.setAttribute('aria-selected', i === sugState.index ? 'true' : 'false');
                suggest.appendChild(b);
            });
        }

        function refreshSuggest() {
            var ctx = previewing ? null : mentionContext();
            if (!ctx || ctx.start === sugState.dismissedAt) { closeSuggest(); return; }
            sugState.ctx = ctx;
            sugState.open = true;
            placeSuggest(ctx);
            if (sugState.timer) { clearTimeout(sugState.timer); }
            if (!ctx.query.trim()) { sugState.items = []; renderSuggest(); return; }
            var seq = ++sugState.seq;
            sugState.timer = setTimeout(function () {
                searchTitles(ctx.query.trim()).then(function (items) {
                    if (seq !== sugState.seq || !sugState.open) { return; }
                    sugState.items = items;
                    sugState.index = 0;
                    renderSuggest();
                }, function () { if (seq === sugState.seq) { sugState.items = []; renderSuggest(); } });
            }, 220);
        }

        function addMention(it) {
            var id = it.Id || it.ItemId;
            if (mentions.some(function (m) { return normId(m.ItemId) === normId(id); })) { return false; }
            if (mentions.length >= MAX_MENTIONS) {
                shelfHint.textContent = 'Máximo ' + MAX_MENTIONS + ' títulos en la entrada.';
                return false;
            }
            shelfHint.textContent = '';
            mentions.push({ ItemId: id, Name: it.Name, ProductionYear: it.ProductionYear, HasPrimaryImage: !!(it.ImageTags && it.ImageTags.Primary) || it.HasPrimaryImage === true });
            renderShelfEdit();
            return true;
        }

        function pickSuggestion(it) {
            var ctx = sugState.ctx;
            if (!ctx) { return; }
            var label = mentionLabel(it);
            labelToId[label] = it.Id;
            bodyInput.focus();
            bodyInput.setSelectionRange(ctx.start, ctx.pos);
            insertText('@[' + label + '] ');
            addMention(it);
            closeSuggest();
            touch();
        }

        bodyInput.addEventListener('input', function () {
            autosize();
            sugState.dismissedAt = -1;
            refreshSuggest();
            updateMeta();
            touch();
        });
        bodyInput.addEventListener('click', refreshSuggest);
        bodyInput.addEventListener('blur', function () { setTimeout(closeSuggest, 150); });
        bodyInput.addEventListener('keydown', function (e) {
            if (sugState.open && sugState.items.length) {
                if (e.key === 'ArrowDown') { e.preventDefault(); sugState.index = (sugState.index + 1) % sugState.items.length; renderSuggest(); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); sugState.index = (sugState.index + sugState.items.length - 1) % sugState.items.length; renderSuggest(); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickSuggestion(sugState.items[sugState.index]); return; }
            }
            if (sugState.open && e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                sugState.dismissedAt = sugState.ctx ? sugState.ctx.start : -1;
                closeSuggest();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                var k = e.key.toLowerCase();
                if (k === 'b') { e.preventDefault(); wrapSel('**', '**', 'texto'); }
                else if (k === 'i') { e.preventDefault(); wrapSel('*', '*', 'texto'); }
                else if (k === 'k') { e.preventDefault(); addLink(); }
            }
        });
        bodyInput.addEventListener('keyup', function (e) {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') { refreshSuggest(); }
        });

        function updateMeta() {
            var w = countWords(bodyInput.value);
            metaEl.textContent = w + (w === 1 ? ' palabra' : ' palabras') + ' · ' + bodyInput.value.length + ' / 20.000';
        }

        // ---- estanteria (orden de las caratulas)
        var shelfEdit = el('div', { class: 'blogShelfEdit', role: 'list', 'aria-label': 'Títulos de la entrada, en el orden en que se mostrarán' });
        var shelfHint = el('div', { class: 'blogHint' });
        var shelfSearch = el('input', { class: 'blogInput', type: 'search', id: 'blogMentionSearch', autocomplete: 'off', placeholder: 'Añadir película o serie…', 'aria-label': 'Añadir película o serie' });
        var shelfHits = el('div', { class: 'blogSuggest', role: 'listbox', style: 'position:relative;margin-top:.3em;width:100%;' });
        var dragFrom = -1;

        function moveMention(from, to) {
            if (to < 0 || to >= mentions.length || from === to) { return; }
            var it = mentions.splice(from, 1)[0];
            mentions.splice(to, 0, it);
            renderShelfEdit();
            touch();
        }

        function renderShelfEdit() {
            clear(shelfEdit);
            mentions.forEach(function (m, i) {
                var card = el('div', { class: 'blogShelfCard', role: 'listitem', draggable: 'true', 'data-item-id': m.ItemId }, [
                    posterEl(m),
                    el('span', { class: 'blogShelfNum', text: String(i + 1) }),
                    el('span', { class: 'blogMentionName', text: m.Name }),
                    m.ProductionYear ? el('span', { class: 'blogMentionYear', text: String(m.ProductionYear) }) : null,
                    el('div', { class: 'blogShelfCtl' }, [
                        el('button', { type: 'button', class: 'blogBtn', text: '‹', title: 'Mover antes', 'aria-label': 'Mover ' + m.Name + ' antes', disabled: i === 0, onclick: function () { moveMention(i, i - 1); } }),
                        el('button', { type: 'button', class: 'blogBtn', text: '›', title: 'Mover después', 'aria-label': 'Mover ' + m.Name + ' después', disabled: i === mentions.length - 1, onclick: function () { moveMention(i, i + 1); } }),
                        el('button', { type: 'button', class: 'blogBtn blogBtnDanger', text: '✕', title: 'Quitar', 'aria-label': 'Quitar ' + m.Name, onclick: function () {
                            mentions.splice(i, 1);
                            shelfHint.textContent = '';
                            renderShelfEdit();
                            touch();
                        } })
                    ])
                ]);
                card.addEventListener('dragstart', function (e) {
                    dragFrom = i;
                    card.classList.add('isDragging');
                    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); } catch (x) { /* noop */ }
                });
                card.addEventListener('dragend', function () { dragFrom = -1; card.classList.remove('isDragging'); });
                card.addEventListener('dragover', function (e) { if (dragFrom >= 0) { e.preventDefault(); card.classList.add('isTarget'); } });
                card.addEventListener('dragleave', function () { card.classList.remove('isTarget'); });
                card.addEventListener('drop', function (e) {
                    e.preventDefault();
                    card.classList.remove('isTarget');
                    if (dragFrom >= 0) { moveMention(dragFrom, i); }
                    dragFrom = -1;
                });
                shelfEdit.appendChild(card);
            });
        }

        var shelfSeq = 0;
        var shelfTimer = null;
        function runShelfSearch() {
            var term = shelfSearch.value.trim();
            var seq = ++shelfSeq;
            if (!term) { clear(shelfHits); return; }
            searchTitles(term).then(function (items) {
                if (seq !== shelfSeq) { return; }
                clear(shelfHits);
                if (!items.length) { shelfHits.appendChild(el('div', { class: 'blogSuggestHint', text: 'Sin resultados.' })); return; }
                items.forEach(function (it) {
                    shelfHits.appendChild(hitButton(it, function (pick) {
                        addMention(pick);
                        shelfSearch.value = '';
                        clear(shelfHits);
                        shelfSearch.focus();
                        touch();
                    }));
                });
            }, function () { if (seq === shelfSeq) { clear(shelfHits); } });
        }
        shelfSearch.addEventListener('input', function () {
            if (shelfTimer) { clearTimeout(shelfTimer); }
            shelfTimer = setTimeout(runShelfSearch, 250);
        });
        shelfSearch.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runShelfSearch(); } });

        // ---- etiquetas
        var chips = el('div', { class: 'blogChips' });
        var labelInput = el('input', { class: 'blogInput', type: 'text', id: 'blogLabelsInput', list: 'blogLabelList', maxlength: 30, placeholder: 'Escribe una etiqueta y pulsa Intro', 'aria-label': 'Etiquetas' });
        var labelList = el('datalist', { id: 'blogLabelList' });
        function renderChips() {
            clear(chips);
            labels.forEach(function (l, i) {
                chips.appendChild(el('span', { class: 'blogChip' }, [
                    l,
                    el('button', { type: 'button', class: 'blogChipRemove', 'aria-label': 'Quitar la etiqueta ' + l, title: 'Quitar', text: '✕', onclick: function () { labels.splice(i, 1); renderChips(); touch(); } })
                ]));
            });
        }
        function addLabelFromInput() {
            splitLabels(labelInput.value).forEach(function (l) {
                l = l.toLowerCase();
                if (labels.length < 5 && labels.indexOf(l) < 0) { labels.push(l); }
            });
            labelInput.value = '';
            renderChips();
            touch();
        }
        labelInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLabelFromInput(); }
            else if (e.key === 'Backspace' && !labelInput.value && labels.length) { labels.pop(); renderChips(); touch(); }
        });
        labelInput.addEventListener('blur', function () { if (labelInput.value.trim()) { addLabelFromInput(); } });
        if (sidebarCache) {
            (sidebarCache.data.Labels || []).forEach(function (l) { labelList.appendChild(el('option', { value: l.Name })); });
        }

        var spoilersInput = el('input', { type: 'checkbox', id: 'blogSpoilersInput', checked: post ? post.HasSpoilers : false });
        spoilersInput.addEventListener('change', touch);
        titleInput.addEventListener('input', touch);

        // ---- guardado
        function stateText() {
            if (st.saving) { return ['saving', 'Guardando…']; }
            if (st.error) { return ['error', 'No se pudo guardar. Se reintentará al seguir escribiendo.']; }
            if (st.dirty) { return ['dirty', st.vis === 'draft' ? 'Cambios sin guardar…' : 'Cambios sin guardar']; }
            if (st.savedAt) { return ['ok', (st.vis === 'draft' ? 'Borrador guardado a las ' : 'Guardado a las ') + timeText(st.savedAt)]; }
            return ['idle', st.vis === 'draft' ? 'Borrador' : (st.vis === 'private' ? 'Entrada privada' : 'Entrada publicada')];
        }
        function paintStatus() {
            var s = stateText();
            statusEl.setAttribute('data-s', s[0]);
            statusEl.textContent = s[1];
        }

        function hasContent() { return titleInput.value.trim().length > 0 || bodyInput.value.trim().length > 0; }

        function touch() {
            st.dirty = true;
            st.error = false;
            paintStatus();
            // Solo los borradores se guardan solos; lo publicado se guarda con el boton.
            if (st.vis === 'draft' && hasContent()) {
                if (st.timer) { clearTimeout(st.timer); }
                st.timer = setTimeout(function () { saveAs('draft', true); }, AUTOSAVE_MS);
            }
        }

        function payload(vis) {
            return {
                Title: titleInput.value,
                Body: toStored(bodyInput.value, labelToId),
                Labels: labels.slice(),
                MentionItemIds: mentions.map(function (m) { return m.ItemId; }),
                HasSpoilers: !!spoilersInput.checked,
                Visibility: vis
            };
        }

        function imageStep() {
            if (st.pendingImage) {
                var blob = st.pendingImage;
                return uploadImage(st.id, blob).then(function () {
                    if (st.pendingImage === blob) { st.pendingImage = null; st.hasImage = true; }
                });
            }
            if (st.removeImage && st.hasImage) {
                return request('DELETE', '/Blog/Posts/' + encodeURIComponent(st.id) + '/Image').then(function () { st.hasImage = false; st.removeImage = false; });
            }
            return Promise.resolve();
        }

        // Todas las escrituras van en cola: nunca hay dos peticiones de guardado a la vez.
        function saveAs(vis, silent) {
            if (st.timer) { clearTimeout(st.timer); st.timer = null; }
            var run = function () {
                if (st.destroyed) { return Promise.resolve(null); }
                st.saving = true;
                paintStatus();
                var dirtyAtStart = false;
                var snapshot = JSON.stringify(payload(vis)) + '|' + (st.pendingImage ? 'i' : '') + (st.removeImage ? 'r' : '');
                var req = st.id
                    ? request('PUT', '/Blog/Posts/' + encodeURIComponent(st.id), payload(vis))
                    : request('POST', '/Blog/Posts', payload(vis));
                return req.then(function (saved) {
                    var firstSave = !st.id;
                    st.id = saved.Id;
                    st.vis = saved.Visibility || vis;
                    return imageStep().then(function () { return null; }, function () { return 'image'; }).then(function (imgErr) {
                        st.saving = false;
                        st.savedAt = new Date();
                        var now = JSON.stringify(payload(st.vis)) + '|' + (st.pendingImage ? 'i' : '') + (st.removeImage ? 'r' : '');
                        dirtyAtStart = now !== snapshot;
                        st.dirty = dirtyAtStart;
                        if (imgErr) { errorBox.textContent = 'La entrada se guardó, pero la imagen no se pudo subir. Inténtalo de nuevo.'; }
                        else if (!silent) { errorBox.textContent = ''; }
                        invalidateSidebar();
                        if (firstSave && st.vis === 'draft') {
                            // El borrador pasa a tener su propia direccion sin repintar la pagina.
                            var hash = blogUrl({ edit: st.id });
                            try { window.history.replaceState(null, '', window.location.pathname + window.location.search + hash); } catch (e) { /* noop */ }
                            paintedKey = hash + '|' + (isLoggedIn() ? '1' : '0');
                        }
                        paintStatus();
                        if (dirtyAtStart && st.vis === 'draft') { touch(); }
                        return saved;
                    });
                }, function (err) {
                    st.saving = false;
                    st.error = true;
                    errorBox.textContent = errorMessage(err, 'No se pudo guardar la entrada.');
                    paintStatus();
                    throw err;
                });
            };
            st.chain = st.chain.then(run, run);
            return st.chain;
        }

        function finishAndGo(vis) {
            publishError.textContent = '';
            var btns = form.querySelectorAll('button');
            for (var i = 0; i < btns.length; i++) { btns[i].disabled = true; }
            saveAs(vis, false).then(function (saved) {
                st.dirty = false;
                destroy();
                window.location.hash = blogUrl({ post: saved.Id });
            }, function (err) {
                for (var j = 0; j < btns.length; j++) { btns[j].disabled = false; }
                publishError.textContent = errorMessage(err, 'No se pudo guardar la entrada.');
            });
        }

        // ---- botones de publicar
        var publishError = el('div', { class: 'blogError', role: 'alert' });
        var publishPanel = el('div', { class: 'blogPublish', hidden: true, role: 'group', 'aria-label': 'Cómo publicar' });
        var isPublicNow = existingVis === 'public';

        var optPublic = el('div', { class: 'blogPublishOption' }, [
            el('p', {}, [el('strong', { text: 'Para todos. ' }), 'La verán todos los usuarios del servidor y podrán comentarla. Una vez publicada, ya no podrás volver a hacerla privada ni borrador.']),
            el('button', { type: 'button', class: 'blogBtn blogBtnPrimary', text: 'Publicar para todos', onclick: function () { finishAndGo('public'); } })
        ]);
        var optPrivate = el('div', { class: 'blogPublishOption' }, [
            el('p', {}, [el('strong', { text: 'En privado. ' }), 'Solo la verás tú, y el administrador del servidor. Los demás no sabrán que existe. Podrás publicarla para todos más adelante.']),
            el('button', { type: 'button', class: 'blogBtn', text: 'Publicar en privado', onclick: function () { finishAndGo('private'); } })
        ]);
        publishPanel.appendChild(optPublic);
        if (existingVis === 'draft') { publishPanel.appendChild(optPrivate); }
        publishPanel.appendChild(el('div', { class: 'blogFormButtons' }, el('button', { type: 'button', class: 'blogBtn blogBtnQuiet', text: 'Cancelar', onclick: function () { publishPanel.hidden = true; } })));

        var buttons = [];
        if (isPublicNow) {
            buttons.push(el('button', { type: 'button', class: 'blogBtn blogBtnPrimary', text: 'Guardar cambios', onclick: function () { finishAndGo('public'); } }));
        } else if (existingVis === 'private') {
            buttons.push(el('button', { type: 'button', class: 'blogBtn', text: 'Guardar', onclick: function () { finishAndGo('private'); } }));
            buttons.push(el('button', { type: 'button', class: 'blogBtn blogBtnPrimary', text: 'Publicar para todos…', onclick: function () { publishPanel.hidden = !publishPanel.hidden; } }));
        } else {
            buttons.push(el('button', { type: 'button', class: 'blogBtn', text: 'Guardar borrador', onclick: function () {
                if (!hasContent()) { errorBox.textContent = 'Escribe al menos un título o algo de texto.'; return; }
                saveAs('draft', false).then(function () { st.dirty = false; paintStatus(); }, function () { /* ya mostrado */ });
            } }));
            buttons.push(el('button', { type: 'button', class: 'blogBtn blogBtnPrimary', text: 'Publicar…', onclick: function () {
                if (!titleInput.value.trim() || !bodyInput.value.trim()) { errorBox.textContent = 'Para publicar hacen falta un título y un texto.'; return; }
                errorBox.textContent = '';
                publishPanel.hidden = !publishPanel.hidden;
            } }));
        }

        var discard = null;
        if (post && !isPublicNow) {
            discard = confirmButton(existingVis === 'draft' ? 'Descartar borrador' : 'Eliminar entrada', 'Sí, eliminar', function (reset) {
                request('DELETE', '/Blog/Posts/' + encodeURIComponent(st.id)).then(function () {
                    st.dirty = false;
                    invalidateSidebar();
                    destroy();
                    window.location.hash = blogUrl({ view: existingVis === 'draft' ? 'drafts' : 'private' });
                }, function (err) { reset(); errorBox.textContent = errorMessage(err, 'No se pudo eliminar.'); });
            });
        }

        var cancelHref = post ? (isPublicNow || existingVis === 'private' ? blogUrl({ post: post.Id }) : blogUrl({ view: 'drafts' })) : '#/blog';
        var bar = el('div', { class: 'blogEditorBar' }, [
            el('div', { class: 'blogFormButtons' }, [
                el('a', { class: 'blogBtn blogBtnQuiet', href: cancelHref, text: '‹ Salir' }),
                statusEl
            ]),
            el('div', { class: 'blogFormButtons' }, buttons)
        ]);

        var form = el('form', { class: 'blogEditor', novalidate: true }, [
            bar,
            publishPanel,
            publishError,
            titleInput,
            coverSlot,
            fileInput,
            el('div', { class: 'blogWrite' }, [toolbar, bodyInput, previewBox, suggest]),
            el('div', { class: 'blogEditorMeta' }, [metaEl, el('span', { text: 'Con @ mencionas una película o serie' })]),
            el('section', { class: 'blogEditorSection' }, [
                el('h3', { text: 'Carátulas al final de la entrada' }),
                el('p', { class: 'blogHint', text: 'Las películas y series que menciones con @ aparecen aquí. Arrastra las carátulas, o usa las flechas, para elegir el orden. También puedes añadir otras que no cites en el texto.' }),
                shelfEdit,
                el('div', { class: 'blogField' }, [shelfSearch, shelfHits]),
                shelfHint
            ]),
            el('section', { class: 'blogEditorSection' }, [
                el('h3', { text: 'Etiquetas y avisos' }),
                el('div', { class: 'blogField' }, [el('label', { for: 'blogLabelsInput', text: 'Etiquetas (máximo 5)' }), chips, labelInput, labelList]),
                el('div', { class: 'blogField' }, el('label', { class: 'blogCheck', for: 'blogSpoilersInput' }, [spoilersInput, 'Contiene spoilers. El texto se ocultará tras un botón hasta que el lector lo abra.']))
            ]),
            errorBox,
            discard ? el('div', { class: 'blogEditorSection' }, discard) : null
        ]);
        form.addEventListener('submit', function (e) { e.preventDefault(); });

        function destroy() {
            st.destroyed = true;
            if (st.timer) { clearTimeout(st.timer); }
            if (activeEditor === api) { activeEditor = null; }
        }
        var api = { isDirty: function () { return st.dirty && !st.destroyed; }, destroy: destroy };
        if (activeEditor) { activeEditor.destroy(); }
        activeEditor = api;

        main.appendChild(form);
        renderCover();
        renderShelfEdit();
        renderChips();
        paintStatus();
        updateMeta();
        autosize();
        (post ? bodyInput : titleInput).focus();
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

    window.addEventListener('beforeunload', function (e) {
        if (activeEditor && activeEditor.isDirty()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

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

    function renderSidebar(side, route, tk, tabs) {
        renderSidebarData(side, { Archive: [], Labels: [], Authors: [], RecentComments: [] }, route.params);
        getSidebar().then(function (data) {
            if (tk !== paintToken) { return; }
            renderSidebarData(side, data, route.params);
            renderTabs(tabs, route, data);
        }, function () {
            if (tk === paintToken) {
                side.appendChild(el('p', { class: 'blogMuted', text: 'No se pudo cargar la barra lateral.' }));
            }
        });
    }

    // ---------------------------------------------------------------- paint

    function fillHeader(header, info, hideWrite) {
        clear(header);
        header.appendChild(el('div', { class: 'blogHeaderText' }, [
            el('h1', { class: 'blogTitle' }, el('a', { href: '#/blog', text: info.Title })),
            info.Description ? el('p', { class: 'blogDescription', text: info.Description }) : null
        ]));
        if (!hideWrite) {
            header.appendChild(el('a', { class: 'blogBtn blogBtnPrimary', href: '#/blog?new', text: 'Escribir una entrada' }));
        }
    }

    function paint(resetScroll) {
        if (!root) { return; }
        var route = currentRoute();
        var tk = ++paintToken;
        paintedKey = route.key + '|' + (isLoggedIn() ? '1' : '0');
        if (activeEditor) { activeEditor.destroy(); }
        clear(root);

        if (!isLoggedIn()) {
            root.appendChild(loginNotice());
            scheduleLoginRetry();
            return;
        }

        loginRetryCount = 0;
        var p = route.params;
        var editing = has(p, 'new') || !!p.edit;
        var header = el('header', { class: 'blogHeader' });
        var tabs = el('nav', { class: 'blogTabs', 'aria-label': 'Secciones del blog' });
        var main = el('div', { class: 'blogMain' });
        var side = editing ? null : el('aside', { class: 'blogSide' });
        root.appendChild(header);
        if (!editing) { root.appendChild(tabs); }
        root.appendChild(el('div', { class: 'blogLayout' + (editing ? ' blogLayoutSolo' : '') }, [main, side]));

        fillHeader(header, { Title: currentTitle(), Description: infoCache ? infoCache.Description : '' }, editing);
        getInfo().then(function (info) {
            if (tk !== paintToken) { return; }
            fillHeader(header, info, editing);
            if (root && root.parentNode) { applyTitle(root.parentNode); }
        }, function () { /* sin cabecera personalizada */ });

        if (!editing) {
            renderTabs(tabs, route, sidebarCache ? sidebarCache.data : null);
            renderSidebar(side, route, tk, tabs);
        } else if (!sidebarCache) {
            getSidebar().catch(function () { /* las etiquetas sugeridas son opcionales */ });
        }

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
            root = null;
            paintedKey = null;
            if (activeEditor) { activeEditor.destroy(); }
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
