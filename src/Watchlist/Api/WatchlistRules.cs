using System;

namespace Jellyfin.Plugin.Watchlist.Api;

/// <summary>
/// Reglas puras (sin tipos de Jellyfin) para poder probarlas sin cargar Jellyfin.Controller
/// (los paquetes se referencian con ExcludeAssets="runtime"). El controlador pasa
/// <c>item.GetBaseItemKind().ToString()</c>.
/// </summary>
public static class WatchlistRules
{
    public const int MaxEntriesPerUser = 500;

    public const string LimitMessage = "Tu lista está llena (máximo 500 títulos). Quita alguno antes de añadir más.";

    public const string NotEligibleMessage = "Solo se pueden añadir películas y series a la lista.";

    public static bool IsEligibleKind(string? baseItemKind)
    {
        return string.Equals(baseItemKind, "Movie", StringComparison.Ordinal)
            || string.Equals(baseItemKind, "Series", StringComparison.Ordinal);
    }

    /// <summary>
    /// Eligible = existe, es Movie/Series y el usuario lo puede ver.
    /// </summary>
    public static bool IsEligible(bool exists, string? baseItemKind, bool visibleToUser)
    {
        return exists && visibleToUser && IsEligibleKind(baseItemKind);
    }
}
