using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.AdminMessages.Api;

/// <summary>
/// Pure 401/403/allow decision for the admin-only endpoints, factored out of the controller
/// so it has no dependency on Jellyfin's AuthorizationInfo/User types and can be unit tested
/// (anonymous / authenticated non-admin / authenticated admin) without a hosted server.
/// </summary>
public static class AdminAccessPolicy
{
    public static ActionResult? CheckAdminAccess(bool isAuthenticated, bool isAdmin)
    {
        if (!isAuthenticated)
        {
            return new UnauthorizedResult();
        }

        if (!isAdmin)
        {
            return new StatusCodeResult(StatusCodes.Status403Forbidden);
        }

        return null;
    }
}
