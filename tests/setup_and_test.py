#!/usr/bin/env python3
"""
Functional test for Language Badges + Search Notifier against a THROWAWAY Jellyfin instance.

  python3 setup_and_test.py http://localhost:8097 [--setup]

--setup runs the first-start wizard if still pending (admin JF_ADMIN/JF_ADMIN_PW, default "jfadmin"/"jfadmin-test"),
creates the Movies + Shows libraries (/media/Movies, /media/Shows) if there are none, a normal user "ana"/"ana-test",
and waits for the scan. Never point --setup at a real server.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = sys.argv[1].rstrip('/')
SETUP = '--setup' in sys.argv
ADMIN = os.environ.get('JF_ADMIN', 'jfadmin')
ADMIN_PW = os.environ.get('JF_ADMIN_PW', 'jfadmin-test')
AUTH_BASE = 'MediaBrowser Client="plugin-test", Device="cli", DeviceId="plugin-test-{}", Version="1.0"'


def call(method, path, body=None, token=None, dev='x', raw=False):
    hdr = AUTH_BASE.format(dev) + (', Token="%s"' % token if token else '')
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={'Authorization': hdr, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            txt = r.read().decode()
            return r.status, (txt if raw else (json.loads(txt) if txt.strip() else None))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def login(user, pw, dev):
    st, res = call('POST', '/Users/AuthenticateByName', {'Username': user, 'Pw': pw}, dev=dev)
    assert st == 200, (st, res)
    return res['AccessToken'], res['User']['Id']


def setup():
    if not call('GET', '/System/Info/Public')[1].get('StartupWizardCompleted'):
        call('POST', '/Startup/Configuration', {'UICulture': 'es', 'MetadataCountryCode': 'ES', 'PreferredMetadataLanguage': 'es'})
        call('GET', '/Startup/User')
        call('POST', '/Startup/User', {'Name': ADMIN, 'Password': ADMIN_PW})
        call('POST', '/Startup/RemoteAccess', {'EnableRemoteAccess': True, 'EnableAutomaticPortMapping': False})
        print('wizard complete:', call('POST', '/Startup/Complete')[0])
    tok, _ = login(ADMIN, ADMIN_PW, 'admin')
    if not call('GET', '/Library/VirtualFolders', token=tok)[1]:
        for name, ctype, path in (('Movies', 'movies', '/media/Movies'), ('Shows', 'tvshows', '/media/Shows')):
            q = urllib.parse.urlencode({'name': name, 'collectionType': ctype, 'paths': path, 'refreshLibrary': 'true'})
            print('library', name, call('POST', '/Library/VirtualFolders?' + q, {'LibraryOptions': {}}, token=tok)[0])
    if not any(u['Name'] == 'ana' for u in call('GET', '/Users', token=tok)[1]):
        print('user ana', call('POST', '/Users/New', {'Name': 'ana', 'Password': 'ana-test'}, token=tok)[0])
    for _ in range(60):
        st, res = call('GET', '/Items?Recursive=true&IncludeItemTypes=Movie,Episode', token=tok)
        if st == 200 and res['TotalRecordCount'] >= 7:
            break
        time.sleep(3)
    print('scanned items:', res['TotalRecordCount'])


def main():
    if SETUP:
        setup()
    admin_tok, _ = login(ADMIN, ADMIN_PW, 'admin')
    ana_tok, ana_id = login('ana', 'ana-test', 'ana')

    # ---------- Plugin 1 ----------
    st, html = call('GET', '/web/', raw=True)
    print('[badges] script injected in /web/:', 'data-plugin="LanguageBadges"' in html)
    st, js = call('GET', '/LanguageBadges/client.js', raw=True)
    print('[badges] client.js', st, len(js), 'bytes')
    print('[badges] Items without token ->', call('GET', '/LanguageBadges/Items?ids=x')[0])
    st, items = call('GET', '/Users/%s/Items?Recursive=true&IncludeItemTypes=Movie,Episode,Series&Fields=Path' % ana_id, token=ana_tok)
    ids = {i['Id']: i['Name'] for i in items['Items']}
    st, langs = call('GET', '/LanguageBadges/Items?ids=' + ','.join(ids), token=ana_tok)
    print('[badges] /LanguageBadges/Items', st)
    for i, name in sorted(ids.items(), key=lambda kv: kv[1]):
        print('   %-28s %s' % (name, json.dumps(langs.get(i))))
    print('[badges] ClientConfig', call('GET', '/LanguageBadges/ClientConfig', token=ana_tok))

    # ---------- Plugin 2 ----------
    call('DELETE', '/SearchNotifier/Log', token=admin_tok)
    print('[search] Log as non-admin ->', call('GET', '/SearchNotifier/Log', token=ana_tok)[0])
    # Simulate jellyfin-web search-as-you-type: several prefixes, parallel per-type requests.
    for term in ('ma', 'mat', 'matri', 'matrix'):
        for t in ('Movie', 'Series', 'Episode'):
            call('GET', '/Items?userId=%s&searchTerm=%s&IncludeItemTypes=%s&Recursive=true&Limit=24' % (ana_id, term, t), token=ana_tok)
        call('GET', '/Persons?userId=%s&searchTerm=%s&Limit=24' % (ana_id, term), token=ana_tok)
        time.sleep(0.3)
    # A second, unrelated search right after (must flush "matrix" immediately) with no results.
    call('GET', '/Search/Hints?userId=%s&searchTerm=%s' % (ana_id, urllib.parse.quote('el padrino')), token=ana_tok)
    call('GET', '/Users/%s/Items?searchTerm=dark&IncludeItemTypes=Series&Recursive=true' % ana_id, token=admin_tok)
    time.sleep(7)
    st, log = call('GET', '/SearchNotifier/Log?limit=10', token=admin_tok)
    print('[search] log', st)
    for e in log:
        print('   ', e['UserName'], repr(e['Term']), e['TotalResults'], e['ResultsByType'])


if __name__ == '__main__':
    main()
