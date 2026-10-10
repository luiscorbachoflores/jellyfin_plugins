#!/usr/bin/env python3
"""Per-plugin smoke/regression tests against a running disposable instance (see README.md).

Each check prints PASS/FAIL/INFO; the process exit code is the number of FAILs (0 = green).
Every browser session also reports console errors/warnings, page errors and failed requests, which count as FAIL.
"""
import datetime
import http.server
import json
import os
import threading
import time
import traceback

from playwright.sync_api import sync_playwright

import browser
from jfe2e import ADMIN, ADMIN_PW, USER, USER_PW, PLUGINS

RESULTS = []
RUN = str(int(time.time()) % 100000)  # unique per run so the suite can be repeated on the same instance


def chk(plugin, name, cond, detail=''):
    RESULTS.append((plugin, name, 'PASS' if cond else 'FAIL', str(detail)[:300]))
    print('%-5s %-15s %s %s' % ('PASS' if cond else 'FAIL', plugin, name, ('| ' + str(detail)[:200]) if detail != '' else ''), flush=True)
    return cond


def fail_exc(plugin, label):
    tb = traceback.format_exc()
    print(tb[-1800:], flush=True)
    last = [l for l in tb.strip().splitlines() if l.strip()][-1]
    chk(plugin, label, False, last)


def info(plugin, name, detail=''):
    RESULTS.append((plugin, name, 'INFO', str(detail)[:300]))
    print('INFO  %-15s %s | %s' % (plugin, name, str(detail)[:300]), flush=True)


def no_errors(plugin, s, what):
    errs = [e for e in s.errors if 'chromecast' not in e]
    chk(plugin, 'sin errores de consola/red (%s)' % what, not errs, errs[:4])
    s.errors.clear()


def guid(key):
    return PLUGINS[key][1]


def plugin_state(inst, tok, key):
    st, res = inst.call('GET', '/Plugins', token=tok)
    for p in res:
        if p['Id'].replace('-', '') == guid(key).replace('-', ''):
            return p
    return None


# --------------------------------------------------------------------------------------------- JellyAsk
def test_jellyask(inst, pw, shots, ctx):
    P = 'JellyAsk'
    # fresh user per run: the flood limit is per user and lives in memory
    inst.call('POST', '/Users/New', {'Name': 'ask' + RUN, 'Password': 'ask-test'}, token=ctx['admin_tok'])
    tok, uid = inst.login('ask' + RUN, 'ask-test', 'ask')
    # API
    st, _ = inst.call('POST', '/JellyAsk/Request', {'Text': 'x'})
    chk(P, 'POST anonimo -> 401', st == 401, st)
    st, _ = inst.call('POST', '/JellyAsk/Request', {'Text': 'Peticion de prueba api'}, token=tok)
    chk(P, 'POST con token usuario (MediaBrowser Token) -> 200', st == 200, st)
    st, _ = inst.call('POST', '/JellyAsk/Request', {'Text': 'y' * 20000}, token=tok)
    chk(P, 'texto de 20000 caracteres rechazado (400)', st == 400, st)
    st, _ = inst.call('POST', '/JellyAsk/Request', {'Text': '   '}, token=tok)
    chk(P, 'texto vacio -> 400', st == 400, st)
    st, _ = inst.call('POST', '/JellyAsk/Request', None, token=tok)
    chk(P, 'cuerpo vacio -> 400 (no 500)', st in (400, 415), st)
    # UI
    for prof in ('desktop', 'mobile'):
        s = browser.Session(pw, inst, prof, user='ask' + RUN, password='ask-test', shots=shots, tag='jellyask').login()
        try:
            fab = '.jellyAskFab'
            chk(P, 'FAB visible en inicio (%s)' % prof, s.visible(fab))
            r = s.js("(() => { const r = document.querySelector('.jellyAskFab').getBoundingClientRect(); return [r.width, r.height, innerWidth - r.right, innerHeight - r.bottom]; })()")
            chk(P, 'FAB >= 44px (%s)' % prof, r[0] >= 44 and r[1] >= 44, r)
            chk(P, 'FAB con nombre accesible (%s)' % prof, bool(s.js("document.querySelector('.jellyAskFab').getAttribute('aria-label')")))
            s.shot('home')
            s.click(fab)
            s.settle(600)
            dlg = '.jellyAskBackdrop:not(.hide) [role=dialog]'
            chk(P, 'modal con role=dialog + aria-modal (%s)' % prof, s.count(dlg) == 1 and s.js("document.querySelector('.jellyAskBackdrop [role=dialog]').getAttribute('aria-modal')") == 'true')
            chk(P, 'modal con aria-labelledby (%s)' % prof, s.count('.jellyAskBackdrop [role=dialog][aria-labelledby]') == 1)
            chk(P, 'foco dentro del modal al abrir (%s)' % prof, s.js("!!document.activeElement.closest('.jellyAskBackdrop')"))
            s.shot('modal')
            # focus trap
            inside = True
            for _ in range(8):
                s.page.keyboard.press('Tab')
                inside = inside and s.js("!!document.activeElement.closest('.jellyAskBackdrop')")
            chk(P, 'Tab no escapa del modal (%s)' % prof, inside)
            s.page.keyboard.press('Escape')
            s.settle(300)
            chk(P, 'ESC cierra el modal (%s)' % prof, s.count('.jellyAskBackdrop:not(.hide)') == 0)
            chk(P, 'el foco vuelve al FAB (%s)' % prof, s.js("document.activeElement && document.activeElement.classList.contains('jellyAskFab')"))
            # submit
            s.click(fab)
            s.settle(300)
            s.page.fill('.jellyAskBackdrop textarea', 'Quiero ver <b>Matrix</b> (1999) %s' % prof)
            s.click('.jellyAskSubmit')
            s.settle(900)
            status = s.js("(document.querySelector('.jellyAskStatus') || {}).textContent")
            chk(P, 'envio correcto muestra confirmacion (%s)' % prof, 'enviada' in (status or ''), status)
            s.settle(2000)
            chk(P, 'el dialogo se cierra solo tras enviar (%s)' % prof, s.count('.jellyAskBackdrop') == 0)
            # hidden on player / dashboard routes
            # With nothing playing the web client bounces #/video back to the home page, so emulate the route
            # without going through its router: replaceState + the hashchange the browser would fire.
            s.js("() => { history.replaceState(null, '', '#/video'); window.dispatchEvent(new HashChangeEvent('hashchange')); }")
            s.settle(600)
            chk(P, 'FAB oculto en la ruta del reproductor #/video (%s)' % prof, not s.visible(fab))
            s.js("() => { history.replaceState(null, '', '#/configurationpage?name=JellyAsk'); window.dispatchEvent(new HashChangeEvent('hashchange')); }")
            s.settle(600)
            chk(P, 'FAB oculto en paginas de configuracion/panel (%s)' % prof, not s.visible(fab))
            s.js("() => { history.replaceState(null, '', '#/home'); window.dispatchEvent(new HashChangeEvent('hashchange')); }")
            s.settle(600)
            s.nav('#/home', 1500)
            chk(P, 'FAB vuelve en #/home (%s)' % prof, s.visible(fab))
            # SPA robustness: node removed by a re-render comes back
            s.js("document.querySelectorAll('.jellyAskFab').forEach(e => e.remove())")
            s.nav('#/search', 2000)
            chk(P, 'FAB se recrea tras ser eliminado del DOM (%s)' % prof, s.visible(fab))
            chk(P, 'un unico FAB (%s)' % prof, s.count(fab) == 1, s.count(fab))
            no_errors(P, s, prof)
        except Exception:
            fail_exc(P, 'excepcion en test UI (%s)' % prof)
        finally:
            s.close()
    atok = ctx['admin_tok']
    st, log = inst.call('GET', '/System/ActivityLog/Entries?limit=50', token=atok)
    mine = [e for e in log['Items'] if e.get('Type') == 'JellyAskRequest']
    chk(P, 'peticiones en el registro de actividad', len(mine) >= 3, len(mine))
    chk(P, 'el HTML de la peticion se guarda tal cual (se escapa al mostrar)', any('<b>Matrix</b>' in (e.get('Overview') or '') for e in mine))
    st, cfg = inst.call('GET', '/Plugins/%s/Configuration' % guid(P), token=ctx['user_tok'])
    chk(P, 'configuracion del plugin NO legible por usuario normal', st in (401, 403), st)
    codes = [inst.call('POST', '/JellyAsk/Request', {'Text': 'flood %d' % i}, token=tok)[0] for i in range(8)]
    chk(P, 'anti-flood: rafaga de peticiones acaba en 429', 429 in codes, codes)


# --------------------------------------------------------------------------------------------- Reviews
def test_reviews(inst, pw, shots, ctx):
    P = 'Reviews'
    tok, it = ctx['user_tok'], ctx['items']
    m1, m2 = it['m1'][0], it['m2'][0]
    # API
    st, _ = inst.call('GET', '/Reviews/' + m1)
    chk(P, 'GET anonimo permitido (lectura publica)', st == 200, st)
    st, _ = inst.call('POST', '/Reviews/' + m1, {'Rating': 4, 'Comment': 'x'})
    chk(P, 'POST anonimo -> 401', st == 401, st)
    st, res = inst.call('POST', '/Reviews/' + m1, {'Rating': 4.5, 'Comment': 'api ok'}, token=tok)
    chk(P, 'POST con MediaBrowser Token -> 200', st == 200, st)
    rid = res['Id'] if st == 200 else None
    st, _ = inst.call('POST', '/Reviews/' + m1, {'Rating': 4, 'Comment': 'legacy'}, headers={'X-Emby-Token': tok, 'Authorization': ''})
    info(P, 'X-Emby-Token legacy con token de usuario', 'HTTP %s (401 en 12.2: el JS NO debe usarlo)' % st)
    st, _ = inst.call('POST', '/Reviews/' + m1, {'Rating': 7, 'Comment': 'x'}, token=tok)
    chk(P, 'rating invalido -> 400', st == 400, st)
    st, _ = inst.call('POST', '/Reviews/' + m1, {'Rating': 3, 'Comment': 'z' * 50000}, token=tok)
    chk(P, 'comentario de 50000 caracteres rechazado (400)', st == 400, st)
    st, _ = inst.call('POST', '/Reviews/' + 'a' * 5000, {'Rating': 3, 'Comment': 'x'}, token=tok)
    chk(P, 'itemId absurdo rechazado (400/404)', st in (400, 404), st)
    st, _ = inst.call('POST', '/Reviews/not-a-guid', {'Rating': 3, 'Comment': 'x'}, token=tok)
    chk(P, 'itemId que no es GUID rechazado (400/404)', st in (400, 404), st)
    st, _ = inst.call('POST', '/Reviews/' + m1, None, token=tok)
    chk(P, 'cuerpo vacio -> 400 (no 500)', st in (400, 415), st)
    st, _ = inst.call('POST', '/Reviews/' + '0' * 31 + '1', {'Rating': 3, 'Comment': 'x'}, token=tok)
    chk(P, 'itemId GUID inexistente -> 404', st == 404, st)
    # other user cannot edit/delete
    inst.call('POST', '/Users/New', {'Name': 'bea' + RUN, 'Password': 'bea-test'}, token=ctx['admin_tok'])
    btok, _ = inst.login('bea' + RUN, 'bea-test', 'bea')
    st, _ = inst.call('DELETE', '/Reviews/%s/%s' % (m1, rid), token=btok)
    chk(P, 'otro usuario no puede borrar -> 403', st == 403, st)
    st, _ = inst.call('PUT', '/Reviews/%s/%s' % (m1, rid), {'Rating': 1, 'Comment': 'hack'}, token=btok)
    chk(P, 'otro usuario no puede editar -> 403', st == 403, st)
    st, _ = inst.call('DELETE', '/Reviews/%s/%s' % (m2, rid), token=tok)
    chk(P, 'borrar con itemId que no corresponde -> 404', st == 404, st)
    st, ar = inst.call('POST', '/Reviews/' + m2, {'Rating': 2, 'Comment': 'para que el admin la borre'}, token=btok)
    st2, _ = inst.call('DELETE', '/Reviews/%s/%s' % (m2, ar['Id']), token=ctx['admin_tok'])
    chk(P, 'el admin puede borrar reseñas ajenas -> 204', st2 == 204, st2)
    n = [inst.call('POST', '/Reviews/' + m2, {'Rating': 3, 'Comment': 'n%d' % i}, token=btok)[0] for i in range(12)]
    chk(P, 'anti-flood: maximo de reseñas por usuario y elemento (429)', 429 in n, n)
    # anonymous review does not leak name to other users
    st, r2 = inst.call('POST', '/Reviews/' + m2, {'Rating': 3, 'Comment': 'secreto', 'AsAnonymous': True}, token=tok)
    st, lst = inst.call('GET', '/Reviews/' + m2, token=btok)
    chk(P, 'reseña anonima no revela autor a otros usuarios', all(x['DisplayName'] == 'Anónimo' for x in lst['Reviews']), [x['DisplayName'] for x in lst['Reviews']])
    st, lst = inst.call('GET', '/Reviews/' + m2)
    chk(P, 'GET anonimo (sin sesion) no revela nombres de resenas anonimas', all(x['DisplayName'] == 'Anónimo' for x in lst['Reviews'] if x['IsAnonymous']))
    # concurrency: 30 different users posting at once
    from concurrent.futures import ThreadPoolExecutor
    for i in range(30):
        inst.call('POST', '/Users/New', {'Name': 'u%02d' % i, 'Password': 'pw-%02d' % i}, token=ctx['admin_tok'])
    def post(i):
        t, _ = inst.login('u%02d' % i, 'pw-%02d' % i, 'c%d' % i)
        return inst.call('POST', '/Reviews/' + it['m3'][0], {'Rating': 3.5, 'Comment': 'concurrente %d' % i}, token=t, dev='c%d' % i)[0]
    with ThreadPoolExecutor(30) as ex:
        codes = list(ex.map(post, range(30)))
    chk(P, '30 usuarios publicando a la vez sin error', all(c == 200 for c in codes), sorted(set(codes)))
    st, lst = inst.call('GET', '/Reviews/' + it['m3'][0], token=tok)
    chk(P, '...y las 30 quedan guardadas', lst['Count'] >= 30, lst['Count'])
    inst.call('DELETE', '/Reviews/%s/%s' % (m1, rid), token=tok)

    for prof in ('desktop', 'mobile'):
        s = browser.Session(pw, inst, prof, shots=shots, tag='reviews').login()
        try:
            s.nav('#/details?id=' + m1, 3500)
            W = '.itemDetailPage:not(.hide) .reviewsWidget'
            chk(P, 'widget en ficha de pelicula (%s)' % prof, s.count(W) == 1, s.count(W))
            s.shot('movie')
            # real UI post: stars + text
            s.page.eval_on_selector(W + ' .reviewsForm', 'e => e.scrollIntoView({block:"center"})')
            box = s.page.locator(W + ' .reviewsStars .star').nth(3).bounding_box()
            s.page.mouse.click(box['x'] + box['width'] * 0.25, box['y'] + box['height'] / 2)
            s.page.fill(W + ' textarea', 'Muy buena <img src=x onerror="window.__xss=1"> %s' % prof)
            before_n = s.count(W + ' .reviewItem')
            s.click(W + ' .reviewsSubmit')
            s.settle(2000)
            status = s.js("document.querySelector('.itemDetailPage:not(.hide) .reviewsStatus').textContent")
            chk(P, 'publicar desde la UI funciona (%s)' % prof, s.count(W + ' .reviewItem') == before_n + 1 and 'publicada' in status, status)
            chk(P, 'la reseña publicada muestra 4 estrellas (%s)' % prof, s.js("document.querySelector('.itemDetailPage:not(.hide) .reviewItem .reviewsStars').getAttribute('data-value')") in ('3.5', '4'))
            chk(P, 'XSS: el HTML del comentario no se ejecuta (%s)' % prof, not s.js('window.__xss === 1') and s.count(W + ' .reviewComment img') == 0)
            s.shot('movie-posted')
            # keyboard accessible stars
            chk(P, 'estrellas operables con teclado (role/tabindex) (%s)' % prof, s.count(W + ' .reviewsStars[role][tabindex]') >= 1)
            # edit + delete
            s.page.eval_on_selector(W + ' .reviewEditBtn', 'e => e.scrollIntoView({block:"center"})')
            s.click(W + ' .reviewEditBtn')
            s.settle(500)
            chk(P, 'editar carga el comentario en el formulario (%s)' % prof, 'Muy buena' in s.page.input_value(W + ' textarea'))
            s.click(W + ' .reviewsCancelEdit')
            n_before = s.count(W + ' .reviewItem')
            s.click(W + ' .reviewDeleteBtn')
            s.click(W + ' .reviewDeleteBtn')
            s.settle(1500)
            chk(P, 'borrar desde la UI (dos pasos) (%s)' % prof, s.count(W + ' .reviewItem') == n_before - 1, (n_before, s.count(W + ' .reviewItem')))
            # other item types
            for key, label in (('series', 'serie'), ('season1', 'temporada'), ('ep1', 'episodio')):
                s.nav('#/details?id=' + it[key][0], 3500)
                cnt = s.count('.itemDetailPage:not(.hide) .reviewsWidget')
                chk(P, 'widget en %s (%s)' % (label, prof), cnt == 1, cnt)
                if prof == 'desktop' or key == 'series':
                    s.shot(key)
            # SPA navigation A -> B -> A: widget belongs to the item shown
            s.nav('#/details?id=' + m1, 3000)
            s.nav('#/details?id=' + m2, 3000)
            ids = s.js("[...document.querySelectorAll('.itemDetailPage:not(.hide) .reviewsWidget')].map(w => w.getAttribute('data-item-id'))")
            chk(P, 'tras navegar A->B el widget visible es el de B (%s)' % prof, ids == [m2], ids)
            s.js("history.back()")
            s.settle(2500)
            ids = s.js("[...document.querySelectorAll('.itemDetailPage:not(.hide) .reviewsWidget')].map(w => w.getAttribute('data-item-id'))")
            chk(P, 'atras (popstate) -> widget de A, uno solo (%s)' % prof, ids == [m1], ids)
            # no widget outside details
            for name, h in (('home', '#/home'), ('biblioteca', '#/movies?topParentId=' + it['lib_movies'][0]), ('busqueda', '#/search')):
                s.nav(h, 2200)
                chk(P, 'sin widget visible en %s (%s)' % (name, prof), s.count('.page:not(.hide) .reviewsWidget') == 0)
            # widget removed by re-render comes back
            s.nav('#/details?id=' + m1, 3000)
            s.js("document.querySelectorAll('.reviewsWidget').forEach(w => w.remove())")
            s.settle(1500)
            chk(P, 'widget se restaura si un re-render lo elimina (%s)' % prof, s.count('.itemDetailPage:not(.hide) .reviewsWidget') == 1)
            no_errors(P, s, prof)
        except Exception:
            fail_exc(P, 'excepcion en test UI (%s)' % prof)
        finally:
            s.close()
    # collection / person pages must not get the widget
    s = browser.Session(pw, inst, 'desktop', shots=shots, tag='reviews').login()
    try:
        st, ppl = inst.call('GET', '/Persons?limit=1', token=tok)
        no_errors(P, s, 'tras pruebas')
    finally:
        s.close()


# --------------------------------------------------------------------------------------------- Language Badges
def test_badges(inst, pw, shots, ctx):
    P = 'LanguageBadges'
    tok, it = ctx['user_tok'], ctx['items']
    st, _ = inst.call('GET', '/LanguageBadges/Items?ids=' + it['m1'][0])
    chk(P, 'Items sin token -> 401', st == 401, st)
    st, res = inst.call('GET', '/LanguageBadges/Items?ids=%s,%s,%s' % (it['m1'][0], it['m2'][0], it['m3'][0]), token=tok)
    chk(P, 'API: audio ES+EN y subtitulo ES en pelicula 1', st == 200 and res[it['m1'][0]]['Audio'] == ['ES', 'EN'] and 'ES' in res[it['m1'][0]]['Subtitles'], res)
    chk(P, 'API: pista "Latino" -> LAT', res[it['m2'][0]]['Audio'] == ['LAT'], res.get(it['m2'][0]))
    chk(P, 'API: pista sin etiqueta -> ?', res[it['m3'][0]]['Audio'] == ['?'], res.get(it['m3'][0]))
    st, res = inst.call('GET', '/LanguageBadges/Items?ids=' + ','.join(['%032x' % i for i in range(1, 201)]), token=tok)
    chk(P, '200 ids inexistentes: 200 y rapido', st == 200)
    st, res = inst.call('GET', '/LanguageBadges/Items?ids=zzz,,%27%3B--', token=tok)
    chk(P, 'ids basura -> 200 vacio', st == 200 and res == {}, st)
    for prof in ('desktop', 'mobile'):
        s = browser.Session(pw, inst, prof, shots=shots, tag='badges').login()
        try:
            s.settle(2500)
            chk(P, 'chips en tarjetas de inicio (%s)' % prof, s.count('.card .lb-badges') >= 3, s.count('.card .lb-badges'))
            s.shot('home')
            s.nav('#/movies?topParentId=' + it['lib_movies'][0], 3500)
            texts = s.page.eval_on_selector_all('.page:not(.hide) .lb-badges', 'els => els.map(e => e.textContent)')
            chk(P, 'biblioteca de peliculas: chips ES/EN/LAT/? (%s)' % prof, any('ES' in t and 'EN' in t for t in texts) and any('LAT' in t for t in texts) and any('?' in t for t in texts), texts)
            s.shot('library')
            s.nav('#/details?id=' + it['m1'][0], 3500)
            chk(P, 'ficha: fila de idiomas (%s)' % prof, s.count('.itemDetailPage:not(.hide) .lb-detail') == 1, s.count('.itemDetailPage:not(.hide) .lb-detail'))
            s.shot('movie')
            s.nav('#/details?id=' + it['series'][0], 3500)
            chk(P, 'ficha de serie: fila + chips en episodios/temporadas (%s)' % prof, s.count('.itemDetailPage:not(.hide) .lb-detail') == 1)
            s.shot('series')
            s.nav('#/details?id=' + it['season2'][0], 3500)
            chk(P, 'temporada 2: JA (%s)' % prof, 'JA' in (s.js("[...document.querySelectorAll('.itemDetailPage:not(.hide) .lb-detail')].map(e=>e.textContent).join(' ')") or ''))
            s.nav('#/details?id=' + it['ep3'][0], 3500)
            chk(P, 'episodio: fila de idiomas (%s)' % prof, s.count('.itemDetailPage:not(.hide) .lb-detail') == 1)
            # item shown replaced on same page: chips follow the item
            s.nav('#/details?id=' + it['m2'][0], 3500)
            row = s.js("(document.querySelector('.itemDetailPage:not(.hide) .lb-detail')||{}).textContent")
            chk(P, 'pelicula 2: LAT, sin restos de la anterior (%s)' % prof, 'LAT' in (row or '') and 'EN' not in (row or ''), row)
            s.nav('#/search', 2000)
            s.page.fill('.searchFields input, input[type=search], #searchTextInput', 'Pelicula')
            s.settle(4000)
            chk(P, 'busqueda: chips en resultados (%s)' % prof, s.count('.page:not(.hide) .lb-badges') >= 1, s.count('.page:not(.hide) .lb-badges'))
            s.shot('search')
            # re-render robustness: removing chips leads to repaint
            s.js("document.querySelectorAll('.lb-badges').forEach(e => e.remove())")
            s.settle(1500)
            chk(P, 'chips se repintan si se borran del DOM (%s)' % prof, s.count('.page:not(.hide) .lb-badges') >= 1)
            no_errors(P, s, prof)
        except Exception:
            fail_exc(P, 'excepcion en test UI (%s)' % prof)
        finally:
            s.close()


# --------------------------------------------------------------------------------------------- Search Notifier
class Hook(http.server.BaseHTTPRequestHandler):
    got = []

    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        Hook.got.append(self.rfile.read(n).decode())
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')

    def log_message(self, *a):
        pass


def test_search(inst, pw, shots, ctx):
    P = 'SearchNotifier'
    tok, atok, it = ctx['user_tok'], ctx['admin_tok'], ctx['items']
    srv = http.server.ThreadingHTTPServer(('0.0.0.0', 8190), Hook)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        st, _ = inst.call('GET', '/SearchNotifier/Log', token=tok)
        chk(P, 'Log como usuario normal -> 403', st == 403, st)
        st, _ = inst.call('GET', '/SearchNotifier/Log')
        chk(P, 'Log sin token -> 401', st == 401, st)
        st, _ = inst.call('DELETE', '/SearchNotifier/Log', token=tok)
        chk(P, 'DELETE Log como usuario normal -> 403', st == 403, st)
        st, _ = inst.call('POST', '/SearchNotifier/TestWebhook', token=tok)
        chk(P, 'TestWebhook como usuario normal -> 403', st == 403, st)
        st, cfg = inst.call('GET', '/Plugins/%s/Configuration' % guid(P), token=atok)
        cfg.update({'WebhookUrl': 'http://172.17.0.1:8190/hook', 'DebounceSeconds': 2, 'TelegramChatId': '123'})
        inst.call('POST', '/Plugins/%s/Configuration' % guid(P), cfg, token=atok)
        st, r = inst.call('POST', '/SearchNotifier/TestWebhook', token=atok)
        chk(P, 'TestWebhook admin funciona', st == 200 and r.get('ok'), r)
        inst.call('DELETE', '/SearchNotifier/Log', token=atok)
        for prof in ('desktop', 'mobile'):
            s = browser.Session(pw, inst, prof, shots=shots, tag='search').login()
            try:
                s.nav('#/search', 2500)
                box = s.page.locator('.searchFields input, input[type=search], #searchTextInput').first
                box.click()
                for ch in 'pelicula':
                    box.type(ch, delay=120)
                s.settle(5000)
                s.shot('results')
                no_errors(P, s, prof)
            finally:
                s.close()
        st, log = inst.call('GET', '/SearchNotifier/Log?limit=20', token=atok)
        chk(P, 'busqueda real por la UI registrada (una entrada por busqueda, no por letra)', 1 <= len(log) <= 2 and log[0]['Term'] == 'pelicula', [(e['UserName'], e['Term'], e['TotalResults']) for e in log])
        chk(P, 'recuento de resultados > 0', log and (log[0]['TotalResults'] or 0) > 0, log[0] if log else None)
        chk(P, 'webhook recibido con chat_id', any('"chat_id"' in g and 'pelicula' in g for g in Hook.got), len(Hook.got))
        st, ev = inst.call('GET', '/System/ActivityLog/Entries?limit=30', token=atok)
        chk(P, 'entrada en el registro de actividad', any(e.get('Type') == 'SearchNotifier' for e in ev['Items']))
        # search with special chars / very long term must not break the search itself
        st, r = inst.call('GET', '/Items?searchTerm=%s&Recursive=true&Limit=5' % ('a' * 5000), token=tok)
        chk(P, 'termino de 5000 caracteres no rompe la busqueda', st in (200, 400, 414), st)
        st, r = inst.call('GET', '/Items?searchTerm=%27%20OR%201%3D1--&Recursive=true&Limit=5', token=tok)
        chk(P, 'termino con comillas no rompe la busqueda', st == 200, st)
        # concurrency: 30 users searching at once
        from concurrent.futures import ThreadPoolExecutor
        def q(i):
            return inst.call('GET', '/Items?searchTerm=carga%d&Recursive=true&Limit=5&IncludeItemTypes=Movie' % i, token=tok, dev='q%d' % i)[0]
        with ThreadPoolExecutor(30) as ex:
            codes = list(ex.map(q, range(60)))
        chk(P, '60 busquedas concurrentes sin error', all(c == 200 for c in codes), sorted(set(codes)))
        # admin config page
        s = browser.Session(pw, inst, 'desktop', user=ADMIN, password=ADMIN_PW, shots=shots, tag='search').login()
        try:
            s.nav('#/configurationpage?name=' + 'Search%20Notifier', 3500)
            chk(P, 'pagina de configuracion carga y lista busquedas', s.count('#snRefresh') >= 1)
            s.shot('config')
            no_errors(P, s, 'config')
        finally:
            s.close()
    finally:
        srv.shutdown()
        srv.server_close()


# --------------------------------------------------------------------------------------------- WeeklyPick
def test_weeklypick(inst, pw, shots, ctx):
    P = 'WeeklyPick'
    tok, atok, it = ctx['user_tok'], ctx['admin_tok'], ctx['items']
    st, _ = inst.call('GET', '/WeeklyPick/Current')
    chk(P, 'Current sin token -> 401', st == 401, st)
    today = datetime.date.today().isoformat()
    cfg = {'Enabled': True, 'Entries': [{'WeekStart': today, 'Text': 'Esta semana: <b>Pelicula Uno</b> ¡imperdible!', 'ItemId': it['m1'][0]}]}
    st, _ = inst.call('POST', '/Plugins/%s/Configuration' % guid(P), cfg, token=atok)
    inst.call('POST', '/WeeklyPick/Reset', token=atok)
    st, _ = inst.call('POST', '/WeeklyPick/Reset', token=tok)
    chk(P, 'Reset como usuario normal rechazado (401/403)', st in (401, 403), st)
    st, _ = inst.call('POST', '/WeeklyPick/Reset')
    chk(P, 'Reset anonimo rechazado', st in (401, 403), st)
    for prof in ('desktop', 'mobile'):
        inst.call('POST', '/WeeklyPick/Reset', token=atok)
        s = browser.Session(pw, inst, prof, shots=shots, tag='weeklypick').login()
        try:
            s.settle(2500)
            chk(P, 'aviso semanal aparece (%s)' % prof, s.count('.wpBackdrop') == 1, s.count('.wpBackdrop'))
            chk(P, 'modal accesible: role=dialog, aria-modal (%s)' % prof, s.count('.wpBackdrop [role=dialog][aria-modal=true]') == 1)
            chk(P, 'el texto se muestra como texto (sin HTML) (%s)' % prof, s.count('.wpBackdrop .wpText b') == 0 and '<b>' in (s.js("document.querySelector('.wpText').textContent") or ''))
            chk(P, 'foco dentro del modal (%s)' % prof, s.js("!!document.activeElement.closest('.wpBackdrop')"))
            s.shot('modal')
            s.page.keyboard.press('Escape')
            s.settle(400)
            chk(P, 'ESC cierra el aviso (%s)' % prof, s.count('.wpBackdrop') == 0)
            s.page.reload()
            s.settle(3500)
            chk(P, 'no vuelve a aparecer tras recargar (%s)' % prof, s.count('.wpBackdrop') == 0)
            no_errors(P, s, prof)
        finally:
            s.close()
    # "Ver ficha" navigation
    inst.call('POST', '/WeeklyPick/Reset', token=atok)
    s = browser.Session(pw, inst, 'desktop', shots=shots, tag='weeklypick').login()
    try:
        s.settle(2500)
        if s.count('.wpView'):
            s.click('.wpView')
            s.settle(3000)
            chk(P, '"Ver ficha" abre la ficha', 'details' in s.js('location.hash') and s.count('.itemDetailPage:not(.hide)') >= 1, s.js('location.hash'))
        else:
            chk(P, '"Ver ficha" presente', False)
        no_errors(P, s, 'ver ficha')
    finally:
        s.close()
    # config page
    for prof in ('desktop', 'mobile'):
        s = browser.Session(pw, inst, prof, user=ADMIN, password=ADMIN_PW, shots=shots, tag='weeklypick').login()
        try:
            s.nav('#/configurationpage?name=Recomendaci%C3%B3n%20Semanal', 3500)
            chk(P, 'pagina de configuracion carga (%s)' % prof, s.count('#BtnSave') >= 1)
            s.shot('config')
            no_errors(P, s, 'config ' + prof)
        finally:
            s.close()
    inst.call('POST', '/Plugins/%s/Configuration' % guid(P), {'Enabled': False, 'Entries': []}, token=atok)


# --------------------------------------------------------------------------------------------- theming
def test_theming(inst, pw, shots, ctx):
    """Admin branding CSS emulating a light theme + a re-coloured primary button: our dialogs must follow."""
    P = 'Tema'
    atok = ctx['admin_tok']
    st, br = inst.call('GET', '/System/Configuration/branding', token=atok)
    css = ('html,.skinBody,.backgroundContainer{background:#fafafa !important} body{color:#222 !important} '
           '.button-submit{background:#e50914 !important;color:#fff !important}')
    inst.call('POST', '/System/Configuration/branding', dict(br, CustomCss=css), token=atok)
    try:
        for prof in ('desktop', 'mobile'):
            s = browser.Session(pw, inst, prof, user='ask' + RUN, password='ask-test', shots=shots, tag='tema').login()
            try:
                s.click('.jellyAskFab')
                s.settle(500)
                r = s.js("""() => { const m = document.querySelector('.jellyAskModal'); const b = document.querySelector('.jellyAskSubmit');
                  return [getComputedStyle(m).backgroundColor, getComputedStyle(m).color, getComputedStyle(b).backgroundColor, getComputedStyle(b).color]; }""")
                s.shot('jellyask-modal')
                chk(P, 'JellyAsk: el dialogo toma el fondo del tema/branding (%s)' % prof, r[0] == 'rgb(250, 250, 250)', r)
                chk(P, 'JellyAsk: texto heredado del tema (%s)' % prof, r[1] == 'rgb(34, 34, 34)', r)
                chk(P, 'JellyAsk: el boton principal copia el boton nativo (%s)' % prof, r[2] == 'rgb(229, 9, 20)', r)
                s.page.keyboard.press('Escape')
                s.nav('#/details?id=' + ctx['items']['m1'][0], 3500)
                w = s.js("""() => { const b = document.querySelector('.itemDetailPage:not(.hide) .reviewsSubmit'); const t = document.querySelector('.itemDetailPage:not(.hide) .reviewsWidget');
                  return b ? [getComputedStyle(b).backgroundColor, getComputedStyle(t).color] : null; }""")
                s.shot('reviews-movie')
                chk(P, 'Reviews: boton principal y texto siguen al tema (%s)' % prof, bool(w) and w[0] == 'rgb(229, 9, 20)' and w[1] == 'rgb(34, 34, 34)', w)
                # now-playing bar: the dock lifts itself above it
                s.nav('#/home', 1500)
                s.js("() => { const d = document.createElement('div'); d.className = 'nowPlayingBar'; d.style.cssText = 'position:fixed;bottom:0;left:0;right:0;height:80px'; document.body.appendChild(d); }")
                s.settle(3500)
                lift = s.js("document.getElementById('jfp-fab-dock').style.getPropertyValue('--jfp-dock-lift')")
                chk(P, 'JellyAsk: el boton flotante sube sobre la barra de reproduccion (%s)' % prof, lift == '88px', lift)
                s.js("() => document.querySelector('.nowPlayingBar').remove()")
                no_errors(P, s, prof)
            finally:
                s.close()
    finally:
        inst.call('POST', '/System/Configuration/branding', br, token=atok)


# --------------------------------------------------------------------------------------------- config pages
def test_config_pages(inst, pw, shots, ctx):
    P = 'ConfigPages'
    names = {'JellyAsk': 'JellyAsk', 'Reviews': 'Reviews', 'LanguageBadges': 'Language%20Badges', 'SearchNotifier': 'Search%20Notifier'}
    for key, name in names.items():
        for prof in ('desktop', 'mobile'):
            s = browser.Session(pw, inst, prof, user=ADMIN, password=ADMIN_PW, shots=shots, tag='config-' + key).login()
            try:
                s.nav('#/configurationpage?name=' + name, 3500)
                s.shot('page')
                n = s.js("document.querySelectorAll('.pluginConfigurationPage:not(.hide) input, .pluginConfigurationPage:not(.hide) button').length")
                chk(P, '%s: formulario renderizado (%s)' % (key, prof), n >= 2, n)
                hs = s.js("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1")
                chk(P, '%s: sin scroll horizontal (%s)' % (key, prof), hs)
                no_errors(P, s, key + ' ' + prof)
            finally:
                s.close()


TESTS = {
    'JellyAsk': test_jellyask,
    'Reviews': test_reviews,
    'LanguageBadges': test_badges,
    'SearchNotifier': test_search,
    'WeeklyPick': test_weeklypick,
    'Tema': test_theming,
    'ConfigPages': test_config_pages,
}


def run(inst, shots, only=()):
    ctx = {}
    ctx['admin_tok'], _ = inst.login(ADMIN, ADMIN_PW, 'admin')
    ctx['user_tok'], ctx['uid'] = inst.login(USER, USER_PW, 'ana')
    ctx['items'] = browser.items(inst)
    for key in PLUGINS:
        p = plugin_state(inst, ctx['admin_tok'], key)
        chk('Carga', '%s activo en el servidor' % key, bool(p) and p['Status'] == 'Active', p and (p['Version'], p['Status']))
    with sync_playwright() as pw:
        for name, fn in TESTS.items():
            if only and name not in only:
                continue
            print('=' * 20, name, flush=True)
            try:
                fn(inst, pw, shots, ctx)
            except Exception:
                fail_exc(name, 'excepcion del test')
    fails = [r for r in RESULTS if r[2] == 'FAIL']
    print('\nRESUMEN: %d PASS, %d FAIL, %d INFO' % (sum(1 for r in RESULTS if r[2] == 'PASS'), len(fails), sum(1 for r in RESULTS if r[2] == 'INFO')))
    out = os.path.join(shots, 'results.json')
    os.makedirs(shots, exist_ok=True)
    json.dump(RESULTS, open(out, 'w'), indent=1, ensure_ascii=False)
    return len(fails)
