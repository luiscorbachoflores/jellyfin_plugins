#!/usr/bin/env bash
# Build Language Badges + Search Notifier for one Jellyfin version and optionally install them.
#
#   scripts/build-new-plugins.sh                       -> Jellyfin 10.11.8 (production, .NET 9), zips in dist/10.11.8/
#   scripts/build-new-plugins.sh 12.1.0                -> Jellyfin 12.1.0 (.NET 10), zips in dist/12.1.0/
#   scripts/build-new-plugins.sh 12.1.0 ../plugins     -> ...and unpack them into that plugins dir (then restart Jellyfin)
#
# Needs a .NET SDK able to target net9.0/net10.0 (~/.dotnet/dotnet 10.x is used if present).
set -euo pipefail
cd "$(dirname "$0")/.."

JF_VERSION="${1:-10.11.8}"
INSTALL_DIR="${2:-}"
DOTNET="${DOTNET:-$HOME/.dotnet/dotnet}"
[ -x "$DOTNET" ] || DOTNET=dotnet
PLUGIN_VERSION="1.0.0.0"
ABI="$(echo "$JF_VERSION" | cut -d. -f1-2).0.0"   # 10.11.8 -> 10.11.0.0
OUT="dist/$JF_VERSION"
mkdir -p "$OUT"

build_one() {
    local proj="$1" dir="src/${1#Jellyfin.Plugin.}" name="$2" guid="$3" desc="$4" category="$5"
    local pub="$dir/bin/publish-$JF_VERSION"
    rm -rf "$pub"
    "$DOTNET" publish "$dir/$proj.csproj" -c Release -p:JellyfinVersion="$JF_VERSION" -o "$pub" --nologo -v quiet
    local stage; stage="$(mktemp -d)"
    cp "$pub/$proj.dll" "$stage/"
    cat > "$stage/meta.json" <<EOF
{
  "category": "$category",
  "changelog": "Primera version.",
  "description": "$desc",
  "guid": "$guid",
  "name": "$name",
  "overview": "$desc",
  "owner": "luiscorbachoflores",
  "targetAbi": "$ABI",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "version": "$PLUGIN_VERSION",
  "status": "Active",
  "autoUpdate": false,
  "assemblies": [ "$proj.dll" ]
}
EOF
    (cd "$stage" && python3 -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED); [z.write(f) for f in sys.argv[2:]]" "$OLDPWD/$OUT/${proj}_${PLUGIN_VERSION}.zip" "$proj.dll" meta.json)
    echo "built $OUT/${proj}_${PLUGIN_VERSION}.zip (targetAbi $ABI)"
    if [ -n "$INSTALL_DIR" ]; then
        local dest="$INSTALL_DIR/${name// /}_$PLUGIN_VERSION"
        rm -rf "$INSTALL_DIR/${name// /}_"*
        mkdir -p "$dest"
        cp "$stage/"* "$dest/"
        echo "installed -> $dest"
    fi
    rm -rf "$stage"
}

build_one Jellyfin.Plugin.LanguageBadges "Language Badges" "56e27219-5a61-4f3b-96c2-e7e2e2076c0a" \
    "Muestra los idiomas de audio y subtitulos de cada pelicula/episodio sobre el poster y en la ficha." "General"
build_one Jellyfin.Plugin.SearchNotifier "Search Notifier" "8927bd8c-5eeb-4745-90c4-edb2ebd236cc" \
    "Registra lo que buscan los usuarios y lo notifica a un webhook configurable." "Notifications"
