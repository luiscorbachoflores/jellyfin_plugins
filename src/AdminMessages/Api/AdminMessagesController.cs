using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.AdminMessages.Db;
using MediaBrowser.Controller.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.AdminMessages.Api;

[ApiController]
[Route("AdminMessages")]
[AllowAnonymous]
public class AdminMessagesController : ControllerBase
{
    private readonly AdminMessagesRepository _repository;
    private readonly IAuthorizationContext _authorizationContext;
    private readonly ILogger<AdminMessagesController> _logger;

    public AdminMessagesController(
        AdminMessagesRepository repository,
        IAuthorizationContext authorizationContext,
        ILogger<AdminMessagesController> logger)
    {
        _repository = repository;
        _authorizationContext = authorizationContext;
        _logger = logger;
    }

    [HttpGet("ClientScript")]
    public ActionResult GetClientScript()
    {
        var assembly = typeof(AdminMessagesController).Assembly;
        using var stream = assembly.GetManifestResourceStream("Jellyfin.Plugin.AdminMessages.wwwroot.adminmessages.js");
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

    [HttpPost]
    public async Task<ActionResult<AdminMessageDto>> Post([FromBody] CreateMessageDto dto)
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        var denied = AdminAccessPolicy.CheckAdminAccess(authInfo.IsAuthenticated, IsAdmin(authInfo));
        if (denied is not null)
        {
            _logger.LogWarning("AdminMessages: POST denegado (IsAuthenticated={IsAuth}).", authInfo.IsAuthenticated);
            return denied;
        }

        if (!TryValidate(dto, out var title, out var body, out var error))
        {
            return BadRequest(error);
        }

        var record = _repository.Add(authInfo.UserId.ToString(), title, body, dto.TargetUserIds ?? new List<string>());
        return Ok(ToAdminDto(record));
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AdminMessageDto>>> GetAll()
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        var denied = AdminAccessPolicy.CheckAdminAccess(authInfo.IsAuthenticated, IsAdmin(authInfo));
        if (denied is not null)
        {
            return denied;
        }

        return Ok(_repository.GetAll().Select(ToAdminDto).ToList());
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<AdminMessageDto>> Put([FromRoute] Guid id, [FromBody] CreateMessageDto dto)
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        var denied = AdminAccessPolicy.CheckAdminAccess(authInfo.IsAuthenticated, IsAdmin(authInfo));
        if (denied is not null)
        {
            return denied;
        }

        if (!TryValidate(dto, out var title, out var body, out var error))
        {
            return BadRequest(error);
        }

        var updated = _repository.Update(id, title, body, dto.TargetUserIds ?? new List<string>());
        if (updated is null)
        {
            return NotFound();
        }

        return Ok(ToAdminDto(updated));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete([FromRoute] Guid id)
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        var denied = AdminAccessPolicy.CheckAdminAccess(authInfo.IsAuthenticated, IsAdmin(authInfo));
        if (denied is not null)
        {
            return denied;
        }

        return _repository.Delete(id) ? NoContent() : NotFound();
    }

    [HttpGet("mine")]
    public async Task<ActionResult<IReadOnlyList<UserMessageDto>>> GetMine()
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        if (!authInfo.IsAuthenticated || authInfo.User is null)
        {
            return Unauthorized();
        }

        var records = _repository.GetForUser(authInfo.UserId.ToString());
        return Ok(records.Select(ToUserDto).ToList());
    }

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkRead([FromRoute] Guid id)
    {
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request).ConfigureAwait(false);
        if (!authInfo.IsAuthenticated || authInfo.User is null)
        {
            return Unauthorized();
        }

        var userId = authInfo.UserId.ToString();
        if (!_repository.AppliesToUser(id, userId))
        {
            return NotFound();
        }

        _repository.MarkRead(id, userId);
        return NoContent();
    }

    private static bool IsAdmin(AuthorizationInfo authInfo)
    {
        // AuthorizationInfo.User (Jellyfin.Database.Implementations.Entities.User) has no
        // HasPermission helper on this ABI; check the Permissions collection directly, same
        // as WeeklyPick's CheckAdmin. IsApiKey requests have no User but are trusted callers.
        return authInfo.IsApiKey
            || (authInfo.User is not null && authInfo.User.Permissions.Any(p => p.Kind == PermissionKind.IsAdministrator && p.Value));
    }

    private static bool TryValidate(CreateMessageDto dto, out string title, out string body, out string? error)
    {
        title = (dto.Title ?? string.Empty).Trim();
        body = (dto.Body ?? string.Empty).Trim();
        error = null;

        if (title.Length == 0 || body.Length == 0)
        {
            error = "Title y Body son obligatorios.";
            return false;
        }

        if (dto.TargetUserIds is not null)
        {
            foreach (var target in dto.TargetUserIds)
            {
                if (!Guid.TryParse(target, out _))
                {
                    error = $"TargetUserIds contiene un id de usuario no válido: '{target}'.";
                    return false;
                }
            }
        }

        return true;
    }

    private static AdminMessageDto ToAdminDto(MessageRecord record)
    {
        return new AdminMessageDto(record.Id, record.AdminUserId, record.Title, record.Body, record.CreatedUtc, record.TargetUserIds);
    }

    private static UserMessageDto ToUserDto(UserMessageRecord record)
    {
        return new UserMessageDto(record.Id, record.Title, record.Body, record.CreatedUtc, record.IsRead);
    }
}

public record AdminMessageDto(Guid Id, string AdminUserId, string Title, string Body, string CreatedUtc, IReadOnlyList<string> TargetUserIds);

public record UserMessageDto(Guid Id, string Title, string Body, string CreatedUtc, bool IsRead);

public class CreateMessageDto
{
    public string Title { get; set; } = string.Empty;

    public string Body { get; set; } = string.Empty;

    public List<string>? TargetUserIds { get; set; } = new();
}
