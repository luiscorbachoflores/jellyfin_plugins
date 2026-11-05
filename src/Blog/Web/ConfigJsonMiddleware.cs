using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace Jellyfin.Plugin.Blog.Web;

/// <summary>
/// Intercepta GET /web/config.json y añade la entrada «Blog» a menuLinks (función oficial de
/// jellyfin-web) cuando ShowInMenu está activo. Misma técnica de buffer que
/// <see cref="IndexHtmlInjectionMiddleware"/>; la lógica del JSON vive en <see cref="ConfigJsonPatcher"/>.
/// </summary>
public class ConfigJsonMiddleware
{
    private readonly RequestDelegate _next;

    public ConfigJsonMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? string.Empty;
        if (!path.Equals("/web/config.json", StringComparison.OrdinalIgnoreCase)
            || !HttpMethods.IsGet(context.Request.Method))
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        // ShowInMenu se lee en cada petición: el admin lo cambia sin reiniciar el servidor.
        var showInMenu = Plugin.Instance?.Configuration.ShowInMenu ?? true;
        if (!showInMenu)
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        // Respuesta sin comprimir y sin condicionales para esta petición (ver IndexHtmlInjectionMiddleware).
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

        if (context.Response.StatusCode is StatusCodes.Status304NotModified or StatusCodes.Status204NoContent)
        {
            return;
        }

        var bytes = buffer.ToArray();
        if (context.Response.StatusCode == StatusCodes.Status200OK)
        {
            try
            {
                var original = new UTF8Encoding(false).GetString(bytes).TrimStart('﻿');
                var patched = ConfigJsonPatcher.Patch(original, true);
                if (!ReferenceEquals(patched, original) && !string.Equals(patched, original, StringComparison.Ordinal))
                {
                    bytes = new UTF8Encoding(false).GetBytes(patched);
                    // El cuerpo cambió: que ni ETag ni Last-Modified del original validen una copia vieja.
                    context.Response.Headers.Remove("ETag");
                    context.Response.Headers.Remove("Last-Modified");
                    context.Response.Headers.CacheControl = "no-cache";
                }
            }
            catch
            {
                // Un fallo al parchear no debe romper /web/config.json para nadie.
                bytes = buffer.ToArray();
            }
        }

        context.Response.ContentLength = bytes.Length;
        context.Response.Headers.Remove("Content-Encoding");
        await context.Response.Body.WriteAsync(bytes).ConfigureAwait(false);
    }
}
