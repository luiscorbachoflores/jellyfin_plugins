using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Jellyfin.Plugin.Diary.Api;

/// <summary>Un visionado con los datos de la película ya resueltos (entrada de <see cref="DiaryStats.Compute"/>).</summary>
public record StatFact(string Date, string ItemId, string Name, int? Year, int Minutes, IReadOnlyList<string> Genres, int? Rating, bool Rewatch, string WatchedUtc);

public record CountBy(string Key, int Count);

public record FilmRef(string ItemId, string Name, int? Year, string Date, int? Rating);

public record StreakDto(int Days, string? From, string? To);

public record YearStatsDto(
    int Year,
    int Total,
    int Unique,
    int Rewatches,
    int Minutes,
    int[] ByMonth,
    int[] ByWeekday,
    IReadOnlyList<CountBy> TopGenres,
    IReadOnlyList<CountBy> Decades,
    double? AverageRating,
    int RatedCount,
    int[] RatingDistribution,
    IReadOnlyList<FilmRef> TopRated,
    StreakDto LongestStreak,
    CountBy? BusiestDay,
    FilmRef? First,
    FilmRef? Last,
    FilmRef? Longest,
    FilmRef? Shortest,
    FilmRef? Oldest,
    FilmRef? MostRewatched,
    int MostRewatchedTimes,
    int NightShare,
    IReadOnlyList<CommunityFilmDto> Community);

public record CommunityFilmDto(string ItemId, string Name, int? Year, int Viewers);

/// <summary>Cálculo puro del resumen del año (sin Jellyfin ni base de datos) para poder probarlo.</summary>
public static class DiaryStats
{
    public static YearStatsDto Compute(int year, IReadOnlyList<StatFact> facts, IReadOnlyList<CommunityFilmDto> community)
    {
        var inYear = facts
            .Where(f => f.Date.StartsWith(year.ToString("D4", CultureInfo.InvariantCulture) + "-", StringComparison.Ordinal))
            .OrderBy(f => f.Date, StringComparer.Ordinal)
            .ThenBy(f => f.WatchedUtc, StringComparer.Ordinal)
            .ToList();

        var byMonth = new int[12];
        var byWeekday = new int[7]; // 0 = lunes
        var days = new Dictionary<string, int>(StringComparer.Ordinal);
        var parsedDates = new List<DateTime>();
        foreach (var f in inYear)
        {
            if (!DateTime.TryParseExact(f.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
            {
                continue;
            }

            byMonth[d.Month - 1]++;
            byWeekday[((int)d.DayOfWeek + 6) % 7]++;
            days[f.Date] = days.TryGetValue(f.Date, out var n) ? n + 1 : 1;
            parsedDates.Add(d.Date);
        }

        var distinct = inYear.Select(f => f.ItemId).Distinct(StringComparer.Ordinal).Count();
        var rewatches = inYear.Count(f => f.Rewatch);

        var genres = inYear.SelectMany(f => f.Genres.Distinct(StringComparer.OrdinalIgnoreCase))
            .Where(g => !string.IsNullOrWhiteSpace(g))
            .GroupBy(g => g, StringComparer.OrdinalIgnoreCase)
            .Select(g => new CountBy(g.Key, g.Count()))
            .OrderByDescending(g => g.Count).ThenBy(g => g.Key, StringComparer.CurrentCultureIgnoreCase)
            .Take(5).ToList();

        var decades = inYear.Where(f => f.Year is > 1850)
            .GroupBy(f => f.Year!.Value / 10 * 10)
            .Select(g => new CountBy(g.Key.ToString(CultureInfo.InvariantCulture), g.Count()))
            .OrderByDescending(g => g.Count).ThenByDescending(g => g.Key, StringComparer.Ordinal)
            .Take(6).ToList();

        var rated = inYear.Where(f => f.Rating is >= 1 and <= 10).ToList();
        var dist = new int[10];
        foreach (var f in rated)
        {
            dist[f.Rating!.Value - 1]++;
        }

        double? avg = rated.Count == 0 ? null : Math.Round(rated.Average(f => f.Rating!.Value) / 2.0, 2);
        var topRated = rated
            .OrderByDescending(f => f.Rating).ThenByDescending(f => f.Date, StringComparer.Ordinal)
            .GroupBy(f => f.ItemId).Select(g => g.First())
            .Take(5).Select(Ref).ToList();

        FilmRef? first = inYear.Count > 0 ? Ref(inYear[0]) : null;
        FilmRef? last = inYear.Count > 0 ? Ref(inYear[^1]) : null;
        var withMinutes = inYear.Where(f => f.Minutes > 0).ToList();
        FilmRef? longest = withMinutes.Count > 0 ? Ref(withMinutes.OrderByDescending(f => f.Minutes).First()) : null;
        FilmRef? shortest = withMinutes.Count > 0 ? Ref(withMinutes.OrderBy(f => f.Minutes).First()) : null;
        var withYear = inYear.Where(f => f.Year is > 1850).ToList();
        FilmRef? oldest = withYear.Count > 0 ? Ref(withYear.OrderBy(f => f.Year).ThenBy(f => f.Date, StringComparer.Ordinal).First()) : null;

        var repeated = inYear.GroupBy(f => f.ItemId).Select(g => (Item: g.First(), Times: g.Count())).OrderByDescending(g => g.Times).FirstOrDefault();
        var mostRewatched = repeated.Times > 1 ? Ref(repeated.Item) : null;

        var busiest = days.OrderByDescending(kv => kv.Value).ThenBy(kv => kv.Key, StringComparer.Ordinal).Select(kv => new CountBy(kv.Key, kv.Value)).FirstOrDefault();

        return new YearStatsDto(
            year, inYear.Count, distinct, rewatches, inYear.Sum(f => f.Minutes),
            byMonth, byWeekday, genres, decades, avg, rated.Count, dist, topRated,
            Streak(parsedDates), busiest, first, last, longest, shortest, oldest,
            mostRewatched, mostRewatched is null ? 0 : repeated.Times, NightShare(inYear), community);
    }

    private static FilmRef Ref(StatFact f) => new(f.ItemId, f.Name, f.Year, f.Date, f.Rating);

    /// <summary>Racha más larga de días seguidos con al menos una película.</summary>
    public static StreakDto Streak(IEnumerable<DateTime> dates)
    {
        var sorted = dates.Select(d => d.Date).Distinct().OrderBy(d => d).ToList();
        if (sorted.Count == 0)
        {
            return new StreakDto(0, null, null);
        }

        int best = 1, run = 1;
        DateTime bestStart = sorted[0], start = sorted[0], bestEnd = sorted[0];
        for (var i = 1; i < sorted.Count; i++)
        {
            if ((sorted[i] - sorted[i - 1]).Days == 1)
            {
                run++;
            }
            else
            {
                run = 1;
                start = sorted[i];
            }

            if (run > best)
            {
                best = run;
                bestStart = start;
                bestEnd = sorted[i];
            }
        }

        return new StreakDto(best, bestStart.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), bestEnd.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
    }

    /// <summary>Porcentaje de visionados entre las 22:00 y las 05:59 (hora del servidor). Solo cuenta
    /// los que tienen hora real (no importados con 00:00).</summary>
    private static int NightShare(IReadOnlyList<StatFact> facts)
    {
        var timed = new List<int>();
        foreach (var f in facts)
        {
            if (DateTime.TryParse(f.WatchedUtc, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var utc))
            {
                var local = utc.ToLocalTime();
                if (local.TimeOfDay != TimeSpan.Zero)
                {
                    timed.Add(local.Hour);
                }
            }
        }

        return timed.Count == 0 ? 0 : (int)Math.Round(100.0 * timed.Count(h => h >= 22 || h < 6) / timed.Count);
    }
}
