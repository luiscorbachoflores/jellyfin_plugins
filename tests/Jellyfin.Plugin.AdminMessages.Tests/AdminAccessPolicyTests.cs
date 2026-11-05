using Jellyfin.Plugin.AdminMessages.Api;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Xunit;

namespace Jellyfin.Plugin.AdminMessages.Tests;

public class AdminAccessPolicyTests
{
    [Fact]
    public void AnonymousUser_IsUnauthorized()
    {
        var result = AdminAccessPolicy.CheckAdminAccess(isAuthenticated: false, isAdmin: false);

        Assert.IsType<UnauthorizedResult>(result);
    }

    [Fact]
    public void AuthenticatedNonAdmin_IsForbidden()
    {
        var result = AdminAccessPolicy.CheckAdminAccess(isAuthenticated: true, isAdmin: false);

        var statusResult = Assert.IsType<StatusCodeResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, statusResult.StatusCode);
    }

    [Fact]
    public void AuthenticatedAdmin_IsAllowed()
    {
        var result = AdminAccessPolicy.CheckAdminAccess(isAuthenticated: true, isAdmin: true);

        Assert.Null(result);
    }

    [Fact]
    public void AnonymousAdminFlagIgnored_StillUnauthorized()
    {
        // isAuthenticated=false must win even if isAdmin were somehow true: an
        // unauthenticated caller can never be treated as admin.
        var result = AdminAccessPolicy.CheckAdminAccess(isAuthenticated: false, isAdmin: true);

        Assert.IsType<UnauthorizedResult>(result);
    }
}
