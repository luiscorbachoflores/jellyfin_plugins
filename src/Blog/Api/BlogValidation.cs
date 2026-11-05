using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace Jellyfin.Plugin.Blog.Api;

public record ValidatedPost(string Title, string Body, IReadOnlyList<string> Labels, IReadOnlyList<Guid> MentionItemIds, bool HasSpoilers);

/// <summary>
/// Validación y normalización de entradas, comentarios, etiquetas y filtros. Todo puro y sin tipos
/// de Jellyfin para poder probarlo en xunit (los paquetes Jellyfin se compilan con ExcludeAssets=runtime).
/// </summary>
public static class BlogValidation
{
    private static readonly Regex ArchiveRegex = new(@"^\d{4}-(0[1-9]|1[0-2])$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public const string MentionsErrorMessage = "Alguno de los títulos mencionados no existe o no está disponible.";

    public static bool TryValidatePost(
        string? title,
        string? body,
        IEnumerable<string?>? labels,
        IEnumerable<string?>? mentionItemIds,
        bool hasSpoilers,
        out ValidatedPost post,
        out string? error)
    {
        post = new ValidatedPost(string.Empty, string.Empty, Array.Empty<string>(), Array.Empty<Guid>(), hasSpoilers);

        var t = (title ?? string.Empty).Trim();
        if (t.Length < 1 || t.Length > BlogLimits.TitleMax)
        {
            error = $"El título debe tener entre 1 y {BlogLimits.TitleMax} caracteres.";
            return false;
        }

        if (t.Any(char.IsControl))
        {
            error = "El título no puede contener saltos de línea ni caracteres de control.";
            return false;
        }

        var b = NormalizeBody(body);
        if (b.Length < 1 || b.Length > BlogLimits.PostBodyMax)
        {
            error = "El texto de la entrada debe tener entre 1 y 20.000 caracteres.";
            return false;
        }

        if (!TryNormalizeLabels(labels, out var normalizedLabels, out error))
        {
            return false;
        }

        if (!TryParseMentions(mentionItemIds, out var mentions, out error))
        {
            return false;
        }

        post = new ValidatedPost(t, b, normalizedLabels, mentions, hasSpoilers);
        error = null;
        return true;
    }

    public static bool TryValidateComment(string? body, out string normalized, out string? error)
    {
        normalized = NormalizeBody(body);
        if (normalized.Length < 1 || normalized.Length > BlogLimits.CommentBodyMax)
        {
            error = "El comentario debe tener entre 1 y 4.000 caracteres.";
            return false;
        }

        error = null;
        return true;
    }

    /// <summary>Recorta y unifica saltos de línea a \n. El resto del texto no se toca (es texto plano).</summary>
    public static string NormalizeBody(string? body)
    {
        return (body ?? string.Empty).Replace("\r\n", "\n").Replace('\r', '\n').Trim();
    }

    /// <summary>Etiqueta recortada y en minúsculas, o null si no es válida (vacía, larga, con coma o con control).</summary>
    public static string? NormalizeLabel(string? label)
    {
        var l = (label ?? string.Empty).Trim().ToLowerInvariant();
        if (l.Length < 1 || l.Length > BlogLimits.LabelMax || l.Contains(',') || l.Any(char.IsControl))
        {
            return null;
        }

        return l;
    }

    /// <summary>
    /// Normaliza las etiquetas de una entrada. Los duplicados (tras normalizar) se fusionan en
    /// silencio; el máximo de 5 se aplica a las etiquetas distintas.
    /// </summary>
    public static bool TryNormalizeLabels(IEnumerable<string?>? labels, out IReadOnlyList<string> normalized, out string? error)
    {
        var result = new List<string>();
        normalized = result;
        foreach (var raw in labels ?? Array.Empty<string?>())
        {
            var l = NormalizeLabel(raw);
            if (l is null)
            {
                error = $"Cada etiqueta debe tener entre 1 y {BlogLimits.LabelMax} caracteres, sin comas ni caracteres de control.";
                return false;
            }

            if (!result.Contains(l, StringComparer.Ordinal))
            {
                result.Add(l);
            }
        }

        if (result.Count > BlogLimits.MaxLabels)
        {
            error = $"Máximo {BlogLimits.MaxLabels} etiquetas por entrada.";
            return false;
        }

        error = null;
        return true;
    }

    public static bool TryParseMentions(IEnumerable<string?>? ids, out IReadOnlyList<Guid> mentions, out string? error)
    {
        var result = new List<Guid>();
        mentions = result;
        foreach (var raw in ids ?? Array.Empty<string?>())
        {
            if (!Guid.TryParse(raw, out var g) || g == Guid.Empty)
            {
                error = MentionsErrorMessage;
                return false;
            }

            if (!result.Contains(g))
            {
                result.Add(g);
            }
        }

        if (result.Count > BlogLimits.MaxMentions)
        {
            error = $"Máximo {BlogLimits.MaxMentions} títulos mencionados por entrada.";
            return false;
        }

        error = null;
        return true;
    }

    /// <summary>Solo se pueden mencionar películas y series.</summary>
    public static bool IsMentionableKind(string? kind)
    {
        return string.Equals(kind, "Movie", StringComparison.Ordinal) || string.Equals(kind, "Series", StringComparison.Ordinal);
    }

    /// <summary>Filtro de archivo «YYYY-MM» (mes 01-12).</summary>
    public static bool IsValidArchive(string? archive) => archive is not null && ArchiveRegex.IsMatch(archive);

    /// <summary>Página 1-based; valores no válidos caen a 1.</summary>
    public static int NormalizePage(int? page) => page is null or < 1 ? 1 : System.Math.Min(page.Value, BlogLimits.MaxPage);

    /// <summary>Escapa % _ \ para usarlo en LIKE ... ESCAPE '\'.</summary>
    public static string EscapeLike(string text)
    {
        return text.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
    }
}
