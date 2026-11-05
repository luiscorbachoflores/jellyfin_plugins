using System;
using System.Text;

namespace Jellyfin.Plugin.Blog.Api;

/// <summary>Recorte de textos por límite de palabra. Puro, sin dependencias de Jellyfin.</summary>
public static class ExcerptCutter
{
    /// <summary>
    /// Devuelve el texto tal cual si cabe en <paramref name="maxLength"/>; si no, lo corta en el
    /// último espacio en blanco antes del límite (o duro en el límite si no hay ninguno).
    /// </summary>
    public static (string Text, bool IsTruncated) Cut(string? text, int maxLength)
    {
        text ??= string.Empty;
        if (maxLength <= 0)
        {
            return (string.Empty, text.Length > 0);
        }

        if (text.Length <= maxLength)
        {
            return (text, false);
        }

        // Si justo después del límite hay un espacio, el corte cae en frontera de palabra.
        var cut = -1;
        if (char.IsWhiteSpace(text[maxLength]))
        {
            cut = maxLength;
        }
        else
        {
            for (var i = maxLength - 1; i > 0; i--)
            {
                if (char.IsWhiteSpace(text[i]))
                {
                    cut = i;
                    break;
                }
            }
        }

        if (cut <= 0)
        {
            cut = maxLength;
            // No partir un par sustituto (emoji, etc.).
            if (char.IsHighSurrogate(text[cut - 1]))
            {
                cut--;
            }
        }

        return (text.Substring(0, cut).TrimEnd(), true);
    }

    /// <summary>Extracto de una línea para la barra lateral: espacios colapsados y «…» si se cortó.</summary>
    public static string SingleLine(string? text, int maxLength)
    {
        var sb = new StringBuilder();
        var lastWasSpace = false;
        foreach (var ch in (text ?? string.Empty).Trim())
        {
            if (char.IsWhiteSpace(ch) || char.IsControl(ch))
            {
                if (!lastWasSpace)
                {
                    sb.Append(' ');
                }

                lastWasSpace = true;
            }
            else
            {
                sb.Append(ch);
                lastWasSpace = false;
            }
        }

        var (cut, truncated) = Cut(sb.ToString(), maxLength);
        return truncated ? cut + "…" : cut;
    }
}
