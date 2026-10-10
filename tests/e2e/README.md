# Harness e2e de los plugins (Jellyfin 12.2)

Crea una instancia **desechable** de Jellyfin 12.2 en Docker, instala los plugins, siembra medios y usuarios de prueba,
ejecuta pruebas de API y de navegador (Playwright, escritorio y móvil) y la borra. No toca ningún servidor real:
solo habla con el contenedor que crea (`localhost:<puerto>`), con usuarios y contraseñas de prueba fijos
(`jfadmin`/`jfadmin-test`, `ana`/`ana-test`) y tokens falsos.

## Requisitos

- Docker (imagen `jellyfin/jellyfin:12`), un puerto libre (por defecto 8101).
- .NET SDK 8+ y 10 (`~/.dotnet/dotnet`) para compilar; Python 3.10+ con `playwright` y Chromium (`pip install playwright && playwright install chromium`).
- ~1 GB de disco libre (los vídeos de prueba son de 5 s y 320x180).

## Uso

```bash
cd audit-12.2
python3 scripts/build.py 12.2.0 out/12.2.0          # net10, targetAbi 12.2.0.0  (o: 10.11.8 out/10.11.8 -> net9)

cd tests/e2e
python3 run.py all  --plugins ../../out/12.2.0 --shots out/shots   # up + test + down
# por pasos:
python3 run.py up   --plugins ../../out/12.2.0                     # crea ~/jf12-audit, instala, siembra
python3 run.py test --shots /tmp/shots/x [--only Reviews,JellyAsk]  # solo pruebas
python3 run.py down                                                 # borra contenedor y datos
```

Opciones: `--name` (contenedor y carpeta `~/<name>`), `--port`, `--image`, `--keep` (con `all`, no desmontar).
La salida son líneas `PASS/FAIL/INFO` y el código de salida es el número de `FAIL`. Las capturas van a `--shots`
y los resultados a `<shots>/results.json`.

## Qué se prueba

| Bloque | Contenido |
| --- | --- |
| Carga | Cada plugin figura como `Active` en `/Plugins`. |
| JellyAsk | Auth (401 anónimo), límites, anti-flood, FAB (tamaño, nombre accesible, ocultación en `#/video`/`#/dashboard`), diálogo (rol, foco, trampa de tabulación, ESC, retorno de foco), recreación del nodo, errores de consola. |
| Reviews | Auth y permisos (propio/ajeno/admin), validación (rango, longitud, GUID, elemento inexistente), anti-flood, 30 usuarios concurrentes, widget en película/serie/temporada/episodio y ausencia en inicio/biblioteca/búsqueda, navegación SPA A→B→A, restauración tras re-render, XSS, teclado. |
| LanguageBadges | API (ES+EN, LAT, `?`), ids basura, chips en inicio/biblioteca/ficha/búsqueda, repintado tras re-render. |
| SearchNotifier | Permisos admin, búsqueda real por la UI (una entrada, no una por letra), webhook (receptor local en :8190), actividad, 60 búsquedas concurrentes. |
| WeeklyPick | Aviso semanal una vez por usuario, diálogo accesible, `Seen`/`Reset`, “Ver ficha”. |
| ConfigPages | Páginas del panel de los 4 plugins con interfaz (render, sin scroll horizontal, sin errores). |

Cada sesión de navegador cuenta como fallo cualquier `console.error/warn`, excepción de página o respuesta HTTP >= 400
inesperada.

## Utilidades de investigación

`explore_dom.py` (inventario de anclajes del DOM por tipo de página), `probe_theme.py` / `probe_vars.py`
(variables CSS `--jf-*` y estilos nativos), `probe_dialog.py` / `probe_native_dialog.py` (diálogos nativos).

## Notas conocidas de Jellyfin 12.2.0

- El servidor puede **caerse** (`ObjectDisposedException` en `WebSocketController`) al cerrarse a la vez dos websockets
  de un mismo navegador. No es de los plugins; el harness arranca el contenedor con `--restart unless-stopped`, cierra
  los websockets de uno en uno al terminar cada sesión y reintenta las llamadas HTTP mientras el servidor reinicia.
- Las bibliotecas se crean sin proveedores de metadatos para que los títulos de prueba no se renombren desde Internet.
