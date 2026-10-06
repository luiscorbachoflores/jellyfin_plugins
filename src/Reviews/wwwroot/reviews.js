(function () {
    if (window.__reviewsPluginLoaded) {
        return;
    }
    window.__reviewsPluginLoaded = true;

    // Tokens de color: un solo sitio donde cambiar la paleta del widget.
    var STYLE = [
        '.reviewsWidget{--rv-accent:#e1573f;--rv-gold:#e6c75b;--rv-ink:inherit;--rv-muted:rgba(127,127,127,.9);--rv-line:rgba(255,255,255,.08);--rv-panel:rgba(255,255,255,.04);margin:1.8em 0;max-width:60em;}',
        '.reviewsWidget h2{font-size:1.3em;margin:0 0 .6em 0;letter-spacing:.01em;}',
        '.reviewsAverage{font-size:.95em;opacity:.85;margin-bottom:1em;}',
        '.reviewsForm{display:flex;flex-direction:column;gap:.7em;margin-bottom:1.6em;padding:1.1em 1.2em;border-radius:10px;background:var(--rv-panel);border:1px solid var(--rv-line);}',
        '.reviewsStars{display:inline-flex;cursor:pointer;font-size:1.7em;line-height:1;letter-spacing:.05em;}',
        '.reviewsStars .star{position:relative;width:1em;display:inline-block;color:#555;transition:transform .12s ease;}',
        '.reviewsStars:hover .star:hover{transform:scale(1.12);}',
        '.reviewsStars .starFill{position:absolute;top:0;left:0;width:0%;overflow:hidden;color:var(--rv-gold);pointer-events:none;white-space:nowrap;}',
        '.reviewsStarsHint{font-size:.8em;opacity:.7;}',
        '.reviewsToggle{display:flex;align-items:center;gap:.6em;font-size:.9em;}',
        '.reviewsToggle button{padding:.3em .9em;border-radius:14px;border:1px solid var(--rv-line);background:transparent;color:inherit;cursor:pointer;transition:background .15s ease,border-color .15s ease;}',
        '.reviewsToggle button.active{background:var(--rv-accent);border-color:var(--rv-accent);color:#fff;}',
        '.reviewsForm textarea{min-height:4em;resize:vertical;font-family:inherit;font-size:.95em;padding:.6em .7em;border-radius:6px;border:1px solid var(--rv-line);background:rgba(255,255,255,.05);color:inherit;}',
        '.reviewsForm textarea:focus{outline:none;border-color:var(--rv-gold);}',
        '.reviewsSubmit{align-self:flex-start;padding:.5em 1.4em;border-radius:6px;border:none;background:var(--rv-accent);color:#fff;font-weight:600;cursor:pointer;font-size:.9em;transition:filter .15s ease;}',
        '.reviewsSubmit:hover{filter:brightness(1.08);}',
        '.reviewsSubmit:disabled{opacity:.5;cursor:default;}',
        '.reviewsCancelEdit{align-self:flex-start;padding:.4em 1em;border-radius:6px;border:1px solid var(--rv-line);background:transparent;color:inherit;cursor:pointer;font-size:.85em;}',
        '.reviewsStatus{font-size:.85em;opacity:.8;min-height:1.2em;}',
        '.reviewsList .reviewItem{padding:.9em .2em;border-top:1px solid var(--rv-line);}',
        '.reviewsList .reviewHead{display:flex;align-items:center;justify-content:space-between;gap:1em;font-size:.9em;margin-bottom:.35em;flex-wrap:wrap;}',
        '.reviewsList .reviewUser{font-weight:600;}',
        '.reviewsList .reviewDate{opacity:.6;font-size:.9em;}',
        '.reviewsList .reviewStarsDisplay{font-size:1.1em;letter-spacing:.05em;color:var(--rv-gold);}',
        '.reviewsList .reviewNoRating{font-size:.85em;opacity:.65;font-style:italic;}',
        '.reviewsList .reviewComment{font-size:.95em;line-height:1.5;white-space:pre-wrap;margin-top:.35em;}',
        '.reviewManage{display:flex;gap:.5em;margin-left:auto;}',
        '.reviewManage button{padding:.15em .7em;font-size:.8em;border-radius:12px;border:1px solid var(--rv-line);background:transparent;color:inherit;cursor:pointer;}',
        '.reviewManage button:hover{border-color:var(--rv-accent);color:var(--rv-accent);}',
        '.reviewsEmpty{opacity:.7;font-size:.9em;}',
        // Reseña del director: sello propio en lugar de la nota normal.
        '.reviewItem.isDirector{position:relative;margin:.6em 0;padding:1em 1.1em;border:1px solid var(--rv-gold);border-radius:10px;background:linear-gradient(135deg,rgba(225,87,63,.14),rgba(230,199,91,.08));border-top:1px solid var(--rv-gold);}',
        '.directorSeal{display:inline-flex;align-items:center;gap:.45em;padding:.25em .8em .25em .6em;border-radius:999px;background:var(--rv-accent);color:#fff;font-size:.8em;font-weight:700;letter-spacing:.08em;text-transform:uppercase;}',
        '.directorSeal .clap{font-size:1.1em;line-height:1;}',
        '.reviewItem.isDirector .reviewStarsDisplay{margin-top:.4em;}'
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
                var current = parseFloat(starsEl.getAttribute('data-selected') || '0');
                // Clic sobre la misma puntuación ya seleccionada la quita
                // (permite dejar el formulario sin estrellas tras haber probado).
                var next = current === v ? 0 : v;
                starsEl.setAttribute('data-selected', String(next));
                setStarsValue(starsEl, next);
            }
        });
        return starsEl;
    }

    function apiClient() {
        return window.ApiClient || null;
    }

    function authHeaders(extra) {
        var headers = extra || {};
        var client = apiClient();
        var token = client && typeof client.accessToken === 'function' ? client.accessToken() : null;
        if (token) {
            headers['X-Emby-Token'] = token;
        }
        return headers;
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
        return fetch('/Reviews/' + encodeURIComponent(itemId), {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload)
        }).then(handleWriteResponse);
    }

    function updateReview(itemId, reviewId, payload) {
        return fetch('/Reviews/' + encodeURIComponent(itemId) + '/' + reviewId, {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload)
        }).then(handleWriteResponse);
    }

    function deleteReview(itemId, reviewId) {
        return fetch('/Reviews/' + encodeURIComponent(itemId) + '/' + reviewId, {
            method: 'DELETE',
            headers: authHeaders()
        }).then(function (r) {
            if (!r.ok) {
                throw new Error('HTTP ' + r.status);
            }
        });
    }

    function handleWriteResponse(r) {
        if (!r.ok) {
            return r.text().then(function (t) {
                throw new Error(t || ('HTTP ' + r.status));
            });
        }
        return r.json();
    }

    function renderList(listEl, data) {
        if (!data.Reviews || data.Reviews.length === 0) {
            listEl.innerHTML = '<p class="reviewsEmpty">Todavía no hay reseñas. ¡Sé el primero en opinar!</p>';
            return;
        }
        listEl.innerHTML = data.Reviews.map(function (r) {
            var date = new Date(r.CreatedAt);
            var dateStr = isNaN(date.getTime()) ? '' : date.toLocaleDateString();
            // La reseña de Tito (el director) lleva sello propio: "Nota del director".
            var isDirector = /^tito$/i.test(String(r.DisplayName || '').trim());
            var ratingHtml = r.Rating > 0
                ? '<div class="reviewStarsDisplay">' + starsHtml(r.Rating, false) + '</div>'
                : '<div class="reviewNoRating">Sin puntuación</div>';
            if (isDirector) {
                ratingHtml = '<div class="directorSeal"><span class="clap">🎬</span>Nota del director</div>' + ratingHtml;
            }
            var commentHtml = r.Comment
                ? '<div class="reviewComment">' + escapeHtml(r.Comment) + '</div>'
                : '';
            var manageHtml = r.CanManage
                ? '<span class="reviewManage">' +
                  '<button type="button" class="reviewEditBtn" data-id="' + r.Id + '">Editar</button>' +
                  '<button type="button" class="reviewDeleteBtn" data-id="' + r.Id + '">Eliminar</button>' +
                  '</span>'
                : '';
            return '' +
                '<div class="reviewItem' + (isDirector ? ' isDirector' : '') + '" data-review-id="' + r.Id + '">' +
                '  <div class="reviewHead">' +
                '    <span class="reviewUser">' + escapeHtml(r.DisplayName) + '</span>' +
                '    <span class="reviewDate">' + dateStr + '</span>' +
                '    ' + manageHtml +
                '  </div>' +
                '  ' + ratingHtml +
                commentHtml +
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
            '  <div class="reviewsStarsHint">Estrellas y comentario son opcionales: solo hace falta uno de los dos. Vuelve a pulsar la misma puntuación para quitarla.</div>' +
            '  <div class="reviewsToggle">' +
            '    <span>Comentar como:</span>' +
            '    <button type="button" class="reviewsToggleAnon active" data-mode="anon">Anónimo</button>' +
            '    <button type="button" class="reviewsToggleUser" data-mode="user">Usuario Jellyfin</button>' +
            '  </div>' +
            '  <textarea placeholder="Escribe tu opinión sobre este título (opcional si ya has puntuado con estrellas)..."></textarea>' +
            '  <button type="button" class="reviewsSubmit">Publicar reseña</button>' +
            '  <button type="button" class="reviewsCancelEdit" style="display:none;">Cancelar edición</button>' +
            '  <div class="reviewsStatus"></div>' +
            '</div>' +
            '<div class="reviewsList"><p class="reviewsEmpty">Cargando...</p></div>';

        var formStarsHost = container.querySelector('.reviewsFormStars');
        formStarsHost.innerHTML = starsHtml(0, true);
        var starsEl = makeInteractiveStars(formStarsHost);

        var mode = 'anon';
        var editingId = null;
        var currentReviews = [];
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
        var cancelBtn = container.querySelector('.reviewsCancelEdit');
        var listEl = container.querySelector('.reviewsList');
        var avgEl = container.querySelector('.reviewsAverage');

        function resetForm() {
            textarea.value = '';
            starsEl.setAttribute('data-selected', '0');
            setStarsValue(starsEl, 0);
            editingId = null;
            submitBtn.textContent = 'Publicar reseña';
            cancelBtn.style.display = 'none';
            mode = 'anon';
            btnAnon.classList.add('active');
            btnUser.classList.remove('active');
        }

        cancelBtn.addEventListener('click', function () {
            resetForm();
            setStatus(container, '');
        });

        function refresh() {
            fetchReviews(itemId).then(function (data) {
                currentReviews = data.Reviews || [];
                if (data.RatedCount > 0) {
                    avgEl.textContent = 'Media: ' + data.Average.toFixed(1) + ' / 5 (' +
                        data.RatedCount + (data.RatedCount === 1 ? ' valoración' : ' valoraciones') + ') · ' +
                        data.Count + (data.Count === 1 ? ' reseña' : ' reseñas');
                } else if (data.Count > 0) {
                    avgEl.textContent = data.Count + (data.Count === 1 ? ' reseña sin puntuación todavía' : ' reseñas sin puntuación todavía');
                } else {
                    avgEl.textContent = 'Sin reseñas todavía';
                }
                renderList(listEl, data);
            }).catch(function () {
                avgEl.textContent = '';
                listEl.innerHTML = '<p class="reviewsEmpty">No se pudieron cargar las reseñas.</p>';
            });
        }

        listEl.addEventListener('click', function (evt) {
            var editBtn = evt.target.closest('.reviewEditBtn');
            var delBtn = evt.target.closest('.reviewDeleteBtn');
            if (editBtn) {
                startEdit(parseInt(editBtn.getAttribute('data-id'), 10));
            } else if (delBtn) {
                var id = parseInt(delBtn.getAttribute('data-id'), 10);
                if (window.confirm('¿Seguro que quieres eliminar tu reseña?')) {
                    deleteReview(itemId, id).then(function () {
                        if (editingId === id) {
                            resetForm();
                        }
                        refresh();
                    }).catch(function () {
                        setStatus(container, 'No se pudo eliminar la reseña.');
                    });
                }
            }
        });

        function startEdit(id) {
            var review = currentReviews.filter(function (r) { return r.Id === id; })[0];
            if (!review || !review.CanManage) {
                return;
            }
            editingId = id;
            textarea.value = review.Comment || '';
            var rating = review.Rating || 0;
            starsEl.setAttribute('data-selected', String(rating));
            setStarsValue(starsEl, rating);
            mode = review.IsAnonymous ? 'anon' : 'user';
            if (mode === 'anon') {
                btnAnon.classList.add('active');
                btnUser.classList.remove('active');
            } else {
                btnUser.classList.add('active');
                btnAnon.classList.remove('active');
            }
            submitBtn.textContent = 'Guardar cambios';
            cancelBtn.style.display = '';
            setStatus(container, 'Editando tu reseña.');
            container.querySelector('.reviewsForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        submitBtn.addEventListener('click', function () {
            var rating = parseFloat(starsEl.getAttribute('data-selected') || '0');
            var comment = textarea.value.trim();
            if (rating < 0.5 && !comment) {
                setStatus(container, 'Indica una puntuación, un comentario, o ambos.');
                return;
            }
            var client = apiClient();
            if (!client || !client.accessToken || !client.accessToken()) {
                setStatus(container, 'Necesitas iniciar sesión en Jellyfin para publicar una reseña (incluso en modo anónimo, nadie más verá tu nombre).');
                return;
            }
            var payload = { Comment: comment, AsAnonymous: mode === 'anon' };
            if (rating >= 0.5) {
                payload.Rating = rating;
            }

            submitBtn.disabled = true;
            var isEditing = editingId !== null;
            setStatus(container, isEditing ? 'Guardando...' : 'Publicando...');
            var action = isEditing ? updateReview(itemId, editingId, payload) : submitReview(itemId, payload);
            action
                .then(function () {
                    setStatus(container, isEditing ? 'Reseña actualizada.' : 'Reseña publicada.');
                    resetForm();
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
