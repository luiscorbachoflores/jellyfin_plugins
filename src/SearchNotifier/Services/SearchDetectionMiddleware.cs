using System;
using System.IO;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Tasks;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SearchNotifier.Services;

/// <summary>Called by Jellyfin at startup for every plugin assembly (before the web host is built).</summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<SearchLogStore>();
        serviceCollection.AddSingleton<WebhookNotifier>();
        serviceCollection.AddSingleton<ActivityLogWriter>();
        serviceCollection.AddSingleton<SearchTracker>();
        serviceCollection.AddTransient<IStartupFilter, SearchDetectionStartupFilter>();
    }
}

/// <summary>Puts <see cref="SearchDetectionMiddleware"/> in front of Jellyfin's whole pipeline.</summary>
public class SearchDetectionStartupFilter : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        return app =>
        {
            app.UseMiddleware<SearchDetectionMiddleware>();
            next(app);
        };
    }
}

/// <summary>
/// Detects searches: any GET carrying a non-empty <c>searchTerm</c> query parameter. That covers every official client:
/// jellyfin-web / Android / Swiftfin / Findroid / Kodi use /Items?searchTerm=, /Users/{id}/Items?searchTerm=,
/// /Search/Hints?searchTerm=, /Persons?searchTerm=, /Artists?searchTerm=...
/// Runs outermost, lets Jellyfin handle the request normally, and afterwards reads the authenticated user
/// (HttpContext.User is filled in by Jellyfin's auth handler further down) and TotalRecordCount from the response.
/// Only user, term, result count and time are kept: no IP, device, token or other query parameters.
/// </summary>
public class SearchDetectionMiddleware
{
    private const int MaxBufferedBytes = 8 * 1024 * 1024;

    private readonly RequestDelegate _next;
    private readonly SearchTracker _tracker;
    private readonly ILogger<SearchDetectionMiddleware> _logger;

    public SearchDetectionMiddleware(RequestDelegate next, SearchTracker tracker, ILogger<SearchDetectionMiddleware> logger)
    {
        _next = next;
        _tracker = tracker;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var config = Plugin.Instance?.Configuration;
        var term = GetSearchTerm(context.Request);
        if (config is null || !config.Enabled || term is null || term.Length < Math.Max(1, config.MinTermLength))
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        // Buffer the (small, paged) search response uncompressed so we can read TotalRecordCount.
        context.Request.Headers.Remove("Accept-Encoding");
        var originalBody = context.Response.Body;
        using var buffer = new MemoryStream();
        context.Response.Body = buffer;
        try
        {
            await _next(context).ConfigureAwait(false);
        }
        finally
        {
            context.Response.Body = originalBody;
            buffer.Position = 0;
            await buffer.CopyToAsync(originalBody).ConfigureAwait(false);
        }

        try
        {
            if (context.Response.StatusCode != StatusCodes.Status200OK)
            {
                return;
            }

            var user = context.User;
            var userIdClaim = user.FindFirst("Jellyfin-UserId")?.Value; // Jellyfin.Api.Constants.InternalClaimTypes.UserId
            Guid? userId = Guid.TryParse(userIdClaim, out var g) && g != Guid.Empty ? g : null;
            var userName = user.FindFirst(ClaimTypes.Name)?.Value;
            if (userId is null && string.IsNullOrEmpty(userName))
            {
                return; // anonymous / API key without user: not a person searching
            }

            var count = buffer.Length <= MaxBufferedBytes ? ReadTotalRecordCount(buffer) : null;
            _tracker.Record(userId, userName ?? userId.ToString()!, term, GetCategory(context.Request), count);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Search Notifier: could not record search");
        }
    }

    internal static string? GetSearchTerm(HttpRequest request)
    {
        if (!HttpMethods.IsGet(request.Method))
        {
            return null;
        }

        // Query keys are case-insensitive in ASP.NET Core (searchTerm / SearchTerm / searchterm).
        if (!request.Query.TryGetValue("searchTerm", out var values))
        {
            return null;
        }

        var term = values.ToString().Trim();
        if (term.Length == 0)
        {
            return null;
        }

        return term.Length > 200 ? term[..200] : term;
    }

    private static string GetCategory(HttpRequest request)
    {
        if (request.Query.TryGetValue("includeItemTypes", out var types) && !string.IsNullOrWhiteSpace(types.ToString()))
        {
            // jellyfin-web 12.x also sends one catch-all request with ~12 types: label it instead of echoing the list.
            var t = types.ToString();
            return t.Contains(',', StringComparison.Ordinal) ? "Mixed" : t;
        }

        var path = request.Path.Value ?? string.Empty;
        var slash = path.TrimEnd('/').LastIndexOf('/');
        return slash >= 0 ? path[(slash + 1)..] : path;
    }

    private static int? ReadTotalRecordCount(MemoryStream buffer)
    {
        try
        {
            buffer.Position = 0;
            using var doc = JsonDocument.Parse(buffer);
            if (doc.RootElement.ValueKind == JsonValueKind.Object
                && doc.RootElement.TryGetProperty("TotalRecordCount", out var total)
                && total.TryGetInt32(out var n))
            {
                return n;
            }
        }
        catch (JsonException)
        {
            // not JSON: ignore
        }

        return null;
    }
}
