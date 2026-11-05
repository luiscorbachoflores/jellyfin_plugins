using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Watchlist.Api;

/// <summary>
/// Decisión 401/permitir factorizada fuera del controlador (sin AuthorizationInfo/User de Jellyfin).
/// Cada usuario solo ve y modifica la suya por los endpoints normales; el único endpoint de
/// admin (GET /Watchlist/Admin, solo lectura) comprueba el permiso directamente en el
/// controlador, igual que AdminMessages/Blog.
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
