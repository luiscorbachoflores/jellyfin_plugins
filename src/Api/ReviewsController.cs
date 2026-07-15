using System;
using System.ComponentModel.DataAnnotations;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Jellyfin.Plugin.Reviews.Db;
using MediaBrowser.Controller.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Reviews.Api;

[ApiController]
[Route("Reviews")]
[AllowAnonymous]
public class ReviewsController : ControllerBase
{
    private readonly ReviewsRepository _repository;
    private readonly IAuthorizationContext _authorizationContext;

    public ReviewsController(ReviewsRepository repository, IAuthorizationContext authorizationContext)
    {
        _repository = repository;
        _authorizationContext = authorizationContext;
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
    public ActionResult<ReviewsResponseDto> Get([FromRoute] string itemId)
    {
        var reviews = _repository.GetForItem(itemId);
        var dtoList = reviews
            .Select(r => new ReviewDto(r.Id, r.IsAnonymous ? "Anónimo" : r.DisplayName, r.IsAnonymous, r.Rating, r.Comment, r.CreatedAt))
            .ToList();
        var average = dtoList.Count > 0 ? Math.Round(dtoList.Average(d => d.Rating), 2) : 0;
        return Ok(new ReviewsResponseDto(average, dtoList.Count, dtoList));
    }

    [HttpPost("{itemId}")]
    public async Task<ActionResult<ReviewDto>> Post([FromRoute] string itemId, [FromBody] CreateReviewDto dto)
    {
        if (dto.Rating < 0.5 || dto.Rating > 5 || Math.Abs(dto.Rating * 2 - Math.Round(dto.Rating * 2)) > 0.0001)
        {
            return BadRequest("Rating must be between 0.5 and 5 in 0.5 increments.");
        }

        if (string.IsNullOrWhiteSpace(dto.Comment))
        {
            return BadRequest("Comment is required.");
        }

        var displayName = "Anónimo";
        string? userId = null;

        if (!dto.AsAnonymous)
        {
            var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
            if (!authInfo.IsAuthenticated || authInfo.User is null)
            {
                return Unauthorized("A valid Jellyfin session is required to review as a signed-in user.");
            }

            displayName = authInfo.User.Username;
            userId = authInfo.UserId.ToString();
        }

        var record = _repository.Add(itemId, userId, displayName, dto.AsAnonymous, dto.Rating, dto.Comment.Trim());
        return Ok(new ReviewDto(record.Id, dto.AsAnonymous ? "Anónimo" : displayName, dto.AsAnonymous, record.Rating, record.Comment, record.CreatedAt));
    }
}

public record ReviewDto(int Id, string DisplayName, bool IsAnonymous, double Rating, string Comment, string CreatedAt);

public record ReviewsResponseDto(double Average, int Count, System.Collections.Generic.IReadOnlyList<ReviewDto> Reviews);

public class CreateReviewDto
{
    [Required]
    public double Rating { get; set; }

    [Required]
    public string Comment { get; set; } = string.Empty;

    public bool AsAnonymous { get; set; } = true;
}
