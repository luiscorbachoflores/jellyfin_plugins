using System.Text.Json;
using Jellyfin.Plugin.Watchlist.Api;
using Xunit;

namespace Jellyfin.Plugin.Watchlist.Tests;

public class DtoSerializationTests
{
    [Fact]
    public void WatchlistItemDto_SerializesWithPascalCasePropertyNames()
    {
        var dto = new WatchlistItemDto("11111111-1111-1111-1111-111111111111", "Alien", "Movie", 1979, true, "2026-01-01T00:00:00.0000000Z");

        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(dto));
        var root = doc.RootElement;

        Assert.Equal("11111111-1111-1111-1111-111111111111", root.GetProperty("ItemId").GetString());
        Assert.Equal("Alien", root.GetProperty("Name").GetString());
        Assert.Equal("Movie", root.GetProperty("Type").GetString());
        Assert.Equal(1979, root.GetProperty("ProductionYear").GetInt32());
        Assert.True(root.GetProperty("HasPrimaryImage").GetBoolean());
        Assert.Equal("2026-01-01T00:00:00.0000000Z", root.GetProperty("AddedUtc").GetString());
    }

    [Fact]
    public void WatchlistItemDto_WithoutYear_SerializesYearAsNull()
    {
        var dto = new WatchlistItemDto("id", "X", "Series", null, false, "t");

        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(dto));

        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("ProductionYear").ValueKind);
    }

    [Fact]
    public void ItemStatusDto_SerializesWithPascalCasePropertyNames()
    {
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(new ItemStatusDto(true, false)));

        Assert.True(doc.RootElement.GetProperty("Eligible").GetBoolean());
        Assert.False(doc.RootElement.GetProperty("InWatchlist").GetBoolean());
    }
}
