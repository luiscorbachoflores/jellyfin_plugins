using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace Jellyfin.Plugin.Reviews.Web;

public class IndexHtmlInjectionMiddleware
{
    private const string ScriptTag = "<script src=\"/Reviews/ClientScript\" defer></script></body>";

    private readonly RequestDelegate _next;

    public IndexHtmlInjectionMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? string.Empty;
        var isIndex = path.Equals("/web/index.html", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web/", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/index.html", StringComparison.OrdinalIgnoreCase);

        if (!isIndex)
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        // Force an uncompressed response for this single request so the body
        // we capture below is plain UTF-8 HTML rather than gzip/br bytes.
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
        }

        buffer.Seek(0, SeekOrigin.Begin);
        var html = await new StreamReader(buffer, Encoding.UTF8).ReadToEndAsync().ConfigureAwait(false);

        if (html.Contains("</body>", StringComparison.OrdinalIgnoreCase) && !html.Contains("/Reviews/ClientScript", StringComparison.Ordinal))
        {
            html = html.Replace("</body>", ScriptTag, StringComparison.OrdinalIgnoreCase);
        }

        var bytes = Encoding.UTF8.GetBytes(html);
        context.Response.ContentLength = bytes.Length;
        context.Response.Headers.Remove("Content-Encoding");
        await context.Response.Body.WriteAsync(bytes).ConfigureAwait(false);
    }
}
