using Jellyfin.Plugin.Blog.Api;
using Jellyfin.Plugin.Blog.Db;
using Microsoft.Data.Sqlite;
using Xunit;

namespace Jellyfin.Plugin.Blog.Tests;

public class BlogVisibilityTests : IDisposable
{
    private const string Ana = "aaaaaaaa-0000-0000-0000-000000000001";
    private const string Bob = "bbbbbbbb-0000-0000-0000-000000000002";

    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"blog-vis-{Guid.NewGuid()}.db");
    private readonly BlogRepository _repo;
    private DateTime _now = new(2026, 3, 1, 10, 0, 0, DateTimeKind.Utc);

    public BlogVisibilityTests()
    {
        _repo = new BlogRepository(_dbPath, () => _now);
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        try { File.Delete(_dbPath); } catch (IOException) { }
    }

    private static ValidatedPost P(string title, string vis, Guid[]? mentions = null, string body = "cuerpo", string[]? labels = null)
        => new(title, body, labels ?? Array.Empty<string>(), mentions ?? Array.Empty<Guid>(), false, vis);

    [Theory]
    [InlineData(null, "public")]
    [InlineData("", "public")]
    [InlineData("  DRAFT ", "draft")]
    [InlineData("private", "private")]
    [InlineData("secreto", null)]
    public void Normalize(string? input, string? expected) => Assert.Equal(expected, BlogVisibility.Normalize(input));

    [Theory]
    [InlineData("draft", "private", true)]
    [InlineData("draft", "public", true)]
    [InlineData("private", "public", true)]
    [InlineData("private", "draft", true)]
    [InlineData("public", "public", true)]
    [InlineData("public", "private", false)]
    [InlineData("public", "draft", false)]
    public void Transition(string from, string to, bool ok) => Assert.Equal(ok, BlogVisibility.CanTransition(from, to));

    [Theory]
    [InlineData("public", false, false, true)]
    [InlineData("private", false, false, false)]
    [InlineData("private", false, true, true)]
    [InlineData("private", true, false, true)]
    [InlineData("draft", false, true, false)]
    [InlineData("draft", true, false, true)]
    public void CanView(string vis, bool author, bool admin, bool expected) => Assert.Equal(expected, BlogVisibility.CanView(vis, author, admin));

    [Fact]
    public void Validation_DraftMayBeIncomplete_PublicMayNot()
    {
        Assert.True(BlogValidation.TryValidatePost("", "texto", null, null, false, out var d, out _, "draft"));
        Assert.Equal("draft", d.Visibility);
        Assert.True(BlogValidation.TryValidatePost("Solo título", "", null, null, false, out _, out _, "draft"));
        Assert.False(BlogValidation.TryValidatePost("", "", null, null, false, out _, out _, "draft"));
        Assert.False(BlogValidation.TryValidatePost("", "texto", null, null, false, out _, out _, "public"));
        Assert.False(BlogValidation.TryValidatePost("t", "", null, null, false, out _, out _, "private"));
        Assert.False(BlogValidation.TryValidatePost("t", "b", null, null, false, out _, out _, "otra"));
    }

    [Fact]
    public void Create_Draft_HasNoPublishedDate_Public_Does()
    {
        var d = _repo.CreatePost(Ana, P("Borrador", "draft"));
        var p = _repo.CreatePost(Ana, P("Pública", "public"));
        Assert.Null(_repo.GetPost(d.Id)!.PublishedUtc);
        Assert.NotNull(_repo.GetPost(p.Id)!.PublishedUtc);
        Assert.Equal("draft", _repo.GetPost(d.Id)!.Visibility);
    }

    [Fact]
    public void NonPublic_NeverLeaksIntoPublicViews()
    {
        _repo.CreatePost(Ana, P("Pública", "public", labels: new[] { "cine" }));
        var d = _repo.CreatePost(Ana, P("Borrador", "draft", labels: new[] { "oculta" }));
        var pr = _repo.CreatePost(Bob, P("Privada", "private", labels: new[] { "oculta" }));

        var list = _repo.QueryPosts(new PostQuery(), 1);
        Assert.Single(list.Posts);
        Assert.Equal("Pública", list.Posts[0].Title);

        Assert.Single(_repo.GetArchive().SelectMany(y => y.Months).SelectMany(m => m.Posts));
        Assert.DoesNotContain(_repo.GetLabelCounts(), l => l.Name == "oculta");
        Assert.Single(_repo.GetAuthorCounts());
        Assert.Null(_repo.AddComment(d.Id, Bob, "hola"));
        Assert.Null(_repo.AddComment(pr.Id, Ana, "hola"));
        Assert.Empty(_repo.GetRecentComments(5));
        Assert.Equal((null, null), _repo.GetNeighbours(d.Id));
    }

    [Fact]
    public void OwnViews_AreFilteredByAuthorAndStatus()
    {
        _repo.CreatePost(Ana, P("D1", "draft"));
        _repo.CreatePost(Ana, P("D2", "draft"));
        _repo.CreatePost(Ana, P("P1", "private"));
        _repo.CreatePost(Bob, P("D3", "draft"));

        Assert.Equal(2, _repo.QueryPosts(new PostQuery(AuthorUserId: Ana, Visibility: "draft"), 1).Posts.Count);
        Assert.Single(_repo.QueryPosts(new PostQuery(AuthorUserId: Ana, Visibility: "private"), 1).Posts);
        var c = _repo.GetOwnCounts(Ana);
        Assert.Equal(2, c.Drafts);
        Assert.Equal(1, c.Private);
        Assert.Equal(1, _repo.CountPrivate());
    }

    [Fact]
    public void Publishing_SetsPublishedNow_AndClearsEdited()
    {
        var d = _repo.CreatePost(Ana, P("Borrador", "draft"));
        _now = _now.AddDays(3);
        var up = _repo.UpdatePost(d.Id, P("Listo", "public"))!;
        Assert.Equal("public", up.Visibility);
        Assert.Null(up.UpdatedUtc);
        Assert.Equal("2026-03-04", up.PublishedUtc![..10]);

        _now = _now.AddDays(1);
        var again = _repo.UpdatePost(d.Id, P("Listo 2", "public"))!;
        Assert.NotNull(again.UpdatedUtc);
        Assert.Equal(up.PublishedUtc, again.PublishedUtc);
    }

    [Fact]
    public void Public_CannotGoBack_EvenAtRepoLevel()
    {
        var p = _repo.CreatePost(Ana, P("Pública", "public"));
        Assert.Null(_repo.UpdatePost(p.Id, P("Pública", "private")));
        Assert.Null(_repo.UpdatePost(p.Id, P("Pública", "draft")));
        Assert.Equal("public", _repo.GetPost(p.Id)!.Visibility);
    }

    [Fact]
    public void Mentions_KeepTheOrderTheAuthorChose()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var c = Guid.NewGuid();
        var p = _repo.CreatePost(Ana, P("Orden", "public", new[] { c, a, b }));
        Assert.Equal(new[] { c, a, b }, _repo.GetPost(p.Id)!.MentionItemIds);
        _repo.UpdatePost(p.Id, P("Orden", "public", new[] { b, c, a }));
        Assert.Equal(new[] { b, c, a }, _repo.GetPost(p.Id)!.MentionItemIds);
        Assert.Single(_repo.QueryPosts(new PostQuery(ItemId: a), 1).Posts);
    }

    [Fact]
    public void Migration_FromOldSchema_MakesEverythingPublic()
    {
        var path = Path.Combine(Path.GetTempPath(), $"blog-old-{Guid.NewGuid()}.db");
        try
        {
            using (var c = new SqliteConnection($"Data Source={path}"))
            {
                c.Open();
                using var cmd = c.CreateCommand();
                cmd.CommandText = @"CREATE TABLE Post (Id TEXT PRIMARY KEY, AuthorUserId TEXT NOT NULL, Title TEXT NOT NULL, Body TEXT NOT NULL, HasSpoilers INTEGER NOT NULL, CreatedUtc TEXT NOT NULL, UpdatedUtc TEXT NULL);
                    INSERT INTO Post VALUES ('11111111-1111-1111-1111-111111111111','x','Vieja','b',0,'2025-05-05T10:00:00.000Z',NULL);";
                cmd.ExecuteNonQuery();
            }

            var repo = new BlogRepository(path);
            var old = repo.GetPost(Guid.Parse("11111111-1111-1111-1111-111111111111"))!;
            Assert.Equal("public", old.Visibility);
            Assert.Equal("2025-05-05T10:00:00.000Z", old.PublishedUtc);
            Assert.Single(repo.QueryPosts(new PostQuery(), 1).Posts);
            _ = new BlogRepository(path); // segunda apertura: la migración es idempotente
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            try { File.Delete(path); } catch (IOException) { }
        }
    }

    [Fact]
    public void ExcerptCutter_NeverSplitsMentionOrLink()
    {
        var text = new string('a', 40) + " @[Parasite (2019)](0123456789abcdef0123456789abcdef) resto del texto largo";
        var (cut, truncated) = ExcerptCutter.Cut(text, 60);
        Assert.True(truncated);
        Assert.DoesNotContain("@[", cut);

        var (whole, _) = ExcerptCutter.Cut(text, 200);
        Assert.Contains("@[Parasite (2019)](0123456789abcdef0123456789abcdef)", whole);
    }
}
