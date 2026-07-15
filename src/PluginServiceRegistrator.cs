using System.IO;
using Jellyfin.Plugin.Reviews.Db;
using Jellyfin.Plugin.Reviews.Web;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.Reviews;

public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton(provider =>
        {
            var paths = provider.GetRequiredService<IApplicationPaths>();
            var dir = Path.Combine(paths.PluginsPath, "Reviews.Data");
            Directory.CreateDirectory(dir);
            var dbPath = Path.Combine(dir, "reviews.db");
            return new ReviewsRepository(dbPath);
        });

        serviceCollection.AddSingleton<IStartupFilter, ReviewsStartupFilter>();
    }
}
