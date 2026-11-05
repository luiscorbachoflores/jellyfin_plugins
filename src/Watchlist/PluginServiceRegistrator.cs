using System.IO;
using Jellyfin.Plugin.Watchlist.Db;
using Jellyfin.Plugin.Watchlist.Web;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.Watchlist;

public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton(provider =>
        {
            var paths = provider.GetRequiredService<IApplicationPaths>();
            var dir = Path.Combine(paths.PluginsPath, "Watchlist.Data");
            Directory.CreateDirectory(dir);
            var dbPath = Path.Combine(dir, "watchlist.db");
            return new WatchlistRepository(dbPath);
        });

        serviceCollection.AddSingleton<IStartupFilter, WatchlistStartupFilter>();
    }
}
