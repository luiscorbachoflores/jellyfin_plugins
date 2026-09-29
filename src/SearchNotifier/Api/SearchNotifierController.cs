using System;
using System.Collections.Generic;
using System.Net.Mime;
using System.Threading.Tasks;
using Jellyfin.Plugin.SearchNotifier.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.SearchNotifier.Api;

/// <summary>Admin-only endpoints backing the plugin configuration page.</summary>
[ApiController]
[Route("SearchNotifier")]
[Authorize(Policy = "RequiresElevation")]
public class SearchNotifierController : ControllerBase
{
    private readonly SearchLogStore _store;
    private readonly WebhookNotifier _notifier;

    public SearchNotifierController(SearchLogStore store, WebhookNotifier notifier)
    {
        _store = store;
        _notifier = notifier;
    }

    /// <summary>Latest searches, newest first.</summary>
    [HttpGet("Log")]
    [Produces(MediaTypeNames.Application.Json)]
    public ActionResult<IReadOnlyList<SearchEvent>> GetLog([FromQuery] int limit = 100)
    {
        return Ok(_store.GetLatest(limit));
    }

    /// <summary>Deletes the whole search log.</summary>
    [HttpDelete("Log")]
    public ActionResult ClearLog()
    {
        _store.Clear();
        return NoContent();
    }

    /// <summary>Sends a fake search to the configured webhook (or to ?url= if given) and returns the result.</summary>
    [HttpPost("TestWebhook")]
    [Produces(MediaTypeNames.Application.Json)]
    public async Task<ActionResult> TestWebhook([FromQuery] string? url)
    {
        var config = Plugin.Instance!.Configuration;
        var target = string.IsNullOrWhiteSpace(url) ? config.WebhookUrl : url;
        if (string.IsNullOrWhiteSpace(target))
        {
            return BadRequest(new { ok = false, message = "No hay URL de webhook configurada." });
        }

        var ev = new SearchEvent
        {
            TimestampUtc = DateTime.UtcNow,
            UserName = "prueba",
            Term = "prueba de webhook",
            TotalResults = 0,
        };
        var (ok, message) = await _notifier.SendAsync(target, config.TelegramChatId, ev).ConfigureAwait(false);
        return Ok(new { ok, message });
    }
}
