using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Jellyfin.Plugin.Diary.Api;
using Jellyfin.Plugin.Diary.Db;
using Xunit;

namespace Jellyfin.Plugin.Diary.Tests;

public class DiaryStatsTests
{
    private static StatFact F(string date, string item, int? rating = null, int minutes = 100, bool rewatch = false, int? year = 2000, params string[] genres) =>
        new(date, item, "Peli " + item, year, minutes, genres, rating, rewatch, date + "T20:00:00Z");

    [Fact]
    public void CuentaSoloElAnioPedido()
    {
        var s = DiaryStats.Compute(2026, new[] { F("2025-12-31", "a"), F("2026-01-01", "b"), F("2026-06-10", "c") }, Array.Empty<CommunityFilmDto>());
        Assert.Equal(2, s.Total);
        Assert.Equal(1, s.ByMonth[0]);
        Assert.Equal(1, s.ByMonth[5]);
    }

    [Fact]
    public void DistintasYRepeticiones()
    {
        var s = DiaryStats.Compute(2026, new[] { F("2026-01-01", "a"), F("2026-02-01", "a", rewatch: true), F("2026-03-01", "b") }, Array.Empty<CommunityFilmDto>());
        Assert.Equal(3, s.Total);
        Assert.Equal(2, s.Unique);
        Assert.Equal(1, s.Rewatches);
        Assert.Equal("a", s.MostRewatched!.ItemId);
        Assert.Equal(2, s.MostRewatchedTimes);
    }

    [Fact]
    public void NotaMediaEnEstrellasYTopOrdenado()
    {
        var s = DiaryStats.Compute(2026, new[] { F("2026-01-01", "a", 10), F("2026-01-02", "b", 7), F("2026-01-03", "c", null) }, Array.Empty<CommunityFilmDto>());
        Assert.Equal(2, s.RatedCount);
        Assert.Equal(4.25, s.AverageRating);
        Assert.Equal("a", s.TopRated[0].ItemId);
        Assert.Equal(1, s.RatingDistribution[9]);
        Assert.Equal(1, s.RatingDistribution[6]);
    }

    [Fact]
    public void RachaDeDiasSeguidos()
    {
        var days = new[] { "2026-03-01", "2026-03-02", "2026-03-03", "2026-03-10", "2026-03-11" }.Select(DateTime.Parse);
        var streak = DiaryStats.Streak(days);
        Assert.Equal(3, streak.Days);
        Assert.Equal("2026-03-01", streak.From);
        Assert.Equal("2026-03-03", streak.To);
        Assert.Equal(0, DiaryStats.Streak(Array.Empty<DateTime>()).Days);
    }

    [Fact]
    public void GenerosYDecadasOrdenadosPorFrecuencia()
    {
        var s = DiaryStats.Compute(2026, new[]
        {
            F("2026-01-01", "a", year: 1994, genres: new[] { "Drama", "Crimen" }),
            F("2026-01-02", "b", year: 1998, genres: new[] { "Drama" }),
            F("2026-01-03", "c", year: 2011, genres: new[] { "Comedia" }),
        }, Array.Empty<CommunityFilmDto>());
        Assert.Equal("Drama", s.TopGenres[0].Key);
        Assert.Equal(2, s.TopGenres[0].Count);
        Assert.Equal("1990", s.Decades[0].Key);
    }

    [Fact]
    public void AnioSinEntradasNoRompe()
    {
        var s = DiaryStats.Compute(2030, Array.Empty<StatFact>(), Array.Empty<CommunityFilmDto>());
        Assert.Equal(0, s.Total);
        Assert.Null(s.First);
        Assert.Null(s.AverageRating);
        Assert.Equal(0, s.LongestStreak.Days);
    }

    [Fact]
    public void LaMasLargaYLaMasCorta()
    {
        var s = DiaryStats.Compute(2026, new[] { F("2026-01-01", "a", minutes: 90), F("2026-01-02", "b", minutes: 190), F("2026-01-03", "c", minutes: 0) }, Array.Empty<CommunityFilmDto>());
        Assert.Equal("b", s.Longest!.ItemId);
        Assert.Equal("a", s.Shortest!.ItemId);
        Assert.Equal(280, s.Minutes);
    }
}

public sealed class DiaryRepositoryTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), "diary-test-" + Guid.NewGuid().ToString("N") + ".db");
    private readonly DiaryRepository _repo;

    public DiaryRepositoryTests()
    {
        _repo = new DiaryRepository(_path);
    }

    public void Dispose()
    {
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { File.Delete(_path); } catch (IOException) { /* temporal */ }
    }

    private static readonly DateTime T = new(2026, 5, 10, 21, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void MismoVisionadoEnLaVentanaNoDuplica()
    {
        Assert.Equal(RecordResult.Added, _repo.Record("u", "i", T, "2026-05-10", DiarySource.Played, 12));
        Assert.Equal(RecordResult.Duplicate, _repo.Record("u", "i", T.AddHours(2), "2026-05-10", DiarySource.Marked, 12));
        Assert.Single(_repo.GetForUser("u", 2026));
    }

    [Fact]
    public void VistaMejoraUnaMarcadaALaMano()
    {
        _repo.Record("u", "i", T, "2026-05-10", DiarySource.Marked, 12);
        Assert.Equal(RecordResult.Upgraded, _repo.Record("u", "i", T.AddMinutes(30), "2026-05-10", DiarySource.Played, 12));
        Assert.Equal(DiarySource.Played, _repo.GetForUser("u", null).Single().Source);
    }

    [Fact]
    public void FueraDeLaVentanaEsUnaRepeticion()
    {
        _repo.Record("u", "i", T, "2026-05-10", DiarySource.Played, 12);
        Assert.Equal(RecordResult.Added, _repo.Record("u", "i", T.AddDays(3), "2026-05-13", DiarySource.Played, 12));
        var list = _repo.GetForUser("u", 2026);
        Assert.Equal(2, list.Count);
        Assert.True(list.First(e => e.WatchedDate == "2026-05-13").Rewatch);
        Assert.False(list.First(e => e.WatchedDate == "2026-05-10").Rewatch);
    }

    [Fact]
    public void DesmarcarQuitaLaMarcadaSinNotaPeroNoLaQueTieneNota()
    {
        _repo.Record("u", "a", T, "2026-05-10", DiarySource.Marked, 12);
        Assert.True(_repo.UndoMarked("u", "a", T.AddMinutes(5), 12));
        var id = _repo.Add("u", "b", T, "2026-05-10", DiarySource.Marked, 8, "me gustó");
        Assert.False(_repo.UndoMarked("u", "b", DateTime.UtcNow, 12));
        Assert.NotNull(_repo.Get(id));
    }

    [Fact]
    public void ElDiarioEsDeCadaUsuario()
    {
        var id = _repo.Add("ana", "i", T, "2026-05-10", DiarySource.Manual, null, null);
        Assert.False(_repo.Update(id, "luis", "2026-01-01", null, false, null, false));
        Assert.False(_repo.Delete(id, "luis"));
        Assert.True(_repo.Delete(id, "ana"));
    }

    [Fact]
    public void AniosYAudienciaDeLaComunidad()
    {
        _repo.Add("a", "x", T, "2026-05-10", DiarySource.Manual, null, null);
        _repo.Add("b", "x", T, "2026-05-11", DiarySource.Manual, null, null);
        _repo.Add("c", "x", T, "2026-05-12", DiarySource.Manual, null, null);
        _repo.Add("a", "y", T, "2025-05-11", DiarySource.Manual, null, null);
        Assert.Equal(new[] { 2026, 2025 }, _repo.GetYears("a"));
        var top = _repo.GetCommunityTop(2026, 3);
        Assert.Single(top);
        Assert.Equal(("x", 3), top[0]);
    }

    [Fact]
    public void UnaImportadaBorradaNoVuelveAImportarse()
    {
        var id = _repo.Add("u", "peli", T, "2026-05-10", DiarySource.Imported, null, null);
        Assert.Contains("peli", _repo.GetItemIds("u"));
        Assert.True(_repo.Delete(id, "u"));
        Assert.Empty(_repo.GetForUser("u", null));
        Assert.Contains("peli", _repo.GetItemIds("u"));
    }

    [Fact]
    public void UnaManualBorradaSiPuedeVolverAImportarse()
    {
        var id = _repo.Add("u", "peli", T, "2026-05-10", DiarySource.Manual, null, null);
        Assert.True(_repo.Delete(id, "u"));
        Assert.DoesNotContain("peli", _repo.GetItemIds("u"));
    }

    [Fact]
    public void ActualizarNotaFechaYComentario()
    {
        var id = _repo.Add("u", "i", T, "2026-05-10", DiarySource.Manual, null, null);
        Assert.True(_repo.Update(id, "u", "2026-05-09", 9, false, "genial", true));
        var e = _repo.Get(id)!;
        Assert.Equal("2026-05-09", e.WatchedDate);
        Assert.Equal(9, e.Rating);
        Assert.Equal("genial", e.Note);
        _repo.Update(id, "u", null, null, true, null, true);
        Assert.Null(_repo.Get(id)!.Rating);
        Assert.Null(_repo.Get(id)!.Note);
    }
}
