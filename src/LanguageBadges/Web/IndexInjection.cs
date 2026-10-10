using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.LanguageBadges.Web;

/// <summary>
/// Registers our services. Jellyfin discovers IPluginServiceRegistrator implementations in plugin assemblies
/// and calls them before the web host is built, so an IStartupFilter added here wraps Jellyfin's own pipeline.
/// </summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton<Services.LanguageResolver>();
        serviceCollection.AddTransient<IStartupFilter, IndexInjectionStartupFilter>();
    }
}

public class IndexInjectionStartupFilter : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        return app =>
        {
            app.UseMiddleware<IndexInjectionMiddleware>();
            next(app);
        };
    }
}

/// <summary>
/// Adds our &lt;script&gt; tag to jellyfin-web's index.html while it is being served.
/// Needed because /jellyfin/jellyfin-web is read-only (root-owned) in the official Docker image,
/// so the classic "rewrite index.html on disk" trick does not work there. Nothing is written to disk.
/// </summary>
public class IndexInjectionMiddleware
{
    internal const string Marker = "data-plugin=\"LanguageBadges\"";
    private const string ScriptTag = "<script " + Marker + " src=\"../LanguageBadges/client.js\" defer></script>";

    private readonly RequestDelegate _next;
    private readonly ILogger<IndexInjectionMiddleware> _logger;

    public IndexInjectionMiddleware(RequestDelegate next, ILogger<IndexInjectionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!IsIndexRequest(context.Request))
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        // Get a plain, uncompressed, full (non-304) body we can edit.
        context.Request.Headers.Remove("Accept-Encoding");
        context.Request.Headers.Remove("If-None-Match");
        context.Request.Headers.Remove("If-Modified-Since");

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
        }

        var bytes = buffer.ToArray();
        var contentType = context.Response.ContentType ?? string.Empty;
        if (context.Response.StatusCode == StatusCodes.Status200OK
            && contentType.Contains("html", StringComparison.OrdinalIgnoreCase))
        {
            var html = Encoding.UTF8.GetString(bytes);
            var bodyClose = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
            if (bodyClose >= 0 && !html.Contains(Marker, StringComparison.Ordinal))
            {
                bytes = Encoding.UTF8.GetBytes(html.Insert(bodyClose, ScriptTag));
                context.Response.Headers.Remove("ETag");
                context.Response.Headers.CacheControl = "no-cache";
                _logger.LogDebug("Language Badges script injected into {Path}", context.Request.Path);
            }
        }

        if (!context.Response.HasStarted)
        {
            context.Response.ContentLength = bytes.Length;
        }

        await originalBody.WriteAsync(bytes).ConfigureAwait(false);
    }

    private static bool IsIndexRequest(HttpRequest request)
    {
        if (!HttpMethods.IsGet(request.Method))
        {
            return false;
        }

        var path = request.Path.Value ?? string.Empty;
        return path.EndsWith("/web/", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith("/web/index.html", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith("/web", StringComparison.OrdinalIgnoreCase);
    }
}
