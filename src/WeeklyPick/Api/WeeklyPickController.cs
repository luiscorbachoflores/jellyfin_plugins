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

    private static string Today(DateTime now) => now.ToString("yyyy-MM-dd");

    /// <summary>La entrada cuyo rango [DateStart, DateEnd] incluye <paramref name="now"/>, o
    /// null si ninguna cubre ese día. Si hubiera rangos solapados (no debería, pero el admin
    /// podría crearlos), se queda con la más reciente por DateStart.</summary>
    internal static WeeklyEntry? EntryForDate(PluginConfiguration config, DateTime now)
    {
        var today = Today(now);
        return config.Entries
            .Where(e => !string.IsNullOrWhiteSpace(e.DateStart) && !string.IsNullOrWhiteSpace(e.DateEnd)
                        && string.CompareOrdinal(e.DateStart, today) <= 0
                        && string.CompareOrdinal(today, e.DateEnd) <= 0)
            .OrderByDescending(e => e.DateStart, StringComparer.Ordinal)
            .FirstOrDefault();
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

        var now = DateTime.Now;
        var entry = EntryForDate(config, now);
        if (entry is null || string.IsNullOrWhiteSpace(entry.Text) || string.IsNullOrWhiteSpace(entry.Id))
        {
            return Ok(new WeeklyPickResponseDto { Show = false });
        }

        var userId = authInfo.UserId.ToString("N");
        if (!_store.ShouldShowToday(userId, entry.Id, Math.Max(entry.TimesToShow, 1), Today(now)))
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

        var now = DateTime.Now;
        var entry = EntryForDate(Plugin.Instance!.Configuration, now);
        if (entry is null || string.IsNullOrWhiteSpace(entry.Id))
        {
            return Ok();
        }

        _store.MarkShown(authInfo.UserId.ToString("N"), entry.Id, Today(now));
        return Ok();
    }

    /// <summary>El usuario ha pulsado "Ver ficha" en el aviso activo hoy.</summary>
    [HttpPost("Click")]
    public async Task<ActionResult> PostClick()
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        if (!authInfo.IsAuthenticated || authInfo.User is null)
        {
            return Unauthorized();
        }

        var entry = EntryForDate(Plugin.Instance!.Configuration, DateTime.Now);
        if (entry is null || string.IsNullOrWhiteSpace(entry.Id))
        {
            return Ok();
        }

        _store.MarkClicked(authInfo.UserId.ToString("N"), entry.Id);
        return Ok();
    }

    /// <summary>El usuario ha cerrado el aviso activo hoy sin pulsar ningún botón de opinión.</summary>
    [HttpPost("Dismiss")]
    public async Task<ActionResult> PostDismiss()
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        if (!authInfo.IsAuthenticated || authInfo.User is null)
        {
            return Unauthorized();
        }

        var entry = EntryForDate(Plugin.Instance!.Configuration, DateTime.Now);
        if (entry is null || string.IsNullOrWhiteSpace(entry.Id))
        {
            return Ok();
        }

        _store.MarkDismissed(authInfo.UserId.ToString("N"), entry.Id);
        return Ok();
    }

    /// <summary>El usuario ha pulsado "Me interesa" o "No me interesa" en el aviso activo hoy.</summary>
    [HttpPost("Interest")]
    public async Task<ActionResult> PostInterest([FromQuery] bool value)
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        if (!authInfo.IsAuthenticated || authInfo.User is null)
        {
            return Unauthorized();
        }

        var entry = EntryForDate(Plugin.Instance!.Configuration, DateTime.Now);
        if (entry is null || string.IsNullOrWhiteSpace(entry.Id))
        {
            return Ok();
        }

        _store.MarkInterest(authInfo.UserId.ToString("N"), entry.Id, value);
        return Ok();
    }

    /// <summary>Quién ha visto, accedido, descartado o dado su opinión de una entrada concreta
    /// (la activa hoy, u otra antigua pasando su Id). Solo admin.</summary>
    [HttpGet("Stats")]
    public async Task<ActionResult<List<WeeklyPickStatRowDto>>> GetStats([FromQuery] string? entryId)
    {
        var (isAdmin, isAuthenticated) = await CheckAdmin(_authorizationContext, Request).ConfigureAwait(false);
        if (!isAuthenticated || !isAdmin)
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(entryId))
        {
            return Ok(new List<WeeklyPickStatRowDto>());
        }

        var states = _store.StatesForEntry(entryId);

        var rows = _userManager.GetUsers()
            .Where(u => !u.Permissions.Any(p => p.Kind == Jellyfin.Database.Implementations.Enums.PermissionKind.IsDisabled && p.Value))
            .Select(u =>
            {
                var uid = u.Id.ToString("N");
                states.TryGetValue(uid, out var state);
                return new WeeklyPickStatRowDto
                {
                    UserId = uid,
                    UserName = u.Username,
                    ShowCount = state?.ShowCount ?? 0,
                    LastShownAtUtc = state?.LastShownAtUtc,
                    Clicked = state?.Clicked ?? false,
                    ClickedAtUtc = state?.ClickedAtUtc,
                    Dismissed = state?.Dismissed ?? false,
                    DismissedAtUtc = state?.DismissedAtUtc,
                    Interested = state?.Interested,
                    InterestAtUtc = state?.InterestAtUtc,
                };
            })
            .OrderByDescending(r => r.ShowCount)
            .ThenBy(r => r.UserName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return Ok(rows);
    }

    /// <summary>Olvida lo registrado de UN usuario para una entrada (para que vuelva a
    /// aparecerle a él solo), sin tocar a los demás. Solo admin.</summary>
    [HttpPost("ResetUser")]
    public async Task<ActionResult> PostResetUser([FromQuery] string entryId, [FromQuery] string userId)
    {
        var (isAdmin, isAuthenticated) = await CheckAdmin(_authorizationContext, Request).ConfigureAwait(false);
        if (!isAuthenticated || !isAdmin)
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(entryId) || string.IsNullOrWhiteSpace(userId))
        {
            return BadRequest();
        }

        _store.ClearUser(userId, entryId);
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
    public string UserId { get; set; } = string.Empty;

    public string UserName { get; set; } = string.Empty;

    public int ShowCount { get; set; }

    public DateTime? LastShownAtUtc { get; set; }

    public bool Clicked { get; set; }

    public DateTime? ClickedAtUtc { get; set; }

    public bool Dismissed { get; set; }

    public DateTime? DismissedAtUtc { get; set; }

    public bool? Interested { get; set; }

    public DateTime? InterestAtUtc { get; set; }
}
