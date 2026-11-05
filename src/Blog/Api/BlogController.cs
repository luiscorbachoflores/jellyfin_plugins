using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.Blog.Db;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Blog.Api;

[ApiController]
[Route("Blog")]
[AllowAnonymous]
public class BlogController : ControllerBase
{
    private readonly BlogRepository _repository;
    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly IAuthorizationContext _authorizationContext;
    private readonly IApplicationPaths _appPaths;
    private readonly ILogger<BlogController> _logger;

    public BlogController(
        BlogRepository repository,
        ILibraryManager libraryManager,
        IUserManager userManager,
        IAuthorizationContext authorizationContext,
        IApplicationPaths appPaths,
        ILogger<BlogController> logger)
    {
        _repository = repository;
        _libraryManager = libraryManager;
        _userManager = userManager;
        _authorizationContext = authorizationContext;
        _appPaths = appPaths;
        _logger = logger;
    }

    [HttpGet("ClientScript")]
    public ActionResult GetClientScript()
    {
        var assembly = typeof(BlogController).Assembly;
        using var stream = assembly.GetManifestResourceStream("Jellyfin.Plugin.Blog.wwwroot.blog.js");
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

    [HttpGet("Info")]
    public async Task<ActionResult<BlogInfoDto>> GetInfo()
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null || auth is null)
        {
            return denied!;
        }

        var config = Plugin.Instance?.Configuration;
        return Ok(new BlogInfoDto(BlogDefaults.TitleOrDefault(config?.Title), BlogDefaults.DescriptionOrDefault(config?.Description)));
    }

    [HttpGet("Posts")]
    public async Task<ActionResult<PostListDto>> GetPosts(
        [FromQuery] int? page,
        [FromQuery] string? label,
        [FromQuery] string? archive,
        [FromQuery] string? author,
        [FromQuery] string? item,
        [FromQuery] string? q)
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null || auth is null)
        {
            return denied!;
        }

        var pageNumber = BlogValidation.NormalizePage(page);

        if (!string.IsNullOrEmpty(archive) && !BlogValidation.IsValidArchive(archive))
        {
            return BadRequest("El filtro de archivo debe tener el formato AAAA-MM.");
        }

        string? authorId = null;
        if (!string.IsNullOrEmpty(author))
        {
            if (!Guid.TryParse(author, out var authorGuid))
            {
                return BadRequest("Autor no válido.");
            }

            authorId = authorGuid.ToString("D");
        }

        Guid? itemId = null;
        if (!string.IsNullOrEmpty(item))
        {
            if (!Guid.TryParse(item, out var itemGuid))
            {
                return BadRequest("Título no válido.");
            }

            // Solo hay resultados si el lector puede ver ese título.
            var libraryItem = _libraryManager.GetItemById(itemGuid);
            if (libraryItem is null || !libraryItem.IsVisibleStandalone(auth.User))
            {
                return Ok(new PostListDto(Array.Empty<PostSummaryDto>(), pageNumber, false, false));
            }

            itemId = itemGuid;
        }

        var text = (q ?? string.Empty).Trim();
        if (text.Length > BlogLimits.SearchTextMax)
        {
            text = text.Substring(0, BlogLimits.SearchTextMax);
        }

        var result = _repository.QueryPosts(new PostQuery(label, archive, authorId, itemId, text), pageNumber);
        var viewer = Viewer.From(auth);
        var names = new NameCache(_userManager);
        var posts = result.Posts.Select(p => ToSummary(p, viewer, names, auth.User)).ToList();
        return Ok(new PostListDto(posts, result.Page, result.HasNewer, result.HasOlder));
    }

    [HttpGet("Posts/{id:guid}")]
    public async Task<ActionResult<PostDetailDto>> GetPost([FromRoute] Guid id)
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null || auth is null)
        {
            return denied!;
        }

        var post = _repository.GetPost(id);
        if (post is null)
        {
            return NotFound();
        }

        return Ok(ToDetail(post, Viewer.From(auth), new NameCache(_userManager), auth.User));
    }

    [HttpPost("Posts")]
    public async Task<ActionResult<PostDetailDto>> CreatePost([FromBody] PostInputDto dto)
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null || auth is null)
        {
            return denied!;
        }

        if (!TryValidatePost(dto, auth.User, out var validated, out var error))
        {
            return BadRequest(error);
        }

        var created = _repository.CreatePost(auth.UserId.ToString("D"), validated);
        return Ok(ToDetail(created, Viewer.From(auth), new NameCache(_userManager), auth.User));
    }

    [HttpPut("Posts/{id:guid}")]
    public async Task<ActionResult<PostDetailDto>> UpdatePost([FromRoute] Guid id, [FromBody] PostInputDto dto)
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null || auth is null)
        {
            return denied!;
        }

        var existing = _repository.GetPost(id);
        if (existing is null)
        {
            return NotFound();
        }

        // Solo el autor edita, aunque el solicitante sea administrador.
        var forbidden = BlogAccessPolicy.CheckEdit(auth.UserId.ToString("D"), existing.AuthorUserId);
        if (forbidden is not null)
        {
            return forbidden;
        }

        if (!TryValidatePost(dto, auth.User, out var validated, out var error))
        {
            return BadRequest(error);
        }

        var updated = _repository.UpdatePost(id, validated);
        if (updated is null)
        {
            return NotFound();
        }

        return Ok(ToDetail(updated, Viewer.From(auth), new NameCache(_userManager), auth.User));
    }

    [HttpDelete("Posts/{id:guid}")]
    public async Task<IActionResult> DeletePost([FromRoute] Guid id)
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null || auth is null)
        {
            return denied!;
        }

        var existing = _repository.GetPost(id);
        if (existing is null)
        {
            return NotFound();
        }

        var forbidden = BlogAccessPolicy.CheckDelete(auth.UserId.ToString("D"), existing.AuthorUserId, IsAdmin(auth.User));
        if (forbidden is not null)
        {
            return forbidden;
        }

        _repository.DeletePost(id);
        BlogImageStore.RemoveImage(_appPaths.PluginsPath, id);
        return NoContent();
    }

    [HttpPost("Posts/{id:guid}/Image")]
    [RequestSizeLimit(BlogImageStore.MaxBytes)]
    public async Task<IActionResult> UploadImage([FromRoute] Guid id, IFormFile? file)
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null || auth is null)
        {
            return denied!;
        }

        var existing = _repository.GetPost(id);
        if (existing is null)
        {
            return NotFound();
        }

        var forbidden = BlogAccessPolicy.CheckEdit(auth.UserId.ToString("D"), existing.AuthorUserId);
        if (forbidden is not null)
        {
            return forbidden;
        }

        if (file is null || file.Length == 0)
        {
            return BadRequest("No se ha recibido ninguna imagen.");
        }

        if (file.Length > BlogImageStore.MaxBytes)
        {
            return BadRequest("La imagen no puede superar 5 MB.");
        }

        var extension = BlogImageStore.ExtensionForContentType(file.ContentType);
        if (extension is null)
        {
            return BadRequest("Formato de imagen no admitido (solo JPEG, PNG o WebP).");
        }

        using (var stream = file.OpenReadStream())
        {
            BlogImageStore.SaveImage(_appPaths.PluginsPath, id, extension, stream);
        }

        return NoContent();
    }

    [HttpDelete("Posts/{id:guid}/Image")]
    public async Task<IActionResult> DeleteImage([FromRoute] Guid id)
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null || auth is null)
        {
            return denied!;
        }

        var existing = _repository.GetPost(id);
        if (existing is null)
        {
            return NotFound();
        }

        var forbidden = BlogAccessPolicy.CheckEdit(auth.UserId.ToString("D"), existing.AuthorUserId);
        if (forbidden is not null)
        {
            return forbidden;
        }

        BlogImageStore.RemoveImage(_appPaths.PluginsPath, id);
        return NoContent();
    }

    [HttpGet("Posts/{id:guid}/Image")]
    public async Task<IActionResult> GetImage([FromRoute] Guid id)
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null || auth is null)
        {
            return denied!;
        }

        var found = BlogImageStore.FindImage(_appPaths.PluginsPath, id);
        if (found is null)
        {
            return NotFound();
        }

        var bytes = await System.IO.File.ReadAllBytesAsync(found.Value.Path).ConfigureAwait(false);
        return File(bytes, found.Value.ContentType);
    }

    [HttpPost("Posts/{id:guid}/Comments")]
    public async Task<ActionResult<CommentDto>> AddComment([FromRoute] Guid id, [FromBody] CommentInputDto dto)
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null || auth is null)
        {
            return denied!;
        }

        if (_repository.GetPost(id) is null)
        {
            return NotFound();
        }

        if (!BlogValidation.TryValidateComment(dto?.Body, out var body, out var error))
        {
            return BadRequest(error);
        }

        var comment = _repository.AddComment(id, auth.UserId.ToString("D"), body);
        if (comment is null)
        {
            return NotFound();
        }

        return Ok(ToCommentDto(comment, Viewer.From(auth), new NameCache(_userManager)));
    }

    [HttpPut("Comments/{id:guid}")]
    public async Task<ActionResult<CommentDto>> UpdateComment([FromRoute] Guid id, [FromBody] CommentInputDto dto)
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null || auth is null)
        {
            return denied!;
        }

        var existing = _repository.GetComment(id);
        if (existing is null)
        {
            return NotFound();
        }

        var forbidden = BlogAccessPolicy.CheckEdit(auth.UserId.ToString("D"), existing.AuthorUserId);
        if (forbidden is not null)
        {
            return forbidden;
        }

        if (!BlogValidation.TryValidateComment(dto?.Body, out var body, out var error))
        {
            return BadRequest(error);
        }

        var updated = _repository.UpdateComment(id, body);
        if (updated is null)
        {
            return NotFound();
        }

        return Ok(ToCommentDto(updated, Viewer.From(auth), new NameCache(_userManager)));
    }

    [HttpDelete("Comments/{id:guid}")]
    public async Task<IActionResult> DeleteComment([FromRoute] Guid id)
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null || auth is null)
        {
            return denied!;
        }

        var existing = _repository.GetComment(id);
        if (existing is null)
        {
            return NotFound();
        }

        var forbidden = BlogAccessPolicy.CheckDelete(auth.UserId.ToString("D"), existing.AuthorUserId, IsAdmin(auth.User));
        if (forbidden is not null)
        {
            return forbidden;
        }

        _repository.DeleteComment(id);
        return NoContent();
    }

    [HttpGet("Sidebar")]
    public async Task<ActionResult<SidebarDto>> GetSidebar()
    {
        var (auth, denied) = await Authenticate().ConfigureAwait(false);
        if (denied is not null || auth is null)
        {
            return denied!;
        }

        var names = new NameCache(_userManager);

        var archive = _repository.GetArchive()
            .Select(y => new ArchiveYearDto(
                y.Year,
                y.Count,
                y.Months.Select(m => new ArchiveMonthDto(m.Month, m.Count, m.Posts.Select(p => new PostRefDto(p.Id.ToString("D"), p.Title)).ToList())).ToList()))
            .ToList();
        var labels = _repository.GetLabelCounts().Select(l => new LabelCountDto(l.Name, l.Count)).ToList();
        var authors = _repository.GetAuthorCounts()
            .Select(a => new AuthorCountDto(a.UserId, names.Resolve(a.UserId), a.PostCount))
            .OrderByDescending(a => a.PostCount)
            .ThenBy(a => a.Name, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
        var recent = _repository.GetRecentComments(BlogLimits.RecentCommentCount)
            .Select(c => new RecentCommentDto(
                c.PostId.ToString("D"),
                c.PostTitle,
                names.Resolve(c.AuthorUserId),
                ExcerptCutter.SingleLine(c.Body, BlogLimits.RecentCommentExcerptLength),
                c.CreatedUtc))
            .ToList();

        return Ok(new SidebarDto(archive, labels, authors, recent));
    }

    // ------------------------------------------------------------------ helpers

    private async Task<(AuthorizationInfo? Auth, ActionResult? Denied)> Authenticate()
    {
        var auth = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        var denied = BlogAccessPolicy.CheckAuthenticated(auth.IsAuthenticated, auth.IsApiKey, auth.User is not null);
        if (denied is not null)
        {
            return (null, denied);
        }

        var allowedUserIds = Plugin.Instance?.Configuration.AllowedUserIds ?? new List<string>();
        denied = BlogAccessPolicy.CheckAccess(IsAdmin(auth.User), auth.UserId.ToString("D"), allowedUserIds);
        return denied is not null ? (null, denied) : (auth, null);
    }

    // AuthorizationInfo.User (Jellyfin.Database.Implementations.Entities.User) no tiene HasPermission en esta ABI.
    private static bool IsAdmin(User? user)
    {
        return user is not null && user.Permissions.Any(p => p.Kind == PermissionKind.IsAdministrator && p.Value);
    }

    private bool TryValidatePost(PostInputDto? dto, User? user, out ValidatedPost validated, out string? error)
    {
        validated = new ValidatedPost(string.Empty, string.Empty, Array.Empty<string>(), Array.Empty<Guid>(), false);
        if (dto is null)
        {
            error = "Cuerpo de la petición no válido.";
            return false;
        }

        if (!BlogValidation.TryValidatePost(dto.Title, dto.Body, dto.Labels, dto.MentionItemIds, dto.HasSpoilers, out validated, out error))
        {
            return false;
        }

        // Cada mención debe existir, ser película/serie y ser visible para el autor. Un solo
        // mensaje para todos los fallos: no se revela cuál ni por qué.
        foreach (var itemId in validated.MentionItemIds)
        {
            var item = _libraryManager.GetItemById(itemId);
            if (item is null
                || !BlogValidation.IsMentionableKind(item.GetBaseItemKind().ToString())
                || !item.IsVisibleStandalone(user))
            {
                error = BlogValidation.MentionsErrorMessage;
                return false;
            }
        }

        return true;
    }

    private IReadOnlyList<MentionDto> ResolveMentions(IReadOnlyList<Guid> ids, User? viewer)
    {
        var list = new List<MentionDto>();
        foreach (var id in ids)
        {
            var item = _libraryManager.GetItemById(id);
            // Borradas o no visibles para el lector: se omiten sin tocar la base de datos.
            if (item is null || !item.IsVisibleStandalone(viewer))
            {
                continue;
            }

            list.Add(new MentionDto(
                id.ToString("D"),
                item.Name ?? string.Empty,
                item.GetBaseItemKind().ToString(),
                item.ProductionYear,
                item.HasImage(MediaBrowser.Model.Entities.ImageType.Primary, 0)));
        }

        return list;
    }

    private PostSummaryDto ToSummary(PostRecord p, Viewer viewer, NameCache names, User? user)
    {
        var (excerpt, truncated) = ExcerptCutter.Cut(p.Body, BlogLimits.ExcerptLength);
        return new PostSummaryDto(
            p.Id.ToString("D"),
            p.Title,
            excerpt,
            truncated,
            p.HasSpoilers,
            new AuthorDto(p.AuthorUserId, names.Resolve(p.AuthorUserId)),
            p.CreatedUtc,
            p.UpdatedUtc,
            p.Labels,
            ResolveMentions(p.MentionItemIds, user),
            p.CommentCount,
            BlogAccessPolicy.CanEdit(viewer.UserId, p.AuthorUserId),
            BlogAccessPolicy.CanDelete(viewer.UserId, p.AuthorUserId, viewer.IsAdmin),
            BlogImageStore.HasImage(_appPaths.PluginsPath, p.Id));
    }

    private PostDetailDto ToDetail(PostRecord p, Viewer viewer, NameCache names, User? user)
    {
        var comments = _repository.GetComments(p.Id).Select(c => ToCommentDto(c, viewer, names)).ToList();
        var (newer, older) = _repository.GetNeighbours(p.Id);
        return new PostDetailDto(
            p.Id.ToString("D"),
            p.Title,
            p.Body,
            p.HasSpoilers,
            new AuthorDto(p.AuthorUserId, names.Resolve(p.AuthorUserId)),
            p.CreatedUtc,
            p.UpdatedUtc,
            p.Labels,
            ResolveMentions(p.MentionItemIds, user),
            comments.Count,
            BlogAccessPolicy.CanEdit(viewer.UserId, p.AuthorUserId),
            BlogAccessPolicy.CanDelete(viewer.UserId, p.AuthorUserId, viewer.IsAdmin),
            BlogImageStore.HasImage(_appPaths.PluginsPath, p.Id),
            comments,
            newer is null ? null : new PostRefDto(newer.Id.ToString("D"), newer.Title),
            older is null ? null : new PostRefDto(older.Id.ToString("D"), older.Title));
    }

    private static CommentDto ToCommentDto(CommentRecord c, Viewer viewer, NameCache names)
    {
        return new CommentDto(
            c.Id.ToString("D"),
            new AuthorDto(c.AuthorUserId, names.Resolve(c.AuthorUserId)),
            c.Body,
            c.CreatedUtc,
            c.UpdatedUtc,
            BlogAccessPolicy.CanEdit(viewer.UserId, c.AuthorUserId),
            BlogAccessPolicy.CanDelete(viewer.UserId, c.AuthorUserId, viewer.IsAdmin));
    }

    private sealed record Viewer(string UserId, bool IsAdmin)
    {
        public static Viewer From(AuthorizationInfo auth) => new(auth.UserId.ToString("D"), BlogController.IsAdmin(auth.User));
    }

    /// <summary>Resuelve nombres de usuario una sola vez por petición.</summary>
    private sealed class NameCache
    {
        private readonly IUserManager _users;
        private readonly Dictionary<string, string> _names = new(StringComparer.OrdinalIgnoreCase);

        public NameCache(IUserManager users)
        {
            _users = users;
        }

        public string Resolve(string userId)
        {
            if (_names.TryGetValue(userId, out var cached))
            {
                return cached;
            }

            string name = BlogDefaults.DeletedUserName;
            if (Guid.TryParse(userId, out var guid))
            {
                var user = _users.GetUserById(guid);
                if (user is not null && !string.IsNullOrEmpty(user.Username))
                {
                    name = user.Username;
                }
            }

            _names[userId] = name;
            return name;
        }
    }
}
