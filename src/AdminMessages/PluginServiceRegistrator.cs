using System.IO;
using Jellyfin.Plugin.AdminMessages.Db;
using Jellyfin.Plugin.AdminMessages.Web;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.AdminMessages;

public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton(provider =>
        {
            var paths = provider.GetRequiredService<IApplicationPaths>();
            var dir = Path.Combine(paths.PluginsPath, "AdminMessages.Data");
            Directory.CreateDirectory(dir);
            var dbPath = Path.Combine(dir, "adminmessages.db");
            return new AdminMessagesRepository(dbPath);
        });

        serviceCollection.AddSingleton<IStartupFilter, AdminMessagesStartupFilter>();
    }
}
