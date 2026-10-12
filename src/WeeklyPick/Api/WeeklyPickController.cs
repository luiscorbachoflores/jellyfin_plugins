using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.WeeklyPick.Api;

[ApiController]
[Route("WeeklyPick")]
[AllowAnonymous]
public class WeeklyPickController : ControllerBase
{
    private readonly IAuthorizationContext _authorizationContext;
    private readonly IUserManager _userManager;
    private readonly SeenStore _store;

    public WeeklyPickController(IAuthorizationContext authorizationContext, IUserManager userManager, SeenStore store)
    {
        _authorizationContext = authorizationContext;
        _userManager = userManager;
        _store = store;
    }

    /// <summary>Viernes mas reciente en o antes de <paramref name="now"/>, como clave "yyyy-MM-dd".
    /// Define el "cubo" semanal: se reinicia cada viernes.</summary>
    internal static string CurrentWeekKey(DateTime now)
    {
        var diff = ((int)now.DayOfWeek - (int)DayOfWeek.Friday + 7) % 7;
        return now.Date.AddDays(-diff).ToString("yyyy-MM-dd");
    }

    /// <summary>La entrada configurada para esa semana (cualquier fecha dentro de la semana vale,
    /// se normaliza al viernes que la abre), o null si no hay ninguna.</summary>
    internal static WeeklyEntry? EntryFor(PluginConfiguration config, string weekKey)
    {
        return config.Entries.FirstOrDefault(e => NormalizeToWeekKey(e.WeekStart) == weekKey);
    }

    internal static string NormalizeToWeekKey(string anyDateInWeek)
    {
        if (!DateTime.TryParse(anyDateInWeek, out var d))
        {
            return string.Empty;
        }

        return CurrentWeekKey(d);
    }

    private static async Task<(bool IsAdmin, bool IsAuthenticated)> CheckAdmin(IAuthorizationContext authorizationContext, HttpRequest request)
    {
        var authInfo = await authorizationContext.GetAuthorizationInfo(request).ConfigureAwait(false);
        var isAdmin = authInfo.IsApiKey
            || (authInfo.User is not null && authInfo.User.Permissions.Any(p => p.Kind == Jellyfin.Database.Implementations.Enums.PermissionKind.IsAdministrator && p.Value));
        return (isAdmin, authInfo.IsAuthenticated);
    }

    [HttpGet("ClientScript")]
    public ActionResult GetClientScript()
    {
        var assembly = typeof(WeeklyPickController).Assembly;
        using var stream = assembly.GetManifestResourceStream("Jellyfin.Plugin.WeeklyPick.wwwroot.weeklypick.js");
        if (stream is null)
        {
            return NotFound();
        }

        using var reader = new System.IO.StreamReader(stream);
        var content = reader.ReadToEnd();
        Response.Headers.CacheControl = "no-store, must-revalidate";
        Response.Headers.Pragma = "no-cache";
        return Content(content, "application/javascript");
    }

    [HttpGet("Current")]
    public async Task<ActionResult<WeeklyPickResponseDto>> GetCurrent()
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        if (!authInfo.IsAuthenticated || authInfo.User is null)
        {
            return Unauthorized();
        }

        var config = Plugin.Instance!.Configuration;
        if (!config.Enabled)
        {
            return Ok(new WeeklyPickResponseDto { Show = false });
        }

        var weekKey = CurrentWeekKey(DateTime.Now);
        var entry = EntryFor(config, weekKey);
        if (entry is null || string.IsNullOrWhiteSpace(entry.Text))
        {
            return Ok(new WeeklyPickResponseDto { Show = false });
        }

        var userId = authInfo.UserId.ToString("N");
        if (_store.WasNotifiedThisWeek(userId, weekKey))
        {
            return Ok(new WeeklyPickResponseDto { Show = false });
        }

        // No se marca como visto aquí: el cliente todavía no ha mostrado nada. Si el fetch
        // falla o la pestaña se cierra antes de pintar el aviso, el usuario lo vería en la
        // siguiente visita. Lo marca /WeeklyPick/Ack, que el cliente llama solo cuando el
        // aviso se ha mostrado de verdad en pantalla.
        return Ok(new WeeklyPickResponseDto
        {
            Show = true,
            Text = entry.Text,
            ItemId = string.IsNullOrWhiteSpace(entry.ItemId) ? null : entry.ItemId,
        });
    }

    [HttpPost("Ack")]
    public async Task<ActionResult> PostAck()
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        if (!authInfo.IsAuthenticated || authInfo.User is null)
        {
            return Unauthorized();
        }

        var userId = authInfo.UserId.ToString("N");
        var weekKey = CurrentWeekKey(DateTime.Now);
        _store.MarkShown(userId, weekKey);
        return Ok();
    }

    /// <summary>El usuario ha pulsado "Ver ficha" en el aviso de esta semana.</summary>
    [HttpPost("Click")]
    public async Task<ActionResult> PostClick()
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        if (!authInfo.IsAuthenticated || authInfo.User is null)
        {
            return Unauthorized();
        }

        var userId = authInfo.UserId.ToString("N");
        var weekKey = CurrentWeekKey(DateTime.Now);
        _store.MarkClicked(userId, weekKey);
        return Ok();
    }

    /// <summary>El usuario ha cerrado el aviso de esta semana sin pulsar "Ver ficha".</summary>
    [HttpPost("Dismiss")]
    public async Task<ActionResult> PostDismiss()
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        if (!authInfo.IsAuthenticated || authInfo.User is null)
        {
            return Unauthorized();
        }

        var userId = authInfo.UserId.ToString("N");
        var weekKey = CurrentWeekKey(DateTime.Now);
        _store.MarkDismissed(userId, weekKey);
        return Ok();
    }

    /// <summary>Quién ha visto, accedido o descartado la recomendación de esta semana. Solo admin.</summary>
    [HttpGet("Stats")]
    public async Task<ActionResult<List<WeeklyPickStatRowDto>>> GetStats()
    {
        var (isAdmin, isAuthenticated) = await CheckAdmin(_authorizationContext, Request).ConfigureAwait(false);
        if (!isAuthenticated || !isAdmin)
        {
            return Unauthorized();
        }

        var weekKey = CurrentWeekKey(DateTime.Now);
        var states = _store.StatesForWeek(weekKey);

        var rows = _userManager.GetUsers()
            .Where(u => !u.Permissions.Any(p => p.Kind == Jellyfin.Database.Implementations.Enums.PermissionKind.IsDisabled && p.Value))
            .Select(u =>
            {
                var uid = u.Id.ToString("N");
                states.TryGetValue(uid, out var state);
                return new WeeklyPickStatRowDto
                {
                    UserName = u.Username,
                    Shown = state?.Shown ?? false,
                    ShownAtUtc = state?.ShownAtUtc,
                    Clicked = state?.Clicked ?? false,
                    ClickedAtUtc = state?.ClickedAtUtc,
                    Dismissed = state?.Dismissed ?? false,
                    DismissedAtUtc = state?.DismissedAtUtc,
                };
            })
            .OrderByDescending(r => r.Shown)
            .ThenBy(r => r.UserName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return Ok(rows);
    }

    [HttpPost("Reset")]
    public async Task<ActionResult> PostReset()
    {
        var (isAdmin, isAuthenticated) = await CheckAdmin(_authorizationContext, Request).ConfigureAwait(false);
        if (!isAuthenticated || !isAdmin)
        {
            return Unauthorized();
        }

        _store.Clear();
        return Ok();
    }
}

public class WeeklyPickResponseDto
{
    public bool Show { get; set; }

    public string? Text { get; set; }

    public string? ItemId { get; set; }
}

public class WeeklyPickStatRowDto
{
    public string UserName { get; set; } = string.Empty;

    public bool Shown { get; set; }

    public DateTime? ShownAtUtc { get; set; }

    public bool Clicked { get; set; }

    public DateTime? ClickedAtUtc { get; set; }

    public bool Dismissed { get; set; }

    public DateTime? DismissedAtUtc { get; set; }
}
