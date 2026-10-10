#!/usr/bin/env bash
# Compatibility matrix: every plugin build against Jellyfin 12.2 and 10.11.8 (needs ../../out/{12.2.0,10.11.8} from scripts/build.py).
#   ./matrix.sh [shots-root]      ->  <root>/{12.2-net10,12.2-net9abi,10.11-net9,10.11-net10abi}
set -u
cd "$(dirname "$0")"
OUT=${1:-/tmp/shots/matrix}
P12=../../out/12.2.0; P10=../../out/10.11.8
run() { # label image name port plugins [full]
  echo "=================== $1"
  python3 run.py up --name "$3" --port "$4" --image "$2" --plugins "$5" || return
  if [ "${6:-full}" = full ]; then python3 run.py test --name "$3" --port "$4" --shots "$OUT/$1"; else
    python3 - "$3" "$4" <<PY
import sys
from jfe2e import *
i = Instance(sys.argv[1], int(sys.argv[2]))
tok, _ = i.login(ADMIN, ADMIN_PW)
for p in i.call('GET', '/Plugins', token=tok)[1]:
    if p['Id'].replace('-', '') in [g.replace('-', '') for _, g in PLUGINS.values()]:
        print('%-26s %-10s %s' % (p['Name'], p['Version'], p['Status']))
PY
    docker logs "$3" 2>&1 | grep -iE "plugin.*(disabled|not compatible|incompatible|failed|targetAbi)|Unable to load|BadImageFormat|FileNotFound" | cut -c1-220 | head -8
  fi
}
run 12.2-net10     jellyfin/jellyfin:12      jf12-audit   8101 $P12
run 12.2-net9abi   jellyfin/jellyfin:12      jf12-audit   8101 $P10
run 10.11-net9     jellyfin/jellyfin:10.11.8 jf1011-audit 8102 $P10
run 10.11-net10abi jellyfin/jellyfin:10.11.8 jf1011-audit 8102 $P12 status
