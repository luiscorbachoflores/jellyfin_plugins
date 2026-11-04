using System;

namespace Jellyfin.Plugin.AdminMessages.Api;

/// <summary>
/// Validación y normalización del campo Link, fuera del controlador para poder probarla
/// sin cargar tipos de Jellyfin (mismo motivo que AdminAccessPolicy).
/// </summary>
public static class LinkPolicy
{
    public const string InvalidLinkMessage = "Link debe ser una URL http(s) absoluta.";

    /// <summary>
    /// Vacío o null → link null (sin enlace). Si no, solo http(s) absoluto, devuelto como
    /// Uri.AbsoluteUri: percent-codifica comillas y espacios, así que un Link como
    /// https://x/"onmouseover=... no puede cerrar el atributo href en el cliente. Otros
    /// esquemas (javascript:, data:, ...) se rechazan: serían XSS persistente vía un mensaje.
    /// </summary>
    public static bool TryNormalize(string? raw, out string? link, out string? error)
    {
        link = null;
        error = null;

        var trimmed = (raw ?? string.Empty).Trim();
        if (trimmed.Length == 0)
        {
            return true;
        }

        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            error = InvalidLinkMessage;
            return false;
        }

        link = uri.AbsoluteUri;
        return true;
    }
}
