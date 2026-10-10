/*
 * Reviews - client side (injected into jellyfin-web's index.html by the plugin).
 *
 * Adds a reviews widget (half-star rating + comment) to movie / series / season / episode detail pages.
 *
 * Design notes (Jellyfin 12.x web client):
 *  - Auth: "Authorization: MediaBrowser Token=..." (the legacy X-Emby-Token header is rejected for user tokens on 12.x).
 *  - Mounting: jellyfin-web keeps previously visited pages in the DOM (hidden) and builds the visible page
 *    asynchronously, so we (re)check on viewshow / hashchange / popstate / DOM mutations (debounced) and
 *    only touch the visible ".itemDetailPage". The widget always belongs to the item in the URL; a stale widget
 *    (page reused for another item) is replaced; a widget wiped by a re-render is recreated; if no anchor shows
 *    up the script gives up quietly after a bounded number of attempts (never throws).
 *  - Typography/colours are inherited from the page (themes, admin branding CSS); stars use the client's
 *    own star colour variable; buttons copy the native primary-button colours.
 *  - TV layout: read-only list (no form), because typing with a remote is not a sensible use of this widget.
 *  - All user text is inserted with textContent (never innerHTML).
 */
(function () {
    'use strict';
    if (window.__reviewsPluginLoaded) {
        return;
    }
    window.__reviewsPluginLoaded = true;

    var MAX_COMMENT = 2000;
    var REVIEWABLE = { Movie: 1, Series: 1, Season: 1, Episode: 1 };
    var MAX_TRIES = 40;

    // ------------------------------------------------------------------ helpers
    function apiClient() {
        return window.ApiClient || null;
    }

    function token() {
        var c = apiClient();
        return c && typeof c.accessToken === 'function' ? c.accessToken() : null;
    }

    function apiUrl(path) {
        var c = apiClient();
        return c && typeof c.getUrl === 'function' ? c.getUrl(path) : '/' + path;
    }

    function authHeaders(extra) {
        var headers = extra || {};
        var t = token();
        if (t) {
            headers['Authorization'] = 'MediaBrowser Token="' + t + '"';
        }
        return headers;
    }

    function isTv() {
        return document.documentElement.classList.contains('layout-tv');
    }

    function coarsePointer() {
        return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    }

    function h(tag, attrs, children) {
        var el = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (k) {
                if (k === 'class') { el.className = attrs[k]; }
                else if (k === 'text') { el.textContent = attrs[k]; }
                else { el.setAttribute(k, attrs[k]); }
            });
        }
        (children || []).forEach(function (c) { if (c) { el.appendChild(c); } });
        return el;
    }

    function fmt(n) {
        return String(Math.round(n * 10) / 10).replace('.', ',');
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

    var STYLE = [
        '.reviewsWidget{margin:1.8em 0;max-width:46em;color:inherit;font:inherit;--rv-accent:var(--jf-palette-primary-main,#00a4dc);--rv-accent-fg:var(--jf-palette-primary-contrastText,rgba(0,0,0,.87));--rv-star:var(--jf-palette-starIcon-main,#f2b01e)}',
        '.reviewsWidget h2{margin:0 0 .8em;font-size:1.2em;font-weight:500}',
        '.reviewsAverage{margin-bottom:1em;opacity:.85}',
        '.reviewsForm{display:flex;flex-direction:column;gap:.75em;margin-bottom:1.6em}',
        '.reviewsStars{display:inline-flex;font-size:1.7em;line-height:1;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:manipulation;align-self:flex-start;border-radius:.2em}',
        '.reviewsStars:not([data-interactive]){cursor:default}',
        '.reviewsStars .star{position:relative;display:inline-block;width:1em}',
        '.reviewsStars .starBase{opacity:.5}',
        '.reviewsStars .starFill{position:absolute;top:0;left:0;width:0%;overflow:hidden;white-space:nowrap;opacity:1;pointer-events:none;color:var(--rv-star)}',
        '.reviewsStars[data-interactive]:focus-visible,.reviewsWidget button:focus-visible,.reviewsWidget textarea:focus-visible,.reviewsWidget input[type=checkbox]:focus-visible{outline:3px solid var(--rv-accent);outline-offset:2px}',
        '.reviewsStarsHint{font-size:.85em;opacity:.7}',
        '.reviewsAnonCheck{display:inline-flex;align-items:center;gap:.6em;align-self:flex-start;font-size:.95em;cursor:pointer;min-height:44px}',
        '.reviewsAnonInput{margin:0;width:1.25em;height:1.25em;accent-color:var(--rv-accent);cursor:pointer}',
        '.reviewsAuthorPreview{font-size:.85em;font-style:italic;opacity:.7}',
        '.reviewsForm textarea{min-height:5.5em;resize:vertical;font:inherit;padding:.7em;color:inherit;border-radius:.3em;border:1px solid rgba(128,128,128,.55);background:rgba(128,128,128,.14);box-sizing:border-box;width:100%}',
        '.reviewsForm textarea::placeholder{color:inherit;opacity:.55}',
        '.reviewsCount{font-size:.8em;opacity:.65;text-align:right;margin-top:-.4em}',
        '.reviewsBtns{display:flex;gap:.7em;flex-wrap:wrap}',
        '.reviewsWidget button.rvBtn{min-height:44px;min-width:44px;padding:.5em 1.3em;border-radius:.3em;border:1px solid rgba(128,128,128,.6);background:transparent;color:inherit;font:inherit;font-weight:500;cursor:pointer}',
        '.reviewsWidget button.rvBtn:hover:not(:disabled){background:rgba(128,128,128,.2)}',
        '.reviewsWidget button.rvBtn.primary{background:var(--rv-accent);color:var(--rv-accent-fg);border-color:transparent}',
        '.reviewsWidget button.rvBtn.primary:hover:not(:disabled){filter:brightness(1.1);background:var(--rv-accent)}',
        '.reviewsWidget button.rvBtn.danger{border-color:var(--jf-palette-error-light,#e57373);color:var(--jf-palette-error-light,#e57373)}',
        '.reviewsWidget button.rvBtn:disabled{opacity:.5;cursor:default}',
        '.reviewsStatus{min-height:1.3em;font-size:.88em;opacity:.9}',
        '.reviewsStatus.err{color:var(--jf-palette-error-light,#e57373);opacity:1}',
        '.reviewsList .reviewItem{padding:.9em 0;border-top:1px solid rgba(128,128,128,.3)}',
        '.reviewsList .reviewHead{display:flex;align-items:center;flex-wrap:wrap;gap:.2em .8em;margin-bottom:.35em;font-size:.9em}',
        '.reviewsList .reviewUser{font-weight:600}',
        '.reviewsList .reviewDate,.reviewsList .reviewAnonNote{font-size:.88em;opacity:.7}',
        '.reviewsList .reviewStarsDisplay{font-size:1.05em}',
        '.reviewsList .reviewStarsDisplay .reviewsStars{font-size:1em}',
        '.reviewsList .reviewNoRating{font-size:.85em;font-style:italic;opacity:.7}',
        '.reviewsList .reviewComment{margin-top:.4em;max-width:40em;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}',
        '.reviewManage{display:flex;gap:.5em;margin-left:auto}',
        '.reviewsWidget .reviewManage button.rvBtn{min-height:36px;padding:.3em .9em;font-size:.9em}',
        '.reviewsEmpty{margin:0;padding:1em 0;opacity:.7}',
        '.reviewItem.isDirector{padding-left:1em;border-left:3px solid currentColor}',
        '.directorSeal{margin-bottom:.3em;font-size:.75em;font-weight:700;letter-spacing:.12em;text-transform:uppercase}',
        '.reviewItem.isDirector .reviewComment{font-style:italic}',
        '.jfpSr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
        '@media (max-width:600px){.reviewsStars{font-size:2.2em}.reviewsBtns button.rvBtn.primary{flex:1 1 100%}.reviewManage{margin-left:0}}',
        '@media (pointer:coarse){.reviewsWidget button.rvBtn,.reviewsWidget .reviewManage button.rvBtn{min-height:44px}}'
    ].join('\n');

    function injectStyle() {
        if (document.getElementById('reviewsPluginStyle')) {
            return;
        }
        var styleEl = document.createElement('style');
        styleEl.id = 'reviewsPluginStyle';
        styleEl.textContent = STYLE;
        document.head.appendChild(styleEl);
    }

    // ------------------------------------------------------------------ stars
    function setStarsValue(starsEl, value) {
        starsEl.setAttribute('data-value', String(value));
        var fills = starsEl.querySelectorAll('.starFill');
        for (var i = 0; i < fills.length; i++) {
            var pct = Math.max(0, Math.min(1, value - i)) * 100;
            fills[i].style.width = pct + '%';
        }
    }

    function buildStars(value, interactive) {
        var el = h('div', { 'class': 'reviewsStars' });
        for (var i = 1; i <= 5; i++) {
            el.appendChild(h('span', { 'class': 'star', 'data-index': String(i), 'aria-hidden': 'true' }, [
                h('span', { 'class': 'starBase', text: '☆' }),
                h('span', { 'class': 'starFill', text: '★' })
            ]));
        }
        if (interactive) {
            el.setAttribute('data-interactive', '1');
            el.setAttribute('role', 'slider');
            el.setAttribute('tabindex', '0');
            el.setAttribute('aria-label', 'Puntuación');
            el.setAttribute('aria-valuemin', '0');
            el.setAttribute('aria-valuemax', '5');
            el.setAttribute('aria-valuestep', '0.5');
        } else {
            el.setAttribute('role', 'img');
            el.setAttribute('aria-label', fmt(value) + ' de 5 estrellas');
        }
        setStarsValue(el, value);
        return el;
    }

    function announce(starsEl, value) {
        starsEl.setAttribute('aria-valuenow', String(value));
        starsEl.setAttribute('aria-valuetext', value > 0 ? fmt(value) + ' de 5' : 'sin puntuación');
    }

    function ratingFromEvent(starsEl, evt) {
        var stars = starsEl.querySelectorAll('.star');
        for (var i = 0; i < stars.length; i++) {
            var rect = stars[i].getBoundingClientRect();
            if (evt.clientX >= rect.left && evt.clientX <= rect.right) {
                var half = (evt.clientX - rect.left) < rect.width / 2;
                return { star: i + 1, half: half };
            }
        }
        return null;
    }

    /** Wires mouse hover/click, touch taps and keyboard to a rating control. Returns getter/setter. */
    function makeInteractiveStars(starsEl) {
        var selected = 0;
        function set(v) {
            selected = Math.max(0, Math.min(5, v));
            starsEl.setAttribute('data-selected', String(selected));
            setStarsValue(starsEl, selected);
            announce(starsEl, selected);
        }
        starsEl.addEventListener('mousemove', function (evt) {
            if (evt.pointerType === 'touch') { return; }
            var r = ratingFromEvent(starsEl, evt);
            if (r) { setStarsValue(starsEl, r.star - (r.half ? 0.5 : 0)); }
        });
        starsEl.addEventListener('mouseleave', function () { setStarsValue(starsEl, selected); });
        starsEl.addEventListener('click', function (evt) {
            var r = ratingFromEvent(starsEl, evt);
            if (!r) { return; }
            var v;
            if (coarsePointer()) {
                // Fingers cannot hit half a star: a second tap on the same star gives the half, a third clears it.
                v = selected === r.star ? r.star - 0.5 : (selected === r.star - 0.5 ? 0 : r.star);
            } else {
                var picked = r.star - (r.half ? 0.5 : 0);
                v = selected === picked ? 0 : picked; // same rating again clears it
            }
            set(v);
        });
        starsEl.addEventListener('keydown', function (evt) {
            var v = null;
            if (evt.key === 'ArrowRight' || evt.key === 'ArrowUp') { v = selected + 0.5; }
            else if (evt.key === 'ArrowLeft' || evt.key === 'ArrowDown') { v = selected - 0.5; }
            else if (evt.key === 'Home' || evt.key === 'Delete' || evt.key === 'Backspace') { v = 0; }
            else if (evt.key === 'End') { v = 5; }
            if (v !== null) {
                evt.preventDefault();
                set(v);
            }
        });
        set(0);
        return { get: function () { return selected; }, set: set };
    }

    // ------------------------------------------------------------------ server calls
    function readError(r) {
        return r.text().then(function (t) {
            var msg = (t || '').replace(/^"|"$/g, '');
            if (r.status === 401) { msg = 'Tu sesión ha caducado: vuelve a iniciar sesión.'; }
            else if (r.status === 429) { msg = msg || 'Demasiadas reseñas seguidas.'; }
            else if (!msg || msg.length > 200 || msg.charAt(0) === '{') { msg = 'Error del servidor (' + r.status + ').'; }
            throw new Error(msg);
        });
    }

    function fetchReviews(itemId) {
        return fetch(apiUrl('Reviews/' + encodeURIComponent(itemId)), { headers: authHeaders() }).then(function (r) {
            if (!r.ok) { throw new Error('HTTP ' + r.status); }
            return r.json();
        });
    }

    function writeReview(method, itemId, reviewId, payload) {
        var path = 'Reviews/' + encodeURIComponent(itemId) + (reviewId ? '/' + reviewId : '');
        return fetch(apiUrl(path), {
            method: method,
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload)
        }).then(function (r) { return r.ok ? r.json() : readError(r); });
    }

    function deleteReview(itemId, reviewId) {
        return fetch(apiUrl('Reviews/' + encodeURIComponent(itemId) + '/' + reviewId), {
            method: 'DELETE',
            headers: authHeaders()
        }).then(function (r) { return r.ok ? null : readError(r); });
    }

    // ------------------------------------------------------------------ widget
    function buildWidget(itemId) {
        var readOnly = isTv();
        var loggedIn = !!token();
        var userName = '';
        var editingId = null;
        var currentReviews = [];
        var accent = nativeAccent();

        var container = h('div', { 'class': 'reviewsWidget', 'data-item-id': itemId });
        container.style.setProperty('--rv-accent', accent.bg);
        container.style.setProperty('--rv-accent-fg', accent.fg);

        var avgEl = h('div', { 'class': 'reviewsAverage', text: 'Cargando reseñas…' });
        var listEl = h('div', { 'class': 'reviewsList' }, [h('p', { 'class': 'reviewsEmpty', text: 'Cargando…' })]);
        container.appendChild(h('h2', { text: 'Reseñas' }));
        container.appendChild(avgEl);

        var starsCtl = null, anonInput = null, previewEl = null, textarea = null, submitBtn = null, cancelBtn = null, statusEl = null, countEl = null;

        function setStatus(text, isError) {
            if (!statusEl) { return; }
            statusEl.textContent = text;
            statusEl.classList.toggle('err', !!isError);
        }

        function refreshPreview() {
            if (!previewEl) { return; }
            if (!loggedIn) {
                previewEl.textContent = 'Inicia sesión en Jellyfin para firmar tus reseñas.';
            } else if (anonInput.checked) {
                previewEl.textContent = 'Se publicará como Anónimo.';
            } else {
                previewEl.textContent = 'Se publicará como ' + (userName || 'tu usuario') + '.';
            }
        }

        function resetForm() {
            textarea.value = '';
            starsCtl.set(0);
            editingId = null;
            submitBtn.textContent = 'Publicar reseña';
            cancelBtn.hidden = true;
            anonInput.checked = !loggedIn;
            countEl.textContent = '0 / ' + MAX_COMMENT;
            refreshPreview();
        }

        if (!readOnly) {
            var formEl = h('div', { 'class': 'reviewsForm' });
            var starsDom = buildStars(0, true);
            starsCtl = makeInteractiveStars(starsDom);
            formEl.appendChild(starsDom);
            formEl.appendChild(h('div', { 'class': 'reviewsStarsHint', text: coarsePointer()
                ? 'Estrellas y comentario son opcionales: solo hace falta uno de los dos. Toca una estrella otra vez para media estrella y una tercera vez para quitarla.'
                : 'Estrellas y comentario son opcionales: solo hace falta uno de los dos. Vuelve a pulsar la misma puntuación para quitarla (con teclado: flechas).' }));
            anonInput = h('input', { 'class': 'reviewsAnonInput', type: 'checkbox', id: 'reviewsAnon-' + itemId });
            formEl.appendChild(h('label', { 'class': 'reviewsAnonCheck', 'for': 'reviewsAnon-' + itemId }, [anonInput, h('span', { text: 'Publicar sin mi nombre' })]));
            previewEl = h('div', { 'class': 'reviewsAuthorPreview', 'aria-live': 'polite' });
            formEl.appendChild(previewEl);
            formEl.appendChild(h('label', { 'class': 'jfpSr', 'for': 'reviewsText-' + itemId, text: 'Tu opinión' }));
            textarea = h('textarea', { id: 'reviewsText-' + itemId, maxlength: String(MAX_COMMENT), placeholder: 'Escribe tu opinión sobre este título (opcional si ya has puntuado con estrellas)…' });
            formEl.appendChild(textarea);
            countEl = h('div', { 'class': 'reviewsCount', 'aria-hidden': 'true', text: '0 / ' + MAX_COMMENT });
            formEl.appendChild(countEl);
            submitBtn = h('button', { type: 'button', 'class': 'rvBtn primary reviewsSubmit', text: 'Publicar reseña' });
            cancelBtn = h('button', { type: 'button', 'class': 'rvBtn reviewsCancelEdit', text: 'Cancelar edición' });
            cancelBtn.hidden = true;
            formEl.appendChild(h('div', { 'class': 'reviewsBtns' }, [submitBtn, cancelBtn]));
            statusEl = h('div', { 'class': 'reviewsStatus', role: 'status', 'aria-live': 'polite' });
            formEl.appendChild(statusEl);
            container.appendChild(formEl);

            if (!loggedIn) {
                anonInput.checked = true;
                anonInput.disabled = true;
            } else {
                var c = apiClient();
                if (c && typeof c.getCurrentUser === 'function') {
                    c.getCurrentUser().then(function (u) {
                        userName = (u && u.Name) || '';
                        refreshPreview();
                    }).catch(function () { /* optional */ });
                }
            }
            anonInput.addEventListener('change', refreshPreview);
            textarea.addEventListener('input', function () { countEl.textContent = textarea.value.length + ' / ' + MAX_COMMENT; });
            refreshPreview();

            cancelBtn.addEventListener('click', function () {
                resetForm();
                setStatus('', false);
            });

            submitBtn.addEventListener('click', function () {
                var rating = starsCtl.get();
                var comment = textarea.value.trim();
                if (rating < 0.5 && !comment) {
                    setStatus('Indica una puntuación, un comentario, o ambos.', true);
                    return;
                }
                if (!loggedIn) {
                    setStatus('Necesitas iniciar sesión en Jellyfin para publicar una reseña (incluso en modo anónimo, nadie más verá tu nombre).', true);
                    return;
                }
                var payload = { Comment: comment, AsAnonymous: anonInput.checked };
                if (rating >= 0.5) { payload.Rating = rating; }

                submitBtn.disabled = true;
                var isEditing = editingId !== null;
                setStatus(isEditing ? 'Guardando…' : 'Publicando…', false);
                writeReview(isEditing ? 'PUT' : 'POST', itemId, isEditing ? editingId : null, payload)
                    .then(function () {
                        resetForm();
                        setStatus(isEditing ? 'Reseña actualizada.' : 'Reseña publicada.', false);
                        refresh();
                    })
                    .catch(function (err) {
                        setStatus('Error: ' + (err && err.message ? err.message : 'no se pudo guardar.'), true);
                    })
                    .then(function () { submitBtn.disabled = false; });
            });
        }

        container.appendChild(listEl);

        function startEdit(id) {
            var review = currentReviews.filter(function (r) { return r.Id === id; })[0];
            if (!review || !review.CanManage || readOnly) { return; }
            editingId = id;
            textarea.value = review.Comment || '';
            countEl.textContent = textarea.value.length + ' / ' + MAX_COMMENT;
            starsCtl.set(review.Rating || 0);
            anonInput.checked = review.IsAnonymous || !loggedIn;
            refreshPreview();
            submitBtn.textContent = 'Guardar cambios';
            cancelBtn.hidden = false;
            setStatus('Editando tu reseña.', false);
            var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            container.querySelector('.reviewsForm').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
            textarea.focus({ preventScroll: true });
        }

        function renderList(data) {
            listEl.textContent = '';
            if (!data.Reviews || data.Reviews.length === 0) {
                listEl.appendChild(h('p', { 'class': 'reviewsEmpty', text: 'Todavía no hay reseñas. ¡Sé el primero en opinar!' }));
                return;
            }
            data.Reviews.forEach(function (r) {
                var date = new Date(r.CreatedAt);
                var dateStr = isNaN(date.getTime()) ? '' : date.toLocaleDateString();
                // The director's (Tito's) review carries its own seal: "Nota del director".
                var isDirector = /^tito$/i.test(String(r.DisplayName || '').trim());
                var item = h('div', { 'class': 'reviewItem' + (isDirector ? ' isDirector' : ''), 'data-review-id': String(r.Id) });
                var head = h('div', { 'class': 'reviewHead' }, [
                    h('span', { 'class': 'reviewUser', text: r.DisplayName }),
                    h('span', { 'class': 'reviewDate', text: dateStr })
                ]);
                // Admins receive real names of anonymous authors: make it obvious they are not public.
                if (r.IsAnonymous && r.DisplayName !== 'Anónimo') {
                    head.appendChild(h('span', { 'class': 'reviewAnonNote', text: '(anónima para los demás)' }));
                }
                if (r.CanManage && !readOnly) {
                    var edit = h('button', { type: 'button', 'class': 'rvBtn reviewEditBtn', 'data-id': String(r.Id), text: 'Editar' });
                    var del = h('button', { type: 'button', 'class': 'rvBtn danger reviewDeleteBtn', 'data-id': String(r.Id), text: 'Eliminar' });
                    head.appendChild(h('span', { 'class': 'reviewManage' }, [edit, del]));
                }
                item.appendChild(head);
                if (isDirector) {
                    item.appendChild(h('div', { 'class': 'directorSeal', text: 'Nota del director' }));
                }
                item.appendChild(r.Rating > 0
                    ? h('div', { 'class': 'reviewStarsDisplay' }, [buildStars(r.Rating, false)])
                    : h('div', { 'class': 'reviewNoRating', text: 'Sin puntuación' }));
                if (r.Comment) {
                    item.appendChild(h('div', { 'class': 'reviewComment', text: r.Comment }));
                }
                listEl.appendChild(item);
            });
        }

        function refresh() {
            return fetchReviews(itemId).then(function (data) {
                if (!container.isConnected && !container.parentNode) { return; }
                container.__loadedAt = Date.now();
                currentReviews = data.Reviews || [];
                if (data.RatedCount > 0) {
                    avgEl.textContent = 'Media: ' + fmt(data.Average) + ' / 5 (' +
                        data.RatedCount + (data.RatedCount === 1 ? ' valoración' : ' valoraciones') + ') · ' +
                        data.Count + (data.Count === 1 ? ' reseña' : ' reseñas');
                } else if (data.Count > 0) {
                    avgEl.textContent = data.Count + (data.Count === 1 ? ' reseña sin puntuación todavía' : ' reseñas sin puntuación todavía');
                } else {
                    avgEl.textContent = 'Sin reseñas todavía';
                }
                renderList(data);
            }).catch(function () {
                avgEl.textContent = '';
                listEl.textContent = '';
                listEl.appendChild(h('p', { 'class': 'reviewsEmpty', text: 'No se pudieron cargar las reseñas.' }));
            });
        }
        container.__refresh = refresh;

        var pendingDelete = null;
        listEl.addEventListener('click', function (evt) {
            var editBtn = evt.target.closest('.reviewEditBtn');
            var delBtn = evt.target.closest('.reviewDeleteBtn');
            if (editBtn) {
                startEdit(parseInt(editBtn.getAttribute('data-id'), 10));
            } else if (delBtn) {
                var id = parseInt(delBtn.getAttribute('data-id'), 10);
                // Two-step confirmation inside the widget (window.confirm blocks, is not themed and breaks on TV/iOS).
                if (pendingDelete !== id) {
                    pendingDelete = id;
                    delBtn.textContent = '¿Seguro? Pulsa de nuevo';
                    setTimeout(function () {
                        if (pendingDelete === id) { pendingDelete = null; delBtn.textContent = 'Eliminar'; }
                    }, 4000);
                    return;
                }
                pendingDelete = null;
                delBtn.disabled = true;
                deleteReview(itemId, id).then(function () {
                    if (editingId === id && !readOnly) { resetForm(); }
                    return refresh();
                }).catch(function () {
                    delBtn.disabled = false;
                    delBtn.textContent = 'Eliminar';
                    setStatus('No se pudo eliminar la reseña.', true);
                });
            }
        });

        refresh();
        return container;
    }

    // ------------------------------------------------------------------ mounting
    function currentItemId() {
        var hash = window.location.hash || '';
        if (!/^#!?\/details/i.test(hash)) {
            return null;
        }
        var m = /[?&]id=([0-9a-fA-F-]{32,36})/.exec(hash);
        return m ? m[1].replace(/-/g, '').toLowerCase() : null;
    }

    var typeCache = {};   // id -> 'Movie' | ... | false (not reviewable) | Promise
    function reviewable(itemId) {
        var cached = typeCache[itemId];
        if (cached === true || cached === false) {
            return Promise.resolve(cached);
        }
        if (cached) {
            return cached;
        }
        var c = apiClient();
        if (!c || typeof c.getItem !== 'function' || typeof c.getCurrentUserId !== 'function') {
            return Promise.resolve(false);
        }
        var p = c.getItem(c.getCurrentUserId(), itemId).then(function (item) {
            var ok = !!(item && REVIEWABLE[item.Type]);
            typeCache[itemId] = ok;
            return ok;
        }).catch(function () {
            delete typeCache[itemId];
            return false;
        });
        typeCache[itemId] = p;
        return p;
    }

    function findAnchor(page, tries) {
        var a = page.querySelector('.overview-controls');
        if (a && a.parentNode) { return { node: a, mode: 'after' }; }
        a = page.querySelector('.overview');
        if (a && a.parentNode) { return { node: a, mode: 'after' }; }
        if (tries >= 6) {
            // Fallback strategy: the page is loaded but its structure changed; append to the content container.
            a = page.querySelector('.detailPageContent') || page.querySelector('.detailPagePrimaryContainer');
            if (a) { return { node: a, mode: 'append' }; }
            if (tries >= 12) { return { node: page, mode: 'append' }; }
        }
        return null;
    }

    function ensure() {
        if (!token() || !document.body) {
            return;
        }
        var itemId = currentItemId();
        if (!itemId) {
            return;
        }
        var page = document.querySelector('.itemDetailPage:not(.hide)');
        if (!page) {
            return;
        }
        var widget = page.querySelector('.reviewsWidget');
        if (widget && widget.getAttribute('data-item-id') === itemId) {
            // Page re-shown from the cache: refresh stale data.
            if (widget.__refresh && Date.now() - (widget.__loadedAt || 0) > 60000) { widget.__refresh(); }
            return;
        }
        if (page.__rvKey !== itemId) {
            page.__rvKey = itemId;
            page.__rvTries = 0;
        }
        if (page.__rvTries > MAX_TRIES) {
            return; // give up quietly on this visit
        }
        reviewable(itemId).then(function (ok) {
            if (!ok || currentItemId() !== itemId || !page.isConnected || page.classList.contains('hide')) {
                return;
            }
            if (widget && widget.parentNode) { widget.remove(); }
            if (page.querySelector('.reviewsWidget')) { return; }
            var anchor = findAnchor(page, page.__rvTries);
            if (!anchor) {
                page.__rvTries++;
                return;
            }
            injectStyle();
            var w = buildWidget(itemId);
            if (anchor.mode === 'after') {
                anchor.node.parentNode.insertBefore(w, anchor.node.nextSibling);
            } else {
                anchor.node.appendChild(w);
            }
        }).catch(function () { /* never break the host page */ });
    }

    var timer = null;
    function schedule() {
        if (timer) { return; }
        timer = setTimeout(function () {
            timer = null;
            try { ensure(); } catch (e) { /* never throw into the host page */ }
        }, 200);
    }

    function start() {
        injectStyle();
        document.addEventListener('viewshow', schedule);
        window.addEventListener('hashchange', schedule);
        window.addEventListener('popstate', schedule);
        // The detail page is built asynchronously and may be re-rendered: watch the DOM, but do nothing unless we are on a details route.
        new MutationObserver(function () {
            if (currentItemId()) { schedule(); }
        }).observe(document.body, { childList: true, subtree: true });
        schedule();
    }

    if (document.body) {
        start();
    } else {
        document.addEventListener('DOMContentLoaded', start);
    }
})();
