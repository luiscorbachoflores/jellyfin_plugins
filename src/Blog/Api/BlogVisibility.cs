using System;

namespace Jellyfin.Plugin.Blog.Api;

/// <summary>
/// Estados de una entrada. Sin tipos de Jellyfin para poder probarlo en xunit.
/// <list type="bullet">
/// <item><c>draft</c>: borrador, solo lo ve su autor.</item>
/// <item><c>private</c>: publicada en privado, la ve su autor y el administrador (sin que el resto lo note).</item>
/// <item><c>public</c>: visible para todos los usuarios con acceso al blog. Es irreversible.</item>
/// </list>
/// </summary>
public static class BlogVisibility
{
    public const string Public = "public";
    public const string Private = "private";
    public const string Draft = "draft";

    public const string CannotRevertMessage = "Una entrada publicada ya no puede volver a ser privada ni borrador.";

    public static bool IsValid(string? v) => v is Public or Private or Draft;

    /// <summary>Normaliza a minúsculas; null si no es válido. Vacío = público (compatibilidad con clientes antiguos).</summary>
    public static string? Normalize(string? v)
    {
        if (string.IsNullOrWhiteSpace(v))
        {
            return Public;
        }

        var n = v.Trim().ToLowerInvariant();
        return IsValid(n) ? n : null;
    }

    /// <summary>Una entrada pública no puede cambiar a ningún otro estado.</summary>
    public static bool CanTransition(string from, string to) => from != Public || to == Public;

    /// <summary>Quién puede ver una entrada: pública todos; privada autor y admin; borrador solo el autor.</summary>
    public static bool CanView(string visibility, bool isAuthor, bool isAdmin) => visibility switch
    {
        Public => true,
        Private => isAuthor || isAdmin,
        Draft => isAuthor,
        _ => false,
    };
}
