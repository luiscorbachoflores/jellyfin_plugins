using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Data.Sqlite;

namespace Jellyfin.Plugin.AdminMessages.Db;

public record MessageRecord(Guid Id, string AdminUserId, string Title, string Body, string CreatedUtc, IReadOnlyList<string> TargetUserIds);

public record UserMessageRecord(Guid Id, string Title, string Body, string CreatedUtc, bool IsRead);

public class AdminMessagesRepository
{
    private readonly string _connectionString;

    public AdminMessagesRepository(string dbPath)
    {
        _connectionString = $"Data Source={dbPath}";
        Initialize();
    }

    private void Initialize()
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS Messages (
                Id TEXT PRIMARY KEY,
                AdminUserId TEXT NOT NULL,
                Title TEXT NOT NULL,
                Body TEXT NOT NULL,
                CreatedUtc TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS MessageTargets (
                MessageId TEXT NOT NULL,
                UserId TEXT NOT NULL,
                PRIMARY KEY (MessageId, UserId)
            );
            CREATE TABLE IF NOT EXISTS MessageReads (
                MessageId TEXT NOT NULL,
                UserId TEXT NOT NULL,
                ReadUtc TEXT NOT NULL,
                PRIMARY KEY (MessageId, UserId)
            );";
        cmd.ExecuteNonQuery();
    }

    public MessageRecord Add(string adminUserId, string title, string body, IReadOnlyList<string> targetUserIds)
    {
        var id = Guid.NewGuid();
        var createdUtc = DateTime.UtcNow.ToString("o");

        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        using var transaction = connection.BeginTransaction();

        var insertMessage = connection.CreateCommand();
        insertMessage.Transaction = transaction;
        insertMessage.CommandText = "INSERT INTO Messages (Id, AdminUserId, Title, Body, CreatedUtc) VALUES ($id, $adminUserId, $title, $body, $createdUtc)";
        insertMessage.Parameters.AddWithValue("$id", id.ToString());
        insertMessage.Parameters.AddWithValue("$adminUserId", adminUserId);
        insertMessage.Parameters.AddWithValue("$title", title);
        insertMessage.Parameters.AddWithValue("$body", body);
        insertMessage.Parameters.AddWithValue("$createdUtc", createdUtc);
        insertMessage.ExecuteNonQuery();

        InsertTargets(connection, transaction, id, targetUserIds);

        transaction.Commit();
        return new MessageRecord(id, adminUserId, title, body, createdUtc, targetUserIds);
    }

    public IReadOnlyList<MessageRecord> GetAll()
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT Id, AdminUserId, Title, Body, CreatedUtc FROM Messages ORDER BY datetime(CreatedUtc) DESC";

        var results = new List<MessageRecord>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            results.Add(ReadMessage(reader));
        }

        reader.Close();

        return results
            .Select(m => m with { TargetUserIds = GetTargets(connection, m.Id) })
            .ToList();
    }

    public MessageRecord? GetById(Guid id)
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT Id, AdminUserId, Title, Body, CreatedUtc FROM Messages WHERE Id = $id";
        cmd.Parameters.AddWithValue("$id", id.ToString());

        using var reader = cmd.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }

        var record = ReadMessage(reader);
        reader.Close();
        return record with { TargetUserIds = GetTargets(connection, id) };
    }

    public MessageRecord? Update(Guid id, string title, string body, IReadOnlyList<string> targetUserIds)
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        using var transaction = connection.BeginTransaction();

        var update = connection.CreateCommand();
        update.Transaction = transaction;
        update.CommandText = "UPDATE Messages SET Title = $title, Body = $body WHERE Id = $id";
        update.Parameters.AddWithValue("$title", title);
        update.Parameters.AddWithValue("$body", body);
        update.Parameters.AddWithValue("$id", id.ToString());
        var affected = update.ExecuteNonQuery();

        if (affected == 0)
        {
            transaction.Rollback();
            return null;
        }

        var deleteTargets = connection.CreateCommand();
        deleteTargets.Transaction = transaction;
        deleteTargets.CommandText = "DELETE FROM MessageTargets WHERE MessageId = $id";
        deleteTargets.Parameters.AddWithValue("$id", id.ToString());
        deleteTargets.ExecuteNonQuery();

        InsertTargets(connection, transaction, id, targetUserIds);

        transaction.Commit();
        return GetById(id);
    }

    public bool Delete(Guid id)
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        using var transaction = connection.BeginTransaction();

        var deleteMessage = connection.CreateCommand();
        deleteMessage.Transaction = transaction;
        deleteMessage.CommandText = "DELETE FROM Messages WHERE Id = $id";
        deleteMessage.Parameters.AddWithValue("$id", id.ToString());
        var affected = deleteMessage.ExecuteNonQuery();

        var deleteTargets = connection.CreateCommand();
        deleteTargets.Transaction = transaction;
        deleteTargets.CommandText = "DELETE FROM MessageTargets WHERE MessageId = $id";
        deleteTargets.Parameters.AddWithValue("$id", id.ToString());
        deleteTargets.ExecuteNonQuery();

        var deleteReads = connection.CreateCommand();
        deleteReads.Transaction = transaction;
        deleteReads.CommandText = "DELETE FROM MessageReads WHERE MessageId = $id";
        deleteReads.Parameters.AddWithValue("$id", id.ToString());
        deleteReads.ExecuteNonQuery();

        transaction.Commit();
        return affected > 0;
    }

    public IReadOnlyList<UserMessageRecord> GetForUser(string userId)
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT m.Id, m.Title, m.Body, m.CreatedUtc,
                   CASE WHEN r.UserId IS NULL THEN 0 ELSE 1 END AS IsRead
            FROM Messages m
            LEFT JOIN MessageReads r ON r.MessageId = m.Id AND r.UserId = $userId
            WHERE NOT EXISTS (SELECT 1 FROM MessageTargets t WHERE t.MessageId = m.Id)
               OR EXISTS (SELECT 1 FROM MessageTargets t WHERE t.MessageId = m.Id AND t.UserId = $userId)
            ORDER BY datetime(m.CreatedUtc) DESC";
        cmd.Parameters.AddWithValue("$userId", userId);

        var results = new List<UserMessageRecord>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            results.Add(new UserMessageRecord(
                Guid.Parse(reader.GetString(0)),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetInt64(4) == 1));
        }

        return results;
    }

    public bool AppliesToUser(Guid messageId, string userId)
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT 1 FROM Messages m
            WHERE m.Id = $id
              AND (
                NOT EXISTS (SELECT 1 FROM MessageTargets t WHERE t.MessageId = m.Id)
                OR EXISTS (SELECT 1 FROM MessageTargets t WHERE t.MessageId = m.Id AND t.UserId = $userId)
              )
            LIMIT 1";
        cmd.Parameters.AddWithValue("$id", messageId.ToString());
        cmd.Parameters.AddWithValue("$userId", userId);

        using var reader = cmd.ExecuteReader();
        return reader.Read();
    }

    public void MarkRead(Guid messageId, string userId)
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        var cmd = connection.CreateCommand();
        cmd.CommandText = "INSERT OR IGNORE INTO MessageReads (MessageId, UserId, ReadUtc) VALUES ($messageId, $userId, $readUtc)";
        cmd.Parameters.AddWithValue("$messageId", messageId.ToString());
        cmd.Parameters.AddWithValue("$userId", userId);
        cmd.Parameters.AddWithValue("$readUtc", DateTime.UtcNow.ToString("o"));
        cmd.ExecuteNonQuery();
    }

    private static void InsertTargets(SqliteConnection connection, SqliteTransaction transaction, Guid messageId, IReadOnlyList<string> targetUserIds)
    {
        foreach (var userId in targetUserIds.Distinct())
        {
            var insertTarget = connection.CreateCommand();
            insertTarget.Transaction = transaction;
            insertTarget.CommandText = "INSERT INTO MessageTargets (MessageId, UserId) VALUES ($messageId, $userId)";
            insertTarget.Parameters.AddWithValue("$messageId", messageId.ToString());
            insertTarget.Parameters.AddWithValue("$userId", userId);
            insertTarget.ExecuteNonQuery();
        }
    }

    private static List<string> GetTargets(SqliteConnection connection, Guid messageId)
    {
        var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT UserId FROM MessageTargets WHERE MessageId = $messageId";
        cmd.Parameters.AddWithValue("$messageId", messageId.ToString());

        var targets = new List<string>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            targets.Add(reader.GetString(0));
        }

        return targets;
    }

    private static MessageRecord ReadMessage(SqliteDataReader reader)
    {
        return new MessageRecord(
            Guid.Parse(reader.GetString(0)),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3),
            reader.GetString(4),
            Array.Empty<string>());
    }
}
