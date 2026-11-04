using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Watchlist.Api;

/// <summary>
/// Decisión 401/permitir factorizada fuera del controlador (sin AuthorizationInfo/User de Jellyfin).
/// No hay endpoints de admin: la watchlist es estrictamente personal.
/// </summary>
public static class WatchlistAccessPolicy
{
    public static ActionResult? CheckAuthenticated(bool isAuthenticated, bool isApiKey = false, bool hasUser = true)
    {
        // Una API key no tiene usuario: no puede tener lista. Sin User tampoco se puede
        // comprobar la visibilidad de los items (IsVisibleStandalone(null) fallaría con un 500).
        if (!isAuthenticated || isApiKey || !hasUser)
        {
            return new UnauthorizedResult();
        }

        return null;
    }
}
