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
        '.jellyAskStatus{font-size:.85em;opacity:.85;min-height:1.2em;margin-top:.5em;}',
        '.jellyAskFab{position:fixed;right:1.2em;bottom:1.2em;width:3.2em;height:3.2em;border-radius:50%;background:#00a4dc;color:#fff;border:none;cursor:pointer;z-index:9000;box-shadow:0 2px 10px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;}',
        '.jellyAskFab .material-icons{font-size:1.6em;}',
        '.jellyAskFab.hide{display:none;}'
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
        return /#!?\/(dashboard|login|startup)/.test(hash);
    }

    // Boton flotante fijo, independiente del menu de navegacion de Jellyfin.
    // Antes se insertaba un enlace dentro del cajon lateral clasico (anclado a
    // ".mainDrawer-scrollContainer" / ".btnSettings"), pero esa superficie ya
    // no es donde los usuarios llegan a Configuracion en las versiones nuevas
    // del cliente web (ahora es un menu aparte, React/MUI, colgado del avatar).
    // Un FAB con posicion fija no depende de la estructura interna de ningun
    // menu, asi que sobrevive a rediseños del cliente web.
    var fab = null;

    function ensureFab() {
        if (isDashboardRoute()) {
            if (fab) {
                fab.classList.add('hide');
            }
            return;
        }
        if (!fab) {
            fab = document.createElement('button');
            fab.type = 'button';
            fab.className = 'jellyAskFab';
            fab.title = 'Pedir película o serie';
            fab.innerHTML = '<span class="material-icons movie_creation" aria-hidden="true"></span>';
            fab.addEventListener('click', function (evt) {
                evt.preventDefault();
                evt.stopPropagation();
                openModal();
            });
            document.body.appendChild(fab);
        }
        fab.classList.remove('hide');
    }

    injectStyle();
    ensureFab();

    window.addEventListener('hashchange', ensureFab);
})();
