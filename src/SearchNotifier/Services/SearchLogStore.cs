using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SearchNotifier.Services;

/// <summary>
/// Search log persisted as JSON Lines (one SearchEvent per line) in
/// &lt;config&gt;/plugins/configurations/SearchNotifier/searches.jsonl, so it survives restarts and is easy to grep/export.
/// </summary>
public class SearchLogStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = false };

    private readonly object _lock = new();
    private readonly string _path;
    private readonly ILogger<SearchLogStore> _logger;
    private List<SearchEvent>? _entries;

    public SearchLogStore(IApplicationPaths paths, ILogger<SearchLogStore> logger)
    {
        _logger = logger;
        var dir = Path.Combine(paths.PluginConfigurationsPath, "SearchNotifier");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "searches.jsonl");
    }

    public string FilePath => _path;

    public void Append(SearchEvent ev)
    {
        lock (_lock)
        {
            var entries = Load();
            entries.Add(ev);
            var max = Math.Max(10, Plugin.Instance?.Configuration.MaxLogEntries ?? 2000);
            if (entries.Count > max)
            {
                entries.RemoveRange(0, entries.Count - max);
                RewriteFile(entries);
            }
            else
            {
                File.AppendAllText(_path, JsonSerializer.Serialize(ev, JsonOptions) + "\n");
            }
        }
    }

    /// <summary>Newest first.</summary>
    public IReadOnlyList<SearchEvent> GetLatest(int limit)
    {
        lock (_lock)
        {
            return Load().AsEnumerable().Reverse().Take(Math.Clamp(limit, 1, 10000)).ToList();
        }
    }

    public void Clear()
    {
        lock (_lock)
        {
            _entries = new List<SearchEvent>();
            RewriteFile(_entries);
        }
    }

    private List<SearchEvent> Load()
    {
        if (_entries is not null)
        {
            return _entries;
        }

        _entries = new List<SearchEvent>();
        if (File.Exists(_path))
        {
            foreach (var line in File.ReadLines(_path))
            {
                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                try
                {
                    var ev = JsonSerializer.Deserialize<SearchEvent>(line, JsonOptions);
                    if (ev is not null)
                    {
                        _entries.Add(ev);
                    }
                }
                catch (JsonException ex)
                {
                    _logger.LogWarning(ex, "Search Notifier: skipping corrupt log line");
                }
            }
        }

        return _entries;
    }

    private void RewriteFile(List<SearchEvent> entries)
    {
        var tmp = _path + ".tmp";
        File.WriteAllLines(tmp, entries.Select(e => JsonSerializer.Serialize(e, JsonOptions)));
        File.Move(tmp, _path, true);
    }
}
