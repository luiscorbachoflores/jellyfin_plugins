(function () {
    if (window.__adminMessagesLoaded) {
        return;
    }
    window.__adminMessagesLoaded = true;

    // Icono en la barra superior, junto a la lupa (igual patron que Watchlist en el menu de
    // usuario): anclar por contrato de DOM estable (href de la ruta de busqueda), copiar las
    // clases del hermano en vez de cloneNode (es un MuiIconButton, no un built-in custom, pero
    // se sigue la misma convencion por consistencia y para heredar estilos/hover nativos), un
    // unico MutationObserver agrupado en requestAnimationFrame, insercion idempotente marcada
    // con data-adminmessages, cada estrategia en try/catch y sin FAB de emergencia si no encaja
    // ningun anclaje (p.ej. en /login o en el panel de administracion, donde no hay barra).
    var POLL_MS = 60000;
    var LABEL = 'Mensajes del administrador';
    var BELL_PATH = 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z';

    var STYLE = [
        '.adminMessagesBadge{position:absolute;top:8px;right:0;transform:translate(35%,0);min-width:15px;height:15px;border-radius:8px;background:#cc3333;color:#fff;font-size:10px;line-height:1;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 3px;pointer-events:none;box-sizing:border-box;}',
        '.adminMessagesBadge.hide{display:none;}',
        '.adminMessagesPanel{position:fixed;width:22em;max-width:85vw;max-height:60vh;overflow-y:auto;background:#1c1c1c;border-radius:8px;padding:1em;box-shadow:0 4px 24px rgba(0,0,0,.5);z-index:9001;}',
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

    var debugOn = false;
    try { debugOn = window.localStorage.getItem('adminmessages.debug') === '1'; } catch (e) { debugOn = false; }
    var lastLogged = {};

    function log(point, strategy) {
        if (!debugOn || lastLogged[point] === strategy) {
            return;
        }
        lastLogged[point] = strategy;
        try { console.log('[AdminMessages] ' + point + ': ' + strategy); } catch (e) { /* noop */ }
    }

    function safe(name, fn) {
        try { return fn(); } catch (e) {
            if (debugOn) { try { console.log('[AdminMessages] ' + name + ' failed', e); } catch (e2) { /* noop */ } }
            return false;
        }
    }

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

    // Tambien escapa comillas: el resultado se usa dentro de atributos (href, data-id).
    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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

    var icon = null;
    var badge = null;
    var panel = null;
    var pollTimer = null;
    var currentMessages = [];

    // Comun a los dos layouts: posicion relativa (para el badge), marcador idempotente,
    // badge propio y el click que abre el panel. Lo especifico de cada icono (sustituir el
    // svg del moderno o el .material-icons del legacy) lo hace cada build* antes de llamar aqui.
    function finishIcon(el) {
        el.setAttribute('data-adminmessages', 'icon');
        el.setAttribute('title', LABEL);
        el.setAttribute('aria-label', LABEL);
        el.style.position = 'relative';

        badge = document.createElement('span');
        badge.className = 'adminMessagesBadge hide';
        badge.setAttribute('aria-hidden', 'true');
        el.appendChild(badge);

        el.addEventListener('click', function (evt) {
            evt.preventDefault();
            evt.stopPropagation();
            togglePanel();
        });
        return el;
    }

    // Layout moderno: MuiIconButton (<a>) con un <svg><path>. Elemento nuevo con las clases e
    // innerHTML del hermano (la lupa), igual que hace Watchlist con las entradas de menu: hereda
    // el aspecto nativo sin tocar el original.
    function buildIconModern(anchor) {
        var el = document.createElement(anchor.tagName);
        el.className = anchor.className;
        el.innerHTML = anchor.innerHTML;
        Array.prototype.forEach.call(el.querySelectorAll('[id]'), function (n) { n.removeAttribute('id'); });
        el.removeAttribute('href');
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');

        var svg = el.querySelector('svg');
        if (svg) {
            svg.removeAttribute('data-testid');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.innerHTML = '<path d="' + BELL_PATH + '"></path>';
        }

        finishIcon(el);
        el.addEventListener('keydown', function (evt) {
            if (evt.key === 'Enter' || evt.key === ' ') {
                evt.preventDefault();
                togglePanel();
            }
        });
        return el;
    }

    // Layout legacy/TV: <button class="headerButton ... headerSearchButton"> con un
    // <span class="material-icons search">, verificado en vivo (vm-titopc2, Modo de
    // visualizacion = Escritorio Heredado). Ya es un <button> enfocable, sin necesidad de
    // role/tabindex como en el moderno.
    // Probado en vivo en el layout legacy/TV (vm-titopc2, Modo de visualizacion = Escritorio
    // Heredado): el mismo anclaje a .headerSearchButton funciona, el icono se inserta bien...
    // y a los pocos segundos desaparece solo, sin ningun error ni mutacion que lo justifique
    // (comprobado con un MutationObserver propio sobre .headerRight). La barra legacy tiene su
    // propia logica de ancho/overflow que no reconoce nuestro boton y lo retira. Sin un hueco
    // mas fiable (Watchlist evita este mismo problema anclando a una pagina de ajustes, no a la
    // barra persistente), se deja sin icono en legacy/TV en vez de parpadear: coherente con "si
    // ninguna estrategia encaja, no se pinta nada".

    function ensureIconAt(anchor, builder, strategy) {
        if (!anchor || !anchor.parentNode) {
            return false;
        }
        var prev = anchor.previousElementSibling;
        if (prev && prev.getAttribute('data-adminmessages') === 'icon') {
            icon = prev;
            badge = icon.querySelector('.adminMessagesBadge');
            return true;
        }
        // Cualquier icono huerfano en el mismo padre (React reordeno, o el layout legacy
        // reconstruyo la barra al hacerle hueco al nuestro) se retira antes de reponer.
        Array.prototype.forEach.call(anchor.parentNode.querySelectorAll(':scope > [data-adminmessages="icon"]'), function (n) {
            n.parentNode.removeChild(n);
        });
        // La limpieza de arriba (o la reconstruccion que la provoco) puede haber desconectado el
        // propio anchor de su padre: se reintenta en el siguiente tick contra uno fresco en vez
        // de insertar sobre un nodo ya fuera del arbol.
        if (!anchor.parentNode) {
            return false;
        }
        icon = builder(anchor);
        anchor.parentNode.insertBefore(icon, anchor);
        log('icon', strategy);
        refresh();
        return true;
    }

    function ensureIcon() {
        return ensureIconAt(document.querySelector('a[href="#/search"]'), buildIconModern, 'modern-search-sibling');
    }

    function buildPanel() {
        panel = document.createElement('div');
        panel.className = 'adminMessagesPanel hide';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', LABEL);
        panel.innerHTML = '<h3>' + LABEL + '</h3><div class="adminMessagesList"></div>';
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
            if (!panel.classList.contains('hide') && !panel.contains(evt.target) && icon && evt.target !== icon && !icon.contains(evt.target)) {
                panel.classList.add('hide');
            }
        });
        window.addEventListener('resize', function () {
            if (!panel.classList.contains('hide')) {
                positionPanel();
            }
        });
    }

    // El panel cuelga del icono (como un menu nativo), no de una esquina fija de la pantalla.
    function positionPanel() {
        if (!icon || !panel) {
            return;
        }
        var r = icon.getBoundingClientRect();
        var width = panel.offsetWidth || 352;
        var left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
        var top = Math.min(r.bottom + 8, window.innerHeight - 8);
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
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
        if (!badge) {
            return;
        }
        var unread = currentMessages.filter(function (m) { return !m.IsRead; }).length;
        if (unread > 0) {
            badge.textContent = String(unread > 99 ? '99+' : unread);
            badge.classList.remove('hide');
        } else {
            badge.classList.add('hide');
        }
    }

    function closePanel() {
        if (panel) {
            panel.classList.add('hide');
        }
    }

    function togglePanel() {
        if (!panel) {
            return;
        }
        var opening = panel.classList.contains('hide');
        panel.classList.toggle('hide');
        if (opening) {
            positionPanel();
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
            if (panel && !panel.classList.contains('hide')) {
                renderPanel();
                positionPanel();
            }
        }).catch(function () {
            // Red inestable o endpoint no disponible todavia: se reintenta en el siguiente poll.
        });
    }

    var scheduled = false;

    function run() {
        scheduled = false;
        if (!panel) {
            safe('panel', buildPanel);
        }
        if (!isLoggedIn()) {
            closePanel();
            return;
        }
        var anchored = safe('icon', ensureIcon);
        if (!anchored) {
            // Sin barra de busqueda visible (login, panel de administracion...): nada que mostrar.
            closePanel();
        }
    }

    function scheduleRun() {
        if (scheduled) {
            return;
        }
        scheduled = true;
        window.requestAnimationFrame(run);
    }

    function init() {
        safe('style', injectStyle);
        var observer = new MutationObserver(scheduleRun);
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('hashchange', scheduleRun);
        scheduleRun();
        pollTimer = setInterval(function () {
            if (icon && isLoggedIn()) {
                refresh();
            }
        }, POLL_MS);
    }

    if (document.body) {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})();
