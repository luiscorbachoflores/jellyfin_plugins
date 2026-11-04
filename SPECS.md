# Specs de próximos plugins

Diseño de nuevos plugins antes de implementarlos. Vive en una rama separada de este repo hasta que el spec esté listo; el código final va a `main`.

## Plantilla

Copia este bloque para cada plugin nuevo:

### <Nombre del plugin>

**Estado:** idea | draft | review | ready | implemented
**Jellyfin objetivo:** <versión de producción en el momento de escribir esto — comprobar en la Pi>

**Problema / motivación** · **Alcance** · **Modelo de datos** · **API / endpoints** · **UI / integración con jellyfin-web** · **Compatibilidad** · **Plan de pruebas** · **Preguntas abiertas**

---

## Convenciones heredadas (Reviews / JellyAsk)

- Entorno de dev/pruebas: contenedor Docker en vm-titopc, no se compila directo en el host.
- Fijar siempre `Jellyfin.Controller` a la versión de producción vigente en la Pi al compilar, no a la última disponible.
- Cada `.csproj` necesita `<Version>/<AssemblyVersion>/<FileVersion>` explícitos, o el ensamblado queda en `0.0.0.0`.
- No tocar producción (Pi) sin permiso explícito; publicar primero el release en GitHub y esperar confirmación.

---

## 0001 — Blog de menciones semanales

**Estado:** idea
**Jellyfin objetivo:** por confirmar

Entradas de texto libre sobre pelis/series vistas, cadencia semanal aproximada. Sin desarrollar — definir modelo de datos, API y UI antes de retomarlo.

**Preguntas abiertas**
- ¿Entradas públicas (otros usuarios del servidor) o solo para el propio usuario?
- ¿Relación con Reviews (que ya guarda reseñas por item)? ¿Se solapa?
- ¿Cadencia forzada (recordatorio semanal) o libre?

---

## 0002 — AdminMessages (mensajes del administrador a los usuarios)

**Estado:** ready
**Jellyfin objetivo:** comprobar versión de producción en la Pi (config/plugins) antes de fijar `targetAbi`

**Problema / motivación**
Jellyfin no tiene forma de que el administrador deje avisos persistentes a los usuarios (solo existe el mensaje puntual en vivo de una sesión, que se pierde si el usuario no está conectado en ese momento). Se necesita un tablón/bandeja de mensajes que el usuario vea la próxima vez que entre.

**Alcance v1**
- El admin crea/edita/borra mensajes (título + cuerpo) desde una página nueva del dashboard.
- Cada mensaje se dirige a todos los usuarios o a una lista concreta de usuarios.
- Cada usuario ve sus mensajes (los suyos + los de "todos") en una bandeja, con contador de no leídos, y puede marcarlos como leídos.
- Fuera de v1: notificaciones push/email, caducidad automática, adjuntos, respuestas del usuario al admin.

**Modelo de datos**
- `Message`: `Id (guid)`, `AdminUserId`, `Title`, `Body`, `Link (opcional)`, `CreatedUtc`, `TargetUserIds` (lista vacía = broadcast a todos).
- `MessageRead`: `MessageId`, `UserId`, `ReadUtc`.
- Persistencia embebida igual que Reviews (repositorio propio, sin depender de la BD core de Jellyfin).

**API / endpoints**
- `POST /AdminMessages` — crear (requiere `PermissionKind.IsAdministrator`); acepta `Link` opcional.
- `GET /AdminMessages` — listar todos (admin).
- `PUT /AdminMessages/{id}` / `DELETE /AdminMessages/{id}` — editar/borrar (admin; cualquier admin puede gestionar los de otro admin, no solo los propios).
- `GET /AdminMessages/mine` — mensajes dirigidos al usuario autenticado (propios `UserId` + broadcast), con flag `isRead`.
- `POST /AdminMessages/{id}/read` — marcar leído (usuario autenticado, solo sobre mensajes que le aplican).

**UI / integración con jellyfin-web**
- Página nueva en el dashboard de admin ("Mensajes") para crear/listar/borrar, igual de sencilla que la gestión existente de Reviews. Incluye campo opcional "Link".
- Icono con contador de no leídos en la barra del usuario normal (mismo patrón de inyección JS que usa JellyAsk en el menú), con desplegable listando mensajes y botón "marcar leído". Si el mensaje tiene `Link`, se muestra como botón/enlace dentro de su entrada en el desplegable.

**Compatibilidad**
Fijar `Jellyfin.Controller`/`targetAbi` a la versión de producción vigente. No interfiere con Reviews/JellyAsk (entidades y rutas independientes).

**Plan de pruebas**
En el contenedor POC: crear mensaje broadcast y dirigido, comprobar que un usuario normal solo ve los suyos + broadcast, comprobar 401 sin auth y 403 si un usuario normal intenta los endpoints de admin, comprobar que "marcar leído" es idempotente.

**Preguntas abiertas (defaults asumidos, confirmar si no valen)**
- Sin caducidad: el mensaje queda hasta que el admin lo borra. *(asumido)*
- Unidireccional: el usuario no puede responder. *(asumido)*
- Sin aviso en vivo (WebSocket) en v1, solo bandeja persistente. *(asumido, se puede añadir después)*

---

## 0003 — Announcements (aviso de recap anual) → resuelto dentro de 0002

**Estado:** ready (decisión de diseño cerrada 2026-11-04)

**Problema / motivación**
Avisar a todos los usuarios de que su recap anual está listo en `recap.titoteca.net`, con un aviso visible al entrar en Jellyfin.

**Decisión:** no se construye como plugin aparte. Se detectó que es un subconjunto de AdminMessages (0002): un mensaje broadcast (sin `TargetUserIds`) con el campo `Link` opcional ya añadido ahí. Evita duplicar controller/repositorio/inyección JS por una funcionalidad casi idéntica.

**Cómo se usa en la práctica:** cuando el recap esté listo, el admin crea un mensaje en AdminMessages sin destinatarios (broadcast) con `Link` = URL de `recap.titoteca.net`. No requiere cambios de código adicionales sobre lo ya especificado en 0002.

**Fuera de alcance (de jellyfin_plugins, en cualquier caso):** `recap.titoteca.net` en sí — sitio aparte con login propio contra `/Users/AuthenticateByName` del Jellyfin real, scroll-scrubbing con `<canvas>`, narrativa de dos actos (cine/tele) + insignia privada. Brainstorming ya cerrado (narrativa, paleta oscura cálida + teal retro, tipografías Anton/Space Mono/Work Sans, spike visual aprobado), datos de Playback Reporting verificados (2309 registros). Pendiente: documento de diseño formal y luego implementación — es un proyecto propio, no parte de este repo.

---

## 0004 — Watchlist (lista personal "para ver" por usuario)

**Estado:** ready (spec cerrada 2026-11-04)
**Jellyfin objetivo:** 12.2 (inferido de `manifest.json`, igual que AdminMessages) — `Jellyfin.Controller`/`Jellyfin.Model` 12.2.0, `net10.0`, con el mismo `TODO: confirmar targetAbi contra producción` en el `.csproj` hasta que se compruebe en la Pi.

**Problema / motivación**
Cada usuario quiere apuntarse películas y series para ver más tarde, sin mezclarlo con Favoritos (que en Jellyfin significa "me gusta", no "pendiente"). La entrada tiene que estar donde ya están Perfil y Ajustes, y el botón de añadir dentro de la ficha de cada título, con la menor fricción visual posible y aguantando actualizaciones de jellyfin-web.

**Alcance v1**
- Botón "Añadir a mi lista" / "En mi lista" en la ficha de películas y series (toggle).
- Entrada "Mi lista" en el menú del usuario (el mismo donde están Perfil y Ajustes) que abre la watchlist del usuario.
- La watchlist es estrictamente personal: cada usuario solo ve y modifica la suya. Ni siquiera un admin ve la de otros por API.
- Fuera de v1: episodios/temporadas sueltos, orden manual, compartir listas, notificar cuando algo de la lista se añade a la biblioteca, sincronizar con apps nativas (Android TV, Swiftfin...). Solo cliente web.

**Decisión de almacenamiento:** store propio en SQLite (patrón Reviews/AdminMessages), no una playlist nativa: una playlist expande las series en todos sus episodios y obligaría a reescribir su contenido desde el plugin; con store propio la serie es una sola entrada. Contrapartida aceptada: la lista solo se ve en el cliente web.

**Modelo de datos**
- `WatchlistEntry`: `UserId` (string, Guid "D"), `ItemId` (string, Guid "D"), `AddedUtc` (ISO-8601). PK `(UserId, ItemId)`.
- Fichero: `<PluginsPath>/Watchlist.Data/watchlist.db` (mismo patrón de ruta que Reviews/AdminMessages).
- Límite: 500 entradas por usuario (añadir la 501 → 400 con mensaje claro).
- Solo `BaseItemKind.Movie` y `BaseItemKind.Series` son elegibles.

**API / endpoints** (ruta base `/Watchlist`, `[AllowAnonymous]` a nivel de clase y comprobación manual con `IAuthorizationContext`, como AdminMessages; el `UserId` sale SIEMPRE de `authInfo.UserId`, nunca del cliente)
- `GET /Watchlist/ClientScript` — script embebido, `no-store` (igual que los demás plugins).
- `GET /Watchlist` — la watchlist del usuario autenticado, ordenada por `AddedUtc` desc. Cada entrada se resuelve en servidor con `ILibraryManager.GetItemById(Guid)`: devuelve `ItemId, Name, Type ("Movie"|"Series"), ProductionYear?, HasPrimaryImage, AddedUtc`. Las entradas cuyo item ya no existe se borran del store en esa misma llamada (autolimpieza). Las que existen pero el usuario ya no puede ver (cambio de permisos de biblioteca) se omiten de la respuesta pero NO se borran.
- `GET /Watchlist/Items/{itemId}` — estado para la ficha: `{ Eligible: bool, InWatchlist: bool }`. `Eligible` = existe, es Movie/Series y el usuario lo puede ver. El cliente NO decide el tipo: si `Eligible` es false no se pinta botón.
- `POST /Watchlist/Items/{itemId}` — añadir (idempotente: añadir dos veces = 204 sin duplicar). 404 si el item no existe o el usuario no lo puede ver (no filtrar existencia de items fuera de sus bibliotecas); 400 si no es Movie/Series o se supera el límite.
- `DELETE /Watchlist/Items/{itemId}` — quitar (idempotente: 204 aunque no estuviera).
- Sin auth → 401 en todos salvo `ClientScript`. No hay endpoints de admin.

**Visibilidad (seguridad):** comprobar con `item.IsVisibleStandalone(authInfo.User)` (verificado por reflexión en `Jellyfin.Controller` 12.2.0: existe con firma `bool IsVisibleStandalone(User)`; `IsVisible` en 12.2 pide un segundo parámetro `bool`, no usarlo). Tipo con `item.GetBaseItemKind()` (`Jellyfin.Data.Enums.BaseItemKind`). Recordatorio: `User.HasPermission()` no existe en 12.2 (ver AdminMessages); aquí no hace falta porque no hay endpoints de admin.

**UI / integración con jellyfin-web**

Principios (son la parte "seamless" y "resistente a versiones", obligatorios):
1. Anclar por **contrato de DOM estable** (ids, `href` de rutas, roles ARIA), nunca por clases generadas (`.css-xxxx`, `.MuiXxx-root` como selector principal) ni por estructura profunda.
2. Imitar estilo **copiando las clases** del elemento hermano, sin `cloneNode` del elemento raíz: crear un elemento nuevo del mismo tag, copiar `className` e `innerHTML` y ajustar texto/icono. Motivo: los anclajes legacy son customized built-ins (`is="emby-linkbutton"`, `is="emby-ratingbutton"`) y un `cloneNode` arrastraría su comportamiento (navegación propia, toggle de favorito).
3. Un único `MutationObserver` sobre `document.body`, con trabajo agrupado en `requestAnimationFrame`. Cada inyección es idempotente (marcador `data-watchlist="..."`), y si React o el viewManager re-renderizan y la quitan, se vuelve a poner sola.
4. Ninguna estrategia puede lanzar excepción ni romper la página: cada una va en `try/catch`. Si ninguna encaja, simplemente no se pinta nada (sin FAB ni botones flotantes de emergencia).
5. Log de diagnóstico solo si `localStorage['watchlist.debug'] === '1'`: qué estrategia encajó en cada punto (`[Watchlist] menu: modern-app-user-menu`, etc.). Para validar en el POC y tras cada actualización de Jellyfin.
6. Cabecera `Authorization: MediaBrowser Token="..."` (requisito de 12.x, ver JellyAsk 1.2.1.0).

Contrato de DOM verificado leyendo el código fuente de jellyfin-web en las etiquetas **v10.11.11, v12.2 y v12.4** (idéntico en las tres, aunque los ficheros fuente cambian de ruta entre versiones):

| Punto | Layout | Anclaje | Fuente (v12.2) |
|---|---|---|---|
| Menú del usuario | moderno (por defecto en escritorio con "Auto") | `#app-user-menu` (MUI `Menu`, `keepMounted`: está en el DOM aunque esté cerrado) → `a[href*="mypreferencesmenu"]` (item "Ajustes"); hermano anterior `a[href*="userprofile"]` ("Perfil") | `src/components/toolbar/AppUserMenu.tsx` |
| Menú del usuario | legacy / TV (el avatar navega a `#/mypreferencesmenu`, una página-lista) | `a.lnkUserProfile` (item "Perfil", `href="#/userprofile?userId=..."`) dentro de la página visible | `src/apps/legacy/routes/user/settings/index.tsx` |
| Ficha | ambos (el layout moderno sigue usando la vista legacy `details`) | `.itemDetailPage:not(.hide) .mainDetailButtons`, botones `.detailButton` con `.detailButton-content > .material-icons.detailButton-icon`; colocar justo después de `.btnUserRating` (favorito) si existe, si no al final del contenedor | `src/apps/legacy/controllers/itemDetails/index.html` |
| Navegación | ambos | `createHashRouter`: rutas como `#/details?id=<itemId>` | `src/RootAppRouter.tsx` |

Comportamiento concreto:
- **Menú moderno:** insertar "Mi lista" justo después del item de Ajustes, construido como `a` nuevo con las clases e `innerHTML` del item de Ajustes; sustituir el `<svg>` del icono por el path del icono Material "Bookmark" (`M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z`) y el texto por "Mi lista". `role="menuitem"` y `tabindex="-1"`, como sus hermanos. Al hacer clic: `preventDefault`, cerrar el menú (despachar `keydown` `Escape` sobre el `[role="menu"]`; si sigue abierto, clic en el backdrop de `#app-user-menu`) y abrir la vista de watchlist.
- **Menú legacy/TV:** insertar después de `a.lnkUserProfile` un `a` nuevo con sus clases e `innerHTML`, icono `bookmark` y texto "Mi lista". Debe ser enfocable con mando (TV): `href="#"` + `tabindex` igual que el original. Clic → `preventDefault` + abrir la vista.
- **Ficha:** al ver `#/details?id=...` y existir `.itemDetailPage:not(.hide) .mainDetailButtons`, pedir `GET /Watchlist/Items/{id}`. Si `Eligible`, insertar `<button type="button" class="button-flat detailButton">` con `<div class="detailButton-content"><span class="material-icons detailButton-icon bookmark_border|bookmark" aria-hidden="true"></span></div>`, con `title`/`aria-label` "Añadir a mi lista" / "Quitar de mi lista" y `aria-pressed`. Toggle optimista, que revierte si la API falla. Cuidado: el viewManager mantiene vistas anteriores ocultas en el DOM, así que solo se toca la vista visible y se re-evalúa al cambiar el `id` del hash (y en `viewshow`).
- **Vista de watchlist:** overlay a pantalla completa (`role="dialog"`, `aria-modal="true"`), sin ruta propia (el router de jellyfin-web mostraría un 404 en una ruta desconocida). Hereda fuente y color de texto y toma el fondo de `getComputedStyle(document.body).backgroundColor`. Rejilla de pósters (`/Items/{id}/Images/Primary?fillHeight=300&quality=90` si `HasPrimaryImage`, si no un placeholder con el título), título, año y botón de quitar. Clic en la tarjeta → `location.hash = '#/details?id=<id>'` y cerrar. Se cierra con Escape, con un botón cerrar y en cualquier `hashchange`. El foco vuelve al elemento que la abrió. Estado vacío: "Tu lista está vacía. Añade títulos desde su ficha."
- **Acceso de emergencia:** si la URL contiene `watchlist=open` en el hash (p. ej. `#/home?watchlist=open`), abrir la vista al cargar. Así hay una forma de llegar a la lista aunque una versión futura rompa los dos anclajes de menú; documentarlo en el README.
- Textos en español, como el resto de plugins.

**Compatibilidad**
Entidades, rutas (`/Watchlist`) y marcadores DOM (`data-watchlist`) propios, sin colisión con Reviews/JellyAsk/AdminMessages/WeeklyPick (el FAB de JellyAsk queda abajo a la derecha y el de AdminMessages abajo a la izquierda; Watchlist no añade FAB). `Version`/`AssemblyVersion`/`FileVersion` explícitos a `1.0.0.0` desde el primer commit.

**Plan de pruebas**
- En el sandbox (sin Jellyfin real): xunit para repositorio (añadir/quitar idempotente, límite 500, aislamiento entre usuarios, orden, autolimpieza), para la regla de elegibilidad y la política de acceso como funciones puras sin tipos de Jellyfin en runtime (mismo motivo que `AdminAccessPolicy`: `ExcludeAssets="runtime"`), y para la serialización de DTOs. Además, smoke test del script con Playwright + Chromium contra **fixtures HTML escritos a mano** que reproducen los anclajes de la tabla (menú moderno, página legacy, ficha), con `fetch` simulado. Prueba que la lógica de inyección, la idempotencia y el re-inyectado tras borrar el nodo funcionan. NO prueba que el DOM real de 12.2 sea así.
- En el contenedor POC (lo hace Luis): el menú moderno y la página legacy muestran "Mi lista" con el mismo aspecto que sus vecinos; el botón aparece en películas y series y no en episodios, música, etc.; añadir/quitar persiste tras recargar; dos usuarios no ven la lista del otro; 401 sin sesión; un usuario sin acceso a una biblioteca recibe 404 al intentar añadir un item de ella; el modo TV se navega con teclado; `localStorage['watchlist.debug']='1'` muestra en consola qué estrategia encajó.

**Preguntas abiertas (defaults asumidos, confirmar si no valen)**
- Solo películas y series, no episodios ni temporadas. *(asumido)*
- No se marca nada automáticamente al ver un título (no se quita de la lista al terminarlo). *(asumido; se podría añadir con `IUserDataManager` en v2)*
- Límite de 500 por usuario. *(asumido)*
