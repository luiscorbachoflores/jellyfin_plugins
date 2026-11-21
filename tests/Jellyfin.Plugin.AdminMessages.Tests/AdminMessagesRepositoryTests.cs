using System;
using System.IO;
using System.Linq;
using Jellyfin.Plugin.AdminMessages.Db;
using Xunit;

namespace Jellyfin.Plugin.AdminMessages.Tests;

public class AdminMessagesRepositoryTests : IDisposable
{
    private readonly string _dbPath;
    private readonly AdminMessagesRepository _repository;

    public AdminMessagesRepositoryTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"adminmessages-tests-{Guid.NewGuid()}.db");
        _repository = new AdminMessagesRepository(_dbPath);
    }

    public void Dispose()
    {
        try
        {
            File.Delete(_dbPath);
        }
        catch (IOException)
        {
        }
    }

    [Fact]
    public void Add_Broadcast_HasNoTargetUserIds()
    {
        var record = _repository.Add("admin-1", "Mantenimiento", "El servidor reiniciará esta noche.", null, Array.Empty<string>());

        Assert.NotEqual(Guid.Empty, record.Id);
        Assert.Empty(record.TargetUserIds);
    }

    [Fact]
    public void GetForUser_BroadcastMessage_AppliesToAnyUser()
    {
        _repository.Add("admin-1", "Mantenimiento", "Cuerpo", null, Array.Empty<string>());

        var forAlice = _repository.GetForUser("alice");
        var forBob = _repository.GetForUser("bob");

        Assert.Single(forAlice);
        Assert.Single(forBob);
    }

    [Fact]
    public void GetForUser_TargetedMessage_OnlyAppliesToTargetUsers()
    {
        _repository.Add("admin-1", "Para Alice", "Cuerpo", null, new[] { "alice" });

        var forAlice = _repository.GetForUser("alice");
        var forBob = _repository.GetForUser("bob");

        Assert.Single(forAlice);
        Assert.Empty(forBob);
    }

    [Fact]
    public void GetForUser_MixesBroadcastAndOwnTargeted_NotOthersTargeted()
    {
        _repository.Add("admin-1", "Broadcast", "Cuerpo", null, Array.Empty<string>());
        _repository.Add("admin-1", "Para Alice", "Cuerpo", null, new[] { "alice" });
        _repository.Add("admin-1", "Para Bob", "Cuerpo", null, new[] { "bob" });

        var forAlice = _repository.GetForUser("alice");

        Assert.Equal(2, forAlice.Count);
        Assert.Contains(forAlice, m => m.Title == "Broadcast");
        Assert.Contains(forAlice, m => m.Title == "Para Alice");
        Assert.DoesNotContain(forAlice, m => m.Title == "Para Bob");
    }

    [Fact]
    public void GetForUser_IsReadFlag_FalseUntilMarkedRead()
    {
        var record = _repository.Add("admin-1", "Aviso", "Cuerpo", null, Array.Empty<string>());

        var before = _repository.GetForUser("alice").Single();
        Assert.False(before.IsRead);

        _repository.MarkRead(record.Id, "alice");

        var after = _repository.GetForUser("alice").Single();
        Assert.True(after.IsRead);
    }

    [Fact]
    public void MarkRead_IsIdempotent()
    {
        var record = _repository.Add("admin-1", "Aviso", "Cuerpo", null, Array.Empty<string>());

        _repository.MarkRead(record.Id, "alice");
        _repository.MarkRead(record.Id, "alice");

        var messages = _repository.GetForUser("alice");
        Assert.Single(messages);
        Assert.True(messages[0].IsRead);
    }

    [Fact]
    public void MarkRead_DoesNotAffectOtherUsersReadState()
    {
        var record = _repository.Add("admin-1", "Aviso", "Cuerpo", null, Array.Empty<string>());

        _repository.MarkRead(record.Id, "alice");

        var forBob = _repository.GetForUser("bob").Single();
        Assert.False(forBob.IsRead);
    }

    [Fact]
    public void AppliesToUser_TrueForBroadcast_FalseForUnrelatedTargetedMessage()
    {
        var broadcast = _repository.Add("admin-1", "Broadcast", "Cuerpo", null, Array.Empty<string>());
        var targeted = _repository.Add("admin-1", "Para Alice", "Cuerpo", null, new[] { "alice" });

        Assert.True(_repository.AppliesToUser(broadcast.Id, "bob"));
        Assert.True(_repository.AppliesToUser(targeted.Id, "alice"));
        Assert.False(_repository.AppliesToUser(targeted.Id, "bob"));
    }

    [Fact]
    public void Update_ChangesTitleBodyAndTargets()
    {
        var record = _repository.Add("admin-1", "Original", "Cuerpo original", null, new[] { "alice" });

        var updated = _repository.Update(record.Id, "Editado", "Cuerpo editado", null, new[] { "bob" });

        Assert.NotNull(updated);
        Assert.Equal("Editado", updated!.Title);
        Assert.Equal("Cuerpo editado", updated.Body);
        Assert.Equal(new[] { "bob" }, updated.TargetUserIds);
        Assert.False(_repository.AppliesToUser(record.Id, "alice"));
        Assert.True(_repository.AppliesToUser(record.Id, "bob"));
    }

    [Fact]
    public void Update_UnknownId_ReturnsNull()
    {
        var updated = _repository.Update(Guid.NewGuid(), "Editado", "Cuerpo", null, Array.Empty<string>());

        Assert.Null(updated);
    }

    [Fact]
    public void Delete_RemovesMessageTargetsAndReads()
    {
        var record = _repository.Add("admin-1", "Aviso", "Cuerpo", null, new[] { "alice" });
        _repository.MarkRead(record.Id, "alice");

        var deleted = _repository.Delete(record.Id);

        Assert.True(deleted);
        Assert.Null(_repository.GetById(record.Id));
        Assert.Empty(_repository.GetForUser("alice"));
    }

    [Fact]
    public void Delete_UnknownId_ReturnsFalse()
    {
        var deleted = _repository.Delete(Guid.NewGuid());

        Assert.False(deleted);
    }

    [Fact]
    public void GetAll_ReturnsEveryMessageWithTargetsForAdminView()
    {
        _repository.Add("admin-1", "Broadcast", "Cuerpo", null, Array.Empty<string>());
        _repository.Add("admin-2", "Para Alice", "Cuerpo", null, new[] { "alice" });

        var all = _repository.GetAll();

        Assert.Equal(2, all.Count);
        Assert.Contains(all, m => m.Title == "Broadcast" && m.TargetUserIds.Count == 0);
        Assert.Contains(all, m => m.Title == "Para Alice" && m.TargetUserIds.SequenceEqual(new[] { "alice" }));
    }

    [Fact]
    public void GetById_UnknownId_ReturnsNull()
    {
        Assert.Null(_repository.GetById(Guid.NewGuid()));
    }

    [Fact]
    public void Add_WithLink_PersistsLinkEverywhere()
    {
        var record = _repository.Add("admin-1", "Recap anual", "Ya está listo", "https://recap.titoteca.net", Array.Empty<string>());

        Assert.Equal("https://recap.titoteca.net", record.Link);
        Assert.Equal("https://recap.titoteca.net", _repository.GetById(record.Id)!.Link);
        Assert.Equal("https://recap.titoteca.net", _repository.GetForUser("alice").Single().Link);
        Assert.Equal("https://recap.titoteca.net", _repository.GetAll().Single().Link);
    }

    [Fact]
    public void Add_WithoutLink_LinkIsNullEverywhere()
    {
        var record = _repository.Add("admin-1", "Aviso", "Cuerpo", null, Array.Empty<string>());

        Assert.Null(record.Link);
        Assert.Null(_repository.GetById(record.Id)!.Link);
        Assert.Null(_repository.GetForUser("alice").Single().Link);
        Assert.Null(_repository.GetAll().Single().Link);
    }

    [Fact]
    public void Update_CanSetAndClearLink()
    {
        var record = _repository.Add("admin-1", "Aviso", "Cuerpo", null, Array.Empty<string>());

        var withLink = _repository.Update(record.Id, "Aviso", "Cuerpo", "https://example.com/recap", Array.Empty<string>());
        Assert.Equal("https://example.com/recap", withLink!.Link);

        var withoutLink = _repository.Update(record.Id, "Aviso", "Cuerpo", null, Array.Empty<string>());
        Assert.Null(withoutLink!.Link);
    }

    [Fact]
    public void ExistingDatabaseWithoutLinkColumn_MigratesOnOpen()
    {
        // Simula una base creada por una version anterior de este plugin (antes del
        // spec 0003), sin la columna Link: EnsureLinkColumn debe anadirla sola al abrir.
        var legacyDbPath = Path.Combine(Path.GetTempPath(), $"adminmessages-legacy-{Guid.NewGuid()}.db");
        try
        {
            using (var connection = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={legacyDbPath}"))
            {
                connection.Open();
                var cmd = connection.CreateCommand();
                cmd.CommandText = @"CREATE TABLE Messages (
                    Id TEXT PRIMARY KEY,
                    AdminUserId TEXT NOT NULL,
                    Title TEXT NOT NULL,
                    Body TEXT NOT NULL,
                    CreatedUtc TEXT NOT NULL
                );";
                cmd.ExecuteNonQuery();
            }

            var legacyRepository = new AdminMessagesRepository(legacyDbPath);
            var record = legacyRepository.Add("admin-1", "Aviso", "Cuerpo", "https://example.com", Array.Empty<string>());

            Assert.Equal("https://example.com", legacyRepository.GetById(record.Id)!.Link);
        }
        finally
        {
            try
            {
                File.Delete(legacyDbPath);
            }
            catch (IOException)
            {
            }
        }
    }

    private const string UserNoDashes = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
    private const string UserDashed = "a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90";

    [Fact]
    public void GetForUser_TargetStoredWithoutDashes_MatchesDashedJellyfinId()
    {
        _repository.Add("admin-1", "Hola", "Cuerpo", null, new[] { UserNoDashes });

        var forUser = _repository.GetForUser(UserDashed);

        Assert.Single(forUser);
    }

    [Fact]
    public void GetForUser_TargetStoredWithDashes_MatchesNoDashesId_AndIgnoresCase()
    {
        _repository.Add("admin-1", "Hola", "Cuerpo", null, new[] { UserDashed.ToUpperInvariant() });

        Assert.Single(_repository.GetForUser(UserNoDashes));
        Assert.Single(_repository.GetForUser(UserDashed));
    }

    [Fact]
    public void GetForUser_TargetedMessage_DoesNotAppearForOtherUser()
    {
        _repository.Add("admin-1", "Hola", "Cuerpo", null, new[] { UserNoDashes });

        Assert.Empty(_repository.GetForUser("0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0"));
    }

    [Fact]
    public void MarkRead_WithDashedId_IsReflectedWhenQueryingWithEitherFormat()
    {
        var record = _repository.Add("admin-1", "Hola", "Cuerpo", null, new[] { UserNoDashes });

        Assert.True(_repository.AppliesToUser(record.Id, UserDashed));
        _repository.MarkRead(record.Id, UserDashed);

        Assert.True(_repository.GetForUser(UserNoDashes).Single().IsRead);
        Assert.True(_repository.GetForUser(UserDashed).Single().IsRead);
    }

    [Fact]
    public void Initialize_MigratesLegacyUserIdsInTargetsAndReads()
    {
        var path = Path.Combine(Path.GetTempPath(), $"adminmessages-legacy-{Guid.NewGuid()}.db");
        try
        {
            var first = new AdminMessagesRepository(path);
            var record = first.Add("admin-1", "Hola", "Cuerpo", null, new[] { UserNoDashes });

            // Simula una base antigua: target con guiones y mayusculas, y una lectura
            // duplicada (una con guiones y otra ya normalizada).
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            using (var conn = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={path}"))
            {
                conn.Open();
                var cmd = conn.CreateCommand();
                cmd.CommandText = "UPDATE MessageTargets SET UserId = $u";
                cmd.Parameters.AddWithValue("$u", UserDashed.ToUpperInvariant());
                cmd.ExecuteNonQuery();

                var reads = conn.CreateCommand();
                reads.CommandText = "INSERT INTO MessageReads (MessageId, UserId, ReadUtc) VALUES ($m, $u, 'x'), ($m, $n, 'x')";
                reads.Parameters.AddWithValue("$m", record.Id.ToString());
                reads.Parameters.AddWithValue("$u", UserDashed);
                reads.Parameters.AddWithValue("$n", UserNoDashes);
                reads.ExecuteNonQuery();
            }

            var reopened = new AdminMessagesRepository(path);

            var mine = reopened.GetForUser(UserDashed);
            Assert.Single(mine);
            Assert.True(mine.Single().IsRead);
            Assert.Equal(new[] { UserNoDashes }, reopened.GetById(record.Id)!.TargetUserIds);
        }
        finally
        {
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            try { File.Delete(path); } catch (IOException) { }
        }
    }

    [Fact]
    public void NormalizeUserId_NonGuid_IsLeftUntouchedExceptTrim()
    {
        Assert.Equal("alice", AdminMessagesRepository.NormalizeUserId(" alice "));
    }
}
