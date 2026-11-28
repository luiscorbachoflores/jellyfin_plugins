using System;
using System.Collections.Generic;
using System.Globalization;
using Microsoft.Data.Sqlite;

namespace Jellyfin.Plugin.Diary.Db;

public static class DiarySource
{
    public const string Played = "played";
    public const string Marked = "marked";
    public const string Imported = "imported";
    public const string Manual = "manual";

    public static bool IsValid(string? s) => s is Played or Marked or Imported or Manual;
}

/// <summary>Fila del diario. Rewatch se calcula al leer: hay un visionado anterior de la misma película.</summary>
public record DiaryEntry(long Id, string UserId, string ItemId, string WatchedDate, string WatchedUtc, string Source, int? Rating, string? Note, bool Rewatch);

public enum RecordResult
{
    Added,
    Upgraded,
    Duplicate,
}

public class DiaryRepository
{
    private readonly string _connectionString;

    public DiaryRepository(string dbPath)
    {
        _connectionString = $"Data Source={dbPath}";
        Initialize();
    }

    private SqliteConnection Open()
    {
        var c = new SqliteConnection(_connectionString);
        c.Open();
        return c;
    }

    private void Initialize()
    {
        using var c = Open();
        var cmd = c.CreateCommand();
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS DiaryEntries (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                UserId TEXT NOT NULL,
                ItemId TEXT NOT NULL,
                WatchedDate TEXT NOT NULL,
                WatchedUtc TEXT NOT NULL,
                Source TEXT NOT NULL,
                Rating INTEGER NULL,
                Note TEXT NULL,
                CreatedUtc TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS IX_Diary_User_Date ON DiaryEntries (UserId, WatchedDate);
            CREATE INDEX IF NOT EXISTS IX_Diary_User_Item ON DiaryEntries (UserId, ItemId);";
        cmd.ExecuteNonQuery();
    }

    private const string Select = @"SELECT d.Id, d.UserId, d.ItemId, d.WatchedDate, d.WatchedUtc, d.Source, d.Rating, d.Note,
        EXISTS (SELECT 1 FROM DiaryEntries p WHERE p.UserId = d.UserId AND p.ItemId = d.ItemId
                AND (p.WatchedDate < d.WatchedDate OR (p.WatchedDate = d.WatchedDate AND p.Id < d.Id))) AS Rewatch
        FROM DiaryEntries d";

    private static DiaryEntry Read(SqliteDataReader r) => new(
        r.GetInt64(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4), r.GetString(5),
        r.IsDBNull(6) ? null : r.GetInt32(6), r.IsDBNull(7) ? null : r.GetString(7), r.GetInt64(8) != 0);

    private static string Iso(DateTime utc) => utc.ToString("o", CultureInfo.InvariantCulture);

    /// <summary>Anota un visionado automático. Si ya hay uno de esa película en la ventana de
    /// <paramref name="dedupeHours"/>, no duplica: solo sube «marcada a mano» a «vista».</summary>
    public RecordResult Record(string userId, string itemId, DateTime whenUtc, string localDate, string source, int dedupeHours)
    {
        var window = Math.Max(1, dedupeHours);
        using var c = Open();
        using var tx = c.BeginTransaction();
        var find = c.CreateCommand();
        find.Transaction = tx;
        find.CommandText = "SELECT Id, Source FROM DiaryEntries WHERE UserId = $u AND ItemId = $i AND WatchedUtc >= $from AND WatchedUtc <= $to ORDER BY Id DESC LIMIT 1";
        find.Parameters.AddWithValue("$u", userId);
        find.Parameters.AddWithValue("$i", itemId);
        find.Parameters.AddWithValue("$from", Iso(whenUtc.AddHours(-window)));
        find.Parameters.AddWithValue("$to", Iso(whenUtc.AddHours(window)));
        long? existingId = null;
        string? existingSource = null;
        using (var rd = find.ExecuteReader())
        {
            if (rd.Read())
            {
                existingId = rd.GetInt64(0);
                existingSource = rd.GetString(1);
            }
        }

        if (existingId is not null)
        {
            if (source == DiarySource.Played && (existingSource == DiarySource.Marked || existingSource == DiarySource.Imported))
            {
                var up = c.CreateCommand();
                up.Transaction = tx;
                up.CommandText = "UPDATE DiaryEntries SET Source = $s WHERE Id = $id";
                up.Parameters.AddWithValue("$s", source);
                up.Parameters.AddWithValue("$id", existingId.Value);
                up.ExecuteNonQuery();
                tx.Commit();
                return RecordResult.Upgraded;
            }

            tx.Commit();
            return RecordResult.Duplicate;
        }

        Insert(c, tx, userId, itemId, whenUtc, localDate, source, null, null);
        tx.Commit();
        return RecordResult.Added;
    }

    private static long Insert(SqliteConnection c, SqliteTransaction tx, string userId, string itemId, DateTime whenUtc, string localDate, string source, int? rating, string? note)
    {
        var ins = c.CreateCommand();
        ins.Transaction = tx;
        ins.CommandText = @"INSERT INTO DiaryEntries (UserId, ItemId, WatchedDate, WatchedUtc, Source, Rating, Note, CreatedUtc)
            VALUES ($u, $i, $d, $w, $s, $r, $n, $c); SELECT last_insert_rowid();";
        ins.Parameters.AddWithValue("$u", userId);
        ins.Parameters.AddWithValue("$i", itemId);
        ins.Parameters.AddWithValue("$d", localDate);
        ins.Parameters.AddWithValue("$w", Iso(whenUtc));
        ins.Parameters.AddWithValue("$s", source);
        ins.Parameters.AddWithValue("$r", (object?)rating ?? DBNull.Value);
        ins.Parameters.AddWithValue("$n", (object?)note ?? DBNull.Value);
        ins.Parameters.AddWithValue("$c", Iso(DateTime.UtcNow));
        return Convert.ToInt64(ins.ExecuteScalar(), CultureInfo.InvariantCulture);
    }

    /// <summary>Alta explícita (manual o importada): siempre inserta.</summary>
    public long Add(string userId, string itemId, DateTime whenUtc, string localDate, string source, int? rating, string? note)
    {
        using var c = Open();
        using var tx = c.BeginTransaction();
        var id = Insert(c, tx, userId, itemId, whenUtc, localDate, source, rating, note);
        tx.Commit();
        return id;
    }

    /// <summary>Quita el último «marcada a mano» reciente al desmarcar «visto» (deshacer un clic).
    /// Si la persona ya le puso nota o comentario, no se toca.</summary>
    public bool UndoMarked(string userId, string itemId, DateTime nowUtc, int dedupeHours)
    {
        using var c = Open();
        var cmd = c.CreateCommand();
        cmd.CommandText = @"DELETE FROM DiaryEntries WHERE Id = (SELECT Id FROM DiaryEntries WHERE UserId = $u AND ItemId = $i
            AND Source = 'marked' AND Rating IS NULL AND Note IS NULL AND CreatedUtc >= $from ORDER BY Id DESC LIMIT 1)";
        cmd.Parameters.AddWithValue("$u", userId);
        cmd.Parameters.AddWithValue("$i", itemId);
        cmd.Parameters.AddWithValue("$from", Iso(nowUtc.AddHours(-Math.Max(1, dedupeHours))));
        return cmd.ExecuteNonQuery() > 0;
    }

    public DiaryEntry? Get(long id)
    {
        using var c = Open();
        var cmd = c.CreateCommand();
        cmd.CommandText = Select + " WHERE d.Id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        using var r = cmd.ExecuteReader();
        return r.Read() ? Read(r) : null;
    }

    public bool Update(long id, string userId, string? localDate, int? rating, bool clearRating, string? note, bool setNote)
    {
        using var c = Open();
        var cmd = c.CreateCommand();
        var sets = new List<string>();
        if (localDate is not null)
        {
            sets.Add("WatchedDate = $d");
            cmd.Parameters.AddWithValue("$d", localDate);
        }

        if (rating is not null || clearRating)
        {
            sets.Add("Rating = $r");
            cmd.Parameters.AddWithValue("$r", clearRating ? DBNull.Value : (object)rating!.Value);
        }

        if (setNote)
        {
            sets.Add("Note = $n");
            cmd.Parameters.AddWithValue("$n", (object?)note ?? DBNull.Value);
        }

        if (sets.Count == 0)
        {
            return true;
        }

        cmd.CommandText = "UPDATE DiaryEntries SET " + string.Join(", ", sets) + " WHERE Id = $id AND UserId = $u";
        cmd.Parameters.AddWithValue("$id", id);
        cmd.Parameters.AddWithValue("$u", userId);
        return cmd.ExecuteNonQuery() > 0;
    }

    public bool Delete(long id, string userId)
    {
        using var c = Open();
        var cmd = c.CreateCommand();
        cmd.CommandText = "DELETE FROM DiaryEntries WHERE Id = $id AND UserId = $u";
        cmd.Parameters.AddWithValue("$id", id);
        cmd.Parameters.AddWithValue("$u", userId);
        return cmd.ExecuteNonQuery() > 0;
    }

    /// <summary>Entradas del usuario de un año (o todas si year es null), más recientes primero.</summary>
    public IReadOnlyList<DiaryEntry> GetForUser(string userId, int? year)
    {
        using var c = Open();
        var cmd = c.CreateCommand();
        cmd.CommandText = Select + " WHERE d.UserId = $u" + (year is null ? string.Empty : " AND d.WatchedDate >= $a AND d.WatchedDate < $b")
            + " ORDER BY d.WatchedDate DESC, d.Id DESC";
        cmd.Parameters.AddWithValue("$u", userId);
        if (year is not null)
        {
            cmd.Parameters.AddWithValue("$a", year.Value.ToString("D4", CultureInfo.InvariantCulture) + "-01-01");
            cmd.Parameters.AddWithValue("$b", (year.Value + 1).ToString("D4", CultureInfo.InvariantCulture) + "-01-01");
        }

        var list = new List<DiaryEntry>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            list.Add(Read(r));
        }

        return list;
    }

    /// <summary>Años con entradas del usuario, del más reciente al más antiguo.</summary>
    public IReadOnlyList<int> GetYears(string userId)
    {
        using var c = Open();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT DISTINCT CAST(substr(WatchedDate, 1, 4) AS INTEGER) AS y FROM DiaryEntries WHERE UserId = $u ORDER BY y DESC";
        cmd.Parameters.AddWithValue("$u", userId);
        var list = new List<int>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            list.Add(r.GetInt32(0));
        }

        return list;
    }

    /// <summary>Ids de las películas que el usuario ya tiene en el diario.</summary>
    public HashSet<string> GetItemIds(string userId)
    {
        using var c = Open();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT DISTINCT ItemId FROM DiaryEntries WHERE UserId = $u";
        cmd.Parameters.AddWithValue("$u", userId);
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            set.Add(r.GetString(0));
        }

        return set;
    }

    /// <summary>Alta de varias entradas en una sola transacción (importación).</summary>
    public int AddMany(string userId, IEnumerable<(string ItemId, DateTime WhenUtc, string LocalDate)> rows, string source)
    {
        using var c = Open();
        using var tx = c.BeginTransaction();
        var n = 0;
        foreach (var (itemId, whenUtc, localDate) in rows)
        {
            Insert(c, tx, userId, itemId, whenUtc, localDate, source, null, null);
            n++;
        }

        tx.Commit();
        return n;
    }

    /// <summary>Películas vistas en el año por al menos tres usuarios distintos. Solo cuenta audiencia,
    /// sin nombres: es la base de «lo más visto del servidor».</summary>
    public IReadOnlyList<(string ItemId, int Viewers)> GetCommunityTop(int year, int take)
    {
        using var c = Open();
        var cmd = c.CreateCommand();
        cmd.CommandText = @"SELECT ItemId, COUNT(DISTINCT UserId) AS v FROM DiaryEntries WHERE WatchedDate >= $a AND WatchedDate < $b
            GROUP BY ItemId HAVING v >= 3 ORDER BY v DESC, MAX(WatchedDate) DESC LIMIT $t";
        cmd.Parameters.AddWithValue("$a", year.ToString("D4", CultureInfo.InvariantCulture) + "-01-01");
        cmd.Parameters.AddWithValue("$b", (year + 1).ToString("D4", CultureInfo.InvariantCulture) + "-01-01");
        cmd.Parameters.AddWithValue("$t", take);
        var list = new List<(string, int)>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            list.Add((r.GetString(0), r.GetInt32(1)));
        }

        return list;
    }

    /// <summary>Resumen para el administrador: entradas por usuario.</summary>
    public IReadOnlyList<(string UserId, int Entries, string? Last)> GetUserSummary()
    {
        using var c = Open();
        var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT UserId, COUNT(*), MAX(WatchedDate) FROM DiaryEntries GROUP BY UserId ORDER BY COUNT(*) DESC";
        var list = new List<(string, int, string?)>();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            list.Add((r.GetString(0), r.GetInt32(1), r.IsDBNull(2) ? null : r.GetString(2)));
        }

        return list;
    }
}
