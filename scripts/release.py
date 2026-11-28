#!/usr/bin/env python3
"""Empaqueta plugins para Jellyfin 12.2 y actualiza manifest.json.

Uso (desde la raiz del repo):  python3 scripts/release.py Blog Diary Watchlist AdminMessages WeeklyPick
Para cada plugin: dotnet publish, zip (dll + dependencias + meta.json, igual que las releases anteriores) en dist/,
suma MD5 y entrada nueva al inicio de versions en manifest.json. No sube nada: despues se crean las releases de
GitHub con los zips de dist/ y los tags indicados al final."""
import datetime
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import zipfile

REPO = 'luiscorbachoflores/jellyfin_plugins'
ABI = '12.2.0.0'
DOTNET = os.path.expanduser('~/.dotnet/dotnet')
if not os.path.exists(DOTNET):
    DOTNET = 'dotnet'

# nombre de carpeta -> datos del manifest. Version y changelog de ESTA tanda.
PLUGINS = {
    'Blog': dict(
        name='Blog', guid='1660e20b-ec3d-4424-91b0-4253e12de3c2', version='1.1.0.0', category='General', icon='blog-thumb.jpg',
        description='Blog de cine compartido entre los usuarios del servidor, con borradores, entradas privadas, películas mencionadas con carátulas y una imagen por entrada.',
        overview='Pantalla propia en #/blog. Cada usuario tiene sus borradores y puede publicar en privado (solo el autor y el administrador); una entrada pública ya no vuelve a privada. Se mencionan películas con @ y salen sus carátulas al final, en el orden que elige el autor. Una imagen por entrada. Comentarios, etiquetas y archivo.',
        changelog='Borradores por usuario con autoguardado, entradas privadas (visibles solo para el autor y el administrador, que las ve en una pestaña aparte), publicación pública irreversible, menciones con @ y carátulas ordenables al final de la entrada, una portada por entrada, editor rehecho, configuración con lista de usuarios más clara y botón Blog en el menú del panel.'),
    'Diary': dict(
        name='Diary', guid='5d0c2a41-7b3e-4f6d-9a18-2c4e6f8b0d13', version='1.0.1.0', category='General', icon='diary-icon.png',
        description='Diario de cine por usuario en #/diary: lo que has visto, con fecha y nota, y un resumen del año.',
        overview='Cada película que terminas de ver (o marcas como vista) se apunta sola en tu diario privado, con su fecha. Puedes cambiar la fecha, puntuar en medias estrellas, comentar, añadir películas a mano e importar lo que Jellyfin ya tenía como visto. Incluye el resumen «Tu año en la Titoteca». El administrador solo ve cuántas entradas tiene cada usuario.',
        changelog='Borrar una entrada ahora pide confirmación en pantalla (Sí, borrar o No) en vez de pulsar dos veces, muestra el error si el servidor falla y quita la fila al momento.'),
    'Watchlist': dict(
        name='Watchlist', guid='351f939b-307a-44c6-a027-3b23fa1596a3', version='1.1.0.0', category='General', icon='watchlist-icon.png',
        description='Lista personal «para ver» por usuario: «Mi lista» en el menú del usuario abre su propia pantalla, y botón en el menú de tres puntos de cualquier carátula o ficha.',
        overview='Lista personal para ver por usuario (distinta de Favoritos), ahora en una pantalla propia en #/watchlist con filtros, orden y «Sorpréndeme».',
        changelog='Mi lista deja de ser una ventana emergente y pasa a ser una pantalla (#/watchlist) con filtro por películas y series, orden, duración y botón Sorpréndeme. Entrada en el menú del panel.'),
    'AdminMessages': dict(
        name='AdminMessages', guid='31e66f0b-a8e4-4e8a-be19-cf9d3678c691', version='1.0.2.0', category='General', icon='admin-messages-icon.png',
        description='Permite al administrador dejar avisos persistentes a los usuarios, que estos ven en una bandeja la siguiente vez que entren.',
        overview='Bandeja de avisos persistentes del administrador.',
        changelog='Entrada «Mensajes a usuarios» en el menú del panel de administración.'),
    'Reviews': dict(
        name='Reviews', guid='b7e1b6b4-6b1a-4a1a-9c1a-6f0b1e9c2d31', version='1.6.0.0', category='General', icon='reviews-icon.png',
        description='Reviews', overview='Reviews', srcroot='~/jfp_work_reviews',
        changelog='Si el plugin Blog 1.1 o superior está instalado, la ficha de una película muestra «Mencionada en el blog» con las entradas públicas que la citan. Actualiza SQLitePCLRaw a 2.1.14 (vulnerabilidad conocida).'),
    'WeeklyPick': dict(
        name='Recomendación Semanal', guid='63a86ee3-680e-4577-8a85-a0594cd8548a', version='1.5.3.0', category='General', icon='weekly-pick-icon.png',
        description='Recomendación semanal.', overview='Recomendación semanal.',
        changelog='Entrada «Recomendación semanal» en el menú del panel de administración.'),
}

root = os.getcwd()
MANIFESTS = ['manifest.json', 'manifest-staging.json']
loaded = {}
for mp in MANIFESTS:
    if os.path.exists(mp):
        loaded[mp] = json.load(io.open(mp, encoding='utf8'))
os.makedirs('dist', exist_ok=True)
now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
tags = []

for folder in sys.argv[1:]:
    spec = PLUGINS[folder]
    asm = 'Jellyfin.Plugin.%s' % folder
    pub = os.path.join('dist', 'publish-' + folder)
    shutil.rmtree(pub, ignore_errors=True)
    srcroot = os.path.expanduser(spec.get('srcroot', '.'))
    subprocess.check_call([DOTNET, 'publish', os.path.join(srcroot, 'src/%s/%s.csproj' % (folder, asm)), '-c', 'Release', '-p:JellyfinVersion=12.2.0', '-o', pub, '--nologo', '-v', 'quiet'])
    meta = {
        'category': spec['category'], 'changelog': spec['changelog'], 'description': spec['description'], 'guid': spec['guid'],
        'name': spec['name'], 'overview': spec['overview'], 'owner': 'luiscorbachoflores', 'targetAbi': ABI, 'timestamp': now,
        'version': spec['version'], 'status': 'Active', 'autoUpdate': False, 'assemblies': [asm + '.dll'],
    }
    zip_path = os.path.join('dist', '%s_12.2.0.zip' % folder)
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for dp, _, files in os.walk(pub):
            for f in files:
                if f.endswith('.pdb'):
                    continue
                full = os.path.join(dp, f)
                z.write(full, os.path.relpath(full, pub))
        z.writestr('meta.json', json.dumps(meta, indent=2, ensure_ascii=False))
    md5 = hashlib.md5(open(zip_path, 'rb').read()).hexdigest()
    tag = '%s-v%s' % (folder.lower(), spec['version'])
    tags.append((tag, zip_path))
    entry = {
        'version': spec['version'], 'changelog': spec['changelog'], 'targetAbi': ABI,
        'sourceUrl': 'https://github.com/%s/releases/download/%s/%s_12.2.0.zip' % (REPO, tag, folder),
        'checksum': md5, 'timestamp': now,
    }
    for mp, manifest in loaded.items():
        by_guid = {p['guid']: p for p in manifest}
        plugin = by_guid.get(spec['guid'])
        if plugin is None:
            plugin = {'guid': spec['guid'], 'name': spec['name'], 'description': spec['description'], 'overview': spec['overview'],
                      'owner': 'luiscorbachoflores', 'category': spec['category'], 'versions': [],
                      'imageUrl': 'https://raw.githubusercontent.com/%s/main/docs/img/plugins/%s' % (REPO, spec['icon'])}
            manifest.append(plugin)
        elif folder in ('Blog', 'Watchlist'):
            plugin['description'] = spec['description']
            plugin['overview'] = spec['overview']
            plugin['imageUrl'] = 'https://raw.githubusercontent.com/%s/main/docs/img/plugins/%s' % (REPO, spec['icon'])
        plugin['versions'] = [v for v in plugin['versions'] if v['version'] != spec['version']]
        plugin['versions'].insert(0, entry)
    print('%-14s %s  md5 %s  %s' % (folder, spec['version'], md5, zip_path))

for mp, manifest in loaded.items():
    with io.open(mp, 'w', encoding='utf8', newline='\n') as fh:
        fh.write(json.dumps(manifest, indent=4, ensure_ascii=False) + '\n')
print('\nRelease de GitHub a crear (con los zips de dist/) tras el push:')
for tag, z in tags:
    print('  gh release create %s %s --title "%s" --notes "..."' % (tag, z, tag))
