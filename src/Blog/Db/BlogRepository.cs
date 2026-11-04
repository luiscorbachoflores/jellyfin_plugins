using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Jellyfin.Plugin.Blog.Api;
using Microsoft.Data.Sqlite;

namespace Jellyfin.Plugin.Blog.Db;

public record PostRecord(
    Guid Id,
    string AuthorUserId,
    string Title,
    string Body,
    bool HasSpoilers,
    string CreatedUtc,
    string? UpdatedUtc,
    IReadOnlyList<string> Labels,
    IReadOnlyList<Guid> MentionItemIds,
    int CommentCount);

public record CommentRecord(Guid Id, Guid PostId, string AuthorUserId, string Body, string CreatedUtc, string? UpdatedUtc);

public record PostRef(Guid Id, string Title);

public record PostPage(IReadOnlyList<PostRecord> Posts, int Page, bool HasNewer, bool HasOlder);

/// <summary>Filtros combinables de la lista de entradas. Todos opcionales.</summary>
public record PostQuery(string? Label = null, string? Archive = null, string? AuthorUserId = null, Guid? ItemId = null, string? Text = null);

public record ArchiveMonth(int Month, int Count, IReadOnlyList<PostRef> Posts);

public record ArchiveYear(int Year, int Count, IReadOnlyList<ArchiveMonth> Months);

public record LabelCount(string Name, int Count);

public record AuthorCount(string UserId, int PostCount);

public record RecentComment(Guid PostId, string PostTitle, string AuthorUserId, string Body, string CreatedUtc);

public class BlogRepository
{
    private readonly string _connectionString;
    private readonly Func<DateTime> _clock;

    public BlogRepository(string dbPath, Func<DateTime>? clock = null)
    {
        _connectionString = $"Data Source={dbPath}";
        _clock = clock ?? (() => DateTime.UtcNow);
        Initialize();
    }

    private string Now() => _clock().ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    private SqliteConnection Open()
    {
        var connection = new SqliteConnection(_connectionString);
        connection.Open();
        return connection;
    }

    private void Initialize()
    {
        using var connection = Open();
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS Post (
                Id TEXT PRIMARY KEY,
                AuthorUserId TEXT NOT NULL,
                Title TEXT NOT NULL,
                Body TEXT NOT NULL,
                HasSpoilers INTEGER NOT NULL,
                CreatedUtc TEXT NOT NULL,
                UpdatedUtc TEXT NULL
            );
            CREATE TABLE IF NOT EXISTS PostLabel (
                PostId TEXT NOT NULL,
                Label TEXT NOT NULL,
                PRIMARY KEY (PostId, Label)
            );
            CREATE TABLE IF NOT EXISTS PostMention (
                PostId TEXT NOT NULL,
                ItemId TEXT NOT NULL,
                Position INTEGER NOT NULL,
                PRIMARY KEY (PostId, ItemId)
            );
            CREATE TABLE IF NOT EXISTS Comment (
                Id TEXT PRIMARY KEY,
                PostId TEXT NOT NULL,
                AuthorUserId TEXT NOT NULL,
                Body TEXT NOT NULL,
                CreatedUtc TEXT NOT NULL,
                UpdatedUtc TEXT NULL
            );
            CREATE INDEX IF NOT EXISTS IX_Post_CreatedUtc ON Post (CreatedUtc);
            CREATE INDEX IF NOT EXISTS IX_Post_Author ON Post (AuthorUserId);
            CREATE INDEX IF NOT EXISTS IX_PostLabel_Label ON PostLabel (Label);
            CREATE INDEX IF NOT EXISTS IX_PostMention_Item ON PostMention (ItemId);
            CREATE INDEX IF NOT EXISTS IX_Comment_Post ON Comment (PostId, CreatedUtc);
            CREATE INDEX IF NOT EXISTS IX_Comment_Created ON Comment (CreatedUtc);";
        cmd.ExecuteNonQuery();
    }

    // ------------------------------------------------------------------ posts

    public PostRecord CreatePost(string authorUserId, ValidatedPost post)
    {
        var id = Guid.NewGuid();
        var now = Now();

        using var connection = Open();
        using var tx = connection.BeginTransaction();

        using (var cmd = connection.CreateCommand())
        {
            cmd.Transaction = tx;
            cmd.CommandText = "INSERT INTO Post (Id, AuthorUserId, Title, Body, HasSpoilers, CreatedUtc, UpdatedUtc) VALUES ($id, $author, $title, $body, $spoilers, $created, NULL)";
            cmd.Parameters.AddWithValue("$id", id.ToString("D"));
            cmd.Parameters.AddWithValue("$author", authorUserId);
            cmd.Parameters.AddWithValue("$title", post.Title);
            cmd.Parameters.AddWithValue("$body", post.Body);
            cmd.Parameters.AddWithValue("$spoilers", post.HasSpoilers ? 1 : 0);
            cmd.Parameters.AddWithValue("$created", now);
            cmd.ExecuteNonQuery();
        }

        InsertLabelsAndMentions(connection, tx, id, post);
        tx.Commit();

        return new PostRecord(id, authorUserId, post.Title, post.Body, post.HasSpoilers, now, null, post.Labels, post.MentionItemIds, 0);
    }

    /// <summary>Reemplaza el contenido de la entrada y fija UpdatedUtc. Null si no existe.</summary>
    public PostRecord? UpdatePost(Guid id, ValidatedPost post)
    {
        var now = Now();

        using (var connection = Open())
        {
            using var tx = connection.BeginTransaction();
            int affected;
            using (var cmd = connection.CreateCommand())
            {
                cmd.Transaction = tx;
                cmd.CommandText = "UPDATE Post SET Title = $title, Body = $body, HasSpoilers = $spoilers, UpdatedUtc = $updated WHERE Id = $id";
                cmd.Parameters.AddWithValue("$id", id.ToString("D"));
                cmd.Parameters.AddWithValue("$title", post.Title);
                cmd.Parameters.AddWithValue("$body", post.Body);
                cmd.Parameters.AddWithValue("$spoilers", post.HasSpoilers ? 1 : 0);
                cmd.Parameters.AddWithValue("$updated", now);
                affected = cmd.ExecuteNonQuery();
            }

            if (affected == 0)
            {
                return null;
            }

            foreach (var table in new[] { "PostLabel", "PostMention" })
            {
                using var del = connection.CreateCommand();
                del.Transaction = tx;
                del.CommandText = $"DELETE FROM {table} WHERE PostId = $id";
                del.Parameters.AddWithValue("$id", id.ToString("D"));
                del.ExecuteNonQuery();
            }

            InsertLabelsAndMentions(connection, tx, id, post);
            tx.Commit();
        }

        return GetPost(id);
    }

    private static void InsertLabelsAndMentions(SqliteConnection connection, SqliteTransaction tx, Guid postId, ValidatedPost post)
    {
        foreach (var label in post.Labels)
        {
            using var cmd = connection.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = "INSERT OR IGNORE INTO PostLabel (PostId, Label) VALUES ($post, $label)";
            cmd.Parameters.AddWithValue("$post", postId.ToString("D"));
            cmd.Parameters.AddWithValue("$label", label);
            cmd.ExecuteNonQuery();
        }

        var position = 0;
        foreach (var item in post.MentionItemIds)
        {
            using var cmd = connection.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = "INSERT OR IGNORE INTO PostMention (PostId, ItemId, Position) VALUES ($post, $item, $pos)";
            cmd.Parameters.AddWithValue("$post", postId.ToString("D"));
            cmd.Parameters.AddWithValue("$item", item.ToString("D"));
            cmd.Parameters.AddWithValue("$pos", position++);
            cmd.ExecuteNonQuery();
        }
    }

    public PostRecord? GetPost(Guid id)
    {
        using var connection = Open();
        var posts = ReadPosts(connection, "WHERE p.Id = $id", new[] { ("$id", (object)id.ToString("D")) }, string.Empty);
        return posts.FirstOrDefault();
    }

    /// <summary>Borra la entrada con sus etiquetas, menciones y comentarios en una transacción.</summary>
    public bool DeletePost(Guid id)
    {
        using var connection = Open();
        using var tx = connection.BeginTransaction();
        foreach (var sql in new[]
        {
            "DELETE FROM PostLabel WHERE PostId = $id",
            "DELETE FROM PostMention WHERE PostId = $id",
            "DELETE FROM Comment WHERE PostId = $id",
        })
        {
            using var cmd = connection.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = sql;
            cmd.Parameters.AddWithValue("$id", id.ToString("D"));
            cmd.ExecuteNonQuery();
        }

        int affected;
        using (var cmd = connection.CreateCommand())
        {
            cmd.Transaction = tx;
            cmd.CommandText = "DELETE FROM Post WHERE Id = $id";
            cmd.Parameters.AddWithValue("$id", id.ToString("D"));
            affected = cmd.ExecuteNonQuery();
        }

        tx.Commit();
        return affected > 0;
    }

    public PostPage QueryPosts(PostQuery query, int page)
    {
        page = Math.Max(1, page);
        var where = new List<string>();
        var parameters = new List<(string, object)>();

        var label = BlogValidation.NormalizeLabel(query.Label);
        if (!string.IsNullOrWhiteSpace(query.Label))
        {
            // Una etiqueta no válida no puede existir: lista vacía en vez de ignorar el filtro.
            if (label is null)
            {
                return new PostPage(Array.Empty<PostRecord>(), page, page > 1, false);
            }

            where.Add("EXISTS (SELECT 1 FROM PostLabel l WHERE l.PostId = p.Id AND l.Label = $label)");
            parameters.Add(("$label", label));
        }

        if (!string.IsNullOrEmpty(query.Archive))
        {
            where.Add("substr(p.CreatedUtc, 1, 7) = $archive");
            parameters.Add(("$archive", query.Archive));
        }

        if (!string.IsNullOrEmpty(query.AuthorUserId))
        {
            where.Add("p.AuthorUserId = $author");
            parameters.Add(("$author", query.AuthorUserId));
        }

        if (query.ItemId is Guid item)
        {
            where.Add("EXISTS (SELECT 1 FROM PostMention m WHERE m.PostId = p.Id AND m.ItemId = $item)");
            parameters.Add(("$item", item.ToString("D")));
        }

        if (!string.IsNullOrWhiteSpace(query.Text))
        {
            where.Add("(p.Title LIKE $q ESCAPE '\\' OR p.Body LIKE $q ESCAPE '\\')");
            parameters.Add(("$q", "%" + BlogValidation.EscapeLike(query.Text.Trim()) + "%"));
        }

        var whereSql = where.Count == 0 ? string.Empty : "WHERE " + string.Join(" AND ", where);
        var tail = $"ORDER BY p.CreatedUtc DESC, p.Id DESC LIMIT {BlogLimits.PageSize + 1} OFFSET {(page - 1) * BlogLimits.PageSize}";

        using var connection = Open();
        var rows = ReadPosts(connection, whereSql, parameters, tail);
        var hasOlder = rows.Count > BlogLimits.PageSize;
        return new PostPage(rows.Take(BlogLimits.PageSize).ToList(), page, page > 1, hasOlder);
    }

    public (PostRef? Newer, PostRef? Older) GetNeighbours(Guid id)
    {
        using var connection = Open();
        string? created = null;
        using (var cmd = connection.CreateCommand())
        {
            cmd.CommandText = "SELECT CreatedUtc FROM Post WHERE Id = $id";
            cmd.Parameters.AddWithValue("$id", id.ToString("D"));
            created = cmd.ExecuteScalar() as string;
        }

        if (created is null)
        {
            return (null, null);
        }

        PostRef? Find(string comparison, string order)
        {
            using var cmd = connection.CreateCommand();
            cmd.CommandText = $"SELECT Id, Title FROM Post WHERE (CreatedUtc, Id) {comparison} ($created, $id) ORDER BY CreatedUtc {order}, Id {order} LIMIT 1";
            cmd.Parameters.AddWithValue("$created", created);
            cmd.Parameters.AddWithValue("$id", id.ToString("D"));
            using var r = cmd.ExecuteReader();
            return r.Read() ? new PostRef(Guid.Parse(r.GetString(0)), r.GetString(1)) : null;
        }

        return (Find(">", "ASC"), Find("<", "DESC"));
    }

    private static List<PostRecord> ReadPosts(SqliteConnection connection, string whereSql, IEnumerable<(string Name, object Value)> parameters, string tail)
    {
        var rows = new List<(Guid Id, string Author, string Title, string Body, bool Spoilers, string Created, string? Updated, int Comments)>();
        using (var cmd = connection.CreateCommand())
        {
            cmd.CommandText = $@"SELECT p.Id, p.AuthorUserId, p.Title, p.Body, p.HasSpoilers, p.CreatedUtc, p.UpdatedUtc,
                (SELECT COUNT(*) FROM Comment c WHERE c.PostId = p.Id)
                FROM Post p {whereSql} {tail}";
            foreach (var (name, value) in parameters)
            {
                cmd.Parameters.AddWithValue(name, value);
            }

            using var r = cmd.ExecuteReader();
            while (r.Read())
            {
                rows.Add((Guid.Parse(r.GetString(0)), r.GetString(1), r.GetString(2), r.GetString(3), r.GetInt32(4) != 0, r.GetString(5), r.IsDBNull(6) ? null : r.GetString(6), r.GetInt32(7)));
            }
        }

        if (rows.Count == 0)
        {
            return new List<PostRecord>();
        }

        var labels = LoadChildren(connection, rows.Select(x => x.Id), "SELECT PostId, Label FROM PostLabel WHERE PostId IN ({0}) ORDER BY rowid");
        var mentions = LoadChildren(connection, rows.Select(x => x.Id), "SELECT PostId, ItemId FROM PostMention WHERE PostId IN ({0}) ORDER BY Position");

        return rows.Select(x => new PostRecord(
            x.Id,
            x.Author,
            x.Title,
            x.Body,
            x.Spoilers,
            x.Created,
            x.Updated,
            labels.TryGetValue(x.Id, out var l) ? l : new List<string>(),
            (mentions.TryGetValue(x.Id, out var m) ? m : new List<string>()).Select(Guid.Parse).ToList(),
            x.Comments)).ToList();
    }

    private static Dictionary<Guid, List<string>> LoadChildren(SqliteConnection connection, IEnumerable<Guid> ids, string sqlTemplate)
    {
        var idList = ids.ToList();
        var result = new Dictionary<Guid, List<string>>();
        using var cmd = connection.CreateCommand();
        var names = new List<string>();
        for (var i = 0; i < idList.Count; i++)
        {
            names.Add("$p" + i);
            cmd.Parameters.AddWithValue("$p" + i, idList[i].ToString("D"));
        }

        cmd.CommandText = string.Format(CultureInfo.InvariantCulture, sqlTemplate, string.Join(",", names));
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            var pid = Guid.Parse(r.GetString(0));
            if (!result.TryGetValue(pid, out var list))
            {
                list = new List<string>();
                result[pid] = list;
            }

            list.Add(r.GetString(1));
        }

        return result;
    }

    // --------------------------------------------------------------- comments

    public CommentRecord? AddComment(Guid postId, string authorUserId, string body)
    {
        var id = Guid.NewGuid();
        var now = Now();
        using var connection = Open();
        using var tx = connection.BeginTransaction();

        using (var exists = connection.CreateCommand())
        {
            exists.Transaction = tx;
            exists.CommandText = "SELECT 1 FROM Post WHERE Id = $post";
            exists.Parameters.AddWithValue("$post", postId.ToString("D"));
            if (exists.ExecuteScalar() is null)
            {
                return null;
            }
        }

        using (var cmd = connection.CreateCommand())
        {
            cmd.Transaction = tx;
            cmd.CommandText = "INSERT INTO Comment (Id, PostId, AuthorUserId, Body, CreatedUtc, UpdatedUtc) VALUES ($id, $post, $author, $body, $created, NULL)";
            cmd.Parameters.AddWithValue("$id", id.ToString("D"));
            cmd.Parameters.AddWithValue("$post", postId.ToString("D"));
            cmd.Parameters.AddWithValue("$author", authorUserId);
            cmd.Parameters.AddWithValue("$body", body);
            cmd.Parameters.AddWithValue("$created", now);
            cmd.ExecuteNonQuery();
        }

        tx.Commit();
        return new CommentRecord(id, postId, authorUserId, body, now, null);
    }

    public CommentRecord? GetComment(Guid id)
    {
        using var connection = Open();
        return ReadComments(connection, "WHERE Id = $id", "$id", id.ToString("D")).FirstOrDefault();
    }

    /// <summary>Comentarios de una entrada, del más antiguo al más reciente.</summary>
    public IReadOnlyList<CommentRecord> GetComments(Guid postId)
    {
        using var connection = Open();
        return ReadComments(connection, "WHERE PostId = $post", "$post", postId.ToString("D"));
    }

    private static List<CommentRecord> ReadComments(SqliteConnection connection, string where, string paramName, string paramValue)
    {
        using var cmd = connection.CreateCommand();
        cmd.CommandText = $"SELECT Id, PostId, AuthorUserId, Body, CreatedUtc, UpdatedUtc FROM Comment {where} ORDER BY CreatedUtc ASC, rowid ASC";
        cmd.Parameters.AddWithValue(paramName, paramValue);
        var list = new List<CommentRecord>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            list.Add(new CommentRecord(Guid.Parse(r.GetString(0)), Guid.Parse(r.GetString(1)), r.GetString(2), r.GetString(3), r.GetString(4), r.IsDBNull(5) ? null : r.GetString(5)));
        }

        return list;
    }

    public CommentRecord? UpdateComment(Guid id, string body)
    {
        using (var connection = Open())
        {
            using var cmd = connection.CreateCommand();
            cmd.CommandText = "UPDATE Comment SET Body = $body, UpdatedUtc = $updated WHERE Id = $id";
            cmd.Parameters.AddWithValue("$id", id.ToString("D"));
            cmd.Parameters.AddWithValue("$body", body);
            cmd.Parameters.AddWithValue("$updated", Now());
            if (cmd.ExecuteNonQuery() == 0)
            {
                return null;
            }
        }

        return GetComment(id);
    }

    public bool DeleteComment(Guid id)
    {
        using var connection = Open();
        using var cmd = connection.CreateCommand();
        cmd.CommandText = "DELETE FROM Comment WHERE Id = $id";
        cmd.Parameters.AddWithValue("$id", id.ToString("D"));
        return cmd.ExecuteNonQuery() > 0;
    }

    // ---------------------------------------------------------------- sidebar

    /// <summary>Años y meses (UTC) más recientes primero, con los títulos de cada mes.</summary>
    public IReadOnlyList<ArchiveYear> GetArchive()
    {
        var rows = new List<(string Month, Guid Id, string Title)>();
        using (var connection = Open())
        {
            using var cmd = connection.CreateCommand();
            cmd.CommandText = "SELECT substr(CreatedUtc, 1, 7), Id, Title FROM Post ORDER BY CreatedUtc DESC, Id DESC";
            using var r = cmd.ExecuteReader();
            while (r.Read())
            {
                rows.Add((r.GetString(0), Guid.Parse(r.GetString(1)), r.GetString(2)));
            }
        }

        return rows
            .GroupBy(x => x.Month[..4])
            .OrderByDescending(g => g.Key, StringComparer.Ordinal)
            .Select(y => new ArchiveYear(
                int.Parse(y.Key, CultureInfo.InvariantCulture),
                y.Count(),
                y.GroupBy(x => x.Month)
                    .OrderByDescending(m => m.Key, StringComparer.Ordinal)
                    .Select(m => new ArchiveMonth(
                        int.Parse(m.Key[5..], CultureInfo.InvariantCulture),
                        m.Count(),
                        m.Select(p => new PostRef(p.Id, p.Title)).ToList()))
                    .ToList()))
            .ToList();
    }

    /// <summary>Etiquetas con su número de entradas, en orden alfabético.</summary>
    public IReadOnlyList<LabelCount> GetLabelCounts()
    {
        using var connection = Open();
        using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT Label, COUNT(*) FROM PostLabel GROUP BY Label ORDER BY Label COLLATE NOCASE ASC, Label ASC";
        var list = new List<LabelCount>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            list.Add(new LabelCount(r.GetString(0), r.GetInt32(1)));
        }

        return list;
    }

    /// <summary>Autores con su número de entradas, los más activos primero.</summary>
    public IReadOnlyList<AuthorCount> GetAuthorCounts()
    {
        using var connection = Open();
        using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT AuthorUserId, COUNT(*) FROM Post GROUP BY AuthorUserId ORDER BY COUNT(*) DESC, AuthorUserId ASC";
        var list = new List<AuthorCount>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            list.Add(new AuthorCount(r.GetString(0), r.GetInt32(1)));
        }

        return list;
    }

    public IReadOnlyList<RecentComment> GetRecentComments(int count)
    {
        using var connection = Open();
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"SELECT c.PostId, p.Title, c.AuthorUserId, c.Body, c.CreatedUtc
            FROM Comment c JOIN Post p ON p.Id = c.PostId
            ORDER BY c.CreatedUtc DESC, c.rowid DESC LIMIT $n";
        cmd.Parameters.AddWithValue("$n", count);
        var list = new List<RecentComment>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            list.Add(new RecentComment(Guid.Parse(r.GetString(0)), r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4)));
        }

        return list;
    }
}
