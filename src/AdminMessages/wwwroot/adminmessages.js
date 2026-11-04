(function () {
    if (window.__adminMessagesLoaded) {
        return;
    }
    window.__adminMessagesLoaded = true;

    // FAB fijo igual que JellyAsk: sobrevive a rediseños del cliente web porque no
    // depende de la estructura interna de ningun menu. Se coloca a la izquierda para
    // no solaparse con el FAB de JellyAsk (abajo a la derecha).
    var POLL_MS = 60000;

    var STYLE = [
        '.adminMessagesFab{position:fixed;left:1.2em;bottom:1.2em;width:3.2em;height:3.2em;border-radius:50%;background:#333;color:#fff;border:none;cursor:pointer;z-index:9000;box-shadow:0 2px 10px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;}',
        '.adminMessagesFab .material-icons{font-size:1.6em;}',
        '.adminMessagesFab.hide{display:none;}',
        '.adminMessagesBadge{position:absolute;top:-.2em;right:-.2em;min-width:1.4em;height:1.4em;border-radius:1em;background:#cc3333;color:#fff;font-size:.75em;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 .3em;}',
        '.adminMessagesBadge.hide{display:none;}',
        '.adminMessagesPanel{position:fixed;left:1.2em;bottom:5.2em;width:22em;max-width:85vw;max-height:60vh;overflow-y:auto;background:#1c1c1c;border-radius:8px;padding:1em;box-shadow:0 4px 24px rgba(0,0,0,.5);z-index:9001;}',
        '.adminMessagesPanel.hide{display:none;}',
        '.adminMessagesPanel h3{margin:0 0 .6em 0;font-size:1.05em;}',
        '.adminMessageItem{padding:.7em 0;border-top:1px solid rgba(255,255,255,.15);}',
        '.adminMessageItem:first-of-type{border-top:none;}',
        '.adminMessageItem.isUnread .adminMessageTitle{font-weight:700;}',
        '.adminMessageTitle{margin-bottom:.2em;}',
        '.adminMessageDate{font-size:.8em;opacity:.7;margin-bottom:.3em;}',
        '.adminMessageBody{font-size:.9em;white-space:pre-wrap;margin-bottom:.4em;}',
        '.adminMessageReadBtn{font-size:.8em;padding:.3em .8em;border-radius:4px;border:1px solid #555;background:transparent;color:inherit;cursor:pointer;}',
        '.adminMessageLinkBtn{display:inline-block;font-size:.8em;padding:.3em .8em;margin:0 .5em .5em 0;border-radius:4px;background:#00a4dc;color:#fff;text-decoration:none;}',
        '.adminMessagesEmpty{opacity:.7;font-size:.9em;}'
    ].join('');

    function injectStyle() {
        if (document.getElementById('adminMessagesStyle')) {
            return;
        }
        var styleEl = document.createElement('style');
        styleEl.id = 'adminMessagesStyle';
        styleEl.textContent = STYLE;
        document.head.appendChild(styleEl);
    }

    function apiClient() {
        return window.ApiClient || null;
    }

    function authHeaders(extra) {
        var headers = extra || {};
        var client = apiClient();
        var token = client && typeof client.accessToken === 'function' ? client.accessToken() : null;
        if (token) {
            headers['Authorization'] = 'MediaBrowser Token="' + token + '"';
        }
        return headers;
    }

    function isLoggedIn() {
        var c = apiClient();
        return !!(c && c.accessToken && c.accessToken());
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    function fetchMine() {
        return fetch('/AdminMessages/mine', { headers: authHeaders() }).then(function (r) {
            if (!r.ok) {
                throw new Error('HTTP ' + r.status);
            }
            return r.json();
        });
    }

    function markRead(id) {
        return fetch('/AdminMessages/' + encodeURIComponent(id) + '/read', {
            method: 'POST',
            headers: authHeaders()
        }).then(function (r) {
            if (!r.ok) {
                throw new Error('HTTP ' + r.status);
            }
        });
    }

    var fab = null;
    var badge = null;
    var panel = null;
    var pollTimer = null;
    var currentMessages = [];

    function buildFab() {
        fab = document.createElement('button');
        fab.type = 'button';
        fab.className = 'adminMessagesFab hide';
        fab.title = 'Mensajes del administrador';
        fab.innerHTML = '<span class="material-icons notifications" aria-hidden="true"></span>' +
            '<span class="adminMessagesBadge hide">0</span>';
        badge = fab.querySelector('.adminMessagesBadge');
        fab.addEventListener('click', function (evt) {
            evt.preventDefault();
            evt.stopPropagation();
            togglePanel();
        });
        document.body.appendChild(fab);
    }

    function buildPanel() {
        panel = document.createElement('div');
        panel.className = 'adminMessagesPanel hide';
        panel.innerHTML = '<h3>Mensajes del administrador</h3><div class="adminMessagesList"></div>';
        document.body.appendChild(panel);

        panel.querySelector('.adminMessagesList').addEventListener('click', function (evt) {
            var btn = evt.target.closest('.adminMessageReadBtn');
            if (!btn) {
                return;
            }
            var id = btn.getAttribute('data-id');
            btn.disabled = true;
            markRead(id).then(refresh).catch(function () {
                btn.disabled = false;
            });
        });

        document.addEventListener('click', function (evt) {
            if (!panel.classList.contains('hide') && !panel.contains(evt.target) && evt.target !== fab && !fab.contains(evt.target)) {
                panel.classList.add('hide');
            }
        });
    }

    function renderPanel() {
        var listEl = panel.querySelector('.adminMessagesList');
        if (currentMessages.length === 0) {
            listEl.innerHTML = '<p class="adminMessagesEmpty">No tienes mensajes.</p>';
            return;
        }
        listEl.innerHTML = currentMessages.map(function (m) {
            var date = new Date(m.CreatedUtc);
            var dateStr = isNaN(date.getTime()) ? '' : date.toLocaleString();
            var readBtn = m.IsRead ? '' : '<button type="button" class="adminMessageReadBtn" data-id="' + m.Id + '">Marcar leído</button>';
            var linkBtn = m.Link
                ? '<a class="adminMessageLinkBtn" href="' + escapeHtml(m.Link) + '" target="_blank" rel="noopener noreferrer">Abrir enlace</a>'
                : '';
            return '' +
                '<div class="adminMessageItem' + (m.IsRead ? '' : ' isUnread') + '">' +
                '  <div class="adminMessageTitle">' + escapeHtml(m.Title) + '</div>' +
                '  <div class="adminMessageDate">' + dateStr + '</div>' +
                '  <div class="adminMessageBody">' + escapeHtml(m.Body) + '</div>' +
                linkBtn +
                readBtn +
                '</div>';
        }).join('');
    }

    function updateBadge() {
        var unread = currentMessages.filter(function (m) { return !m.IsRead; }).length;
        if (unread > 0) {
            badge.textContent = String(unread > 99 ? '99+' : unread);
            badge.classList.remove('hide');
        } else {
            badge.classList.add('hide');
        }
    }

    function togglePanel() {
        panel.classList.toggle('hide');
        if (!panel.classList.contains('hide')) {
            refresh();
        }
    }

    function refresh() {
        if (!isLoggedIn()) {
            return;
        }
        fetchMine().then(function (messages) {
            currentMessages = messages || [];
            updateBadge();
            if (!panel.classList.contains('hide')) {
                renderPanel();
            }
        }).catch(function () {
            // Red inestable o endpoint no disponible todavia: se reintenta en el siguiente poll.
        });
    }

    function isDashboardRoute() {
        var hash = window.location.hash || '';
        return /#!?\/(dashboard|login|startup)/.test(hash);
    }

    function ensureFab() {
        if (!fab) {
            buildFab();
            buildPanel();
        }
        if (isDashboardRoute() || !isLoggedIn()) {
            fab.classList.add('hide');
            panel.classList.add('hide');
            return;
        }
        fab.classList.remove('hide');
        refresh();
    }

    injectStyle();
    ensureFab();

    window.addEventListener('hashchange', ensureFab);
    pollTimer = setInterval(function () {
        if (fab && !fab.classList.contains('hide')) {
            refresh();
        }
    }, POLL_MS);
})();
