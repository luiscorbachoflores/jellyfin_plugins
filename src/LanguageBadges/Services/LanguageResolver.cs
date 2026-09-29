using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using Jellyfin.Plugin.LanguageBadges.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Globalization;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.LanguageBadges.Services;

/// <summary>Languages available for one library item, as short badge codes (ES, EN, JA, LAT...).</summary>
public sealed class ItemLanguages
{
    public IReadOnlyList<string> Audio { get; init; } = Array.Empty<string>();

    public IReadOnlyList<string> Subtitles { get; init; } = Array.Empty<string>();
}

/// <summary>
/// Reads the audio/subtitle MediaStreams Jellyfin already stored after probing (no ffprobe here)
/// and turns ISO-639 tags into short badge codes. Results are cached per item + DateLastSaved.
/// </summary>
public class LanguageResolver
{
    private const int MaxEpisodesPerSeries = 300;
    private static readonly TimeSpan FolderCacheTtl = TimeSpan.FromMinutes(10);

    // Fast path for the common tags; anything else goes through Jellyfin's ILocalizationManager.
    private static readonly Dictionary<string, string> KnownCodes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["spa"] = "ES", ["es"] = "ES", ["esp"] = "ES", ["cas"] = "ES", ["es-es"] = "ES",
        ["es-419"] = "LAT", ["es-mx"] = "LAT", ["es-la"] = "LAT", ["lat"] = "LAT",
        ["eng"] = "EN", ["en"] = "EN",
        ["jpn"] = "JA", ["ja"] = "JA", ["jap"] = "JA",
        ["fre"] = "FR", ["fra"] = "FR", ["fr"] = "FR",
        ["ger"] = "DE", ["deu"] = "DE", ["de"] = "DE",
        ["ita"] = "IT", ["it"] = "IT",
        ["por"] = "PT", ["pt"] = "PT", ["pt-br"] = "PT",
        ["kor"] = "KO", ["ko"] = "KO",
        ["chi"] = "ZH", ["zho"] = "ZH", ["zh"] = "ZH", ["cmn"] = "ZH", ["yue"] = "ZH",
        ["rus"] = "RU", ["ru"] = "RU",
        ["cat"] = "CA", ["ca"] = "CA",
        ["glg"] = "GL", ["gl"] = "GL",
        ["baq"] = "EU", ["eus"] = "EU", ["eu"] = "EU",
    };

    private static readonly HashSet<string> UnknownTags = new(StringComparer.OrdinalIgnoreCase)
    {
        "und", "unk", "unknown", "mis", "mul", "zxx", "qaa", "none"
    };

    private readonly ILibraryManager _libraryManager;
    private readonly IMediaSourceManager _mediaSourceManager;
    private readonly ILocalizationManager _localizationManager;
    private readonly ILogger<LanguageResolver> _logger;
    private readonly ConcurrentDictionary<Guid, (DateTime Stamp, string ConfigKey, DateTime CachedAt, ItemLanguages Value)> _cache = new();

    public LanguageResolver(
        ILibraryManager libraryManager,
        IMediaSourceManager mediaSourceManager,
        ILocalizationManager localizationManager,
        ILogger<LanguageResolver> logger)
    {
        _libraryManager = libraryManager;
        _mediaSourceManager = mediaSourceManager;
        _localizationManager = localizationManager;
        _logger = logger;
    }

    public ItemLanguages? Resolve(BaseItem item)
    {
        var config = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        var configKey = config.LatinoKeywords + "|" + config.ShowOnSeries;

        // Series/Season: DateLastSaved does not change when episodes are added, so those expire after a while.
        if (_cache.TryGetValue(item.Id, out var cached)
            && cached.Stamp == item.DateLastSaved
            && cached.ConfigKey == configKey
            && (item is not Folder || DateTime.UtcNow - cached.CachedAt < FolderCacheTtl))
        {
            return cached.Value;
        }

        IReadOnlyList<MediaStream> streams;
        if (item is Video)
        {
            streams = GetVideoStreams(item);
        }
        else if ((item is Series || item is Season) && config.ShowOnSeries)
        {
            streams = GetEpisodeStreams((Folder)item);
        }
        else
        {
            return null;
        }

        var latinoKeywords = config.LatinoKeywords
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var result = new ItemLanguages
        {
            Audio = ToCodes(streams.Where(s => s.Type == MediaStreamType.Audio), latinoKeywords),
            Subtitles = ToCodes(streams.Where(s => s.Type == MediaStreamType.Subtitle), latinoKeywords),
        };

        // Don't cache "no streams yet": the file may still be waiting for ffprobe after a library scan.
        if (streams.Count > 0)
        {
            _cache[item.Id] = (item.DateLastSaved, configKey, DateTime.UtcNow, result);
        }
        return result;
    }

    private IReadOnlyList<MediaStream> GetVideoStreams(BaseItem item)
    {
        try
        {
            // Includes every alternate version ("Movie - 1080p.mkv", "Movie - dual.mkv"...), so the badge
            // shows the union of what the user can pick when pressing Play.
            return _mediaSourceManager.GetStaticMediaSources(item, false)
                .SelectMany(ms => ms.MediaStreams ?? new List<MediaStream>())
                .ToList();
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "GetStaticMediaSources failed for {Id}, falling back to stored streams", item.Id);
            return _mediaSourceManager.GetMediaStreams(item.Id);
        }
    }

    private IReadOnlyList<MediaStream> GetEpisodeStreams(Folder folder)
    {
        var episodes = folder.GetRecursiveChildren(i => i is Episode).Take(MaxEpisodesPerSeries);
        var all = new List<MediaStream>();
        foreach (var ep in episodes)
        {
            all.AddRange(_mediaSourceManager.GetMediaStreams(ep.Id));
        }

        return all;
    }

    private List<string> ToCodes(IEnumerable<MediaStream> streams, string[] latinoKeywords)
    {
        var codes = new List<string>();
        var hasUnknown = false;
        foreach (var s in streams)
        {
            var code = ToCode(s, latinoKeywords);
            if (code is null)
            {
                hasUnknown = true;
            }
            else if (!codes.Contains(code))
            {
                codes.Add(code);
            }
        }

        // Only surface "?" when nothing is tagged: a video with a single untagged track is worth flagging,
        // an untagged commentary next to ES/EN is noise.
        if (codes.Count == 0 && hasUnknown)
        {
            codes.Add("?");
        }

        return codes;
    }

    private string? ToCode(MediaStream stream, string[] latinoKeywords)
    {
        var lang = stream.Language?.Trim();
        if (string.IsNullOrEmpty(lang) || UnknownTags.Contains(lang))
        {
            return null;
        }

        if (!KnownCodes.TryGetValue(lang, out var code))
        {
            var info = _localizationManager.FindLanguageInfo(lang);
            code = !string.IsNullOrEmpty(info?.TwoLetterISOLanguageName)
                ? info!.TwoLetterISOLanguageName.ToUpperInvariant()
                : lang.ToUpperInvariant();
        }

        if (code == "ES" && latinoKeywords.Length > 0)
        {
            var text = ((stream.Title ?? string.Empty) + " " + (stream.DisplayTitle ?? string.Empty)).ToLowerInvariant();
            if (latinoKeywords.Any(k => text.Contains(k.ToLowerInvariant(), StringComparison.Ordinal)))
            {
                code = "LAT";
            }
        }

        return code;
    }
}
