(function () {
    if (window.__jellyAskLoaded) {
        return;
    }
    window.__jellyAskLoaded = true;

    var STYLE = [
        '.jellyAskBackdrop{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:center;justify-content:center;}',
        '.jellyAskBackdrop.hide{display:none;}',
        '.jellyAskModal{background:#1c1c1c;border-radius:8px;padding:1.5em;max-width:32em;width:90%;box-shadow:0 4px 24px rgba(0,0,0,.5);}',
        '.jellyAskModal h2{margin:0 0 .3em 0;font-size:1.25em;}',
        '.jellyAskModal p.hint{opacity:.75;font-size:.9em;margin:0 0 1em 0;}',
        '.jellyAskModal textarea{width:100%;min-height:7em;resize:vertical;font-family:inherit;font-size:.95em;padding:.6em;border-radius:4px;border:1px solid #444;background:rgba(255,255,255,.06);color:inherit;box-sizing:border-box;}',
        '.jellyAskActions{display:flex;justify-content:flex-end;gap:.6em;margin-top:1em;}',
        '.jellyAskActions button{padding:.5em 1.2em;border-radius:4px;border:none;cursor:pointer;font-size:.9em;}',
        '.jellyAskCancel{background:transparent;color:inherit;border:1px solid #555 !important;}',
        '.jellyAskSubmit{background:#00a4dc;color:#fff;}',
        '.jellyAskSubmit:disabled{opacity:.5;cursor:default;}',
        '.jellyAskStatus{font-size:.85em;opacity:.85;min-height:1.2em;margin-top:.5em;}'
    ].join('');

    function injectStyle() {
        if (document.getElementById('jellyAskStyle')) {
            return;
        }
        var styleEl = document.createElement('style');
        styleEl.id = 'jellyAskStyle';
        styleEl.textContent = STYLE;
        document.head.appendChild(styleEl);
    }

    function apiClient() {
        return window.ApiClient || null;
    }

    function buildModal() {
        var backdrop = document.createElement('div');
        backdrop.className = 'jellyAskBackdrop hide';
        backdrop.innerHTML = '' +
            '<div class="jellyAskModal">' +
            '  <h2>Pedir película o serie</h2>' +
            '  <p class="hint">Incluye todos los detalles posibles para que podamos encontrar la película</p>' +
            '  <textarea placeholder="Incluye todos los detalles posibles para que podamos encontrar la película"></textarea>' +
            '  <div class="jellyAskStatus"></div>' +
            '  <div class="jellyAskActions">' +
            '    <button type="button" class="jellyAskCancel">Cancelar</button>' +
            '    <button type="button" class="jellyAskSubmit">Enviar petición</button>' +
            '  </div>' +
            '</div>';

        var textarea = backdrop.querySelector('textarea');
        var statusEl = backdrop.querySelector('.jellyAskStatus');
        var submitBtn = backdrop.querySelector('.jellyAskSubmit');
        var cancelBtn = backdrop.querySelector('.jellyAskCancel');

        function close() {
            backdrop.classList.add('hide');
            textarea.value = '';
            statusEl.textContent = '';
        }

        backdrop.addEventListener('click', function (evt) {
            if (evt.target === backdrop) {
                close();
            }
        });
        cancelBtn.addEventListener('click', close);

        submitBtn.addEventListener('click', function () {
            var text = textarea.value.trim();
            if (!text) {
                statusEl.textContent = 'Escribe los detalles de tu petición.';
                return;
            }
            var client = apiClient();
            var token = client && typeof client.accessToken === 'function' ? client.accessToken() : null;
            if (!token) {
                statusEl.textContent = 'Necesitas iniciar sesión para enviar una petición.';
                return;
            }
            submitBtn.disabled = true;
            statusEl.textContent = 'Enviando...';
            fetch('/JellyAsk/Request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Emby-Token': token },
                body: JSON.stringify({ Text: text })
            }).then(function (r) {
                if (!r.ok) {
                    return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
                }
                statusEl.textContent = '¡Petición enviada! Gracias.';
                setTimeout(close, 1500);
            }).catch(function (err) {
                statusEl.textContent = 'Error: ' + err.message;
            }).finally(function () {
                submitBtn.disabled = false;
            });
        });

        document.body.appendChild(backdrop);
        return backdrop;
    }

    var modal = null;

    function openModal() {
        injectStyle();
        if (!modal) {
            modal = buildModal();
        }
        modal.classList.remove('hide');
        var textarea = modal.querySelector('textarea');
        setTimeout(function () { textarea.focus(); }, 50);
    }

    function isDashboardRoute() {
        var hash = window.location.hash || '';
        return /#!?\/dashboard/.test(hash);
    }

    function ensureMenuButton() {
        if (isDashboardRoute()) {
            return;
        }
        var scrollContainer = document.querySelector('.mainDrawer-scrollContainer');
        if (!scrollContainer) {
            return;
        }
        if (scrollContainer.querySelector('.jellyAskMenuOption')) {
            return;
        }

        var link = document.createElement('a');
        link.setAttribute('is', 'emby-linkbutton');
        link.className = 'navMenuOption jellyAskMenuOption';
        link.href = '#';
        link.innerHTML = '' +
            '<span class="material-icons navMenuOptionIcon movie_creation" aria-hidden="true"></span>' +
            '<span class="navMenuOptionText">Pedir película</span>';
        link.addEventListener('click', function (evt) {
            evt.preventDefault();
            evt.stopPropagation();
            openModal();
        });

        var settingsLink = scrollContainer.querySelector('.btnSettings');
        if (settingsLink && settingsLink.parentNode) {
            settingsLink.parentNode.insertBefore(link, settingsLink);
        } else {
            scrollContainer.appendChild(link);
        }
    }

    injectStyle();
    ensureMenuButton();

    // Se defiere a un frame aparte para no insertar el nodo en mitad del
    // commit síncrono de React (el cliente web de Jellyfin), que es lo que
    // provocaba el error "e.map is not a function" al entrar al Dashboard.
    var pendingCheck = false;
    var observer = new MutationObserver(function () {
        if (pendingCheck) {
            return;
        }
        pendingCheck = true;
        requestAnimationFrame(function () {
            pendingCheck = false;
            ensureMenuButton();
        });
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
