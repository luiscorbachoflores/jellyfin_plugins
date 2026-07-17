using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Threading.Tasks;
using Jellyfin.Data;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.Reviews.Db;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Reviews.Api;

[ApiController]
[Route("Reviews")]
[AllowAnonymous]
public class ReviewsController : ControllerBase
{
    private readonly ReviewsRepository _repository;
    private readonly IAuthorizationContext _authorizationContext;
    private readonly ILibraryManager _libraryManager;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ReviewsController> _logger;

    public ReviewsController(
        ReviewsRepository repository,
        IAuthorizationContext authorizationContext,
        ILibraryManager libraryManager,
        IHttpClientFactory httpClientFactory,
        ILogger<ReviewsController> logger)
    {
        _repository = repository;
        _authorizationContext = authorizationContext;
        _libraryManager = libraryManager;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    [HttpGet("ClientScript")]
    public ActionResult GetClientScript()
    {
        var assembly = typeof(ReviewsController).Assembly;
        using var stream = assembly.GetManifestResourceStream("Jellyfin.Plugin.Reviews.wwwroot.reviews.js");
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

    [HttpGet("{itemId}")]
    public async Task<ActionResult<ReviewsResponseDto>> Get([FromRoute] string itemId)
    {
        var isAdmin = false;
        string? currentUserId = null;
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        if (authInfo.IsAuthenticated && authInfo.User is not null)
        {
            isAdmin = authInfo.User.HasPermission(PermissionKind.IsAdministrator);
            currentUserId = authInfo.UserId.ToString();
        }

        var reviews = _repository.GetForItem(itemId);
        var dtoList = reviews
            .Select(r => new ReviewDto(
                r.Id,
                r.IsAnonymous && !isAdmin ? "Anónimo" : r.DisplayName,
                r.IsAnonymous,
                r.Rating,
                r.Comment,
                r.CreatedAt,
                currentUserId is not null && r.UserId == currentUserId))
            .ToList();
        var rated = dtoList.Where(d => d.Rating > 0).ToList();
        var average = rated.Count > 0 ? Math.Round(rated.Average(d => d.Rating), 2) : 0;
        return Ok(new ReviewsResponseDto(average, dtoList.Count, rated.Count, dtoList));
    }

    [HttpPost("{itemId}")]
    public async Task<ActionResult<ReviewDto>> Post([FromRoute] string itemId, [FromBody] CreateReviewDto dto)
    {
        if (!IsValidRating(dto.Rating))
        {
            return BadRequest("Rating must be between 0.5 and 5 in 0.5 increments, or omitted.");
        }

        var comment = (dto.Comment ?? string.Empty).Trim();
        var rating = dto.Rating ?? 0;
        if (rating < 0.5 && comment.Length == 0)
        {
            return BadRequest("Debes indicar una puntuación, un comentario, o ambos.");
        }

        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        if (!authInfo.IsAuthenticated || authInfo.User is null)
        {
            return Unauthorized("Necesitas iniciar sesión en Jellyfin para publicar una reseña, aunque sea como anónimo.");
        }

        var displayName = authInfo.User.Username;
        var userId = authInfo.UserId.ToString();

        var record = _repository.Add(itemId, userId, displayName, dto.AsAnonymous, rating, comment);

        var itemName = itemId;
        if (Guid.TryParse(itemId, out var itemGuid))
        {
            itemName = _libraryManager.GetItemById(itemGuid)?.Name ?? itemId;
        }

        await TrySendTelegramAsync(displayName, dto.AsAnonymous, itemName, record.Rating, record.Comment).ConfigureAwait(false);

        return Ok(new ReviewDto(record.Id, dto.AsAnonymous ? "Anónimo" : displayName, dto.AsAnonymous, record.Rating, record.Comment, record.CreatedAt, true));
    }

    [HttpPut("{itemId}/{reviewId:int}")]
    public async Task<ActionResult<ReviewDto>> Put([FromRoute] string itemId, [FromRoute] int reviewId, [FromBody] CreateReviewDto dto)
    {
        if (!IsValidRating(dto.Rating))
        {
            return BadRequest("Rating must be between 0.5 and 5 in 0.5 increments, or omitted.");
        }

        var comment = (dto.Comment ?? string.Empty).Trim();
        var rating = dto.Rating ?? 0;
        if (rating < 0.5 && comment.Length == 0)
        {
            return BadRequest("Debes indicar una puntuación, un comentario, o ambos.");
        }

        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        if (!authInfo.IsAuthenticated || authInfo.User is null)
        {
            return Unauthorized();
        }

        var existing = _repository.GetById(reviewId);
        if (existing is null || existing.ItemId != itemId)
        {
            return NotFound();
        }

        var userId = authInfo.UserId.ToString();
        var isAdmin = authInfo.User.HasPermission(PermissionKind.IsAdministrator);
        if (existing.UserId != userId && !isAdmin)
        {
            return Forbid();
        }

        var updated = _repository.Update(reviewId, rating, comment, dto.AsAnonymous);
        if (updated is null)
        {
            return NotFound();
        }

        return Ok(new ReviewDto(updated.Id, updated.IsAnonymous ? "Anónimo" : updated.DisplayName, updated.IsAnonymous, updated.Rating, updated.Comment, updated.CreatedAt, true));
    }

    [HttpDelete("{itemId}/{reviewId:int}")]
    public async Task<IActionResult> Delete([FromRoute] string itemId, [FromRoute] int reviewId)
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        if (!authInfo.IsAuthenticated || authInfo.User is null)
        {
            return Unauthorized();
        }

        var existing = _repository.GetById(reviewId);
        if (existing is null || existing.ItemId != itemId)
        {
            return NotFound();
        }

        var userId = authInfo.UserId.ToString();
        var isAdmin = authInfo.User.HasPermission(PermissionKind.IsAdministrator);
        if (existing.UserId != userId && !isAdmin)
        {
            return Forbid();
        }

        _repository.Delete(reviewId);
        return NoContent();
    }

    private static bool IsValidRating(double? rating)
    {
        if (!rating.HasValue)
        {
            return true;
        }

        var value = rating.Value;
        return value >= 0.5 && value <= 5 && Math.Abs(value * 2 - Math.Round(value * 2)) <= 0.0001;
    }

    private async Task TrySendTelegramAsync(string realUsername, bool wasAnonymous, string itemName, double rating, string comment)
    {
        var config = Plugin.Instance?.Configuration;
        if (config is null || string.IsNullOrWhiteSpace(config.TelegramBotToken) || string.IsNullOrWhiteSpace(config.TelegramChatId))
        {
            return;
        }

        try
        {
            var client = _httpClientFactory.CreateClient();
            var anonNote = wasAnonymous ? " (publicada como anónimo)" : string.Empty;
            var ratingNote = rating > 0 ? $"{rating}/5" : "sin puntuación";
            var message = $"⭐ Nueva reseña de {realUsername}{anonNote} en \"{itemName}\": {ratingNote}\n{comment}";
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
                _logger.LogWarning("Reviews: Telegram respondió {StatusCode}: {Body}", response.StatusCode, body);
            }
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _logger.LogWarning(ex, "Reviews: no se pudo enviar la notificación por Telegram.");
        }
    }
}

public record ReviewDto(int Id, string DisplayName, bool IsAnonymous, double Rating, string Comment, string CreatedAt, bool CanManage);

public record ReviewsResponseDto(double Average, int Count, int RatedCount, System.Collections.Generic.IReadOnlyList<ReviewDto> Reviews);

public class CreateReviewDto
{
    public double? Rating { get; set; }

    public string Comment { get; set; } = string.Empty;

    public bool AsAnonymous { get; set; } = true;
}
