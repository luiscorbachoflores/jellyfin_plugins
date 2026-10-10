#!/usr/bin/env python3
"""Disposable-instance runner. See README.md.

  python3 run.py up    [--name jf12-audit --port 8101 --plugins out/12.2.0]   create instance, install plugins, seed
  python3 run.py test  [--shots DIR] [--only Reviews,JellyAsk]                run smoke tests
  python3 run.py down                                                         remove container + data
  python3 run.py all   ...                                                    up + test + down
"""
import argparse, glob, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jfe2e import Instance, PLUGINS, ROOT  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['up', 'test', 'down', 'all', 'restart'])
    ap.add_argument('--name', default='jf12-audit')
    ap.add_argument('--port', type=int, default=8101)
    ap.add_argument('--image', default='jellyfin/jellyfin:12')
    ap.add_argument('--plugins', default=os.path.join(ROOT, 'out', '12.2.0'), help='dir produced by scripts/build.py')
    ap.add_argument('--shots', default=os.path.join(ROOT, 'out', 'shots'))
    ap.add_argument('--only', default='')
    ap.add_argument('--base-path', default='', help='run Jellyfin under this BaseUrl (e.g. /jf) to test reverse-proxy sub-paths')
    ap.add_argument('--empty', action='store_true', help='no libraries/media (new-server scenario); use with --only Vacio')
    ap.add_argument('--keep', action='store_true', help='with "all": do not tear down')
    a = ap.parse_args()
    inst = Instance(a.name, a.port, image=a.image, base_path=a.base_path if a.cmd == 'test' else '')
    only = [x for x in a.only.split(',') if x]

    if a.cmd in ('up', 'all'):
        inst.down()
        if not a.empty:
            inst.make_media()
        inst.up()
        inst.wizard()
        inst.clear_plugins()
        for d in sorted(glob.glob(os.path.join(a.plugins, '*_*'))):
            if os.path.isdir(d):
                inst.install(d, os.path.basename(d))
        inst.restart()
        if a.base_path:
            inst.configure_base_url(a.base_path)
        print('items scanned:', inst.seed(empty=a.empty))
    if a.cmd == 'restart':
        inst.restart()
    if a.cmd in ('test', 'all'):
        import smoke
        rc = smoke.run(inst, a.shots, only)
        if a.cmd == 'all' and not a.keep:
            inst.down()
        sys.exit(rc)
    if a.cmd == 'down':
        inst.down()


if __name__ == '__main__':
    main()
