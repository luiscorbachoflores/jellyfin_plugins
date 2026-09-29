using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Controller;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SearchNotifier.Services;

/// <summary>
/// POSTs a JSON payload per finished search to the configured URL. Generic on purpose:
///  - "text" / "content" carry a human sentence (Slack/Mattermost read "text", Discord reads "content");
///  - "chat_id" is added when TelegramChatId is set, so the URL can be Telegram's sendMessage directly;
///  - the structured fields (user, term, totalResults...) are there for n8n / Home Assistant / custom bots.
/// Fire-and-forget: a slow or failing webhook never delays the user's search.
/// </summary>
public class WebhookNotifier
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IServerApplicationHost _appHost;
    private readonly ILogger<WebhookNotifier> _logger;

    public WebhookNotifier(IHttpClientFactory httpClientFactory, IServerApplicationHost appHost, ILogger<WebhookNotifier> logger)
    {
        _httpClientFactory = httpClientFactory;
        _appHost = appHost;
        _logger = logger;
    }

    public void Notify(SearchEvent ev)
    {
        var config = Plugin.Instance?.Configuration;
        if (config is null || string.IsNullOrWhiteSpace(config.WebhookUrl))
        {
            return;
        }

        if (config.NotifyOnlyNoResults && ev.TotalResults != 0)
        {
            return;
        }

        _ = SendAsync(config.WebhookUrl, config.TelegramChatId, ev);
    }

    /// <summary>Sends and reports the outcome (used by the "test webhook" button).</summary>
    public async Task<(bool Ok, string Message)> SendAsync(string url, string? telegramChatId, SearchEvent ev)
    {
        try
        {
            var payload = BuildPayload(telegramChatId, ev);
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var client = _httpClientFactory.CreateClient();
            // StringContent (not PostAsJsonAsync) so the request carries Content-Length instead of chunked encoding,
            // which some simple webhook receivers do not accept.
            using var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            using var response = await client.PostAsync(url.Trim(), content, cts.Token).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cts.Token).ConfigureAwait(false);
                body = body.Length > 300 ? body[..300] : body;
                _logger.LogWarning("Search Notifier: webhook returned {Status}: {Body}", (int)response.StatusCode, body);
                return (false, $"HTTP {(int)response.StatusCode}: {body}");
            }

            return (true, $"HTTP {(int)response.StatusCode}");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Search Notifier: webhook call failed");
            return (false, ex.Message);
        }
    }

    private Dictionary<string, object?> BuildPayload(string? telegramChatId, SearchEvent ev)
    {
        var results = ev.TotalResults switch
        {
            null => "resultados desconocidos",
            0 => "SIN resultados",
            1 => "1 resultado",
            var n => $"{n} resultados",
        };
        var text = $"[{_appHost.FriendlyName}] {ev.UserName} ha buscado \"{ev.Term}\" ({results})";

        var payload = new Dictionary<string, object?>
        {
            ["event"] = "search",
            ["server"] = _appHost.FriendlyName,
            ["user"] = ev.UserName,
            ["userId"] = ev.UserId?.ToString("N"),
            ["term"] = ev.Term,
            ["totalResults"] = ev.TotalResults,
            ["resultsByType"] = ev.ResultsByType,
            ["timestamp"] = ev.TimestampUtc.ToString("o"),
            ["text"] = text,
            ["content"] = text,
        };

        if (!string.IsNullOrWhiteSpace(telegramChatId))
        {
            payload["chat_id"] = telegramChatId.Trim();
        }

        return payload;
    }
}
