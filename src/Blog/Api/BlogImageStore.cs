using System;
using System.Collections.Generic;
using System.IO;

namespace Jellyfin.Plugin.Blog.Api;

/// <summary>
/// Una imagen (cover) opcional por entrada, guardada como fichero suelto en
/// <c>&lt;PluginsPath&gt;/Blog.Data/images/&lt;postId&gt;.ext</c> — sin tabla nueva en la base de
/// datos: su presencia se resuelve mirando si el fichero existe. Mismo patrón de ruta que
/// <see cref="Db.BlogRepository"/> para <c>blog.db</c>.
/// </summary>
public static class BlogImageStore
{
    public const long MaxBytes = 5 * 1024 * 1024;

    private static readonly IReadOnlyDictionary<string, string> ContentTypeByExtension = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".png"] = "image/png",
        [".webp"] = "image/webp"
    };

    public static string? ExtensionForContentType(string? contentType)
    {
        return contentType?.ToLowerInvariant() switch
        {
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            _ => null
        };
    }

    private static string Dir(string pluginsPath) => Path.Combine(pluginsPath, "Blog.Data", "images");

    public static (string Path, string ContentType)? FindImage(string pluginsPath, Guid postId)
    {
        var dir = Dir(pluginsPath);
        foreach (var pair in ContentTypeByExtension)
        {
            var path = Path.Combine(dir, postId.ToString("D") + pair.Key);
            if (File.Exists(path))
            {
                return (path, pair.Value);
            }
        }

        return null;
    }

    public static bool HasImage(string pluginsPath, Guid postId) => FindImage(pluginsPath, postId) is not null;

    public static void RemoveImage(string pluginsPath, Guid postId)
    {
        var existing = FindImage(pluginsPath, postId);
        if (existing is not null)
        {
            File.Delete(existing.Value.Path);
        }
    }

    public static void SaveImage(string pluginsPath, Guid postId, string extension, Stream content)
    {
        var dir = Dir(pluginsPath);
        Directory.CreateDirectory(dir);
        RemoveImage(pluginsPath, postId);
        using var file = File.Create(Path.Combine(dir, postId.ToString("D") + extension));
        content.CopyTo(file);
    }
}
