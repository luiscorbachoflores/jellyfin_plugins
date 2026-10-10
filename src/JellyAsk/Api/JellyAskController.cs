using System;
using System.ComponentModel.DataAnnotations;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using Jellyfin.Database.Implementations.Entities;
using MediaBrowser.Controller.Net;
using MediaBrowser.Model.Activity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellyAsk.Api;

[ApiController]
[Route("JellyAsk")]
[AllowAnonymous]
public class JellyAskController : ControllerBase
{
    private readonly IActivityManager _activityManager;
    private readonly IAuthorizationContext _authorizationContext;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<JellyAskController> _logger;

    public JellyAskController(
        IActivityManager activityManager,
        IAuthorizationContext authorizationContext,
        IHttpClientFactory httpClientFactory,
        ILogger<JellyAskController> logger)
    {
        _activityManager = activityManager;
        _authorizationContext = authorizationContext;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    [HttpGet("ClientScript")]
    public ActionResult GetClientScript()
    {
        var assembly = typeof(JellyAskController).Assembly;
        using var stream = assembly.GetManifestResourceStream("Jellyfin.Plugin.JellyAsk.wwwroot.jellyask.js");
        if (stream is null)
        {
            return NotFound();
        }

        using var reader = new StreamReader(stream);
        var content = reader.ReadToEnd();
        Response.Headers.CacheControl = "no-store, must-revalidate";
        Response.Headers.Pragma = "no-cache";
        return Content(content, "application/javascript");
    }

    [HttpPost("Request")]
    public async Task<ActionResult> PostRequest([FromBody] JellyAskRequestDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Text))
        {
            return BadRequest("El texto de la petición es obligatorio.");
        }

        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        if (!authInfo.IsAuthenticated || authInfo.User is null)
        {
            return Unauthorized("Necesitas iniciar sesión en Jellyfin para pedir un título.");
        }

        var username = authInfo.User.Username;
        var entry = new ActivityLog("Nueva petición de título", "JellyAskRequest", authInfo.UserId)
        {
            ShortOverview = $"Solicitado por {username}",
            Overview = dto.Text.Trim(),
            LogSeverity = LogLevel.Information,
        };

        await _activityManager.CreateAsync(entry).ConfigureAwait(false);

        await TrySendTelegramAsync(username, dto.Text.Trim()).ConfigureAwait(false);

        return Ok();
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
            var client = _httpClientFactory.CreateClient();
            var message = $"🎬 Nueva petición de {username}:\n{text}";
            var url = $"https://api.telegram.org/bot{config.TelegramBotToken}/sendMessage";
            var content = new FormUrlEncodedContent(new[]
            {
                new System.Collections.Generic.KeyValuePair<string, string>("chat_id", config.TelegramChatId),
                new System.Collections.Generic.KeyValuePair<string, string>("text", message),
            });

            var response = await client.PostAsync(new Uri(url), content).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                _logger.LogWarning("JellyAsk: Telegram respondió {StatusCode}: {Body}", response.StatusCode, body);
            }
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _logger.LogWarning(ex, "JellyAsk: no se pudo enviar la notificación por Telegram.");
        }
    }
}

public class JellyAskRequestDto
{
    [Required]
    public string Text { get; set; } = string.Empty;
}
