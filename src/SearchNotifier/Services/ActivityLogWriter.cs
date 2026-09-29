using System;
using System.Threading.Tasks;
using Jellyfin.Plugin.SearchNotifier.Configuration;
using MediaBrowser.Model.Activity;
using Jellyfin.Database.Implementations.Entities;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.SearchNotifier.Services;

/// <summary>
/// Adds each finished search to Jellyfin's Activity Log. Searches with no results are logged as warnings so they stand out
/// in the dashboard and can be filtered by notification plugins that read the activity stream.
/// </summary>
public class ActivityLogWriter
{
    private readonly IActivityManager _activityManager;
    private readonly ILogger<ActivityLogWriter> _logger;

    public ActivityLogWriter(IActivityManager activityManager, ILogger<ActivityLogWriter> logger)
    {
        _activityManager = activityManager;
        _logger = logger;
    }

    public void Write(SearchEvent ev)
    {
        var config = Plugin.Instance?.Configuration;
        if (config is null || !config.WriteToActivityLog || (config.NotifyOnlyNoResults && ev.TotalResults != 0))
        {
            return;
        }

        _ = WriteAsync(ev);
    }

    private async Task WriteAsync(SearchEvent ev)
    {
        try
        {
            var noResults = ev.TotalResults == 0;
            var results = ev.TotalResults switch
            {
                null => "resultados desconocidos",
                0 => "SIN resultados",
                1 => "1 resultado",
                var n => $"{n} resultados",
            };
            var entry = new ActivityLog($"{ev.UserName} ha buscado \"{ev.Term}\"", "SearchNotifier", ev.UserId ?? Guid.Empty)
            {
                ShortOverview = results,
                Overview = $"Búsqueda de \"{ev.Term}\" por {ev.UserName}: {results}.",
                LogSeverity = noResults ? LogLevel.Warning : LogLevel.Information,
            };
            await _activityManager.CreateAsync(entry).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Search Notifier: could not write the activity log entry");
        }
    }
}
