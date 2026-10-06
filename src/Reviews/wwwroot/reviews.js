(function () {
    if (window.__reviewsPluginLoaded) {
        return;
    }
    window.__reviewsPluginLoaded = true;

    // Tokens de color: un solo sitio donde cambiar la paleta del widget.
    var STYLE = [
        "/* =========================================================\n",
        "   Titoteca \u00b7 Rese\u00f1as\n",
        "   Registro editorial: tinta c\u00e1lida sobre fondo oscuro, filetes\n",
        "   finos en lugar de cajas, serif para la voz del espectador,\n",
        "   versalitas para la estructura. Coral = acci\u00f3n, mostaza = valor.\n",
        "\n",
        "   Serif propuesta (NO se carga aqu\u00ed; si se quiere, a\u00f1adir en el\n",
        "   tema general):\n",
        "   https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap\n",
        "   Sin ella, cae en Iowan Old Style / Georgia con dignidad.\n",
        "   ========================================================= */\n",
        "\n",
        ".reviewsWidget {\n",
        "    --rv-accent: #e1573f;            /* coral: acciones */\n",
        "    --rv-accent-ink: #f07a63;        /* coral aclarado para texto sobre oscuro */\n",
        "    --rv-gold: #e6c75b;              /* mostaza: valor, director */\n",
        "    --rv-gold-dim: rgba(230, 199, 91, .42); /* estrella vac\u00eda: visible, no compite */\n",
        "    --rv-ink: #efe6d8;               /* papel c\u00e1lido */\n",
        "    --rv-muted: #a89c8b;             /* gris c\u00e1lido, AA sobre el fondo */\n",
        "    --rv-faint: #7d7264;\n",
        "    --rv-line: rgba(239, 230, 216, .12);\n",
        "    --rv-line-strong: rgba(239, 230, 216, .24);\n",
        "    --rv-panel: rgba(239, 230, 216, .03);\n",
        "    --rv-field: rgba(0, 0, 0, .22);\n",
        "    --rv-serif: \"Newsreader\", \"Iowan Old Style\", \"Palatino Linotype\", Palatino, Georgia, serif;\n",
        "    --rv-sans: inherit;\n",
        "    --rv-ease: cubic-bezier(.2, .7, .2, 1);\n",
        "\n",
        "    margin: 2.4em 0 1.8em;\n",
        "    max-width: 46em;\n",
        "    color: var(--rv-ink);\n",
        "    font-feature-settings: \"kern\", \"liga\";\n",
        "}\n",
        "\n",
        "/* --- T\u00edtulo de secci\u00f3n: versalitas peque\u00f1as con filete -------- */\n",
        ".reviewsWidget h2 {\n",
        "    display: flex;\n",
        "    align-items: center;\n",
        "    gap: .9em;\n",
        "    margin: 0 0 1.1em;\n",
        "    font-family: var(--rv-sans);\n",
        "    font-size: .74em;\n",
        "    font-weight: 600;\n",
        "    letter-spacing: .22em;\n",
        "    text-transform: uppercase;\n",
        "    color: var(--rv-muted);\n",
        "}\n",
        ".reviewsWidget h2::after {\n",
        "    content: \"\";\n",
        "    flex: 1;\n",
        "    height: 1px;\n",
        "    background: var(--rv-line);\n",
        "}\n",
        "\n",
        "/* --- Media: la cifra que manda ------------------------------- */\n",
        ".reviewsAverage {\n",
        "    margin: 0 0 1.6em;\n",
        "    font-family: var(--rv-serif);\n",
        "    font-size: 1.32em;\n",
        "    font-weight: 400;\n",
        "    line-height: 1.3;\n",
        "    color: var(--rv-ink);\n",
        "    font-variant-numeric: lining-nums tabular-nums;\n",
        "}\n",
        "\n",
        "/* --- Formulario: sin caja, solo un filete superior ----------- */\n",
        ".reviewsForm {\n",
        "    display: flex;\n",
        "    flex-direction: column;\n",
        "    gap: .85em;\n",
        "    margin-bottom: 2.2em;\n",
        "    padding: 1.2em 0 0;\n",
        "    border-top: 1px solid var(--rv-line);\n",
        "    background: none;\n",
        "}\n",
        "\n",
        "/* Estrellas */\n",
        ".reviewsStars {\n",
        "    display: inline-flex;\n",
        "    gap: .08em;\n",
        "    cursor: pointer;\n",
        "    font-size: 1.75em;\n",
        "    line-height: 1;\n",
        "    user-select: none;\n",
        "    -webkit-user-select: none;\n",
        "}\n",
        ".reviewsStars .star {\n",
        "    position: relative;\n",
        "    display: inline-block;\n",
        "    width: 1em;\n",
        "    color: var(--rv-gold-dim);\n",
        "    transition: transform .14s var(--rv-ease), color .14s var(--rv-ease);\n",
        "}\n",
        ".reviewsStars[data-interactive] .star:hover {\n",
        "    transform: translateY(-1px);\n",
        "}\n",
        ".reviewsStars:not([data-interactive]) {\n",
        "    cursor: default;\n",
        "}\n",
        ".reviewsStars .starFill {\n",
        "    position: absolute;\n",
        "    top: 0;\n",
        "    left: 0;\n",
        "    width: 0%;\n",
        "    overflow: hidden;\n",
        "    white-space: nowrap;\n",
        "    color: var(--rv-gold);\n",
        "    pointer-events: none;\n",
        "}\n",
        "\n",
        ".reviewsStarsHint {\n",
        "    max-width: 38em;\n",
        "    font-size: .8em;\n",
        "    line-height: 1.5;\n",
        "    color: var(--rv-faint);\n",
        "}\n",
        "\n",
        "/* Toggle an\u00f3nimo / usuario: texto subrayado, no pills */\n",
        ".reviewsToggle {\n",
        "    display: flex;\n",
        "    align-items: baseline;\n",
        "    flex-wrap: wrap;\n",
        "    gap: .2em 1.1em;\n",
        "    font-size: .88em;\n",
        "    color: var(--rv-muted);\n",
        "}\n",
        ".reviewsToggle > span {\n",
        "    font-size: .82em;\n",
        "    letter-spacing: .14em;\n",
        "    text-transform: uppercase;\n",
        "}\n",
        ".reviewsToggle button {\n",
        "    padding: .25em 0;\n",
        "    border: 0;\n",
        "    border-bottom: 1px solid transparent;\n",
        "    border-radius: 0;\n",
        "    background: none;\n",
        "    color: var(--rv-muted);\n",
        "    font: inherit;\n",
        "    cursor: pointer;\n",
        "    transition: color .15s var(--rv-ease), border-color .15s var(--rv-ease);\n",
        "}\n",
        ".reviewsToggle button:hover {\n",
        "    color: var(--rv-ink);\n",
        "}\n",
        ".reviewsToggle button.active {\n",
        "    color: var(--rv-ink);\n",
        "    border-bottom-color: var(--rv-accent);\n",
        "}\n",
        "\n",
        "/* Anonimato (checkbox) */\n",
        ".reviewsAnonCheck {\n",
        "    display: inline-flex;\n",
        "    align-items: center;\n",
        "    gap: .6em;\n",
        "    align-self: flex-start;\n",
        "    font-size: .88em;\n",
        "    color: var(--rv-muted);\n",
        "    cursor: pointer;\n",
        "    user-select: none;\n",
        "    -webkit-user-select: none;\n",
        "}\n",
        ".reviewsAnonCheck:hover {\n",
        "    color: var(--rv-ink);\n",
        "}\n",
        ".reviewsAnonInput {\n",
        "    -webkit-appearance: none;\n",
        "    appearance: none;\n",
        "    flex: none;\n",
        "    width: 1em;\n",
        "    height: 1em;\n",
        "    margin: 0;\n",
        "    border: 1px solid var(--rv-line-strong);\n",
        "    border-radius: 2px;\n",
        "    background: transparent;\n",
        "    display: inline-grid;\n",
        "    place-content: center;\n",
        "    cursor: pointer;\n",
        "    transition: border-color .15s var(--rv-ease), background-color .15s var(--rv-ease);\n",
        "}\n",
        ".reviewsAnonInput::before {\n",
        "    content: \"\";\n",
        "    width: .5em;\n",
        "    height: .28em;\n",
        "    border-left: 1.5px solid #1a1411;\n",
        "    border-bottom: 1.5px solid #1a1411;\n",
        "    transform: translateY(-.06em) rotate(-45deg) scale(0);\n",
        "    transition: transform .14s var(--rv-ease);\n",
        "}\n",
        ".reviewsAnonInput:checked {\n",
        "    background: var(--rv-gold);\n",
        "    border-color: var(--rv-gold);\n",
        "}\n",
        ".reviewsAnonInput:checked::before {\n",
        "    transform: translateY(-.06em) rotate(-45deg) scale(1);\n",
        "}\n",
        ".reviewsAuthorPreview {\n",
        "    margin-top: -.35em;\n",
        "    font-size: .8em;\n",
        "    font-style: italic;\n",
        "    color: var(--rv-faint);\n",
        "}\n",
        "\n",
        "/* Campo de texto: serif, l\u00ednea base en lugar de caja */\n",
        ".reviewsForm textarea {\n",
        "    min-height: 5.5em;\n",
        "    resize: vertical;\n",
        "    padding: .7em .8em;\n",
        "    border: 1px solid var(--rv-line);\n",
        "    border-radius: 2px;\n",
        "    background: var(--rv-field);\n",
        "    color: var(--rv-ink);\n",
        "    font-family: var(--rv-serif);\n",
        "    font-size: 1.02em;\n",
        "    line-height: 1.55;\n",
        "    transition: border-color .15s var(--rv-ease);\n",
        "}\n",
        ".reviewsForm textarea::placeholder {\n",
        "    color: var(--rv-faint);\n",
        "    font-style: italic;\n",
        "}\n",
        ".reviewsForm textarea:hover {\n",
        "    border-color: var(--rv-line-strong);\n",
        "}\n",
        ".reviewsForm textarea:focus {\n",
        "    outline: none;\n",
        "    border-color: var(--rv-gold);\n",
        "}\n",
        "\n",
        "/* Acciones */\n",
        ".reviewsSubmit {\n",
        "    align-self: flex-start;\n",
        "    padding: .62em 1.5em;\n",
        "    border: 1px solid var(--rv-accent);\n",
        "    border-radius: 2px;\n",
        "    background: var(--rv-accent);\n",
        "    color: #fff8f2;\n",
        "    font: inherit;\n",
        "    font-size: .8em;\n",
        "    font-weight: 600;\n",
        "    letter-spacing: .14em;\n",
        "    text-transform: uppercase;\n",
        "    cursor: pointer;\n",
        "    transition: background-color .15s var(--rv-ease), border-color .15s var(--rv-ease);\n",
        "}\n",
        ".reviewsSubmit:hover {\n",
        "    background: #c94a34;\n",
        "    border-color: #c94a34;\n",
        "}\n",
        ".reviewsSubmit:disabled {\n",
        "    opacity: .45;\n",
        "    cursor: default;\n",
        "}\n",
        ".reviewsCancelEdit {\n",
        "    align-self: flex-start;\n",
        "    margin-top: -.3em;\n",
        "    padding: .2em 0;\n",
        "    border: 0;\n",
        "    border-bottom: 1px solid var(--rv-line-strong);\n",
        "    border-radius: 0;\n",
        "    background: none;\n",
        "    color: var(--rv-muted);\n",
        "    font: inherit;\n",
        "    font-size: .82em;\n",
        "    cursor: pointer;\n",
        "}\n",
        ".reviewsCancelEdit:hover {\n",
        "    color: var(--rv-ink);\n",
        "    border-bottom-color: var(--rv-ink);\n",
        "}\n",
        ".reviewsStatus {\n",
        "    min-height: 1.2em;\n",
        "    font-size: .84em;\n",
        "    color: var(--rv-muted);\n",
        "}\n",
        "\n",
        "/* --- Lista de rese\u00f1as --------------------------------------- */\n",
        ".reviewsList .reviewItem {\n",
        "    padding: 1.25em 0;\n",
        "    border-top: 1px solid var(--rv-line);\n",
        "}\n",
        ".reviewsList .reviewHead {\n",
        "    display: flex;\n",
        "    align-items: baseline;\n",
        "    flex-wrap: wrap;\n",
        "    gap: .2em .9em;\n",
        "    margin-bottom: .45em;\n",
        "    font-size: .9em;\n",
        "}\n",
        ".reviewsList .reviewUser {\n",
        "    font-weight: 600;\n",
        "    letter-spacing: .01em;\n",
        "    color: var(--rv-ink);\n",
        "}\n",
        ".reviewsList .reviewDate {\n",
        "    font-size: .88em;\n",
        "    color: var(--rv-faint);\n",
        "    font-variant-numeric: tabular-nums;\n",
        "}\n",
        ".reviewsList .reviewStarsDisplay {\n",
        "    font-size: 1.02em;\n",
        "    color: var(--rv-gold);\n",
        "}\n",
        ".reviewsList .reviewStarsDisplay .reviewsStars {\n",
        "    font-size: 1em;\n",
        "}\n",
        ".reviewsList .reviewNoRating {\n",
        "    font-size: .8em;\n",
        "    letter-spacing: .12em;\n",
        "    text-transform: uppercase;\n",
        "    color: var(--rv-faint);\n",
        "}\n",
        ".reviewsList .reviewComment {\n",
        "    margin-top: .55em;\n",
        "    max-width: 38em;\n",
        "    font-family: var(--rv-serif);\n",
        "    font-size: 1.06em;\n",
        "    line-height: 1.6;\n",
        "    color: var(--rv-ink);\n",
        "    white-space: pre-wrap;\n",
        "    hyphens: auto;\n",
        "    -webkit-hyphens: auto;\n",
        "    text-wrap: pretty;\n",
        "}\n",
        "\n",
        "/* Editar / Eliminar: enlaces discretos */\n",
        ".reviewManage {\n",
        "    display: flex;\n",
        "    gap: 1em;\n",
        "    margin-left: auto;\n",
        "}\n",
        ".reviewManage button {\n",
        "    padding: .1em 0;\n",
        "    border: 0;\n",
        "    border-bottom: 1px solid transparent;\n",
        "    border-radius: 0;\n",
        "    background: none;\n",
        "    color: var(--rv-faint);\n",
        "    font: inherit;\n",
        "    font-size: .82em;\n",
        "    cursor: pointer;\n",
        "    transition: color .15s var(--rv-ease), border-color .15s var(--rv-ease);\n",
        "}\n",
        ".reviewManage button:hover {\n",
        "    color: var(--rv-accent-ink);\n",
        "    border-bottom-color: currentColor;\n",
        "}\n",
        "\n",
        ".reviewsEmpty {\n",
        "    margin: 0;\n",
        "    padding: 1.2em 0;\n",
        "    border-top: 1px solid var(--rv-line);\n",
        "    font-family: var(--rv-serif);\n",
        "    font-style: italic;\n",
        "    font-size: 1em;\n",
        "    color: var(--rv-muted);\n",
        "}\n",
        "\n",
        "/* --- Nota del director: filete lateral dorado ---------------- */\n",
        ".reviewsList .reviewItem.isDirector,\n",
        ".reviewItem.isDirector {\n",
        "    position: relative;\n",
        "    margin: 0;\n",
        "    padding: 1.4em 0 1.4em 1.4em;\n",
        "    border: 0;\n",
        "    border-top: 1px solid var(--rv-line);\n",
        "    border-radius: 0;\n",
        "    background: none;\n",
        "    box-shadow: inset 2px 0 0 var(--rv-gold);\n",
        "}\n",
        ".directorSeal {\n",
        "    display: block;\n",
        "    margin: 0 0 .5em;\n",
        "    padding: 0;\n",
        "    border-radius: 0;\n",
        "    background: none;\n",
        "    color: var(--rv-gold);\n",
        "    font-size: .7em;\n",
        "    font-weight: 600;\n",
        "    letter-spacing: .24em;\n",
        "    text-transform: uppercase;\n",
        "}\n",
        ".directorSeal .clap {\n",
        "    display: none;\n",
        "}\n",
        ".reviewItem.isDirector .reviewStarsDisplay {\n",
        "    margin-top: 0;\n",
        "}\n",
        ".reviewItem.isDirector .reviewComment {\n",
        "    font-size: 1.12em;\n",
        "    font-style: italic;\n",
        "}\n",
        "\n",
        "/* --- Foco visible (teclado) --------------------------------- */\n",
        ".reviewsWidget button:focus-visible,\n",
        ".reviewsWidget textarea:focus-visible,\n",
        ".reviewsWidget .reviewsStars:focus-visible,\n",
        ".reviewsAnonInput:focus-visible {\n",
        "    outline: 2px solid var(--rv-gold);\n",
        "    outline-offset: 3px;\n",
        "}\n",
        ".reviewsWidget button:focus:not(:focus-visible) {\n",
        "    outline: none;\n",
        "}\n",
        "\n",
        "@media (prefers-reduced-motion: reduce) {\n",
        "    .reviewsWidget *,\n",
        "    .reviewsWidget *::before {\n",
        "        transition: none !important;\n",
        "    }\n",
        "}\n",
        "\n",
        "/* --- M\u00f3vil --------------------------------------------------- */\n",
        "@media (max-width: 600px) {\n",
        "    .reviewsWidget {\n",
        "        margin: 1.8em 0 1.4em;\n",
        "        max-width: none;\n",
        "    }\n",
        "    .reviewsAverage {\n",
        "        font-size: 1.18em;\n",
        "    }\n",
        "    .reviewsStars {\n",
        "        font-size: 2.1em;   /* objetivo t\u00e1ctil ~34px por estrella */\n",
        "        gap: .12em;\n",
        "    }\n",
        "    .reviewsToggle {\n",
        "        gap: .2em 1.4em;\n",
        "    }\n",
        "    .reviewsToggle > span {\n",
        "        flex-basis: 100%;\n",
        "    }\n",
        "    .reviewsToggle button,\n",
        "    .reviewManage button,\n",
        "    .reviewsCancelEdit {\n",
        "        padding-top: .5em;\n",
        "        padding-bottom: .5em;\n",
        "    }\n",
        "    .reviewsSubmit {\n",
        "        align-self: stretch;\n",
        "        padding: .85em 1em;\n",
        "    }\n",
        "    .reviewsList .reviewHead {\n",
        "        gap: .1em .7em;\n",
        "    }\n",
        "    .reviewManage {\n",
        "        flex-basis: 100%;\n",
        "        margin-left: 0;\n",
        "        order: 3;\n",
        "    }\n",
        "    .reviewsList .reviewComment {\n",
        "        font-size: 1.02em;\n",
        "    }\n",
        "    .reviewsList .reviewItem.isDirector,\n",
        "    .reviewItem.isDirector {\n",
        "        padding-left: 1em;\n",
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
