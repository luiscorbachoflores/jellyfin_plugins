using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.IO;
using System.Net.Http;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Database.Implementations.Entities;
using MediaBrowser.Model.Activity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellyAsk.Api;

[ApiController]
[Route("JellyAsk")]
public class JellyAskController : ControllerBase
{
    /// <summary>Longest request text accepted (the web form enforces the same limit).</summary>
    public const int MaxTextLength = 1000;

    // Flood protection: every request creates an activity entry and, if configured, a Telegram message.
    private const int MaxRequestsPerWindow = 5;
    private static readonly TimeSpan RateWindow = TimeSpan.FromMinutes(1);
    private static readonly ConcurrentDictionary<Guid, Queue<DateTime>> RecentByUser = new();

    private readonly IActivityManager _activityManager;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<JellyAskController> _logger;

    public JellyAskController(
        IActivityManager activityManager,
        IHttpClientFactory httpClientFactory,
        ILogger<JellyAskController> logger)
    {
        _activityManager = activityManager;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <summary>The script injected into index.html. Public on purpose: it contains no data.</summary>
    [HttpGet("ClientScript")]
    [AllowAnonymous]
    public async Task<ActionResult> GetClientScript(CancellationToken cancellationToken)
    {
        var assembly = typeof(JellyAskController).Assembly;
        await using var stream = assembly.GetManifestResourceStream("Jellyfin.Plugin.JellyAsk.wwwroot.jellyask.js");
        if (stream is null)
        {
            return NotFound();
        }

        using var reader = new StreamReader(stream);
        var content = await reader.ReadToEndAsync(cancellationToken).ConfigureAwait(false);
        Response.Headers.CacheControl = "no-cache";
        return Content(content, "application/javascript; charset=utf-8");
    }

    /// <summary>Records a title request in the activity log (and Telegram, if configured). Needs a user token.</summary>
    [HttpPost("Request")]
    [Authorize]
    public async Task<ActionResult> PostRequest([FromBody] JellyAskRequestDto? dto)
    {
        var text = dto?.Text?.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            return BadRequest("El texto de la petición es obligatorio.");
        }

        if (text.Length > MaxTextLength)
        {
            return BadRequest($"La petición es demasiado larga (máximo {MaxTextLength} caracteres).");
        }

        // Claims set by Jellyfin's authentication handler (an API key has no user id).
        if (!Guid.TryParse(User.FindFirst("Jellyfin-UserId")?.Value, out var userId) || userId == Guid.Empty)
        {
            return Unauthorized("Necesitas iniciar sesión en Jellyfin para pedir un título.");
        }

        var username = User.FindFirst(ClaimTypes.Name)?.Value ?? "usuario";

        if (!TryAcquire(userId))
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, "Demasiadas peticiones seguidas. Inténtalo de nuevo en un minuto.");
        }

        var entry = new ActivityLog("Nueva petición de título", "JellyAskRequest", userId)
        {
            ShortOverview = $"Solicitado por {username}",
            Overview = text,
            LogSeverity = LogLevel.Information,
        };

        await _activityManager.CreateAsync(entry).ConfigureAwait(false);

        await TrySendTelegramAsync(username, text).ConfigureAwait(false);

        return Ok();
    }

    private static bool TryAcquire(Guid userId)
    {
        var now = DateTime.UtcNow;
        var queue = RecentByUser.GetOrAdd(userId, _ => new Queue<DateTime>());
        lock (queue)
        {
            while (queue.Count > 0 && now - queue.Peek() > RateWindow)
            {
                queue.Dequeue();
            }

            if (queue.Count >= MaxRequestsPerWindow)
            {
                return false;
            }

            queue.Enqueue(now);
            return true;
        }
    }

    private async Task TrySendTelegramAsync(string username, string text)
    {
        var config = Plugin.Instance?.Configuration;
        if (config is null || string.IsNullOrWhiteSpace(config.TelegramBotToken) || string.IsNullOrWhiteSpace(config.TelegramChatId))
        {
            return;
        }

        try
        {
            // Own timeout, independent of the browser request: a slow Telegram must not hang the user's request forever.
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var client = _httpClientFactory.CreateClient();
            var message = $"🎬 Nueva petición de {username}:\n{text}";
            var url = $"https://api.telegram.org/bot{config.TelegramBotToken.Trim()}/sendMessage";
            using var content = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("chat_id", config.TelegramChatId.Trim()),
                new KeyValuePair<string, string>("text", message),
            });

            using var response = await client.PostAsync(new Uri(url), content, cts.Token).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                // Only the status code: the URL (which carries the bot token) is never logged.
                _logger.LogWarning("JellyAsk: Telegram respondió {StatusCode}", (int)response.StatusCode);
            }
        }
        catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException)
        {
            // Type only: HttpRequestException.ToString() can include the request URI (= the bot token).
            _logger.LogWarning("JellyAsk: no se pudo enviar la notificación por Telegram ({Reason}).", ex.GetType().Name);
        }
    }
}

public class JellyAskRequestDto
{
    [Required]
    public string Text { get; set; } = string.Empty;
}
