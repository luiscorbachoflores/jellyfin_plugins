using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;

namespace Jellyfin.Plugin.Reviews.Db;

public record ReviewRecord(int Id, string ItemId, string? UserId, string DisplayName, bool IsAnonymous, double Rating, string Comment, string CreatedAt);

/// <summary>
/// SQLite store for reviews. Every statement is parameterised (no string concatenation of user data);
/// connections are short-lived (Microsoft.Data.Sqlite pools them) and writes are serialised with a lock so
/// ~30 concurrent users never fight over the database file.
/// </summary>
public class ReviewsRepository
{
    private readonly string _connectionString;
    private readonly SemaphoreSlim _writeLock = new(1, 1);

    public ReviewsRepository(string dbPath)
    {
        _connectionString = new SqliteConnectionStringBuilder { DataSource = dbPath, DefaultTimeout = 15 }.ToString();
        Initialize();
    }

    private void Initialize()
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        using var cmd = connection.CreateCommand();
        // The schema is unchanged from 1.x (existing databases keep working); only an index is added.
        cmd.CommandText = @"CREATE TABLE IF NOT EXISTS Reviews (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            ItemId TEXT NOT NULL,
            UserId TEXT NULL,
            DisplayName TEXT NOT NULL,
            IsAnonymous INTEGER NOT NULL,
            Rating REAL NOT NULL,
            Comment TEXT NOT NULL,
            CreatedAt TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS IX_Reviews_ItemId ON Reviews (ItemId);
        CREATE INDEX IF NOT EXISTS IX_Reviews_UserId ON Reviews (UserId);";
        cmd.ExecuteNonQuery();
    }

    /// <summary>Reviews of an item. <paramref name="itemIds"/> lists every spelling of the id (N and D GUID formats).</summary>
    public async Task<IReadOnlyList<ReviewRecord>> GetForItemAsync(IReadOnlyList<string> itemIds, CancellationToken ct)
    {
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(ct).ConfigureAwait(false);
        await using var cmd = connection.CreateCommand();
        var names = new string[itemIds.Count];
        for (var i = 0; i < itemIds.Count; i++)
        {
            names[i] = "$i" + i.ToString(CultureInfo.InvariantCulture);
            cmd.Parameters.AddWithValue(names[i], itemIds[i]);
        }

        cmd.CommandText = "SELECT Id, ItemId, UserId, DisplayName, IsAnonymous, Rating, Comment, CreatedAt FROM Reviews WHERE ItemId IN (" + string.Join(",", names) + ") ORDER BY datetime(CreatedAt) DESC, Id DESC";

        var results = new List<ReviewRecord>();
        await using var reader = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);
        while (await reader.ReadAsync(ct).ConfigureAwait(false))
        {
            results.Add(ReadRecord(reader));
        }

        return results;
    }

    public async Task<ReviewRecord?> GetByIdAsync(int id, CancellationToken ct)
    {
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(ct).ConfigureAwait(false);
        return await GetByIdAsync(connection, id, ct).ConfigureAwait(false);
    }

    private static async Task<ReviewRecord?> GetByIdAsync(SqliteConnection connection, int id, CancellationToken ct)
    {
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT Id, ItemId, UserId, DisplayName, IsAnonymous, Rating, Comment, CreatedAt FROM Reviews WHERE Id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        await using var reader = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);
        return await reader.ReadAsync(ct).ConfigureAwait(false) ? ReadRecord(reader) : null;
    }

    /// <summary>How many reviews a user wrote for an item / in the last hour (anti-flood limits).</summary>
    public async Task<(int ForItem, int LastHour)> CountForUserAsync(string userId, IReadOnlyList<string> itemIds, CancellationToken ct)
    {
        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(ct).ConfigureAwait(false);
        await using var cmd = connection.CreateCommand();
        var names = new string[itemIds.Count];
        for (var i = 0; i < itemIds.Count; i++)
        {
            names[i] = "$i" + i.ToString(CultureInfo.InvariantCulture);
            cmd.Parameters.AddWithValue(names[i], itemIds[i]);
        }

        cmd.CommandText = "SELECT (SELECT COUNT(*) FROM Reviews WHERE UserId = $u AND ItemId IN (" + string.Join(",", names) + ")), " +
                          "(SELECT COUNT(*) FROM Reviews WHERE UserId = $u AND CreatedAt >= $since)";
        cmd.Parameters.AddWithValue("$u", userId);
        cmd.Parameters.AddWithValue("$since", DateTime.UtcNow.AddHours(-1).ToString("o", CultureInfo.InvariantCulture));
        await using var reader = await cmd.ExecuteReaderAsync(ct).ConfigureAwait(false);
        await reader.ReadAsync(ct).ConfigureAwait(false);
        return (reader.GetInt32(0), reader.GetInt32(1));
    }

    public async Task<ReviewRecord> AddAsync(string itemId, string? userId, string displayName, bool isAnonymous, double rating, string comment, CancellationToken ct)
    {
        await _writeLock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            await using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync(ct).ConfigureAwait(false);
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = @"INSERT INTO Reviews (ItemId, UserId, DisplayName, IsAnonymous, Rating, Comment, CreatedAt)
                VALUES ($itemId, $userId, $displayName, $isAnonymous, $rating, $comment, $createdAt);
                SELECT last_insert_rowid();";

            var createdAt = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);
            cmd.Parameters.AddWithValue("$itemId", itemId);
            cmd.Parameters.AddWithValue("$userId", (object?)userId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$displayName", displayName);
            cmd.Parameters.AddWithValue("$isAnonymous", isAnonymous ? 1 : 0);
            cmd.Parameters.AddWithValue("$rating", rating);
            cmd.Parameters.AddWithValue("$comment", comment);
            cmd.Parameters.AddWithValue("$createdAt", createdAt);

            var scalar = await cmd.ExecuteScalarAsync(ct).ConfigureAwait(false);
            var id = Convert.ToInt32(scalar, CultureInfo.InvariantCulture);
            return new ReviewRecord(id, itemId, userId, displayName, isAnonymous, rating, comment, createdAt);
        }
        finally
        {
            _writeLock.Release();
        }
    }

    public async Task<ReviewRecord?> UpdateAsync(int id, double rating, string comment, bool isAnonymous, CancellationToken ct)
    {
        await _writeLock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            await using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync(ct).ConfigureAwait(false);
            await using (var cmd = connection.CreateCommand())
            {
                cmd.CommandText = "UPDATE Reviews SET Rating = $rating, Comment = $comment, IsAnonymous = $isAnonymous WHERE Id = $id";
                cmd.Parameters.AddWithValue("$rating", rating);
                cmd.Parameters.AddWithValue("$comment", comment);
                cmd.Parameters.AddWithValue("$isAnonymous", isAnonymous ? 1 : 0);
                cmd.Parameters.AddWithValue("$id", id);
                await cmd.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
            }

            return await GetByIdAsync(connection, id, ct).ConfigureAwait(false);
        }
        finally
        {
            _writeLock.Release();
        }
    }

    public async Task DeleteAsync(int id, CancellationToken ct)
    {
        await _writeLock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            await using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync(ct).ConfigureAwait(false);
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = "DELETE FROM Reviews WHERE Id = $id";
            cmd.Parameters.AddWithValue("$id", id);
            await cmd.ExecuteNonQueryAsync(ct).ConfigureAwait(false);
        }
        finally
        {
            _writeLock.Release();
        }
    }

    private static ReviewRecord ReadRecord(SqliteDataReader reader)
    {
        return new ReviewRecord(
            reader.GetInt32(0),
            reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            reader.GetString(3),
            reader.GetInt64(4) == 1,
            reader.GetDouble(5),
            reader.GetString(6),
            reader.GetString(7));
    }
}
