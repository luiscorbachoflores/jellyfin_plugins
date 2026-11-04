using System;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Jellyfin.Plugin.Blog.Web;

/// <summary>
/// Fusiona la entrada «Blog» en el <c>menuLinks</c> de /web/config.json. Función pura (solo
/// System.Text.Json) para poder probarla sin servidor.
/// </summary>
public static class ConfigJsonPatcher
{
    public const string MenuUrl = "#/blog";

    private static readonly JsonSerializerOptions WriteOptions = new()
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>
    /// Devuelve el JSON con el enlace añadido. Devuelve la entrada intacta (misma cadena) si
    /// <paramref name="showInMenu"/> es false, si no es un objeto JSON válido, si <c>menuLinks</c>
    /// existe pero no es un array, o si el enlace ya está.
    /// </summary>
    public static string Patch(string json, bool showInMenu)
    {
        if (!showInMenu || string.IsNullOrWhiteSpace(json))
        {
            return json;
        }

        JsonNode? root;
        try
        {
            root = JsonNode.Parse(json);
        }
        catch (JsonException)
        {
            return json;
        }

        if (root is not JsonObject obj)
        {
            return json;
        }

        JsonArray links;
        var existing = obj["menuLinks"];
        if (existing is null)
        {
            links = new JsonArray();
            obj["menuLinks"] = links;
        }
        else if (existing is JsonArray arr)
        {
            links = arr;
        }
        else
        {
            return json;
        }

        foreach (var link in links)
        {
            if (link is JsonObject lo && lo["url"] is JsonValue v && v.TryGetValue<string>(out var url)
                && string.Equals(url?.Trim(), MenuUrl, StringComparison.OrdinalIgnoreCase))
            {
                return json;
            }
        }

        links.Add(new JsonObject
        {
            ["name"] = "Blog",
            ["icon"] = "article",
            ["url"] = MenuUrl,
        });

        return obj.ToJsonString(WriteOptions);
    }
}
