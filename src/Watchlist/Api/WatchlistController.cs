using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.Watchlist.Db;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Watchlist.Api;

[ApiController]
[Route("Watchlist")]
[AllowAnonymous]
public class WatchlistController : ControllerBase
{
    private readonly WatchlistRepository _repository;
    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly IAuthorizationContext _authorizationContext;
    private readonly ILogger<WatchlistController> _logger;

    public WatchlistController(
        WatchlistRepository repository,
        ILibraryManager libraryManager,
        IUserManager userManager,
        IAuthorizationContext authorizationContext,
        ILogger<WatchlistController> logger)
    {
        _repository = repository;
        _libraryManager = libraryManager;
        _userManager = userManager;
        _authorizationContext = authorizationContext;
        _logger = logger;
    }

    [HttpGet("ClientScript")]
    public ActionResult GetClientScript()
    {
        var assembly = typeof(WatchlistController).Assembly;
        using var stream = assembly.GetManifestResourceStream("Jellyfin.Plugin.Watchlist.wwwroot.watchlist.js");
        if (stream is null)
        {
            return NotFound();
        }

        using var reader = new StreamReader(stream);
        var content = reader.ReadToEnd();
        Response.Headers.CacheControl = "no-store, must-revalidate";
        Response.Headers.Pragma = "no-cache";
        return Content(content, "application/javascript");
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<WatchlistItemDto>>> GetAll()
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        var denied = WatchlistAccessPolicy.CheckAuthenticated(authInfo.IsAuthenticated, authInfo.IsApiKey, authInfo.User is not null);
        if (denied is not null)
        {
            return denied;
        }

        var userId = authInfo.UserId.ToString("D");
        var result = new List<WatchlistItemDto>();
        var missing = new List<string>();
        foreach (var entry in _repository.GetForUser(userId))
        {
            var item = Guid.TryParse(entry.ItemId, out var itemGuid) ? _libraryManager.GetItemById(itemGuid) : null;
            if (item is null)
            {
                missing.Add(entry.ItemId);
                continue;
            }

            // Existe pero ya no es visible para el usuario: se omite sin borrar.
            if (!item.IsVisibleStandalone(authInfo.User))
            {
                continue;
            }

            var kind = item.GetBaseItemKind().ToString();
            if (!WatchlistRules.IsEligibleKind(kind))
            {
                continue;
            }

            result.Add(new WatchlistItemDto(
                entry.ItemId,
                item.Name ?? string.Empty,
                kind,
                item.ProductionYear,
                item.HasImage(MediaBrowser.Model.Entities.ImageType.Primary, 0),
                entry.AddedUtc));
        }

        if (missing.Count > 0)
        {
            _repository.RemoveMany(userId, missing);
        }

        return Ok(result);
    }

    /// <summary>Vista de solo lectura para el administrador: la lista de cada usuario, agrupadas.
    /// A diferencia de <see cref="GetAll"/>, no comprueba visibilidad de biblioteca (depende de
    /// cada usuario, no del admin) ni hace autolimpieza de items borrados.</summary>
    [HttpGet("Admin")]
    public async Task<ActionResult<IReadOnlyList<AdminUserWatchlistDto>>> GetAllForAdmin()
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        var denied = WatchlistAccessPolicy.CheckAuthenticated(authInfo.IsAuthenticated, authInfo.IsApiKey, authInfo.User is not null);
        if (denied is not null)
        {
            return denied;
        }

        if (!IsAdmin(authInfo.User))
        {
            return StatusCode(StatusCodes.Status403Forbidden);
        }

        var result = _repository.GetAll()
            .GroupBy(e => e.UserId)
            .Select(group =>
            {
                var items = group.Select(entry =>
                {
                    var item = Guid.TryParse(entry.ItemId, out var itemGuid) ? _libraryManager.GetItemById(itemGuid) : null;
                    return new AdminWatchlistItemDto(
                        entry.ItemId,
                        item?.Name ?? "Elemento eliminado",
                        item?.GetBaseItemKind().ToString() ?? string.Empty,
                        item?.ProductionYear,
                        item is not null && item.HasImage(MediaBrowser.Model.Entities.ImageType.Primary, 0),
                        entry.AddedUtc);
                }).ToList();

                var userName = Guid.TryParse(group.Key, out var userGuid) ? _userManager.GetUserById(userGuid)?.Username : null;
                return new AdminUserWatchlistDto(group.Key, userName ?? "Usuario eliminado", items);
            })
            .OrderByDescending(u => u.Items.Count)
            .ThenBy(u => u.UserName, StringComparer.CurrentCultureIgnoreCase)
            .ToList();

        return Ok(result);
    }

    [HttpGet("Items/{itemId}")]
    public async Task<ActionResult<ItemStatusDto>> GetItemStatus([FromRoute] Guid itemId)
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        var denied = WatchlistAccessPolicy.CheckAuthenticated(authInfo.IsAuthenticated, authInfo.IsApiKey, authInfo.User is not null);
        if (denied is not null)
        {
            return denied;
        }

        var eligible = IsEligibleForUser(itemId, authInfo);
        var inList = eligible && _repository.Contains(authInfo.UserId.ToString("D"), itemId.ToString("D"));
        return Ok(new ItemStatusDto(eligible, inList));
    }

    [HttpPost("Items/{itemId}")]
    public async Task<ActionResult> Add([FromRoute] Guid itemId)
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        var denied = WatchlistAccessPolicy.CheckAuthenticated(authInfo.IsAuthenticated, authInfo.IsApiKey, authInfo.User is not null);
        if (denied is not null)
        {
            return denied;
        }

        var item = _libraryManager.GetItemById(itemId);
        // 404 tanto si no existe como si el usuario no lo puede ver: no filtrar existencia.
        if (item is null || !item.IsVisibleStandalone(authInfo.User))
        {
            return NotFound();
        }

        if (!WatchlistRules.IsEligibleKind(item.GetBaseItemKind().ToString()))
        {
            return BadRequest(WatchlistRules.NotEligibleMessage);
        }

        var outcome = _repository.Add(authInfo.UserId.ToString("D"), itemId.ToString("D"));
        if (outcome == AddResult.LimitReached)
        {
            _logger.LogInformation("Watchlist: límite alcanzado para un usuario.");
            return BadRequest(WatchlistRules.LimitMessage);
        }

        return NoContent();
    }

    [HttpDelete("Items/{itemId}")]
    public async Task<ActionResult> Remove([FromRoute] Guid itemId)
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        var denied = WatchlistAccessPolicy.CheckAuthenticated(authInfo.IsAuthenticated, authInfo.IsApiKey, authInfo.User is not null);
        if (denied is not null)
        {
            return denied;
        }

        _repository.Remove(authInfo.UserId.ToString("D"), itemId.ToString("D"));
        return NoContent();
    }

    private bool IsEligibleForUser(Guid itemId, AuthorizationInfo authInfo)
    {
        var item = _libraryManager.GetItemById(itemId);
        if (item is null)
        {
            return false;
        }

        return WatchlistRules.IsEligible(true, item.GetBaseItemKind().ToString(), item.IsVisibleStandalone(authInfo.User));
    }

    // AuthorizationInfo.User (Jellyfin.Database.Implementations.Entities.User) no tiene HasPermission
    // en esta ABI (ver nota en AdminMessages/Blog).
    private static bool IsAdmin(User? user)
    {
        return user is not null && user.Permissions.Any(p => p.Kind == PermissionKind.IsAdministrator && p.Value);
    }
}
