#!/usr/bin/env python3
"""Real UI search as a normal user + admin config page screenshot + captured webhook payloads.
   JF_ADMIN=admin JF_ADMIN_PW=admin python3 search_demo.py http://localhost:8096 /tmp/shots"""
import http.server
import json
import os
import sys
import threading

from playwright.sync_api import sync_playwright

import setup_and_test as t

BASE, OUT = sys.argv[1].rstrip('/'), sys.argv[2]
os.makedirs(OUT, exist_ok=True)
PID = '8927bd8c-5eeb-4745-90c4-edb2ebd236cc'
received = []


class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        received.append(json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0)))))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{}')

    def log_message(self, *a):
        pass


threading.Thread(target=http.server.HTTPServer(('0.0.0.0', 9099), H).serve_forever, daemon=True).start()
admin, _ = t.login(t.ADMIN, t.ADMIN_PW, 'admin')
_, cfg = t.call('GET', '/Plugins/%s/Configuration' % PID, token=admin)
orig = dict(cfg)
cfg.update({'WebhookUrl': 'http://172.17.0.1:9099/hook', 'DebounceSeconds': 2, 'NotifyOnlyNoResults': False})
t.call('POST', '/Plugins/%s/Configuration' % PID, cfg, token=admin)


def login(pg, user, pw):
    pg.goto(BASE + '/web/#/login')
    pg.wait_for_selector('#txtManualName:visible', timeout=90000)
    pg.fill('#txtManualName', user)
    pg.fill('#txtManualPassword', pw)
    pg.click('button.button-submit')
    pg.wait_for_timeout(5000)


def nav(pg, h):
    pg.evaluate('h => { location.hash = h; }', h)


def search(pg, term):
    nav(pg, '#/search')
    pg.wait_for_timeout(2500)
    box = pg.locator('input[type="search"], .searchfields-txtSearch').first
    box.fill('')
    for ch in term:
        box.type(ch)
        pg.wait_for_timeout(200)
    pg.wait_for_timeout(5000)


try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ana = b.new_page(viewport={'width': 1200, 'height': 800})
        login(ana, 'ana', 'ana-test')
        search(ana, 'el padrino')
        ana.screenshot(path=OUT + '/5-ana-busca-sin-resultados.png')
        search(ana, 'matrix')
        ana.screenshot(path=OUT + '/6-ana-busca-matrix.png')
        adm = b.new_page(viewport={'width': 1200, 'height': 1300})
        login(adm, 'admin', 'admin')
        nav(adm, '#/configurationpage?name=Search%20Notifier')
        adm.wait_for_timeout(6000)
        adm.screenshot(path=OUT + '/7-config-searchnotifier.png', full_page=True)
        b.close()
finally:
    t.call('POST', '/Plugins/%s/Configuration' % PID, orig, token=admin)
json.dump(received, open(OUT + '/payloads.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps(received, ensure_ascii=False, indent=1))
