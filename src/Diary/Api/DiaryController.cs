using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.Diary.Db;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Diary.Api;

[ApiController]
[Route("Diary")]
[AllowAnonymous]
public class DiaryController : ControllerBase
{
    private const int MaxNoteLength = 1000;

    private readonly DiaryRepository _repository;
    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly IUserDataManager _userDataManager;
    private readonly IAuthorizationContext _authorizationContext;

    public DiaryController(
        DiaryRepository repository,
        ILibraryManager libraryManager,
        IUserManager userManager,
        IUserDataManager userDataManager,
        IAuthorizationContext authorizationContext)
    {
        _repository = repository;
        _libraryManager = libraryManager;
        _userManager = userManager;
        _userDataManager = userDataManager;
        _authorizationContext = authorizationContext;
    }

    [HttpGet("ClientScript")]
    public ActionResult GetClientScript()
    {
        using var stream = typeof(DiaryController).Assembly.GetManifestResourceStream("Jellyfin.Plugin.Diary.wwwroot.diary.js");
        if (stream is null)
        {
            return NotFound();
        }

        using var reader = new StreamReader(stream);
        Response.Headers.CacheControl = "no-store, must-revalidate";
        Response.Headers.Pragma = "no-cache";
        return Content(reader.ReadToEnd(), "application/javascript");
    }

    [HttpGet("Entries")]
    public async Task<ActionResult<DiaryListDto>> GetEntries([FromQuery] int? year)
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null)
        {
            return denied;
        }

        var userId = auth!.UserId.ToString("D", CultureInfo.InvariantCulture);
        var years = _repository.GetYears(userId);
        var chosen = year ?? (years.Count > 0 ? years[0] : (int?)null);
        var entries = chosen is null ? Array.Empty<DiaryEntry>() : _repository.GetForUser(userId, chosen);
        return Ok(new DiaryListDto(chosen, years, entries.Count, entries.Select(ToDto).ToList()));
    }

    [HttpPost("Entries")]
    public async Task<ActionResult<DiaryEntryDto>> AddEntry([FromBody] EntryInputDto input)
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null)
        {
            return denied;
        }

        if (!Guid.TryParse(input?.ItemId, out var itemGuid))
        {
            return BadRequest("Película no válida.");
        }

        var item = _libraryManager.GetItemById(itemGuid);
        if (item is not Movie || !item.IsVisibleStandalone(auth!.User))
        {
            return NotFound();
        }

        if (!TryDate(input!.Date, out var date, out var dateError))
        {
            return BadRequest(dateError);
        }

        if (!TryRating(input.Rating, out var rating))
        {
            return BadRequest("La nota debe estar entre 0,5 y 5 estrellas.");
        }

        var note = CleanNote(input.Note);
        if (note is not null && note.Length > MaxNoteLength)
        {
            return BadRequest("El comentario es demasiado largo.");
        }

        var when = DateTime.SpecifyKind(date.Date.AddHours(12), DateTimeKind.Local).ToUniversalTime();
        var id = _repository.Add(auth.UserId.ToString("D", CultureInfo.InvariantCulture), item.Id.ToString("D", CultureInfo.InvariantCulture), when, date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), DiarySource.Manual, rating, note);
        return Ok(ToDto(_repository.Get(id)!));
    }

    [HttpPut("Entries/{id:long}")]
    public async Task<ActionResult<DiaryEntryDto>> UpdateEntry([FromRoute] long id, [FromBody] EntryPatchDto patch)
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null)
        {
            return denied;
        }

        var userId = auth!.UserId.ToString("D", CultureInfo.InvariantCulture);
        var existing = _repository.Get(id);
        // 404 también si es de otra persona: el diario es privado y no se confirma que existe.
        if (existing is null || existing.UserId != userId)
        {
            return NotFound();
        }

        string? date = null;
        if (patch.Date is not null)
        {
            if (!TryDate(patch.Date, out var d, out var err))
            {
                return BadRequest(err);
            }

            date = d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }

        int? rating = null;
        if (!patch.ClearRating && patch.Rating is not null)
        {
            if (!TryRating(patch.Rating, out rating))
            {
                return BadRequest("La nota debe estar entre 0,5 y 5 estrellas.");
            }
        }

        var clear = patch.ClearRating || (patch.Rating is not null && rating is null);
        var note = patch.SetNote ? CleanNote(patch.Note) : null;
        if (note is not null && note.Length > MaxNoteLength)
        {
            return BadRequest("El comentario es demasiado largo.");
        }

        _repository.Update(id, userId, date, rating, clear, note, patch.SetNote);
        return Ok(ToDto(_repository.Get(id)!));
    }

    [HttpDelete("Entries/{id:long}")]
    public async Task<ActionResult> DeleteEntry([FromRoute] long id)
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null)
        {
            return denied;
        }

        return _repository.Delete(id, auth!.UserId.ToString("D", CultureInfo.InvariantCulture)) ? NoContent() : NotFound();
    }

    [HttpGet("Year/{year:int}")]
    public async Task<ActionResult<YearStatsDto>> GetYear([FromRoute] int year)
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null)
        {
            return denied;
        }

        if (year is < 1900 or > 2200)
        {
            return BadRequest("Año no válido.");
        }

        var entries = _repository.GetForUser(auth!.UserId.ToString("D", CultureInfo.InvariantCulture), year);
        var facts = entries.Select(e =>
        {
            var item = Find(e.ItemId);
            return new StatFact(
                e.WatchedDate,
                e.ItemId,
                item?.Name ?? "Elemento eliminado",
                item?.ProductionYear,
                (int)Math.Round((item?.RunTimeTicks ?? 0) / (double)TimeSpan.TicksPerMinute),
                item?.Genres ?? Array.Empty<string>(),
                e.Rating,
                e.Rewatch,
                e.WatchedUtc);
        }).ToList();

        var community = new List<CommunityFilmDto>();
        foreach (var (itemId, viewers) in _repository.GetCommunityTop(year, 3))
        {
            var item = Find(itemId);
            if (item is not null && item.IsVisibleStandalone(auth.User))
            {
                community.Add(new CommunityFilmDto(itemId, item.Name ?? string.Empty, item.ProductionYear, viewers));
            }
        }

        return Ok(DiaryStats.Compute(year, facts, community));
    }

    /// <summary>Trae a tu diario las películas que Jellyfin ya marca como vistas y que aún no tienes apuntadas,
    /// con la última fecha en que las viste (Jellyfin no guarda cada visionado, solo el último).</summary>
    [HttpPost("Import")]
    public async Task<ActionResult<ImportResultDto>> Import()
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null)
        {
            return denied;
        }

        return Ok(ImportFor(auth!.User!));
    }

    [HttpPost("Admin/ImportAll")]
    public async Task<ActionResult<ImportResultDto>> ImportAll()
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null)
        {
            return denied;
        }

        if (!IsAdmin(auth!.User))
        {
            return StatusCode(StatusCodes.Status403Forbidden);
        }

        int added = 0, skipped = 0;
        foreach (var id in _userManager.GetUsersIds())
        {
            var user = _userManager.GetUserById(id);
            if (user is null)
            {
                continue;
            }

            var r = ImportFor(user);
            added += r.Added;
            skipped += r.Skipped;
        }

        return Ok(new ImportResultDto(added, skipped));
    }

    [HttpGet("Admin/Summary")]
    public async Task<ActionResult<IReadOnlyList<AdminUserSummaryDto>>> GetSummary()
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null)
        {
            return denied;
        }

        if (!IsAdmin(auth!.User))
        {
            return StatusCode(StatusCodes.Status403Forbidden);
        }

        // Solo recuentos por usuario: el administrador no ve qué películas hay en cada diario.
        var rows = _repository.GetUserSummary().Select(r =>
            new AdminUserSummaryDto(r.UserId, Guid.TryParse(r.UserId, out var g) ? _userManager.GetUserById(g)?.Username ?? "Usuario eliminado" : "Usuario eliminado", r.Entries, r.Last)).ToList();
        return Ok(rows);
    }

    private ImportResultDto ImportFor(User user)
    {
        var userId = user.Id.ToString("D", CultureInfo.InvariantCulture);
        var movies = _libraryManager.GetItemList(new InternalItemsQuery(user)
        {
            IncludeItemTypes = new[] { BaseItemKind.Movie },
            IsPlayed = true,
            Recursive = true,
        });

        var have = _repository.GetItemIds(userId);
        var rows = new List<(string, DateTime, string)>();
        var skipped = 0;
        foreach (var item in movies)
        {
            var itemId = item.Id.ToString("D", CultureInfo.InvariantCulture);
            if (have.Contains(itemId))
            {
                skipped++;
                continue;
            }

            var data = _userDataManager.GetUserData(user, item);
            var last = data?.LastPlayedDate ?? item.DateCreated;
            var when = DateTime.SpecifyKind(last, DateTimeKind.Utc);
            rows.Add((itemId, when, when.ToLocalTime().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)));
        }

        var added = _repository.AddMany(userId, rows, DiarySource.Imported);
        return new ImportResultDto(added, skipped);
    }

    private BaseItem? Find(string itemId) => Guid.TryParse(itemId, out var g) ? _libraryManager.GetItemById(g) : null;

    private DiaryEntryDto ToDto(DiaryEntry e)
    {
        var item = Find(e.ItemId);
        return new DiaryEntryDto(
            e.Id,
            e.ItemId,
            item?.Name ?? "Elemento eliminado",
            item?.ProductionYear,
            item is not null && item.HasImage(MediaBrowser.Model.Entities.ImageType.Primary, 0),
            e.WatchedDate,
            e.Rating,
            e.Note,
            e.Rewatch,
            e.Source,
            (int)Math.Round((item?.RunTimeTicks ?? 0) / (double)TimeSpan.TicksPerMinute),
            item?.Genres ?? Array.Empty<string>());
    }

    private async Task<(AuthorizationInfo? Auth, ActionResult? Denied)> Authenticate()
    {
        var auth = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        if (!auth.IsAuthenticated || auth.IsApiKey || auth.User is null)
        {
            return (null, new UnauthorizedResult());
        }

        return (auth, null);
    }

    private static bool TryDate(string? text, out DateTime date, out string error)
    {
        error = "Fecha no válida (usa AAAA-MM-DD).";
        if (!DateTime.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date))
        {
            return false;
        }

        if (date.Date > DateTime.Now.Date.AddDays(1) || date.Year < 1900)
        {
            error = "La fecha no puede estar en el futuro.";
            return false;
        }

        return true;
    }

    private static bool TryRating(int? value, out int? rating)
    {
        rating = null;
        if (value is null or 0)
        {
            return true;
        }

        if (value is < 1 or > 10)
        {
            return false;
        }

        rating = value;
        return true;
    }

    private static string? CleanNote(string? note)
    {
        var t = note?.Trim();
        return string.IsNullOrEmpty(t) ? null : t;
    }

    // AuthorizationInfo.User no tiene HasPermission en esta ABI (mismo método que en Blog y Watchlist).
    private static bool IsAdmin(User? user)
    {
        return user is not null && user.Permissions.Any(p => p.Kind == PermissionKind.IsAdministrator && p.Value);
    }
}
