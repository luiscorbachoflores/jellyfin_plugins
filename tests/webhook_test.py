#!/usr/bin/env python3
"""Starts a local webhook receiver, points Search Notifier at it, performs a search and prints what arrived.
   python3 webhook_test.py http://localhost:8097 http://172.17.0.1:9099/hook"""
import http.server
import json
import sys
import threading
import time
import urllib.parse

sys.argv = [sys.argv[0], sys.argv[1]] + sys.argv[2:]
import setup_and_test as t  # reuses call()/login()

HOOK = sys.argv[2]
received = []


class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        received.append(json.loads(body))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def log_message(self, *a):
        pass


srv = http.server.HTTPServer(('0.0.0.0', int(urllib.parse.urlparse(HOOK).port)), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

admin, _ = t.login(t.ADMIN, t.ADMIN_PW, 'admin')
ana, ana_id = t.login('ana', 'ana-test', 'ana')
pid = '8927bd8c-5eeb-4745-90c4-edb2ebd236cc'
st, cfg = t.call('GET', '/Plugins/%s/Configuration' % pid, token=admin)
cfg.update({'WebhookUrl': HOOK, 'TelegramChatId': '123456', 'DebounceSeconds': 2})
print('save config', t.call('POST', '/Plugins/%s/Configuration' % pid, cfg, token=admin)[0])
print('test button', t.call('POST', '/SearchNotifier/TestWebhook', token=admin))
t.call('GET', '/Items?userId=%s&searchTerm=avatar&IncludeItemTypes=Movie&Recursive=true' % ana_id, token=ana)
time.sleep(4)
for r in received:
    print(json.dumps(r, ensure_ascii=False))
cfg.update({'WebhookUrl': '', 'TelegramChatId': '', 'DebounceSeconds': 4})
t.call('POST', '/Plugins/%s/Configuration' % pid, cfg, token=admin)
