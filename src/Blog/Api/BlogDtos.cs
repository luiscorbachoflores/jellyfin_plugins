using System.Collections.Generic;

namespace Jellyfin.Plugin.Blog.Api;

// Solo tipos BCL: ver BlogValidation. PascalCase en el JSON (como el resto de plugins).

public record BlogInfoDto(string Title, string Description);

public record AuthorDto(string UserId, string Name);

public record MentionDto(string ItemId, string Name, string Type, int? ProductionYear, bool HasPrimaryImage);

public record PostSummaryDto(
    string Id,
    string Title,
    string Excerpt,
    bool IsTruncated,
    bool HasSpoilers,
    AuthorDto Author,
    string CreatedUtc,
    string? UpdatedUtc,
    IReadOnlyList<string> Labels,
    IReadOnlyList<MentionDto> Mentions,
    int CommentCount,
    bool CanEdit,
    bool CanDelete,
    bool HasImage);

public record PostListDto(IReadOnlyList<PostSummaryDto> Posts, int Page, bool HasNewer, bool HasOlder);

public record CommentDto(string Id, AuthorDto Author, string Body, string CreatedUtc, string? UpdatedUtc, bool CanEdit, bool CanDelete);

public record PostRefDto(string Id, string Title);

public record PostDetailDto(
    string Id,
    string Title,
    string Body,
    bool HasSpoilers,
    AuthorDto Author,
    string CreatedUtc,
    string? UpdatedUtc,
    IReadOnlyList<string> Labels,
    IReadOnlyList<MentionDto> Mentions,
    int CommentCount,
    bool CanEdit,
    bool CanDelete,
    bool HasImage,
    IReadOnlyList<CommentDto> Comments,
    PostRefDto? Newer,
    PostRefDto? Older);

public record ArchiveMonthDto(int Month, int Count, IReadOnlyList<PostRefDto> Posts);

public record ArchiveYearDto(int Year, int Count, IReadOnlyList<ArchiveMonthDto> Months);

public record LabelCountDto(string Name, int Count);

public record AuthorCountDto(string UserId, string Name, int PostCount);

public record RecentCommentDto(string PostId, string PostTitle, string AuthorName, string Excerpt, string CreatedUtc);

public record SidebarDto(
    IReadOnlyList<ArchiveYearDto> Archive,
    IReadOnlyList<LabelCountDto> Labels,
    IReadOnlyList<AuthorCountDto> Authors,
    IReadOnlyList<RecentCommentDto> RecentComments);

/// <summary>Cuerpo de POST/PUT /Blog/Posts. Los ids de títulos llegan como texto y se validan a mano.</summary>
public class PostInputDto
{
    public string? Title { get; set; }

    public string? Body { get; set; }

    public List<string?>? Labels { get; set; }

    public List<string?>? MentionItemIds { get; set; }

    public bool HasSpoilers { get; set; }
}

public class CommentInputDto
{
    public string? Body { get; set; }
}
