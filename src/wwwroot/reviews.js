(function () {
    if (window.__reviewsPluginLoaded) {
        return;
    }
    window.__reviewsPluginLoaded = true;

    var STYLE = [
        '.reviewsWidget{margin:1.5em 0;max-width:60em;}',
        '.reviewsWidget h2{font-size:1.3em;margin:0 0 .6em 0;}',
        '.reviewsAverage{font-size:.95em;opacity:.85;margin-bottom:1em;}',
        '.reviewsForm{display:flex;flex-direction:column;gap:.6em;margin-bottom:1.5em;padding:1em;border-radius:6px;background:rgba(255,255,255,.05);}',
        '.reviewsStars{display:inline-flex;cursor:pointer;font-size:1.7em;line-height:1;letter-spacing:.05em;}',
        '.reviewsStars .star{position:relative;width:1em;display:inline-block;color:#555;}',
        '.reviewsStars .starFill{position:absolute;top:0;left:0;width:0%;overflow:hidden;color:#00a4dc;pointer-events:none;white-space:nowrap;}',
        '.reviewsToggle{display:flex;align-items:center;gap:.6em;font-size:.9em;}',
        '.reviewsToggle button{padding:.3em .8em;border-radius:14px;border:1px solid #555;background:transparent;color:inherit;cursor:pointer;}',
        '.reviewsToggle button.active{background:#00a4dc;border-color:#00a4dc;color:#fff;}',
        '.reviewsForm textarea{min-height:4em;resize:vertical;font-family:inherit;font-size:.95em;padding:.6em;border-radius:4px;border:1px solid #444;background:rgba(255,255,255,.06);color:inherit;}',
        '.reviewsSubmit{align-self:flex-start;padding:.45em 1.3em;border-radius:4px;border:none;background:#00a4dc;color:#fff;cursor:pointer;font-size:.9em;}',
        '.reviewsSubmit:disabled{opacity:.5;cursor:default;}',
        '.reviewsStatus{font-size:.85em;opacity:.8;min-height:1.2em;}',
        '.reviewsList .reviewItem{padding:.75em 0;border-top:1px solid rgba(255,255,255,.08);}',
        '.reviewsList .reviewHead{display:flex;justify-content:space-between;gap:1em;font-size:.9em;opacity:.9;margin-bottom:.3em;flex-wrap:wrap;}',
        '.reviewsList .reviewUser{font-weight:600;}',
        '.reviewsList .reviewStarsDisplay{font-size:1.1em;letter-spacing:.05em;}',
        '.reviewsList .reviewComment{font-size:.95em;white-space:pre-wrap;}',
        '.reviewsEmpty{opacity:.7;font-size:.9em;}'
    ].join('');

    function injectStyle() {
        if (document.getElementById('reviewsPluginStyle')) {
            return;
        }
        var styleEl = document.createElement('style');
        styleEl.id = 'reviewsPluginStyle';
        styleEl.textContent = STYLE;
        document.head.appendChild(styleEl);
    }

    function starsHtml(rating, interactive) {
        var html = '<div class="reviewsStars"' + (interactive ? ' data-interactive="1"' : '') + ' data-value="' + rating + '">';
        for (var i = 1; i <= 5; i++) {
            var pct = Math.max(0, Math.min(1, rating - (i - 1))) * 100;
            html += '<span class="star" data-index="' + i + '">☆<span class="starFill" style="width:' + pct + '%">★</span></span>';
        }
        html += '</div>';
        return html;
    }

    function ratingFromEvent(starsEl, evt) {
        var stars = starsEl.querySelectorAll('.star');
        for (var i = 0; i < stars.length; i++) {
            var rect = stars[i].getBoundingClientRect();
            if (evt.clientX >= rect.left && evt.clientX <= rect.right) {
                var half = (evt.clientX - rect.left) < rect.width / 2;
                return (i + 1) - (half ? 0.5 : 0);
            }
        }
        return null;
    }

    function setStarsValue(starsEl, value) {
        starsEl.setAttribute('data-value', String(value));
        var stars = starsEl.querySelectorAll('.star');
        stars.forEach(function (star, idx) {
            var pct = Math.max(0, Math.min(1, value - idx)) * 100;
            star.querySelector('.starFill').style.width = pct + '%';
        });
    }

    function makeInteractiveStars(container) {
        var starsEl = container.querySelector('.reviewsStars');
        starsEl.addEventListener('mousemove', function (evt) {
            var v = ratingFromEvent(starsEl, evt);
            if (v !== null) {
                setStarsValue(starsEl, v);
            }
        });
        starsEl.addEventListener('mouseleave', function () {
            setStarsValue(starsEl, parseFloat(starsEl.getAttribute('data-selected') || '0'));
        });
        starsEl.addEventListener('click', function (evt) {
            var v = ratingFromEvent(starsEl, evt);
            if (v !== null) {
                starsEl.setAttribute('data-selected', String(v));
                setStarsValue(starsEl, v);
            }
        });
        return starsEl;
    }

    function apiClient() {
        return window.ApiClient || null;
    }

    function fetchReviews(itemId) {
        return fetch('/Reviews/' + encodeURIComponent(itemId)).then(function (r) {
            if (!r.ok) {
                throw new Error('HTTP ' + r.status);
            }
            return r.json();
        });
    }

    function submitReview(itemId, payload) {
        var headers = { 'Content-Type': 'application/json' };
        var client = apiClient();
        if (!payload.AsAnonymous && client && typeof client.accessToken === 'function' && client.accessToken()) {
            headers['X-Emby-Token'] = client.accessToken();
        }
        return fetch('/Reviews/' + encodeURIComponent(itemId), {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        }).then(function (r) {
            if (!r.ok) {
                return r.text().then(function (t) {
                    throw new Error(t || ('HTTP ' + r.status));
                });
            }
            return r.json();
        });
    }

    function renderList(listEl, data) {
        if (!data.Reviews || data.Reviews.length === 0) {
            listEl.innerHTML = '<p class="reviewsEmpty">Todavía no hay reseñas. ¡Sé el primero en opinar!</p>';
            return;
        }
        listEl.innerHTML = data.Reviews.map(function (r) {
            var date = new Date(r.CreatedAt);
            var dateStr = isNaN(date.getTime()) ? '' : date.toLocaleDateString();
            return '' +
                '<div class="reviewItem">' +
                '  <div class="reviewHead">' +
                '    <span class="reviewUser">' + escapeHtml(r.DisplayName) + '</span>' +
                '    <span class="reviewDate">' + dateStr + '</span>' +
                '  </div>' +
                '  <div class="reviewStarsDisplay">' + starsHtml(r.Rating, false) + '</div>' +
                '  <div class="reviewComment">' + escapeHtml(r.Comment) + '</div>' +
                '</div>';
        }).join('');
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    function buildWidget(itemId) {
        var container = document.createElement('div');
        container.className = 'reviewsWidget';
        container.setAttribute('data-item-id', itemId);
        container.innerHTML = '' +
            '<h2>Reseñas</h2>' +
            '<div class="reviewsAverage">Cargando reseñas...</div>' +
            '<div class="reviewsForm">' +
            '  <div class="reviewsFormStars"></div>' +
            '  <div class="reviewsToggle">' +
            '    <span>Comentar como:</span>' +
            '    <button type="button" class="reviewsToggleAnon active" data-mode="anon">Anónimo</button>' +
            '    <button type="button" class="reviewsToggleUser" data-mode="user">Usuario Jellyfin</button>' +
            '  </div>' +
            '  <textarea placeholder="Escribe tu opinión sobre este título..."></textarea>' +
            '  <button type="button" class="reviewsSubmit">Publicar reseña</button>' +
            '  <div class="reviewsStatus"></div>' +
            '</div>' +
            '<div class="reviewsList"><p class="reviewsEmpty">Cargando...</p></div>';

        var formStarsHost = container.querySelector('.reviewsFormStars');
        formStarsHost.innerHTML = starsHtml(0, true);
        var starsEl = makeInteractiveStars(formStarsHost);

        var mode = 'anon';
        var btnAnon = container.querySelector('.reviewsToggleAnon');
        var btnUser = container.querySelector('.reviewsToggleUser');
        btnAnon.addEventListener('click', function () {
            mode = 'anon';
            btnAnon.classList.add('active');
            btnUser.classList.remove('active');
        });
        btnUser.addEventListener('click', function () {
            var client = apiClient();
            if (!client || !client.accessToken || !client.accessToken()) {
                setStatus(container, 'Necesitas iniciar sesión en Jellyfin para comentar como usuario.');
                return;
            }
            mode = 'user';
            btnUser.classList.add('active');
            btnAnon.classList.remove('active');
        });

        var textarea = container.querySelector('textarea');
        var submitBtn = container.querySelector('.reviewsSubmit');
        var listEl = container.querySelector('.reviewsList');
        var avgEl = container.querySelector('.reviewsAverage');

        function refresh() {
            fetchReviews(itemId).then(function (data) {
                avgEl.textContent = data.Count > 0
                    ? ('Media: ' + data.Average.toFixed(1) + ' / 5 (' + data.Count + (data.Count === 1 ? ' reseña' : ' reseñas') + ')')
                    : 'Sin valoraciones todavía';
                renderList(listEl, data);
            }).catch(function () {
                avgEl.textContent = '';
                listEl.innerHTML = '<p class="reviewsEmpty">No se pudieron cargar las reseñas.</p>';
            });
        }

        submitBtn.addEventListener('click', function () {
            var rating = parseFloat(starsEl.getAttribute('data-selected') || '0');
            var comment = textarea.value.trim();
            if (rating < 0.5) {
                setStatus(container, 'Selecciona una puntuación de estrellas.');
                return;
            }
            if (!comment) {
                setStatus(container, 'Escribe un comentario.');
                return;
            }
            submitBtn.disabled = true;
            setStatus(container, 'Publicando...');
            submitReview(itemId, { Rating: rating, Comment: comment, AsAnonymous: mode === 'anon' })
                .then(function () {
                    setStatus(container, 'Reseña publicada.');
                    textarea.value = '';
                    starsEl.setAttribute('data-selected', '0');
                    setStarsValue(starsEl, 0);
                    refresh();
                })
                .catch(function (err) {
                    setStatus(container, 'Error: ' + err.message);
                })
                .finally(function () {
                    submitBtn.disabled = false;
                });
        });

        refresh();
        return container;
    }

    function setStatus(container, text) {
        container.querySelector('.reviewsStatus').textContent = text;
    }

    function extractItemId() {
        var match = /[?&#]id=([a-zA-Z0-9]+)/.exec(window.location.hash || window.location.href);
        return match ? match[1] : null;
    }

    function mount(page) {
        if (!page || page.querySelector('.reviewsWidget')) {
            return;
        }
        var itemId = extractItemId();
        if (!itemId) {
            return;
        }
        var anchor = page.querySelector('.overview-controls')
            || page.querySelector('.overview')
            || page.querySelector('.detailPageContent');
        var widget = buildWidget(itemId);
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(widget, anchor.nextSibling);
        } else {
            page.appendChild(widget);
        }
    }

    function isDetailPage(page) {
        return !!page && page.classList && page.classList.contains('itemDetailPage');
    }

    document.addEventListener('viewshow', function (e) {
        injectStyle();
        var page = e && e.target;
        if (isDetailPage(page)) {
            setTimeout(function () { mount(page); }, 150);
        }
    });

    // Fallback for builds where the viewshow event isn't emitted: watch DOM
    // mutations and re-check whenever an .itemDetailPage becomes visible.
    var observer = new MutationObserver(function () {
        var page = document.querySelector('.itemDetailPage:not(.hide)');
        if (isDetailPage(page)) {
            injectStyle();
            mount(page);
        }
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
