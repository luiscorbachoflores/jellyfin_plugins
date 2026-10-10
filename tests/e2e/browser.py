"""Playwright helpers: desktop/mobile contexts, ApiClient login, console/network error collection."""
import os
import re
import time

from playwright.sync_api import sync_playwright

from jfe2e import ADMIN, ADMIN_PW, USER, USER_PW

IPHONE_UA = ('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 '
             '(KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1')
PROFILES = {
    'desktop': dict(viewport={'width': 1400, 'height': 900}),
    'mobile': dict(viewport={'width': 390, 'height': 844}, user_agent=IPHONE_UA, is_mobile=True, has_touch=True,
                   device_scale_factor=2),
}
# Noise that is not ours (favicon, source maps, 404 of optional resources...). Anything else is reported.
# The websocket 403 right after ApiClient login is a Jellyfin 12.2 core race (socket opened before the session is stored).
IGNORE = [r"WebSocket connection to .* 403", r'favicon', r'manifest\.json', r'\.map\b', r'Failed to load resource.*(404|401)',
          r'Download the React DevTools', r'ServiceWorker', r'sw\.js']


class Session:
    """One browser page for a user/profile. `errors` collects console errors/warnings, page errors and failed requests."""

    def __init__(self, pw, inst, profile='desktop', user=USER, password=USER_PW, shots=None, tag=''):
        self.inst, self.shots, self.tag, self.profile = inst, shots, tag, profile
        self.browser = pw.chromium.launch()
        self.ctx = self.browser.new_context(**PROFILES[profile])
        self.page = self.ctx.new_page()
        self.errors, self.console_all = [], []
        self.page.on('console', self._console)
        self.page.on('pageerror', lambda e: self.errors.append('PAGEERROR ' + str(e)[:300]))
        self.page.on('response', self._response)
        self.user, self.password = user, password

    def _console(self, m):
        txt = '%s: %s' % (m.type, m.text[:300])
        self.console_all.append(txt)
        if m.type in ('error', 'warning') and not any(re.search(p, txt) for p in IGNORE):
            self.errors.append(txt)

    def _response(self, r):
        if r.status >= 400 and not any(re.search(p, r.url) for p in IGNORE):
            self.errors.append('HTTP %d %s %s' % (r.status, r.request.method, re.sub(r'(api_key|ApiKey)=[^&]+', r'\1=***', r.url)[:200]))

    def login(self):
        p = self.page
        p.goto(self.inst.base + '/web/')
        p.wait_for_function('() => window.ApiClient && typeof window.ApiClient.authenticateUserByName === "function"', timeout=90000)
        p.evaluate('([u, pw]) => window.ApiClient.authenticateUserByName(u, pw)', [self.user, self.password])
        p.evaluate("() => { location.hash = '#/home'; }")
        p.wait_for_selector('.homePage, #indexPage', state='attached', timeout=60000)
        self.settle(2500)
        return self

    def settle(self, ms=1500):
        self.page.wait_for_timeout(ms)

    def nav(self, hash_, wait=2500):
        self.page.evaluate('h => { location.hash = h; }', hash_)
        self.settle(wait)

    def shot(self, name):
        if not self.shots:
            return None
        os.makedirs(self.shots, exist_ok=True)
        path = os.path.join(self.shots, '%s%s-%s.png' % (self.tag + '-' if self.tag else '', name, self.profile))
        self.page.screenshot(path=path)
        return path

    def count(self, sel):
        return self.page.locator(sel).count()

    def visible(self, sel):
        return self.page.locator(sel + ':visible').count() > 0

    def js(self, expr, arg=None):
        return self.page.evaluate(expr, arg) if arg is not None else self.page.evaluate(expr)

    def click(self, sel):
        self.page.eval_on_selector(sel, 'el => el.click()')

    def close(self):
        # Close websockets one by one before the browser goes away (Jellyfin 12.2 core race, see jfe2e.call).
        try:
            self.page.evaluate("() => { try { window.ApiClient && window.ApiClient.closeWebSocket && window.ApiClient.closeWebSocket(); } catch (e) {} }")
            self.page.wait_for_timeout(600)
            self.page.goto('about:blank')
            self.page.wait_for_timeout(600)
        except Exception:
            pass
        self.browser.close()


def items(inst, user=USER, pw=USER_PW):
    """Stable keys -> (Id, Type): m1/m2/m3 movies, series, season1/2, ep1..ep4 (S01E01..), lib_movies, lib_shows."""
    tok, uid = inst.login(user, pw, 'items')
    st, res = inst.call('GET', '/Users/%s/Items?Recursive=true&IncludeItemTypes=Movie,Series,Season,Episode&Fields=Path' % uid, token=tok)
    out = {}
    for i in res['Items']:
        p = i.get('Path', '')
        t = i['Type']
        if t == 'Movie':
            out['m' + ('1' if 'Uno' in p else '2' if 'Dos' in p else '3')] = (i['Id'], t)
        elif t == 'Series':
            out['series'] = (i['Id'], t)
        elif t == 'Season':
            out['season' + p.rstrip('/')[-2:].lstrip('0')] = (i['Id'], t)
        elif t == 'Episode':
            import re as _re
            m = _re.search(r'S(\d\d)E(\d\d)', p)
            out['ep%d' % ((int(m.group(1)) - 1) * 2 + int(m.group(2)))] = (i['Id'], t)
    st, vf = inst.call('GET', '/Users/%s/Views' % uid, token=tok)
    for v in vf['Items']:
        out['lib_movies' if v['CollectionType'] == 'movies' else 'lib_shows'] = (v['Id'], v['Type'])
    return out
