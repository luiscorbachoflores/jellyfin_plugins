using Jellyfin.Plugin.Blog.Api;
using Xunit;

namespace Jellyfin.Plugin.Blog.Tests;

public class BlogValidationTests
{
    private static readonly string Guid1 = "11111111-1111-1111-1111-111111111111";

    private static bool Post(string? title, string? body, string?[]? labels, string?[]? mentions, out ValidatedPost post, out string? error)
        => BlogValidation.TryValidatePost(title, body, labels, mentions, false, out post, out error);

    [Fact]
    public void ValidPost_IsTrimmed()
    {
        Assert.True(Post("  Título  ", "  Cuerpo\r\ncon líneas  ", new[] { " Terror ", "Sci-Fi" }, new[] { Guid1 }, out var post, out var error));
        Assert.Null(error);
        Assert.Equal("Título", post.Title);
        Assert.Equal("Cuerpo\ncon líneas", post.Body);
        Assert.Equal(new[] { "terror", "sci-fi" }, post.Labels);
        Assert.Single(post.MentionItemIds);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void Title_EmptyIsRejected(string? title)
    {
        Assert.False(Post(title, "cuerpo", null, null, out _, out var error));
        Assert.NotNull(error);
    }

    [Fact]
    public void Title_Boundaries()
    {
        Assert.True(Post(new string('a', 150), "x", null, null, out _, out _));
        Assert.False(Post(new string('a', 151), "x", null, null, out _, out _));
        Assert.True(Post("a", "x", null, null, out _, out _));
        // El límite se aplica tras recortar espacios.
        Assert.True(Post("  " + new string('a', 150) + "  ", "x", null, null, out _, out _));
    }

    [Fact]
    public void Title_WithNewlineIsRejected()
    {
        Assert.False(Post("uno\ndos", "x", null, null, out _, out _));
    }

    [Fact]
    public void Body_Boundaries()
    {
        Assert.True(Post("t", new string('a', 20000), null, null, out _, out _));
        Assert.False(Post("t", new string('a', 20001), null, null, out _, out _));
        Assert.False(Post("t", "   ", null, null, out _, out _));
        Assert.False(Post("t", null, null, null, out _, out _));
    }

    [Fact]
    public void Labels_UpToFive()
    {
        Assert.True(Post("t", "b", new[] { "a", "b", "c", "d", "e" }, null, out _, out _));
        Assert.False(Post("t", "b", new[] { "a", "b", "c", "d", "e", "f" }, null, out _, out var error));
        Assert.Contains("5", error);
    }

    [Fact]
    public void Labels_DuplicatesAreMergedAfterNormalizing()
    {
        Assert.True(Post("t", "b", new[] { "Cine", "cine", " CINE " }, null, out var post, out _));
        Assert.Equal(new[] { "cine" }, post.Labels);
    }

    [Fact]
    public void Labels_SixWithDuplicatesIsStillValid()
    {
        Assert.True(Post("t", "b", new[] { "a", "b", "c", "d", "e", "A" }, null, out var post, out _));
        Assert.Equal(5, post.Labels.Count);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("a,b")]
    [InlineData("tab\there")]
    [InlineData("nl\nx")]
    public void Labels_InvalidAreRejected(string label)
    {
        Assert.False(Post("t", "b", new[] { label }, null, out _, out _));
    }

    [Fact]
    public void Labels_NullEntryRejected()
    {
        Assert.False(Post("t", "b", new string?[] { null }, null, out _, out _));
    }

    [Fact]
    public void Label_LengthBoundary()
    {
        Assert.NotNull(BlogValidation.NormalizeLabel(new string('a', 30)));
        Assert.Null(BlogValidation.NormalizeLabel(new string('a', 31)));
        Assert.Equal("ñandú", BlogValidation.NormalizeLabel("ÑANDÚ"));
    }

    [Fact]
    public void Mentions_UpToTen_DuplicatesCollapsed()
    {
        var ten = Enumerable.Range(1, 10).Select(i => new Guid(i, 0, 0, new byte[8]).ToString()).ToArray();
        Assert.True(Post("t", "b", null, ten, out var post, out _));
        Assert.Equal(10, post.MentionItemIds.Count);

        var eleven = ten.Append(new Guid(99, 0, 0, new byte[8]).ToString()).ToArray();
        Assert.False(Post("t", "b", null, eleven, out _, out _));

        Assert.True(Post("t", "b", null, new[] { Guid1, Guid1.ToUpperInvariant(), Guid1.Replace("-", "") }, out post, out _));
        Assert.Single(post.MentionItemIds);
    }

    [Theory]
    [InlineData("not-a-guid")]
    [InlineData("")]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    public void Mentions_InvalidIdIsRejected(string id)
    {
        Assert.False(Post("t", "b", null, new[] { id }, out _, out var error));
        Assert.Equal(BlogValidation.MentionsErrorMessage, error);
    }

    [Fact]
    public void Mentions_OrderIsPreserved()
    {
        var a = "aaaaaaaa-0000-0000-0000-000000000000";
        var b = "bbbbbbbb-0000-0000-0000-000000000000";
        Assert.True(Post("t", "b", null, new[] { b, a }, out var post, out _));
        Assert.Equal(new[] { Guid.Parse(b), Guid.Parse(a) }, post.MentionItemIds);
    }

    [Theory]
    [InlineData("Movie", true)]
    [InlineData("Series", true)]
    [InlineData("Episode", false)]
    [InlineData("Season", false)]
    [InlineData("movie", false)]
    [InlineData(null, false)]
    public void MentionableKinds(string? kind, bool expected)
    {
        Assert.Equal(expected, BlogValidation.IsMentionableKind(kind));
    }

    [Fact]
    public void Comment_Boundaries()
    {
        Assert.True(BlogValidation.TryValidateComment("  hola  ", out var n, out _));
        Assert.Equal("hola", n);
        Assert.False(BlogValidation.TryValidateComment("   ", out _, out _));
        Assert.False(BlogValidation.TryValidateComment(null, out _, out _));
        Assert.True(BlogValidation.TryValidateComment(new string('a', 4000), out _, out _));
        Assert.False(BlogValidation.TryValidateComment(new string('a', 4001), out _, out _));
    }

    [Fact]
    public void HtmlIsNotInterpretedOrAltered()
    {
        const string evil = "<script>alert(1)</script><img src=x onerror=alert(1)>";
        Assert.True(Post(evil, evil, new[] { "<b>" }, null, out var post, out _));
        Assert.Equal(evil, post.Title);
        Assert.Equal(evil, post.Body);
        Assert.Equal("<b>", post.Labels[0]);
    }

    [Theory]
    [InlineData("2026-11", true)]
    [InlineData("2026-01", true)]
    [InlineData("2026-12", true)]
    [InlineData("2026-00", false)]
    [InlineData("2026-13", false)]
    [InlineData("26-11", false)]
    [InlineData("2026-1", false)]
    [InlineData("2026-11-01", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void ArchiveFormat(string? value, bool expected)
    {
        Assert.Equal(expected, BlogValidation.IsValidArchive(value));
    }

    [Theory]
    [InlineData(null, 1)]
    [InlineData(0, 1)]
    [InlineData(-4, 1)]
    [InlineData(3, 3)]
    [InlineData(int.MaxValue, BlogLimits.MaxPage)]
    public void PageNormalization(int? page, int expected)
    {
        Assert.Equal(expected, BlogValidation.NormalizePage(page));
    }

    [Fact]
    public void EscapeLike_EscapesWildcards()
    {
        Assert.Equal("100\\% \\_x \\\\", BlogValidation.EscapeLike("100% _x \\"));
    }
}
