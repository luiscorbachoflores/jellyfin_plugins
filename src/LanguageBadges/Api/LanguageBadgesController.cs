using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Mime;
using Jellyfin.Plugin.LanguageBadges.Configuration;
using Jellyfin.Plugin.LanguageBadges.Services;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.LanguageBadges.Api;

[ApiController]
[Route("LanguageBadges")]
public class LanguageBadgesController : ControllerBase
{
    private const int MaxIdsPerRequest = 200;

    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly LanguageResolver _resolver;

    public LanguageBadgesController(ILibraryManager libraryManager, IUserManager userManager, LanguageResolver resolver)
    {
        _libraryManager = libraryManager;
        _userManager = userManager;
        _resolver = resolver;
    }

    /// <summary>The client script injected into jellyfin-web. Public: it contains no data.</summary>
    [HttpGet("client.js")]
    [AllowAnonymous]
    public ActionResult GetClientScript()
    {
        var stream = typeof(Plugin).Assembly.GetManifestResourceStream(typeof(Plugin).Namespace + ".Web.languageBadges.js");
        if (stream is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = "no-cache";
        return File(stream, "application/javascript; charset=utf-8");
    }

    /// <summary>Display options for the client script.</summary>
    [HttpGet("ClientConfig")]
    [Authorize]
    [Produces(MediaTypeNames.Application.Json)]
    public ActionResult<object> GetClientConfig()
    {
        var c = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        return new
        {
            c.ShowOnCards,
            c.ShowOnDetailPage,
            c.ShowSubtitles,
            c.MaxCardLanguages,
            Highlight = c.HighlightCodes
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(x => x.ToUpperInvariant())
                .ToArray(),
        };
    }

    /// <summary>
    /// Languages for a batch of items: GET /LanguageBadges/Items?ids=a,b,c
    /// Returns { "&lt;id&gt;": { "Audio": ["ES","EN"], "Subtitles": ["ES"] }, ... }.
    /// Items the calling user cannot see, or that have no streams (folders, music...), are omitted.
    /// </summary>
    [HttpGet("Items")]
    [Authorize]
    [Produces(MediaTypeNames.Application.Json)]
    public ActionResult<Dictionary<string, ItemLanguages>> GetItems([FromQuery] string? ids)
    {
        var result = new Dictionary<string, ItemLanguages>();
        if (string.IsNullOrWhiteSpace(ids))
        {
            return result;
        }

        // Claim set by Jellyfin's authentication handler (Jellyfin.Api.Constants.InternalClaimTypes.UserId).
        // `var` on purpose: the User entity type moved namespace between Jellyfin 10.10 and 10.11.
        var user = Guid.TryParse(User.FindFirst("Jellyfin-UserId")?.Value, out var userId) && userId != Guid.Empty
            ? _userManager.GetUserById(userId)
            : null;
        foreach (var raw in ids.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Distinct().Take(MaxIdsPerRequest))
        {
            if (!Guid.TryParse(raw, out var id))
            {
                continue;
            }

            var item = _libraryManager.GetItemById(id);
            if (item is null)
            {
                continue;
            }

            // Requests made with a user token only see what that user may see (parental rating, library access).
            // Admin API keys (no user) see everything.
            if (user is not null && !item.IsVisible(user))
            {
                continue;
            }

            var langs = _resolver.Resolve(item);
            if (langs is not null)
            {
                result[raw] = langs;
            }
        }

        return result;
    }
}
