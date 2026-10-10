using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace Jellyfin.Plugin.Reviews.Web;

/// <summary>
/// Adds our script tag to jellyfin-web's index.html while it is served (nothing is written to disk).
/// The script URL is relative to /web/ so it keeps working when Jellyfin runs under a base URL (e.g. /jellyfin).
/// </summary>
public class IndexHtmlInjectionMiddleware
{
    private const string Marker = "data-plugin=\"Reviews\"";
    private const string ScriptTag = "<script " + Marker + " src=\"../Reviews/ClientScript\" defer></script>";

    private readonly RequestDelegate _next;

    public IndexHtmlInjectionMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!IsIndexRequest(context.Request))
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        // A plain, uncompressed, full (non-304) body we can edit.
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
                context.Response.Headers.Remove("Content-Encoding");
                context.Response.Headers.CacheControl = "no-cache";
            }
        }

        if (!context.Response.HasStarted)
        {
            context.Response.ContentLength = bytes.Length;
        }

        if (!HttpMethods.IsHead(context.Request.Method) && bytes.Length > 0)
        {
            await originalBody.WriteAsync(bytes, context.RequestAborted).ConfigureAwait(false);
        }
    }

    private static bool IsIndexRequest(HttpRequest request)
    {
        if (!HttpMethods.IsGet(request.Method) && !HttpMethods.IsHead(request.Method))
        {
            return false;
        }

        var path = request.Path.Value ?? string.Empty;
        return path.EndsWith("/web/", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith("/web/index.html", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith("/web", StringComparison.OrdinalIgnoreCase);
    }
}
