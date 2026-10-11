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
        '.wpActions{display:flex;justify-content:flex-end;gap:.6em;}',
        '.wpActions button{padding:.5em 1.2em;border-radius:4px;border:none;cursor:pointer;font-size:.9em;}',
        '.wpClose{background:transparent;color:inherit;border:1px solid #555 !important;}',
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

    function showModal(text, itemId) {
        injectStyle();
        var backdrop = document.createElement('div');
        backdrop.className = 'wpBackdrop';
        backdrop.innerHTML = '' +
            '<div class="wpModal">' +
            '  <h2>Recomendación de la semana</h2>' +
            '  <p class="wpText"></p>' +
            '  <div class="wpActions">' +
            (itemId ? '<button type="button" class="wpView">Ver ficha</button>' : '') +
            '    <button type="button" class="wpClose">Cerrar</button>' +
            '  </div>' +
            '</div>';
        backdrop.querySelector('.wpText').textContent = text;

        function close() {
            backdrop.remove();
        }

        backdrop.addEventListener('click', function (evt) {
            if (evt.target === backdrop) {
                close();
            }
        });
        backdrop.querySelector('.wpClose').addEventListener('click', close);
        if (itemId) {
            backdrop.querySelector('.wpView').addEventListener('click', function () {
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
                    showModal(data.Text, data.ItemId);
                    // Se confirma como visto solo ahora que el aviso está realmente en
                    // pantalla, no al pedirlo: si el fetch hubiera fallado o la pestaña
                    // se hubiera cerrado antes, el usuario lo vería la próxima vez.
                    fetch('/WeeklyPick/Ack', { method: 'POST', headers: headers }).catch(function () {});
                }
            })
            .catch(function () {});
    }

    check();
})();
