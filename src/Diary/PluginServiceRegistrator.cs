using System.IO;
using Jellyfin.Plugin.Diary.Db;
using Jellyfin.Plugin.Diary.Services;
using Jellyfin.Plugin.Diary.Web;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.Diary;

public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddSingleton(provider =>
        {
            var paths = provider.GetRequiredService<IApplicationPaths>();
            var dir = Path.Combine(paths.PluginsPath, "Diary.Data");
            Directory.CreateDirectory(dir);
            return new DiaryRepository(Path.Combine(dir, "diary.db"));
        });

        serviceCollection.AddHostedService<DiaryRecorder>();
        serviceCollection.AddSingleton<IStartupFilter, DiaryStartupFilter>();
    }
}
