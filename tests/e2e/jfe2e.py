#!/usr/bin/env python3
"""Shared helpers for the Jellyfin plugin e2e harness (see README.md).

Everything here only ever talks to a THROWAWAY Jellyfin container created by `run.py up`.
Credentials are the fixed test ones; tokens used for plugin config are fake (000000:FAKE).
"""
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ADMIN, ADMIN_PW = 'jfadmin', 'jfadmin-test'
USER, USER_PW = 'ana', 'ana-test'
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# name (folder in src/), plugin display name, GUID (never change), assembly
PLUGINS = {
    'JellyAsk': ('JellyAsk', 'c3f4a9e2-8d1b-4f6a-9e3c-7a2b5d6e8f10'),
    'Reviews': ('Reviews', 'b7e1b6b4-6b1a-4a1a-9c1a-6f0b1e9c2d31'),
    'LanguageBadges': ('Language Badges', '56e27219-5a61-4f3b-96c2-e7e2e2076c0a'),
    'SearchNotifier': ('Search Notifier', '8927bd8c-5eeb-4745-90c4-edb2ebd236cc'),
    'WeeklyPick': ('Recomendación Semanal', '63a86ee3-680e-4577-8a85-a0594cd8548a'),
}


def sh(cmd, check=True, **kw):
    r = subprocess.run(cmd, shell=isinstance(cmd, str), text=True, capture_output=True, **kw)
    if check and r.returncode:
        raise RuntimeError('%s -> %s\n%s%s' % (cmd, r.returncode, r.stdout, r.stderr))
    return r.stdout.strip()


class Instance:
    """One disposable Jellyfin container: <home>/{config,cache,media}."""

    def __init__(self, name='jf12-audit', port=8101, home=None, image='jellyfin/jellyfin:12', base_path=''):
        self.name, self.port, self.image = name, port, image
        self.home = home or os.path.expanduser('~/' + name)
        self.root = 'http://localhost:%d' % port
        self.base = self.root + base_path   # e.g. http://localhost:8103/jf when Jellyfin runs under a BaseUrl

    # ---------- docker ----------
    def up(self):
        for d in ('config/plugins', 'cache', 'media'):
            os.makedirs(os.path.join(self.home, d), exist_ok=True)
        sh('docker rm -f %s' % self.name, check=False)
        sh('docker run -d --restart unless-stopped --name %s --user %d:%d -p %d:8096 -v %s/config:/config -v %s/cache:/cache -v %s/media:/media %s'
           % (self.name, os.getuid(), os.getgid(), self.port, self.home, self.home, self.home, self.image))
        self.wait()

    def wait(self, timeout=180):
        t = time.time()
        while time.time() - t < timeout:
            try:
                with urllib.request.urlopen(self.base + '/System/Info/Public', timeout=3) as r:
                    if r.status == 200 and 'ServerName' in r.read().decode():
                        time.sleep(3)
                        return
            except Exception:
                pass
            time.sleep(2)
        raise TimeoutError('Jellyfin did not start')

    def restart(self):
        sh('docker restart %s' % self.name)
        time.sleep(3)
        self.wait()

    def down(self, purge=True):
        sh('docker rm -f %s' % self.name, check=False)
        if purge and os.path.isdir(self.home):
            # files may be root-owned if an older run used another user
            sh('docker run --rm -v %s:/x alpine sh -c "rm -rf /x/* /x/.[!.]*"' % self.home, check=False)
            shutil.rmtree(self.home, ignore_errors=True)

    def logs(self, tail=200):
        return sh('docker logs --tail %d %s 2>&1' % (tail, self.name), check=False)

    # ---------- plugins ----------
    def install(self, stage_dir, folder):
        dest = os.path.join(self.home, 'config', 'plugins', folder)
        shutil.rmtree(dest, ignore_errors=True)
        shutil.copytree(stage_dir, dest)

    def clear_plugins(self):
        p = os.path.join(self.home, 'config', 'plugins')
        for d in os.listdir(p):
            if os.path.isdir(os.path.join(p, d)) and d != 'configurations':
                shutil.rmtree(os.path.join(p, d), ignore_errors=True)

    # ---------- API ----------
    AUTH = 'MediaBrowser Client="e2e", Device="cli", DeviceId="e2e-{}", Version="1.0"'

    def call(self, method, path, body=None, token=None, dev='x', raw=False, headers=None):
        hdr = {'Authorization': self.AUTH.format(dev) + (', Token="%s"' % token if token else ''),
               'Content-Type': 'application/json'}
        hdr.update(headers or {})
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=hdr)
        for attempt in range(40):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    txt = r.read().decode()
                    return r.status, (txt if raw else (json.loads(txt) if txt.strip() else None))
            except urllib.error.HTTPError as e:
                body = e.read().decode()
                if e.code == 503 and 'loading' in body.lower():  # server (re)starting
                    time.sleep(3)
                    continue
                return e.code, body
            except urllib.error.URLError:
                # Jellyfin 12.2 core can crash when two websockets close at once (ObjectDisposedException in
                # WebSocketController); docker restarts it, so just wait for it to come back.
                time.sleep(3)
        raise ConnectionError(path)

    def login(self, user, pw, dev='x'):
        st, res = self.call('POST', '/Users/AuthenticateByName', {'Username': user, 'Pw': pw}, dev=dev)
        assert st == 200, (st, res)
        return res['AccessToken'], res['User']['Id']

    def wizard(self):
        """Run the first-start wizard through the API (retries: the server answers Public/Info a bit before it is ready)."""
        for attempt in range(10):
            st, info = self.call('GET', '/System/Info/Public')
            if st != 200 or not isinstance(info, dict):
                time.sleep(3)
                continue
            if info.get('StartupWizardCompleted'):
                return
            steps = [('POST', '/Startup/Configuration', {'UICulture': 'es', 'MetadataCountryCode': 'ES', 'PreferredMetadataLanguage': 'es'}),
                     ('GET', '/Startup/User', None),
                     ('POST', '/Startup/User', {'Name': ADMIN, 'Password': ADMIN_PW}),
                     ('POST', '/Startup/RemoteAccess', {'EnableRemoteAccess': True, 'EnableAutomaticPortMapping': False}),
                     ('POST', '/Startup/Complete', None)]
            if all(self.call(m, p, b)[0] in (200, 204) for m, p, b in steps):
                return
            time.sleep(3)
        raise RuntimeError('wizard failed')

    def configure_base_url(self, path):
        """Run Jellyfin under a sub-path (BaseUrl) the way a reverse proxy at https://host/jf would; restarts the server."""
        tok, _ = self.login(ADMIN, ADMIN_PW, 'admin')
        st, net = self.call('GET', '/System/Configuration/network', token=tok)
        net['BaseUrl'] = path
        assert self.call('POST', '/System/Configuration/network', net, token=tok)[0] == 204
        sh('docker restart %s' % self.name)
        time.sleep(3)
        self.base = self.root + path   # from now on everything lives under the sub-path
        self.wait()

    def seed(self, empty=False):
        """Libraries + user. Media must already exist under <home>/media (see make_media). empty=True: no libraries at all."""
        tok, _ = self.login(ADMIN, ADMIN_PW, 'admin')
        if empty:
            if not any(u['Name'] == USER for u in self.call('GET', '/Users', token=tok)[1]):
                self.call('POST', '/Users/New', {'Name': USER, 'Password': USER_PW}, token=tok)
            return 0
        if not self.call('GET', '/Library/VirtualFolders', token=tok)[1]:
            for name, ctype, path in (('Peliculas', 'movies', '/media/Movies'), ('Series', 'tvshows', '/media/Shows')):
                q = urllib.parse.urlencode({'name': name, 'collectionType': ctype, 'paths': path, 'refreshLibrary': 'true'})
                no_fetch = [{'Type': t, 'MetadataFetchers': [], 'ImageFetchers': []} for t in ('Movie', 'Series', 'Season', 'Episode')]
                opts = {'LibraryOptions': {'EnableInternetProviders': False, 'EnableRealtimeMonitor': False, 'EnablePhotos': False,
                                           'TypeOptions': no_fetch, 'MetadataSavers': [], 'LocalMetadataReaderOrder': ['Nfo']}}
                self.call('POST', '/Library/VirtualFolders?' + q, opts, token=tok)
        if not any(u['Name'] == USER for u in self.call('GET', '/Users', token=tok)[1]):
            self.call('POST', '/Users/New', {'Name': USER, 'Password': USER_PW}, token=tok)
        for _ in range(90):
            st, res = self.call('GET', '/Items?Recursive=true&IncludeItemTypes=Movie,Episode', token=tok)
            if st == 200 and res['TotalRecordCount'] >= 7:
                # wait for ffprobe of the last items
                time.sleep(3)
                return res['TotalRecordCount']
            time.sleep(3)
        raise TimeoutError('library scan did not finish')

    def make_media(self):
        """Tiny 5 s videos: 3 movies (one multi-audio+sub, one latino, one untagged) and 2 seasons x 2 episodes."""
        m = os.path.join(self.home, 'media')
        os.makedirs(m + '/Movies', exist_ok=True)
        os.makedirs(m + '/Shows', exist_ok=True)
        ff = ('docker run --rm --user %d:%d --entrypoint /usr/lib/jellyfin-ffmpeg/ffmpeg -v %s:/media %s -y -loglevel error '
              % (os.getuid(), os.getgid(), m, self.image))
        src = '-f lavfi -i testsrc=duration=5:size=320x180:rate=15 -f lavfi -i sine=duration=5 -f lavfi -i sine=f=600:duration=5'
        enc = '-c:v libx264 -preset ultrafast -c:a aac -shortest'

        def mk(path, extra, maps='-map 0:v -map 1:a'):
            os.makedirs(os.path.dirname(m + path), exist_ok=True)
            import shlex
            sh(ff + ' '.join([src, maps, enc, extra]) + ' ' + shlex.quote('/media' + path))

        # srt for the multi-audio movie
        srt = os.path.join(m, 'Movies', 'Pelicula Uno (2020)')
        os.makedirs(srt, exist_ok=True)
        open(os.path.join(srt, 'Pelicula Uno (2020).es.srt'), 'w').write('1\n00:00:00,500 --> 00:00:02,000\nHola\n')
        mk('/Movies/Pelicula Uno (2020)/Pelicula Uno (2020).mkv',
           '-metadata:s:a:0 language=spa -metadata:s:a:1 language=eng', '-map 0:v -map 1:a -map 2:a')
        mk('/Movies/Pelicula Dos (2021)/Pelicula Dos (2021).mkv',
           '-metadata:s:a:0 language=spa -metadata:s:a:0 title=Latino')
        mk('/Movies/Pelicula Tres (2022)/Pelicula Tres (2022).mkv', '')
        for s in (1, 2):
            for e in (1, 2):
                mk('/Shows/Serie Prueba (2019)/Season %02d/Serie Prueba S%02dE%02d.mkv' % (s, s, e),
                   '-metadata:s:a:0 language=%s' % ('jpn' if s == 2 else 'eng'))
