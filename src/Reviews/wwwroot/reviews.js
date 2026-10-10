(function () {
    if (window.__reviewsPluginLoaded) {
        return;
    }
    window.__reviewsPluginLoaded = true;

    // Tokens de color: un solo sitio donde cambiar la paleta del widget.
    var STYLE = [
        "/* Rese\u00f1as (plugin Reviews).\n",
        "   Estilo neutro: hereda tipograf\u00eda y colores del tema de Jellyfin.\n",
        "   Los colores de marca se ajustan desde el CSS personalizado del servidor. */\n",
        "\n",
        ".reviewsWidget {\n",
        "    margin: 1.8em 0;\n",
        "    max-width: 46em;\n",
        "    color: inherit;\n",
        "}\n",
        ".reviewsWidget h2 {\n",
        "    margin: 0 0 .8em;\n",
        "    font-size: 1.2em;\n",
        "}\n",
        ".reviewsAverage {\n",
        "    margin-bottom: 1em;\n",
        "    opacity: .85;\n",
        "}\n",
        ".reviewsForm {\n",
        "    display: flex;\n",
        "    flex-direction: column;\n",
        "    gap: .75em;\n",
        "    margin-bottom: 1.6em;\n",
        "}\n",
        ".reviewsStars {\n",
        "    display: inline-flex;\n",
        "    font-size: 1.6em;\n",
        "    line-height: 1;\n",
        "    cursor: pointer;\n",
        "    user-select: none;\n",
        "    -webkit-user-select: none;\n",
        "}\n",
        ".reviewsStars .star {\n",
        "    position: relative;\n",
        "    display: inline-block;\n",
        "    width: 1em;\n",
        "    opacity: .4;\n",
        "}\n",
        ".reviewsStars .starFill {\n",
        "    position: absolute;\n",
        "    top: 0;\n",
        "    left: 0;\n",
        "    width: 0%;\n",
        "    overflow: hidden;\n",
        "    white-space: nowrap;\n",
        "    opacity: 1;\n",
        "    pointer-events: none;\n",
        "}\n",
        ".reviewsStars:not([data-interactive]) {\n",
        "    cursor: default;\n",
        "}\n",
        ".reviewsStarsHint {\n",
        "    font-size: .85em;\n",
        "    opacity: .7;\n",
        "}\n",
        ".reviewsAnonCheck {\n",
        "    display: inline-flex;\n",
        "    align-items: center;\n",
        "    gap: .5em;\n",
        "    align-self: flex-start;\n",
        "    font-size: .9em;\n",
        "    cursor: pointer;\n",
        "}\n",
        ".reviewsAnonInput {\n",
        "    margin: 0;\n",
        "}\n",
        ".reviewsAuthorPreview {\n",
        "    font-size: .85em;\n",
        "    font-style: italic;\n",
        "    opacity: .7;\n",
        "}\n",
        ".reviewsForm textarea {\n",
        "    min-height: 5em;\n",
        "    resize: vertical;\n",
        "    font: inherit;\n",
        "    padding: .6em .7em;\n",
        "    color: inherit;\n",
        "}\n",
        ".reviewsSubmit {\n",
        "    align-self: flex-start;\n",
        "}\n",
        ".reviewsCancelEdit {\n",
        "    align-self: flex-start;\n",
        "}\n",
        ".reviewsStatus {\n",
        "    min-height: 1.2em;\n",
        "    font-size: .85em;\n",
        "    opacity: .8;\n",
        "}\n",
        ".reviewsList .reviewItem {\n",
        "    padding: .9em 0;\n",
        "    border-top: 1px solid rgba(128, 128, 128, .3);\n",
        "}\n",
        ".reviewsList .reviewHead {\n",
        "    display: flex;\n",
        "    align-items: baseline;\n",
        "    flex-wrap: wrap;\n",
        "    gap: .2em .8em;\n",
        "    margin-bottom: .35em;\n",
        "    font-size: .9em;\n",
        "}\n",
        ".reviewsList .reviewUser {\n",
        "    font-weight: 600;\n",
        "}\n",
        ".reviewsList .reviewDate {\n",
        "    font-size: .88em;\n",
        "    opacity: .7;\n",
        "}\n",
        ".reviewsList .reviewStarsDisplay {\n",
        "    font-size: 1.05em;\n",
        "}\n",
        ".reviewsList .reviewNoRating {\n",
        "    font-size: .85em;\n",
        "    font-style: italic;\n",
        "    opacity: .7;\n",
        "}\n",
        ".reviewsList .reviewComment {\n",
        "    margin-top: .4em;\n",
        "    max-width: 40em;\n",
        "    line-height: 1.5;\n",
        "    white-space: pre-wrap;\n",
        "}\n",
        ".reviewManage {\n",
        "    display: flex;\n",
        "    gap: .8em;\n",
        "    margin-left: auto;\n",
        "}\n",
        ".reviewsEmpty {\n",
        "    margin: 0;\n",
        "    padding: 1em 0;\n",
        "    opacity: .7;\n",
        "}\n",
        "/* Rese\u00f1a del director: marcada con un filete del color de texto y el sello en negrita. */\n",
        ".reviewItem.isDirector {\n",
        "    padding-left: 1em;\n",
        "    border-left: 3px solid currentColor;\n",
        "}\n",
        ".directorSeal {\n",
        "    margin-bottom: .3em;\n",
        "    font-size: .75em;\n",
        "    font-weight: 700;\n",
        "    letter-spacing: .12em;\n",
        "    text-transform: uppercase;\n",
        "}\n",
        ".directorSeal .clap {\n",
        "    display: none;\n",
        "}\n",
        ".reviewItem.isDirector .reviewComment {\n",
        "    font-style: italic;\n",
        "}\n",
        "@media (max-width: 600px) {\n",
        "    .reviewsStars {\n",
        "        font-size: 2em;\n",
        "    }\n",
        "    .reviewsSubmit {\n",
        "        align-self: stretch;\n",
        "    }\n",
        "    .reviewManage {\n",
        "        margin-left: 0;\n",
        "    }\n",
        "}\n"
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
            '  <label class="reviewsAnonCheck"><input type="checkbox" class="reviewsAnonInput"><span>Publicar sin mi nombre</span></label>' +
            '  <div class="reviewsAuthorPreview"></div>' +
            '  <textarea placeholder="Escribe tu opinión sobre este título (opcional si ya has puntuado con estrellas)..."></textarea>' +
            '  <button type="button" class="reviewsSubmit">Publicar reseña</button>' +
            '  <button type="button" class="reviewsCancelEdit" style="display:none;">Cancelar edición</button>' +
            '  <div class="reviewsStatus"></div>' +
            '</div>' +
            '<div class="reviewsList"><p class="reviewsEmpty">Cargando...</p></div>';

        var formStarsHost = container.querySelector('.reviewsFormStars');
        formStarsHost.innerHTML = starsHtml(0, true);
        var starsEl = makeInteractiveStars(formStarsHost);

        var anonInput = container.querySelector('.reviewsAnonInput');
        var previewEl = container.querySelector('.reviewsAuthorPreview');
        var client = apiClient();
        var loggedIn = !!(client && client.accessToken && client.accessToken());
        var userName = '';
        var editingId = null;
        var currentReviews = [];

        function refreshPreview() {
            if (!loggedIn) {
                previewEl.textContent = 'Inicia sesión en Jellyfin para firmar tus reseñas.';
            } else if (anonInput.checked) {
                previewEl.textContent = 'Se publicará como Anónimo.';
            } else {
                previewEl.textContent = 'Se publicará como ' + (userName || 'tu usuario') + '.';
            }
        }
        function setAnon(anon) {
            anonInput.checked = anon;
            refreshPreview();
        }
        if (!loggedIn) {
            anonInput.checked = true;
            anonInput.disabled = true;
        } else if (client.getCurrentUser) {
            client.getCurrentUser().then(function (u) {
                userName = (u && u.Name) || '';
                refreshPreview();
            }).catch(function () {});
        }
        anonInput.addEventListener('change', refreshPreview);
        refreshPreview();

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
            setAnon(!loggedIn);
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
            setAnon(review.IsAnonymous || !loggedIn);
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
            if (!loggedIn) {
                setStatus(container, 'Necesitas iniciar sesión en Jellyfin para publicar una reseña (incluso en modo anónimo, nadie más verá tu nombre).');
                return;
            }
            var payload = { Comment: comment, AsAnonymous: anonInput.checked };
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
