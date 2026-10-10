using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Data;
using Jellyfin.Plugin.Reviews.Db;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Reviews.Api;

[ApiController]
[Route("Reviews")]
public class ReviewsController : ControllerBase
{
    /// <summary>Longest comment accepted (the web form enforces the same limit).</summary>
    public const int MaxCommentLength = 2000;

    // Anti-flood: each review can trigger a Telegram message to the owner.
    private const int MaxPerUserPerItem = 10;
    private const int MaxPerUserPerHour = 30;
    private const int MaxReviewsReturned = 500;

    private readonly ReviewsRepository _repository;
    private readonly IAuthorizationContext _authorizationContext;
    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ReviewsController> _logger;

    public ReviewsController(
        ReviewsRepository repository,
        IAuthorizationContext authorizationContext,
        ILibraryManager libraryManager,
        IUserManager userManager,
        IHttpClientFactory httpClientFactory,
        ILogger<ReviewsController> logger)
    {
        _repository = repository;
        _authorizationContext = authorizationContext;
        _libraryManager = libraryManager;
        _userManager = userManager;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <summary>The script injected into index.html. Public on purpose: it contains no data.</summary>
    [HttpGet("ClientScript")]
    [AllowAnonymous]
    public async Task<ActionResult> GetClientScript(CancellationToken cancellationToken)
    {
        var assembly = typeof(ReviewsController).Assembly;
        await using var stream = assembly.GetManifestResourceStream("Jellyfin.Plugin.Reviews.wwwroot.reviews.js");
        if (stream is null)
        {
            return NotFound();
        }

        using var reader = new StreamReader(stream);
        var content = await reader.ReadToEndAsync(cancellationToken).ConfigureAwait(false);
        Response.Headers.CacheControl = "no-cache";
        return Content(content, "application/javascript; charset=utf-8");
    }

    /// <summary>
    /// Reviews of an item. Public (reading needs no login); the caller's identity is optional and only used to flag
    /// their own reviews (CanManage) and to show real names of anonymous authors to administrators.
    /// </summary>
    [HttpGet("{itemId}")]
    [AllowAnonymous]
    public async Task<ActionResult<ReviewsResponseDto>> Get([FromRoute] string itemId, CancellationToken cancellationToken)
    {
        if (!TryNormalizeItemId(itemId, out var ids))
        {
            return BadRequest("Identificador de elemento no válido.");
        }

        var isAdmin = false;
        string? currentUserId = null;
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        if (authInfo.IsAuthenticated && authInfo.User is not null)
        {
            isAdmin = authInfo.User.HasPermission(Jellyfin.Database.Implementations.Enums.PermissionKind.IsAdministrator);
            currentUserId = authInfo.UserId.ToString("N");
        }

        var reviews = await _repository.GetForItemAsync(ids, cancellationToken).ConfigureAwait(false);
        var dtoList = reviews
            .Take(MaxReviewsReturned)
            .Select(r => new ReviewDto(
                r.Id,
                r.IsAnonymous && !isAdmin ? "Anónimo" : r.DisplayName,
                r.IsAnonymous,
                r.Rating,
                r.Comment,
                r.CreatedAt,
                currentUserId is not null && SameUser(r.UserId, currentUserId)))
            .ToList();
        var rated = dtoList.Where(d => d.Rating > 0).ToList();
        var average = rated.Count > 0 ? Math.Round(rated.Average(d => d.Rating), 2) : 0;
        return Ok(new ReviewsResponseDto(average, dtoList.Count, rated.Count, dtoList));
    }

    [HttpPost("{itemId}")]
    [Authorize]
    public async Task<ActionResult<ReviewDto>> Post([FromRoute] string itemId, [FromBody] CreateReviewDto? dto, CancellationToken cancellationToken)
    {
        var invalid = Validate(dto, out var rating, out var comment);
        if (invalid is not null)
        {
            return invalid;
        }

        if (!TryNormalizeItemId(itemId, out var ids))
        {
            return BadRequest("Identificador de elemento no válido.");
        }

        if (!TryGetUser(out var userGuid, out var username, out _))
        {
            return Unauthorized("Necesitas iniciar sesión en Jellyfin para publicar una reseña, aunque sea como anónimo.");
        }

        // The item must exist, be a reviewable type and be visible to this user (parental controls / library access).
        var item = _libraryManager.GetItemById(Guid.Parse(ids[0]));
        var user = _userManager.GetUserById(userGuid);
        if (item is null || user is null || !item.IsVisible(user))
        {
            return NotFound();
        }

        if (item is not (Movie or Series or Season or Episode))
        {
            return BadRequest("Solo se pueden reseñar películas, series, temporadas y episodios.");
        }

        var userId = userGuid.ToString("N");
        var (forItem, lastHour) = await _repository.CountForUserAsync(userId, ids, cancellationToken).ConfigureAwait(false);
        if (forItem >= MaxPerUserPerItem || lastHour >= MaxPerUserPerHour)
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, "Has publicado demasiadas reseñas seguidas. Edita las anteriores o espera un poco.");
        }

        var asAnonymous = dto!.AsAnonymous;
        var record = await _repository.AddAsync(ids[0], userId, username, asAnonymous, rating, comment, cancellationToken).ConfigureAwait(false);

        await TrySendTelegramAsync(username, asAnonymous, item.Name ?? itemId, record.Rating, record.Comment).ConfigureAwait(false);

        return Ok(new ReviewDto(record.Id, asAnonymous ? "Anónimo" : username, asAnonymous, record.Rating, record.Comment, record.CreatedAt, true));
    }

    [HttpPut("{itemId}/{reviewId:int}")]
    [Authorize]
    public async Task<ActionResult<ReviewDto>> Put([FromRoute] string itemId, [FromRoute] int reviewId, [FromBody] CreateReviewDto? dto, CancellationToken cancellationToken)
    {
        var invalid = Validate(dto, out var rating, out var comment);
        if (invalid is not null)
        {
            return invalid;
        }

        if (!TryNormalizeItemId(itemId, out var ids))
        {
            return BadRequest("Identificador de elemento no válido.");
        }

        if (!TryGetUser(out var userGuid, out _, out var isAdmin))
        {
            return Unauthorized();
        }

        var existing = await _repository.GetByIdAsync(reviewId, cancellationToken).ConfigureAwait(false);
        if (existing is null || !ids.Contains(existing.ItemId, StringComparer.OrdinalIgnoreCase))
        {
            return NotFound();
        }

        if (!SameUser(existing.UserId, userGuid.ToString("N")) && !isAdmin)
        {
            return StatusCode(StatusCodes.Status403Forbidden);
        }

        var updated = await _repository.UpdateAsync(reviewId, rating, comment, dto!.AsAnonymous, cancellationToken).ConfigureAwait(false);
        if (updated is null)
        {
            return NotFound();
        }

        return Ok(new ReviewDto(updated.Id, updated.IsAnonymous ? "Anónimo" : updated.DisplayName, updated.IsAnonymous, updated.Rating, updated.Comment, updated.CreatedAt, true));
    }

    [HttpDelete("{itemId}/{reviewId:int}")]
    [Authorize]
    public async Task<IActionResult> Delete([FromRoute] string itemId, [FromRoute] int reviewId, CancellationToken cancellationToken)
    {
        if (!TryNormalizeItemId(itemId, out var ids))
        {
            return BadRequest("Identificador de elemento no válido.");
        }

        if (!TryGetUser(out var userGuid, out _, out var isAdmin))
        {
            return Unauthorized();
        }

        var existing = await _repository.GetByIdAsync(reviewId, cancellationToken).ConfigureAwait(false);
        if (existing is null || !ids.Contains(existing.ItemId, StringComparer.OrdinalIgnoreCase))
        {
            return NotFound();
        }

        if (!SameUser(existing.UserId, userGuid.ToString("N")) && !isAdmin)
        {
            return StatusCode(StatusCodes.Status403Forbidden);
        }

        await _repository.DeleteAsync(reviewId, cancellationToken).ConfigureAwait(false);
        return NoContent();
    }

    /// <summary>Accepts any GUID spelling; returns the spellings that may be stored in the database (N first).</summary>
    private static bool TryNormalizeItemId(string itemId, out IReadOnlyList<string> ids)
    {
        if (itemId.Length <= 40 && Guid.TryParse(itemId, out var guid) && guid != Guid.Empty)
        {
            ids = new[] { guid.ToString("N"), guid.ToString("D") };
            return true;
        }

        ids = Array.Empty<string>();
        return false;
    }

    private static bool SameUser(string? stored, string current)
    {
        // Older rows may have been stored with the hyphenated form.
        return stored is not null && Guid.TryParse(stored, out var a) && Guid.TryParse(current, out var b) && a == b;
    }

    private bool TryGetUser(out Guid userId, out string username, out bool isAdmin)
    {
        username = User.FindFirst(ClaimTypes.Name)?.Value ?? string.Empty;
        isAdmin = User.IsInRole("Administrator");
        return Guid.TryParse(User.FindFirst("Jellyfin-UserId")?.Value, out userId) && userId != Guid.Empty && username.Length > 0;
    }

    private ActionResult? Validate(CreateReviewDto? dto, out double rating, out string comment)
    {
        rating = 0;
        comment = string.Empty;
        if (dto is null)
        {
            return BadRequest("Falta el cuerpo de la reseña.");
        }

        if (!IsValidRating(dto.Rating))
        {
            return BadRequest("La puntuación debe estar entre 0,5 y 5 en pasos de 0,5, o no indicarse.");
        }

        comment = (dto.Comment ?? string.Empty).Trim();
        if (comment.Length > MaxCommentLength)
        {
            return BadRequest($"El comentario es demasiado largo (máximo {MaxCommentLength} caracteres).");
        }

        rating = dto.Rating ?? 0;
        if (rating < 0.5 && comment.Length == 0)
        {
            return BadRequest("Debes indicar una puntuación, un comentario, o ambos.");
        }

        return null;
    }

    private static bool IsValidRating(double? rating)
    {
        if (!rating.HasValue)
        {
            return true;
        }

        var value = rating.Value;
        return !double.IsNaN(value) && value >= 0.5 && value <= 5 && Math.Abs(value * 2 - Math.Round(value * 2)) <= 0.0001;
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
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var client = _httpClientFactory.CreateClient();
            var anonNote = wasAnonymous ? " (publicada como anónimo)" : string.Empty;
            var ratingNote = rating > 0 ? $"{rating:0.#}/5" : "sin puntuación";
            var shortComment = comment.Length > 500 ? comment[..500] + "…" : comment;
            var message = $"⭐ Nueva reseña de {realUsername}{anonNote} en \"{itemName}\": {ratingNote}\n{shortComment}";
            var url = $"https://api.telegram.org/bot{config.TelegramBotToken.Trim()}/sendMessage";
            using var content = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("chat_id", config.TelegramChatId.Trim()),
                new KeyValuePair<string, string>("text", message),
            });

            using var response = await client.PostAsync(new Uri(url), content, cts.Token).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                // Status only: the URL carries the bot token and must never reach the log.
                _logger.LogWarning("Reviews: Telegram respondió {StatusCode}", (int)response.StatusCode);
            }
        }
        catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException)
        {
            _logger.LogWarning("Reviews: no se pudo enviar la notificación por Telegram ({Reason}).", ex.GetType().Name);
        }
    }
}

public record ReviewDto(int Id, string DisplayName, bool IsAnonymous, double Rating, string Comment, string CreatedAt, bool CanManage);

public record ReviewsResponseDto(double Average, int Count, int RatedCount, IReadOnlyList<ReviewDto> Reviews);

public class CreateReviewDto
{
    public double? Rating { get; set; }

    public string? Comment { get; set; } = string.Empty;

    public bool AsAnonymous { get; set; } = true;
}
