# Auditoría de plugins para Jellyfin 12.2

Alcance: JellyAsk, Reviews, Language Badges, Search Notifier y Recomendación Semanal (WeeklyPick).
Fuera de alcance: Report Problem y el fork de Telegram Notifier.
Fecha: 2026-10-10/11. Servidor de pruebas: `jellyfin/jellyfin:12` (Jellyfin **12.2.0**, web 12.2) y `jellyfin/jellyfin:10.11.8`,
siempre en contenedores desechables con datos de prueba; no se tocó producción.

Rama local: `audit-12.2` en la VM (`~/jellyfin-plugin/audit-12.2/`), sin push ni releases. Commits: base `31f9858`; harness `82afed2`; JellyAsk `b4fb4c2`+`e399ee4`; Reviews `a6a1816`+`b1a6700`; Language Badges `6fb9c4b`+`c05621e`; Search Notifier `4eb7e21`+`ad91825`; WeeklyPick `4d7fadb`+`0ed59cb`; tests/docs `7f2b679`.
Ramas auxiliares (worktrees): `hotfix/reviews-1.4.2.0` (parche mínimo) y una copia desligada de la línea base `31f9858`.

## 1. Resumen

| | Antes (línea base) | Después |
| --- | --- | --- |
| Pruebas e2e en 12.2 | 121 PASS / 39 FAIL | **209 PASS / 0 FAIL** |
| Mismas pruebas con los builds net9 / ABI 10.11.8 sobre 12.2 | – | 209 PASS / 0 FAIL |
| Mismas pruebas en Jellyfin 10.11.8 (builds net9) | – | 209 PASS / 0 FAIL |
| Builds de 12.2 (net10, ABI 12.2) sobre 10.11.8 | – | **no cargan** (ver sección 3) |
| Avisos de compilación en 12.2 (APIs obsoletas) | – | 0 (solo `NU1903` por SQLite nativo, ver R-12) |

### Defectos críticos en lo desplegado en producción

1. **Reviews 1.4.1.0 en Jellyfin 12.x: no se puede publicar, editar ni borrar una reseña desde la web.**
   El script envía `X-Emby-Token`, que 12.x rechaza con 401 para tokens de usuario; la interfaz muestra
   «Necesitas iniciar sesión en Jellyfin…». Evidencia: `before/reviews-movie-posted-desktop.png` (estado del formulario),
   `before/results.json`, prueba directa: `X-Emby-Token` → 401 y `Authorization: MediaBrowser Token="…"` → 200 en `/Reviews`, `/JellyAsk`, `/Users/Me`.
2. **Reviews 1.4.1.0 en cualquier versión (también 10.11): los botones Editar/Eliminar no aparecen nunca.** El `GET /Reviews/{id}`
   se hacía sin credenciales, así que `CanManage` siempre era `false`; los usuarios no pueden corregir ni borrar sus reseñas y el
   administrador no puede moderar desde la web. Evidencia: la prueba de edición del baseline falla con
   «Failed to find element … .reviewEditBtn».
3. **JellyAsk 1.2.0.0 (GitHub main) en 12.x**: mismo `X-Emby-Token` → las peticiones de títulos devuelven 401.
   Ya corregido en 1.2.1.0 (VM, sin publicar) y en 1.3.0.0.

Parche mínimo listo: `hotfix/reviews-1.4.2.0` (commit `4ca27eb`, 2 líneas de JS + versión, mismas dependencias y `targetAbi 10.11.8.0`)
y `out/hotfix/Jellyfin.Plugin.Reviews_1.4.2.0.zip`.

## 2. Método y reproducibilidad

- `tests/e2e/` (ver `tests/e2e/README.md`): crea una instancia limpia, instala los builds, siembra medios (ffmpeg, 5 s), usuarios y webhook local,
  ejecuta pruebas de API y de navegador (Playwright, escritorio 1400x900 y móvil iPhone 390x844), y cuenta como fallo cualquier
  error/aviso de consola, excepción de página o HTTP >= 400 inesperado.
- `scripts/build.py <versión Jellyfin> <salida>` compila los 5 plugins para esa línea (net9/ABI 10.11.x o net10/ABI 12.x).
- `tests/e2e/matrix.sh` ejecuta la matriz de compatibilidad completa.
- Extras: `--base-path /jf` (Jellyfin bajo BaseUrl), `--empty` (servidor nuevo sin bibliotecas), `tema` (CSS de marca que simula tema claro y recolorea el botón principal),
  `TV` (`localStorage.layout='tv'` → `layout-tv`).
- Capturas: `/tmp/claude-1000/shots/audit/before/` (línea base) y `final-12.2/` (después) en la Pi; copias escogidas en `docs/img/auditoria/antes|despues/`.

### Qué expone el cliente web 12.2 (verificado)

| Aspecto | Hallazgo |
| --- | --- |
| Anclajes | Existen en 12.2, en escritorio y móvil: `.itemDetailPage`, `.overview-controls`, `.overview`, `.itemMiscInfo-primary`, `.nameContainer`, `.detailPagePrimaryContainer`, `.card[data-id][data-type]`, `.cardScalable`, `.listItem`, `.mainDrawer-scrollContainer`, `.skinHeader`. En ficha de película, serie, temporada, episodio, bibliotecas, búsqueda e inicio. |
| Páginas en caché | El cliente conserva en el DOM las páginas ya visitadas (ocultas con `.hide`): hay que acotar siempre a `.itemDetailPage:not(.hide)`. |
| Eventos de ruta | Las redirecciones del router usan `replaceState`: **no siempre hay `hashchange`**. Hay que combinar `hashchange` + `popstate` + `viewshow` + MutationObserver acotado + temporizador lento. |
| Elementos personalizados | `emby-button`, `emby-input`, `emby-textarea`, `emby-checkbox`… **no están definidos** en páginas como inicio o ficha (se cargan por página): solo son fiables en las páginas de configuración con `data-require`. Fuera de ellas se usan clases/CSS propios. |
| Variables CSS | Hay `--jf-palette-*`, `--jf-font-*`, `--jf-shadows-*` (MUI), pero **no cambian con los temas heredados** (claro, etc.): sirven solo de respaldo. Lo fiable es heredar (`color/font: inherit`), leer el fondo real de la página y copiar los colores de un `button.raised.button-submit` oculto (sigue temas y CSS de marca). |
| Capas | Cabecera 999, barra de reproducción (`.appfooter`) 1201, menús MUI 1300, diálogos nativos 999998/999999. |
| Layout | `<html class="layout-desktop|layout-mobile|layout-tv">`. |
| Diálogos nativos | Fondo = fondo de `html`, radio 0,1 em, clase `focuscontainer` (confina la navegación con mando). |

## 3. Estrategia de ABI / framework (recomendación)

Matriz medida con el mismo conjunto de 209 pruebas:

| Servidor | Build | Resultado |
| --- | --- | --- |
| 12.2.0 | net10, `targetAbi 12.2.0.0` | 209 PASS / 0 FAIL |
| 12.2.0 | net9, compilado contra 10.11.8, `targetAbi 10.11.8.0` | 209 PASS / 0 FAIL |
| 10.11.8 | net9, `targetAbi 10.11.8.0` | 209 PASS / 0 FAIL |
| 10.11.8 | net10, `targetAbi 12.2.0.0` | no carga («Skipping disabled plugin»; `/Reviews/ClientScript` → 404). Ojo: `/Plugins` los sigue listando como `Active` porque lee `meta.json`. |

Recomendación:

1. **Mientras producción siga en 10.11.8: publicar un único build net9 con `targetAbi 10.11.8.0`.** Funciona en ambas líneas
   (probado con la suite completa), no hay que mantener dos paquetes y los usuarios que pasen a 12.x no tienen que hacer nada.
2. **No publicar a la vez un build net10 con el mismo número de versión**: Jellyfin elige por versión más alta compatible y un build net10 no carga en 10.11.
3. Cuando se abandone 10.11: nueva versión (número mayor que la última net9) con `targetAbi 12.2.0.0` y `net10`. `scripts/build.py 12.2.0` ya lo genera.
4. Salvaguarda: un build compilado contra 10.11.8 se enlaza por nombre de ensamblado y puede dar `MissingMethodException` si una versión 12.x
   quita un miembro usado. Ejecutar `tests/e2e/matrix.sh` con cada versión nueva de Jellyfin antes de actualizar producción.
5. Notas de empaquetado: los `csproj` de JellyAsk, Reviews y WeeklyPick ahora aceptan `-p:JellyfinVersion=` y excluyen los ensamblados de Jellyfin
   del paquete (`ExcludeAssets=runtime`). Al publicar con el `csproj` antiguo de Reviews salen ~35 DLL copiadas del servidor (ICU4N, EF Core, MediaBrowser.*…);
   el paquete nuevo lleva solo el plugin, `Microsoft.Data.Sqlite`, `SQLitePCLRaw.*` y `runtimes/`.

## 4. Hallazgos por plugin

Severidad: **Crítica** (rompe función en producción), **Alta**, **Media**, **Baja**, **Info**. Estado: ✔ corregido en `audit-12.2`; ✔* corregido también en el hotfix; ✖ sin corregir.
Rutas de evidencia relativas a `/tmp/claude-1000/shots/audit/` (Pi); `before/` = línea base, `final-12.2/` = tras las correcciones.

### JellyAsk (baseline 1.2.1.0 → 1.3.0.0, commit `b4fb4c2`)

| ID | Sev. | Hallazgo | Evidencia | Estado |
| --- | --- | --- | --- | --- |
| J-1 | Crítica (en 1.2.0.0) | `X-Emby-Token` rechazado en 12.x → no se puede enviar ninguna petición | sección 1 | ✔ (1.2.1.0 y 1.3.0.0) |
| J-2 | Alta | Texto sin límite (20 000 caracteres aceptados) y sin límite de frecuencia: cada petición crea actividad y un mensaje de Telegram → inundación | `before/results.json` | ✔ 1000 caracteres (400), 5/min/usuario (429), cuerpo vacío → 400 |
| J-3 | Alta | Script `<script src="/JellyAsk/ClientScript">` y `fetch('/JellyAsk/Request')` con ruta absoluta: se rompe bajo BaseUrl (proxy en subruta) | prueba BaseUrl (sec. 6) | ✔ ruta relativa + `ApiClient.getUrl` |
| J-4 | Media | El botón flotante no se oculta en el reproductor (`#/video`), ni en las páginas de configuración (tapa botones del panel) ni en layout TV | `before/config-SearchNotifier-page-desktop.png`, `before/weeklypick-config-desktop.png` | ✔ |
| J-5 | Media | Lógica de ruta atada a `hashchange`: tras una redirección (`replaceState`) el botón queda oculto/ausente hasta recargar; no se recrea si el DOM lo elimina («un único FAB: 0») | `before` FAIL «FAB vuelve», «FAB se recrea» | ✔ viewshow+popstate+observer+temporizador |
| J-6 | Media | Accesibilidad: botón 42,7 px sin nombre accesible; diálogo sin `role=dialog`/`aria-modal`/etiqueta, sin trampa de foco, sin ESC, sin retorno de foco; texto del placeholder duplicado | `before/jellyask-modal-mobile.png` | ✔ `final-12.2/jellyask-modal-mobile.png` |
| J-7 | Media | Estilo: colores fijos `#1c1c1c`/`#00a4dc` y texto blanco sobre azul (contraste ≈ 2,9:1); no sigue el tema ni el CSS de marca | `before/jellyask-modal-desktop.png` | ✔ hereda fuente/color, fondo = fondo de página, botón = botón nativo (texto oscuro, contraste ≈ 7:1); prueba `Tema` (rojo `#e50914` sobre fondo claro) `final-12.2/tema-jellyask-modal-desktop.png` |
| J-8 | Baja | `[AllowAnonymous]` en toda la clase con comprobación manual | – | ✔ `[Authorize]` solo en POST |
| J-9 | Baja | Telegram: sin tiempo límite; el cuerpo de la respuesta y la excepción completa podían llegar al log (la URL lleva el token del bot) | – | ✔ solo código HTTP / tipo de excepción, límite de 10 s |
| J-10 | Info | z-index fijo 9000/10000 por encima de menús nativos | – | ✔ ver convención (sec. 5) |

### Reviews (baseline 1.4.1.0 → 1.5.0.0, commit `a6a1816`; hotfix 1.4.2.0 `4ca27eb`)

| ID | Sev. | Hallazgo | Evidencia | Estado |
| --- | --- | --- | --- | --- |
| R-1 | **Crítica** | `X-Emby-Token` → 401: publicar/editar/borrar imposible en 12.x | sec. 1 | ✔* |
| R-2 | **Crítica** | `GET` sin credenciales → `CanManage=false` siempre: no hay Editar/Eliminar | sec. 1 | ✔* |
| R-3 | Alta | Comentario sin límite (50 000 caracteres aceptados), `itemId` arbitrario (cualquier cadena de 5000 caracteres crea filas), cualquier usuario puede publicar sin límite → inundación de Telegram y de la base | `before/results.json` | ✔ GUID obligatorio y existente/visible (404), solo Movie/Series/Season/Episode, comentario ≤ 2000, 10 reseñas/usuario/elemento y 30/h (429) |
| R-4 | Media | SQLite: sin índice por `ItemId` (barrido completo por petición), E/S síncrona dentro de acciones `async`, sin `CancellationToken`, escrituras sin serializar | – | ✔ API asíncrona, índices `ItemId`/`UserId`, escritura serializada; esquema intacto (bases existentes siguen valiendo); 30 usuarios concurrentes OK |
| R-5 | Media | El script monta el widget en **cualquier** `.itemDetailPage` (personas, colecciones, música…) | lectura de código | ✔ comprueba el tipo con `ApiClient.getItem` |
| R-6 | Media | Ruta absoluta `/Reviews/…` y `/Reviews/ClientScript`: rota bajo BaseUrl | sec. 6 | ✔ |
| R-7 | Media | Estilo: `textarea` blanco nativo, botón gris del navegador, casilla sin tema (el dato «hereda el tema» solo era cierto para el texto) | `before/reviews-movie-desktop.png`, `before/reviews-movie-mobile.png` | ✔ `final-12.2/reviews-movie-posted-desktop.png`: estrellas con el color nativo (`--jf-palette-starIcon-main`), botón principal = botón nativo, controles ≥ 44 px |
| R-8 | Media | Accesibilidad: estrellas solo con ratón; `window.confirm` (bloquea, sin tema, mal en TV/iOS); estado sin `aria-live` | – | ✔ `role=slider` con flechas/Inicio/Fin, toque: 2.º toque = media estrella, 3.º = quitar; borrado en dos pasos; `role=status` |
| R-9 | Media | Layout TV: formulario inservible con mando | – | ✔ modo solo lectura (`layout-tv`): lista sin formulario |
| R-10 | Baja | `Forbid()` sin esquema en controlador anónimo | – | ✔ `StatusCode(403)` (probado) |
| R-11 | Baja | Un id basura de Jellyfin 10.11 (`…0001`) hace que `GetItemById` lance `InvalidOperationException` → 500 | matriz 10.11 | ✔ se trata como «no encontrado» |
| R-12 | Baja | `SQLitePCLRaw.lib.e_sqlite3` empaquetado (2.1.10/2.1.11) con aviso de vulnerabilidad `GHSA-2m69-gcr7-jv3q` (`NU1903`) | `dotnet build` | ✖ sin versión corregida disponible; riesgo bajo (base local, solo consultas parametrizadas) |
| R-13 | Baja | Ficha pública: `GET /Reviews/{id}` sin sesión devuelve nombres de autores no anónimos | prueba API | ✖ decisión (sec. 8) |
| R-14 | Info | Admin ve el nombre real de reseñas anónimas sin indicación visual | – | ✔ nota «(anónima para los demás)» |
| R-15 | Info | XSS: el comentario se escapaba bien (`escapeHtml`) | prueba con `<img onerror>` | ✔ ahora `textContent`, sin `innerHTML` |

### Language Badges (1.0.0.0 → 1.0.1.0, commit `6fb9c4b`)

| ID | Sev. | Hallazgo | Evidencia | Estado |
| --- | --- | --- | --- | --- |
| L-1 | Media | Un único id que Jellyfin 10.11 no sabe deserializar (`…0001`) hace fallar toda la petición por lotes (500) | matriz 10.11 | ✔ por elemento, con `try/catch` |
| L-2 | Media | Los chips no se repintan si el cliente los borra al re-renderizar la tarjeta (`data-lb-id` ya igual) | `before` FAIL «chips se repintan» | ✔ |
| L-3 | Baja | Tipografía `system-ui` fija; chips sin texto alternativo | – | ✔ hereda fuente; `role=img` + `aria-label` |
| L-4 | Baja | Series/temporadas: hasta 300 consultas por serie en frío (caché de 10 min); un lote de 200 series puede tardar | lectura de código | ✖ no medido con carga real; la caché de 10 min y el límite de 300 episodios lo acotan; vigilar |
| L-5 | Info | Anclajes verificados en 12.2 (`.card[data-id][data-type]`, `.cardScalable`, `.listItem`, `.itemMiscInfo-primary`); API exige token (401 sin él); respeta la visibilidad del usuario | explore | ✔ sin cambios |
| L-6 | Info | Ya usaba `Authorization: MediaBrowser Token`, script relativo `../LanguageBadges/client.js` y buen patrón de inyección (se tomó como modelo) | – | – |

### Search Notifier (1.0.0.0 → 1.0.1.0, commit `4eb7e21`)

| ID | Sev. | Hallazgo | Evidencia | Estado |
| --- | --- | --- | --- | --- |
| S-1 | Media | Si Jellyfin lanzaba una excepción durante una búsqueda, el `finally` copiaba al cliente el cuerpo parcial | lectura de código | ✔ |
| S-2 | Baja | Al llegar al máximo del registro se reescribía el fichero entero en cada búsqueda | – | ✔ recorte por lotes (25 %) |
| S-3 | Baja | Búsquedas pendientes se perdían al parar el servidor | – | ✔ `Dispose` las guarda |
| S-4 | Baja | `TestWebhook?url=` sin validar el esquema (solo admin) | – | ✔ solo http/https |
| S-5 | Info | Endpoints admin con `[Authorize(Policy="RequiresElevation")]` en clase sin `[AllowAnonymous]`: 401/403 correctos; 60 búsquedas concurrentes OK; una entrada por búsqueda real (no por letra) | smoke | – |
| S-6 | Info | Privacidad: el registro guarda usuario + término; solo admin | – | documentado en la página de configuración |

### WeeklyPick / Recomendación Semanal (1.0.0.0 → 1.1.0.0, commit `4d7fadb`)

| ID | Sev. | Hallazgo | Evidencia | Estado |
| --- | --- | --- | --- | --- |
| W-1 | Media | `GET Current` marcaba la semana como vista **antes** de mostrar el aviso: si el navegador no lo llegaba a pintar, se perdía | lectura de código | ✔ nuevo `POST Seen` tras mostrarlo |
| W-2 | Media | Diálogo sin `role`/`aria-modal`, sin foco, sin ESC, sin trampa de foco, colores fijos | `before/weeklypick-modal-*.png` | ✔ `final-12.2/weeklypick-modal-mobile.png`; en TV usa `focuscontainer` y recupera el foco |
| W-3 | Media | Comprobación del token con `setTimeout` infinito cada segundo; un cambio de usuario sin recargar no volvía a comprobar | – | ✔ por token, en cambios de ruta, no durante el reproductor |
| W-4 | Baja | `Reset`: comprobación de admin manual y 401 en lugar de 403 | – | ✔ `[Authorize(Policy="RequiresElevation")]` |
| W-5 | Baja | `seen.json` no atómico: un fichero corrupto daba 500 para siempre | – | ✔ escritura atómica y lectura tolerante |
| W-6 | Baja | `DateTime.TryParse` sin cultura; `SessionNotifier` sin cancelación al parar | – | ✔ |
| W-7 | Baja | Página de configuración: `innerHTML` sin escapar (solo admin), id sin validar, bordes blancos fijos | `before/weeklypick-config-desktop.png` | ✔ |
| W-9 | Media | Misma ruta absoluta `/WeeklyPick/…`: el script no carga bajo BaseUrl (probado con el build base) | sec. 6 | ✔ |
| W-8 | Info | Mensaje nativo a clientes que no son web (`SessionNotifier`): sin cambios funcionales | – | – |

### Transversal

| ID | Sev. | Hallazgo | Estado |
| --- | --- | --- | --- |
| T-1 | Media | Páginas de configuración: ya usaban `emby-input/button/checkbox` con `data-require` y se ven nativas en 12.2 (escritorio y móvil, sin scroll horizontal). Mejoras: tokens de Telegram como `type=password`, `catch` para no dejar el spinner colgado | ✔ (capturas `config-*`) |
| T-2 | Media | Cuatro middlewares casi idénticos de inyección de `index.html`; tres comprobaban mal el estado/tipo de la respuesta | ✔ patrón de Language Badges (solo `200 text/html`, marca `data-plugin`, ruta relativa) |
| T-3 | Info | Idioma: textos fijos en español. No se añade selector es/en: `documentElement.lang` vale `en-us` por defecto en usuarios sin configurar y cambiaría el idioma a quien hoy lo ve en español | decisión (sec. 8) |
| T-4 | Info | **Fallo del propio Jellyfin 12.2.0** (no de los plugins): el servidor se cae con `ObjectDisposedException` en `WebSocketController` cuando un navegador cierra dos websockets a la vez (visto 2 veces); además un 403 en el websocket justo tras iniciar sesión con `ApiClient` y, en 10.11.8, peticiones a `/web/null`. El harness lo esquiva (cierra los websockets uno a uno y reinicia el contenedor) | informar a Jellyfin |
| T-6 | Info | CSRF / inyección: todos los endpoints con efecto exigen la cabecera `Authorization` (no cookies), así que no son vulnerables a CSRF; todo el SQL de Reviews va parametrizado (probado con `'; --` y GUID basura); el único `innerHTML` restante es el HTML estático de los diálogos de JellyAsk y WeeklyPick (el texto del usuario va siempre con `textContent`) | ✔ |
| T-5 | Info | APIs: compilación con `TreatWarningsAsErrors` sin avisos de obsolescencia en 12.2 (`IActivityManager`, `IUserManager`, `ILibraryManager`, `ISessionManager`, `MediaStream`, `BaseItemKind`); solo sugerencias de estilo (CA1873/CA1859) | – |

## 5. Convención de apilado y capas

**Todos los botones flotantes de los plugins viven en un único contenedor `#jfp-fab-dock`**, creado por el primero que cargue (idempotente):

- Posición: esquina inferior derecha, `right: max(1rem, env(safe-area-inset-right))`, `bottom: calc(max(1rem, env(safe-area-inset-bottom)) + var(--jfp-dock-lift))`.
  `--jfp-dock-lift` sube el contenedor sobre la barra de reproducción nativa (`.nowPlayingBar`) cuando está visible.
- Apila hacia arriba (`flex-direction: column-reverse`), separación 0,7 rem. Cada botón fija su posición con `--jfp-order`:

  | order | plugin |
  | --- | --- |
  | 10 | JellyAsk (abajo del todo) |
  | 20 | Reviews (reservado: hoy no usa botón flotante) |
  | 30 | WeeklyPick (reservado: hoy solo avisa con diálogo) |
  | 40 | Report Problem |

- Tamaño mínimo 44x44 px, `aria-label`/`title`, `aria-haspopup="dialog"`, foco visible.
- El contenedor se oculta (`hidden`) sin sesión, en `#/video`, `#/queue`, `#/dashboard`, `#/configurationpage`, `#/login`, `#/selectserver`, `#/startup`, `#/forgotpassword`, `#/addserver`, `#/quickconnect`, `#/wizard` y en `layout-tv`.
- Se vuelve a evaluar en `hashchange`, `popstate`, `viewshow`, cambios directos en `<body>` y cada 3 s (el router no siempre emite `hashchange`).
- Plantilla mínima para un plugin nuevo (copiar `getDock()` y las reglas `#jfp-fab-dock` de `src/JellyAsk/wwwroot/jellyask.js`): crear su botón con `--jfp-order:<n>` y añadirlo al contenedor.

Capas (z-index): contenedor de botones **1000** (sobre el contenido y la cabecera 999; bajo la barra de reproducción 1201 y los menús 1300) ·
diálogos de los plugins **10000** (sobre la barra y los menús, bajo los diálogos nativos 999998/999999).
Los diálogos nativos y las capas del reproductor siempre quedan por encima.

Estilo común: `font: inherit; color: inherit`; superficie = fondo real de la página; botón principal = colores de un `button.emby-button.raised.button-submit` oculto (sigue temas y CSS de marca); bordes/rellenos con `rgba(128,128,128,.x)` (válidos en claro y oscuro);
estrella = `--jf-palette-starIcon-main`; errores = `--jf-palette-error-light`; `prefers-reduced-motion` respetado; `env(safe-area-inset-*)` en botones y diálogos.

## 6. Pruebas adicionales

| Escenario | Resultado |
| --- | --- |
| Tema simulado (CSS de marca: fondo claro, texto oscuro, botón principal rojo) | JellyAsk y Reviews lo siguen (12 comprobaciones); no se logró activar el tema claro real (el cambio de `appTheme` por la API de preferencias no tuvo efecto en el cliente y no localicé el control en la pantalla de preferencias en modo headless), así que **no está verificado con el tema claro real** |
| Layout TV (`layout-tv`) | FAB oculto, Reviews solo lectura, Language Badges y WeeklyPick operativos (el aviso toma el foco y se confina con `focuscontainer`) |
| Móvil iPhone 390x844 con táctil | Todas las pruebas de UI se repiten; `env(safe-area-inset-bottom)` no se puede emular en Chromium headless (se comprueba que el CSS lo usa) |
| Servidor nuevo sin bibliotecas | 13/13 PASS: API coherente (`{}`, 404 al reseñar algo inexistente, registro vacío, `Show=false`), sin chips ni widget y sin errores de consola en escritorio y móvil |
| Bajo BaseUrl `/jf` | con los **builds base**, JellyAsk, Reviews y WeeklyPick **no cargan** (su `<script>` apunta a `/X/ClientScript`, fuera del BaseUrl) y solo Language Badges funciona; con los builds nuevos: **209 PASS / 0 FAIL** bajo `/jf` |
| 30 usuarios concurrentes publicando reseñas / 60 búsquedas concurrentes | 0 errores |

## 7. Plan de versiones

| Plugin | Versión actual en producción | Propuesta | Tipo | Notas |
| --- | --- | --- | --- | --- |
| Reviews | 1.4.1.0 | **1.4.2.0 ya** (hotfix, rama `hotfix/reviews-1.4.2.0`) → después **1.5.0.0** | patch → minor | El hotfix arregla R-1/R-2 sin cambiar nada más. 1.5.0.0 añade validación y límites nuevos (comportamiento visible), nuevo estilo y TV. |
| JellyAsk | 1.2.0.0 | **1.3.0.0** (si se publica antes 1.2.1.0, solo es el cambio de cabecera) | minor | Nuevos límites (1000 caracteres, 5/min), dock de botones, diálogo nuevo. |
| Language Badges | 1.0.0.0 | **1.0.1.0** | patch | Robustez y repintado. |
| Search Notifier | 1.0.0.0 | **1.0.1.0** | patch | |
| Recomendación Semanal | 1.0.0.0 | **1.1.0.0** | minor | Nuevo endpoint `Seen`; `Reset` pasa a política de administrador. Las configuraciones guardadas no cambian. |
| Report Problem / Telegram Notifier | – | fuera de alcance | | Adoptar la convención del dock (sec. 5). |

Compatibilidad: ningún GUID ni propiedad de configuración cambia (`TelegramBotToken`, `TelegramChatId`, `Enabled`, `Entries`, …); la base `reviews.db` conserva el esquema (solo se añaden índices).
Todos los paquetes: `targetAbi 10.11.8.0`, net9 (sec. 3). Los zips (candidatos a release, **sin publicar**) están en `~/jellyfin-plugin/audit-12.2/out/10.11.8/` y `out/hotfix/` (md5):

| Zip | md5 |
| --- | --- |
| `Jellyfin.Plugin.JellyAsk_1.3.0.0.zip` | f35fcc161c2365d21e3248350ba4996f |
| `Jellyfin.Plugin.Reviews_1.5.0.0.zip` | ff14318303a0f7000e5087cc7e69773b |
| `Jellyfin.Plugin.LanguageBadges_1.0.1.0.zip` | 30c8047b6f6710d7431f2fa98303fef4 |
| `Jellyfin.Plugin.SearchNotifier_1.0.1.0.zip` | 02110c2f016842400375711b8133471a |
| `Jellyfin.Plugin.WeeklyPick_1.1.0.0.zip` | 99d69f3f4396aa295a99359affec991d |
| `out/hotfix/Jellyfin.Plugin.Reviews_1.4.2.0.zip` | 1d170ecba95d0a0ce753d50e005b79fe |

(El checksum del manifiesto se recalcula al publicar; estos md5 son de los zips locales. Los `manifest.json` no se han tocado.)

## 8. Pendiente y decisiones

1. **Publicar el hotfix de Reviews** (1.4.2.0) cuanto antes si producción ya está en 12.x o va a estarlo.
2. ¿Lectura pública de reseñas? Hoy `GET /Reviews/{id}` no exige sesión y muestra los nombres de reseñas no anónimas. Proponer: exigir sesión (cambio de comportamiento, 1 línea).
3. ¿Selector de idioma es/en? Recomendado solo como opción de configuración del plugin (`auto/es/en`, por defecto `es`), no por `documentElement.lang`.
4. Límites nuevos (JellyAsk 5/min y 1000 caracteres; Reviews 10 por elemento, 30/h y 2000 caracteres): confirmar que no son demasiado estrictos para los ~30 usuarios.
5. Tema claro real y `safe-area` en un iPhone real: sin verificar (limitaciones del entorno headless).
6. Informar a Jellyfin del cierre abrupto en `WebSocketController` (T-4).
7. R-12 (SQLite nativo) sin versión corregida disponible: revisar al actualizar paquetes.
8. Eliminar el nombre fijo «Tito» de la «Nota del director» (sigue siendo código fijo) si el plugin se comparte.
