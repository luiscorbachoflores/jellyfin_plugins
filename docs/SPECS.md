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

## 0001 — Blog de cine (estilo Blogspot)

**Estado:** ready (spec cerrada 2026-11-04; sustituye a la idea "Blog de menciones semanales")
**Jellyfin objetivo:** 12.2 (inferido de `manifest.json`, igual que AdminMessages y Watchlist) — `Jellyfin.Controller`/`Jellyfin.Model` 12.2.0, `net10.0`, con el mismo `TODO: confirmar targetAbi contra producción` en el `.csproj`.

**Respuestas a las preguntas de la idea original**
- ¿Público o privado? → Público para todos los usuarios con sesión en el servidor: cualquiera lee y cualquiera publica.
- ¿Se solapa con Reviews? → No. Reviews es una nota y un comentario cortos colgados de un título. El blog son entradas largas de tema libre que pueden mencionar varios títulos o ninguno.
- ¿Cadencia? → Libre, sin recordatorios.

**Problema / motivación**
Un sitio dentro de Jellyfin para hablar de cine entre los usuarios del servidor: un blog de grupo con entradas, comentarios y etiquetas. Debe ser una pantalla más de Jellyfin, con su estilo, y no una web aparte. La estructura imita los blogs clásicos de Blogspot, quedándose solo con las piezas que tienen sentido aquí.

**Alcance v1**
- Pantalla propia en `#/blog`, abierta a todos los usuarios con sesión, con entrada en el menú lateral de los dos layouts.
- Entradas: título, cuerpo en texto plano, etiquetas, títulos de la biblioteca mencionados y marca "contiene spoilers".
- Comentarios bajo cada entrada.
- Columna lateral: buscador, archivo por año y mes, etiquetas, colaboradores y comentarios recientes.
- El autor edita y borra lo suyo. Un admin puede borrar cualquier entrada o comentario (moderación), pero no editar lo de otros.
- Fuera de v1: texto enriquecido o HTML, imágenes subidas, borradores y programación, "me gusta"/reacciones, notificaciones de entradas o respuestas nuevas, feed RSS/Atom (exigiría acceso anónimo), varios blogs, y enlazar desde la ficha de una película a las entradas que la mencionan.

**Qué se toma de Blogspot y qué no**
Se queda (tiene sentido en un blog de grupo dentro de Jellyfin):
- Cabecera con el título y la descripción del blog.
- Columna principal con las entradas en orden cronológico inverso, agrupadas bajo una **cabecera de fecha** ("miércoles, 4 de noviembre de 2026").
- Pie de entrada: "Publicado por *usuario* a las 21:30 · 3 comentarios · Etiquetas: *a*, *b*".
- "Leer más »" cuando el cuerpo es largo.
- Paginación del pie: "« Entradas más recientes · Página principal · Entradas antiguas »".
- En la página de una entrada, los comentarios con su formulario "Publicar un comentario", y la navegación "Entrada más reciente / Entrada antigua".
- Barra lateral: "Buscar en este blog", "Archivo del blog" (árbol plegable año ▸ mes con contadores y los títulos del mes desplegado), "Etiquetas" (con contador), "Colaboradores" y "Comentarios recientes".

Se descarta (no tiene sentido aquí):
- Seguidores, contador de visitas, blogroll y widget "Datos personales" (es un blog de grupo).
- Suscripción Atom, botones de compartir, barra superior de Blogger, temas o plantillas y publicidad.

**Modelo de datos** (SQLite propio: `<PluginsPath>/Blog.Data/blog.db`)
- `Post`: `Id` (Guid "D"), `AuthorUserId`, `Title`, `Body`, `HasSpoilers` (bool), `CreatedUtc`, `UpdatedUtc` (null si nunca se editó).
- `PostLabel`: `PostId`, `Label`, con PK `(PostId, Label)`. La etiqueta se guarda recortada y en minúsculas.
- `PostMention`: `PostId`, `ItemId` y `Position`, con PK `(PostId, ItemId)`.
- `Comment`: `Id` (Guid), `PostId`, `AuthorUserId`, `Body`, `CreatedUtc`, `UpdatedUtc`.
- Al borrar una entrada se borran en la misma transacción sus etiquetas, menciones y comentarios.
- El nombre del autor NO se guarda: se resuelve al leer con `IUserManager.GetUserById(Guid)` → `Username`. Si el usuario ya no existe, se muestra "Usuario eliminado".

**Límites y validación** (todo en clases puras testeables, sin tipos de Jellyfin; mismo motivo que `AdminAccessPolicy`/`LinkPolicy`):
- **Entrada:** título de 1 a 150 caracteres y cuerpo de 1 a 20.000 (ambos tras recortar espacios).
- **Comentario:** de 1 a 4.000 caracteres.
- **Etiquetas:** hasta 5 por entrada, de 1 a 30 caracteres cada una. Sin comas, sin caracteres de control y sin duplicados.
- **Menciones:** hasta 10 por entrada. Al guardar, cada una tiene que existir, ser `Movie` o `Series` y ser visible para el autor (`IsVisibleStandalone(user)`). Si alguna no cumple → 400, sin decir cuál falló por permisos.
- El cuerpo y los comentarios son **texto plano** y nunca se interpretan como HTML.

**API / endpoints** (ruta base `/Blog`)
- Mismo patrón que los demás plugins: `[AllowAnonymous]` a nivel de clase y comprobación manual con `IAuthorizationContext`.
- Todo salvo `ClientScript` exige sesión con `User`: 401 si no hay sesión, si es una API key o si la sesión no tiene `User`.
- Admin = `User.Permissions.Any(p => p.Kind == PermissionKind.IsAdministrator && p.Value)`.

Endpoints:
- `GET /Blog/ClientScript` — script embebido (`no-store`).
- `GET /Blog/Info` — `{ Title, Description }` desde la configuración del plugin.
- `GET /Blog/Posts?page=1&label=&archive=YYYY-MM&author=<userId>&item=<itemId>&q=` — 10 entradas por página, más recientes primero. Los filtros se pueden combinar.
  - Devuelve `{ Posts, Page, HasNewer, HasOlder }`. Cada entrada lleva `Id, Title, Excerpt, IsTruncated, HasSpoilers, Author{UserId, Name}, CreatedUtc, UpdatedUtc, Labels[], Mentions[], CommentCount, CanEdit, CanDelete`.
  - `Excerpt` es el cuerpo cortado a 1.500 caracteres por un límite de palabra; `IsTruncated` indica si se cortó.
  - `q` busca con `LIKE` en título y cuerpo. Es insensible a mayúsculas solo en ASCII (limitación de SQLite aceptada).
  - Con `item=` solo hay resultados si el lector puede ver ese título; si no, lista vacía.
- `GET /Blog/Posts/{id}` — entrada completa (`Body` en lugar de `Excerpt`) con `Comments[]` (cada uno con `Id, Author, Body, CreatedUtc, UpdatedUtc, CanEdit, CanDelete`), más `Newer` y `Older` (`{Id, Title}` o null). 404 si no existe.
- `POST /Blog/Posts`, `PUT /Blog/Posts/{id}` — cuerpo `{ Title, Body, Labels[], MentionItemIds[], HasSpoilers }`. Solo el autor puede editar (403 si no lo es, aunque sea admin). Editar fija `UpdatedUtc`.
- `DELETE /Blog/Posts/{id}` — el autor o un admin; si no, 403.
- `POST /Blog/Posts/{id}/Comments` (`{ Body }`), `PUT /Blog/Comments/{id}` (solo el autor), `DELETE /Blog/Comments/{id}` (el autor o un admin).
- `GET /Blog/Sidebar` — todo lo de la barra lateral en una sola llamada:
  - `Archive`: `[{ Year, Count, Months: [{ Month, Count, Posts: [{Id, Title}] }] }]`.
  - `Labels`: `[{ Name, Count }]`, en orden alfabético.
  - `Authors`: `[{ UserId, Name, PostCount }]`.
  - `RecentComments`: los últimos 5, como `[{ PostId, PostTitle, AuthorName, Excerpt (120 caracteres), CreatedUtc }]`.
- Las menciones se resuelven por lector: cada una es `{ ItemId, Name, Type, ProductionYear, HasPrimaryImage }` y solo se incluye si `IsVisibleStandalone(lector)`. Las que ya no existen se omiten al leer, sin borrarlas.

**Configuración del plugin** (página de admin con `IHasWebPages`, como los demás):
- `Title`, por defecto "Blog de cine".
- `Description`, por defecto "Lo que vemos, lo que nos gusta y lo que no."
- `ShowInMenu`, por defecto `true`.

**UI / integración con jellyfin-web**

Todo lo verificado en el código fuente de jellyfin-web **v10.11.11, v12.2 y v12.4** (idéntico en las tres; en 10.11 los layouts se llaman `stable`/`experimental` en vez de `legacy`/`modern`).

*La pantalla (la clave del diseño).* No se puede usar la vía nativa de páginas de plugin: `#/configurationpage` está detrás de `ConnectionRequired level='admin'` y usa el layout del panel de control (`src/apps/dashboard/routes/routes.tsx`). En cambio, cualquier ruta desconocida la resuelve la ruta comodín `path: '*'` con `FallbackRoute` (`src/components/router/FallbackRoute.tsx`). Esa ruta pinta un `<Page id="fallbackPage" className="mainAnimatedPage libraryPage">` real dentro del layout de la app: con cabecera, tema, botón atrás e historial del navegador, en los dos layouts.

El blog vive en `#/blog`. Todas sus vistas usan esa misma ruta con parámetros (`#/blog`, `#/blog?post=<id>`, `#/blog?label=x`, `#/blog?archive=2026-11`, `#/blog?author=<id>`, `#/blog?item=<id>`, `#/blog?q=texto`, `#/blog?page=2`, `#/blog?new`, `#/blog?edit=<id>`). Así nunca se sale de `FallbackRoute`. Reglas:
1. Al cargar el script y en cada `hashchange`, si la ruta es `/blog`, poner de forma síncrona la clase `blogRoute` en `<html>`, y quitarla si no lo es. Con CSS (`html.blogRoute #fallbackPage > :not([data-blog-root]) { display: none !important }`) se oculta el texto de "página no encontrada" sin tocar los nodos de React.
2. Cuando aparezca `#fallbackPage` estando en la ruta del blog (con el mismo `MutationObserver` agrupado con `requestAnimationFrame` que Watchlist), añadir como **último hijo** un `<div data-blog-root>` y pintar dentro.
   - Nunca se borran ni se modifican los hijos de React. `FallbackRoute` tiene hijos estáticos, así que React no hace inserciones que choquen con el nodo añadido.
   - Si el nodo desaparece, se vuelve a poner.
3. Navegar entre vistas del blog no remonta la página: se vuelve a pintar con `hashchange`. Al salir de `/blog`, React desmonta `#fallbackPage` y el blog desaparece con ella.
4. Título: en cuanto se detecta la página, poner `data-title` de `#fallbackPage` al título del blog. `libraryMenu` lo lee en `pageshow` (`src/scripts/libraryMenu.js`). Además, en cada pintado poner `document.title` y el texto de `.pageTitle` si existe (cabecera legacy).
5. Sin sesión (`ApiClient.accessToken()` vacío): mostrar "Inicia sesión para leer el blog" con un enlace a `#/login`. La ruta comodín es pública y no protege nada por sí sola; la protección real está en la API.

*Entrada en el menú lateral.* Se usa la función oficial `menuLinks` del `config.json` de jellyfin-web. Se pinta en los dos layouts (`.customMenuOptions` en `src/scripts/libraryMenu.js` y la sección de enlaces personalizados de `src/apps/modern/components/drawers/MainDrawerContent.tsx`), con el icono y el estilo nativos. Así el menú no necesita inyección de DOM.
- **Servidor:** un middleware, igual que el de `index.html`, intercepta `GET /web/config.json`. Si `ShowInMenu` está activo, añade `{"name": "Blog", "icon": "article", "url": "#/blog"}` a `menuLinks`.
  - Conserva los enlaces que ya hubiera puesto el admin, no duplica la entrada y, si el JSON no se puede parsear, lo devuelve intacto.
  - La lógica de fusión va en una función pura testeable (`ConfigJsonPatcher`).
  - Mismo cuidado con `Accept-Encoding`/304 que en `IndexHtmlInjectionMiddleware`.
  - Icono `article` comprobado en `material-design-icons-iconfont` 6.7.0, la versión que usa jellyfin-web.
- **Cliente:** los dos layouts ponen `target="_blank"` a estos enlaces. Un listener de `click` en **fase de captura** sobre `document` detecta un `a` cuyo `href` acabe en `#/blog`, hace `preventDefault` + `stopPropagation` y navega con `location.hash = '#/blog'`. En el layout moderno, además, cierra el cajón con `Escape`, como en Watchlist.
  - Si el script no llegara a cargar, el enlace sigue funcionando, solo que en una pestaña nueva.

*Estilo.* Se hereda la tipografía de Jellyfin. Los colores salen de las variables CSS del tema MUI, presentes en las tres versiones (`cssVarPrefix: 'jf'` en `src/themes/index.ts`, y en `src/themes/themes.ts` en 10.11), siempre con un valor de respaldo:
- `var(--jf-palette-primary-main, #00a4dc)`;
- `var(--jf-palette-background-paper, rgba(255,255,255,.05))`;
- `var(--jf-palette-text-primary, inherit)`;
- `var(--jf-palette-text-secondary, ...)`;
- `var(--jf-palette-divider, rgba(128,128,128,.3))`.

Todo el CSS va bajo `[data-blog-root]` y no usa ninguna clase interna de MUI.
- **Disposición:** dos columnas, la principal de unos 2/3 y la lateral a la derecha. Por debajo de unos 800px pasa a una sola columna, con la lateral debajo.
- **Contenedor:** el contenido usa `padded-left padded-right`, clases genéricas de jellyfin-web que existen desde siempre.

*Renderizado seguro (obligatorio).*
- Todo el contenido de usuarios (títulos, cuerpos, comentarios, etiquetas y nombres) se inserta como **texto**, con `textContent` o `createTextNode`.
- Las URLs http(s) del cuerpo y de los comentarios se convierten en enlaces creando el `<a>` por DOM (`href` solo si es http(s), `target="_blank"`, `rel="noopener noreferrer"`). Nunca con `innerHTML` sobre texto de usuario.
- El cuerpo usa `white-space: pre-wrap`.

*Vistas.*
- **Portada** (`#/blog`): cabecera (título y descripción) con el botón "Nueva entrada", la lista de entradas con su cabecera de fecha y la paginación de Blogspot.
- **Filtros** (etiqueta, archivo, autor, título o búsqueda): un aviso arriba del tipo "Mostrando las entradas con la etiqueta *x*. Mostrar todas las entradas".
- **Spoilers:** si la entrada los tiene, el cuerpo se oculta tras un botón "Contiene spoilers — mostrar", tanto en la lista como en la página de la entrada.
- **Menciones:** fila de pósters pequeños (`/Items/{id}/Images/Primary?fillHeight=180&quality=90`, o un recuadro con el nombre si no hay imagen). Cada póster lleva a `#/details?id=<id>`, y un enlace "Más entradas sobre este título" va a `#/blog?item=<id>`.
- **Entrada** (`#/blog?post=<id>`): cuerpo completo, botones "Editar"/"Eliminar" si `CanEdit`/`CanDelete`, comentarios y formulario, y navegación entre entradas. Lo editado se marca con "(editado)".
- **Editor** (`#/blog?new`, `#/blog?edit=<id>`) con estos campos:
  - Título.
  - Cuerpo (textarea).
  - Etiquetas, separadas por comas.
  - "Contiene spoilers".
  - "Títulos mencionados": buscador que consulta la API **nativa** de Jellyfin con el token del usuario (`GET /Items?searchTerm=...&IncludeItemTypes=Movie,Series&Recursive=true&Limit=8&Fields=ProductionYear`), así que ya respeta sus permisos. Los resultados se añaden como chips quitables.

  Botones "Publicar"/"Guardar" y "Cancelar". Los errores de validación del servidor se muestran tal cual.
- **Borrar** pide confirmación. Tras borrar una entrada se vuelve a la portada.
- Funciona con mando en el layout TV: solo se usan elementos enfocables nativos (`button`, `a`, `input`, `textarea`), sin `div` clicables.
- Diagnóstico con `localStorage['blog.debug'] === '1'`, igual que Watchlist.
- Cabecera `Authorization: MediaBrowser Token="..."`. Textos en español.

**Compatibilidad**
- No choca con los otros plugins: ruta `/Blog`, marcadores `data-blog-*`, clase `blogRoute`, carpeta `Blog.Data` y un middleware propio que solo toca `/web/config.json`.
- Convive con un `config.json` personalizado por el admin.
- `Version`/`AssemblyVersion`/`FileVersion` explícitos a `1.0.0.0`.
- Si una versión futura de jellyfin-web añadiera una ruta real `/blog` o quitara la ruta comodín, el blog dejaría de verse (sin romper nada más). El modo diagnóstico lo dejaría claro.

**Plan de pruebas**
- **En el sandbox (xunit):**
  - Repositorio: CRUD, borrado en cascada, paginación, cada filtro, búsqueda, contadores del archivo, etiquetas, colaboradores y comentarios recientes.
  - Validaciones y política de autoría (autor, admin, otro usuario), como funciones puras.
  - `ConfigJsonPatcher`: añade el enlace, no lo duplica, conserva enlaces previos, crea `menuLinks` si falta y deja intacto un JSON inválido o un `ShowInMenu` desactivado.
  - Forma del JSON de los DTOs y recorte del `Excerpt` por palabras.
- **En el sandbox (Playwright + Chromium):** fixtures escritos a mano que reproducen `#fallbackPage`, el cajón legacy con `.customMenuOptions` y un `a[target=_blank][href="#/blog"]`, con `fetch` simulado. Tienen que comprobar:
  - que el blog sustituye al texto de "no encontrada";
  - el título;
  - el repintado al cambiar de vista;
  - que fuera de `/blog` no se toca nada;
  - la reinserción si se borra el nodo;
  - la interceptación del clic del menú;
  - que el texto con `<script>`/`<img onerror>` en títulos, cuerpos, comentarios y etiquetas sale como texto literal;
  - que las URLs se convierten en enlaces y `javascript:` no;
  - el ocultado de spoilers.

  No demuestran la compatibilidad con el DOM real.
- **En el contenedor POC (lo hace Luis):**
  - la entrada "Blog" aparece en el menú lateral de los dos layouts y abre en la misma pestaña;
  - `#/blog` no muestra ni por un instante "página no encontrada" y el título de la pestaña es el del blog;
  - el botón atrás del navegador funciona entre vistas;
  - dos usuarios publican y comentan; un tercero no puede editar ni borrar lo ajeno, y un admin puede borrar pero no editar;
  - las menciones de una biblioteca a la que un usuario no tiene acceso no le aparecen;
  - el tema claro también se ve bien;
  - el `config.json` con enlaces propios los conserva.

**Preguntas abiertas (defaults asumidos, confirmar si no valen)**
- Un único blog compartido, no uno por usuario. *(asumido)*
- Cualquier usuario con sesión puede publicar; sin lista blanca. *(asumido)*
- El admin borra pero no edita contenido ajeno. *(asumido)*
- Texto plano con enlaces automáticos, sin formato ni imágenes subidas. *(asumido)*
- Sin notificaciones de entradas o comentarios nuevos en v1 (candidato natural para v2: aviso vía AdminMessages o en la ficha). *(asumido)*

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
