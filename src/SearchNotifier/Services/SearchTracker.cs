using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using Jellyfin.Plugin.SearchNotifier.Configuration;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SearchNotifier.Services;

/// <summary>One finished search, as logged and sent to the webhook.</summary>
public sealed class SearchEvent
{
    public DateTime TimestampUtc { get; set; }

    public string UserName { get; set; } = string.Empty;

    public Guid? UserId { get; set; }

    public string Term { get; set; } = string.Empty;

    /// <summary>Sum of TotalRecordCount over the parallel requests of this search; null if unknown.</summary>
    public int? TotalResults { get; set; }

    /// <summary>Results per requested type (Movie, Series, Episode, Person, Hints...).</summary>
    public Dictionary<string, int> ResultsByType { get; set; } = new();
}

/// <summary>
/// Collapses the flood of requests one human search produces into one <see cref="SearchEvent"/>:
///  - search-as-you-type: "m" -> "ma" -> "mat" -> "matrix" (each a prefix of the next) is one search, the last term wins;
///  - clients fire one request per type (Movie, Series, Episode, Person...) for the same term: counts are merged.
/// A search is flushed when the user has been quiet for DebounceSeconds, or immediately when they start an unrelated term.
/// </summary>
public class SearchTracker : IDisposable
{
    private readonly object _lock = new();
    private readonly Dictionary<string, Pending> _pending = new();
    private readonly SearchLogStore _store;
    private readonly WebhookNotifier _notifier;
    private readonly ILogger<SearchTracker> _logger;

    public SearchTracker(SearchLogStore store, WebhookNotifier notifier, ILogger<SearchTracker> logger)
    {
        _store = store;
        _notifier = notifier;
        _logger = logger;
    }

    private static PluginConfiguration Config => Plugin.Instance?.Configuration ?? new PluginConfiguration();

    public void Record(Guid? userId, string userName, string term, string category, int? count)
    {
        var config = Config;
        var excluded = config.ExcludedUsers.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (excluded.Any(u => string.Equals(u, userName, StringComparison.OrdinalIgnoreCase)))
        {
            return;
        }

        var key = userId?.ToString("N") ?? userName.ToLowerInvariant();
        var debounce = TimeSpan.FromSeconds(Math.Clamp(config.DebounceSeconds, 1, 60));
        Pending? toFlush = null;

        lock (_lock)
        {
            if (_pending.TryGetValue(key, out var p))
            {
                var a = Normalize(p.Term);
                var b = Normalize(term);
                if (a == b)
                {
                    // same term, another type/endpoint
                }
                else if (b.StartsWith(a, StringComparison.Ordinal) || a.StartsWith(b, StringComparison.Ordinal))
                {
                    // still typing (or backspacing): keep only the latest term and its counts
                    p.Term = term;
                    p.Counts.Clear();
                }
                else
                {
                    toFlush = p;
                    _pending.Remove(key);
                    p = null;
                }
            }

            if (p is null)
            {
                p = new Pending(key, userId, userName, term);
                p.Timer = new Timer(OnTimer, key, Timeout.Infinite, Timeout.Infinite);
                _pending[key] = p;
            }

            if (count.HasValue)
            {
                p.Counts[category] = count.Value;
            }

            p.LastSeenUtc = DateTime.UtcNow;
            p.Timer!.Change(debounce, Timeout.InfiniteTimeSpan);
        }

        if (toFlush is not null)
        {
            Flush(toFlush);
        }
    }

    private void OnTimer(object? state)
    {
        var key = (string)state!;
        Pending? p;
        lock (_lock)
        {
            if (!_pending.TryGetValue(key, out p))
            {
                return;
            }

            _pending.Remove(key);
        }

        Flush(p);
    }

    private void Flush(Pending p)
    {
        p.Timer?.Dispose();
        try
        {
            var ev = new SearchEvent
            {
                TimestampUtc = p.LastSeenUtc,
                UserName = p.UserName,
                UserId = p.UserId,
                Term = p.Term,
                ResultsByType = new Dictionary<string, int>(p.Counts),
                TotalResults = p.Counts.Count > 0 ? p.Counts.Values.Sum() : null,
            };

            _store.Append(ev);
            _logger.LogInformation("Search Notifier: {User} searched \"{Term}\" ({Count} results)", ev.UserName, ev.Term, ev.TotalResults?.ToString() ?? "?");
            _notifier.Notify(ev);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Search Notifier: error flushing search");
        }
    }

    private static string Normalize(string s) => s.Trim().ToLowerInvariant();

    public void Dispose()
    {
        lock (_lock)
        {
            foreach (var p in _pending.Values)
            {
                p.Timer?.Dispose();
            }

            _pending.Clear();
        }

        GC.SuppressFinalize(this);
    }

    private sealed class Pending
    {
        public Pending(string key, Guid? userId, string userName, string term)
        {
            Key = key;
            UserId = userId;
            UserName = userName;
            Term = term;
        }

        public string Key { get; }

        public Guid? UserId { get; }

        public string UserName { get; }

        public string Term { get; set; }

        public DateTime LastSeenUtc { get; set; }

        public Dictionary<string, int> Counts { get; } = new();

        public Timer? Timer { get; set; }
    }
}
