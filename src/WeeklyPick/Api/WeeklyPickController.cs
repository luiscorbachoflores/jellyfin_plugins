using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.WeeklyPick.Api;

[ApiController]
[Route("WeeklyPick")]
public class WeeklyPickController : ControllerBase
{
    private readonly SeenStore _store;

    public WeeklyPickController(SeenStore store)
    {
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
        if (!DateTime.TryParse(anyDateInWeek, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
        {
            return string.Empty;
        }

        return CurrentWeekKey(d);
    }

    /// <summary>El script que se inyecta en index.html. Publico a proposito: no contiene datos.</summary>
    [HttpGet("ClientScript")]
    [AllowAnonymous]
    public async Task<ActionResult> GetClientScript(CancellationToken cancellationToken)
    {
        var assembly = typeof(WeeklyPickController).Assembly;
        await using var stream = assembly.GetManifestResourceStream("Jellyfin.Plugin.WeeklyPick.wwwroot.weeklypick.js");
        if (stream is null)
        {
            return NotFound();
        }

        using var reader = new StreamReader(stream);
        var content = await reader.ReadToEndAsync(cancellationToken).ConfigureAwait(false);
        Response.Headers.CacheControl = "no-cache";
        return Content(content, "application/javascript; charset=utf-8");
    }

    /// <summary>La recomendacion de esta semana si el usuario aun no la ha visto. No la marca como vista:
    /// eso lo hace el cliente con <c>POST Seen</c> cuando de verdad la ha mostrado.</summary>
    [HttpGet("Current")]
    [Authorize]
    public ActionResult<WeeklyPickResponseDto> GetCurrent()
    {
        if (!TryGetUserKey(out var userId))
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
        if (entry is null || string.IsNullOrWhiteSpace(entry.Text) || _store.WasNotifiedThisWeek(userId, weekKey))
        {
            return Ok(new WeeklyPickResponseDto { Show = false });
        }

        return Ok(new WeeklyPickResponseDto
        {
            Show = true,
            Text = entry.Text,
            ItemId = string.IsNullOrWhiteSpace(entry.ItemId) ? null : entry.ItemId,
        });
    }

    /// <summary>El cliente web avisa de que ya ha mostrado la recomendacion de esta semana.</summary>
    [HttpPost("Seen")]
    [Authorize]
    public ActionResult PostSeen()
    {
        if (!TryGetUserKey(out var userId))
        {
            return Unauthorized();
        }

        _store.MarkNotified(userId, CurrentWeekKey(DateTime.Now));
        return NoContent();
    }

    /// <summary>Solo administradores: olvida quien ha visto ya la recomendacion de esta semana.</summary>
    [HttpPost("Reset")]
    [Authorize(Policy = "RequiresElevation")]
    public ActionResult PostReset()
    {
        _store.Clear();
        return Ok();
    }

    private bool TryGetUserKey(out string userId)
    {
        userId = string.Empty;
        if (Guid.TryParse(User.FindFirst("Jellyfin-UserId")?.Value, out var id) && id != Guid.Empty)
        {
            userId = id.ToString("N");
            return true;
        }

        return false;
    }
}

public class WeeklyPickResponseDto
{
    public bool Show { get; set; }

    public string? Text { get; set; }

    public string? ItemId { get; set; }
}
