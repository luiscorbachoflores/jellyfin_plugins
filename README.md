# Reviews — Plugin de reseñas para Jellyfin

Plugin para Jellyfin que añade un bloque de reseñas de usuarios a la página de detalle de cada película o serie: valoración por estrellas en pasos de 0,5, comentario de texto y opción de publicar como usuario identificado de Jellyfin o de forma anónima.

## Características

- **Valoración por estrellas en medios puntos** (0,5 a 5,0).
- **Comentario de texto libre** junto a cada valoración.
- **Modo anónimo o usuario Jellyfin**: un toggle permite elegir si la reseña se publica con el nombre de usuario autenticado o como "Anónimo". Publicar como usuario requiere una sesión Jellyfin válida (se verifica el token en el servidor).
- **Sin tocar jellyfin-web**: el plugin inyecta su script en `index.html` en tiempo de respuesta (middleware ASP.NET Core), no modifica ningún fichero del cliente web. Sobrevive a actualizaciones del servidor salvo que Jellyfin cambie de forma importante la estructura de la página de detalle.
- **Almacenamiento propio en SQLite**, dentro de la carpeta de datos del propio plugin.
- **API REST propia**:
  - `GET /Reviews/{itemId}` — lista de reseñas y media.
  - `POST /Reviews/{itemId}` — crear una reseña (`Rating`, `Comment`, `AsAnonymous`).

## Instalación

### Vía repositorio de plugins (recomendado)

1. En Jellyfin, ve a **Panel de control → Complementos → Repositorios** y añade:
   `https://github.com/luiscorbachoflores/plugin_reviews/raw/main/manifest.json`
2. Instala **Reviews** desde el catálogo de complementos.
3. Reinicia Jellyfin.

### Instalación manual

1. Descarga el ZIP de la última release.
2. Descomprime el contenido directamente en `config/plugins/Reviews_<version>/` de tu instancia de Jellyfin.
3. Reinicia Jellyfin.

## Desarrollo

Código fuente en [`src/`](src/), proyecto .NET 9 / `Jellyfin.Controller` 10.11.x.

```
cd src
dotnet build -c Release -o build
```

El resultado en `build/` incluye el DLL del plugin y sus dependencias (`Microsoft.Data.Sqlite` y el runtime nativo de SQLite para `linux-x64`). Para desplegar manualmente, copia a `config/plugins/Reviews_<version>/`:

- `Jellyfin.Plugin.Reviews.dll`, `.deps.json`
- `Microsoft.Data.Sqlite.dll`, `SQLitePCLRaw.*.dll`
- `runtimes/linux-x64/native/libe_sqlite3.so`

## Compatibilidad

Probado contra Jellyfin **10.11.11**. El anclaje visual del widget usa las clases `.itemDetailPage`, `.overview` y `.overview-controls` del cliente web oficial; si una versión futura de Jellyfin cambia esa estructura, solo haría falta actualizar `src/wwwroot/reviews.js`, no el resto del plugin.
