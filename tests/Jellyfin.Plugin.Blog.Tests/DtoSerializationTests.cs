using System.Text.Json;
using Jellyfin.Plugin.Blog.Api;
using Xunit;

namespace Jellyfin.Plugin.Blog.Tests;

public class DtoSerializationTests
{
    private static JsonElement Ser(object o) => JsonDocument.Parse(JsonSerializer.Serialize(o, o.GetType())).RootElement;

    [Fact]
    public void PostList_HasDocumentedShape()
    {
        var summary = new PostSummaryDto(
            "id1", "T", "extracto", true, true,
            new AuthorDto("u1", "luis"),
            "2026-11-04T21:30:00.000Z", null,
            new[] { "terror" },
            new[] { new MentionDto("i1", "Alien", "Movie", 1979, true) },
            3, true, false);
        var root = Ser(new PostListDto(new[] { summary }, 2, true, false));

        Assert.Equal(2, root.GetProperty("Page").GetInt32());
        Assert.True(root.GetProperty("HasNewer").GetBoolean());
        Assert.False(root.GetProperty("HasOlder").GetBoolean());
        var p = root.GetProperty("Posts")[0];
        foreach (var name in new[] { "Id", "Title", "Excerpt", "IsTruncated", "HasSpoilers", "Author", "CreatedUtc", "UpdatedUtc", "Labels", "Mentions", "CommentCount", "CanEdit", "CanDelete" })
        {
            Assert.True(p.TryGetProperty(name, out _), "falta " + name);
        }

        Assert.Equal("luis", p.GetProperty("Author").GetProperty("Name").GetString());
        Assert.Equal("u1", p.GetProperty("Author").GetProperty("UserId").GetString());
        Assert.Equal(JsonValueKind.Null, p.GetProperty("UpdatedUtc").ValueKind);
        var m = p.GetProperty("Mentions")[0];
        Assert.Equal("Alien", m.GetProperty("Name").GetString());
        Assert.Equal(1979, m.GetProperty("ProductionYear").GetInt32());
        Assert.True(m.GetProperty("HasPrimaryImage").GetBoolean());
        Assert.Equal("Movie", m.GetProperty("Type").GetString());
        Assert.Equal("i1", m.GetProperty("ItemId").GetString());
    }

    [Fact]
    public void PostDetail_HasBodyCommentsAndNeighbours()
    {
        var detail = new PostDetailDto(
            "id1", "T", "cuerpo completo", false,
            new AuthorDto("u1", "luis"), "c", "u",
            new[] { "a" }, System.Array.Empty<MentionDto>(), 1, true, true,
            new[] { new CommentDto("c1", new AuthorDto("u2", "ana"), "hola", "c", null, false, true) },
            new PostRefDto("n", "Nueva"), null);
        var root = Ser(detail);

        Assert.Equal("cuerpo completo", root.GetProperty("Body").GetString());
        Assert.False(root.TryGetProperty("Excerpt", out _));
        var c = root.GetProperty("Comments")[0];
        foreach (var name in new[] { "Id", "Author", "Body", "CreatedUtc", "UpdatedUtc", "CanEdit", "CanDelete" })
        {
            Assert.True(c.TryGetProperty(name, out _), "falta " + name);
        }

        Assert.Equal("Nueva", root.GetProperty("Newer").GetProperty("Title").GetString());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("Older").ValueKind);
    }

    [Fact]
    public void Sidebar_HasDocumentedShape()
    {
        var sidebar = new SidebarDto(
            new[] { new ArchiveYearDto(2026, 2, new[] { new ArchiveMonthDto(11, 2, new[] { new PostRefDto("p", "T") }) }) },
            new[] { new LabelCountDto("terror", 2) },
            new[] { new AuthorCountDto("u1", "luis", 2) },
            new[] { new RecentCommentDto("p", "T", "ana", "hola", "2026-11-04T10:00:00.000Z") });
        var root = Ser(sidebar);

        var y = root.GetProperty("Archive")[0];
        Assert.Equal(2026, y.GetProperty("Year").GetInt32());
        Assert.Equal(2, y.GetProperty("Count").GetInt32());
        var mo = y.GetProperty("Months")[0];
        Assert.Equal(11, mo.GetProperty("Month").GetInt32());
        Assert.Equal("T", mo.GetProperty("Posts")[0].GetProperty("Title").GetString());
        Assert.Equal("terror", root.GetProperty("Labels")[0].GetProperty("Name").GetString());
        Assert.Equal(2, root.GetProperty("Authors")[0].GetProperty("PostCount").GetInt32());
        var rc = root.GetProperty("RecentComments")[0];
        foreach (var name in new[] { "PostId", "PostTitle", "AuthorName", "Excerpt", "CreatedUtc" })
        {
            Assert.True(rc.TryGetProperty(name, out _), "falta " + name);
        }
    }

    [Fact]
    public void Info_HasTitleAndDescription()
    {
        var root = Ser(new BlogInfoDto("Blog de cine", "desc"));
        Assert.Equal("Blog de cine", root.GetProperty("Title").GetString());
        Assert.Equal("desc", root.GetProperty("Description").GetString());
    }

    [Fact]
    public void PostInput_DeserializesPascalCaseBody()
    {
        var dto = JsonSerializer.Deserialize<PostInputDto>("{\"Title\":\"t\",\"Body\":\"b\",\"Labels\":[\"a\"],\"MentionItemIds\":[\"x\"],\"HasSpoilers\":true}")!;
        Assert.Equal("t", dto.Title);
        Assert.Equal("b", dto.Body);
        Assert.Equal(new[] { "a" }, dto.Labels);
        Assert.Equal(new[] { "x" }, dto.MentionItemIds);
        Assert.True(dto.HasSpoilers);
    }

    [Fact]
    public void Defaults_FallBackWhenBlank()
    {
        Assert.Equal("Blog de cine", BlogDefaults.TitleOrDefault("  "));
        Assert.Equal("Mi blog", BlogDefaults.TitleOrDefault(" Mi blog "));
        Assert.Equal("Lo que vemos, lo que nos gusta y lo que no.", BlogDefaults.DescriptionOrDefault(null));
        Assert.Equal(string.Empty, BlogDefaults.DescriptionOrDefault("  "));
    }
}
