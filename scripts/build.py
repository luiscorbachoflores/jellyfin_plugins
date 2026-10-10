#!/usr/bin/env python3
"""Build the plugins for one Jellyfin line and stage them ready to drop into <config>/plugins/.

  scripts/build.py 12.2.0 out/12.2.0             # net10, targetAbi 12.2.0.0
  scripts/build.py 10.11.8 out/10.11.8           # net9,  targetAbi 10.11.8.0 (what production runs)
  scripts/build.py 12.2.0 out/12.2.0 Reviews     # only some plugins

Each plugin ends in <out>/<Name>_<version>/ (dlls + meta.json) and <out>/<Assembly>_<version>.zip (release layout).
"""
import json, os, re, shutil, subprocess, sys, zipfile, datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(ROOT, 'tests', 'e2e'))
from jfe2e import PLUGINS  # noqa: E402

DOTNET = os.environ.get('DOTNET', os.path.expanduser('~/.dotnet/dotnet'))
if not os.path.exists(DOTNET):
    DOTNET = 'dotnet'


def csproj_version(path):
    s = open(path, encoding='utf-8').read()
    m = re.search(r'<Version>([\d.]+)</Version>', s) or re.search(r'<AssemblyVersion>([\d.]+)</AssemblyVersion>', s)
    return m.group(1)


def main():
    jf = sys.argv[1]
    out = os.path.abspath(sys.argv[2])
    only = sys.argv[3:] or list(PLUGINS)
    abi = '.'.join(jf.split('.')[:2]) + '.0.0' if not jf.startswith('10.11') else jf.rsplit('.', 1)[0] + '.' + jf.split('.')[2] + '.0'
    abi = jf if jf.count('.') == 3 else jf + '.0'
    os.makedirs(out, exist_ok=True)
    for key in only:
        name, guid = PLUGINS[key]
        proj_dir = os.path.join(ROOT, 'src', key)
        proj = os.path.join(proj_dir, 'Jellyfin.Plugin.%s.csproj' % key)
        ver = csproj_version(proj)
        pub = os.path.join(proj_dir, 'bin', 'publish-' + jf)
        shutil.rmtree(pub, ignore_errors=True)
        subprocess.run([DOTNET, 'publish', proj, '-c', 'Release', '-p:JellyfinVersion=' + jf, '-o', pub, '--nologo', '-v', 'q'], check=True)
        stage = os.path.join(out, '%s_%s' % (key, ver))
        shutil.rmtree(stage, ignore_errors=True)
        shutil.copytree(pub, stage, ignore=shutil.ignore_patterns('*.pdb', '*.deps.json', '*.runtimeconfig.json'))
        meta = {
            'category': 'General', 'changelog': '', 'description': '', 'guid': guid, 'name': name,
            'overview': '', 'owner': 'luiscorbachoflores', 'targetAbi': abi,
            'timestamp': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'version': ver,
            'status': 'Active', 'autoUpdate': False,
            'assemblies': ['Jellyfin.Plugin.%s.dll' % key],
        }
        json.dump(meta, open(os.path.join(stage, 'meta.json'), 'w'), indent=2, ensure_ascii=False)
        zpath = os.path.join(out, 'Jellyfin.Plugin.%s_%s.zip' % (key, ver))
        with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
            for dp, _, fs in os.walk(stage):
                for f in fs:
                    full = os.path.join(dp, f)
                    z.write(full, os.path.relpath(full, stage))
        print('built', key, ver, 'targetAbi', abi, '->', stage)


if __name__ == '__main__':
    main()
