using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Data.Sqlite;

namespace Jellyfin.Plugin.Reviews.Db;

public record ReviewRecord(int Id, string ItemId, string? UserId, string DisplayName, bool IsAnonymous, double Rating, string Comment, string CreatedAt);

public class ReviewsRepository
{
    private readonly string _connectionString;

    public ReviewsRepository(string dbPath)
    {
        _connectionString = $"Data Source={dbPath}";
        Initialize();
    }

    private void Initialize()
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        var cmd = connection.CreateCommand();
        cmd.CommandText = @"CREATE TABLE IF NOT EXISTS Reviews (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            ItemId TEXT NOT NULL,
            UserId TEXT NULL,
            DisplayName TEXT NOT NULL,
            IsAnonymous INTEGER NOT NULL,
            Rating REAL NOT NULL,
            Comment TEXT NOT NULL,
            CreatedAt TEXT NOT NULL
        );";
        cmd.ExecuteNonQuery();
    }

    public IReadOnlyList<ReviewRecord> GetForItem(string itemId)
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT Id, ItemId, UserId, DisplayName, IsAnonymous, Rating, Comment, CreatedAt FROM Reviews WHERE ItemId = $itemId ORDER BY datetime(CreatedAt) DESC";
        cmd.Parameters.AddWithValue("$itemId", itemId);

        var results = new List<ReviewRecord>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            results.Add(new ReviewRecord(
                reader.GetInt32(0),
                reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2),
                reader.GetString(3),
                reader.GetInt64(4) == 1,
                reader.GetDouble(5),
                reader.GetString(6),
                reader.GetString(7)));
        }

        return results;
    }

    public ReviewRecord Add(string itemId, string? userId, string displayName, bool isAnonymous, double rating, string comment)
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        var cmd = connection.CreateCommand();
        cmd.CommandText = @"INSERT INTO Reviews (ItemId, UserId, DisplayName, IsAnonymous, Rating, Comment, CreatedAt)
            VALUES ($itemId, $userId, $displayName, $isAnonymous, $rating, $comment, $createdAt);
            SELECT last_insert_rowid();";

        var createdAt = DateTime.UtcNow.ToString("o");
        cmd.Parameters.AddWithValue("$itemId", itemId);
        cmd.Parameters.AddWithValue("$userId", (object?)userId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$displayName", displayName);
        cmd.Parameters.AddWithValue("$isAnonymous", isAnonymous ? 1 : 0);
        cmd.Parameters.AddWithValue("$rating", rating);
        cmd.Parameters.AddWithValue("$comment", comment);
        cmd.Parameters.AddWithValue("$createdAt", createdAt);

        var id = Convert.ToInt32(cmd.ExecuteScalar());
        return new ReviewRecord(id, itemId, userId, displayName, isAnonymous, rating, comment, createdAt);
    }
}
