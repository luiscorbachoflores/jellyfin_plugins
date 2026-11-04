using System;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Blog.Api;

/// <summary>
/// Decisiones 401/403 y de autoría factorizadas fuera del controlador (sin AuthorizationInfo/User
/// de Jellyfin) para poder probarlas sin servidor. Mismo patrón que AdminAccessPolicy/WatchlistAccessPolicy.
/// </summary>
public static class BlogAccessPolicy
{
    /// <summary>401 si no hay sesión, si es una API key o si la sesión no tiene usuario.</summary>
    public static ActionResult? CheckAuthenticated(bool isAuthenticated, bool isApiKey, bool hasUser)
    {
        if (!isAuthenticated || isApiKey || !hasUser)
        {
            return new UnauthorizedResult();
        }

        return null;
    }

    /// <summary>Solo el autor edita (un admin no edita lo ajeno).</summary>
    public static bool CanEdit(string? requesterUserId, string? authorUserId) => SameUser(requesterUserId, authorUserId);

    /// <summary>El autor o un admin borran.</summary>
    public static bool CanDelete(string? requesterUserId, string? authorUserId, bool isAdmin) => isAdmin || SameUser(requesterUserId, authorUserId);

    public static ActionResult? CheckEdit(string? requesterUserId, string? authorUserId)
    {
        return CanEdit(requesterUserId, authorUserId) ? null : new StatusCodeResult(StatusCodes.Status403Forbidden);
    }

    public static ActionResult? CheckDelete(string? requesterUserId, string? authorUserId, bool isAdmin)
    {
        return CanDelete(requesterUserId, authorUserId, isAdmin) ? null : new StatusCodeResult(StatusCodes.Status403Forbidden);
    }

    /// <summary>Compara ids de usuario ignorando el formato del Guid (con/sin guiones, mayúsculas).</summary>
    public static bool SameUser(string? a, string? b)
    {
        if (string.IsNullOrEmpty(a) || string.IsNullOrEmpty(b))
        {
            return false;
        }

        if (Guid.TryParse(a, out var ga) && Guid.TryParse(b, out var gb))
        {
            return ga == gb;
        }

        return string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
    }
}
