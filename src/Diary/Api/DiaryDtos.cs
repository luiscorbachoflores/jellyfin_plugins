using System.Collections.Generic;

namespace Jellyfin.Plugin.Diary.Api;

public record DiaryEntryDto(
    long Id,
    string ItemId,
    string Name,
    int? Year,
    bool HasPrimaryImage,
    string Date,
    int? Rating,
    string? Note,
    bool Rewatch,
    string Source,
    int Minutes,
    IReadOnlyList<string> Genres);

public record DiaryListDto(int? Year, IReadOnlyList<int> Years, int Total, IReadOnlyList<DiaryEntryDto> Entries);

public class EntryInputDto
{
    public string? ItemId { get; set; }

    /// <summary>Fecha yyyy-MM-dd.</summary>
    public string? Date { get; set; }

    /// <summary>Nota de 1 a 10 (medias estrellas). null o 0 = sin nota.</summary>
    public int? Rating { get; set; }

    public string? Note { get; set; }
}

public class EntryPatchDto
{
    public string? Date { get; set; }

    public int? Rating { get; set; }

    /// <summary>true para quitar la nota (Rating = null no distingue «no tocar» de «quitar»).</summary>
    public bool ClearRating { get; set; }

    public string? Note { get; set; }

    public bool SetNote { get; set; }
}

public record ImportResultDto(int Added, int Skipped);

public record AdminUserSummaryDto(string UserId, string UserName, int Entries, string? Last);
