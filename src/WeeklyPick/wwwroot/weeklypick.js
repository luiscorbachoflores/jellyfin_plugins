(function () {
    if (window.__weeklyPickLoaded) {
        return;
    }
    window.__weeklyPickLoaded = true;

    var STYLE = [
        '.wpBackdrop{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:center;justify-content:center;}',
        '.wpModal{background:#1c1c1c;border-radius:8px;padding:1.5em;max-width:32em;width:90%;box-shadow:0 4px 24px rgba(0,0,0,.5);}',
        '.wpModal h2{margin:0 0 .5em 0;font-size:1.25em;}',
        '.wpText{white-space:pre-wrap;opacity:.9;margin:0 0 1em 0;}',
        '.wpActions{display:flex;justify-content:flex-end;gap:.6em;flex-wrap:wrap;}',
        '.wpActions button{padding:.5em 1.2em;border-radius:4px;border:none;cursor:pointer;font-size:.9em;}',
        '.wpNo{background:transparent;color:inherit;border:1px solid #555 !important;}',
        '.wpYes{background:transparent;color:inherit;border:1px solid #00a4dc !important;}',
        '.wpView{background:#00a4dc;color:#fff;}'
    ].join('');

    function injectStyle() {
        if (document.getElementById('weeklyPickStyle')) {
            return;
        }
        var styleEl = document.createElement('style');
        styleEl.id = 'weeklyPickStyle';
        styleEl.textContent = STYLE;
        document.head.appendChild(styleEl);
    }

    function showModal(text, itemId, headers) {
        injectStyle();
        var backdrop = document.createElement('div');
        backdrop.className = 'wpBackdrop';
        backdrop.innerHTML = '' +
            '<div class="wpModal">' +
            '  <h2>Recomendación</h2>' +
            '  <p class="wpText"></p>' +
            '  <div class="wpActions">' +
            '    <button type="button" class="wpNo">No me interesa</button>' +
            '    <button type="button" class="wpYes">Me interesa</button>' +
            (itemId ? '<button type="button" class="wpView">Ver ficha</button>' : '') +
            '  </div>' +
            '</div>';
        backdrop.querySelector('.wpText').textContent = text;

        // Si ya se ha respondido algo, no cuenta también como descarte al cerrarse el modal.
        var resolved = false;

        function close() {
            backdrop.remove();
        }

        function dismiss() {
            if (resolved) {
                return;
            }
            resolved = true;
            fetch('/WeeklyPick/Dismiss', { method: 'POST', headers: headers }).catch(function () {});
            close();
        }

        backdrop.addEventListener('click', function (evt) {
            if (evt.target === backdrop) {
                dismiss();
            }
        });

        backdrop.querySelector('.wpNo').addEventListener('click', function () {
            resolved = true;
            fetch('/WeeklyPick/Interest?value=false', { method: 'POST', headers: headers }).catch(function () {});
            close();
        });

        backdrop.querySelector('.wpYes').addEventListener('click', function () {
            resolved = true;
            fetch('/WeeklyPick/Interest?value=true', { method: 'POST', headers: headers }).catch(function () {});
            close();
        });

        if (itemId) {
            backdrop.querySelector('.wpView').addEventListener('click', function () {
                resolved = true;
                fetch('/WeeklyPick/Click', { method: 'POST', headers: headers }).catch(function () {});
                close();
                window.location.hash = '#/details?id=' + itemId;
            });
        }

        document.body.appendChild(backdrop);
    }

    function apiClient() {
        return window.ApiClient || null;
    }

    function check() {
        var client = apiClient();
        var token = client && typeof client.accessToken === 'function' ? client.accessToken() : null;
        if (!token) {
            setTimeout(check, 1000);
            return;
        }
        var headers = { 'Authorization': 'MediaBrowser Token="' + token + '"' };
        fetch('/WeeklyPick/Current', { headers: headers })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (data && data.Show) {
                    showModal(data.Text, data.ItemId, headers);
                    // Se confirma como visto solo ahora que el aviso está realmente en
                    // pantalla, no al pedirlo: si el fetch hubiera fallado o la pestaña
                    // se hubiera cerrado antes, el usuario lo vería en la siguiente visita.
                    fetch('/WeeklyPick/Ack', { method: 'POST', headers: headers }).catch(function () {});
                }
            })
            .catch(function () {});
    }

    check();
})();
