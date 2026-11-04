using Jellyfin.Plugin.Blog.Api;
using Jellyfin.Plugin.Blog.Db;
using Microsoft.Data.Sqlite;
using Xunit;

namespace Jellyfin.Plugin.Blog.Tests;

public class BlogRepositoryTests : IDisposable
{
    private const string Ana = "aaaaaaaa-0000-0000-0000-000000000001";
    private const string Bob = "bbbbbbbb-0000-0000-0000-000000000002";

    private readonly string _dbPath;
    private readonly BlogRepository _repo;
    private DateTime _now = new(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);

    public BlogRepositoryTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"blog-tests-{Guid.NewGuid()}.db");
        _repo = new BlogRepository(_dbPath, () => _now);
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        try
        {
            File.Delete(_dbPath);
        }
        catch (IOException)
        {
        }
    }

    private static ValidatedPost P(string title, string body = "cuerpo", string[]? labels = null, Guid[]? mentions = null, bool spoilers = false)
        => new(title, body, labels ?? Array.Empty<string>(), mentions ?? Array.Empty<Guid>(), spoilers);

    private PostRecord Add(string author, string title, DateTime at, string body = "cuerpo", string[]? labels = null, Guid[]? mentions = null)
    {
        _now = at;
        return _repo.CreatePost(author, P(title, body, labels, mentions));
    }

    private int Count(string table)
    {
        using var c = new SqliteConnection($"Data Source={_dbPath}");
        c.Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = $"SELECT COUNT(*) FROM {table}";
        return Convert.ToInt32(cmd.ExecuteScalar());
    }

    [Fact]
    public void Create_And_Get_RoundTrips()
    {
        var m1 = Guid.NewGuid();
        var m2 = Guid.NewGuid();
        var created = _repo.CreatePost(Ana, P("Título", "Cuerpo\ncon <b>html</b>", new[] { "terror", "sci-fi" }, new[] { m2, m1 }, true));

        var got = _repo.GetPost(created.Id)!;
        Assert.Equal("Título", got.Title);
        Assert.Equal("Cuerpo\ncon <b>html</b>", got.Body);
        Assert.Equal(Ana, got.AuthorUserId);
        Assert.True(got.HasSpoilers);
        Assert.Equal("2026-01-01T12:00:00.000Z", got.CreatedUtc);
        Assert.Null(got.UpdatedUtc);
        Assert.Equal(new[] { "terror", "sci-fi" }, got.Labels);
        Assert.Equal(new[] { m2, m1 }, got.MentionItemIds);
        Assert.Equal(0, got.CommentCount);
    }

    [Fact]
    public void Get_Missing_ReturnsNull()
    {
        Assert.Null(_repo.GetPost(Guid.NewGuid()));
    }

    [Fact]
    public void Update_ReplacesContent_AndSetsUpdatedUtc()
    {
        var created = _repo.CreatePost(Ana, P("A", "x", new[] { "uno" }, new[] { Guid.NewGuid() }));
        _now = _now.AddHours(2);
        var m = Guid.NewGuid();
        var updated = _repo.UpdatePost(created.Id, P("B", "y", new[] { "dos", "tres" }, new[] { m }, true))!;

        Assert.Equal("B", updated.Title);
        Assert.Equal("y", updated.Body);
        Assert.True(updated.HasSpoilers);
        Assert.Equal(new[] { "dos", "tres" }, updated.Labels);
        Assert.Equal(new[] { m }, updated.MentionItemIds);
        Assert.Equal("2026-01-01T14:00:00.000Z", updated.UpdatedUtc);
        Assert.Equal(created.CreatedUtc, updated.CreatedUtc);
        Assert.Equal(Ana, updated.AuthorUserId);
        Assert.Equal(2, Count("PostLabel"));
        Assert.Equal(1, Count("PostMention"));
    }

    [Fact]
    public void Update_Missing_ReturnsNull()
    {
        Assert.Null(_repo.UpdatePost(Guid.NewGuid(), P("x")));
    }

    [Fact]
    public void Delete_Cascades_LabelsMentionsAndComments_OnlyForThatPost()
    {
        var a = _repo.CreatePost(Ana, P("A", "x", new[] { "l" }, new[] { Guid.NewGuid() }));
        var b = _repo.CreatePost(Bob, P("B", "x", new[] { "l" }, new[] { Guid.NewGuid() }));
        _repo.AddComment(a.Id, Bob, "c1");
        _repo.AddComment(a.Id, Ana, "c2");
        _repo.AddComment(b.Id, Ana, "c3");

        Assert.True(_repo.DeletePost(a.Id));

        Assert.Null(_repo.GetPost(a.Id));
        Assert.NotNull(_repo.GetPost(b.Id));
        Assert.Equal(1, Count("Post"));
        Assert.Equal(1, Count("PostLabel"));
        Assert.Equal(1, Count("PostMention"));
        Assert.Equal(1, Count("Comment"));
        Assert.False(_repo.DeletePost(a.Id));
    }

    [Fact]
    public void Posts_AreOrderedNewestFirst()
    {
        Add(Ana, "viejo", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        Add(Ana, "nuevo", new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc));
        Add(Ana, "medio", new DateTime(2026, 2, 1, 0, 0, 0, DateTimeKind.Utc));

        var titles = _repo.QueryPosts(new PostQuery(), 1).Posts.Select(p => p.Title).ToList();
        Assert.Equal(new[] { "nuevo", "medio", "viejo" }, titles);
    }

    [Fact]
    public void Pagination_TenPerPage_WithNewerOlderFlags()
    {
        for (var i = 1; i <= 25; i++)
        {
            Add(Ana, "p" + i, new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddMinutes(i));
        }

        var p1 = _repo.QueryPosts(new PostQuery(), 1);
        Assert.Equal(10, p1.Posts.Count);
        Assert.Equal("p25", p1.Posts[0].Title);
        Assert.False(p1.HasNewer);
        Assert.True(p1.HasOlder);

        var p2 = _repo.QueryPosts(new PostQuery(), 2);
        Assert.Equal(10, p2.Posts.Count);
        Assert.Equal("p15", p2.Posts[0].Title);
        Assert.True(p2.HasNewer);
        Assert.True(p2.HasOlder);

        var p3 = _repo.QueryPosts(new PostQuery(), 3);
        Assert.Equal(5, p3.Posts.Count);
        Assert.Equal("p1", p3.Posts[^1].Title);
        Assert.True(p3.HasNewer);
        Assert.False(p3.HasOlder);

        var p4 = _repo.QueryPosts(new PostQuery(), 4);
        Assert.Empty(p4.Posts);
        Assert.False(p4.HasOlder);
    }

    [Fact]
    public void Pagination_ExactlyTen_HasNoOlder()
    {
        for (var i = 0; i < 10; i++)
        {
            Add(Ana, "p" + i, _now.AddMinutes(1));
        }

        var page = _repo.QueryPosts(new PostQuery(), 1);
        Assert.Equal(10, page.Posts.Count);
        Assert.False(page.HasOlder);
    }

    [Fact]
    public void Page0_IsTreatedAsPage1()
    {
        Add(Ana, "a", _now);
        Assert.Equal(1, _repo.QueryPosts(new PostQuery(), 0).Page);
    }

    [Fact]
    public void Filter_ByLabel_IsCaseInsensitiveOnInput()
    {
        Add(Ana, "con", _now.AddMinutes(1), labels: new[] { "terror" });
        Add(Ana, "sin", _now.AddMinutes(2), labels: new[] { "drama" });

        Assert.Equal(new[] { "con" }, _repo.QueryPosts(new PostQuery(Label: "Terror"), 1).Posts.Select(p => p.Title));
        Assert.Empty(_repo.QueryPosts(new PostQuery(Label: "nada"), 1).Posts);
        Assert.Empty(_repo.QueryPosts(new PostQuery(Label: "a,b"), 1).Posts);
    }

    [Fact]
    public void Filter_ByArchive()
    {
        Add(Ana, "oct", new DateTime(2026, 10, 31, 23, 59, 0, DateTimeKind.Utc));
        Add(Ana, "nov1", new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc));
        Add(Ana, "nov2", new DateTime(2026, 11, 30, 10, 0, 0, DateTimeKind.Utc));
        Add(Ana, "nov-2025", new DateTime(2025, 11, 5, 10, 0, 0, DateTimeKind.Utc));

        var titles = _repo.QueryPosts(new PostQuery(Archive: "2026-11"), 1).Posts.Select(p => p.Title).ToList();
        Assert.Equal(new[] { "nov2", "nov1" }, titles);
    }

    [Fact]
    public void Filter_ByAuthor()
    {
        Add(Ana, "de ana", _now.AddMinutes(1));
        Add(Bob, "de bob", _now.AddMinutes(2));
        Assert.Equal(new[] { "de bob" }, _repo.QueryPosts(new PostQuery(AuthorUserId: Bob), 1).Posts.Select(p => p.Title));
    }

    [Fact]
    public void Filter_ByMentionedItem()
    {
        var item = Guid.NewGuid();
        Add(Ana, "menciona", _now.AddMinutes(1), mentions: new[] { Guid.NewGuid(), item });
        Add(Ana, "otra", _now.AddMinutes(2), mentions: new[] { Guid.NewGuid() });
        Add(Ana, "ninguna", _now.AddMinutes(3));

        Assert.Equal(new[] { "menciona" }, _repo.QueryPosts(new PostQuery(ItemId: item), 1).Posts.Select(p => p.Title));
    }

    [Fact]
    public void Search_MatchesTitleAndBody_AsciiCaseInsensitive()
    {
        Add(Ana, "Blade Runner", _now.AddMinutes(1), body: "lluvia");
        Add(Ana, "otra", _now.AddMinutes(2), body: "Se habla de BLADE y mas");
        Add(Ana, "ninguna", _now.AddMinutes(3), body: "nada");

        var titles = _repo.QueryPosts(new PostQuery(Text: "blade"), 1).Posts.Select(p => p.Title).ToList();
        Assert.Equal(new[] { "otra", "Blade Runner" }, titles);
    }

    [Fact]
    public void Search_TreatsWildcardsLiterally()
    {
        Add(Ana, "100% real", _now.AddMinutes(1));
        Add(Ana, "1000 reales", _now.AddMinutes(2));
        Add(Ana, "a_b", _now.AddMinutes(3));
        Add(Ana, "axb", _now.AddMinutes(4));

        Assert.Equal(new[] { "100% real" }, _repo.QueryPosts(new PostQuery(Text: "100%"), 1).Posts.Select(p => p.Title));
        Assert.Equal(new[] { "a_b" }, _repo.QueryPosts(new PostQuery(Text: "a_b"), 1).Posts.Select(p => p.Title));
    }

    [Fact]
    public void Search_IsParameterized_AgainstInjection()
    {
        Add(Ana, "uno", _now.AddMinutes(1));
        Assert.Empty(_repo.QueryPosts(new PostQuery(Text: "'; DROP TABLE Post; --"), 1).Posts);
        Assert.Equal(1, Count("Post"));
    }

    [Fact]
    public void Filters_AreCombinable()
    {
        var item = Guid.NewGuid();
        Add(Ana, "ana-terror-2026-11", new DateTime(2026, 11, 2, 0, 0, 0, DateTimeKind.Utc), labels: new[] { "terror" }, mentions: new[] { item });
        Add(Bob, "bob-terror-2026-11", new DateTime(2026, 11, 3, 0, 0, 0, DateTimeKind.Utc), labels: new[] { "terror" }, mentions: new[] { item });
        Add(Ana, "ana-drama-2026-11", new DateTime(2026, 11, 4, 0, 0, 0, DateTimeKind.Utc), labels: new[] { "drama" }, mentions: new[] { item });
        Add(Ana, "ana-terror-2026-10", new DateTime(2026, 10, 4, 0, 0, 0, DateTimeKind.Utc), labels: new[] { "terror" }, mentions: new[] { item });

        var q = new PostQuery(Label: "terror", Archive: "2026-11", AuthorUserId: Ana, ItemId: item, Text: "ana");
        Assert.Equal(new[] { "ana-terror-2026-11" }, _repo.QueryPosts(q, 1).Posts.Select(p => p.Title));
    }

    [Fact]
    public void Query_ReturnsLabelsMentionsAndCommentCount()
    {
        var item = Guid.NewGuid();
        var a = Add(Ana, "A", _now.AddMinutes(1), labels: new[] { "x", "y" }, mentions: new[] { item });
        Add(Ana, "B", _now.AddMinutes(2));
        _repo.AddComment(a.Id, Bob, "uno");
        _repo.AddComment(a.Id, Bob, "dos");

        var posts = _repo.QueryPosts(new PostQuery(), 1).Posts;
        var pa = posts.Single(p => p.Title == "A");
        Assert.Equal(new[] { "x", "y" }, pa.Labels);
        Assert.Equal(new[] { item }, pa.MentionItemIds);
        Assert.Equal(2, pa.CommentCount);
        Assert.Equal(0, posts.Single(p => p.Title == "B").CommentCount);
    }

    [Fact]
    public void Neighbours_NewerAndOlder()
    {
        var p1 = Add(Ana, "1", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        var p2 = Add(Ana, "2", new DateTime(2026, 1, 2, 0, 0, 0, DateTimeKind.Utc));
        var p3 = Add(Ana, "3", new DateTime(2026, 1, 3, 0, 0, 0, DateTimeKind.Utc));

        var mid = _repo.GetNeighbours(p2.Id);
        Assert.Equal(p3.Id, mid.Newer!.Id);
        Assert.Equal("1", mid.Older!.Title);

        var newest = _repo.GetNeighbours(p3.Id);
        Assert.Null(newest.Newer);
        Assert.Equal(p2.Id, newest.Older!.Id);

        var oldest = _repo.GetNeighbours(p1.Id);
        Assert.Equal(p2.Id, oldest.Newer!.Id);
        Assert.Null(oldest.Older);

        Assert.Equal((null, null), _repo.GetNeighbours(Guid.NewGuid()));
    }

    [Fact]
    public void Neighbours_SameTimestamp_AreStillChained()
    {
        var a = Add(Ana, "a", _now);
        var b = Add(Ana, "b", _now);
        var order = _repo.QueryPosts(new PostQuery(), 1).Posts.Select(p => p.Id).ToList();

        var first = _repo.GetNeighbours(order[0]);
        Assert.Null(first.Newer);
        Assert.Equal(order[1], first.Older!.Id);
        Assert.Equal(2, new[] { a.Id, b.Id }.Intersect(order).Count());
    }

    // ---------------------------------------------------------------- comments

    [Fact]
    public void Comments_AddListUpdateDelete()
    {
        var post = Add(Ana, "p", _now);
        _now = _now.AddMinutes(1);
        var c1 = _repo.AddComment(post.Id, Bob, "primero")!;
        _now = _now.AddMinutes(1);
        var c2 = _repo.AddComment(post.Id, Ana, "segundo")!;

        var list = _repo.GetComments(post.Id);
        Assert.Equal(new[] { "primero", "segundo" }, list.Select(c => c.Body));
        Assert.Null(c1.UpdatedUtc);

        _now = _now.AddMinutes(5);
        var edited = _repo.UpdateComment(c1.Id, "editado")!;
        Assert.Equal("editado", edited.Body);
        Assert.NotNull(edited.UpdatedUtc);
        Assert.Equal(Bob, edited.AuthorUserId);

        Assert.True(_repo.DeleteComment(c2.Id));
        Assert.False(_repo.DeleteComment(c2.Id));
        Assert.Single(_repo.GetComments(post.Id));
        Assert.Null(_repo.UpdateComment(Guid.NewGuid(), "x"));
        Assert.Null(_repo.GetComment(c2.Id));
    }

    [Fact]
    public void AddComment_OnMissingPost_ReturnsNull()
    {
        Assert.Null(_repo.AddComment(Guid.NewGuid(), Ana, "x"));
        Assert.Equal(0, Count("Comment"));
    }

    // ----------------------------------------------------------------- sidebar

    [Fact]
    public void Archive_GroupsByYearAndMonth_WithCountsAndTitles()
    {
        Add(Ana, "2025-12", new DateTime(2025, 12, 5, 0, 0, 0, DateTimeKind.Utc));
        Add(Ana, "2026-01-a", new DateTime(2026, 1, 5, 0, 0, 0, DateTimeKind.Utc));
        Add(Ana, "2026-01-b", new DateTime(2026, 1, 20, 0, 0, 0, DateTimeKind.Utc));
        Add(Ana, "2026-11", new DateTime(2026, 11, 4, 0, 0, 0, DateTimeKind.Utc));

        var archive = _repo.GetArchive();
        Assert.Equal(new[] { 2026, 2025 }, archive.Select(y => y.Year));
        Assert.Equal(3, archive[0].Count);
        Assert.Equal(new[] { 11, 1 }, archive[0].Months.Select(m => m.Month));
        Assert.Equal(new[] { 1, 2 }, archive[0].Months.Select(m => m.Count));
        Assert.Equal(new[] { "2026-01-b", "2026-01-a" }, archive[0].Months[1].Posts.Select(p => p.Title));
        Assert.Equal(1, archive[1].Count);
        Assert.Equal(12, archive[1].Months[0].Month);
    }

    [Fact]
    public void Archive_Empty()
    {
        Assert.Empty(_repo.GetArchive());
    }

    [Fact]
    public void Labels_CountedAndAlphabetical()
    {
        Add(Ana, "1", _now.AddMinutes(1), labels: new[] { "terror", "drama" });
        Add(Ana, "2", _now.AddMinutes(2), labels: new[] { "terror" });
        Add(Ana, "3", _now.AddMinutes(3), labels: new[] { "acción" });

        var labels = _repo.GetLabelCounts();
        Assert.Equal(new[] { "acción", "drama", "terror" }, labels.Select(l => l.Name));
        Assert.Equal(new[] { 1, 1, 2 }, labels.Select(l => l.Count));
    }

    [Fact]
    public void Authors_CountedMostActiveFirst()
    {
        Add(Ana, "1", _now.AddMinutes(1));
        Add(Bob, "2", _now.AddMinutes(2));
        Add(Bob, "3", _now.AddMinutes(3));

        var authors = _repo.GetAuthorCounts();
        Assert.Equal(new[] { Bob, Ana }, authors.Select(a => a.UserId));
        Assert.Equal(new[] { 2, 1 }, authors.Select(a => a.PostCount));
    }

    [Fact]
    public void RecentComments_LastFiveNewestFirst_WithPostTitle()
    {
        var p = Add(Ana, "Titulo", _now);
        for (var i = 1; i <= 7; i++)
        {
            _now = _now.AddMinutes(1);
            _repo.AddComment(p.Id, Bob, "c" + i);
        }

        var recent = _repo.GetRecentComments(5);
        Assert.Equal(new[] { "c7", "c6", "c5", "c4", "c3" }, recent.Select(c => c.Body));
        Assert.All(recent, c => Assert.Equal("Titulo", c.PostTitle));
        Assert.All(recent, c => Assert.Equal(p.Id, c.PostId));
    }

    [Fact]
    public void RecentComments_ExcludeDeletedPosts()
    {
        var p = Add(Ana, "x", _now);
        _repo.AddComment(p.Id, Bob, "c");
        _repo.DeletePost(p.Id);
        Assert.Empty(_repo.GetRecentComments(5));
    }

    [Fact]
    public void Persistence_SurvivesReopen()
    {
        var created = _repo.CreatePost(Ana, P("persistente", "x", new[] { "a" }));
        var reopened = new BlogRepository(_dbPath);
        Assert.Equal("persistente", reopened.GetPost(created.Id)!.Title);
    }
}
