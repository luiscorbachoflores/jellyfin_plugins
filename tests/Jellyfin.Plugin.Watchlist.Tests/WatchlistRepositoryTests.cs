using System;
using System.IO;
using System.Linq;
using System.Threading;
using Jellyfin.Plugin.Watchlist.Db;
using Xunit;

namespace Jellyfin.Plugin.Watchlist.Tests;

public class WatchlistRepositoryTests : IDisposable
{
    private readonly string _dbPath;
    private readonly WatchlistRepository _repository;

    public WatchlistRepositoryTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"watchlist-tests-{Guid.NewGuid()}.db");
        _repository = new WatchlistRepository(_dbPath);
    }

    public void Dispose()
    {
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try
        {
            File.Delete(_dbPath);
        }
        catch (IOException)
        {
        }
    }

    [Fact]
    public void Add_IsIdempotent()
    {
        Assert.Equal(AddResult.Added, _repository.Add("alice", "item-1"));
        Assert.Equal(AddResult.AlreadyPresent, _repository.Add("alice", "item-1"));

        Assert.Single(_repository.GetForUser("alice"));
        Assert.True(_repository.Contains("alice", "item-1"));
    }

    [Fact]
    public void Remove_IsIdempotent()
    {
        _repository.Add("alice", "item-1");

        Assert.True(_repository.Remove("alice", "item-1"));
        Assert.False(_repository.Remove("alice", "item-1"));
        Assert.False(_repository.Remove("alice", "never-added"));
        Assert.Empty(_repository.GetForUser("alice"));
    }

    [Fact]
    public void Add_501stEntry_IsRejected_AndNothingIsStored()
    {
        for (var i = 0; i < 500; i++)
        {
            Assert.Equal(AddResult.Added, _repository.Add("alice", $"item-{i}"));
        }

        Assert.Equal(AddResult.LimitReached, _repository.Add("alice", "item-500"));
        Assert.Equal(500, _repository.Count("alice"));
        Assert.False(_repository.Contains("alice", "item-500"));

        // Re-adding an existing one at the cap is still idempotent, not a limit error.
        Assert.Equal(AddResult.AlreadyPresent, _repository.Add("alice", "item-0"));
        // The cap is per user.
        Assert.Equal(AddResult.Added, _repository.Add("bob", "item-0"));
        // Removing one frees a slot.
        _repository.Remove("alice", "item-1");
        Assert.Equal(AddResult.Added, _repository.Add("alice", "item-500"));
    }

    [Fact]
    public void Users_AreIsolated()
    {
        _repository.Add("alice", "item-1");
        _repository.Add("bob", "item-2");

        Assert.Equal(new[] { "item-1" }, _repository.GetForUser("alice").Select(e => e.ItemId));
        Assert.Equal(new[] { "item-2" }, _repository.GetForUser("bob").Select(e => e.ItemId));
        Assert.False(_repository.Contains("bob", "item-1"));

        _repository.Remove("bob", "item-1");
        Assert.True(_repository.Contains("alice", "item-1"));
    }

    [Fact]
    public void GetForUser_OrdersByAddedUtcDescending()
    {
        _repository.Add("alice", "first");
        Thread.Sleep(15);
        _repository.Add("alice", "second");
        Thread.Sleep(15);
        _repository.Add("alice", "third");

        Assert.Equal(new[] { "third", "second", "first" }, _repository.GetForUser("alice").Select(e => e.ItemId));
    }

    [Fact]
    public void RemoveMany_PrunesOnlyThatUsersListedEntries()
    {
        _repository.Add("alice", "gone");
        _repository.Add("alice", "kept");
        _repository.Add("bob", "gone");

        _repository.RemoveMany("alice", new[] { "gone", "does-not-exist" });

        Assert.Equal(new[] { "kept" }, _repository.GetForUser("alice").Select(e => e.ItemId));
        Assert.True(_repository.Contains("bob", "gone"));
    }

    [Fact]
    public void Add_UsesParameterizedSql()
    {
        const string evil = "x'); DROP TABLE WatchlistEntries;--";
        _repository.Add("alice", evil);

        Assert.True(_repository.Contains("alice", evil));
        Assert.Single(_repository.GetForUser("alice"));
    }
}
