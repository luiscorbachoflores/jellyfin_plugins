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
- `Message`: `Id (guid)`, `AdminUserId`, `Title`, `Body`, `CreatedUtc`, `TargetUserIds` (lista vacía = broadcast a todos).
- `MessageRead`: `MessageId`, `UserId`, `ReadUtc`.
- Persistencia embebida igual que Reviews (repositorio propio, sin depender de la BD core de Jellyfin).

**API / endpoints**
- `POST /AdminMessages` — crear (requiere `PermissionKind.IsAdministrator`).
- `GET /AdminMessages` — listar todos (admin).
- `PUT /AdminMessages/{id}` / `DELETE /AdminMessages/{id}` — editar/borrar (admin; cualquier admin puede gestionar los de otro admin, no solo los propios).
- `GET /AdminMessages/mine` — mensajes dirigidos al usuario autenticado (propios `UserId` + broadcast), con flag `isRead`.
- `POST /AdminMessages/{id}/read` — marcar leído (usuario autenticado, solo sobre mensajes que le aplican).

**UI / integración con jellyfin-web**
- Página nueva en el dashboard de admin ("Mensajes") para crear/listar/borrar, igual de sencilla que la gestión existente de Reviews.
- Icono con contador de no leídos en la barra del usuario normal (mismo patrón de inyección JS que usa JellyAsk en el menú), con desplegable listando mensajes y botón "marcar leído".

**Compatibilidad**
Fijar `Jellyfin.Controller`/`targetAbi` a la versión de producción vigente. No interfiere con Reviews/JellyAsk (entidades y rutas independientes).

**Plan de pruebas**
En el contenedor POC: crear mensaje broadcast y dirigido, comprobar que un usuario normal solo ve los suyos + broadcast, comprobar 401 sin auth y 403 si un usuario normal intenta los endpoints de admin, comprobar que "marcar leído" es idempotente.

**Preguntas abiertas (defaults asumidos, confirmar si no valen)**
- Sin caducidad: el mensaje queda hasta que el admin lo borra. *(asumido)*
- Unidireccional: el usuario no puede responder. *(asumido)*
- Sin aviso en vivo (WebSocket) en v1, solo bandeja persistente. *(asumido, se puede añadir después)*
