using System;
using System.Collections.Generic;
using Microsoft.Data.Sqlite;

namespace Jellyfin.Plugin.Watchlist.Db;

public record WatchlistEntry(string UserId, string ItemId, string AddedUtc);

public enum AddResult
{
    Added,
    AlreadyPresent,
    LimitReached,
}

public class WatchlistRepository
{
    private readonly string _connectionString;
    private readonly int _maxPerUser;

    public WatchlistRepository(string dbPath, int maxPerUser = Api.WatchlistRules.MaxEntriesPerUser)
    {
        _connectionString = $"Data Source={dbPath}";
        _maxPerUser = maxPerUser;
        Initialize();
    }

    private void Initialize()
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS WatchlistEntries (
                UserId TEXT NOT NULL,
                ItemId TEXT NOT NULL,
                AddedUtc TEXT NOT NULL,
                PRIMARY KEY (UserId, ItemId)
            );";
        cmd.ExecuteNonQuery();
    }

    /// <summary>Añade (idempotente). Comprueba el límite y el insert en una sola transacción.</summary>
    public AddResult Add(string userId, string itemId)
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        using var tx = connection.BeginTransaction();

        var exists = connection.CreateCommand();
        exists.Transaction = tx;
        exists.CommandText = "SELECT 1 FROM WatchlistEntries WHERE UserId = $u AND ItemId = $i";
        exists.Parameters.AddWithValue("$u", userId);
        exists.Parameters.AddWithValue("$i", itemId);
        if (exists.ExecuteScalar() is not null)
        {
            tx.Commit();
            return AddResult.AlreadyPresent;
        }

        var count = connection.CreateCommand();
        count.Transaction = tx;
        count.CommandText = "SELECT COUNT(*) FROM WatchlistEntries WHERE UserId = $u";
        count.Parameters.AddWithValue("$u", userId);
        var current = Convert.ToInt32(count.ExecuteScalar(), System.Globalization.CultureInfo.InvariantCulture);
        if (current >= _maxPerUser)
        {
            tx.Commit();
            return AddResult.LimitReached;
        }

        var insert = connection.CreateCommand();
        insert.Transaction = tx;
        // OR IGNORE: dos POST simultáneos del mismo item pueden pasar ambos el SELECT de arriba;
        // el segundo no debe acabar en un 500 por la clave primaria.
        insert.CommandText = "INSERT OR IGNORE INTO WatchlistEntries (UserId, ItemId, AddedUtc) VALUES ($u, $i, $t)";
        insert.Parameters.AddWithValue("$u", userId);
        insert.Parameters.AddWithValue("$i", itemId);
        insert.Parameters.AddWithValue("$t", DateTime.UtcNow.ToString("o"));
        var inserted = insert.ExecuteNonQuery();
        tx.Commit();
        return inserted > 0 ? AddResult.Added : AddResult.AlreadyPresent;
    }

    /// <summary>Quita (idempotente). Devuelve true si había algo que quitar.</summary>
    public bool Remove(string userId, string itemId)
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        var cmd = connection.CreateCommand();
        cmd.CommandText = "DELETE FROM WatchlistEntries WHERE UserId = $u AND ItemId = $i";
        cmd.Parameters.AddWithValue("$u", userId);
        cmd.Parameters.AddWithValue("$i", itemId);
        return cmd.ExecuteNonQuery() > 0;
    }

    /// <summary>Borra varias entradas de un usuario (autolimpieza de items que ya no existen).</summary>
    public void RemoveMany(string userId, IEnumerable<string> itemIds)
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        using var tx = connection.BeginTransaction();
        foreach (var itemId in itemIds)
        {
            var cmd = connection.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = "DELETE FROM WatchlistEntries WHERE UserId = $u AND ItemId = $i";
            cmd.Parameters.AddWithValue("$u", userId);
            cmd.Parameters.AddWithValue("$i", itemId);
            cmd.ExecuteNonQuery();
        }

        tx.Commit();
    }

    public bool Contains(string userId, string itemId)
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT 1 FROM WatchlistEntries WHERE UserId = $u AND ItemId = $i";
        cmd.Parameters.AddWithValue("$u", userId);
        cmd.Parameters.AddWithValue("$i", itemId);
        return cmd.ExecuteScalar() is not null;
    }

    public int Count(string userId)
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM WatchlistEntries WHERE UserId = $u";
        cmd.Parameters.AddWithValue("$u", userId);
        return Convert.ToInt32(cmd.ExecuteScalar(), System.Globalization.CultureInfo.InvariantCulture);
    }

    /// <summary>Todas las entradas de todos los usuarios, para la vista de solo lectura del
    /// administrador (agrupadas por usuario, más recientes primero dentro de cada uno).</summary>
    public IReadOnlyList<WatchlistEntry> GetAll()
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT UserId, ItemId, AddedUtc FROM WatchlistEntries ORDER BY UserId, AddedUtc DESC";
        var result = new List<WatchlistEntry>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            result.Add(new WatchlistEntry(reader.GetString(0), reader.GetString(1), reader.GetString(2)));
        }

        return result;
    }

    /// <summary>Entradas del usuario, más recientes primero.</summary>
    public IReadOnlyList<WatchlistEntry> GetForUser(string userId)
    {
        using var connection = new SqliteConnection(_connectionString);
        connection.Open();
        var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT UserId, ItemId, AddedUtc FROM WatchlistEntries WHERE UserId = $u ORDER BY AddedUtc DESC, ItemId";
        cmd.Parameters.AddWithValue("$u", userId);
        var result = new List<WatchlistEntry>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            result.Add(new WatchlistEntry(reader.GetString(0), reader.GetString(1), reader.GetString(2)));
        }

        return result;
    }
}
